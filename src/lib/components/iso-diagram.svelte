<script>
	import { SLOPE, iso, faces } from '#lib/iso.js';

	/** @type {{ scene: import('#lib/mermaid.js').Scene, class?: string }} */
	let { scene, class: klass = '' } = $props();

	const id = $props.id();
	// Close to Mermaid's own spacing, which already leaves room for each label.
	const K = 0.9;
	const A = 34;
	const B = A * SLOPE;
	const LINE = 17;
	const tones = { hl: 'var(--brand)', base: 'var(--muted-foreground)', ext: 'var(--muted-foreground)' };

	/** @param {string} text */
	function wrap(text, width = 22, max = 3) {
		/** @type {string[]} */
		const lines = [];
		for (const w of text.split(/\s+/)) {
			const last = lines.at(-1);
			if (last !== undefined && (last + ' ' + w).length <= width) lines[lines.length - 1] = last + ' ' + w;
			else lines.push(w);
		}
		return lines.length > max ? [...lines.slice(0, max - 1), lines.slice(max - 1).join(' ').slice(0, width - 1) + '…'] : lines;
	}

	let nodes = $derived(
		scene.nodes
			.map((n) => {
				const g = { x: n.x * K, y: n.y * K };
				const h = n.hl ? 58 : n.ext ? 22 : 36;
				return { ...n, g, ...iso(g.x, g.y), h, lines: wrap(n.label) };
			})
			.sort((p, q) => p.g.x + p.g.y - (q.g.x + q.g.y))
	);
	let byId = $derived(new Map(nodes.map((n) => [n.id, n])));

	let edges = $derived(
		scene.edges.flatMap((e) => {
			const s = byId.get(e.from);
			const t = byId.get(e.to);
			if (!s || !t) return [];
			const dx = t.X - s.X;
			const dy = t.Y - s.Y;
			const len = Math.hypot(dx, dy) || 1;
			// Stop the line at the edge of each cube's footprint, not at its center.
			const cut = Math.min(A * 1.1, len / 3);
			const u = { x: dx / len, y: dy / len };
			return [{ ...e, x1: s.X + u.x * cut, y1: s.Y + u.y * cut, x2: t.X - u.x * cut, y2: t.Y - u.y * cut }];
		})
	);

	let plates = $derived(
		scene.groups.flatMap((grp) => {
			const members = grp.nodes.map((m) => byId.get(m)).filter((n) => n !== undefined);
			if (!members.length) return [];
			const pad = 50;
			const x0 = Math.min(...members.map((n) => n.g.x)) - pad;
			const x1 = Math.max(...members.map((n) => n.g.x)) + pad;
			const y0 = Math.min(...members.map((n) => n.g.y)) - pad;
			const y1 = Math.max(...members.map((n) => n.g.y)) + pad;
			const corners = [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)];
			return [{ ...grp, points: corners.map((c) => `${c.X},${c.Y}`).join(' '), front: corners[2], left: corners[3].X }];
		})
	);

	let box = $derived.by(() => {
		const xs = [...nodes.flatMap((n) => [n.X - A - 70, n.X + A + 70]), ...plates.map((p) => p.left - 10)];
		const ys = [
			...nodes.flatMap((n) => [n.Y - n.h - B - 12 - n.lines.length * LINE, n.Y + B + 8]),
			...plates.flatMap((p) => [...p.points.split(' ').map((q) => Number(q.split(',')[1])), p.front.Y + 26])
		];
		if (!xs.length) return '0 0 100 100';
		const x = Math.min(...xs);
		const y = Math.min(...ys) - 10;
		return `${x} ${y} ${Math.max(...xs) - x} ${Math.max(...ys) - y + 10}`;
	});
</script>

<!-- Never drawn larger than 1.4x, so a two-box step does not turn into a poster. -->
<svg viewBox={box} class={klass} style="max-width: min(100%, {Number(box.split(' ')[2]) * 1.4}px)" role="img" aria-label={scene.nodes.map((n) => n.label).join(', ')}>
	<defs>
		{#each Object.entries(tones) as [tone, color] (tone)}
			{#each [['l', 0.55, 0.15], ['r', 0.8, 0.25]] as [side, top, bottom] (side)}
				<linearGradient id="{id}-{tone}-{side}" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color={color} stop-opacity={tone === 'hl' ? Number(top) + 0.2 : top} />
					<stop offset="1" stop-color={color} stop-opacity={bottom} />
				</linearGradient>
			{/each}
		{/each}
		<marker id="{id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
			<path d="M0,0 L10,5 L0,10 z" fill="var(--muted-foreground)" />
		</marker>
	</defs>

	{#each plates as p (p.id)}
		<polygon points={p.points} fill="var(--muted)" fill-opacity="0.6" stroke="var(--border)" stroke-width="1.5" stroke-dasharray="6 4" />
	{/each}

	{#each edges as e, i (i)}
		<g>
			{#if e.label}<title>{e.label}</title>{/if}
			<line
				x1={e.x1}
				y1={e.y1}
				x2={e.x2}
				y2={e.y2}
				stroke="var(--muted-foreground)"
				stroke-width="2"
				stroke-dasharray={e.dashed ? '5 4' : undefined}
				marker-end="url(#{id}-arrow)"
			/>
			<line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="transparent" stroke-width="14" />
		</g>
	{/each}

	{#each nodes as n (n.id)}
		{@const f = faces(0, 0, n.h, A)}
		{@const tone = n.hl ? 'hl' : n.ext ? 'ext' : 'base'}
		<g class="cube" style="transform: translate({n.X}px, {n.Y}px)" stroke="var(--background)" stroke-width="1.5" stroke-linejoin="round">
			<title>{n.label}</title>
			<polygon points={f.left} fill="url(#{id}-{tone}-l)" />
			<polygon points={f.right} fill="url(#{id}-{tone}-r)" />
			<polygon
				points={f.top}
				fill={tones[tone]}
				fill-opacity={n.hl ? 1 : n.ext ? 0.15 : 0.45}
				stroke={n.ext ? 'var(--muted-foreground)' : undefined}
				stroke-dasharray={n.ext ? '4 3' : undefined}
			/>
		</g>
	{/each}

	{#each plates as p (p.id)}
		<text x={p.front.X} y={p.front.Y + 22} text-anchor="middle" font-size="13" fill="var(--muted-foreground)" class="halo font-mono">{p.title}</text>
	{/each}

	{#each nodes as n (n.id)}
		<text
			class="halo cube"
			style="transform: translate({n.X}px, {n.Y - n.h - B - 10 - (n.lines.length - 1) * LINE}px)"
			text-anchor="middle"
			font-size="14"
			font-weight={n.hl ? 700 : 500}
			fill={n.hl ? 'var(--brand-ink)' : 'var(--foreground)'}
		>
			{#each n.lines as line, i (i)}<tspan x="0" dy={i ? LINE : 0}>{line}</tspan>{/each}
		</text>
	{/each}
</svg>

<style>
	.cube {
		transition: transform 0.5s ease;
	}
	.halo {
		paint-order: stroke;
		stroke: var(--background);
		stroke-width: 4px;
		stroke-linejoin: round;
	}
</style>
