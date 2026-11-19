<script lang="ts">
	import { t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
	import PinInput from './PinInput.svelte';

	let pin = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		busy = true;
		const ok = await app.unlock(pin);
		busy = false;
		if (!ok) {
			error = t('lock.wrong');
			pin = '';
		}
	}
</script>

<main>
	<form class="stack" onsubmit={submit}>
		<h1>{t('lock.title')}</h1>
		<PinInput id="unlock-pin" testid="lock-pin" label={t('lock.title')} bind:value={pin} />
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button class="primary" type="submit" disabled={busy} data-testid="lock-submit">{t('lock.unlock')}</button>
	</form>
</main>
