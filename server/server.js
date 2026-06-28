const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || 'https://shotme.ee';
const isProduction = process.env.NODE_ENV === 'production';
const maxJsonSize = process.env.JSON_BODY_LIMIT || '24mb';
const allowedOrigins = new Set([
  frontendUrl,
  'https://shotme.ee',
  'https://www.shotme.ee',
  'http://localhost:3000'
].filter(Boolean));

const PLANS = {
  plan_small: { priceId: process.env.PRICE_20_ID, credits: 20 },
  plan_large: { priceId: process.env.PRICE_50_ID, credits: 50 }
};

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const STRIPE_EVENTS_FILE = path.join(__dirname, '.processed-stripe-events.json');
const STATS_EVENTS_FILE = path.join(__dirname, '.shotme-stats-events.jsonl');
const STATS_TIME_ZONE = process.env.STATS_TIME_ZONE || 'Europe/Tallinn';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://cdn.tailwindcss.com 'unsafe-inline'",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.stripe.com",
    "frame-src https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
});

const MASTER_PROMPT = `IDENTITY PRESERVATION IS THE TOP PRIORITY.
Preserve every visible person's face as close to the source photo as possible: facial geometry, eye shape, nose, mouth, jawline, cheeks, age, expression, gaze direction, skin texture, distinctive marks, and asymmetry.
Do NOT beautify, de-age, reshape, replace, stylize, smooth, or idealize faces unless the user explicitly asks for it.
STRICT HAIR PRESERVATION: preserve hair color, length, volume, hairline, and style exactly as in the original photo unless explicitly requested.
Restoring, cleaning up, sharpening, and colorizing old or black-and-white photos is allowed when it improves the result, but it must never change identity, facial features, age, expression, or distinctive marks.
Apply the selected studio style only to lighting, background, framing, and clothing mood while keeping faces and identity unchanged.
Return exactly one generated image. Do not answer with text only.`;

const RESTORATION_PROMPT = `PHOTO RESTORATION AND PERIOD COLORIZATION MODE.
Restore the uploaded old or damaged photograph into a clean, natural color photograph.
Remove cracks, scratches, dust, stains, folds, glare, fading, scanning artifacts, and discoloration.
Colorize black-and-white or sepia photos with historically plausible, period-appropriate colors based on clothing, materials, skin tones, setting, and likely era. Avoid modern neon colors and modern fashion colors unless clearly present in the source.
Preserve the original photograph's composition, camera angle, background, clothing shape, fabric patterns, accessories, body proportions, face geometry, age, expression, gaze, hairstyle, and identity exactly as much as possible.
Do NOT modernize clothing, add makeup, beautify faces, de-age people, reshape bodies, change facial features, change pose, replace people, add new objects, or turn it into a studio portrait.
Only reconstruct missing or damaged areas from the local visual context of the original photo.
Return exactly one restored color image. Do not answer with text only.`;

const apiBuckets = new Map();
function apiRateLimit(req, res, next) {
  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 30;
  const bucket = apiBuckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  apiBuckets.set(key, bucket);

  if (bucket.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please try again soon.' });
  }

  next();
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function getImageMimeFromMagic(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return '';
}

function parseImagePayload(image, declaredMimeType) {
  if (!image || typeof image !== 'string') {
    throw new HttpError(400, 'Image is required');
  }

  let base64Data = image;
  let dataUrlMime = '';
  const dataUrlMatch = image.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (dataUrlMatch) {
    dataUrlMime = dataUrlMatch[1].toLowerCase();
    base64Data = dataUrlMatch[2];
  }

  const normalizedBase64 = base64Data.replace(/\s/g, '');
  if (!/^[a-z0-9+/]+={0,2}$/i.test(normalizedBase64)) {
    throw new HttpError(400, 'Invalid image data');
  }
  if (normalizedBase64.length > 18 * 1024 * 1024) {
    throw new HttpError(413, 'Image is too large');
  }

  const buffer = Buffer.from(normalizedBase64, 'base64');
  if (!buffer.length) {
    throw new HttpError(400, 'Invalid image data');
  }

  const detectedMimeType = getImageMimeFromMagic(buffer);
  if (!detectedMimeType) {
    throw new HttpError(400, 'Unsupported image type');
  }

  const mimeType = (dataUrlMime || declaredMimeType || detectedMimeType).toLowerCase().replace('image/jpg', 'image/jpeg');
  if (mimeType !== detectedMimeType) {
    throw new HttpError(400, 'Image type does not match the file data');
  }

  return { base64Data: normalizedBase64, mimeType: detectedMimeType };
}

function sendRouteError(res, label, err) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[${label}] Error:`, err.message);
  }
  res.status(status).json({ error: status >= 500 && isProduction ? 'Internal server error' : err.message });
}

function maskEmail(email) {
  const [name = '', domain = ''] = String(email || '').split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

function appendStatsEvent(type, payload = {}) {
  const event = {
    ts: new Date().toISOString(),
    type,
    ...payload
  };
  fs.appendFile(STATS_EVENTS_FILE, `${JSON.stringify(event)}\n`, err => {
    if (err) console.error('[Stats] Failed to write event:', err.message);
  });
}

function readStatsEvents(start, end) {
  try {
    return fs.readFileSync(STATS_EVENTS_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(event => event && event.ts && event.ts >= start.toISOString() && event.ts < end.toISOString());
  } catch {
    return [];
  }
}

function timeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function zonedDayToUtc(year, month, day, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = timeZoneOffsetMs(timeZone, guess);
  return new Date(guess.getTime() - offset);
}

function getStatsRange(dateParam) {
  const now = new Date();
  let year;
  let month;
  let day;

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    [year, month, day] = dateParam.split('-').map(Number);
  } else {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: STATS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(yesterday);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    year = Number(values.year);
    month = Number(values.month);
    day = Number(values.day);
  }

  const start = zonedDayToUtc(year, month, day, STATS_TIME_ZONE);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const end = zonedDayToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), STATS_TIME_ZONE);
  const label = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { start, end, label };
}

function isAdminRequest(req) {
  const configuredToken = process.env.ADMIN_STATS_TOKEN;
  if (!configuredToken) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const token = bearer || req.headers['x-admin-token'] || req.query.token;
  return token === configuredToken;
}

async function sendPurchaseWebhook(payload) {
  const webhookUrl = process.env.N8N_PURCHASE_WEBHOOK_URL;
  if (!webhookUrl) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET ? { 'X-ShotMe-Secret': process.env.N8N_WEBHOOK_SECRET } : {})
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    console.error('[n8n] Purchase webhook failed:', err.message);
  } finally {
    clearTimeout(timeout);
  }
}

function loadProcessedStripeEvents() {
  try {
    return new Set(JSON.parse(fs.readFileSync(STRIPE_EVENTS_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

function markStripeEventProcessed(ids) {
  const processed = loadProcessedStripeEvents();
  ids.filter(Boolean).forEach(id => processed.add(id));
  fs.writeFileSync(STRIPE_EVENTS_FILE, JSON.stringify([...processed].slice(-1000)));
}

let stripeWebhookQueue = Promise.resolve();

function enqueueStripeWebhook(task) {
  const next = stripeWebhookQueue.then(task, task);
  stripeWebhookQueue = next.catch(() => {});
  return next;
}

async function handleCheckoutCompleted(event) {
  const session = event.data.object;
  const sessionId = session.id;
  const processed = loadProcessedStripeEvents();
  if (processed.has(event.id) || processed.has(sessionId)) {
    return { duplicate: true };
  }

  const email = normalizeEmail(session.customer_email);
  const plan = PLANS[session.metadata?.planId];
  const amount = plan?.credits || 0;

  if (session.payment_status !== 'paid' || !isValidEmail(email) || amount <= 0) {
    return { ignored: true };
  }

  const { data: user, error: findError } = await supabase
    .from('users')
    .select('credits, paid_credits')
    .eq('email', email)
    .maybeSingle();

  if (findError) {
    console.error('[Stripe] User lookup failed:', findError);
    throw new Error('User lookup failed');
  }

  if (!user) return { ignored: true };

  const processedBeforeUpdate = loadProcessedStripeEvents();
  if (processedBeforeUpdate.has(event.id) || processedBeforeUpdate.has(sessionId)) {
    return { duplicate: true };
  }

  const { error: updateError } = await supabase.from('users').update({
    credits: (user.credits || 0) + amount,
    paid_credits: (user.paid_credits || 0) + amount
  }).eq('email', email);

  if (updateError) {
    console.error('[Stripe] Credit update failed:', updateError);
    throw new Error('Credit update failed');
  }

  markStripeEventProcessed([event.id, sessionId]);
  console.log(`[Stripe] Added ${amount} credits for ${email} (${sessionId})`);
  const purchasePayload = {
    type: 'purchase_completed',
    email,
    maskedEmail: maskEmail(email),
    planId: session.metadata?.planId || '',
    credits: amount,
    amountTotal: session.amount_total || 0,
    currency: session.currency || 'eur',
    sessionId,
    createdAt: new Date().toISOString()
  };
  appendStatsEvent('purchase_completed', purchasePayload);
  await sendPurchaseWebhook(purchasePayload);
  return { credited: amount };
}

async function generateImage(parts) {
  const models = [
    IMAGE_MODEL,
    'gemini-3.1-flash-image',
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview'
  ].filter((model, index, list) => model && list.indexOf(model) === index);

  let lastText = '';
  let lastError = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: ['TEXT', 'IMAGE'] }
      });

      const responseParts = response.candidates?.[0]?.content?.parts || [];
      const genImg = responseParts.find(p => p.inlineData)?.inlineData?.data;
      if (genImg) return genImg;

      lastText = responseParts.map(p => p.text).filter(Boolean).join(' ').slice(0, 500);
      console.error(`[Gemini] ${model} returned no image. Text: ${lastText || 'none'}`);
    } catch (err) {
      lastError = err;
      console.error(`[Gemini] ${model} failed:`, err.message);
    }
  }

  if (lastError) throw lastError;
  throw new Error(lastText || 'Gemini did not return an image. Please try another photo or style.');
}

// Webhook must be before express.json()
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const result = await enqueueStripeWebhook(() => handleCheckoutCompleted(event));
      return res.json({ received: true, ...result });
    }
  } catch (err) {
    console.error('[Stripe] Webhook processing failed:', err.message);
    return res.status(500).json({ error: err.message });
  }

  res.json({ received: true });
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    callback(null, false);
  }
}));
app.use('/api', apiRateLimit);
app.use(express.json({ limit: maxJsonSize }));
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  next(err);
});

app.get('/api/health', (req, res) => res.send('OK'));

app.post('/api/user/check', async (req, res) => {
  const { email } = req.body;
  const normalEmail = normalizeEmail(email);
  if (!isValidEmail(normalEmail)) return res.status(400).json({ error: 'Valid email required' });

  let { data: user, error: findError } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
  if (findError) console.error('[DB] checkUser find error:', findError);

  if (!user) {
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ email: normalEmail, free_generations_used: 0, paid_credits: 0 })
      .select('*')
      .maybeSingle();
    if (insertError) {
      console.error('[DB] checkUser insert error:', insertError);
      return res.status(500).json({ error: 'Database error creating user.' });
    }
    user = newUser;
    appendStatsEvent('user_created', { email: normalEmail, maskedEmail: maskEmail(normalEmail) });
  }

  const freeUsed = user?.free_generations_used || 0;
  const paidCredits = user?.paid_credits || 0;
  const credits = Math.max(0, 5 - freeUsed) + paidCredits;
  
  const { count } = await supabase.from('generations').select('*', { count: 'exact', head: true }).eq('user_email', normalEmail);
  const hasPaid = paidCredits > 0 || (count > 0);

  res.json({ email: normalEmail, credits, hasPaid });
});

app.post('/api/generate', async (req, res) => {
  const { image, mimeType, style, aspectRatio, prompt, email } = req.body;

  const normalEmail = normalizeEmail(email);
  if (!isValidEmail(normalEmail)) return res.status(401).json({ error: 'Valid email is required' });

  try {
    const imagePayload = parseImagePayload(image, mimeType);

    const { data: user } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
    if (!user) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const credits = Math.max(0, 5 - (user.free_generations_used || 0)) + (user.paid_credits || 0);
    if (credits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const isRestorationStyle = style === 'RESTORE_OLD_PHOTO';
    const generationPrompt = isRestorationStyle
      ? `${RESTORATION_PROMPT}
Additional historical context from user, if any: ${prompt || 'none'}`
      : `${MASTER_PROMPT}
Style: ${style}. ${prompt || ''}`;

    const genImg = await generateImage([
      { text: generationPrompt },
      { inlineData: { mimeType: imagePayload.mimeType, data: imagePayload.base64Data } }
    ]);

    if (genImg) {
      let usedPaidCredit = false;
      if ((user.paid_credits || 0) > 0) {
        await supabase.from('users').update({ paid_credits: user.paid_credits - 1 }).eq('email', normalEmail);
        usedPaidCredit = true;
      } else {
        await supabase.from('users').update({ free_generations_used: (user.free_generations_used || 0) + 1 }).eq('email', normalEmail);
      }

      if (usedPaidCredit) {
        await supabase.from('generations').insert({
          user_email: normalEmail, style_name: style, aspect_ratio: aspectRatio,
          generated_image_url: `data:image/jpeg;base64,${genImg}`, status: 'success'
        });
      }
      appendStatsEvent('generation_success', {
        email: normalEmail,
        maskedEmail: maskEmail(normalEmail),
        action: 'generate',
        style,
        creditType: usedPaidCredit ? 'paid' : 'free'
      });
      res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
    } else {
      throw new Error('Gemini failed to generate image');
    }
  } catch (err) {
    sendRouteError(res, 'Generate', err);
  }
});

app.post('/api/refine', async (req, res) => {
  const { image, prompt, email } = req.body;
  const normalEmail = normalizeEmail(email);
  if (!isValidEmail(normalEmail)) return res.status(401).json({ error: 'Valid email is required' });

  try {
    const imagePayload = parseImagePayload(image);

    const { data: user } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
    if (!user) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const credits = Math.max(0, 5 - (user?.free_generations_used || 0)) + (user?.paid_credits || 0);
    if (credits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const genImg = await generateImage([
      { text: `${MASTER_PROMPT}\nRefine image. Apply user corrections: ${prompt || ''}` },
      { inlineData: { mimeType: imagePayload.mimeType, data: imagePayload.base64Data } }
    ]);

    if (genImg) {
      let usedPaidCredit = false;
      if ((user?.paid_credits || 0) > 0) {
        await supabase.from('users').update({ paid_credits: user.paid_credits - 1 }).eq('email', normalEmail);
        usedPaidCredit = true;
      } else {
        await supabase.from('users').update({ free_generations_used: (user.free_generations_used || 0) + 1 }).eq('email', normalEmail);
      }
      appendStatsEvent('generation_success', {
        email: normalEmail,
        maskedEmail: maskEmail(normalEmail),
        action: 'refine',
        creditType: usedPaidCredit ? 'paid' : 'free'
      });
      res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
    } else {
      throw new Error('Gemini failed to refine image');
    }
  } catch (err) {
    sendRouteError(res, 'Refine', err);
  }
});

app.post('/api/transcribe', async (req, res) => {
  const { audio, mimeType, email } = req.body;
  const normalEmail = normalizeEmail(email);
  if (!isValidEmail(normalEmail)) return res.status(401).json({ error: 'Valid email is required' });
  if (!audio || typeof audio !== 'string' || audio.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: 'Invalid audio payload' });
  }
  if (mimeType && !/^audio\/(webm|mp4|mpeg|wav|ogg)/i.test(mimeType)) {
    return res.status(400).json({ error: 'Unsupported audio type' });
  }

  try {
    const { data: user } = await supabase.from('users').select('paid_credits').eq('email', normalEmail).maybeSingle();
    const { count } = await supabase.from('generations').select('*', { count: 'exact', head: true }).eq('user_email', normalEmail);
    const hasPaid = (user?.paid_credits > 0) || (count > 0);

    if (!hasPaid) return res.status(403).json({ error: 'VOICE_PREMIUM_ONLY' });

    const textModels = [TEXT_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash'].filter((model, index, list) => model && list.indexOf(model) === index);
    let result;
    let lastError;
    for (const model of textModels) {
      try {
        result = await ai.models.generateContent({
          model,
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType || 'audio/webm', data: audio } },
              { text: 'Transcribe this audio to text. Output ONLY the transcription.' }
            ]
          }]
        });
        break;
      } catch (err) {
        lastError = err;
        console.error(`[Transcribe] ${model} failed:`, err.message);
      }
    }

    if (!result && lastError) throw lastError;

    res.json({ text: (result.text || '').trim() });
  } catch (err) {
    console.error('[Transcribe] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/create-session', async (req, res) => {
  const { email, planId } = req.body;
  const normalEmail = normalizeEmail(email);
  const plan = PLANS[planId];
  if (!isValidEmail(normalEmail)) return res.status(400).json({ error: 'Valid email required' });
  if (!plan || !plan.priceId) return res.status(400).json({ error: 'Invalid payment plan' });

  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: normalEmail,
      line_items: [{ price: plan.priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${frontendUrl}/?payment=success`,
      cancel_url: `${frontendUrl}/?payment=cancel`,
      metadata: { planId, credits: String(plan.credits) }
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  const normalEmail = normalizeEmail(req.query.email);
  if (!isValidEmail(normalEmail)) return res.status(400).json({ error: 'Valid email required' });

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('paid_credits')
      .eq('email', normalEmail)
      .maybeSingle();

    if (userError) {
      console.error('[DB] history user lookup error:', userError);
      return res.status(500).json({ error: 'Database error loading gallery.' });
    }

    const { count, error: countError } = await supabase
      .from('generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_email', normalEmail);

    if (countError) {
      console.error('[DB] history count error:', countError);
      return res.status(500).json({ error: 'Database error loading gallery.' });
    }

    const hasGalleryAccess = (user?.paid_credits || 0) > 0 || (count || 0) > 0;
    if (!hasGalleryAccess) return res.status(403).json({ error: 'HISTORY_PREMIUM_ONLY' });

    const { data: generations, error: historyError } = await supabase
      .from('generations')
      .select('id, created_at, style_name, aspect_ratio, generated_image_url')
      .eq('user_email', normalEmail)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(60);

    if (historyError) {
      console.error('[DB] history load error:', historyError);
      return res.status(500).json({ error: 'Database error loading gallery.' });
    }

    res.json({ generations: generations || [] });
  } catch (err) {
    console.error('[History] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/daily-stats', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const { start, end, label } = getStatsRange(req.query.date);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email, created_at')
      .gte('created_at', startIso)
      .lt('created_at', endIso);

    if (usersError) {
      console.error('[Stats] Users query failed:', usersError);
      return res.status(500).json({ error: 'Failed to load user stats' });
    }

    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      created: {
        gte: Math.floor(start.getTime() / 1000),
        lt: Math.floor(end.getTime() / 1000)
      }
    });

    const paidSessions = sessions.data.filter(session => session.payment_status === 'paid');
    const purchaseEmails = new Set(paidSessions.map(session => normalizeEmail(session.customer_email)).filter(Boolean));
    const newUserEmails = new Set((users || []).map(user => normalizeEmail(user.email)).filter(Boolean));
    const freeModeUsers = [...newUserEmails].filter(email => !purchaseEmails.has(email)).length;
    const revenueCents = paidSessions.reduce((sum, session) => sum + (session.amount_total || 0), 0);
    const purchasedCredits = paidSessions.reduce((sum, session) => sum + Number(session.metadata?.credits || 0), 0);

    const events = readStatsEvents(start, end);
    const generationEvents = events.filter(event => event.type === 'generation_success');
    const freeGenerationEvents = generationEvents.filter(event => event.creditType === 'free');
    const paidGenerationEvents = generationEvents.filter(event => event.creditType === 'paid');

    const stats = {
      date: label,
      timeZone: STATS_TIME_ZONE,
      range: { start: startIso, end: endIso },
      newUsers: newUserEmails.size,
      freeModeUsers,
      purchases: paidSessions.length,
      revenueEur: revenueCents / 100,
      purchasedCredits,
      freeGenerations: freeGenerationEvents.length,
      paidGenerations: paidGenerationEvents.length,
      totalGenerations: generationEvents.length,
      activeFreeUsers: new Set(freeGenerationEvents.map(event => event.email).filter(Boolean)).size,
      activePaidUsers: new Set(paidGenerationEvents.map(event => event.email).filter(Boolean)).size
    };

    const text = [
      `ShotMe статистика за ${stats.date}`,
      '',
      `Новые пользователи: ${stats.newUsers}`,
      `Пользователей в бесплатном режиме: ${stats.freeModeUsers}`,
      `Покупок: ${stats.purchases}`,
      `Выручка: ${stats.revenueEur.toFixed(2)} EUR`,
      `Куплено генераций: ${stats.purchasedCredits}`,
      '',
      `Бесплатных генераций: ${stats.freeGenerations}`,
      `Платных генераций: ${stats.paidGenerations}`,
      `Всего генераций: ${stats.totalGenerations}`,
      '',
      `Активных бесплатных пользователей: ${stats.activeFreeUsers}`,
      `Активных платных пользователей: ${stats.activePaidUsers}`
    ].join('\n');

    res.json({ stats, text });
  } catch (err) {
    console.error('[Stats] Error:', err.message);
    res.status(500).json({ error: 'Failed to build stats' });
  }
});

// Static files
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://shotme.ee/sitemap.xml\n');
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://shotme.ee/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://shotme.ee/privacy-policy.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>https://shotme.ee/terms.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
</urlset>`);
});

app.use('/assets', express.static(path.join(__dirname, '../dist/assets'), {
  immutable: true,
  maxAge: '1y'
}));
app.use(express.static(path.join(__dirname, '../dist'), {
  maxAge: '1h'
}));

app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, () => console.log(`Server on ${port}`));
