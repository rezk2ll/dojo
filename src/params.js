import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
	// English pages live under /en/; French, the original, has no prefix.
	lang: (param) => (param === 'en' ? param : undefined)
});
