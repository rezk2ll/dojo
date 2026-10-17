import { dojos } from '#lib/dojos/index.js';

import { langs } from '#lib/i18n.svelte.js';

export const entries = () => langs.flatMap((l) => dojos.map((d) => ({ ...l, dojo: d.id })));
