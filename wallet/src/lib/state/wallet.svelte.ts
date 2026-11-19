// The wallet service: the only place that talks to the mint and touches proofs.
//
// T1 (this file, G1): the receiver swaps received proofs at the box's mint immediately (NUT-03). If the
// mint says they are spent, the payment is refused on the spot: no internet needed, the mint is on the LAN.
import {
	Amount,
	CheckStateEnum,
	getEncodedToken,
	MintQuoteState,
	Wallet,
	type GetInfoResponse,
	type KeyChainCache,
	type Proof
} from '@cashu/cashu-ts';
import { classifyReceiveError, type ReceiveFailure } from '#lib/engine/errors.ts';
import { sumSats } from '#lib/engine/money.ts';
import { seedFromMnemonic } from '#lib/engine/seed.ts';
import { deriveKey, newSalt, open, seal, type Sealed } from '#lib/engine/vault.ts';
import { proofYs } from '#lib/engine/ys.ts';
import { api, ApiError } from './api';
import { loadSealed, saveSealed, wipe } from './db';

type StoredProof = Omit<Proof, 'amount'> & { amount: string };

export type HistoryKind = 'topup' | 'sent' | 'received' | 'refused';
export type HistoryItem = {
	id: string;
	ts: number;
	kind: HistoryKind;
	amount: string; // sats, integer string
	status: 'pending' | 'claimed' | 'final';
	ys?: string[];
	token?: string; // sent tokens are kept so unclaimed money can be taken back (and for the fraud demo)
	stall?: string; // refused: the stall that accepted these coins first
	stallAt?: number;
};

type Persisted = {
	v: 1;
	mnemonic: string;
	mintUrl: string;
	counters: Record<string, number>;
	proofs: StoredProof[];
	history: HistoryItem[];
	stall: string | null;
	seenYs: string[];
	pendingReceipts: Array<{ stall: string; ys: string[]; tries: number }>;
	mintCache: { info: GetInfoResponse; keychain: KeyChainCache } | null;
};

export type ReceiveResult =
	| { ok: true; amount: bigint; at: number }
	| { ok: false; reason: ReceiveFailure; stall?: string; stallAt?: number };

export function mintUrlForOrigin(origin: string): string {
	return `${origin.replace(/\/$/, '')}/mint`;
}

function hydrate(p: StoredProof): Proof {
	return { ...p, amount: Amount.from(p.amount) };
}

function store(p: Proof): StoredProof {
	return JSON.parse(JSON.stringify(p)) as StoredProof; // Amount serialises to a decimal string
}

function rid(): string {
	const b = new Uint8Array(8);
	crypto.getRandomValues(b);
	return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

class WalletApp {
	phase = $state<'loading' | 'new' | 'locked' | 'ready'>('loading');
	data = $state<Persisted | null>(null);
	balance = $derived(this.data ? sumSats(this.data.proofs) : 0n);

	#key: Uint8Array | null = null;
	#salt = '';
	#wallet: Wallet | null = null;
	#saving: Promise<void> = Promise.resolve();
	#watching = new Set<string>();
	#flushing = false;

	async init(): Promise<void> {
		this.phase = (await loadSealed()) ? 'locked' : 'new';
	}

	// ---------------------------------------------------------------- vault
	async create(mnemonic: string, pin: string): Promise<void> {
		this.#salt = newSalt();
		this.#key = deriveKey(pin, this.#salt);
		this.data = {
			v: 1,
			mnemonic,
			mintUrl: mintUrlForOrigin(location.origin),
			counters: {},
			proofs: [],
			history: [],
			stall: null,
			seenYs: [],
			pendingReceipts: [],
			mintCache: null
		};
		await this.#persist();
		this.phase = 'ready';
	}

	async unlock(pin: string): Promise<boolean> {
		const sealed = await loadSealed();
		if (!sealed) return false;
		const key = deriveKey(pin, sealed.kdf.salt, { N: sealed.kdf.N, r: sealed.kdf.r, p: sealed.kdf.p });
		try {
			this.data = open<Persisted>(key, sealed);
		} catch {
			return false;
		}
		this.#key = key;
		this.#salt = sealed.kdf.salt;
		this.data!.pendingReceipts ??= [];
		this.phase = 'ready';
		void this.refreshPending();
		void this.flushReceipts();
		return true;
	}

	lock(): void {
		this.#key?.fill(0);
		this.#key = null;
		this.data = null;
		this.#wallet = null;
		this.#watching.clear();
		this.phase = 'locked';
	}

	async erase(): Promise<void> {
		this.lock();
		await wipe();
		this.phase = 'new';
	}

	#persist(): Promise<void> {
		const key = this.#key;
		const snapshot = $state.snapshot(this.data);
		if (!key || !snapshot) return this.#saving;
		const sealed: Sealed = seal(key, this.#salt, snapshot);
		this.#saving = this.#saving.then(() => saveSealed(sealed));
		return this.#saving;
	}

	// ---------------------------------------------------------------- mint connection
	async #w(): Promise<Wallet> {
		if (this.#wallet) return this.#wallet;
		const d = this.data;
		if (!d) throw new Error('locked');
		const w = new Wallet(d.mintUrl, {
			unit: 'sat',
			bip39seed: seedFromMnemonic(d.mnemonic),
			counterInit: { ...d.counters }
		});
		try {
			await w.loadMint();
			d.mintCache = { info: w.getMintInfo().cache, keychain: w.keyChain.cache };
		} catch (e) {
			if (!d.mintCache) throw e;
			w.loadMintFromCache(d.mintCache.info, d.mintCache.keychain); // offline start (T2 path, G2)
		}
		w.on.countersReserved(({ keysetId, next }) => {
			if (!this.data) return;
			this.data.counters[keysetId] = Math.max(this.data.counters[keysetId] ?? 0, next);
			void this.#persist();
		});
		this.#wallet = w;
		return w;
	}

	// ---------------------------------------------------------------- top-up over Lightning (NUT-04)
	async createTopup(amount: bigint): Promise<{ quote: string; request: string }> {
		const w = await this.#w();
		const q = await w.createMintQuoteBolt11(amount);
		return { quote: q.quote, request: q.request };
	}

	/** Resolves once the quote is paid (NUT-17 push) and the ecash is minted. */
	async completeTopup(quote: string, amount: bigint, signal?: AbortSignal): Promise<bigint> {
		const w = await this.#w();
		const current = await w.checkMintQuoteBolt11(quote);
		if (current.state === MintQuoteState.UNPAID) {
			await w.on.onceMintPaid(quote, { signal, timeoutMs: 10 * 60_000 });
		}
		const proofs = await w.mintProofsBolt11(amount, quote);
		this.data!.proofs.push(...proofs.map(store));
		this.data!.history.unshift({ id: rid(), ts: Date.now(), kind: 'topup', amount: String(amount), status: 'final' });
		await this.#persist();
		return sumSats(proofs);
	}

	// ---------------------------------------------------------------- pay
	async pay(amount: bigint): Promise<{ token: string; id: string }> {
		const w = await this.#w();
		const d = this.data!;
		if (this.balance < amount) throw new Error('insufficient');
		const { keep, send } = await w.send(amount, d.proofs.map(hydrate), { includeFees: true });
		const token = getEncodedToken({ mint: d.mintUrl, proofs: send, unit: 'sat' });
		const item: HistoryItem = {
			id: rid(),
			ts: Date.now(),
			kind: 'sent',
			amount: String(amount),
			status: 'pending',
			ys: proofYs(send),
			token
		};
		d.proofs = keep.map(store);
		d.history.unshift(item);
		await this.#persist();
		void this.#watchClaim(item.id, send);
		return { token, id: item.id };
	}

	/** NUT-17: flip a sent payment to "claimed" the moment the vendor swaps it. */
	async #watchClaim(id: string, proofs: Proof[]): Promise<void> {
		if (this.#watching.has(id)) return;
		this.#watching.add(id);
		const w = await this.#w();
		const ys = new Set<string>();
		const cancel = await w.on.proofStateUpdates(
			proofs,
			(s) => {
				if (s.state !== CheckStateEnum.SPENT) return;
				ys.add(s.Y);
				if (ys.size === proofs.length) {
					this.#markClaimed(id);
					cancel();
				}
			},
			() => this.#watching.delete(id)
		);
	}

	#markClaimed(id: string): void {
		const item = this.data?.history.find((h) => h.id === id);
		if (item && item.status !== 'claimed') {
			item.status = 'claimed';
			void this.#persist();
		}
	}

	/** On unlock: check sent payments still pending (NUT-07) and re-subscribe to the rest. */
	async refreshPending(): Promise<void> {
		const pending = this.data?.history.filter((h) => h.kind === 'sent' && h.status === 'pending' && h.token) ?? [];
		if (!pending.length) return;
		try {
			const w = await this.#w();
			for (const item of pending) {
				const proofs = w.decodeToken(item.token!).proofs;
				const states = await w.checkProofsStates(proofs);
				if (states.every((s) => s.state === CheckStateEnum.SPENT)) this.#markClaimed(item.id);
				else void this.#watchClaim(item.id, proofs);
			}
		} catch {
			/* box unreachable: try again next time */
		}
	}

	pollClaimed(id: string): boolean {
		return this.data?.history.find((h) => h.id === id)?.status === 'claimed';
	}

	// ---------------------------------------------------------------- receive (T1)
	async receive(tokenStr: string): Promise<ReceiveResult> {
		const d = this.data!;
		const token = tokenStr.trim();
		let w: Wallet;
		try {
			w = await this.#w();
		} catch (e) {
			return { ok: false, reason: classifyReceiveError(e) === 'other' ? 'mint_unreachable' : classifyReceiveError(e) };
		}
		let decoded;
		try {
			decoded = w.decodeToken(token);
		} catch {
			return { ok: false, reason: 'invalid_token' };
		}
		if (decoded.mint.replace(/\/$/, '') !== d.mintUrl) return { ok: false, reason: 'foreign_mint' };
		const ys = proofYs(decoded.proofs);
		const amount = sumSats(decoded.proofs);

		try {
			// requireDleq: the mint's signature on every proof is checked locally before the swap (NUT-12)
			const proofs = await w.receive(token, { requireDleq: true });
			const at = Date.now();
			d.proofs.push(...proofs.map(store));
			d.seenYs.push(...ys);
			d.history.unshift({ id: rid(), ts: at, kind: 'received', amount: String(amount), status: 'final', ys });
			await this.#persist();
			if (d.stall) {
				d.pendingReceipts.push({ stall: d.stall, ys, tries: 0 });
				await this.#persist();
				void this.flushReceipts();
			}
			return { ok: true, amount: sumSats(proofs), at };
		} catch (e) {
			const reason = classifyReceiveError(e);
			if (reason !== 'already_spent') return { ok: false, reason };
			let stall: string | undefined;
			let stallAt: number | undefined;
			try {
				const found = Object.values((await api.lookupReceipts(ys)).found)[0];
				if (found) [stall, stallAt] = [found.stall, Math.round(found.ts * 1000)];
			} catch {
				/* attribution is best effort; the refusal is not */
			}
			d.history.unshift({
				id: rid(),
				ts: Date.now(),
				kind: 'refused',
				amount: String(amount),
				status: 'final',
				ys,
				stall,
				stallAt
			});
			await this.#persist();
			return { ok: false, reason, stall, stallAt };
		}
	}

	// ---------------------------------------------------------------- restore (NUT-09 + NUT-13)
	async restore(mnemonic: string, pin: string): Promise<bigint> {
		await this.create(mnemonic, pin);
		const w = await this.#w();
		const { proofs, lastCounterWithSignature } = await w.batchRestore();
		const unspent: Proof[] = [];
		if (proofs.length) {
			const states = await w.checkProofsStates(proofs);
			proofs.forEach((p, i) => {
				if (states[i]?.state === CheckStateEnum.UNSPENT) unspent.push(p);
			});
		}
		if (lastCounterWithSignature !== undefined) {
			await w.counters.advanceToAtLeast(w.keysetId, lastCounterWithSignature + 1);
			this.data!.counters[w.keysetId] = lastCounterWithSignature + 1;
		}
		this.data!.proofs = unspent.map(store);
		await this.#persist();
		return sumSats(unspent);
	}

	/** Tell the box which stall accepted which coins. Queued and retried: the vendor may be out of range. */
	async flushReceipts(): Promise<void> {
		const d = this.data;
		if (!d || this.#flushing) return;
		this.#flushing = true;
		try {
			for (let round = 0; round < 4 && d.pendingReceipts.length; round++) {
				if (round) await new Promise((r) => setTimeout(r, 1000 * 2 ** round));
				for (const item of [...d.pendingReceipts]) {
					try {
						await api.registerReceipt(item.stall, item.ys);
						d.pendingReceipts = d.pendingReceipts.filter((x) => x !== item);
					} catch (e) {
						item.tries++;
						// 409 means "not spent" (should not happen after our own swap); give up after a few tries
						if (item.tries >= 8 || (e instanceof ApiError && e.status === 422)) {
							d.pendingReceipts = d.pendingReceipts.filter((x) => x !== item);
						}
					}
				}
				await this.#persist();
			}
		} finally {
			this.#flushing = false;
		}
	}

	async setStall(stall: string | null): Promise<void> {
		this.data!.stall = stall;
		await this.#persist();
	}
}

export const app = new WalletApp();
