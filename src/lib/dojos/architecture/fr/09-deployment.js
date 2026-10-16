const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const SCALING = 'https://docs.joinmastodon.org/admin/scaling/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'deployment',
	part: 'Voir le système',
	title: 'Le déploiement : des boîtes sur des machines',
	minutes: 10,
	hook: [
		'Il est 3 h du matin, et une machine ne répond plus. Tu dois savoir **si tous les utilisateurs sont coupés, ou seulement une partie**.',
		'Le diagramme de conteneurs ne te le dit pas, parce qu’il ne montre aucune machine. Le diagramme de déploiement C4 place des instances de conteneurs sur des nœuds de déploiement (serveurs, VM, clusters) pour un environnement donné, comme « production ».',
		'Plus bas, un serveur Mastodon s’étend sur plusieurs machines, en suivant son guide officiel de passage à l’échelle, et tu cherches ses **points de défaillance uniques**. Les processus web et streaming peuvent tourner en plusieurs copies. Le processus Sidekiq de la file `scheduler` doit tourner en un seul exemplaire.'
	],
	terms: [
		{ term: 'Diagramme de déploiement', def: 'Où tournent les instances de conteneurs, sur quelles machines ou quels clusters, pour un environnement donné.' },
		{ term: 'Point de défaillance unique (SPOF)', def: 'Une seule boîte qui, si elle meurt, emporte tout le service avec elle.' },
		{ term: 'Redondance', def: 'Deux copies ou plus, pour qu’une puisse mourir pendant que les autres continuent. Les copies ne doivent pas dépendre d’une même boîte partagée qui peut mourir aussi.' },
		{ term: 'Singleton', def: 'Une boîte qui doit tourner en un seul exemplaire : tu ne peux pas la rendre redondante en ajoutant une deuxième copie.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'users(["Utilisateurs et applis"]) --> lb["Load balancer, vérifie /health"]',
					'lb --> web["VM web : Puma x2"]',
					'lb --> st["streaming : 3 processus, ports 4000 à 4002"]'
				],
				highlight: ['lb', 'web', 'st'],
				note: 'Le guide place plusieurs serveurs Puma derrière un load balancer qui surveille `/health`, et fait tourner plusieurs processus de streaming derrière nginx. Les deux sont sans état : n’importe quelle copie répond à n’importe quelle requête. Quand une copie meurt, **les autres continuent de servir**.'
			},
			{
				add: [
					'sk["VM sidekiq : default, push, ingress, mailers, pull"]',
					'sch["sidekiq : file scheduler, exactement 1"]'
				],
				highlight: ['sk', 'sch'],
				note: 'Tu peux découper les processus Sidekiq par file et en lancer plusieurs de chaque. Le guide pose une exception : la file `scheduler` « ne doit jamais tourner dans plus d’un processus Sidekiq à la fois ». C’est un **singleton**, et le diagramme le dessine une seule fois.'
			},
			{
				add: [
					'pgb["PgBouncer"] --> pg[("PostgreSQL primaire")]',
					'pg -->|"réplication en streaming"| rep[("Réplica en lecture")]',
					'web --> pgb',
					'sk --> pgb'
				],
				highlight: ['pgb', 'pg', 'rep'],
				note: 'Le guide compte environ une connexion à la base par thread Puma, Sidekiq et streaming. Chaque nouvelle copie ouvre **des connexions en plus**, alors le guide place PgBouncer devant PostgreSQL. Un réplica en lecture absorbe une partie des lectures, et toutes les écritures vont encore vers l’unique primaire.'
			},
			{
				add: [
					'redis[("Redis, une seule instance")]',
					'web --> redis',
					'st --> redis',
					'sk --> redis',
					'sch --> redis'
				],
				highlight: ['redis'],
				note: 'Chaque processus utilise Redis : les fils, les files de jobs, et le pub/sub que lit le serveur de streaming. Le guide prévient que si cette instance unique « tombe, elle peut faire tomber toute l’instance Mastodon avec elle ». Il recommande Redis Sentinel pour le failover.'
			},
			{
				add: [],
				highlight: ['redis', 'pg', 'sch'],
				note: 'Web, streaming et la plupart de Sidekiq tournent en plusieurs copies. Redis et le primaire PostgreSQL tournent une fois, et chacun fait tout tomber quand il meurt. Le **scheduler** tourne aussi une fois : s’il meurt, le site continue de marcher, mais aucun job programmé ne démarre.'
			}
		]
	},
	example: {
		title: 'config/sidekiq.yml, là où le singleton est déclaré',
		repo: 'mastodon/mastodon',
		url: `${REPO}/config/sidekiq.yml#L1-L18`,
		lang: 'yaml',
		code: `---
:concurrency: <%= ENV.fetch('SIDEKIQ_CONCURRENCY', 5) %>
:queues:
  - [default, 8]
  - [push, 6]
  - [ingress, 4]
  - [mailers, 2]
  - [pull]
  - [scheduler]
  - [fasp]

:scheduler:
  :listened_queues_only: true
  :schedule:
    scheduled_statuses_scheduler:
      every: '5m'
      class: Scheduler::ScheduledStatusesScheduler
      queue: scheduler`,
		notes: [
			'Lignes 3 à 10 : par défaut, **un seul** processus Sidekiq écoute les sept files. Le [guide de passage à l’échelle](' + SCALING + '#sidekiq-queues) montre comment démarrer des processus séparés avec `-q`, pour qu’un afflux d’activité entrante (`ingress`) ne retarde pas les jobs de tes propres utilisateurs (`default`).',
			'Ligne 13, `:listened_queues_only: true` est une [option de sidekiq-scheduler](https://github.com/sidekiq-scheduler/sidekiq-scheduler/blob/abd0dbe43e25a0b23b8b507c69de1b709e0cc9bf/README.md?plain=1#L96) : un processus ne pousse que les jobs cron dont il écoute la file. Seul le processus qui écoute `scheduler` lance donc les jobs programmés.',
			'Les lignes 15 à 18 programment [`ScheduledStatusesScheduler`](' + REPO + '/app/workers/scheduler/scheduled_statuses_scheduler.rb#L8-L20) toutes les cinq minutes ; ce job publie les posts que les utilisateurs ont programmés pour plus tard. Si le processus du scheduler meurt, personne ne voit d’erreur, et les posts programmés ne partent plus.',
			'Ligne 2 : `concurrency` vaut 5 threads par défaut, et le guide dit que chaque thread « a besoin d’une connexion à la base », donc `DB_POOL` doit valoir au moins le nombre de threads. Chaque nouvelle boîte Sidekiq sur le diagramme de déploiement ajoute des connexions à l’unique base.'
		]
	},
	tradeoff: {
		gain: [
			'Les processus web et streaming sont sans état : l’un peut mourir, ou passer à une nouvelle version, pendant que le load balancer envoie le trafic aux autres.',
			'Avec Sidekiq découpé par file, le trafic entrant des autres serveurs ne peut pas bloquer les jobs qu’attendent tes propres utilisateurs.',
			'PgBouncer et un réplica en lecture te permettent d’ajouter des processus sans épuiser les connexions de PostgreSQL.'
		],
		cost: [
			'Redis reste un point de défaillance unique tant que tu n’ajoutes pas Sentinel, et Sentinel ajoute encore des processus à faire tourner.',
			'Tu ne peux pas rendre le scheduler redondant en le copiant, donc tu dois remarquer quand son unique processus meurt.',
			'PgBouncer exige le pooling par transaction et `PREPARED_STATEMENTS=false`, et le guide dit que tu ne peux pas lancer `db:migrate` à travers lui.'
		]
	},
	task: {
		prompt: 'Un serveur fait tourner : deux VM web derrière un load balancer, un processus de streaming, un processus Sidekiq avec toutes les files (la config par défaut), un PostgreSQL, un Redis. Liste les points de défaillance uniques, classés selon qui ils pénalisent, et dis ce que tu changerais en premier.',
		hint: 'Pour chaque boîte dessinée une seule fois, demande-toi : si elle meurt, est-ce que le site tombe, est-ce que les mises à jour en direct s’arrêtent, ou est-ce qu’un travail en arrière-plan attend ?',
		answer: [
			'Redis et PostgreSQL : si l’un des deux tombe, tout le serveur tombe pour tous les utilisateurs.',
			'Le processus Sidekiq unique : les posts sont toujours enregistrés, mais les fils, les e-mails et les livraisons vers les autres serveurs attendent. Il porte aussi le scheduler, donc les posts programmés s’arrêtent.',
			'Le processus de streaming unique : les applis ne reçoivent plus de mises à jour en direct, mais publier et lire marchent toujours.',
			'Premier changement : Redis Sentinel (ou un Redis managé avec failover), parce que c’est peu cher et qu’une panne de Redis fait tout tomber. Ensuite un deuxième processus Sidekiq **sans** la file `scheduler`, pour que les jobs survivent à un crash. La file `scheduler` reste sur un seul processus.'
		]
	},
	quiz: [
		{
			q: 'Deux serveurs Puma sont derrière un load balancer qui vérifie `/health`. L’un d’eux plante. Que se passe-t-il pour les utilisateurs ?',
			options: [
				'Tout le monde est déconnecté, parce que les sessions vivaient sur ce serveur',
				'Le site tombe jusqu’au redémarrage du serveur',
				'Les requêtes vont vers l’autre serveur, et les utilisateurs continuent de travailler',
				'La moitié des utilisateurs a des erreurs jusqu’au changement du DNS'
			],
			answer: 2,
			why: 'N’importe quelle copie de Puma peut répondre à n’importe quelle requête : la session est dans un cookie, les données dans PostgreSQL, Redis et le stockage des médias que les deux copies partagent. Le health check retire la copie morte, et l’autre répond.'
		},
		{
			q: 'Que dit le guide de passage à l’échelle de Mastodon sur la file Sidekiq `scheduler` ?',
			options: [
				'Elle doit tourner dans le plus de processus possible, par sécurité',
				'Elle ne doit jamais tourner dans plus d’un processus Sidekiq à la fois',
				'Elle doit tourner sur la même machine que PostgreSQL',
				'Elle est optionnelle et peut être retirée'
			],
			answer: 1,
			why: 'Le guide te laisse lancer autant de processus Sidekiq que nécessaire, avec une exception : la file `scheduler` tourne dans un seul processus. Tu ne peux pas la rendre redondante en lançant une deuxième copie.'
		},
		{
			q: 'Un serveur Mastodon fait tourner une seule instance Redis. D’après le guide de passage à l’échelle, que peut-il arriver si elle tombe, et que propose le guide ?',
			options: [
				'Seul le cache s’arrête, les fils et les jobs continuent. Rien à faire',
				'Seul le serveur de streaming s’arrête. Ajouter des processus de streaming',
				'Elle peut faire tomber toute l’instance. Utiliser Redis Sentinel pour le failover',
				'Sidekiq bascule sur PostgreSQL pour ses files de jobs. Rien à faire'
			],
			answer: 2,
			why: 'Les fils, les files de jobs et le streaming dépendent tous de Redis, donc le guide le qualifie de critique. Sentinel surveille les instances et redirige les clients vers un nouveau primaire quand l’un tombe.'
		}
	],
	recall: {
		q: 'Dans un déploiement Mastodon passé à l’échelle, quelles boîtes tournent en un seul exemplaire, et que se passe-t-il quand chacune meurt ?',
		a: 'Redis et le primaire PostgreSQL : chacun fait tomber tout le serveur. Le processus Sidekiq de la file `scheduler` : le site continue de marcher, mais les jobs programmés comme `ScheduledStatusesScheduler` ne tournent plus.'
	},
	sources: [
		{ title: 'C4 model, Deployment diagram', url: 'https://c4model.com/diagrams/deployment' },
		{ title: 'Mastodon docs, Scaling up your server', url: SCALING },
		{ title: 'Mastodon docs, Redis Sentinel for high availability', url: `${SCALING}#redis-sentinel` },
		{ title: 'mastodon, config/sidekiq.yml', url: `${REPO}/config/sidekiq.yml` },
		{ title: 'mastodon, docker-compose.yml', url: `${REPO}/docker-compose.yml` }
	]
};
