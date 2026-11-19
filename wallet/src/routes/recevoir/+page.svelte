<script lang="ts">
	import { formatSats } from '#lib/engine/money.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { app, type ReceiveResult } from '#lib/state/wallet.svelte.ts';
	import Scanner from '#lib/ui/Scanner.svelte';

	let token = $state('');
	let busy = $state(false);
	let provisional = $state(false);
	let result = $state<ReceiveResult | null>(null);
	const time = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

	const failureText = {
		already_spent: 'receive.spent.detail',
		mint_unreachable: 'receive.unreachable',
		foreign_mint: 'receive.foreign',
		invalid_token: 'receive.invalid',
		other: 'receive.error'
		,cap_exceeded: 'receive.cap', untrusted_keyset: 'receive.keyset'
	} as const;

	async function accept(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		try { result = await app.receive(token, provisional); }
		catch { result = { ok: false, reason: 'other' }; }
		finally { busy = false; }
		if (result.ok && !result.provisional && localStorage.getItem('coupure.haptic') !== 'off' && 'vibrate' in navigator) navigator.vibrate?.(80);
	}

	async function paste() {
		try {
			token = (await navigator.clipboard.readText()).trim();
		} catch {
			/* clipboard blocked: the user can long-press and paste */
		}
	}

	function reset() {
		token = '';
		result = null;
	}
</script>

<main class="stack">
	<h1>{t('receive.title')}</h1>
	{#if !result}
		<form class="stack" onsubmit={accept}>
			<Scanner oncode={(code) => { token = code; }} />
			<label for="receive-token">{t('receive.input')}</label>
			<textarea id="receive-token" data-testid="receive-token" rows="5" autocomplete="off" spellcheck="false"
				bind:value={token}></textarea>
			<button type="button" onclick={paste}>{t('common.paste')}</button>
			<label class="check"><input type="checkbox" bind:checked={provisional} />{t('receive.provisional.opt')}</label>
			<button class="primary" type="submit" disabled={busy || !token.trim()} data-testid="receive-accept">
				{busy ? t('receive.checking') : t('receive.accept')}
			</button>
		</form>
	{:else if result.ok && result.provisional}
		<div class="stamp stamp-warn" role="status" data-testid="receive-provisional">
			<strong>{t('receive.provisional')}</strong>
			<p class="amount">{formatSats(result.amount)} {t('unit.sat')}</p>
			<p>{t('receive.provisional.help')}</p>
		</div>
		<button onclick={reset}>{t('receive.another')}</button>
	{:else if result.ok}
		<div class="stamp stamp-ok" role="status" data-testid="receive-paid">
			<strong>{t('receive.paid')}</strong>
			{t('receive.paid.detail', { amount: formatSats(result.amount), time: time(result.at) })}
		</div>
		<button class="primary" onclick={reset}>{t('receive.another')}</button>
	{:else if result.reason === 'already_spent'}
		<div class="stamp stamp-bad" role="alert" data-testid="receive-spent">
			<strong>✕ {t('receive.spent')}</strong>
			<p>{t('receive.spent.detail')}</p>
			{#if result.stall}
				<p data-testid="receive-spent-stall">
					{t('receive.spent.stall', { stall: result.stall, time: time(result.stallAt ?? Date.now()) })}
				</p>
			{/if}
			<p><strong>{t('receive.spent.next')}</strong></p>
		</div>
		<button class="primary" onclick={reset}>{t('receive.another')}</button>
	{:else}
		<p class="error" role="alert" data-testid="receive-failed">{t(failureText[result.reason])}</p>
		<button class="primary" onclick={reset}>{t('receive.another')}</button>
	{/if}
</main>
