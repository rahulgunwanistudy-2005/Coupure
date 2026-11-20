// coupured client (same origin, /api). No third-party origins, ever.
export type IslandView = {
	state: 'ONLINE' | 'ISLAND' | 'RECONCILING';
	since: number;
	ledger_head: string | null;
};

async function post<T>(path: string, body: unknown): Promise<T> {
	const r = await fetch(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const data = await r.json().catch(() => ({}));
	if (!r.ok) throw new ApiError(r.status, typeof data.detail === 'string' ? data.detail : `HTTP ${r.status}`);
	return data as T;
}

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

export const operator = { token: '' };

async function get<T>(path: string): Promise<T> {
	const r = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
	if (!r.ok) throw new ApiError(r.status, `HTTP ${r.status}`);
	return r.json();
}

export type Tableau = {
	island: IslandView;
	liabilities: { available: boolean; outstanding_sat: number | null; keysets: Array<{ id: string; balance_sat: number }> };
	reserves: { local_sat: number; remote_sat: number; active: number; channels: number } | null;
	queue: { pending: number; settled: number; held_sat: string } | null;
	coverage_ratio: number | null;
	ledger: { ok: boolean; length: number; head: string };
};

export const api = {
	price: () => get<{ btc_eur_cents: string | null; ts: number }>('/api/price'),
	health: () => get<{ demo_mode: boolean }>('/api/health'),
	tableau: () => get<Tableau>('/api/tableau'),
	ledger: () => get<Array<{ seq: number; kind: string; ts: number; payload: Record<string, unknown>; hash: string }>>('/api/ledger?n=30'),
	login: async (pin: string) => { operator.token = (await post<{ token: string }>('/api/operator/login', { pin })).token; },
	cashout: (intent: import('#lib/engine/intent.ts').Intent, token: string) => post<{ state: string }>('/api/cashouts', { intent, token }),
	cashoutStatus: (id: string, pubkey: string) => get<{ state: string }>(`/api/cashouts/${id}?pubkey=${pubkey}`),
	cashoutChange: (body: { id: string; pubkey: string; signature: string }) => post<{ token: string | null }>('/api/cashouts/change', body),
	registerReceipt: (stall: string, ys: string[]) => post<{ registered: number }>('/api/receipts', { stall, ys }),
	lookupReceipts: (ys: string[]) =>
		post<{ found: Record<string, { stall: string; ts: number }> }>('/api/receipts/lookup', { ys }),
	demoFund: (bolt11: string) => post<{ status: string; amount_sat: number }>('/api/demo/fund', { bolt11 }),
	demoIsland: async (action: 'cut' | 'restore') => {
		const r = await fetch('/api/demo/island', { method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${operator.token}` },
			body: JSON.stringify({ action }) });
		if (!r.ok) throw new ApiError(r.status, `HTTP ${r.status}`);
		return r.json();
	}
};
