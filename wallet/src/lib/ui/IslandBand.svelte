<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.ts';
	import { island } from '#lib/state/island.svelte.ts';

	// Shape + word, never colour alone: ● online, ◆ island, ↻ reconciling, ✕ box unreachable
	const glyph = { ONLINE: '●', ISLAND: '◆', RECONCILING: '↻', UNKNOWN: '✕' } as const;
</script>

<div class="band band-{island.state.toLowerCase()}" role="status" aria-live="polite" data-testid="island-band"
	data-state={island.state}>
	<span aria-hidden="true">{glyph[island.state]}</span>
	<strong>{t(`island.${island.state}`)}</strong>
	{#if island.state === 'ISLAND'}<small>{t('island.hint.ISLAND')}</small>{/if}
	{#if island.state === 'UNKNOWN'}<small>{t('island.hint.UNKNOWN')}</small>{/if}
</div>

<style>
	.band {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.6rem;
		align-items: baseline;
		padding: 0.6rem 1rem;
		font-size: 1rem;
		letter-spacing: 0.02em;
	}
	.band-online { background: var(--ok-bg); color: var(--ok-fg); }
	.band-island { background: var(--warn-bg); color: var(--warn-fg); }
	.band-reconciling { background: var(--info-bg); color: var(--info-fg); }
	.band-unknown { background: var(--bad-bg); color: var(--bad-fg); }
	small { flex-basis: 100%; font-size: 0.9rem; }
</style>
