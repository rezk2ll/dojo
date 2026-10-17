import { chaptersIn } from '#lib/content.js';
import { dojos } from '#lib/dojos/index.js';

export const prerender = true;
export const trailingSlash = 'never';

const ROOT = 'https://ferjani.dev/dojo';

export function GET() {
	const paths = [
		'/',
		...dojos
			.filter((d) => chaptersIn(d.id, 'en').length)
			.flatMap((d) => [`/${d.id}/`, `/${d.id}/glossary/`, ...chaptersIn(d.id, 'en').map((c) => `/${d.id}/c/${c.slug}/`)])
	];
	const alternates = (/** @type {string} */ p) =>
		`<xhtml:link rel="alternate" hreflang="fr" href="${ROOT}${p}"/><xhtml:link rel="alternate" hreflang="en" href="${ROOT}/en${p}"/>`;
	const urls = paths
		.flatMap((p) => [`<url><loc>${ROOT}${p}</loc>${alternates(p)}</url>`, `<url><loc>${ROOT}/en${p}</loc>${alternates(p)}</url>`])
		.join('');
	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`,
		{ headers: { 'Content-Type': 'application/xml' } }
	);
}
