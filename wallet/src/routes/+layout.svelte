<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { i18n, t } from '#lib/i18n/index.svelte.ts';
	import { watchIsland } from '#lib/state/island.svelte.ts';
	import { app } from '#lib/state/wallet.svelte.ts';
	import IslandBand from '#lib/ui/IslandBand.svelte';
	import LockScreen from '#lib/ui/LockScreen.svelte';
	import Onboarding from '#lib/ui/Onboarding.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	onMount(() => {
		document.documentElement.lang = i18n.lang;
		watchIsland();
		void app.init();
	});

	const nav = [
		['/', 'nav.home'],
		['/historique', 'nav.history'],
		['/parametres', 'nav.settings']
	] as const;
</script>

<svelte:head><title>{t('app.name')}</title></svelte:head>

<IslandBand />

{#if app.phase === 'loading'}
	<main aria-busy="true"></main>
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
