const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'characteristics',
	part: 'Thinking like an architect',
	title: 'Pick three "-ilities", not ten',
	minutes: 10,
	hook: [
		'Ask any team what their system should be and you get the same list: fast, secure, scalable, simple, reliable, cheap. All of them, at once, at the maximum. That list decides nothing.',
		'Apache Kafka\'s design doc starts differently. It names what Kafka must do: **high throughput** for log aggregation, **large backlogs** from offline loads, **low-latency delivery** for classic messaging. Each need turns into one property, and each property into code you can point to. That translation is the architect\'s first real job.',
		'These properties are called **architecture characteristics**. They are not features. "Consumers can rewind and read old messages again" is a feature. "A broker serves consumers at close to network speed" is a characteristic: it says nothing about what the system does, and everything about how it must be built.'
	],
	terms: [
		{ term: 'Characteristic', def: 'A quality the system must have that is not a feature: latency, throughput, availability, security… Often called an "-ility".' },
		{ term: 'Driving', def: 'The few characteristics that actually shape the design. Keep this list as short as you can. Three is a good target.' },
		{ term: 'Implicit', def: 'Expected but never written down, like basic security or "a restart does not lose data". Dangerous because nobody designs for it on purpose.' },
		{ term: 'Page cache', def: 'Memory the operating system uses to keep recently read and written file data. Kafka leans on it instead of building its own cache.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tput["High throughput"]', 'backlog["Large backlogs"]', 'lat["Low-latency delivery"]'],
				highlight: ['tput', 'backlog', 'lat'],
				note: 'Start from what the system must do. The design doc lists these needs before any design. They are still wishes: you cannot test "high".'
			},
			{
				add: ['tput --> batch["Batch messages into message sets"] --> zero["Zero-copy: page cache to socket"]'],
				highlight: ['batch', 'zero'],
				note: '**Throughput** becomes two decisions. Group messages so one network trip and one disk write carry many. Then send file data from the page cache straight to the socket, with no copy into the application.'
			},
			{
				add: ['backlog --> log["Append-only log on disk, O(1) reads and writes"] --> keep["Keep messages about a week"]'],
				highlight: ['log', 'keep'],
				note: '**Large backlogs** becomes a log of plain files. Appends and reads cost the same however much data is stored. So Kafka does not delete a message once it is read, it keeps it for a set time.'
			},
			{
				add: ['lat --> linger["Producer waits at most linger.ms, 5 ms by default"]'],
				highlight: ['linger'],
				note: '**Low latency** caps the batching. The producer waits a few milliseconds to fill a batch, then sends anyway. One setting sits right between two characteristics.'
			},
			{
				add: [],
				note: 'Need, then characteristic, then decision. The doc also says what it refused to build: no big in-process cache. "Using the filesystem and relying on pagecache is superior", and it "greatly simplifies the code".'
			}
		]
	},
	example: {
		title: 'clients/…/common/record/internal/FileRecords.java',
		repo: 'apache/kafka',
		url: `${KAFKA}/clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java#L279-L292`,
		lang: 'java',
		code: `    @Override
    public int writeTo(TransferableChannel destChannel, int offset, int length) throws IOException {
        long newSize = Math.min(channel.size(), end) - start;
        int oldSize = sizeInBytes();
        if (newSize < oldSize)
            throw new KafkaException(String.format(
                    "Size of FileRecords %s has been truncated during write: old size %d, new size %d",
                    file.getAbsolutePath(), oldSize, newSize));

        long position = start + offset;
        int count = Math.min(length, oldSize - offset);
        // safe to cast to int since \`count\` is an int
        return (int) destChannel.transferFrom(channel, position, count);
    }`,
		notes: [
			'This is how a broker sends a chunk of log to a consumer. It never reads the bytes itself. It hands the file channel, a position and a count to the network channel.',
			'On a plain connection, that call is [one line: `fileChannel.transferTo(position, count, socketChannel)`](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/PlaintextTransportLayer.java#L212-L215). That is the zero-copy path the [design doc](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/docs/design/design.md?plain=1#L90-L109) builds throughput on.',
			'On a TLS connection, the same call [reads the file into a 32 KB buffer](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/SslTransportLayer.java#L1002-L1045) so it can be encrypted. The doc says it plainly: "sendfile is not used when SSL is enabled." Security costs throughput, and the code shows where.',
			'Latency has its own knob: [`linger.ms` defaults to 5](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L154-L165). It "changed from 0 to 5 in Apache Kafka 4.0" because larger batches usually gave similar or lower latency anyway.'
		]
	},
	tradeoff: {
		gain: [
			'A short list lets you say no. "Does this help throughput, backlogs or latency? No? Then it waits."',
			'Every big decision traces back to a reason a newcomer can read, written down before the design.',
			'Relying on the operating system\'s page cache means less code to own. The doc says the cache also stays warm when the broker restarts.'
		],
		cost: [
			'Characteristics fight each other. Turning on TLS for security turns off the zero-copy path built for throughput.',
			'Batching for throughput adds waiting. Every producer pays up to `linger.ms` when traffic is light.',
			'The page cache is shared with everything on the machine. Memory another process uses is cache the broker does not get.'
		]
	},
	task: {
		prompt: 'Pick a product you work on. Write its top three characteristics, and for each one the decision it forces. Only three.',
		hint: 'Start from what would make users or the business angry if it broke. Then ask: what would we have to build differently to protect that?',
		answer: [
			'Check: are they characteristics (how) and not features (what)? "Can export a report" is a feature, "the export finishes in under a minute for a year of data" is a characteristic.',
			'Check: is each one tied to a need you could say out loud, like Kafka\'s "real-time log aggregation"?',
			'Check: can you name one decision each forces? If not, it is a wish, not a driving characteristic.',
			'Check: did you cut something painful to cut? If all three were easy, the list is probably too generic.'
		]
	},
	quiz: [
		{
			q: 'Which of these is an architecture **characteristic**, not a feature?',
			options: ['Agents can merge two duplicate support tickets into a single one', 'Search returns results in under 200 ms across 10 million tickets', 'Customers get an email with a summary when their ticket is closed', 'Users can attach screenshots and log files to a ticket'],
			answer: 1,
			why: 'A latency target says nothing about what the app does, it constrains how it is built (indexes, caching, sharding). The others are features.'
		},
		{
			q: 'Why keep the list of driving characteristics short?',
			options: ['Because a design document should fit on a single page', 'Because the standard catalog only defines three characteristics', 'Because managers cannot follow more than a few at once', 'Because each one costs design effort and they often conflict'],
			answer: 3,
			why: 'Supporting a characteristic costs complexity, and they trade against each other: in Kafka, TLS for security turns off the zero-copy path built for throughput.'
		},
		{
			q: 'A Kafka consumer connects over TLS. What happens to the zero-copy path when the broker sends it log data?',
			options: [
				'It is not used: the broker reads the file into a buffer so the data can be encrypted',
				'It still works, because the kernel encrypts the page cache before sendfile reads it',
				'The broker refuses TLS for consumers and only allows it between brokers',
				'The consumer decrypts the file directly on the broker\'s disk, so no copy is made'
			],
			answer: 0,
			why: 'Zero-copy sends file bytes straight from the page cache to the socket. TLS needs to encrypt them first, in user space. The design doc says "sendfile is not used when SSL is enabled."'
		}
	],
	takeaway: 'Turn the system\'s needs into at most three characteristics, then name the decision each one forces.',
	sources: [
		{ title: 'Apache Kafka docs, Design: Motivation', url: `${KAFKA}/docs/design/design.md?plain=1#L29-L43` },
		{ title: 'Apache Kafka docs, Design: Persistence and Efficiency', url: `${KAFKA}/docs/design/design.md?plain=1#L45-L111` },
		{ title: 'Apache Kafka, FileRecords.writeTo', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java#L279-L292` },
		{ title: 'Apache Kafka, ProducerConfig: linger.ms', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L152-L165` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' }
	]
};
