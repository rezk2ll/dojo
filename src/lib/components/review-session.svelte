<script>
	import { fmt } from '#lib/text.js';
	import { answer } from '#lib/progress.svelte.js';
	import { answered, companion, hintFor } from '#lib/companion.svelte.js';
	import { questionById } from '#lib/content.js';
	import { dojoById } from '#lib/dojos/index.js';
	import { lang, t } from '#lib/i18n.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';

	/**
	 * Card ids, not questions, so a language switch mid-session shows the same questions translated.
	 * @type {{ queue: { dojo: string, id: string }[], doneHref: string, doneLabel: string, showDojo?: boolean, onanswer?: () => void }}
	 */
	let { queue, doneHref, doneLabel, showDojo = false, onanswer } = $props();

	let i = $state(0);
	/** @type {number | undefined} */
	let picked = $state();

	let card = $derived(queue[i]);
	let current = $derived(card && questionById(card.dojo, card.id, lang.current));
	let q = $derived(current?.question);
	let dojo = $derived(card && dojoById(card.dojo));

	$effect(() => {
		companion.hint = current && q && picked === undefined ? hintFor(current.chapter, q) : undefined;
		return () => (companion.hint = undefined);
	});

	function pick(/** @type {number} */ option) {
		if (picked !== undefined || !q) return;
		picked = option;
		answer(card.dojo, card.id, option === q.answer);
		answered(option === q.answer);
		onanswer?.();
	}

	function next() {
		i += 1;
		picked = undefined;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.altKey || e.ctrlKey || e.metaKey || !q) return;
		if (/^[1-9]$/.test(e.key) && Number(e.key) <= q.options.length) pick(Number(e.key) - 1);
		else if (e.key === 'ArrowRight' && picked !== undefined && i + 1 < queue.length) next();
	}}
/>

{#if q && current && dojo}
	<div class="contents" data-dojo={dojo.id} style="--hue: {dojo.hue}; --chroma: {dojo.chroma}">
		<Card.Root class={showDojo ? 'border-brand/50 border-t-4' : ''}>
			<Card.Header>
				<Card.Description>
					{t().reviewMeta(i + 1, queue.length, showDojo ? t().fromDojo(dojo.name, current.chapter.title) : current.chapter.title)}
				</Card.Description>
				<Card.Title class="leading-snug">{@html fmt(q.q)}</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-2">
				{#each q.options as option, n (n)}
					{@const done = picked !== undefined}
					<Button
						variant={done && n === q.answer ? 'default' : done && n === picked ? 'destructive' : 'outline'}
						class="h-auto w-full justify-start py-2 text-left whitespace-normal"
						disabled={done && n !== q.answer && n !== picked}
						onclick={() => pick(n)}><span>{@html fmt(option)}</span></Button
					>
				{/each}
				{#if picked !== undefined}
					<Alert.Root variant={picked === q.answer ? 'default' : 'destructive'}>
						<Alert.Title>{picked === q.answer ? t().yes : t().notQuite}</Alert.Title>
						<Alert.Description>{@html fmt(q.why)}</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
			{#if picked !== undefined}
				<Card.Footer>
					{#if i + 1 < queue.length}
						<Button onclick={next}>{t().next}</Button>
					{:else}
						<Button href={doneHref}>{doneLabel}</Button>
					{/if}
				</Card.Footer>
			{/if}
		</Card.Root>
	</div>
{/if}
