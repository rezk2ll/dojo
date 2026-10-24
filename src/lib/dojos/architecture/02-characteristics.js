const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'characteristics',
	part: 'Thinking like an architect',
	title: 'Architecture characteristics: choosing the top three',
	minutes: 10,
	hook: [
		'Ask any team what their system should be and you get the same list: fast, secure, scalable, simple, reliable, cheap. They want all of them at once, at the maximum. With that list, the team cannot choose between two designs.',
		'Apache Kafka\'s design doc starts with what Kafka must do: **high throughput** for log aggregation, large backlogs from offline loads, low-latency delivery for classic messaging. For each need, the doc names one property, and for each property you can point to the code that delivers it. As an architect, you do this work first.',
		'These properties are called architecture characteristics. "Consumers can rewind and read old messages again" is a feature. "A broker serves consumers at close to network speed" is a characteristic: it says nothing about what the system does, and it decides how the system must be built.'
	],
	terms: [
		{ term: 'Characteristic', def: 'A quality the system must have that is not a feature: latency, throughput, availability, security… Often called an "-ility".' },
		{ term: 'Driving', def: 'The few characteristics that shape the design. Keep this list as short as you can, three at most.' },
		{ term: 'Page cache', def: 'Memory the operating system uses to keep recently read and written file data. Kafka leans on it instead of building its own cache.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tput["High throughput"]', 'backlog["Large backlogs"]', 'lat["Low-latency delivery"]'],
				highlight: ['tput', 'backlog', 'lat'],
				note: 'Start from what the system must do. The design doc lists these three needs before any design. Nobody can test them yet, because "high" and "low" have no number.'
			},
			{
				add: ['tput --> batch["Batch messages into message sets"] --> zero["Zero-copy: page cache to socket"]'],
				highlight: ['batch', 'zero'],
				note: 'Kafka meets the throughput need with two decisions. It groups messages so one network trip and one disk write carry many. Then it sends file data from the page cache straight to the socket, with no copy into the application.'
			},
			{
				add: ['backlog --> log["Append-only log on disk, O(1) reads and writes"] --> keep["Keep messages about a week"]'],
				highlight: ['log', 'keep'],
				note: 'For large backlogs, Kafka stores messages in a log of plain files. Appends and reads cost the same however much data is stored. So Kafka keeps a message for a set time, even after it has been read.'
			},
			{
				add: ['lat --> linger["Producer waits at most linger.ms, 5 ms by default"]'],
				highlight: ['linger'],
				note: 'The latency need caps the batching. The producer waits a few milliseconds to fill a batch, then sends anyway. The one setting `linger.ms` trades throughput against latency.'
			},
			{
				add: [],
				note: 'Each need led to a characteristic, and each characteristic to a decision. The doc also names what Kafka does not build: a big in-process cache. "Using the filesystem and relying on pagecache is superior", and it "greatly simplifies the code".'
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
			'A broker sends a chunk of log to a consumer with this method. Lines 10 to 13 never read the bytes: they hand the file channel, a position and a count to the network channel.',
			'On a plain connection, the call on line 13 is [one line: `fileChannel.transferTo(position, count, socketChannel)`](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/PlaintextTransportLayer.java#L212-L215). The design doc builds throughput on this zero-copy path.',
			'On a TLS connection, the same call [reads the file into a 32 KB buffer](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/SslTransportLayer.java#L1002-L1045) so it can be encrypted. The doc: "sendfile is not used when SSL is enabled." Turning on TLS for security takes away the zero-copy path built for throughput.',
			'Latency has its own setting: [`linger.ms` defaults to 5](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L154-L165). It "changed from 0 to 5 in Apache Kafka 4.0" because larger batches usually gave similar or lower latency anyway.'
		]
	},
	tradeoff: {
		gain: [
			'With three characteristics written down, you can turn work down: "Does this help throughput, backlogs or latency? No? Then it waits."',
			'A newcomer can trace each big decision, like zero-copy or the append-only log, to a need written in the design doc.',
			'Relying on the operating system\'s page cache means less code to own. The doc says the cache also stays warm when the broker restarts.'
		],
		cost: [
			'Turning on TLS for security turns off the zero-copy path built for throughput.',
			'When traffic is light, every producer waits up to `linger.ms` before it sends a batch.',
			'The page cache is shared with everything on the machine. Memory another process uses is cache the broker does not get.'
		]
	},
	task: {
		prompt: 'Pick a product you work on. Write its top three characteristics, and for each one the decision it forces. Only three.',
		hint: 'Start from what would make users or the business angry if it broke. Then ask: what would we have to build differently to protect that?',
		answer: [
			'Check: are they characteristics (how) and not features (what)? "Can export a report" is a feature, "the export finishes in under a minute for a year of data" is a characteristic.',
			'Check: is each one tied to a need you could say out loud, like Kafka\'s "real-time log aggregation"?',
			'Check: can you name one decision each forces? A characteristic that forces no decision does not drive the design, so cut it.',
			'Check: did you cut something painful to cut? If all three were easy, the list is probably too generic.'
		],
		steps: [
			{
				title: 'Start from the needs',
				questions: [
					{ q: 'Where do you start when you pick the top three?', options: ['From the standard catalog of "-ilities", top to bottom', 'From what would make users or the business angry if it broke', 'From the technologies the team already knows', 'From the list "fast, secure, scalable, simple, reliable, cheap"'], answer: 1, why: 'A characteristic protects something that matters. Start from what hurts when it breaks.' },
					{ q: 'What did Kafka\'s design doc write down before any design?', options: ['The classes and their methods', 'The default value of `linger.ms`', 'Three needs: high throughput, large backlogs, low-latency delivery', 'How much page cache a broker gets'], answer: 2, why: 'The doc starts from what Kafka must do. The decisions come after.' },
					{ q: 'A team wants "fast, secure, scalable, simple, reliable, cheap", all at the maximum. What is wrong with that list?', options: ['It names features, not characteristics', 'It is too short to cover the system', 'It cannot help the team choose between two designs', 'It leaves out latency'], answer: 2, why: 'If everything matters at the maximum, nothing tells you which design to pick.' },
					{ q: 'Kafka\'s first need says "high" throughput, with no number. What does that mean for now?', options: ['Nobody can test it yet', 'It is a feature, not a characteristic', 'It does not drive the design', 'It must be cut from the list'], answer: 0, why: '"High" and "low" have no number yet, so nobody can check them.' }
				]
			},
			{
				title: 'Check each is a characteristic',
				questions: [
					{ q: 'Your list says "can export a report". What do you do with that line?', options: ['Keep it: users care about exports', 'Add the formats it supports, CSV and PDF', 'Rewrite it as how well the export must work, like "under a minute for a year of data"', 'Move it to the end of the list'], answer: 2, why: 'As written it says what users can do, so it is a feature. A limit on how well it works is a characteristic that shapes the build.' },
					{ q: '"Consumers can rewind and read old messages again." What is it?', options: ['A characteristic: throughput', 'A feature', 'A characteristic: availability', 'A driving characteristic'], answer: 1, why: 'It describes what the system does, so it is a feature.' },
					{ q: 'What separates a characteristic from a feature?', options: ['A characteristic is cheaper to build', 'A feature is always tested, a characteristic is not', 'A feature lives in code, a characteristic only in docs', 'A characteristic is about how the system is built, a feature about what it does'], answer: 3, why: 'Features are the what. Characteristics are the how, and they shape the design.' },
					{ q: '"A broker serves consumers at close to network speed." What is it?', options: ['A characteristic: it says nothing about what the system does', 'A feature: it describes what consumers get', 'A feature: users can see the speed', 'Neither: it is an implementation detail'], answer: 0, why: 'It adds no behavior. It decides how the broker must be built.' }
				]
			},
			{
				title: 'Tie each to a decision',
				questions: [
					{ q: 'Which thing does Kafka\'s design doc decide **not** to build?', options: ['Batching into message sets', 'An append-only log on disk', 'A big in-process cache, since relying on the page cache is simpler', 'A producer wait of `linger.ms`'], answer: 2, why: 'The doc says relying on the page cache "greatly simplifies the code". A decision can also be what you leave out.' },
					{ q: 'Which decision came from the large backlog need?', options: ['Zero-copy from page cache to socket', 'An append-only log on disk, with messages kept about a week', 'A producer wait of `linger.ms`', 'TLS between brokers'], answer: 1, why: 'Appends and reads cost the same however much is stored, so Kafka can keep messages for a set time.' },
					{ q: 'Which decision came from the low-latency need?', options: ['The producer waits at most `linger.ms` before it sends', 'The log keeps messages about a week', 'The broker reads files into a 32 KB buffer', 'The broker builds its own cache'], answer: 0, why: 'Latency caps the batching: wait a few milliseconds, then send anyway.' },
					{ q: 'One of your characteristics forces no decision. What do you do?', options: ['Keep it: it is still a quality you want', 'Turn it into a feature', 'Make it the first of the three', 'Cut it: it does not drive the design'], answer: 3, why: 'A characteristic that forces no decision does not shape anything, so it does not belong on the list.' }
				]
			},
			{
				title: 'Cut to three',
				questions: [
					{ q: 'You cut "reliable" from your list. Does that mean the product may be unreliable?', options: ['Yes: anything off the list is ignored', 'No: it still matters, it just does not drive the design', 'Yes, until the next release', 'No: it turns into a feature'], answer: 1, why: 'The driving list holds the few qualities that shape the design. The others still matter, and they give way when they conflict with the three.' },
					{ q: 'Kafka batches messages for throughput. What does that cost latency when traffic is light?', options: ['Nothing: batching only helps', 'The broker drops small batches', 'Each producer waits up to `linger.ms` before it sends', 'Consumers must read each message twice'], answer: 2, why: 'With little traffic a batch fills slowly, so the producer waits out `linger.ms` before sending. Throughput and latency pull against each other.' },
					{ q: 'All the cuts you made were easy. What does that suggest?', options: ['The list is probably too generic', 'The list is done and correct', 'You should add a fourth one', 'You picked features by mistake'], answer: 0, why: 'A real top three costs you something. If nothing hurt, you did not choose.' },
					{ q: 'What can you do once three are written down?', options: ['Skip writing a design doc for now', 'Ignore feature requests until next year', 'Promise all six qualities at the maximum', 'Turn work down: "Does this help one of the three? No? It waits."'], answer: 3, why: 'A short list gives you a reason to say no, and newcomers can trace each decision to a need.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Which of these is an architecture **characteristic**, not a feature?',
			options: ['Agents can merge two duplicate support tickets into a single one', 'Search returns results in under 200 ms across 10 million tickets', 'Customers get an email with a summary when their ticket is closed', 'Users can attach screenshots and log files to a ticket'],
			answer: 1,
			why: 'A latency target says nothing about what the app does. It constrains how the app is built (indexes, caching, sharding). The other three options describe what users can do, so they are features.'
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
	recall: {
		q: 'Kafka needs high throughput. Which two decisions does that need force, and which characteristic turns one of them off?',
		a: 'Batching messages into message sets, and zero-copy from the page cache to the socket. TLS, for security, turns zero-copy off: the broker reads the file into a 32 KB buffer to encrypt it.'
	},
	sources: [
		{ title: 'Apache Kafka docs, Design: Motivation', url: `${KAFKA}/docs/design/design.md?plain=1#L29-L43` },
		{ title: 'Apache Kafka docs, Design: Persistence and Efficiency', url: `${KAFKA}/docs/design/design.md?plain=1#L45-L111` },
		{ title: 'Apache Kafka, FileRecords.writeTo', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java#L279-L292` },
		{ title: 'Apache Kafka, ProducerConfig: linger.ms', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L152-L165` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' }
	]
};
