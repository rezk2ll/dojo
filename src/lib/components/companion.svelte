<script>
	import { onMount, untrack } from 'svelte';
	import { companion, react, SIZES } from '#lib/companion.svelte.js';

	/** @type {{ color: string }} */
	let { color } = $props();

	let size = $derived(SIZES[companion.size]);

	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();
	/** @type {ReturnType<typeof import('#lib/companion-scene.js').createScene> | undefined} */
	let view = $state();

	onMount(() => {
		let gone = false;
		/** @param {PointerEvent} e */
		const follow = (e) => view?.look(e.clientX, e.clientY);
		const leave = () => view?.look(-1e4, -1e4);
		/** @param {PointerEvent} e A tap on the cube itself is for the cube, so it stays put. */
		const tap = (e) => e.pointerType === 'touch' && e.target !== canvas && view?.poke(e.clientX, e.clientY);
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
		return () => {
			gone = true;
			removeEventListener('pointermove', follow);
			removeEventListener('pointerdown', tap);
			removeEventListener('keydown', wake);
			removeEventListener('scroll', scroll);
			document.documentElement.removeEventListener('pointerleave', leave);
			view?.dispose();
		};
	});

	$effect(() => view?.setColor(color));
	$effect(() => view?.resize(size));

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
	aria-hidden="true"
	onclick={() => react(true)}
></canvas>
