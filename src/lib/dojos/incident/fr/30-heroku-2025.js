const PM = 'https://www.heroku.com/blog/summary-of-june-10-outage/';
const STATUS = 'https://status.heroku.com/incidents/2822';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'heroku-2025',
	part: 'Capacité et effets en cascade',
	title: 'Heroku 2025 : la mise à jour système qui a coupé le réseau des dynos',
	minutes: 10,
	hook: [
		'Mardi 10 juin 2025, 06:00 UTC. Tu es d’astreinte chez Heroku. Des clients signalent que la connexion à Heroku ne marche que par intermittence.',
		'Ton monitoring détecte des erreurs réseau sur les dynos un peu partout. Des applis clientes commencent à tomber.',
		'Tes propres outils internes sont touchés eux aussi, tout comme la Heroku Status Page.'
	],
	terms: [
		{ term: 'Dyno', def: 'Un conteneur Heroku où tourne le code d’une appli.' },
		{ term: 'Private Space', def: 'Un environnement Heroku dédié qui fait tourner des dynos et certains add-ons dans un réseau isolé.' },
		{ term: 'Mise à jour automatique', def: 'Une mise à jour de paquet du système d’exploitation qu’un hôte installe seul, sans qu’un opérateur la lance.' }
	],
	incident: {
		org: 'Heroku',
		title: 'Summary of Heroku June 10 Outage',
		date: '2025-06-10',
		url: PM,
		steps: [
			{
				situation: [
					'08:04. Tu publies le premier message de statut : « Engineers are investigating an issue with the Heroku platform. » Le site Heroku Status tourne sur la même infrastructure que les applis en panne.',
					'Les requêtes vers le site Status expirent, et le site a l’air de n’afficher aucun incident en cours.'
				],
				q: 'Comment tiens-tu les clients au courant ?',
				options: [
					'Tu continues de publier sur le site Status, puisque c’est le canal officiel',
					'Tu publies sur un canal qui ne tourne pas sur ta propre infrastructure',
					'Tu envoies un e-mail à chaque client depuis ton outil interne de notifications',
					'Tu ne publies rien tant que tu ne connais pas la cause'
				],
				answer: 1,
				why: 'La page de statut et les outils internes tournaient sur l’infrastructure touchée, donc « our ability to respond and communicate with you was also severely impaired. » Un moyen de publier sur le compte @herokustatus sur X n’a été trouvé qu’à 13:58, presque 8 heures après le début. Les e-mails de statut du début de l’incident ne sont partis qu’après le retour du service.'
			},
			{
				situation: [
					'08:26. L’enquête confirme le cœur du problème : la plupart des dynos des Private Spaces ne peuvent plus faire de requêtes HTTP sortantes.',
					'La cause peut venir d’un fournisseur en amont ou de ta propre infrastructure. Certains de tes hôtes vont bien, d’autres non.'
				],
				q: 'Où regardes-tu maintenant ?',
				options: [
					'Tu ouvres un ticket chez le fournisseur en amont et tu attends sa réponse',
					'Tu compares un hôte sain avec un hôte malade',
					'Tu annules le dernier déploiement Heroku sur tous les hôtes',
					'Tu recycles tout de suite tous les dynos de la flotte'
				],
				answer: 1,
				why: 'L’équipe a établi que ce n’était « not an upstream provider issue », mais une panne dans l’infrastructure de Heroku. En comparant hôtes sains et malades, les ingénieurs ont trouvé des routes réseau manquantes à 11:54.'
			},
			{
				situation: [
					'11:54. Les hôtes malades n’ont plus certaines routes réseau. Sans elles, les dynos de ces hôtes n’ont plus de connexion sortante.',
					'Tu ne sais pas encore ce qui a supprimé ces routes.'
				],
				q: 'Que fais-tu maintenant ?',
				options: [
					'Tu remets les routes à la main sur chaque hôte et tu fermes l’incident',
					'Tu cherches ce qui a supprimé les routes, en redémarrant les hôtes tour à tour',
					'Tu remplaces chaque hôte malade par un hôte tout neuf',
					'Tu attends de voir si les routes reviennent toutes seules'
				],
				answer: 1,
				why: 'À 12:56, l’équipe a lancé des redémarrages tournants des instances internes, ce qui a « provided some relief ». À 13:11, elle a appris un redémarrage inattendu du service réseau, et à 13:42 elle a trouvé le déclencheur : « an automated upgrade of a system package ».'
			},
			{
				situation: [
					'13:42. Une mise à jour automatique du système d’exploitation a tourné sur les hôtes de production, alors qu’elle aurait dû être désactivée. Elle a redémarré le service réseau des hôtes.',
					'Un vieux script n’applique les bonnes routes qu’au premier démarrage, donc après le redémarrage les routes manquent. Les mises à jour automatiques peuvent encore toucher d’autres hôtes.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Tu recycles tous les dynos de la flotte pour remettre les routes',
					'Tu empêches les mises à jour automatiques d’atteindre d’autres hôtes',
					'Tu corriges le vieux script sur chaque hôte pour qu’un redémarrage garde les routes',
					'Tu annules la mise à jour du paquet sur les hôtes déjà touchés'
				],
				answer: 1,
				why: 'Heroku a demandé au fournisseur en amont d’invalider le jeton des mises à jour automatiques. C’était confirmé à 17:30 et terminé à 19:18, « preventing any further hosts from being impacted. » C’est seulement ensuite, à 22:01, que l’équipe a lancé un recyclage de tous les dynos.'
			},
			{
				situation: [
					'21:54. Le Heroku Dashboard remarche. Certains clients ont encore des applis en panne.',
					'Les clients peuvent voir et arrêter leurs propres dynos avec la CLI Heroku : `heroku ps` et `heroku ps:stop`.'
				],
				q: 'Que dis-tu aux clients encore touchés ?',
				options: [
					'Redémarrez tous vos dynos d’un coup pour avoir le correctif vite',
					'Redémarrez vos dynos un par un',
					'Attendez le recyclage général sans rien changer',
					'Supprimez l’appli et redéployez-la de zéro'
				],
				answer: 1,
				why: 'Le message de statut de 21:54 donnait les deux commandes et précisait : « dynos should be restarted one at a time to avoid a service disruption. » Le recyclage général a démarré à 22:01, et l’incident a été déclaré résolu le 11 juin à 05:50.'
			}
		],
		outcome: [
			'Cause : une mise à jour automatique du système d’exploitation a tourné sur la production « when it should have been disabled ». Elle a redémarré le service réseau des hôtes. Un vieux script n’appliquait les bonnes routes qu’au tout premier démarrage, donc ce redémarrage a coupé la connexion sortante de tous les dynos de l’hôte.',
			'Impact : à partir du 10 juin 06:00 UTC, beaucoup de clients ont eu jusqu’à 24 heures de panne. Heroku précise que ce n’était pas un incident de sécurité et qu’aucune donnée client n’a été perdue. La Status Page tournait sur la même infrastructure, donc les messages sont arrivés tard.',
			'Correctifs annoncés en juin : couper le service de mise à jour automatique, ne plus faire aucun changement système hors du processus de déploiement contrôlé, et corriger le routage réseau pour qu’il supporte un redémarrage propre des services. Heroku prévoit aussi des canaux de communication de secours indépendants et des outils plus rapides pour diagnostiquer et réparer.',
			'Le point d’étape de septembre annonce : un arrêt définitif des mises à jour système automatiques du fournisseur, des scripts de démarrage automatiques pour les services réseau, un cache CDN devant le site Status, et le passage de la communication d’incident sur le site Salesforce Trust.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi un seul redémarrage du service réseau a-t-il coupé les dynos d’un hôte ?',
			options: [
				'Le redémarrage a vidé le cache DNS de l’hôte et les dynos ne résolvaient plus les noms',
				'Les routes venaient d’un script qui ne tourne qu’au premier démarrage',
				'Le redémarrage a changé l’adresse IP de l’hôte et cassé la Private Space',
				'Le paquet mis à jour a retiré le pilote réseau de l’hôte'
			],
			answer: 1,
			why: 'Le service réseau « relied on a legacy script that only applied correct routing rules on initial boot. » Quand le service a redémarré, rien n’a réappliqué les routes, donc les dynos ont perdu leur connexion sortante.'
		},
		{
			q: 'Pourquoi arrêter les mises à jour automatiques passait-il avant le recyclage de tous les dynos ?',
			options: [
				'Le recyclage avait besoin du jeton des mises à jour pour tourner',
				'Tant que les mises à jour tournaient, d’autres hôtes perdaient leurs routes',
				'Le fournisseur interdisait un recyclage pendant une mise à jour',
				'Le recyclage devait attendre le retour du Dashboard'
			],
			answer: 1,
			why: 'Chaque mise à jour automatique redémarrait le réseau d’un nouvel hôte et lui retirait ses routes. L’invalidation du jeton, terminée à 19:18, a empêché « any further hosts from being impacted » ; le recyclage de 22:01 a ensuite réparé les hôtes déjà touchés.'
		},
		{
			q: 'Tes serveurs tournent sous Ubuntu avec les mises à jour automatiques des paquets activées. Que te pousse à vérifier d’abord cet incident ?',
			options: [
				'Que chaque journal de mise à jour part vers ton serveur de logs central',
				'Qu’aucune mise à jour ne peut changer un hôte de production hors d’un déploiement',
				'Que les mises à jour ne tournent que la nuit, quand le trafic est faible',
				'Que chaque mise à jour télécharge ses paquets depuis un miroir que tu héberges'
			],
			answer: 1,
			why: 'La cause chez Heroku était « an unexpected change to our running environment », et le correctif dit : « No system changes will occur outside our controlled deployment process ». Une mise à jour faite la nuit aurait quand même redémarré le réseau et supprimé les routes.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a coupé le réseau sortant des dynos Heroku le 10 juin 2025 ?',
		a: 'Une mise à jour automatique du système, qui aurait dû être désactivée, a redémarré le service réseau des hôtes. Un vieux script ne posait les routes qu’au premier démarrage, donc après ce redémarrage les dynos n’avaient plus de routes sortantes.'
	},
	sources: [
		{ title: 'Blog Heroku, Summary of Heroku June 10 Outage (15 juin 2025)', url: PM },
		{ title: 'Heroku Status, incident 2822 : Investigating an issue with access to Heroku services', url: STATUS },
		{ title: 'Blog Heroku, Corrective Action Update for the Heroku June 10th Outage (5 septembre 2025)', url: 'https://www.heroku.com/blog/corrective-action-update-june-10-outage/' },
		{ title: 'Heroku Dev Center, Private Spaces', url: 'https://devcenter.heroku.com/articles/private-spaces' }
	]
};
