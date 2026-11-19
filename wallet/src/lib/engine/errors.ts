// Map mint/network failures to the few outcomes the UI must distinguish.
import { isMintOperationError, NetworkError } from '@cashu/cashu-ts';

export type ReceiveFailure = 'already_spent' | 'mint_unreachable' | 'foreign_mint' | 'invalid_token' | 'other';

// NUT error codes (cashubtc/nuts error_codes.md): 11001 proofs already spent, 11002 proofs pending.
const SPENT_CODES = new Set([11001]);

export function classifyReceiveError(e: unknown): ReceiveFailure {
	if (isMintOperationError(e) && SPENT_CODES.has(e.code)) return 'already_spent';
	if (e instanceof NetworkError) return 'mint_unreachable';
	if (e instanceof TypeError && /fetch|network/i.test(e.message)) return 'mint_unreachable';
	const msg = e instanceof Error ? e.message : String(e);
	if (/already spent|token already spent/i.test(msg)) return 'already_spent';
	if (/decode|invalid token|unsupported token/i.test(msg)) return 'invalid_token';
	return 'other';
}
