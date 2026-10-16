/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'modular-monolith',
	part: 'Architecture',
	title: 'Découper un monolithe',
	minutes: 10,
	hook: [
		'Une boutique en ligne tourne sur une seule application Rails de 300 000 lignes. Quatre équipes de 6 à 8 développeurs y fusionnent environ 25 fois par jour. Le mois dernier, 18 fusions d’une équipe ont cassé les tests d’une autre.',
		'L’équipe Billing a changé l’arrondi des centimes d’un remboursement. Le lendemain matin, le test du récapitulatif de commande de l’équipe Orders a échoué : le récapitulatif appelait directement le code de remboursement. Personne chez Orders ne connaissait cet appel.',
		'Le CTO demande un plan. Quelqu’un dit « microservices ». Quelqu’un d’autre dit « commençons par ranger les dossiers ». Tu as un trimestre, et tu dois nommer le premier module à sortir.'
	],
	terms: [
		{ term: 'Monolithe modulaire', def: 'Une seule base de code et un seul déploiement, avec des frontières imposées entre modules : un module n’appelle un autre module que par son code public.' },
		{ term: 'Packwerk', def: 'Une gem Ruby de Shopify qui regroupe des fichiers en packages et signale une violation quand un package utilise une constante d’un package qu’il n’a pas déclaré comme dépendance.' },
		{ term: 'Référence entrante', def: 'Un endroit du code d’un autre module qui utilise une classe de ce module. Chacune doit changer si ce module sort.' }
	],
	kata: {
		brief: [
			'Un script a compté le code par dossier et les références entre dossiers. Catalog : 80 000 lignes, 1 400 références entrantes, partage 9 de ses 12 tables avec d’autres modules. Orders : 110 000 lignes, 2 100 références entrantes, partage 14 tables sur 20.',
			'Billing : 40 000 lignes, 600 références entrantes, partage 3 de ses 8 tables. Notifications : 25 000 lignes, 900 références entrantes, ne possède aucune table et lit 11 tables d’autres modules. Les 45 000 lignes restantes sont des écrans d’admin et des helpers partagés.',
			'Chacune des 4 équipes possède un module parmi Catalog, Orders, Billing et Notifications. La suite de tests complète prend 45 minutes en CI. L’application est déployée 6 fois par jour.',
			'Décide quel module sort en premier, ce que « sortir » veut dire pendant ce premier trimestre (son propre dossier, une frontière imposée ou son propre service), et comment l’équipe bloque les nouveaux couplages pendant qu’elle retire les anciens.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma nomme le premier module à sortir et donne les chiffres qui ont décidé ce choix.',
			'Ton schéma dit pourquoi le plus petit module (Notifications, 25 000 lignes) passe ou ne passe pas en premier.',
			'Ton schéma dit qui lit et qui écrit les tables que le module partage avec d’autres.',
			'Ton schéma dit quel outil repère une nouvelle référence qui traverse la frontière, et à quelle étape d’une fusion.',
			'Ton schéma dit ce qui arrive aux références entrantes existantes le premier jour, et à quel rythme elles disparaissent.',
			'Ton schéma dit si le module part dans un service séparé ce trimestre, et ce que ça ajoute ou ce que ça évite.'
		],
		sample: [
			'Billing sort en premier. Une seule équipe le possède, il a le moins de références entrantes (600) et il ne partage que 3 tables. Notifications est plus petit, mais il lit 11 tables d’autres modules. Sorti, il aurait besoin dès le premier jour des données des trois autres équipes.',
			'Pendant le premier trimestre, Billing reste dans la même application et le même déploiement. L’article de Shopify de 2019 décrit ce choix pour son monolithe Rails : « we would keep all of the code in one codebase, but ensure that boundaries were defined and respected between different components. » Un service séparé ajouterait un appel réseau, son propre pipeline et sa propre base avant même que la frontière soit propre.',
			'Première étape : les fichiers de Billing vont dans `components/billing`. Shopify a déplacé ainsi environ 6 000 classes « in one big bang PR built by automated scripts » (une seule grosse PR générée par des scripts). Le coût noté : GitHub a affiché beaucoup de déplacements comme des suppressions et des créations, et l’historique des fichiers est devenu plus dur à suivre.',
			'Deuxième étape : chaque module reçoit un `package.yml` Packwerk avec `enforce_dependencies: true`. `bin/packwerk update-todo` inscrit les 600 violations existantes dans `package_todo.yml`. `bin/packwerk check` tourne en CI et échoue sur toute nouvelle violation : le compteur ne peut que baisser.',
			'Billing publie ensuite une petite API publique : débiter, rembourser et facturer une commande. Chaque semaine, les autres équipes remplacent des appels directs par des appels à cette API. À 30 références par semaine, les 600 disparaissent en 20 semaines, un peu plus d’un trimestre.',
			'Les 3 tables partagées passent derrière l’API en dernier : Orders lit les remboursements par le code de Billing, et seul le code de Billing les écrit. Quand le `package_todo.yml` de Billing est vide et qu’aucun autre module ne touche ses 8 tables, en faire un service séparé ne demande plus qu’un changement de déploiement.',
			'Ce que ce schéma abandonne : la suite de tests de 45 minutes et le déploiement commun restent pour l’instant. Packwerk ne voit que les références à des constantes, et son README le dit : « Method calls and objects passed around the application are completely ignored. » Une partie du couplage reste cachée jusqu’à ce qu’un test ou une relecture la trouve.'
		]
	},
	quiz: [],
	recall: {
		q: 'Pourquoi Billing sort en premier, et pas Notifications, le plus petit module ?',
		a: 'Billing a le moins de références entrantes (600) et ne partage que 3 tables. Notifications lit 11 tables d’autres modules : le sortir d’abord demande les données de toutes les autres équipes.'
	},
	sources: [
		{ title: 'Shopify Engineering : Deconstructing the Monolith (2019)', url: 'https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity' },
		{ title: 'Packwerk USAGE.md : imposer les dépendances et le fichier package todo', url: 'https://github.com/Shopify/packwerk/blob/31e534283f93a225b520cddab3c2d735557c76de/USAGE.md' },
		{ title: 'Packwerk README : Limitations', url: 'https://github.com/Shopify/packwerk/blob/31e534283f93a225b520cddab3c2d735557c76de/README.md#limitations' }
	]
};
