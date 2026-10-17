<script>
	import { onMount } from 'svelte';
	import { chaptersIn } from '#lib/content.js';
	import { dojos } from '#lib/dojos/index.js';
	import { progressOf, dueQuestionIds, dayKey, mixedToday, DAILY_MIX } from '#lib/progress.svelte.js';
	import { lang, link, t } from '#lib/i18n.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import Cubes from '#lib/components/cubes.svelte';

	let shownToday = $state(0);
	onMount(() => (shownToday = mixedToday()));

	let rows = $derived(
		dojos.map((dojo) => {
			const progress = progressOf(dojo.id);
			const chapters = chaptersIn(dojo.id, lang.current);
			const done = chapters.filter((c) => progress.done[c.slug]).length;
			const today = dayKey(new Date());
			return {
				dojo,
				chapters,
				done,
				next: chapters.find((c) => !progress.done[c.slug]),
				finishedToday: Object.values(progress.done).some((at) => dayKey(new Date(at)) === today),
				lastSeen: progress.days.at(-1) ?? '',
				due: dueQuestionIds(dojo.id).length
			};
		})
	);

	// The dojo used most recently comes first; a reader who has not started yet gets the first one.
	let pick = $derived([...rows].filter((r) => r.next).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))[0]);
	let due = $derived(Math.min(rows.reduce((n, r) => n + r.due, 0), Math.max(0, DAILY_MIX - shownToday)));
	let capped = $derived(shownToday >= DAILY_MIX && rows.some((r) => r.due > 0));
</script>

<div class="mx-auto max-w-5xl space-y-8 pt-6">
	<div class="max-w-3xl space-y-3">
		<h1 class="text-4xl font-bold tracking-tight">{t().hubTitle}</h1>
		<p class="text-muted-foreground text-lg">{t().hubText}</p>
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		{#if pick?.next}
			<div class="contents" data-dojo={pick.dojo.id} style="--hue: {pick.dojo.hue}; --chroma: {pick.dojo.chroma}">
				<Card.Root class="border-brand/40 bg-brand/5 border-2 shadow-none">
					<Card.Header>
						<Card.Description>{t().todayPick} · {pick.dojo.name}</Card.Description>
						<Card.Title class="text-2xl leading-snug">
							{pick.finishedToday ? t().doneToday : pick.next.title}
						</Card.Title>
						{#if pick.finishedToday}<Card.Description>{t().comeBack}</Card.Description>{/if}
					</Card.Header>
					{#if !pick.finishedToday}
						<Card.Footer>
							<Button size="lg" href={link('/[dojo]/c/[slug]', { dojo: pick.dojo.id, slug: pick.next.slug })}>
								{progressOf(pick.dojo.id).at[pick.next.slug] ? t().continueReading : t().startReading}
							</Button>
						</Card.Footer>
					{/if}
				</Card.Root>
			</div>
		{/if}

		{#if due > 0}
			<Card.Root>
				<Card.Header>
					<Card.Description>{t().warmUpFirst}</Card.Description>
					<Card.Title>{t().mixedReview(due)}</Card.Title>
				</Card.Header>
				<Card.Footer><Button variant="secondary" href={link('/review')}>{t().startReview}</Button></Card.Footer>
			</Card.Root>
		{:else if capped}
			<Card.Root>
				<Card.Header>
					<Card.Description>{t().review}</Card.Description>
					<Card.Title>{t().mixedDone}</Card.Title>
				</Card.Header>
			</Card.Root>
		{/if}
	</div>

	<section class="space-y-4">
		<h2 class="text-xl font-semibold">{t().dojos}</h2>
		<ul class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
			{#each rows as r (r.dojo.id)}
				<li class="contents" data-dojo={r.dojo.id} style="--hue: {r.dojo.hue}; --chroma: {r.dojo.chroma}">
					<a
						href={link('/[dojo]', { dojo: r.dojo.id })}
						class="bg-card hover:bg-muted flex flex-col items-center gap-3 rounded-2xl p-4 text-center shadow-[0_1px_2px_oklch(0_0_0/0.04)] transition-colors"
					>
						<Cubes
							pillars={[{ x: 0, y: 0, h: 150, fill: r.done / r.chapters.length, current: r === pick, label: `${r.dojo.name}: ${t().chaptersDone(r.done, r.chapters.length)}` }]}
							class="h-28 w-auto"
						/>
						<span class="font-semibold leading-snug">{r.dojo.name}</span>
						<span class="text-muted-foreground font-mono text-xs">{t().dojoDone(r.done, r.chapters.length)}</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
</div>
