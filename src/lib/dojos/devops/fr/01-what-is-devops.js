const COMPOSE = 'https://github.com/docker/awesome-compose/blob/30f4b7f6a6c3b0c0ecf4d4efb0de203c48d11562';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'what-is-devops',
	part: 'L’état d’esprit DevOps',
	title: 'DevOps est une façon de travailler, pas un intitulé de poste',
	minutes: 10,
	hook: [
		'Vendredi, 17 h. L’équipe de dev t’envoie une archive et un README qui dit « à déployer en prod ». Samedi, 2 h du matin, l’appli tombe. Lundi, les devs disent **« ça marche sur ma machine »**, et toi tu réponds « sur la mienne, ça n’a jamais marché ».',
		'Personne n’est paresseux ni incompétent. Les devs sont payés pour livrer des fonctionnalités. Toi, pour que tout reste debout. La plupart des pannes viennent d’un changement, donc **vos deux objectifs tirent en sens inverse**. Entre vous, il y a un mur fait de tickets et de passations.',
		'DevOps, c’est la décision d’abattre ce mur. Pas un outil qu’on installe, pas une équipe qu’on recrute. Une façon de travailler où **ceux qui construisent le service et ceux qui l’exploitent en sont responsables ensemble**.'
	],
	terms: [
		{ term: 'DevOps', def: 'Un mélange de culture, de pratiques et d’outils qui permet à une organisation de livrer et d’exploiter du logiciel vite et de façon fiable. Dev et ops partagent l’objectif au lieu de se passer le travail par-dessus un mur.' },
		{ term: 'Silo', def: 'Une équipe qui travaille pour son propre objectif, avec ses outils et son vocabulaire, et ne parle aux autres équipes que par tickets.' },
		{ term: 'CALMS', def: 'Culture, Automation, Lean, Measurement, Sharing. Une grille pour voir jusqu’où une équipe est vraiment allée vers DevOps.' },
		{ term: 'You build it, you run it', def: 'Ceux qui écrivent un service participent aussi à son exploitation, astreinte comprise.' },
		{ term: 'Silo d’équipe DevOps', def: 'L’anti-pattern : une nouvelle équipe appelée « DevOps » placée entre dev et ops. Elle devient un silo de plus et éloigne encore dev et ops.' }
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
				note: 'Le découpage classique. Le livre SRE de Google le dit clairement : les devs veulent lancer, les ops veulent que le service ne casse pas pendant leur astreinte, et **la plupart des pannes viennent d’un changement**. Les objectifs sont en tension par construction.'
			},
			{
				add: [
					'ops --> gate["Barrières : revues, gels des changements"]',
					'gate -.->|"ralentit"| dev'
				],
				highlight: ['gate'],
				note: 'Les ops protègent le système avec des barrières. Les devs apprennent à les contourner : moins de « lancements », plus de petits « flag flips ». Le livre SRE parle de **guerre de tranchées**. Chaque camp agit de façon rationnelle, et c’est le service qui perd.'
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
				note: '**Culture** et **Sharing**, le C et le S de CALMS. Dev et ops travaillent sur les mêmes fichiers et portent la même astreinte. Quand ça casse à 2 h du matin, la personne qui a écrit le changement est là.'
			},
			{
				add: [
					'code --> auto["Build, tests et déploiement automatisés"]',
					'auto --> users["Utilisateurs"]',
					'users -.->|"métriques et incidents"| dev',
					'class users ext'
				],
				highlight: ['auto', 'users'],
				note: '**Automation**, **Lean** et **Measurement**. Les machines font les étapes répétables, le travail avance par petits morceaux, et les chiffres de la prod reviennent vers ceux qui peuvent corriger le code. Les prochains chapitres prennent chacun de ces points.'
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
			'C’est un savoir qu’un ops gardait dans un wiki ou dans sa tête : démarrer la base d’abord, vérifier qu’elle répond, relancer ce qui plante. Ici, c’est **un fichier dans le dépôt de l’appli**, à côté du code, modifié avec la même revue. Tu apprendras Compose dans la partie 4.',
			'`condition: service_healthy` dit à Compose d’attendre que le healthcheck de `db` passe avant de démarrer `backend` ([doc Compose](https://docs.docker.com/reference/compose-file/services/)). L’ordre de démarrage est écrit, pas mémorisé.',
			'`restart: always` relance le conteneur jusqu’à ce qu’il soit supprimé. Tu connais l’idée avec `Restart=always` dans une unit systemd. Même intention, mais visible aussi par le développeur.',
			'Le fichier n’est pas DevOps. Docker Compose est un outil. **DevOps, c’est que dev et ops lisent, modifient et possèdent ce fichier ensemble.** Un outil peut faciliter le partage. Il ne peut pas forcer les gens à partager.'
		]
	},
	tradeoff: {
		gain: [
			'Moins de passations : un changement n’attend plus dans une file de tickets entre deux équipes.',
			'Des corrections plus rapides : la personne qui a écrit le changement voit l’incident et sait où regarder.',
			'Moins de surprises : la façon dont l’appli tourne est écrite dans des fichiers relus des deux côtés, pas dans la mémoire d’une seule personne.'
		],
		cost: [
			'Les devs doivent apprendre l’exploitation et participer à l’astreinte. Les ops doivent apprendre Git, la revue de code et un peu de programmation.',
			'La culture change lentement. Ça ne s’achète pas, et une réorganisation seule ne la crée pas.',
			'C’est facile à simuler : renomme l’équipe ops « équipe DevOps » et tu obtiens un nouveau silo avec un nom à la mode.'
		]
	},
	task: {
		prompt: 'Ta boîte annonce : « On passe au DevOps. On a recruté trois ingénieurs DevOps dans une nouvelle équipe DevOps. Ils seront responsables de la CI et de tous les déploiements. » Devs et ops restent comme avant. Avec CALMS, dis ce qui va probablement mal tourner et ce que tu proposerais à la place.',
		hint: 'Compte les murs avant et après. Puis demande-toi qui est appelé quand un déploiement casse, et qui a écrit le changement.',
		answer: [
			'Avant : un mur (dev vers ops). Après : deux murs (dev vers équipe DevOps vers ops). C’est l’anti-pattern du **silo d’équipe DevOps** décrit par DevOps Topologies.',
			'**Culture et Sharing** ne bougent pas : les devs jettent toujours le code par-dessus un mur, juste un autre mur. La nouvelle équipe devient le goulot d’étranglement de chaque release.',
			'**Automation** peut progresser, mais elle appartient à une seule équipe, donc personne d’autre n’apprend ni ne modifie le pipeline.',
			'Proposition : rendre la nouvelle équipe **temporaire**, avec pour mission de se rendre inutile. Elle construit le pipeline avec l’équipe dev, travaille en binôme avec les ops, puis rend la main. Les devs rejoignent l’astreinte de leur propre service.',
			'**Measurement** : se mettre d’accord sur quelques chiffres partagés pour le service (prochains chapitres : les métriques DORA), vus par les devs comme par les ops.'
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
			why: 'DevOps, c’est culture, pratiques et outils ensemble, pour supprimer le mur entre dev et ops. Un titre, des outils ou une équipe de plus au milieu passent à côté.'
		},
		{
			q: 'Dans CALMS, que veut dire le L ?',
			options: ['Lean', 'Linux', 'Logging', 'Load balancing'],
			answer: 0,
			why: 'Culture, Automation, Lean, Measurement, Sharing. Lean, ce sont les petits pas, la chasse au gaspillage et l’amélioration continue.'
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
	takeaway: 'DevOps n’est ni un outil ni un titre. C’est dev et ops qui possèdent un service ensemble, avec Culture, Automation, Lean, Measurement et Sharing comme grille.',
	sources: [
		{ title: 'AWS, What is DevOps?', url: 'https://aws.amazon.com/devops/what-is-devops/' },
		{ title: 'Atlassian, le framework CALMS', url: 'https://www.atlassian.com/devops/frameworks/calms-framework' },
		{ title: 'Livre SRE de Google, Introduction (l’approche sysadmin et ses coûts)', url: 'https://sre.google/sre-book/introduction/' },
		{ title: 'DevOps Topologies, anti-types et types d’équipes', url: 'https://web.devopstopologies.com/' },
		{ title: 'Doc Docker, référence des services du fichier Compose', url: 'https://docs.docker.com/reference/compose-file/services/' }
	]
};
