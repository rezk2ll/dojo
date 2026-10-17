/** @type {import('@sveltejs/kit/hooks').Handle} */
export const handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.params.lang === 'en' ? 'en' : 'fr')
	});
