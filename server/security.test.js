const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createAnonymousUsageStore,
  createSessionStore,
  parseCookies,
  safeEqual,
  serializeCookie,
} = require('./security');

test('safeEqual compares secrets without accepting different lengths', () => {
  assert.equal(safeEqual('secret', 'secret'), true);
  assert.equal(safeEqual('secret', 'secrex'), false);
  assert.equal(safeEqual('secret', 'secret-long'), false);
});

test('cookie helpers round-trip an encoded value', () => {
  const header = serializeCookie('shotme_session', 'a/b+c', { maxAge: 60 });
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.equal(parseCookies(header).shotme_session, 'a/b+c');
});

test('session store issues, resolves, replaces, and revokes tokens', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shotme-security-'));
  const file = path.join(directory, 'sessions.json');
  const store = createSessionStore(file);
  const first = store.issue('user@example.com');
  assert.equal(store.resolve(first), 'user@example.com');

  const replacement = store.issue('user@example.com', { replace: true });
  assert.equal(store.resolve(first), null);
  assert.equal(store.resolve(replacement), 'user@example.com');

  store.revoke(replacement);
  assert.equal(store.resolve(replacement), null);
});

test('anonymous usage store persists and caps successful usage', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shotme-anon-'));
  const file = path.join(directory, 'usage.json');
  const store = createAnonymousUsageStore(file, { limit: 2 });
  const identity = store.getOrIssue();
  assert.equal(identity.count, 0);
  assert.equal(store.increment(identity.token), 1);
  assert.equal(store.increment(identity.token), 2);
  assert.equal(store.increment(identity.token), 2);
  assert.equal(store.getOrIssue(identity.token).count, 2);
});
