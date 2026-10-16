const DISCOURSE = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const JOB = `${DISCOURSE}/app/jobs/scheduled/reindex_search.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'joins',
	part: 'Les données et les questions',
	title: 'Les jointures',
	minutes: 10,
	hook: [
		'La page d’admin de ton forum affiche chaque sujet avec son nombre de messages. C’était juste. Puis quelqu’un a ajouté les tags du sujet à la même requête, et **un sujet avec 3 messages et 2 tags affiche maintenant 6 messages**.',
		'La base a rendu ce que la requête demandait. **Une jointure forme des paires de lignes** : chaque message rencontre chaque tag de son sujet, donc 3 messages fois 2 tags donnent 6 lignes, et `count` compte des lignes.',
		'Les jointures, c’est la façon dont une base relationnelle répond à toute question qui touche deux tables. Pour t’en servir sans surprise, tu dois savoir quelles lignes passent la jointure, combien de copies de chaque ligne elle produit, et comment demander les lignes qui n’ont aucune correspondance.'
	],
	terms: [
		{ term: 'Jointure interne', def: '`A JOIN B ON ...` ne garde que les paires où la condition est vraie. Une ligne de A sans correspondance dans B disparaît.' },
		{ term: 'Jointure gauche', def: '`A LEFT JOIN B ON ...` garde chaque ligne de A. Quand B n’a pas de correspondance, les colonnes de B valent NULL.' },
		{ term: 'Démultiplication', def: 'Une ligne de A qui correspond à 5 lignes de B donne 5 lignes dans le résultat. Joins deux tables de ce genre, et les comptes se multiplient.' },
		{ term: 'Anti-jointure', def: 'Les lignes de A sans correspondance dans B : `NOT EXISTS (...)`, ou une jointure gauche suivie de `WHERE b.id IS NULL`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['topics[("topics : 1, 2, 3")] -->|"JOIN ON posts.topic_id = topics.id"| inner["4 lignes : sujet 1 trois fois, sujet 2 une fois"]', 'posts[("posts : 10, 11, 12 sur le sujet 1, 20 sur le sujet 2")] --> inner'],
				highlight: ['inner'],
				note: 'Une jointure interne forme les paires qui correspondent. La doc : « For each row R1 of T1, the joined table has a row for each row in T2 that satisfies the join condition with R1. » Le sujet 1 a trois messages, il apparaît donc trois fois. Le sujet 3 n’en a aucun, il disparaît.'
			},
			{
				add: ['topics -->|"LEFT JOIN"| left["5 lignes : le sujet 3 revient, avec des colonnes posts à NULL"]'],
				highlight: ['left'],
				note: 'Une jointure gauche garde chaque ligne de la table de gauche : « The joined table always has at least one row for each row in T1. » Le sujet 3 revient une fois, avec NULL dans chaque colonne de posts. `count(posts.id)` lui donne 0, car count ignore les NULL.'
			},
			{
				add: ['tags[("tags : x, y sur le sujet 1")] -->|"LEFT JOIN tags en plus"| fan["sujet 1 : 3 messages x 2 tags = 6 lignes"]', 'left --> fan'],
				highlight: ['fan'],
				note: 'Chacune des trois lignes du sujet 1 rencontre maintenant ses deux tags. `count(posts.id)` dit maintenant 6. La correction : `count(DISTINCT posts.id)`, ou mieux, compter messages et tags dans des sous-requêtes séparées et joindre les totaux.'
			},
			{
				add: ['anti["NOT EXISTS : sujets sans message"] -->|"garde"| t3["sujet 3"]', 'topics --> anti'],
				highlight: ['anti', 't3'],
				note: 'Une anti-jointure garde les lignes sans correspondance : `WHERE NOT EXISTS (SELECT 1 FROM posts WHERE posts.topic_id = topics.id)` garde les sujets sans message. EXISTS s’arrête à la première ligne trouvée. Sur PostgreSQL 18, le plan montre un nœud Anti Join.'
			}
		]
	},
	example: {
		title: 'app/jobs/scheduled/reindex_search.rb : Discourse trouve les lignes de recherche qui ont perdu leur sujet',
		repo: 'discourse/discourse',
		url: `${JOB}#L74-L148`,
		lang: 'ruby',
		code: `    def clean_topics
      puts "cleaning up topic search data" if @verbose

      # remove search data from deleted topics

      DB.exec(<<~SQL, deleted_at: @cleanup_grace_period)
        DELETE FROM topic_search_data
         WHERE topic_id IN (
          SELECT topic_id
            FROM topic_search_data
       LEFT JOIN topics ON topic_id = topics.id
           WHERE topics.id IS NULL
              OR (deleted_at IS NOT NULL AND deleted_at <= :deleted_at)
          )
      SQL
    end

    def clean_posts
      puts "cleaning up post search data" if @verbose

      # remove search data from deleted/empty posts

      DB.exec(<<~SQL, deleted_at: @cleanup_grace_period)
        DELETE FROM post_search_data
         WHERE post_id IN (
          SELECT post_id
            FROM post_search_data
       LEFT JOIN posts ON post_id = posts.id
            JOIN topics ON posts.topic_id = topics.id
           WHERE posts.id IS NULL
              OR posts.raw = ''
              OR (posts.deleted_at IS NOT NULL AND posts.deleted_at <= :deleted_at)
              OR (topics.deleted_at IS NOT NULL AND topics.deleted_at <= :deleted_at)
          )
      SQL
    end
…
    def load_problem_topic_ids(limit)
      Topic
        .joins("LEFT JOIN topic_search_data ON topic_id = topics.id")
        .where(
          "topic_search_data.locale IS NULL OR topic_search_data.locale != ? OR topic_search_data.version != ?",
          SiteSetting.default_locale,
          SearchIndexer::TOPIC_INDEX_VERSION,
        )
        .order("topics.id DESC")
        .limit(limit)
        .pluck(:id)
    end`,
		notes: [
			'La ligne 11 de `clean_topics` lit `topic_search_data LEFT JOIN topics`, qui garde chaque ligne de recherche. Quand le sujet n’existe plus, `topics.id` vaut NULL, et `WHERE topics.id IS NULL` choisit exactement ces lignes. Le `OR` ajoute les sujets supprimés en douceur avant [`@cleanup_grace_period`](' + JOB + '#L9), il y a un jour.',
			'Dans `clean_posts`, le `LEFT JOIN posts` de la ligne 28 est suivi du `JOIN topics ON posts.topic_id = topics.id` de la ligne 29. Une ligne de recherche dont le message n’existe plus a NULL dans `posts.topic_id`, et NULL ne correspond à aucun sujet, donc la jointure interne l’écarte. Tel quel, le `posts.id IS NULL` de la ligne 30 ne peut jamais être vrai, alors que les branches de suppression douce marchent toujours. Passer la ligne 29 en LEFT JOIN fait revenir les lignes manquantes.',
			'Aux lignes 38 à 49, `load_problem_topic_ids` part de `topics` et fait une jointure gauche vers les données de recherche : un sujet sans ligne de recherche, ou avec une `version` périmée, doit être réindexé. `topic_id` est la [clé primaire](' + DISCOURSE + '/app/models/topic_search_data.rb#L15) de `topic_search_data`, donc chaque sujet correspond à une ligne au plus et la jointure ne peut pas se démultiplier.',
			'Les deux jobs pourraient utiliser `NOT EXISTS` à la place de la jointure gauche. La doc décrit comment il tourne : « The subquery will generally only be executed long enough to determine whether at least one row is returned » (la sous-requête s’arrête dès qu’elle sait s’il y a au moins une ligne). La forme en jointure gauche rend facile l’ajout d’autres conditions avec `OR`, comme le font les deux jobs.'
		]
	},
	tradeoff: {
		gain: [
			'Une seule requête répond à une question qui traverse plusieurs tables, et la base choisit la méthode de jointure (nested loop, hash ou merge) pour toi.',
			'Une jointure gauche garde les lignes sans correspondance, donc « les sujets à 0 message » apparaissent au lieu de disparaître en silence.',
			'Une anti-jointure trouve directement les orphelins et les trous : des lignes à nettoyer, des enregistrements encore à indexer.'
		],
		cost: [
			'Une jointure à travers deux relations un-à-plusieurs multiplie les lignes, et `count` ou `sum` comptent trop sans la moindre erreur.',
			'`count(DISTINCT ...)` masque la démultiplication mais construit quand même toutes les lignes en trop d’abord.',
			'Dans une jointure gauche, déplacer une condition de ON vers WHERE change le résultat. La doc : une condition dans ON « is processed before the join », une condition dans WHERE « after the join », et « it matters a lot with outer joins ».',
			'Une seule jointure interne placée après une jointure gauche peut la transformer en douce en jointure interne, comme le montre `clean_posts` chez Discourse.'
		]
	},
	task: {
		prompt: 'Tables : `topics(id)`, `posts(id, topic_id)`, `tags(topic_id, name)`. Dans `psql`, écris : (1) chaque sujet avec son nombre de messages, y compris les sujets sans message ; (2) chaque sujet avec son nombre de messages et son nombre de tags, sans compter trop ; (3) les sujets sans message, de deux façons.',
		hint: 'Pour (2), demande-toi ce que représente une ligne du résultat joint. Si elle représente « un message et un tag », compte quelque chose qui fait une ligne par message.',
		answer: [
			'(1) `SELECT t.id, count(p.id) FROM topics t LEFT JOIN posts p ON p.topic_id = t.id GROUP BY t.id;` Utilise `count(p.id)`, pas `count(*)` : la ligne sans correspondance a un `p.id` NULL et doit compter 0.',
			'(2) Agrège avant de joindre : `SELECT t.id, coalesce(p.n, 0) AS posts, coalesce(g.n, 0) AS tags FROM topics t LEFT JOIN (SELECT topic_id, count(*) AS n FROM posts GROUP BY topic_id) p ON p.topic_id = t.id LEFT JOIN (SELECT topic_id, count(*) AS n FROM tags GROUP BY topic_id) g ON g.topic_id = t.id;` Chaque sous-requête donne une ligne par sujet, donc rien ne se multiplie.',
			'(2, raccourci) `count(DISTINCT p.id)` et `count(DISTINCT g.name)` donnent les mêmes nombres ici, mais la jointure construit quand même 3 x 2 lignes pour le sujet 1 avant de compter.',
			'(3) `SELECT t.id FROM topics t WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.topic_id = t.id);` ou `SELECT t.id FROM topics t LEFT JOIN posts p ON p.topic_id = t.id WHERE p.id IS NULL;` Vérifie les deux sur tes données : seulement le sujet 3.'
		]
	},
	quiz: [
		{
			q: 'Un sujet a 3 messages et 2 tags. Que renvoie `SELECT count(p.id) FROM topics t LEFT JOIN posts p ON ... LEFT JOIN tags g ON ... WHERE t.id = 1` ?',
			options: [
				'3, car count ne regarde que la table posts qu’on lui a donnée',
				'5, car les jointures ajoutent les lignes de tags après celles de posts',
				'6, car chacune des 3 lignes de message est associée aux deux tags',
				'2, car c’est la dernière jointure qui décide du nombre de lignes'
			],
			answer: 2,
			why: 'Les deux jointures partent du sujet, donc chaque message rencontre chaque tag : 3 x 2 = 6 lignes, chacune avec un `p.id` non NULL. Compte d’abord les messages dans une sous-requête, ou utilise `count(DISTINCT p.id)`.'
		},
		{
			q: 'Tu veux chaque sujet avec son nombre de messages écrits après lundi, 0 pour les autres. Où va `p.created_at > \'2026-10-12\'` ?',
			options: [
				'Dans WHERE, car les filtres sur la table jointe vont toujours là',
				'Dans le ON de la LEFT JOIN, pour garder les sujets sans correspondance',
				'Dans une clause HAVING, car le comptage est calculé par GROUP BY',
				'N’importe où : avec une jointure gauche, ON et WHERE donnent le même résultat'
			],
			answer: 1,
			why: 'Dans WHERE, la condition passe après la jointure, et un sujet sans message récent y a NULL, donc il est écarté. Dans ON, elle décide seulement quels messages correspondent. La doc : « it matters a lot with outer joins ».'
		},
		{
			q: '`clean_posts` chez Discourse lit `post_search_data LEFT JOIN posts ... JOIN topics ON posts.topic_id = topics.id WHERE posts.id IS NULL OR ...`. Qu’arrive-t-il à une ligne de recherche dont le message a été supprimé pour de bon ?',
			options: [
				'Elle est supprimée, car la jointure gauche lui donne un `posts.id` NULL',
				'Elle reste, car un `posts.topic_id` NULL ne trouve aucun sujet dans la jointure interne',
				'Elle est supprimée, car la jointure interne se replie en jointure gauche sur NULL',
				'La requête échoue, car un JOIN ne peut pas suivre une LEFT JOIN dans PostgreSQL'
			],
			answer: 1,
			why: 'La jointure gauche produit la ligne avec des colonnes posts à NULL, puis la jointure interne exige `posts.topic_id = topics.id`, jamais vrai pour NULL. La ligne a disparu avant même WHERE. Les comparaisons avec NULL ont leur propre chapitre (jour 6).'
		}
	],
	recall: {
		q: 'Un sujet a 3 messages et 2 tags. Pourquoi une requête qui fait une jointure gauche vers les deux tables compte-t-elle 6 messages, et comment obtenir 3 ?',
		a: 'Chaque ligne de message s’associe à chaque tag, donc la jointure produit 3 x 2 = 6 lignes. Compte les messages par sujet dans une sous-requête avant la jointure, ou utilise `count(DISTINCT p.id)`.'
	},
	sources: [
		{ title: 'Discourse, reindex_search.rb (load_problem_topic_ids)', url: `${JOB}#L137-L148` },
		{ title: 'Doc PostgreSQL, Joined Tables', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-JOIN' },
		{ title: 'Doc PostgreSQL, Subquery Expressions (EXISTS)', url: 'https://www.postgresql.org/docs/current/functions-subquery.html' },
		{ title: 'Tutoriel PostgreSQL, Joins Between Tables', url: 'https://www.postgresql.org/docs/current/tutorial-join.html' },
		{ title: 'Doc PostgreSQL, Planner/Optimizer (méthodes de jointure)', url: 'https://www.postgresql.org/docs/current/planner-optimizer.html' },
		{ title: 'Doc PostgreSQL, Aggregate Functions (count)', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' }
	]
};
