const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'IMAGE_SAFETY',
]);

function inspectGeminiImageResponse(response) {
  const candidate = response?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const image = parts.find(part => part?.inlineData?.data)?.inlineData?.data || '';
  const text = parts.map(part => part?.text).filter(Boolean).join(' ').slice(0, 300);
  const promptBlockReason = String(response?.promptFeedback?.blockReason || '');
  const finishReason = String(candidate?.finishReason || '');

  return {
    image,
    text,
    promptBlockReason,
    finishReason,
    blocked: Boolean(promptBlockReason) || BLOCKED_FINISH_REASONS.has(finishReason),
  };
}

function isGeminiSafetyError(error) {
  const message = String(error?.message || '');
  return /(?:responsible ai|safety|blocked|blocklist|prohibited content|public figure|celebrity)/i.test(message);
}

module.exports = {
  inspectGeminiImageResponse,
  isGeminiSafetyError,
};
