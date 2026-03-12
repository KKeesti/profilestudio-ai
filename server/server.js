// ИСПРАВЛЕНИЕ #1: dotenv ДОЛЖЕН быть первым, до любых переменных окружения
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

// ИСПРАВЛЕНИЕ #1: Stripe инициализируется ПОСЛЕ dotenv.config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3001;

// Supabase (с высоким доступом, только на сервере)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());

// Мастер-промт идентификации лица
const MASTER_PROMPT = `
  IDENTITY PRESERVATION (CRITICAL): You are a world-renowned portrait master.
  1. EXTREME ACCURACY: The facial structure, eye shape, nose bridge, and lip contours MUST remain 100% UNCHANGED.
  2. NO AGING/ALTERATION: Do not make the person look older, younger, or different.
  3. PHOTOREALISM: Output MUST be indistinguishable from a real photograph.
  4. QUALITY: Professional 8K studio photography, 85mm prime lens, clean skin texture with natural pores.
`;

// ─── Stripe Webhook (raw body — должен быть ДО express.json()) ────────────────
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

    console.log(`Payment OK: +${creditsToAdd} credits → ${userEmail}`);

    // Добавляем кредиты
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

    // Логируем платеж
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

// ─── JSON middleware (после webhook!) ────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Проверка/создание пользователя ──────────────────────────────────────────
app.post('/api/user/check', async (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // Пробуем найти существующего пользователя
  let { data: user } = await supabase
    .from('users')
    .select('email, credits')
    .eq('email', email)
    .single();

  // ИСПРАВЛЕНИЕ #2: Если пользователь не найден — создаем нового
  // Supabase возвращает error PGRST116 когда запись не найдена, поэтому
  // правильная проверка — именно `!user`, а не `!user && !error`
  if (!user) {
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({ email, credits: 5 })
      .select('email, credits')
      .single();

    if (createError) {
      console.error('User creation error:', createError);
      return res.status(500).json({ error: 'Failed to create user' });
    }
    user = newUser;
  }

  // ИСПРАВЛЕНИЕ #3: Явная проверка перед отправкой ответа
  if (!user) {
    return res.status(500).json({ error: 'User not found and could not be created' });
  }

  res.json({ email: user.email, credits: user.credits });
});

// ─── Создание сессии оплаты Stripe ───────────────────────────────────────────
app.post('/api/create-checkout-session', async (req, res) => {
  const { email, priceId: planId, credits } = req.body;

  if (!email || !planId) {
    return res.status(400).json({ error: 'Email and planId are required' });
  }

  // Определяем реальный Price ID из переменных окружения Render
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

// ─── Генерация фото ───────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  const { image, style, prompt, email } = req.body;

  if (!image || !email) {
    return res.status(400).json({ error: 'Image and email are required' });
  }

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

    // 2. Генерируем изображение
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT}\nStyle: ${style}.\nUser Instructions: ${prompt || 'Professional studio portrait with clean lighting.'}` },
          { inlineData: { mimeType: 'image/jpeg', data: image } }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const generatedImage = response.response.candidates[0]?.content?.parts
      ?.find(p => p.inlineData)?.inlineData?.data;

    if (!generatedImage) {
      throw new Error('AI returned no image. Please try again.');
    }

    // ИСПРАВЛЕНИЕ #4: Списываем кредит только ПОСЛЕ успешной генерации
    await supabase.rpc('decrement_credits', { user_email: email });

    res.json({ image: `data:image/jpeg;base64,${generatedImage}` });

  } catch (error) {
    console.error('Error in /api/generate:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Редактирование / уточнение фото ────────────────────────────────────────
app.post('/api/refine', async (req, res) => {
  const { image, correction, email } = req.body;

  if (!image || !correction || !email) {
    return res.status(400).json({ error: 'image, correction and email are required' });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('credits')
      .eq('email', email)
      .single();

    if (!user || user.credits <= 0) {
      return res.status(403).json({ error: 'OUT_OF_CREDITS' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        role: 'user',
        parts: [
          { text: `${MASTER_PROMPT}\nREFINEMENT TASK: ${correction}. Focus only on requested changes.` },
          { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } }
        ]
      }],
      generationConfig: { responseModalities: ['image'] }
    });

    const refinedImage = response.response.candidates[0]?.content?.parts
      ?.find(p => p.inlineData)?.inlineData?.data;

    if (!refinedImage) {
      throw new Error('AI returned no image. Please try again.');
    }

    // Списываем кредит только после успеха
    await supabase.rpc('decrement_credits', { user_email: email });

    res.json({ image: `data:image/jpeg;base64,${refinedImage}` });
  } catch (error) {
    console.error('Error in /api/refine:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Статические файлы фронтенда ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../dist')));

app.get('/*splat', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
