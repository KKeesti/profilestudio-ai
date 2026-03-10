const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Инициализация Supabase (Серверная версия с высоким доступом)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(cors());

// Важно: Stripe Webhook требует необработанное тело запроса (raw body)
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userEmail = session.customer_email;
    const creditsToAdd = parseInt(session.metadata.credits);

    console.log(`Payment successful! Adding ${creditsToAdd} credits to ${userEmail}`);

    // Добавляем кредиты в базу данных
    const { data: user, error: fetchError } = await supabase
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

    // Сохраняем информацию о платеже
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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MASTER_PROMPT = `
  IDENTITY PRESERVATION (CRITICAL): You are a world-renowned portrait master. 
  1. EXTREME ACCURACY: The facial structure, eye shape, nose bridge, and lip contours of the person in the provided image must remain 100% UNCHANGED.
  2. NO AGING/ALTERATION: Do not make the person look older, younger, or different. 
  3. PHOTOREALISM: Output MUST be indistinguishable from a real photograph. No 3D render look, no artistic smoothing.
  4. QUALITY: Professional 8K studio photography, 85mm prime lens, clean skin texture with natural pores.
`;

// Эндпоинт для проверки кредитов и создания пользователя
app.post('/api/user/check', async (req, res) => {
  const { email } = req.body;

  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (!user && !error) {
    // Создаем нового пользователя с 5 бесплатными попытками
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({ email, credits: 5 })
      .select()
      .single();
    user = newUser;
  }

  res.json({ email: user.email, credits: user.credits });
});

// Эндпоинт для создания сессии оплаты Stripe
app.post('/api/create-checkout-session', async (req, res) => {
  const { email, priceId: planId, credits } = req.body;

  // Определяем реальный ID цены из настроек Render
  const stripePriceId = planId === 'plan_small' ? process.env.PRICE_20_ID : process.env.PRICE_50_ID;

  if (!stripePriceId) {
    return res.status(500).json({ error: 'Stripe Price ID not configured in Render environment' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/?payment=cancel`,
      metadata: { credits: credits.toString() }
    });

    res.json({ id: session.id, url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Основная генерация
app.post('/api/generate', async (req, res) => {
  const { image, style, prompt, email } = req.body;

  try {
    // 1. Проверяем кредиты в базе
    const { data: user } = await supabase
      .from('users')
      .select('credits')
      .eq('email', email)
      .single();

    if (!user || user.credits <= 0) {
      return res.status(403).json({ error: 'OUT_OF_CREDITS' });
    }

    // 2. Генерация
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp-image-generation',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT} \n Style: ${style}. \n User Instructions: ${prompt || 'Professional studio portrait with clean lighting.'}` },
          { inlineData: { mimeType: 'image/jpeg', data: image } }
        ]
      }],
      generationConfig: { responseModalities: ["image"] }
    });

    const generatedImage = response.response.candidates[0].content.parts.find(p => p.inlineData)?.inlineData.data;

    if (!generatedImage) throw new Error("AI failed to generate image");

    // 3. Списываем кредит в надежном режиме
    await supabase.rpc('decrement_credits', { user_email: email });

    res.json({ image: `data:image/jpeg;base64,${generatedImage}` });

  } catch (error) {
    console.error("Error in /api/generate:", error);
    res.status(500).json({ error: error.message });
  }
});

// Маршрут для исправления/правки фото
app.post('/api/refine', async (req, res) => {
  const { image, correction, email } = req.body;

  try {
    const { data: user } = await supabase.from('users').select('credits').eq('email', email).single();
    if (!user || user.credits <= 0) return res.status(403).json({ error: 'OUT_OF_CREDITS' });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp-image-generation',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT} \n REFINEMENT TASK: ${correction}. Focus only on requested changes.` },
          { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } }
        ]
      }],
      generationConfig: { responseModalities: ["image"] }
    });

    const refinedImage = response.response.candidates[0].content.parts.find(p => p.inlineData)?.inlineData.data;
    await supabase.rpc('decrement_credits', { user_email: email });

    res.json({ image: `data:image/jpeg;base64,${refinedImage}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Отдаем фронтенд
app.use(express.static(path.join(__dirname, '../dist')));

app.get('/*splat', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
