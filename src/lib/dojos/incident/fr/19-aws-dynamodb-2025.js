const AWS = 'https://aws.amazon.com/message/101925/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'aws-dynamodb-2025',
	part: 'Réseau et DNS',
	title: 'AWS us-east-1 2025 : une race condition dans l’automatisation DNS de DynamoDB',
	minutes: 10,
	hook: [
		'Dimanche 19 octobre 2025, 23 h 48 PDT. Dans la région N. Virginia (us-east-1), Amazon DynamoDB commence à renvoyer des erreurs d’API.',
		'Les clients n’arrivent plus à ouvrir de nouvelles connexions à DynamoDB. Les services AWS qui en dépendent tombent aussi : les erreurs de Lambda et de STS démarrent à 23 h 51.',
		'Tu fais partie d’une des équipes d’ingénierie mobilisées tout de suite.'
	],
	terms: [
		{ term: 'DNS Planner', def: 'Le composant de DynamoDB qui surveille la santé et la capacité des load balancers et écrit régulièrement un nouveau plan DNS : un ensemble de load balancers et de poids pour chaque endpoint.' },
		{ term: 'DNS Enactor', def: 'Le composant qui applique un plan DNS dans Amazon Route53, une transaction par endpoint. Trois copies tournent indépendamment, dans trois zones de disponibilité.' },
		{ term: 'Race condition', def: 'Un bug qui n’apparaît que si deux processus agissent dans un ordre précis. Ici, deux DNS Enactors travaillaient sur le même endpoint presque en même temps.' },
		{ term: 'Bail de droplet', def: 'Le bail que le DropletWorkflow Manager (DWFM) d’EC2 tient sur chaque serveur physique, appelé droplet. Un droplet sans bail actif ne peut pas recevoir de nouvelle instance.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the Amazon DynamoDB Service Disruption in the Northern Virginia (US-EAST-1) Region',
		date: '2025-10-19',
		url: AWS,
		steps: [
			{
				situation: [
					'23 h 48 PDT. Tous les systèmes qui passent par l’endpoint régional public de DynamoDB échouent à se connecter, trafic client comme trafic interne d’AWS.',
					'Les clients qui ont des global tables DynamoDB peuvent toujours envoyer des requêtes à leurs répliques dans d’autres régions.'
				],
				q: 'Que vérifies-tu en premier ?',
				options: [
					'La santé des nœuds de stockage DynamoDB dans us-east-1',
					'Ce que `dynamodb.us-east-1.amazonaws.com` résout en ce moment',
					'Le dernier déploiement de code sur les routeurs de requêtes',
					'Les politiques IAM des services qui appellent DynamoDB'
				],
				answer: 1,
				why: 'Les nouvelles connexions échouent partout à la fois alors que les autres régions répondent : le problème est dans la façon dont les clients trouvent l’endpoint. Les systèmes "immediately began experiencing DNS failures". À 0 h 38, les ingénieurs "had identified DynamoDB’s DNS state as the source of the outage."'
			},
			{
				situation: [
					'L’enregistrement DNS de `dynamodb.us-east-1.amazonaws.com` est vide : il ne contient aucune adresse IP. Le plan DNS actif a été supprimé.',
					'Dans cet état, aucun DNS Enactor ne peut appliquer de plan plus récent, donc l’enregistrement reste vide.'
				],
				q: 'Comment récupères-tu l’endpoint ?',
				options: [
					'Attendre que le prochain plan du DNS Planner écrase l’enregistrement vide',
					'Redémarrer les trois DNS Enactors pour qu’ils rechargent le dernier plan',
					'Faire réparer l’état DNS à la main par des opérateurs, hors automatisation',
					'Demander à chaque client de passer sur ses répliques de global tables'
				],
				answer: 2,
				why: 'L’état incohérent bloquait chaque Enactor, donc l’automatisation ne pouvait pas se réparer seule. AWS écrit que la situation "ultimately required manual operator intervention to correct." À 1 h 15, certains services internes se connectaient de nouveau, et à 2 h 25 toutes les informations DNS étaient restaurées.'
			},
			{
				situation: [
					'2 h 25 PDT. DynamoDB est revenu, mais les nouveaux lancements EC2 échouent avec des erreurs "insufficient capacity". Entre 23 h 48 et 2 h 24, les baux DWFM sur les droplets ont expiré peu à peu, car les vérifications d’état de DWFM dépendent de DynamoDB.',
					'DWFM essaie maintenant de rétablir les baux sur toute la flotte. Chaque tentative prend tant de temps qu’elle expire avant la fin, et les nouvelles tentatives s’ajoutent à la file. Aucune procédure n’existe pour cet état.'
				],
				q: 'Que fais-tu de DWFM ?',
				options: [
					'Freiner le travail entrant et redémarrer certains hôtes DWFM',
					'Laisser DWFM tranquille jusqu’à ce que sa file se vide',
					'Redémarrer tous les hôtes DWFM de la région en même temps',
					'Ajouter des hôtes DWFM pour répartir la file sur plus de workers'
				],
				answer: 0,
				why: 'Une file de tentatives qui expirent toutes ne diminue jamais, il fallait donc réduire le travail et vider les files. À 4 h 14, "engineers throttled incoming work and began selective restarts of DWFM hosts". Les redémarrages ont vidé les files, et à 5 h 28 DWFM tenait un bail sur tous les droplets de la région.'
			},
			{
				situation: [
					'Les nouvelles instances se lancent, mais Network Manager a un gros retard de configurations réseau à leur pousser. Les health checks du Network Load Balancer mettent ces instances en service avant que leur état réseau soit propagé.',
					'À 6 h 52, la supervision détecte des health checks NLB qui alternent entre échec et succès. Ce va-et-vient surcharge le sous-système de health checks, qui déclenche le basculement DNS automatique entre zones et retire de la capacité aux load balancers multi-zones.'
				],
				q: 'Que fais-tu des basculements du NLB ?',
				options: [
					'Baisser le seuil des health checks pour que les nœuds tombent plus tôt',
					'Couper le basculement automatique du NLB jusqu’au retour d’EC2',
					'Ajouter des nœuds NLB dans chaque zone de disponibilité',
					'Demander aux clients de déplacer leurs load balancers dans une autre région'
				],
				answer: 1,
				why: 'Les nœuds et les cibles étaient sains : les échecs venaient d’un état réseau pas encore arrivé. À 9 h 36, "engineers disabled automatic health check failovers for NLB", ce qui a remis en service la capacité saine. Ils l’ont réactivé à 14 h 09, peu après le retour d’EC2.'
			},
			{
				situation: [
					'L’analyse trouve la race condition. Un DNS Enactor, très en retard, appliquait un vieux plan. Un autre Enactor a appliqué un plan bien plus récent, puis lancé son nettoyage des vieux plans.',
					'L’Enactor en retard a écrit son vieux plan par dessus le récent, puis le nettoyage a supprimé ce vieux plan et vidé l’enregistrement. La même automatisation Planner et Enactor tourne dans les autres régions.'
				],
				q: 'Que fais-tu de l’automatisation DNS ?',
				options: [
					'La laisser tourner, la race demande un timing très improbable',
					'La couper dans us-east-1 seulement, là où la race a eu lieu',
					'La couper partout jusqu’à ce que la race soit corrigée et protégée',
					'La laisser tourner et ajouter une alerte sur les enregistrements vides'
				],
				answer: 2,
				why: 'Le même code pouvait tomber sur le même timing dans n’importe quelle région. AWS écrit : "We have already disabled the DynamoDB DNS Planner and the DNS Enactor automation worldwide." Avant de la rallumer, AWS corrigera la race et va "add additional protections to prevent the application of incorrect DNS plans."'
			}
		],
		outcome: [
			'La cause racine était "a latent race condition in the DynamoDB DNS management system". Un Enactor vérifie une seule fois, avant de commencer, que son plan est plus récent que le plan appliqué. Ses retards ont rendu ce test périmé : son vieux plan a écrasé le récent, puis le nettoyage de l’autre Enactor l’a supprimé.',
			'L’événement a duré du 19 octobre à 23 h 48 PDT au 20 octobre à 14 h 20. Les erreurs d’API DynamoDB ont duré jusqu’à 2 h 40. Les nouveaux lancements EC2 ont échoué de 2 h 25 à 10 h 36, et certains NLB ont eu des erreurs de connexion de 5 h 30 à 14 h 09.',
			'Lambda, STS, la connexion IAM à la console, Redshift, Amazon Connect, ECS, EKS et Fargate font partie des services touchés dans us-east-1. Certains clusters Redshift sont restés indisponibles jusqu’au 21 octobre à 4 h 05 PDT.',
			'AWS a listé ses corrections : corriger la race et ajouter des protections avant de rallumer l’automatisation DNS, un contrôle de vitesse qui limite la capacité qu’un NLB peut retirer lors d’un basculement entre zones, une suite de tests qui exerce la reprise de DWFM, et un freinage dans la propagation des données EC2 selon la taille de la file d’attente.'
		]
	},
	quiz: [
		{
			q: 'Le DNS Enactor vérifie que son plan est plus récent que le plan appliqué. Pourquoi ce test a-t-il laissé passer un vieux plan ?',
			options: [
				'Le test comparait la taille des plans et pas leur génération',
				'Il tournait une fois au début, et les longs retards l’ont périmé',
				'Le plan récent avait été supprimé avant le test',
				'Le test ne tournait que dans une des trois zones'
			],
			answer: 1,
			why: 'Le test a lieu avant que l’Enactor parcoure les endpoints. Il a ensuite passé longtemps à réessayer des transactions bloquées, et quand il a écrit l’endpoint régional, des plans plus récents étaient déjà appliqués. Une transaction Route53 applique tous ses changements ou aucun, mais elle ne vérifie pas quel plan est le plus récent.'
		},
		{
			q: 'DynamoDB est revenu à 2 h 25. Pourquoi les nouveaux lancements EC2 ont-ils échoué encore des heures ?',
			options: [
				'Les caches DNS des hôtes EC2 gardaient l’enregistrement vide de DynamoDB',
				'Les droplets avaient été éteints pour protéger les instances en cours',
				'Les clients ont lancé tant d’instances que la région n’avait plus de serveurs',
				'DWFM devait renouveler le bail de chaque droplet et expirait en essayant'
			],
			answer: 3,
			why: 'Un droplet sans bail actif n’est pas candidat aux nouveaux lancements. Avec toute la flotte à renouveler, chaque tentative de bail durait plus que son délai et repartait dans la file. AWS appelle cet état "congestive collapse".'
		},
		{
			q: 'Pourquoi les health checks du NLB échouaient-ils sur des nœuds et des cibles sains ?',
			options: [
				'Les nouvelles instances n’avaient pas encore de configuration réseau',
				'Le sous-système de health checks lisait des données DynamoDB périmées',
				'Les cibles refusaient les connexions pendant un déploiement',
				'Les checks utilisaient l’enregistrement DNS vide de DynamoDB'
			],
			answer: 0,
			why: 'Network Manager avait un retard d’état réseau à pousser, donc des instances entraient en service avant de pouvoir communiquer. Les checks échouaient puis réussissaient, et chaque échec retirait des nœuds du DNS.'
		}
	],
	recall: {
		q: 'Comment l’enregistrement DNS de `dynamodb.us-east-1.amazonaws.com` s’est-il retrouvé vide le 19 octobre 2025 ?',
		a: 'Un DNS Enactor en retard a appliqué un vieux plan par dessus un plan récent, puis le nettoyage d’un autre Enactor a supprimé ce vieux plan, ce qui a retiré toutes les adresses IP de l’enregistrement.'
	},
	sources: [
		{ title: 'AWS : Summary of the Amazon DynamoDB Service Disruption in the Northern Virginia (US-EAST-1) Region', url: AWS },
		{ title: 'Amazon Route 53 API Reference : ChangeResourceRecordSets', url: 'https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html' }
	]
};
