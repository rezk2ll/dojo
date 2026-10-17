export const prerender = true;
export const trailingSlash = 'always';

/** @returns {{ lang: import('#lib/i18n.svelte.js').Lang }} */
export const load = ({ params }) => ({ lang: params.lang === 'en' ? 'en' : 'fr' });
