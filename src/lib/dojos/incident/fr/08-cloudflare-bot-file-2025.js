const POST = 'https://blog.cloudflare.com/18-november-2025-outage/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cloudflare-bot-file-2025',
	part: 'Changements et configuration',
	title: 'Cloudflare 2025 : le fichier de features de Bot Management qui a doublé',
	minutes: 10,
	hook: [
		'Mardi 18 novembre 2025, 11:28 UTC. Les visiteurs des sites derrière Cloudflare reçoivent une page d’erreur qui signale une panne dans le réseau de Cloudflare.',
		'À 11:31, un test automatique repère le problème. À 11:32, des ingénieurs commencent à chercher, et à 11:35 l’appel d’incident s’ouvre. Tu y es.',
		'Le taux d’erreurs HTTP 5xx sur tout le réseau grimpe bien au-dessus de son niveau habituel.'
	],
	terms: [
		{ term: 'Core proxy', def: 'Le système de Cloudflare, appelé FL et FL2 dans sa nouvelle version, par lequel passe chaque requête. Bot Management fait partie des modules qu’il exécute.' },
		{ term: 'Fichier de features', def: 'Le fichier de configuration qui liste les features (traits d’une requête) utilisées par le modèle de Bot Management. Il est régénéré toutes les quelques minutes et envoyé à chaque machine.' },
		{ term: 'Table distribuée', def: 'Une table ClickHouse de la base default qui interroge les tables sous-jacentes, stockées dans la base r0 sur chaque shard.' },
		{ term: 'Panic', def: 'En Rust, l’arrêt brutal du thread en cours. Appeler unwrap() sur un Result qui contient un Err en déclenche un.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare outage on November 18, 2025',
		date: '2025-11-18',
		url: POST,
		steps: [
			{
				situation: [
					'Peu après 11:32 UTC. Les erreurs 5xx montent en flèche, puis le réseau se rétablit un moment, puis retombe. Ce va-et-vient est inhabituel pour une erreur interne.',
					'La page de statut de Cloudflare, hébergée hors de l’infrastructure Cloudflare, est aussi en panne. Cloudflare a subi récemment une série de grosses attaques DDoS Aisuru.'
				],
				q: 'Sur quoi travailles-tu en premier ?',
				options: [
					'Tu traites ça comme un DDoS et durcis le filtrage du trafic',
					'Tu listes chaque changement déployé depuis 11:00 et ce qu’il touche',
					'Tu déplaces la page de statut chez un autre hébergeur',
					'Tu attends la prochaine période calme pour lire des logs propres'
				],
				answer: 1,
				why: 'Le va-et-vient et la page de statut ont « led us to believe this might be caused by an attack ». La panne de la page de statut « turned out to be a coincidence ». Un changement de permissions dans une base était parti à 11:05, et l’équipe n’a été sûre du déclencheur qu’à 13:37.'
			},
			{
				situation: [
					'Plus tard, avant 13:05 UTC. Workers KV renvoie beaucoup d’erreurs 5xx, et Access et le dashboard en dépendent. L’équipe a essayé de manipuler le trafic et de limiter des comptes sur Workers KV, sans effet sur les erreurs.',
					'Les requêtes vers le front end de Workers KV passent par le core proxy. Une ancienne version du core proxy est moins touchée.'
				],
				q: 'Comment réduis-tu les dégâts pour Workers KV et Access ?',
				options: [
					'Tu limites plus de comptes jusqu’à ce que les erreurs baissent',
					'Tu ajoutes de la capacité à Workers KV pour absorber les essais',
					'Tu contournes le nouveau proxy et repasses sur l’ancienne version',
					'Tu redémarres une par une les passerelles de Workers KV'
				],
				answer: 2,
				why: 'À 13:05, l’équipe a utilisé des contournements internes pour que Workers KV et Access « fell back to a prior version of our core proxy ». Le bug existait dans les deux versions, mais l’ancienne était moins touchée. Les erreurs de Workers KV venaient du proxy : limiter des comptes n’y changeait rien.'
			},
			{
				situation: [
					'13:37 UTC. L’équipe est sûre que le déclencheur est le fichier de features de Bot Management. Une nouvelle copie est générée toutes les cinq minutes et envoyée à tout le réseau.',
					'Le proxy échoue après avoir chargé le nouveau fichier.'
				],
				q: 'Quel est le moyen le plus rapide d’arrêter les erreurs ?',
				options: [
					'Tu bloques les nouveaux fichiers et pousses le dernier bon fichier',
					'Tu corriges la requête et attends le prochain fichier généré',
					'Tu ramènes chaque proxy au binaire du mois dernier',
					'Tu modifies à la main le fichier actuel sur chaque machine'
				],
				answer: 0,
				why: 'À 14:24, l’équipe a « stopped automatic deployment of new Bot Management configuration files » et testé un ancien fichier. À 14:30, un fichier correct était déployé partout et le trafic principal passait de nouveau. Un nouveau fichier toutes les cinq minutes aurait écrasé toute réparation isolée.'
			},
			{
				situation: [
					'14:40 UTC. Le trafic principal passe de nouveau. Les utilisateurs bloqués tentent tous de se connecter au dashboard en même temps, et leurs clients réessaient.',
					'La latence du dashboard monte et sa disponibilité baisse.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Tu remets une seconde fois l’ancien fichier de features',
					'Tu augmentes la concurrence du control plane',
					'Tu retires Turnstile de la page de connexion',
					'Tu demandes aux utilisateurs d’attendre une heure'
				],
				answer: 1,
				why: 'La file de connexions en attente plus les nouveaux essais ont causé la seconde baisse du dashboard. « Scaling control plane concurrency restored availability at approximately 15:30. » Le fichier de features était déjà correct à ce moment-là.'
			},
			{
				situation: [
					'17:06 UTC. Tous les services sont revenus. Les lignes en double ont fait passer le fichier au-delà de la limite de 200 features du proxy, et FL2 a paniqué sur une erreur non gérée.'
				],
				q: 'Que changes-tu pour qu’un mauvais fichier ne fasse plus tomber le proxy ?',
				options: [
					'Tu passes la limite de 200 à 400 features',
					'Tu ajoutes un filtre sur le nom de base à cette requête',
					'Tu valides les fichiers internes comme une saisie utilisateur',
					'Tu régénères le fichier de features une fois par jour'
				],
				answer: 2,
				why: 'Le premier correctif annoncé : « Hardening ingestion of Cloudflare-generated configuration files in the same way we would for user-generated input ». Une limite plus haute ou un filtre dans la requête ne couvrent que ce mauvais fichier-là. Un fichier quotidien empêcherait Bot Management de réagir en quelques minutes à de nouvelles attaques de bots.'
			}
		],
		outcome: [
			'À 11:05, Cloudflare a modifié les permissions ClickHouse pour que les utilisateurs voient les métadonnées des tables r0 qu’ils pouvaient déjà interroger. La requête du fichier de features lisait system.columns sans filtrer sur le nom de base : elle recevait désormais chaque colonne deux fois, une pour default et une pour r0.',
			'Le fichier a plus que doublé et dépassé 200 features, la limite pour laquelle le proxy préalloue sa mémoire. Sur FL2, la vérification a fini en « called Result::unwrap() on an Err value » et en 5xx pour tout le trafic qui passait par le module bots. Sur l’ancien proxy FL, tous les scores de bots valaient zéro : les clients qui bloquaient les bots ont eu des faux positifs.',
			'Le cluster ClickHouse était mis à jour petit à petit : chaque génération toutes les cinq minutes donnait un bon ou un mauvais fichier. Le réseau se rétablissait puis retombait, jusqu’à ce que tous les nœuds produisent le mauvais fichier. Le trafic principal est revenu à 14:30 et tous les services à 17:06. Cloudflare parle de sa pire panne depuis 2019.',
			'Les correctifs annoncés : valider les fichiers de configuration générés en interne comme une saisie utilisateur, ajouter des kill switches globaux par fonctionnalité, empêcher les core dumps et rapports d’erreur d’épuiser les ressources, et revoir la gestion d’erreur de chaque module du core proxy.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi le réseau se rétablissait-il puis retombait-il pendant les deux premières heures ?',
			options: [
				'Un attaquant allumait et coupait son flot de trafic',
				'Chaque génération tombait sur un nœud ClickHouse mis à jour ou pas encore',
				'Le proxy redémarrait toutes les quelques minutes sur un fichier en cache',
				'La panne de la page de statut cachait les périodes de retour'
			],
			answer: 1,
			why: 'Le changement de permissions arrivait petit à petit sur le cluster ClickHouse. « Bad data was only generated if the query ran on a part of the cluster which had been updated » : toutes les cinq minutes partait un bon ou un mauvais fichier, jusqu’à la mise à jour de tous les nœuds.'
		},
		{
			q: 'Pourquoi la requête du fichier de features a-t-elle renvoyé des lignes en double après le changement de 11:05 ?',
			options: [
				'Elle lisait system.columns sans filtrer sur le nom de base',
				'ClickHouse répliquait deux fois la table http_requests_features',
				'Deux copies du job de génération tournaient en même temps',
				'Les nouvelles permissions ont abîmé les métadonnées des colonnes'
			],
			answer: 0,
			why: 'La requête filtrait seulement sur table = \'http_requests_features\'. Dès que les utilisateurs ont vu les métadonnées des tables r0, system.columns a renvoyé chaque colonne pour default et pour r0, soit plus du double de lignes.'
		},
		{
			q: 'Pourquoi un seul mauvais fichier a-t-il fait tomber le proxy au lieu de dégrader seulement les scores de bots ?',
			options: [
				'Le fichier était signé avec une clé expirée',
				'Bot Management tournait sur des machines sans place disque',
				'FL2 a dépassé la limite de 200 et appelé unwrap() sur l’erreur',
				'Le fichier était trop gros pour le cache du réseau'
			],
			answer: 2,
			why: 'Bot Management préalloue la mémoire pour 200 features au plus. Le code FL2 transformait l’erreur de limite en panic avec unwrap() : chaque requête qui passait par le module bots recevait un 5xx.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a fait doubler le fichier de features de Bot Management le 18 novembre 2025 ?',
		a: 'Un changement de permissions ClickHouse à 11:05 UTC a laissé la requête sur system.columns voir aussi les tables r0. Sans filtre sur le nom de base, elle renvoyait chaque feature deux fois et le fichier dépassait la limite de 200 features.'
	},
	sources: [
		{ title: 'Cloudflare, Cloudflare outage on November 18, 2025', url: POST },
		{ title: 'The Rust Programming Language, Recoverable Errors with Result (unwrap)', url: 'https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html' }
	]
};
