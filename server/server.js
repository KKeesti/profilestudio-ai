const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path'); // Добавлен модуль для работы с путями файлов
const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Разрешаем доступы к нашему серверу из браузера
app.use(cors());
// Наш сервер сможет принимать большие картинки (json и urlencoded)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Multer не обязателен для base64, но полезен, если вы потом захотите грузить файлы как multipart/form-data
// Оставим для масштабирования в будущем

// Инициализируем клиента ИИ (ключ теперь ТОЛЬКО на сервере!)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ------- ЛОГИКА ИИ СКОПИРОВАНА ИЗ ВАШЕГО geminiService.ts ------
const MASTER_PROMPT = `
  IDENTITY PRESERVATION (CRITICAL): You are a world-renowned portrait master. 
  1. EXTREME ACCURACY: The facial structure, eye shape, nose bridge, and lip contours of the person in the provided image must remain 100% UNCHANGED.
  2. NO AGING/ALTERATION: Do not make the person look older, younger, or different. 
  3. PHOTOREALISM: Output MUST be indistinguishable from a real photograph. No 3D render look, no artistic smoothing.
  4. QUALITY: Professional 8K studio photography, 85mm prime lens, clean skin texture with natural pores.
`;

const ObjectStylesMap = {
  'classic_studio': `STYLE: High-end Classic Studio. Solid neutral backdrop (grey or beige). Rembrandt lighting with soft shadows. Wearing elegant professional or casual luxury attire.`,
  'fashion_editorial': `STYLE: Vogue Editorial. Dramatic high-contrast lighting. Sharp shadows, high-key or low-key background. Stylish high-fashion wardrobe.`,
  'business_luxe': `STYLE: Business Success. Blurred background of a modern architectural office or premium studio. Sophisticated corporate attire. Wealthy, successful atmosphere.`
};

// Функция парсинга Base64 картинки из ответа нейросети
function extractImageUrl(response) {
  const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (part?.inlineData) {
    return `data:image/png;base64,${part.inlineData.data}`;
  }
  throw new Error("Не удалось получить изображение от Google AI.");
}

// 1. РОУТ: Генерация первого фото
app.post('/api/generate', async (req, res) => {
  try {
    const { imageBase64, mimeType, style, aspectRatio, customPrompt } = req.body;

    if (!imageBase64 || !style || !aspectRatio) {
      return res.status(400).json({ error: 'Не переданы обязательные параметры (картинка, стиль, соотношение сторон).' });
    }

    const stylePrompt = ObjectStylesMap[style] || ObjectStylesMap['classic_studio'];

    const prompt = `
      ${MASTER_PROMPT}
      ${stylePrompt}
      ORIENTATION: Target format is ${aspectRatio === '9:16' ? 'Vertical Portrait' : 'Horizontal Landscape'}.
      ${customPrompt ? `ADDITIONAL DETAILS: ${customPrompt}` : ''}
      FINAL COMMAND: Render a stunning professional studio portrait. Ensure skin tones are natural and the person's identity is perfectamente preserved.
    `;

    // Вызываем скрытое API Google с ключом, который спрятан в .env файле этого сервера
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: {
        parts: [
          { inlineData: { data: imageBase64, mimeType: mimeType || 'image/jpeg' } },
          { text: prompt },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "1K"
        }
      }
    });

    const resultImageBase64 = extractImageUrl(response);

    // Возвращаем результат обратно на сайт пользователя (frontend)
    res.json({ success: true, image: resultImageBase64 });

  } catch (error) {
    console.error('Ошибка в /api/generate:', error);
    res.status(500).json({ error: 'Ошибка генерации изображения. Проверьте консоль сервера для деталей.', details: error.message });
  }
});

// 2. РОУТ: Корректировка (Refine)
app.post('/api/refine', async (req, res) => {
  try {
    const { imageBase64, mimeType, correctionRequest, aspectRatio } = req.body;

    if (!imageBase64 || !correctionRequest || !aspectRatio) {
      return res.status(400).json({ error: 'Не переданы обязательные параметры для корректировки.' });
    }

    const prompt = `
      ${MASTER_PROMPT}
      TASK: Apply these specific edits to the current photo: "${correctionRequest}".
      STRICT RULE: Only modify clothing, background, lighting, or accessories. The facial features and identity of the person must remain identical to the input image.
      RENDER: Professional studio quality.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: {
        parts: [
          { inlineData: { data: imageBase64, mimeType: mimeType || 'image/jpeg' } },
          { text: prompt },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "1K"
        }
      }
    });

    const resultImageBase64 = extractImageUrl(response);
    res.json({ success: true, image: resultImageBase64 });

  } catch (error) {
    console.error('Ошибка в /api/refine:', error);
    res.status(500).json({ error: 'Ошибка при корректировке фото.', details: error.message });
  }
});

// === ИНТЕГРАЦИЯ FRONTEND И BACKEND ДЛЯ ИНТЕРНЕТА ===
// Если сервер запущен в интернете (не локально), мы отдаем собранные файлы сайта 
// из папки 'dist', которая создается при команде npm run build
app.use(express.static(path.join(__dirname, '../dist')));

// Любой другой запрос (например, обновление страницы руками), отправляем на index.html
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});
// ===============================================

app.listen(port, () => {
  console.log(`Сервер ProfileStudio AI запущен на порту ${port}`);
});
