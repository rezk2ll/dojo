const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'what-is-devops',
	part: 'L’état d’esprit DevOps',
	title: 'Ce qu’est DevOps : dev et ops responsables d’un même service',
	minutes: 10,
	hook: [
		'Vendredi, 17 h. L’équipe de dev t’envoie une archive et un README qui dit « à déployer en prod ». Samedi, 2 h du matin, l’appli tombe. Lundi, les devs disent « ça marche sur ma machine », et toi tu réponds « sur la mienne, ça n’a jamais marché ».',
		'Les deux équipes font leur travail. Les devs sont payés pour livrer des fonctionnalités, et toi pour que tout reste debout. La plupart des pannes viennent d’un changement, donc **l’objectif de chaque équipe joue contre celui de l’autre**. Entre vous, il y a un mur fait de tickets et de passations.',
		'DevOps supprime ce mur. Tu ne l’installes pas et tu ne le recrutes pas. Ceux qui construisent le service et ceux qui l’exploitent en sont responsables ensemble.'
	],
	terms: [
		{ term: 'DevOps', def: 'Un mélange de culture, de pratiques et d’outils qui permet à une organisation de livrer et d’exploiter du logiciel vite et de façon fiable. Dev et ops partagent l’objectif au lieu de se passer le travail par-dessus un mur.' },
		{ term: 'Silo', def: 'Une équipe qui travaille pour son propre objectif, avec ses outils et son vocabulaire, et ne parle aux autres équipes que par tickets.' },
		{ term: 'CALMS', def: 'Culture, Automation, Lean, Measurement, Sharing. Une grille pour voir jusqu’où une équipe est vraiment allée vers DevOps.' },
		{ term: 'Silo d’équipe DevOps', def: 'L’anti-pattern : une nouvelle équipe appelée « DevOps » placée entre dev et ops. Elle ajoute un deuxième mur et éloigne encore dev et ops.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'dev["Équipe dev : livrer des fonctionnalités"] -->|"release par-dessus le mur"| wall["Le mur : tickets et passations"]',
					'wall --> ops["Équipe ops : rien ne doit casser"]'
				],
				highlight: ['dev', 'wall', 'ops'],
				note: 'Le découpage classique. D’après le livre SRE de Google, les devs veulent lancer, les ops veulent que le service ne casse pas pendant leur astreinte, et **la plupart des pannes viennent d’un changement**. Chaque équipe est donc payée pour un objectif qui gêne celui de l’autre.'
			},
			{
				add: [
					'ops --> gate["Barrières : revues, gels des changements"]',
					'gate -.->|"ralentit"| dev'
				],
				highlight: ['gate'],
				note: 'Les ops protègent le système avec des barrières. Les devs apprennent à les contourner : moins de « lancements », plus de petits « flag flips ». Le livre SRE parle de guerre de tranchées. Chaque camp agit avec bon sens pour son propre objectif, et le service casse ou sort en retard quand même.'
			},
			{
				add: [
					'subgraph shared["Responsabilité partagée"]',
					'code["Appli, config et étapes de déploiement dans un seul dépôt"]',
					'pager["Une seule rotation d’astreinte"]',
					'end',
					'dev --> code',
					'ops --> code',
					'dev --> pager',
					'ops --> pager'
				],
				highlight: ['code', 'pager'],
				note: 'Cette étape correspond à Culture et Sharing, le C et le S de CALMS. Dev et ops travaillent sur les mêmes fichiers et portent la même astreinte. Quand ça casse à 2 h du matin, la personne qui a écrit le changement est là.'
			},
			{
				add: [
					'code --> auto["Build, tests et déploiement automatisés"]',
					'auto --> users["Utilisateurs"]',
					'users -.->|"métriques et incidents"| dev',
					'class users ext'
				],
				highlight: ['auto', 'users'],
				note: 'Cette étape correspond à Automation, Lean et Measurement. Les machines font les étapes répétables, le travail avance par petits morceaux, et les chiffres de la prod reviennent vers ceux qui peuvent corriger le code. Les prochains chapitres prennent chacun de ces points.'
			}
		]
	},
	example: {
		title: 'nginx-flask-mysql/compose.yaml',
		repo: 'docker/awesome-compose',
		url: `${COMPOSE}/nginx-flask-mysql/compose.yaml#L1-L41`,
		lang: 'yaml',
		code: `services:
  db:
    # We use a mariadb image which supports both amd64 & arm64 architecture
    image: mariadb:10-focal
…
    restart: always
    healthcheck:
      test: ['CMD-SHELL', 'mysqladmin ping -h 127.0.0.1 --password="$$(cat /run/secrets/db-password)" --silent']
      interval: 3s
      retries: 5
      start_period: 30s
…
  backend:
    build:
      context: backend
      target: builder
    restart: always
…
    depends_on:
      db:
        condition: service_healthy`,
		notes: [
			'Avant, un ops gardait ces règles dans un wiki ou dans sa tête : démarrer la base d’abord, vérifier qu’elle répond, relancer ce qui plante. Ici, elles sont dans **un fichier du dépôt de l’appli**, à côté du code, et passent par la même revue. Tu apprendras Compose dans la partie 4.',
			'Lignes 19 à 21 : `condition: service_healthy` dit à Compose d’attendre que le healthcheck de `db` (lignes 7 à 11) passe avant de démarrer `backend` ([doc Compose](https://docs.docker.com/reference/compose-file/services/)). Personne n’a besoin de retenir l’ordre de démarrage.',
			'Lignes 6 et 17 : `restart: always` relance le conteneur jusqu’à ce qu’il soit supprimé. Tu connais `Restart=always` dans une unit systemd. Ici, le développeur voit aussi ce réglage.',
			'Docker Compose est un outil, et l’installer ne change aucune équipe. La partie DevOps, c’est que **dev et ops lisent, modifient et possèdent ce fichier ensemble**.'
		]
	},
	tradeoff: {
		gain: [
			'Un changement n’attend plus dans une file de tickets entre deux équipes.',
			'La personne qui a écrit le changement voit l’incident et sait où regarder.',
			'La façon dont l’appli tourne est écrite dans des fichiers relus des deux côtés, comme `compose.yaml`, et personne ne dépend de la mémoire d’un collègue.'
		],
		cost: [
			'Les devs doivent apprendre l’exploitation et participer à l’astreinte. Les ops doivent apprendre Git, la revue de code et un peu de programmation.',
			'Une réorganisation ou l’achat d’un outil ne suffit pas à changer la façon de travailler, et les gens changent leurs habitudes lentement.',
			'Si tu renommes l’équipe ops « équipe DevOps », tu obtiens un nouveau silo avec un nouveau nom.'
		]
	},
	task: {
		prompt: 'Ta boîte annonce : « On passe au DevOps. On a recruté trois ingénieurs DevOps dans une nouvelle équipe DevOps. Ils seront responsables de la CI et de tous les déploiements. » Devs et ops restent comme avant. Avec CALMS, dis ce qui va probablement mal tourner et ce que tu proposerais à la place.',
		hint: 'Compte les murs avant et après. Puis demande-toi qui est appelé quand un déploiement casse, et qui a écrit le changement.',
		answer: [
			'Avant : un mur (dev vers ops). Après : deux murs (dev vers équipe DevOps vers ops). DevOps Topologies appelle cet anti-pattern le **silo d’équipe DevOps**.',
			'Culture et Sharing : rien ne change. Les devs jettent toujours le code par-dessus un mur, juste un autre. Chaque release attend maintenant la nouvelle équipe.',
			'Automation : le pipeline peut progresser, mais il appartient à une seule équipe, donc personne d’autre ne l’apprend ni ne le modifie.',
			'Proposition : rendre la nouvelle équipe **temporaire**, avec pour mission de se rendre inutile. Elle construit le pipeline avec l’équipe dev, travaille en binôme avec les ops, puis rend la main. Les devs rejoignent l’astreinte de leur propre service.',
			'Measurement : se mettre d’accord sur quelques chiffres partagés pour le service (prochains chapitres : les métriques DORA), vus par les devs comme par les ops.'
		]
	},
	quiz: [
		{
			q: 'Quelle phrase décrit le mieux DevOps ?',
			options: [
				'Un intitulé de poste pour l’ingénieur qui maintient le serveur de CI et les scripts de déploiement',
				'Une façon de travailler où dev et ops partagent la responsabilité de livrer et d’exploiter le service',
				'Un ensemble d’outils comme Docker, Jenkins et Kubernetes qu’une équipe adopte ensemble',
				'Une équipe placée entre les développeurs et les ops pour gérer chaque déploiement'
			],
			answer: 1,
			why: 'DevOps réunit culture, pratiques et outils pour supprimer le mur entre dev et ops. Un titre ou des outils laissent le mur en place, et une équipe de plus au milieu ajoute un deuxième mur.'
		},
		{
			q: 'Dans CALMS, que veut dire le L ?',
			options: ['Lean', 'Linux', 'Logging', 'Load balancing'],
			answer: 0,
			why: 'Culture, Automation, Lean, Measurement, Sharing. Lean, c’est avancer par petits pas, supprimer le gaspillage et s’améliorer en continu.'
		},
		{
			q: 'D’après le livre SRE de Google, pourquoi les objectifs d’une équipe dev classique et d’une équipe ops classique sont-ils en tension ?',
			options: [
				'Parce que les équipes ops utilisent un autre système d’exploitation que celui des devs',
				'Parce que les développeurs écrivent rarement des tests, donc les ops attrapent les bugs en production',
				'Parce que la plupart des pannes viennent d’un changement, et que les devs sont payés pour faire des changements',
				'Parce que les équipes ops sont plus grandes que les équipes dev, donc elles gagnent chaque arbitrage'
			],
			answer: 2,
			why: 'Les devs veulent lancer des fonctionnalités, les ops veulent que le service ne casse pas. Comme le changement est la première cause de panne, l’objectif de chacun joue contre celui de l’autre.'
		}
	],
	recall: {
		q: 'Que veulent dire les cinq lettres de CALMS, et que se passe-t-il quand une boîte ajoute une « équipe DevOps » entre dev et ops ?',
		a: 'Culture, Automation, Lean, Measurement, Sharing. La nouvelle équipe ajoute un deuxième mur (dev vers équipe DevOps vers ops) : c’est l’anti-pattern du silo d’équipe DevOps.'
	},
	sources: [
		{ title: 'AWS, What is DevOps?', url: 'https://aws.amazon.com/devops/what-is-devops/' },
		{ title: 'Atlassian, le framework CALMS', url: 'https://www.atlassian.com/devops/frameworks/calms-framework' },
		{ title: 'Livre SRE de Google, Introduction (l’approche sysadmin et ses coûts)', url: 'https://sre.google/sre-book/introduction/' },
		{ title: 'DevOps Topologies, anti-types et types d’équipes', url: 'https://web.devopstopologies.com/' },
		{ title: 'Doc Docker, référence des services du fichier Compose', url: 'https://docs.docker.com/reference/compose-file/services/' }
	]
};
