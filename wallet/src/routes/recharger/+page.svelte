<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatSats, parseAmount } from '#lib/engine/money.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { api, ApiError } from '#lib/state/api.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
	import Qr from '#lib/ui/Qr.svelte';

	let input = $state('');
	let error = $state('');
	let quote = $state<{ quote: string; request: string; amount: bigint } | null>(null);
	let status = $state<'idle' | 'waiting' | 'done'>('idle');
	let done = $state(0n);
	const ac = new AbortController();
	onDestroy(() => ac.abort());

	async function create(e: SubmitEvent) {
		e.preventDefault();
		const amount = parseAmount(input);
		if (amount === null) return void (error = t('common.amount.invalid'));
		error = '';
		try {
			const q = await app.createTopup(amount);
			quote = { ...q, amount };
			status = 'waiting';
			done = await app.completeTopup(q.quote, amount, ac.signal);
			status = 'done';
		} catch {
			if (!ac.signal.aborted) error = t('topup.offline');
		}
	}

	async function demoPay() {
		if (!quote) return;
		error = '';
		try {
			await api.demoFund(quote.request);
		} catch (e) {
			error = e instanceof ApiError && e.status === 503 ? t('topup.offline') : t('receive.error');
		}
	}
</script>

<main class="stack">
	<h1>{t('topup.title')}</h1>
	{#if !quote}
		<form class="stack" onsubmit={create}>
			<label for="topup-amount">{t('common.amount')}</label>
			<input id="topup-amount" data-testid="topup-amount" inputmode="numeric" bind:value={input} />
			<button class="primary" type="submit" data-testid="topup-create">{t('topup.create')}</button>
		</form>
	{:else if status === 'waiting'}
		<p>{t('topup.invoice')}</p>
		<Qr value={quote.request.toUpperCase()} label={t('topup.invoice')} />
		<p class="mono" data-testid="topup-invoice">{quote.request}</p>
		<p role="status">{t('topup.waiting')}</p>
		<button class="primary" data-testid="topup-demo" onclick={demoPay}>{t('topup.demo')}</button>
		<p><small>{t('topup.demo.note')}</small></p>
	{:else}
		<div class="stamp stamp-ok" role="status" data-testid="topup-done">
			<strong>✓</strong>{t('topup.done', { amount: formatSats(done) })}
		</div>
		<a class="button" href="/">{t('common.back')}</a>
	{/if}
	{#if error}<p class="error" role="alert" data-testid="topup-error">{error}</p>{/if}
</main>
