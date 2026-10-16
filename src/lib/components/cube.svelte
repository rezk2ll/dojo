<script>
	import { SLOPE, faces } from '#lib/iso.js';

	/** @type {{ state?: 'done' | 'today' | 'todo', label?: string | number, class?: string }} */
	let { state = 'todo', label = '', class: klass = '' } = $props();

	const id = $props.id();
	const A = 10;
	const B = A * SLOPE;
	// A true cube: in this view a vertical edge is the half width over cos 30°.
	const H = A / Math.cos(Math.PI / 6);
	const f = faces(0, 0, H, A);
	const tone = { done: 'var(--brand)', today: 'var(--brand)', todo: 'var(--muted-foreground)' };
	const fill = { done: [0.95, 0.75, 1], today: [0.15, 0.25, 0.4], todo: [0.08, 0.14, 0.2] };
</script>

<svg viewBox="{-A - 1} {-H - B - 1} {2 * A + 2} {H + 2 * B + 2}" class="shrink-0 overflow-visible {klass}" aria-hidden="true">
	{#if state === 'today'}
		<defs>
			<filter id="{id}-glow" x="-50%" y="-50%" width="200%" height="200%">
				<feGaussianBlur stdDeviation="2.2" />
			</filter>
		</defs>
		<polygon points={f.left} fill={tone.today} opacity="0.45" filter="url(#{id}-glow)" />
		<polygon points={f.right} fill={tone.today} opacity="0.45" filter="url(#{id}-glow)" />
	{/if}
	<g stroke={state === 'done' ? 'var(--background)' : tone[state]} stroke-opacity={state === 'todo' ? 0.45 : 1} stroke-width={state === 'today' ? 1.2 : 0.8} stroke-linejoin="round">
		<polygon points={f.left} fill={tone[state]} fill-opacity={fill[state][0]} />
		<polygon points={f.right} fill={tone[state]} fill-opacity={fill[state][1]} />
		<polygon points={f.top} fill={tone[state]} fill-opacity={fill[state][2]} />
	</g>
	{#if label !== ''}
		<text
			y={-H + 2.6}
			text-anchor="middle"
			font-size="7.5"
			font-weight="600"
			class="font-mono"
			fill={state === 'done' ? 'var(--background)' : state === 'today' ? 'var(--background)' : 'var(--muted-foreground)'}>{label}</text
		>
	{/if}
</svg>
