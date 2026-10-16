/**
 * A diagram is Mermaid flowchart lines revealed step by step. Each step adds lines;
 * `highlight` lists the node ids to outline in the dojo's color at that step.
 * @typedef {{ add: string[], highlight?: string[], note: string }} DStep
 * @typedef {{ direction?: 'TD' | 'LR', steps: DStep[] }} Diagram
 * @typedef {{ q: string, options: string[], answer: number, why: string }} Question
 * A bug is code as it was before a real fix commit. `lines` are the 1-based lines of `code`
 * the fix touched; `diff` is the fix's own hunk, and `fix` links to the commit.
 * @typedef {{ title: string, repo: string, url: string, fix: string, lang: string, code: string, lines: number[], diff: string, notes: string[] }} Bug
 * An incident is a real public postmortem told as decisions. Each step shows what the
 * responders knew at that point and asks what to do next; `outcome` is what really happened.
 * @typedef {Question & { situation: string[] }} Decision
 * @typedef {{ org: string, title: string, url: string, date: string, steps: Decision[], outcome: string[] }} Incident
 * @typedef {{
 *   slug: string, part: string, title: string, minutes: number,
 *   hook: string[],
 *   terms: { term: string, def: string }[],
 *   diagram?: Diagram,
 *   example?: { title: string, repo: string, url: string, lang: string, code: string, notes: string[] },
 *   bug?: Bug,
 *   incident?: Incident,
 *   tradeoff?: { gain: string[], cost: string[] },
 *   task?: { prompt: string, hint?: string, answer: string[] },
 *   quiz: Question[],
 *   takeaway?: string,
 *   recall?: { q: string, a: string },
 *   sources: { title: string, url: string }[]
 * }} Chapter
 */

/** @typedef {'fr' | 'en'} Lang */

/**
 * Authors tend to put the right answer in the same place, so options are reordered here.
 * The order is seeded by the card id: stable across visits and the same in both languages.
 * @param {string} seed @param {Question} q
 */
function shuffled(seed, q) {
	let h = [...seed].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);
	const order = q.options.map((_, i) => i);
	for (let j = order.length - 1; j > 0; j--) {
		h = Math.imul(h ^ (h >>> 15), 2246822507);
		const k = (h >>> 0) % (j + 1);
		[order[j], order[k]] = [order[k], order[j]];
	}
	return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

/** @param {Record<string, { default: Chapter }>} modules */
const list = (modules) =>
	Object.keys(modules)
		.sort()
		.map((k) => modules[k].default)
		.map((c) => ({ ...c, quiz: c.quiz.map((q, i) => shuffled(`${c.slug}#${i}`, q)) }));

/** @param {Record<string, { default: Chapter }>} modules @returns {Record<string, Chapter[]>} */
function byDojo(modules) {
	/** @type {Record<string, Record<string, { default: Chapter }>>} */
	const groups = {};
	for (const [path, mod] of Object.entries(modules)) (groups[path.split('/')[2]] ??= {})[path] = mod;
	return Object.fromEntries(Object.entries(groups).map(([dojo, mods]) => [dojo, list(mods)]));
}

// The English chapters set the order and the slugs; progress is keyed by slug, so it is shared by both languages.
const english = byDojo(import.meta.glob('./dojos/*/[0-9]*.js', { eager: true }));
const french = byDojo(import.meta.glob('./dojos/*/fr/[0-9]*.js', { eager: true }));
/** @type {Record<Lang, Record<string, Chapter[]>>} */
const byLang = {
	en: english,
	fr: Object.fromEntries(
		Object.entries(english).map(([dojo, chapters]) => {
			const fr = new Map((french[dojo] ?? []).map((c) => [c.slug, c]));
			return [dojo, chapters.map((c) => fr.get(c.slug) ?? c)];
		})
	)
};

/** @param {string} dojo @param {Lang} lang */
export const chaptersIn = (dojo, lang) => byLang[lang][dojo] ?? [];

/** @param {string} dojo @param {string} slug @param {Lang} lang */
export const chapterBySlug = (dojo, slug, lang) => chaptersIn(dojo, lang).find((c) => c.slug === slug);

/** Cards are addressed as `<slug>#<question index>` within a dojo. @param {string} dojo @param {string} id @param {Lang} lang */
export function questionById(dojo, id, lang) {
	const [slug, i] = id.split('#');
	const chapter = chapterBySlug(dojo, slug, lang);
	const question = chapter?.quiz[Number(i)];
	return chapter && question ? { chapter, question } : undefined;
}
