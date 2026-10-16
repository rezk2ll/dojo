<script>
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { companion, cue, eyesInUse, react, setCompanion, SECRET_EYES, SIZES } from '#lib/companion.svelte.js';
	import { activeToday, streak } from '#lib/progress.svelte.js';
	import { fmt } from '#lib/text.js';
	import { t } from '#lib/i18n.svelte.js';

	// Long enough that a reader who knows the answer never sees it.
	const HINT_AFTER = 12_000;
	const CATCH_WITHIN = 10_000;

	/** @type {{ color: string, outfit: string, days: string[], offer?: { label: string, title: string, href: string } }} */
	let { color, outfit, days, offer } = $props();

	let size = $derived(SIZES[companion.size]);
	// Refreshed every minute, so the evening reminder lights up without a reload.
	let hour = $state(new Date().getHours());
	let needsYou = $derived(hour >= 18 && !activeToday(days));

	let hintReady = $state(false);
	let hintOpen = $state(false);
	$effect(() => {
		hintReady = hintOpen = false;
		if (!companion.hint) return;
		const timer = setTimeout(() => (hintReady = true), HINT_AFTER);
		return () => clearTimeout(timer);
	});
	let shown = $derived(hintReady ? { label: '?', title: t().cubeHint } : offer);

	/** @type {number[]} */
	let catches = [];

	function onclick() {
		if (hintReady) hintOpen = !hintOpen;
		else if (offer) goto(offer.href);
		else {
			react(true);
			// It dodges the pointer, so three clicks in a row means someone caught it.
			const now = performance.now();
			catches = [...catches.filter((at) => now - at < CATCH_WITHIN), now];
			if (catches.length >= 3 && !companion.caught) {
				setCompanion({ caught: true, eyes: SECRET_EYES });
				cue('caught');
			}
		}
	}

	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();
	/** @type {ReturnType<typeof import('#lib/companion-scene.js').createScene> | undefined} */
	let view = $state();

	onMount(() => {
		let gone = false;
		/** @param {PointerEvent} e */
		const follow = (e) => view?.look(e.clientX, e.clientY);
		const leave = () => view?.look(-1e4, -1e4);
		/** @param {PointerEvent} e A tap on the cube stays put only while it offers something; otherwise it runs, so catching it takes a chase. */
		const tap = (e) => e.pointerType === 'touch' && (e.target !== canvas || !shown) && view?.poke(e.clientX, e.clientY);
		// three.js is large, so it loads only once the page is up, in its own chunk.
		import('#lib/companion-scene.js').then(({ createScene }) => {
			if (gone || !canvas) return;
			view = createScene(canvas, {
				color: untrack(() => color),
				still: matchMedia('(prefers-reduced-motion: reduce)').matches,
				touch: matchMedia('(pointer: coarse)').matches
			});
		});
		addEventListener('pointermove', follow, { passive: true });
		addEventListener('pointerdown', tap, { passive: true });
		const wake = () => view?.wake();
		let lastY = scrollY;
		const scroll = () => {
			view?.scrolled(scrollY - lastY);
			lastY = scrollY;
		};
		addEventListener('keydown', wake);
		addEventListener('scroll', scroll, { passive: true });
		document.documentElement.addEventListener('pointerleave', leave);
		const clock = setInterval(() => (hour = new Date().getHours()), 60_000);
		return () => {
			gone = true;
			clearInterval(clock);
			removeEventListener('pointermove', follow);
			removeEventListener('pointerdown', tap);
			removeEventListener('keydown', wake);
			removeEventListener('scroll', scroll);
			document.documentElement.removeEventListener('pointerleave', leave);
			view?.dispose();
		};
	});

	$effect(() => view?.setColor(color));
	$effect(() => view?.setOutfit(outfit));
	$effect(() => view?.setEyes(eyesInUse()));
	$effect(() => view?.resize(size));
	$effect(() => view?.setCombo(companion.combo));
	$effect(() => view?.setStreak({ days: streak(days), needsYou }));
	$effect(() => view?.setOffer(shown?.label));

	$effect(() => {
		if (companion.beat && view) untrack(() => view?.react(companion.mood));
	});

	$effect(() => {
		if (companion.cueBeat && view) untrack(() => companion.cue && view?.cue(companion.cue));
	});
</script>

<canvas
	bind:this={canvas}
	class="fixed right-1 bottom-16 z-40 cursor-pointer"
	style="width: {size}px; height: {size}px"
	aria-hidden={shown ? undefined : 'true'}
	role={shown ? 'button' : undefined}
	tabindex={shown ? 0 : undefined}
	aria-label={shown?.title}
	title={shown?.title}
	{onclick}
	onkeydown={(e) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		onclick();
	}}
></canvas>

{#if hintOpen && companion.hint}
	<div
		role="status"
		class="bg-card fixed right-4 z-40 max-w-xs rounded-2xl border p-4 text-sm leading-relaxed shadow-lg"
		style="bottom: calc(4rem + {size}px)"
	>
		<p class="text-brand-ink mb-1 font-mono font-semibold">{companion.hint.term}</p>
		<p>{@html fmt(companion.hint.def)}</p>
	</div>
{/if}
