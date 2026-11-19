<script lang="ts">
	import { parseAmount } from '#lib/engine/money.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
	import Qr from '#lib/ui/Qr.svelte';

	let input = $state('');
	let error = $state('');
	let sent = $state<{ token: string; id: string } | null>(null);
	const claimed = $derived(sent ? app.data?.history.find((h) => h.id === sent!.id)?.status === 'claimed' : false);

	async function prepare(e: SubmitEvent) {
		e.preventDefault();
		const amount = parseAmount(input);
		if (amount === null) return void (error = t('common.amount.invalid'));
		if (amount > app.balance) return void (error = t('pay.insufficient'));
		error = '';
		try {
			sent = await app.pay(amount);
		} catch {
			error = t('island.hint.UNKNOWN');
		}
	}
</script>

<main class="stack">
	<h1>{t('pay.title')}</h1>
	{#if !sent}
		<form class="stack" onsubmit={prepare}>
			<label for="pay-amount">{t('common.amount')}</label>
			<input id="pay-amount" data-testid="pay-amount" inputmode="numeric" bind:value={input} />
			<button class="primary" type="submit" data-testid="pay-create">{t('pay.create')}</button>
		</form>
	{:else}
		<p>{t('pay.show')}</p>
		<Qr value={sent.token} label={t('pay.show')} />
		<p class="mono" data-testid="pay-token">{sent.token}</p>
		{#if claimed}
			<div class="stamp stamp-ok" role="status" data-testid="pay-claimed"><strong>✓</strong>{t('pay.claimed')}</div>
		{:else}
			<p role="status">{t('pay.waiting')}</p>
		{/if}
		<a class="button" href="/">{t('common.back')}</a>
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</main>
