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
		],
		steps: [
			{
				title: 'Pose les deux questions',
				questions: [
					{ q: 'Quelle question te dit qu’une partie relève du cœur ?', options: ['Est-ce la partie la plus dure à construire ?', 'Un client choisirait-il ce produit plutôt qu’un concurrent grâce à elle ?', 'Est-ce le code le plus récent du dépôt ?', 'A-t-elle besoin d’une base de données ?'], answer: 1, why: 'Le cœur, c’est ce qui te distingue. Dur ou nouveau, ce n’est pas le critère.' },
					{ q: 'Quelle question te dit qu’une partie est générique ?', options: ['Change-t-elle souvent ?', 'Le client la voit-il ?', 'Quelqu’un l’a-t-il déjà bien résolue ?', 'Est-elle amusante à construire ?'], answer: 2, why: 'Générique veut dire que tout le monde a le problème et qu’une bonne réponse existe à acheter ou à adopter.' },
					{ q: 'Qu’est-ce qui fait qu’une partie relève du support ?', options: ['C’est ce qui te distingue', 'C’est un problème que tout le monde a déjà résolu', 'Personne ne s’en sert', 'Le métier en a besoin, mais elle ne donne aucun avantage, et elle est en général simple'], answer: 3, why: 'Nécessaire, mais aucun client ne te choisit pour elle, donc tu la gardes simple.' },
					{ q: 'Pourquoi classer les parties ?', options: ['Sans ça, les meilleurs ont tendance à partir vers l’infrastructure technique', 'Pour choisir un fournisseur cloud', 'Pour réduire le nombre de lignes de code', 'Pour choisir un seul langage pour tout'], answer: 0, why: 'Evans prévient que les développeurs qualifiés gravitent vers l’infrastructure, et le cœur revient à celui qui est disponible.' }
				]
			},
			{
				title: 'Classe chaque partie',
				questions: [
					{ q: 'Paiement par carte : cœur, support ou générique ?', options: ['Cœur', 'Support', 'Générique', 'Aucun des trois'], answer: 2, why: 'Tout le monde en a besoin, et les prestataires de paiement le résolvent déjà bien.' },
					{ q: 'Une page de paiement aux couleurs du client ?', options: ['Cœur', 'Support', 'Générique', 'Aucun des trois'], answer: 1, why: 'Les clients s’y attendent, mais personne ne choisit un outil de facturation pour sa page de paiement.' },
					{ q: 'Des relances selon un calendrier que chaque client règle, quand se faire payer plus vite est la raison pour laquelle les clients te choisissent ?', options: ['Cœur', 'Support', 'Générique', 'Aucun des trois'], answer: 0, why: 'C’est la raison pour laquelle les clients te préfèrent à un concurrent. C’est le cœur.' },
					{ q: 'Un reçu en PDF ?', options: ['Cœur', 'Support', 'Générique', 'Aucun des trois'], answer: 2, why: 'Personne ne change d’outil de facturation pour un moteur de rendu PDF, et il en existe de bons.' }
				]
			},
			{
				title: 'Construis ou adopte',
				questions: [
					{ q: 'Paiement par carte : construire ou adopter ?', options: ['Construire le traitement des cartes en interne', 'Adopter un prestataire de paiement', 'Le confier à ton meilleur ingénieur', 'Le sortir de la fonctionnalité'], answer: 1, why: 'Le construire t’apporte du travail de conformité et ne donne aux clients aucune raison de te choisir.' },
					{ q: 'Règles de relance : construire ou adopter ?', options: ['Adopter un produit de relance tel quel', 'Les construire en interne, y compris ta propre file de jobs', 'Les construire en interne avec tes meilleurs éléments, sur un planificateur de jobs adopté', 'Laisser le support les envoyer à la main'], answer: 2, why: 'Construis le cœur, mais pas les briques génériques en dessous. Mastodon écrit ses propres règles de timeline et stocke les fils d’accueil dans Redis.' },
					{ q: 'La page de paiement personnalisée : comment la construis-tu ?', options: ['Mets ton meilleur ingénieur dessus', 'Écris d’abord un moteur de thèmes complet', 'Adopte la page du prestataire et laisse tomber les couleurs du client', 'Construis-la à moindre coût, avec un template simple'], answer: 3, why: 'Les parties support se construisent à moindre coût et restent simples.' },
					{ q: 'Reçus PDF : construire ou adopter ?', options: ['Adopter une bibliothèque ou un service PDF', 'Écrire ton propre moteur de rendu PDF', 'Le traiter comme du cœur, puisque chaque facture en a un', 'Le confier à l’ingénieur senior'], answer: 0, why: 'Pour une partie générique, la réponse par défaut est « adopter ».' }
				]
			},
			{
				title: 'Compare avec Mastodon',
				questions: [
					{ q: 'Les timelines de Mastodon relèvent du cœur. Où stocke-t-il les fils d’accueil ?', options: ['Dans un moteur de stockage à lui', 'Dans des sorted sets Redis', 'Dans Elasticsearch', 'Dans S3'], answer: 1, why: 'Les règles du cœur sont maison, et le stockage en dessous est adopté.' },
					{ q: 'Où vois-tu ce que Mastodon a adopté ?', options: ['Dans `app/services`', 'Dans le README', 'Dans la spec ActivityPub', 'Dans le `Gemfile`'], answer: 3, why: 'Devise, Doorkeeper, Sidekiq et Chewy y sont tous listés.' },
					{ q: 'Que te coûte un prestataire de paiement adopté, comme Doorkeeper dans Mastodon ?', options: ['Rien : les parties adoptées sont gratuites', 'Il ralentit le cœur', 'Une dépendance que tu ne contrôles pas, dont le modèle de données limite le tien', 'Une réécriture chaque année'], answer: 2, why: 'Chaque post de Mastodon pointe vers une table Doorkeeper, donc la remplacer toucherait chaque post.' },
					{ q: 'Une seule fonctionnalité contient trois sortes de sous-domaines. Qu’en déduis-tu ?', options: ['Tu classes chaque partie séparément', 'Tu classes toute la fonctionnalité en cœur', 'Tu la classes en générique et tu adoptes tout', 'Tu fais voter l’équipe une fois pour la fonctionnalité'], answer: 0, why: 'Les étiquettes s’appliquent aux parties, pas aux fonctionnalités. Chaque partie a sa propre réponse.' }
				]
			}
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
