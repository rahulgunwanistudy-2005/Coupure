import { getPubKeyFromPrivKey, schnorrSignMessage } from '@cashu/cashu-ts';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { seedFromMnemonic } from './seed';

export type Intent = { id: string; amount: string; destination: string; created_at: number; pubkey: string; signature: string };

export function signChange(mnemonic: string, id: string): { id: string; pubkey: string; signature: string } {
	const key = sha256(concatBytes(utf8ToBytes('coupure:cashout-intent:v1\0'), seedFromMnemonic(mnemonic)));
	try { return { id, pubkey: bytesToHex(getPubKeyFromPrivKey(key)).slice(2),
		signature: schnorrSignMessage(JSON.stringify({ v: 1, id, action: 'claim-change' }), bytesToHex(key)) }; }
	finally { key.fill(0); }
}

export function signIntent(mnemonic: string, id: string, amount: bigint, destination: string): Intent {
	const key = sha256(concatBytes(utf8ToBytes('coupure:cashout-intent:v1\0'), seedFromMnemonic(mnemonic)));
	const value = { v: 1, id, amount: String(amount), destination, created_at: Date.now() };
	try {
		return { ...value, pubkey: bytesToHex(getPubKeyFromPrivKey(key)).slice(2),
			signature: schnorrSignMessage(JSON.stringify(value), bytesToHex(key)) };
	} finally { key.fill(0); }
}
