const PM = 'https://blog.cloudflare.com/cloudflare-outage-on-june-21-2022/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cloudflare-bgp-2022',
	part: 'Changements et configuration',
	title: 'Cloudflare 2022 : le changement de politique BGP qui a coupé 19 data centers',
	minutes: 10,
	hook: [
		'Mardi 21 juin 2022, 6 h 27 UTC. Tu es ingénieur réseau chez Cloudflare. Depuis 3 h 56, un changement des politiques d’annonce de préfixes BGP se déploie, site après site. Jusqu’ici, aucun site n’a eu de problème.',
		'À 6 h 27, le déploiement atteint les spines des data centers Multi-Colo PoP (MCP). Presque aussitôt, les 19 tombent : Amsterdam, Ashburn, Francfort, Londres, Singapour, Tokyo et 13 autres.',
		'Ces 19 sites font 4 % du réseau de Cloudflare. La courbe des requêtes HTTP réussies dans le monde chute de moitié.'
	],
	terms: [
		{ term: 'Préfixe', def: 'Une plage d’adresses IP voisines qu’un réseau annonce à ses pairs en BGP. Un préfixe qui n’est plus annoncé est « retiré » (withdrawn) : plus personne sur internet ne peut joindre ces adresses.' },
		{ term: 'MCP', def: 'Multi-Colo PoP, l’architecture des 19 data centers les plus chargés de Cloudflare. Une couche de routeurs, les spines, relie les parties de chaque data center en maillage.' },
		{ term: 'Terme de politique', def: 'Une règle nommée dans une politique BGP. Le routeur lit les termes dans l’ordre, et le premier qui accepte ou rejette un préfixe tranche.' },
		{ term: 'Multimog', def: 'Le répartiteur de charge interne de Cloudflare dans les data centers MCP, une variante d’Unimog. Il répartit les requêtes entre les serveurs d’un data center.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare outage on June 21, 2022',
		date: '2022-06-21',
		url: PM,
		steps: [
			{
				situation: [
					'Les 19 sites MCP sont tombés à 6 h 27, à l’instant où le changement de politique a atteint leurs spines. Le même changement tourne sur d’autres sites depuis 3 h 56 sans effet.',
					'Les visiteurs proches de ces villes ne joignent plus les sites derrière Cloudflare. Ailleurs, Cloudflare marche normalement.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Activer la protection DDoS dans les 19 sites',
					'Déclarer un incident et soupçonner le changement sur les spines',
					'Attendre que BGP envoie le trafic vers d’autres sites',
					'Redémarrer les serveurs des 19 data centers'
				],
				answer: 1,
				why: 'Un incident interne a été déclaré à 6 h 32. Le moment de la panne désigne le changement : elle a commencé quand il a atteint les spines MCP. Cloudflare : "This was our error and not the result of an attack or malicious activity."'
			},
			{
				situation: [
					'Tu essaies de te connecter aux routeurs des sites touchés. Ils sont injoignables. Parmi les préfixes retirés, il y a les préfixes site-local qui donnent à Cloudflare un accès direct à chaque site.'
				],
				q: 'Comment atteins-tu les routeurs ?',
				options: [
					'Attendre que les préfixes reviennent tout seuls',
					'Demander à un opérateur de transit d’annoncer les préfixes à ta place',
					'Suivre les procédures de secours pour reprendre la main sur les sites',
					'Pousser un correctif sur les spines avec l’outil de déploiement'
				],
				answer: 2,
				why: 'Cloudflare : "We have backup procedures for handling such an event and used them to take control of the affected locations." Le retrait des préfixes a aussi compliqué l’accès des ingénieurs aux sites pour annuler le changement.'
			},
			{
				situation: [
					'Tu es sur un routeur spine d’un site. Tu penses que le changement de politique a causé la panne, mais tu ne l’as pas encore prouvé.'
				],
				q: 'Quelle est ta prochaine action ?',
				options: [
					'Modifier un routeur pour confirmer la cause',
					'Annuler le changement sur les 19 sites d’un coup par script',
					'Annuler tous les changements réseau de la semaine',
					'Relire tout le diff avec deux relecteurs d’abord'
				],
				answer: 0,
				why: 'À 6 h 51, un premier changement est fait sur un routeur "to verify the root cause". À 6 h 58, la cause est "found and understood", et les annulations commencent. La vérification sur un routeur a pris 7 minutes.'
			},
			{
				situation: [
					'Depuis 6 h 58, plusieurs ingénieurs annulent le changement sur les 19 sites. Des sites reviennent. Puis le problème réapparaît, au hasard, à des endroits déjà réparés.'
				],
				q: 'Que vérifies-tu ?',
				options: [
					'Si les pairs rejettent maintenant tes routes',
					'Si une attaque a commencé pendant l’annulation',
					'Si les routeurs manquent de mémoire',
					'Si des ingénieurs défont les annulations des autres'
				],
				answer: 3,
				why: 'Les annulations ont été "delayed as network engineers walked over each other\'s changes, reverting the previous reverts, causing the problem to re-appear sporadically." La dernière a été faite à 7 h 42, 44 minutes après la découverte de la cause.'
			},
			{
				situation: [
					'L’incident est clos à 8 h 00. Le changement avait un ticket de Change Request, un dry run, un déploiement par étapes et une relecture par plusieurs ingénieurs. Le déploiement par étapes n’atteignait un site MCP qu’à sa dernière étape.'
				],
				q: 'Que changes-tu dans le processus de déploiement ?',
				options: [
					'Ajouter un troisième relecteur à chaque changement réseau',
					'Ramener les 19 sites à l’ancienne architecture',
					'Mettre un site MCP tôt dans les étapes, avec commit-confirm',
					'Lancer le dry run deux fois avant chaque changement réseau'
				],
				answer: 2,
				why: 'Cloudflare va imposer "an improved stagger policy" (un meilleur étalement) et ajouter un retour arrière automatique "commit-confirm". Selon le postmortem, le premier "would have significantly lessened the overall impact" et le second "would have greatly reduced the Time-to-Resolve".'
			}
		],
		outcome: [
			'Le changement ajoutait des communautés BGP aux préfixes site-local. Sur les spines, le diff réordonnait aussi les termes de la politique `AGGREGATES-OUT`. `4-ADV-SITE-LOCALS` et `6-ADV-SITE-LOCALS` sont passés sous `REJECT-THE-REST`, un terme qui fait `then reject`, et les spines ont cessé d’annoncer les préfixes site-local.',
			'Sans ces préfixes, les serveurs de Cloudflare ne joignaient plus les origines des clients, et les ingénieurs perdaient l’accès direct aux sites. Multimog ne pouvait plus transmettre les requêtes entre les serveurs d’un MCP. Les petits clusters de calcul recevaient autant de trafic que les plus gros, et ont saturé.',
			'La panne a duré de 6 h 27 à 7 h 42 UTC. Les 19 sites font 4 % du réseau, mais la panne a touché 50 % des requêtes.',
			'Cloudflare a listé trois correctifs. Les déploiements auront des étapes de test et de déploiement propres aux MCP. La politique sera repensée pour empêcher un mauvais ordre involontaire des termes. L’automatisation imposera un meilleur étalement et un retour arrière "commit-confirm".'
		]
	},
	quiz: [
		{
			q: 'Les 19 sites MCP font 4 % du réseau de Cloudflare. Pourquoi leur panne a-t-elle touché 50 % des requêtes ?',
			options: [
				'Les autres sites envoyaient d’abord leur trafic aux MCP',
				'Ce sont les sites les plus chargés, ils portent une grosse part du trafic',
				'Les préfixes retirés couvraient aussi tous les autres sites',
				'Chaque requête traverse deux sites MCP en chemin'
			],
			answer: 1,
			why: 'Cloudflare a passé ses sites les plus chargés en MCP. Le postmortem : ces sites "carry a significant proportion of the Cloudflare traffic, any problem here can have a very wide impact".'
		},
		{
			q: 'Dans chaque MCP, les petits clusters de calcul ont saturé. Pourquoi ?',
			options: [
				'Multimog ne pouvait plus transmettre les requêtes entre serveurs',
				'Les petits clusters recevaient les préfixes retirés en double',
				'Des ingénieurs ont envoyé tout le trafic aux petits clusters',
				'Les filtres DDoS ne tournaient que sur les petits clusters'
			],
			answer: 0,
			why: 'Multimog transmet les requêtes entre les serveurs d’un MCP. Sans les préfixes site-local, il ne pouvait plus le faire, et "our smaller compute clusters in an MCP received the same amount of traffic as our largest clusters".'
		},
		{
			q: 'Dans le diff des spines, une ligne affiche `! term REJECT-THE-REST { ... }`. Que veut dire le `!` dans ce format de diff ?',
			options: [
				'Le terme a été supprimé de la politique',
				'Le terme a été désactivé mais gardé dans le fichier',
				'Le terme a changé de place dans la politique',
				'Le terme contient une erreur de syntaxe ignorée'
			],
			answer: 2,
			why: 'Le postmortem : "the exclamation marks in front of the terms indicate a re-ordering of the terms". Au premier coup d’œil, le diff ressemblait au changement anodin des autres routeurs, mais il plaçait les termes site-local derrière le rejet.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui, dans le changement sur les spines, a retiré les préfixes site-local de Cloudflare ?',
		a: 'Les termes `4-ADV-SITE-LOCALS` et `6-ADV-SITE-LOCALS` sont passés sous `REJECT-THE-REST`, qui fait `then reject`, donc les spines ont cessé d’annoncer ces préfixes.'
	},
	sources: [
		{ title: 'Cloudflare, Cloudflare outage on June 21, 2022', url: PM },
		{ title: 'Cloudflare, Unimog: Cloudflare\'s edge load balancer', url: 'https://blog.cloudflare.com/unimog-cloudflares-edge-load-balancer/' }
	]
};
