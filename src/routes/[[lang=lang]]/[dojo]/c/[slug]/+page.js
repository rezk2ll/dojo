import { error } from '@sveltejs/kit';
import { chaptersIn } from '#lib/content.js';
import { dojos } from '#lib/dojos/index.js';
import { langs } from '#lib/i18n.svelte.js';

export const entries = () =>
	langs.flatMap((l) => dojos.flatMap((d) => chaptersIn(d.id, 'en').map((c) => ({ ...l, dojo: d.id, slug: c.slug }))));

export async function load({ params, parent, data }) {
	const { dojo } = await parent();
	const i = chaptersIn(dojo.id, 'en').findIndex((c) => c.slug === params.slug);
	if (i < 0) error(404, 'No such chapter');
	return { ...data, index: i };
}
