<script lang="ts">
	import { formatSats } from '#lib/engine/money.ts';
	import { isValidMnemonic, newMnemonic, normalizeMnemonic } from '#lib/engine/seed.ts';
	import { isValidPin } from '#lib/engine/vault.ts';
	import { t } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
	import PinInput from './PinInput.svelte';

	let step = $state<'start' | 'words' | 'restore' | 'pin' | 'busy'>('start');
	let mode = $state<'create' | 'restore'>('create');
	let mnemonic = $state('');
	let restoreText = $state('');
	let pin = $state('');
	let pin2 = $state('');
	let error = $state('');
	let note = $state('');

	function startCreate() {
		mode = 'create';
		mnemonic = newMnemonic();
		step = 'words';
	}

	function submitRestore(e: SubmitEvent) {
		e.preventDefault();
		if (!isValidMnemonic(restoreText)) return void (error = t('onb.restore.invalid'));
		mnemonic = normalizeMnemonic(restoreText);
		error = '';
		step = 'pin';
	}

	async function submitPin(e: SubmitEvent) {
		e.preventDefault();
		if (!isValidPin(pin)) return void (error = t('onb.pin.invalid'));
		if (pin !== pin2) return void (error = t('onb.pin.mismatch'));
		error = '';
		step = 'busy';
		if (mode === 'create') return app.create(mnemonic, pin);
		note = t('onb.restoring');
		try {
			const amount = await app.restore(mnemonic, pin);
			note = t('onb.restored', { amount: formatSats(amount) });
		} catch {
			note = t('island.hint.UNKNOWN');
		}
	}
</script>

<main class="stack">
	<h1>{t('onb.title')}</h1>
	{#if step === 'start'}
		<button class="primary" data-testid="onb-create" onclick={startCreate}>{t('onb.create')}</button>
		<button data-testid="onb-restore" onclick={() => ((mode = 'restore'), (step = 'restore'))}>
			{t('onb.restore')}
		</button>
	{:else if step === 'words'}
		<h2>{t('onb.words.title')}</h2>
		<p>{t('onb.words.help')}</p>
		<ol class="words" data-testid="onb-words">
			{#each mnemonic.split(' ') as w, i (i)}<li>{w}</li>{/each}
		</ol>
		<button class="primary" data-testid="onb-words-done" onclick={() => (step = 'pin')}>{t('onb.words.done')}</button>
	{:else if step === 'restore'}
		<form onsubmit={submitRestore} class="stack">
			<label for="restore-words">{t('onb.restore.label')}</label>
			<textarea id="restore-words" data-testid="onb-restore-words" rows="4" autocomplete="off" spellcheck="false"
				bind:value={restoreText}></textarea>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button class="primary" type="submit">{t('common.continue')}</button>
		</form>
	{:else if step === 'pin'}
		<form onsubmit={submitPin} class="stack">
			<h2>{t('onb.pin.title')}</h2>
			<PinInput id="pin1" testid="onb-pin" label={t('onb.pin.title')} bind:value={pin} />
			<PinInput id="pin2" testid="onb-pin2" label={t('onb.pin.confirm')} bind:value={pin2} />
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button class="primary" type="submit" data-testid="onb-pin-submit">{t('common.continue')}</button>
		</form>
	{:else}
		<p role="status" data-testid="onb-note">{note}</p>
	{/if}
</main>

<style>
	.words {
		columns: 2;
		font-size: 1.15rem;
		font-family: var(--mono);
		padding-left: 2rem;
	}
</style>
