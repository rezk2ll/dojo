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
		'Your ticketing SaaS keeps every customer\'s tickets in one Postgres server. Each month it holds more rows and takes more writes. One day **one Postgres server can no longer keep up**.',
		'A bigger machine helps until you reach the biggest machine you can buy. If the problem is too many reads, keep copies, called replicas, and spread the reads over them. If the problem is too much data or too many writes, copies do not help, since every copy takes every write. Then you have to **split the data**, so each node holds only part of it.',
		'Splitting is a one-way door (day 5): undoing it means moving every row again. Once rows are spread by a key, a query that **names that key reads one place**, and a query without it asks every node. Discourse places each site with a directory, and Kafka places each event by hashing its key.'
	],
	terms: [
		{ term: 'Partition (shard)', def: 'A slice of the data, held by one node or one cluster. Each row lives in exactly one partition, and sharding puts the partitions on different machines.' },
		{ term: 'Partition key', def: 'The field that decides which partition a row goes to. A query that names it reads one partition. A query that does not must ask them all.' },
		{ term: 'Directory placement', def: 'A lookup table records where each key lives, instead of computing it from a hash. Easy to add a node to, but the table itself must always be readable.' },
		{ term: 'Replica', def: 'A copy of a partition on another node. It adds read capacity and survives a node loss. It adds no write capacity: every write goes to every copy.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req(["Request for help.acme.example"]) --> app["Ticketing app"]', 'app -->|"which database?"| dir[("Directory: tenant to database")]'],
				highlight: ['app', 'dir'],
				note: 'The partition key is the tenant, so before any query the app looks up where this tenant lives. Discourse multisite works this way: a config file maps each site\'s host names to its own database. That lookup table is a **directory**: the placement is written down instead of computed from the key.'
			},
			{
				add: ['app -->|"tenants 1 to 500"| db1[("Postgres A: full, no new tenants")]', 'app -->|"new tenants"| db2[("Postgres B")]'],
				highlight: ['db1', 'db2'],
				note: 'When server A is full, add server B and send **new tenants** there. The tenants already on A stay on A, so no data moves. A keeps growing as its tenants add tickets.'
			},
			{
				add: ['app -->|"ticket.updated, key = ticket id"| topic["Kafka topic: 12 partitions"]'],
				highlight: ['topic'],
				note: 'Events use hash placement: the app hands Kafka a key. The producer hashes the key and takes it modulo the partition count. **Same key, same partition**, so one ticket\'s events stay in order. There is no directory to read, but a new partition count sends keys to new partitions.'
			},
			{
				add: ['topic --> rep["Each partition: 1 leader, 2 followers"]'],
				highlight: ['rep'],
				note: 'With replication factor 3, each partition has a leader and two followers. All writes go to the partition leader and the followers copy its log. The copies survive a broker loss and can serve reads. They add **no write capacity**: each one takes every write.'
			},
			{
				add: ['report["Report: open tickets of every tenant"] -->|"scatter"| db1', 'report -->|"scatter"| db2'],
				highlight: ['report'],
				note: '"Open tickets of tenant 42" names the key and reads one database. "Open tickets across all tenants" has no key, so it visits every database and merges the answers. Add a third server and the report has one more database to wait for.'
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
			'Lines 2 and 3 use a partition the caller names, lines 5 to 13 ask a custom partitioner, and line 17 lets the key decide. With no key, line 19 returns `UNKNOWN_PARTITION`, and the [built-in partitioner](' + PRODUCER + '/internals/BuiltInPartitioner.java#L33-L40) picks: it sticks to one partition for a batch and then moves on. Keyless records spread over the partitions, with no order between them.',
			'Line 17 calls [`partitionForKey`](' + PRODUCER + '/internals/BuiltInPartitioner.java#L410-L415): the murmur2 hash of the key, made positive, modulo the partition count. The design doc gives the reason: "if the key chosen was a user id then all data for a given user would be sent to the same partition". A user with ten times the traffic then puts ten times the load on **one** partition.',
			'The partition count is in that formula, and the [operations doc](' + REPO + '/docs/operations/basic-kafka-operations.md?plain=1#L63) warns that after adding partitions "messages with the same key may be routed to different partitions", and "Kafka will not attempt to automatically redistribute existing data". It also says: "Kafka does not currently support reducing the number of partitions for a topic."',
			'The [design doc](' + REPO + '/docs/design/design.md?plain=1#L285-L287) shows why replicas do not split writes: "All writes go to the leader of the partition, and reads can go to the leader or the followers". Followers "consume messages from the leader just as a normal Kafka consumer would".',
			'Discourse uses directory placement: its [sample `multisite.yml`](' + DISCOURSE + '/config/multisite.yml.production-sample#L1-L14) gives each site its own `database` and its own `host_names`. The multisite guide says "A multisite server uses a different DB and hostname for each site", and that rake tasks target one site through `RAILS_DB`. A schema migration therefore runs once per site.'
		]
	},
	tradeoff: {
		gain: [
			'You add capacity by adding servers or partitions, instead of buying one bigger machine that has a ceiling.',
			'Partitioning by tenant matches how the data is read: almost every request names one tenant, so it lands on one database.',
			'A query that names the partition key costs about the same with 10 nodes or 100.',
			'Replicas add read capacity and let a node die without losing data (day 9).'
		],
		cost: [
			'A report across all tenants visits every database, and a consumer that needs every event reads every partition.',
			'Rows were placed by the key, so changing the key means copying the data into a new layout, a migration of its own (day 32).',
			'A hash moves keys when the partition count changes. A directory moves nothing, so an old server stays as full as it was the day it stopped taking tenants.',
			'A replica updated asynchronously can answer with data older than the write you just made (day 16). Quorum reads avoid that, but each read waits for more copies.'
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
		],
		steps: [
			{
				title: 'Follow the hot key',
				questions: [
					{ q: 'Why did Kafka\'s designers let the key choose the partition at all?', options: ['To save disk space', 'To balance load evenly whatever the keys', 'So all data for one key lands on one partition, together and in order', 'To skip replication for keyed records'], answer: 2, why: 'The design doc: with a user id as key, "all data for a given user would be sent to the same partition". The hot tenant is the price of that promise.' },
					{ q: 'Where do all of the big tenant\'s events go today?', options: ['To one partition', 'Spread evenly over the 12 partitions', 'To the partition with the most free space', 'To a new partition per ticket'], answer: 0, why: 'The key is the tenant id, so every one of its events hashes to the same partition.' },
					{ q: 'Why is one consumer hours behind?', options: ['Kafka slows down partitions with many keys', 'Its partition takes 40% of all updates', 'The other consumers steal its events', 'The topic has too few replicas'], answer: 1, why: 'A key with ten times the traffic puts ten times the load on **one** partition, and one consumer reads it.' },
					{ q: 'Can the producer bypass the key and name a partition itself for some records?', options: ['No: Kafka always hashes the key', 'Only for records with no key', 'Only on follower replicas', 'Yes: a partition set on the record wins over the key'], answer: 3, why: '`partition()` checks `record.partition()` first, then a custom partitioner, and only then the key.' }
				]
			},
			{
				title: 'Test the 48-partition idea',
				questions: [
					{ q: 'After the move to 48, where does the big tenant\'s traffic go?', options: ['Still to one partition', 'Spread over 4 partitions', 'Spread over all 48', 'To the newest partition'], answer: 0, why: 'One key still hashes to one partition, whatever the count. The hot partition stays hot.' },
					{ q: 'A nightly job reads every `ticket.updated` event. What does the move to 48 change for it?', options: ['Nothing at all', 'It reads fewer partitions', 'It has 48 partitions to read instead of 12', 'It reads only the hot partition'], answer: 2, why: 'A consumer that needs every event reads every partition. More partitions means more of them to follow.' },
					{ q: 'If 48 turns out to be a mistake, can you go back to 12?', options: ['Yes, with a config change', 'Yes, once consumers are idle', 'Only if no new keys were written', 'No: Kafka does not support reducing partitions'], answer: 3, why: 'The operations doc says Kafka does not currently support reducing the number of partitions for a topic.' },
					{ q: 'So does the teammate\'s change fix the lagging consumer?', options: ['Yes: 48 partitions spread the load four times wider', 'No: the big tenant\'s key still lands on one partition', 'Yes, once Kafka moves the old events to the new partitions', 'Only if the topic also gets more replicas'], answer: 1, why: 'More partitions spread **many** keys. They cannot split **one** key.' }
				]
			},
			{
				title: 'Choose the key by the order you need',
				questions: [
					{ q: 'What question comes before picking a new key?', options: ['Which order consumers need: per tenant or per ticket', 'How many brokers the cluster has', 'How big each event is', 'Which consumer group is fastest'], answer: 0, why: 'The key decides what stays in order. Pick it from what consumers really need.' },
					{ q: 'Consumers only need each ticket\'s events in order. What key do you use?', options: ['Tenant id, as today', 'No key at all', 'A random number per event', 'Ticket id'], answer: 3, why: 'Same ticket, same partition, so each ticket keeps its order, and the big tenant\'s many tickets spread out.' },
					{ q: 'Why not send the events with no key?', options: ['Kafka refuses records without a key', 'Keyless records all go to partition 0', 'Keyless records spread with no order between them', 'Keyless records are not replicated'], answer: 2, why: 'With no key the built-in partitioner sticks to a partition per batch and moves on, so one ticket\'s events can arrive out of order.' },
					{ q: 'One consumer really needs per-tenant order. What do you do?', options: ['Keep tenant id as the key for every consumer', 'Keep a tenant-keyed topic for it, and publish a ticket-keyed one for the rest', 'Let it sort events by timestamp after reading', 'Give it more partitions than the others'], answer: 1, why: 'Each consumer gets the layout it needs. Giving the big tenant its own topic is the other option.' }
				]
			},
			{
				title: 'Plan the switch',
				questions: [
					{ q: 'How many times do you change the key or the count?', options: ['Once, between two clear points', 'Gradually, a few partitions a week', 'Every time a tenant grows', 'Twice: once up, once back'], answer: 0, why: 'Each change can split a key across layouts. Doing it once keeps that window to one.' },
					{ q: 'What do you do with the old topic before starting the new one?', options: ['Delete it right away', 'Keep writing to both forever', 'Drain it', 'Rename it to the new name'], answer: 2, why: 'Draining lets consumers read every old event first, so no key is split across both topics.' },
					{ q: 'Why start a new topic instead of changing the key on the old one?', options: ['Kafka forbids changing keys on a topic', 'New topics are faster', 'Old topics cannot be read once a key changes', 'So no key has events in both layouts at once'], answer: 3, why: 'Change the key in place and a ticket\'s older events sit under the old key while its new ones go elsewhere. Draining, then starting fresh, keeps the two layouts apart.' },
					{ q: 'Why does this choice deserve care?', options: ['Partitioning is a one-way door: undoing it means moving data again', 'Topic names cannot be reused', 'Consumers must restart in a fixed order', 'Brokers need a reboot after every change'], answer: 0, why: 'Once data is spread by a key, changing the key or the count moves data and can break order.' }
				]
			}
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
			why: 'Discourse uses directory placement: each site\'s entry lists its `host_names` and its own `database`. A new site is a new entry, and nothing else moves.'
		}
	],
	recall: {
		q: 'Which adds write capacity, replicas or partitions, and how does Kafka pick a keyed record\'s partition?',
		a: 'Partitions, since every replica takes every write. Kafka takes the murmur2 hash of the key modulo the partition count, so a key stays on one partition until the count changes.'
	},
	sources: [
		{ title: 'Apache Kafka, Design: semantic partitioning by key', url: `${REPO}/docs/design/design.md?plain=1#L127` },
		{ title: 'Apache Kafka, Operations: reducing partitions', url: `${REPO}/docs/operations/basic-kafka-operations.md?plain=1#L98` },
		{ title: 'Apache Kafka, Introduction: partitions and replication', url: `${REPO}/docs/getting-started/introduction.md?plain=1#L83-L87` },
		{ title: 'Apache Kafka, Design: replication', url: `${REPO}/docs/design/design.md?plain=1#L281-L287` },
		{ title: 'Discourse, Set up a multisite development environment', url: `${DISCOURSE}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md?plain=1` },
		{ title: 'Unmesh Joshi, Patterns of Distributed Systems: Fixed Partitions', url: 'https://martinfowler.com/articles/patterns-of-distributed-systems/fixed-partitions.html' },
		{ title: 'Martin Kleppmann, Designing Data-Intensive Applications', url: 'https://dataintensive.net/' }
	]
};
