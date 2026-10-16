const KEY = 'dojo:companion';

/**
 * @typedef {'idle' | 'happy' | 'sad'} Mood
 * @typedef {'s' | 'm' | 'l'} Size
 * @typedef {'glance' | 'nod' | 'done'} Cue
 */

/** Side of the cube's canvas in CSS pixels. */
export const SIZES = { s: 110, m: 150, l: 200 };

/** The cube in the corner. `beat` and `cueBeat` change on every reaction and cue, so the same one twice still replays. */
export const companion = $state({
	on: true,
	size: /** @type {Size} */ ('s'),
	mood: /** @type {Mood} */ ('idle'),
	beat: 0,
	cue: /** @type {Cue | undefined} */ (undefined),
	cueBeat: 0
});

/** @param {Cue} name */
export function cue(name) {
	companion.cue = name;
	companion.cueBeat++;
}

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
		const saved = localStorage.getItem(KEY);
		// The first version stored only "0" or "1".
		const s = saved === '0' ? { on: false } : saved === '1' || !saved ? {} : JSON.parse(saved);
		companion.on = s.on ?? true;
		if (s.size in SIZES) companion.size = s.size;
	} catch {
		// Blocked storage: the cube keeps its defaults.
	}
}

/** @param {Partial<Pick<typeof companion, 'on' | 'size'>>} change */
export function setCompanion(change) {
	Object.assign(companion, change);
	const { on, size } = companion;
	try {
		localStorage.setItem(KEY, JSON.stringify({ on, size }));
	} catch {
		// Blocked storage: the choice lasts for this tab only.
	}
}
