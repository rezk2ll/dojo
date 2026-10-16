const PM = 'https://blog.cloudflare.com/post-mortem-on-cloudflare-control-plane-and-analytics-outage/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cloudflare-pdx-2023',
	part: 'Capacité et effets en cascade',
	title: 'Cloudflare 2023 : le data center privé de tout courant',
	minutes: 10,
	hook: [
		'Jeudi 2 novembre 2023, 11:44 UTC. Tu es d’astreinte chez Cloudflare. Les deux routeurs qui relient le data center PDX-04, près de Hillsboro dans l’Oregon, au reste du monde passent hors ligne.',
		'Cloudflare fait tourner son control plane et ses analytics dans trois data centers autour de Hillsboro. PDX-04 est le plus grand des trois. L’entreprise Flexential l’exploite, et Cloudflare y loue de la place.',
		'Tu n’arrives pas à joindre les deux routeurs en direct. Tu n’y arrives pas non plus par l’accès hors bande (out-of-band).'
	],
	terms: [
		{ term: 'Control plane', def: 'L’interface client de tous les services Cloudflare : le site du dashboard et les API. Les clients changent leurs réglages par là.' },
		{ term: 'Cluster haute disponibilité', def: 'L’ensemble des services qui tournent dans les trois data centers de Hillsboro à la fois, avec des données synchronisées. Si un data center tombe, les deux autres continuent de les faire tourner.' },
		{ term: 'Site de reprise après sinistre', def: 'Un site Cloudflare en Europe qui peut faire tourner les services critiques du control plane quand ceux de Hillsboro ne peuvent plus.' },
		{ term: 'Thundering herd', def: 'Un service revient, et toutes les requêtes qui ont échoué pendant la panne arrivent d’un coup et le surchargent.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Post mortem on the Cloudflare Control Plane and Analytics Outage',
		date: '2023-11-02',
		url: PM,
		steps: [
			{
				situation: [
					'11:44 UTC. Les deux routeurs de PDX-04 sont injoignables, même par l’accès hors bande. Flexential ne t’a envoyé aucun message sur le site.',
					'Le trafic continue de passer par le réseau Cloudflare. Le control plane et les analytics commencent à renvoyer des erreurs.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Tu appelles Flexential et tu envoies ton équipe locale sur place',
					'Tu bascules tout de suite tout le control plane vers l’Europe',
					'Tu attends que Flexential envoie un avis sur l’état du site',
					'Tu ouvres un ticket chez le fabricant des deux routeurs'
				],
				answer: 0,
				why: 'Cloudflare a essayé de joindre Flexential et a envoyé son équipe locale sur le site. Le premier message de Flexential est arrivé à 12:28 UTC, 44 minutes après la chute des routeurs. Flexential n’avait pas non plus prévenu de son passage sur groupes électrogènes à 08:50 : « None of our observability tools were able to detect that the source of power had changed. »'
			},
			{
				situation: [
					'12:28. Flexential signale « an issue with power » à PDX-04. À 12:48, ses groupes électrogènes redémarrent, mais les disjoncteurs des circuits de Cloudflare sont défectueux. Flexential a moins de disjoncteurs de rechange qu’il n’en faut et ne donne aucune heure de retour.',
					'La plupart des services critiques tournent toujours dans les deux autres data centers. Mais il y a plus de services en panne que prévu pour une perte de PDX-04.'
				],
				q: 'Que fais-tu des services en panne ?',
				options: [
					'Tu attends que Flexential change les disjoncteurs et rétablisse le courant',
					'Tu les bascules vers les sites de reprise après sinistre en Europe',
					'Tu commences à les migrer un par un dans le cluster haute disponibilité',
					'Tu demandes à Flexential de remettre les circuits Cloudflare un par un'
				],
				answer: 1,
				why: 'Le post : « Because more services were offline than we expected, and because Flexential could not give us a time for restoration of our services, we made the call at 13:40 UTC to fail over ». Seule une petite part du control plane devait partir, et les premiers services ont démarré en Europe à 13:43.'
			},
			{
				situation: [
					'13:43. Les premiers services tournent sur le site de reprise. Depuis deux heures, les clients appellent l’API et le dashboard, et leurs appels échouent.',
					'Tous ces appels arrivent maintenant d’un coup sur les services tout juste démarrés, qui sont débordés.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Tu éteins de nouveau les services et tu attends PDX-04',
					'Tu poses des limites de débit sur les requêtes entrantes',
					'Tu redémarres les services jusqu’à ce qu’un redémarrage tienne',
					'Tu renvoies les services vers les deux data centers de Hillsboro'
				],
				answer: 1,
				why: 'Le post parle d’« a thundering herd problem » et dit : « We implemented rate limits to get the request volume under control. » Pendant ce temps, les clients ont eu des erreurs par intermittence dans le dashboard et l’API. À 17:57 UTC, les services déplacés étaient stables.'
			},
			{
				situation: [
					'22:48. Flexential a changé les disjoncteurs en panne, rétabli les deux arrivées du réseau électrique et confirmé un courant propre à PDX-04.',
					'Ton équipe travaille sur l’incident depuis avant 12:00 UTC. Depuis 17:57, les services passés en Europe tournent de façon stable. Le traitement des logs et quelques API attendent encore PDX-04.'
				],
				q: 'Quand commences-tu le retour vers PDX-04 ?',
				options: [
					'Tout de suite, avec l’équipe qui travaille depuis le matin',
					'Demain matin, une fois que la plupart de l’équipe a dormi',
					'Tout de suite, en rallumant tous les serveurs de PDX-04 d’un coup',
					'Dans une semaine, quand Flexential aura fini sa propre analyse'
				],
				answer: 1,
				why: 'Matthew Prince, l’auteur du post : « I made the call that most of us should get some rest and start the move back to PDX-04 in the morning. » Il ajoute que ce choix « delayed our full recovery, but I believe made it less likely that we\'d compound this situation with additional mistakes ».'
			},
			{
				situation: [
					'3 novembre au matin. L’équipe démarre le matériel réseau de PDX-04. Des milliers de serveurs attendent d’être rallumés.',
					'Le courant a sans doute été coupé puis rétabli plusieurs fois pendant l’incident. Personne ne sait dans quel état sont les services sur ces serveurs.'
				],
				q: 'Comment remets-tu le site en route ?',
				options: [
					'Tu rallumes tous les serveurs et chaque service reprend là où il s’est arrêté',
					'Tu reconstruis tout le site, en commençant par les serveurs de gestion de configuration',
					'Tu rallumes d’abord les serveurs Kafka et ClickHouse et tu vérifies leurs données',
					'Tu copies l’état du site de reprise européen sur chaque serveur de PDX-04'
				],
				answer: 1,
				why: 'Le post : « Our only safe process to recover was to follow a complete bootstrap of the entire facility. » Reconstruire les serveurs de gestion de configuration a pris 3 heures. Chaque autre serveur a pris entre 10 minutes et 2 heures, et certains services devaient revenir dans un ordre précis.'
			}
		],
		outcome: [
			'La chaîne électrique : à 08:50 UTC, une maintenance du fournisseur d’électricité coupe une des arrivées de courant de PDX-04, et Flexential démarre ses groupes électrogènes. Vers 11:40, un défaut à la terre sur un transformateur du fournisseur coupe aussi les groupes du site. Les batteries des onduleurs devaient tenir environ 10 minutes et ont lâché au bout de 4 : tous les clients du site ont perdu le courant entre 11:44 et 12:01.',
			'Côté Cloudflare : des services du cluster haute disponibilité dépendaient de Kafka et de ClickHouse, qui ne tournaient qu’à PDX-04. Cloudflare avait testé la perte de chacun des deux autres sites, mais « we had never tested fully taking the entire PDX-04 facility offline. » Les nouveaux produits n’avaient pas l’obligation de rejoindre le cluster haute disponibilité avant leur disponibilité générale.',
			'Impact : la panne a duré du 2 novembre 11:44 UTC au 4 novembre 04:25 UTC. La plus grande partie du control plane tournait sur le site de reprise dès 17:57 le 2 novembre. Le trafic du réseau n’a pas été touché, mais les logs de log push de la majeure partie de l’événement n’ont jamais été traités et sont perdus.',
			'Cloudflare a déclaré un « Code Orange » et a mis toute l’ingénierie non critique sur la fiabilité du control plane. Parmi les changements annoncés : plus de dépendance du control plane envers les data centers centraux quand c’est possible, un plan de reprise testé pour chaque produit en disponibilité générale, et des tests de chaos qui retirent entièrement chaque site central.',
			'Le 26 mars 2024, le même site a de nouveau perdu le courant à 14:58 UTC. Cette fois, les API et les dashboards marchaient normalement à 15:05, « all without human intervention » (sans aucune intervention humaine).'
		]
	},
	quiz: [
		{
			q: 'Seul PDX-04 a perdu le courant, et le cluster haute disponibilité tournait aussi dans deux autres data centers. Pourquoi une partie de ce cluster est-elle tombée ?',
			options: [
				'Les deux autres data centers partageaient la même arrivée de courant que PDX-04',
				'Certains de ses services dépendaient de Kafka et ClickHouse, présents seulement à PDX-04',
				'Le cluster a besoin des trois data centers en ligne pour accepter une écriture',
				'Le cluster ne joignait plus ses routeurs, qui étaient tous à PDX-04'
			],
			answer: 1,
			why: 'Le post : Kafka et ClickHouse « were only available in PDX-04 but had services that depended on them that were running in the high availability cluster ». Un service du cluster qui appelle un service présent seulement à PDX-04 tombe avec PDX-04.'
		},
		{
			q: 'Cloudflare avait déjà testé son cluster haute disponibilité. Quel test aurait révélé ces dépendances ?',
			options: [
				'Couper chacun des deux autres data centers',
				'Couper la partie haute disponibilité de PDX-04',
				'Couper le site PDX-04 en entier',
				'Basculer le control plane vers l’Europe'
			],
			answer: 2,
			why: 'Les deux premiers tests avaient été faits. Couper seulement la partie haute disponibilité de PDX-04 laissait tourner Kafka et ClickHouse, donc les services qui en dépendaient continuaient de marcher pendant le test.'
		},
		{
			q: 'Ton API est en panne depuis deux heures et les clients ont continué de réessayer. Tu vas la démarrer sur de nouveaux serveurs. Que prépares-tu ?',
			options: [
				'Rien de spécial, puisque les serveurs sont neufs et vides',
				'Des limites de débit, car toutes les requêtes en attente peuvent arriver d’un coup',
				'Un plus grand pool de connexions à la base, réglé avant le démarrage',
				'Un changement DNS pour que les clients trouvent les serveurs petit à petit'
			],
			answer: 1,
			why: 'Quand Cloudflare a démarré ses services en Europe, « the API calls that had been failing overwhelmed our services ». Les limites de débit ont ramené le volume de requêtes à ce que les services pouvaient traiter.'
		}
	],
	recall: {
		q: 'Pourquoi une partie du cluster haute disponibilité de Cloudflare est-elle tombée quand PDX-04 a perdu le courant le 2 novembre 2023 ?',
		a: 'Elle dépendait de Kafka et de ClickHouse, qui ne tournaient qu’à PDX-04. Cloudflare n’avait jamais testé la perte du site PDX-04 en entier, donc personne n’avait vu ces dépendances.'
	},
	sources: [
		{ title: 'Blog Cloudflare, Post mortem on the Cloudflare Control Plane and Analytics Outage (4 novembre 2023)', url: PM },
		{ title: 'Blog Cloudflare, Major data center power failure (again): Cloudflare Code Orange tested (2024)', url: 'https://blog.cloudflare.com/major-data-center-power-failure-again-cloudflare-code-orange-tested/' }
	]
};
