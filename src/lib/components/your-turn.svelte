<script>
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { fmt } from '#lib/text.js';
	import { t } from '#lib/i18n.svelte.js';

	const TRIES = 3;

	/**
	 * Saved under `t<step>.<question>` is the option picked, under `c<step>.<question>` the option it held at the
	 * last check, and under `tries` the number of checks. A mark is shown only while the pick is the one checked.
	 * @type {{ task: import('#lib/content.js').Task, picked: Record<string, number>, onpick: (key: string, value: number) => void }}
	 */
	let { task, picked, onpick } = $props();

	let at = $state(0);
	let showHint = $state(false);

	let steps = $derived(task.steps ?? []);
	let all = $derived(steps.flatMap((s, j) => s.questions.map((q, i) => ({ step: j, n: i, q, key: `${j}.${i}` }))));
	let current = $derived(all[at]);
	let tries = $derived(picked.tries ?? 0);
	let solved = $derived(tries > 0 && all.every((x) => picked[`c${x.key}`] === x.q.answer));
	let revealed = $derived(solved || tries >= TRIES);
	let ready = $derived(all.every((x) => picked[`t${x.key}`] !== undefined));

	/** @param {{ q: import('#lib/content.js').Question, key: string }} x @returns {'right' | 'wrong' | 'open'} */
	function status(x) {
		const chosen = picked[`t${x.key}`];
		if (chosen === undefined) return 'open';
		if (revealed || picked[`c${x.key}`] === chosen) return chosen === x.q.answer ? 'right' : 'wrong';
		return 'open';
	}

	let wrong = $derived(tries > 0 && !revealed ? all.filter((x) => status(x) === 'wrong') : []);
	let right = $derived(all.filter((x) => picked[`c${x.key}`] === x.q.answer).length);

	function check() {
		for (const x of all) onpick(`c${x.key}`, picked[`t${x.key}`]);
		onpick('tries', tries + 1);
	}
</script>

<div class="max-w-3xl space-y-6">
	<p class="text-lg leading-relaxed font-semibold">{@html fmt(task.prompt)}</p>
	{#if task.hint}
		{#if showHint}
			<Alert.Root><Alert.Title>{t().hint}</Alert.Title><Alert.Description class="text-base">{@html fmt(task.hint)}</Alert.Description></Alert.Root>
		{:else}
			<Button variant="outline" onclick={() => (showHint = true)}>{t().hint}</Button>
		{/if}
	{/if}

	<div class="flex gap-1.5" role="group" aria-label={t().taskSteps}>
		{#each steps as s, j (j)}
			{@const marks = all.filter((x) => x.step === j).map(status)}
			<button
				class="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors
					{j === current.step ? 'border-brand bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted/60'}"
				aria-current={j === current.step ? 'step' : undefined}
				onclick={() => (at = all.findIndex((x) => x.step === j))}
			>
				<span class="block font-mono uppercase">{t().taskStep(j + 1)}</span>
				<span class="block truncate">{s.title}</span>
				<span class="mt-1 flex gap-1" aria-hidden="true">
					{#each marks as m, i (i)}
						<span class="h-1.5 flex-1 rounded-full {m === 'right' ? 'bg-good' : m === 'wrong' ? 'bg-bad' : picked[`t${j}.${i}`] !== undefined ? 'bg-brand' : 'bg-muted'}"></span>
					{/each}
				</span>
			</button>
		{/each}
	</div>

	<div>
		<p class="text-muted-foreground font-mono text-xs uppercase">{t().taskQuestion(current.step + 1, current.n + 1)}</p>
		<h2 class="text-xl font-semibold">{steps[current.step].title}</h2>
	</div>

	{#key at}
		{@const x = current}
		{@const chosen = picked[`t${x.key}`]}
		{@const mark = status(x)}
		{@const locked = revealed || mark === 'right'}
		<div class="space-y-2">
			<p class="leading-snug font-semibold">{@html fmt(x.q.q)}</p>
			<div class="grid gap-2">
				{#each x.q.options as option, i (i)}
					<Button
						variant={revealed && i === x.q.answer
							? 'default'
							: i === chosen && mark === 'wrong'
								? 'destructive'
								: i === chosen && mark === 'right'
									? 'default'
									: i === chosen
										? 'secondary'
										: 'outline'}
						class="h-auto w-full justify-start py-2.5 text-left text-base whitespace-normal {i === chosen && mark === 'open' ? 'ring-brand ring-2' : ''}"
						disabled={locked && i !== chosen && !(revealed && i === x.q.answer)}
						aria-pressed={i === chosen}
						onclick={() => !locked && onpick(`t${x.key}`, i)}><span>{@html fmt(option)}</span></Button
					>
				{/each}
			</div>
			{#if revealed}
				<p class="text-muted-foreground text-sm leading-relaxed">{@html fmt(x.q.why)}</p>
			{/if}
		</div>
	{/key}

	<div class="flex flex-wrap items-center gap-2">
		<Button variant="outline" disabled={at === 0} onclick={() => at--}>{t().prevTaskQuestion}</Button>
		{#if at < all.length - 1}
			<Button variant="outline" onclick={() => at++}>{t().nextTaskQuestion}</Button>
		{:else if !revealed}
			<Button disabled={!ready} onclick={check}>{t().checkAll}</Button>
			{#if !ready}<span class="text-muted-foreground text-sm">{t().answerAll(all.length)}</span>{/if}
		{/if}
	</div>

	{#if wrong.length}
		<Alert.Root variant="destructive">
			<Alert.Title>{t().someWrong(right, all.length)}</Alert.Title>
			<Alert.Description class="space-y-3 text-base">
				<p>{t().triesLeft(TRIES - tries)}</p>
				<div class="flex flex-wrap gap-2">
					{#each wrong as x (x.key)}
						<Button variant="outline" size="sm" onclick={() => (at = all.indexOf(x))}>{t().taskQuestion(x.step + 1, x.n + 1)}</Button>
					{/each}
				</div>
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if revealed}
		<Alert.Root variant={solved ? 'default' : 'destructive'}>
			<Alert.Title>{solved ? t().allRight : t().outOfTries}</Alert.Title>
			<Alert.Description class="text-base">
				<ul class="list-disc space-y-1 pl-5">{#each task.answer as a, i (i)}<li>{@html fmt(a)}</li>{/each}</ul>
			</Alert.Description>
		</Alert.Root>
	{/if}
</div>
