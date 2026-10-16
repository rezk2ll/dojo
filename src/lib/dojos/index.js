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
			en: 'One chapter a day, on real open-source code. Questions you get right come back 1, 3, 7, 21 and 45 days later.',
			fr: 'Un chapitre par jour, sur du vrai code open source. Une question réussie revient 1, 3, 7, 21 puis 45 jours plus tard.'
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
			en: 'One chapter a day, on real open-source code. Questions you get right come back 1, 3, 7, 21 and 45 days later.',
			fr: 'Un chapitre par jour, sur du vrai code open source. Une question réussie revient 1, 3, 7, 21 puis 45 jours plus tard.'
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
			en: 'One chapter a day, on real open-source code. Questions you get right come back 1, 3, 7, 21 and 45 days later.',
			fr: 'Un chapitre par jour, sur du vrai code open source. Une question réussie revient 1, 3, 7, 21 puis 45 jours plus tard.'
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
			en: 'One real bug a day, from a real fix commit. Questions you get right come back 1, 3, 7, 21 and 45 days later.',
			fr: 'Un vrai bug par jour, tiré d’un vrai commit de correctif. Une question réussie revient 1, 3, 7, 21 puis 45 jours plus tard.'
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
	},
	{
		id: 'ai',
		name: 'AI Dojo',
		hue: 320,
		chroma: 0.1,
		hex: { top: '#cfa7d8', left: '#8e6298', right: '#b383be' },
		description: {
			en: 'How language models work and how to use them well, from prompts to agents and Claude Code, one 10-minute chapter a day.',
			fr: 'Comment marchent les modèles de langage et comment bien s’en servir, des prompts aux agents et à Claude Code, un chapitre de 10 minutes par jour.'
		},
		heroTitle: {
			en: 'Work well with AI models, ten minutes a day.',
			fr: 'Travaille bien avec les modèles d’IA, dix minutes par jour.'
		},
		heroText: {
			en: 'One chapter a day, checked against the docs and real code. Questions you get right come back 1, 3, 7, 21 and 45 days later.',
			fr: 'Un chapitre par jour, vérifié dans la doc et du vrai code. Une question réussie revient 1, 3, 7, 21 puis 45 jours plus tard.'
		}
	},
	{
		id: 'drills',
		name: 'Drills Dojo',
		hue: 110,
		chroma: 0.1,
		hex: { top: '#babc80', left: '#797a31', right: '#9b9d50' },
		description: {
			en: 'Typed reps for the commands you use every day: git, the shell, SQL, regex, jq, curl and kubectl.',
			fr: 'Des répétitions à taper pour les commandes de tous les jours : git, le shell, SQL, les regex, jq, curl et kubectl.'
		},
		heroTitle: {
			en: 'Type the command without looking it up.',
			fr: 'Tape la commande sans la chercher.'
		},
		heroText: {
			en: 'Each drill is a set of short tasks. You type the answer, the app checks it and shows the answer with why it works.',
			fr: 'Chaque exercice est une série de petites tâches. Tu tapes la réponse, l’appli la vérifie et te montre la réponse avec son explication.'
		}
	},
	{
		id: 'security',
		name: 'Security Dojo',
		hue: 145,
		chroma: 0.1,
		hex: { top: '#98c598', left: '#4f8451', right: '#6fa871' },
		description: {
			en: 'How attacks on web apps and infrastructure work and how to stop them, one 10-minute chapter a day, taught on real open-source code.',
			fr: 'Comment marchent les attaques sur les applis web et l’infra, et comment les arrêter, un chapitre de 10 minutes par jour, sur du vrai code open source.'
		},
		heroTitle: {
			en: 'Learn how systems get attacked, ten minutes a day.',
			fr: 'Apprends comment on attaque un système, dix minutes par jour.'
		},
		heroText: {
			en: 'Each chapter shows how one attack works, then how a real open-source project defends against it.',
			fr: 'Chaque chapitre montre comment marche une attaque, puis comment un vrai projet open source s’en protège.'
		}
	},
	{
		id: 'networking',
		name: 'Networking Dojo',
		hue: 170,
		chroma: 0.1,
		hex: { top: '#82c8b0', left: '#2c876c', right: '#4eac8e' },
		description: {
			en: 'What happens between your app and the next one: IP, TCP, DNS, HTTP, TLS and load balancers, one 10-minute chapter a day.',
			fr: 'Ce qui se passe entre ton app et la suivante : IP, TCP, DNS, HTTP, TLS et load balancers, un chapitre de 10 minutes par jour.'
		},
		heroTitle: {
			en: 'Follow one request across the network.',
			fr: 'Suis une requête à travers le réseau.'
		},
		heroText: {
			en: 'One chapter a day, with real packet captures, real config from open-source projects and the RFC that defines the behaviour.',
			fr: 'Un chapitre par jour, avec de vraies captures de paquets, de la vraie config de projets open source et la RFC qui définit le comportement.'
		}
	},
	{
		id: 'linux',
		name: 'Linux Dojo',
		hue: 80,
		chroma: 0.1,
		hex: { top: '#d2b27c', left: '#926e2b', right: '#b8914b' },
		description: {
			en: 'What the kernel does under your services: processes, memory, files, systemd and containers, one 10-minute chapter a day.',
			fr: 'Ce que fait le noyau sous tes services : processus, mémoire, fichiers, systemd et conteneurs, un chapitre de 10 minutes par jour.'
		},
		heroTitle: {
			en: 'Know what the kernel is doing to your app.',
			fr: 'Sache ce que le noyau fait à ton app.'
		},
		heroText: {
			en: 'Symptoms like exit code 137 or a full disk with free space, traced to the kernel code or the man page that explains them.',
			fr: 'Des symptômes comme un code de sortie 137 ou un disque plein avec de l’espace libre, expliqués par le code du noyau ou la page de man.'
		}
	}
];

/** @param {string} id */
export const dojoById = (id) => dojos.find((d) => d.id === id);
