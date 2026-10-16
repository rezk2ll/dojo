import { error } from '@sveltejs/kit';
import { chaptersIn } from '#lib/content.js';
import { dojos } from '#lib/dojos/index.js';

export const entries = () => dojos.flatMap((d) => chaptersIn(d.id, 'en').map((c) => ({ dojo: d.id, slug: c.slug })));

export async function load({ params, parent }) {
	const { dojo } = await parent();
	const i = chaptersIn(dojo.id, 'en').findIndex((c) => c.slug === params.slug);
	if (i < 0) error(404, 'No such chapter');
	return { index: i };
}
