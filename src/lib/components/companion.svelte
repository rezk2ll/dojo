<script>
	import { onMount, untrack } from 'svelte';
	import { companion, react } from '#lib/companion.svelte.js';

	/** @type {{ color: string }} */
	let { color } = $props();

	const SIZE = 150;

	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();
	/** @type {ReturnType<typeof import('#lib/companion-scene.js').createScene> | undefined} */
	let view = $state();

	onMount(() => {
		let gone = false;
		/** @param {PointerEvent} e */
		const follow = (e) => {
			if (!canvas || !view) return;
			const r = canvas.getBoundingClientRect();
			view.look(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
		};
		// three.js is large, so it loads only once the page is up, in its own chunk.
		import('#lib/companion-scene.js').then(({ createScene }) => {
			if (gone || !canvas) return;
			view = createScene(canvas, { color: untrack(() => color), still: matchMedia('(prefers-reduced-motion: reduce)').matches });
			view.resize(SIZE, SIZE);
		});
		addEventListener('pointermove', follow, { passive: true });
		return () => {
			gone = true;
			removeEventListener('pointermove', follow);
			view?.dispose();
		};
	});

	$effect(() => view?.setColor(color));

	$effect(() => {
		if (companion.beat && view) untrack(() => view?.react(companion.mood));
	});
</script>

<canvas
	bind:this={canvas}
	class="fixed right-1 bottom-16 z-40 cursor-pointer"
	style="width: {SIZE}px; height: {SIZE}px"
	aria-hidden="true"
	onclick={() => react(true)}
></canvas>
