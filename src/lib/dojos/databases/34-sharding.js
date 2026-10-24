const CITUS = 'https://github.com/citusdata/citus/blob/84489d85ff6576ece7ffce2c4b942e6760722043';
const DOCS = 'https://github.com/citusdata/citus_docs/blob/74f978bccea9e64e744b117e3778820f8cc54a3a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sharding',
	part: 'Beyond one server',
	title: 'Sharding',
	minutes: 10,
	hook: [
		'Your database already runs on the biggest machine your provider sells. Replicas took the reads (day 28). But **every write still lands on one primary**, and it is at its limit at peak hours.',
		'Partitioning (day 33) split the table, but all the partitions still live on that one server. To go further, the rows themselves must live on **several servers, each the primary for its own share**.',
		'With **sharding**, a shard key decides which server holds a row. A query that names the key goes to one server, and a query that does not must ask all of them. If nearly every query names the key, most queries reach one server. If the pages do not name it, every page view queries every server.'
	],
	terms: [
		{ term: 'Shard', def: 'One piece of a sharded table, a normal table on one server. Citus creates 32 per table by default and spreads them over the worker nodes.' },
		{ term: 'Shard key', def: 'The column that decides a row\'s shard. Citus calls it the distribution column. Usually a tenant or customer id.' },
		{ term: 'Co-location', def: 'Tables sharded on the same key and the same ranges keep matching rows on the same node, so joins and transactions on one key stay local.' },
		{ term: 'Fan-out', def: 'A query that cannot be routed by the key, so it runs on every shard and the results are merged.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: WHERE tenant_id = 6"] --> coord["Citus coordinator"]'],
				highlight: ['app', 'coord'],
				note: 'The app connects to the coordinator, an ordinary PostgreSQL with the Citus extension. It keeps the metadata: which shards exist, and which worker holds each one.'
			},
			{
				add: ['coord -->|"hash(6) falls in one range"| w1[("Worker 1")]', 'coord ~~~ w2[("Worker 2")]'],
				highlight: ['w1'],
				note: 'The coordinator hashes `6`, finds the one shard whose range contains it, and sends the whole query to the worker that holds it. One node does the work, as if it were a single database.'
			},
			{
				add: ['w1 --> ev["event shard for this range"]', 'w1 --> pg["page shard for the same range"]'],
				highlight: ['ev', 'pg'],
				note: '`event` and `page` are both sharded on `tenant_id`, so the shards for the same range sit on the same node. The join between them runs locally, with full SQL and transactions.'
			},
			{
				add: ['fan["Query without tenant_id"] -.->|"one task per shard"| w1', 'fan -.-> w2'],
				highlight: ['fan'],
				note: 'A query that does not filter on the key is sent to every shard, and the coordinator merges the results. A nightly report can afford that. A page that does it puts load on every shard at each view.'
			},
			{
				add: ['w3[("New worker 3")]', 'w1 -->|"rebalancer moves whole shards"| w3'],
				highlight: ['w3'],
				note: 'Add a worker, and the rebalancer moves some shards to it with logical replication. No row changes shard, so Citus rehashes nothing. Only changing the number of shards would move rows.'
			}
		]
	},
	example: {
		title: 'Citus, src/backend/distributed/utils/shardinterval_utils.c: from a key value to a shard',
		repo: 'citusdata/citus',
		url: `${CITUS}/src/backend/distributed/utils/shardinterval_utils.c?plain=1#L259-L453`,
		lang: 'c',
		code: `ShardInterval *
FindShardInterval(Datum partitionColumnValue, CitusTableCacheEntry *cacheEntry)
{
	Datum searchedValue = partitionColumnValue;

	if (IsCitusTableTypeCacheEntry(cacheEntry, HASH_DISTRIBUTED))
	{
		searchedValue = FunctionCall1Coll(cacheEntry->hashFunction,
										  cacheEntry->partitionColumn->varcollid,
										  partitionColumnValue);
	}

	int shardIndex = FindShardIntervalIndex(searchedValue, cacheEntry);

	if (shardIndex == INVALID_SHARD_INDEX)
	{
		return NULL;
	}

	return cacheEntry->sortedShardIntervalArray[shardIndex];
}
…
int
CalculateUniformHashRangeIndex(int hashedValue, int shardCount)
{
	int64 hashedValue64 = (int64) hashedValue;

	/* normalize to the 0-UINT32_MAX range */
	int64 normalizedHashValue = hashedValue64 - PG_INT32_MIN;

	/* size of each hash range */
	int64 hashRangeSize = HASH_TOKEN_COUNT / shardCount;

	/* index of hash range into which the hash value falls */
	int shardIndex = (int) (normalizedHashValue / hashRangeSize);

	if (shardIndex < 0 || shardIndex > shardCount)
	{
		ereport(ERROR, (errmsg("bug: shard index %d out of bounds", shardIndex)));
	}

	/*
	 * If the shard count is not power of 2, the range of the last
	 * shard becomes larger than others. For that extra piece of range,
	 * we still need to use the last shard.
	 */
	if (shardIndex == shardCount)
	{
		shardIndex = shardCount - 1;
	}

	return shardIndex;
}`,
		notes: [
			'Lines 6 to 10 run the column\'s hash function on the key, the one PostgreSQL itself uses for that type ([`hash_proc_finfo`](' + CITUS + '/src/backend/distributed/metadata/metadata_cache.c?plain=1#L1874-L1880)). Line 20 returns the shard at that index in a sorted array, so the same key always lands on the same shard.',
			'Line 32 divides the hash space, [`HASH_TOKEN_COUNT`](' + CITUS + '/src/include/distributed/metadata_utility.h#L35) or 2^32 values, by the shard count. With the default of 32 shards, each shard owns 134,217,728 values, and line 35 finds the index with one division. Tables with the same ranges get the same index for the same key, and Citus calls that co-location.',
			'Line 32 uses `shardCount`, which is fixed when the table is distributed and is much higher than the number of nodes. Adding a node therefore moves whole shards. The [rebalancer](' + DOCS + '/admin_guide/cluster_management.rst?plain=1#L156) uses logical replication, which "allows application reads and writes to continue uninterrupted", with a brief write lock at the switch. Changing the count itself takes `alter_distributed_table`.',
			'The Citus [docs](' + DOCS + '/sharding/data_modeling.rst?plain=1#L55-L59) ask for a key with "high cardinality" and "even distribution": a `status` column with three values can never fill more than three shards. They also advise against a timestamp, because hashing scatters a time range over all shards. A query for "the most recent data" then runs on every shard. Partition by time inside each shard instead.',
			'Citus lists [when it is inappropriate](' + DOCS + '/get_started/what_is_citus.rst?plain=1#L131-L139), starting with "When you do not expect your workload to ever grow beyond a single Postgres node". Every cross-shard query, constraint and transaction costs more than on one server.'
		]
	},
	tradeoff: {
		gain: [
			'Each node is the primary for its own shards, so adding nodes adds write capacity as well as read capacity.',
			'A query routed by the key touches one node and a small shard, whatever the size of the whole table.',
			'Adding a node moves whole shards online with logical replication, and no row is rewritten.'
		],
		cost: [
			'Every table and query must carry the key. Unique constraints must include it, and a lookup by another id, such as `order_id` alone, runs on every shard.',
			'Cross-shard joins, transactions and foreign keys are slower or limited. Co-location covers only queries on one key value.',
			'One huge tenant still lives on one shard. With a skewed key, one node takes most of the load while the others sit idle.',
			'Changing the key later moves every row to a new shard.'
		]
	},
	task: {
		prompt: 'Your shop has `customers`, `orders(order_id, customer_id, ...)`, `order_items(order_id, product_id, qty)` and `products` (10,000 rows). You move to Citus. On paper: choose the distribution column for each table, say what you must change in the schema, and say whether each of these goes to one shard or fans out: (a) a customer\'s order history, (b) the top 10 products this week, (c) the order page at `/orders/123`.',
		hint: 'Find the id that almost every query is scoped to. A table that does not have that column cannot be co-located until you add it.',
		answer: [
			'Distribute `customers`, `orders` and `order_items` on `customer_id`, co-located. `order_items` has no `customer_id`: add it, and make the keys `(customer_id, order_id)` and `(customer_id, order_id, product_id)`, since unique constraints must contain the distribution column.',
			'`products` is small and joined by everyone: make it a reference table, copied to every node.',
			'(a) one shard: `WHERE customer_id = 42` is routed, and the join to `order_items` stays local thanks to co-location.',
			'(b) fans out: it reads every customer\'s items. Acceptable for a report, or precompute it into a rollup table.',
			'(c) fans out if the URL only carries `order_id`. Put the customer in the route, `/customers/42/orders/123`, or look up `customer_id` from the session, so the query can say `WHERE customer_id = 42 AND order_id = 123`.'
		],
		steps: [
			{
				title: 'Find the shard key',
				questions: [
					{ q: 'Which id are almost all of the shop\'s queries scoped to?', options: ['`customer_id`', '`order_id`', '`product_id`', '`created_at`'], answer: 0, why: 'History, cart, order pages: nearly everything a customer does names that customer. That makes it the distribution column.' },
					{ q: 'Replicas already serve the shop\'s reads. What makes it need shards at all?', options: ['Every write still lands on one primary, at its limit at peak hours', 'Replicas cannot serve reads once the data passes 10,000 products', 'Citus is the only way to partition `orders` by month', 'A single server cannot hold a `customer_id` index'], answer: 0, why: 'Replicas add read capacity only. With shards, each node is the primary for its own share, so adding nodes adds write capacity too.' },
					{ q: 'What do the Citus docs ask of a distribution column?', options: ['Few values, so each shard stays large', 'A column that never appears in `WHERE`', 'High cardinality and even distribution', 'A timestamp, so the data stays ordered'], answer: 2, why: 'A `status` column with three values can never fill more than three shards. Many customers spread well.' },
					{ q: 'Why not distribute `orders` on `order_id`?', options: ['A customer\'s order history would then fan out to every shard', '`order_id` cannot be hashed', 'Citus forbids a primary key as the shard key', '`order_id` values are too large for the hash'], answer: 0, why: 'Most queries name the customer, not one order. With `order_id` as key, they would all lose their routing.' }
				]
			},
			{
				title: 'Change the schema',
				questions: [
					{ q: '`order_items` has no `customer_id`. What do you do?', options: ['Distribute it on `order_id` instead', 'Make it a reference table', 'Keep it on the coordinator only', 'Add `customer_id` to it'], answer: 3, why: 'A table without the key cannot be co-located with `orders`. Adding the column keeps an order and its items on the same node.' },
					{ q: 'What does the primary key of `orders` become?', options: ['`(order_id)`', '`(customer_id, order_id)`', '`(order_id, created_at)`', '`(customer_id)`'], answer: 1, why: 'The key must contain the distribution column. `order_id` alone is no longer accepted.' },
					{ q: 'Why must every unique constraint include `customer_id`?', options: ['Each shard can only check uniqueness among its own rows', 'Citus sorts each index by its first column', 'It makes the index smaller', 'Foreign keys only work on the first column'], answer: 0, why: 'Unique constraints must contain the distribution column, so that two equal keys always land on the same shard, where they can be checked.' },
					{ q: '`products` has 10,000 rows and every query joins it. What do you make it?', options: ['A table distributed on `product_id`', 'A table distributed on `customer_id`', 'A reference table, copied to every node', 'A table on one worker only'], answer: 2, why: 'A small table joined by everyone is copied to each node, so every join with it stays local.' }
				]
			},
			{
				title: 'Route the three queries',
				questions: [
					{ q: '(a) goes to the one shard whose hash range holds customer 42. With the default 32 shards, how many hash values does each range span?', options: ['134,217,728', '32', '4,294,967,296', '42'], answer: 0, why: 'Citus divides the hash space, 2^32 or 4,294,967,296 values, by the shard count: 4,294,967,296 / 32 = 134,217,728.' },
					{ q: 'Why does the join from `orders` to `order_items` stay on that node?', options: ['The coordinator copies the items to it', 'Both are sharded on `customer_id` with the same ranges: co-location', '`order_items` is a reference table', 'Citus caches every join result'], answer: 1, why: 'Co-located tables keep matching rows on the same node, so joins and transactions on one key stay local.' },
					{ q: '(b) The top 10 products this week. Where does it run?', options: ['On one shard, since `products` is a reference table', 'On one shard, since the week is a known range', 'On the coordinator only', 'On every shard: it reads every customer\'s items'], answer: 3, why: 'The query names no customer, so it must ask every shard and merge the answers.' },
					{ q: 'Of (a), (b) and (c), which one can a change of URL alone bring down to one shard?', options: ['(a)', '(b)', '(c)', 'None of them'], answer: 2, why: '(a) is already routed, and (b) reads every customer\'s items by nature. (c) only lacks the customer id, which a route such as `/customers/42/orders/123` carries.' }
				]
			},
			{
				title: 'Fix what fans out',
				questions: [
					{ q: 'How do you route the order page (c) to one shard?', options: ['Carry the customer: `/customers/42/orders/123`, or `customer_id` from the session', 'Add an index on `order_id`', 'Raise the shard count', 'Make `orders` a reference table'], answer: 0, why: 'With `WHERE customer_id = 42 AND order_id = 123`, the coordinator knows the shard. An index does not tell it which shard to ask.' },
					{ q: 'The top 10 report (b) runs on every page view. What do you do?', options: ['Distribute `order_items` on `product_id` as well', 'Precompute it into a rollup table', 'Add more workers', 'Index `created_at` on each shard'], answer: 1, why: 'A fan-out is fine for a nightly report. On a page, read a precomputed rollup instead.' },
					{ q: 'One customer places a third of all orders. What happens?', options: ['Citus splits that customer over all shards', 'The rebalancer moves its rows to the emptiest node', 'All its rows still live on one shard, so one node takes most of the load', 'Its orders are copied to every node'], answer: 2, why: 'A key value maps to one shard. A skewed key leaves one node busy while the others sit idle.' },
					{ q: 'Years later, 32 shards per table are too few. What does changing the shard count take?', options: ['Adding a worker, since each worker adds shards', 'Nothing: Citus splits busy shards by itself', '`alter_distributed_table`, which moves rows to new shards', 'A new distribution column'], answer: 2, why: 'The shard count is fixed when the table is distributed. Changing it is the one change that moves rows between shards.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A team distributes its `events` table on `created_at`. Most queries read the last hour. What happens?',
			options: [
				'The last hour lands on one shard, which becomes the only busy node',
				'Hashing scatters the last hour over all shards, so each query fans out',
				'Citus refuses to distribute a table on a timestamp column at all',
				'Queries are routed to one shard because the time range is known'
			],
			answer: 1,
			why: 'A hash of a timestamp scatters nearby times across shards. Any time range then touches every shard. The docs say to distribute on a tenant or entity id, and use PostgreSQL partitioning for time (day 33).'
		},
		{
			q: 'A Citus cluster has two workers and a table with 32 shards. You add a third worker and rebalance. What moves?',
			options: [
				'Every row is rehashed into 48 new shards spread over three workers',
				'Nothing until you raise the shard count with `alter_distributed_table`',
				'Some whole shards are copied to the new worker, and rows keep their shard',
				'New rows go to the new worker, old rows stay where they already were'
			],
			answer: 2,
			why: 'The shard count is fixed when the table is distributed. Rebalancing moves whole shards between nodes with logical replication, so no row changes shard and nothing is rehashed.'
		},
		{
			q: '`orders` is distributed on `customer_id`. Why is `SELECT * FROM orders WHERE order_id = 123` expensive?',
			options: [
				'Citus must first rebuild a global index on order_id across workers',
				'The coordinator keeps a copy of every order and must scan all of it',
				'order_id is hashed with a different function, so the routing fails',
				'Without customer_id the shard is unknown, so every shard is queried'
			],
			answer: 3,
			why: 'Routing needs the value of the distribution column. Without it, the coordinator sends the query to all shards and merges the answers: a fan-out. Carry the key in every request.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Shard the shop schema on `customer_id` in a one-node Citus, and read `Task Count` in `EXPLAIN` to see which queries go to one shard and which fan out.',
		steps: [
			'Start Citus, a PostgreSQL image with the extension loaded, and open `psql`: `docker run -d --name shard-lab -e POSTGRES_PASSWORD=lab citusdata/citus:12.1`, wait a few seconds, then `docker exec -it shard-lab psql -U postgres`. One node is both coordinator and worker, which is enough to see the routing.',
			'Create the four tables with the keys from the task: `customers (customer_id bigint PRIMARY KEY, name text)`, `orders (customer_id bigint, order_id bigint, total numeric, PRIMARY KEY (customer_id, order_id))`, `order_items (customer_id bigint, order_id bigint, product_id bigint, qty int, PRIMARY KEY (customer_id, order_id, product_id))` and `products (product_id bigint PRIMARY KEY, name text)`.',
			'Distribute them: `SELECT create_distributed_table(\'customers\', \'customer_id\');`, the same for `orders` and `order_items` with `colocate_with => \'customers\'`, and `SELECT create_reference_table(\'products\');`. Count the shards: `SELECT logicalrelid, count(*) FROM pg_dist_shard GROUP BY 1;`.',
			'Try a table whose key leaves out the distribution column: `CREATE TABLE bad (id bigint PRIMARY KEY, customer_id bigint); SELECT create_distributed_table(\'bad\', \'customer_id\');`.',
			'Run `EXPLAIN (COSTS OFF)` on the three task queries: (a) `SELECT o.order_id, i.product_id FROM orders o JOIN order_items i USING (customer_id, order_id) WHERE o.customer_id = 42;`, (b) `SELECT product_id, sum(qty) FROM order_items GROUP BY product_id ORDER BY 2 DESC LIMIT 10;`, (c) `SELECT * FROM orders WHERE order_id = 123;`. Then fix (c) by adding `customer_id = 42` and explain it again.',
			'When you are done: `docker rm -f shard-lab`.'
		],
		done: [
			'`pg_dist_shard` lists 32 shards for each distributed table and 1 for `products`.',
			'Distributing `bad` fails: `Distributed relations cannot have UNIQUE, EXCLUDE, or PRIMARY KEY constraints that do not include the partition column`.',
			'(a) shows `Task Count: 1`, with the join to `order_items` inside that one task.',
			'(b) and (c) show `Task Count: 32`.',
			'(c) with `customer_id = 42 AND order_id = 123` shows `Task Count: 1`.'
		],
		solution: [
			'`SELECT create_distributed_table(\'orders\', \'customer_id\', colocate_with => \'customers\');` and the same line for `order_items`.',
			'Fixed (c): `EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE customer_id = 42 AND order_id = 123;`. The plan is one index scan on one shard.',
			'`Task Count` is the number of shards the coordinator asks. With more workers, a count of 32 means every worker does some of the work on every call.'
		]
	},
	recall: {
		q: '`orders` is distributed on `customer_id`. Which queries go to one shard, and which go to every shard?',
		a: 'A query with `WHERE customer_id = 42` goes to the one shard whose hash range holds 42. A query without `customer_id`, such as `WHERE order_id = 123`, fans out to every shard, 32 by default.'
	},
	sources: [
		{ title: 'Citus docs, Choosing Distribution Column', url: 'https://docs.citusdata.com/en/stable/sharding/data_modeling.html' },
		{ title: 'Citus docs, Cluster Management', url: 'https://docs.citusdata.com/en/stable/admin_guide/cluster_management.html' },
		{ title: 'Citus source, shared_library_init.c: default shard count', url: `${CITUS}/src/backend/distributed/shared_library_init.c?plain=1#L2688-L2697` },
		{ title: 'Citus docs source, api_udf.rst: alter_distributed_table', url: `${DOCS}/develop/api_udf.rst?plain=1#L242-L262` },
		{ title: 'Vitess docs, Sharding', url: 'https://vitess.io/docs/reference/features/sharding/' }
	]
};
