import { createHighlighter } from 'shiki';
import { chaptersIn } from '#lib/content.js';

// Colored at build time, so the browser gets plain HTML and no highlighter.
const highlighter = createHighlighter({ themes: ['rose-pine-dawn', 'rose-pine-moon'], langs: [] });

export async function load({ params }) {
	// The code is the same in both languages, so the English chapter is enough.
	const example = chaptersIn(params.dojo, 'en').find((c) => c.slug === params.slug)?.example;
	if (!example) return {};
	const h = await highlighter;
	await h.loadLanguage(/** @type {any} */ (example.lang));
	const code = h.codeToHtml(example.code, {
		lang: example.lang,
		themes: { light: 'rose-pine-dawn', dark: 'rose-pine-moon' },
		defaultColor: false
	});
	return { code };
}
