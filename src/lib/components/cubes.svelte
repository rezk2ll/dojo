<script>
	import { SLOPE, iso, faces as box3 } from '#lib/iso.js';

	/** @type {{ pillars: { x: number, y: number, h: number, fill: number, label: string, current?: boolean }[], size?: number, class?: string }} */
	let { pillars, size = 60, class: klass = '' } = $props();

	const id = $props.id();
	// Pillars are narrower than the grid step, so light passes between them.
	let a = $derived(size * 0.62);
	let b = $derived(a * SLOPE);

	// Painter's order: pillars further back are drawn first.
	let drawn = $derived(
		pillars
			.map((p) => {
				const { X, Y } = iso(p.x * size, p.y * size);
				return { ...p, cx: X, cy: Y };
			})
			.sort((p, q) => p.x + p.y - (q.x + q.y))
	);

	let box = $derived.by(() => {
		const xs = drawn.flatMap((p) => [p.cx - a, p.cx + a]);
		const ys = drawn.flatMap((p) => [p.cy - p.h - b, p.cy + b]);
		const pad = 4;
		const x = Math.min(...xs) - pad;
		const y = Math.min(...ys) - pad;
		return `${x} ${y} ${Math.max(...xs) - x + pad} ${Math.max(...ys) - y + pad}`;
	});

	const faces = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ h) => box3(cx, cy, h, a);
</script>

<svg viewBox={box} class="text-brand {klass}" role="img" aria-label={pillars.map((p) => p.label).join(', ')}>
	<defs>
		{#each [['glass-l', 0.3, 0.02], ['glass-r', 0.45, 0.04], ['solid-l', 0.75, 0.3], ['solid-r', 0.95, 0.45]] as [name, top, bottom] (name)}
			<linearGradient id="{id}-{name}" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="currentColor" stop-opacity={top} />
				<stop offset="1" stop-color="currentColor" stop-opacity={bottom} />
			</linearGradient>
		{/each}
	</defs>
	{#each drawn as p, i (i)}
		{@const glass = faces(p.cx, p.cy, p.h)}
		{@const solid = faces(p.cx, p.cy, Math.max(p.fill * p.h, 0))}
		<g stroke="var(--background)" stroke-width="1.5" stroke-linejoin="round">
			<title>{p.label}</title>
			{#if p.fill > 0}
				<polygon points={solid.left} fill="url(#{id}-solid-l)" />
				<polygon points={solid.right} fill="url(#{id}-solid-r)" />
				<polygon points={solid.top} fill="currentColor" />
			{/if}
			<polygon points={glass.left} fill="url(#{id}-glass-l)" />
			<polygon points={glass.right} fill="url(#{id}-glass-r)" />
			<polygon points={glass.top} fill="currentColor" fill-opacity={p.current ? 0.7 : 0.25} />
		</g>
	{/each}
</svg>
