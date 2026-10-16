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
		'La doc de PostgreSQL liste exactement ces trois défauts de `LIKE` pour la recherche : aucun support linguistique, aucun classement, aucun index. **La recherche plein texte règle les trois** : elle transforme chaque document en mots normalisés, une seule fois, et indexe ces mots.'
	],
	terms: [
		{ term: 'Lexème', def: 'Un mot après normalisation : en minuscules, réduit à sa racine, sans les mots vides. Avec la configuration `english`, « restored » et « restore » deviennent tous deux `restor`.' },
		{ term: 'tsvector', def: 'Une liste triée de lexèmes, chacun avec ses positions dans le document et un poids optionnel. C’est ce que tu stockes et indexes.' },
		{ term: 'tsquery', def: 'Des lexèmes reliés par `&`, `|`, `!` et `<->`. `@@` teste si un tsvector y correspond. `:*` demande une correspondance par préfixe.' },
		{ term: 'Poids', def: 'Une étiquette A, B, C ou D sur chaque position, posée avec `setweight`. Elle sert à classer un résultat dans le titre devant un résultat dans le corps.' },
		{ term: 'Index inversé', def: 'Un index qui va de chaque mot vers les lignes qui le contiennent. Dans PostgreSQL, c’est un index GIN sur le tsvector.' },
		{ term: 'Configuration', def: 'Le parseur et les dictionnaires qui fabriquent les lexèmes, comme `english` ou `simple`. Le document et la requête doivent utiliser la même.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['doc["Texte du titre + du corps"] -->|"to_tsvector english"| vec["tsvector : backup:1A restor:4A,7 test:5"]'],
				highlight: ['doc', 'vec'],
				note: '**Normaliser une fois, à l’écriture.** `to_tsvector` découpe le texte en tokens et les passe dans des dictionnaires. « Backups » devient `backup`, « restore » devient `restor`, et « the » disparaît comme mot vide. Chaque lexème garde ses positions, et `setweight` marque ceux du titre avec A.'
			},
			{
				add: ['vec --> gin[("Index GIN : du lexème vers les lignes")]'],
				highlight: ['gin'],
				note: '**Indexer les mots, pas le texte.** La doc appelle GIN « the preferred text search index type » (le type d’index préféré pour la recherche plein texte) : un index inversé avec « an index entry for each word (lexeme), with a compressed list of matching locations » (une entrée par mot et la liste compressée des endroits où il apparaît). Une recherche de deux mots trouve les lignes du premier, puis écarte celles qui n’ont pas le second.'
			},
			{
				add: ['user["L’utilisatrice tape : restore backup"] -->|"to_tsquery english"| query["tsquery : restor & backup"]', 'query -->|"@@"| gin'],
				highlight: ['user', 'query'],
				note: '**La requête passe par les mêmes étapes.** `to_tsquery(\'english\', \'restore & backup\')` donne `\'restor\' & \'backup\'`, donc « We restored the backups » correspond maintenant. Si le document et la requête n’utilisent pas la même configuration, les lexèmes diffèrent et rien ne correspond.'
			},
			{
				add: ['gin --> rank["ts_rank_cd par résultat, ORDER BY rank LIMIT 20"]'],
				highlight: ['rank'],
				note: '**Le classement vient après la correspondance.** `ts_rank_cd` lit le tsvector de chaque ligne trouvée et lui donne un score selon les poids et la proximité des mots. La doc prévient que ça « can be expensive » (peut coûter cher), parce qu’il faut lire chaque résultat, pas seulement les 20 premiers.'
			},
			{
				add: ['engine["Moteur de recherche : fautes de frappe, facettes, pertinence globale"] -.->|"quand l’app a besoin de plus"| user'],
				highlight: ['engine'],
				note: '**Là où ça s’arrête.** PostgreSQL compare les lexèmes à l’identique, ou par préfixe, et ses fonctions de classement « do not use any global information » (n’utilisent aucune information sur toute la collection). Si tes utilisateurs font des fautes, ont besoin de facettes, ou d’une pertinence réglée sur des millions de documents, un moteur de recherche comme Meilisearch, alimenté depuis la base, fait ce travail.'
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
			'**Quatre poids, quatre sources.** Le vecteur d’un post réunit le titre du sujet (A), le nom de la catégorie (B), les tags (C) et le corps du post (D). Le côté requête l’écrit noir sur blanc dans [`weights`](' + SEARCH + '#L1351-L1357) : « A is for title », « D is for cooked ». C’est la [méthode recommandée](' + TS + '#L767-L776) par la doc elle-même : `setweight(to_tsvector(coalesce(title,\'\')), \'A\') || ...`.',
			'**Une config par type de texte.** Les noms d’utilisateur passent par la configuration `simple`, qui met en minuscules sans réduire à la racine : l’utilisateur `running` ne devient pas `run`. Les posts utilisent `Search.ts_config`, choisie selon la langue du site.',
			'**Une limite dure, prise en compte.** Le corps est coupé à 600 000 caractères, et le commentaire dit pourquoi : les [limites](' + TS + '#L4056-L4057) de la doc disent que les données d’un tsvector « must be less than 1 megabyte » (doivent faire moins d’un mégaoctet). Le vecteur est enregistré par `upsert` dans `post_search_data`, une table à côté de `posts`.',
			'**Préfixe, filtre de poids, classement.** La requête construit `\'term\':*A` dans [`set_tsquery_weight_filter`](' + SEARCH + '#L1484-L1486) et trie avec [`TS_RANK_CD(..., normalization|32)`](' + SEARCH + '#L1441-L1450). Un filtre de poids coûte une revérification dans la table, parce que les index GIN [« store only the words (lexemes) of `tsvector` values, and not their weight labels »](' + TS + '#L3770-L3776) (ne gardent que les lexèmes, pas leurs poids).',
			'**L’index est reconstruit chaque jour.** Une tâche planifiée lance [`CREATE INDEX CONCURRENTLY ... USING GIN(search_data) WHERE NOT private_message AND post_id >= :post_id`](' + DC + '/app/jobs/scheduled/create_recent_post_search_indexes.rb#L26-L41), puis le met en place en le renommant. Un index partiel sur les posts récents reste bien plus petit qu’un index sur tout le forum (jour 14).'
		]
	},
	tradeoff: {
		gain: [
			'« restored backups » trouve « restore the backup » : la racinisation et les mots vides font porter la recherche sur des mots, pas sur des caractères.',
			'Un index GIN sert `@@`, donc une recherche lit les lignes qui correspondent au lieu de toute la table.',
			'Tout vit dans la base que tu fais déjà tourner : même transaction, mêmes sauvegardes, pas de second système à garder synchronisé.'
		],
		cost: [
			'Aucune tolérance aux fautes. « bakup » ne trouve rien, et le préfixe n’aide que pour la fin d’un mot.',
			'Le classement lit le tsvector de chaque ligne trouvée, et il note chaque document seul, sans statistiques sur toute la collection.',
			'Le tsvector doit rester à jour : une colonne générée, un trigger ou du code applicatif comme l’indexeur de Discourse, chacun avec son coût en écriture.',
			'Une configuration par vecteur. Un site avec des posts en plusieurs langues a besoin d’une config par ligne ou par index, et de requêtes qui la nomment.'
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
	takeaway: 'Transforme chaque document en lexèmes pondérés une seule fois, indexe-les en GIN, cherche avec `@@` et classe les résultats ; passe à un moteur de recherche quand il te faut les fautes de frappe, les facettes ou une pertinence globale.',
	sources: [
		{ title: 'Documentation PostgreSQL, Full Text Search : Introduction', url: 'https://www.postgresql.org/docs/current/textsearch-intro.html' },
		{ title: 'Documentation PostgreSQL, Controlling Text Search (classement)', url: 'https://www.postgresql.org/docs/current/textsearch-controls.html' },
		{ title: 'Documentation PostgreSQL, Preferred Index Types for Text Search', url: 'https://www.postgresql.org/docs/current/textsearch-indexes.html' },
		{ title: 'Documentation PostgreSQL, Text Search Types', url: 'https://www.postgresql.org/docs/current/datatype-textsearch.html' },
		{ title: 'Documentation Meilisearch, Typo tolerance settings', url: 'https://www.meilisearch.com/docs/learn/relevancy/typo_tolerance_settings' }
	]
};
