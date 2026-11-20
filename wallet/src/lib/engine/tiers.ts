import { verifyMintSignatures, type HasKeysetKeys, type Proof, type Token } from '@cashu/cashu-ts';
import { sumSats } from './money';
import { proofYs } from './ys';

export type OfflineFailure = 'foreign_mint' | 'invalid_token' | 'already_spent' | 'cap_exceeded' | 'untrusted_keyset';
export type OfflinePolicy = {
	mintUrl: string;
	pinnedKeysets: string[];
	seenYs: ReadonlySet<string>;
	capSats: bigint;
	exposureSats: bigint;
};

/** No network access. A valid signature proves issuance, never that a bearer token is unspent. */
export async function assessOffline(
	token: Token,
	policy: OfflinePolicy,
	getKeyset: (id: string) => HasKeysetKeys
): Promise<{ ok: true; amount: bigint; ys: string[] } | { ok: false; reason: OfflineFailure }> {
	if (token.mint.replace(/\/$/, '') !== policy.mintUrl.replace(/\/$/, '')) return { ok: false, reason: 'foreign_mint' };
	if ((token.unit && token.unit !== 'sat') || !token.proofs.length || token.proofs.length > 64)
		return { ok: false, reason: 'invalid_token' };
	try {
		if (token.proofs.some((p) => !policy.pinnedKeysets.includes(p.id))) return { ok: false, reason: 'untrusted_keyset' };
		const amount = sumSats(token.proofs);
		if (amount <= 0n || token.proofs.some((p) => sumSats([p]) <= 0n)) return { ok: false, reason: 'invalid_token' };
		if (amount + policy.exposureSats > policy.capSats) return { ok: false, reason: 'cap_exceeded' };
		const ys = proofYs(token.proofs);
		if (new Set(ys).size !== ys.length || ys.some((y) => policy.seenYs.has(y))) return { ok: false, reason: 'already_spent' };
		// Reject spending conditions on the bearer-only T2 path. P2PK needs a separate receiver identity.
		if (token.proofs.some((p) => /^\s*\[/.test(p.secret))) return { ok: false, reason: 'invalid_token' };
		const checked = await verifyMintSignatures(token.proofs as Proof[], getKeyset, { require: true });
		if (checked.invalid.length) return { ok: false, reason: 'invalid_token' };
		return { ok: true, amount, ys };
	} catch {
		return { ok: false, reason: 'invalid_token' };
	}
}
