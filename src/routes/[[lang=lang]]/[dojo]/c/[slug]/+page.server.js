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

/** @param {string} diff @returns {import('shiki').ShikiTransformer} */
const changes = (diff) => {
	const signs = diff.split('\n').map((l) => l[0]);
	return {
		line(node, line) {
			const kind = { '+': 'add', '-': 'del' }[signs[line - 1]];
			if (kind) this.addClassToHast(node, kind);
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
		diff: c?.bug && (await html(c.bug.diff, 'diff', [changes(c.bug.diff)]))
	};
}
