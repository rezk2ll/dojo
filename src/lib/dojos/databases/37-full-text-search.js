const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const TS = `${PG}/doc/src/sgml/textsearch.sgml`;
const DC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const SEARCH = `${DC}/lib/search.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'full-text-search',
	part: 'Beyond one server',
	title: 'Full-text search',
	minutes: 10,
	hook: [
		'A user types "restore backup" into your forum\'s search box. The code runs `WHERE body ILIKE \'%restore backup%\'`. The post titled "We restored the backups" **does not match**, because those exact characters are not in it.',
		'When something does match, you get four thousand rows in no useful order. And every search **reads every post**, because a `%` at the start of a pattern cannot use a B-tree.',
		'The PostgreSQL docs list exactly these three faults of `LIKE` for search: no linguistic support, no ranking, no index. **Full-text search fixes all three** by turning each document into normalized words once, and indexing those words.'
	],
	terms: [
		{ term: 'Lexeme', def: 'A word after normalization: lowercased, stemmed, stop words removed. With the `english` configuration, "restored" and "restore" both become `restor`.' },
		{ term: 'tsvector', def: 'A sorted list of lexemes, each with its positions in the document and an optional weight. What you store and index.' },
		{ term: 'tsquery', def: 'Lexemes joined by `&`, `|`, `!` and `<->`. `@@` tests whether a tsvector matches it. `:*` asks for a prefix match.' },
		{ term: 'Weight', def: 'A label A, B, C or D on each position, set with `setweight`. Used to rank a title hit above a body hit.' },
		{ term: 'Inverted index', def: 'An index from each word to the rows that contain it. In PostgreSQL, that is a GIN index on the tsvector.' },
		{ term: 'Configuration', def: 'The parser and dictionaries used to make lexemes, such as `english` or `simple`. The document and the query must use the same one.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['doc["Title + body text"] -->|"to_tsvector english"| vec["tsvector: backup:1A restor:4A,7 test:5"]'],
				highlight: ['doc', 'vec'],
				note: '**Normalize once, at write time.** `to_tsvector` splits the text into tokens and runs them through dictionaries. "Backups" becomes `backup`, "restore" becomes `restor`, and "the" is dropped as a stop word. Each lexeme keeps its positions, and `setweight` marks the title ones with A.'
			},
			{
				add: ['vec --> gin[("GIN index: lexeme to rows")]'],
				highlight: ['gin'],
				note: '**Index the words, not the text.** The docs call GIN "the preferred text search index type": an inverted index with "an index entry for each word (lexeme), with a compressed list of matching locations". A search for two words finds the rows for the first, then drops those lacking the second.'
			},
			{
				add: ['user["User types: restore backup"] -->|"to_tsquery english"| query["tsquery: restor & backup"]', 'query -->|"@@"| gin'],
				highlight: ['user', 'query'],
				note: '**The query goes through the same steps.** `to_tsquery(\'english\', \'restore & backup\')` gives `\'restor\' & \'backup\'`, so "We restored the backups" now matches. If the document and the query use different configurations, the lexemes differ and nothing matches.'
			},
			{
				add: ['gin --> rank["ts_rank_cd per match, ORDER BY rank LIMIT 20"]'],
				highlight: ['rank'],
				note: '**Ranking happens after matching.** `ts_rank_cd` reads the tsvector of each matching row and scores it by weight and by how close the words are. The docs warn this "can be expensive" because it must read every match, not just the top 20.'
			},
			{
				add: ['engine["Search engine: typos, facets, global relevance"] -.->|"when the app needs more"| user'],
				highlight: ['engine'],
				note: '**Where it stops.** PostgreSQL matches lexemes exactly, or by prefix, and its ranking functions "do not use any global information" about the whole collection. If users misspell, need facets, or need relevance tuned across millions of documents, a search engine such as Meilisearch, fed from the database, does that job.'
			}
		]
	},
	example: {
		title: 'app/services/search_indexer.rb: Discourse builds one weighted tsvector per post',
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
			'**Four weights, four sources.** A post\'s vector joins the topic title (A), the category name (B), the tags (C) and the post body (D). The query side spells it out in [`weights`](' + SEARCH + '#L1351-L1357): "A is for title", "D is for cooked". It is the docs\' own [recommended method](' + TS + '#L767-L776): `setweight(to_tsvector(coalesce(title,\'\')), \'A\') || ...`.',
			'**One config per kind of text.** Usernames use the `simple` configuration, which lowercases but does not stem, so the user `running` is not reduced to `run`. Posts use `Search.ts_config`, picked from the site\'s locale.',
			'**A hard limit, handled.** The body is cut at 600,000 characters, and the comment says why: the docs\' [limits](' + TS + '#L4056-L4057) say a tsvector\'s data "must be less than 1 megabyte". The vector is stored with `upsert` into `post_search_data`, a table beside `posts`.',
			'**Prefix, weight filter, rank.** The query builds `\'term\':*A` in [`set_tsquery_weight_filter`](' + SEARCH + '#L1484-L1486) and sorts with [`TS_RANK_CD(..., normalization|32)`](' + SEARCH + '#L1441-L1450). A weight filter costs a heap recheck, because GIN indexes ["store only the words (lexemes) of `tsvector` values, and not their weight labels"](' + TS + '#L3770-L3776).',
			'**The index is rebuilt daily.** A scheduled job runs [`CREATE INDEX CONCURRENTLY ... USING GIN(search_data) WHERE NOT private_message AND post_id >= :post_id`](' + DC + '/app/jobs/scheduled/create_recent_post_search_indexes.rb#L26-L41), then swaps it in by renaming. A partial index over recent posts stays much smaller than one over the whole forum (day 14).'
		]
	},
	tradeoff: {
		gain: [
			'"restored backups" finds "restore the backup": stemming and stop words make search work on words, not characters.',
			'A GIN index serves `@@`, so a search reads the matching rows instead of the whole table.',
			'It lives in the database you already run: same transaction, same backups, no second system to keep in step.'
		],
		cost: [
			'No typo tolerance. "bakup" matches nothing, and prefix matching only helps with the end of a word.',
			'Ranking reads the tsvector of every matching row, and it scores each document alone, with no statistics about the whole collection.',
			'The tsvector must be kept current: a generated column, a trigger or app code like Discourse\'s indexer, each with its own write cost.',
			'One configuration per vector. A site with posts in many languages needs a config per row or per index, and queries that name it.'
		]
	},
	task: {
		prompt: 'Table `posts(id bigint, title text, body text)`. Add search on title and body, with title hits ranked first. Write the DDL and the query for "restore backup". Then predict the tsvector for title "Backups you can restore" and body "Test the restore every week", and check it in `psql`.',
		hint: 'Keep the vector in a stored generated column so it is always current. Give `to_tsvector` an explicit configuration: a generated column needs an immutable expression.',
		answer: [
			'`ALTER TABLE posts ADD COLUMN search tsvector GENERATED ALWAYS AS (setweight(to_tsvector(\'english\', coalesce(title, \'\')), \'A\') || setweight(to_tsvector(\'english\', coalesce(body, \'\')), \'D\')) STORED;`',
			'`CREATE INDEX posts_search_idx ON posts USING GIN (search);` (use `CONCURRENTLY` on a live table, day 26).',
			'`SELECT id, title, ts_rank_cd(search, q) AS rank FROM posts, to_tsquery(\'english\', \'restore & backup\') q WHERE search @@ q ORDER BY rank DESC LIMIT 20;` For text typed by users, `websearch_to_tsquery` accepts quotes, `or` and `-` without syntax errors.',
			'The vector is `\'backup\':1A \'everi\':8 \'restor\':4A,7 \'test\':5 \'week\':9`. "you", "can" and "the" are stop words, but they still count as positions, which is why `restor` is at 4 and 7.',
			'With the default weights `{0.1, 0.2, 0.4, 1.0}` for D, C, B, A, a post with both words in its title outranks one with them only in its body.'
		]
	},
	quiz: [
		{
			q: '`SELECT \'fat cats ate fat rats\'::tsvector @@ to_tsquery(\'english\', \'rat\')` returns false. Why?',
			options: [
				'The cast does not normalize, so the vector holds `rats` and not `rat`',
				'The `english` configuration treats the word `rat` as a stop word',
				'A tsquery with a single lexeme needs a `:*` to match anything',
				'`@@` needs a GIN index on the left side before it can return true'
			],
			answer: 0,
			why: 'Casting text to tsvector assumes the words are already lexemes. Only `to_tsvector` runs the dictionaries that turn `rats` into `rat`. The docs show this exact pair of queries.'
		},
		{
			q: 'A query uses `\'restor\':A` to search titles only, and EXPLAIN shows a recheck on the heap. What causes it?',
			options: [
				'GIN stores each lexeme but not its weight, so the row must be checked',
				'GIN is lossy for every query, so every match must be rechecked',
				'The weight filter turns the GIN scan into a sequential scan',
				'Weights are kept in a separate table that must be joined'
			],
			answer: 0,
			why: 'The docs: GIN indexes "store only the words (lexemes) of `tsvector` values, and not their weight labels. Thus a table row recheck is needed when using a query that involves weights."'
		},
		{
			q: 'Your shop\'s users often type product names with typos, like "keybaord". Which fix fits best?',
			options: [
				'A GIN index with `jsonb_path_ops` on the product name column',
				'A tsvector with the `simple` configuration instead of `english`',
				'A search engine with typo tolerance, fed from the database',
				'A tsquery with `:*` after every word that the user types in'
			],
			answer: 2,
			why: 'PostgreSQL text search matches lexemes exactly or by prefix, so a swapped letter matches nothing. Typo tolerance is a feature of search engines such as Meilisearch, kept in sync from the source of truth (day 35).'
		}
	],
	takeaway: 'Turn each document into weighted lexemes once, index them with GIN, match with `@@` and rank the matches; reach for a search engine when you need typos, facets or global relevance.',
	sources: [
		{ title: 'PostgreSQL docs, Full Text Search: Introduction', url: 'https://www.postgresql.org/docs/current/textsearch-intro.html' },
		{ title: 'PostgreSQL docs, Controlling Text Search (ranking)', url: 'https://www.postgresql.org/docs/current/textsearch-controls.html' },
		{ title: 'PostgreSQL docs, Preferred Index Types for Text Search', url: 'https://www.postgresql.org/docs/current/textsearch-indexes.html' },
		{ title: 'PostgreSQL docs, Text Search Types', url: 'https://www.postgresql.org/docs/current/datatype-textsearch.html' },
		{ title: 'Meilisearch docs, Typo tolerance settings', url: 'https://www.meilisearch.com/docs/learn/relevancy/typo_tolerance_settings' }
	]
};
