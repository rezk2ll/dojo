const PM = 'https://mailchimp.com/what-we-learned-from-the-recent-mandrill-outage/';
const PG = 'https://www.postgresql.org/docs/18/routine-vacuuming.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'mandrill-2019',
	part: 'Les données',
	title: 'Mandrill 2019 : le shard qui n’acceptait plus d’écritures',
	minutes: 10,
	hook: [
		'Lundi 4 février 2019. Mandrill est le service d’e-mails transactionnels de Mailchimp : réinitialisations de mot de passe, reçus, confirmations de commande que des applis envoient par une API.',
		'À 05:35 UTC, une exception arrive dans le système central de rapports d’erreurs. Pendant la nuit, d’autres systèmes y envoient aussi leurs exceptions, et personne ne remarque celle-ci.',
		'Mandrill range ses données dans plusieurs bases PostgreSQL qui forment un seul stockage clé/valeur, réparti par clé. En fin de matinée, l’une d’elles, shard4, subit une charge bien plus forte que d’habitude.'
	],
	terms: [
		{ term: 'Identifiant de transaction (XID)', def: 'Un compteur sur 32 bits que PostgreSQL attribue à chaque écriture. Chaque ligne garde le XID qui l’a écrite, et les règles de visibilité comparent les XID.' },
		{ term: 'Wraparound', def: 'Après environ 2 milliards de nouveaux XID, un vieux XID semblerait être dans le futur. PostgreSQL cesse d’attribuer des XID avant d’en arriver là.' },
		{ term: 'VACUUM', def: 'La commande PostgreSQL qui, entre autres, marque les vieilles lignes comme gelées : leur XID ne compte plus. L’autovacuum la lance en tâche de fond.' },
		{ term: 'Shard', def: 'Une base parmi plusieurs, qui contient une partie des clés. Chez Mandrill, un algorithme de hachage choisit le shard de chaque clé.' }
	],
	incident: {
		org: 'Mailchimp',
		title: 'What We Learned from the Recent Mandrill Outage',
		date: '2019-02-04',
		url: PM,
		steps: [
			{
				situation: [
					'11:58 UTC. Les ingénieurs de Mandrill ouvrent une investigation. Les écritures vers shard4 échouent, les applis les réessaient, et la charge sur shard4 ne cesse de monter.',
					'La première exception date de plus de 6 heures, à 05:35, au milieu d’exceptions sans rapport venues d’autres systèmes.'
				],
				q: 'Que regardes-tu en premier ?',
				options: [
					'L’erreur que shard4 renvoie à une écriture ratée',
					'Les plans d’exécution des requêtes les plus lentes sur shard4',
					'Les graphes CPU des serveurs applicatifs de Mandrill',
					'Le journal des déploiements depuis vendredi'
				],
				answer: 0,
				why: 'Les nouvelles tentatives sont un symptôme : elles existent parce que les écritures échouent. L’équipe a d’abord passé une heure sur la charge : "responders began looking for the source of the spiking load. An hour later, at 12:56 UTC, the wraparound was discovered."'
			},
			{
				situation: [
					'12:56 UTC. Shard4 a atteint la limite des XID à 05:35 et s’est mis dans ce que le postmortem appelle le "safety shutdown mode". Il refuse toute commande qui demande un nouveau XID : plus aucune écriture ne passe.',
					'Les autres shards fonctionnent. Les jobs qui doivent écrire dans shard4 échouent.'
				],
				q: 'Comment remets-tu shard4 en service ?',
				options: [
					'Le passer en mode autonome et lancer VACUUM',
					'Redémarrer PostgreSQL pour sortir de l’arrêt',
					'Effacer de vieilles lignes avec DELETE pour libérer des XID',
					'Restaurer la sauvegarde de la nuit sur un nouveau serveur'
				],
				answer: 0,
				why: 'Le postmortem : "it needs to be put into standalone mode and cleaned using the VACUUM command." Un redémarrage garde les mêmes vieux XID sur disque, et un DELETE est une écriture qui demande un XID. L’équipe a lancé le vacuum à 14:16 UTC.'
			},
			{
				situation: [
					'Le vacuum tourne. L’équipe l’arrête, le relance avec des réglages qui l’accélèrent, puis refait l’estimation. Il faut encore des jours ou des semaines, et l’estimation la plus haute est de 40 jours.',
					'Deux tables, Search et Url, pèsent de l’ordre du téraoctet. La plupart des autres tables font quelques mégaoctets.'
				],
				q: 'Que lances-tu pendant que le vacuum tourne ?',
				options: [
					'Un dump et une restauration de shard4 sans Search ni Url',
					'Un second VACUUM sur les mêmes tables en parallèle',
					'Un dump et une restauration de toutes les tables de shard4',
					'Rien : laisser tourner le vacuum et publier des points'
				],
				answer: 0,
				why: 'Un dump suivi d’une restauration écrit une nouvelle copie des données, avec des XID neufs. L’équipe en a lancé un à côté du vacuum et a laissé de côté les tables Search et Url pour aller plus vite, mais l’opération "was still disastrously slow".'
			},
			{
				situation: [
					'Les jobs qui n’arrivent pas à écrire dans shard4 se mettent en file sur le disque des serveurs applicatifs. Ces jobs et les logs de leurs échecs remplissent les disques, et l’espace manque sur chaque serveur applicatif.',
					'Mandrill écrit ses logs sur un disque local, sur chaque serveur.'
				],
				q: 'Que fais-tu pour les disques ?',
				options: [
					'Remplacer les volumes de stockage des serveurs',
					'Effacer les jobs en file sur disque pour gagner de la place',
					'Couper les logs jusqu’au retour de shard4',
					'Ne rien faire : les jobs partiront au retour de shard4'
				],
				answer: 0,
				why: 'Les jobs en file sont des e-mails que les clients attendent, et les logs sont ce qui montre les échecs à l’équipe. L’équipe a ouvert "a separate track of work to replace storage volumes across app servers". Le cloud lui a permis d’agrandir le stockage vite.'
			},
			{
				situation: [
					'16:30 UTC le 5 février, environ 35 heures après le début. Par défaut, Mandrill supprime les e-mails en file depuis plus de 48 heures. Le vacuum et le dump sont encore loin de la fin.',
					'L’équipe a vérifié que l’appli peut tourner sans les tables Search et Url.'
				],
				q: 'Que fais-tu maintenant ?',
				options: [
					'Vérifier que TRUNCATE libère leurs XID, puis vider les deux',
					'Effacer les lignes de Search et Url par petits lots',
					'Attendre la fin du dump et de la restauration',
					'Monter la limite de 48 heures et laisser tourner le vacuum'
				],
				answer: 0,
				why: 'Le postmortem : "After verifying that this would free the associated XIDs, we decided to truncate the tables." Le TRUNCATE a tourné à 19:12 UTC : "The vacuum completed roughly an hour after the truncation." La doc PostgreSQL cite ce cas comme la seule raison d’utiliser le mode mono-utilisateur face au wraparound : "TRUNCATE or DROP unneeded tables to avoid needing to VACUUM them".'
			}
		],
		outcome: [
			'L’algorithme de hachage qui répartit les clés entre les shards favorisait shard4, qui recevait donc plus d’écritures que les autres. Son autovacuum "likely fell behind due to the higher load, though it may have failed outright". À 05:35 UTC le 4 février, son XID a touché la limite.',
			'L’équipe avait vu le risque. En novembre 2018, les XID montaient "to approximately half their total limit during peak load". Elle a jugé la menace non immédiate et mis un ticket dans le backlog pour ajouter du monitoring.',
			'L’envoi des e-mails en attente a repris à 21:36 UTC le 5 février, et les files étaient revenues à la normale à 01:00 UTC le 6 février. Pendant la panne, Mandrill n’envoyait que 80 % des e-mails en file. Mailchimp a remboursé les achats Mandrill des utilisateurs touchés entre le 1er janvier et le 13 février 2019.',
			'À 22:40 UTC le 5 février, l’équipe avait mis en place une alerte sur le wraparound des XID. La revue liste aussi ce qui a ralenti la réponse : un accès aux systèmes de Mandrill réservé à peu de gens, des logs qui ont besoin d’un disque local inscriptible, des erreurs d’API mêlées aux erreurs de l’appli dans les logs, et peu de visibilité sur la santé des jobs.'
		]
	},
	quiz: [
		{
			q: 'Mandrill avait plusieurs shards avec le même schéma. Pourquoi seul shard4 a-t-il atteint la limite des XID ?',
			options: [
				'Le hachage favorisait shard4 : plus d’écritures, donc des XID consommés plus vite',
				'Shard4 servait le plus de lectures, et chaque lecture consomme un XID',
				'Shard4 tournait sur une vieille version de PostgreSQL au compteur plus petit',
				'L’autovacuum était coupé sur shard4 pour économiser du disque'
			],
			answer: 0,
			why: 'Chaque écriture consomme un XID. Un shard qui reçoit plus d’écritures atteint la limite en premier si l’autovacuum ne suit pas. Shard4 était "hotter than the others", et son autovacuum a pris du retard ou a échoué.'
		},
		{
			q: 'Pourquoi le TRUNCATE de Search et Url a-t-il permis au vacuum de finir en une heure environ ?',
			options: [
				'Il a retiré des téraoctets de lignes à parcourir et à geler',
				'Il remet à zéro le compteur de XID de toute la base',
				'Il a déplacé les deux tables vers un autre shard aux XID libres',
				'Il a mis fin aux longues transactions qui bloquaient le vacuum'
			],
			answer: 0,
			why: 'Le vacuum doit geler chaque vieille ligne avant que le plus vieux XID puisse avancer. Sans les tables d’un téraoctet, il ne restait que des tables de quelques mégaoctets. Le postmortem note que les données effacées "included the largest table holding up the vacuum."'
		},
		{
			q: 'Tu fais tourner PostgreSQL. Quelle requête te dit à quelle distance chaque base est du wraparound ?',
			options: [
				'SELECT datname, age(datfrozenxid) FROM pg_database;',
				'SELECT datname, xact_commit FROM pg_stat_database;',
				'SELECT relname, n_dead_tup FROM pg_stat_user_tables;',
				'SELECT pid, backend_xid FROM pg_stat_activity;'
			],
			answer: 0,
			why: 'La doc : `datfrozenxid` "is a lower bound on the unfrozen XIDs appearing in that database", et `age()` compte les transactions depuis cette valeur. Alerte bien avant 2 milliards : PostgreSQL avertit à 40 millions de transactions de la limite et refuse les nouveaux XID à 3 millions.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a permis au vacuum de shard4 de finir, environ 37 heures après le début de la panne ?',
		a: 'Le TRUNCATE des tables Search et Url, de l’ordre du téraoctet, à 19:12 UTC le 5 février. Le vacuum a fini environ une heure plus tard.'
	},
	sources: [
		{ title: 'Mailchimp : What We Learned from the Recent Mandrill Outage (2019)', url: PM },
		{ title: 'Doc PostgreSQL : Preventing Transaction ID Wraparound Failures', url: PG }
	]
};
