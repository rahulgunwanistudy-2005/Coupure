<script lang="ts">
 import { onMount } from 'svelte';
 import { app } from '#lib/state/wallet.svelte.ts';
 import { api } from '#lib/state/api.ts';
 import { parseAmount, formatSats } from '#lib/engine/money.ts';
 import { t } from '#lib/i18n/index.svelte.ts';
 let input = $state(''); let destination = $state(''); let busy = $state(false); let demo = $state(false);
 let useDemo = $state(false); let message = $state('');
 onMount(() => { void api.health().then((h) => demo = h.demo_mode).catch(() => {}); });
 async function submit(e: SubmitEvent) {
  e.preventDefault(); const amount = parseAmount(input);
  if (!amount || amount < 10n || amount > app.balance) { message = t('pay.insufficient'); return; }
  busy = true; message = '';
  try { await app.queueCashout(amount, useDemo ? 'demo:world' : destination.trim().toLowerCase()); message = t('cashout.done'); }
  catch { message = t('common.error'); }
  finally { busy = false; }
 }
 const stateKey = (s: string) => ['SUBMITTING','RECEIVING','QUEUED','PAYING','SETTLED'].includes(s) ? `cashout.${s}` as 'cashout.QUEUED' : 'cashout.SUBMITTING' as const;
</script>
<main class="stack">
 <p class="eyebrow">T3 · LIGHTNING</p><h1>{t('cashout.title')}</h1><p>{t('cashout.help')}</p>
 <form class="paper stack" onsubmit={submit}>
  <label for="cashout-amount">{t('common.amount')}</label><input id="cashout-amount" data-testid="cashout-amount" inputmode="numeric" bind:value={input} required />
  {#if demo}<label class="check"><input type="checkbox" data-testid="cashout-demo" bind:checked={useDemo} />{t('cashout.demo')}</label>{/if}
  {#if !useDemo}<label for="destination">{t('cashout.destination')}</label><textarea id="destination" rows="4" autocomplete="off" bind:value={destination} required></textarea>{/if}
  <small>{t('cashout.fees')}</small><button class="primary" data-testid="cashout-submit" disabled={busy}>{t('cashout.submit')}</button>
 </form>
 {#if message}<p role="status" data-testid="cashout-message">{message}</p>{/if}
 <h2>{t('cashout.queue')}</h2>
 {#each app.data?.cashouts ?? [] as j (j.intent.id)}
  <div class="receipt-row"><strong>{formatSats(BigInt(j.intent.amount))} {t('unit.sat')}</strong><span data-testid="cashout-state">{t(stateKey(j.state))}</span><code>{j.intent.id.slice(0, 12)}</code></div>
 {/each}
</main>
