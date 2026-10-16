<script>
	import { companion, eyesInUse, partsDone, setCompanion, unlockedEyes, EYES, SIZES } from '#lib/companion.svelte.js';
	import { t } from '#lib/i18n.svelte.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import Box from '@lucide/svelte/icons/box';

	const sizes = /** @type {(keyof typeof SIZES)[]} */ (Object.keys(SIZES));

	let unlocked = $derived(unlockedEyes(partsDone()));
	let eyes = $derived(eyesInUse());
</script>

{#snippet glyph(/** @type {typeof EYES[number]} */ style)}
	<svg viewBox="0 0 32 16" class="h-4 w-8" fill="currentColor" aria-hidden="true">
		{#if style === 'visor'}
			<rect x="3" y="5" width="26" height="6" rx="3" />
		{:else}
			{#each [9, 23] as x (x)}
				{#if style === 'pill'}<rect x={x - 2.5} y="2" width="5" height="12" rx="2.5" />
				{:else if style === 'round'}<circle cx={x} cy="8" r="4.5" />
				{:else if style === 'square'}<rect x={x - 4} y="4" width="8" height="8" rx="1.5" />
				{:else}<path d="M{x} 13 C{x - 7} 8 {x - 4} 2 {x} 5.5 C{x + 4} 2 {x + 7} 8 {x} 13Z" />
				{/if}
			{/each}
		{/if}
	</svg>
{/snippet}

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
	<div class="space-y-1.5">
		<p class="text-muted-foreground text-xs">{t().cubeEyes}</p>
		<div class="flex rounded-md border p-0.5" role="group" aria-label={t().cubeEyes}>
			{#each EYES as style (style)}
				{@const open = unlocked.includes(style)}
				<button
					class="flex flex-1 justify-center rounded py-1.5 {eyes === style
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'} disabled:opacity-35"
					aria-pressed={eyes === style}
					aria-label={t().eyeStyles[style]}
					title={open ? t().eyeStyles[style] : t().eyesLocked}
					disabled={!companion.on || !open}
					onclick={() => setCompanion({ eyes: style })}>{@render glyph(style)}</button
				>
			{/each}
		</div>
		{#if unlocked.length < EYES.length}<p class="text-muted-foreground text-xs">{t().eyesLocked}</p>{/if}
	</div>
</div>
