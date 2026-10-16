const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'subdomains',
	part: 'Domaines et frontières',
	title: 'Cœur, support, générique',
	minutes: 10,
	hook: [
		'Un serveur de réseau social a besoin de beaucoup de choses : la connexion avec double authentification, un serveur OAuth pour les applis, des jobs en arrière-plan, une base de données, la recherche, le stockage des médias, et les timelines pour lesquelles les gens sont vraiment venus. Mastodon doit offrir tout ça. Qui construit quoi ?',
		'Livrés à eux-mêmes, les bons ingénieurs dérivent vers les problèmes techniques amusants. Eric Evans l’a dit sans détour : **« les développeurs rares et très qualifiés ont tendance à graviter vers l’infrastructure technique »**. Résultat : les meilleurs finissent par écrire une file de jobs, pendant que la partie qui rend le produit unique récupère celui qui est disponible.',
		'Le domain-driven design te donne un outil contre cette dérive : classer chaque partie du métier en **cœur, support ou générique**. Le classement de Mastodon se lit dans deux fichiers : le `Gemfile` liste ce qu’il a adopté, et `app/` contient ce qu’il a construit.'
	],
	terms: [
		{ term: 'Sous-domaine', def: 'Un pan de ce que fait le métier : livrer les posts aux abonnés, connecter les utilisateurs, permettre aux admins de régler des paramètres.' },
		{ term: 'Cœur (core)', def: 'Ce qui te distingue de tes concurrents. Complexe, change souvent. À construire en interne avec tes meilleurs éléments.' },
		{ term: 'Support (supporting)', def: 'Nécessaire au métier mais sans avantage concurrentiel. En général simple. À construire à moindre coût, ou à sous-traiter.' },
		{ term: 'Générique (generic)', def: 'Un problème que tout le monde a et que quelqu’un a déjà bien résolu. À acheter, ou à adopter en open source.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['core["Cœur : réseau social fédéré"]', 'core --> fan["Timelines : fan-out à l’écriture"]', 'core --> ap["Fédération : ActivityPub"]'],
				highlight: ['core', 'fan', 'ap'],
				note: '**Cœur.** Le README : un « social network server based on ActivityPub », où les utilisateurs « can seamlessly communicate with users from another » serveur, avec des « real-time, chronological timeline updates ». Ma lecture : les timelines et la fédération sont ce qui fait Mastodon. C’est un jugement, et l’équipe pourrait le discuter.'
			},
			{
				add: ['supp["Support : réglages admin, export de données, règles de rate limit"]'],
				highlight: ['supp'],
				note: '**Support.** Les utilisateurs et les admins en ont besoin, mais personne ne choisit un réseau social pour sa page d’export. Construit en interne et gardé simple.'
			},
			{
				add: ['gems["Devise, Doorkeeper, Sidekiq, Chewy, Paperclip"]', 'infra[("Postgres, Redis, Elasticsearch, S3")]', 'fan -->|"les fils d’accueil sont des sorted sets Redis"| infra', 'gems --> infra', 'class gems,infra ext'],
				highlight: ['gems', 'infra'],
				note: '**Générique, adopté.** Connexion, OAuth, jobs, recherche, pièces jointes, bases de données. Chacun représente des années de travail faites par d’autres. Remarque la flèche qui part des timelines : le cœur est **construit par-dessus** Redis, pas sur un moteur de stockage maison.'
			},
			{
				add: ['held["lib/chewy, lib/paperclip : extensions Mastodon dans les namespaces des bibliothèques"] --> gems'],
				highlight: ['held'],
				note: '**Le cas compliqué.** Mastodon adopte Chewy et Paperclip, puis les étend dans son propre dossier `lib/`, sous les noms de modules des bibliothèques elles-mêmes. Adoptés, mais gardés très près. Et ActivityPub est un standard ouvert, pourtant Mastodon l’implémente en interne, parce que la fédération, c’est le produit.'
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
			'C’est de la logique **cœur** : qui reçoit un nouveau post, selon la visibilité, les mentions, les listes et les hashtags. Aucune bibliothèque ne connaît ces règles. Elles sont le produit de Mastodon.',
			'Elle est construite sur des parties adoptées. Chaque livraison dans un fil d’accueil finit dans [`FeedManager`](' + MASTODON + '/app/lib/feed_manager.rb#L74-L84), qui écrit dans un sorted set Redis et garde au plus [800 éléments par fil](' + MASTODON + '/app/lib/feed_manager.rb#L7-L8). Il ignore aussi les utilisateurs qui ne se sont pas connectés récemment : encore une règle produit, pas une règle de stockage.',
			'Les parties génériques sont dans le [`Gemfile`](' + MASTODON + '/Gemfile#L8-L49) : `rails`, `pg`, `kt-paperclip`, `chewy`, `devise`, `devise-two-factor`, `omniauth`, `doorkeeper`. Plus bas, `sidekiq` pour les jobs et `json-ld` pour parser les documents ActivityPub.',
			'Les modèles adoptés débordent dans le cœur. Un post [`belongs_to :application, class_name: \'Doorkeeper::Application\'`](' + MASTODON + '/app/models/status.rb#L75) : la table des posts pointe vers la table de la bibliothèque OAuth. Remplacer Doorkeeper toucherait chaque post.'
		]
	},
	tradeoff: {
		gain: [
			'Une règle pour répartir les gens : les meilleurs sur les timelines et la fédération, personne pour réécrire un système de connexion ou une file de jobs.',
			'Une règle pour acheter : si c’est générique, la réponse par défaut est « adopter », et construire demande une raison.',
			'Les parties adoptées s’améliorent sans toi : chaque mise à jour de gem apporte des corrections et des fonctionnalités que l’équipe n’a pas eu à écrire.'
		],
		cost: [
			'Chaque système adopté est une dépendance que tu ne contrôles pas. Son modèle devient ta limite, comme la table Doorkeeper vers laquelle pointe chaque post.',
			'Garder la partie générique trop près brouille la frontière : la [stratégie Chewy](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L3-L5) de Mastodon est déclarée comme `module Chewy` dans l’arborescence même de Mastodon, donc le nom du module ne te dit plus à qui appartient le code.',
			'Les étiquettes sont un jugement, pas des faits. Deux architectes peuvent classer le même système différemment, et le classement change quand le métier change.'
		]
	},
	task: {
		prompt: 'Une appli SaaS de facturation ajoute « payer cette facture en ligne ». Il faut : le paiement par carte, une page de paiement aux couleurs du client, des relances automatiques selon un calendrier que chaque client peut régler, et un reçu en PDF. Classe chaque partie : cœur, support ou générique. Puis dis ce que tu construirais et ce que tu adopterais.',
		hint: 'Pour chaque partie, demande-toi : un client choisirait-il ce produit plutôt qu’un concurrent grâce à elle ? Et quelqu’un l’a-t-il déjà bien résolue ?',
		answer: [
			'**Paiement par carte : générique.** Adopte un prestataire de paiement. Construire le traitement des cartes t’apporte du travail de conformité et aucun avantage.',
			'**Reçus PDF : générique.** Adopte une bibliothèque ou un service PDF. Personne ne change d’outil de facturation pour un moteur de rendu PDF.',
			'**Règles de relance : cœur**, si se faire payer plus vite est la raison pour laquelle les clients te choisissent. Construis-les en interne avec tes meilleurs éléments, sur un planificateur de jobs adopté.',
			'**Page de paiement personnalisée : support.** Les clients s’y attendent, mais un template simple suffit. Construis-la à moindre coût.',
			'Leçon : une seule fonctionnalité peut contenir plusieurs sous-domaines. Classe les parties, pas la fonctionnalité.'
		]
	},
	quiz: [
		{
			q: 'Ton équipe a un ingénieur senior disponible ce trimestre. Selon la classification en sous-domaines, sur quoi doit-il travailler ?',
			options: ['Sur les parties génériques, puisque ce sont les plus difficiles à bien intégrer', 'Sur les sous-domaines de support, puisqu’ils sont simples et donnent des victoires rapides', 'Là où le backlog est le plus long, pour que l’équipe rattrape son retard au plus vite', 'Sur le domaine cœur, la partie qui rend le produit différent'],
			answer: 3,
			why: 'Evans : « Mettez les meilleurs talents sur le domaine cœur. » Les parties génériques doivent être adoptées, les parties de support gardées simples. La classification est un outil pour répartir les gens.'
		},
		{
			q: 'Dans Mastodon, d’où viennent la connexion par mot de passe et la double authentification ?',
			options: ['De gems adoptées, Devise et devise-two-factor', 'De code écrit en interne sous `app/services`', 'Du standard ActivityPub', 'D’Elasticsearch'],
			answer: 0,
			why: 'La connexion est générique, donc elle est adoptée et listée dans le Gemfile. L’effort propre de Mastodon va dans les timelines et la fédération.'
		},
		{
			q: 'ActivityPub est un standard ouvert, et pourtant Mastodon l’implémente dans son propre code. Qu’est-ce que ça montre ?',
			options: ['Les standards sont toujours du cœur, parce que tout produit en dépend', 'Mastodon n’a pas trouvé de bibliothèque assez mûre pour la réutiliser telle quelle', 'Ce qui est générique pour la plupart peut être du cœur pour une entreprise, quand c’est son produit', 'ActivityPub est un sous-domaine de support, donc on peut le construire en interne'],
			answer: 2,
			why: 'Pour la plupart des applis, un protocole, ça s’adopte. Pour un réseau fédéré, la fédération est sa raison d’être, donc elle reçoit l’effort interne. Le classement dépend de ton métier, pas de la technologie.'
		}
	],
	takeaway: 'Construis le cœur avec tes meilleurs éléments, garde les parties de support simples, adopte les génériques, et note chaque exception.',
	sources: [
		{ title: 'Evans, DDD Reference: Core Domain and Generic Subdomains (pp. 40-41)', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'Mastodon, README', url: `${MASTODON}/README.md?plain=1#L21-L38` },
		{ title: 'Mastodon, Gemfile', url: `${MASTODON}/Gemfile` },
		{ title: 'Mastodon, fan_out_on_write_service.rb', url: `${MASTODON}/app/services/fan_out_on_write_service.rb#L12-L47` }
	]
};
