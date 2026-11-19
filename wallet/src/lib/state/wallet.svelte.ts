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
	deserializeSwapPreview,
	serializeSwapPreview,
	type SerializedSwapPreview,
	type GetInfoResponse,
	type KeyChainCache,
	type Proof
} from '@cashu/cashu-ts';
import { classifyReceiveError, type ReceiveFailure } from '#lib/engine/errors.ts';
import { sumSats } from '#lib/engine/money.ts';
import { seedFromMnemonic } from '#lib/engine/seed.ts';
import { deriveKey, newSalt, open, seal, type Sealed } from '#lib/engine/vault.ts';
import { proofYs } from '#lib/engine/ys.ts';
import { assessOffline } from '#lib/engine/tiers.ts';
import { signIntent, signChange, type Intent } from '#lib/engine/intent.ts';
import { xofToSats } from '#lib/engine/money.ts';
import { api, ApiError } from './api';
import { loadSealed, loadVault, saveSealed, wipe, VaultConflict } from './db';

type StoredProof = Omit<Proof, 'amount'> & { amount: string };

export type HistoryKind = 'topup' | 'sent' | 'received' | 'refused' | 'cashout';
export type HistoryItem = {
	id: string;
	ts: number;
	kind: HistoryKind;
	amount: string; // sats, integer string
	status: 'pending' | 'claimed' | 'final' | 'provisional' | 'fraud' | 'queued' | 'settled';
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
	pinnedKeysets: string[];
	t2CapXof: string;
	price: { btc_eur_cents: string; ts: number } | null;
	provisional: Array<{ id: string; token: string; amount: string; ys: string[] }>;
	cashouts: Array<{ intent: Intent; token: string; state: string; changeClaimed?: boolean }>;
	receiveJournal: Record<string, SerializedSwapPreview>;
	pendingSend: { id: string; amount: string; preview: SerializedSwapPreview } | null;
};

export type ReceiveResult =
	| { ok: true; amount: bigint; at: number; provisional?: boolean }
	| { ok: false; reason: ReceiveFailure | 'cap_exceeded' | 'untrusted_keyset'; stall?: string; stallAt?: number };

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
	exposure = $derived(this.data ? this.data.provisional.reduce((n, p) => n + BigInt(p.amount), 0n) : 0n);

	#key: Uint8Array | null = null;
	#salt = '';
	#wallet: Wallet | null = null;
	#saving: Promise<void> = Promise.resolve();
	#watching = new Set<string>();
	#flushing = false;
	#syncing = false;
	#connecting: Promise<Wallet> | null = null;
	#mutating = false;
	#cancellations: Array<() => void> = [];
	#unlockFailures = 0;
	#blockedUntil = 0;
	#revision = 0;
	#epoch = 0;

	async init(): Promise<void> {
		this.phase = (await loadSealed()) ? 'locked' : 'new';
	}

	// ---------------------------------------------------------------- vault
	async create(mnemonic: string, pin: string): Promise<void> {
		const vault = await loadVault();
		if (vault.sealed) throw new Error('wallet already exists');
		this.#revision = vault.revision;
		this.#epoch++;
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
			,pinnedKeysets: [], t2CapXof: '2000', price: null, provisional: [], cashouts: [], receiveJournal: {}, pendingSend: null
		};
		await this.#persist();
		this.phase = 'ready';
		void this.sync();
	}

	async unlock(pin: string): Promise<boolean> {
		if (Date.now() < this.#blockedUntil) return false;
		const { sealed, revision } = await loadVault();
		if (!sealed) return false;
		this.#revision = revision;
		const key = deriveKey(pin, sealed.kdf.salt, { N: sealed.kdf.N, r: sealed.kdf.r, p: sealed.kdf.p });
		try {
			this.data = open<Persisted>(key, sealed);
		} catch {
			key.fill(0);
			this.#unlockFailures++;
			this.#blockedUntil = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(this.#unlockFailures, 6));
			return false;
		}
		this.#key = key;
		this.#epoch++;
		this.#salt = sealed.kdf.salt;
		this.data!.pendingReceipts ??= [];
		this.data!.pinnedKeysets ??= [];
		this.data!.t2CapXof ??= '2000';
		this.data!.price ??= null;
		this.data!.provisional ??= [];
		this.data!.cashouts ??= [];
		this.data!.receiveJournal ??= {};
		this.data!.pendingSend ??= null;
		this.#unlockFailures = 0;
		this.phase = 'ready';
		void this.refreshPending();
		void this.flushReceipts();
		void this.sync();
		return true;
	}

	lock(): void {
		this.#epoch++;
		for (const cancel of this.#cancellations.splice(0)) cancel();
		this.#key?.fill(0);
		this.#key = null;
		this.data = null;
		this.#wallet = null;
		this.#watching.clear();
		this.phase = 'locked';
	}

	async erase(): Promise<void> {
		if (this.#mutating || this.#syncing) throw new Error('busy');
		await this.#saving;
		await wipe(this.#revision);
		this.lock();
		this.phase = 'new';
	}

	#persist(): Promise<void> {
		const key = this.#key;
		const snapshot = $state.snapshot(this.data);
		if (!key || !snapshot) return this.#saving;
		const sealed: Sealed = seal(key, this.#salt, snapshot);
		const epoch = this.#epoch;
		const write = async () => {
			if (epoch !== this.#epoch) throw new Error('wallet locked before storage write');
			try { this.#revision = await saveSealed(sealed, this.#revision); }
			catch (e) { if (e instanceof VaultConflict) this.lock(); throw e; }
		};
		this.#saving = this.#saving.then(write, write);
		return this.#saving;
	}

	// ---------------------------------------------------------------- mint connection
	async #w(): Promise<Wallet> {
		if (this.#wallet) return this.#wallet;
		if (this.#connecting) return this.#connecting;
		this.#connecting = this.#connect();
		try { return await this.#connecting; } finally { this.#connecting = null; }
	}

	async #connect(): Promise<Wallet> {
		const d = this.data;
		if (!d) throw new Error('locked');
		const w = new Wallet(d.mintUrl, {
			unit: 'sat',
			bip39seed: seedFromMnemonic(d.mnemonic),
			counterSource: {
				reserve: async (id, count) => {
					if (this.data !== d) throw new Error('locked');
					const start = d.counters[id] ?? 0;
					if (count) { d.counters[id] = start + count; await this.#persist(); }
					return { start, count };
				},
				advanceToAtLeast: async (id, next) => {
					d.counters[id] = Math.max(d.counters[id] ?? 0, next); await this.#persist();
				}
			}
		});
		try {
			await w.loadMint();
			d.mintCache = { info: w.getMintInfo().cache, keychain: w.keyChain.cache };
			if (!d.pinnedKeysets.length) d.pinnedKeysets = w.keyChain.getKeysets().map((k) => k.id);
			await this.#persist();
		} catch (e) {
			if (!d.mintCache) throw e;
			w.loadMintFromCache(d.mintCache.info, d.mintCache.keychain); // offline start (T2 path, G2)
		}
		if (this.data !== d) throw new Error('locked');
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
		const d = this.data;
		if (!d) throw new Error('locked');
		const w = await this.#w();
		const current = await w.checkMintQuoteBolt11(quote);
		if (current.state === MintQuoteState.UNPAID) {
			await w.on.onceMintPaid(quote, { signal, timeoutMs: 10 * 60_000 });
		}
		// Waiting for an invoice must not lock payments. Claiming it must serialize with spending,
		// otherwise a send's saved `keep` could overwrite coins minted during that send.
		while (this.#mutating) {
			if (signal?.aborted || this.data !== d) throw new Error('topup cancelled');
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		if (this.data !== d || signal?.aborted) throw new Error('topup cancelled');
		this.#mutating = true;
		try {
			if (d.history.some((h) => h.id === `topup:${quote}`)) return amount;
			const proofs = await w.mintProofsBolt11(amount, quote);
			d.proofs.push(...proofs.map(store));
			d.history.unshift({ id: `topup:${quote}`, ts: Date.now(), kind: 'topup', amount: String(amount), status: 'final' });
			await this.#persist();
			return sumSats(proofs);
		} finally { this.#mutating = false; }
	}

	// ---------------------------------------------------------------- pay
	async pay(amount: bigint): Promise<{ token: string; id: string }> {
		if (this.#mutating) throw new Error('busy');
		this.#mutating = true;
		try { return await this.#pay(amount); } finally { this.#mutating = false; }
	}

	async #pay(amount: bigint): Promise<{ token: string; id: string }> {
		const w = await this.#w();
		const d = this.data!;
		if (d.pendingSend) throw new Error('recover pending payment first');
		if (amount <= 0n || this.balance < amount) throw new Error('insufficient');
		// Prefer existing denominations: this works even out of range. Never retry a failed online
		// swap with different outputs: an ambiguous request may already have spent its inputs.
		const offline = w.sendOffline(amount, d.proofs.map(hydrate), { requireDleq: true });
		let result = offline;
		if (!offline.send.length) {
			const preview = await w.prepareSwapToSend(amount, d.proofs.map(hydrate), { includeFees: true });
			d.pendingSend = { id: rid(), amount: String(amount), preview: serializeSwapPreview(preview) };
			await this.#persist();
			result = await w.completeSwap(preview);
		}
		const { keep, send } = result;
		const token = getEncodedToken({ mint: d.mintUrl, proofs: send, unit: 'sat' });
		const item: HistoryItem = {
			id: d.pendingSend?.id ?? rid(),
			ts: Date.now(),
			kind: 'sent',
			amount: String(amount),
			status: 'pending',
			ys: proofYs(send),
			token
		};
		d.proofs = keep.map(store);
		d.pendingSend = null;
		d.history.unshift(item);
		await this.#persist();
		void this.#watchClaim(item.id, send).catch(() => this.#watching.delete(item.id));
		return { token, id: item.id };
	}

	/** NUT-17: flip a sent payment to "claimed" the moment the vendor swaps it. */
	async #watchClaim(id: string, proofs: Proof[]): Promise<void> {
		if (this.#watching.has(id)) return;
		this.#watching.add(id);
		const w = await this.#w();
		const ys = new Set<string>();
		let cancel = () => {};
		cancel = await w.on.proofStateUpdates(
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
		this.#cancellations.push(cancel);
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
	async #swapReceive(w: Wallet, token: string): Promise<Proof[]> {
		const d = this.data!;
		const id = proofYs(w.decodeToken(token).proofs)[0];
		const preview = d.receiveJournal[id] ? deserializeSwapPreview(d.receiveJournal[id])
			: await w.prepareSwapToReceive(token, { requireDleq: true });
		d.receiveJournal[id] = serializeSwapPreview(preview);
		await this.#persist();
		try {
			const result = await w.completeSwap(preview);
			delete d.receiveJournal[id];
			return result.keep;
		} catch (e) {
			if (classifyReceiveError(e) === 'already_spent') { delete d.receiveJournal[id]; await this.#persist(); }
			throw e;
		}
	}
	async receive(tokenStr: string, allowProvisional = false): Promise<ReceiveResult> {
		if (this.#mutating) return { ok: false, reason: 'other' };
		this.#mutating = true;
		try { return await this.#receive(tokenStr, allowProvisional); } finally { this.#mutating = false; }
	}

	async #receive(tokenStr: string, allowProvisional: boolean): Promise<ReceiveResult> {
		const d = this.data!;
		const token = tokenStr.trim();
		if (token.length > 12000) return { ok: false, reason: 'invalid_token' };
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
			const proofs = await this.#swapReceive(w, token);
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
			if (reason === 'mint_unreachable' && allowProvisional) return this.#acceptProvisional(token, w);
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
	async #acceptProvisional(token: string, w: Wallet): Promise<ReceiveResult> {
		const d = this.data!;
		if (!d.price || !d.mintCache) return { ok: false, reason: 'untrusted_keyset' };
		const checked = await assessOffline(w.decodeToken(token), {
			mintUrl: d.mintUrl, pinnedKeysets: d.pinnedKeysets, seenYs: new Set(d.seenYs),
			capSats: xofToSats(BigInt(d.t2CapXof), BigInt(d.price.btc_eur_cents)), exposureSats: this.exposure
		}, (id) => w.keyChain.getKeyset(id));
		if (!checked.ok) return checked;
		const id = rid(), at = Date.now();
		d.provisional.push({ id, token, amount: String(checked.amount), ys: checked.ys });
		d.seenYs.push(...checked.ys);
		d.history.unshift({ id, ts: at, kind: 'received', amount: String(checked.amount), status: 'provisional', ys: checked.ys });
		await this.#persist();
		return { ok: true, amount: checked.amount, at, provisional: true };
	}

	/** Return-to-box reconciliation is independent of the box's WAN state. */
	async sync(): Promise<void> {
		const d = this.data;
		if (!d || this.#syncing || this.#mutating) return;
		this.#syncing = true;
		let ownsMutation = false;
		try {
			try {
				const price = await api.price();
				if (price.btc_eur_cents && /^\d+$/.test(price.btc_eur_cents) && BigInt(price.btc_eur_cents) > 0n) {
					d.price = { btc_eur_cents: price.btc_eur_cents, ts: price.ts };
				}
			} catch { /* retain last same-origin snapshot */ }
			if (this.data !== d || this.#mutating) return;
			this.#mutating = true; ownsMutation = true;
			if (d.provisional.length) {
				const w = await this.#w();
				for (const item of [...d.provisional]) {
					const h = d.history.find((x) => x.id === item.id)!;
					try {
						const proofs = await this.#swapReceive(w, item.token);
						d.proofs.push(...proofs.map(store));
						h.status = 'final';
						if (d.stall) d.pendingReceipts.push({ stall: d.stall, ys: item.ys, tries: 0 });
					} catch (e) {
						if (classifyReceiveError(e) !== 'already_spent') break;
						h.status = 'fraud';
					}
					d.provisional = d.provisional.filter((x) => x.id !== item.id);
					await this.#persist();
				}
			}
			if (d.pendingSend) {
				const w = await this.#w(), pending = d.pendingSend;
				const result = await w.completeSwap(deserializeSwapPreview(pending.preview));
				const token = getEncodedToken({ mint: d.mintUrl, proofs: result.send, unit: 'sat' });
				d.proofs = result.keep.map(store);
				d.history.unshift({ id: pending.id, ts: Date.now(), kind: 'sent', amount: pending.amount,
					status: 'pending', ys: proofYs(result.send), token });
				d.pendingSend = null;
				await this.#persist();
			}
			for (const [id, serialized] of Object.entries(d.receiveJournal)) {
				// Provisional records retain their own fraud lifecycle above.
				if (d.provisional.some((p) => p.ys[0] === id)) continue;
				const w = await this.#w();
				const preview = deserializeSwapPreview(serialized);
				try {
					const result = await w.completeSwap(preview);
					const ys = proofYs(preview.inputs);
					d.proofs.push(...result.keep.map(store)); d.seenYs.push(...ys);
					d.history.unshift({ id: rid(), ts: Date.now(), kind: 'received', amount: String(sumSats(result.keep)), status: 'final', ys });
					delete d.receiveJournal[id];
					if (d.stall) d.pendingReceipts.push({ stall: d.stall, ys, tries: 0 });
					await this.#persist();
				} catch (e) {
					if (classifyReceiveError(e) === 'already_spent') { delete d.receiveJournal[id]; await this.#persist(); }
				}
			}
			for (const item of d.cashouts) {
				if (item.state === 'SETTLED' && item.changeClaimed) continue;
				try {
					const remote = item.state === 'SUBMITTING'
						? await api.cashout(item.intent, item.token)
						: await api.cashoutStatus(item.intent.id, item.intent.pubkey);
					item.state = remote.state;
					const h = d.history.find((x) => x.id === item.intent.id);
					if (h) h.status = remote.state === 'SETTLED' ? 'settled' : 'queued';
					if (remote.state === 'SETTLED' && !item.changeClaimed) {
						const change = await api.cashoutChange(signChange(d.mnemonic, item.intent.id));
						if (change.token) {
							const w = await this.#w();
							d.proofs.push(...(await this.#swapReceive(w, change.token)).map(store));
						}
						item.changeClaimed = true;
					}
				} catch { /* retry the same signed request */ }
			}
			await this.#persist();
			void this.flushReceipts();
		} catch { /* box out of range: encrypted pending items stay intact */ }
		finally { this.#syncing = false; if (ownsMutation) this.#mutating = false; }
	}

	async queueCashout(amount: bigint, destination: string): Promise<void> {
		if (this.#mutating) throw new Error('busy');
		if (amount < 10n || amount > this.balance || amount > 2_000_000n) throw new Error('invalid amount');
		if (!/^(lnbcrt[0-9a-z]{20,1800}|demo:world)$/.test(destination)) throw new Error('invalid destination');
		this.#mutating = true;
		try {
			const d = this.data!;
			const { token, id } = await this.#pay(amount);
			const fullId = id + rid();
			const intent = signIntent(d.mnemonic, fullId, amount, destination);
			d.cashouts.push({ intent, token, state: 'SUBMITTING' });
			const h = d.history.find((x) => x.id === id)!;
			h.kind = 'cashout'; h.id = fullId; h.status = 'queued';
			await this.#persist();
		} finally { this.#mutating = false; }
		await this.sync();
	}

	async setT2Cap(xof: bigint): Promise<void> {
		if (xof < 0n || xof > 2000n || this.exposure > 0n) throw new Error('invalid cap');
		this.data!.t2CapXof = String(xof); await this.#persist();
	}

	async restore(mnemonic: string, pin: string): Promise<bigint> {
		await this.create(mnemonic, pin);
		this.#mutating = true;
		try {
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
		} finally { this.#mutating = false; }
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
