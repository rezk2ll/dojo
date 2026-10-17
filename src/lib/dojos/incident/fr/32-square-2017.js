const PM = 'https://developer.squareup.com/blog/incident-summary-2017-03-16/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'square-2017',
	part: 'Capacité et effets en cascade',
	title: 'Square 2017 : des retries qui saturent l’authentification des marchands',
	minutes: 10,
	hook: [
		'Jeudi 16 mars 2017, 9 h 55, heure du Pacifique. Square déploie ses services plus de 250 fois par jour, et une équipe commence à livrer une modification de Roster, le service qui gère l’identité des clients, dans un seul datacenter.',
		'À 10 h 02, Multipass signale des timeouts aux ingénieurs d’astreinte. Multipass authentifie les marchands, et la plupart des produits de Square l’appellent.',
		'À 10 h 06, Roster appelle son ingénieur d’astreinte. À 10 h 08, la supervision externe signale que api.squareup.com ne répond plus.'
	],
	terms: [
		{ term: 'active-active', def: 'Un service tourne et sert du trafic dans plusieurs datacenters à la fois : si l’un tombe, les autres continuent de répondre.' },
		{ term: 'transaction optimiste', def: 'Une transaction Redis qui pose un `WATCH` sur des clés et s’annule à l’`EXEC` si un autre client a modifié l’une d’elles. Le client la relance alors.' },
		{ term: 'backoff', def: 'Une attente avant chaque nouvelle tentative, en général plus longue après chaque échec, pour que les retries n’arrivent pas au serveur aussi vite que le client peut les envoyer.' },
		{ term: 'cgroup', def: 'Une fonction de Linux qui plafonne le CPU et la mémoire qu’un groupe de processus peut utiliser sur une machine.' }
	],
	incident: {
		org: 'Square',
		title: 'Incident Summary: 2017-03-16',
		date: '2017-03-16',
		url: PM,
		steps: [
			{
				situation: [
					'10 h 10. Partout chez Square, des ingénieurs signalent des pannes dans tous les services qui ont besoin de l’identité des marchands. Pour l’équipe, il s’agit d’une panne majeure.',
					'Le déploiement de Roster a démarré à 9 h 55, sept minutes avant les premiers timeouts. Multipass dépend de Roster, et Roster tourne en active-active dans plusieurs datacenters.'
				],
				q: 'Que fais-tu d’abord des changements récents ?',
				options: [
					'Tu laisses Roster tranquille tant que personne ne prouve qu’il a cassé Multipass',
					'Tu annules tous les changements faits avant l’incident, Roster compris',
					'Tu finis le déploiement de Roster partout pour avoir la même version',
					'Tu envoies tout le trafic de Roster vers le datacenter qui a la nouvelle version'
				],
				answer: 1,
				why: 'Square fait du retour arrière "a non-negotiable response to any customer-impacting event" : les ingénieurs annulent tout changement antérieur à l’incident "regardless of how plausible it is that the change caused the issue."'
			},
			{
				situation: [
					'10 h 23. Le retour arrière de Roster est terminé, et Multipass est toujours en timeout. La panne continue.'
				],
				q: 'Que vérifies-tu ensuite ?',
				options: [
					'Tu fais reculer Roster d’une version de plus, au cas où la précédente aurait le bug',
					'Tu redémarres Roster dans tous les datacenters, ses caches sont peut-être froids',
					'Tu regardes la charge des dépendances de Multipass lui-même, comme sa base',
					'Tu laisses le retour arrière se stabiliser 30 minutes avant de tenter autre chose'
				],
				answer: 2,
				why: 'Roster répondait depuis ses autres datacenters tout du long, donc la panne était plus près de Multipass. À 10 h 25, l’équipe a redémarré Multipass en pensant que Roster l’avait laissé dans un mauvais état : "This theory was proven false." Entre 10 h 30 et 11 h 30, elle a vu que le Redis de Multipass avait "peaked out on capacity" (atteint sa capacité maximale).'
			},
			{
				situation: [
					'La base Redis de Multipass a atteint d’un coup sa pleine capacité. Tu ne sais pas encore quelles requêtes font cette charge.'
				],
				q: 'Comment trouves-tu ce qui charge Redis ?',
				options: [
					'Tu lances `SLOWLOG` et `MONITOR` sur Redis et tu remontes les commandes au code',
					'Tu ajoutes un réplica Redis, tu y envoies la moitié des lectures et tu compares',
					'Tu bascules Redis sur son réplica, ce qui efface l’état où il est coincé',
					'Tu lances `FLUSHALL` pour que Redis reparte vide et que la charge retombe'
				],
				answer: 0,
				why: '`SLOWLOG` garde les commandes qui ont dépassé un temps d’exécution fixé, et `MONITOR` renvoie chaque commande que Redis traite. Square a utilisé les deux et remonté la charge jusqu’à "a specific code path in Multipass which retries a Redis optimistic transaction."'
			},
			{
				situation: [
					'La boucle de retry a une limite haute, 500 tentatives, et aucun backoff. À 11 h 45, un correctif qui permet de réduire les retries est écrit, relu, construit et testé.',
					'Multipass tourne dans un datacenter de la côte Ouest, un de la côte Est et un au Japon.'
				],
				q: 'Comment livres-tu le correctif ?',
				options: [
					'Tu attends la livraison du lendemain, un correctif fait dans l’urgence peut casser autre chose',
					'Tu le déploies dans les trois datacenters au même instant pour finir la panne plus tôt',
					'Tu l’actives pour les paiements seulement et tu laisses les connexions sur l’ancienne boucle',
					'Tu le déploies dans un datacenter, tu regardes son Redis, puis dans les deux autres'
				],
				answer: 3,
				why: 'Un premier datacenter montre si le correctif marche pendant que les deux autres gardent l’ancien code. Square a déployé la côte Ouest à 11 h 48, et "multipass-redis immediately recovered as the improvement rolled out." La côte Est a suivi à 11 h 59, puis le Japon à 12 h 00.'
			},
			{
				situation: [
					'12 h 00. Les connexions remarchent. En testant la déconnexion et la reconnexion, les ingénieurs voient que les codes de double authentification (2FA) n’arrivent plus par SMS.',
					'Les marchands privés de connexion pendant près de deux heures se reconnectent tous en même temps.'
				],
				q: 'Que fais-tu pour les codes SMS ?',
				options: [
					'Tu coupes la 2FA sur tous les comptes jusqu’à ce que la file de SMS se vide seule',
					'Tu vois avec le fournisseur de SMS pour ajouter de la capacité, par exemple des numéros',
					'Tu redémarres encore Multipass, puisque les codes partent du service de connexion',
					'Tu demandes aux marchands, sur la page de statut, d’attendre une heure pour se connecter'
				],
				answer: 1,
				why: 'Les codes restaient bloqués derrière une vague de SMS venue de la vague de connexions, une limite de capacité côté envoi. Square et son fournisseur ont trouvé que "a rebalancing of our outbound SMS phone numbers would increase capacity" : de nouveaux numéros à 12 h 32, les anciens retirés à 12 h 42, et des SMS qui arrivent pour tout le monde à 13 h 12.'
			}
		],
		outcome: [
			'La cause, dans le résumé : "Merchant authentication service unrecoverably overloaded due to bug in adjacent service." Un chemin de code de Multipass relançait une transaction optimiste Redis jusqu’à 500 fois sans backoff, ce qui a créé une boucle de rétroaction sur Redis.',
			'Tous les marchands ont subi une coupure de 10 h 02 à 11 h 55, et la 2FA par SMS est restée en panne jusqu’à 13 h 12. Paiements, Point of Sale, Dashboard, Appointments et Payroll étaient touchés.',
			'Pendant l’écriture du correctif, l’équipe a levé les limites cgroup des services critiques pour les paiements, qui ont eu tout le CPU et la mémoire de leurs machines. La page de statut a été mise à jour toutes les 15 minutes jusqu’au retour complet.',
			'Parmi les actions : vérifier si la panne de Roster dans un seul datacenter a aggravé les retries Redis, auditer toutes les autres boucles de retry pour ce même défaut, auditer les limites cgroup, écrire un runbook Redis, et tenir un second postmortem sur les SMS.'
		]
	},
	quiz: [
		{
			q: 'Square a annulé Roster à 10 h 23, et Multipass échouait toujours. Pourquoi ce retour arrière n’a-t-il pas aidé ?',
			options: [
				'Le retour arrière n’a touché qu’un des trois datacenters avant de s’arrêter',
				'Roster restait joignable depuis ses autres datacenters, il ne bloquait rien',
				'L’ancienne version de Roster avait son propre bug, qui cassait aussi Multipass',
				'Multipass avait mis en cache les mauvaises réponses de Roster pendant une heure'
			],
			answer: 1,
			why: 'Roster tourne en active-active. Le postmortem : "Roster continued to be available for the duration, serving out of other datacenters, as designed." Le déploiement et la panne coïncidaient dans le temps, mais la charge était sur le Redis de Multipass.'
		},
		{
			q: 'Pourquoi les transactions optimistes Redis échouent-elles plus souvent quand la charge de Redis monte ?',
			options: [
				'Redis refuse tout `EXEC` dès que son CPU dépasse un seuil fixe',
				'`WATCH` pose un verrou, et les autres clients l’attendent jusqu’au timeout',
				'Des commandes plus lentes laissent plus de temps pour modifier une clé surveillée',
				'Redis jette le bloc `MULTI` quand sa mémoire est pleine et renvoie une erreur'
			],
			answer: 2,
			why: 'Si une clé surveillée change entre `WATCH` et `EXEC`, toute la transaction est annulée. Sous charge, cet intervalle s’allonge : plus de tentatives échouent et repartent, et chaque retry ajoute de la charge. Avec jusqu’à 500 retries sans backoff, la boucle s’alimentait elle-même.'
		},
		{
			q: 'Ton service relance une écriture ratée vers un stockage partagé. Quel changement réduit la charge que ces retries mettent sur le stockage pendant une surcharge ?',
			options: [
				'Monter la limite de retries pour que moins de requêtes finissent en erreur',
				'Relancer tout de suite pour finir avant l’arrivée de la requête suivante',
				'Envoyer chaque retry vers un autre réplica du stockage, à tour de rôle',
				'Attendre plus longtemps après chaque échec, avec peu de tentatives au total'
			],
			answer: 3,
			why: 'Le backoff espace les retries et une limite basse les borne, donc un stockage lent reçoit moins de requêtes. Le correctif de Square a ajouté "the ability to reduce retries on Redis transactions", et une action prévoit d’auditer toutes les autres boucles de retry.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui, dans Multipass, a saturé son Redis le 16 mars 2017 ?',
		a: 'Un chemin de code qui relançait une transaction optimiste Redis jusqu’à 500 fois, sans backoff.'
	},
	sources: [
		{ title: 'Square Engineering, Incident Summary: 2017-03-16', url: PM },
		{ title: 'Documentation Redis, Transactions : verrouillage optimiste avec check-and-set', url: 'https://redis.io/docs/latest/develop/using-commands/transactions/' },
		{ title: 'Documentation Redis, SLOWLOG', url: 'https://redis.io/docs/latest/commands/slowlog/' },
		{ title: 'Documentation Redis, MONITOR', url: 'https://redis.io/docs/latest/commands/monitor/' }
	]
};
