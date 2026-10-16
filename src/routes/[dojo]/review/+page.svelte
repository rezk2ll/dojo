<script>
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { dayKey, dueCardIds, exportProgress, parseProgress, progressOf, replaceProgress, restore, INTERVAL_DAYS } from '#lib/progress.svelte.js';
	import { questionById } from '#lib/content.js';
	import { shuffle } from '#lib/text.js';
	import { t } from '#lib/i18n.svelte.js';
	import Cubes from '#lib/components/cubes.svelte';
	import ReviewSession from '#lib/components/review-session.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';

	let { data } = $props();
	let id = $derived(data.dojo.id);
	let progress = $derived(progressOf(id));

	/** @type {{ dojo: string, id: string }[]} */
	let queue = $state([]);
	let loaded = $state(false);

	// One tower per box, left to right; it grows with the questions in it.
	let boxes = $derived(
		INTERVAL_DAYS.map((days, box) => {
			const n = Object.values(progress.cards).filter((c) => c.box === box).length;
			return { x: box * 0.8, y: -box * 0.8, h: 12 + Math.min(n, 12) * 12, fill: n ? 1 : 0, label: t().box(days, n), days, n };
		})
	);

	onMount(() => {
		restore(id); // this page's onMount runs before the layout's, so restore here too
		load();
	});

	// Snapshot once: answering a card reschedules it, it should not vanish mid-session.
	// Shuffled so questions from different chapters mix, which helps telling patterns apart.
	function load() {
		queue = shuffle(dueCardIds(id).filter((card) => questionById(id, card, 'en'))).map((card) => ({ dojo: id, id: card }));
		loaded = true;
	}

	/** @type {HTMLInputElement} */
	let fileInput;
	/** @type {{ ok: boolean, text: 'notAFile' | 'loaded' } | undefined} */
	let backup = $state();

	function download() {
		// A data URL, unlike a blob URL, has nothing to revoke before the browser has read it.
		const a = document.createElement('a');
		a.href = `data:application/json,${encodeURIComponent(exportProgress(id))}`;
		a.download = `${id}-dojo-progress-${dayKey(new Date())}.json`;
		a.click();
	}

	const chaptersIn = (/** @type {{ done: object }} */ s) => t().chaptersCount(Object.keys(s.done).length);

	async function upload(/** @type {Event & { currentTarget: HTMLInputElement }} */ e) {
		const file = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (!file) return;
		let saved;
		try {
			saved = parseProgress(id, await file.text());
		} catch {
			backup = { ok: false, text: 'notAFile' };
			return;
		}
		if (!confirm(t().replace(chaptersIn(progress), chaptersIn(saved)))) return;
		replaceProgress(id, saved);
		load();
		backup = { ok: true, text: 'loaded' };
	}
</script>

<svelte:head><title>{t().review} · {data.dojo.name}</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pt-6">
	<h1 class="text-3xl font-bold tracking-tight">{t().review}</h1>

	{#if loaded && queue.length === 0}
		<p>{t().nothingToReview}</p>
		<Button variant="outline" href={resolve('/[dojo]', { dojo: id })}>{t().backToToday}</Button>
	{:else}
		{#key queue}
			<ReviewSession {queue} doneHref={resolve('/[dojo]', { dojo: id })} doneLabel={t().reviewDone} />
		{/key}
	{/if}

	{#if loaded && Object.keys(progress.cards).length}
		<figure class="bg-card space-y-3 rounded-2xl p-5">
			<div class="mx-auto w-fit max-w-full space-y-2">
				<Cubes pillars={boxes} size={44} class="h-40 w-auto max-w-full" />
				<div class="text-muted-foreground grid grid-cols-5 text-center font-mono text-xs">
					{#each boxes as b (b.days)}<span><span class="text-foreground font-semibold">{b.n}</span><br />{t().boxDays(b.days)}</span>{/each}
				</div>
			</div>
			<figcaption class="text-muted-foreground text-center text-sm">{t().towersCaption}</figcaption>
		</figure>
	{/if}

	<section class="space-y-3 border-t pt-6">
		<h2 class="font-semibold">{t().yourProgress}</h2>
		<p class="text-muted-foreground text-sm">{t().progressHere}</p>
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={download}>{t().download}</Button>
			<Button variant="outline" size="sm" onclick={() => fileInput.click()}>{t().load}</Button>
			<input bind:this={fileInput} type="file" accept="application/json,.json" class="hidden" onchange={upload} />
		</div>
		{#if backup}
			<Alert.Root variant={backup.ok ? 'default' : 'destructive'}>
				<Alert.Description>{t()[backup.text]}</Alert.Description>
			</Alert.Root>
		{/if}
	</section>
</div>
