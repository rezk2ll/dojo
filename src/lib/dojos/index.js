/**
 * @typedef {import('../content.js').Lang} Lang
 * @typedef {{
 *   id: string,
 *   name: string,
 *   hue: number,
 *   chroma: number,
 *   hex: { top: string, left: string, right: string },
 *   description: Record<Lang, string>,
 *   heroTitle: Record<Lang, string>,
 *   heroText: Record<Lang, string>
 * }} Dojo
 */

/** The order here is the order on the hub. `hex` is the brand color in sRGB, for Mermaid and the icons. @type {Dojo[]} */
export const dojos = [
	{
		id: 'devops',
		name: 'DevOps Dojo',
		hue: 195,
		chroma: 0.1,
		hex: { top: '#76c8c7', left: '#008687', right: '#39abab' },
		description: {
			en: 'From sysadmin to DevOps engineer, one 10-minute chapter a day, taught on real open-source code.',
			fr: 'De sysadmin à ingénieur DevOps, un chapitre de 10 minutes par jour, sur du vrai code open source.'
		},
		heroTitle: {
			en: 'From sysadmin to DevOps engineer, ten minutes a day.',
			fr: 'De sysadmin à ingénieur DevOps, dix minutes par jour.'
		},
		heroText: {
			en: 'One chapter a day, on real open-source code. Questions come back later so they stick.',
			fr: 'Un chapitre par jour, sur du vrai code open source. Les questions reviennent plus tard pour que ça reste.'
		}
	},
	{
		id: 'architecture',
		name: 'Architecture Dojo',
		hue: 52,
		chroma: 0.14,
		hex: { top: '#f0a373', left: '#b2580b', right: '#db7c3d' },
		description: {
			en: 'Software architecture, one 10-minute chapter a day, taught on real open-source code.',
			fr: 'L’architecture logicielle, un chapitre de 10 minutes par jour, sur du vrai code open source.'
		},
		heroTitle: {
			en: 'Become an architect, ten minutes a day.',
			fr: 'Deviens architecte, dix minutes par jour.'
		},
		heroText: {
			en: 'One chapter a day, on real open-source code. Questions come back later so they stick.',
			fr: 'Un chapitre par jour, sur du vrai code open source. Les questions reviennent plus tard pour que ça reste.'
		}
	},
	{
		id: 'databases',
		name: 'Databases Dojo',
		hue: 290,
		chroma: 0.1,
		hex: { top: '#b6afe8', left: '#746ba9', right: '#978dd1' },
		description: {
			en: 'How databases store, find and protect your data, one 10-minute chapter a day, taught on real open-source code.',
			fr: 'Comment une base de données range, retrouve et protège tes données, un chapitre de 10 minutes par jour, sur du vrai code open source.'
		},
		heroTitle: {
			en: 'Know what your database does, ten minutes a day.',
			fr: 'Comprends ce que fait ta base de données, dix minutes par jour.'
		},
		heroText: {
			en: 'One chapter a day, on real open-source code. Questions come back later so they stick.',
			fr: 'Un chapitre par jour, sur du vrai code open source. Les questions reviennent plus tard pour que ça reste.'
		}
	}
];

/** @param {string} id */
export const dojoById = (id) => dojos.find((d) => d.id === id);
