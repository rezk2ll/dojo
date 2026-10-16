<script>
	import { Button } from '#lib/components/ui/button/index.js';
	import { t } from '#lib/i18n.svelte.js';

	/** @type {{ minutes: number }} */
	let { minutes } = $props();

	let left = $state(minutes * 60);
	let running = $state(false);

	$effect(() => {
		if (!running) return;
		const id = setInterval(() => {
			left = Math.max(0, left - 1);
			if (left === 0) running = false;
		}, 1000);
		return () => clearInterval(id);
	});

	const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
</script>

<div class="bg-card flex flex-wrap items-center gap-4 rounded-2xl p-6">
	<p class="font-mono text-5xl tabular-nums {left === 0 ? 'text-brand-ink' : ''}" role="timer" aria-live="off">
		{pad(Math.floor(left / 60))}:{pad(left % 60)}
	</p>
	<div class="flex gap-2">
		{#if left === 0}
			<p class="font-semibold">{t().timeUp}</p>
		{:else}
			<Button onclick={() => (running = !running)}>{running ? t().pause : left === minutes * 60 ? t().start : t().resume}</Button>
		{/if}
		{#if left !== minutes * 60}
			<Button variant="outline" onclick={() => ((left = minutes * 60), (running = false))}>{t().restart}</Button>
		{/if}
	</div>
</div>
