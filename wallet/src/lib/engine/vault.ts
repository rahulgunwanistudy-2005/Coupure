// PIN-sealed storage for the wallet state (seed, proofs, history).
//
// scrypt(PIN) -> 256-bit key -> AES-256-GCM, all from @noble so it works the same in a secure context
// (HTTPS) and in the plain-HTTP fallback, where crypto.subtle is unavailable. Randomness comes from
// crypto.getRandomValues, which browsers expose in insecure contexts too.
//
// A 6-digit PIN stops casual access to a lost phone, not a forensic attacker: see docs/THREAT_MODEL.md.
import { gcm } from '@noble/ciphers/aes.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export type Sealed = {
	v: 1;
	kdf: { alg: 'scrypt'; N: number; r: number; p: number; salt: string };
	nonce: string;
	ct: string;
};

export const DEFAULT_KDF = { N: 2 ** 15, r: 8, p: 1 };

export class WrongPinError extends Error {
	constructor() {
		super('wrong PIN');
	}
}

export function isValidPin(pin: string): boolean {
	return /^\d{6}$/.test(pin);
}

export function deriveKey(pin: string, saltHex: string, kdf = DEFAULT_KDF): Uint8Array {
	return scrypt(utf8ToBytes(pin), hexToBytes(saltHex), { ...kdf, dkLen: 32 });
}

export function newSalt(): string {
	return bytesToHex(randomBytes(16));
}

export function seal(key: Uint8Array, saltHex: string, data: unknown, kdf = DEFAULT_KDF): Sealed {
	const nonce = randomBytes(12);
	const ct = gcm(key, nonce).encrypt(utf8ToBytes(JSON.stringify(data)));
	return { v: 1, kdf: { alg: 'scrypt', ...kdf, salt: saltHex }, nonce: bytesToHex(nonce), ct: bytesToHex(ct) };
}

export function open<T>(key: Uint8Array, sealed: Sealed): T {
	try {
		const pt = gcm(key, hexToBytes(sealed.nonce)).decrypt(hexToBytes(sealed.ct));
		return JSON.parse(new TextDecoder().decode(pt)) as T;
	} catch {
		throw new WrongPinError(); // GCM tag mismatch: wrong key, or tampered data
	}
}
