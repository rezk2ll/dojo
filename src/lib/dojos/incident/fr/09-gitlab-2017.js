const POST = 'https://about.gitlab.com/blog/postmortem-of-database-outage-of-january-31/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gitlab-2017',
	part: 'Les données',
	title: 'GitLab 2017 : le répertoire de base de données supprimé',
	minutes: 10,
	hook: [
		'Mardi 31 janvier 2017, vers 19:00 UTC. La charge de la base de GitLab.com grimpe, sans doute à cause de spam. Beaucoup d’utilisateurs n’arrivent plus à commenter les issues et les merge requests.',
		'GitLab.com tourne sur un primaire PostgreSQL, db1.cluster.gitlab.com, et un hot standby, db2.cluster.gitlab.com, qui ne sert qu’au basculement.',
		'Il faut plusieurs heures pour maîtriser la charge. Vers 23:00 UTC, tu fais partie des ingénieurs sur le problème, et le standby prend du retard.'
	],
	terms: [
		{ term: 'Segment WAL', def: 'Un fichier du journal d’écriture anticipée (write-ahead log) de PostgreSQL. Un standby rejoue ces fichiers pour suivre le primaire.' },
		{ term: 'Retard de réplication', def: 'L’écart entre le standby et le primaire, en WAL que le standby n’a pas encore rejoué.' },
		{ term: 'pg_basebackup', def: 'L’outil PostgreSQL qui copie un cluster en marche par une connexion de réplication, pour démarrer un nouveau standby.' },
		{ term: 'Snapshot LVM', def: 'Une copie d’un volume disque à un instant donné, prise par le gestionnaire de volumes de Linux. GitLab s’en servait pour copier la production vers le staging.' }
	],
	incident: {
		org: 'GitLab',
		title: 'Postmortem of database outage of January 31',
		date: '2017-01-31',
		url: POST,
		steps: [
			{
				situation: [
					'23:00 UTC. La réplication vers db2 a échoué : les segments WAL dont db2 a besoin sont déjà supprimés sur db1. GitLab.com n’utilise pas d’archivage des WAL.',
					'db1 sert toujours tout le trafic.'
				],
				q: 'Comment retrouves-tu un standby qui marche ?',
				options: [
					'Tu montes wal_keep_segments sur db1 et attends que db2 rattrape',
					'Tu promeus db2 en primaire et reconstruis db1 en standby',
					'Tu vides le répertoire de données de db2 et copies db1 avec pg_basebackup',
					'Tu copies les WAL manquants depuis l’archive de db1 vers db2'
				],
				answer: 2,
				why: 'La doc PostgreSQL : sans archive, le primaire « might recycle old WAL segments before the standby has received them », et alors « the standby will need to be reinitialized from a new base backup ». Il faut pour cela un répertoire de données vide. Un db2 promu manquerait de données, et il n’y a aucune archive où copier.'
			},
			{
				situation: [
					'Un ingénieur a vidé le répertoire de données de db2. pg_basebackup se bloque sans rien afficher, même avec --verbose. Après quelques essais, il signale que db1 n’a pas assez de connexions de réplication : max_wal_senders vaut 3.',
					'L’équipe passe max_wal_senders à 32. PostgreSQL refuse alors de redémarrer sur db1 et parle de trop de sémaphores. max_connections vaut 8000.'
				],
				q: 'Que changes-tu pour relancer db1 ?',
				options: [
					'Tu remets max_wal_senders à 3 et réessaies',
					'Tu baisses max_connections de 8000 à 2000',
					'Tu redémarres la machine db1 pour libérer les sémaphores',
					'Tu lances pg_basebackup contre db2 au lieu de db1'
				],
				answer: 1,
				why: 'Trop de sémaphores, cela « can happen when, for example, max_connections is set too high ». La valeur 8000 avait été appliquée presque un an plus tôt. Baissée à 2000, elle a laissé PostgreSQL redémarrer « without issues ». Avec 3 senders, pg_basebackup retomberait sur la même erreur de connexion.'
			},
			{
				situation: [
					'23:30 UTC. pg_basebackup reste muet. strace montre qu’il attend dans un appel poll.',
					'Un ingénieur pense que les essais précédents ont laissé des fichiers dans le répertoire de données de db2, et veut le vider encore une fois.'
				],
				q: 'Que fais-tu avant le prochain rm ?',
				options: [
					'Tu le lances tout de suite, db2 ne contient rien d’utile',
					'Tu vides le répertoire sur les deux hôtes pour repartir propre',
					'Tu vérifies le nom d’hôte dans le shell, puis tu vides db2 seulement',
					'Tu redémarres PostgreSQL sur db1 pour couper la connexion bloquée'
				],
				answer: 2,
				why: 'L’ingénieur a vidé le répertoire « errantly thinking they were doing so on the secondary ». La commande a tourné sur db1 et effacé environ 300 Go avant d’être arrêtée une ou deux secondes plus tard. Le silence était normal : pg_basebackup attend que le primaire envoie des données, un comportement que ni les runbooks ni la doc PostgreSQL ne documentaient.'
			},
			{
				situation: [
					'db1 et db2 ont tous deux un répertoire de données vide. Le bucket S3 prévu pour les sauvegardes pg_dump quotidiennes est vide. Les serveurs de base n’ont aucun snapshot de disque.',
					'Il reste deux snapshots LVM : celui du jour pour le staging, vieux de presque 24 heures, et un pris à la main par un ingénieur vers 17:20 UTC.'
				],
				q: 'À partir de quoi restaures-tu ?',
				options: [
					'Le snapshot LVM quotidien pris pour le staging',
					'Le snapshot LVM pris à la main vers 17:20',
					'Les projets reconstruits depuis les dépôts Git',
					'Le dernier fichier pg_dump trouvé sur un portable de développeur'
				],
				answer: 1,
				why: 'L’équipe a pris le snapshot de 6 heures avant la panne, « as it was our only option to reduce data loss as much as possible (the alternative was to lose almost 24 hours of data) ». Les dépôts Git ne contiennent que le code : les projets reconstruits à partir d’eux sont revenus sans issues ni merge requests.'
			},
			{
				situation: [
					'1er février. La copie du staging vers la production prend environ 18 heures : les disques du staging sont bridés à environ 60 Mbps. La copie reflète l’état du 31 janvier à 17:20.',
					'Des utilisateurs ont créé des lignes entre 17:20 et la suppression. Ces lignes sont perdues, mais leurs identifiants avaient déjà été attribués.'
				],
				q: 'Que fais-tu avant de rouvrir GitLab.com ?',
				options: [
					'Tu remets toutes les séquences aux valeurs du snapshot',
					'Tu avances chaque séquence de la base de 100 000',
					'Tu demandes aux utilisateurs de refaire ce qu’ils ont posté après 17:20',
					'Tu rouvres tout de suite et règles les conflits d’ID signalés'
				],
				answer: 1,
				why: 'Le plan de reprise : « Increment all database sequences by 100,000 so one can’t re-use IDs that might have been used before the outage. » L’équipe a aussi restauré les webhooks, que la copie de staging retire, depuis une autre copie du snapshot. Les dernières étapes se sont terminées vers 18:00 UTC le 1er février.'
			}
		],
		outcome: [
			'Un ingénieur a lancé sur le primaire, db1, l’effacement prévu pour le secondaire. Ce qui y a mené : du spam et un job qui supprimait un employé signalé à tort pour abus ont fait monter la charge, la réplication a pris du retard, et la seule réparation était une resynchronisation manuelle, ni automatisée ni bien documentée.',
			'Aucune sauvegarde ne marchait. pg_dump tournait sur un serveur applicatif sans répertoire de données PostgreSQL : Omnibus y choisissait pg_dump 9.2 face à une base 9.6, et chaque exécution échouait. Les e-mails d’échec étaient rejetés faute de signature DMARC. Personne n’était chargé de tester les sauvegardes.',
			'GitLab.com est resté coupé environ 18 heures. Les modifications faites en base entre 17:20 et la suppression sont perdues : environ 5 000 projets, 5 000 commentaires et 700 nouveaux comptes. Les dépôts Git et les wikis n’ont pas été touchés.',
			'Parmi les correctifs annoncés : une invite de shell qui affiche l’hôte et l’environnement, une supervision des sauvegardes, des tests automatiques de restauration des sauvegardes PostgreSQL, et un responsable de la durabilité des données. Les snapshots LVM de production passent à un par heure.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi le bucket S3 des sauvegardes pg_dump était-il vide ?',
			options: [
				'Une règle de cycle de vie S3 effaçait les sauvegardes après un jour',
				'pg_dump 9.2 tournait contre une base 9.6 et échouait à chaque fois',
				'Le job tournait sur db2, vide après l’effacement',
				'Les identifiants d’accès au bucket S3 avaient expiré'
			],
			answer: 1,
			why: 'Le job tournait sur un serveur applicatif sans répertoire de données, donc Omnibus prenait par défaut les binaires PostgreSQL 9.2. pg_dump échoue face à une autre version majeure, et les e-mails d’erreur étaient rejetés faute de DMARC : personne n’a vu les échecs.'
		},
		{
			q: 'Pourquoi db2 ne pouvait-il pas simplement rattraper son retard une fois la charge retombée ?',
			options: [
				'db2 avait manqué de place disque pendant le spam',
				'db1 avait supprimé les segments WAL dont db2 avait besoin',
				'db2 tournait sur une version de PostgreSQL plus ancienne que db1',
				'La réplication avait été coupée pendant le spam'
			],
			answer: 1,
			why: 'Un standby rejoue les WAL reçus du primaire ou lus dans une archive. db1 avait recyclé les segments et GitLab.com n’archivait pas les WAL : il fallait reconstruire db2 depuis une nouvelle base backup.'
		},
		{
			q: 'Qu’est-ce qui a fait durer la restauration environ 18 heures ?',
			options: [
				'Le rejeu de 24 heures de WAL par-dessus le snapshot',
				'La copie depuis des disques de staging bridés à environ 60 Mbps',
				'La reconstruction de chaque index après la copie',
				'La vérification à la main des 5 000 projets perdus'
			],
			answer: 1,
			why: 'Le seul snapshot utilisable était sur le staging, qui tournait sur des disques réseau bon marché pour réduire les coûts. « There was no network or processor bottleneck, the bottleneck was in the drives. »'
		}
	],
	recall: {
		q: 'Quelle commande est partie sur le mauvais hôte chez GitLab le 31 janvier 2017, et qu’a-t-elle effacé ?',
		a: 'L’effacement du répertoire de données PostgreSQL, prévu pour le secondaire db2, a tourné sur le primaire db1 et supprimé environ 300 Go avant que l’ingénieur l’arrête.'
	},
	sources: [
		{ title: 'GitLab, Postmortem of database outage of January 31', url: POST },
		{ title: 'Documentation PostgreSQL 9.6, Log-Shipping Standby Servers', url: 'https://www.postgresql.org/docs/9.6/warm-standby.html' },
		{ title: 'Documentation PostgreSQL 9.6, pg_basebackup', url: 'https://www.postgresql.org/docs/9.6/app-pgbasebackup.html' }
	]
};
