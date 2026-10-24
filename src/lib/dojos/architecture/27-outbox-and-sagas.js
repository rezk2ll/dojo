const REPO = 'https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'outbox-and-sagas',
	part: 'The pattern toolbox',
	title: 'Outbox and sagas: when one change spans two systems',
	minutes: 10,
	hook: [
		'An online shop takes an order. The checkout code saves the order to Postgres, then publishes `OrderPlaced` so the warehouse can pack it. Two writes, to two systems.',
		'Tonight the broker restarts at the wrong second. The save commits, the publish throws, and the code logs an error. **The order exists. The warehouse has never heard of it.**',
		'The checkout has hit the **dual-write problem**: no transaction spans a database and a broker. An outbox puts the order and its event in one database transaction. A saga runs a process across services that share no transaction at all.'
	],
	terms: [
		{ term: 'Transactional outbox', def: 'The service writes the outgoing message to a table in the same database transaction as the change, so both commit or neither does. A relay publishes the row later.' },
		{ term: 'Relay', def: 'The code that reads new outbox rows and publishes them. It can poll the table, or tail the database\'s log. A crash after a publish can send a row twice, so the relay gives at-least-once.' },
		{ term: 'Saga', def: 'A process across several services, where each step is a local transaction of its own. If a later step fails, earlier steps are undone by compensating actions.' },
		{ term: 'Compensating action', def: 'A new action that undoes the effect of an earlier one: release the stock, refund the card. It differs from a rollback because other services may already have seen the first step.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['checkout["Checkout service"] -->|"1: commit the order"| db[("Orders database")]', 'checkout -.->|"2: publish, may fail"| kafka["Kafka"]', 'class kafka ext'],
				highlight: ['checkout', 'kafka'],
				note: 'In the dual write, step 1 commits. Step 2 may fail, and nothing sends it again. Swap the order and you get the opposite bug: an event about an order that the database then refuses to save.'
			},
			{
				add: ['checkout -->|"same transaction"| outbox[("outbox table")]'],
				highlight: ['outbox'],
				note: 'With an outbox, the checkout inserts the order and an outbox row in **one** transaction. A rollback drops both rows, and a commit keeps both. The checkout never talks to Kafka.'
			},
			{
				add: ['dbz["Debezium: outbox event router"] -->|"tails the write-ahead log"| outbox', 'dbz -->|"topic outbox.event.order, key = order id"| kafka', 'class dbz ext'],
				highlight: ['dbz'],
				note: 'Here the relay is Debezium, which reads each committed insert from the database\'s log and publishes it as a Kafka message. Nothing polls the table, and the checkout makes no second write. If it crashes, it resumes from its last recorded position, so some messages may go out twice.'
			},
			{
				add: ['kafka -->|"OrderPlaced"| stock["Stock: reserve items"]', 'stock -->|"StockReserved"| pay["Payment: charge card"]'],
				highlight: ['stock', 'pay'],
				note: 'This saga runs by choreography: placing an order is one process across three services, and no single service runs it. Each service does its local transaction and publishes the next event, through its own outbox. With orchestration, one service would send commands, track the replies and decide what is next.'
			},
			{
				add: ['pay -->|"PaymentFailed"| release["Stock: release items"]', 'release -->|"StockReleased"| cancel["Checkout: cancel the order"]'],
				highlight: ['release', 'cancel'],
				note: 'A failed payment triggers compensating actions: release the stock, cancel the order. The card is charged **last**, because a refund is the hardest step to undo cleanly.'
			}
		]
	},
	example: {
		title: 'EventRouterDelegate.java, apply',
		repo: 'debezium/debezium',
		url: `${REPO}/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterDelegate.java#L109-L259`,
		lang: 'java',
		code: `        Struct debeziumEventValue = requireStruct(r.value(), "Detect Debezium Operation");
        String op = debeziumEventValue.getString(Envelope.FieldName.OPERATION);

        // Skipping deletes
        if (op.equals(Envelope.Operation.DELETE.code())) {
            LOGGER.debug("Delete message {} ignored", maybeRedactSensitiveData(r.key()));
            return null;
        }

        // Dealing with unexpected update operations
        if (op.equals(Envelope.Operation.UPDATE.code())) {
            handleUnexpectedOperation(r);
            return null;
        }
…
        Object eventId = eventStruct.get(fieldEventId);
…
        Headers headers = r.headers();
        headers.add("id", eventId, eventIdField.schema());
…
        Object recordKey = defineRecordKey(fieldEventKey, eventStruct);

        R newRecord = r.newRecord(
                eventStruct.getString(routeByField),
                partition.get(),
                defineRecordKeySchema(fieldEventKey, eventValueSchema),
                recordKey,
                updatedSchema,
                updatedValue,
                timestamp,
                headers);
…
        return regexRouter.apply(newRecord);
    }`,
		notes: [
			'This code runs on every change Debezium reads from the outbox table, and it expects only inserts. Lines 5 to 8 skip a delete, so the service can clean up old rows without sending anything. Lines 11 to 14 handle an update, which is unexpected: by [default](https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterConfigDefinition.java#L230-L237) it is dropped with a warning.',
			'Line 19 copies the row\'s `id` into the message\'s `id` header. The Debezium docs say it is there **"to remove duplicate messages"**. Debezium\'s FAQ warns that after a crash, consumers may see some events more than once.',
			'Line 24 takes the topic from `route.by.field`, and line 21 takes the message key from `table.field.event.key`. Their [defaults](https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterConfigDefinition.java#L247-L327) are the `aggregatetype` and `aggregateid` columns, which gives the topic `outbox.event.<aggregatetype>`. Same order id, same key, same Kafka partition: **events for one order stay in order.**',
			'This code does not start a transaction in your service. Your code still has to insert the outbox row in the same transaction as the change. Debezium only makes sure a committed row gets sent.'
		]
	},
	tradeoff: {
		gain: [
			'With an outbox, a committed change always has its event stored, even if the broker is down for an hour, and the relay sends that event once the broker is back.',
			'Choreography keeps services apart: Checkout does not know who reserves stock or takes payment. A new service subscribes, with no change upstream.',
			'Each saga step commits on its own, so no lock is held across services while a payment is pending.'
		],
		cost: [
			'The outbox needs the message and the change in one database. A service that writes to a store with no shared transaction, such as a remote API, still has the dual-write problem.',
			'The relay is one more system to run: a polling job, or a Debezium connector on Kafka Connect. After a crash it sends duplicates, so consumers must drop repeats by event id.',
			'With choreography, no service sees the whole saga, so "where is order 42 stuck?" has no single owner. A compensation can fail too, leaving a half-done process and a log line.'
		]
	},
	task: {
		prompt: 'Your ticketing app sells concert seats. Booking does three things in three services: hold the seat, charge the card, email the ticket. Design it as a saga: the order of the steps, the compensation for each one, and what every consumer must do with the event id.',
		hint: 'Which step is the hardest to undo? Which one can never be undone at all?',
		answer: [
			'Hold the seat first, with an expiry: it is cheap to release. Its compensation is "release the seat".',
			'Charge the card next. If it fails, release the seat. Its own compensation, a refund, is costly, so keep it for when a later step really fails.',
			'Email the ticket last. An email can never be unsent, so it goes only after the charge succeeded.',
			'Each service writes its event to its own outbox, in the same transaction as its change. Each consumer stores the event ids it handled and skips a repeat, so a duplicate never charges twice.'
		],
		steps: [
			{
				title: 'Order the steps',
				questions: [
					{ q: 'Which step goes first?', options: ['Hold the seat, with an expiry', 'Charge the card', 'Email the ticket', 'All three at once'], answer: 0, why: 'Holding a seat is the cheapest step to undo.' },
					{ q: 'Why does the hold come first?', options: ['It is the slowest step', 'It is cheap to release', 'It can never fail', 'The customer wants it first'], answer: 1, why: 'If a later step fails, releasing a seat costs almost nothing.' },
					{ q: 'Which step goes last?', options: ['Hold the seat', 'Charge the card', 'Email the ticket', 'Release the seat'], answer: 2, why: 'The step that can never be undone waits until everything else has worked.' },
					{ q: 'Why does the email go last?', options: ['Email is the slowest service', 'Mail servers are often down', 'It is the cheapest step', 'An email can never be unsent'], answer: 3, why: 'It has no compensation, so it goes only after the charge succeeded.' }
				]
			},
			{
				title: 'Give each step a compensation',
				questions: [
					{ q: 'What is the compensation for holding the seat?', options: ['Release the seat', 'Refund the card', 'Send an apology email', 'Nothing: a hold never needs undoing'], answer: 0, why: 'Releasing the seat undoes the hold, and the expiry does it even if nobody calls.' },
					{ q: 'The card charge fails. What do you do?', options: ['Refund the card', 'Email the ticket anyway', 'Release the seat', 'Retry the charge forever'], answer: 2, why: 'The charge did not happen, so only the earlier step needs undoing.' },
					{ q: 'What is the compensation for the charge itself?', options: ['Releasing the seat', 'A refund', 'Unsending the email', 'Deleting the order row'], answer: 1, why: 'A refund undoes the charge. It is costly, so keep it for when a later step really fails.' },
					{ q: 'How does "release the seat" differ from a database rollback?', options: ['It undoes the write inside the same transaction', 'It runs before the hold commits', 'It deletes the event from Kafka', 'It is a new action, and other services may already have seen the hold'], answer: 3, why: 'The hold already committed. A compensation is a new step that undoes its effect.' }
				]
			},
			{
				title: 'Publish each event safely',
				questions: [
					{ q: 'What goes wrong with "commit, then publish to the broker"?', options: ['The publish can fail after the commit, and the event is never sent', 'The commit gets slower', 'Kafka refuses the event', 'The change is saved twice'], answer: 0, why: 'That is the dual-write problem: no transaction spans a database and a broker.' },
					{ q: 'Where does each service write its event?', options: ['Straight to Kafka after the commit', 'To its own outbox, in the same transaction as its change', 'To one outbox shared by all services', 'To a log file'], answer: 1, why: 'Both rows commit or neither does, so a committed change always has its event.' },
					{ q: 'Who sends the outbox rows to the broker?', options: ['The service, right after the commit', 'Each consumer', 'A relay that polls the table or tails the database log', 'The broker, by reading the table itself'], answer: 2, why: 'The relay publishes committed rows later, for example Debezium reading the log.' },
					{ q: 'You run booking by choreography. What does that mean?', options: ['One service sends commands and tracks the replies', 'All three services share one transaction', 'A person starts each step', 'Each service does its step and publishes the next event, and no single service runs the process'], answer: 3, why: 'With orchestration, one service would send commands. Here each service reacts to the event before it.' }
				]
			},
			{
				title: 'Handle the event id',
				questions: [
					{ q: 'What does the relay guarantee?', options: ['At-least-once', 'Exactly-once', 'At-most-once', 'No guarantee at all'], answer: 0, why: 'A crash after a publish can send a row twice.' },
					{ q: 'What does each consumer do with the event id?', options: ['Ignore it', 'Store the ids it handled and skip a repeat', 'Send it back to the producer', 'Use it as the Kafka topic'], answer: 1, why: 'A stored id lets the consumer recognize a copy it already handled.' },
					{ q: 'The payment service skips the dedupe. What can happen?', options: ['The seat is never held', 'The email is lost', 'A duplicate event charges the card twice', 'Nothing, since the relay never repeats'], answer: 2, why: 'At-least-once means a repeat will come one day. Without dedupe, it is a second charge.' },
					{ q: 'In Debezium\'s outbox router, where does the row\'s `id` go?', options: ['Into the topic name', 'Into the partition number', 'Nowhere: it is dropped', 'Into the message\'s `id` header'], answer: 3, why: 'The Debezium docs say the header is there "to remove duplicate messages".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What makes a transactional outbox reliable?',
			options: ['The broker holds the message in a pending state until the database confirms the commit', 'The relay publishes each message exactly once, so consumers never see a repeat', 'The message is written to a table in the same database transaction as the change it describes', 'The service retries the publish from memory with backoff until the broker accepts it'],
			answer: 2,
			why: 'Change and message commit together, or neither does. Then the message can be sent later, as often as needed. The broker never joins the transaction, and the relay gives at-least-once, not exactly-once.'
		},
		{
			q: 'A relay publishes an outbox row, then crashes before it records how far it got. What happens next?',
			options: ['On restart the relay publishes the row again, and the consumer drops the repeat by its event id', 'The row is lost, because the crash wiped the progress the relay kept in memory', 'The broker notices the duplicate by its key and drops it before consumers see it', 'The database rolls back the transaction, so the order change is undone too'],
			answer: 0,
			why: 'The publish is outside the database, so nothing can undo it. The relay resumes from its last recorded point, so the row goes out again: at-least-once. A stable event id lets the consumer spot the repeat.'
		},
		{
			q: 'Debezium\'s outbox event router uses the `aggregateid` column as the Kafka message key by default. Why does that matter?',
			options: ['It encrypts the message with a key that belongs to that aggregate', 'Kafka drops any later message with the same key, so each event arrives once', 'It makes the router skip delete events for that aggregate, so rows are kept', 'Messages with the same key go to the same partition, so events for one order stay in order'],
			answer: 3,
			why: 'Kafka keeps order within a partition, and the key picks the partition. Kafka does not dedupe by key: that is what the `id` header is for.'
		}
	],
	recall: {
		q: 'The checkout saves an order, then publishes `OrderPlaced`, and the publish fails. Why is the event lost, and what does an outbox do instead?',
		a: 'No transaction spans Postgres and Kafka, so nothing sends the event again. An outbox writes the event row in the same transaction as the order, and a relay like Debezium publishes it at least once.'
	},
	sources: [
		{ title: 'debezium/debezium, EventRouterDelegate.java', url: `${REPO}/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterDelegate.java#L96-L259` },
		{ title: 'Debezium documentation: Outbox Event Router', url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html' },
		{ title: 'Debezium FAQ: why consumers must expect duplicate events', url: 'https://debezium.io/documentation/faq/#why_must_consuming_applications_expect_duplicate_events' },
		{ title: 'Chris Richardson, microservices.io: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
		{ title: 'Chris Richardson, microservices.io: Saga', url: 'https://microservices.io/patterns/data/saga.html' }
	]
};
