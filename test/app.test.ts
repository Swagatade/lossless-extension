import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const app = createApp({ QOBUZ_PROVIDER: 'stub', QOBUZ_ID_SECRET: 'test-secret' });
const call = (path: string, init?: RequestInit) => app.fetch(new Request(`https://example.test${path}`, init));

test('health and manifest work through the Web-standard handler', async () => {
  assert.deepEqual(await (await call('/health')).json(), { ok: true });
  const manifest = await (await call('/c/manifest.json')).json() as { id: string };
  assert.equal(manifest.id, 'com.EchoMusic.qobuz.monochrome');
});

test('validates input and rejects unsupported methods', async () => {
  assert.equal((await call('/search')).status, 400);
  assert.equal((await call('/search?q=x&quality=BAD')).status, 400);
  assert.equal((await call('/stream/qobuz_bogusbogusbogus')).status, 404);
  assert.equal((await call('/health', { method: 'POST' })).status, 405);
  assert.equal((await call('/nope')).status, 404);
});

test('config is read from the supplied env, not process.env', () => {
  assert.equal(loadConfig({ CACHE_TTL_SECONDS: '10' }).cacheTtlMs, 10_000);
  assert.throws(() => loadConfig({ QOBUZ_PROVIDER: 'wat' }));
});
