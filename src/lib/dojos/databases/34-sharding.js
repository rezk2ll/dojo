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
		'That is **sharding**: a shard key decides which server holds a row. A query that names the key goes to **one server**. A query that does not must ask **all of them**. Pick the key well and the cluster feels like one database. Pick it badly and every page becomes a fan-out.'
	],
	terms: [
		{ term: 'Shard', def: 'One piece of a sharded table, a normal table on one server. Citus creates 32 per table by default and spreads them over the worker nodes.' },
		{ term: 'Shard key', def: 'The column that decides a row\'s shard. Citus calls it the distribution column. Usually a tenant or customer id.' },
		{ term: 'Hash range', def: 'Each shard owns a slice of the 32-bit hash space. A row goes to the shard whose slice contains the hash of its key.' },
		{ term: 'Co-location', def: 'Tables sharded on the same key and the same ranges keep matching rows on the same node, so joins and transactions on one key stay local.' },
		{ term: 'Reference table', def: 'A small shared table, such as countries or products, copied in full to every node so any shard can join to it.' },
		{ term: 'Fan-out', def: 'A query that cannot be routed by the key, so it runs on every shard and the results are merged.' },
		{ term: 'Rebalancing', def: 'Moving whole shards to other nodes, for example after adding one. Rows keep their shard; only the shard\'s home changes.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App: WHERE tenant_id = 6"] --> coord["Citus coordinator"]'],
				highlight: ['app', 'coord'],
				note: '**One entry point.** The app connects to the coordinator, an ordinary PostgreSQL with the Citus extension. It keeps the metadata: which shards exist, and which worker holds each one.'
			},
			{
				add: ['coord -->|"hash(6) falls in one range"| w1[("Worker 1")]', 'coord ~~~ w2[("Worker 2")]'],
				highlight: ['w1'],
				note: '**Routed.** The coordinator hashes `6`, finds the one shard whose range contains it, and sends the whole query to the worker that holds it. One node does the work, as if it were a single database.'
			},
			{
				add: ['w1 --> ev["event shard for this range"]', 'w1 --> pg["page shard for the same range"]'],
				highlight: ['ev', 'pg'],
				note: '**Co-located.** `event` and `page` are both sharded on `tenant_id`, so the shards for the same range sit on the same node. The join between them runs locally, with full SQL and transactions.'
			},
			{
				add: ['fan["Query without tenant_id"] -.->|"one task per shard"| w1', 'fan -.-> w2'],
				highlight: ['fan'],
				note: '**Fan-out.** A query that does not filter on the key is sent to every shard, and the coordinator merges the results. Fine for a nightly report, costly on every page view.'
			},
			{
				add: ['w3[("New worker 3")]', 'w1 -->|"rebalancer moves whole shards"| w3'],
				highlight: ['w3'],
				note: '**Growing.** Add a worker, and the rebalancer moves some shards to it with logical replication. Rows never change shard, so nothing is rehashed. Only changing the number of shards would move rows.'
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
			'**Hash, then index.** `FindShardInterval` runs the column\'s hash function on the key, the one PostgreSQL itself uses for that type ([`hash_proc_finfo`](' + CITUS + '/src/backend/distributed/metadata/metadata_cache.c?plain=1#L1874-L1880)), then picks the shard at that index in a sorted array. The same key always lands on the same shard.',
			'**Arithmetic, not search.** The hash space has [`HASH_TOKEN_COUNT`](' + CITUS + '/src/include/distributed/metadata_utility.h#L35) values, 2^32. With the [default of 32 shards](' + CITUS + '/src/backend/distributed/shared_library_init.c?plain=1#L2688-L2697), each owns 134,217,728 of them, and `CalculateUniformHashRangeIndex` is one division. Tables with the same ranges get the same index for the same key: that is [co-location](' + DOCS + '/sharding/data_modeling.rst?plain=1#L104).',
			'**Why many small shards.** The shard count is fixed when the table is distributed, and is much higher than the number of nodes. Adding a node moves whole shards. The [rebalancer](' + DOCS + '/admin_guide/cluster_management.rst?plain=1#L156) uses logical replication, which "allows application reads and writes to continue uninterrupted", with a brief write lock at the switch. Changing the count itself takes [`alter_distributed_table`](' + DOCS + '/develop/api_udf.rst?plain=1#L242-L262).',
			'**Choosing the key.** The [docs](' + DOCS + '/sharding/data_modeling.rst?plain=1#L55-L59) ask for "high cardinality" and "even distribution": a `status` column with three values can never fill more than three shards. And [not a timestamp](' + DOCS + '/sharding/data_modeling.rst?plain=1#L76-L84): hashing scatters a time range over all shards, so "the most recent data" becomes a fan-out. Partition by time inside each shard instead.',
			'**When not to.** Citus lists [when it is inappropriate](' + DOCS + '/get_started/what_is_citus.rst?plain=1#L131-L139), starting with "When you do not expect your workload to ever grow beyond a single Postgres node". Every cross-shard query, constraint and transaction costs more than on one server.'
		]
	},
	tradeoff: {
		gain: [
			'Writes scale out: each node is the primary for its own shards, so adding nodes adds write capacity, not just read capacity.',
			'A query routed by the key touches one node and a small shard, whatever the size of the whole table.',
			'Growth is a shard move, done online with logical replication, not a rewrite of every row.'
		],
		cost: [
			'Every table and query must carry the key. Unique constraints must include it, and a lookup by another id, such as `order_id` alone, becomes a fan-out.',
			'Cross-shard joins, transactions and foreign keys are slower or limited. Co-location covers only queries on one key value.',
			'One huge tenant still lives on one shard. A skewed key gives you one hot node and idle others.',
			'Changing the key later means moving every row. It is the hardest decision to undo in the whole design.'
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
	takeaway: 'Shard only when one primary cannot take the writes, on a key nearly every query names: routed queries stay as cheap as on one server, and everything else fans out.',
	sources: [
		{ title: 'Citus docs, Choosing Distribution Column', url: 'https://docs.citusdata.com/en/stable/sharding/data_modeling.html' },
		{ title: 'Citus docs, Cluster Management', url: 'https://docs.citusdata.com/en/stable/admin_guide/cluster_management.html' },
		{ title: 'Vitess docs, Sharding', url: 'https://vitess.io/docs/reference/features/sharding/' }
	]
};
