const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339';
const SELFUNCS = `${PG}/src/backend/utils/adt/selfuncs.c`;
const DOCS = `${PG}/doc/src/sgml`;
const CLAUSESEL = `${PG}/src/backend/optimizer/path/clausesel.c`;
const ANALYZE = `${PG}/src/backend/commands/analyze.c`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'planner-statistics',
	part: 'Inside the engine',
	title: 'Planner statistics: how PostgreSQL estimates rows',
	minutes: 10,
	hook: [
		'Your shipments table has a city and a zip code. A query asks for `city = \'city7\' AND zip = \'zip107\'`. `EXPLAIN ANALYZE` says `rows=10` estimated, `rows=1000` actual. The plan was built for a hundred times fewer rows than it got.',
		'The planner never counts rows before it plans. **It estimates rows from statistics**: a sample of the table, the most common values of each column, a histogram of the rest. When the estimate is far off, you get a nested loop over 1,000 rows it thought were 10, or a sequential scan where an index would do.',
		'Here each zip code belongs to one city, so the two conditions overlap. The planner does not know that until you declare it with `CREATE STATISTICS`.'
	],
	terms: [
		{ term: 'ANALYZE', def: 'Reads a random sample of the table and stores statistics per column in `pg_statistic`. Autovacuum runs it in the background. The sample is 300 rows per point of statistics target: 30,000 rows by default.' },
		{ term: 'Selectivity', def: 'The fraction of rows a condition keeps, from 0 to 1. Estimated rows = rows in the table × selectivity.' },
		{ term: 'MCV list', def: 'Most common values: up to 100 values of the column (the default statistics target) with the share of rows each one has. For an `=` on one of them, the planner knows its share directly.' },
		{ term: 'Extended statistics', def: 'Statistics across several columns, created with `CREATE STATISTICS` and filled by `ANALYZE`: functional dependencies, distinct counts and MCV lists over column groups.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['tbl[("shipments, 1 million rows")] -->|"ANALYZE reads a sample of 30,000 rows"| stats[("pg_statistic, one row per column")]'],
				highlight: ['tbl', 'stats'],
				note: 'For large tables, `ANALYZE` "takes a random sample of the table contents, rather than examining every row". The results are approximate and change a little on each run. Read them through the `pg_stats` view, which is easier to read than the raw catalog.'
			},
			{
				add: ['stats --> mcv["MCV list: common values and their share of rows"]', 'stats --> hist["Histogram: buckets with the same number of rows each"]'],
				highlight: ['mcv', 'hist'],
				note: 'The MCV list answers "how many rows have exactly this value?" for frequent values. The histogram splits the other values into buckets with the same number of rows, for `<`, `>` and ranges, and the planner assumes values spread evenly inside each bucket. Values in the MCV list are left out of the histogram, so nothing is counted twice.'
			},
			{
				add: ['q["WHERE city = \'city7\'"] --> eqsel["eqsel: in the MCV list? use its share, else share the rest evenly"]', 'mcv --> eqsel'],
				highlight: ['q', 'eqsel'],
				note: '`eqsel` estimates one `=` by checking the MCV list first. A match gives the exact share measured by `ANALYZE`. No match: take what the MCVs and NULLs leave and divide it by the number of other distinct values. Without any statistics, it falls back to 1 divided by the estimated distinct count.'
			},
			{
				add: ['two["WHERE city = \'city7\' AND zip = \'zip107\'"] -->|"1/100 times 1/1000"| low["Estimate: 10 rows. Actual: 1000"]'],
				highlight: ['two', 'low'],
				note: 'The planner treats two conditions as independent and multiplies their selectivities: 1/100 × 1/1000. But each zip code belongs to one city: once `zip = \'zip107\'` holds, the city condition removes nothing. The docs: "an assumption that does not hold when column values are correlated".'
			},
			{
				add: ['ext["CREATE STATISTICS (dependencies) ON city, zip"] -->|"zip decides city"| fixed["Estimate: 995 rows"]', 'ext -.-> two'],
				highlight: ['ext', 'fixed'],
				note: 'A `dependencies` statistics object measures how far one column decides the other. After the next `ANALYZE`, the planner "adjusts the per-condition selectivity estimates using the dependency coefficients", and the estimate lands near the real 1,000.'
			}
		]
	},
	example: {
		title: 'src/backend/utils/adt/selfuncs.c: var_eq_const, the estimate for column = constant',
		repo: 'postgres/postgres',
		url: `${SELFUNCS}#L338-L456`,
		lang: 'c',
		code: `	if (vardata->isunique && vardata->rel && vardata->rel->tuples >= 1.0)
	{
		selec = 1.0 / vardata->rel->tuples;
	}
	else if (HeapTupleIsValid(vardata->statsTuple) &&
			 statistic_proc_security_check(vardata,
										   (opfuncoid = get_opcode(oproid))))
…
		if (match)
		{
			/*
			 * Constant is "=" to this common value.  We know selectivity
			 * exactly (or as exactly as ANALYZE could calculate it, anyway).
			 */
			selec = sslot.numbers[i];
		}
		else
		{
			/*
			 * Comparison is against a constant that is neither NULL nor any
			 * of the common values.  Its selectivity cannot be more than
			 * this:
			 */
			double		sumcommon = 0.0;
			double		otherdistinct;

			for (i = 0; i < sslot.nnumbers; i++)
				sumcommon += sslot.numbers[i];
			selec = 1.0 - sumcommon - nullfrac;
			CLAMP_PROBABILITY(selec);

			/*
			 * and in fact it's probably a good deal less. We approximate that
			 * all the not-common values share this remaining fraction
			 * equally, so we divide by the number of other distinct values.
			 */
			otherdistinct = get_variable_numdistinct(vardata, &isdefault) -
				sslot.nnumbers;
			if (otherdistinct > 1)
				selec /= otherdistinct;

…
	else
	{
		/*
		 * No ANALYZE stats available, so make a guess using estimated number
		 * of distinct values and assuming they are equally common. (The guess
		 * is unlikely to be very good, but we do know a few special cases.)
		 */
		selec = 1.0 / get_variable_numdistinct(vardata, &isdefault);
	}`,
		notes: [
			'Lines 1 to 4 need no statistics: if a unique index covers the column, the estimate is one row, `1.0 / vardata->rel->tuples`. A lookup by primary key is therefore planned well even on a table never analyzed.',
			'Line 15 handles a match in the MCV list: `selec = sslot.numbers[i]` is the measured share of that value, "as exactly as ANALYZE could calculate it". The [Row Estimation Examples](' + DOCS + '/planstats.sgml#L166-L181) in the docs walk through the same case: `CRAAAA` has a share of 0.003, so 10,000 rows × 0.003 gives `rows=30`.',
			'Lines 27 to 40 handle a value outside the list: `1.0 - sumcommon - nullfrac`, divided by the other distinct values (`n_distinct` minus the MCV count). The docs write the formula as [(1 - sum(mcv_freqs))/(num_distinct - num_mcv)](' + DOCS + '/planstats.sgml#L203-L216), "assuming that the fraction of the column that is not any of the MCVs is evenly distributed". A rare value and a value that is not there at all get the same estimate.',
			'The header of [clausesel.c](' + CLAUSESEL + '#L66-L71) explains how several conditions combine: extended statistics are applied first, then the remaining clauses are estimated "by taking the product of their selectivities, but that\'s only right if they have independent probabilities".',
			'The sample size comes from [analyze.c](' + ANALYZE + '#L1930-L1939), which sets `minrows = 300 * stats->attstattarget`, from a paper on histogram error. Raise the target with `ALTER TABLE ... ALTER COLUMN ... SET STATISTICS` and you get a longer MCV list, more buckets and a bigger sample, at the cost of a slower `ANALYZE` and slightly slower planning.'
		]
	},
	tradeoff: {
		gain: [
			'Planning costs microseconds instead of a scan: the planner reads a few hundred numbers, not the table.',
			'For skewed columns, the MCV list gives exact shares for the values that matter most, so `status = \'refunded\'` and `status = \'paid\'` get different plans.',
			'When the guess is wrong, you can fix it without touching the query: run `ANALYZE`, raise the statistics target, or add a statistics object.'
		],
		cost: [
			'After a bulk load or a big delete, plans are built on the old shape of the data until `ANALYZE` runs again.',
			'Correlated columns are underestimated by default, and the error compounds with each extra condition and each join.',
			'A value that is in 0.01% of rows may not appear in the 30,000 sampled rows, and then gets the average share of the leftovers.',
			'Functional dependencies help only with `=` and `IN` on constants, and they assume the conditions agree. The docs\' example: `city = \'San Francisco\' AND zip = \'90210\'` still gets a non-zero estimate.'
		]
	},
	task: {
		prompt: 'A table `orders` has 1,000,000 rows. `pg_stats` for `status` shows `null_frac = 0`, `n_distinct = 5`, `most_common_vals = {paid,refunded,pending}`, `most_common_freqs = {0.90,0.06,0.03}`. On paper: how many rows does the planner expect for `status = \'refunded\'`? For `status = \'disputed\'`? Then a table `invoices` has `country` (50 distinct values, spread evenly) and `currency` (20, spread evenly), and each country uses one currency. Estimate `country = \'FR\' AND currency = \'EUR\'` the way the planner does, and say what the real answer is close to.',
		hint: 'Follow `var_eq_const`: is the value in the MCV list? If not, what is left after the MCVs, and how many other distinct values share it?',
		answer: [
			'`refunded` is in the MCV list: selectivity 0.06, so 1,000,000 × 0.06 = 60,000 rows.',
			'`disputed` is not: what is left is 1 - (0.90 + 0.06 + 0.03) - 0 = 0.01, shared by 5 - 3 = 2 other distinct values, so 0.005, or 5,000 rows. The cross-check in the code keeps it below the smallest MCV share (0.03), which it already is. If `disputed` does not exist at all, the estimate is still 5,000.',
			'Two columns: 1/50 × 1/20 = 1/1,000, so about 1,000 rows. But FR implies EUR, so the currency condition removes nothing: the real count is close to 1/50, about 20,000 rows. The planner is 20 times low.',
			'Fix: `CREATE STATISTICS invoices_country_currency (dependencies) ON country, currency FROM invoices; ANALYZE invoices;`. In a test with a zip code that fully decides the city, the estimate went from 10 rows to 995 for 1,000 real ones.'
		]
	},
	quiz: [
		{
			q: '`WHERE status = \'paid\'`, and `paid` is in the MCV list with a frequency of 0.9. The table has 2 million rows. What does the planner estimate?',
			options: [
				'2,000,000 divided by n_distinct, the same for every value',
				'1,800,000 rows: the frequency from the MCV list times the rows',
				'It reads the index to count the paid rows before it plans',
				'One row, because an equality on a column returns one match'
			],
			answer: 1,
			why: 'When the constant matches an MCV, `var_eq_const` uses that value\'s measured share directly. Dividing by n_distinct is only the fallback for a column without statistics, and one row is the rule for a unique column.'
		},
		{
			q: 'After a nightly import doubles the size of a table, plans for it get worse until the next morning. What is the most likely cause?',
			options: [
				'The import left the indexes invalid until a REINDEX finishes overnight',
				'The planner caches each plan for a day and keeps using the old ones',
				'The statistics still describe the old data until ANALYZE runs again',
				'Bigger tables always switch the planner to sequential scans'
			],
			answer: 2,
			why: '`pg_statistic` is updated by `ANALYZE` (manual or by autovacuum), not on every write. Until then, MCV lists and histograms describe the data before the import. Run `ANALYZE` right after a bulk load.'
		},
		{
			q: 'A query filters on `brand = \'X\' AND model = \'Y\'`, and each model belongs to one brand. The estimate is far too low. What fixes it best?',
			options: [
				'A composite index on (brand, model), so the planner counts the matching rows',
				'Raising the statistics target of both columns to 10000, so the samples are larger',
				'Rewriting the query with OR instead of AND, so the selectivities are added up',
				'A statistics object with `dependencies` on (brand, model), then ANALYZE'
			],
			answer: 3,
			why: 'The error comes from multiplying two selectivities as if the columns were independent. Bigger per-column samples do not change that. An index speeds up the scan but does not tell the planner the columns are correlated. A `dependencies` statistics object does.'
		}
	],
	recall: {
		q: 'How does the planner estimate `city = \'city7\' AND zip = \'zip107\'` when each zip belongs to one city, and what fixes the estimate?',
		a: 'It multiplies the two selectivities, 1/100 × 1/1000, and expects 10 rows instead of 1,000. `CREATE STATISTICS (dependencies) ON city, zip`, filled by the next `ANALYZE`, brings the estimate to 995.'
	},
	sources: [
		{ title: 'PostgreSQL 18 docs, Statistics Used by the Planner', url: 'https://www.postgresql.org/docs/18/planner-stats.html' },
		{ title: 'PostgreSQL 18 docs, Row Estimation Examples', url: 'https://www.postgresql.org/docs/18/row-estimation-examples.html' },
		{ title: 'PostgreSQL 18 docs, ANALYZE', url: 'https://www.postgresql.org/docs/18/sql-analyze.html' },
		{ title: 'PostgreSQL 18 docs, CREATE STATISTICS', url: 'https://www.postgresql.org/docs/18/sql-createstatistics.html' }
	]
};
