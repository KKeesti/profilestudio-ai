const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');
const {
  createAnonymousUsageStore,
  createSessionStore,
  hashToken,
  parseCookies,
  safeEqual,
  serializeCookie,
} = require('./security');
const { buildFunnelReport, normalizeAnalyticsEvent } = require('./analytics');

const isProduction = (process.env.NODE_ENV || 'production') === 'production';
const requiredProductionSettings = [
  'GEMINI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PRICE_20_ID',
  'PRICE_50_ID',
  'ADMIN_STATS_TOKEN',
];

if (isProduction) {
  const missing = requiredProductionSettings.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Missing required production settings: ${missing.join(', ')}`);
}

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || (isProduction ? '127.0.0.1' : '0.0.0.0');
const frontendUrl = (process.env.FRONTEND_URL || 'https://shotme.ee').replace(/\/$/, '');
const maxJsonSize = process.env.JSON_BODY_LIMIT || '24mb';

if (isProduction && !frontendUrl.startsWith('https://')) {
  throw new Error('FRONTEND_URL must use HTTPS in production');
}

const allowedOrigins = new Set([
  frontendUrl,
  'https://shotme.ee',
  'https://www.shotme.ee',
  ...(!isProduction ? ['http://localhost:3000'] : []),
].filter(Boolean));

const FREE_TRIAL_LIMIT = 10;
const ANONYMOUS_DAILY_GENERATION_LIMIT = Number(process.env.ANONYMOUS_DAILY_GENERATION_LIMIT || 10);
const MAX_ACTIVE_GENERATIONS_PER_KEY = Number(process.env.MAX_ACTIVE_GENERATIONS_PER_KEY || 1);
const MAX_PROMPT_LENGTH = Number(process.env.MAX_PROMPT_LENGTH || 800);
const MAX_REFINE_PROMPT_LENGTH = Number(process.env.MAX_REFINE_PROMPT_LENGTH || 500);
const SESSION_COOKIE = 'shotme_session';
const ANONYMOUS_COOKIE = 'shotme_anon';
const SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
const ANONYMOUS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

const ALLOWED_STYLES = new Set(['RESTORE_OLD_PHOTO', 'CLASSIC_STUDIO', 'FASHION_EDITORIAL', 'BUSINESS_LUXE']);
const ALLOWED_ASPECT_RATIOS = new Set(['9:16', '16:9']);
const PLANS = {
  plan_small: { priceId: process.env.PRICE_20_ID, credits: 20, amountCents: 500 },
  plan_large: { priceId: process.env.PRICE_50_ID, credits: 50, amountCents: 1000 },
};

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const runtimeDirectory = process.env.RUNTIME_DIR || __dirname;
fs.mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
const STRIPE_EVENTS_FILE = path.join(runtimeDirectory, '.processed-stripe-events.json');
const STATS_EVENTS_FILE = path.join(runtimeDirectory, '.shotme-stats-events.jsonl');
const SESSION_FILE = path.join(runtimeDirectory, '.shotme-sessions.json');
const ANONYMOUS_USAGE_FILE = path.join(runtimeDirectory, '.shotme-anonymous-usage.json');
const STATS_TIME_ZONE = process.env.STATS_TIME_ZONE || 'Europe/Tallinn';

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');
const supabaseOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { transport: WebSocket },
};
const supabase = createClient(
  process.env.SUPABASE_URL || 'http://127.0.0.1',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-placeholder',
  supabaseOptions,
);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'local-placeholder' });
const sessionStore = createSessionStore(SESSION_FILE);
const anonymousUsageStore = createAnonymousUsageStore(ANONYMOUS_USAGE_FILE, { limit: FREE_TRIAL_LIMIT });

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

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function maskEmail(email) {
  const [name = '', domain = ''] = String(email || '').split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

function statsIdentity(email) {
  if (!email) return null;
  const key = process.env.STATS_HASH_SECRET || process.env.STRIPE_WEBHOOK_SECRET || 'local-stats-key';
  return crypto.createHmac('sha256', key).update(normalizeEmail(email)).digest('hex');
}

function getClientKey(req) {
  return String(req.ip || 'unknown').split(',')[0].trim() || 'unknown';
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) return res.setHeader('Set-Cookie', cookie);
  res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
}

function setSessionCookie(res, token) {
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: isProduction,
    sameSite: 'Lax',
  }));
}

function clearSessionCookie(res) {
  appendSetCookie(res, serializeCookie(SESSION_COOKIE, '', {
    maxAge: 0,
    secure: isProduction,
    sameSite: 'Lax',
  }));
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';
}

function getSessionEmail(req) {
  return sessionStore.resolve(getSessionToken(req));
}

function optionalAuth(req, _res, next) {
  req.authEmail = getSessionEmail(req);
  next();
}

function requireAuth(req, res, next) {
  const email = getSessionEmail(req);
  if (!email) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  req.authEmail = email;
  next();
}

function normalizeUserPrompt(prompt, maxLength = MAX_PROMPT_LENGTH) {
  if (prompt === undefined || prompt === null) return '';
  if (typeof prompt !== 'string') throw new HttpError(400, 'Prompt must be text');
  const normalized = prompt.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (normalized.length > maxLength) throw new HttpError(400, 'Prompt is too long');
  return normalized;
}

function getImageMimeFromMagic(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function parseBase64Payload(payload, maxLength, errorLabel) {
  if (!payload || typeof payload !== 'string') throw new HttpError(400, `${errorLabel} is required`);
  const normalized = payload.replace(/\s/g, '');
  if (!normalized || normalized.length > maxLength || !/^[a-z0-9+/]+={0,2}$/i.test(normalized)) {
    throw new HttpError(normalized.length > maxLength ? 413 : 400, `Invalid ${errorLabel.toLowerCase()} data`);
  }
  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length) throw new HttpError(400, `Invalid ${errorLabel.toLowerCase()} data`);
  return { normalized, buffer };
}

function parseImagePayload(image, declaredMimeType) {
  if (!image || typeof image !== 'string') throw new HttpError(400, 'Image is required');
  let base64Data = image;
  let dataUrlMime = '';
  const dataUrlMatch = image.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (dataUrlMatch) {
    dataUrlMime = dataUrlMatch[1].toLowerCase();
    base64Data = dataUrlMatch[2];
  }
  const parsed = parseBase64Payload(base64Data, 18 * 1024 * 1024, 'Image');
  const detectedMimeType = getImageMimeFromMagic(parsed.buffer);
  if (!detectedMimeType) throw new HttpError(400, 'Unsupported image type');
  const mimeType = String(dataUrlMime || declaredMimeType || detectedMimeType).toLowerCase().replace('image/jpg', 'image/jpeg');
  if (mimeType !== detectedMimeType) throw new HttpError(400, 'Image type does not match the file data');
  return { base64Data: parsed.normalized, mimeType: detectedMimeType };
}

function parseAudioPayload(audio, mimeType) {
  const parsed = parseBase64Payload(audio, 8 * 1024 * 1024, 'Audio');
  const normalizedMime = String(mimeType || 'audio/webm').toLowerCase().split(';')[0];
  if (!new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg']).has(normalizedMime)) {
    throw new HttpError(400, 'Unsupported audio type');
  }

  const buffer = parsed.buffer;
  const matchesMagic =
    (normalizedMime === 'audio/webm' && buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) ||
    (normalizedMime === 'audio/wav' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') ||
    (normalizedMime === 'audio/ogg' && buffer.toString('ascii', 0, 4) === 'OggS') ||
    (normalizedMime === 'audio/mp4' && buffer.toString('ascii', 4, 8) === 'ftyp') ||
    (normalizedMime === 'audio/mpeg' && (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)));
  if (!matchesMagic) throw new HttpError(400, 'Audio type does not match the file data');
  return { base64Data: parsed.normalized, mimeType: normalizedMime };
}

function sendRouteError(res, label, err) {
  const status = Number(err.status) || 500;
  if (status >= 500) console.error(`[${label}] ${err.name || 'Error'}: ${err.message}`);
  res.status(status).json({ error: status >= 500 && isProduction ? 'Internal server error' : err.message });
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function appendStatsEvent(type, payload = {}) {
  const event = { ts: new Date().toISOString(), type, ...payload };
  fs.appendFile(STATS_EVENTS_FILE, `${JSON.stringify(event)}\n`, { mode: 0o600 }, err => {
    if (err) console.error('[Stats] Failed to write event:', err.message);
    else fs.chmod(STATS_EVENTS_FILE, 0o600, () => {});
  });
}

function readStatsEvents(start, end) {
  try {
    return fs.readFileSync(STATS_EVENTS_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(event => event && event.ts && event.ts >= start.toISOString() && event.ts < end.toISOString());
  } catch {
    return [];
  }
}

function timeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return Date.UTC(
    Number(values.year), Number(values.month) - 1, Number(values.day),
    Number(values.hour), Number(values.minute), Number(values.second),
  ) - date.getTime();
}

function zonedDayToUtc(year, month, day, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return new Date(guess.getTime() - timeZoneOffsetMs(timeZone, guess));
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
      timeZone: STATS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(yesterday);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    year = Number(values.year);
    month = Number(values.month);
    day = Number(values.day);
  }
  const start = zonedDayToUtc(year, month, day, STATS_TIME_ZONE);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const end = zonedDayToUtc(nextDay.getUTCFullYear(), nextDay.getUTCMonth() + 1, nextDay.getUTCDate(), STATS_TIME_ZONE);
  const label = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { start, end, label };
}

function isAdminRequest(req) {
  const configuredToken = process.env.ADMIN_STATS_TOKEN;
  if (!configuredToken) return false;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const headerToken = req.headers['x-admin-token'] || '';
  return safeEqual(bearer || headerToken, configuredToken);
}

const apiBuckets = new Map();
const generationBuckets = new Map();
const activeGenerationCounts = new Map();
const authBuckets = new Map();

function takeWindowBudget(map, key, maxCount, windowMs) {
  const now = Date.now();
  const bucket = map.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  if (bucket.count >= maxCount) return { allowed: false, resetAt: bucket.resetAt };
  bucket.count += 1;
  map.set(key, bucket);
  if (map.size > 10000) {
    for (const [entryKey, entry] of map) if (now > entry.resetAt) map.delete(entryKey);
  }
  return { allowed: true, resetAt: bucket.resetAt };
}

function apiRateLimit(req, res, next) {
  const budget = takeWindowBudget(apiBuckets, getClientKey(req), 60, 60 * 1000);
  if (!budget.allowed) {
    res.setHeader('Retry-After', String(Math.ceil((budget.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please try again soon.' });
  }
  next();
}

function authRateLimit(req, res, next) {
  const email = normalizeEmail(req.body?.email);
  const key = `${getClientKey(req)}:${statsIdentity(email) || 'none'}`;
  const budget = takeWindowBudget(authBuckets, key, 5, 15 * 60 * 1000);
  if (!budget.allowed) {
    res.setHeader('Retry-After', String(Math.ceil((budget.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
  }
  next();
}

function takeGenerationSlot(key) {
  const active = activeGenerationCounts.get(key) || 0;
  if (active >= MAX_ACTIVE_GENERATIONS_PER_KEY) return false;
  activeGenerationCounts.set(key, active + 1);
  return true;
}

function releaseGenerationSlot(key) {
  const active = activeGenerationCounts.get(key) || 0;
  if (active <= 1) activeGenerationCounts.delete(key);
  else activeGenerationCounts.set(key, active - 1);
}

async function getOrCreateUser(email, declaredFreeUsed) {
  let { data: user, error: findError } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
  if (findError) throw new Error('Database error loading user');

  if (!user) {
    const { data, error } = await supabase
      .from('users')
      .insert({ email, free_generations_used: declaredFreeUsed, paid_credits: 0 })
      .select('*')
      .maybeSingle();
    if (error) throw new Error('Database error creating user');
    user = data;
    appendStatsEvent('user_created', { emailHash: statsIdentity(email), maskedEmail: maskEmail(email) });
  } else if (declaredFreeUsed > (user.free_generations_used || 0) && (user.paid_credits || 0) <= 0) {
    const { data, error } = await supabase
      .from('users')
      .update({ free_generations_used: declaredFreeUsed })
      .eq('email', email)
      .select('*')
      .maybeSingle();
    if (!error && data) user = data;
  }
  return user;
}

async function buildUserSummary(email, declaredFreeUsed = 0) {
  const user = await getOrCreateUser(email, declaredFreeUsed);
  const freeUsed = user?.free_generations_used || 0;
  const paidCredits = user?.paid_credits || 0;
  const credits = Math.max(0, FREE_TRIAL_LIMIT - freeUsed) + paidCredits;
  const { count, error } = await supabase
    .from('generations')
    .select('*', { count: 'exact', head: true })
    .eq('user_email', email);
  if (error) throw new Error('Database error loading account');
  return { email, credits, hasPaid: paidCredits > 0 || (count || 0) > 0 };
}

async function sendPurchaseWebhook(payload) {
  const webhookUrl = process.env.N8N_PURCHASE_WEBHOOK_URL;
  if (!webhookUrl) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_WEBHOOK_SECRET ? { 'X-ShotMe-Secret': process.env.N8N_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) console.error(`[n8n] Purchase webhook returned ${response.status}`);
  } catch (err) {
    console.error('[n8n] Purchase webhook failed:', err.name);
  } finally {
    clearTimeout(timeout);
  }
}

function loadProcessedStripeEvents() {
  try { return new Set(JSON.parse(fs.readFileSync(STRIPE_EVENTS_FILE, 'utf8'))); }
  catch { return new Set(); }
}

function markStripeEventProcessed(ids) {
  const processed = loadProcessedStripeEvents();
  ids.filter(Boolean).forEach(id => processed.add(id));
  writeJsonAtomic(STRIPE_EVENTS_FILE, [...processed].slice(-2000));
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
  if (processed.has(event.id) || processed.has(sessionId)) return { duplicate: true };

  const email = normalizeEmail(session.customer_email);
  const plan = PLANS[session.metadata?.planId];
  const validPayment =
    session.payment_status === 'paid' &&
    isValidEmail(email) &&
    plan &&
    session.currency === 'eur' &&
    Number(session.amount_total) === plan.amountCents;
  if (!validPayment) return { ignored: true };

  const { data: user, error: findError } = await supabase
    .from('users')
    .select('credits, paid_credits')
    .eq('email', email)
    .maybeSingle();
  if (findError) throw new Error('User lookup failed');
  if (!user) return { ignored: true };

  const processedBeforeUpdate = loadProcessedStripeEvents();
  if (processedBeforeUpdate.has(event.id) || processedBeforeUpdate.has(sessionId)) return { duplicate: true };

  const { error: updateError } = await supabase.from('users').update({
    credits: (user.credits || 0) + plan.credits,
    paid_credits: (user.paid_credits || 0) + plan.credits,
  }).eq('email', email);
  if (updateError) throw new Error('Credit update failed');

  markStripeEventProcessed([event.id, sessionId]);
  const purchasePayload = {
    type: 'purchase_completed',
    emailHash: statsIdentity(email),
    maskedEmail: maskEmail(email),
    planId: session.metadata?.planId || '',
    credits: plan.credits,
    amountTotal: session.amount_total || 0,
    currency: session.currency || 'eur',
    createdAt: new Date().toISOString(),
  };
  console.log(`[Stripe] Added ${plan.credits} credits for ${maskEmail(email)}`);
  appendStatsEvent('purchase_completed', purchasePayload);
  await sendPurchaseWebhook(purchasePayload);
  return { credited: plan.credits };
}

async function generateImage(parts) {
  const models = [
    IMAGE_MODEL,
    'gemini-3.1-flash-image',
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ].filter((model, index, list) => model && list.indexOf(model) === index);
  let lastText = '';
  let lastError = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: ['TEXT', 'IMAGE'] },
      });
      const responseParts = response.candidates?.[0]?.content?.parts || [];
      const genImg = responseParts.find(part => part.inlineData)?.inlineData?.data;
      if (genImg) return genImg;
      lastText = responseParts.map(part => part.text).filter(Boolean).join(' ').slice(0, 300);
      console.error(`[Gemini] ${model} returned no image`);
    } catch (err) {
      lastError = err;
      console.error(`[Gemini] ${model} failed: ${err.name || 'Error'}`);
    }
  }
  if (lastError) throw lastError;
  throw new Error(lastText || 'Gemini did not return an image');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=()');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-src https://checkout.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(isProduction ? ['upgrade-insecure-requests'] : []),
  ];
  res.setHeader('Content-Security-Policy', policy.join('; '));
  next();
});

app.post('/api/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Invalid webhook signature');
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const result = await enqueueStripeWebhook(() => handleCheckoutCompleted(event));
      return res.json({ received: true, ...result });
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('[Stripe] Webhook processing failed:', err.message);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
}));

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  const fetchSite = req.headers['sec-fetch-site'];
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Forbidden origin' });
  if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) {
    return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  next();
});
app.use('/api', apiRateLimit);
app.use(express.json({ limit: maxJsonSize, strict: true }));
app.use((err, _req, res, next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (err instanceof SyntaxError && err.status === 400) return res.status(400).json({ error: 'Invalid JSON body' });
  next(err);
});

app.get('/api/health', (_req, res) => res.type('text/plain').send('OK'));

app.post('/api/analytics/event', optionalAuth, (req, res) => {
  const email = req.authEmail || null;
  let visitorHash = email ? statsIdentity(email) : '';

  if (!visitorHash) {
    const cookieToken = parseCookies(req.headers.cookie)[ANONYMOUS_COOKIE];
    const anonymousIdentity = anonymousUsageStore.getOrIssue(cookieToken);
    visitorHash = hashToken(anonymousIdentity.token);
    if (anonymousIdentity.isNew) {
      appendSetCookie(res, serializeCookie(ANONYMOUS_COOKIE, anonymousIdentity.token, {
        maxAge: ANONYMOUS_MAX_AGE_SECONDS,
        secure: isProduction,
        sameSite: 'Lax',
      }));
    }
  }

  const event = normalizeAnalyticsEvent(req.body, {
    visitorHash,
    authenticated: Boolean(email),
  });
  if (!event) return res.status(400).json({ error: 'Invalid analytics event' });
  appendStatsEvent('funnel_event', event);
  return res.status(204).end();
});

app.post('/api/auth/device-session', authRateLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Valid email required' });
  const declaredFreeUsed = Math.min(
    FREE_TRIAL_LIMIT,
    Math.max(0, Number.isFinite(Number(req.body?.freeTrialUsed)) ? Math.floor(Number(req.body.freeTrialUsed)) : 0),
  );
  try {
    const { data: existingUser, error: userError } = await supabase
      .from('users').select('paid_credits').eq('email', email).maybeSingle();
    if (userError) throw new Error('Database error loading account');
    const { count, error: countError } = await supabase
      .from('generations').select('*', { count: 'exact', head: true }).eq('user_email', email);
    if (countError) throw new Error('Database error loading account');

    const currentEmail = getSessionEmail(req);
    const protectedAccount = (existingUser?.paid_credits || 0) > 0 || (count || 0) > 0;
    if (protectedAccount && currentEmail !== email) {
      return res.status(401).json({ error: 'EMAIL_VERIFICATION_REQUIRED' });
    }

    await getOrCreateUser(email, declaredFreeUsed);
    if (currentEmail !== email) {
      const token = sessionStore.issue(email, { replace: !protectedAccount });
      setSessionCookie(res, token);
    }
    res.json({ email });
  } catch (err) {
    sendRouteError(res, 'Device session', err);
  }
});

app.post('/api/auth/request-link', authRateLimit, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Valid email required' });
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: `${frontendUrl}/` },
    });
    if (error) {
      if (error.code === 'email_address_not_authorized') {
        return res.status(503).json({ error: 'EMAIL_DELIVERY_NOT_CONFIGURED' });
      }
      throw error;
    }
    res.json({ sent: true });
  } catch (err) {
    sendRouteError(res, 'Auth link', err);
  }
});

app.post('/api/auth/session', authRateLimit, async (req, res) => {
  const accessToken = req.body?.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length < 20 || accessToken.length > 4096) {
    return res.status(400).json({ error: 'Invalid login token' });
  }
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    const email = normalizeEmail(data?.user?.email);
    if (error || !isValidEmail(email)) return res.status(401).json({ error: 'Invalid or expired login link' });
    const token = sessionStore.issue(email);
    setSessionCookie(res, token);
    res.json({ email });
  } catch (err) {
    sendRouteError(res, 'Auth session', err);
  }
});

app.get('/api/auth/me', optionalAuth, (req, res) => res.json({ email: req.authEmail || null }));

app.post('/api/auth/logout', optionalAuth, (req, res) => {
  const token = getSessionToken(req);
  if (token) sessionStore.revoke(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/user/check', requireAuth, async (req, res) => {
  const declaredFreeUsed = Math.min(
    FREE_TRIAL_LIMIT,
    Math.max(0, Number.isFinite(Number(req.body?.freeTrialUsed)) ? Math.floor(Number(req.body.freeTrialUsed)) : 0),
  );
  try {
    res.json(await buildUserSummary(req.authEmail, declaredFreeUsed));
  } catch (err) {
    sendRouteError(res, 'User check', err);
  }
});

app.post('/api/generate', optionalAuth, async (req, res) => {
  const { image, mimeType, style, aspectRatio, prompt } = req.body;
  const email = req.authEmail || null;
  const hasEmail = Boolean(email);
  const clientKey = getClientKey(req);
  let anonymousIdentity = null;
  let generationSlotTaken = false;
  let generationKey = '';

  try {
    if (!ALLOWED_STYLES.has(style)) throw new HttpError(400, 'Unsupported style');
    if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) throw new HttpError(400, 'Unsupported aspect ratio');
    const safePrompt = normalizeUserPrompt(prompt);
    const imagePayload = parseImagePayload(image, mimeType);

    if (!hasEmail) {
      const cookieToken = parseCookies(req.headers.cookie)[ANONYMOUS_COOKIE];
      anonymousIdentity = anonymousUsageStore.getOrIssue(cookieToken);
      if (anonymousIdentity.isNew) {
        appendSetCookie(res, serializeCookie(ANONYMOUS_COOKIE, anonymousIdentity.token, {
          maxAge: ANONYMOUS_MAX_AGE_SECONDS,
          secure: isProduction,
          sameSite: 'Lax',
        }));
      }
      if (anonymousIdentity.count >= FREE_TRIAL_LIMIT) throw new HttpError(403, 'FREE_TRIAL_EXHAUSTED');
      const budget = takeWindowBudget(
        generationBuckets,
        `ip:${clientKey}`,
        ANONYMOUS_DAILY_GENERATION_LIMIT,
        24 * 60 * 60 * 1000,
      );
      if (!budget.allowed) {
        res.setHeader('Retry-After', String(Math.ceil((budget.resetAt - Date.now()) / 1000)));
        throw new HttpError(429, 'Free daily limit reached. Please try again later.');
      }
      generationKey = `anonymous:${hashToken(anonymousIdentity.token)}`;
    } else {
      generationKey = `email:${email}`;
    }

    if (!takeGenerationSlot(generationKey)) throw new HttpError(429, 'Another generation is already running.');
    generationSlotTaken = true;

    let user = null;
    if (hasEmail) {
      const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      if (error) throw new Error('Database error loading account');
      user = data;
      const credits = user ? Math.max(0, FREE_TRIAL_LIMIT - (user.free_generations_used || 0)) + (user.paid_credits || 0) : 0;
      if (!user || credits <= 0) throw new HttpError(403, 'OUT_OF_CREDITS');
    }

    const isRestorationStyle = style === 'RESTORE_OLD_PHOTO';
    const generationPrompt = isRestorationStyle
      ? `${RESTORATION_PROMPT}\nAdditional historical context from user, if any: ${safePrompt || 'none'}`
      : `${MASTER_PROMPT}\nStyle: ${style}. ${safePrompt || ''}`;
    const genImg = await generateImage([
      { text: generationPrompt },
      { inlineData: { mimeType: imagePayload.mimeType, data: imagePayload.base64Data } },
    ]);

    let usedPaidCredit = false;
    if (hasEmail && user) {
      if ((user.paid_credits || 0) > 0) {
        const { data: updated, error } = await supabase
          .from('users')
          .update({ paid_credits: user.paid_credits - 1 })
          .eq('email', email)
          .eq('paid_credits', user.paid_credits)
          .select('paid_credits')
          .maybeSingle();
        if (error || !updated) throw new Error('Credit update conflict');
        usedPaidCredit = true;
      } else {
        const freeUsed = user.free_generations_used || 0;
        const { data: updated, error } = await supabase
          .from('users')
          .update({ free_generations_used: freeUsed + 1 })
          .eq('email', email)
          .eq('free_generations_used', freeUsed)
          .select('free_generations_used')
          .maybeSingle();
        if (error || !updated) throw new Error('Credit update conflict');
      }
      if (usedPaidCredit) {
        const { error } = await supabase.from('generations').insert({
          user_email: email,
          style_name: style,
          aspect_ratio: aspectRatio,
          generated_image_url: `data:image/jpeg;base64,${genImg}`,
          status: 'success',
        });
        if (error) console.error('[Gallery] Failed to save generated image');
      }
    } else if (anonymousIdentity) {
      anonymousUsageStore.increment(anonymousIdentity.token);
    }

    appendStatsEvent('generation_success', {
      emailHash: email ? statsIdentity(email) : null,
      maskedEmail: email ? maskEmail(email) : null,
      action: 'generate',
      style,
      creditType: usedPaidCredit ? 'paid' : 'free',
      mode: hasEmail ? 'email' : 'anonymous',
    });
    res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
  } catch (err) {
    sendRouteError(res, 'Generate', err);
  } finally {
    if (generationSlotTaken) releaseGenerationSlot(generationKey);
  }
});

app.post('/api/refine', requireAuth, async (req, res) => {
  const email = req.authEmail;
  const generationKey = `email:${email}`;
  let generationSlotTaken = false;
  try {
    const safePrompt = normalizeUserPrompt(req.body?.prompt, MAX_REFINE_PROMPT_LENGTH);
    if (!safePrompt) throw new HttpError(400, 'Correction request is required');
    const imagePayload = parseImagePayload(req.body?.image);
    if (!takeGenerationSlot(generationKey)) throw new HttpError(429, 'Another generation is already running.');
    generationSlotTaken = true;

    const { data: user, error: userError } = await supabase.from('users').select('paid_credits').eq('email', email).maybeSingle();
    if (userError) throw new Error('Database error loading account');
    const paidCredits = user?.paid_credits || 0;
    if (paidCredits <= 0) throw new HttpError(403, 'OUT_OF_CREDITS');

    const genImg = await generateImage([
      { text: `${MASTER_PROMPT}\nRefine image. Apply user corrections: ${safePrompt}` },
      { inlineData: { mimeType: imagePayload.mimeType, data: imagePayload.base64Data } },
    ]);
    const { data: updated, error } = await supabase
      .from('users')
      .update({ paid_credits: paidCredits - 1 })
      .eq('email', email)
      .eq('paid_credits', paidCredits)
      .select('paid_credits')
      .maybeSingle();
    if (error || !updated) throw new Error('Credit update conflict');
    appendStatsEvent('generation_success', {
      emailHash: statsIdentity(email), maskedEmail: maskEmail(email), action: 'refine', creditType: 'paid',
    });
    res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
  } catch (err) {
    sendRouteError(res, 'Refine', err);
  } finally {
    if (generationSlotTaken) releaseGenerationSlot(generationKey);
  }
});

app.post('/api/transcribe', requireAuth, async (req, res) => {
  const email = req.authEmail;
  try {
    const audioPayload = parseAudioPayload(req.body?.audio, req.body?.mimeType);
    const { data: user, error: userError } = await supabase.from('users').select('paid_credits').eq('email', email).maybeSingle();
    if (userError) throw new Error('Database error loading account');
    if ((user?.paid_credits || 0) <= 0) throw new HttpError(403, 'VOICE_PREMIUM_ONLY');

    const textModels = [TEXT_MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash']
      .filter((model, index, list) => model && list.indexOf(model) === index);
    let result;
    let lastError;
    for (const model of textModels) {
      try {
        result = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [
            { inlineData: { mimeType: audioPayload.mimeType, data: audioPayload.base64Data } },
            { text: 'Transcribe this audio to text. Output ONLY the transcription.' },
          ] }],
        });
        break;
      } catch (err) {
        lastError = err;
        console.error(`[Transcribe] ${model} failed: ${err.name || 'Error'}`);
      }
    }
    if (!result && lastError) throw lastError;
    res.json({ text: (result?.text || '').trim().slice(0, MAX_REFINE_PROMPT_LENGTH) });
  } catch (err) {
    sendRouteError(res, 'Transcribe', err);
  }
});

app.post('/api/payment/create-session', requireAuth, async (req, res) => {
  const email = req.authEmail;
  const plan = PLANS[req.body?.planId];
  if (!plan?.priceId) return res.status(400).json({ error: 'Invalid payment plan' });
  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      client_reference_id: statsIdentity(email),
      line_items: [{ price: plan.priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${frontendUrl}/?payment=success`,
      cancel_url: `${frontendUrl}/?payment=cancel`,
      metadata: { planId: req.body.planId, credits: String(plan.credits) },
    });
    res.json({ url: session.url });
  } catch (err) {
    sendRouteError(res, 'Payment session', err);
  }
});

app.get('/api/history', requireAuth, async (req, res) => {
  const email = req.authEmail;
  try {
    const { data: user, error: userError } = await supabase
      .from('users').select('paid_credits').eq('email', email).maybeSingle();
    if (userError) throw new Error('Database error loading gallery');
    const { count, error: countError } = await supabase
      .from('generations').select('*', { count: 'exact', head: true }).eq('user_email', email);
    if (countError) throw new Error('Database error loading gallery');
    const hasGalleryAccess = (user?.paid_credits || 0) > 0 || (count || 0) > 0;
    if (!hasGalleryAccess) throw new HttpError(403, 'HISTORY_PREMIUM_ONLY');

    const { data: generations, error } = await supabase
      .from('generations')
      .select('id, created_at, style_name, aspect_ratio, generated_image_url')
      .eq('user_email', email)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(60);
    if (error) throw new Error('Database error loading gallery');
    res.json({ generations: generations || [] });
  } catch (err) {
    sendRouteError(res, 'History', err);
  }
});

app.get('/api/admin/daily-stats', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const { start, end, label } = getStatsRange(req.query.date);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const { data: users, error: usersError } = await supabase
      .from('users').select('email, created_at').gte('created_at', startIso).lt('created_at', endIso);
    if (usersError) throw new Error('Failed to load user stats');

    const sessions = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: Math.floor(start.getTime() / 1000), lt: Math.floor(end.getTime() / 1000) },
    });
    const paidSessions = sessions.data.filter(session => session.payment_status === 'paid');
    const purchaseEmails = new Set(paidSessions.map(session => normalizeEmail(session.customer_email)).filter(Boolean));
    const newUserEmails = new Set((users || []).map(user => normalizeEmail(user.email)).filter(Boolean));
    const events = readStatsEvents(start, end);
    const generationEvents = events.filter(event => event.type === 'generation_success');
    const freeGenerationEvents = generationEvents.filter(event => event.creditType === 'free');
    const paidGenerationEvents = generationEvents.filter(event => event.creditType === 'paid');
    const revenueCents = paidSessions.reduce((sum, session) => sum + (session.amount_total || 0), 0);

    const stats = {
      date: label,
      timeZone: STATS_TIME_ZONE,
      range: { start: startIso, end: endIso },
      newUsers: newUserEmails.size,
      freeModeUsers: [...newUserEmails].filter(email => !purchaseEmails.has(email)).length,
      purchases: paidSessions.length,
      revenueEur: revenueCents / 100,
      purchasedCredits: paidSessions.reduce((sum, session) => sum + Number(session.metadata?.credits || 0), 0),
      freeGenerations: freeGenerationEvents.length,
      paidGenerations: paidGenerationEvents.length,
      totalGenerations: generationEvents.length,
      activeFreeUsers: new Set(freeGenerationEvents.map(event => event.emailHash).filter(Boolean)).size,
      activePaidUsers: new Set(paidGenerationEvents.map(event => event.emailHash).filter(Boolean)).size,
    };
    const text = [
      `ShotMe statistics for ${stats.date}`,
      `New users: ${stats.newUsers}`,
      `Free users: ${stats.freeModeUsers}`,
      `Purchases: ${stats.purchases}`,
      `Revenue: ${stats.revenueEur.toFixed(2)} EUR`,
      `Free generations: ${stats.freeGenerations}`,
      `Paid generations: ${stats.paidGenerations}`,
    ].join('\n');
    res.json({ stats, text });
  } catch (err) {
    sendRouteError(res, 'Stats', err);
  }
});

app.get('/api/admin/funnel-stats', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const requestedDays = Number.parseInt(String(req.query.days || '30'), 10);
    const days = Math.min(90, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : 30));
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const events = readStatsEvents(start, end);
    const report = buildFunnelReport(events, { timeZone: STATS_TIME_ZONE });
    res.json({
      range: { start: start.toISOString(), end: end.toISOString(), days, timeZone: STATS_TIME_ZONE },
      ...report,
    });
  } catch (err) {
    sendRouteError(res, 'Funnel stats', err);
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\nSitemap: https://shotme.ee/sitemap.xml\n');
});

app.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://shotme.ee/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://shotme.ee/privacy-policy.html</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>
  <url><loc>https://shotme.ee/terms.html</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>
</urlset>`);
});

app.use((req, res, next) => {
  if (req.path.split('/').some(segment => segment.startsWith('.'))) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

app.use('/assets', express.static(path.join(__dirname, '../dist/assets'), {
  immutable: true, maxAge: '1y', dotfiles: 'deny', fallthrough: false,
}));
app.use(express.static(path.join(__dirname, '../dist'), {
  maxAge: '1h', dotfiles: 'deny', index: false,
}));
const sendApplicationShell = (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '../dist/index.html'));
};
app.get('/', sendApplicationShell);
app.get('/*splat', sendApplicationShell);

app.use((err, _req, res, _next) => {
  if (err instanceof URIError) return res.status(400).json({ error: 'Invalid URL encoding' });
  if (err?.status === 404) return res.status(404).json({ error: 'Not found' });
  console.error(`[Unhandled] ${err?.name || 'Error'}: ${err?.message || 'Unknown error'}`);
  return res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(port, host, () => console.log(`Server listening on ${host}:${port}`));
}

module.exports = app;
