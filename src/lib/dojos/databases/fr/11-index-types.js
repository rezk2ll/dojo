const DISC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/doc/src/sgml';
const MIG = `${DISC}/db/migrate/20260610064425_introduce_permission_acl_tables.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'index-types',
	part: 'Dans le moteur',
	title: 'Types d’index : GIN, GiST, BRIN et Hash',
	minutes: 10,
	hook: [
		'Ton forum range dans un tableau les personnes qui peuvent voir une catégorie : `allowed_user_ids = {3, 7, 42}`. La page « catégories que je peux voir » lance `WHERE allowed_user_ids @> ARRAY[42]`. Elle ralentit chaque mois.',
		'Tu ajoutes un index B-tree sur la colonne. Rien ne change. **Un B-tree trie des valeurs entières** : il sait que `{3,7,42}` passe avant `{3,8}`, mais il ignore que 42 est dedans.',
		'PostgreSQL fournit d’autres types d’index pour les questions qu’une liste triée ne sait pas traiter. **GIN indexe chaque élément d’une valeur**, GiST répond à « est-ce que ça se chevauche ? » et « qu’est-ce qui est le plus proche ? », BRIN garde un min et un max par 128 pages, et Hash ne sert que `=`.'
	],
	terms: [
		{ term: 'Classe d’opérateurs', def: 'L’ensemble des opérateurs qu’un index sait servir pour un type de colonne. Un index n’aide une clause WHERE que si elle applique l’un de ces opérateurs à la colonne indexée.' },
		{ term: 'GIN', def: 'Generalized Inverted Index. Une entrée par élément (case d’un tableau, clé JSONB, mot), qui pointe vers les lignes qui le contiennent. Fait pour « cette valeur contient-elle celle-là ? ».' },
		{ term: 'GiST', def: 'Generalized Search Tree. Un arbre équilibré de boîtes englobantes ou d’intervalles. Répond au chevauchement, à l’inclusion et au plus proche voisin pour la géométrie, les intervalles et les réseaux IP.' },
		{ term: 'BRIN', def: 'Block Range Index. Garde un résumé, par exemple le min et le max, pour chaque groupe de 128 pages de la table par défaut. Il peut renvoyer des lignes qui ne correspondent pas (index lossy), donc l’exécuteur revérifie chaque ligne d’une plage retenue.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['q["Que demande la clause WHERE ?"] -->|"= ou un intervalle sur une valeur triable"| btree["B-tree : valeurs triées (jour 10)"]'],
				highlight: ['q', 'btree'],
				note: 'La doc dit que chaque type d’index convient à « different types of indexable clauses » (des formes de clauses différentes) : tu choisis donc le type d’après la clause WHERE. Pour `=`, `<`, `BETWEEN` et `ORDER BY` sur une colonne triable, c’est le B-tree du jour 10, et c’est ce que `CREATE INDEX` construit par défaut.'
			},
			{
				add: ['q -->|"contient-elle cet élément ou cette clé ?"| gin["GIN : une entrée par élément, chacune avec sa liste de lignes"]'],
				highlight: ['gin'],
				note: 'GIN découpe une valeur en éléments. La ligne `{3,7,42}` donne trois entrées d’index : 3, 7 et 42, chacune pointant vers la ligne. La classe d’opérateurs des tableaux sert `<@`, `@>`, `=` et `&&`. Pour `jsonb`, `jsonb_ops` est la classe par défaut et `jsonb_path_ops` sert moins d’opérateurs, plus vite.'
			},
			{
				add: ['q -->|"est-ce que ça chevauche, ou qu’est-ce qui est le plus proche ?"| gist["GiST : un arbre de boîtes englobantes et d’intervalles"]'],
				highlight: ['gist'],
				note: 'GiST regroupe les valeurs selon l’espace qu’elles couvrent. Chaque entrée interne « represents all the given entries » (représente toutes les entrées en dessous), comme une boîte autour de ses enfants : une recherche saute toute branche qui ne peut pas chevaucher. Les classes intégrées couvrent la géométrie, `range_ops`, `multirange_ops` et `inet_ops`. GiST répond aussi à `ORDER BY location <-> point LIMIT 10`.'
			},
			{
				add: ['q -->|"une fenêtre de temps sur une énorme table en ajout seul"| brin["BRIN : min et max par 128 pages"]', 'brin -.->|"revérifie chaque ligne de chaque plage retenue"| heap[("pages de la table")]'],
				highlight: ['brin', 'heap'],
				note: 'BRIN garde un seul résumé par plage de blocs, donc un parcours lit toutes les pages de chaque plage dont le résumé peut correspondre. Ça marche quand la colonne suit l’ordre d’insertion, comme `created_at` sur un journal. Sur une colonne mélangée, toutes les plages correspondent et tu lis la table entière.'
			},
			{
				add: ['q -->|"= seulement, jamais un intervalle"| hash["Hash : un code de 32 bits par ligne"]'],
				highlight: ['hash'],
				note: 'Un index Hash garde un hash de 32 bits de chaque valeur et « can only handle simple equality comparisons » (ne gère que l’égalité simple). Il ne trie pas, ne sert pas d’intervalle et ne peut pas porter une contrainte UNIQUE : la doc dit « Currently, only B-tree indexes can be declared unique. »'
			}
		]
	},
	example: {
		title: 'db/migrate/20260610064425_introduce_permission_acl_tables.rb : deux index GIN sur des tableaux d’ids',
		repo: 'discourse/discourse',
		url: `${MIG}#L3-L20`,
		lang: 'ruby',
		code: `  def up
    create_table :access_control_lists do |t|
      t.string :target_type, null: false, limit: 255
      t.bigint :target_id, null: false

      t.string :owner, null: false, limit: 100
      t.string :permission, null: false, limit: 100

      t.bigint :allowed_user_ids, array: true, null: false, default: []
      t.bigint :allowed_group_ids, array: true, null: false, default: []

      t.timestamps
    end

    add_index :access_control_lists, %i[target_type target_id permission], unique: true
    execute "CREATE INDEX idx_access_control_lists_allowed_user_ids ON access_control_lists USING GIN(allowed_user_ids)"
    execute "CREATE INDEX idx_access_control_lists_allowed_group_ids ON access_control_lists USING GIN(allowed_group_ids)"
  end`,
		notes: [
			'La ligne 15 sert « trouve l’ACL de cette catégorie pour cette permission », de l’égalité sur des valeurs entières : un B-tree unique classique. Les lignes 16 et 17 servent « trouve toutes les ACL qui laissent entrer l’utilisateur 42 », qui cherche dans un tableau : GIN. L’index unique doit de toute façon être un B-tree, puisque seuls les B-trees peuvent être déclarés uniques.',
			'Les [scopes](' + DISC + '/app/models/access_control_list.rb#L48-L55) du modèle interrogent avec `allowed_user_ids @> ARRAY[:user_id]::bigint[]` et `allowed_group_ids && ARRAY[:group_ids]::bigint[]`. `@>` et `&&` font partie de la classe d’opérateurs GIN des tableaux. `42 = ANY(allowed_user_ids)` n’en fait pas partie : sur PostgreSQL 18, le planificateur choisit un parcours séquentiel, même avec l’index GIN en place.',
			'Quand un utilisateur est supprimé, le job [`CleanupAclsForDeleted`](' + DISC + '/app/jobs/regular/cleanup_acls_for_deleted.rb#L20-L28) trouve les lignes avec `allowed_user_ids @> ARRAY[?]::bigint[]` et réécrit le tableau avec `array_remove`. Chaque réécriture met aussi à jour les entrées GIN de la ligne.',
			'Une autre migration de Discourse crée [deux index GIN sur des tableaux d’ids](' + DISC + '/plugins/boards/db/migrate/20260407065612_add_kanban_sync_indexes.rb#L5-L9) sans SQL brut, avec `add_index ... using: :gin`.',
			'La doc GIN donne le coût en écriture : « inserting or updating one heap row can cause many inserts into the index (one for each key extracted from the indexed item) », soit une entrée d’index par clé extraite. Avec [`fastupdate`](' + PG + '/gin.sgml#L500-L527), activé par défaut, les nouvelles entrées attendent dans une liste en attente que les recherches doivent aussi lire. Vacuum, l’autoanalyze ou `gin_clean_pending_list` les fusionne ensuite dans l’index.'
		]
	},
	tradeoff: {
		gain: [
			'L’inclusion dans un tableau ou un JSONB, le chevauchement d’intervalles et le plus proche voisin peuvent passer par un parcours d’index, ce qu’un B-tree ne sait pas servir.',
			'Dans un test avec 2 millions de lignes dans l’ordre du temps, un BRIN sur `created_at` prenait 24 kB, le B-tree 43 MB.',
			'Chaque type tient en un mot-clé `USING` dans `CREATE INDEX`, sans extension ni nouveau service, avec les mêmes transactions et les mêmes sauvegardes.'
		],
		cost: [
			'Les écritures GIN sont lentes : une ligne peut donner des dizaines d’entrées d’index. La liste en attente repousse ce travail, et l’insert qui remplit la liste paie la fusion.',
			'Un index ne sert que les opérateurs de sa classe. Écris la requête autrement (`= ANY` au lieu de `@>`) et le planificateur ignore l’index sans prévenir.',
			'BRIN ne saute des pages que tant que les valeurs suivent l’ordre physique des lignes. Un rattrapage de vieilles dates atterrit en fin de table, un `UPDATE` peut écrire la nouvelle version de la ligne sur une autre page, et les plages se mettent à se chevaucher.',
			'Hash, GIN, GiST et BRIN ne peuvent pas garantir l’unicité. Il te faut toujours un B-tree pour ça.'
		]
	},
	task: {
		prompt: 'Dans `psql`, crée `events(id bigint generated always as identity, created_at timestamptz not null, payload text)` et remplis-la avec 2 millions de lignes, une par seconde à partir du 2026-01-01, avec `generate_series`. Construis un BRIN et un B-tree sur `created_at` et compare leurs tailles. Supprime le B-tree, puis lance `EXPLAIN (ANALYZE, BUFFERS)` sur un comptage d’une journée. Que vois-tu, et pourquoi ?',
		hint: '`pg_relation_size` donne la taille d’une table ou d’un index. Dans le plan, regarde le nœud de parcours sous l’agrégat et la ligne « Heap Blocks ».',
		answer: [
			'Remplissage : `INSERT INTO events (created_at, payload) SELECT timestamptz \'2026-01-01\' + i * interval \'1 second\', \'x\' FROM generate_series(1, 2000000) i;` puis `CREATE INDEX ON events USING brin (created_at);` et `CREATE INDEX ON events (created_at);`.',
			'Tailles sur PostgreSQL 18 : la table fait environ 100 MB, le B-tree environ 43 MB, le BRIN 24 kB. Le BRIN garde un résumé par 128 pages, le B-tree une entrée par ligne.',
			'Le plan est un Bitmap Index Scan sur le BRIN sous un Bitmap Heap Scan, avec `Heap Blocks: lossy=640` et `Rows Removed by Index Recheck`. L’index désigne des plages de pages entières, et l’exécuteur revérifie chaque ligne dedans.',
			'Ça marche parce que `created_at` croît avec l’ordre d’insertion, donc chaque plage couvre une courte fenêtre de temps. Remplis une deuxième table avec des dates `random()` sur les mêmes 23 jours et la même requête marque toutes les pages de la table comme lossy (environ 12 700 pages) : chaque plage contient alors des dates de toute la période.'
		],
		steps: [
			{
				title: 'Remplis la table',
				questions: [
					{ q: 'Quelle expression donne une ligne par seconde à partir du 2026-01-01 ?', options: ['`now() - i * interval \'1 second\'`', '`timestamptz \'2026-01-01\' + random() * interval \'23 days\'`', '`timestamptz \'2026-01-01\' + i * interval \'1 second\'`', '`timestamptz \'2026-01-01\' + i * interval \'1 day\'`'], answer: 2, why: 'Avec `i` venant de `generate_series(1, 2000000)`, chaque ligne a une seconde de plus que la précédente, à partir du 2026-01-01.' },
					{ q: 'Quelle instruction construit le BRIN ?', options: ['`CREATE INDEX ON events (created_at);`', '`CREATE INDEX ON events USING brin (created_at);`', '`CREATE INDEX ON events USING gin (created_at);`', '`CREATE INDEX ON events USING hash (created_at);`'], answer: 1, why: 'Le type d’index tient en un mot-clé `USING`. Sans lui, `CREATE INDEX` construit un B-tree, qui est le deuxième index dont tu as besoin.' },
					{ q: 'Quelle fonction donne la taille de la table ou d’un index ?', options: ['`pg_relation_size`', '`count(*)`', '`EXPLAIN (BUFFERS)`', 'La vue `pg_stats`'], answer: 0, why: '`pg_relation_size` renvoie la taille sur disque d’une relation, table ou index, comme le dit l’indice.' },
					{ q: 'Pourquoi `created_at` suit-il ici l’ordre physique des lignes ?', options: ['BRIN trie la table selon la colonne indexée quand il est construit', 'PostgreSQL range toujours les lignes triées par clé primaire', 'Le B-tree remet les lignes dans l’ordre quand il est créé', 'Les lignes arrivent une par une dans l’ordre du temps, chacune après la précédente'], answer: 3, why: 'L’insert parcourt la série dans l’ordre, donc chaque nouvelle ligne arrive après la précédente, avec une heure plus tardive. Rien ne trie la table ensuite.' }
				]
			},
			{
				title: 'Compare les tailles',
				questions: [
					{ q: 'La table fait environ 100 MB sur PostgreSQL 18. Quelle taille environ pour le B-tree sur `created_at` ?', options: ['24 kB', '43 MB', '100 MB', '4 MB'], answer: 1, why: 'Le B-tree garde une entrée par ligne, 2 millions en tout : environ 43 MB.' },
					{ q: 'Quelle taille environ pour le BRIN ?', options: ['24 kB', '43 MB', '4 MB', '640 kB'], answer: 0, why: 'Dans ce test, le BRIN prend 24 kB, contre 43 MB pour le B-tree.' },
					{ q: 'Pourquoi le BRIN est-il tellement plus petit ?', options: ['Il compresse chaque entrée de ligne mieux qu’un B-tree', 'Il n’indexe que les lignes insérées après sa création', 'Il garde les valeurs en mémoire et n’écrit rien sur disque', 'Il garde un résumé par 128 pages, pas une entrée par ligne'], answer: 3, why: 'BRIN garde un résumé par plage de blocs, 128 pages de table par défaut. Le B-tree garde une entrée pour chaque ligne.' },
					{ q: 'Que contient un résumé BRIN pour une colonne comme `created_at` ?', options: ['L’heure exacte de chaque ligne de la plage', 'Un hash de chaque valeur de la plage', 'Le min et le max de la plage', 'Le nombre de lignes de chaque jour'], answer: 2, why: 'Pour une colonne triable, le résumé est un min et un max par plage de blocs. C’est tout ce que l’index sait.' }
				]
			},
			{
				title: 'Lis le plan',
				questions: [
					{ q: 'Une fois le B-tree supprimé, quels nœuds de parcours comptent les lignes d’une journée ?', options: ['Un Bitmap Index Scan sur le BRIN sous un Bitmap Heap Scan', 'Un Index Only Scan sur le BRIN, sans lire la table', 'Un Index Scan sur le BRIN qui renvoie une ligne à la fois', 'Un Seq Scan, parce qu’un BRIN ne sert pas un intervalle'], answer: 0, why: 'BRIN renvoie des plages de pages, donc le plan construit un bitmap de pages que le parcours de la table lit ensuite.' },
					{ q: 'Que te dit `Heap Blocks: lossy=640` ?', options: ['640 pages manquaient dans le cache et ont été lues sur disque', '640 lignes de la journée ont été perdues et doivent être recomptées', 'L’index a désigné des pages entières, pas des lignes, donc chaque ligne y est revérifiée', 'L’index est abîmé sur 640 pages et demande un REINDEX'], answer: 2, why: 'Lossy veut dire que le bitmap connaît des pages, pas des lignes. L’exécuteur revérifie chaque ligne de ces pages avec la condition.' },
					{ q: 'D’où viennent les `Rows Removed by Index Recheck` ?', options: ['Des lignes mortes que VACUUM n’a pas encore retirées', 'Des lignes des plages retenues qui tombent hors de la journée', 'Des lignes que le B-tree avait déjà comptées avant', 'Des lignes cachées à la requête par une transaction ouverte'], answer: 1, why: 'Une plage retenue peut contenir des heures juste avant ou juste après la journée. La revérification les écarte.' },
					{ q: '640 pages lossy, ça fait combien de plages de 128 pages ?', options: ['128', '640', '2', '5'], answer: 3, why: '640 / 128 = 5. La journée tient dans environ cinq plages, et le parcours lit toutes leurs pages.' }
				]
			},
			{
				title: 'Explique pourquoi',
				questions: [
					{ q: 'Pourquoi le BRIN saute-t-il ici la plus grande partie de la table ?', options: ['Parce que BRIN garde l’heure exacte de chaque ligne dans son résumé', 'Parce que `created_at` croît avec l’ordre d’insertion, donc chaque plage est une courte fenêtre', 'Parce que le planificateur garde en cache le résultat du comptage précédent', 'Parce que les lignes d’une journée sont rangées dans l’index lui-même'], answer: 1, why: 'Chaque plage couvre quelques heures, donc seules les plages autour de la journée peuvent correspondre.' },
					{ q: 'Une deuxième table reçoit des dates `random()` sur les mêmes 23 jours. Que fait la même requête ?', options: ['Elle marque toutes les pages de la table comme lossy, environ 12 700 pages', 'Elle lit les mêmes 640 pages, puisque les dates sont les mêmes', 'Elle passe à un Index Only Scan sur le BRIN', 'Elle échoue, parce que BRIN exige des valeurs triées'], answer: 0, why: 'Chaque plage contient alors des dates de toute la période, donc chaque résumé correspond à la journée.' },
					{ q: 'La table est en production. Quel changement casse peu à peu le BRIN ?', options: ['Ajouter une colonne `payload`', 'Lancer `ANALYZE` chaque nuit', 'Un rattrapage de vieilles dates et beaucoup d’`UPDATE`', 'Compter une semaine entière au lieu d’une journée'], answer: 2, why: 'Un rattrapage atterrit en fin de table, et un `UPDATE` peut écrire la nouvelle version sur une autre page. Les plages se mettent à se chevaucher.' },
					{ q: 'Il faut aussi que `created_at` soit unique. Qu’ajoutes-tu ?', options: ['Un deuxième BRIN avec des plages plus petites', 'Un index Hash, qui sert `=` exactement', 'Un index GIN sur `created_at`', 'Un B-tree, le seul type qui peut être unique'], answer: 3, why: 'La doc : « Currently, only B-tree indexes can be declared unique. » BRIN, Hash, GIN et GiST ne peuvent pas la garantir.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une table a un index GIN sur `allowed_user_ids bigint[]`. Quelle clause WHERE peut l’utiliser ?',
			options: [
				'`WHERE 42 = ANY(allowed_user_ids)`',
				'`WHERE allowed_user_ids @> ARRAY[42]::bigint[]`',
				'`WHERE allowed_user_ids[1] = 42`',
				'`WHERE array_length(allowed_user_ids, 1) > 2`'
			],
			answer: 1,
			why: 'Un index sert une clause de la forme « colonne indexée, opérateur de sa classe, valeur ». La classe GIN des tableaux contient `<@`, `@>`, `=` et `&&`. `= ANY`, un indice ou un appel de fonction sur la colonne n’ont pas cette forme.'
		},
		{
			q: 'Quand un index BRIN sur `created_at` est-il un bon choix ?',
			options: [
				'Quand les lignes arrivent dans l’ordre du temps et bougent peu, donc chaque plage couvre une courte fenêtre',
				'Quand les lignes arrivent dans n’importe quel ordre, parce que le résumé garde l’heure exacte de chaque ligne',
				'Quand la colonne doit être unique, parce que le résumé refuse une deuxième ligne avec la même heure',
				'Quand les requêtes demandent un instant précis, parce que le résumé pointe droit sur cette ligne'
			],
			answer: 0,
			why: 'BRIN garde un min et un max par plage de blocs et renvoie des plages entières. Il ne saute des pages que si les valeurs suivent l’ordre physique. Il est avec pertes, donc ne pointe jamais sur une ligne précise, et seuls les B-trees peuvent être uniques.'
		},
		{
			q: 'Une table très sollicitée reçoit un index GIN sur une colonne `jsonb`. Les écritures ralentissent, et de temps en temps un insert prend bien plus longtemps que les autres. Pourquoi ?',
			options: [
				'GIN verrouille toute la table à chaque insert, jusqu’à ce que l’index soit reconstruit de zéro',
				'Chaque ligne ajoute une entrée par clé, et une liste en attente pleine est fusionnée pendant un insert',
				'GIN trie les valeurs jsonb, donc chaque insert doit déplacer la moitié des pages de l’index',
				'GIN garde une copie de chaque document, donc chaque insert écrit la ligne deux fois sur disque'
			],
			answer: 1,
			why: 'Une ligne donne une entrée d’index par clé extraite. Avec `fastupdate` activé, les entrées attendent dans une liste en attente, et l’insert qui la rend trop grosse paie la fusion. Vacuum et l’autoanalyze la fusionnent aussi en arrière-plan. Un B-tree (jour 10) paie une entrée par ligne.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir un B-tree ignorer une requête d’inclusion dans un tableau, et un index GIN la servir.',
		steps: [
			'Lance un PostgreSQL 18 jetable et ouvre `psql` : `docker run --rm -d --name pg-lab -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-lab psql -U postgres`.',
			'Crée la table de l’accroche avec 200 000 lignes de trois ids d’utilisateurs au hasard : `CREATE TABLE acl (id bigint generated always as identity primary key, allowed_user_ids bigint[] not null);` puis `INSERT INTO acl (allowed_user_ids) SELECT ARRAY[(random()*5000)::bigint, (random()*5000)::bigint, (random()*5000)::bigint] FROM generate_series(1, 200000);`',
			'Ajoute un B-tree et regarde le plan : `CREATE INDEX acl_btree ON acl (allowed_user_ids); VACUUM ANALYZE acl;` puis `EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM acl WHERE allowed_user_ids @> ARRAY[42]::bigint[];`',
			'Ajoute un index GIN et relance le même `EXPLAIN` : `CREATE INDEX acl_gin ON acl USING gin (allowed_user_ids);`',
			'Pose la même question autrement : `EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM acl WHERE 42 = ANY(allowed_user_ids);`. Compare les tailles avec `SELECT pg_size_pretty(pg_relation_size(\'acl_btree\')), pg_size_pretty(pg_relation_size(\'acl_gin\'));`. Arrête tout avec `docker stop pg-lab`.'
		],
		done: [
			'Avec le B-tree seul, le plan de `@>` est un `Seq Scan on acl` avec environ 200 000 `Rows Removed by Filter`.',
			'Avec l’index GIN, la même requête montre `Bitmap Index Scan on acl_gin` et une centaine de buffers au lieu d’environ 2 000.',
			'La version `= ANY` reste un Seq Scan (parfois parallèle) même avec `acl_gin` en place.'
		],
		solution: [
			'Le B-tree trie des tableaux entiers, il ne peut donc pas trouver 42 dans `{3,7,42}`. Le planificateur lit la table.',
			'GIN garde une entrée par élément. `@>` fait partie de sa classe d’opérateurs des tableaux, donc la clause a la forme « colonne indexée, opérateur, valeur » et l’index la sert.',
			'`42 = ANY(allowed_user_ids)` place la colonne derrière un opérateur hors de la classe, donc le planificateur ignore l’index GIN sans prévenir. Écris `@>` dans tes requêtes.'
		]
	},
	recall: {
		q: 'Quel type d’index sert `WHERE allowed_user_ids @> ARRAY[42]`, et pourquoi un B-tree sur la colonne n’aide pas ?',
		a: 'GIN, grâce à sa classe d’opérateurs des tableaux (`<@`, `@>`, `=`, `&&`). Un B-tree trie des tableaux entiers, il ne peut donc pas trouver 42 dans `{3,7,42}`.'
	},
	sources: [
		{ title: 'Doc PostgreSQL 18, Index Types', url: 'https://www.postgresql.org/docs/18/indexes-types.html' },
		{ title: 'Doc PostgreSQL 18, GIN Indexes', url: 'https://www.postgresql.org/docs/18/gin.html' },
		{ title: 'Doc PostgreSQL 18, GiST Indexes', url: 'https://www.postgresql.org/docs/18/gist.html' },
		{ title: 'Doc PostgreSQL 18, BRIN Indexes', url: 'https://www.postgresql.org/docs/18/brin.html' },
		{ title: 'Doc PostgreSQL 18, index et classes d’opérateurs', url: 'https://www.postgresql.org/docs/18/indexes-opclass.html' }
	]
};
