const crypto = require('crypto');
const fs = require('fs');

const DEFAULT_SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const DEFAULT_ANONYMOUS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function parseCookies(header) {
  if (!header || typeof header !== 'string') return {};
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = '';
    }
    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  if (Number.isFinite(options.maxAge)) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  return parts.join('; ');
}

function readEntries(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(filePath, entries) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(entries), { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function createSessionStore(filePath, options = {}) {
  const ttlMs = options.ttlMs || DEFAULT_SESSION_TTL_MS;
  const maxSessionsPerEmail = options.maxSessionsPerEmail || 5;

  function prune(entries, now = Date.now()) {
    return entries.filter(entry => entry && entry.email && entry.tokenHash && now - Number(entry.createdAt || 0) < ttlMs);
  }

  return {
    issue(email, { replace = false } = {}) {
      const now = Date.now();
      let entries = prune(readEntries(filePath), now);
      if (replace) entries = entries.filter(entry => entry.email !== email);

      const sameEmail = entries.filter(entry => entry.email === email);
      if (sameEmail.length >= maxSessionsPerEmail) {
        const oldest = sameEmail.sort((a, b) => Number(a.createdAt) - Number(b.createdAt))[0];
        entries = entries.filter(entry => entry.tokenHash !== oldest.tokenHash);
      }

      const token = crypto.randomBytes(32).toString('base64url');
      entries.push({ email, tokenHash: hashToken(token), createdAt: now });
      writeEntries(filePath, entries);
      return token;
    },

    resolve(token) {
      if (!token || typeof token !== 'string' || token.length > 256) return null;
      const now = Date.now();
      const entries = prune(readEntries(filePath), now);
      const tokenHash = hashToken(token);
      const match = entries.find(entry => safeEqual(entry.tokenHash, tokenHash));
      return match?.email || null;
    },

    revoke(token) {
      if (!token) return;
      const tokenHash = hashToken(token);
      const entries = readEntries(filePath).filter(entry => !safeEqual(entry.tokenHash, tokenHash));
      writeEntries(filePath, entries);
    },
  };
}

function createAnonymousUsageStore(filePath, options = {}) {
  const ttlMs = options.ttlMs || DEFAULT_ANONYMOUS_TTL_MS;
  const limit = options.limit || 10;

  function prune(entries, now = Date.now()) {
    return entries.filter(entry => entry && entry.tokenHash && now - Number(entry.createdAt || 0) < ttlMs);
  }

  function getEntry(token) {
    if (!token || typeof token !== 'string' || token.length > 256) return null;
    const tokenHash = hashToken(token);
    return prune(readEntries(filePath)).find(entry => safeEqual(entry.tokenHash, tokenHash)) || null;
  }

  return {
    getOrIssue(token) {
      const existing = getEntry(token);
      if (existing) return { token, count: Number(existing.count || 0), isNew: false };

      const newToken = crypto.randomBytes(32).toString('base64url');
      const entries = prune(readEntries(filePath));
      entries.push({ tokenHash: hashToken(newToken), count: 0, createdAt: Date.now() });
      writeEntries(filePath, entries);
      return { token: newToken, count: 0, isNew: true };
    },

    increment(token) {
      const tokenHash = hashToken(token);
      const entries = prune(readEntries(filePath));
      const entry = entries.find(item => safeEqual(item.tokenHash, tokenHash));
      if (!entry) return null;
      entry.count = Math.min(limit, Number(entry.count || 0) + 1);
      writeEntries(filePath, entries);
      return entry.count;
    },
  };
}

module.exports = {
  createAnonymousUsageStore,
  createSessionStore,
  hashToken,
  parseCookies,
  safeEqual,
  serializeCookie,
};
