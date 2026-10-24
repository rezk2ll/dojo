const DD = 'https://github.com/duckdb/duckdb/blob/1b4c3e54ba3625bac56ad184f0ce642a8d2bfbd5';
const CKPT = `${DD}/src/storage/table/column_data_checkpointer.cpp`;
const DW = 'https://github.com/duckdb/duckdb-web/blob/704f9e622a04b799e63d3d2d2cabeef1a2c6ba39/docs/current';
const CH = 'https://github.com/ClickHouse/clickhouse-docs/blob/89036285e33b88b424ebc397cce3cb70e9c2b5a9';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'columnar',
	part: 'Beyond one server',
	title: 'Columns for analytics',
	minutes: 10,
	hook: [
		'Finance wants revenue per month for the last three years. The query is one line: `SELECT date_trunc(\'month\', created_at), sum(total) FROM orders GROUP BY 1`. On your 40-column `orders` table, **it runs for minutes** and slows down checkout while it does.',
		'The query needs two columns. But PostgreSQL stores **whole rows together** in 8 KB pages (day 9), so to read `total` it reads the address, the notes and the 36 other columns too, for every order ever placed.',
		'Analytics engines such as DuckDB and ClickHouse use the other layout: **each column is stored on its own**, compressed, with a min and max per block. The same query reads a small part of the data, and often skips whole blocks without opening them.'
	],
	terms: [
		{ term: 'Row store', def: 'All the columns of a row sit next to each other on disk. Fast to read or change one whole row. PostgreSQL\'s heap stores rows this way.' },
		{ term: 'Column store', def: 'Each column is stored on its own. A query reads only the columns it names. DuckDB and ClickHouse work this way.' },
		{ term: 'Row group', def: 'A horizontal slice of a table, stored column by column. In DuckDB, 122,880 rows by default. Compression and parallelism work per row group.' },
		{ term: 'Zonemap', def: 'The min and max of a column in a block. A filter that falls outside the range skips the block without reading it. Also called a min-max index.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['q["sum(total) by month"] --> heap[("Row store: each page holds whole rows, 40 columns")]'],
				highlight: ['q', 'heap'],
				note: 'In a row store, `total` is spread across every page of the table, between the other columns. To sum it, PostgreSQL reads every page. That layout suits checkout, which reads and writes one whole order at a time.'
			},
			{
				add: ['q --> rg["Row group: 122,880 rows"]', 'rg --> c1[("created_at")]', 'rg --> c2[("total")]', 'rg -.->|"not read"| c3[("38 other columns")]'],
				highlight: ['rg', 'c1', 'c2'],
				note: 'DuckDB cuts a table into row groups and stores each column of a row group on its own. ClickHouse\'s [FAQ](' + CH + '/docs/faq/general/columnar-database.md#L15): this layout "allows reading data from disk only for those columns that are used in any given query". The 38 other columns are never touched.'
			},
			{
				add: ['rg --> comp["Per column: try each encoding, keep the smallest"]'],
				highlight: ['comp'],
				note: 'A column of `status` holds three words repeated a million times. DuckDB analyzes each column at checkpoint with every candidate encoding and keeps the one with the lowest estimated size: dictionary for `status`, bit packing for numbers that fit in few bits.'
			},
			{
				add: ['zm["Zonemap: min and max per row group"] -->|"skip groups before 2026"| rg'],
				highlight: ['zm'],
				note: 'DuckDB keeps the min and max of each column for every row group. With `WHERE created_at >= \'2026-01-01\'`, every row group whose max is earlier is skipped. This works well only when the data is roughly sorted on that column, as dates usually are.'
			},
			{
				add: ['c2 -->|"2048 values at a time"| vec["Vectorized aggregate"]'],
				highlight: ['vec'],
				note: 'DuckDB\'s operators work on vectors of a fixed size, 2048 values by default. A vector is an array of a single type, and can even stay compressed. One operator call handles 2048 values instead of one row.'
			}
		]
	},
	example: {
		title: 'src/storage/table/column_data_checkpointer.cpp: DuckDB picks a compression per column',
		repo: 'duckdb/duckdb',
		url: `${CKPT}#L172-L254`,
		lang: 'cpp',
		code: `vector<CheckpointAnalyzeResult> ColumnDataCheckpointer::DetectBestCompressionMethod() {
…
	InitAnalyze();
	// scan over all the segments and run the analyze step
	ScanSegments([&](Vector &scan_vector) {
		for (idx_t i = 0; i < checkpoint_states.size(); i++) {
			auto &functions = compression_functions[i];
			auto &states = analyze_states[i];
			for (idx_t j = 0; j < functions.size(); j++) {
				auto &state = states[j];
				auto &func = functions[j];

				if (!state) {
					continue;
				}
				if (!func->analyze(*state, scan_vector)) {
					state = nullptr;
					func = nullptr;
				}
			}
		}
	});
…
		unique_ptr<AnalyzeState> chosen_state;
		idx_t best_score = NumericLimits<idx_t>::Maximum();
		idx_t compression_idx = DConstants::INVALID_INDEX;

		D_ASSERT(functions.size() == states.size());
		for (idx_t j = 0; j < functions.size(); j++) {
			auto &function = functions[j];
			auto &state = states[j];

			if (!state) {
				continue;
			}

			//! Check if the method type is the forced method (if forced is used)
			bool forced_method_found = function->type == forced_method;
			// now that we have passed over all the data, we need to figure out the best method
			// we do this using the final_analyze method
			auto score = function->final_analyze(*state);

			//! The finalize method can return this value from final_analyze to indicate it should not be used.
			if (score == DConstants::INVALID_INDEX) {
				continue;
			}

			if (score < best_score || forced_method_found) {
				compression_idx = j;
				best_score = score;
				chosen_state = std::move(state);
			}
			//! If we have found the forced method, we're done
			if (forced_method_found) {
				break;
			}
		}`,
		notes: [
			'Lines 5 to 22 feed the column\'s data, vector by vector, to the `analyze` of each candidate encoding. A method that cannot handle the data returns false on line 16 and drops out. This runs when a column is [written to disk](' + CKPT + '#L310-L312) at checkpoint.',
			'Line 41 gets a score from `final_analyze`, an estimate in bytes, and lines 48 to 52 keep the lowest. For run-length encoding the score is [(count + value) times the number of runs](' + DD + '/src/storage/compression/rle.cpp#L130-L134), and for bit packing it is the total packed size. A forced method from settings (line 38) overrides the choice.',
			'The [docs](' + DW + '/internals/storage.md#L214-L218) say compression and parallelism "are based on row groups", whose default size is 122,880 rows. A column can be dictionary encoded in one row group and stored uncompressed in the next.',
			'The [indexing guide](' + DW + '/guides/performance/indexing.md#L19-L24) says "The more ordered the data within a column, the more valuable the zonemap indexes will be", and that with random values DuckDB "will likely be unable to skip any row groups". Sorted data also compresses better: in the same guide, an ordered timestamp column came out 2.5 times smaller than an unordered one.'
		]
	},
	tradeoff: {
		gain: [
			'A query that names 2 columns out of 40 reads about 2 columns of data, not 40.',
			'Values of one type and one meaning sit together, so they compress well. DuckDB\'s [docs](' + DW + '/internals/storage.md#L211-L212) estimate that 100 GB of uncompressed CSV takes about 25 GB once loaded.',
			'Zonemaps skip whole row groups on a sorted column, with no index to create or maintain.',
			'Operators work on vectors of 2048 values of one type, so each call does the work of 2048 rows.'
		],
		cost: [
			'Fetching one order by id touches every column file. ClickHouse\'s FAQ: "operations that affect whole rows become proportionally more expensive".',
			'ClickHouse\'s [insert guide](' + CH + '/docs/best-practices/_snippets/_async_inserts.md#L7) warns that "Sending many small batches in synchronous mode isn\'t recommended". A batch copy of the orders fits that, while checkout writes one order at a time.',
			'A second engine means a pipeline to copy data in, and reports that lag behind the live database.',
			'Zonemaps help only on columns the data is ordered by. A filter on a random UUID reads every row group.'
		]
	},
	task: {
		prompt: 'Your `orders` table has 50 million rows of about 200 bytes each, in 40 columns. The report needs `created_at` (8 bytes) and `total` (8 bytes) for 2026 only, and orders were inserted in date order over 5 years. Estimate how many bytes a row store reads and how many a column store reads, before compression. Then try it on a small scale in DuckDB and look at `pragma_storage_info(\'orders\')`.',
		hint: 'Row store: every page holds whole rows. Column store: two columns, then cut by what the zonemap can skip.',
		answer: [
			'Row store: 50 million times 200 bytes is about 10 GB, read in full, because the filter cannot avoid pages without an index, and even with one the report touches a fifth of the table.',
			'Column store, two columns only: 50 million times 16 bytes is 800 MB.',
			'Zonemaps on `created_at`: the data is in date order, so row groups before 2026 have a max below the filter and are skipped. One year out of five leaves about 160 MB, before any compression.',
			'In DuckDB 1.5, a 1 million row copy with an `id`, a `created_at` every 30 seconds, a 3-value `status` and a `total` showed `Dictionary` for `status` and `BitPacking` for the others in `pragma_storage_info`. The database file was 2.7 MiB, while the same rows in a PostgreSQL heap took 58 MB.',
			'Conclusion: keep checkout on PostgreSQL, and copy orders to a column store in batches for reports, accepting that reports run a few minutes behind.'
		],
		steps: [
			{
				title: 'Estimate the row store',
				questions: [
					{ q: 'With no index on `created_at`, how many bytes does a row store read for the report, before compression?', options: ['About 10 GB', 'About 800 MB', 'About 160 MB', 'About 2 GB'], answer: 0, why: '50 million rows of 200 bytes is about 10 GB, and every page is read.' },
					{ q: 'Why does it read all of that for two columns?', options: ['It decompresses every page first', 'Each page holds whole rows, so `total` comes with the 38 other columns', 'It reads every index as well', 'PostgreSQL reads each row twice'], answer: 1, why: 'The two columns are spread across every page of the table, between the other columns.' },
					{ q: 'You add an index on `created_at`. Why does the report stay expensive?', options: ['Indexes cannot be used for `sum`', 'The index is ignored on timestamps', '2026 is a fifth of the table, and each row read is still a whole row', 'The index makes the pages bigger'], answer: 2, why: 'An index finds rows, but each row it finds still brings all 40 columns with it.' },
					{ q: 'What is the row store good at, then?', options: ['Revenue per month over five years', 'Counting distinct visitors over a year', 'Averages across all past orders', 'Reading or writing one whole order, as checkout does'], answer: 3, why: 'A whole row sits in one page, so one order is one page read or write.' }
				]
			},
			{
				title: 'Estimate the column store',
				questions: [
					{ q: 'How many bytes per row does the report need?', options: ['16', '200', '8', '40'], answer: 0, why: '`created_at` is 8 bytes and `total` is 8 bytes.' },
					{ q: 'How many bytes does the column store read for those two columns, before skipping anything?', options: ['About 10 GB', 'About 800 MB', 'About 160 MB', 'About 80 MB'], answer: 1, why: '50 million rows times 16 bytes is 800 MB.' },
					{ q: 'Why does it never touch the other 38 columns?', options: ['They are compressed to nothing', 'A zonemap skips them', 'Each column is stored on its own, and the query names only two', 'It keeps an index on every column'], answer: 2, why: 'A query reads only the columns it names. The others sit in their own files, untouched.' },
					{ q: 'What makes the real number smaller still?', options: ['Bigger row groups', 'A B-tree on each column', 'Sampling a fraction of the rows', 'Compression: values of one column look alike'], answer: 3, why: 'A column of one type and one meaning compresses well, so even fewer bytes come off the disk.' }
				]
			},
			{
				title: 'Apply the zonemaps',
				questions: [
					{ q: 'What does a zonemap keep for each row group?', options: ['The min and max of the column', 'Every value, sorted', 'A hash of each value', 'The number of NULLs only'], answer: 0, why: 'A filter that falls outside the min-max range skips the row group without reading it.' },
					{ q: 'Why can row groups before 2026 be skipped here?', options: ['DuckDB knows the current year', 'The orders were inserted in date order, so their max is below the filter', 'Old row groups are compressed harder', 'Old row groups are deleted at checkpoint'], answer: 1, why: 'Zonemaps pay off when the data is roughly sorted on the filtered column, as dates inserted over time are.' },
					{ q: 'One year out of five is left. How many bytes is that, before compression?', options: ['About 800 MB', 'About 10 GB', 'About 160 MB', 'About 16 MB'], answer: 2, why: 'A fifth of 800 MB is 160 MB.' },
					{ q: 'If the orders had been loaded in random date order, what would change?', options: ['Nothing: zonemaps sort the data', 'More row groups would be skipped', 'The column store would refuse the filter', 'Every row group would span all dates, so none could be skipped'], answer: 3, why: 'With random values, DuckDB "will likely be unable to skip any row groups".' }
				]
			},
			{
				title: 'Check it and decide',
				questions: [
					{ q: 'Where do you see the encoding DuckDB chose for each column?', options: ['`pragma_storage_info(\'orders\')`', '`EXPLAIN` on the report', 'PostgreSQL\'s `pg_stats`', '`information_schema.columns`'], answer: 0, why: 'It lists each segment of each column with its compression.' },
					{ q: 'Which encoding fits `status`, three words repeated a million times?', options: ['Bit packing', 'Dictionary encoding', 'No compression', 'One file per value'], answer: 1, why: 'A dictionary stores the three words once and a small code per row.' },
					{ q: 'How does DuckDB pick an encoding?', options: ['One fixed encoding per type', 'You name it in `CREATE TABLE`', 'It tries every candidate at checkpoint and keeps the lowest estimated size', 'It picks the newest one'], answer: 2, why: 'Each candidate analyzes the column data and returns a size estimate, and the smallest wins.' },
					{ q: 'What do you do with checkout and the reports?', options: ['Move checkout to DuckDB too', 'Index all 40 columns in PostgreSQL', 'Send each order to ClickHouse as it is placed', 'Keep checkout on PostgreSQL, and copy orders in batches to a column store for reports'], answer: 3, why: 'Checkout writes one row at a time, which a row store does best. Reports accept a few minutes of lag.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A 40-column table holds 100 million rows. Why does `SELECT avg(total) FROM orders` run much faster on a column store?',
			options: [
				'It reads only the `total` column, which is also stored compressed',
				'It keeps a running average of every column, updated on each insert',
				'It builds a B-tree on every column, so the average is in the index',
				'It samples a fraction of the rows and returns an estimated result'
			],
			answer: 0,
			why: 'Each column is stored on its own, so the query reads one column out of forty. Values of one column look alike, so they compress well, and even fewer bytes are read.'
		},
		{
			q: 'Which workload fits a row store such as PostgreSQL better than a column store?',
			options: [
				'Revenue per country per month over five years of orders',
				'Loading the full order, all columns, for one checkout by id',
				'Counting distinct visitors per page over a billion page views',
				'Average delivery delay per carrier across all past shipments'
			],
			answer: 1,
			why: 'Reading or writing one whole row is what a row store does best: the row sits in one page. In a column store, the same lookup touches every column separately, which is "proportionally more expensive".'
		},
		{
			q: 'A DuckDB table is filtered with `WHERE event_id = \'…\'` on a random UUID column, and the scan reads every row group. Why?',
			options: [
				'DuckDB does not keep min and max values for text columns',
				'Random values give each row group a min and max that span nearly all values',
				'Zonemaps work only when the table has an explicit primary key',
				'Filters on equality always skip zonemaps and use a full scan'
			],
			answer: 1,
			why: 'A zonemap skips a row group only when the value falls outside its min-max range. With random UUIDs, every range is wide, so nothing is skipped. The DuckDB guide suggests ordered integers for such filters.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Load a million orders into DuckDB, read the encodings it chose, and watch zonemaps skip row groups on sorted data but not on shuffled data.',
		steps: [
			'Install DuckDB for Python in a folder of its own: `mkdir -p ~/col-lab && cd ~/col-lab && python3 -m venv venv && venv/bin/pip install duckdb==2.0.0`.',
			'Write `q.py`, which runs one SQL statement on `orders.duckdb`: `import duckdb, sys`, `con = duckdb.connect("orders.duckdb")`, `r = con.sql(sys.argv[1])`, then `if r is not None: print(r.fetchall()[0][1] if sys.argv[1].startswith("EXPLAIN") else r)`.',
			'Load five years of orders in date order: `venv/bin/python q.py "CREATE TABLE orders AS SELECT i AS id, TIMESTAMP \'2022-01-01\' + i * INTERVAL 158 SECOND AS created_at, ([\'paid\', \'shipped\', \'refunded\'])[1 + i % 3] AS status, (i % 500)::DECIMAL(10,2) AS total FROM range(1000000) t(i)"`, then `venv/bin/python q.py "CHECKPOINT"` and `ls -l orders.duckdb`.',
			'Read the encodings: `venv/bin/python q.py "SELECT column_name, compression, count(*) AS segments FROM pragma_storage_info(\'orders\') GROUP BY ALL ORDER BY ALL"`.',
			'Run the report with a 2026 filter and read the scan: `venv/bin/python q.py "EXPLAIN ANALYZE SELECT sum(total) FROM orders WHERE created_at >= \'2026-01-01\'" | grep "Row Groups"`.',
			'Make a shuffled copy and run the same filter on it: `venv/bin/python q.py "CREATE TABLE shuffled AS SELECT * FROM orders ORDER BY random()"`, then the same `EXPLAIN ANALYZE` on `shuffled`.'
		],
		done: [
			'`orders.duckdb` is about 3 MB for a million rows.',
			'`pragma_storage_info` shows `BitPacking` for `id`, `created_at` and `total`, and a dictionary encoding (`DICT_FSST` in DuckDB 2.0) for `status`.',
			'On `orders`, the scan prints `Row Groups Scanned: 3 / 9`.',
			'On `shuffled`, the same query prints `Row Groups Scanned: 9 / 9`.'
		],
		solution: [
			'The row groups hold 122,880 rows each, so a million rows make 9. In date order, only the last three can hold 2026, and the zonemaps rule out the other six.',
			'After the shuffle, every row group holds dates from all five years, so each min-max range covers the filter and nothing is skipped.',
			'For comparison, the task\'s note measured the same rows in a PostgreSQL heap at 58 MB. The column store wins on bytes read, and still loses on fetching one whole order by id.'
		]
	},
	recall: {
		q: 'A report sums 2 columns of a 40-column table, filtered on a date. What does a column store such as DuckDB skip that a row store reads?',
		a: 'The 38 other columns, and every row group whose zonemap max on `created_at` is below the filter. Each row group holds 122,880 rows by default.'
	},
	sources: [
		{ title: 'DuckDB, bitpacking.cpp (packed size estimate)', url: `${DD}/src/storage/compression/bitpacking.cpp#L431-L439` },
		{ title: 'DuckDB, storage_info.hpp (row group size)', url: `${DD}/src/include/duckdb/storage/storage_info.hpp#L22-L23` },
		{ title: 'DuckDB docs source, indexing.md (ordered vs unordered size)', url: `${DW}/guides/performance/indexing.md#L30-L35` },
		{ title: 'ClickHouse docs, What is a columnar database?', url: 'https://clickhouse.com/docs/faq/general/columnar-database' },
		{ title: 'DuckDB docs, Storage', url: 'https://duckdb.org/docs/stable/internals/storage' },
		{ title: 'DuckDB docs, Indexing (zonemaps)', url: 'https://duckdb.org/docs/stable/guides/performance/indexing' },
		{ title: 'DuckDB docs, Execution format (vectors)', url: 'https://duckdb.org/docs/stable/internals/vector' },
		{ title: 'PostgreSQL docs, Database Page Layout', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' }
	]
};
