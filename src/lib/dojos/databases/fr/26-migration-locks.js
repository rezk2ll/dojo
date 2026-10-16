const SM = 'https://github.com/ankane/strong_migrations/blob/23d8e1f7d7aad502388a5dfcf49affa3b0cfb086';
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const ERRORS = `${SM}/lib/strong_migrations/error_messages.rb`;
const SAFE = `${SM}/lib/strong_migrations/safe_methods.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'migration-locks',
	part: 'La garder en marche',
	title: 'Les migrations qui verrouillent la table',
	minutes: 10,
	hook: [
		'Mardi, 14 h. Une migration ajoute une colonne à `orders`. Sur ton portable, elle a tourné en une seconde. En production, **chaque page qui touche `orders` reste bloquée une minute**, puis le load balancer se met à répondre 502.',
		'L’`ALTER TABLE` lui-même prend un instant, mais il a attendu son verrou pendant une minute. Un rapport lisait `orders` depuis une minute, et la migration faisait la queue derrière lui pour obtenir un verrou exclusif. Ensuite, **chaque requête arrivée après la migration a fait la queue derrière la migration**.',
		'PostgreSQL a huit modes de verrou de table, et chaque instruction en prend un : un `SELECT` prend `ACCESS SHARE`, un `UPDATE` prend `ROW EXCLUSIVE`. Les formes plus sûres d’une migration passent par `lock_timeout`, `CREATE INDEX CONCURRENTLY` et les contraintes `NOT VALID`. strong_migrations, une gem Rails, vérifie chacune d’elles avant qu’une migration tourne.'
	],
	terms: [
		{ term: 'ACCESS EXCLUSIVE', def: 'Le mode de verrou le plus fort. Il entre en conflit avec tous les autres, y compris les simples lectures. La plupart des formes d’`ALTER TABLE` le prennent, sauf mention contraire dans la doc.' },
		{ term: 'File d’attente des verrous', def: 'Les demandes que PostgreSQL ne peut pas accorder attendent leur tour. Une nouvelle demande attend si elle entre en conflit avec un verrou déjà tenu, **ou avec un verrou encore en attente**.' },
		{ term: 'lock_timeout', def: 'Un paramètre qui annule une instruction dès qu’elle attend un verrou plus longtemps que la limite. La valeur par défaut est 0, et avec 0 l’instruction attend sans limite.' },
		{ term: 'CREATE INDEX CONCURRENTLY', def: 'Construit un index sans bloquer les écritures. Ça coûte deux parcours de la table, plus de temps, et ça ne peut pas tourner dans un bloc de transaction.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['rep["Rapport : un long SELECT, tient ACCESS SHARE"] --> orders[("table orders")]'],
				highlight: ['rep', 'orders'],
				note: 'Un rapport lit `orders` depuis une minute. Un `SELECT` prend `ACCESS SHARE`, qui n’entre en conflit qu’avec `ACCESS EXCLUSIVE`. Les autres lectures et écritures continuent à côté.'
			},
			{
				add: ['mig["Migration : ALTER TABLE, veut ACCESS EXCLUSIVE"] -.->|"attend"| orders'],
				highlight: ['mig'],
				note: '`ALTER TABLE orders ADD COLUMN` a besoin d’`ACCESS EXCLUSIVE`, qui entre en conflit avec le rapport. La migration rejoint donc la file d’attente du verrou. Le rapport, et toute requête lancée avant la migration, continuent de tourner.'
			},
			{
				add: ['app["Requêtes de l’appli : SELECT, UPDATE"] -.->|"attendent derrière la migration"| mig'],
				highlight: ['app'],
				note: 'Le README du gestionnaire de verrous dit qu’une demande « is granted immediately if it does not conflict with any existing or waiting lock request » (est accordée tout de suite si elle n’entre en conflit avec aucune demande tenue ou en attente). Le `SELECT` de l’appli n’entre pas en conflit avec le rapport, mais avec la migration qui **attend** devant lui. Il attend donc aussi, comme chaque requête suivante. Chaque page qui lit `orders` reste bloquée jusqu’à la fin du rapport.'
			},
			{
				add: ['lt["lock_timeout = 5s"] -->|"annule la migration"| mig'],
				highlight: ['lt'],
				note: 'Avec `SET lock_timeout = \'5s\'`, la migration s’arrête après cinq secondes d’attente. La file se vide, l’appli repart, et tu réessaies plus tard. L’appli subit cinq secondes de pages lentes au lieu d’une minute d’erreurs 502.'
			},
			{
				add: ['safe["Formes plus sûres : CONCURRENTLY, NOT VALID puis VALIDATE"] -->|"verrous plus faibles"| orders'],
				highlight: ['safe'],
				note: 'Certains changements ont une forme qui prend un verrou plus faible. `CREATE INDEX CONCURRENTLY` et `VALIDATE CONSTRAINT` prennent `SHARE UPDATE EXCLUSIVE`, qui laisse passer lectures et écritures. Ajouter une contrainte `NOT VALID` prend encore un verrou fort, mais un instant seulement, puisque PostgreSQL ne parcourt aucune ligne.'
			}
		]
	},
	example: {
		title: 'lib/strong_migrations/checks.rb : refuser les formes qui verrouillent',
		repo: 'ankane/strong_migrations',
		url: `${SM}/lib/strong_migrations/checks.rb#L116-L165`,
		lang: 'ruby',
		code: `    def check_add_foreign_key(*args)
      options = args.extract_options!
      from_table, to_table = args

      validate = options.fetch(:validate, true)
      if postgresql? && validate
        if StrongMigrations.safe_by_default
          safe_add_foreign_key(*args, **options)
          throw :safe
        end

        raise_error :add_foreign_key,
          add_foreign_key_code: command_str("add_foreign_key", [from_table, to_table, options.merge(validate: false)]),
          validate_foreign_key_code: command_str("validate_foreign_key", [from_table, to_table])
      elsif mysql? || mariadb?
        raise_error :add_foreign_key_mysql,
          add_foreign_key_code: command_str("add_foreign_key", [from_table, to_table, options]),
          # TODO exclude some options?
          remove_foreign_key_code: command_str("remove_foreign_key", [from_table, to_table, options])
      end
    end

    def check_add_index(*args)
      options = args.extract_options!
      table, columns = args

      if columns.is_a?(Array) && columns.size > 3 && !options[:unique]
        raise_error :add_index_columns, header: "Best practice"
      end

      # safe_by_default goes through this path as well
      if postgresql? && options[:algorithm] == :concurrently && adapter.index_corruption?
        raise_error :add_index_corruption
      end

      # safe to add non-concurrently to new tables (even after inserting data)
      # since the table won't be in use by the application
      if postgresql? && options[:algorithm] != :concurrently && !new_table?(table)
        if StrongMigrations.safe_by_default
          safe_add_index(*args, **options)
          throw :safe
        end

        raise_error :add_index, command: command_str("add_index", [table, columns, options.merge(algorithm: :concurrently)])
      end

      check_algorithm_option("add_index", *args, **options)

      check_lock_option("add_index", *args, **options)
    end`,
		notes: [
			'Lignes 38 à 45 : sur PostgreSQL, `check_add_index` lève une erreur sauf si `algorithm: :concurrently` est donné ou si la migration a créé la table elle-même. Le [message d’erreur](' + ERRORS + '#L167-L176) dit « Adding an index non-concurrently blocks writes » (ajouter un index sans concurrently bloque les écritures) et enveloppe la correction dans `disable_ddl_transaction!`, parce que `CREATE INDEX CONCURRENTLY` ne peut pas tourner dans un bloc de transaction.',
			'Lignes 12 à 14 : `check_add_foreign_key` remplace un seul `add_foreign_key` par deux migrations, une avec `validate: false` (`NOT VALID` en SQL), puis une avec `validate_foreign_key`. Le [message](' + ERRORS + '#L250-L264) dit « Adding a foreign key blocks writes on both tables » (bloque les écritures sur les deux tables). La doc PostgreSQL confirme : `ADD FOREIGN KEY` prend `SHARE ROW EXCLUSIVE` sur la table et sur la table référencée.',
			'Lignes 7 à 10 et 39 à 42 : avec `safe_by_default` activé, la gem réécrit la migration au lieu de lever une erreur. [`safe_add_index`](' + SAFE + '#L7-L10) valide la transaction ouverte et ajoute `algorithm: :concurrently`. `safe_add_foreign_key` (dans les sources) ajoute la clé avec `validate: false`, valide la transaction, puis lance la validation.',
			'Le README dit : « It’s extremely important to set a short lock timeout for migrations. » (il est essentiel de mettre un lock timeout court pour les migrations). Son exemple est de 10 secondes. Hors développement et test, l’adaptateur PostgreSQL [lit `SHOW lock_timeout`](' + SM + '/lib/strong_migrations/adapters/postgresql_adapter.rb#L35-L43) et affiche « DANGER: No lock timeout set » quand il vaut zéro.',
			'La méthode expérimentale [`retry_lock_timeouts`](' + SM + '/lib/strong_migrations/checker.rb#L132-L146) attrape `ActiveRecord::LockWaitTimeout`, attend `lock_timeout_retry_delay`, puis relance l’instruction, jusqu’à `lock_timeout_retries` fois. `lock_timeout_retries` vaut 0 par défaut : la gem ne réessaie que si tu le règles.'
		]
	},
	tradeoff: {
		gain: [
			'Une migration qui n’obtient pas son verrou échoue en quelques secondes, au lieu de faire attendre toute l’appli derrière elle.',
			'Les constructions d’index et les vérifications de contraintes sur les grosses tables tournent pendant que l’appli continue à lire et à écrire.',
			'Un vérificateur comme strong_migrations attrape la forme dangereuse en revue de code, avant qu’elle arrive en production.'
		],
		cost: [
			'`CREATE INDEX CONCURRENTLY` parcourt la table deux fois et attend les transactions plus anciennes : il prend « significantly longer » (nettement plus longtemps) et ajoute de la charge CPU et disque.',
			'Une construction concurrente ratée laisse un index `INVALID` qui coûte encore à chaque écriture, jusqu’à ce que tu le supprimes et le reconstruises.',
			'Un changement demande deux ou trois migrations hors transaction : un échec au milieu laisse un état à nettoyer à la main.',
			'Avec un `lock_timeout` court, les migrations échouent sur une table chargée, et quelqu’un doit les relancer.'
		]
	},
	task: {
		prompt: 'La table `orders` de ta boutique a 50 millions de lignes et reçoit des écritures chaque seconde. Il te faut un index sur `orders(customer_id)`, une clé étrangère de `orders.customer_id` vers `customers.id`, et un check `total >= 0`. Écris le SQL, dans l’ordre, pour qu’aucune étape ne bloque les écritures plus de quelques secondes.',
		hint: 'Pour chaque instruction, demande-toi quel verrou elle prend et pour combien de temps. Les longs parcours doivent se faire sous un verrou qui laisse passer les écritures.',
		answer: [
			'D’abord, dans la session qui lance la migration : `SET lock_timeout = \'5s\';`. Toute étape qui n’obtient pas vite son verrou échoue, au lieu de faire attendre l’appli derrière elle.',
			'`CREATE INDEX CONCURRENTLY orders_customer_id_idx ON orders (customer_id);` hors de toute transaction. Une construction ratée laisse un index `INVALID` : lance `DROP INDEX CONCURRENTLY orders_customer_id_idx;` puis reconstruis-le.',
			'`ALTER TABLE orders ADD CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;` prend `SHARE ROW EXCLUSIVE` sur les deux tables, mais un instant seulement, puisqu’aucune ligne n’est parcourue. Ensuite, `ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;` parcourt la table sous `SHARE UPDATE EXCLUSIVE` pendant que les écritures continuent.',
			'Mêmes deux étapes pour le check : `ADD CONSTRAINT orders_total_check CHECK (total >= 0) NOT VALID;`, puis `VALIDATE CONSTRAINT orders_total_check;`. Mets chaque étape dans sa propre migration : un lock timeout ne relance alors qu’une étape, et les autres restent faites.'
		]
	},
	quiz: [
		{
			q: 'Un rapport lit `orders` depuis deux minutes. Tu lances `ALTER TABLE orders ADD COLUMN note text` sans `lock_timeout`. Que se passe-t-il pour un simple `SELECT` sur `orders` envoyé une seconde plus tard ?',
			options: [
				'Il attend, car il fait la queue derrière la migration qui attend le rapport',
				'Il passe tout de suite, car une lecture n’est jamais en conflit avec une autre',
				'Il échoue tout de suite avec une erreur de verrou, la table étant modifiée',
				'Il passe tout de suite, puis la migration attend aussi cette lecture'
			],
			answer: 0,
			why: 'Son `ACCESS SHARE` n’entre pas en conflit avec le rapport, mais avec la demande `ACCESS EXCLUSIVE` déjà dans la file. PostgreSQL n’accorde une demande que si elle n’entre en conflit avec aucun verrou tenu **ni aucun verrou en attente** (jour 20). La migration et tous ceux derrière elle attendent donc le rapport.'
		},
		{
			q: 'Pourquoi strong_migrations met-il `disable_ddl_transaction!` dans une migration qui ajoute un index avec `algorithm: :concurrently` ?',
			options: [
				'Une transaction garderait l’index verrouillé jusqu’à la fin des migrations suivantes',
				'PostgreSQL refuse de lancer `CREATE INDEX CONCURRENTLY` dans un bloc de transaction',
				'Rails ne sait pas annuler la construction d’un index, la transaction ne protège donc rien',
				'Une construction concurrente n’est rapide que si elle évite d’écrire l’index dans le WAL'
			],
			answer: 1,
			why: 'La doc de CREATE INDEX dit qu’une construction normale « can be performed within a transaction block, but CREATE INDEX CONCURRENTLY cannot » (peut tourner dans un bloc de transaction, pas CREATE INDEX CONCURRENTLY). La construction concurrente lance ses propres transactions : une pour inscrire l’index comme invalide, puis une pour chacun de ses deux parcours de table.'
		},
		{
			q: 'Tu ajoutes `CHECK (total >= 0) NOT VALID` sur `orders`. Qu’est-ce qui est vrai juste après le commit ?',
			options: [
				'Les anciennes et les nouvelles lignes restent non vérifiées jusqu’à `VALIDATE CONSTRAINT`',
				'Les anciennes lignes sont vérifiées en tâche de fond, les nouvelles écritures passent',
				'Les nouveaux inserts et updates sont vérifiés ; les anciennes lignes attendent `VALIDATE CONSTRAINT`',
				'La base considère déjà que la contrainte est respectée par toutes les lignes de la table'
			],
			answer: 2,
			why: 'La doc d’ALTER TABLE : « The constraint will still be applied against subsequent inserts or updates » (la contrainte s’applique aux inserts et updates suivants), mais la base « will not assume that the constraint holds for all rows in the table, until it is validated » (ne suppose pas qu’elle tient pour toutes les lignes tant qu’elle n’est pas validée). `VALIDATE CONSTRAINT` fait ce parcours plus tard, sous `SHARE UPDATE EXCLUSIVE` (jour 22).'
		}
	],
	recall: {
		q: 'Une migration attend `ACCESS EXCLUSIVE` derrière un long rapport. Pourquoi les simples `SELECT` sur la table restent-ils bloqués aussi, et quel paramètre limite cette attente ?',
		a: 'Une nouvelle demande attend si elle entre en conflit avec un verrou tenu ou avec un verrou en attente : chaque `SELECT` fait donc la queue derrière la migration. `SET lock_timeout = \'5s\'` fait abandonner la migration au bout de 5 secondes.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Explicit Locking', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'Doc PostgreSQL, ALTER TABLE', url: 'https://www.postgresql.org/docs/current/sql-altertable.html' },
		{ title: 'Doc PostgreSQL, Building Indexes Concurrently', url: 'https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY' },
		{ title: 'Doc PostgreSQL, lock_timeout', url: 'https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-LOCK-TIMEOUT' },
		{ title: 'Source PostgreSQL, src/backend/storage/lmgr/README', url: `${PG}/src/backend/storage/lmgr/README#L364-L368` },
		{ title: 'README de strong_migrations', url: `${SM}/README.md` },
		{ title: 'strong_migrations, safe_add_foreign_key', url: `${SAFE}#L46-L59` }
	]
};
