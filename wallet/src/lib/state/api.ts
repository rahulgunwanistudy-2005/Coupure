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

export const api = {
	registerReceipt: (stall: string, ys: string[]) => post<{ registered: number }>('/api/receipts', { stall, ys }),
	lookupReceipts: (ys: string[]) =>
		post<{ found: Record<string, { stall: string; ts: number }> }>('/api/receipts/lookup', { ys }),
	demoFund: (bolt11: string) => post<{ status: string; amount_sat: number }>('/api/demo/fund', { bolt11 }),
	demoIsland: (action: 'cut' | 'restore') => post<unknown>('/api/demo/island', { action })
};
