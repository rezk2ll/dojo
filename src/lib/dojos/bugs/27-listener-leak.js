const SVELTE = 'https://github.com/sveltejs/svelte';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'listener-leak',
	part: 'Resources',
	title: 'An audio player that kept writing after it was gone',
	minutes: 10,
	hook: [
		'A Svelte 5 app shows an `<audio>` element inside `{#if player.playingAudio}`, with `bind:currentTime={player.playingAudio.currentTime}`. The user presses play, then hides the player. Chrome throws **"Cannot set properties of null"**.',
		'The issue adds: "This error does not appear in Firefox." The function below is what `bind:currentTime` compiles to. It runs when the element is created. `teardown` registers what to undo when the element is removed.'
	],
	terms: [
		{ term: 'Binding', def: '`bind:currentTime={x}` keeps `x` and the playback position in sync, in both directions. `set` writes the position into `x`.' },
		{ term: 'teardown', def: 'Svelte calls the function given to `teardown` when the effect is destroyed, here when the `{#if}` block removes the element.' },
		{ term: 'timeupdate', def: 'An event a media element fires as its playback position changes.' }
	],
	bug: {
		title: 'fix: remove listener on `bind_current_time` teardown (#15013)',
		repo: 'sveltejs/svelte',
		url: `${SVELTE}/blob/dfa97a5e643655d919a7c6ff80fb3841fe1111f9/packages/svelte/src/internal/client/dom/elements/bindings/media.js#L22-L56`,
		fix: `${SVELTE}/commit/360ee70dcbc4a338fce749b8916b46a69ad209cb`,
		lang: 'javascript',
		code: `export function bind_current_time(media, get, set = get) {
	/** @type {number} */
	var raf_id;
	/** @type {number} */
	var value;

	// Ideally, listening to timeupdate would be enough, but it fires too infrequently for the currentTime
	// binding, which is why we use a raf loop, too. We additionally still listen to timeupdate because
	// the user could be scrubbing through the video using the native controls when the media is paused.
	var callback = () => {
		cancelAnimationFrame(raf_id);

		if (!media.paused) {
			raf_id = requestAnimationFrame(callback);
		}

		var next_value = media.currentTime;
		if (value !== next_value) {
			set((value = next_value));
		}
	};

	raf_id = requestAnimationFrame(callback);
	media.addEventListener('timeupdate', callback);

	render_effect(() => {
		var next_value = Number(get());

		if (value !== next_value && !isNaN(/** @type {any} */ (next_value))) {
			media.currentTime = value = next_value;
		}
	});

	teardown(() => cancelAnimationFrame(raf_id));
}`,
		lines: [34],
		diff: ` 	});

-	teardown(() => cancelAnimationFrame(raf_id));
+	teardown(() => {
+		cancelAnimationFrame(raf_id);
+		media.removeEventListener('timeupdate', callback);
+	});
 }`,
		notes: [
			'**Two things start, one is stopped.** The function starts a `requestAnimationFrame` loop and adds a `timeupdate` listener. The teardown cancels the frame loop only. The listener stays on the element after Svelte has removed it from the page.',
			'**How the error comes out.** The user hides the player, so `player.playingAudio` becomes `null` and the `{#if}` removes the `<audio>`. In Chrome the element still fires `timeupdate`. `callback` runs, reads a new `currentTime`, and calls `set`, which writes to `player.playingAudio.currentTime`. `playingAudio` is now `null`: "Cannot set properties of null".',
			'**The listener restarts the loop.** `cancelAnimationFrame(raf_id)` stops the loop at teardown. The listener calls `callback`, and `callback` restarts the loop if `media.paused` is false. So one leftover listener is enough to bring both back.',
			'**The fix.** The teardown now also calls `media.removeEventListener(\'timeupdate\', callback)`. This works because `callback` is the same function object that was passed to `addEventListener`.',
			'**How it was found.** A user opened [issue #15008](' + SVELTE + '/issues/15008) with a playground link: "Press play and then hide the player."'
		]
	},
	quiz: [
		{
			q: 'After the `<audio>` is removed, what can still call `set`?',
			options: [
				'The render_effect, when get() changes',
				'The timeupdate listener, through callback',
				'The animation frame scheduled before teardown',
				'Nothing, Svelte stops all calls to set'
			],
			answer: 1,
			why: 'The teardown cancels the frame and Svelte destroys the render_effect. The timeupdate listener was never removed, so the element can still call callback, and callback calls set.'
		},
		{
			q: 'Why does `removeEventListener(\'timeupdate\', callback)` work in the fix?',
			options: [
				'It removes every listener on the element',
				'callback is the same function that was added',
				'Svelte keeps a list of listeners per element',
				'timeupdate listeners can only be added once'
			],
			answer: 1,
			why: 'removeEventListener needs the same event name and the same function object. Here callback is a variable in scope, so the teardown can pass the exact function that was added.'
		},
		{
			q: 'You review a setup function. Which check finds this kind of leak?',
			options: [
				'Count the setTimeout calls in the file',
				'Pair each addEventListener with a remove in the cleanup',
				'Check that every callback is an arrow function',
				'Check that the element has an id attribute'
			],
			answer: 1,
			why: 'Each thing a setup starts (a listener, a timer, a frame loop, a subscription) needs a matching stop in the cleanup. Here the frame loop had one and the listener did not.'
		}
	],
	takeaway: 'In every setup function, list what it starts and check that the cleanup stops each one. A listener that stays on a removed element can still run your code and write to state that no longer exists.',
	sources: [
		{ title: 'svelte pull request #15013', url: `${SVELTE}/pull/15013` },
		{ title: 'Issue #15008: setting properties of null', url: `${SVELTE}/issues/15008` }
	]
};
