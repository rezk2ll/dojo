import { createHighlighter } from 'shiki';
import { chaptersIn } from '#lib/content.js';

// Colored at build time, so the browser gets plain HTML and no highlighter.
const highlighter = createHighlighter({ themes: ['rose-pine-dawn', 'rose-pine-moon'], langs: ['diff'] });
const themes = { light: 'rose-pine-dawn', dark: 'rose-pine-moon' };

/** Each line becomes a button the reader can pick; the newlines between them would add blank lines. @type {import('shiki').ShikiTransformer} */
const pickable = {
	code(node) {
		node.children = node.children.filter((n) => n.type !== 'text');
	},
	line(node, line) {
		node.tagName = 'button';
		node.properties.type = 'button';
		node.properties['data-line'] = line;
	}
};

/**
 * Notes cite lines by number, before the fix ("line 14 tests…") and after it ("line 14 now…"), so the diff shows
 * both columns, like GitHub. The before numbers come from the bug code, an excerpt with its own indentation:
 * lines match trimmed and in order. Lines with words are found first; a bare `}` or blank line repeats too often,
 * so it only takes the number next to a placed neighbor. `…` gaps and lines the excerpt left out get none.
 * @param {string} diff @param {string} code @returns {string[]}
 */
function diffLineNumbers(diff, code) {
	const before = code.split('\n').map((l) => l.trim());
	const old = diff
		.split('\n')
		.map((l, i) => ({ i, text: l.slice(1).trim(), at: -1, kept: l[0] !== '+' }))
		.filter((l) => l.kept && l.text !== '…');
	let from = 0;
	for (const l of old) {
		if (!/\w/.test(l.text)) continue;
		const at = before.indexOf(l.text, from);
		if (at >= 0) [l.at, from] = [at, at + 1];
	}
	for (const order of [old, [...old].reverse()]) {
		order.forEach((l, k) => {
			const near = order[k - 1];
			const step = order === old ? 1 : -1;
			if (l.at < 0 && near?.at >= 0 && before[near.at + step] === l.text) l.at = near.at + step;
		});
	}
	const lines = diff.split('\n');
	const was = lines.map(() => 0);
	for (const l of old) if (l.at >= 0) was[l.i] = l.at + 1;
	// A kept line moves by the lines added minus removed above it; an added line follows the line before it.
	const now = lines.map(() => 0);
	let shift = 0;
	let last = 0;
	lines.forEach((l, i) => {
		if (l[0] === '+') {
			now[i] = last ? ++last : 0;
			shift++;
		} else if (l[0] === '-') {
			if (!last && was[i]) last = was[i] - 1 + shift;
			shift--;
		} else last = now[i] = was[i] ? was[i] + shift : 0;
	});
	const width = String(Math.max(...was, ...now)).length;
	const col = (/** @type {number} */ n) => (n ? String(n) : '').padStart(width);
	return lines.map((l, i) => (l.trim() === '…' ? '' : `${col(was[i])} ${col(now[i])}`));
}

/** @param {string} diff @param {string} code @returns {import('shiki').ShikiTransformer} */
const changes = (diff, code) => {
	const signs = diff.split('\n').map((l) => l[0]);
	const numbers = diffLineNumbers(diff, code);
	return {
		line(node, line) {
			const kind = { '+': 'add', '-': 'del' }[signs[line - 1]];
			if (kind) this.addClassToHast(node, kind);
			node.properties['data-n'] = numbers[line - 1];
		}
	};
};

/** @param {string} code @param {string} lang @param {import('shiki').ShikiTransformer[]} [transformers] */
async function html(code, lang, transformers) {
	const h = await highlighter;
	await h.loadLanguage(/** @type {any} */ (lang));
	return h.codeToHtml(code, { lang, themes, defaultColor: false, transformers });
}

export async function load({ params }) {
	// The code is the same in both languages, so the English chapter is enough.
	const c = chaptersIn(params.dojo, 'en').find((c) => c.slug === params.slug);
	return {
		code: c?.example && (await html(c.example.code, c.example.lang)),
		hunt: c?.bug && (await html(c.bug.code, c.bug.lang, [pickable])),
		diff: c?.bug && (await html(c.bug.diff, 'diff', [changes(c.bug.diff, c.bug.code)]))
	};
}
