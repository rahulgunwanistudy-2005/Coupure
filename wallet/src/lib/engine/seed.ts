// BIP-39 seed handling. The 12 words are the only backup; they never leave the phone unencrypted.
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export function newMnemonic(): string {
	return generateMnemonic(wordlist, 128); // 12 words
}

export function normalizeMnemonic(input: string): string {
	return input.trim().toLowerCase().split(/\s+/).join(' ');
}

export function isValidMnemonic(input: string): boolean {
	return validateMnemonic(normalizeMnemonic(input), wordlist);
}

/** 64-byte BIP-39 seed: cashu-ts derives NUT-13 deterministic secrets from it. */
export function seedFromMnemonic(mnemonic: string): Uint8Array {
	return mnemonicToSeedSync(normalizeMnemonic(mnemonic));
}
