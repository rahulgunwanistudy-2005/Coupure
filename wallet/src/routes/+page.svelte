<script lang="ts">
	import { formatSats, satsToXof } from '#lib/engine/money.ts';
	import { t, i18n } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
</script>

<main class="stack">
	<p class="eyebrow">{t('home.promise')}</p>
	<section class="balance-paper">
	<p class="eyebrow">{t('home.balance')}</p>
	<p class="amount" data-testid="balance">{formatSats(app.balance)} <small>{t('unit.sat')}</small></p>
	{#if app.data?.price}
		<p class="fiat">{t('home.fiat', { amount: formatSats(satsToXof(app.balance, BigInt(app.data.price.btc_eur_cents))) })}</p>
		<small>{t('price.frozen', { time: new Date(app.data.price.ts * 1000).toLocaleTimeString(i18n.lang === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit' }) })}</small>
	{:else}<small>{t('price.unavailable')}</small>{/if}
	<p class="confirmed-label"><span aria-hidden="true">✓</span> {t('home.final')}</p>
	</section>
	{#if app.exposure > 0n}<p class="provisional-note">{t('home.provisional', { amount: formatSats(app.exposure) })}</p>{/if}
	<div class="pay-actions">
	<a class="button primary" href="/payer" data-testid="go-pay"><span aria-hidden="true">↗</span>{t('home.pay')}</a>
	<a class="button receive-action" href="/recevoir" data-testid="go-receive"><span aria-hidden="true">↙</span>{t('home.receive')}</a>
	</div>
	<a class="button" href="/recharger" data-testid="go-topup">{t('home.topup')}</a>
	<a class="button subtle" href="/retirer">{t('nav.cashout')}</a>
</main>
