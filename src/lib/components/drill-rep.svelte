<script>
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Alert from '#lib/components/ui/alert/index.js';
	import { fmt } from '#lib/text.js';
	import { t } from '#lib/i18n.svelte.js';

	/** @type {{ rep: import('#lib/content.js').Rep, result?: boolean, onresult: (right: boolean) => void }} */
	let { rep, result, onresult } = $props();

	let typed = $state('');
	let wrong = $state(false);

	// Spacing and a trailing semicolon do not change a command or a query.
	const norm = (/** @type {string} */ s) => s.replace(/\s+/g, ' ').replace(/[\s;]+$/, '').trim();

	function submit(/** @type {SubmitEvent} */ e) {
		e.preventDefault();
		if (result !== undefined || !typed.trim()) return;
		if (rep.accept.some((a) => norm(a) === norm(typed))) onresult(!wrong);
		else wrong = true;
	}
</script>

<div class="max-w-3xl space-y-4">
	<p class="text-xl leading-snug font-semibold">{@html fmt(rep.prompt)}</p>
	<form class="flex gap-2" onsubmit={submit}>
		<input
			class="bg-card border-border focus-visible:ring-brand min-w-0 flex-1 rounded-xl border px-4 py-3 font-mono text-base outline-none focus-visible:ring-2"
			bind:value={typed}
			disabled={result !== undefined}
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			aria-label={t().typeAnswer}
		/>
		<Button type="submit" disabled={result !== undefined}>{t().checkAnswer}</Button>
	</form>
	{#if result === undefined && wrong}
		<div class="flex items-center gap-3">
			<p class="text-destructive">{t().notYet}</p>
			<Button variant="outline" onclick={() => onresult(false)}>{t().showAnswer}</Button>
		</div>
	{/if}
	{#if result !== undefined}
		<Alert.Root variant={result ? 'default' : 'destructive'}>
			<Alert.Title>{result ? t().yes : t().oneAnswer}</Alert.Title>
			<Alert.Description class="space-y-2 text-base">
				<pre class="font-mono text-sm whitespace-pre-wrap">{rep.accept[0]}</pre>
				<p>{@html fmt(rep.why)}</p>
			</Alert.Description>
		</Alert.Root>
	{/if}
</div>
