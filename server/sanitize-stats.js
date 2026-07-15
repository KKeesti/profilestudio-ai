const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const statsFile = path.join(process.env.RUNTIME_DIR || __dirname, '.shotme-stats-events.jsonl');
const hashKey = process.env.STATS_HASH_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
if (!hashKey) throw new Error('A stats hashing secret is required');
if (!fs.existsSync(statsFile)) process.exit(0);

let changed = 0;
const sanitized = fs.readFileSync(statsFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(line => {
    const event = JSON.parse(line);
    if (event.email) {
      event.emailHash = event.emailHash || crypto
        .createHmac('sha256', hashKey)
        .update(String(event.email).trim().toLowerCase())
        .digest('hex');
      delete event.email;
      changed += 1;
    }
    if (event.sessionId) {
      delete event.sessionId;
      changed += 1;
    }
    return JSON.stringify(event);
  });

const tempFile = `${statsFile}.${process.pid}.tmp`;
fs.writeFileSync(tempFile, `${sanitized.join('\n')}\n`, { mode: 0o600 });
fs.renameSync(tempFile, statsFile);
fs.chmodSync(statsFile, 0o600);
console.log(`Sanitized ${changed} private fields from statistics events`);
