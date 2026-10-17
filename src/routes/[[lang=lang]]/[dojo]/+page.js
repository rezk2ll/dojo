import { dojos } from '#lib/dojos/index.js';

export const entries = () => dojos.map((d) => ({ dojo: d.id }));
