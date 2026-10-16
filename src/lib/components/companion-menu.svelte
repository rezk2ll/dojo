<script>
	import { companion, setCompanion, SIZES } from '#lib/companion.svelte.js';
	import { t } from '#lib/i18n.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Box from '@lucide/svelte/icons/box';

	const sizes = /** @type {(keyof typeof SIZES)[]} */ (Object.keys(SIZES));
</script>

<Button
	variant="ghost"
	size="icon-sm"
	class={companion.on ? '' : 'opacity-50'}
	aria-label={t().cubeMenu}
	title={t().cubeMenu}
	popovertarget="companion-menu"
>
	<Box />
</Button>

<div
	id="companion-menu"
	popover
	class="bg-popover text-popover-foreground fixed inset-auto top-16 right-4 m-0 w-64 space-y-4 rounded-xl border p-4 shadow-lg"
>
	<label class="flex items-center justify-between gap-3 text-sm font-semibold">
		{t().showCube}
		<input type="checkbox" class="accent-brand size-4" checked={companion.on} onchange={(e) => setCompanion({ on: e.currentTarget.checked })} />
	</label>
	<div class="space-y-1.5">
		<p class="text-muted-foreground text-xs">{t().cubeSize}</p>
		<div class="flex rounded-md border p-0.5 text-sm" role="group" aria-label={t().cubeSize}>
			{#each sizes as size (size)}
				<button
					class="flex-1 rounded px-2 py-1 {companion.size === size ? 'bg-muted font-semibold' : 'text-muted-foreground hover:text-foreground'}"
					aria-pressed={companion.size === size}
					disabled={!companion.on}
					onclick={() => setCompanion({ size })}>{t().sizes[size]}</button
				>
			{/each}
		</div>
	</div>
</div>
