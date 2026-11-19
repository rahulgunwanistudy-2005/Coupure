<script lang="ts">
	import { formatSats, toSats } from '#lib/engine/money.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { island } from '#lib/state/island.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
	import Qr from '#lib/ui/Qr.svelte';

	let replay = $state<string | null>(null);
	const when = (ms: number) =>
		new Date(ms).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
	const sign = { topup: '+', received: '+', sent: '−', refused: '✕ ' } as const;
</script>

<main class="stack">
	<h1>{t('history.title')}</h1>
	{#if !app.data?.history.length}
		<p>{t('history.empty')}</p>
	{/if}
	<ul class="list" data-testid="history">
		{#each app.data?.history ?? [] as h (h.id)}
			<li data-kind={h.kind} data-status={h.status}>
				<div>
					<strong>{t(`history.kind.${h.kind}`)}</strong>
					<small>{when(h.ts)}{#if h.stall} · {h.stall}{/if}</small>
				</div>
				<div class="right">
					<span>{sign[h.kind]}{formatSats(toSats(h.amount))} sat</span>
					<small>{t(`history.status.${h.status}`)}</small>
				</div>
				{#if h.kind === 'sent' && h.token && island.state !== 'UNKNOWN'}
					<button class="replay" data-testid="history-replay" onclick={() => (replay = replay === h.token ? null : h.token!)}>
						{t('history.replay')}
					</button>
				{/if}
				{#if replay && replay === h.token}
					<div class="replay-box">
						<Qr value={h.token!} label={t('history.replay')} />
						<p class="mono" data-testid="history-replay-token">{h.token}</p>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</main>

<style>
	.list { list-style: none; padding: 0; margin: 0; }
	li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.4rem; padding: 0.8rem 0; border-bottom: 1px solid #ccc; }
	li > div { display: flex; flex-direction: column; }
	.right { text-align: right; }
	li[data-kind='refused'] strong { color: var(--bad-bg); }
	.replay, .replay-box { flex-basis: 100%; }
</style>
