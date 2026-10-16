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
	},
	{
		id: 'bugs',
		name: 'Spot the Bug Dojo',
		hue: 350,
		chroma: 0.1,
		hex: { top: '#dfa3bf', left: '#9f5d7d', right: '#c67ea0' },
		description: {
			en: 'Real bugs from open-source projects, as the code was before the fix. Find the line, then read the fix.',
			fr: 'De vrais bugs de projets open source, dans le code d’avant le correctif. Trouve la ligne, puis lis le correctif.'
		},
		heroTitle: {
			en: 'Find the bug before you read the fix.',
			fr: 'Trouve le bug avant de lire le correctif.'
		},
		heroText: {
			en: 'One real bug a day, from a real fix commit. Questions come back later so they stick.',
			fr: 'Un vrai bug par jour, tiré d’un vrai commit de correctif. Les questions reviennent plus tard pour que ça reste.'
		}
	},
	{
		id: 'kata',
		name: 'Kata Dojo',
		hue: 245,
		chroma: 0.1,
		hex: { top: '#8cbde8', left: '#407aa9', right: '#609ed1' },
		description: {
			en: 'One system design exercise a day: a brief, ten minutes on paper, a checklist and a sample answer.',
			fr: 'Un exercice de conception de système par jour : un énoncé, dix minutes sur papier, une liste de vérification et une réponse possible.'
		},
		heroTitle: {
			en: 'Design one system a day, on paper.',
			fr: 'Conçois un système par jour, sur papier.'
		},
		heroText: {
			en: 'Read the brief, sketch for ten minutes, check your design against the list, then compare with one answer.',
			fr: 'Lis l’énoncé, dessine pendant dix minutes, vérifie ton design avec la liste, puis compare avec une réponse.'
		}
	},
	{
		id: 'incident',
		name: 'Incident Dojo',
		hue: 25,
		chroma: 0.1,
		hex: { top: '#e6a49e', left: '#a65e58', right: '#ce7f78' },
		description: {
			en: 'Real outages from public postmortems, replayed one decision at a time, one 10-minute chapter a day.',
			fr: 'De vraies pannes tirées de postmortems publics, rejouées une décision à la fois, un chapitre de 10 minutes par jour.'
		},
		heroTitle: {
			en: 'Be on call for real outages, ten minutes a day.',
			fr: 'Sois d’astreinte sur de vraies pannes, dix minutes par jour.'
		},
		heroText: {
			en: 'Each chapter is a real incident: you decide what to do at each step, then read what the team found.',
			fr: 'Chaque chapitre est un vrai incident : tu décides quoi faire à chaque étape, puis tu lis ce que l’équipe a trouvé.'
		}
	}
];

/** @param {string} id */
export const dojoById = (id) => dojos.find((d) => d.id === id);
