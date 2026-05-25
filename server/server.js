const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || 'https://shotme.ee';
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

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const STRIPE_EVENTS_FILE = path.join(__dirname, '.processed-stripe-events.json');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MASTER_PROMPT = `IDENTITY PRESERVATION IS THE TOP PRIORITY.
Preserve every visible person's face as close to the source photo as possible: facial geometry, eye shape, nose, mouth, jawline, cheeks, age, expression, gaze direction, skin texture, distinctive marks, and asymmetry.
Do NOT beautify, de-age, reshape, replace, stylize, smooth, or idealize faces unless the user explicitly asks for it.
STRICT HAIR PRESERVATION: preserve hair color, length, volume, hairline, and style exactly as in the original photo unless explicitly requested.
Restoring, cleaning up, sharpening, and colorizing old or black-and-white photos is allowed when it improves the result, but it must never change identity, facial features, age, expression, or distinctive marks.
Apply the selected studio style only to lighting, background, framing, and clothing mood while keeping faces and identity unchanged.
Return exactly one generated image. Do not answer with text only.`;

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

function assertImagePayload(image, mimeType) {
  if (!image || typeof image !== 'string') {
    throw new Error('Image is required');
  }
  if (image.length > 18 * 1024 * 1024) {
    throw new Error('Image is too large');
  }
  if (mimeType && !/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {
    throw new Error('Unsupported image type');
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

async function generateImage(parts) {
  const models = [
    IMAGE_MODEL,
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

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const sessionId = session.id;
    const processed = loadProcessedStripeEvents();
    if (processed.has(event.id) || processed.has(sessionId)) {
      return res.json({ received: true, duplicate: true });
    }

    const email = normalizeEmail(session.customer_email);
    const plan = PLANS[session.metadata?.planId];
    const amount = plan?.credits || 0;

    if (session.payment_status === 'paid' && isValidEmail(email) && amount > 0) {
      const { data: user, error: findError } = await supabase
        .from('users')
        .select('credits, paid_credits')
        .eq('email', email)
        .maybeSingle();

      if (findError) {
        console.error('[Stripe] User lookup failed:', findError);
        return res.status(500).json({ error: 'User lookup failed' });
      }

      if (user) {
        const { error: updateError } = await supabase.from('users').update({
          credits: (user.credits || 0) + amount,
          paid_credits: (user.paid_credits || 0) + amount
        }).eq('email', email);

        if (updateError) {
          console.error('[Stripe] Credit update failed:', updateError);
          return res.status(500).json({ error: 'Credit update failed' });
        }

        markStripeEventProcessed([event.id, sessionId]);
        console.log(`[Stripe] Added ${amount} credits for ${email} (${sessionId})`);
      }
    }
  }
  res.json({ received: true });
});

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '50mb' }));
app.use('/api', apiRateLimit);

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
    assertImagePayload(image, mimeType);

    const { data: user } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
    if (!user) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const credits = Math.max(0, 5 - (user.free_generations_used || 0)) + (user.paid_credits || 0);
    if (credits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const genImg = await generateImage([
      { text: `${MASTER_PROMPT}\nStyle: ${style}. ${prompt || ''}` },
      { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } }
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
      res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
    } else {
      throw new Error('Gemini failed to generate image');
    }
  } catch (err) {
    console.error('[Generate] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/refine', async (req, res) => {
  const { image, prompt, email } = req.body;
  const normalEmail = normalizeEmail(email);
  if (!isValidEmail(normalEmail)) return res.status(401).json({ error: 'Valid email is required' });

  try {
    assertImagePayload(image);

    const { data: user } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
    if (!user) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const credits = Math.max(0, 5 - (user?.free_generations_used || 0)) + (user?.paid_credits || 0);
    if (credits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const mimeMatch = image.match(/^data:(.*?);base64,/);
    const mimeTypeStr = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = image.replace(/^data:.*?;base64,/, '');

    const genImg = await generateImage([
      { text: `${MASTER_PROMPT}\nRefine image. Apply user corrections: ${prompt || ''}` },
      { inlineData: { mimeType: mimeTypeStr, data: base64Data } }
    ]);

    if (genImg) {
      if ((user?.paid_credits || 0) > 0) {
        await supabase.from('users').update({ paid_credits: user.paid_credits - 1 }).eq('email', normalEmail);
      } else {
        await supabase.from('users').update({ free_generations_used: (user.free_generations_used || 0) + 1 }).eq('email', normalEmail);
      }
      res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
    } else {
      throw new Error('Gemini failed to refine image');
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
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
  res.status(403).json({ error: 'HISTORY_AUTH_REQUIRED' });
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
