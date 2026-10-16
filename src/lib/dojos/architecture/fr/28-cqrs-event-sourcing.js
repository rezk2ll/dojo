const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const TEMPORAL = 'https://docs.temporal.io';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cqrs-event-sourcing',
	part: 'La boîte à patterns',
	title: 'CQRS et event sourcing',
	minutes: 10,
	hook: [
		'Un client de ta boutique en ligne écrit au support au sujet de la commande client 1042 : « Pourquoi a-t-elle été annulée ? » La ligne `orders` dit `Cancelled`. Elle ne dit pas quand, par qui, ni à quoi ressemblait la commande client avant. **La ligne garde le dernier état et oublie comment elle y est arrivée.**',
		'L’**event sourcing** garde le « comment ». Chaque changement est ajouté comme **événement** à l’historique de la commande client, et l’état courant est ce que tu obtiens en **rejouant** cet historique.',
		'Rejouer à chaque lecture prend du temps, et les écrans veulent de toute façon d’autres formes. Alors tu sépares le modèle qui modifie les données de celui qui les lit. Cette séparation, c’est **CQRS**, et ça marche avec ou sans event sourcing.'
	],
	terms: [
		{ term: 'Command (commande)', def: 'Une demande de changement, qui peut être refusée. À l’impératif : `CancelOrder`.' },
		{ term: 'Événement', def: 'Un fait qui s’est produit, au passé, jamais modifié : `OrderCancelled`. Stocké dans l’ordre, numéroté par stream.' },
		{ term: 'Event store', def: 'Un journal d’événements en ajout seul (append-only), un stream par agrégat. L’état courant est un replay du stream.' },
		{ term: 'Snapshot', def: 'Une copie sauvegardée de l’état à un numéro d’événement donné, pour qu’un replay puisse partir de là plutôt que de l’événement zéro.' },
		{ term: 'Projection (modèle de lecture)', def: 'Des données dérivées des écritures, façonnées pour un type de lecture. On peut la jeter et la reconstruire.' },
		{ term: 'CQRS', def: 'Command Query Responsibility Segregation : un modèle pour modifier les données, un autre pour les lire. Martin Fowler attribue sa description à Greg Young. Il n’exige pas l’event sourcing.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["POST d’un nouveau post"] -->|"enregistre"| db[("table statuses")]', 'post -.->|"après l’enregistrement"| fan["job de fan-out"]', 'fan -->|"une insertion par abonné"| feed[("Redis : feed:home:id")]', 'class feed ext'],
				highlight: ['post', 'db', 'fan', 'feed'],
				note: '**Côté écriture, dans Mastodon.** Un nouveau post est enregistré dans la base, la source de vérité. Puis un job en arrière-plan pousse son id dans le **fil d’accueil** de chaque abonné, gardé dans Redis. Le fil est un modèle de lecture, construit au moment de l’écriture.'
			},
			{
				add: ['get["GET du fil d’accueil"] -->|"ids les plus récents"| feed', 'get -->|"charge ces posts"| db'],
				highlight: ['get'],
				note: '**Côté lecture, dans Mastodon.** Lire un fil d’accueil ne fait jamais de jointure sur « toutes les personnes que je suis ». On prend les ids les plus récents dans le fil Redis et on ne charge que ces posts. Deux modèles, chacun façonné pour son rôle, et **aucun event store nulle part**.'
			},
			{
				add: ['es[("event stream : order-1042")] -.->|"replay : Placed, Paid, Cancelled"| agg["Order, reconstruite"]', 'agg -.->|"ajoute l’événement n+1"| es'],
				highlight: ['es', 'agg'],
				note: '**L’event sourcing, comme design pour ta boutique.** Au lieu d’écraser une ligne, la command ajoute `OrderCancelled` au stream de la commande client. Pour décider de la prochaine command, tu pars d’une commande client vide et tu appliques chaque événement passé dans l’ordre.'
			},
			{
				add: ['w2["second écrivain, aussi en version n"] -.->|"ajout refusé, recharge, réessaie"| es'],
				highlight: ['w2'],
				note: '**Concurrence optimiste.** Chaque ajout indique à quelle version il s’attend à trouver le stream. Si quelqu’un a déjà écrit l’événement n+1, le store refuse l’ajout. Le perdant recharge l’historique et décide à nouveau. Aucun verrou n’est tenu.'
			},
			{
				add: ['es --> proj["projection"]', 'proj --> rt[("table de lecture : commandes client, par client")]'],
				highlight: ['proj', 'rt'],
				note: '**Modèle de lecture.** Une projection lit les événements et tient une table façonnée pour un écran. Elle a un peu de retard sur le stream. Et comme les événements sont la vérité, tu peux supprimer la table et la reconstruire en les rejouant.'
			}
		]
	},
	example: {
		title: 'app/lib/feed_manager.rb, populate_home',
		repo: 'mastodon/mastodon',
		url: `${REPO}/app/lib/feed_manager.rb#L335-L375`,
		lang: 'ruby',
		code: `  def populate_home(account)
    limit        = FeedManager::MAX_ITEMS / 2
    aggregate    = account.user&.aggregates_reblogs?
    timeline_key = key(:home, account.id)
    over_limit = false

    account.statuses.limit(limit).each do |status|
      add_to_feed(:home, account.id, status, aggregate_reblogs: aggregate)
    end

    account.following.includes(:account_stat).reorder(nil).find_each do |target_account|
      query = target_account.statuses.list_eligible_visibility.includes(reblog: :account).limit(limit)

      over_limit ||= redis.zcard(timeline_key) >= limit
…
      statuses = query.to_a
      next if statuses.empty?

      crutches = build_crutches(account.id, statuses)

      statuses.each do |status|
        next if filter_from_home(status, account.id, crutches)

        add_to_feed(:home, account.id, status, aggregate_reblogs: aggregate)
      end

      trim(:home, account.id)
    end
  end`,
		notes: [
			'**C’est une reconstruction de projection.** Elle remplit le fil d’accueil d’un utilisateur à partir de zéro, en lisant les posts dans la base : ceux de l’utilisateur, puis ceux de chaque compte qu’il suit. Le chemin quotidien est moins coûteux : [`push_to_home`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L74-L83) ajoute un nouveau post à un fil, puis le tronque.',
			'Le modèle de lecture est **jetable**. Un fil garde au plus [`MAX_ITEMS = 800`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L7-L8) ids, et seuls les utilisateurs connectés récemment reçoivent les pushs. Quand un utilisateur inactif revient, Mastodon [met en file une régénération](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/models/user.rb#L532-L553). L’outil d’admin [`tootctl feeds build`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/lib/mastodon/cli/feeds.rb#L15-L43) reconstruit les fils « stored in Redis from the database » (stockés dans Redis, depuis la base de données).',
			'**Le retard se voit.** Pendant qu’un fil est reconstruit, l’API du fil d’accueil [répond `206` au lieu de `200`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/api/v1/timelines/home_controller.rb#L11-L23), pour que l’appli sache que la liste est peut-être incomplète.',
			'Mastodon fait du CQRS **sans** event sourcing : la source de vérité est l’état courant de chaque post, pas un journal d’événements. Pour de l’event sourcing à grande échelle, regarde Temporal : chaque workflow garde un [Event History](' + TEMPORAL + '/workflow-execution/event), « an append-only log of Events » (un journal d’événements en ajout seul), et un worker qui crashe [rejoue le code contre lui](' + TEMPORAL + '/encyclopedia/event-history) pour reconstruire son état.'
		]
	},
	tradeoff: {
		gain: [
			'Un historique complet gratuit. Chaque changement est un fait stocké, dans l’ordre, donc « pourquoi la 1042 a-t-elle été annulée ? » a une réponse. Temporal dit que son Event History « also serves as an audit log for debugging » (sert aussi de journal d’audit pour le débogage).',
			'De la concurrence sans verrous : deux écrivains à la même version ne peuvent pas ajouter tous les deux l’événement n+1.',
			'Des modèles de lecture façonnés pour un écran, que tu peux reconstruire depuis la source de vérité. Le fil d’accueil de Mastodon est une courte liste d’ids, lue en un seul appel.'
		],
		cost: [
			'**Le replay grossit avec l’historique.** Temporal termine un workflow dont l’Event History dépasse 51 200 événements. Sa réponse, [Continue-As-New](' + TEMPORAL + '/workflow-execution/continue-as-new), enregistre l’état et démarre un historique neuf : un snapshot qui ne dit pas son nom.',
			'**Les vieux événements survivent à ton code.** Chaque type d’événement que tu as stocké doit rester lisible, et chaque projection doit le gérer, aussi longtemps que tu gardes le journal.',
			'**Deux modèles à garder synchronisés.** Un modèle de lecture a du retard, et un bug dedans veut dire une reconstruction. L’avertissement de Fowler : « pour la plupart des systèmes, CQRS ajoute une complexité risquée. »'
		]
	},
	task: {
		prompt: 'Ta boutique fait de l’event sourcing sur ses commandes client : un stream par commande client, deux ans d’événements. Le produit veut une nouvelle page, « annulations par jour ». Écris les étapes pour construire son modèle de lecture, dans l’ordre, et dis ce que la page affiche si tu abonnes seulement la projection aux nouveaux événements.',
		hint: 'Une projection ne voit que les événements qu’on lui donne. Où sont les deux ans d’anciens événements ? Et qu’arrive-t-il à un événement qui arrive deux fois ?',
		answer: [
			'Sans backfill, la page démarre à zéro le jour du déploiement. Deux ans d’annulations ont l’air de n’avoir jamais existé.',
			'Étape 1 : crée la table et écris la projection pour qu’elle soit idempotente. Enregistre la dernière position d’événement appliquée, ou indexe chaque compte par id d’événement, pour qu’un événement vu deux fois ne compte qu’une fois.',
			'Étape 2 : rejoue chaque `OrderCancelled` passé, depuis le début du store, dans la projection. Puis garde-la abonnée à partir de la position où le replay s’est arrêté, pour que rien ne tombe dans le trou.',
			'Étape 3 : vérifie quelques jours au hasard contre un comptage direct sur l’event store. Garde le script de replay : c’est aussi lui qui te servira à reconstruire après le prochain bug de projection.'
		]
	},
	quiz: [
		{
			q: 'Dans un système en event sourcing, d’où vient l’état courant d’un agrégat quand une command arrive ?',
			options: [
				'D’une colonne de statut écrasée à chaque changement',
				'Du replay des événements de son stream dans l’ordre, en partant éventuellement d’un snapshot',
				'De la table du modèle de lecture qui sert les écrans',
				'Du client, qui envoie l’état complet avec chaque command'
			],
			answer: 1,
			why: 'Le stream d’événements est la vérité. Tu pars de rien, ou d’un snapshot, et tu appliques chaque événement dans l’ordre. Les modèles de lecture sont dérivés des événements et peuvent avoir du retard, donc les commands ne décident pas à partir d’eux.'
		},
		{
			q: 'Mastodon enregistre les posts dans sa base et garde le fil d’accueil de chaque utilisateur comme une liste d’ids de posts dans Redis, reconstruite depuis la base au besoin. Aucun événement n’est stocké. Est-ce du CQRS ?',
			options: [
				'Non : CQRS exige l’event sourcing',
				'Non : CQRS exige que le côté lecture ait sa propre copie de chaque champ',
				'Seulement si le fil tourne dans un service séparé',
				'Oui : des modèles séparés pour écrire et lire, c’est toute l’idée ; un event store n’est qu’une option'
			],
			answer: 3,
			why: 'CQRS veut dire un modèle pour modifier les données et un autre pour les lire. Fowler note que les deux modèles peuvent même partager une base. L’event sourcing est une façon d’alimenter un côté lecture, pas une obligation.'
		},
		{
			q: 'Deux requêtes chargent la commande client 1042 en version 7, et toutes deux essaient d’ajouter un événement. Le store utilise la concurrence optimiste. Que se passe-t-il ?',
			options: [
				'Le premier ajout devient l’événement 8 ; le second est refusé parce que le stream n’est plus en version 7, donc il recharge et décide à nouveau',
				'Les deux sont stockés comme événement 8, et le replay garde le plus récent',
				'La seconde requête attend sur un verrou que la première soit commitée, puis ajoute',
				'Les deux sont stockés, en 8 et 9, sans qu’aucun écrivain ne voie l’autre'
			],
			answer: 0,
			why: 'Chaque ajout indique la version attendue. Un seul écrivain peut faire passer la version 7 à 8. L’autre reçoit un conflit et réessaie sur un historique frais, donc aucune décision n’est prise sur un état périmé et aucun verrou n’est tenu.'
		}
	],
	takeaway: 'Sépare les lectures des écritures quand une seule forme ne peut pas servir les deux. Stocke des événements seulement quand l’historique vaut la peine d’être gardé. Et prévois comment reconstruire chaque modèle de lecture avant d’en avoir besoin.',
	sources: [
		{ title: 'Martin Fowler, CQRS', url: 'https://martinfowler.com/bliki/CQRS.html' },
		{ title: 'Martin Fowler, Event Sourcing', url: 'https://martinfowler.com/eaaDev/EventSourcing.html' },
		{ title: 'mastodon/mastodon, app/lib/feed_manager.rb', url: `${REPO}/app/lib/feed_manager.rb#L335-L375` },
		{ title: 'Temporal docs, Event History', url: `${TEMPORAL}/workflow-execution/event` },
		{ title: 'Temporal docs, Continue-As-New', url: `${TEMPORAL}/workflow-execution/continue-as-new` }
	]
};
