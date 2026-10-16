import { dojos } from './dojos/index.js';

const DAY = 24 * 60 * 60 * 1000;
// Leitner boxes: a card answered right moves up a box and comes back later.
export const INTERVAL_DAYS = [1, 3, 7, 21, 45];
// The mixed review on the hub stops after this many cards a day, so it never piles up.
export const DAILY_MIX = 10;

/**
 * @typedef {{ box: number, due: number }} Card
 * @typedef {{ done: Record<string, number>, cards: Record<string, Card>, at: Record<string, number>, days: string[] }} State
 */

const key = (/** @type {string} */ dojo) => `dojo:${dojo}:v1`;

// Created up front: Svelte does not track state created inside the `$derived` that first reads it.
/** @type {Record<string, State>} */
const stores = Object.fromEntries(dojos.map((d) => [d.id, blank()]));

function blank() {
	/** @type {State} */
	const state = $state({ done: {}, cards: {}, at: {}, days: [] });
	return state;
}

/** Each dojo keeps its own progress. Reading it inside markup or `$derived` follows its changes. @param {string} dojo */
export const progressOf = (dojo) => stores[dojo];

/** Local calendar day, so a streak follows the reader's midnight, not UTC's. */
export const dayKey = (/** @type {Date} */ d) => d.toLocaleDateString('en-CA');

/** @param {string} dojo */
function touch(dojo) {
	const days = progressOf(dojo).days;
	const today = dayKey(new Date());
	if (!days.includes(today)) days.push(today);
}

/** Days in a row with at least one answer. Today still counts as open until midnight. @param {string[]} answered */
export function streak(answered) {
	const days = new Set(answered);
	const d = new Date();
	if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
	let n = 0;
	for (; days.has(dayKey(d)); d.setDate(d.getDate() - 1)) n++;
	return n;
}

export const activeToday = (/** @type {string[]} */ answered) => answered.includes(dayKey(new Date()));

/** Pages are prerendered empty, so call this from onMount, after hydration. @param {string} dojo */
export function restore(dojo) {
	try {
		apply(dojo, JSON.parse(localStorage.getItem(key(dojo)) ?? '{}'));
	} catch {
		// Unreadable or blocked storage: start fresh.
	}
}

/** @param {string} dojo @param {Partial<State>} saved */
function apply(dojo, { done = {}, cards = {}, at = {}, days = [] }) {
	Object.assign(progressOf(dojo), { done, cards, at, days });
}

/** @param {string} dojo */
function save(dojo) {
	try {
		localStorage.setItem(key(dojo), JSON.stringify(progressOf(dojo)));
	} catch {
		// Private mode or blocked storage: progress lives for this tab only.
	}
}

/** @param {string} dojo @param {string} slug */
export function markDone(dojo, slug) {
	progressOf(dojo).done[slug] ??= Date.now();
	save(dojo);
}

/** Remembers the section a reader is on, so leaving mid-chapter resumes there. @param {string} dojo @param {string} slug @param {number} section */
export function savePosition(dojo, slug, section) {
	progressOf(dojo).at[slug] = section;
	save(dojo);
}

/** @param {string} dojo @param {string} id @param {boolean} correct */
export function answer(dojo, id, correct) {
	const cards = progressOf(dojo).cards;
	const box = correct ? Math.min((cards[id]?.box ?? -1) + 1, INTERVAL_DAYS.length - 1) : 0;
	cards[id] = { box, due: Date.now() + INTERVAL_DAYS[box] * DAY };
	touch(dojo);
	save(dojo);
}

/** @param {string} dojo */
export function dueCardIds(dojo) {
	const now = Date.now();
	return Object.entries(progressOf(dojo).cards)
		.filter(([, c]) => c.due <= now)
		.map(([id]) => id);
}

const MIX = 'dojo:mix';

/** How many cards the mixed review has shown today. */
export function mixedToday() {
	try {
		const { day, n } = JSON.parse(localStorage.getItem(MIX) ?? '{}');
		return day === dayKey(new Date()) && Number.isInteger(n) ? n : 0;
	} catch {
		return 0;
	}
}

export function countMixed() {
	try {
		localStorage.setItem(MIX, JSON.stringify({ day: dayKey(new Date()), n: mixedToday() + 1 }));
	} catch {
		// Without storage the daily cap resets with the tab.
	}
}

/** @param {string} dojo */
export const exportProgress = (dojo) => JSON.stringify({ dojo, ...progressOf(dojo) });

const isRecord = (/** @type {unknown} */ v, /** @type {(x: unknown) => boolean} */ ok) =>
	typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every(ok);
const isTime = (/** @type {unknown} */ v) => Number.isFinite(v);
const isCard = (/** @type {any} */ c) =>
	isRecord(c, isTime) && Number.isInteger(c.box) && c.box >= 0 && c.box < INTERVAL_DAYS.length;

/** Throws when the text is not this dojo's exportProgress file. @param {string} dojo @param {string} text @returns {State} */
export function parseProgress(dojo, text) {
	const { dojo: from, ...saved } = JSON.parse(text);
	const ok =
		from === dojo &&
		Object.keys(saved).sort().join() === 'at,cards,days,done' &&
		isRecord(saved.done, isTime) &&
		isRecord(saved.cards, isCard) &&
		isRecord(saved.at, Number.isInteger) &&
		Array.isArray(saved.days) &&
		saved.days.every((/** @type {unknown} */ d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
	if (!ok) throw new Error(`This file is not a ${dojo} progress file.`);
	return saved;
}

/** @param {string} dojo @param {State} saved */
export function replaceProgress(dojo, saved) {
	apply(dojo, saved);
	save(dojo);
}
