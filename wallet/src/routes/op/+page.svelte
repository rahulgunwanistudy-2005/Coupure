<script lang="ts">
 import { onMount } from 'svelte';
 import { api, operator } from '#lib/state/api.ts';
 import { t } from '#lib/i18n/index.svelte.ts';
 import Board from '#lib/ui/Board.svelte';
 let pin = $state(''); let authenticated = $state(false); let busy = $state(false);
 let message = $state(''); let demo = $state(false);
 onMount(() => { void api.health().then((h) => demo = h.demo_mode).catch(() => {}); });
 async function login(e: SubmitEvent) {
  e.preventDefault(); busy = true; message = '';
  try { await api.login(pin); authenticated = true; pin = ''; }
  catch { message = t('lock.wrong'); }
  finally { busy = false; }
 }
 async function cable(action: 'cut' | 'restore') {
  busy = true; message = '';
  try { await api.demoIsland(action); message = t('op.done'); }
  catch { message = t('common.error'); }
  finally { busy = false; }
 }
</script>
<main class="wide stack">
 <p class="eyebrow">{t('op.caption')}</p><h1 class="display">{t('op.title')}</h1>
 {#if !authenticated}
  <form class="paper stack" onsubmit={login}>
   <label for="op-pin">{t('op.pin')}</label>
   <input id="op-pin" data-testid="operator-pin" type="password" inputmode="numeric" autocomplete="current-password" pattern={'[0-9]{6,12}'} maxlength="12" bind:value={pin} required />
   <button class="primary" disabled={busy} data-testid="operator-login">{t('op.login')}</button><small>{t('op.help')}</small>
  </form>
 {:else}
  {#if demo}
   <section class="paper stack"><h2>{t('op.demo')}</h2><div class="actions"><button class="danger" data-testid="demo-cut" disabled={busy} onclick={() => cable('cut')}>{t('settings.demo.cut')}</button><button data-testid="demo-restore" disabled={busy} onclick={() => cable('restore')}>{t('settings.demo.restore')}</button></div></section>
  {/if}
  <Board />
  <section class="paper"><h2>{t('op.cash')}</h2><p>{t('op.cash.help')}</p><a class="button" href="/">{t('nav.home')}</a></section>
  <button onclick={() => { authenticated = false; operator.token = ''; }}>{t('op.logout')}</button>
 {/if}
 {#if message}<p role="status">{message}</p>{/if}
</main>
