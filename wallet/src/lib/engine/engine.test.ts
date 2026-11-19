import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyReceiveError } from './errors.ts';
import { formatSats, parseAmount, sumSats, toSats } from './money.ts';
import { isValidMnemonic, newMnemonic, normalizeMnemonic, seedFromMnemonic } from './seed.ts';
import { deriveKey, isValidPin, newSalt, open, seal, WrongPinError } from './vault.ts';
import { proofY } from './ys.ts';
import { MintOperationError, NetworkError } from '@cashu/cashu-ts';

const FAST_KDF = { N: 2 ** 4, r: 8, p: 1 }; // tests only; production uses DEFAULT_KDF (2^15)

describe('seed', () => {
	it('creates valid 12-word phrases and normalises user input', () => {
		const m = newMnemonic();
		expect(m.split(' ')).toHaveLength(12);
		expect(isValidMnemonic(`  ${m.toUpperCase().replaceAll(' ', '   ')} `)).toBe(true);
		expect(normalizeMnemonic(' A  b\nc ')).toBe('a b c');
	});
	it('rejects a bad checksum', () => {
		expect(isValidMnemonic('abandon '.repeat(12).trim())).toBe(false);
	});
	it('matches the BIP-39 test vector seed', () => {
		const seed = seedFromMnemonic('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about');
		expect(Array.from(seed, (b) => b.toString(16).padStart(2, '0')).join('')).toBe(
			'5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4'
		);
	});
});

describe('vault', () => {
	it('round-trips under the right PIN and refuses a wrong one', () => {
		const salt = newSalt();
		const sealed = seal(deriveKey('123456', salt, FAST_KDF), salt, { mnemonic: 'x', proofs: [1] }, FAST_KDF);
		expect(open(deriveKey('123456', salt, FAST_KDF), sealed)).toEqual({ mnemonic: 'x', proofs: [1] });
		expect(() => open(deriveKey('654321', salt, FAST_KDF), sealed)).toThrow(WrongPinError);
	});
	it('detects tampering', () => {
		const salt = newSalt();
		const key = deriveKey('123456', salt, FAST_KDF);
		const sealed = seal(key, salt, { a: 1 }, FAST_KDF);
		const flipped = (sealed.ct[0] === '0' ? '1' : '0') + sealed.ct.slice(1);
		expect(() => open(key, { ...sealed, ct: flipped })).toThrow(WrongPinError);
	});
	it('never stores the plaintext', () => {
		const salt = newSalt();
		const sealed = seal(deriveKey('123456', salt, FAST_KDF), salt, { mnemonic: 'abandon ability' }, FAST_KDF);
		expect(JSON.stringify(sealed)).not.toContain('abandon');
	});
	it('accepts only 6-digit PINs', () => {
		expect(isValidPin('012345')).toBe(true);
		for (const p of ['12345', '1234567', '12a456', '']) expect(isValidPin(p)).toBe(false);
	});
});

describe('money', () => {
	it('sums exactly beyond Number.MAX_SAFE_INTEGER', () => {
		expect(sumSats([{ amount: 2n ** 60n }, { amount: '1' }, { amount: 3 }])).toBe(2n ** 60n + 4n);
	});
	it('parses only positive whole amounts within the cap', () => {
		expect(parseAmount('1 500')).toBe(1500n);
		for (const bad of ['0', '-5', '1.5', 'abc', '', '2000001', '1e3']) expect(parseAmount(bad)).toBeNull();
	});
	it('formatting never changes the value (property)', () => {
		fc.assert(
			fc.property(fc.bigInt({ min: 0n, max: 2n ** 62n }), (v) => {
				expect(BigInt(formatSats(v).replace(/\D/g, ''))).toBe(v);
			})
		);
	});
	it('toSats rejects fractional or negative numbers', () => {
		expect(() => toSats(1.5)).toThrow(RangeError);
		expect(() => toSats(-1)).toThrow(RangeError);
		expect(() => toSats('12x')).toThrow(RangeError);
	});
});

describe('ys and errors', () => {
	it('Y is a compressed secp256k1 point and deterministic', () => {
		const y = proofY('407915bc212be61a77e3e6d2aeb4c727980bda51cd06a6afc29e2861768a7837');
		expect(y).toMatch(/^0[23][0-9a-f]{64}$/);
		expect(proofY('407915bc212be61a77e3e6d2aeb4c727980bda51cd06a6afc29e2861768a7837')).toBe(y);
	});
	it('classifies spent, unreachable and other failures', () => {
		expect(classifyReceiveError(new MintOperationError(11001, 'Token already spent.'))).toBe('already_spent');
		expect(classifyReceiveError(new NetworkError('offline'))).toBe('mint_unreachable');
		expect(classifyReceiveError(new TypeError('Failed to fetch'))).toBe('mint_unreachable');
		expect(classifyReceiveError(new Error('boom'))).toBe('other');
	});
});
