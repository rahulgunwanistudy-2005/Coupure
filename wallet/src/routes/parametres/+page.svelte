<script lang="ts">
	import { i18n, setLang, t, type Lang } from '#lib/i18n/index.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';

	let stall = $state(app.data?.stall ?? '');
	let msg = $state('');
	let cap = $state<number | undefined>(Number(app.data?.t2CapXof ?? 2000));
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

	<form class="stack" onsubmit={async (e) => { e.preventDefault(); try { await app.setT2Cap(BigInt(cap ?? -1)); msg = t('settings.saved'); } catch { msg = t('settings.t2.help'); } }}>
		<label for="t2cap">{t('settings.t2')}</label>
		<input id="t2cap" type="number" min="0" max="2000" step="1" bind:value={cap} disabled={app.exposure > 0n} />
		<small>{t('settings.t2.help')}</small><button disabled={app.exposure > 0n}>{t('settings.save')}</button>
	</form>
	<button onclick={() => app.sync()}>{t('settings.sync')}</button>
	<a class="button" href="/op">{t('nav.operator')}</a>

	<button onclick={() => app.lock()}>{t('settings.lock')}</button>
	<button onclick={erase}>{t('settings.reset')}</button>
</main>

<style>
	fieldset { border: 2px solid var(--line); border-radius: 6px; }
	label input[type='radio'] { width: auto; min-height: auto; }
</style>
