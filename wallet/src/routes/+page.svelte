<script lang="ts">
	import { formatSats } from '#lib/engine/money.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
</script>

<main class="stack">
	<p>{t('home.balance')}</p>
	<p class="amount" data-testid="balance">{formatSats(app.balance)} <small>{t('unit.sat')}</small></p>
	<a class="button primary" href="/payer" data-testid="go-pay">{t('home.pay')}</a>
	<a class="button primary" href="/recevoir" data-testid="go-receive">{t('home.receive')}</a>
	<a class="button" href="/recharger" data-testid="go-topup">{t('home.topup')}</a>
</main>
