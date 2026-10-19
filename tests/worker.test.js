import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const env = { APP_TOKEN: 'test-secret', ALLOWED_ORIGINS: 'https://studio.example', OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'gem-test' };
const req = (path, { method = 'GET', origin = 'https://studio.example', token = 'test-secret', body } = {}) => new Request(`https://worker.example${path}`, {
  method,
  headers: { ...(origin !== null ? { Origin: origin } : {}), ...(token ? { 'X-App-Token': token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body)
});

test('health requires the configured app token', async () => {
  const r = await worker.fetch(req('/health', { token: '' }), env);
  assert.equal(r.status, 401);
});

test('rejects unapproved browser origins', async () => {
  const r = await worker.fetch(req('/health', { origin: 'https://evil.example' }), env);
  assert.equal(r.status, 403);
});

test('rejects missing prompt before provider request', async () => {
  const r = await worker.fetch(req('/api/generate', { method: 'POST', body: { provider: 'openai' } }), env);
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /prompt/);
});

test('OpenAI response is normalized to plain text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer sk-test');
    return new Response(JSON.stringify({ output_text: 'نتيجة اختبار' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await worker.fetch(req('/api/generate', { method: 'POST', body: { provider: 'openai', prompt: 'اختبار' } }), env);
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.text, 'نتيجة اختبار');
    assert.equal(d.provider, 'openai');
  } finally { globalThis.fetch = originalFetch; }
});

test('Gemini response is normalized to plain text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.equal(options.headers['x-goog-api-key'], 'gem-test');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'نتيجة Gemini' }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const r = await worker.fetch(req('/api/generate', { method: 'POST', body: { provider: 'gemini', prompt: 'اختبار' } }), env);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).text, 'نتيجة Gemini');
  } finally { globalThis.fetch = originalFetch; }
});
