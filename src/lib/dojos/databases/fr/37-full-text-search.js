const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const TS = `${PG}/doc/src/sgml/textsearch.sgml`;
const DC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const SEARCH = `${DC}/lib/search.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'full-text-search',
	part: 'Au-delà d’un serveur',
	title: 'La recherche plein texte',
	minutes: 10,
	hook: [
		'Une utilisatrice tape « restore backup » dans la barre de recherche de ton forum. Le code lance `WHERE body ILIKE \'%restore backup%\'`. Le post intitulé « We restored the backups » **ne sort pas**, parce que ces caractères exacts n’y sont pas.',
		'Quand quelque chose sort, tu obtiens quatre mille lignes dans un ordre sans intérêt. Et chaque recherche **lit tous les posts**, parce qu’un `%` en début de motif ne peut pas utiliser un B-tree.',
		'La doc de PostgreSQL liste exactement ces trois défauts de `LIKE` pour la recherche : aucun support linguistique, aucun classement, aucun index. **La recherche plein texte règle les trois** : elle réduit chaque document en mots normalisés, une seule fois, et indexe ces mots.'
	],
	terms: [
		{ term: 'Lexème', def: 'Un mot après normalisation : en minuscules, réduit à sa racine, sans les mots vides. Avec la configuration `english`, « restored » et « restore » donnent tous deux `restor`.' },
		{ term: 'tsvector', def: 'Une liste triée de lexèmes, chacun avec ses positions dans le document et un poids optionnel. C’est ce que tu stockes et indexes.' },
		{ term: 'tsquery', def: 'Des lexèmes reliés par `&`, `|`, `!` et `<->`. `@@` teste si un tsvector y correspond. `:*` demande une correspondance par préfixe.' },
		{ term: 'Poids', def: 'Une étiquette A, B, C ou D sur chaque position, posée avec `setweight`. Elle sert à classer un résultat dans le titre devant un résultat dans le corps.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['doc["Texte du titre + du corps"] -->|"to_tsvector english"| vec["tsvector : backup:1A restor:4A,7 test:5"]'],
				highlight: ['doc', 'vec'],
				note: '`to_tsvector` tourne une seule fois, à l’écriture. Il découpe le texte en tokens et les passe dans les dictionnaires d’une configuration, ici `english` : « Backups » donne `backup`, « restore » donne `restor`, et « the » disparaît comme mot vide. Chaque lexème garde ses positions, et `setweight` marque ceux du titre avec A.'
			},
			{
				add: ['vec --> gin[("Index GIN : du lexème vers les lignes")]'],
				highlight: ['gin'],
				note: 'L’index GIN stocke les lexèmes et les lignes qui les contiennent. La doc appelle GIN « the preferred text search index type » (le type d’index préféré pour la recherche plein texte) : un index inversé avec « an index entry for each word (lexeme), with a compressed list of matching locations » (une entrée par mot et la liste compressée des endroits où il apparaît). Une recherche de deux mots trouve les lignes du premier, puis écarte celles qui n’ont pas le second.'
			},
			{
				add: ['user["L’utilisatrice tape : restore backup"] -->|"to_tsquery english"| query["tsquery : restor & backup"]', 'query -->|"@@"| gin'],
				highlight: ['user', 'query'],
				note: 'La requête passe par les mêmes étapes. `to_tsquery(\'english\', \'restore & backup\')` donne `\'restor\' & \'backup\'`, donc « We restored the backups » correspond maintenant. Si le document et la requête n’utilisent pas la même configuration, les lexèmes diffèrent et rien ne correspond.'
			},
			{
				add: ['gin --> rank["ts_rank_cd par résultat, ORDER BY rank LIMIT 20"]'],
				highlight: ['rank'],
				note: '`ts_rank_cd` tourne après la correspondance. Il lit le tsvector de chaque ligne trouvée et lui donne un score selon les poids et la proximité des mots. La doc prévient que ça « can be expensive » (peut coûter cher), parce qu’il lit chaque résultat, même avec `LIMIT 20`.'
			},
			{
				add: ['engine["Moteur de recherche : fautes de frappe, facettes, pertinence globale"] -.->|"quand l’app a besoin de plus"| user'],
				highlight: ['engine'],
				note: 'PostgreSQL compare les lexèmes à l’identique, ou par préfixe, et ses fonctions de classement « do not use any global information » (n’utilisent aucune information sur toute la collection). Si tes utilisateurs font des fautes, ont besoin de facettes, ou d’une pertinence réglée sur des millions de documents, un moteur de recherche comme Meilisearch, alimenté depuis la base, fait ce travail.'
			}
		]
	},
	example: {
		title: 'app/services/search_indexer.rb : Discourse construit un tsvector pondéré par post',
		repo: 'discourse/discourse',
		url: `${DC}/app/services/search_indexer.rb#L32-L223`,
		lang: 'ruby',
		code: `  def self.update_index(table:, id:, a_weight: nil, b_weight: nil, c_weight: nil, d_weight: nil)
    raw_data = { a: a_weight, b: b_weight, c: c_weight, d: d_weight }

    # The version used in excerpts
    search_data = raw_data.transform_values { |data| Search.prepare_data(data || "", :index) }

    # The version used to build the index
    indexed_data =
      search_data.transform_values do |data|
        data.gsub(/\\S+/) { |word| word[0...SiteSetting.search_max_indexed_word_length] }
      end

    table_name = "#{table}_search_data"
    foreign_key = "#{table}_id"

    # for user login and name use "simple" lowercase stemmer
    stemmer = table == "user" ? "simple" : Search.ts_config

    ranked_index = <<~SQL
      setweight(to_tsvector('#{stemmer}', #{Search.wrap_unaccent("coalesce(:a,''))")}, 'A') ||
      setweight(to_tsvector('#{stemmer}', #{Search.wrap_unaccent("coalesce(:b,''))")}, 'B') ||
      setweight(to_tsvector('#{stemmer}', #{Search.wrap_unaccent("coalesce(:c,''))")}, 'C') ||
      setweight(to_tsvector('#{stemmer}', #{Search.wrap_unaccent("coalesce(:d,''))")}, 'D')
    SQL

    tsvector = DB.query_single("SELECT #{ranked_index}", indexed_data)[0]
…
    params = {
      "raw_data" => indexed_data,
      "#{foreign_key}" => id,
      "locale" => SiteSetting.default_locale,
      "version" => index_version,
      "search_data" => tsvector,
    }

    yield params if block_given?

    if handler
      handler[:search_data_class].upsert(params)
    else
      table_name.camelize.constantize.upsert(params)
    end
…
    update_index(
      table: "post",
      id: post_id,
      a_weight: topic_title,
      b_weight: category_name,
      c_weight: topic_tags,
      # The tsvector resulted from parsing a string can be double the size of
      # the original string. Since there is no way to estimate the length of
      # the expected tsvector, we limit the input to ~50% of the maximum
      # length of a tsvector (1_048_576 bytes).
      d_weight: post_text[0..600_000],
    ) { |params| params["private_message"] = private_message }`,
		notes: [
			'Les lignes 19 à 24 et 44 à 54 réunissent quatre textes dans un seul vecteur : le titre du sujet (A), le nom de la catégorie (B), les tags (C) et le corps du post (D). Le côté requête les nomme dans [`weights`](' + SEARCH + '#L1351-L1357) : « A is for title », « D is for cooked ». La doc recommande la même forme, `setweight(to_tsvector(coalesce(title,\'\')), \'A\') || ...` (dans les sources).',
			'Les lignes 16 et 17 choisissent la configuration `simple` pour les noms d’utilisateur. Elle met en minuscules sans réduire à la racine : l’utilisateur `running` reste `running`, au lieu de `run`. Les posts utilisent `Search.ts_config`, choisie selon la langue du site.',
			'La ligne 54 coupe le corps à 600 000 caractères, et les lignes 50 à 53 disent pourquoi : les [limites](' + TS + '#L4056-L4057) de la doc disent que les données d’un tsvector « must be less than 1 megabyte » (doivent faire moins d’un mégaoctet). Les lignes 38 à 42 enregistrent le vecteur par `upsert` dans `post_search_data`, une table à côté de `posts`.',
			'À la requête, [`set_tsquery_weight_filter`](' + SEARCH + '#L1484-L1486) construit `\'term\':*A`, un préfixe limité au poids A, et les résultats sont triés avec `TS_RANK_CD(..., normalization|32)`. Un filtre de poids coûte une revérification dans la table, parce que les index GIN « store only the words (lexemes) of `tsvector` values, and not their weight labels » (ils ne gardent que les lexèmes, sans leurs poids).',
			'Une tâche planifiée lance chaque jour [`CREATE INDEX CONCURRENTLY ... USING GIN(search_data) WHERE NOT private_message AND post_id >= :post_id`](' + DC + '/app/jobs/scheduled/create_recent_post_search_indexes.rb#L26-L41), puis met le nouvel index en place en le renommant. Un index partiel sur les posts récents reste bien plus petit qu’un index sur tout le forum (jour 14).'
		]
	},
	tradeoff: {
		gain: [
			'« restored backups » trouve « restore the backup », parce que les deux côtés sont réduits aux lexèmes `restor` et `backup`.',
			'Un index GIN sert `@@`, donc une recherche lit les lignes qui correspondent au lieu de toute la table.',
			'La recherche vit dans la base que tu fais déjà tourner : même transaction, mêmes sauvegardes, et aucun second système à garder synchronisé.'
		],
		cost: [
			'PostgreSQL ne tolère pas les fautes : « bakup » ne trouve rien, et le préfixe n’aide que pour la fin d’un mot.',
			'Le classement lit le tsvector de chaque ligne trouvée, et il note chaque document seul, sans statistiques sur toute la collection.',
			'Le tsvector doit rester à jour : une colonne générée, un trigger ou du code applicatif comme l’indexeur de Discourse, chacun avec son coût en écriture.',
			'Chaque vecteur est construit avec une seule configuration, donc un site avec des posts en plusieurs langues a besoin d’une config par ligne ou par index, et de requêtes qui la nomment.'
		]
	},
	task: {
		prompt: 'Table `posts(id bigint, title text, body text)`. Ajoute une recherche sur le titre et le corps, avec les résultats dans le titre classés en premier. Écris le DDL et la requête pour « restore backup ». Puis prédis le tsvector pour le titre « Backups you can restore » et le corps « Test the restore every week », et vérifie-le dans `psql`.',
		hint: 'Garde le vecteur dans une colonne générée stockée, pour qu’il soit toujours à jour. Donne à `to_tsvector` une configuration explicite : une colonne générée exige une expression immuable.',
		answer: [
			'`ALTER TABLE posts ADD COLUMN search tsvector GENERATED ALWAYS AS (setweight(to_tsvector(\'english\', coalesce(title, \'\')), \'A\') || setweight(to_tsvector(\'english\', coalesce(body, \'\')), \'D\')) STORED;`',
			'`CREATE INDEX posts_search_idx ON posts USING GIN (search);` (avec `CONCURRENTLY` sur une table en service, jour 26).',
			'`SELECT id, title, ts_rank_cd(search, q) AS rank FROM posts, to_tsquery(\'english\', \'restore & backup\') q WHERE search @@ q ORDER BY rank DESC LIMIT 20;` Pour un texte tapé par un utilisateur, `websearch_to_tsquery` accepte les guillemets, `or` et `-` sans erreur de syntaxe.',
			'Le vecteur est `\'backup\':1A \'everi\':8 \'restor\':4A,7 \'test\':5 \'week\':9`. « you », « can » et « the » sont des mots vides, mais ils comptent quand même comme positions : c’est pour ça que `restor` est en 4 et en 7.',
			'Avec les poids par défaut `{0.1, 0.2, 0.4, 1.0}` pour D, C, B, A, un post qui a les deux mots dans son titre passe devant un post qui ne les a que dans son corps.'
		],
		steps: [
			{
				title: 'Stocke le vecteur',
				questions: [
					{ q: 'Où gardes-tu le tsvector pour qu’il soit toujours à jour ?', options: ['Dans une colonne générée stockée', 'Nulle part : appelle `to_tsvector` dans chaque requête', 'Dans une colonne que l’application remplit une fois, à l’insert', 'Dans une colonne qu’un job de nuit reconstruit'], answer: 0, why: 'Une colonne générée est recalculée à chaque écriture, donc le vecteur n’est jamais en retard sur le texte.' },
					{ q: 'Pourquoi écrire `to_tsvector(\'english\', ...)` et pas `to_tsvector(...)` ?', options: ['`english` n’est pas installé par défaut', 'Une colonne générée exige une expression immuable, et la forme à un argument ne l’est pas', 'Seule la forme à deux arguments peut être indexée par GIN', 'Sans elle, les mots vides sont gardés'], answer: 1, why: 'La forme à un argument dépend d’un paramètre qui peut changer, donc PostgreSQL la refuse dans une colonne générée.' },
					{ q: 'Comment les résultats dans le titre passent-ils devant ceux du corps ?', options: ['Deux index séparés, un par colonne', 'Un `ORDER BY title` après la recherche', '`setweight(..., \'A\')` sur le titre et `\'D\'` sur le corps', 'Répéter le titre deux fois dans le vecteur'], answer: 2, why: 'Chaque position porte une étiquette de poids, et les fonctions de classement notent A bien au-dessus de D.' },
					{ q: 'Que fait la configuration `english` de « the » ?', options: ['Elle le garde comme lexème `the`', 'Elle le réduit à `th`', 'Elle lève une erreur', 'Elle le retire comme mot vide'], answer: 3, why: 'Les mots vides sont retirés pendant la normalisation, donc ils ne deviennent jamais des lexèmes.' }
				]
			},
			{
				title: 'Indexe et interroge',
				questions: [
					{ q: 'Discourse n’indexe pas tous les posts : une tâche quotidienne construit un index GIN `WHERE ... post_id >= :post_id`. Qu’est-ce que ça apporte ?', options: ['Un index partiel sur les posts récents reste bien plus petit qu’un index sur tout le forum', 'GIN ne sait pas indexer plus d’un million de lignes', 'Un index partiel n’a pas besoin de revérifier la table', 'Un index GIN complet ne se construit pas en `CONCURRENTLY`'], answer: 0, why: 'Un index partiel ne contient que les lignes que garde son `WHERE` (jour 14), donc l’index des posts récents reste petit.' },
					{ q: 'La table est en service et chargée. Comment construis-tu cet index ?', options: ['Dans une transaction, après `LOCK TABLE posts`', 'Avec `CREATE INDEX CONCURRENTLY`', 'La nuit, avec un simple `CREATE INDEX`', 'En copiant d’abord la table'], answer: 1, why: '`CONCURRENTLY` laisse passer les écritures pendant la construction de l’index (jour 26).' },
					{ q: 'Quel tsquery trouve les posts qui ont à la fois « restore » et « backup » ?', options: ['`to_tsquery(\'simple\', \'restore & backup\')`', '`\'restore & backup\'::tsquery`', '`to_tsquery(\'english\', \'restore & backup\')`', '`to_tsquery(\'english\', \'!restore & backup\')`'], answer: 2, why: 'Il donne `\'restor\' & \'backup\'`, les mêmes lexèmes que le vecteur. Une autre configuration ou un cast brut donne des mots qui ne correspondent jamais.' },
					{ q: 'La barre de recherche transmet ce que tapent les utilisateurs. Quelle fonction utilises-tu ?', options: ['`to_tsquery` sur le texte brut', 'Un cast en `::tsquery`', '`ILIKE` avec le texte brut', '`websearch_to_tsquery`'], answer: 3, why: 'Elle accepte les guillemets, `or` et `-` sans erreur de syntaxe, donc un `&` égaré ne casse pas la requête.' }
				]
			},
			{
				title: 'Classe les résultats',
				questions: [
					{ q: 'Comment tries-tu les correspondances ?', options: ['`ORDER BY ts_rank_cd(search, q) DESC`', '`ORDER BY id DESC`', '`ORDER BY length(body)`', '`ORDER BY search`'], answer: 0, why: '`ts_rank_cd` note chaque correspondance selon le poids et la proximité des mots.' },
					{ q: 'Quels sont les poids par défaut pour D, C, B et A ?', options: ['`{1.0, 0.4, 0.2, 0.1}`', '`{0.1, 0.2, 0.4, 1.0}`', '`{1, 1, 1, 1}`', '`{0.25, 0.5, 0.75, 1.0}`'], answer: 1, why: 'D compte 0,1 et A compte 1,0, donc un résultat dans le titre pèse dix fois un résultat dans le corps.' },
					{ q: 'Pourquoi le classement peut-il coûter cher même avec `LIMIT 20` ?', options: ['Il reconstruit l’index GIN', 'Il désactive l’index', 'Il lit le tsvector de chaque ligne qui correspond', 'Il trie toute la table'], answer: 2, why: 'La doc prévient que le classement lit toutes les correspondances avant que la limite s’applique.' },
					{ q: 'Un post a les deux mots dans son titre, un autre seulement dans son corps. Lequel passe devant ?', options: ['Celui du corps, puisque les corps sont plus longs', 'Égalité, puisque les deux correspondent', 'Celui qui a le plus petit `id`', 'Celui du titre'], answer: 3, why: 'Les lexèmes du titre portent le poids A, ceux du corps le poids D, et A note bien plus haut.' }
				]
			},
			{
				title: 'Prédis le vecteur',
				questions: [
					{ q: 'Corps « Test the restore every week » : que devient « every » ?', options: ['`every`', '`everi`', 'Rien : il disparaît comme mot vide', '`ever`'], answer: 1, why: 'Le stemmer `english` passe le mot en minuscules et le coupe en `everi`. Ce n’est pas un mot vide, donc il garde sa position, 8.' },
					{ q: '« restore » est dans le titre et dans le corps. Pourquoi `restor` n’apparaît-il qu’une fois dans le vecteur ?', options: ['La copie du corps est jetée comme doublon', 'Chaque lexème apparaît une fois, avec toutes ses positions', 'Seule la copie du titre est gardée, puisqu’elle a le poids A', '`||` fusionne les mots égaux en une seule position'], answer: 1, why: 'Un tsvector liste chaque lexème distinct une seule fois. `restor` porte les deux positions, 4 venue du titre et 7 venue du corps.' },
					{ q: 'Le vecteur montre `\'restor\':4A,7`. Pourquoi 4 et 7, et pas 2 et 4 ?', options: ['Les positions du titre commencent à 4', 'Les poids décalent les positions', 'Les mots vides sont retirés mais comptent quand même comme positions', 'Chaque lexème répété ajoute 3'], answer: 2, why: '« you » et « can » sont en 2 et 3, « the » en 6. Ils laissent des trous dans la numérotation.' },
					{ q: 'Dans `\'backup\':1A \'everi\':8 \'restor\':4A,7 \'test\':5 \'week\':9`, comment repères-tu les mots du titre ?', options: ['Ils viennent en premier dans la liste', 'Ils n’ont pas de position', 'Ils sont en majuscules', 'Leurs positions portent l’étiquette `A`'], answer: 3, why: 'La liste est triée par lexème, pas par origine. Seule l’étiquette de poids dit qu’une position vient du titre.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`SELECT \'fat cats ate fat rats\'::tsvector @@ to_tsquery(\'english\', \'rat\')` renvoie false. Pourquoi ?',
			options: [
				'Le cast ne normalise pas, donc le vecteur contient `rats` et pas `rat`',
				'La configuration `english` traite le mot `rat` comme un mot vide',
				'Un tsquery d’un seul lexème a besoin d’un `:*` pour trouver quoi que ce soit',
				'`@@` a besoin d’un index GIN sur la partie gauche pour renvoyer true'
			],
			answer: 0,
			why: 'Caster du texte en tsvector suppose que les mots sont déjà des lexèmes. Seul `to_tsvector` passe par les dictionnaires qui transforment `rats` en `rat`. La doc montre exactement cette paire de requêtes.'
		},
		{
			q: 'Une requête utilise `\'restor\':A` pour ne chercher que dans les titres, et EXPLAIN montre une revérification dans la table. Pourquoi ?',
			options: [
				'GIN stocke chaque lexème mais pas son poids, donc la ligne doit être relue',
				'GIN est approximatif pour toute requête, donc tout résultat est revérifié',
				'Le filtre de poids transforme le parcours GIN en parcours séquentiel',
				'Les poids sont gardés dans une table à part qu’il faut joindre'
			],
			answer: 0,
			why: 'La doc : les index GIN « store only the words (lexemes) of `tsvector` values, and not their weight labels. Thus a table row recheck is needed when using a query that involves weights. » Le poids n’est vérifiable que dans la ligne elle-même.'
		},
		{
			q: 'Les utilisateurs de ta boutique tapent souvent des noms de produits avec des fautes, comme « keybaord ». Quelle solution convient le mieux ?',
			options: [
				'Un index GIN en `jsonb_path_ops` sur la colonne du nom de produit',
				'Un tsvector avec la configuration `simple` au lieu de `english`',
				'Un moteur de recherche tolérant aux fautes, alimenté par la base',
				'Un tsquery avec `:*` après chaque mot que l’utilisateur tape'
			],
			answer: 2,
			why: 'La recherche plein texte de PostgreSQL compare les lexèmes à l’identique ou par préfixe, donc une lettre inversée ne trouve rien. La tolérance aux fautes est une fonction des moteurs de recherche comme Meilisearch, synchronisés depuis la source de vérité (jour 35).'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Voir `ILIKE` rater un post, puis construire une recherche pondérée et indexée qui le trouve et classe les résultats du titre en premier.',
		steps: [
			'Lance PostgreSQL et ouvre `psql` : `docker run -d --name fts-lab -e POSTGRES_PASSWORD=lab postgres:16`, attends quelques secondes, puis `docker exec -it fts-lab psql -U postgres`.',
			'Crée quatre posts : `CREATE TABLE posts (id bigint PRIMARY KEY, title text, body text); INSERT INTO posts VALUES (1, \'We restored the backups\', \'It took an hour.\'), (2, \'Backups you can restore\', \'Test the restore every week\'), (3, \'Weekly notes\', \'We had to restore one backup from tape.\'), (4, \'Cats\', \'Nothing about it.\');`',
			'Cherche à l’ancienne : `SELECT id FROM posts WHERE title ILIKE \'%restore backup%\' OR body ILIKE \'%restore backup%\';`.',
			'Essaie une colonne générée sans configuration : `ALTER TABLE posts ADD COLUMN bad tsvector GENERATED ALWAYS AS (to_tsvector(title)) STORED;`. Puis ajoute la colonne `search` de l’exercice, avec `english`, et l’index GIN.',
			'Lance la requête classée pour « restore backup », puis `SELECT search FROM posts WHERE id = 2;` et compare avec ta prédiction. Essaie `SELECT websearch_to_tsquery(\'english\', \'"restore backup" -tape\');`.',
			'Vérifie l’index : `SET enable_seqscan = off;` (sinon quatre lignes ne l’utiliseraient jamais), puis `EXPLAIN (COSTS OFF) SELECT id FROM posts WHERE search @@ to_tsquery(\'english\', \'restore & backup\');`. Quand tu as fini : `docker rm -f fts-lab`.'
		],
		done: [
			'La recherche `ILIKE` renvoie 0 ligne.',
			'La colonne générée sans configuration échoue avec `generation expression is not immutable`.',
			'La requête classée renvoie les posts 1, 2 et 3, avec les deux résultats dans le titre (1 et 2) devant le post 3, dont les mots ne sont que dans le corps.',
			'Le vecteur du post 2 est `\'backup\':1A \'everi\':8 \'restor\':4A,7 \'test\':5 \'week\':9`.',
			'`websearch_to_tsquery` affiche `\'restor\' <-> \'backup\' & !\'tape\'`, et le plan montre `Bitmap Index Scan on posts_search_idx`.'
		],
		solution: [
			'`ALTER TABLE posts ADD COLUMN search tsvector GENERATED ALWAYS AS (setweight(to_tsvector(\'english\', coalesce(title, \'\')), \'A\') || setweight(to_tsvector(\'english\', coalesce(body, \'\')), \'D\')) STORED;`',
			'`CREATE INDEX posts_search_idx ON posts USING GIN (search);`',
			'`SELECT id, title, ts_rank_cd(search, q) AS rank FROM posts, to_tsquery(\'english\', \'restore & backup\') q WHERE search @@ q ORDER BY rank DESC LIMIT 20;`',
			'Le post 3 correspond alors que son corps dit « backup » une fois et « restore » une fois : les deux côtés ont été réduits aux mêmes lexèmes.'
		]
	},
	recall: {
		q: 'Pourquoi une recherche plein texte de « restore backup » trouve-t-elle le post « We restored the backups », et quel index sert `@@` ?',
		a: '`to_tsvector` et `to_tsquery` avec la configuration `english` réduisent tous deux les mots aux lexèmes `restor` et `backup`. Un index GIN sur le tsvector sert `@@`.'
	},
	sources: [
		{ title: 'Documentation PostgreSQL, Full Text Search : Introduction', url: 'https://www.postgresql.org/docs/current/textsearch-intro.html' },
		{ title: 'Documentation PostgreSQL, Controlling Text Search (classement)', url: 'https://www.postgresql.org/docs/current/textsearch-controls.html' },
		{ title: 'Documentation PostgreSQL, Preferred Index Types for Text Search', url: 'https://www.postgresql.org/docs/current/textsearch-indexes.html' },
		{ title: 'Documentation PostgreSQL, Text Search Types', url: 'https://www.postgresql.org/docs/current/datatype-textsearch.html' },
		{ title: 'Sources de la doc PostgreSQL, textsearch.sgml : pondérer titre et corps', url: `${TS}#L767-L776` },
		{ title: 'Sources de la doc PostgreSQL, textsearch.sgml : GIN et poids', url: `${TS}#L3770-L3776` },
		{ title: 'Discourse, lib/search.rb : tri par TS_RANK_CD', url: `${SEARCH}#L1441-L1450` },
		{ title: 'Documentation Meilisearch, Typo tolerance settings', url: 'https://www.meilisearch.com/docs/learn/relevancy/typo_tolerance_settings' }
	]
};
