const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const TEMPORAL = 'https://docs.temporal.io';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cqrs-event-sourcing',
	part: 'La boîte à patterns',
	title: 'CQRS et event sourcing',
	minutes: 10,
	hook: [
		'Un client de ta boutique en ligne écrit au support : « Pourquoi la commande 1042 a-t-elle été annulée ? » La ligne `orders` dit `Cancelled`. Elle ne dit pas quand, par qui, ni à quoi ressemblait la commande avant. **La ligne garde le dernier état et oublie comment elle y est arrivée.**',
		'Avec l’event sourcing, chaque changement est ajouté comme **événement** à l’historique de la commande. Pour obtenir l’état courant, tu rejoues cet historique depuis le premier événement.',
		'Rejouer à chaque lecture prend du temps, et les écrans veulent de toute façon d’autres formes. Alors tu sépares le modèle qui modifie les données de celui qui les lit. Cette séparation, c’est **CQRS**, et ça marche avec ou sans event sourcing.'
	],
	terms: [
		{ term: 'Événement', def: 'Un fait qui s’est produit, nommé au passé et jamais modifié : `OrderCancelled`. Le store garde les événements dans l’ordre et les numérote par stream.' },
		{ term: 'Event store', def: 'Un journal d’événements en ajout seul (append-only), un stream par agrégat. Rejouer un stream donne l’état courant de l’agrégat.' },
		{ term: 'Projection (modèle de lecture)', def: 'Des données dérivées des écritures, façonnées pour un type de lecture. Tu peux la supprimer et la reconstruire depuis la source de vérité.' },
		{ term: 'CQRS', def: 'Command Query Responsibility Segregation : un modèle pour modifier les données, un autre pour les lire. Martin Fowler attribue sa description à Greg Young. Il n’exige pas l’event sourcing.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["POST d’un nouveau post"] -->|"enregistre"| db[("table statuses")]', 'post -.->|"après l’enregistrement"| fan["job de fan-out"]', 'fan -->|"une insertion par abonné"| feed[("Redis : feed:home:id")]', 'class feed ext'],
				highlight: ['post', 'db', 'fan', 'feed'],
				note: 'Côté écriture, Mastodon enregistre un nouveau post dans la base, la source de vérité. Puis un job en arrière-plan pousse son id dans le **fil d’accueil** de chaque abonné, gardé dans Redis. Le fil est un modèle de lecture, construit au moment de l’écriture.'
			},
			{
				add: ['get["GET du fil d’accueil"] -->|"ids les plus récents"| feed', 'get -->|"charge ces posts"| db'],
				highlight: ['get'],
				note: 'Côté lecture, une requête sur le fil d’accueil ne fait jamais de jointure sur « toutes les personnes que je suis ». Elle prend les ids les plus récents dans le fil Redis et ne charge que ces posts. Mastodon a deux modèles, chacun façonné pour son rôle, et **aucun event store nulle part**.'
			},
			{
				add: ['es[("event stream : order-1042")] -.->|"replay : Placed, Paid, Cancelled"| agg["Order, reconstruite"]', 'agg -.->|"ajoute l’événement n+1"| es'],
				highlight: ['es', 'agg'],
				note: 'Dans ta boutique, l’event sourcing pourrait marcher ainsi. Au lieu d’écraser une ligne, la commande `CancelOrder` ajoute `OrderCancelled` au stream de la commande. Pour décider de la prochaine demande, tu pars d’une commande vide et tu appliques chaque événement passé dans l’ordre.'
			},
			{
				add: ['w2["second écrivain, aussi en version n"] -.->|"ajout refusé, recharge, réessaie"| es'],
				highlight: ['w2'],
				note: 'Avec la concurrence optimiste, chaque ajout indique à quelle version il s’attend à trouver le stream. Si quelqu’un a déjà écrit l’événement n+1, le store refuse l’ajout. Le second écrivain recharge l’historique et décide à nouveau, et aucun écrivain ne prend de verrou.'
			},
			{
				add: ['es --> proj["projection"]', 'proj --> rt[("table de lecture : commandes par client")]'],
				highlight: ['proj', 'rt'],
				note: 'Une projection lit les événements et tient une table façonnée pour un écran. La table a un peu de retard sur le stream. Comme les événements sont la source de vérité, tu peux supprimer la table et la reconstruire en les rejouant.'
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
			'Cette méthode reconstruit une projection : elle remplit le fil d’accueil d’un utilisateur à partir de zéro, en lisant les posts dans la base. Les lignes 7 à 9 ajoutent ses propres posts, et les lignes 11 à 28 ceux de chaque compte qu’il suit. Le chemin quotidien est moins coûteux : [`push_to_home`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/feed_manager.rb#L74-L83) ajoute un nouveau post à un fil, puis le tronque.',
			'Mastodon peut jeter un fil et le reconstruire. Un fil garde au plus `MAX_ITEMS = 800` ids, et seuls les utilisateurs connectés récemment reçoivent les pushs. Quand un utilisateur inactif revient, Mastodon met en file une régénération. La commande d’admin [`tootctl feeds build`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/lib/mastodon/cli/feeds.rb#L15-L43) reconstruit les fils « stockés dans Redis depuis la base de données ».',
			'L’appli voit le retard : pendant qu’un fil est reconstruit, l’API du fil d’accueil [répond `206` au lieu de `200`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/api/v1/timelines/home_controller.rb#L11-L23), pour que l’appli sache que la liste est peut-être incomplète.',
			'Mastodon fait du CQRS **sans** event sourcing : sa source de vérité est l’état courant de chaque post. Pour de l’event sourcing à grande échelle, regarde Temporal : chaque workflow garde un [Event History](' + TEMPORAL + '/workflow-execution/event), « un journal d’événements en ajout seul ». Un worker qui crashe rejoue le code contre cet historique pour reconstruire son état.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque changement est un fait stocké, dans l’ordre, donc « pourquoi la 1042 a-t-elle été annulée ? » a une réponse. Temporal dit que son Event History « sert aussi de journal d’audit pour le débogage ».',
			'Deux écrivains à la même version ne peuvent pas ajouter tous les deux l’événement n+1, et aucun des deux ne prend de verrou.',
			'Chaque modèle de lecture est façonné pour un écran, et tu peux le reconstruire depuis la source de vérité. Le fil d’accueil de Mastodon est une courte liste d’ids, lue en un seul appel.'
		],
		cost: [
			'Le temps de replay augmente avec l’historique : Temporal termine un workflow dont l’Event History dépasse 51 200 événements. Sa réponse, [Continue-As-New](' + TEMPORAL + '/workflow-execution/continue-as-new), enregistre l’état et démarre un historique neuf, ce qui revient à un snapshot.',
			'Chaque type d’événement que tu as stocké doit rester lisible, et chaque projection doit le gérer, aussi longtemps que tu gardes le journal.',
			'Tu dois garder deux modèles synchronisés : le modèle de lecture a du retard sur les écritures, et un bug dedans t’oblige à le reconstruire. Fowler prévient : « pour la plupart des systèmes, CQRS ajoute une complexité risquée. »'
		]
	},
	task: {
		prompt: 'Ta boutique fait de l’event sourcing sur ses commandes : un stream par commande, deux ans d’événements. Le produit veut une nouvelle page, « annulations par jour ». Écris les étapes pour construire son modèle de lecture, dans l’ordre, et dis ce que la page affiche si tu abonnes seulement la projection aux nouveaux événements.',
		hint: 'Une projection ne voit que les événements qu’on lui donne. Où sont les deux ans d’anciens événements ? Et qu’arrive-t-il à un événement qui arrive deux fois ?',
		answer: [
			'Sans backfill, la page démarre à zéro le jour du déploiement. Deux ans d’annulations ont l’air de n’avoir jamais existé.',
			'Étape 1 : crée la table et écris la projection pour qu’elle soit idempotente. Enregistre la dernière position d’événement appliquée, ou indexe chaque compte par id d’événement, pour qu’un événement vu deux fois ne compte qu’une fois.',
			'Étape 2 : rejoue chaque `OrderCancelled` passé, depuis le début du store, dans la projection. Puis garde-la abonnée à partir de la position où le replay s’est arrêté, pour que rien ne tombe dans le trou.',
			'Étape 3 : vérifie quelques jours au hasard contre un comptage direct sur l’event store. Garde le script de replay : c’est aussi lui qui te servira à reconstruire après le prochain bug de projection.'
		],
		steps: [
			{
				title: 'Vois ce que la page afficherait',
				questions: [
					{ q: 'Tu abonnes seulement la projection aux nouveaux événements. Qu’affiche la page le jour du déploiement ?', options: ['Deux ans d’annulations', 'Zéro, comme si aucune commande n’avait jamais été annulée', 'Une erreur jusqu’à la première annulation', 'Les annulations du jour plus une estimation du passé'], answer: 1, why: 'Sans backfill, la page démarre à zéro. Deux ans d’annulations ont l’air de n’avoir jamais existé.' },
					{ q: 'Pourquoi la projection rate-t-elle les anciennes annulations ?', options: ['Une projection ne voit que les événements qu’on lui donne', 'Les anciens événements ont été supprimés', 'Les événements de plus d’un an expirent', 'L’event store cache les streams fermés'], answer: 0, why: 'L’abonner aux nouveaux événements ne lui donne que ce qui arrive à partir de maintenant.' },
					{ q: 'Où sont les deux ans d’anciens `OrderCancelled` ?', options: ['Seulement dans la table `orders`', 'Dans une ancienne projection', 'Dans l’event store, dans le stream de chaque commande', 'Nulle part : un événement est supprimé une fois appliqué'], answer: 2, why: 'L’event store est un journal en ajout seul. Rien n’y est jeté.' },
					{ q: 'Faut-il modifier le côté écriture pour cette page ?', options: ['Oui : ajouter un compteur à chaque stream de commande', 'Oui : CQRS demande d’abord une nouvelle commande', 'Seulement si tu arrêtes la boutique pendant la construction', 'Non : une projection est une donnée dérivée, construite à partir des événements'], answer: 3, why: 'Un modèle de lecture est façonné pour un écran et construit depuis la source de vérité. Les écritures restent telles quelles.' }
				]
			},
			{
				title: 'Rends-la sûre à répéter',
				questions: [
					{ q: 'Quelle est l’étape 1 ?', options: ['Créer la table et écrire la projection pour qu’elle soit idempotente', 'Rejouer tous les événements passés', 'Vérifier quelques jours au hasard', 'Archiver les anciens streams'], answer: 0, why: 'La projection doit être sûre avant que tu lui donnes deux ans d’événements.' },
					{ q: 'Pourquoi la projection doit-elle être idempotente ?', options: ['Les événements n’arrivent jamais deux fois, c’est juste plus propre', 'Un événement peut arriver deux fois, et ne doit compter qu’une fois', 'Ça accélère le replay', 'Ça permet à la projection d’écrire dans l’event store'], answer: 1, why: 'Le replay et l’abonnement peuvent livrer le même événement. Le compter deux fois donne une page fausse.' },
					{ q: 'Quelle est une façon de la rendre idempotente ?', options: ['Ajouter un pour chaque événement reçu', 'Verrouiller le stream pendant le comptage', 'Enregistrer la dernière position d’événement appliquée', 'Lire plutôt la table `orders`'], answer: 2, why: 'Un événement à la position enregistrée ou avant a déjà été appliqué : il est sauté.' },
					{ q: 'Quelle est une autre façon ?', options: ['Ne compter que le dernier jour', 'Supprimer chaque événement après l’avoir compté', 'Compter chaque message sans vérification', 'Indexer chaque compte par id d’événement'], answer: 3, why: 'Un compte indexé par id d’événement ne peut pas contenir deux fois le même événement.' }
				]
			},
			{
				title: 'Fais le backfill, puis suis le flux',
				questions: [
					{ q: 'Quelle est l’étape 2 ?', options: ['Rejouer chaque `OrderCancelled` passé, depuis le début du store, dans la projection', 'S’abonner seulement aux nouveaux événements', 'Copier les comptes depuis la table `orders`', 'Demander les anciens chiffres au support'], answer: 0, why: 'Le replay remplit les deux ans que l’abonnement seul raterait.' },
					{ q: 'Après le replay, à partir d’où démarre l’abonnement ?', options: ['À partir du dernier événement au moment du déploiement', 'À partir de la position où le replay s’est arrêté', 'À nouveau à partir du premier événement', 'À partir de minuit le jour du déploiement'], answer: 1, why: 'Démarrer exactement là où le replay s’est arrêté ne laisse aucun trou.' },
					{ q: 'Le replay dure une heure, puis l’abonnement démarre à partir de « maintenant ». Qu’est-ce qui tourne mal ?', options: ['Le replay est annulé', 'Chaque événement est compté deux fois', 'Les annulations écrites pendant le replay tombent dans le trou', 'Rien : le store les renvoie'], answer: 2, why: 'Le replay s’arrête à une position. Les événements ajoutés après elle, pendant le replay, ne sont jamais donnés à la projection.' },
					{ q: 'La table de lecture est un peu en retard sur le stream. Est-ce un bug ?', options: ['Oui : elle doit se mettre à jour dans la même transaction', 'Oui : CQRS n’autorise aucun retard', 'Non : elle n’est jamais en retard', 'Non : une projection a toujours un peu de retard sur le stream'], answer: 3, why: 'Tu gardes deux modèles en phase, et le modèle de lecture suit toujours les écritures avec un peu de retard.' }
				]
			},
			{
				title: 'Vérifie et garde les outils',
				questions: [
					{ q: 'Quelle est l’étape 3 ?', options: ['Supprimer le script de replay', 'Vérifier quelques jours au hasard contre un comptage direct sur l’event store', 'Faire confiance aux chiffres dès la fin du replay', 'Comparer avec le rapport de l’an dernier'], answer: 1, why: 'L’event store est la source de vérité : un comptage direct sert de référence.' },
					{ q: 'Pourquoi garder le script de replay ?', options: ['C’est lui qui te servira à reconstruire après le prochain bug de projection', 'Il accélère les nouvelles écritures', 'L’event store en a besoin pour ajouter', 'Il remplace l’abonnement'], answer: 0, why: 'Un bug dans un modèle de lecture veut dire une reconstruction, et le script en fait déjà une.' },
					{ q: 'Tu trouves un bug dans la projection. Que fais-tu ?', options: ['Tu modifies les événements stockés', 'Tu supprimes les streams de commande', 'Tu jettes la table et tu la reconstruis en rejouant les événements', 'Tu vis avec des comptes faux'], answer: 2, why: 'Un événement n’est jamais modifié. La projection est dérivée : tu la jettes et tu la reconstruis.' },
					{ q: 'Pourquoi « chaque type d’événement stocké doit rester lisible » compte-t-il pour ce replay ?', options: ['Seul le format le plus récent est rejoué', 'Les anciens événements sont convertis à chaque déploiement', 'Ça ne compte pas pour un modèle de lecture', 'Le replay lit deux ans d’événements, dans tous les formats où ils ont été écrits'], answer: 3, why: 'Chaque projection doit gérer chaque type d’événement que tu as stocké, tant que tu gardes le journal.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans un système en event sourcing, d’où vient l’état courant d’un agrégat quand une commande arrive ?',
			options: [
				'D’une colonne de statut sur la ligne de l’agrégat, écrasée à chaque changement',
				'Du replay des événements de son stream dans l’ordre, en partant éventuellement d’un snapshot',
				'De la table du modèle de lecture qui sert les écrans, puisqu’elle est toujours à jour',
				'Du client, qui envoie l’état complet avec chaque commande'
			],
			answer: 1,
			why: 'Le stream d’événements est la source de vérité : tu pars de rien, ou d’un snapshot, et tu appliques chaque événement dans l’ordre. Les modèles de lecture sont dérivés des événements et peuvent avoir du retard, donc les commandes ne décident pas à partir d’eux.'
		},
		{
			q: 'Mastodon enregistre les posts dans sa base et garde le fil d’accueil de chaque utilisateur comme une liste d’ids de posts dans Redis, reconstruite depuis la base au besoin. Aucun événement n’est stocké. Est-ce du CQRS ?',
			options: [
				'Non : CQRS exige l’event sourcing, et ici aucun événement n’est stocké',
				'Non : CQRS exige que le côté lecture garde sa propre copie complète de chaque champ du post',
				'Seulement si le fil tourne dans un service séparé avec sa propre base',
				'Oui : des modèles séparés pour écrire et lire, c’est toute l’idée ; un event store n’est qu’une option'
			],
			answer: 3,
			why: 'CQRS veut dire un modèle pour modifier les données et un autre pour les lire. Fowler note que les deux modèles peuvent même partager une base. L’event sourcing est une façon d’alimenter un côté lecture, pas une obligation.'
		},
		{
			q: 'Deux requêtes chargent la commande 1042 en version 7, et toutes deux essaient d’ajouter un événement. Le store utilise la concurrence optimiste. Que se passe-t-il ?',
			options: [
				'Le premier ajout devient l’événement 8 ; le second reçoit un conflit, donc il recharge et décide à nouveau',
				'Les deux sont stockés comme événement 8, et le replay garde celui écrit en dernier',
				'La seconde requête attend sur un verrou que la première soit commitée, puis ajoute',
				'Les deux sont stockés, en événements 8 et 9, et aucun écrivain ne s’aperçoit de l’autre'
			],
			answer: 0,
			why: 'Chaque ajout indique la version attendue. Un seul écrivain peut faire passer la version 7 à 8. L’autre reçoit un conflit et réessaie sur un historique frais, donc aucune décision n’est prise sur un état périmé et aucun verrou n’est tenu.'
		}
	],
	recall: {
		q: 'Mastodon garde les fils d’accueil dans Redis et ne stocke aucun événement. Est-ce du CQRS, et d’où une commande en event sourcing tire-t-elle son état courant ?',
		a: 'Oui : CQRS demande seulement un modèle pour les écritures et un autre pour les lectures. Une commande en event sourcing obtient son état en rejouant les événements de son stream dans l’ordre, depuis le premier ou depuis un snapshot.'
	},
	sources: [
		{ title: 'Martin Fowler, CQRS', url: 'https://martinfowler.com/bliki/CQRS.html' },
		{ title: 'Martin Fowler, Event Sourcing', url: 'https://martinfowler.com/eaaDev/EventSourcing.html' },
		{ title: 'mastodon/mastodon, app/lib/feed_manager.rb', url: `${REPO}/app/lib/feed_manager.rb#L335-L375` },
		{ title: 'mastodon/mastodon, feed_manager.rb : MAX_ITEMS', url: `${REPO}/app/lib/feed_manager.rb#L7-L8` },
		{ title: 'mastodon/mastodon, user.rb : régénérer le fil d’un utilisateur qui revient', url: `${REPO}/app/models/user.rb#L532-L553` },
		{ title: 'Temporal docs, Event History', url: `${TEMPORAL}/workflow-execution/event` },
		{ title: 'Temporal docs, Event History et replay', url: `${TEMPORAL}/encyclopedia/event-history` },
		{ title: 'Temporal docs, Continue-As-New', url: `${TEMPORAL}/workflow-execution/continue-as-new` }
	]
};
