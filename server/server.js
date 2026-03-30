require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const https = require('https');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

const app = express();
const port = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MASTER_PROMPT = `IDENTITY PRESERVATION (CRITICAL): 100% face match and facial features. 
STRICT HAIR PRESERVATION: Preserve hair color and style EXACTLY as in the original photo. 
Do NOT change hair color unless explicitly requested in the user prompt. 
Professional 8K portrait.`;

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
    const email = session.customer_email;
    const amount = parseInt(session.metadata?.credits || '0');
    if (email && amount > 0) {
      const { data: user } = await supabase.from('users').select('credits, paid_credits').eq('email', email).maybeSingle();
      if (user) {
        await supabase.from('users').update({
          credits: (user.credits || 0) + amount,
          paid_credits: (user.paid_credits || 0) + amount
        }).eq('email', email);
      }
    }
  }
  res.json({ received: true });
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => res.send('OK'));

app.post('/api/user/check', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  // Always normalize to lowercase to avoid case-mismatch duplicates
  const normalEmail = email.trim().toLowerCase();

  let { data: user, error: findError } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
  if (findError) console.error('[DB] checkUser find error:', findError);

  if (!user) {
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({ email: normalEmail, free_generations_used: 0, paid_credits: 0 })
      .select('*')
      .maybeSingle();
    if (insertError) console.error('[DB] checkUser insert error:', insertError);
    user = newUser;
  }

  const freeUsed = user?.free_generations_used || 0;
  const paidCredits = user?.paid_credits || 0;
  const credits = Math.max(0, 5 - freeUsed) + paidCredits;
  console.log(`[checkUser] ${normalEmail} → freeUsed=${freeUsed}, paid=${paidCredits}, total=${credits}`);
  res.json({ email: normalEmail, credits });
});

app.post('/api/generate', async (req, res) => {
  const { image, mimeType, style, aspectRatio, prompt, email } = req.body;

  if (!email) return res.status(401).json({ error: 'Email is required for generation' });

  const normalEmail = email.trim().toLowerCase();

  try {
    const { data: user } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
    if (!user) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const credits = Math.max(0, 5 - (user.free_generations_used || 0)) + (user.paid_credits || 0);
    console.log(`[generate] ${normalEmail} credits=${credits}`);
    if (credits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT}\nStyle: ${style}. ${prompt || ''}` },
          { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const genImg = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (genImg) {
      // Deduct credit in DB
      let updateResult;
      if ((user.paid_credits || 0) > 0) {
        updateResult = await supabase.from('users').update({ paid_credits: user.paid_credits - 1 }).eq('email', normalEmail);
      } else {
        updateResult = await supabase.from('users').update({ free_generations_used: (user.free_generations_used || 0) + 1 }).eq('email', normalEmail);
      }
      if (updateResult.error) {
        console.error('[DB] Deduct error:', updateResult.error);
      } else {
        console.log(`[DB] Deducted credit for ${normalEmail}`);
      }

      await supabase.from('generations').insert({
        user_email: normalEmail, style_name: style, aspect_ratio: aspectRatio,
        generated_image_url: `data:image/jpeg;base64,${genImg}`, status: 'success'
      });
    }
    res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
  } catch (err) {
    console.error('[generate] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});;

app.post('/api/refine', async (req, res) => {
  const { image, prompt, email } = req.body;

  if (!email) return res.status(401).json({ error: 'Email is required for refinement' });

  const normalEmail = email.trim().toLowerCase();

  try {
    const { data: user } = await supabase.from('users').select('*').eq('email', normalEmail).maybeSingle();
    if (!user) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const credits = Math.max(0, 5 - (user.free_generations_used || 0)) + (user.paid_credits || 0);
    if (credits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const mimeMatch = image.match(/^data:(.*?);base64,/);
    const mimeTypeStr = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const base64Data = image.replace(/^data:.*?;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT}\nRefine image. Apply user corrections: ${prompt || ''}` },
          { inlineData: { mimeType: mimeTypeStr, data: base64Data } }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const genImg = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (email && genImg) {
      // Прямое списание кредита в базе
      const { data: user } = await supabase.from('users').select('free_generations_used, paid_credits').eq('email', email).maybeSingle();
      if (user) {
        if ((user.paid_credits || 0) > 0) {
          await supabase.from('users').update({ paid_credits: user.paid_credits - 1 }).eq('email', email);
        } else {
          await supabase.from('users').update({ free_generations_used: (user.free_generations_used || 0) + 1 }).eq('email', email);
        }
      }

      await supabase.from('generations').insert({
        user_email: email, style_name: 'refinement', aspect_ratio: '9:16',
        generated_image_url: `data:image/jpeg;base64,${genImg}`, status: 'success'
      });
    }
    res.json({ imageUrl: `data:image/jpeg;base64,${genImg}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/create-session', async (req, res) => {
  const { email, planId, credits } = req.body;
  const priceId = planId === 'plan_small' ? process.env.PRICE_20_ID : process.env.PRICE_50_ID;
  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?payment=cancel`,
      metadata: { credits: String(credits) }
    });
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', async (req, res) => {
  const { email } = req.query;
  const { data } = await supabase.from('generations').select('*').eq('user_email', email).eq('status', 'success').order('created_at', { ascending: false });
  res.json({ generations: data || [] });
});

// Static files
app.use(express.static(path.join(__dirname, '../dist')));

// Express 5 требует именованный wildcard
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(port, () => console.log(`Server on ${port}`));
