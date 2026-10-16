const REPO = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';
const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const PRODUCER = `${REPO}/clients/src/main/java/org/apache/kafka/clients/producer`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'scaling-data',
	part: 'Built to last',
	title: 'Scaling data',
	minutes: 10,
	hook: [
		'Your ticketing SaaS keeps every customer\'s tickets in one Postgres server. Each month it holds more rows and takes more writes. One day **a single database is not enough**.',
		'A bigger machine buys time, once. After that there are two problems with two fixes. **Too many reads**: keep copies, called replicas, and spread the reads over them. **Too much data or too many writes**: copies do not help, since every copy takes every write. You have to **split the data**, so each node holds only part of it.',
		'Splitting is a one-way door (day 5). Once rows are spread by a key, every query either **names that key and hits one place, or asks everyone**. Today: how Discourse places each site with a directory, how Kafka places each event by hashing its key, and what a query without the key costs.'
	],
	terms: [
		{ term: 'Partition (shard)', def: 'A slice of the data, held by one node or one cluster. Each row lives in exactly one partition. Sharding is partitioning across machines.' },
		{ term: 'Partition key', def: 'The field that decides which partition a row goes to. A query that names it reads one partition. A query that does not must ask them all.' },
		{ term: 'Directory placement', def: 'A lookup table records where each key lives, instead of computing it from a hash. Easy to add a node to, but the table itself must always be readable.' },
		{ term: 'Replica', def: 'A copy of a partition on another node. It adds read capacity and survives a node loss. It adds no write capacity: every write goes to every copy.' },
		{ term: 'Scatter-gather', def: 'Send a query to every partition and merge the answers. Its cost grows with the number of partitions, and the slowest one sets the pace.' },
		{ term: 'Hot partition', def: 'One key with far more data or traffic than the others. Adding nodes does not help it: it still lives in one place.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req(["Request for help.acme.example"]) --> app["Ticketing app"]', 'app -->|"which database?"| dir[("Directory: tenant to database")]'],
				highlight: ['app', 'dir'],
				note: '**The partition key is the tenant.** Before any query, the app looks up where this tenant lives. Discourse multisite works this way: a config file maps each site\'s host names to its own database. This is a **directory**: placement is written down, not computed.'
			},
			{
				add: ['app -->|"tenants 1 to 500"| db1[("Postgres A: full, no new tenants")]', 'app -->|"new tenants"| db2[("Postgres B")]'],
				highlight: ['db1', 'db2'],
				note: 'When server A is full, add server B and send **new tenants** there. Old ones stay where they are. Nothing is moved, so nothing is rebalanced. A keeps growing as its tenants add tickets.'
			},
			{
				add: ['app -->|"ticket.updated, key = ticket id"| topic["Kafka topic: 12 partitions"]'],
				highlight: ['topic'],
				note: '**Hash placement.** For events, the app hands Kafka a key. The producer hashes the key and takes it modulo the partition count. **Same key, same partition**, so one ticket\'s events stay in order. No directory to read, but the count is now part of the address.'
			},
			{
				add: ['topic --> rep["Each partition: 1 leader, 2 followers"]'],
				highlight: ['rep'],
				note: '**Replicas inside each partition.** With replication factor 3, all writes go to the partition leader and the followers copy its log. The copies survive a broker loss and can serve reads. They add **no write capacity**: each one takes every write.'
			},
			{
				add: ['report["Report: open tickets of every tenant"] -->|"scatter"| db1', 'report -->|"scatter"| db2'],
				highlight: ['report'],
				note: '**A query without the key asks everyone.** "Open tickets of tenant 42" reads one database. "Open tickets across all tenants" visits every one and merges the answers. Add a third server and the report has one more database to wait for.'
			}
		]
	},
	example: {
		title: 'clients/.../producer/KafkaProducer.java: how a record picks its partition',
		repo: 'apache/kafka',
		url: `${PRODUCER}/KafkaProducer.java#L1681-L1701`,
		lang: 'java',
		code: `    private int partition(ProducerRecord<K, V> record, byte[] serializedKey, byte[] serializedValue, Cluster cluster) {
        if (record.partition() != null)
            return record.partition();

        if (partitionerPlugin.get() != null) {
            int customPartition = partitionerPlugin.get().partition(
                record.topic(), record.key(), serializedKey, record.value(), serializedValue, cluster);
            if (customPartition < 0) {
                throw new IllegalArgumentException(String.format(
                    "The partitioner generated an invalid partition number: %d. Partition number should always be non-negative.", customPartition));
            }
            return customPartition;
        }

        if (serializedKey != null && !partitionerIgnoreKeys) {
            // hash the keyBytes to choose a partition
            return BuiltInPartitioner.partitionForKey(serializedKey, cluster.partitionsForTopic(record.topic()).size());
        } else {
            return RecordMetadata.UNKNOWN_PARTITION;
        }
    }`,
		notes: [
			'**Three ways to place a record.** The caller names a partition, a custom partitioner picks one, or the key decides. With no key, `UNKNOWN_PARTITION` leaves the choice to the [built-in partitioner](' + PRODUCER + '/internals/BuiltInPartitioner.java#L33-L40), which sticks to one partition for a batch and then moves on. Keyless records spread over the partitions, with no order between them.',
			'**The hash is the address.** [`partitionForKey`](' + PRODUCER + '/internals/BuiltInPartitioner.java#L410-L415) is the murmur2 hash of the key, made positive, modulo the partition count. The [design doc](' + REPO + '/docs/design/design.md?plain=1#L127) gives the point: "if the key chosen was a user id then all data for a given user would be sent to the same partition". It also means a user with ten times the traffic is ten times hotter on **one** partition.',
			'**The count is part of the address.** The [operations doc](' + REPO + '/docs/operations/basic-kafka-operations.md?plain=1#L63) warns that after adding partitions "messages with the same key may be routed to different partitions", and "Kafka will not attempt to automatically redistribute existing data". And [you cannot go back](' + REPO + '/docs/operations/basic-kafka-operations.md?plain=1#L98): "Kafka does not currently support reducing the number of partitions for a topic."',
			'**Replicas do not split writes.** The [design doc](' + REPO + '/docs/design/design.md?plain=1#L285-L287): "All writes go to the leader of the partition, and reads can go to the leader or the followers". Followers "consume messages from the leader just as a normal Kafka consumer would".',
			'**The directory version.** Discourse\'s [sample `multisite.yml`](' + DISCOURSE + '/config/multisite.yml.production-sample#L1-L14) gives each site its own `database` and its own `host_names`. The [multisite guide](' + DISCOURSE + '/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md?plain=1#L7-L34) says "A multisite server uses a different DB and hostname for each site", and that rake tasks target one site through `RAILS_DB`. One migration becomes one per site.'
		]
	},
	tradeoff: {
		gain: [
			'Capacity grows by adding servers or partitions, not by buying one bigger machine that has a ceiling.',
			'Partitioning by tenant matches how the data is read: almost every request names one tenant, so it lands on one database.',
			'A query that names the partition key costs about the same with 10 nodes or 100.',
			'Replicas add read capacity and let a node die without losing data (day 9).'
		],
		cost: [
			'**Queries without the key ask everyone.** A report across all tenants visits every database. A consumer that needs every event reads every partition.',
			'**The key is hard to change.** Rows were placed by it. Changing it means copying the data into a new layout, a migration of its own (day 32).',
			'**Rebalancing is work you must design.** A hash moves keys when the count changes. A directory moves nothing, so an old server stays as full as it was the day it stopped taking tenants.',
			'**A hot key stays hot.** One tenant with ten times the data still lives on one database, or one partition.',
			'**Replicas lag or cost quorum reads.** A replica updated asynchronously can answer with data older than the write you just made (day 16). Waiting for more copies costs latency instead.'
		]
	},
	task: {
		prompt: 'Your ticketing app publishes `ticket.updated` to a Kafka topic with 12 partitions, keyed by tenant id. One tenant now makes 40% of all updates, and the consumer of one partition is hours behind. A teammate proposes going to 48 partitions. What does that fix, what does it break, and what would you do instead?',
		hint: 'Where does the big tenant\'s traffic go before and after the change? Then ask which order your consumers really need: per tenant, or per ticket?',
		answer: [
			'It does not fix the hot partition. The big tenant\'s key still hashes to one partition, so its 40% still lands on one consumer.',
			'It breaks order for everyone else during the change: `hash(key) % 48` can differ from `% 12`, so new events for a tenant can go to a different partition than its older, unread ones. And you cannot go back to 12.',
			'Ask what order you need. If consumers only need each ticket\'s events in order, key by ticket id. The big tenant\'s traffic then spreads over all partitions.',
			'If some consumer needs per-tenant order, keep a tenant-keyed topic for it, and publish a ticket-keyed one for the rest. Or give the big tenant its own topic.',
			'Change the key or the count once, between two clear points: drain the old topic, then start a new one with the new layout, so no key is split across both.'
		]
	},
	quiz: [
		{
			q: 'Your database is at its limit on **writes**. Which change adds write capacity?',
			options: [
				'Adding two read replicas behind a load balancer',
				'Adding a cache in front of the most read tables',
				'Splitting the rows across servers by a partition key',
				'Raising the connection pool size in the application'
			],
			answer: 2,
			why: 'Every replica takes every write, and a cache only saves reads. A bigger pool sends more writes at the same saturated server. Only partitioning lets each server take a share of the writes.'
		},
		{
			q: 'A Kafka topic keyed by customer id grows from 12 to 16 partitions. What happens to the events of customer 42?',
			options: [
				'New events may land on another partition. Old ones stay where they were',
				'Kafka moves its old events to the new partition, so order is kept',
				'Nothing changes: a key keeps the partition it was first given',
				'The producer refuses to send until every consumer has caught up'
			],
			answer: 0,
			why: 'The default partitioner computes `hash(key) % count`, so a new count can give a new partition. The docs say Kafka "will not attempt to automatically redistribute existing data", so a consumer can see new events before older ones still waiting elsewhere.'
		},
		{
			q: 'Discourse runs several sites from one server in multisite mode. What decides which database a request reads?',
			options: [
				'A hash of the user id, taken modulo the number of databases',
				'The first database that answers, since they all hold the same data',
				'A round robin over every database, to spread the load evenly',
				'The request\'s host name, looked up in `multisite.yml`'
			],
			answer: 3,
			why: 'That is directory placement: each site\'s entry lists its `host_names` and its own `database`. A new site is a new entry, and nothing else moves.'
		}
	],
	takeaway: 'Replicas scale reads, partitions scale data and writes. Pick the partition key from your most common query, and know what every query without it will cost.',
	sources: [
		{ title: 'Apache Kafka, Introduction: partitions and replication', url: `${REPO}/docs/getting-started/introduction.md?plain=1#L83-L87` },
		{ title: 'Apache Kafka, Design: replication', url: `${REPO}/docs/design/design.md?plain=1#L281-L287` },
		{ title: 'Discourse, Set up a multisite development environment', url: `${DISCOURSE}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md?plain=1` },
		{ title: 'Unmesh Joshi, Patterns of Distributed Systems: Fixed Partitions', url: 'https://martinfowler.com/articles/patterns-of-distributed-systems/fixed-partitions.html' },
		{ title: 'Martin Kleppmann, Designing Data-Intensive Applications', url: 'https://dataintensive.net/' }
	]
};
