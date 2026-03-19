// РРЎРџР РђР’Р›Р•РќРР• #1: dotenv Р”РћР›Р–Р•Рќ Р±С‹С‚СЊ РїРµСЂРІС‹Рј, РґРѕ Р»СЋР±С‹С… РїРµСЂРµРјРµРЅРЅС‹С… РѕРєСЂСѓР¶РµРЅРёСЏ
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

// РРЎРџР РђР’Р›Р•РќРР• #1: Stripe РёРЅРёС†РёР°Р»РёР·РёСЂСѓРµС‚СЃСЏ РџРћРЎР›Р• dotenv.config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy');

const app = express();
const port = process.env.PORT || 3001;

// Supabase (СЃ РІС‹СЃРѕРєРёРј РґРѕСЃС‚СѓРїРѕРј, С‚РѕР»СЊРєРѕ РЅР° СЃРµСЂРІРµСЂРµ)
const supabaseUrl = process.env.SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key';
const supabase = createClient(supabaseUrl, supabaseKey);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const https = require('https'); // Р”Р»СЏ СЃР°РјРѕРїСЂРѕР·РІРѕРЅР° (Keep-Alive)

app.use(cors());

// РњР°СЃС‚РµСЂ-РїСЂРѕРјС‚ РёРґРµРЅС‚РёС„РёРєР°С†РёРё Р»РёС†Р°
const MASTER_PROMPT = `
  IDENTITY PRESERVATION (CRITICAL): You are a world-renowned portrait master.
  1. EXTREME ACCURACY: The facial structure, eye shape, nose bridge, and lip contours MUST remain 100% UNCHANGED.
  2. NO AGING/ALTERATION: Do not make the person look older, younger, or different.
  3. PHOTOREALISM: Output MUST be indistinguishable from a real photograph.
  4. QUALITY: Professional 8K studio photography, 85mm prime lens, clean skin texture with natural pores.
`;

// в”Ђв”Ђв”Ђ Stripe Webhook (raw body вЂ” РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ Р”Рћ express.json()) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

    if (!userEmail || creditsToAdd <= 0) {
      return res.json({ received: true });
    }

    console.log(`Payment OK: +${creditsToAdd} credits в†’ ${userEmail}`);

    // Р”РѕР±Р°РІР»СЏРµРј РєСЂРµРґРёС‚С‹
    const { data: user } = await supabase
      .from('users')
      .select('credits')
      .eq('email', userEmail)
      .single();

    if (user) {
      await supabase
        .from('users')
        .update({ credits: user.credits + creditsToAdd })
        .eq('email', userEmail);
    }

    // Р›РѕРіРёСЂСѓРµРј РїР»Р°С‚РµР¶
    await supabase.from('payments').insert({
      user_email: userEmail,
      stripe_session_id: session.id,
      amount: session.amount_total,
      credits_added: creditsToAdd,
      status: 'completed'
    });
  }

  res.json({ received: true });
});

// РџРёРЅРі-СЌРЅРґРїРѕРёРЅС‚ РґР»СЏ РїСЂРѕРІРµСЂРєРё Р·РґРѕСЂРѕРІСЊСЏ Рё РїСЂРµРґРѕС‚РІСЂР°С‰РµРЅРёСЏ СЃРЅР°
app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// в”Ђв”Ђв”Ђ JSON middleware (РїРѕСЃР»Рµ webhook!) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// в”Ђв”Ђв”Ђ РџСЂРѕРІРµСЂРєР°/СЃРѕР·РґР°РЅРёРµ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/user/check', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // РџСЂРѕР±СѓРµРј РЅР°Р№С‚Рё СЃСѓС‰РµСЃС‚РІСѓСЋС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
  let { data: user } = await supabase
    .from('users')
    .select('email, credits, free_generations_used, paid_credits, total_available_generations')
    .eq('email', email)
    .single();

  // РРЎРџР РђР’Р›Р•РќРР• #2: Р•СЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ вЂ” СЃРѕР·РґР°РµРј РЅРѕРІРѕРіРѕ
  // Supabase РІРѕР·РІСЂР°С‰Р°РµС‚ error PGRST116 РєРѕРіРґР° Р·Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°, РїРѕСЌС‚РѕРјСѓ
  // РїСЂР°РІРёР»СЊРЅР°СЏ РїСЂРѕРІРµСЂРєР° вЂ” РёРјРµРЅРЅРѕ `!user`, Р° РЅРµ `!user && !error`
  if (!user) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({ email, credits: 5, free_generations_used: 0, paid_credits: 0 })
      .select('email, credits, free_generations_used, paid_credits, total_available_generations')
      .single();

    if (createError) {
      console.error('User creation error:', createError);
      return res.status(500).json({ error: 'Failed to create user' });
    }
    user = newUser;
  }

  // РРЎРџР РђР’Р›Р•РќРР• #3: РЇРІРЅР°СЏ РїСЂРѕРІРµСЂРєР° РїРµСЂРµРґ РѕС‚РїСЂР°РІРєРѕР№ РѕС‚РІРµС‚Р°
  if (!user) {
    return res.status(500).json({ error: 'User not found and could not be created' });
  }

  // Р•СЃР»Рё total_available_generations РµС‰Рµ РЅРµ СЂР°СЃСЃС‡РёС‚Р°РЅ, С„РѕР»Р»Р±РµРє РЅР° credits РёР»Рё РІС‹С‡РёСЃР»РµРЅРёРµ
  const totalCredits = (user.total_available_generations !== undefined && user.total_available_generations !== null) 
    ? user.total_available_generations 
    : (user.credits !== undefined ? user.credits : (5 - user.free_generations_used + user.paid_credits));

  res.json({ 
    email: user.email, 
    credits: totalCredits,
    free_generations_used: user.free_generations_used || 0,
    paid_credits: user.paid_credits || 0
  });
});

// в”Ђв”Ђв”Ђ РЎРѕР·РґР°РЅРёРµ СЃРµСЃСЃРёРё РѕРїР»Р°С‚С‹ Stripe в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/create-checkout-session', async (req, res) => {
  const { email, priceId: planId, credits } = req.body;

  if (!email || !planId) {
    return res.status(400).json({ error: 'Email and planId are required' });
  }

  // РћРїСЂРµРґРµР»СЏРµРј СЂРµР°Р»СЊРЅС‹Р№ Price ID РёР· РїРµСЂРµРјРµРЅРЅС‹С… РѕРєСЂСѓР¶РµРЅРёСЏ Render
  const stripePriceId = planId === 'plan_small'
    ? process.env.PRICE_20_ID
    : process.env.PRICE_50_ID;

  if (!stripePriceId) {
    console.error('Stripe Price ID not configured. Check PRICE_20_ID / PRICE_50_ID in Render.');
    return res.status(500).json({ error: 'Payment not configured. Contact support.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?payment=cancel`,
      metadata: { credits: String(credits) }
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe session error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// в”Ђв”Ђв”Ђ Р“РµРЅРµСЂР°С†РёСЏ С„РѕС‚Рѕ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/generate', async (req, res) => {
  const { image, mimeType = 'image/jpeg', style, aspectRatio = '9:16', prompt, email } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'Image is required' });
  }

  try {
    // 1. РџСЂРѕРІРµСЂСЏРµРј РєСЂРµРґРёС‚С‹ РІ Р±Р°Р·Рµ (С‚РѕР»СЊРєРѕ РµСЃР»Рё РїРµСЂРµРґР°РЅ email)
    if (email) {
      const { data: user } = await supabase
        .from('users')
        .select('credits, free_generations_used, paid_credits, total_available_generations')
        .eq('email', email)
        .single();
      
      const totalCredits = (user && user.total_available_generations !== undefined && user.total_available_generations !== null) 
        ? user.total_available_generations 
        : (user ? (user.credits || (5 - (user.free_generations_used || 0) + (user.paid_credits || 0))) : 0);

      if (!user || totalCredits <= 0) {
        return res.status(403).json({ error: 'OUT_OF_CREDITS' });
      }
    }

    // 2. Р“РµРЅРµСЂРёСЂСѓРµРј РёР·РѕР±СЂР°Р¶РµРЅРёРµ
    const ratioHint = aspectRatio === '16:9'
      ? 'COMPOSITION: Landscape/horizontal orientation (16:9 widescreen). Full-width studio shot.'
      : 'COMPOSITION: Portrait/vertical orientation (9:16). Classic head-and-shoulders studio framing.';

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT}\n${ratioHint}\nStyle: ${style}.\nUser Instructions: ${prompt || 'Professional studio portrait with clean lighting.'}` },
          { inlineData: { mimeType, data: image } }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const generatedImage = response.candidates?.[0]?.content?.parts
      ?.find(p => p.inlineData)?.inlineData?.data;

    if (!generatedImage) {
      throw new Error('AI returned no image. Please try again.');
    }

    // РРЎРџР РђР’Р›Р•РќРР• #4: РЎРїРёСЃС‹РІР°РµРј РєСЂРµРґРёС‚ С‚РѕР»СЊРєРѕ РџРћРЎР›Р• СѓСЃРїРµС€РЅРѕР№ РіРµРЅРµСЂР°С†РёРё
    if (email) {
      const { error: rpcError } = await supabase.rpc('decrement_credits', { user_email: email });
      if (rpcError) console.error('Failed to decrement credits:', rpcError);
      // РўР°РєР¶Рµ СЃРѕС…СЂР°РЅСЏРµРј РёСЃС‚РѕСЂРёСЋ РіРµРЅРµСЂР°С†РёРё
      await supabase.from('generations').insert({
        user_email: email,
        style_name: style,
        aspect_ratio: aspectRatio,
        generated_image_url: `data:image/jpeg;base64,${generatedImage}`,
        status: 'success'
      }).catch(err => console.error('Failed to save generation history:', err));
    }

    res.json({ image: `data:image/jpeg;base64,${generatedImage}` });

  } catch (error) {
    console.error('Error in /api/generate:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// в”Ђв”Ђв”Ђ Р РµРґР°РєС‚РёСЂРѕРІР°РЅРёРµ / СѓС‚РѕС‡РЅРµРЅРёРµ С„РѕС‚Рѕ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
app.post('/api/refine', async (req, res) => {
  const { image, correction, email } = req.body;

  if (!image || !correction || !email) {
    return res.status(400).json({ error: 'image, correction and email are required' });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('credits, free_generations_used, paid_credits, total_available_generations')
      .eq('email', email)
      .single();

    const totalCredits = (user && user.total_available_generations !== undefined && user.total_available_generations !== null) 
      ? user.total_available_generations 
      : (user ? (user.credits || (5 - (user.free_generations_used || 0) + (user.paid_credits || 0))) : 0);

    if (!user || totalCredits <= 0) {
      return res.status(403).json({ error: 'OUT_OF_CREDITS' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT}\nREFINEMENT TASK: ${correction}. Focus only on requested changes.` },
          { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const refinedImage = response.candidates?.[0]?.content?.parts
      ?.find(p => p.inlineData)?.inlineData?.data;

    if (!refinedImage) {
      throw new Error('AI returned no image. Please try again.');
    }

    // РЎРїРёСЃС‹РІР°РµРј РєСЂРµРґРёС‚ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ СѓСЃРїРµС…Р°
    const { error: rpcError } = await supabase.rpc('decrement_credits', { user_email: email });
    if (rpcError) console.error('Failed to decrement credits on refine:', rpcError);

    res.json({ image: `data:image/jpeg;base64,${refinedImage}` });
  } catch (error) {
    console.error('Error in /api/refine:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// в”Ђв”Ђв”Ђ РЎС‚Р°С‚РёС‡РµСЃРєРёРµ С„Р°Р№Р»С‹ С„СЂРѕРЅС‚РµРЅРґР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

// --- History: user generation history ---
app.get('/api/history', async (req, res) => {
  const { email } = req.query;

  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  try {
    const { data, error } = await supabase
      .from('generations')
      .select('id, created_at, style_name, aspect_ratio, generated_image_url, status')
      .eq('user_email', email)
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ generations: data || [] });
  } catch (error) {
    console.error('Error in /api/history:', error.message);
    res.status(500).json({ error: error.message });
  }
});


// --- History: user generation history ---
app.get('/api/history', async (req, res) => {
  const { email } = req.query;
  if (!email || !String(email).includes('@')) return res.status(400).json({ error: 'Valid email is required' });
  try {
    const { data, error } = await supabase.from('generations').select('id, created_at, style_name, aspect_ratio, generated_image_url, status').eq('user_email', email).eq('status', 'success').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ generations: data || [] });
  } catch (error) {
    console.error('Error in /api/history:', error.message);
    res.status(500).json({ error: error.message });
  }
});


app.use(express.static(path.join(__dirname, '../dist')));

app.get('/*splat', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);

  // РЎР°РјРѕРїСЂРѕР·РІРѕРЅ РґР»СЏ РїСЂРµРґРѕС‚РІСЂР°С‰РµРЅРёСЏ "Р·Р°СЃС‹РїР°РЅРёСЏ" РЅР° Р±РµСЃРїР»Р°С‚РЅС‹С… С…РѕСЃС‚РёРЅРіР°С… (Render/Heroku/Railway)
  // РРЅС‚РµСЂРІР°Р» 14 РјРёРЅСѓС‚ (РѕР±С‹С‡РЅРѕ Р·Р°СЃС‹РїР°РµС‚ С‡РµСЂРµР· 15)
  const selfPing = () => {
    const url = process.env.RENDER_EXTERNAL_URL || process.env.FRONTEND_URL;
    if (url) {
      https.get(`${url}/api/health`, (res) => {
        console.log(`Keep-alive ping sent to ${url}. Status: ${res.statusCode}`);
      }).on('error', (err) => {
        console.error('Keep-alive ping failed:', err.message);
      });
    }
  };

  // Р—Р°РїСѓСЃРє РєР°Р¶РґС‹Рµ 14 РјРёРЅСѓС‚
  if (process.env.NODE_ENV === 'production') {
    setInterval(selfPing, 14 * 60 * 1000);
    // РџРµСЂРІС‹Р№ РїРёРЅРі С‡РµСЂРµР· РјРёРЅСѓС‚Сѓ РїРѕСЃР»Рµ СЃС‚Р°СЂС‚Р°
    setTimeout(selfPing, 60 * 1000);
  }
});
