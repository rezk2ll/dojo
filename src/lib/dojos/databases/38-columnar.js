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
		'Analytics engines such as DuckDB and ClickHouse flip the layout: **each column is stored on its own**, compressed, with a min and max per block. The same query reads a small part of the data, and often skips whole blocks without opening them.'
	],
	terms: [
		{ term: 'Row store', def: 'All the columns of a row sit next to each other on disk. Fast to read or change one whole row. PostgreSQL\'s heap is one.' },
		{ term: 'Column store', def: 'Each column is stored on its own. A query reads only the columns it names. DuckDB and ClickHouse work this way.' },
		{ term: 'Row group', def: 'A horizontal slice of a table, stored column by column. In DuckDB, 122,880 rows by default. Compression and parallelism work per row group.' },
		{ term: 'Zonemap', def: 'The min and max of a column in a block. A filter that falls outside the range skips the block without reading it. Also called a min-max index.' },
		{ term: 'Lightweight compression', def: 'Encodings that use the shape of one column: dictionary for few distinct values, run-length for repeats, bit packing for small numbers.' },
		{ term: 'OLTP and OLAP', def: 'OLTP: many small reads and writes of whole rows, like checkout. OLAP: few large queries that scan and aggregate a few columns, like reports.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['q["sum(total) by month"] --> heap[("Row store: each page holds whole rows, 40 columns")]'],
				highlight: ['q', 'heap'],
				note: '**Rows: read everything.** In a row store, `total` is spread across every page of the table, between the other columns. Summing it means reading every page. That layout is right for checkout, which reads and writes one whole order at a time.'
			},
			{
				add: ['q --> rg["Row group: 122,880 rows"]', 'rg --> c1[("created_at")]', 'rg --> c2[("total")]', 'rg -.->|"not read"| c3[("38 other columns")]'],
				highlight: ['rg', 'c1', 'c2'],
				note: '**Columns: read what you name.** DuckDB cuts a table into row groups and stores each column of a row group on its own. ClickHouse\'s [FAQ](' + CH + '/docs/faq/general/columnar-database.md#L15) puts it in one line: this "allows reading data from disk only for those columns that are used in any given query". The 38 other columns are never touched.'
			},
			{
				add: ['rg --> comp["Per column: try each encoding, keep the smallest"]'],
				highlight: ['comp'],
				note: '**Similar values compress well.** A column of `status` holds three words repeated a million times. DuckDB analyzes each column at checkpoint with every candidate encoding and keeps the one with the lowest estimated size: dictionary for `status`, bit packing for numbers that fit in few bits.'
			},
			{
				add: ['zm["Zonemap: min and max per row group"] -->|"skip groups before 2026"| rg'],
				highlight: ['zm'],
				note: '**Skip without reading.** DuckDB keeps the min and max of each column for every row group. With `WHERE created_at >= \'2026-01-01\'`, every row group whose max is earlier is skipped. This works well only when the data is roughly sorted on that column, as dates usually are.'
			},
			{
				add: ['c2 -->|"2048 values at a time"| vec["Vectorized aggregate"]'],
				highlight: ['vec'],
				note: '**Process in batches.** DuckDB\'s operators work on vectors of a fixed size, 2048 values by default. A vector is an array of a single type, and can even stay compressed. One operator call handles 2048 values instead of one row.'
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
			'**Every encoding gets a try.** `ScanSegments` feeds the column\'s data, vector by vector, to each candidate\'s `analyze`. A method that cannot handle the data returns false and drops out. This runs when a column is [written to disk](' + CKPT + '#L310-L312) at checkpoint.',
			'**The score is a size.** `final_analyze` returns an estimate in bytes, and the lowest wins. For run-length encoding it is [(count + value) times the number of runs](' + DD + '/src/storage/compression/rle.cpp#L130-L134); for bit packing, the [total packed size](' + DD + '/src/storage/compression/bitpacking.cpp#L431-L439). A forced method from settings overrides the choice.',
			'**Per row group, so per local shape.** The [docs](' + DW + '/internals/storage.md#L214-L218) say compression and parallelism "are based on row groups", whose default size is [122,880 rows](' + DD + '/src/include/duckdb/storage/storage_info.hpp#L22-L23). A column can be dictionary encoded in one row group and stored plainly in the next.',
			'**Order feeds both tricks.** The [indexing guide](' + DW + '/guides/performance/indexing.md#L19-L24) says "The more ordered the data within a column, the more valuable the zonemap indexes will be", and that with random values DuckDB "will likely be unable to skip any row groups". Sorted data also compresses better: in the same guide, an ordered timestamp column came out [2.5 times smaller](' + DW + '/guides/performance/indexing.md#L30-L35) than an unordered one.'
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
			'Whole-row work gets slower. ClickHouse\'s FAQ: "operations that affect whole rows become proportionally more expensive". Fetching one order by id touches every column file.',
			'Data should arrive in large batches. ClickHouse\'s [insert guide](' + CH + '/docs/best-practices/_snippets/_async_inserts.md#L7) warns that "Sending many small batches in synchronous mode isn\'t recommended". That suits a copy of OLTP data, not the live store for checkout.',
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
	takeaway: 'Store rows for work on whole rows, and columns for work on a few columns over many rows: a column store reads less, compresses more and skips blocks it can rule out.',
	sources: [
		{ title: 'ClickHouse docs, What is a columnar database?', url: 'https://clickhouse.com/docs/faq/general/columnar-database' },
		{ title: 'DuckDB docs, Storage', url: 'https://duckdb.org/docs/stable/internals/storage' },
		{ title: 'DuckDB docs, Indexing (zonemaps)', url: 'https://duckdb.org/docs/stable/guides/performance/indexing' },
		{ title: 'DuckDB docs, Execution format (vectors)', url: 'https://duckdb.org/docs/stable/internals/vector' },
		{ title: 'PostgreSQL docs, Database Page Layout', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' }
	]
};
