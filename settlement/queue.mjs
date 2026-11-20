import { createHash, randomBytes } from 'node:crypto';
import {
  Wallet, Amount, serializeSwapPreview, deserializeSwapPreview,
  MeltQuoteState, schnorrVerifyMessage, getEncodedToken
} from '@cashu/cashu-ts';

export const total = (ps) => ps.reduce((n, p) => n + BigInt(p.amount), 0n);
const hydrate = (ps) => ps.map((p) => ({ ...p, amount: Amount.from(p.amount) }));
const serial = (v) => JSON.parse(JSON.stringify(v));
export const intentMessage = (v) => JSON.stringify({
  v: 1, id: v.id, amount: v.amount, destination: v.destination, created_at: v.created_at
});

/** Durable custodial sweep wallet. All mutations are serialized, including counter reservations. */
export class CashOutQueue {
  constructor(store, mintUrl, { walletFactory, now = () => Date.now() } = {}) {
    this.store = store; this.mintUrl = mintUrl; this.now = now;
    this.walletFactory = walletFactory || ((opts) => new Wallet(mintUrl, opts));
    this.serial = Promise.resolve(); this.wallet = null;
  }
  async init() {
    this.data = await this.store.load({ v: 1, seed: randomBytes(64).toString('hex'), counters: {}, jobs: [] });
    await this.save();
  }
  save() { return this.store.save(this.data); }
  exclusive(fn) {
    const job = this.serial.then(fn);
    this.serial = job.catch(() => {});
    return job;
  }
  async w() {
    if (!this.wallet) {
      const w = this.walletFactory({ unit: 'sat', bip39seed: Uint8Array.from(Buffer.from(this.data.seed, 'hex')),
        counterSource: {
          reserve: async (id, count) => {
            const start = this.data.counters[id] || 0;
            if (count) { this.data.counters[id] = start + count; await this.save(); }
            return { start, count };
          },
          advanceToAtLeast: async (id, next) => {
            this.data.counters[id] = Math.max(this.data.counters[id] || 0, next); await this.save();
          }
        }
      });
      await w.loadMint(); this.wallet = w;
    }
    return this.wallet;
  }
  view(job) {
    return { id: job.id, amount: job.amount, state: job.state, created_at: job.created_at,
      attempts: job.attempts, next_at: job.next_at, error: job.error || null,
      settled_at: job.settled_at || null, change_sat: String(total(job.change || [])) };
  }
  summary() {
    return { pending: this.data.jobs.filter((j) => j.state !== 'SETTLED').length,
      settled: this.data.jobs.filter((j) => j.state === 'SETTLED').length,
      held_sat: String(this.data.jobs.reduce((s, j) => s + total(j.proofs || []) + total(j.change || []) + total(j.paymentProofs || []), 0n)) };
  }
  lookup(id, pubkey) {
    const j = this.data.jobs.find((j) => j.id === id && j.pubkey === pubkey);
    return j ? this.view(j) : null;
  }
  claimChange(body, publicMint) {
    return this.exclusive(async () => {
      const message = JSON.stringify({ v: 1, id: body.id, action: 'claim-change' });
      if (!schnorrVerifyMessage(body.signature, message, body.pubkey)) throw new Error('invalid signature');
      const j = this.data.jobs.find((x) => x.id === body.id && x.pubkey === body.pubkey);
      if (!j || j.state !== 'SETTLED') throw new Error('not settled');
      if (!j.changeToken && j.change.length) {
        j.changeToken = getEncodedToken({ mint: publicMint, unit: 'sat', proofs: hydrate(j.change) });
        j.change = []; await this.save();
      }
      return { token: j.changeToken || null };
    });
  }
  enqueue(intent, token, publicMint = this.mintUrl) {
    return this.exclusive(async () => {
      if (!schnorrVerifyMessage(intent.signature, intentMessage(intent), intent.pubkey)) throw new Error('invalid signature');
      const digest = createHash('sha256').update(intentMessage(intent) + token).digest('hex');
      const old = this.data.jobs.find((j) => j.id === intent.id);
      if (old) {
        if (old.digest !== digest || old.pubkey !== intent.pubkey) throw new Error('idempotency conflict');
        if (old.state === 'RECEIVING') await this.finishReceive(old);
        return this.view(old);
      }
      // Long shutdowns must not expire an unsubmitted, signed intention. The ID and spent proofs
      // prevent replay; reject timestamps from the future rather than imposing a short WAN deadline.
      if (intent.created_at > this.now() + 5 * 60_000) throw new Error('future intent');
      if (this.data.jobs.filter((j) => j.state !== 'SETTLED').length >= 500) throw new Error('queue full');
      const w = await this.w();
      const decoded = w.decodeToken(token);
      // The gateway rewrites only the mint origin. Unknown mint tokens are refused before any swap.
      if (decoded.mint.replace(/\/$/, '') !== publicMint.replace(/\/$/, '') ||
          decoded.unit !== 'sat' || decoded.proofs.length > 64 || total(decoded.proofs) !== BigInt(intent.amount))
        throw new Error('invalid token or amount');
      const preview = await w.prepareSwapToReceive(decoded.proofs, { requireDleq: true });
      const job = { ...intent, digest, state: 'RECEIVING', preview: serializeSwapPreview(preview),
        proofs: [], change: [], attempts: 0, next_at: 0 };
      this.data.jobs.push(job);
      await this.save(); // exact outputs are recoverable if the response is lost (NUT-19)
      await this.finishReceive(job);
      return this.view(job);
    });
  }
  async finishReceive(job) {
    const w = await this.w();
    const result = await w.completeSwap(deserializeSwapPreview(job.preview));
    job.proofs = serial(result.keep);
    job.preview = null; job.state = 'QUEUED';
    await this.save();
  }
  drain(invoiceFor) {
    return this.exclusive(async () => {
      for (const job of this.data.jobs) {
        if (job.state === 'SETTLED' || job.next_at > this.now()) continue;
        try {
          if (job.state === 'RECEIVING') await this.finishReceive(job);
          await this.settle(job, invoiceFor);
          job.error = null;
        } catch {
          job.attempts++;
          job.error = 'settlement_pending'; // never retain raw errors containing tokens or invoices
          job.next_at = this.now() + Math.min(300_000, 2000 * 2 ** Math.min(job.attempts, 7));
        }
        await this.save();
      }
      return this.summary();
    });
  }
  async settle(job, invoiceFor) {
    const w = await this.w();
    if (job.quote) {
      const current = await w.checkMeltQuoteBolt11(job.quote.quote);
      if (current.state === MeltQuoteState.PAID) {
        // A lost payment response must never cause a second invoice/payment.
        job.state = 'SETTLED'; job.proofs = []; job.paymentProofs = []; job.settled_at = this.now(); return;
      }
      if (current.state === MeltQuoteState.PENDING) return;
      // Never create a second quote for an expired intent automatically: operator review is required.
      if (current.expiry * 1000 <= this.now()) throw new Error('expired quote');
    } else {
      const invoice = await invoiceFor(job);
      const quote = await w.createMeltQuoteBolt11(invoice);
      // The intent amount is the total debit. Destination + max routing reserve may not exceed it.
      if (BigInt(quote.amount) <= 0n || BigInt(quote.amount) + BigInt(quote.fee_reserve) > total(job.proofs))
        throw new Error('invoice exceeds funds');
      job.quote = serial(quote); job.state = 'PAYING'; await this.save();
    }
    // No blank change outputs: makes crash recovery unambiguous; unused routing reserve is forfeited.
    // Principal above invoice + reserve stays as separate bearer proofs, never silently destroyed.
    if (!job.paymentProofs) {
      const amount = BigInt(job.quote.amount) + BigInt(job.quote.fee_reserve);
      const preview = job.sendPreview ? deserializeSwapPreview(job.sendPreview)
        : await w.prepareSwapToSend(amount, hydrate(job.proofs));
      job.sendPreview = serializeSwapPreview(preview); await this.save();
      const split = await w.completeSwap(preview);
      job.paymentProofs = serial(split.send); job.change = serial(split.keep);
      job.proofs = []; job.sendPreview = null; await this.save();
    }
    const q = { ...job.quote, amount: Amount.from(job.quote.amount), fee_reserve: Amount.from(job.quote.fee_reserve) };
    const result = await w.meltProofsBolt11(q, hydrate(job.paymentProofs), { nut08Change: false });
    if (result.quote.state !== MeltQuoteState.PAID) return;
    job.state = 'SETTLED'; job.paymentProofs = []; job.settled_at = this.now();
  }
}
