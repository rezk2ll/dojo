const PM = 'https://gocardless.com/blog/incident-review-api-and-dashboard-outage-on-10th-october/';
const REPO = 'https://github.com/gocardless/our-postgresql-setup/blob/c88edd055253f303bac4058d7e2e1a808797a23a/README.md#running-a-zero-downtime-migration';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gocardless-2017',
	part: 'Les données',
	title: 'GoCardless 2017 : le cluster de bases qui n’a pas basculé',
	minutes: 10,
	hook: [
		'Mardi 10 octobre 2017, 15:09, heure d’été britannique. GoCardless est une entreprise de paiement. Le monitoring signale une panne totale : chaque requête vers l’API et le Dashboard renvoie une erreur.',
		'Les paiements, les marchands et les données clients sont dans un cluster PostgreSQL de 3 nœuds : un primaire, un réplica synchrone et un réplica asynchrone. Un outil, Pacemaker, tourne sur chaque nœud et promeut un réplica quand le primaire tombe.',
		'Quand cette promotion marche, une panne de ce genre dure 1 ou 2 minutes.'
	],
	terms: [
		{ term: 'Réplica synchrone', def: 'Un réplica que le primaire attend : une écriture n’est confirmée au client qu’une fois reçue par ce réplica.' },
		{ term: 'Pacemaker', def: 'Un logiciel de cluster qui tourne sur chaque nœud, décide où tourne chaque ressource (un processus Postgres, une adresse IP) et la déplace quand un nœud tombe.' },
		{ term: 'IP virtuelle (VIP)', def: 'Une adresse IP que Pacemaker déplace d’un nœud à l’autre. Les applis Rails se connectent à la VIP et tombent donc toujours sur le primaire du moment.' },
		{ term: 'Règle de colocation', def: 'Une règle Pacemaker qui impose que deux ressources tournent, ou ne tournent jamais, sur le même nœud.' }
	],
	incident: {
		org: 'GoCardless',
		title: 'Incident review: API and Dashboard outage on 10 October 2017',
		date: '2017-10-10',
		url: PM,
		steps: [
			{
				situation: [
					'15:11. L’équipe voit les signes d’une panne de la grappe de disques sur le primaire. Le cluster n’a pas basculé sur le réplica synchrone, et personne ne sait encore pourquoi.',
					'Le primaire est toujours allumé, avec sa grappe de disques en panne.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Éteindre le nœud primaire en panne',
					'Redémarrer le primaire en espérant que la grappe revienne',
					'Restaurer la sauvegarde de la nuit sur un serveur de secours',
					'Attendre encore 10 minutes que Pacemaker réagisse'
				],
				answer: 0,
				why: 'À 15:17, l’équipe l’a éteint "so that we don\'t have a machine in the cluster that is online, but with a broken disk array." Elle comptait sur Pacemaker pour promouvoir un réplica une fois seuls les deux réplicas en ligne. Pacemaker n’en a promu aucun.'
			},
			{
				situation: [
					'15:18. Le primaire est éteint. L’équipe lance `crm resource cleanup` pour remettre à zéro les compteurs d’erreurs de Pacemaker et lui faire redécouvrir l’état des instances Postgres. Rien ne bouge.',
					'Tu comptes promouvoir un réplica à la main. Il en reste deux : le synchrone et l’asynchrone.'
				],
				q: 'Quel réplica promeus-tu ?',
				options: [
					'Le réplica synchrone',
					'Le réplica asynchrone',
					'Celui des deux qui a le moins de charge',
					'Aucun : monter un nouveau nœud depuis l’archive WAL'
				],
				answer: 0,
				why: 'Le primaire attend le réplica synchrone avant de confirmer une écriture, donc ce réplica "is guaranteed to have a copy of every write (e.g. new payment) that the primary accepted." Il peut manquer les derniers paiements à l’asynchrone.'
			},
			{
				situation: [
					'Pendant une heure, l’équipe essaie de promouvoir le réplica synchrone via Pacemaker. Elle passe en `maintenance-mode=true`, retire de `recovery.conf` l’option qui fait de Postgres un réplica, puis sort le cluster du mode maintenance.',
					'À chaque fois, Pacemaker relance le réplica avec son `recovery.conf` d’origine, et il n’y a toujours pas de primaire. Il est 16:18.'
				],
				q: 'Que fais-tu maintenant ?',
				options: [
					'Laisser Pacemaker en maintenance et démarrer le primaire à la main',
					'Refaire l’édition de `recovery.conf` avec Pacemaker arrêté sur un nœud',
					'Réinstaller Pacemaker sur les deux réplicas et repartir de zéro',
					'Ouvrir un ticket chez les mainteneurs de Pacemaker et attendre'
				],
				answer: 0,
				why: 'L’équipe a jugé que "our attempts at this approach have run on for too long". Elle a mis le cluster en maintenance "one last time, configure the synchronous replica to be a primary, and start Postgres ourselves."'
			},
			{
				situation: [
					'Postgres tourne en primaire sur l’ancien réplica synchrone. C’est Pacemaker qui gère la VIP où se connectent les applis, et Pacemaker est en mode maintenance.'
				],
				q: 'Comment les applis joignent-elles le nouveau primaire ?',
				options: [
					'Pointer les applis sur l’adresse IP réelle du nouveau primaire',
					'Sortir Pacemaker du mode maintenance pour qu’il déplace la VIP',
					'Redémarrer les applis pour qu’elles se reconnectent à la même VIP',
					'Créer un nom DNS pour le cluster et attendre l’expiration des caches'
				],
				answer: 0,
				why: 'Hors du mode maintenance, Pacemaker avait annulé la promotion à chaque essai. L’équipe a reconfiguré les applis backend "to connect to the actual IP address of the new primary". Le changement se déployait à 16:46, et le monitoring a vu l’API et le Dashboard revenir à 16:59.'
			},
			{
				situation: [
					'16:59. Le service tourne sur un primaire et un réplica. Pacemaker est toujours en maintenance : si un nœud tombe maintenant, aucune bascule n’aura lieu. L’équipe s’attend à rester ainsi plusieurs jours, peut-être une ou deux semaines.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Ajouter un troisième nœud en réplica et une VIP déplacée à la main',
					'Sortir Pacemaker du mode maintenance sur ce cluster',
					'Lancer la recherche de cause et laisser le cluster tel quel',
					'Revenir sur l’ancien primaire une fois ses disques changés'
				],
				answer: 0,
				why: 'La priorité suivante "was to restore the database cluster to its usual level of redundancy" : un troisième nœud en réplica asynchrone, et une nouvelle VIP "to be managed manually by the infrastructure team". Le lendemain, l’équipe a estimé avoir "taken too much manual intervention on our existing database cluster" pour y remettre Pacemaker.'
			}
		],
		outcome: [
			'La panne a duré 1 heure et 50 minutes, et chaque requête vers l’API et le Dashboard a échoué. Le déclencheur : le contrôleur RAID du primaire "logged the simultaneous loss of 3 disks from the array". Pacemaker a bien vu que Postgres allait mal, mais "each time it couldn\'t decide where that primary should run."',
			'L’équipe a recréé le cluster dans des conteneurs Docker et a scripté des pannes jusqu’à isoler trois conditions qui, ensemble, cassaient la promotion. Un `default-resource-stickiness` non nul. Une Backup VIP avec une règle de colocation -INF contre le primaire Postgres, qui tournait sur le réplica synchrone. Et le crash d’un sous-processus Postgres sur le réplica synchrone presque au même moment que la panne du primaire.',
			'Le correctif : écrire la règle dans l’autre sens, une préférence INF entre la Backup VIP et un réplica au lieu de -INF entre la Backup VIP et le primaire. Avec ça, le cluster promouvait le réplica synchrone dans les mêmes pannes. Un fichier WAL invalide vu dans les logs n’y était pour rien.',
			'L’équipe est ensuite passée sur un nouveau cluster géré par Pacemaker. Elle a utilisé PgBouncer pour mettre en pause les requêtes pendant la bascule, et a annoncé une fenêtre de maintenance par précaution. Elle a aussi prévu plus d’injection de pannes : Pacemaker gérait les pannes seul depuis deux ans, et l’équipe avait perdu la main sur les gestes manuels.'
		]
	},
	quiz: [
		{
			q: 'Quel changement a fait promouvoir le réplica synchrone au cluster recréé, dans les mêmes pannes ?',
			options: [
				'Écrire la règle de la Backup VIP en INF avec un réplica, pas en -INF avec le primaire',
				'Monter `default-resource-stickiness` pour que le primaire reste en place',
				'Retirer `restore_command` pour que les réplicas ne lisent plus l’archive WAL',
				'Ajouter un quatrième nœud pour que la Backup VIP ait toujours une place'
			],
			answer: 0,
			why: 'Les deux règles semblent dire la même chose : garder la Backup VIP hors du primaire. Pacemaker les traitait différemment pendant la promotion. Avec la règle -INF, il ne trouvait pas où placer le nouveau primaire, alors que le réplica asynchrone pouvait accueillir la Backup VIP.'
		},
		{
			q: 'GoCardless avait toujours au moins 2 copies d’un paiement avant de répondre à l’appel d’API. Où était la seconde ?',
			options: [
				'Sur le réplica synchrone, que le primaire attend avant de confirmer',
				'Sur le réplica asynchrone, qui reçoit chaque écriture un peu plus tard',
				'Dans l’archive WAL du serveur de sauvegarde, écrite par `archive_command`',
				'Dans la file de PgBouncer, qui garde les requêtes jusqu’à la confirmation'
			],
			answer: 0,
			why: 'En réplication synchrone, le primaire attend que le réplica ait reçu le WAL d’une écriture. La requête ne rend la main qu’ensuite : un paiement confirmé est sur deux machines.'
		},
		{
			q: 'Le bug n’apparaissait que si deux processus plantaient presque au même instant. Comment l’équipe l’a-t-elle trouvé ?',
			options: [
				'Cluster dans Docker et pannes scriptées, jusqu’à reproduire la même casse',
				'En lisant le code de Pacemaker jusqu’au chemin de la colocation',
				'En attendant la prochaine panne de disque en prod, avec plus de logs',
				'En comparant la ligne de log du WAL invalide au code de Postgres'
			],
			answer: 0,
			why: 'Des clusters en conteneurs démarrent et s’arrêtent vite : l’équipe a pu essayer beaucoup de combinaisons de pannes, puis retirer des étapes jusqu’à garder trois conditions. La ligne de log du WAL a aussi été comparée au code de Postgres, mais c’était une fausse piste.'
		}
	],
	recall: {
		q: 'Quelle règle Pacemaker empêchait le cluster de GoCardless de promouvoir un nouveau primaire ?',
		a: 'Une règle de colocation -INF entre la Backup VIP et le primaire Postgres, alors que la Backup VIP tournait sur le réplica synchrone. Réécrite en INF entre la Backup VIP et un réplica, la promotion marchait.'
	},
	sources: [
		{ title: 'GoCardless : Incident review: API and Dashboard outage on 10 October 2017', url: PM },
		{ title: 'gocardless/our-postgresql-setup : Running a zero-downtime migration', url: REPO }
	]
};
