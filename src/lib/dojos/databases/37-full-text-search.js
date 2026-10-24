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
		'The PostgreSQL docs list exactly these three faults of `LIKE` for search: no linguistic support, no ranking, no index. **Full-text search handles all three**: it turns each document into normalized words once, and indexes those words.'
	],
	terms: [
		{ term: 'Lexeme', def: 'A word after normalization: lowercased, stemmed, stop words removed. With the `english` configuration, "restored" and "restore" both give `restor`.' },
		{ term: 'tsvector', def: 'A sorted list of lexemes, each with its positions in the document and an optional weight. What you store and index.' },
		{ term: 'tsquery', def: 'Lexemes joined by `&`, `|`, `!` and `<->`. `@@` tests whether a tsvector matches it. `:*` asks for a prefix match.' },
		{ term: 'Weight', def: 'A label A, B, C or D on each position, set with `setweight`. Used to rank a title hit above a body hit.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['doc["Title + body text"] -->|"to_tsvector english"| vec["tsvector: backup:1A restor:4A,7 test:5"]'],
				highlight: ['doc', 'vec'],
				note: '`to_tsvector` runs once, at write time. It splits the text into tokens and runs them through the dictionaries of a configuration, here `english`: "Backups" gives `backup`, "restore" gives `restor`, and "the" is dropped as a stop word. Each lexeme keeps its positions, and `setweight` marks the title ones with A.'
			},
			{
				add: ['vec --> gin[("GIN index: lexeme to rows")]'],
				highlight: ['gin'],
				note: 'The GIN index stores lexemes and the rows that hold them. The docs call GIN "the preferred text search index type": an inverted index with "an index entry for each word (lexeme), with a compressed list of matching locations". A search for two words finds the rows for the first, then drops those lacking the second.'
			},
			{
				add: ['user["User types: restore backup"] -->|"to_tsquery english"| query["tsquery: restor & backup"]', 'query -->|"@@"| gin'],
				highlight: ['user', 'query'],
				note: 'The query goes through the same steps. `to_tsquery(\'english\', \'restore & backup\')` gives `\'restor\' & \'backup\'`, so "We restored the backups" now matches. If the document and the query use different configurations, the lexemes differ and nothing matches.'
			},
			{
				add: ['gin --> rank["ts_rank_cd per match, ORDER BY rank LIMIT 20"]'],
				highlight: ['rank'],
				note: '`ts_rank_cd` runs after matching. It reads the tsvector of each matching row and scores it by weight and by how close the words are. The docs warn this "can be expensive" because it reads every match, even with `LIMIT 20`.'
			},
			{
				add: ['engine["Search engine: typos, facets, global relevance"] -.->|"when the app needs more"| user'],
				highlight: ['engine'],
				note: 'PostgreSQL matches lexemes exactly, or by prefix, and its ranking functions "do not use any global information" about the whole collection. If users misspell, need facets, or need relevance tuned across millions of documents, a search engine such as Meilisearch, fed from the database, does that job.'
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
			'Lines 19 to 24 and 44 to 54 join four texts into one vector: the topic title (A), the category name (B), the tags (C) and the post body (D). The query side names them in [`weights`](' + SEARCH + '#L1351-L1357): "A is for title", "D is for cooked". The docs recommend the same `setweight(to_tsvector(coalesce(title,\'\')), \'A\') || ...` pattern (in the sources).',
			'Lines 16 and 17 pick the `simple` configuration for usernames. It lowercases but does not stem, so the user `running` stays `running` instead of `run`. Posts use `Search.ts_config`, picked from the site\'s locale.',
			'Line 54 cuts the body at 600,000 characters, and lines 50 to 53 say why: the docs\' [limits](' + TS + '#L4056-L4057) say a tsvector\'s data "must be less than 1 megabyte". Lines 38 to 42 store the vector with `upsert` into `post_search_data`, a table beside `posts`.',
			'At query time, [`set_tsquery_weight_filter`](' + SEARCH + '#L1484-L1486) builds `\'term\':*A`, a prefix match on weight A only, and the results are sorted with `TS_RANK_CD(..., normalization|32)`. A weight filter costs a heap recheck, because GIN indexes "store only the words (lexemes) of `tsvector` values, and not their weight labels".',
			'A daily scheduled job runs [`CREATE INDEX CONCURRENTLY ... USING GIN(search_data) WHERE NOT private_message AND post_id >= :post_id`](' + DC + '/app/jobs/scheduled/create_recent_post_search_indexes.rb#L26-L41), then swaps the new index in by renaming it. A partial index over recent posts stays much smaller than one over the whole forum (day 14).'
		]
	},
	tradeoff: {
		gain: [
			'"restored backups" finds "restore the backup", because both sides are reduced to the lexemes `restor` and `backup`.',
			'A GIN index serves `@@`, so a search reads the matching rows instead of the whole table.',
			'Search lives in the database you already run: same transaction, same backups, no second system to keep in step.'
		],
		cost: [
			'PostgreSQL has no typo tolerance: "bakup" matches nothing, and prefix matching only helps with the end of a word.',
			'Ranking reads the tsvector of every matching row, and it scores each document alone, with no statistics about the whole collection.',
			'The tsvector must be kept current: a generated column, a trigger or app code like Discourse\'s indexer, each with its own write cost.',
			'Each vector is built with one configuration, so a site with posts in many languages needs a config per row or per index, and queries that name it.'
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
		],
		steps: [
			{
				title: 'Store the vector',
				questions: [
					{ q: 'Where do you keep the tsvector so it is always current?', options: ['In a stored generated column', 'Nowhere: call `to_tsvector` in every query', 'In a column the app fills once, at insert', 'In a column a nightly job rebuilds'], answer: 0, why: 'A generated column is recomputed on every write, so the vector never lags behind the text.' },
					{ q: 'Why write `to_tsvector(\'english\', ...)` and not `to_tsvector(...)`?', options: ['`english` is not installed by default', 'A generated column needs an immutable expression, and the one-argument form is not', 'The two-argument form is the only one GIN can index', 'Without it, stop words are kept'], answer: 1, why: 'The one-argument form depends on a setting that can change, so PostgreSQL refuses it in a generated column.' },
					{ q: 'How do title hits rank above body hits?', options: ['Two separate indexes, one per column', '`ORDER BY title` after the search', '`setweight(..., \'A\')` on the title and `\'D\'` on the body', 'Repeat the title twice in the vector'], answer: 2, why: 'Each position carries a weight label, and the ranking functions score A far above D.' },
					{ q: 'What does the `english` configuration do with "the"?', options: ['It keeps it as the lexeme `the`', 'It stems it to `th`', 'It raises an error', 'It drops it as a stop word'], answer: 3, why: 'Stop words are removed during normalization, so they never become lexemes.' }
				]
			},
			{
				title: 'Index and query',
				questions: [
					{ q: 'Discourse does not index every post: a daily job builds a GIN index `WHERE ... post_id >= :post_id`. What does that buy?', options: ['A partial index over recent posts stays much smaller than one over the whole forum', 'GIN cannot index more than a million rows', 'A partial index needs no recheck on the heap', 'A full GIN index cannot be built `CONCURRENTLY`'], answer: 0, why: 'A partial index holds only the rows its `WHERE` keeps (day 14), so the index on recent posts stays small.' },
					{ q: 'The table is live and busy. How do you build that index?', options: ['In a transaction, after `LOCK TABLE posts`', 'With `CREATE INDEX CONCURRENTLY`', 'Off-hours, with a plain `CREATE INDEX`', 'By copying the table first'], answer: 1, why: '`CONCURRENTLY` lets writes keep flowing while the index builds (day 26).' },
					{ q: 'Which tsquery finds posts with both "restore" and "backup"?', options: ['`to_tsquery(\'simple\', \'restore & backup\')`', '`\'restore & backup\'::tsquery`', '`to_tsquery(\'english\', \'restore & backup\')`', '`to_tsquery(\'english\', \'!restore & backup\')`'], answer: 2, why: 'It gives `\'restor\' & \'backup\'`, the same lexemes as the vector. A different configuration or a raw cast gives words that never match.' },
					{ q: 'The search box passes what users type. Which function do you use?', options: ['`to_tsquery` on the raw text', 'A cast to `::tsquery`', '`ILIKE` with the raw text', '`websearch_to_tsquery`'], answer: 3, why: 'It accepts quotes, `or` and `-` without syntax errors, so a stray `&` cannot break the query.' }
				]
			},
			{
				title: 'Rank the results',
				questions: [
					{ q: 'How do you sort the matches?', options: ['`ORDER BY ts_rank_cd(search, q) DESC`', '`ORDER BY id DESC`', '`ORDER BY length(body)`', '`ORDER BY search`'], answer: 0, why: '`ts_rank_cd` scores each match by weight and by how close the words are.' },
					{ q: 'What are the default weights for D, C, B and A?', options: ['`{1.0, 0.4, 0.2, 0.1}`', '`{0.1, 0.2, 0.4, 1.0}`', '`{1, 1, 1, 1}`', '`{0.25, 0.5, 0.75, 1.0}`'], answer: 1, why: 'D counts 0.1 and A counts 1.0, so a title hit weighs ten times a body hit.' },
					{ q: 'Why can ranking be expensive even with `LIMIT 20`?', options: ['It rebuilds the GIN index', 'It disables the index', 'It reads the tsvector of every matching row', 'It sorts the whole table'], answer: 2, why: 'The docs warn that ranking reads every match before the limit applies.' },
					{ q: 'One post has both words in its title, another only in its body. Which ranks first?', options: ['The body post, since bodies are longer', 'They tie, since both match', 'Whichever has the lower `id`', 'The title post'], answer: 3, why: 'Title lexemes carry weight A, body lexemes weight D, and A scores far higher.' }
				]
			},
			{
				title: 'Predict the vector',
				questions: [
					{ q: 'Body "Test the restore every week": what does "every" become?', options: ['`every`', '`everi`', 'Nothing: it is dropped as a stop word', '`ever`'], answer: 1, why: 'The `english` stemmer lowercases and cuts the word to `everi`. It is not a stop word, so it keeps its position, 8.' },
					{ q: '"restore" is in the title and in the body. Why does `restor` appear only once in the vector?', options: ['The body copy is dropped as a duplicate', 'Each lexeme appears once, with all its positions', 'Only the title copy is kept, since it has weight A', '`||` merges equal words into one position'], answer: 1, why: 'A tsvector lists each distinct lexeme once. `restor` carries both positions, 4 from the title and 7 from the body.' },
					{ q: 'The vector shows `\'restor\':4A,7`. Why 4 and 7, not 2 and 4?', options: ['Title positions start at 4', 'Weights shift the positions', 'Stop words are dropped but still count as positions', 'Each repeated lexeme adds 3'], answer: 2, why: '"you" and "can" sit at 2 and 3, "the" at 6. They leave gaps in the numbering.' },
					{ q: 'In `\'backup\':1A \'everi\':8 \'restor\':4A,7 \'test\':5 \'week\':9`, how do you spot the title words?', options: ['They come first in the list', 'They have no position', 'They are in capitals', 'Their positions carry the label `A`'], answer: 3, why: 'The list is sorted by lexeme, not by origin. Only the weight label says a position came from the title.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Watch `ILIKE` miss a post, then build a weighted, indexed search that finds it and ranks title hits first.',
		steps: [
			'Start PostgreSQL and open `psql`: `docker run -d --name fts-lab -e POSTGRES_PASSWORD=lab postgres:16`, wait a few seconds, then `docker exec -it fts-lab psql -U postgres`.',
			'Create four posts: `CREATE TABLE posts (id bigint PRIMARY KEY, title text, body text); INSERT INTO posts VALUES (1, \'We restored the backups\', \'It took an hour.\'), (2, \'Backups you can restore\', \'Test the restore every week\'), (3, \'Weekly notes\', \'We had to restore one backup from tape.\'), (4, \'Cats\', \'Nothing about it.\');`',
			'Search the old way: `SELECT id FROM posts WHERE title ILIKE \'%restore backup%\' OR body ILIKE \'%restore backup%\';`.',
			'Try a generated column without a configuration: `ALTER TABLE posts ADD COLUMN bad tsvector GENERATED ALWAYS AS (to_tsvector(title)) STORED;`. Then add the `search` column from the task, with `english`, and the GIN index.',
			'Run the ranked query for "restore backup", then `SELECT search FROM posts WHERE id = 2;` and compare with your prediction. Try `SELECT websearch_to_tsquery(\'english\', \'"restore backup" -tape\');`.',
			'Check the index: `SET enable_seqscan = off;` (four rows would never use it otherwise), then `EXPLAIN (COSTS OFF) SELECT id FROM posts WHERE search @@ to_tsquery(\'english\', \'restore & backup\');`. When you are done: `docker rm -f fts-lab`.'
		],
		done: [
			'The `ILIKE` search returns 0 rows.',
			'The generated column without a configuration fails with `generation expression is not immutable`.',
			'The ranked query returns posts 1, 2 and 3, with the two title hits (1 and 2) above post 3, whose words are only in its body.',
			'Post 2\'s vector is `\'backup\':1A \'everi\':8 \'restor\':4A,7 \'test\':5 \'week\':9`.',
			'`websearch_to_tsquery` prints `\'restor\' <-> \'backup\' & !\'tape\'`, and the plan shows `Bitmap Index Scan on posts_search_idx`.'
		],
		solution: [
			'`ALTER TABLE posts ADD COLUMN search tsvector GENERATED ALWAYS AS (setweight(to_tsvector(\'english\', coalesce(title, \'\')), \'A\') || setweight(to_tsvector(\'english\', coalesce(body, \'\')), \'D\')) STORED;`',
			'`CREATE INDEX posts_search_idx ON posts USING GIN (search);`',
			'`SELECT id, title, ts_rank_cd(search, q) AS rank FROM posts, to_tsquery(\'english\', \'restore & backup\') q WHERE search @@ q ORDER BY rank DESC LIMIT 20;`',
			'Post 3 matches although its body says "backup" once and "restore" once: both sides were reduced to the same lexemes.'
		]
	},
	recall: {
		q: 'Why does a full-text search for "restore backup" find the post "We restored the backups", and which index serves `@@`?',
		a: '`to_tsvector` and `to_tsquery` with the `english` configuration both reduce the words to the lexemes `restor` and `backup`. A GIN index on the tsvector serves `@@`.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Full Text Search: Introduction', url: 'https://www.postgresql.org/docs/current/textsearch-intro.html' },
		{ title: 'PostgreSQL docs, Controlling Text Search (ranking)', url: 'https://www.postgresql.org/docs/current/textsearch-controls.html' },
		{ title: 'PostgreSQL docs, Preferred Index Types for Text Search', url: 'https://www.postgresql.org/docs/current/textsearch-indexes.html' },
		{ title: 'PostgreSQL docs, Text Search Types', url: 'https://www.postgresql.org/docs/current/datatype-textsearch.html' },
		{ title: 'PostgreSQL source docs, textsearch.sgml: weighting title and body', url: `${TS}#L767-L776` },
		{ title: 'PostgreSQL source docs, textsearch.sgml: GIN and weight labels', url: `${TS}#L3770-L3776` },
		{ title: 'Discourse, lib/search.rb: TS_RANK_CD ordering', url: `${SEARCH}#L1441-L1450` },
		{ title: 'Meilisearch docs, Typo tolerance settings', url: 'https://www.meilisearch.com/docs/learn/relevancy/typo_tolerance_settings' }
	]
};
