import { chaptersIn } from './content.js';
import { dojos } from './dojos/index.js';
import { progressOf } from './progress.svelte.js';

const KEY = 'dojo:companion';

/**
 * @typedef {'idle' | 'happy' | 'sad'} Mood
 * @typedef {'s' | 'm' | 'l'} Size
 * @typedef {'glance' | 'nod' | 'done'} Cue
 * @typedef {typeof EYES[number]} Eyes
 */

/** Side of the cube's canvas in CSS pixels. */
export const SIZES = { s: 110, m: 150, l: 200 };

/** Eye styles in unlock order: the first is free, then one more per finished part, in any dojo. */
export const EYES = /** @type {const} */ (['pill', 'round', 'square', 'visor', 'heart']);

/** @param {number} partsDone */
export const unlockedEyes = (partsDone) => EYES.slice(0, 1 + partsDone);

/** Parts finished across all dojos. Reading it inside markup or `$derived` follows progress. */
export function partsDone() {
	return dojos.reduce((n, d) => {
		const chapters = chaptersIn(d.id, 'en');
		const done = progressOf(d.id).done;
		const parts = new Set(chapters.map((c) => c.part));
		return n + [...parts].filter((p) => chapters.every((c) => c.part !== p || done[c.slug])).length;
	}, 0);
}

/** The saved style, or the free one when progress, replaced or imported, no longer unlocks it. */
export const eyesInUse = () => (unlockedEyes(partsDone()).includes(companion.eyes) ? companion.eyes : EYES[0]);

/** The cube in the corner. `beat` and `cueBeat` change on every reaction and cue, so the same one twice still replays. */
export const companion = $state({
	on: true,
	size: /** @type {Size} */ ('s'),
	eyes: /** @type {Eyes} */ ('pill'),
	mood: /** @type {Mood} */ ('idle'),
	beat: 0,
	combo: 0,
	cue: /** @type {Cue | undefined} */ (undefined),
	cueBeat: 0,
	/** Set by a page while a question waits for an answer. */
	hint: /** @type {{ term: string, def: string } | undefined} */ (undefined)
});

// Three letters, so short terms like ADR or API still match.
const WORD = /[\p{L}\p{N}]{3,}/gu;

/**
 * The chapter term the question leans on most, which nudges without giving the answer away.
 * A term the right option spells out is never picked.
 * @param {import('./content.js').Chapter} chapter @param {import('./content.js').Question} q
 */
export function hintFor(chapter, q) {
	const asked = new Set(q.q.toLowerCase().match(WORD) ?? []);
	const right = q.options[q.answer].toLowerCase();
	const score = (/** @type {{ term: string }} */ t) => (t.term.toLowerCase().match(WORD) ?? []).filter((w) => asked.has(w)).length;
	const fair = chapter.terms.filter((t) => !right.includes(t.term.toLowerCase()));
	const best = fair.reduce((a, b) => (score(b) > score(a) ? b : a), fair[0]);
	return best && score(best) > 0 ? best : undefined;
}

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

/** A quiz answer: the cube reacts, and right answers in a row build the combo. @param {boolean} correct */
export function answered(correct) {
	companion.combo = correct ? companion.combo + 1 : 0;
	react(correct);
}

export function initCompanion() {
	try {
		const saved = localStorage.getItem(KEY);
		// The first version stored only "0" or "1".
		const s = saved === '0' ? { on: false } : saved === '1' || !saved ? {} : JSON.parse(saved);
		companion.on = s.on ?? true;
		if (s.size in SIZES) companion.size = s.size;
		if (EYES.includes(s.eyes)) companion.eyes = s.eyes;
	} catch {
		// Blocked storage: the cube keeps its defaults.
	}
}

/** @param {Partial<Pick<typeof companion, 'on' | 'size' | 'eyes'>>} change */
export function setCompanion(change) {
	Object.assign(companion, change);
	const { on, size, eyes } = companion;
	try {
		localStorage.setItem(KEY, JSON.stringify({ on, size, eyes }));
	} catch {
		// Blocked storage: the choice lasts for this tab only.
	}
}
