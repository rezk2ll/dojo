const REPORT = 'https://status.cloud.google.com/incidents/ow5i3PPK96RduMcb1SsW';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'google-cloud-2025',
	part: 'Changements et configuration',
	title: 'Google Cloud 2025 : la politique de quota aux champs vides',
	minutes: 10,
	hook: [
		'Jeudi 12 juin 2025, 10:49 PDT. Les requêtes d’API externes vers Google Cloud et Google Workspace commencent à échouer avec des erreurs 503.',
		'Les erreurs arrivent de toutes les régions en même temps. L’accès par l’API et par la console à Cloud Storage, IAM, BigQuery et des dizaines d’autres produits marche par intermittence.',
		'Tu fais partie de l’équipe Site Reliability Engineering de Google. Tu commences le tri à 10:51, deux minutes après les premières erreurs.'
	],
	terms: [
		{ term: 'Service Control', def: 'Le binaire de Google qui vérifie que chaque requête d’API entrante est autorisée et reste dans son quota. Il lit les quotas et les politiques dans une base régionale.' },
		{ term: 'Feature flag', def: 'Un interrupteur qui active du nouveau code petit à petit, région par région et projet par projet, en commençant par les projets internes.' },
		{ term: 'Fail open', def: 'Quand une vérification échoue, le service répond quand même à la requête au lieu de la rejeter.' },
		{ term: 'Randomized exponential backoff', def: 'Chaque nouvel essai attend plus longtemps que le précédent, plus un délai aléatoire : des clients tombés ensemble ne réessaient pas ensemble.' }
	],
	incident: {
		org: 'Google Cloud',
		title: 'Multiple GCP products are experiencing Service issues',
		date: '2025-06-12',
		url: REPORT,
		steps: [
			{
				situation: [
					'10:51 PDT. Les tâches Service Control plantent et redémarrent dans toutes les régions à la fois.',
					'La dernière version du binaire Service Control a commencé à sortir le 29 mai. Elle a été déployée région par région, et aucune région n’a eu de souci avec elle en deux semaines.'
				],
				q: 'Que cherches-tu en premier ?',
				options: [
					'Un changement arrivé dans toutes les régions ces dernières minutes',
					'Une région où le déploiement du 29 mai s’est mal passé',
					'Un pic de trafic venant d’un gros client',
					'Un disque ou un lien réseau en panne dans un data center'
				],
				answer: 0,
				why: 'Un plantage dans toutes les régions dans les mêmes minutes désigne quelque chose de répliqué partout. Vers 10:45, une modification de politique a été écrite dans les tables Spanner que lit Service Control, et « this metadata was replicated globally within seconds ». La cause a été trouvée en moins de 10 minutes.'
			},
			{
				situation: [
					'11:00 PDT. La nouvelle politique contient des champs vides. Le code du 29 mai a ajouté une vérification de quota qui les lit et tombe sur un pointeur nul : chaque tâche plante dès qu’elle charge la politique.',
					'Ce code n’a pas de feature flag. Il est livré avec un bouton rouge qui coupe le nouveau chemin de traitement des politiques.'
				],
				q: 'Comment arrêtes-tu les plantages ?',
				options: [
					'Tu redémarres toutes les tâches Service Control de toutes les régions',
					'Tu déploies le bouton rouge pour couper le nouveau chemin',
					'Tu envoies le trafic d’API vers la région qui a le moins d’erreurs',
					'Tu attends que la boucle de plantages ralentisse seule'
				],
				answer: 1,
				why: 'Une tâche redémarrée relit la même politique et replante, et toutes les régions sont touchées. Le bouton rouge était prêt environ 25 minutes après le début et entièrement déployé en moins de 40 minutes. Le service est revenu d’abord dans les petites régions.'
			},
			{
				situation: [
					'Vers 11:30 PDT. La plupart des régions reviennent. Dans us-central1, les tâches Service Control redémarrent toutes en même temps et frappent la même table Spanner.',
					'La table est surchargée. Service Control n’a pas de randomized exponential backoff : les tâches réessaient toutes ensemble.'
				],
				q: 'Que fais-tu dans us-central1 ?',
				options: [
					'Tu relances toutes les tâches pour qu’elles démarrent sur d’autres machines',
					'Tu limites la création de tâches et lis dans des bases multirégionales',
					'Tu ajoutes des tâches Service Control pour absorber la charge',
					'Tu attends que les tâches finissent leurs essais d’elles-mêmes'
				],
				answer: 1,
				why: 'L’équipe a « throttled task creation to minimize the impact on the underlying infrastructure and routed traffic to multi-regional databases to reduce the load ». Plus de tâches ou un nouveau redémarrage en masse chargent encore la même table. Le retour complet de us-central1 a quand même pris jusqu’à 2 h 40 environ.'
			},
			{
				situation: [
					'Les clients n’ont encore reçu aucune information. Cloud Service Health, la page de statut de Google, est en panne à cause de cet incident.',
					'Certains clients font tourner leur supervision sur Google Cloud : leurs propres alertes échouent aussi.'
				],
				q: 'Comment informes-tu les clients ?',
				options: [
					'Tu attends le retour de Cloud Service Health pour y publier',
					'Tu publies sur un canal qui ne tourne pas sur Google Cloud',
					'Tu réponds aux tickets de support un par un',
					'Tu communiques une fois l’analyse de cause terminée'
				],
				answer: 1,
				why: 'Google a publié son premier rapport « about ~1h after the start of the crashes, due to the Cloud Service Health infrastructure being down due to this outage ». Pendant cette heure, certains clients n’avaient aucun signal. Parmi les correctifs : garder supervision et communication en service « even when Google Cloud and our primary monitoring products are down ».'
			},
			{
				situation: [
					'Après-midi du 12 juin. Service Control et les API répondent de nouveau dans toutes les régions. Certains produits rattrapent encore leur retard.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Tu pousses tout de suite une version corrigée de la politique',
					'Tu reprends les livraisons prévues de Service Control',
					'Tu gèles Service Control et les envois manuels de politiques',
					'Tu mets toutes les politiques de quota dans une seule base mondiale'
				],
				answer: 2,
				why: 'Le rapport : « Immediately upon recovery, we froze all changes to the Service Control stack and manual policy pushes until we can completely remediate the system. » Toute nouvelle politique pouvait de nouveau atteindre le même code sans protection.'
			}
		],
		outcome: [
			'Le 29 mai 2025, Google a ajouté une vérification de politique de quota à Service Control. Le déploiement s’est fait région par région, mais le nouveau chemin de code ne s’exécutait que si une politique l’utilisait : le déploiement ne l’a jamais fait tourner. Ce code n’avait ni gestion d’erreur ni feature flag : « If this had been flag protected, the issue would have been caught in staging. »',
			'Le 12 juin vers 10:45 PDT, une politique avec des « unintended blank fields » (champs vides involontaires) a été écrite dans les tables Spanner régionales puis répliquée partout en quelques secondes. La nouvelle vérification a lu ces champs, est tombée sur un pointeur nul, et Service Control a planté en boucle dans chaque région.',
			'Google Cloud, Google Workspace et Google Security Operations ont renvoyé des erreurs 503 sur les requêtes d’API externes. Toutes les régions sauf us-central1 étaient rétablies à 12:48 PDT, et le premier rapport fixe la fin de l’incident à 13:49 PDT. Les ressources IaaS et de streaming déjà en place ont continué de tourner.',
			'Les correctifs annoncés : Service Control passe en fail open quand une vérification échoue. Les données répliquées mondialement se propagent par étapes, avec le temps de repérer un problème. Tout changement d’un binaire critique passe par un feature flag désactivé par défaut. Les systèmes utilisent un randomized exponential backoff, et supervision et page de statut restent debout quand Google Cloud tombe.'
		]
	},
	quiz: [
		{
			q: 'Le code du 29 mai a été déployé région par région. Pourquoi ce déploiement n’a-t-il pas révélé le bug ?',
			options: [
				'Le déploiement a sauté les plus grandes régions',
				'Seule une politique qui utilise la nouvelle vérification lance ce code',
				'Le déploiement utilisait une copie de staging des tables de politiques',
				'Le déploiement a eu lieu aux heures creuses'
			],
			answer: 1,
			why: 'Le rapport : « the code path that failed was never exercised during this rollout due to needing a policy change that would trigger the code ». Un déploiement lent du binaire ne teste que les chemins de code que les données du moment atteignent.'
		},
		{
			q: 'Pourquoi une seule modification de politique a-t-elle fait planter Service Control dans toutes les régions en quelques minutes ?',
			options: [
				'Chaque région lisait la politique sur un serveur central',
				'Les données de politique étaient répliquées partout en quelques secondes',
				'Un ingénieur a poussé la politique à la main dans chaque région',
				'Le plantage d’une région s’est propagé par des appels entre régions'
			],
			answer: 1,
			why: 'Les quotas sont mondiaux, donc les métadonnées arrivent dans chaque base régionale « within seconds ». Chaque Service Control régional a ensuite lu les champs vides dans sa propre base. Un des correctifs : propager ces données par étapes, avec le temps de les valider.'
		},
		{
			q: 'Pourquoi us-central1 a-t-elle mis jusqu’à 2 h 40 alors que les petites régions sont revenues plus tôt ?',
			options: [
				'us-central1 a reçu le bouton rouge en dernier',
				'Ses tâches redémarrées ont surchargé leur table Spanner commune',
				'us-central1 tournait encore sur le binaire d’avant le 29 mai',
				'Sa table Spanner contenait une seconde politique fautive'
			],
			answer: 1,
			why: 'Dans les grandes régions, beaucoup de tâches ont redémarré d’un coup et créé « a herd effect » (un effet de troupeau) sur la table Spanner dont elles dépendent. Sans randomized exponential backoff, leurs essais arrivaient ensemble et gardaient la table surchargée jusqu’à ce que l’équipe limite la création de tâches.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a fait planter Service Control le 12 juin 2025, et comment Google l’a-t-il arrêté ?',
		a: 'Une politique de quota aux champs vides, répliquée dans toutes les régions en quelques secondes, a déclenché un pointeur nul dans la vérification ajoutée le 29 mai. Google a déployé en moins de 40 minutes le bouton rouge qui coupait ce chemin.'
	},
	sources: [
		{ title: 'Google Cloud Service Health, rapport d’incident de la panne du 12 juin 2025', url: REPORT },
		{ title: 'Site Reliability Engineering, Addressing Cascading Failures (randomized exponential backoff)', url: 'https://sre.google/sre-book/addressing-cascading-failures/' }
	]
};
