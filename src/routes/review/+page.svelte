<script>
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { dojos } from '#lib/dojos/index.js';
	import { countMixed, dueQuestionIds, mixedToday, restore, DAILY_MIX } from '#lib/progress.svelte.js';
	import { shuffle } from '#lib/text.js';
	import { t } from '#lib/i18n.svelte.js';
	import ReviewSession from '#lib/components/review-session.svelte';
	import { Button } from '#lib/components/ui/button/index.js';

	/** @type {{ dojo: string, id: string }[]} */
	let queue = $state([]);
	let loaded = $state(false);
	let capped = $state(false);

	// Snapshot once, like a dojo's own review, and mixed across dojos up to the daily cap.
	onMount(() => {
		for (const d of dojos) restore(d.id); // this page's onMount runs before the layout's
		const due = dojos.flatMap((d) => dueQuestionIds(d.id).map((id) => ({ dojo: d.id, id })));
		const left = Math.max(0, DAILY_MIX - mixedToday());
		queue = shuffle(due).slice(0, left);
		capped = due.length > 0 && left === 0;
		loaded = true;
	});
</script>

<svelte:head><title>{t().review} · Dojo</title><meta name="robots" content="noindex" /></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pt-6">
	<h1 class="text-3xl font-bold tracking-tight">{t().review}</h1>

	{#if loaded && queue.length === 0}
		<p>{capped ? t().mixedDone : t().nothingToReview}</p>
		<Button variant="outline" href={resolve('/')}>{t().backHome}</Button>
	{:else}
		<ReviewSession {queue} showDojo doneHref={resolve('/')} doneLabel={t().backHome} onanswer={countMixed} />
	{/if}
</div>
