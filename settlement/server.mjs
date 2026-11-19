import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { CashOutQueue } from './queue.mjs';
import { Store } from './store.mjs';

const key = process.env.QUEUE_KEY || '';
const token = process.env.QUEUE_TOKEN || '';
if (token.length < 24) throw new Error('QUEUE_TOKEN must have at least 24 characters');
const queue = new CashOutQueue(new Store('/data/queue.json', key), process.env.MINT_URL || 'http://nutshell:3338');
await queue.init();

function authorized(req) {
  const supplied = Buffer.from(req.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function invoiceFor(job) {
  if (job.destination !== 'demo:world') return job.destination;
  if (process.env.DEMO_MODE !== '1') throw new Error('demo disabled');
  // A demo receiver lives on the WAN side. Reserve at most 2% (minimum 3 sats) for route fees.
  const amount = BigInt(job.amount), fee = amount / 50n > 3n ? amount / 50n : 3n;
  const r = await fetch('http://uplink:8090/invoice', { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amount_sat: Number(amount - fee) }),
    signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('invoice unavailable');
  return (await r.json()).payment_request;
}

createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.url === '/health' && req.method === 'GET') return reply(200, { ok: true });
  if (!authorized(req)) return reply(401, { detail: 'unauthorized' });
  let raw = '';
  try {
    for await (const b of req) {
      raw += b.toString();
      if (Buffer.byteLength(raw) > 32_768) return reply(413, { detail: 'body too large' });
    }
    const body = raw ? JSON.parse(raw) : {};
    if (req.url === '/enqueue' && req.method === 'POST') {
      const i = body.intent;
      if (!i || !/^[0-9a-f]{32}$/.test(i.id) || !/^[0-9]{1,7}$/.test(i.amount) ||
          BigInt(i.amount) < 10n || BigInt(i.amount) > 2_000_000n ||
          !/^(lnbcrt[0-9a-z]{20,1800}|demo:world)$/.test(i.destination) ||
          !/^[0-9a-f]{64}$/.test(i.pubkey) || !/^[0-9a-f]{128}$/.test(i.signature) ||
          !Number.isSafeInteger(i.created_at) || typeof body.token !== 'string')
        return reply(422, { detail: 'invalid intent' });
      if (i.destination === 'demo:world' && process.env.DEMO_MODE !== '1') return reply(422, { detail: 'demo disabled' });
      return reply(200, await queue.enqueue(i, body.token, body.publicMint));
    }
    if (req.url === '/drain' && req.method === 'POST') return reply(200, await queue.drain(invoiceFor));
    if (req.url === '/change' && req.method === 'POST') return reply(200, await queue.claimChange(body, body.publicMint));
    if (req.url === '/summary' && req.method === 'GET') return reply(200, queue.summary());
    if (req.url === '/lookup' && req.method === 'POST') {
      const value = queue.lookup(body.id, body.pubkey);
      return reply(value ? 200 : 404, value || { detail: 'not found' });
    }
    return reply(404, { detail: 'not found' });
  } catch {
    // Do not leak a library error: it may contain bearer proofs or an invoice.
    return reply(409, { detail: 'cashout not confirmed; retry the same intent' });
  }
}).listen(8000, '0.0.0.0');
