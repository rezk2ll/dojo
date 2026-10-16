const POST = 'https://blog.sentry.io/transaction-id-wraparound-in-postgres/';
const DOCS = 'https://www.postgresql.org/docs/9.4/routine-vacuuming.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sentry-wraparound-2015',
	part: 'Les données',
	title: 'Sentry 2015 : le wraparound des identifiants de transaction PostgreSQL',
	minutes: 10,
	hook: [
		'Lundi 20 juillet 2015, heures de bureau aux États-Unis. La base PostgreSQL principale du Sentry hébergé refuse toute écriture.',
		'Sentry écrit énormément : chaque événement reçu demande au moins une ligne dans Postgres. Les événements continuent d’arriver dans la file, et aucun ne peut être enregistré.',
		'Tu fais partie de l’équipe Sentry. Les lectures marchent encore, mais chaque écriture échoue.'
	],
	terms: [
		{ term: 'XID', def: 'Un identifiant de transaction PostgreSQL : un compteur sur 32 bits que Postgres compare pour décider quelles versions de lignes une transaction peut voir.' },
		{ term: 'Wraparound des XID', def: 'Le compteur de XID repasse à zéro, et des lignes écrites dans le passé semblent tout à coup venir du futur.' },
		{ term: 'VACUUM', def: 'La commande de maintenance de Postgres qui, entre autres, marque les vieilles lignes comme gelées pour qu’elles restent visibles après le wraparound. Autovacuum la lance tout seul.' },
		{ term: 'Mode mono-utilisateur', def: 'Une façon de démarrer le serveur Postgres hors du fonctionnement normal. L’arrêt de protection contre le wraparound ne s’y applique pas : la doc demande d’y lancer VACUUM.' }
	],
	incident: {
		org: 'Sentry',
		title: 'Transaction ID Wraparound in Postgres',
		date: '2015-07-20',
		url: POST,
		steps: [
			{
				situation: [
					'L’équipe trouve la cause : la protection contre le wraparound des XID s’est déclenchée. Postgres refuse les commandes quand il reste moins d’un million de transactions avant le XID maximal.',
					'Sentry vient d’installer de nouvelles machines de base de données, avec beaucoup plus de mémoire et de CPU réservés à la maintenance, comme le vacuum.'
				],
				q: 'Où lances-tu le vacuum ?',
				options: [
					'Tu bascules le primaire sur le nouveau matériel et y fais le vacuum',
					'Tu restaures la sauvegarde de la nuit sur l’ancien primaire',
					'Tu ajoutes des réplicas en lecture et attends que le trafic baisse',
					'Tu gardes l’ancien primaire et fais le vacuum table par table'
				],
				answer: 0,
				why: '« Immediately when we identified the XID issue we had failed the primary master over to the new hardware, which is where we’d been running the vacuums. » Les nouvelles machines avaient la mémoire et le CPU en plus dont le vacuum avait besoin.'
			},
			{
				situation: [
					'Postgres fait déjà tourner des autovacuums sur les grosses tables. Personne ne sait si un VACUUM peut reprendre après un redémarrage, ni combien de temps ils vont durer.',
					'Le conseil habituel : arrêter la base et la relancer en mode mono-utilisateur. Un redémarrage permettrait aussi de donner 100 Go de mémoire en plus à la maintenance.'
				],
				q: 'Que fais-tu des autovacuums en cours ?',
				options: [
					'Tu redémarres tout de suite en mode mono-utilisateur, comme le dit la doc',
					'Tu laisses finir les autovacuums en cours avec la configuration actuelle',
					'Tu redémarres avec 100 Go de mémoire de maintenance en plus',
					'Tu les tues et lances un VACUUM manuel table par table'
				],
				answer: 1,
				why: 'Sentry a parié qu’il « was better to let autovacuum finish with our current configuration than to risk interrupting it », de peur qu’un redémarrage allonge la panne. Deux jours plus tard, une machine de test sur l’ancien matériel faisait encore tourner un vacuum en mode mono-utilisateur depuis près de 24 heures.'
			},
			{
				situation: [
					'L’application lit sur les réplicas : les utilisateurs voient leurs données, mais rien de neuf n’entre. La file d’événements en attente grossit, et les buffers Redis débordent.'
				],
				q: 'Que fais-tu de la file en attente ?',
				options: [
					'Tu continues à stocker jusqu’au retour des écritures',
					'Tu ajoutes de la mémoire à Redis pour laisser grossir les buffers',
					'Tu écris les événements en attente sur les réplicas',
					'Tu vides toute la file d’événements en attente'
				],
				answer: 3,
				why: 'L’équipe a « decided to flush the entire backlog of events » pour éviter que la file et Redis tombent à leur tour. Les événements vidés ont été abandonnés. Les réplicas sont en lecture seule : ils ne peuvent pas prendre les écritures.'
			},
			{
				situation: [
					'Près de 3 heures plus tard. Les autovacuums sont finis, les logs ne montrent aucun échec, et Postgres refuse toujours les écritures.',
					'Les statistiques internes de Postgres montrent que toutes les relations sont passées au vacuum sauf une. C’est une table énorme qui relie chaque événement à son rollup, et qui sert seulement à retrouver un événement par son ID et à repérer les doublons.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Tu redémarres en mode mono-utilisateur et fais le vacuum de cette table',
					'Tu restaures cette table depuis un réplica et relances le vacuum',
					'Tu vides cette table avec TRUNCATE et acceptes de perdre ses lignes',
					'Tu attends qu’autovacuum reprenne cette table'
				],
				answer: 2,
				why: 'Sentry « made the call to truncate the table. Five minutes later, the system was fully restored. » La table ne servait qu’à des fonctions non critiques, et les réplicas en gardaient une copie complète.'
			},
			{
				situation: [
					'Postgres accepte de nouveau les écritures. Avant la panne, Sentry tournait avec un autovacuum_freeze_max_age trop haut, les 3 workers d’autovacuum par défaut, et une longue pause entre les étapes du vacuum.'
				],
				q: 'Que changes-tu dans la configuration ?',
				options: [
					'Tu coupes autovacuum et fais le vacuum à la main la nuit',
					'Tu baisses autovacuum_freeze_max_age et passes à 6 workers sans pause',
					'Tu montes autovacuum_freeze_max_age pour forcer moins de vacuums',
					'Tu allonges la pause pour que autovacuum charge moins le système'
				],
				answer: 1,
				why: 'Les nouveaux réglages : autovacuum_freeze_max_age = 500000000, autovacuum_max_workers = 6, autovacuum_naptime = \'15s\', autovacuum_vacuum_cost_delay = 0 et maintenance_work_mem = \'10GB\'. Le billet qualifie de « awful advice » le fait de couper autovacuum ou de le lancer aux heures creuses.'
			}
		],
		outcome: [
			'Chaque transaction qui écrit des lignes prend un nouveau XID sur un compteur de 32 bits. Postgres doit passer le vacuum sur chaque table au moins une fois tous les deux milliards de transactions pour geler les vieilles lignes. Les écritures de Sentry consommaient les XID plus vite qu’autovacuum ne gelait ses plus grosses tables.',
			'Quand il est resté moins d’un million de XID, Postgres a refusé les commandes. Le Sentry hébergé a été en panne la plus grande partie de la journée de travail américaine du 20 juillet 2015, et les événements en attente ont été vidés.',
			'Les écritures sont revenues cinq minutes après que l’équipe a vidé la seule table qu’autovacuum n’avait pas terminée. Les correctifs : un nouveau matériel avec 256 Go de mémoire, dont la moitié ajoutée pour le vacuum, un autovacuum réglé plus agressif, et un projet de répartir les relations sur plusieurs bases.'
		]
	},
	quiz: [
		{
			q: 'Que fait PostgreSQL quand il reste moins d’un million de XID avant le wraparound ?',
			options: [
				'Il repasse le compteur à zéro et continue',
				'Il refuse les commandes jusqu’à ce que la base passe au vacuum',
				'Il lance un autovacuum et continue d’écrire au ralenti',
				'Il bascule la base sur un nouveau compteur de 64 bits'
			],
			answer: 1,
			why: 'Postgres refuse les commandes pour que de vieilles lignes n’apparaissent jamais « in the future ». Selon la doc, l’erreur dit « database is not accepting commands to avoid wraparound data loss », et la réparation passe par VACUUM en mode mono-utilisateur.'
		},
		{
			q: 'Comment VACUUM protège-t-il les vieilles lignes du wraparound ?',
			options: [
				'Il les recopie dans une nouvelle table avec des XID neufs',
				'Il supprime les lignes de plus de deux milliards de transactions',
				'Il les marque gelées, donc plus vieilles que tout XID normal',
				'Il remet à zéro le compteur de XID de tout le cluster'
			],
			answer: 2,
			why: 'Une ligne gelée compte comme écrite par FrozenTransactionId, qui « is always considered older than every normal XID ». Elle reste visible pour toutes les transactions, quelle que soit la position du compteur.'
		},
		{
			q: 'Pourquoi Sentry pouvait-il vider la dernière table sans vacuum avec peu de risque ?',
			options: [
				'La table servait seulement aux recherches par ID et aux doublons',
				'Postgres garde une copie des tables vidées pendant 24 heures',
				'La table était vide après le vidage de la file',
				'Autovacuum avait déjà gelé la plupart de ses lignes'
			],
			answer: 0,
			why: 'La table reliait les événements à leurs rollups et servait seulement à retrouver un événement par ID et à repérer les doublons. Ces fonctions n’étaient pas critiques, et les réplicas gardaient des copies complètes.'
		}
	],
	recall: {
		q: 'Comment Sentry a-t-il retrouvé ses écritures le 20 juillet 2015 ?',
		a: 'L’équipe a vidé avec TRUNCATE la seule table énorme qu’autovacuum n’avait pas finie, celle qui relie les événements aux rollups. Cinq minutes plus tard tout était rétabli, après près de 3 heures d’attente sur autovacuum.'
	},
	sources: [
		{ title: 'Sentry, Transaction ID Wraparound in Postgres', url: POST },
		{ title: 'Documentation PostgreSQL 9.4, Routine Vacuuming (prévenir le wraparound des XID)', url: DOCS }
	]
};
