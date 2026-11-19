// All value is integer sats (bigint). Display only is rounded. FCFA conversion lands in G2 (PriceSnapshot).
const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function sumSats(proofs: Array<{ amount: bigint | number | string | { toBigInt(): bigint } }>): bigint {
	let total = 0n;
	for (const p of proofs) total += toSats(p.amount);
	return total;
}

export function toSats(a: bigint | number | string | { toBigInt(): bigint }): bigint {
	if (typeof a === 'bigint') {
		if (a < 0n) throw new RangeError('amount must be a non-negative integer');
		return a;
	}
	if (typeof a === 'object') return toSats(a.toBigInt());
	if (typeof a === 'number') {
		if (!Number.isSafeInteger(a) || a < 0) throw new RangeError('amount must be a non-negative integer');
		return BigInt(a);
	}
	if (!/^\d+$/.test(a)) throw new RangeError('amount must be a non-negative integer');
	return BigInt(a);
}

// Exact EUR/XOF peg (655.957), with BTC/EUR expressed in euro cents. Display only.
const XOF_DENOMINATOR = 100_000_000n * 100_000n;
export function satsToXof(sats: bigint, btcEurCents: bigint): bigint {
	if (sats < 0n || btcEurCents <= 0n) throw new RangeError('invalid price or amount');
	return (sats * btcEurCents * 655_957n + XOF_DENOMINATOR / 2n) / XOF_DENOMINATOR;
}

/** Conservative cap conversion: never round up the spendable risk budget. */
export function xofToSats(xof: bigint, btcEurCents: bigint): bigint {
	if (xof < 0n || btcEurCents <= 0n) throw new RangeError('invalid price or amount');
	return (xof * XOF_DENOMINATOR) / (btcEurCents * 655_957n);
}

export function formatSats(sats: bigint): string {
	return fmt.format(sats); // Intl formats bigint exactly, with narrow no-break space groups in fr-FR
}

/** Parse a keypad entry into sats. Rejects anything that is not a positive whole number. */
export function parseAmount(input: string, max: bigint = 2_000_000n): bigint | null {
	const s = input.replace(/[\s  ]/g, '');
	if (!/^\d{1,9}$/.test(s)) return null;
	const v = BigInt(s);
	return v > 0n && v <= max ? v : null;
}
