import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Amount, blindMessage, createBlindSignature, constructUnblindedSignature, createDLEQProof,
 getPubKeyFromPrivKey, pointFromBytes, type Proof, type Token, schnorrVerifyMessage } from '@cashu/cashu-ts';
import { bytesToHex } from '@noble/hashes/utils.js';
import { assessOffline, type OfflinePolicy } from './tiers';
import { proofYs } from './ys';
import { satsToXof, xofToSats } from './money';
import { signIntent } from './intent';

const ID = '00aabbccddee1122', MINT = 'http://box/mint';
// Cryptographic fixture uses the actual Cashu primitives; no mocked signature verifier.
function fixture(secretText = 'runner coin') {
 const key = new Uint8Array(32); key[31] = 7;
 const secret = new TextEncoder().encode(secretText), b = blindMessage(secret);
 const publicKey = getPubKeyFromPrivKey(key);
 const u = constructUnblindedSignature(createBlindSignature(b.B_, key, ID), b.r, secret, pointFromBytes(publicKey));
 const dleq = createDLEQProof(b.B_, key);
 const proof: Proof = { id: ID, amount: Amount.from(100), secret: secretText, C: u.C.toHex(true),
  dleq: { e: bytesToHex(dleq.e), s: bytesToHex(dleq.s), r: b.r.toString(16).padStart(64, '0') } };
 return { token: { mint: MINT, unit: 'sat', proofs: [proof] },
  keyset: { id: ID, keys: { '100': bytesToHex(publicKey) } } };
}
const policy = (extra: Partial<OfflinePolicy> = {}): OfflinePolicy => ({
 mintUrl: MINT, pinnedKeysets: [ID], seenYs: new Set(), capSats: 200n, exposureSats: 0n, ...extra
});
describe('T2 acceptance', () => {
 it('verifies a real DLEQ without any network and returns provisional identifiers', async () => {
  const f = fixture();
  const result = await assessOffline(f.token, policy(), () => f.keyset);
  expect(result).toEqual({ ok: true, amount: 100n, ys: proofYs(f.token.proofs) });
 });
 it('refuses absent and forged signatures, even within the cap', async () => {
  const f = fixture(); delete f.token.proofs[0].dleq;
  expect(await assessOffline(f.token, policy(), () => f.keyset)).toEqual({ ok: false, reason: 'invalid_token' });
  const forged = fixture(); forged.token.proofs[0].secret = 'another coin';
  expect(await assessOffline(forged.token, policy(), () => forged.keyset)).toEqual({ ok: false, reason: 'invalid_token' });
 });
 it('pins the exact mint and keyset, refuses foreign units, duplicates and already seen coins', async () => {
  const f = fixture();
  const cases = [
   [{ ...f.token, mint: 'https://other/mint' }, policy(), 'foreign_mint'],
   [f.token, policy({ pinnedKeysets: [] }), 'untrusted_keyset'],
   [{ ...f.token, unit: 'usd' }, policy(), 'invalid_token'],
   [{ ...f.token, proofs: [] }, policy(), 'invalid_token'],
   [{ ...f.token, proofs: [f.token.proofs[0], f.token.proofs[0]] }, policy(), 'already_spent'],
   [f.token, policy({ seenYs: new Set(proofYs(f.token.proofs)) }), 'already_spent']
  ] as Array<[Token, OfflinePolicy, string]>;
  for (const [token, p, reason] of cases) expect(await assessOffline(token, p, () => f.keyset)).toEqual({ ok: false, reason });
 });
 it('caps cumulative exposure, including multiple individually small receipts', async () => {
  const f = fixture();
  expect((await assessOffline(f.token, policy({ exposureSats: 100n }), () => f.keyset)).ok).toBe(true);
  expect(await assessOffline(f.token, policy({ exposureSats: 101n }), () => f.keyset)).toEqual({ ok: false, reason: 'cap_exceeded' });
  expect(await assessOffline(f.token, policy({ capSats: 0n }), () => f.keyset)).toEqual({ ok: false, reason: 'cap_exceeded' });
 });
});
describe('FCFA display and risk budgets', () => {
 it('uses the exact peg and stays safe above Number precision', () => {
  expect(satsToXof(100_000_000n, 10_000_000n)).toBe(65_595_700n);
  expect(satsToXof(2n ** 60n, 10_000_000n)).toBeGreaterThan(0n);
  expect(() => xofToSats(10n, 0n)).toThrow();
 });
 it('never converts a cap to more purchasing value than was authorized', () => {
  fc.assert(fc.property(fc.bigInt({ min: 1n, max: 2_000_000n }), fc.bigInt({ min: 1n, max: 10_000_000_000n }), (cap, price) => {
   const sats = xofToSats(cap, price);
   expect(sats * price * 655_957n).toBeLessThanOrEqual(cap * 10_000_000_000_000n);
  }));
 });
});
it('signs a domain-separated cash-out intent and rejects destination tampering', () => {
 const i = signIntent('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about', 'ab'.repeat(16), 100n, 'demo:world');
 const message = (destination: string) => JSON.stringify({ v: 1, id: i.id, amount: i.amount, destination, created_at: i.created_at });
 expect(schnorrVerifyMessage(i.signature, message(i.destination), i.pubkey)).toBe(true);
 expect(schnorrVerifyMessage(i.signature, message('other'), i.pubkey)).toBe(false);
});
