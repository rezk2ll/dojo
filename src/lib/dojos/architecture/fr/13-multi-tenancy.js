const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const MULTISITE = 'https://github.com/discourse/rails_multisite/blob/86c6ce96e2599d5fe20dd6024f1cdcc76f795da3';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'multi-tenancy',
	part: 'À l’intérieur d’un service',
	title: 'Multi-tenant : à qui sont ces données ?',
	minutes: 10,
	hook: [
		'Tu héberges des forums pour cent clients. Une seule installation de Discourse peut tous les servir : Discourse appelle ça le **multisite**. Avant de faire quoi que ce soit avec une requête, il doit répondre à une question : à qui sont ces données ? S’il se trompe une seule fois, un client lit les sujets privés d’un autre.',
		'Discourse répond grâce au **nom d’hôte** de la requête. `forum.shop-a.example` est un site, `forum.shop-b.example` en est un autre. À partir de là, le site voyage avec chaque appel : vers sa propre base PostgreSQL, dans chaque clé Redis, dans chaque job en arrière-plan.',
		'Les tenants peuvent partager les mêmes tables, ou seulement le code avec un déploiement chacun, ou quelque chose entre les deux. Le multisite de Discourse se place au **milieu** : il partage les processus et donne à chaque site sa propre base.'
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
				note: 'Tous les sites partagent un seul serveur Redis. `DiscourseRedis` préfixe chaque clé avec le site courant. Pour partager une clé entre sites, le code doit appeler `without_namespace` exprès.'
			},
			{
				add: ['mw -->|"Jobs.enqueue ajoute current_site_id"| sk["Files et workers Sidekiq partagés"]', 'sk -->|"with_connection(site)"| pg'],
				highlight: ['sk'],
				note: 'Les jobs de tous les sites vont dans les **mêmes files**. Chaque job porte `current_site_id`, et le worker se connecte à la base de ce site avant de le lancer. Une rafale de jobs d’un site retarde les jobs de tous les autres sites dans ces files.'
			},
			{
				add: ['s1["Tout partagé : une base, colonne tenant_id"] -->|plus d’isolation| s2["Processus partagés, une base par tenant : multisite Discourse"] -->|plus d’isolation| s3["Un déploiement par tenant"]'],
				highlight: ['s1', 's2', 's3'],
				note: 'À gauche : le moins cher, et un seul `WHERE` raté fait fuiter les données. À droite : l’isolation la plus forte, avec un déploiement à faire tourner et à mettre à jour par client. Le multisite se place au **milieu** : chaque site a ses données à part, et tous les sites partagent le calcul.'
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
			'La ligne 10 ajoute le **site**, la clé du tenant, à chaque job. Le code qui met un job en file n’a jamais à nommer le site. La ligne 14 prend la file dans `opts[:queue]`, sinon la classe du job la choisit, jamais le site.',
			'Côté worker, [`Jobs::Base#perform`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/jobs/base.rb#L289-L300) lance le job dans `with_connection(db)` pour ce seul site. Sans `current_site_id`, il boucle sur `all_dbs` : **tous les sites**.',
			'La ligne 9 n’omet le site que si l’appelant passe `all_sites: true`. Dans Redis, [`without_namespace`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/lib/discourse_redis.rb#L23-L26) porte le commentaire « Only use this if you want to store and fetch data that’s shared between sites ».',
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
			'Tous les sites partagent les files Sidekiq. Une rafale de jobs d’un site attend dans les mêmes files que les jobs des autres sites.',
			'Chaque chemin de code qui met du travail en file doit porter `current_site_id`. Un job poussé directement dans Sidekiq sans lui tournerait sur tous les sites.'
		]
	},
	task: {
		prompt: 'Un gros client demande : « Notre forum peut-il tourner sur des serveurs qu’aucun autre client n’utilise ? » Place trois réponses sur le spectre du diagramme, et donne un coût pour chacune.',
		hint: 'Chaque site a déjà sa propre base. Qu’est-ce qu’on pourrait séparer d’autre : le serveur de base de données, Redis et les workers, le déploiement entier ?',
		answer: [
			'Leur propre **serveur de base de données** : chaque entrée de `multisite.yml` est une config de base de données (`adapter`, `database`), donc elle peut nommer son propre `host` de base. Coût : un serveur de plus à faire tourner, alors que Redis et Sidekiq restent partagés.',
			'Leurs propres **workers** : rien dans le code multisite que tu as lu ne donne à un site ses propres files. La file vient du job ou de l’appelant, pas du site. Pour avoir leurs propres workers, il leur faut une installation séparée.',
			'Un **déploiement dédié** : leur propre appli, PostgreSQL, Redis et Sidekiq. Coût : une stack complète de plus à mettre à jour et à surveiller, pour un seul client.',
			'Le réflexe d’architecte : avant de choisir, demande-leur ce qu’ils craignent. Les bases séparées empêchent déjà un autre tenant de lire leurs données. Pour qu’un autre tenant ne puisse pas **les ralentir**, il faut du calcul séparé.'
		],
		steps: [
			{
				title: 'Vois ce qui est partagé',
				questions: [
					{ q: 'Une requête arrive pour `forum.shop-c.example`, un hôte absent de `multisite.yml`. Que se passe-t-il ?', options: ['Elle retombe sur le premier site du fichier', 'Le middleware répond 404 avant que Rails lance le moindre contrôleur', 'Rails crée un nouveau site pour elle', 'Elle atteint le contrôleur sans base de données'], answer: 1, why: 'Le middleware est la première chose que rencontre une requête. Un hôte qu’il ne relie à aucun site n’atteint jamais Rails.' },
					{ q: 'Quelle partie du forum du gros client peux-tu déjà sauvegarder, restaurer ou déplacer à part ?', options: ['Ses clés Redis', 'Ses jobs Sidekiq en file', 'Sa base de données', 'Ses processus d’appli'], answer: 2, why: 'Un site, c’est une base. Redis, les files et les processus portent tous les sites à la fois.' },
					{ q: 'Un développeur a besoin d’une clé Redis que tous les sites peuvent lire. Qu’est-ce que le code doit appeler ?', options: ['`all_sites: true`', '`with_connection(site)`', '`establish_connection`', '`without_namespace`'], answer: 3, why: '`DiscourseRedis` préfixe chaque clé avec le site courant. Partager une clé entre sites demande `without_namespace`, exprès.' },
					{ q: 'Où se place le multisite sur le spectre ?', options: ['À gauche : tout partagé, une seule base', 'Au milieu : processus partagés, une base par site', 'À droite : un déploiement par tenant', 'Hors du spectre : il ne partage rien'], answer: 1, why: 'Des données à part, du calcul partagé. C’est le milieu du diagramme.' }
				]
			},
			{
				title: 'Sépare le serveur de base',
				questions: [
					{ q: 'Un site peut-il avoir son propre serveur de base de données ?', options: ['Oui, chaque entrée de `multisite.yml` est une config de base et peut nommer son propre `host`', 'Non, tous les sites doivent partager un seul serveur de base', 'Seulement avec une installation séparée', 'Seulement en forkant `rails_multisite`'], answer: 0, why: 'Une entrée a `adapter` et `database` comme toute config de base, donc un `host` y a sa place aussi.' },
					{ q: 'Qu’est-ce que ça coûte ?', options: ['Une stack complète par client', 'Un filtre tenant sur chaque requête SQL', 'Un serveur de plus à faire tourner, alors que Redis et Sidekiq restent partagés', 'Quitter le multisite pour de bon'], answer: 2, why: 'Ça ne déplace que les données. Les processus, Redis et les workers restent partagés.' },
					{ q: 'Une version ajoute une migration. Comment l’équipe la lance-t-elle sur la seule base du client ?', options: ['`rake db:migrate` ne lance déjà que le premier site', '`RAILS_DB=<leur site> rake db:migrate`', 'Impossible : les migrations tournent sur tous les sites ou aucun', 'En retirant les autres sites de `multisite.yml`'], answer: 1, why: 'Chaque site est une base à migrer. La doc de Discourse en cible une avec `RAILS_DB`.' },
					{ q: 'Quel risque était déjà écarté avant ce changement ?', options: ['Une rafale de jobs dans les files partagées', 'La charge sur les processus partagés', 'La mémoire utilisée sur le Redis partagé', 'Un autre tenant qui lit leurs données'], answer: 3, why: 'Les bases séparées empêchent déjà une requête SQL d’atteindre les lignes d’un autre site.' }
				]
			},
			{
				title: 'Sépare le calcul',
				questions: [
					{ q: 'Le multisite peut-il donner à un site ses propres files Sidekiq ?', options: ['Oui, en réglant une file par site dans `multisite.yml`', 'Oui, `Jobs.enqueue` choisit la file d’après le site', 'Non, la file vient du job ou de l’appelant, jamais du site', 'Non, Sidekiq n’accepte qu’une seule file'], answer: 2, why: '`Jobs.enqueue` prend la file dans `opts[:queue]` ou dans la classe du job. Le site n’y joue aucun rôle.' },
					{ q: 'Alors comment ont-ils des workers que personne d’autre n’utilise ?', options: ['En passant `all_sites: true` sur leurs jobs', 'Une installation séparée', 'En appelant `without_namespace`', 'En ajoutant une clé `queue` à leur entrée de `multisite.yml`'], answer: 1, why: 'Rien dans le code multisite que tu as lu ne sépare les workers par site. Une installation séparée, si.' },
					{ q: 'Que leur apporte un déploiement dédié ?', options: ['Leur propre appli, PostgreSQL, Redis et Sidekiq', 'Seulement leur propre base', 'Seulement leurs propres clés Redis', 'Une plus grosse part des workers partagés'], answer: 0, why: 'C’est le bout droit du spectre : rien de partagé à part le code.' },
					{ q: 'Que coûte un déploiement dédié ?', options: ['Des fuites de données par Redis', 'Des jobs qui tournent sur tous les sites', 'Un 404 pour leur nom d’hôte', 'Une stack complète de plus à mettre à jour et à surveiller, pour un seul client'], answer: 3, why: 'L’isolation la plus forte veut dire un déploiement de plus à faire tourner et à mettre à jour.' }
				]
			},
			{
				title: 'Demande ce qu’ils craignent',
				questions: [
					{ q: 'Avant d’en choisir une, que leur demandes-tu ?', options: ['Quel cloud ils préfèrent', 'Ce qu’ils craignent : qu’on lise leurs données, ou qu’on les ralentisse', 'Combien d’admins ils ont', 'S’ils utilisent déjà Redis'], answer: 1, why: 'Les deux craintes demandent des réponses différentes, et l’une est déjà traitée.' },
					{ q: 'Ils craignent qu’un autre tenant lise leurs données. Que réponds-tu ?', options: ['Les bases séparées l’empêchent déjà', 'Il leur faut un déploiement dédié', 'Il leur faut leur propre serveur Redis', 'Il leur faut leurs propres workers'], answer: 0, why: 'Les données d’un autre site sont dans une autre base. Un bug de requête ne peut pas franchir cette limite.' },
					{ q: 'Ils craignent qu’un autre tenant les ralentisse. Que réponds-tu ?', options: ['Leur propre base suffit', 'Préfixe leurs clés Redis', 'Il leur faut du calcul séparé, donc leur propre installation', 'Renvoie un 404 à tous les autres hôtes'], answer: 2, why: 'Un voisin bruyant vient du calcul partagé. Seuls des workers et des processus séparés le font disparaître.' },
					{ q: 'Pourquoi ne pas donner un déploiement dédié à chaque client ?', options: ['Ça fait fuiter des données par des tables partagées', 'Ça demande une colonne `tenant_id` sur chaque table', 'Sidekiq ne peut pas tourner par client', 'Chacun est une stack complète à faire tourner, alors que le calcul partagé rend un forum calme presque gratuit'], answer: 3, why: 'Plus d’isolation coûte plus cher à faire tourner. Le multisite permet à une seule installation d’héberger beaucoup de petits sites.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans un système multi-tenant, qu’est-ce qu’un noisy neighbour ?',
			options: ['Un tenant qui peut lire les données d’un autre tenant parce qu’une requête a oublié le filtre de tenant', 'Un tenant dont la charge ralentit les autres, parce qu’ils partagent du calcul, des workers ou une base de données', 'Un tenant qui ouvre tant de tickets de support que l’équipe n’a plus de temps pour les autres', 'Un serveur placé à côté d’un autre dans la même baie, si bien qu’une panne matérielle touche les deux'],
			answer: 1,
			why: 'Un tenant qui lit les données d’un autre, c’est un défaut d’isolation des données. Un noisy neighbour est un problème de performance : il vient du CPU, des workers ou de la base que les tenants partagent encore.'
		},
		{
			q: 'Le multisite de Discourse donne à chaque site sa propre base mais partage Sidekiq. Quel risque reste ouvert ?',
			options: ['Une requête SQL qui renvoie les sujets d’un autre site', 'Restaurer un site sans les autres', 'Une rafale de jobs d’un site qui retarde les autres', 'Déplacer un site vers un autre serveur de base de données'],
			answer: 2,
			why: 'Des bases séparées empêchent les fuites de données et rendent facile la restauration d’un seul site. Les files Sidekiq restent partagées : les jobs d’un site peuvent retarder ceux des autres.'
		},
		{
			q: 'Pourquoi `Jobs.enqueue` ajoute-t-il `current_site_id` à chaque job par défaut ?',
			options: ['Uniquement pour les logs, pour que chaque ligne de job indique de quel site elle vient', 'Parce que Sidekiq refuse de mettre en file un job sans identifiant de site dans son payload', 'Pour envoyer les jobs des gros sites vers une file plus rapide, avec plus de workers derrière', 'Pour que le worker partagé lance le job dans la base de ce site, pas sur tous les sites'],
			answer: 3,
			why: 'Les workers servent tous les sites. Sans l’identifiant du site, `perform` boucle sur `all_dbs`. Avec, le job tourne dans la connexion de ce seul site.'
		}
	],
	recall: {
		q: 'Dans le multisite de Discourse, que partagent les sites, et qu’est-ce que chaque site a pour lui seul ?',
		a: 'Les sites partagent les processus, un serveur Redis avec des clés préfixées par site, et les files Sidekiq. Chaque site a sa propre base PostgreSQL, choisie d’après le nom d’hôte de la requête.'
	},
	sources: [
		{ title: 'Discourse docs, Set up a multisite development environment', url: `${REPO}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md` },
		{ title: 'Discourse, app/jobs/base.rb, Jobs.enqueue', url: `${REPO}/app/jobs/base.rb#L379-L392` },
		{ title: 'Discourse, lib/discourse_redis.rb, keys namespaced per site', url: `${REPO}/lib/discourse_redis.rb#L1-L26` },
		{ title: 'rails_multisite, middleware.rb', url: `${MULTISITE}/lib/rails_multisite/middleware.rb#L9-L30` },
		{ title: 'AWS Well-Architected SaaS Lens, Silo, Pool, and Bridge Models', url: 'https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html' }
	]
};
