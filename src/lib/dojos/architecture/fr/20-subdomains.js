const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'subdomains',
	part: 'Domaines et frontières',
	title: 'Sous-domaines cœur, support et générique',
	minutes: 10,
	hook: [
		'Un serveur de réseau social a besoin de beaucoup de choses : la connexion avec double authentification, un serveur OAuth pour les applis, des jobs en arrière-plan, une base de données, la recherche, le stockage des médias, et les timelines pour lesquelles les gens sont venus. Mastodon doit offrir tout ça. Qui construit quoi ?',
		'Sans plan, les bons ingénieurs choisissent les problèmes techniques intéressants. Eric Evans : **« les développeurs rares et très qualifiés ont tendance à graviter vers l’infrastructure technique »**. Les meilleurs écrivent alors une file de jobs, et la partie qui rend le produit unique revient à celui qui est disponible.',
		'Le domain-driven design classe chaque partie du métier en cœur, support ou générique, et répartit les gens différemment dans chaque groupe. Le classement de Mastodon se lit à deux endroits : le `Gemfile` liste ce qu’il a adopté, et `app/` contient ce qu’il a construit.'
	],
	terms: [
		{ term: 'Sous-domaine', def: 'Un pan de ce que fait le métier : livrer les posts aux abonnés, connecter les utilisateurs, permettre aux admins de régler des paramètres.' },
		{ term: 'Cœur (core)', def: 'Ce qui te distingue de tes concurrents. C’est complexe et ça change souvent, donc tu le construis en interne avec tes meilleurs éléments.' },
		{ term: 'Support (supporting)', def: 'Nécessaire au métier mais sans avantage sur les concurrents. C’est en général simple, donc tu le construis à moindre coût ou tu le sous-traites.' },
		{ term: 'Générique (generic)', def: 'Un problème que tout le monde a et que quelqu’un a déjà bien résolu. Tu l’achètes, ou tu adoptes de l’open source.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['core["Cœur : réseau social fédéré"]', 'core --> fan["Timelines : fan-out à l’écriture"]', 'core --> ap["Fédération : ActivityPub"]'],
				highlight: ['core', 'fan', 'ap'],
				note: 'Le README décrit un « social network server based on ActivityPub », où les utilisateurs « can seamlessly communicate with users from another » serveur, avec des « real-time, chronological timeline updates ». Ma lecture : les timelines et la fédération forment le cœur. L’équipe Mastodon pourrait classer autrement.'
			},
			{
				add: ['supp["Support : réglages admin, export de données, règles de rate limit"]'],
				highlight: ['supp'],
				note: 'Les réglages admin, l’export de données et les règles de rate limit relèvent du support. Les utilisateurs et les admins en ont besoin, mais personne ne choisit un réseau social pour sa page d’export. Mastodon les construit en interne et les garde simples.'
			},
			{
				add: ['gems["Devise, Doorkeeper, Sidekiq, Chewy, Paperclip"]', 'infra[("Postgres, Redis, Elasticsearch, S3")]', 'fan -->|"les fils d’accueil sont des sorted sets Redis"| infra', 'gems --> infra', 'class gems,infra ext'],
				highlight: ['gems', 'infra'],
				note: 'La connexion, OAuth, les jobs, la recherche, les pièces jointes et les bases de données sont génériques, et Mastodon les adopte. Chacun représente des années de travail faites par d’autres. La flèche qui part des timelines montre que **le cœur stocke les fils d’accueil dans Redis**, sans moteur de stockage à lui.'
			},
			{
				add: ['held["lib/chewy, lib/paperclip : extensions Mastodon dans les namespaces des bibliothèques"] --> gems'],
				highlight: ['held'],
				note: 'Mastodon adopte Chewy et Paperclip, puis les étend dans son propre dossier `lib/`, sous les noms de modules des bibliothèques elles-mêmes. ActivityPub est un standard ouvert, pourtant Mastodon l’implémente en interne, parce que la fédération est ce que fait le produit.'
			}
		]
	},
	example: {
		title: 'app/services/fan_out_on_write_service.rb : le cœur, sur des briques adoptées',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/app/services/fan_out_on_write_service.rb#L12-L47`,
		lang: 'ruby',
		code: `  def call(status, options = {})
    @status    = status
    @account   = status.account
    @options   = options

    return if @status.proper.account.suspended?

    warm_payload_cache!

    fan_out_to_local_recipients!
    fan_out_to_public_recipients! if broadcastable?
    fan_out_to_public_streams! if broadcastable?
  end

  private

  def fan_out_to_local_recipients!
    deliver_to_self!

    unless @options[:skip_notifications]
      notify_quoted_account!
      notify_mentioned_accounts!
      notify_about_update! if update?
    end

    case @status.visibility.to_sym
    when :public, :unlisted, :private
      deliver_to_all_followers!
      deliver_to_lists!
    when :limited
      deliver_to_mentioned_followers!
    else
      deliver_to_mentioned_followers!
      deliver_to_conversation!
    end
  end`,
		notes: [
			'Les lignes 10 à 12 et 26 à 35 sont de la logique **cœur** : elles décident qui reçoit un nouveau post, selon la visibilité, les mentions, les listes et les hashtags. Aucune bibliothèque ne connaît ces règles, parce que Mastodon les a écrites.',
			'Chaque livraison dans un fil d’accueil finit dans [`FeedManager`](' + MASTODON + '/app/lib/feed_manager.rb#L74-L84), qui écrit dans un sorted set Redis et garde au plus 800 éléments par fil (la limite est dans les sources). Il ignore aussi les utilisateurs qui ne se sont pas connectés récemment, une règle produit écrite dans le code de Mastodon.',
			'Les parties génériques sont dans le [`Gemfile`](' + MASTODON + '/Gemfile#L8-L49) : `rails`, `pg`, `kt-paperclip`, `chewy`, `devise`, `devise-two-factor`, `omniauth`, `doorkeeper`. Plus bas, `sidekiq` fait tourner les jobs et `json-ld` parse les documents ActivityPub.',
			'Les modèles adoptés entrent dans le cœur. Un post [`belongs_to :application, class_name: \'Doorkeeper::Application\'`](' + MASTODON + '/app/models/status.rb#L75), donc la table des posts pointe vers la table de la bibliothèque OAuth. Remplacer Doorkeeper toucherait chaque post.'
		]
	},
	tradeoff: {
		gain: [
			'Le classement te dit où mettre les gens : les meilleurs sur les timelines et la fédération, et personne pour réécrire un système de connexion ou une file de jobs.',
			'Pour une partie générique, la réponse par défaut est « adopter », et la construire demande une raison écrite.',
			'Chaque mise à jour de gem apporte des corrections et des fonctionnalités que l’équipe Mastodon n’a pas eu à écrire.'
		],
		cost: [
			'Chaque système adopté est une dépendance que tu ne contrôles pas, et son modèle de données limite le tien, comme la table Doorkeeper vers laquelle pointe chaque post.',
			'Étendre une partie générique dans ton propre code brouille qui en est propriétaire : la [stratégie Chewy](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L3-L5) de Mastodon est déclarée comme `module Chewy`, donc le nom du module désigne la bibliothèque.',
			'Deux architectes peuvent classer le même système différemment, parce que chaque étiquette relève du jugement. Le classement change aussi quand le métier change.'
		]
	},
	task: {
		prompt: 'Une appli SaaS de facturation ajoute « payer cette facture en ligne ». Il faut : le paiement par carte, une page de paiement aux couleurs du client, des relances automatiques selon un calendrier que chaque client peut régler, et un reçu en PDF. Classe chaque partie : cœur, support ou générique. Puis dis ce que tu construirais et ce que tu adopterais.',
		hint: 'Pour chaque partie, demande-toi : un client choisirait-il ce produit plutôt qu’un concurrent grâce à elle ? Et quelqu’un l’a-t-il déjà bien résolue ?',
		answer: [
			'Paiement par carte : générique. Adopte un prestataire de paiement. Construire le traitement des cartes t’apporte du travail de conformité et ne donne aux clients aucune raison de te choisir.',
			'Reçus PDF : générique. Adopte une bibliothèque ou un service PDF. Personne ne change d’outil de facturation pour un moteur de rendu PDF.',
			'Règles de relance : **cœur**, si se faire payer plus vite est la raison pour laquelle les clients te choisissent. Construis-les en interne avec tes meilleurs éléments, sur un planificateur de jobs adopté.',
			'Page de paiement personnalisée : support. Les clients s’y attendent, mais un template simple suffit, donc construis-la à moindre coût.',
			'Cette seule fonctionnalité contient trois sortes de sous-domaines, donc tu classes chaque partie séparément.'
		]
	},
	quiz: [
		{
			q: 'Ton équipe a un ingénieur senior disponible ce trimestre. Selon la classification en sous-domaines, sur quoi doit-il travailler ?',
			options: ['Sur les parties génériques, puisque ce sont les plus difficiles à bien intégrer', 'Sur les sous-domaines de support, puisqu’ils sont simples et donnent des victoires rapides', 'Là où le backlog est le plus long, pour que l’équipe rattrape son retard au plus vite', 'Sur le domaine cœur, la partie qui rend le produit différent'],
			answer: 3,
			why: 'Evans : « Mettez les meilleurs talents sur le domaine cœur. » Les parties génériques s’adoptent et les parties de support restent simples, donc aucune des deux n’a besoin de l’ingénieur senior.'
		},
		{
			q: 'Dans Mastodon, d’où viennent la connexion par mot de passe et la double authentification ?',
			options: ['De gems adoptées, Devise et devise-two-factor', 'De code écrit en interne sous `app/services`', 'Du standard ActivityPub', 'D’Elasticsearch'],
			answer: 0,
			why: 'La connexion est générique, donc Mastodon adopte `devise` et `devise-two-factor`, tous deux listés dans le Gemfile. Son propre code va dans les timelines et la fédération.'
		},
		{
			q: 'ActivityPub est un standard ouvert, et pourtant Mastodon l’implémente dans son propre code. Qu’est-ce que ça montre ?',
			options: ['Les standards sont toujours du cœur, parce que tout produit en dépend', 'Mastodon n’a pas trouvé de bibliothèque assez mûre pour la réutiliser telle quelle', 'Ce qui est générique pour la plupart peut être du cœur pour une entreprise, quand c’est son produit', 'ActivityPub est un sous-domaine de support, donc on peut le construire en interne'],
			answer: 2,
			why: 'La plupart des applis adoptent une bibliothèque pour un protocole. Mastodon est un réseau fédéré, donc la fédération est son produit et reçoit du code maison. La même technologie peut être générique pour un métier et cœur pour un autre.'
		}
	],
	recall: {
		q: 'Quelles parties de Mastodon sont du cœur, et où vois-tu ce qu’il a adopté au lieu de le construire ?',
		a: 'Les timelines (fan-out à l’écriture) et la fédération ActivityPub sont le cœur. Les parties génériques adoptées, comme Devise, Doorkeeper, Sidekiq et Chewy, sont listées dans le `Gemfile`.'
	},
	sources: [
		{ title: 'Evans, DDD Reference: Core Domain and Generic Subdomains (pp. 40-41)', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'Mastodon, README', url: `${MASTODON}/README.md?plain=1#L21-L38` },
		{ title: 'Mastodon, Gemfile', url: `${MASTODON}/Gemfile` },
		{ title: 'Mastodon, fan_out_on_write_service.rb', url: `${MASTODON}/app/services/fan_out_on_write_service.rb#L12-L47` },
		{ title: 'Mastodon, feed_manager.rb, items per feed', url: `${MASTODON}/app/lib/feed_manager.rb#L7-L8` }
	]
};
