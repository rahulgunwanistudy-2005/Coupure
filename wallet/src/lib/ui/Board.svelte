<script lang="ts">
 import { onMount } from 'svelte';
 import { api, type Tableau } from '#lib/state/api.ts';
 import { formatSats } from '#lib/engine/money.ts';
 import { t } from '#lib/i18n/index.svelte.ts';
 let data = $state<Tableau | null>(null);
 let error = $state(false);
 let busy = $state(false);
 async function refresh() {
  if (busy) return;
  busy = true;
  try { data = await api.tableau(); error = false; }
  catch { data = null; error = true; }
  finally { busy = false; }
 }
 onMount(() => { void refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); });
 const amount = (n: number | null | undefined) => n == null ? t('board.unavailable') : formatSats(BigInt(n));
</script>
<div class="board-grid" aria-live="polite" aria-busy={busy} data-testid="tableau">
 <section class="board-stat hero-stat"><p class="eyebrow">{t('board.liabilities')}</p><p class="stat" data-testid="board-liabilities">{amount(data?.liabilities.available ? data.liabilities.outstanding_sat : null)}</p><small>{t('unit.sat')}</small></section>
 <section class="board-stat"><p class="eyebrow">{t('board.reserves')}</p><p class="stat" data-testid="board-reserves">{amount(data?.reserves?.local_sat)}</p><small>{t('unit.sat')}</small></section>
 <section class="board-stat"><p class="eyebrow">{t('board.ratio')}</p><p class="stat" data-testid="board-ratio">{data?.coverage_ratio == null ? '—' : (data.coverage_ratio * 100).toFixed(1) + '%'}</p></section>
 <section class="board-stat"><p class="eyebrow">{t('board.pending')}</p><p class="stat" data-testid="board-pending">{data?.queue?.pending ?? '—'}</p><small>{t('board.settled')}: <span data-testid="board-settled">{data?.queue?.settled ?? '—'}</span></small></section>
</div>
{#if error}<p class="error" role="alert">{t('common.error')}</p>{/if}
{#if data}
 <section class="ledger-seal"><span aria-hidden="true">{data.ledger.ok ? '✓' : '✕'}</span><div><strong>{t(data.ledger.ok ? 'board.ledger' : 'board.ledger.bad')}</strong><p>{t('board.entries', { count: data.ledger.length })}</p></div></section>
 <p class="eyebrow">{t('board.head')}</p><code class="fingerprint">{data.ledger.head}</code>
{/if}
<p class="note">{t('board.note')}</p>
<button onclick={refresh} disabled={busy}>{t('common.refresh')}</button>
