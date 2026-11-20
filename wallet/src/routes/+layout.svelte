<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { i18n, setLang, t } from '#lib/i18n/index.svelte.ts';
	import { watchIsland } from '#lib/state/island.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
	import IslandBand from '#lib/ui/IslandBand.svelte';
	import LockScreen from '#lib/ui/LockScreen.svelte';
	import Onboarding from '#lib/ui/Onboarding.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	let insecure = $state(false);
	const publicPage = $derived(['/tableau', '/op', '/tour'].includes(page.url.pathname));

	onMount(() => {
		document.documentElement.lang = i18n.lang;
		watchIsland();
		void app.init();
		insecure = !window.isSecureContext;
		const timer = setInterval(() => { if (app.phase === 'ready') void app.sync(); }, 15_000);
		const reconnect = () => { if (app.phase === 'ready') void app.sync(); };
		window.addEventListener('online', reconnect);
		return () => { clearInterval(timer); window.removeEventListener('online', reconnect); };
	});

	const nav = [
		['/', 'nav.home'],
		['/historique', 'nav.history'],
		['/parametres', 'nav.settings']
	] as const;
</script>

<svelte:head><title>{t('app.name')}</title></svelte:head>

<header class="masthead">
	<a class="wordmark" href="/" aria-label={t('app.name')}>C<span class="wordmark-cut">/</span>UPURE<span class="wordmark-dot">.</span></a>
	<div class="market-label"><span>{t('brand.market')}</span><strong>{t('brand.subtitle')}</strong></div>
	<button class="lang-switch" onclick={() => setLang(i18n.lang === 'fr' ? 'en' : 'fr')} aria-label={t('settings.language')}>{i18n.lang.toUpperCase()}</button>
</header>
<IslandBand />
{#if insecure}<p class="http-warning" role="status">{t('security.http')}</p>{/if}

{#if publicPage}
	{@render children()}
{:else if app.phase === 'loading'}
<main aria-busy="true"><div class="loading-rule"></div></main>
{:else if app.phase === 'new'}
	<Onboarding />
{:else if app.phase === 'locked'}
	<LockScreen />
{:else}
	{@render children()}
	<nav aria-label={t('app.name')}>
		{#each nav as [href, key] (href)}
			<a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{t(key)}</a>
		{/each}
	</nav>
{/if}
<footer class="site-footer"><span>{t('brand.note')}</span><div><a href="/tour">{t('nav.tour')}</a><a href="/tableau">{t('nav.board')}</a><a href="/op">{t('nav.operator')}</a></div></footer>
