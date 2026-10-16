<script>
	import { resolve } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import { fmt } from '#lib/text.js';
	import { source, render, layout } from '#lib/mermaid.js';
	import IsoDiagram from '#lib/components/iso-diagram.svelte';
	import { answer, markDone, progressOf, restore, savePosition } from '#lib/progress.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Progress } from '#lib/components/ui/progress/index.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { focus, toggleFocus } from '#lib/focus.svelte.js';
	import { answered, companion, cue, hintFor } from '#lib/companion.svelte.js';
	import Cube from '#lib/components/cube.svelte';
	import { chaptersIn } from '#lib/content.js';
	import { lang, t } from '#lib/i18n.svelte.js';
	import Maximize from '@lucide/svelte/icons/maximize-2';
	import Minimize from '@lucide/svelte/icons/minimize-2';
	import Expand from '@lucide/svelte/icons/expand';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';
	import ZoomOut from '@lucide/svelte/icons/zoom-out';
	import X from '@lucide/svelte/icons/x';

	let { data } = $props();
	let dojo = $derived(data.dojo.id);
	let progress = $derived(progressOf(dojo));
	let all = $derived(chaptersIn(dojo, lang.current));
	let c = $derived(all[data.index]);
	let prev = $derived(all[data.index - 1]);
	let nextChapter = $derived(all[data.index + 1]);

	/** @typedef {{ id: string, label: string, quiz?: string }} Section */
	/** @type {Section[]} */
	let sections = $derived([
		...(prev ? [{ id: 'warmup', label: t().warmup, quiz: `${prev.slug}#0` }] : []),
		{ id: 'problem', label: t().problem },
		{ id: 'terms', label: t().terms },
		{ id: 'diagram', label: t().diagram },
		...(c.example ? [{ id: 'code', label: t().code }] : []),
		{ id: 'tradeoff', label: t().tradeoff },
		{ id: 'task', label: t().task },
		...c.quiz.map((_, i) => ({ id: `q${i}`, label: t().question(i + 1), quiz: `${c.slug}#${i}` })),
		{ id: 'wrap', label: t().wrap }
	]);

	let at = $state(0);
	let step = $state(0);
	let showHint = $state(false);
	let showAnswer = $state(false);
	/** Option picked per question id, e.g. picked['adrs#0'] = 2 */
	let picked = $state(/** @type {Record<string, number>} */ ({}));
	/** @type {HTMLElement | undefined} */
	let top = $state();

	// The task starts the second half, so a reader who stops before it stops at a natural break.
	let breakAt = $derived(sections.findIndex((s) => s.id === 'task'));

	const words = (/** @type {string[]} */ ...texts) => texts.join(' ').split(/\s+/).length;
	const READ = 200 / 60; // words per second
	/** Rough reading time in seconds, so the reader knows how much is left. @param {Section} s */
	function seconds(s) {
		if (s.id === 'problem') return words(...c.hook) / READ;
		if (s.id === 'terms') return words(...c.terms.map((x) => x.def)) / READ;
		if (s.id === 'diagram') return words(...c.diagram.steps.map((d) => d.note)) / READ + 10 * c.diagram.steps.length;
		if (s.id === 'code') return words(...(c.example?.notes ?? [])) / READ + 30;
		if (s.id === 'tradeoff') return words(...c.tradeoff.gain, ...c.tradeoff.cost) / READ;
		if (s.id === 'task') return words(c.task.prompt, ...c.task.answer) / READ + 90;
		if (s.id === 'wrap') return 20;
		return 30; // a question
	}
	let minutesLeft = $derived(Math.max(1, Math.round(sections.slice(at).reduce((sum, s) => sum + seconds(s), 0) / 60)));

	let current = $derived(sections[Math.min(at, sections.length - 1)]);
	let asked = $derived(
		current.id === 'warmup' ? prev && { from: prev, q: prev.quiz[0] } : current.quiz !== undefined ? { from: c, q: c.quiz[Number(current.id.slice(1))] } : undefined
	);
	let lastStep = $derived(c.diagram.steps.length - 1);
	let unanswered = $derived(sections.filter((s) => s.id.startsWith('q') && picked[s.quiz ?? ''] === undefined));

	const VIEW_KEY = 'dojo:view';
	/** @type {('flow' | 'cubes')[]} */
	const VIEWS = ['cubes', 'flow'];
	/** @type {'flow' | 'cubes'} */
	let view = $state('cubes');
	/** @type {import('#lib/mermaid.js').Scene | undefined} */
	let scene = $state();
	/** @type {HTMLDialogElement | undefined} */
	let dialog = $state();
	let zoomed = $state(false);
	let zoom = $state(1);

	let code = $derived(source(c.diagram, Math.min(step, lastStep), data.dojo.hex.right));

	$effect(() => {
		if (view !== 'cubes') return;
		let stale = false;
		layout(code).then((s) => {
			if (!stale) scene = s;
		});
		return () => (stale = true);
	});

	/** @param {'flow' | 'cubes'} v */
	function setView(v) {
		view = v;
		try {
			localStorage.setItem(VIEW_KEY, v);
		} catch {
			// The choice is a convenience; without storage it lasts for this page only.
		}
	}

	/** @type {HTMLElement | undefined} */
	let viewport = $state();

	/** Zooms around the middle of what is on screen, not the top-left corner. @param {number} to */
	async function setZoom(to) {
		const v = viewport;
		const next = Math.min(4, Math.max(1, to));
		if (!v || next === zoom) return;
		const cx = (v.scrollLeft + v.clientWidth / 2) / v.scrollWidth;
		const cy = (v.scrollTop + v.clientHeight / 2) / v.scrollHeight;
		zoom = next;
		await tick();
		v.scrollLeft = cx * v.scrollWidth - v.clientWidth / 2;
		v.scrollTop = cy * v.scrollHeight - v.clientHeight / 2;
	}

	function openZoom() {
		zoom = 1;
		zoomed = true;
		dialog?.showModal();
	}

	const resume = () => Math.min(progress.at[c.slug] ?? 0, sections.length - 1);

	// Moving to another chapter reuses this page: start it fresh, at the reader's saved section.
	$effect(() => {
		c.slug;
		untrack(() => {
			at = resume();
			step = 0;
			scene = undefined;
			showHint = showAnswer = false;
			picked = {};
		});
	});

	// Pages are prerendered, so the saved position is only readable after mount.
	onMount(() => {
		restore(dojo);
		at = resume();
		try {
			if (localStorage.getItem(VIEW_KEY) === 'flow') view = 'flow';
		} catch {
			// Falls back to the cube view.
		}
	});

	$effect(() => {
		if (!c.quiz.every((_, i) => picked[`${c.slug}#${i}`] !== undefined)) return;
		// Only the first time: re-answering a finished chapter is not a new win.
		if (!untrack(() => progress.done[c.slug])) cue('done');
		markDone(dojo, c.slug);
	});

	$effect(() => {
		companion.hint = asked && picked[current.quiz ?? ''] === undefined ? hintFor(asked.from, asked.q) : undefined;
		return () => (companion.hint = undefined);
	});

	/** @param {number} i */
	function go(i) {
		at = i;
		cue(sections[i]?.id === 'wrap' ? 'nod' : 'glance');
		savePosition(dojo, c.slug, i);
		if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ behavior: 'smooth' });
	}

	// One Next button for everything: inside "See it" it walks the diagram first.
	function next() {
		if (current.id === 'diagram' && step < lastStep) step++;
		else if (at < sections.length - 1) go(at + 1);
	}

	function back() {
		if (current.id === 'diagram' && step > 0) step--;
		else if (at > 0) go(at - 1);
	}

	/** @param {KeyboardEvent} e */
	function onkey(e) {
		if (e.altKey || e.ctrlKey || e.metaKey || (e.target instanceof HTMLElement && e.target.closest('input, textarea'))) return;
		if (zoomed) {
			// Escape is left to the dialog, which closes itself.
			if (e.key === 'ArrowRight' && step < lastStep) step++;
			else if (e.key === 'ArrowLeft' && step > 0) step--;
			else if (e.key === '+' || e.key === '=') setZoom(zoom + 0.5);
			else if (e.key === '-') setZoom(zoom - 0.5);
			return;
		}
		if (e.key === 'ArrowRight') next();
		else if (e.key === 'ArrowLeft') back();
		else if (e.key === 'z' && current.id === 'diagram') openZoom();
		else if (e.key === 'c' && current.id === 'diagram') setView(view === 'cubes' ? 'flow' : 'cubes');
		else if (e.key === 'f' || (e.key === 'Escape' && focus.on)) toggleFocus();
		else if (/^[1-9]$/.test(e.key) && current.quiz !== undefined) {
			const q = asked?.q;
			const i = Number(e.key) - 1;
			if (q && i < q.options.length) pick(current.quiz, q, i);
		}
	}

	/** @param {string} id @param {import('#lib/content.js').Question} q @param {number} i */
	function pick(id, q, i) {
		if (picked[id] !== undefined) return;
		picked[id] = i;
		answer(dojo, id, i === q.answer);
		answered(i === q.answer);
	}
</script>

<svelte:head><title>{c.title} · {data.dojo.name}</title></svelte:head>
<svelte:window onkeydown={onkey} />

{#snippet question(/** @type {string} */ id, /** @type {import('#lib/content.js').Question} */ q)}
	<div class="max-w-3xl space-y-3">
		<p class="text-xl leading-snug font-semibold">{@html fmt(q.q)}</p>
		<div class="grid gap-2">
			{#each q.options as option, i (i)}
				{@const done = picked[id] !== undefined}
				<Button
					variant={done && i === q.answer ? 'default' : done && i === picked[id] ? 'destructive' : 'outline'}
					class="h-auto w-full justify-start py-3 text-left text-base whitespace-normal"
					disabled={done && i !== q.answer && i !== picked[id]}
					onclick={() => pick(id, q, i)}
					><kbd class="mr-1 font-mono text-xs opacity-60">{i + 1}</kbd><span>{@html fmt(option)}</span></Button
				>
			{/each}
		</div>
		{#if picked[id] !== undefined}
			<Alert.Root variant={picked[id] === q.answer ? 'default' : 'destructive'}>
				<Alert.Title>{picked[id] === q.answer ? t().yes : t().notQuite}</Alert.Title>
				<Alert.Description class="text-base">{@html fmt(q.why)}</Alert.Description>
			</Alert.Root>
		{/if}
	</div>
{/snippet}

{#snippet picture(/** @type {'inline' | 'fit' | 'free'} */ size)}
	{@const limit = { inline: 'max-h-[65vh]', fit: 'max-h-[calc(100dvh-14rem)]', free: '' }[size]}
	{@const svgLimit = { inline: '[&_svg]:max-h-[65vh]', fit: '[&_svg]:max-h-[calc(100dvh-14rem)]', free: '' }[size]}
	{#if view === 'cubes' && scene}
		<IsoDiagram {scene} class="mx-auto h-auto w-full {limit}" />
	{:else if view === 'cubes'}
		<div class="text-muted-foreground flex min-h-80 items-center justify-center text-sm">{t().stacking}</div>
	{:else}
		<div class="flex min-h-80 items-center justify-center [&_svg]:h-auto [&_svg]:w-full [&_svg]:!max-w-full {svgLimit}" {@attach render(code)}></div>
	{/if}
{/snippet}

{#snippet viewToggle()}
	<div class="bg-background flex rounded-md border p-0.5 text-sm" role="group" aria-label={t().diagramView}>
		{#each VIEWS as v (v)}
			<button
				class="rounded px-2.5 py-1 {view === v ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground'}"
				aria-pressed={view === v}
				title={t().switchView}
				onclick={() => setView(v)}>{t()[v]}</button
			>
		{/each}
	</div>
{/snippet}

{#snippet stepper()}
	<div class="flex gap-1.5" role="group" aria-label={t().diagramSteps}>
		{#each c.diagram.steps as _, i (i)}
			<button
				class="h-2 flex-1 rounded-full transition-colors {i <= step ? 'bg-brand' : 'bg-muted'}"
				aria-label={t().diagramStep(i + 1)}
				onclick={() => (step = i)}
			></button>
		{/each}
	</div>
	<p class="text-muted-foreground font-mono text-xs">
		{t().stepOf(step + 1, c.diagram.steps.length)} · {view === 'cubes' ? t().newCubes : t().newBoxes}
	</p>
{/snippet}

<dialog
	bind:this={dialog}
	onclose={() => (zoomed = false)}
	class="bg-background text-foreground m-0 h-dvh max-h-none w-dvw max-w-none p-0 backdrop:bg-black/60"
>
	{#if zoomed}
		<div class="flex h-full flex-col">
			<div class="flex flex-wrap items-center gap-2 border-b px-4 py-2">
				<p class="mr-auto font-semibold">{c.title}</p>
				{@render viewToggle()}
				<Button variant="outline" size="icon" aria-label={t().zoomOut} title={t().zoomOutKey} disabled={zoom <= 1} onclick={() => setZoom(zoom - 0.5)}><ZoomOut /></Button>
				<span class="w-12 text-center font-mono text-sm">{zoom * 100}%</span>
				<Button variant="outline" size="icon" aria-label={t().zoomIn} title={t().zoomInKey} disabled={zoom >= 4} onclick={() => setZoom(zoom + 0.5)}><ZoomIn /></Button>
				<Button variant="ghost" size="icon" aria-label={t().close} title={t().closeKey} onclick={() => dialog?.close()}><X /></Button>
			</div>
			<div bind:this={viewport} class="min-h-0 flex-1 overflow-auto p-4">
				<div class="mx-auto" style="width: {zoom * 100}%">
					{@render picture(zoom === 1 ? 'fit' : 'free')}
				</div>
			</div>
			<div class="mx-auto w-full max-w-4xl space-y-2 border-t px-4 py-3">
				{@render stepper()}
				<div class="flex items-start gap-3">
					<Button variant="outline" size="sm" disabled={step === 0} onclick={() => step--}>←</Button>
					<p class="flex-1 leading-relaxed">{@html fmt(c.diagram.steps[step].note)}</p>
					<Button size="sm" disabled={step === lastStep} onclick={() => step++}>→</Button>
				</div>
			</div>
		</div>
	{/if}
</dialog>

<div bind:this={top} class="grid scroll-mt-4 gap-8 pt-4 {focus.on ? 'mx-auto max-w-4xl' : 'lg:grid-cols-[15rem_minmax(0,1fr)]'}">
	<aside class="hidden {focus.on ? '' : 'lg:block'}">
		<div class="sticky top-6 space-y-4">
			<div class="flex flex-wrap gap-1.5">
				<Badge>{t().day(data.index + 1)}</Badge>
				<Badge variant="outline">{c.minutes} min</Badge>
			</div>
			<p class="leading-snug font-semibold">{c.title}</p>
			<Progress value={((at + 1) / sections.length) * 100} class="[&_[data-slot=progress-indicator]]:bg-brand" />
			<nav aria-label={t().sections}>
				<ol class="space-y-0.5">
					{#each sections as s, i (s.id)}
						{@const answered = s.quiz !== undefined && picked[s.quiz] !== undefined}
						{#if i === 0 || i === breakAt}
							<li class="text-muted-foreground px-2 pt-3 pb-1 font-mono text-[11px] uppercase first:pt-0">
								{i === 0 ? t().learn : t().practice} · ~{Math.max(
									1,
									Math.round(sections.slice(i, i === 0 ? breakAt : undefined).reduce((sum, x) => sum + seconds(x), 0) / 60)
								)} min
							</li>
						{/if}
						<li>
							<button
								class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors
									{i === at ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}"
								aria-current={i === at ? 'step' : undefined}
								onclick={() => go(i)}
							>
								<Cube state={answered || (s.quiz === undefined && i < at) ? 'done' : i === at ? 'today' : 'todo'} class="size-5" />
								{s.label}
							</button>
						</li>
					{/each}
				</ol>
			</nav>
			<p class="text-muted-foreground text-xs leading-relaxed">{@html t().keys}</p>
		</div>
	</aside>

	<div class="flex min-h-[calc(100vh-6rem)] min-w-0 flex-col">
		<div class="space-y-2 {focus.on ? '' : 'lg:hidden'}">
			<div class="flex flex-wrap gap-1.5">
				<Badge>{t().day(data.index + 1)}</Badge>
				<Badge variant="outline">{c.minutes} min</Badge>
			</div>
			<p class="font-semibold">{c.title}</p>
			<Progress value={((at + 1) / sections.length) * 100} class="[&_[data-slot=progress-indicator]]:bg-brand" />
		</div>

		<p class="text-muted-foreground mt-4 font-mono text-xs uppercase {focus.on ? '' : 'lg:mt-0'}">
			{at + 1} / {sections.length} · {t().minLeft(minutesLeft)}
		</p>
		<h1 class="mt-1 mb-6 text-3xl font-bold tracking-tight">{current.label}</h1>

		<div class="flex-1 [overflow-wrap:anywhere]">
			{#if current.id === 'warmup' && prev}
				<p class="text-muted-foreground mb-4">{t().warmupIntro}</p>
				{@render question(`${prev.slug}#0`, prev.quiz[0])}
			{:else if current.id === 'problem'}
				<div class="max-w-3xl space-y-4 text-lg leading-relaxed">
					{#each c.hook as p, i (i)}<p>{@html fmt(p)}</p>{/each}
				</div>
			{:else if current.id === 'terms'}
				<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{#each c.terms as term (term.term)}
						<div class="bg-card rounded-2xl p-4">
							<p class="text-brand-ink mb-1 font-mono text-sm font-semibold">{term.term}</p>
							<p class="leading-relaxed">{@html fmt(term.def)}</p>
						</div>
					{/each}
				</div>
			{:else if current.id === 'diagram'}
				<div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
					<div class="bg-card relative rounded-2xl">
						<div class="absolute top-2 right-2 z-10 flex gap-1">
							{@render viewToggle()}
							<Button variant="outline" size="sm" title={t().enlargeKey} onclick={openZoom}><Expand />{t().enlarge}</Button>
						</div>
						<button class="block w-full cursor-zoom-in p-4 pt-12" aria-label={t().enlargeDiagram} onclick={openZoom}>
							{@render picture('inline')}
						</button>
					</div>
					<div class="space-y-4">
						{@render stepper()}
						<p class="text-lg leading-relaxed">{@html fmt(c.diagram.steps[step].note)}</p>
					</div>
				</div>
			{:else if current.id === 'code' && c.example}
				<a class="mb-4 inline-block font-mono text-sm underline" href={c.example.url} target="_blank" rel="noreferrer"
					>{c.example.repo} · {c.example.title} ↗</a
				>
				<div class="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
					<div class="code bg-muted overflow-x-auto rounded-xl p-4 font-mono text-xs leading-relaxed [tab-size:4] xl:self-start">{@html data.code}</div>
					<ul class="space-y-3">
						{#each c.example.notes as n, i (i)}
							<li class="border-brand/60 border-l-2 pl-3 leading-relaxed">{@html fmt(n)}</li>
						{/each}
					</ul>
				</div>
			{:else if current.id === 'tradeoff'}
				<div class="grid gap-4 md:grid-cols-2">
					<Card.Root class="border-t-good border-t-4">
						<Card.Header><Card.Title>{t().gain}</Card.Title></Card.Header>
						<Card.Content>
							<ul class="list-disc space-y-2 pl-5">{#each c.tradeoff.gain as g, i (i)}<li>{@html fmt(g)}</li>{/each}</ul>
						</Card.Content>
					</Card.Root>
					<Card.Root class="border-t-bad border-t-4">
						<Card.Header><Card.Title>{t().pay}</Card.Title></Card.Header>
						<Card.Content>
							<ul class="list-disc space-y-2 pl-5">{#each c.tradeoff.cost as g, i (i)}<li>{@html fmt(g)}</li>{/each}</ul>
						</Card.Content>
					</Card.Root>
				</div>
			{:else if current.id === 'task'}
				<div class="max-w-3xl space-y-4">
					<p class="text-muted-foreground">{t().taskIntro}</p>
					<p class="text-lg leading-relaxed font-semibold">{@html fmt(c.task.prompt)}</p>
					<div class="flex gap-2">
						{#if c.task.hint}<Button variant="outline" disabled={showHint} onclick={() => (showHint = true)}>{t().hint}</Button>{/if}
						<Button variant="secondary" disabled={showAnswer} onclick={() => (showAnswer = true)}>{t().showAnswer}</Button>
					</div>
					{#if showHint}
						<Alert.Root><Alert.Title>{t().hint}</Alert.Title><Alert.Description class="text-base">{@html fmt(c.task.hint ?? '')}</Alert.Description></Alert.Root>
					{/if}
					{#if showAnswer}
						<Alert.Root>
							<Alert.Title>{t().goodAnswer}</Alert.Title>
							<Alert.Description class="text-base">
								<ul class="list-disc space-y-1 pl-5">{#each c.task.answer as a, i (i)}<li>{@html fmt(a)}</li>{/each}</ul>
							</Alert.Description>
						</Alert.Root>
					{/if}
				</div>
			{:else if current.quiz !== undefined && current.id.startsWith('q')}
				<p class="text-muted-foreground mb-4">{t().quizIntro}</p>
				{@render question(current.quiz, c.quiz[Number(current.id.slice(1))])}
			{:else if current.id === 'wrap'}
				<div class="max-w-3xl space-y-6">
					<div class="border-brand/40 bg-brand/5 rounded-2xl border-2 p-6">
						<p class="text-muted-foreground mb-2 font-mono text-xs uppercase">{t().keepLine}</p>
						<p class="text-xl leading-snug font-semibold">{@html fmt(c.takeaway)}</p>
					</div>

					{#if progress.done[c.slug]}
						<Card.Root class="border-good">
							<Card.Header>
								<Card.Title>{t().doneToday}</Card.Title>
								<Card.Description>{t().comeBack}</Card.Description>
							</Card.Header>
						</Card.Root>
					{:else if unanswered.length}
						<div class="space-y-2">
							<p>{t().answerToFinish(unanswered.length)}</p>
							<div class="flex flex-wrap gap-2">
								{#each unanswered as s (s.id)}
									<Button variant="outline" size="sm" onclick={() => go(sections.indexOf(s))}>{s.label}</Button>
								{/each}
							</div>
						</div>
					{/if}

					<details class="text-muted-foreground text-sm">
						<summary class="cursor-pointer">{t().sources}</summary>
						<ul class="mt-2 list-disc space-y-1 pl-5">
							{#each c.sources as s (s.url)}<li><a class="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>{/each}
						</ul>
					</details>
				</div>
			{/if}
		</div>

		<div class="bg-background/95 sticky bottom-0 mt-8 flex items-center justify-between gap-2 border-t py-3 backdrop-blur">
			<div class="flex items-center gap-2">
				<Button variant="outline" disabled={at === 0 && !(current.id === 'diagram' && step > 0)} onclick={back}>{t().back}</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label={focus.on ? t().focusOff : t().focusOn}
					title={focus.on ? t().focusOffKey : t().focusOnKey}
					onclick={toggleFocus}
				>
					{#if focus.on}<Minimize />{:else}<Maximize />{/if}
				</Button>
			</div>
			{#if at === breakAt - 1}
				<p class="text-muted-foreground hidden text-center text-sm sm:block">{t().halfway}</p>
			{/if}
			{#if current.id === 'wrap'}
				{#if nextChapter && progress.done[c.slug]}
					<Button href={resolve('/[dojo]/c/[slug]', { dojo, slug: nextChapter.slug })}>{t().tomorrow(nextChapter.title)}</Button>
				{:else}
					<Button variant="secondary" href={resolve('/[dojo]', { dojo })}>{t().backHome}</Button>
				{/if}
			{:else}
				<Button onclick={next}>
					{current.id === 'diagram' && step < lastStep ? t().nextStep : `${sections[at + 1].label} →`}
				</Button>
			{/if}
		</div>
	</div>
</div>
