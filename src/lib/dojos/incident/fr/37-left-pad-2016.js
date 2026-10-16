const PM = 'https://blog.npmjs.org/post/141577284765/kik-left-pad-and-npm';
const UNPUBLISH = 'https://blog.npmjs.org/post/141905368000/changes-to-npms-unpublish-policy';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'left-pad-2016',
	part: 'Sécurité',
	title: 'npm left-pad 2016 : le paquet dépublié qui a cassé les builds',
	minutes: 10,
	hook: [
		'Mardi 22 mars 2016, un peu après 14 h 30, heure du Pacifique. Tu es d’astreinte sur le registre npm. Le registre se met à enregistrer des centaines d’installations en échec par minute.',
		'Les échecs viennent de nombreux projets en même temps, et des projets qui dépendent d’eux. Chacun échoue au moment où il demande le même paquet : left-pad.',
		'left-pad tient dans un `index.js` de 17 lignes. Sa seule fonction ajoute des caractères à gauche d’une chaîne jusqu’à une longueur donnée.'
	],
	terms: [
		{ term: 'Dépublier', def: 'Retirer une version d’un paquet du registre npm. En mars 2016, un auteur pouvait dépublier n’importe quelle version à tout moment.' },
		{ term: 'Version exacte', def: 'Une dépendance écrite `"0.0.3"`, sans `^` ni `~`. npm installe cette version et aucune autre.' },
		{ term: 'Squat de nom', def: 'Publier sous un nom de paquet qu’un autre a utilisé avant, pour que les installations existantes reçoivent ton code.' },
		{ term: 'Paquet de réservation', def: 'Un paquet que npm publie sous un nom retiré, pour que personne d’autre ne puisse prendre ce nom.' }
	],
	incident: {
		org: 'npm, Inc.',
		title: 'kik, left-pad, and npm',
		date: '2016-03-22',
		url: PM,
		steps: [
			{
				situation: [
					'Ces dernières semaines, l’auteur de left-pad, Azer Koçulu, et la société Kik se sont disputé le nom de paquet `kik`. npm a appliqué sa politique de litiges et a donné le nom à Kik.',
					'Sans prévenir les projets qui en dépendent, Azer a ensuite dépublié son paquet `kik` et 272 autres. left-pad en fait partie. Le nom left-pad est donc libre.',
					'Cameron Westland, membre de la communauté, veut publier un left-pad qui fait exactement la même chose. left-pad est open source.'
				],
				q: 'Que le registre le laisse-t-il publier ?',
				options: [
					'Rien tant que npm n’a pas consulté Azer',
					'Le même code en version 0.0.3, celle qui a disparu',
					'Le même code sous un nouveau numéro, 1.0.0',
					'Un nouveau paquet left-pad-2 vers lequel les projets migrent'
				],
				answer: 2,
				why: 'npm permet à « anyone to use an abandoned package name as long as they don’t use the same version numbers ». Cameron a publié left-pad 1.0.0 en moins de dix minutes. Un nouveau nom comme left-pad-2 ne réparerait rien tant que chaque projet n’a pas modifié son `package.json`.'
			},
			{
				situation: [
					'left-pad 1.0.0 est sur le registre, et beaucoup d’erreurs continuent. Les requêtes en échec passent par babel et atom.',
					'Les deux tirent left-pad via le paquet line-numbers, dont le `package.json` contient `"left-pad": "0.0.3"`.'
				],
				q: 'Que fais-tu des erreurs qui restent ?',
				options: [
					'Republier la 0.0.3 d’origine depuis une sauvegarde',
					'Demander à Cameron de republier son code en 0.0.3',
					'Dire aux utilisateurs de vider leur cache npm et de réessayer',
					'Attendre que babel et atom changent leur dépendance'
				],
				answer: 0,
				why: 'Une version exacte ne correspond jamais à 1.0.0. npm « took the unprecedented step of re-publishing the original 0.0.3 ». Il a fallu une sauvegarde, « since re-publishing isn’t otherwise possible », et le registre refuse toute nouvelle publication sous un numéro déjà utilisé.'
			},
			{
				situation: [
					'npm n’a jamais republié une version que son auteur a retirée. La panne touche plusieurs milliers de projets, et chacun va récupérer un code que son auteur a supprimé.'
				],
				q: 'Que fais-tu avant de lancer la republication ?',
				options: [
					'La lancer sans bruit et l’expliquer dans le postmortem',
					'Annoncer le plan en public, puis le lancer',
					'Écrire seulement aux mainteneurs de babel et d’atom',
					'Demander l’accord d’Azer et attendre sa réponse'
				],
				answer: 1,
				why: 'npm a « announced this plan at 4:05 PM and completed the operation by 4:55 PM ». npm rappelle que left-pad « was open-source code, and explicitly allows republishing by any other author ». npm a écrit ensuite : « Poor communication made matters worse. »'
			},
			{
				situation: [
					'Les 272 autres noms sont libres eux aussi. En une dizaine de minutes, des membres de la communauté les prennent. Certains republient des forks des modules d’origine, d’autres publient des paquets « dummy » pour que personne ne publie de code malveillant sous ces noms.'
				],
				q: 'Que fais-tu de ces 272 noms ?',
				options: [
					'Les rendre à Azer une fois le litige réglé',
					'Laisser chaque nom à la personne qui l’a pris en premier',
					'Supprimer les 272 noms pour que les paquets restent absents',
					'Les confier à npm avec l’accord de ceux qui les ont pris'
				],
				answer: 3,
				why: 'npm : « With their explicit permission, we are working with them to transfer these to npm’s direct control. » Celui qui détient un nom peut publier de nouvelles versions, et un projet dont la plage correspond les installe.'
			},
			{
				situation: [
					'La panne a duré 2,5 heures. npm garde sa politique de litiges : quand un nom change de propriétaire, les anciennes versions restent sur le registre. Le transfert de `kik` seul n’aurait rien cassé.'
				],
				q: 'Quel changement empêche un seul auteur de casser à nouveau autant d’installations ?',
				options: [
					'Retirer `npm unpublish` de la ligne de commande pour de bon',
					'Ne plus transférer de noms de paquets lors des litiges',
					'Bloquer la dépublication des versions de plus de 24 heures',
					'Obliger chaque projet à versionner un lockfile avant d’installer'
				],
				answer: 2,
				why: 'À partir du 29 mars 2016, une version de plus de 24 heures ne peut partir que via le support npm, qui vérifie d’abord « if removing that version of your package would break any other installs ». npm explique que la dépublication a des « important and legitmate reasons », et garde donc la commande.'
			}
		],
		outcome: [
			'Azer Koçulu a dépublié 273 paquets après que npm a donné le nom `kik` à la société Kik. L’un d’eux, left-pad, était une dépendance du paquet line-numbers. Or babel et atom installaient line-numbers. À partir d’un peu après 14 h 30, heure du Pacifique, les installations qui le demandaient échouaient par centaines chaque minute.',
			'Un membre de la communauté a publié left-pad 1.0.0 en moins de dix minutes. babel et atom échouaient toujours, car line-numbers demandait exactement 0.0.3. npm a republié la 0.0.3 depuis une sauvegarde avant 16 h 55. La panne a duré 2,5 heures.',
			'npm a écrit : « Unrestricted un-publishing caused a lot of pain. » Et aussi : « It took us too long to get you this update. »',
			'Le 29 mars 2016, npm a changé les règles de dépublication. Un auteur peut retirer une version pendant les 24 heures qui suivent sa publication. Ensuite, le support vérifie d’abord les dépendants. Un paquet dont toutes les versions sont retirées est remplacé par un paquet de réservation de sécurité.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi left-pad 1.0.0 n’a-t-il pas réparé les installations de babel ?',
			options: [
				'La version 1.0.0 avait un bug dans la fonction de remplissage',
				'line-numbers demandait exactement 0.0.3, et 1.0.0 ne correspond pas',
				'Le CDN de npm a servi le paquet supprimé pendant une heure',
				'babel vérifiait le nom de l’auteur de chaque dépendance'
			],
			answer: 1,
			why: 'Une dépendance écrite `"0.0.3"` ne correspond qu’à 0.0.3. Une plage `^0.0.3` n’aurait pas accepté 1.0.0 non plus : semver la définit comme `>=0.0.3 <0.0.4-0`.'
		},
		{
			q: 'Avec les règles du 29 mars 2016, tu as publié une version il y a 30 heures. Que se passe-t-il si tu lances `npm unpublish` dessus ?',
			options: [
				'La commande échoue et te demande de contacter le support npm',
				'La version est retirée tout de suite',
				'La version disparaît de la recherche mais s’installe encore',
				'Tout le paquet passe en réservation'
			],
			answer: 0,
			why: 'Au-delà de 24 heures, « the unpublish will fail, with a message to contact » le support npm. Le support vérifie alors si retirer la version casse d’autres installations, et refuse si c’est le cas.'
		},
		{
			q: 'Pourquoi des membres de la communauté ont-ils publié des paquets « dummy » sous les 272 noms libérés ?',
			options: [
				'Pour garder les statistiques de téléchargement de ces noms',
				'Pour que les installations de ces noms échouent plus vite',
				'Pour que personne n’y publie de code malveillant',
				'Pour que npm puisse faire payer ces noms plus tard'
			],
			answer: 2,
			why: 'N’importe quel compte pouvait prendre un nom libéré et y publier de nouvelles versions. npm a ensuite remplacé les paquets entièrement dépubliés par un paquet de réservation, « so that the formerly used name will not be susceptible to malicious squatting ».'
		}
	],
	recall: {
		q: 'Comment npm a-t-il arrêté les échecs de babel et d’atom pendant l’incident left-pad ?',
		a: 'Il a republié la version d’origine left-pad 0.0.3 depuis une sauvegarde, parce que line-numbers demandait exactement cette version. C’était fait avant 16 h 55, après 2,5 heures de panne.'
	},
	sources: [
		{ title: 'Blog npm, kik, left-pad, and npm', url: PM },
		{ title: 'Blog npm, changes to npm’s unpublish policy', url: UNPUBLISH },
		{ title: 'unpkg, index.js de left-pad 0.0.3', url: 'https://unpkg.com/left-pad@0.0.3/index.js' },
		{ title: 'Registre npm, métadonnées de line-numbers 0.2.0', url: 'https://registry.npmjs.org/line-numbers/0.2.0' },
		{ title: 'README de node-semver, Caret Ranges', url: 'https://github.com/npm/node-semver/blob/6e05b7637396ac66522cff8731f07cfe0ef49a29/README.md#L342-L360' }
	]
};
