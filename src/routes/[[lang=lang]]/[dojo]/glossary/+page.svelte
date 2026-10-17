<script>
	import { fmt, matcher } from '#lib/text.js';
	import { chaptersIn } from '#lib/content.js';
	import { lang, link, t } from '#lib/i18n.svelte.js';

	let { data } = $props();
	let entries = $derived(
		chaptersIn(data.dojo.id, lang.current)
			.flatMap((chapter) => chapter.terms.map((x) => ({ ...x, chapter })))
			.sort((a, b) => a.term.localeCompare(b.term, lang.current, { sensitivity: 'base' }))
	);

	let query = $state('');
	let shown = $derived.by(() => {
		const matches = matcher(query);
		return entries.filter((e) => matches([e.term, e.def]));
	});
</script>

<svelte:head><title>{t().glossary} · {data.dojo.name}</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pt-6">
	<h1 class="text-3xl font-bold tracking-tight">{t().glossary}</h1>
	<input
		type="search"
		bind:value={query}
		placeholder={t().filterTerms(entries.length)}
		aria-label={t().filterLabel}
		class="bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 outline-none focus-visible:ring-2"
	/>
	{#if shown.length === 0}
		<p class="text-muted-foreground">{t().noTerm(query.trim())}</p>
	{/if}
	<dl class="space-y-3">
		{#each shown as e (e.chapter.slug + e.term)}
			<div class="bg-card rounded-2xl p-4">
				<dt class="text-brand-ink mb-1 font-mono text-sm font-semibold">{e.term}</dt>
				<dd class="leading-relaxed">{@html fmt(e.def)}</dd>
				<dd class="text-muted-foreground mt-2 text-sm">
					<a class="hover:underline" href={link('/[dojo]/c/[slug]', { dojo: data.dojo.id, slug: e.chapter.slug })}>{e.chapter.title}</a>
				</dd>
			</div>
		{/each}
	</dl>
</div>
