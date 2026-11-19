<script lang="ts">
	import { i18n, setLang, t, type Lang } from '#lib/i18n/index.svelte.ts';
	import { api } from '#lib/state/api.ts';
	import { app } from '#lib/state/wallet.svelte.ts';

	let stall = $state(app.data?.stall ?? '');
	let msg = $state('');
	let demoMsg = $state('');
	const langs: Array<[Lang, string]> = [
		['fr', 'Français'],
		['en', 'English'],
		['wo', 'Wolof']
	];

	async function saveStall(e: SubmitEvent) {
		e.preventDefault();
		const s = stall.trim().toUpperCase();
		if (s && !/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(s)) return void (msg = t('settings.stall.invalid'));
		await app.setStall(s || null);
		stall = s;
		msg = t('settings.saved');
	}

	async function cable(action: 'cut' | 'restore') {
		demoMsg = '';
		try {
			await api.demoIsland(action);
		} catch (e) {
			demoMsg = e instanceof Error ? e.message : String(e);
		}
	}

	async function erase() {
		if (confirm(t('settings.reset.confirm'))) await app.erase();
	}
</script>

<main class="stack">
	<h1>{t('settings.title')}</h1>

	<fieldset class="stack">
		<legend>{t('settings.language')}</legend>
		{#each langs as [code, name] (code)}
			<label><input type="radio" name="lang" value={code} checked={i18n.lang === code} onchange={() => setLang(code)} /> {name}</label>
		{/each}
	</fieldset>

	<form class="stack" onsubmit={saveStall}>
		<label for="stall">{t('settings.stall')}</label>
		<input id="stall" data-testid="settings-stall" autocomplete="off" maxlength="12" bind:value={stall} />
		<small>{t('settings.stall.help')}</small>
		<button type="submit" data-testid="settings-stall-save">{t('settings.save')}</button>
		{#if msg}<p role="status">{msg}</p>{/if}
	</form>

	<fieldset class="stack">
		<legend>{t('settings.demo')}</legend>
		<button data-testid="demo-cut" onclick={() => cable('cut')}>{t('settings.demo.cut')}</button>
		<button data-testid="demo-restore" onclick={() => cable('restore')}>{t('settings.demo.restore')}</button>
		{#if demoMsg}<p class="error" role="alert">{demoMsg}</p>{/if}
	</fieldset>

	<button onclick={() => app.lock()}>{t('settings.lock')}</button>
	<button onclick={erase}>{t('settings.reset')}</button>
</main>

<style>
	fieldset { border: 2px solid var(--line); border-radius: 6px; }
	label input[type='radio'] { width: auto; min-height: auto; }
</style>
