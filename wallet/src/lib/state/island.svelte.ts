// Live island state from the box (SSE). If the box itself is unreachable, we say so: that is the case
// where payments cannot be confirmed (T2 territory, G2).
import type { IslandView } from './api';

export const island = $state<{ state: IslandView['state'] | 'UNKNOWN'; since: number | null }>({
	state: 'UNKNOWN',
	since: null
});

let es: EventSource | null = null;

export function watchIsland(): void {
	if (es || typeof EventSource === 'undefined') return;
	es = new EventSource('/api/island/stream');
	es.onmessage = (ev) => {
		try {
			const v = JSON.parse(ev.data) as IslandView;
			island.state = v.state;
			island.since = v.since;
		} catch {
			/* ignore malformed frames */
		}
	};
	es.onerror = () => {
		island.state = 'UNKNOWN'; // EventSource retries on its own (retry: 2000 from the server)
	};
}
