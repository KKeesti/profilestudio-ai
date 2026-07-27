const test = require('node:test');
const assert = require('node:assert/strict');

const {
  inspectGeminiImageResponse,
  isGeminiSafetyError,
} = require('./gemini-response');

test('treats promptFeedback block reasons as blocked image requests', () => {
  const result = inspectGeminiImageResponse({
    promptFeedback: { blockReason: 'OTHER' },
  });

  assert.equal(result.blocked, true);
  assert.equal(result.promptBlockReason, 'OTHER');
  assert.equal(result.image, '');
});

test('treats safety candidate finish reasons as blocked image requests', () => {
  const result = inspectGeminiImageResponse({
    candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
  });

  assert.equal(result.blocked, true);
  assert.equal(result.finishReason, 'SAFETY');
});

test('extracts an image from a successful response', () => {
  const result = inspectGeminiImageResponse({
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ inlineData: { data: 'generated-image' } }] },
    }],
  });

  assert.equal(result.blocked, false);
  assert.equal(result.image, 'generated-image');
});

test('recognizes safety failures returned as API errors', () => {
  assert.equal(isGeminiSafetyError(new Error('Request blocked by Responsible AI policy')), true);
  assert.equal(isGeminiSafetyError(new Error('Network timeout')), false);
});
