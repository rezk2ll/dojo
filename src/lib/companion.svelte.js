const KEY = 'dojo:companion';

/** @typedef {'idle' | 'happy' | 'sad'} Mood */

/** The cube in the corner. `beat` changes on every reaction, so the same mood twice still replays. */
export const companion = $state({ on: true, mood: /** @type {Mood} */ ('idle'), beat: 0 });

/** @type {ReturnType<typeof setTimeout> | undefined} */
let calm;

/** @param {boolean} correct */
export function react(correct) {
	companion.mood = correct ? 'happy' : 'sad';
	companion.beat++;
	clearTimeout(calm);
	calm = setTimeout(() => (companion.mood = 'idle'), 2600);
}

export function initCompanion() {
	try {
		companion.on = localStorage.getItem(KEY) !== '0';
	} catch {
		// Blocked storage: the cube stays.
	}
}

export function toggleCompanion() {
	companion.on = !companion.on;
	try {
		localStorage.setItem(KEY, companion.on ? '1' : '0');
	} catch {
		// Blocked storage: the choice lasts for this tab only.
	}
}
