const PM = 'https://blog.cloudflare.com/details-of-the-cloudflare-outage-on-july-2-2019/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cloudflare-regex-2019',
	part: 'Changements et configuration',
	title: 'Cloudflare 2019 : la règle WAF qui a pris tout le CPU',
	minutes: 10,
	hook: [
		'Mardi 2 juillet 2019, 13 h 45 UTC. Tu es SRE chez Cloudflare. PagerDuty sonne : un test synthétique qui vérifie le pare-feu applicatif (WAF) depuis l’extérieur de Cloudflare échoue.',
		'Les pages s’enchaînent. Beaucoup d’autres tests de bout en bout échouent, une alerte de chute du trafic mondial part, et les visiteurs reçoivent des erreurs 502. Des points de présence (PoP) dans le monde entier signalent un CPU saturé.',
		'Un des responsables de Solutions Engineering annonce que Cloudflare a perdu 80 % de son trafic.'
	],
	terms: [
		{ term: 'WAF', def: 'Web application firewall (pare-feu applicatif) : du code sur chaque serveur Cloudflare qui compare chaque requête HTTP à des règles et bloque celles qui ressemblent à une attaque.' },
		{ term: 'Backtracking', def: 'Ce que fait un moteur de regex comme PCRE quand une correspondance échoue : il revient en arrière et essaie un autre découpage de l’entrée. Certains motifs lui font essayer un nombre énorme de découpages.' },
		{ term: 'Global terminate', def: 'Un mécanisme interne de Cloudflare qui désactive un seul composant sur tous les serveurs du monde.' },
		{ term: 'Déploiement progressif', def: 'Envoyer un changement sur quelques sites d’abord, et sur le monde entier à la fin. Le logiciel de Cloudflare passe par DOG (employés seulement), PIG (une partie du trafic gratuit), 3 PoP Canary, puis partout.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Details of the Cloudflare outage on July 2, 2019',
		date: '2019-07-02',
		url: PM,
		steps: [
			{
				situation: [
					'Tes tableaux de bord affichent des alertes plusieurs fois par jour, presque toujours pour un petit souci à un seul endroit. Cette fois, le test du WAF, les tests de bout en bout, la chute de trafic et le CPU saturé arrivent ensemble, dans des PoP du monde entier.',
					'Certains, dans la salle, pensent à une attaque d’un type inconnu.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Traiter chaque alerte de PoP depuis le tableau de bord, comme un jour normal',
					'Déclarer un incident P0 et escalader à la direction technique',
					'Activer la protection contre les attaques pour tous les clients',
					'Attendre 15 minutes pour voir si le trafic revient'
				],
				answer: 1,
				why: 'Le postmortem : ce schéma "indicated that something gravely serious had happened, and SRE immediately declared a P0 incident and escalated to engineering leadership and systems engineering." À Londres, un talk interne a été interrompu et les ingénieurs se sont réunis dans une même salle.'
			},
			{
				situation: [
					'Deux pistes. Une attaque, ou un changement : à 13 h 42, trois minutes avant la première page, l’équipe pare-feu a déployé une petite modification des règles de détection XSS par un processus automatique.',
					'La Performance Team peut récupérer les données CPU en direct d’un serveur dans un PoP.'
				],
				q: 'Comment départages-tu attaque et changement ?',
				options: [
					'Bloquer les réseaux qui envoient le plus de requêtes et suivre le CPU',
					'Annuler tous les déploiements des dernières 24 heures',
					'Regarder quel processus consomme le CPU sur un serveur',
					'Demander aux plus gros clients s’ils subissent une attaque'
				],
				answer: 2,
				why: 'À 14 h 00, le WAF est désigné comme la cause et l’attaque écartée. "The Performance Team pulled live CPU data from a machine that clearly showed the WAF was responsible." Un autre ingénieur l’a confirmé avec `strace`, et une troisième équipe a vu des erreurs du WAF dans les logs.'
			},
			{
				situation: [
					'Il est 14 h 02. Le WAF occupe le CPU qui sert HTTP et HTTPS sur chaque serveur. La nouvelle règle est arrivée dans chaque PoP en quelques secondes via Quicksilver, le stockage clé valeur de Cloudflare.',
					'Le plan de retour arrière du ticket de changement demande de lancer deux fois le build complet du WAF.'
				],
				q: 'Comment arrêtes-tu les dégâts ?',
				options: [
					'Suivre le plan de retour arrière du ticket de changement',
					'Lancer le global terminate pour couper le WAF partout',
					'Redémarrer les serveurs HTTP dans tous les PoP',
					'Couper le WAF pour les plus gros clients, un par un'
				],
				answer: 1,
				why: 'À 14 h 02, l’équipe a proposé un global terminate du WAF. Le postmortem note : "The rollback plan required running the complete WAF build twice taking too long." WAF coupé, les autres protections de Cloudflare ont continué de tourner.'
			},
			{
				situation: [
					'Pour lancer le global terminate, tu te connectes au panneau de contrôle interne. Impossible : Cloudflare utilise ses propres produits, et son service Access est en panne.',
					'Jira et le système de build sont aussi hors d’atteinte. Il existe un mécanisme de contournement, mais l’équipe s’en sert rarement.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Attendre qu’Access revienne, puis te connecter comme d’habitude',
					'Passer par le contournement pour atteindre le panneau de contrôle',
					'Te connecter en SSH à chaque serveur et arrêter le WAF à la main',
					'Demander à l’équipe Access de couper l’authentification pour tous'
				],
				answer: 1,
				why: 'L’équipe a pris "a bypass mechanism that wasn\'t frequently used". Un membre de l’équipe a lancé la coupure globale du WAF à 14 h 07, et à 14 h 09 le trafic et le CPU étaient revenus à la normale partout. Certains SRE avaient aussi perdu leurs accès : une règle de sécurité désactive les identifiants peu utilisés.'
			},
			{
				situation: [
					'Il est 14 h 09. Le trafic est revenu, et aucun serveur ne fait tourner le WAF. Les clients restent sans protection WAF tant qu’il n’est pas rallumé.',
					'Tu as annulé la règle de 13 h 42.'
				],
				q: 'Comment rallumes-tu le WAF ?',
				options: [
					'Le rallumer partout, puisque la règle a disparu',
					'Le laisser éteint jusqu’au nouveau moteur de regex',
					'Le tester dans une ville, sans le trafic payant, puis partout',
					'Le rallumer pour les clients payants, puis pour les gratuits'
				],
				answer: 2,
				why: 'Cloudflare a fait des tests négatifs ("was it really that particular change that caused the problem?") et positifs (le retour arrière a-t-il marché) dans une seule ville, sur une partie du trafic, après en avoir retiré les clients payants. Le WAF a été rallumé partout à 14 h 52.'
			}
		],
		outcome: [
			'La nouvelle règle contenait une expression régulière qui "backtracked enormously". La partie fautive : `.*(?:.*=.*)`. Le WAF en Lua "uses PCRE internally, and it uses backtracking for matching and has no mechanism to protect against a runaway expression." Une protection contre l’excès de CPU des regex avait été supprimée par erreur lors d’une refonte du WAF, quelques semaines plus tôt.',
			'La règle devait tourner en mode simulate, qui ne bloque rien, mais une règle simulée s’exécute quand même. La procédure (SOP) des règles autorisait un envoi mondial sans déploiement progressif, et Quicksilver distribue un changement à toutes les machines avec un p99 de 2,29 secondes. La CI est passée, car les tests ne mesuraient pas le CPU.',
			'HTTP et HTTPS sont restés coupés 27 minutes, et les visiteurs de tout domaine Cloudflare voyaient des erreurs 502. Les clients ne pouvaient pas atteindre le Dashboard ni l’API de Cloudflare, qui passent eux aussi par l’edge.',
			'Cloudflare a gelé toutes les livraisons du WAF. L’équipe a remis la protection CPU, inspecté les 3 868 règles WAF Managed Rules, et prévu un profilage des performances dans les tests et un passage au moteur re2 ou à celui de Rust. La SOP change pour déployer les règles par étapes, en gardant l’envoi mondial pour les attaques en cours.'
		]
	},
	quiz: [
		{
			q: 'La règle a été déployée en mode simulate, qui ne bloque rien. Pourquoi a-t-elle quand même fait tomber Cloudflare ?',
			options: [
				'Le mode simulate journalise chaque requête, et les logs ont rempli les disques',
				'En mode simulate, la règle exécute quand même sa regex sur le vrai trafic',
				'Quicksilver a fait passer la règle du mode simulate au mode blocage',
				'Le mode simulate copie chaque requête vers un serveur central'
			],
			answer: 1,
			why: 'Le mode simulate mesure les faux positifs sur le vrai trafic, donc la règle doit tourner. Le postmortem : "even in the simulate mode the rules actually need to execute". La regex a consommé le CPU, qu’elle bloque ou non.'
		},
		{
			q: 'Faire correspondre `x=` suivi de 20 x avec `.*.*=.*` coûte 555 étapes à PCRE. Quel correctif supprime ce genre d’explosion pour tous les motifs ?',
			options: [
				'Rendre chaque `.*` paresseux, comme `.*?`',
				'Un moteur de regex à temps garanti, comme re2',
				'Ajouter des exemples d’attaques aux tests',
				'Donner plus de cœurs CPU au WAF sur chaque serveur'
			],
			answer: 1,
			why: 'Cloudflare a choisi re2 ou le moteur de Rust, qui "have run-time guarantees". L’annexe montre la méthode de Ken Thompson (1968) : un automate présent dans tous les états possibles à la fois lit chaque caractère une seule fois, en temps linéaire. Le `.*?` paresseux ne sauve pas `.*?.*?=.*?;`, qui prend toujours 5 353 étapes.'
		},
		{
			q: 'La CI a envoyé une grande série de requêtes HTTP à la nouvelle règle et elle est passée. Pourquoi n’a-t-elle rien vu ?',
			options: [
				'La nouvelle règle ne faisait pas partie du build de CI',
				'Les serveurs de CI avaient un PCRE récent sans backtracking',
				'La CI vérifiait ce qui était bloqué ou laissé passer, jamais le CPU',
				'La CI ne testait que des requêtes venues du PoP DOG'
			],
			answer: 2,
			why: 'Les tests envoient des requêtes à bloquer et des requêtes à laisser passer. Le postmortem : "What it didn\'t do was test for runaway CPU utilization by the WAF". Les logs ne montrent aucune hausse de la durée des tests avec la mauvaise règle.'
		}
	],
	recall: {
		q: 'Comment une seule règle WAF a-t-elle atteint tous les serveurs de Cloudflare en même temps, et comment l’équipe l’a-t-elle coupée ?',
		a: 'La SOP laissait les règles éviter le déploiement progressif, donc Quicksilver a poussé la règle partout en quelques secondes. À 14 h 07, un membre de l’équipe a lancé le global terminate du WAF, via un contournement peu utilisé, et le trafic était revenu à 14 h 09.'
	},
	sources: [
		{ title: 'Cloudflare, Details of the Cloudflare outage on July 2, 2019', url: PM },
		{ title: 'Russ Cox, Regular Expression Matching Can Be Simple And Fast', url: 'https://swtch.com/~rsc/regexp/regexp1.html' }
	]
};
