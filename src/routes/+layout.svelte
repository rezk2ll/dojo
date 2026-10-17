<script>
	import './layout.css';
	import { asset, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { dueQuestionIds, mixedToday, progressOf, restore, DAILY_MIX } from '#lib/progress.svelte.js';
	import { dojos, dojoById } from '#lib/dojos/index.js';
	import { theme, initTheme, toggleTheme } from '#lib/theme.svelte.js';
	import { focus, initFocus } from '#lib/focus.svelte.js';
	import { initLang, lang, toggleLang, t } from '#lib/i18n.svelte.js';
	import { chaptersIn } from '#lib/content.js';
	import { plain } from '#lib/text.js';

	const SITE = 'https://ferjani.dev';
	const ROOT = `${SITE}/dojo`;
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
	let chapter = $derived(dojo && page.params.slug ? chaptersIn(dojo.id, lang.current)[page.data.index] : undefined);
	// Search engines cut descriptions around 160 characters, so end on a whole word.
	const clip = (/** @type {string} */ s) => (s.length <= 160 ? s : `${s.slice(0, 157).replace(/\s+\S*$/, '')}…`);
	let description = $derived(chapter ? clip(plain(chapter.hook[0])) : dojo ? dojo.description[lang.current] : t().description);
	// The site is also built for GitHub Pages; search engines should index ferjani.dev only.
	let url = $derived(`${SITE}${page.url.pathname}`);
	let ogTitle = $derived(chapter ? `${chapter.title} · ${dojo?.name}` : (dojo?.name ?? 'Dojo'));
	let jsonLd = $derived.by(() => {
		const course = dojo && {
			'@type': 'Course',
			name: dojo.name,
			description: dojo.description[lang.current],
			url: `${ROOT}/${dojo.id}/`,
			inLanguage: lang.current,
			isAccessibleForFree: true,
			provider: { '@type': 'Person', name: 'Khaled Ferjani', url: 'https://ferjani.dev' }
		};
		const data = chapter
			? {
					'@type': 'LearningResource',
					name: chapter.title,
					description,
					url,
					inLanguage: lang.current,
					timeRequired: `PT${chapter.minutes}M`,
					learningResourceType: 'Lesson',
					isAccessibleForFree: true,
					isPartOf: course
				}
			: course;
		if (!data) return '';
		const json = JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c');
		return `<script type="application/ld+json">${json}<` + '/script>';
	});
	// Each dojo installs as its own app, so its icons and manifest live under its own path.
	let dir = $derived(dojo ? `/${dojo.id}` : '');
	let reading = $derived(focus.on && page.route.id === '/[dojo]/c/[slug]');
	let mounted = $state(false);
	// On the hub, a day counts if any dojo was practised.
	let days = $derived(dojo ? progressOf(dojo.id).days : dojos.flatMap((d) => progressOf(d.id).days));
	// Cards fall due as time passes, not only when progress changes, so the count is redone every minute.
	let minute = $state(0);
	let due = $derived.by(() => {
		minute;
		if (page.route.id?.endsWith('/review')) return 0;
		if (dojo) return dueQuestionIds(dojo.id).length;
		return Math.min(
			dojos.reduce((n, d) => n + dueQuestionIds(d.id).length, 0),
			Math.max(0, DAILY_MIX - mixedToday())
		);
	});
	let offer = $derived(
		due ? { label: String(due), title: t().cubeReview(due), href: dojo ? resolve('/[dojo]/review', { dojo: dojo.id }) : resolve('/review') } : undefined
	);

	onMount(() => {
		for (const d of dojos) restore(d.id);
		initTheme();
		initFocus();
		initLang();
		initCompanion();
		mounted = true;
		const clock = setInterval(() => minute++, 60_000);
		return () => clearInterval(clock);
	});
</script>

<svelte:head>
	<title>{dojo?.name ?? 'Dojo'}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta property="og:type" content={chapter ? 'article' : 'website'} />
	<meta property="og:site_name" content="Dojo" />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={url} />
	<meta property="og:locale" content={lang.current === 'fr' ? 'fr_FR' : 'en_US'} />
	<meta property="og:image" content={`${ROOT}${dir}/icon-512.png`} />
	<meta name="twitter:card" content="summary" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLd}
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

	{#if mounted && companion.on && !reading}<Companion color={(dojo ?? dojos[1]).hex.right} outfit={dojo?.id ?? ''} {days} {offer} />{/if}
</div>
