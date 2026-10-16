const PM = 'https://status.openai.com/incidents/ctrsv3lwd797';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'openai-2024',
	part: 'Réseau et DNS',
	title: 'OpenAI 2024 : un service de télémétrie qui a saturé les control planes Kubernetes',
	minutes: 10,
	hook: [
		'Mercredi 11 décembre 2024. OpenAI fait tourner des centaines de clusters Kubernetes dans le monde. Depuis 14 h 51 PST, le pipeline de déploiement applique un même changement à tous ces clusters.',
		'À 15 h 13, les alertes partent et les ingénieurs sont prévenus. À 15 h 16, ChatGPT, l’API et Sora commencent à se dégrader.'
	],
	terms: [
		{ term: 'Control plane', def: 'La partie d’un cluster Kubernetes qui gère son état. OpenAI s’en sert pour administrer ses clusters.' },
		{ term: 'Data plane', def: 'Les nœuds qui font tourner les charges, comme l’inférence des modèles. Ils tiennent un moment sans le control plane.' },
		{ term: 'Serveur d’API Kubernetes', def: 'Le composant du control plane qui expose l’API HTTP de Kubernetes. Retirer un service d’un cluster passe par lui.' },
		{ term: 'Découverte de services', def: 'La façon dont un service trouve l’adresse d’un autre. Chez OpenAI, elle passe par le DNS de Kubernetes, que Kubernetes alimente depuis le serveur d’API.' }
	],
	incident: {
		org: 'OpenAI',
		title: 'API, ChatGPT & Sora Facing Issues',
		date: '2024-12-11',
		url: PM,
		steps: [
			{
				situation: [
					'Le changement déploie un nouveau service de télémétrie qui collecte des métriques détaillées du control plane Kubernetes. Il a été déployé à 15 h 12.',
					'Il a tourné la veille dans un cluster de staging sans problème. Avant le déploiement, l’équipe a vérifié le CPU et la mémoire de chaque cluster.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Observer 30 minutes, puisque le staging n’a rien montré',
					'Ajouter des nœuds aux clusters qui alertent',
					'Retirer le nouveau service de télémétrie des clusters',
					'Redémarrer les pods DNS de chaque cluster'
				],
				answer: 2,
				why: 'Les alertes ont démarré une minute après l’arrivée du service : c’est le premier suspect. OpenAI l’a identifié comme cause racine à 15 h 16. La correction "required us to remove the offending service", et c’est cette partie qui s’est révélée difficile.'
			},
			{
				situation: [
					'Tu essaies de retirer le service, et les serveurs d’API Kubernetes ne répondent pas. Chaque nœud de chaque cluster lance des opérations coûteuses sur l’API Kubernetes, dont le coût grandit avec la taille du cluster.',
					'Des milliers de nœuds les lancent en même temps, et le control plane est tombé dans la plupart des grands clusters. Pour retirer le service, il te faut justement ce control plane.'
				],
				q: 'Comment reprends-tu la main ?',
				options: [
					'Relancer `kubectl delete` jusqu’à ce qu’une requête passe',
					'Attendre que les serveurs d’API vident leur file de requêtes',
					'Réduire la charge sur l’API et ajouter des serveurs d’API, en parallèle',
					'Reconstruire chaque cluster de zéro dans une autre région'
				],
				answer: 2,
				why: 'Chaque nouvelle tentative ajoute à la charge qui fait tomber les serveurs d’API. OpenAI a mené trois chantiers en parallèle : réduire la taille des clusters, "blocking network access to Kubernetes admin APIs", et agrandir les serveurs d’API. Cela a "eventually restored enough control to remove the offending service."'
			},
			{
				situation: [
					'Les caches DNS des nœuds masquent les dégâts un moment. Quand les enregistrements en cache expirent, sur une vingtaine de minutes, les services ne se trouvent plus entre eux et tombent.',
					'Certains clusters sont encore sains. Reprendre la main sur les autres va prendre du temps.'
				],
				q: 'Que fais-tu du trafic des utilisateurs en attendant ?',
				options: [
					'Déplacer le trafic des clusters cassés vers les clusters sains',
					'Le laisser en place pour ne pas surcharger les clusters sains',
					'Renvoyer une erreur à tout le monde jusqu’au retour de chaque cluster',
					'Allonger la durée du cache DNS sur chaque nœud'
				],
				answer: 0,
				why: 'Les clusters sains pouvaient servir les requêtes pendant la réparation des autres. À 15 h 27, "engineers began moving traffic away from impacted clusters". L’impact client a culminé à 15 h 40, et le premier cluster est revenu à 16 h 36.'
			},
			{
				situation: [
					'Tous les clusters sont revenus à 19 h 38. Le problème n’apparaissait qu’au delà d’une certaine taille de cluster, donc le cluster de staging ne pouvait pas le montrer.',
					'Le déploiement ne surveillait que la santé des services. Personne n’avait évalué la charge sur les serveurs d’API Kubernetes, et les caches DNS ont laissé le changement atteindre tous les clusters avant les premières pannes.'
				],
				q: 'Comment déploies-tu le prochain changement d’infrastructure ?',
				options: [
					'Tester plus longtemps dans le même cluster de staging',
					'Déployer par étapes, en surveillant aussi le control plane',
					'Déployer partout la nuit, quand le trafic est au plus bas',
					'Garder le pipeline et ajouter un second relecteur au merge'
				],
				answer: 1,
				why: 'Les étapes limitent un mauvais changement aux premiers clusters, et la surveillance du control plane voit la surcharge sans attendre l’expiration des caches DNS. OpenAI écrit que les changements d’infrastructure suivront "a robust phased rollout process", avec une surveillance qui vérifie aussi que "the clusters (including the Kubernetes control plane) are healthy."'
			},
			{
				situation: [
					'Les outils d’OpenAI ont bien détecté le mauvais déploiement quelques minutes avant que les clients voient l’impact. L’équipe n’a pas pu l’annuler pour autant, car les serveurs d’API saturés lui bloquaient l’accès.'
				],
				q: 'Que construis-tu pour que les ingénieurs puissent agir la prochaine fois ?',
				options: [
					'Un tableau de bord de la charge des serveurs d’API par cluster',
					'Plus de réplicas de serveur d’API dans chaque cluster, en permanence',
					'Un accès de secours aux serveurs d’API qui marche sous n’importe quelle charge',
					'Une alerte qui appelle toute l’équipe au début de chaque déploiement'
				],
				answer: 2,
				why: 'Les outils ont repéré le mauvais déploiement, mais aucun ingénieur ne pouvait joindre les serveurs d’API pour le retirer. OpenAI écrit : "We do not yet have a mechanism to ensure access to the API server when the data plane is putting too much pressure on the control plane." L’entreprise va construire des "break-glass mechanisms to ensure that engineers can access Kubernetes API servers in any circumstances."'
			}
		],
		outcome: [
			'La cause racine était "a new telemetry service configuration that unexpectedly generated massive Kubernetes API load across large clusters". Cette charge a fait tomber le control plane, et la découverte de services par DNS avec lui.',
			'De 15 h 16 à 19 h 38 PST, tous les services d’OpenAI ont été fortement dégradés ou indisponibles. ChatGPT a largement récupéré à 17 h 45 et complètement à 19 h 01, et l’API a complètement récupéré à 19 h 38.',
			'La reprise a été lente parce que les ingénieurs n’avaient plus accès au control plane dont ils avaient besoin. Une fois l’accès retrouvé, certains clusters sont restés dégradés, car beaucoup de services téléchargeaient des ressources en même temps et atteignaient leurs limites.',
			'OpenAI a annoncé cinq mesures : des déploiements par étapes qui surveillent le control plane, des tests d’injection de pannes où le data plane tourne sans control plane, un accès de secours aux serveurs d’API, le découplage du data plane et du control plane, et un démarrage de cluster plus rapide avec du cache et des limiteurs de débit dynamiques.'
		]
	},
	quiz: [
		{
			q: 'Les charges tournent sur le data plane. Pourquoi ont-elles échoué alors que seul le control plane était surchargé ?',
			options: [
				'Les pods d’inférence tournaient sur les nœuds du control plane',
				'Les services se trouvent par DNS, et le DNS a besoin du serveur d’API',
				'Le service de télémétrie prenait tout le CPU de chaque nœud',
				'Kubernetes arrête tous les pods quand le serveur d’API tombe'
			],
			answer: 1,
			why: 'Kubernetes alimente le DNS avec ce que le serveur d’API publie sur les Pods et les Services. Avec les serveurs d’API à terre, la résolution DNS a échoué, et les services sont tombés à l’expiration de leurs enregistrements en cache.'
		},
		{
			q: 'Pourquoi le déploiement a-t-il atteint tous les clusters avant que les services tombent ?',
			options: [
				'Le pipeline a ignoré les alertes de 15 h 13',
				'Le cluster de staging était plus grand que ceux de production',
				'Les caches DNS ont gardé des enregistrements valides une vingtaine de minutes',
				'Le changement a été appliqué à tous les clusters dans la même seconde'
			],
			answer: 2,
			why: 'Chaque nœud continuait de servir ses enregistrements DNS en cache alors que le control plane était déjà tombé. Les pannes sont apparues à leur expiration, et à ce moment le changement était appliqué partout, entre 14 h 51 et 15 h 20.'
		},
		{
			q: 'L’équipe connaissait la cause à 15 h 16. Pourquoi le premier cluster n’est-il revenu qu’à 16 h 36 ?',
			options: [
				'Retirer le service passait par les serveurs d’API qu’il saturait',
				'La cause devait être confirmée par une seconde équipe',
				'Le pipeline de déploiement n’avait pas de bouton de retour arrière',
				'Le service de télémétrie se relançait après chaque retrait'
			],
			answer: 0,
			why: 'Retirer un service Kubernetes est un appel au serveur d’API, et ces serveurs étaient saturés par les requêtes de milliers de nœuds. L’équipe a d’abord dû réduire cette charge et ajouter de la capacité avant que le retrait passe.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a saturé les serveurs d’API Kubernetes d’OpenAI le 11 décembre 2024 ?',
		a: 'Un nouveau service de télémétrie dont la configuration faisait lancer à chaque nœud de chaque cluster des opérations coûteuses sur l’API Kubernetes, dont le coût grandissait avec la taille du cluster.'
	},
	sources: [
		{ title: 'OpenAI Status : API, ChatGPT & Sora Facing Issues (write-up)', url: PM },
		{ title: 'Documentation Kubernetes : Kubernetes Components', url: 'https://kubernetes.io/docs/concepts/overview/components/' },
		{ title: 'Documentation Kubernetes : DNS for Services and Pods', url: 'https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/' }
	]
};
