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

const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key';
const supabase = createClient(supabaseUrl, supabaseKey);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MASTER_PROMPT = `
  IDENTITY PRESERVATION (CRITICAL): You are a world-renowned portrait master.
  1. EXTREME ACCURACY: The facial structure, eye shape, nose bridge, and lip contours MUST remain 100% UNCHANGED.
  2. NO AGING/ALTERATION: Do not make the person look older, younger, or different.
  3. PHOTOREALISM: Output MUST be indistinguishable from a real photograph.
  4. QUALITY: Professional 8K studio photography, 85mm prime lens, clean skin texture with natural pores.
`;

// Stripe Webhook 
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook signature error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userEmail = session.customer_email;
    const creditsToAdd = parseInt(session.metadata?.credits || '0');

    if (userEmail && creditsToAdd > 0) {
      const { data: user } = await supabase.from('users').select('credits').eq('email', userEmail).maybeSingle();
      if (user) {
        await supabase.from('users').update({ 
          credits: (user.credits || 0) + creditsToAdd,
          paid_credits: (user.paid_credits || 0) + creditsToAdd
        }).eq('email', userEmail);
      }
    }
  }
  res.json({ received: true });
});

app.get('/api/health', (req, res) => res.send('OK'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// User check endpoint
app.post('/api/user/check', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });

  let { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();

  if (!user) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({ email, credits: 5, free_generations_used: 0, paid_credits: 0 })
      .select('*')
      .maybeSingle();
    if (createError) return res.status(500).json({ error: 'Failed to create user' });
    user = newUser;
  }

  const freeUsed = user ? (user.free_generations_used || 0) : 0;
  const paidCredits = user ? (user.paid_credits || 0) : 0;
  const totalCredits = (5 - freeUsed) + paidCredits;

  res.json({ 
    email: user.email, 
    credits: totalCredits,
    free_generations_used: freeUsed,
    paid_credits: paidCredits
  });
});

// Generation endpoint
app.post('/api/generate', async (req, res) => {
  const { image, mimeType = 'image/jpeg', style, aspectRatio = '9:16', prompt, email } = req.body;
  if (!image) return res.status(400).json({ error: 'Image is required' });

  try {
    if (email) {
      const { data: user } = await supabase.from('users').select('credits, free_generations_used, paid_credits').eq('email', email).maybeSingle();
      const freeUsed = user ? (user.free_generations_used || 0) : 0;
      const paidCredits = user ? (user.paid_credits || 0) : 0;
      const totalCredits = (5 - freeUsed) + paidCredits;

      if (totalCredits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });
    }

    const ratioHint = aspectRatio === '16:9' ? 'Landscape/horizontal' : 'Portrait/vertical';
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT}\n${ratioHint}\nStyle: ${style}.\nUser Instructions: ${prompt || 'Studio portrait.'}` },
          { inlineData: { mimeType, data: image } }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const generatedImage = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!generatedImage) throw new Error('AI returned no image.');

    if (email) {
      await supabase.rpc('decrement_credits', { user_email: email });
      await supabase.from('generations').insert({
        user_email: email,
        style_name: style,
        aspect_ratio: aspectRatio,
        generated_image_url: `data:image/jpeg;base64,${generatedImage}`,
        status: 'success'
      }).catch(console.error);
    }
    res.json({ image: `data:image/jpeg;base64,${generatedImage}` });
  } catch (error) {
    console.error('Error generating:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Payment checkout session
app.post('/api/payment/create-session', async (req, res) => {
  const { email, planId, credits } = req.body;
  const stripePriceId = planId === 'plan_small' ? process.env.PRICE_20_ID : process.env.PRICE_50_ID;
  if (!stripePriceId) return res.status(500).json({ error: 'Price not configured' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL || 'https://profilestudio-ai.onrender.com'}/?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL || 'https://profilestudio-ai.onrender.com'}/?payment=cancel`,
      metadata: { credits: String(credits) }
    });
    res.json({ id: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/history', async (req, res) => {
  const { email } = req.query;
  const { data } = await supabase.from('generations').select('*').eq('user_email', email).eq('status', 'success').order('created_at', { ascending: false }).limit(50);
  res.json({ generations: data || [] });
});

app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, '../dist', 'index.html')));

app.listen(port, () => console.log(`Server running on port ${port}`));
