const PM = 'https://aws.amazon.com/message/12721/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'aws-network-2021',
	part: 'Capacité et effets en cascade',
	title: 'AWS 2021 : la congestion du réseau interne de us-east-1',
	minutes: 10,
	hook: [
		'Mardi 7 décembre 2021, 7:30 heure du Pacifique, Virginie du Nord (US-EAST-1). Tu es dans une équipe d’exploitation d’AWS. AWS fait tourner le monitoring, le DNS interne, l’autorisation et une partie du control plane d’EC2 sur un réseau interne.',
		'Des équipements réseau relient ce réseau interne au réseau principal d’AWS, où tournent la plupart des services AWS et toutes les applications des clients. À 7:30, ces équipements commencent à retarder le trafic entre les deux réseaux.',
		'À 7:33, les API d’EC2 qui lancent et listent les instances renvoient plus d’erreurs et répondent lentement. Tes données de monitoring en temps réel n’arrivent plus.'
	],
	terms: [
		{ term: 'Réseau interne', def: 'Le réseau d’AWS qui héberge les services de base : monitoring, DNS interne, autorisation et une partie du control plane d’EC2. Les applications des clients n’y tournent pas.' },
		{ term: 'Control plane', def: 'Les API qui créent et gèrent les ressources AWS, par exemple le lancement d’une instance EC2. Les instances déjà lancées tournent sans lui.' },
		{ term: 'Backoff', def: 'Un client attend un peu plus longtemps après chaque échec avant de réessayer. Sans backoff, les nouvelles tentatives chargent encore un système déjà en panne.' },
		{ term: 'Service Health Dashboard', def: 'La page publique où AWS affiche l’état de ses services dans chaque région.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region',
		date: '2021-12-07',
		url: PM,
		steps: [
			{
				situation: [
					'Juste après 7:30. Les équipements entre le réseau interne et le réseau principal sont congestionnés. La latence et les erreurs montent pour tous les services qui passent par eux.',
					'La congestion coupe aussi tes données de monitoring en temps réel. Tes dashboards ne montrent pas d’où vient le trafic.'
				],
				q: 'Comment cherches-tu la source de la congestion ?',
				options: [
					'Tu attends le retour du monitoring, puis tu lis les dashboards',
					'Tu lis les logs des services pour voir quelles erreurs montent',
					'Tu annules le dernier déploiement de chaque service de la région',
					'Tu bascules tout le trafic client de us-east-1 vers une autre région'
				],
				answer: 1,
				why: 'Le résumé : « Operators instead relied on logs to understand what was happening and initially identified elevated internal DNS errors. » Après 9:28, l’équipe ne voyait toujours pas les données de monitoring.'
			},
			{
				situation: [
					'Tu dois publier sur le Service Health Dashboard. Son outil devrait basculer vers une région de secours, mais la congestion bloque cette bascule. Tu arrives à publier à 8:22.',
					'Beaucoup de services AWS sont touchés, et tout l’impact vient d’une seule cause.'
				],
				q: 'Comment publies-tu le message ?',
				options: [
					'Un seul bandeau global en haut de la page',
					'Une entrée par service touché, qui dit ce qui échoue',
					'Rien tant que la cause n’est pas corrigée',
					'Un message sur les réseaux sociaux, sans lien'
				],
				answer: 1,
				why: 'AWS a choisi un bandeau global parce que l’impact « all stemmed from a single root cause ». AWS a ensuite écrit que ce bandeau « makes it difficult for some customers to find information about this issue ». AWS a prévu un nouveau Service Health Dashboard qui montre mieux l’impact par service.'
			},
			{
				situation: [
					'Les logs montrent une hausse des erreurs du DNS interne. Tous les services s’appuient sur le DNS interne, et son trafic semble ajouter à la congestion.'
				],
				q: 'Que fais-tu du DNS interne ?',
				options: [
					'Tu redémarres les serveurs DNS internes un par un',
					'Tu demandes aux équipes de garder les réponses DNS en cache un jour',
					'Tu fais passer le trafic DNS interne hors des chemins congestionnés',
					'Tu ne touches pas au DNS tant que la congestion dure'
				],
				answer: 2,
				why: 'Les équipes ont sorti le trafic DNS interne des chemins congestionnés et ont fini à 9:28. Les erreurs de résolution DNS ont totalement disparu. Le changement a allégé les équipements et amélioré plusieurs services, mais « did not fully resolve the AWS service impact or eliminate the congestion ».'
			},
			{
				situation: [
					'9:28. Les équipements sont toujours congestionnés, et le monitoring reste invisible. Tes systèmes de déploiement internes tournent sur le réseau interne, donc ils sont touchés eux aussi.',
					'Beaucoup de services AWS du réseau principal et beaucoup d’applications clientes marchent encore normalement.'
				],
				q: 'Comment réduis-tu la congestion ?',
				options: [
					'Tu pousses un gros changement réseau sur tous les équipements en même temps',
					'Tu redémarres tous les équipements réseau entre les deux réseaux',
					'Tu bloques tout le trafic du réseau interne pendant dix minutes',
					'Tu isoles les plus gros flux et tu ajoutes de la capacité, une étape à la fois'
				],
				answer: 3,
				why: 'Les opérateurs ont isolé les plus grosses sources de trafic sur des équipements dédiés, coupé quelques services gourmands et ajouté de la capacité. Ils sont allés lentement : « we wanted to be extremely deliberate while making changes to avoid impacting functioning workloads. » La congestion avait bien baissé à 13:34, et tous les équipements étaient rétablis à 14:22.'
			},
			{
				situation: [
					'L’analyse trouve le déclencheur. À 7:30, une tâche automatique a augmenté la capacité d’un service AWS du réseau principal. Un grand nombre de clients du réseau interne ont alors ouvert des connexions d’un coup.',
					'Les retards ont entraîné encore plus de tentatives de connexion. Ces clients ont du code de backoff, mais il ne les a pas freinés cette fois.'
				],
				q: 'Quel correctif empêche cette chaîne précise de revenir ?',
				options: [
					'Ne plus jamais augmenter la capacité d’un service du réseau principal',
					'Corriger le bug latent qui a empêché le backoff des clients',
					'Doubler le nombre d’équipements entre les deux réseaux',
					'Déplacer le monitoring sur le réseau principal d’AWS'
				],
				answer: 1,
				why: 'AWS écrit qu’« a latent issue prevented these clients from adequately backing off during this event » et prévoit un correctif sous deux semaines. AWS a aussi suspendu ces tâches de mise à l’échelle jusqu’à la fin des correctifs, et ajouté une configuration réseau qui protège les équipements d’un afflux semblable.'
			}
		],
		outcome: [
			'Cause : une tâche automatique de mise à l’échelle sur le réseau principal a déclenché « an unexpected behavior from a large number of clients inside the internal network ». Leurs connexions ont saturé les équipements entre les deux réseaux. Les retards ont provoqué plus de tentatives, et un bug latent a empêché le backoff des clients.',
			'Les instances EC2 en marche n’ont pas été touchées. Les API d’EC2 ont eu des erreurs dès 7:33, et le lancement de nouvelles instances n’est revenu qu’à 14:40. Les API de Route 53 ont été dégradées de 7:30 à 14:30, mais les enregistrements DNS existants répondaient toujours.',
			'D’autres services ont mis plus longtemps. API Gateway était en grande partie rétabli à 16:37, et EventBridge a livré ses événements en retard jusqu’à 18:40. Il était impossible de créer un ticket de support de 7:33 à 14:25, car le Support Contact Center dépend du réseau interne.',
			'Les correctifs annoncés par AWS : les tâches de mise à l’échelle restent coupées jusqu’à la fin des correctifs, une correction du bug de backoff, une configuration réseau qui protège les équipements, un nouveau Service Health Dashboard, et un système de support qui tourne sur plusieurs régions AWS.'
		]
	},
	quiz: [
		{
			q: 'L’afflux de connexions a commencé à 7:30. Pourquoi les équipements étaient-ils encore congestionnés des heures plus tard ?',
			options: [
				'La tâche de mise à l’échelle a tourné en boucle jusqu’à 14:22',
				'Les retards faisaient réessayer les clients, et un bug latent bloquait leur backoff',
				'Les équipements avaient planté et il a fallu les redémarrer un par un',
				'Le trafic des clients sur le réseau principal a grimpé toute la journée'
			],
			answer: 1,
			why: 'Chaque retard entraînait « even more connection attempts and retries », qui chargeaient les mêmes équipements. Le code de backoff aurait dû espacer ces tentatives, mais un bug latent l’en a empêché.'
		},
		{
			q: 'Les instances EC2 en marche ont tourné toute la journée. Pourquoi les clients ne pouvaient-ils pas en lancer de nouvelles ?',
			options: [
				'Tous les hôtes de us-east-1 étaient pleins après la mise à l’échelle',
				'Le control plane d’EC2 utilise des services du réseau interne',
				'Route 53 ne pouvait pas donner de nom aux nouvelles instances',
				'Les nouvelles instances ont besoin de S3, qui était en panne'
			],
			answer: 1,
			why: 'Le résumé : ces control planes « use services hosted in the internal network ». Les instances en marche vivent sur le réseau principal, donc elles ne passaient pas par les équipements congestionnés.'
		},
		{
			q: '10 000 clients réessaient un appel en échec chaque seconde, sans attendre. Le serveur est surchargé. Quel changement côté clients l’aide à se rétablir ?',
			options: [
				'Réessayer avec un timeout plus court pour que les échecs reviennent plus vite',
				'Attendre plus longtemps après chaque échec, avec un délai aléatoire en plus',
				'Envoyer le même appel à deux serveurs en même temps',
				'Réessayer sans limite jusqu’à ce que l’appel passe'
			],
			answer: 1,
			why: 'L’Amazon Builders’ Library : « When failures are caused by overload, retries that increase load can make matters significantly worse. » Le backoff exponentiel espace les tentatives, et le jitter (un délai aléatoire) les étale pour qu’elles n’arrivent pas toutes au même moment.'
		}
	],
	recall: {
		q: 'Pourquoi une tâche automatique de mise à l’échelle a-t-elle congestionné le réseau interne de us-east-1 pendant des heures le 7 décembre 2021 ?',
		a: 'Elle a déclenché un afflux de connexions des clients du réseau interne. Les retards ont provoqué plus de tentatives, et un bug latent a empêché leur backoff, donc les équipements n’ont été totalement rétablis qu’à 14:22 heure du Pacifique.'
	},
	sources: [
		{ title: 'AWS, Summary of the AWS Service Event in the Northern Virginia (US-EAST-1) Region (10 décembre 2021)', url: PM },
		{ title: 'Amazon Builders’ Library, Timeouts, retries, and backoff with jitter', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' }
	]
};
