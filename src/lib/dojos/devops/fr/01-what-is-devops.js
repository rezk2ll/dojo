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
		],
		steps: [
			{
				title: 'Compte les murs',
				questions: [
					{ q: 'Avant l’annonce, combien de murs séparent l’écriture d’un changement de son exploitation ?', options: ['Aucun', 'Un : dev vers ops', 'Deux : dev vers CI, CI vers ops', 'Trois : un par équipe'], answer: 1, why: 'Le découpage classique a un seul mur, fait de tickets et de passations, entre l’équipe dev et l’équipe ops.' },
					{ q: 'Une fois que la nouvelle équipe DevOps prend la CI et tous les déploiements, combien de murs y a-t-il ?', options: ['Un, parce que la nouvelle équipe remplace l’ancien mur', 'Aucun, parce que la boîte fait maintenant du DevOps', 'Deux : dev vers équipe DevOps, équipe DevOps vers ops', 'Trois : dev, équipe DevOps et ops murent chacun la CI'], answer: 2, why: 'Devs et ops restent comme avant, et une nouvelle équipe se place entre eux. Ça ajoute un deuxième mur.' },
					{ q: 'Comment DevOps Topologies appelle-t-il ce montage ?', options: ['L’anti-pattern du silo d’équipe DevOps', 'Une équipe plateforme', 'La responsabilité partagée', 'Le modèle SRE'], answer: 0, why: 'Une nouvelle équipe appelée « DevOps » placée entre dev et ops, c’est l’anti-pattern du **silo d’équipe DevOps**.' },
					{ q: 'Un déploiement casse à 2 h du matin. Avec le nouveau plan, qui risque le plus de manquer ?', options: ['L’équipe DevOps, responsable des déploiements', 'L’équipe ops, qui gère les serveurs', 'Le manager d’astreinte', 'Le développeur qui a écrit le changement'], answer: 3, why: 'Les devs passent toujours le code par-dessus un mur et ne sont pas d’astreinte, donc celui qui connaît le changement n’est pas là.' }
				]
			},
			{
				title: 'Vérifie Culture et Sharing',
				questions: [
					{ q: 'Que veut dire CALMS ?', options: ['Code, Automation, Linux, Monitoring, Security', 'Culture, Automation, Lean, Measurement, Sharing', 'Culture, Agile, Logging, Metrics, Support', 'CI, Automation, Lean, Monitoring, Sharing'], answer: 1, why: 'Culture, Automation, Lean, Measurement, Sharing : une grille pour voir jusqu’où une équipe est vraiment allée vers DevOps.' },
					{ q: 'Côté Culture et Sharing, qu’est-ce qui change pour les devs avec le nouveau plan ?', options: ['Ils sont maintenant responsables de leurs déploiements', 'Ils rejoignent l’astreinte', 'Rien : ils jettent toujours le code par-dessus un mur, juste un autre', 'Ils relisent la config des ops'], answer: 2, why: 'Les habitudes des devs restent les mêmes. Seule l’équipe de l’autre côté du mur a changé de nom.' },
					{ q: 'Que devient chaque release quand une seule équipe possède tous les déploiements ?', options: ['Elle attend la nouvelle équipe', 'Elle sort plus vite, parce que des experts s’en chargent', 'Elle saute la revue', 'Elle va directement de dev à ops'], answer: 0, why: 'Tous les déploiements passent par trois personnes, donc chaque release fait la queue derrière leurs tickets.' },
					{ q: 'Pourquoi recruter une équipe ne change-t-il pas à lui seul la façon de travailler ?', options: ['Parce que les ingénieurs DevOps coûtent trop cher à garder', 'Parce qu’une réorganisation ou l’achat d’un outil laisse les habitudes en place', 'Parce que seuls les ops peuvent changer la culture', 'Parce que CALMS interdit les nouvelles équipes'], answer: 1, why: 'Le compromis du chapitre : une réorganisation ou l’achat d’un outil ne suffit pas à changer la façon de travailler, et les habitudes changent lentement.' }
				]
			},
			{
				title: 'Vérifie Automation et Measurement',
				questions: [
					{ q: 'La nouvelle équipe construit un bien meilleur pipeline. Où est le piège ?', options: ['Les pipelines ne s’automatisent pas', 'Il ralentit les devs par conception', 'Il appartient à une seule équipe, donc personne d’autre ne l’apprend ni ne le modifie', 'Il remplace le besoin de tests'], answer: 2, why: 'Une automatisation possédée par une seule équipe est un autre silo : les autres ne peuvent ni la lire, ni la modifier, ni la réparer.' },
					{ q: 'Dans le schéma de responsabilité partagée, où vivent les étapes de déploiement ?', options: ['Dans un seul dépôt avec l’appli et sa config', 'Dans le wiki privé de l’équipe DevOps', 'Dans la tête des ops', 'Dans un modèle de ticket'], answer: 0, why: 'Appli, config et étapes de déploiement sont dans un seul dépôt, et passent par la même revue, comme le `compose.yaml` de l’exemple.' },
					{ q: 'Quelle étape Measurement le chapitre propose-t-il ?', options: ['Compter combien de tickets chaque équipe ferme', 'Mesurer chaque équipe sur son propre objectif', 'Suivre l’effectif de l’équipe DevOps', 'Quelques chiffres partagés pour le service, vus par les devs comme par les ops'], answer: 3, why: 'Des chiffres partagés (les métriques DORA, dans les prochains chapitres) donnent aux deux camps le même objectif au lieu d’objectifs opposés.' },
					{ q: 'Dans le schéma, vers qui reviennent les métriques et les incidents des utilisateurs ?', options: ['Vers la barrière de changement', 'Vers les développeurs, qui peuvent corriger le code', 'Vers l’équipe ops seulement', 'Vers l’équipe DevOps'], answer: 1, why: 'Les chiffres de la prod reviennent vers ceux qui peuvent corriger le code.' }
				]
			},
			{
				title: 'Propose mieux',
				questions: [
					{ q: 'Que faut-il faire de la nouvelle équipe DevOps ?', options: ['La rendre permanente et lui donner plus de monde', 'La fusionner avec l’équipe ops', 'La rendre temporaire, avec pour mission de se rendre inutile', 'La dissoudre avant qu’elle commence'], answer: 2, why: 'Une équipe temporaire peut construire le pipeline avec les autres, puis rendre la main.' },
					{ q: 'Comment cette équipe doit-elle travailler tant qu’elle existe ?', options: ['Construire le pipeline avec l’équipe dev et travailler en binôme avec les ops', 'Construire le pipeline seule, puis former tout le monde à la fin', 'Prendre l’astreinte pour que les devs se concentrent', 'Valider chaque déploiement à la main'], answer: 0, why: 'Construire ensemble, c’est garder le savoir chez dev et ops quand l’équipe rend la main.' },
					{ q: 'Qui rejoint l’astreinte d’un service ?', options: ['L’équipe DevOps seulement', 'Les ops seulement, comme avant', 'Une équipe d’incident à part', 'Les devs qui construisent ce service, avec les ops'], answer: 3, why: 'Avec une seule astreinte, la personne qui a écrit le changement voit l’incident et sait où regarder.' },
					{ q: 'Quel est le coût de cette proposition pour les devs ?', options: ['Ils perdent l’accès à la prod', 'Ils doivent apprendre l’exploitation et participer à l’astreinte', 'Ils arrêtent d’écrire des fonctionnalités', 'Ils doivent passer dans l’équipe ops'], answer: 1, why: 'La responsabilité partagée a un prix : les devs apprennent l’exploitation et portent l’astreinte, les ops apprennent Git et la revue de code.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Chercher le mur dans l’historique d’un vrai projet : qui modifie les fichiers ops, qui modifie le code de l’appli, et qui fait les deux.',
		steps: [
			'Clone un vrai projet avec son historique mais sans le contenu des fichiers : `mkdir -p ~/devops-lab && cd ~/devops-lab && git clone --filter=blob:none https://github.com/louislam/uptime-kuma.git && cd uptime-kuma`.',
			'Trouve les fichiers qui disent comment l’appli tourne : `git ls-files | grep -iE "dockerfile|compose|\\.github/workflows"`. Ils sont dans le même dépôt que le code de l’appli, dans `src/` et `server/`.',
			'Liste qui a modifié ces fichiers ops dans l’année, sans les bots : `git log --since="1 year ago" --format=%an -- docker .github/workflows compose.yaml | grep -v "\\[bot\\]" | sort -u > ../ops.txt`.',
			'Fais pareil pour le code de l’appli : `git log --since="1 year ago" --format=%an -- src server | grep -v "\\[bot\\]" | sort -u > ../dev.txt`. Compare avec `wc -l ../ops.txt ../dev.txt`, `comm -12 ../ops.txt ../dev.txt` (les personnes des deux côtés) et `comm -23 ../ops.txt ../dev.txt` (celles qui ne touchent que les fichiers ops).',
			'Écris `~/devops-lab/calms.txt` avec une ligne par lettre de CALMS : la preuve trouvée dans ce dépôt, ou « pas visible dans git ».'
		],
		done: [
			'`ops.txt` et `dev.txt` existent et ne sont pas vides.',
			'`comm -12` affiche les personnes qui ont modifié à la fois des fichiers ops et du code de l’appli dans l’année.',
			'`calms.txt` a cinq lignes, et chacune cite un fichier, une sortie de commande, ou « pas visible dans git ».'
		],
		solution: [
			'Au moment de l’écriture, 7 des 9 personnes de `ops.txt` sont aussi dans `dev.txt`. Les fichiers de déploiement et le code changent dans le même dépôt, avec la même revue : pas de mur au niveau des fichiers.',
			'Quelques noms seulement dans `ops.txt`, c’est normal. Beaucoup de noms seulement dans `ops.txt` et peu dans les deux, c’est à ça que ressemble une équipe ops à part dans git.',
			'L’Automation se voit dans `.github/workflows`, et le Sharing dans la liste de `comm -12`. Culture, Lean et Measurement (qui porte le pager, la taille des changements, les chiffres que les deux côtés regardent) ne sont presque pas dans git : tu demandes aux gens.',
			'Lance les mêmes commandes sur un dépôt de ton travail pour voir ton propre mur. Nettoie avec `rm -rf ~/devops-lab`.'
		]
	},
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
