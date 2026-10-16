const RCA = 'https://stripe.com/rcas/2019-07-10';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'stripe-2019',
	part: 'Les données',
	title: 'Stripe 2019 : un shard incapable d’élire un primaire',
	minutes: 10,
	hook: [
		'Mercredi 10 juillet 2019, 16 h 35 UTC. Tu es d’astreinte sur l’API Stripe. Le nœud primaire d’un shard de base de données vient de tomber.',
		'À 16 h 36, l’alerte t’arrive et les requêtes à l’API échouent.',
		'Chez Stripe, les bascules de nœud sont courantes pendant les mises à jour et la maintenance. Cette fois, le shard ne retrouve pas de primaire tout seul.'
	],
	terms: [
		{ term: 'Shard', def: 'Une tranche d’un cluster de base de données. Stripe répartit les données par type entre des clusters et par volume entre des shards, chacun avec plusieurs nœuds redondants.' },
		{ term: 'Primaire', def: 'Le seul nœud d’un shard qui accepte les écritures. Les autres nœuds recopient ses données.' },
		{ term: 'Élection', def: 'L’étape où les nœuds restants d’un shard choisissent un nouveau primaire quand l’ancien tombe.' },
		{ term: 'Disjoncteur (circuit breaker)', def: 'Une enveloppe autour d’un appel distant qui compte les échecs. Au delà d’un seuil, elle renvoie tout de suite une erreur sans faire l’appel.' }
	],
	incident: {
		org: 'Stripe',
		title: 'Root cause analysis: significantly elevated error rates on 2019-07-10',
		date: '2019-07-10',
		url: RCA,
		steps: [
			{
				situation: [
					'16 h 36 UTC. La supervision signale que l’élection du shard a échoué : il n’a plus de primaire, donc il n’accepte plus aucune écriture.',
					'Beaucoup d’applications écrivent dans ce shard, dont l’API. Leurs écritures attendent jusqu’au timeout.',
					'Il y a trois mois, les bases sont passées à une nouvelle version mineure. Depuis, cette version a réussi de nombreuses bascules.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Remettre tout de suite tous les clusters sur l’ancienne version mineure',
					'Trouver comment forcer un nouveau primaire, quitte à redémarrer',
					'Attendre que les nœuds relancent l’élection d’eux-mêmes',
					'Ajouter des serveurs d’API pour absorber les requêtes en attente'
				],
				answer: 1,
				why: 'L’API ne peut pas écrire tant que le shard n’a pas de primaire, donc il faut d’abord en retrouver un. L’équipe a jugé que forcer l’élection était le plus rapide : "forcing the election of a new primary as the fastest remediation available, but this required restarting the database cluster." L’élection avait déjà échoué une fois, et rien ne désignait encore la version mineure.'
			},
			{
				situation: [
					'17 h 00 UTC. L’équipe redémarre tous les nœuds du cluster et l’élection réussit. L’API est rétablie à 17 h 02, 27 minutes après le début.',
					'20 h 13 UTC. En cherchant la cause, l’équipe trouve dans la nouvelle version mineure du protocole d’élection un chemin de code qui a probablement provoqué le bug.',
					'L’ancienne version tournait avant la mise à jour, il y a trois mois. Les shards de production portent aussi un réglage de configuration ajouté récemment.'
				],
				q: 'Comment retires-tu la version suspecte ?',
				options: [
					'Revenir en arrière sur un shard d’abord, avec la config actuelle',
					'Revenir en arrière sur tous les shards d’un coup, l’ancienne est connue',
					'Garder la nouvelle version et redémarrer le cluster à chaque panne',
					'Passer à la dernière version mineure publiée par les mainteneurs'
				],
				answer: 0,
				why: 'L’ancienne version n’avait jamais tourné avec le réglage récent : personne ne l’avait testée dans cet état. La mise à jour d’origine s’était faite par étapes, "starting with less critical clusters". Pour le retour arrière, l’équipe a choisi "the previous known stable version for all shards of the impacted cluster" et l’a déployée en quatre minutes.'
			},
			{
				situation: [
					'21 h 14 UTC. Les alertes repartent : plusieurs shards du cluster sont indisponibles, dont celui du premier incident. L’API renvoie des erreurs.',
					'Les symptômes ressemblent à ceux de 16 h 35. Le retour arrière a fini de se déployer il y a une demi-heure environ.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Redémarrer encore tous les nœuds, comme à 17 h 00',
					'Appeler les mainteneurs de la base et attendre leur analyse',
					'Regarder le CPU des shards et le retour arrière avant de relancer',
					'Passer l’API en lecture seule jusqu’au retour des shards'
				],
				answer: 2,
				why: 'Le seul changement depuis 17 h 02 était le retour arrière, et cette fois plusieurs shards tombaient ensemble. L’équipe a d’abord cru au même problème ("the same issue had reoccurred on multiple shards") et a rejoué la même procédure. La cause était autre : la version restaurée "interacted poorly with a recently-introduced configuration change", d’où une "CPU starvation on all affected shards".'
			},
			{
				situation: [
					'21 h 26 UTC. L’équipe relie la saturation CPU à l’ancien protocole d’élection combiné au réglage récent. Pousser la configuration corrigée prend du temps, entre autres parce que les nœuds manquent de CPU.',
					'22 h 34 UTC. La nouvelle configuration est en place et les nœuds du cluster ont redémarré. Le cluster se déclare sain.'
				],
				q: 'Comment remets-tu le trafic de l’API ?',
				options: [
					'Tout rouvrir d’un coup pour que les clients repartent plus vite',
					'Monter le trafic peu à peu, d’abord les services des appels API',
					'Attendre que les tâches de fond en file soient toutes vidées',
					'Redémarrer encore une fois le cluster avant d’ouvrir le trafic'
				],
				answer: 1,
				why: 'Les shards sortaient tout juste d’une saturation CPU, et les services qui servent les requêtes des utilisateurs passent en premier. Stripe écrit : "we began ramping traffic back up, prioritizing services required for user-initiated API requests." L’API est rétablie à 22 h 47.'
			},
			{
				situation: [
					'L’analyse trouve ce qui a préparé la première panne. Quatre jours avant, deux nœuds du shard s’étaient bloqués. Ils n’envoyaient plus leur métrique de retard de réplication, mais répondaient toujours sains aux sondes actives.',
					'La nouvelle version mineure avait un défaut dans sa bascule, qui n’apparaît que si plusieurs nœuds sont bloqués.'
				],
				q: 'Quelle alerte aurait montré cet état quatre jours plus tôt ?',
				options: [
					'Une alerte quand la sonde d’un nœud échoue deux fois de suite',
					'Une alerte quand un nœud n’envoie plus son retard de réplication',
					'Une alerte quand le retard de réplication dépasse 10 secondes',
					'Une alerte quand le primaire d’un shard change plus d’une fois par jour'
				],
				answer: 1,
				why: 'Les nœuds bloqués passaient les sondes, et aucune valeur de retard n’arrivait pour franchir un seuil. Seule l’absence de la métrique trahissait le problème. Stripe a ajouté une supervision "to alert us when nodes stop reporting replication lag".'
			}
		],
		outcome: [
			'La première période, de 16 h 35 à 17 h 02 UTC, vient de deux modes de panne jamais vus chez Stripe : deux nœuds bloqués, et un défaut de la bascule dans la nouvelle version mineure, qui ne se montre qu’avec plusieurs nœuds bloqués. Le shard n’a pas pu élire de primaire.',
			'La deuxième période, de 21 h 14 à 22 h 47 UTC, vient de la correction. Le protocole d’élection restauré, combiné à un changement de configuration récent, a saturé le CPU de tous les shards touchés.',
			'Dans les deux fenêtres, "a substantial majority of API requests" ont échoué. Un seul shard a fait tomber l’API parce que ses écritures en attente ont "starved compute resources for the API". Stripe a écrit à chaque utilisateur ayant eu au moins cinq requêtes POST en échec.',
			'Stripe a annoncé ces corrections : des alertes quand un nœud n’envoie plus son retard de réplication ou qu’un shard entre dans l’état qui déclenche le défaut, un travail avec les mainteneurs de la base sur ce défaut, et plus de disjoncteurs sur les opérations vers certains clusters. Stripe veut aussi limiter les ressources prises par les clients qui réessaient en boucle, et outiller les changements de configuration rapides pendant un incident.'
		]
	},
	quiz: [
		{
			q: 'Un seul shard a perdu son primaire. Pourquoi la plus grande partie de l’API Stripe a-t-elle échoué ?',
			options: [
				'L’API lisait toutes ses réponses sur le primaire de ce shard',
				'La bascule a envoyé tout le trafic sur un seul nœud restant',
				'Les requêtes en attente d’écriture ont pris le calcul de l’API',
				'Les nœuds du shard envoyaient des erreurs aux autres shards'
			],
			answer: 2,
			why: 'Beaucoup d’applications écrivaient dans ce shard. Chaque écriture restait bloquée jusqu’au timeout en gardant des ressources de l’API, donc même les requêtes sans lien avec le shard échouaient. Stripe y répond par des disjoncteurs sur les opérations vers un cluster en panne.'
		},
		{
			q: 'Deux nœuds se sont bloqués quatre jours avant la panne. Pourquoi aucune alerte n’a sonné ?',
			options: [
				'Leur retard de réplication restait sous le seuil d’alerte',
				'Ils passaient les sondes et n’envoyaient plus leur métrique',
				'La supervision était en panne pendant ces quatre jours',
				'Un nœud bloqué sort automatiquement du shard'
			],
			answer: 1,
			why: 'Une alerte à seuil a besoin d’une valeur à comparer. Les nœuds n’envoyaient plus de retard et répondaient aux sondes, donc rien ne dépassait le seuil. La correction alerte sur l’absence de la métrique.'
		},
		{
			q: 'Le retour arrière visait une "known stable version". Pourquoi a-t-il causé la deuxième panne ?',
			options: [
				'Cette version n’avait jamais tourné avec le réglage ajouté récemment',
				'Le script de retour arrière a sauté le shard du premier incident',
				'Revenir à une version efface les données écrites depuis',
				'L’ancienne version ne lisait pas le nouveau format de données'
			],
			answer: 0,
			why: 'L’ancien protocole d’élection était stable avant un changement de configuration arrivé plus tard. Les deux ensemble ont saturé le CPU des shards. Ses trois mois sans incident dataient d’avant ce réglage.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a lancé la deuxième panne de Stripe le 10 juillet 2019, de 21 h 14 à 22 h 47 UTC ?',
		a: 'Le retour à l’ancienne version du protocole d’élection, qui, combiné à un réglage de configuration récent, a saturé le CPU de tous les shards touchés.'
	},
	sources: [
		{ title: 'Stripe : Root cause analysis, significantly elevated error rates on 2019-07-10', url: RCA },
		{ title: 'Martin Fowler : Circuit Breaker', url: 'https://martinfowler.com/bliki/CircuitBreaker.html' }
	]
};
