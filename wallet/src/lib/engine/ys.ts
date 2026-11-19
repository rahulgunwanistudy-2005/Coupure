// Y = hash_to_curve(secret): the public identifier of a proof (NUT-00/NUT-07). Used for the local seen-set,
// state checks and receipts. It reveals nothing that lets anyone spend the proof.
import { hashToCurve } from '@cashu/cashu-ts';

export function proofY(secret: string): string {
	return hashToCurve(new TextEncoder().encode(secret)).toHex(true);
}

export function proofYs(proofs: Array<{ secret: string }>): string[] {
	return proofs.map((p) => proofY(p.secret));
}
