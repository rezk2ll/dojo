import { error } from '@sveltejs/kit';
import { dojoById } from '#lib/dojos/index.js';

export function load({ params }) {
	const dojo = dojoById(params.dojo);
	if (!dojo) error(404, 'No such dojo');
	return { dojo };
}
