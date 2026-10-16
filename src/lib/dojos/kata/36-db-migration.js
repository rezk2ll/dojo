/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'db-migration',
	part: 'Architecture',
	title: 'Moving to a new database',
	minutes: 10,
	hook: [
		'A shop runs on one MySQL database of 500 GB. The team has decided to move to PostgreSQL. Every order, cart and invoice lives in that MySQL database today.',
		'A dump and restore of 500 GB takes hours, and the shop cannot refuse orders for hours. The product owner gives you 5 minutes of refused writes, at 3 a.m., once.',
		'So the copy has to happen while MySQL keeps taking writes, and the switch has to happen in one short window.'
	],
	terms: [
		{ term: 'Binlog', def: 'The MySQL binary log: every committed change, in commit order. MySQL uses it for replication.' },
		{ term: 'Change data capture (CDC)', def: 'Reading a database’s log of changes and sending each change somewhere else as an event.' },
		{ term: 'Cutover', def: 'The moment the application stops writing to the old database and starts writing to the new one.' },
		{ term: 'Upsert', def: 'A write that inserts the row if its primary key is new and updates it if the key already exists.' }
	],
	kata: {
		brief: [
			'One MySQL 8 server holds 500 GB in 40 tables. The largest, `orders`, is 300 GB. Twelve app servers write to it.',
			'Writes peak at 1 200 per second in the evening and drop to 150 per second at 3 a.m. A test run copied rows into PostgreSQL at 40 MB per second.',
			'The target is PostgreSQL 16. During the move, writes may be refused for at most 5 minutes in total. No committed order may be lost or written twice.',
			'Design the copy, how you keep PostgreSQL up to date while the copy runs, how you check the data, and the cutover itself.'
		],
		minutes: 10,
		checklist: [
			'Your design says how the 500 GB gets into PostgreSQL while MySQL keeps taking writes.',
			'Your design says how writes made during the copy reach PostgreSQL, and from which point in time.',
			'Your design says what happens when the same change is applied twice after a restart.',
			'Your design gives the copy time in hours, worked out from 500 GB and 40 MB per second.',
			'Your design lists the cutover steps in order, with a time for each, adding up to under 5 minutes.',
			'Your design says how you compare MySQL and PostgreSQL before you switch.',
			'Your design says what happens to the next auto-increment id after the switch.',
			'Your design says whether you can go back to MySQL after PostgreSQL has taken writes.'
		],
		sample: [
			'Copy and stream with one tool: the Debezium MySQL connector, sending events through Kafka to the Debezium JDBC sink connector, which writes to PostgreSQL. MySQL needs `binlog_format = ROW` and `binlog_row_image = FULL`, which the Debezium docs require.',
			'On first start, Debezium takes a snapshot. It holds a global read lock only while it reads the binlog position and the table structures, then releases it. It then scans every table inside one repeatable read transaction, and afterwards streams the binlog from the position it read. No change between the snapshot and the stream is missed.',
			'The snapshot moves 500 GB at 40 MB per second: 500 000 MB / 40 = 12 500 seconds, about 3.5 hours. MySQL keeps the binlog for 30 days by default (`binlog_expire_logs_seconds = 2592000`), so the changes made in those 3.5 hours are still there when streaming starts.',
			'Kafka delivers at least once, so after a restart the sink can get the same event twice. Set `insert.mode = upsert`: on PostgreSQL the sink writes `INSERT ... ON CONFLICT ... DO UPDATE`, so a replayed event leaves the same row. Set `delete.enabled = true`, or rows deleted in MySQL stay in PostgreSQL.',
			'Before cutover night, run checks for a week: row counts per table, and a checksum of each row changed in the last 24 hours, on both sides. Freeze schema changes on MySQL for that week, so the two sides keep the same tables.',
			'Cutover at 3 a.m., at 150 writes per second. Minute 0: turn on a read-only flag in the app, so it refuses writes. Minute 1: the sink has applied the last binlog event, and the row counts match.',
			'Minute 2: run `setval` on each of the 40 sequences to the highest `id` in its table, since the copied rows carried their ids and the sequences never moved. Minutes 3 to 4: point the 12 app servers at PostgreSQL and turn the flag off.',
			'The cost: once PostgreSQL takes its first order, MySQL is behind. Going back means a second pipeline from PostgreSQL to MySQL, which this design does not build. You also run Kafka and Kafka Connect for the weeks of the move.'
		]
	},
	quiz: [],
	recall: {
		q: 'How long does the 500 GB snapshot take, and what lets the stream catch up on writes made during it?',
		a: 'About 3.5 hours (500 000 MB at 40 MB per second). Debezium reads the binlog position under the lock before the scan and streams from that position, and MySQL keeps binlogs 30 days by default.'
	},
	sources: [
		{ title: 'Debezium, MySQL connector (snapshots and binlog settings)', url: 'https://debezium.io/documentation/reference/stable/connectors/mysql.html' },
		{ title: 'Debezium, JDBC sink connector (idempotent writes, deletes)', url: 'https://debezium.io/documentation/reference/stable/connectors/jdbc.html' },
		{ title: 'PostgreSQL, sequence manipulation functions (setval)', url: 'https://www.postgresql.org/docs/current/functions-sequence.html' }
	]
};
