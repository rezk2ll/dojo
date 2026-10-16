/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'unique-ids',
	part: 'Small services',
	title: 'Unique ids across servers',
	minutes: 10,
	hook: [
		'An order service writes to one database, and every order gets its id from an auto-increment column. Sales grow. The team splits the orders over 4 databases, and each one keeps its own counter.',
		'Two weeks later, support finds two different orders with id 1 000 017, one in each of two databases. A refund for one customer goes to the other.',
		'The fix the team wants: every server makes its own ids, with no shared counter, and two ids never collide.'
	],
	terms: [
		{ term: 'Epoch', def: 'The moment the timestamp part of an id counts from. Snowflake counted from November 2010 instead of 1970, so the 41 bits last longer.' },
		{ term: 'Machine id', def: 'A number given to each server, unique among all servers. It goes into every id that server makes.' },
		{ term: 'Sequence', def: 'A counter inside one server that numbers the ids made in the same millisecond.' }
	],
	kata: {
		brief: [
			'An order service runs on **20 servers**. At peak it creates 30 000 ids per second in total, and up to 3 000 per second on one server.',
			'Each id must fit in a signed 64-bit integer (a `BIGINT` column). Sorting ids must sort orders by creation time, to within one second. The scheme must work for 50 years.',
			'No server may call a database or another server to get an id. A server that cannot make a correct id must refuse, and never hand out a duplicate.'
		],
		minutes: 10,
		checklist: [
			'Your design splits the 64 bits into parts and gives the number of bits for each one.',
			'Your design says how many years the timestamp part lasts, and from which date it counts.',
			'Your design says how each of the 20 servers gets its machine id, and what stops two servers from sharing one.',
			'Your design says how many ids one server can make in one millisecond, and what it does with request number one more.',
			'Your design says what a server does when its clock jumps back by 5 milliseconds.',
			'Your design says why two ids made 1 ms apart on two servers may sort in the wrong order.'
		],
		sample: [
			'The sample uses the layout of Twitter’s Snowflake. Its 2010 README lists: "time - 41 bits", "configured machine id - 10 bits" and "sequence number - 12 bits". The top bit stays 0, so 1 + 41 + 10 + 12 = 64 and the id is always a positive `BIGINT`.',
			'Time: 41 bits of milliseconds is 2 199 billion ms, about 69 years. The count starts at a custom epoch, for example 1 January 2026, so ids last until about 2095 and cover the 50 years in the brief. Because time is in the top bits, sorting ids sorts by millisecond first.',
			'Machine id: 10 bits gives 1 024 values for 20 servers. Each server reads its id, 0 to 19, from its config file at deploy time. If two servers are deployed with the same machine id, they can make the same id in the same millisecond, and nothing at runtime notices. The deploy script checks that the 20 values are all different.',
			'Sequence: 12 bits is 4 096 ids per millisecond per server, about 4 million per second. The brief needs 3 000 per second, 3 per millisecond. In `IdWorker.scala`, when the sequence wraps to 0 in the same millisecond, `tilNextMillis` loops until the clock shows the next millisecond.',
			'Clock going back: the same code compares the clock with the last timestamp it used. When the clock shows an earlier time, it throws "Clock moved backwards.  Refusing to generate id for %d milliseconds". A 5 ms jump back costs 5 ms of refused ids on that server, and no duplicate.',
			'Two ids made in the same millisecond on servers 3 and 12 sort by machine id. Server clocks also differ by however far NTP lets them drift. The README promised order "within a reasonable bound (we\'re promising 1s, but shooting for 10\'s of ms)", which matches the one second in the brief.'
		]
	},
	quiz: [],
	recall: {
		q: 'How are the 64 bits split in the sample, and how long does the timestamp part last?',
		a: '1 unused sign bit, 41 bits of milliseconds (about 69 years from a custom epoch), 10 bits of machine id and 12 bits of sequence.'
	},
	sources: [
		{ title: 'Twitter Snowflake README, snowflake-2010 tag', url: 'https://github.com/twitter-archive/snowflake/blob/b3f6a3c6ca8e1b6847baa6ff42bf72201e2c2231/README.mkd' },
		{ title: 'Twitter Snowflake, IdWorker.scala, nextId', url: 'https://github.com/twitter-archive/snowflake/blob/b3f6a3c6ca8e1b6847baa6ff42bf72201e2c2231/src/main/scala/com/twitter/service/snowflake/IdWorker.scala#L71-L103' }
	]
};
