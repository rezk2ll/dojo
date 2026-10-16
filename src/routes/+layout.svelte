<script>
	import './layout.css';
	import { asset, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { progressOf, restore } from '#lib/progress.svelte.js';
	import { dojos, dojoById } from '#lib/dojos/index.js';
	import { theme, initTheme, toggleTheme } from '#lib/theme.svelte.js';
	import { focus, initFocus } from '#lib/focus.svelte.js';
	import { initLang, lang, toggleLang, t } from '#lib/i18n.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Cube from '#lib/components/cube.svelte';
	import Companion from '#lib/components/companion.svelte';
	import CompanionMenu from '#lib/components/companion-menu.svelte';
	import { companion, initCompanion } from '#lib/companion.svelte.js';
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';

	/** @type {{children: import('svelte').Snippet}} */
	let { children } = $props();

	let dojo = $derived(page.params.dojo ? dojoById(page.params.dojo) : undefined);
	// Each dojo installs as its own app, so its icons and manifest live under its own path.
	let dir = $derived(dojo ? `/${dojo.id}` : '');
	let reading = $derived(focus.on && page.route.id === '/[dojo]/c/[slug]');
	let mounted = $state(false);
	// On the hub, a day counts if any dojo was practised.
	let days = $derived(dojo ? progressOf(dojo.id).days : dojos.flatMap((d) => progressOf(d.id).days));

	onMount(() => {
		for (const d of dojos) restore(d.id);
		initTheme();
		initFocus();
		initLang();
		initCompanion();
		mounted = true;
	});
</script>

<svelte:head>
	<title>{dojo?.name ?? 'Dojo'}</title>
	<meta name="description" content={dojo ? dojo.description[lang.current] : t().description} />
	<link rel="icon" href={asset(/** @type {any} */ (`${dir}/favicon.svg`))} />
	<link rel="apple-touch-icon" href={asset(/** @type {any} */ (`${dir}/apple-touch-icon.png`))} />
	<link rel="manifest" href={asset(/** @type {any} */ (`${dir}/manifest.webmanifest`))} />
</svelte:head>

<div class="contents" data-dojo={dojo?.id} style={dojo ? `--hue: ${dojo.hue}; --chroma: ${dojo.chroma}` : undefined}>
	<header class="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-4 sm:px-8" hidden={reading}>
		<div class="flex items-center gap-3">
			<a href={resolve('/')} aria-label={dojo ? t().allDojos : 'Dojo'} title={dojo ? t().allDojos : undefined} class="flex items-center gap-2 font-mono font-bold">
				<Cube state="done" class="size-6" />{#if !dojo}<span>dojo</span>{/if}
			</a>
			{#if dojo}
				<a href={resolve('/[dojo]', { dojo: dojo.id })} class="hidden font-mono font-bold min-[420px]:inline">
					{dojo.id}<span class="text-brand">/</span>dojo
				</a>
			{/if}
		</div>
		<div class="flex items-center gap-1">
			{#if dojo}
				<Button variant="ghost" size="sm" href={resolve('/[dojo]/review', { dojo: dojo.id })}>{t().review}</Button>
				<Button variant="ghost" size="sm" href={resolve('/[dojo]/glossary', { dojo: dojo.id })}>{t().glossary}</Button>
			{:else}
				<Button variant="ghost" size="sm" href={resolve('/review')}>{t().review}</Button>
			{/if}
			<Button variant="ghost" size="icon-sm" class="font-mono text-xs" aria-label={t().toOtherLang} title={t().toOtherLang} onclick={toggleLang}>
				{t().otherLang}
			</Button>
			<CompanionMenu />
			<Button variant="ghost" size="icon-sm" aria-label={theme.dark ? t().toLight : t().toDark} onclick={toggleTheme}>
				{#if theme.dark}<Sun />{:else}<Moon />{/if}
			</Button>
		</div>
	</header>

	<main class="mx-auto max-w-screen-2xl px-4 pb-10 sm:px-8">
		{@render children()}
	</main>

	{#if mounted && companion.on && !reading}<Companion color={(dojo ?? dojos[1]).hex.right} {days} />{/if}
</div>
