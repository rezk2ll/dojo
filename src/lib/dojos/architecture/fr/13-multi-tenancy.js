const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const MULTISITE = 'https://github.com/discourse/rails_multisite/blob/86c6ce96e2599d5fe20dd6024f1cdcc76f795da3';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'multi-tenancy',
	part: 'À l’intérieur d’un service',
	title: 'Multi-tenant : à qui sont ces données ?',
	minutes: 10,
	hook: [
		'Tu héberges des forums pour cent clients. Une seule installation de Discourse peut tous les servir : Discourse appelle ça le **multisite**. Avant de faire quoi que ce soit avec une requête, il doit répondre à une question : **à qui sont ces données ?** Il suffit de se tromper une fois pour qu’un client lise les sujets privés d’un autre.',
		'Discourse répond grâce au **nom d’hôte** de la requête. `forum.shop-a.example` est un site, `forum.shop-b.example` en est un autre. À partir de là, le site voyage avec chaque appel : vers sa propre base PostgreSQL, dans chaque clé Redis, dans chaque job en arrière-plan.',
		'Ce que les tenants partagent, ce n’est pas oui ou non. C’est un **spectre** : de tout partager jusqu’à un déploiement par tenant. Le multisite de Discourse se place au milieu, volontairement, et il le paie d’une façon bien précise.'
	],
	terms: [
		{ term: 'Tenant', def: 'Tenant (locataire) : un client dont les données doivent rester séparées de celles des autres. Dans le multisite de Discourse, un tenant est un site, identifié par son nom d’hôte.' },
		{ term: 'Multi-tenant', def: 'Un seul système en marche qui sert plusieurs tenants, au lieu d’une copie par tenant.' },
		{ term: 'Niveau d’isolation', def: 'Ce que les tenants partagent : les mêmes tables, le même serveur mais des bases à eux, ou un déploiement à eux. Plus d’isolation coûte plus cher à faire tourner.' },
		{ term: 'Noisy neighbour', def: 'Noisy neighbour (voisin bruyant) : la charge d’un tenant qui ralentit les autres, parce qu’ils partagent du CPU, des workers ou une base de données.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['a(["forum.shop-a.example"]) -->|nom d’hôte| mw["RailsMultisite::Middleware"]', 'b(["forum.shop-b.example"]) -->|nom d’hôte| mw'],
				highlight: ['a', 'b', 'mw'],
				note: 'Un seul ensemble de processus pour tout le monde. Le middleware cherche l’hôte de la requête dans `config/multisite.yml`. Hôte inconnu : **404 « not found »**, avant que Rails ne lance le moindre contrôleur.'
			},
			{
				add: ['mw -->|"establish_connection"| pg[("PostgreSQL : une base par site")]'],
				highlight: ['pg'],
				note: 'Chaque entrée de `multisite.yml` nomme sa propre `database` et ses `host_names`. Le middleware se connecte à cette base pour la requête en cours. Une requête SQL ne peut pas atteindre les lignes d’un autre site : **elles sont dans une autre base**.'
			},
			{
				add: ['mw --> redis["Redis partagé : chaque clé préfixée par le nom du site"]'],
				highlight: ['redis'],
				note: 'Redis, c’est un seul serveur pour tous les sites. `DiscourseRedis` préfixe chaque clé avec le site courant. Pour partager une clé entre sites, le code doit appeler `without_namespace` exprès.'
			},
			{
				add: ['mw -->|"Jobs.enqueue ajoute current_site_id"| sk["Files et workers Sidekiq partagés"]', 'sk -->|"with_connection(site)"| pg'],
				highlight: ['sk'],
				note: 'Les jobs de tous les sites vont dans les **mêmes files**. Chaque job porte `current_site_id`, et le worker se connecte à la base de ce site avant de le lancer. C’est là qu’un noisy neighbour fait mal.'
			},
			{
				add: ['s1["Tout partagé : une base, colonne tenant_id"] -->|plus d’isolation| s2["Processus partagés, une base par tenant : multisite Discourse"] -->|plus d’isolation| s3["Un déploiement par tenant"]'],
				highlight: ['s1', 's2', 's3'],
				note: 'Le spectre. À gauche : le moins cher, un seul `WHERE` raté et les données fuient. À droite : l’isolation la plus forte, un déploiement à faire tourner et à mettre à jour par client. Le multisite est au **milieu** : données isolées, calcul partagé.'
			}
		]
	},
	example: {
		title: 'app/jobs/base.rb, Jobs.enqueue',
		repo: 'discourse/discourse',
		url: `${REPO}/app/jobs/base.rb#L379-L392`,
		lang: 'ruby',
		code: `  def self.enqueue(job, opts = {})
    if job.instance_of?(Class)
      klass = job
    else
      klass = "::Jobs::#{job.to_s.camelcase}".constantize
    end

    # Unless we want to work on all sites
    unless opts.delete(:all_sites)
      opts[:current_site_id] ||= RailsMultisite::ConnectionManagement.current_db
    end

    delay = opts.delete(:delay_for)
    queue = opts.delete(:queue)`,
		notes: [
			'Le **site est la clé du tenant**, et il est ajouté pour toi. Le code qui met un job en file n’a jamais à nommer le site. La file vient de `opts[:queue]` ou de la classe du job, jamais du site.',
			'Côté worker, [`Jobs::Base#perform`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/jobs/base.rb#L289-L300) lance le job dans `with_connection(db)` pour ce seul site. Sans `current_site_id`, il boucle sur `all_dbs` : **tous les sites**.',
			'« Aucun tenant », ça se dit tout haut. `all_sites: true` est un flag explicite, et [`without_namespace`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/lib/discourse_redis.rb#L23-L26) porte le commentaire « Only use this if you want to store and fetch data that’s shared between sites ».',
			'Le côté requête vit dans une gem de Discourse : [le middleware](https://github.com/discourse/rails_multisite/blob/86c6ce96e2599d5fe20dd6024f1cdcc76f795da3/lib/rails_multisite/middleware.rb#L9-L30) renvoie 404 pour un hôte inconnu, puis se connecte à la base du site pour le reste de la requête.'
		]
	},
	tradeoff: {
		gain: [
			'Un bug dans une requête SQL ne peut pas faire fuiter des données d’un site à l’autre : les données de l’autre site sont dans une autre base.',
			'Un site, c’est une base, donc on peut le sauvegarder, le restaurer ou le déplacer tout seul.',
			'Les processus, Redis et les workers sont partagés, donc un forum calme ne coûte presque rien. Une seule installation peut héberger beaucoup de petits sites.'
		],
		cost: [
			'Chaque site a une base à créer et à migrer. La doc de Discourse cible un site avec `RAILS_DB=alternate rake db:migrate`.',
			'Des files Sidekiq partagées, ce sont des noisy neighbours. Une rafale de jobs d’un site attend dans les mêmes files que les jobs des autres sites.',
			'Chaque chemin de code doit porter le site. Un job poussé directement dans Sidekiq sans `current_site_id` tournerait sur tous les sites.'
		]
	},
	task: {
		prompt: 'Un gros client demande : « Notre forum peut-il tourner sur des serveurs qu’aucun autre client n’utilise ? » Place trois réponses sur le spectre du diagramme, et donne un coût pour chacune.',
		hint: 'Chaque site a déjà sa propre base. Qu’est-ce qu’on pourrait séparer d’autre : le serveur de base de données, Redis et les workers, le déploiement entier ?',
		answer: [
			'Leur propre **serveur PostgreSQL** : chaque entrée de `multisite.yml` est une config de base de données (`adapter`, `database`), donc elle peut nommer son propre `host` de base. Coût : un serveur de plus à faire tourner, alors que Redis et Sidekiq restent partagés.',
			'Leurs propres **workers** : rien dans le code multisite que tu as lu ne donne à un site ses propres files. La file vient du job ou de l’appelant, pas du site. Pour ça, il faut une installation séparée.',
			'Un **déploiement dédié** : leur propre appli, PostgreSQL, Redis et Sidekiq. Coût : une stack complète de plus à mettre à jour et à surveiller, pour un seul client.',
			'Le réflexe d’architecte : demander ce qu’ils craignent vraiment (qu’un autre tenant **lise** leurs données, ou qu’un autre tenant **les ralentisse**) avant de choisir. Le premier cas est déjà traité. Le second demande du calcul séparé.'
		]
	},
	quiz: [
		{
			q: 'Dans un système multi-tenant, qu’est-ce qu’un noisy neighbour ?',
			options: ['Un tenant qui peut lire les données d’un autre tenant', 'Un tenant dont la charge ralentit les autres, parce qu’ils partagent du calcul, des workers ou une base de données', 'Un tenant qui ouvre trop de tickets de support', 'Un serveur placé à côté d’un autre dans la même baie'],
			answer: 1,
			why: 'Une fuite de données est un problème d’isolation. Un noisy neighbour est un problème de performance, causé par tout ce que les tenants partagent encore.'
		},
		{
			q: 'Le multisite de Discourse donne à chaque site sa propre base mais partage Sidekiq. Quel risque reste ouvert ?',
			options: ['Une requête SQL qui renvoie les sujets d’un autre site', 'Restaurer un site sans les autres', 'Une rafale de jobs d’un site qui retarde les autres', 'Déplacer un site vers un autre serveur de base de données'],
			answer: 2,
			why: 'Des bases séparées empêchent les fuites de données et rendent facile la restauration d’un seul site. Les files partagées, c’est là que vit le noisy neighbour.'
		},
		{
			q: 'Pourquoi `Jobs.enqueue` ajoute-t-il `current_site_id` à chaque job par défaut ?',
			options: ['Uniquement pour les logs', 'Parce que Sidekiq refuse les jobs qui ne l’ont pas', 'Pour choisir une file plus rapide pour les gros sites', 'Pour que le worker partagé se connecte à la base du bon site, au lieu de lancer le job sur tous les sites'],
			answer: 3,
			why: 'Les workers servent tous les sites. Sans l’identifiant du site, `perform` boucle sur `all_dbs`. Avec, le job tourne dans la connexion de ce seul site.'
		}
	],
	takeaway: 'Décide où les tenants sont séparés (données, cache, calcul) et fais en sorte qu’il soit impossible d’oublier le tenant dans le code.',
	sources: [
		{ title: 'Discourse docs, Set up a multisite development environment', url: `${REPO}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md` },
		{ title: 'Discourse, app/jobs/base.rb, Jobs.enqueue', url: `${REPO}/app/jobs/base.rb#L379-L392` },
		{ title: 'Discourse, lib/discourse_redis.rb, keys namespaced per site', url: `${REPO}/lib/discourse_redis.rb#L1-L26` },
		{ title: 'rails_multisite, middleware.rb', url: `${MULTISITE}/lib/rails_multisite/middleware.rb#L9-L30` },
		{ title: 'AWS Well-Architected SaaS Lens, Silo, Pool, and Bridge Models', url: 'https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html' }
	]
};
