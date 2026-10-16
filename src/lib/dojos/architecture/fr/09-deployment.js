const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const SCALING = 'https://docs.joinmastodon.org/admin/scaling/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'deployment',
	part: 'Voir le système',
	title: 'Le déploiement : des boîtes sur des machines',
	minutes: 10,
	hook: [
		'Il est 3 h du matin. Une machine ne répond plus. La question qui compte n’est pas « quel conteneur tourne dessus » mais **« est-ce que tout le monde tombe, ou seulement une partie ? »**',
		'Le diagramme de conteneurs ne sait pas répondre, parce qu’il ne dit rien des machines. Le **diagramme de déploiement** C4, lui, le fait : il place des instances de conteneurs sur des nœuds de déploiement (serveurs, VM, clusters) pour un environnement donné, comme « production ».',
		'Aujourd’hui, on dessine un serveur Mastodon qui a dépassé une seule machine, en suivant son guide officiel de passage à l’échelle, et on traque ses **points de défaillance uniques**. Certaines boîtes sont faciles à copier. Une boîte ne doit **jamais** être copiée.'
	],
	terms: [
		{ term: 'Diagramme de déploiement', def: 'Où tournent les instances de conteneurs, sur quelles machines ou quels clusters, pour un environnement donné.' },
		{ term: 'Nœud de déploiement', def: 'Un endroit où les choses tournent : un serveur physique, une VM, un cluster Kubernetes, un pod, un navigateur. Les nœuds peuvent s’imbriquer.' },
		{ term: 'Point de défaillance unique (SPOF)', def: 'Une seule boîte qui, si elle meurt, emporte tout le service avec elle.' },
		{ term: 'Redondance', def: 'Deux copies ou plus pour qu’une puisse mourir. Elle n’est réelle que si les copies ne partagent pas quelque chose qui peut mourir aussi.' },
		{ term: 'Singleton', def: 'Une boîte qui doit tourner en exactement un exemplaire. Tu ne règles pas le problème en ajoutant une deuxième copie.' }
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
				note: 'Le guide place plusieurs serveurs Puma derrière un load balancer qui surveille `/health`, et fait tourner plusieurs processus de streaming derrière nginx. Les deux sont sans état : n’importe quelle copie peut répondre. **Tu en perds une, les autres continuent de servir.**'
			},
			{
				add: [
					'sk["VM sidekiq : default, push, ingress, mailers, pull"]',
					'sch["sidekiq : file scheduler, exactement 1"]'
				],
				highlight: ['sk', 'sch'],
				note: 'Les processus Sidekiq peuvent être découpés par file et multipliés. Une règle du guide : la file `scheduler` « ne doit jamais tourner dans plus d’un processus Sidekiq à la fois ». Un **singleton**, dessiné une seule fois exprès.'
			},
			{
				add: [
					'pgb["PgBouncer"] --> pg[("PostgreSQL primaire")]',
					'pg -->|"réplication en streaming"| rep[("Réplica en lecture")]',
					'web --> pgb',
					'sk --> pgb'
				],
				highlight: ['pgb', 'pg', 'rep'],
				note: 'Le guide compte environ une connexion à la base par thread Puma, Sidekiq et streaming. **Plus de copies, c’est plus de connexions**, alors le guide ajoute PgBouncer. Un réplica en lecture prend une partie des lectures. Les écritures vont toujours vers **un seul** primaire.'
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
				note: 'Chaque processus parle à Redis : les fils, les files de jobs, le pub/sub qui alimente le streaming. Le guide est franc : si cette instance unique « tombe, elle peut faire tomber toute l’instance Mastodon avec elle ». Sa solution : Redis Sentinel.'
			},
			{
				add: [],
				highlight: ['redis', 'pg', 'sch'],
				note: 'Copiés : web, streaming, la plupart de Sidekiq. Dessinés une seule fois : **Redis** et le **primaire PostgreSQL**, qui font tout tomber, et le **scheduler**, qui ne fait rien tomber d’un coup mais arrête l’horloge en silence. Les boîtes sans état étaient la partie facile.'
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
			'Par défaut, **un seul** processus Sidekiq écoute les sept files. Le [guide de passage à l’échelle](' + SCALING + '#sidekiq-queues) montre comment démarrer des processus séparés avec `-q`, pour qu’un afflux d’activité entrante (`ingress`) ne retarde pas les jobs de tes propres utilisateurs (`default`).',
			'`:listened_queues_only: true` est une [option de sidekiq-scheduler](https://github.com/sidekiq-scheduler/sidekiq-scheduler/blob/abd0dbe43e25a0b23b8b507c69de1b709e0cc9bf/README.md?plain=1#L96) : un processus ne pousse que les jobs cron dont il écoute la file. Donc le processus qui écoute `scheduler` **est** l’horloge.',
			'Qu’est-ce qui s’arrête si l’horloge meurt ? Entre autres [`ScheduledStatusesScheduler`](' + REPO + '/app/workers/scheduler/scheduled_statuses_scheduler.rb#L8-L20), toutes les cinq minutes, qui publie les posts que les utilisateurs ont programmés pour plus tard. Personne ne reçoit d’erreur. Les posts programmés cessent juste de partir.',
			'`concurrency` vaut 5 threads par défaut, et le guide dit que chaque thread « a besoin d’une connexion à la base », donc `DB_POOL` doit être au moins égal au nombre de threads. Sur un diagramme de déploiement, chaque nouvelle boîte ajoute aussi de la charge sur l’unique base.'
		]
	},
	tradeoff: {
		gain: [
			'Des processus web et streaming sans état : l’un peut mourir, ou passer à une nouvelle version, pendant que le load balancer envoie le trafic aux autres.',
			'Sidekiq découpé par file : le trafic entrant des autres serveurs ne peut pas affamer les jobs qu’attendent tes propres utilisateurs.',
			'PgBouncer et un réplica en lecture te permettent d’ajouter des processus sans épuiser les connexions de PostgreSQL.'
		],
		cost: [
			'Redis reste un point de défaillance unique tant que tu n’ajoutes pas Sentinel, et Sentinel, c’est encore des boîtes à faire tourner.',
			'Le scheduler est un singleton. Tu ne peux pas le rendre redondant en le copiant, donc tu dois remarquer quand il meurt.',
			'Plus de boîtes, plus de pièces mobiles : PgBouncer exige le pooling par transaction et `PREPARED_STATEMENTS=false`, et le guide dit que tu ne peux pas lancer `db:migrate` à travers lui.'
		]
	},
	task: {
		prompt: 'Un serveur fait tourner : deux VM web derrière un load balancer, un processus de streaming, un processus Sidekiq avec toutes les files (la config par défaut), un PostgreSQL, un Redis. Liste les points de défaillance uniques, classés selon qui ils pénalisent, et dis ce que tu changerais en premier.',
		hint: 'Pour chaque boîte dessinée une seule fois, demande-toi : si elle meurt, est-ce que le site tombe, est-ce que les mises à jour en direct s’arrêtent, ou est-ce qu’un travail en arrière-plan attend ?',
		answer: [
			'**Redis** et **PostgreSQL** : si l’un des deux tombe, tout le serveur tombe. Les pires.',
			'Le **processus Sidekiq unique** : les posts sont toujours enregistrés, mais les fils, les e-mails et les livraisons vers les autres serveurs attendent. Il porte aussi le scheduler, donc les posts programmés s’arrêtent.',
			'Le **processus de streaming unique** : les applis ne reçoivent plus de mises à jour en direct, mais publier et lire marchent toujours.',
			'Premier changement : Redis Sentinel (ou un Redis managé avec failover), parce que c’est peu cher comparé au rayon d’impact. Ensuite un deuxième processus Sidekiq **sans** la file `scheduler`, pour que les jobs survivent à un crash. Jamais un deuxième **avec** elle.'
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
			why: 'Le guide te laisse lancer autant de processus Sidekiq que nécessaire, avec une exception : la file `scheduler` tourne dans un seul processus. C’est un singleton, pas quelque chose qu’on rend redondant en le copiant.'
		},
		{
			q: 'Un serveur Mastodon fait tourner une seule instance Redis. D’après le guide de passage à l’échelle, que peut-il arriver si elle tombe, et que propose le guide ?',
			options: [
				'Seul le cache s’arrête. Rien à faire',
				'Seul le serveur de streaming s’arrête. Ajouter des processus de streaming',
				'Elle peut faire tomber toute l’instance. Utiliser Redis Sentinel pour un failover automatique',
				'Sidekiq bascule sur PostgreSQL pour ses files. Rien à faire'
			],
			answer: 2,
			why: 'Les fils, les files de jobs et le streaming dépendent tous de Redis, donc le guide le qualifie de critique. Sentinel surveille les instances et redirige les clients vers un nouveau primaire quand l’un tombe.'
		}
	],
	takeaway: 'Pour chaque boîte du diagramme de déploiement, demande-toi « si elle meurt, qui tombe ? ». Les boîtes sans état se doublent facilement. Ce sont les stockages partagés et les singletons qu’il faut concevoir avec soin.',
	sources: [
		{ title: 'C4 model, Deployment diagram', url: 'https://c4model.com/diagrams/deployment' },
		{ title: 'Mastodon docs, Scaling up your server', url: SCALING },
		{ title: 'Mastodon docs, Redis Sentinel for high availability', url: `${SCALING}#redis-sentinel` },
		{ title: 'mastodon, config/sidekiq.yml', url: `${REPO}/config/sidekiq.yml` },
		{ title: 'mastodon, docker-compose.yml', url: `${REPO}/docker-compose.yml` }
	]
};
