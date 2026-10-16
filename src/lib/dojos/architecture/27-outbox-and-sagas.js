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
		'That is the **dual-write problem**: no transaction spans a database and a broker. Today, two patterns that live with it. The **outbox** turns the two writes into one. The **saga** runs a process across services that share no transaction at all.'
	],
	terms: [
		{ term: 'Dual write', def: 'One change written to two systems, such as a database and a broker, with no transaction across them. A crash or an outage between the two leaves them out of step.' },
		{ term: 'Transactional outbox', def: 'Write the outgoing message to a table, in the same database transaction as the change. Both commit, or neither does. A relay publishes it later.' },
		{ term: 'Relay', def: 'The code that reads new outbox rows and publishes them. It can poll the table, or tail the database\'s log. A crash after a publish can send a row twice, so the relay gives at-least-once.' },
		{ term: 'Saga', def: 'A process across several services, where each step is a local transaction of its own. If a later step fails, earlier steps are undone by compensating actions.' },
		{ term: 'Compensating action', def: 'A new action that undoes the effect of an earlier one: release the stock, refund the card. Not a rollback: others may already have seen the first step.' },
		{ term: 'Choreography vs orchestration', def: 'Choreography: each service reacts to events, and nobody holds the whole plan. Orchestration: one service sends commands, tracks the replies and decides what is next.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['checkout["Checkout service"] -->|"1: commit the order"| db[("Orders database")]', 'checkout -.->|"2: publish, may fail"| kafka["Kafka"]', 'class kafka ext'],
				highlight: ['checkout', 'kafka'],
				note: '**The dual write.** Step 1 commits. Step 2 may fail, and nothing sends it again. Swap the order and you get the opposite bug: an event about an order that the database then refuses to save.'
			},
			{
				add: ['checkout -->|"same transaction"| outbox[("outbox table")]'],
				highlight: ['outbox'],
				note: '**The outbox.** The checkout inserts the order and an outbox row in **one** transaction. A rollback drops both. A commit keeps both. The checkout never talks to Kafka.'
			},
			{
				add: ['dbz["Debezium: outbox event router"] -->|"tails the write-ahead log"| outbox', 'dbz -->|"topic outbox.event.order, key = order id"| kafka', 'class dbz ext'],
				highlight: ['dbz'],
				note: '**The relay.** Debezium reads each committed insert from the database\'s log and turns it into a Kafka message. No polling, and no second write in the checkout. If it crashes, it resumes from its last recorded position, so some messages may go out twice.'
			},
			{
				add: ['kafka -->|"OrderPlaced"| stock["Stock: reserve items"]', 'stock -->|"StockReserved"| pay["Payment: charge card"]'],
				highlight: ['stock', 'pay'],
				note: '**A saga by choreography.** Placing an order is one process across three services. Nobody runs it: each service does its local transaction and publishes the next event, through its own outbox.'
			},
			{
				add: ['pay -->|"PaymentFailed"| release["Stock: release items"]', 'release -->|"StockReleased"| cancel["Checkout: cancel the order"]'],
				highlight: ['release', 'cancel'],
				note: '**Undo, and the order of steps.** A failed payment triggers compensating actions: release the stock, cancel the order. The card is charged **last**, because a refund is the hardest step to undo cleanly.'
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
			'This runs on every change Debezium reads from the outbox table. **The outbox is a queue of inserts.** A delete is skipped, so the service can clean up old rows without sending anything. An update is unexpected: by [default](https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterConfigDefinition.java#L230-L237) it is dropped with a warning.',
			'The row\'s `id` becomes the message\'s `id` header. The Debezium docs say what it is for: **"to remove duplicate messages"**. Debezium\'s FAQ is plain that after a crash, consumers may see some events more than once.',
			'The topic comes from `route.by.field` and the message key from `table.field.event.key`. Their [defaults](https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterConfigDefinition.java#L247-L327) are the `aggregatetype` and `aggregateid` columns, and the topic becomes `outbox.event.<aggregatetype>`. Same order id, same key, same Kafka partition: **events for one order stay in order.**',
			'What it does not do: start a transaction in your service. Your code still has to insert the outbox row in the same transaction as the change. Debezium only makes sure a committed row gets sent.'
		]
	},
	tradeoff: {
		gain: [
			'With an outbox, a committed change always has its event stored, even if the broker is down for an hour. The relay catches up.',
			'Choreography keeps services apart: Checkout does not know who reserves stock or takes payment. A new service subscribes, with no change upstream.',
			'Each saga step commits on its own, so no lock is held across services while a payment is pending.'
		],
		cost: [
			'**The outbox needs the message and the change in one database.** A service that writes to a store with no shared transaction, such as a remote API, still lives with the dual write.',
			'**The relay is a system to run, and after a crash it sends duplicates.** A polling job, or a Debezium connector with Kafka Connect, plus consumers that drop repeats by event id.',
			'**Nobody sees the whole saga.** With choreography, "where is order 42 stuck?" has no single owner. And a compensation can fail too, leaving a half-done process and a log line.'
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
		]
	},
	quiz: [
		{
			q: 'What makes a transactional outbox reliable?',
			options: ['The broker stores the message until the database confirms the commit', 'The relay publishes each message exactly once', 'The message is written to a table in the same database transaction as the change it describes', 'The service retries the publish in memory until it succeeds'],
			answer: 2,
			why: 'Change and message commit together, or neither does. Then the message can be sent later, as often as needed. The broker never joins the transaction, and the relay gives at-least-once, not exactly-once.'
		},
		{
			q: 'A relay publishes an outbox row, then crashes before it records how far it got. What happens next?',
			options: ['When the relay restarts, it publishes the row again, and the consumer must drop the repeat by its event id', 'The row is lost, because the progress was never recorded', 'The broker notices the duplicate and drops it', 'The database rolls back the publish'],
			answer: 0,
			why: 'The publish is outside the database, so nothing can undo it. The relay resumes from its last recorded point, so the row goes out again: at-least-once. A stable event id lets the consumer spot the repeat.'
		},
		{
			q: 'Debezium\'s outbox event router uses the `aggregateid` column as the Kafka message key by default. Why does that matter?',
			options: ['It encrypts the message for that aggregate', 'Kafka drops any second message with the same key', 'It makes the router skip deletes for that aggregate', 'Messages with the same key go to the same partition, so events for one order stay in order'],
			answer: 3,
			why: 'Kafka keeps order within a partition, and the key picks the partition. Kafka does not dedupe by key: that is what the `id` header is for.'
		}
	],
	takeaway: 'When a change must reach two systems, write the message where the change commits, let a relay send it at least once, and plan the undo for every saga step.',
	sources: [
		{ title: 'debezium/debezium, EventRouterDelegate.java', url: `${REPO}/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterDelegate.java#L96-L259` },
		{ title: 'Debezium documentation: Outbox Event Router', url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html' },
		{ title: 'Debezium FAQ: why consumers must expect duplicate events', url: 'https://debezium.io/documentation/faq/#why_must_consuming_applications_expect_duplicate_events' },
		{ title: 'Chris Richardson, microservices.io: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
		{ title: 'Chris Richardson, microservices.io: Saga', url: 'https://microservices.io/patterns/data/saga.html' }
	]
};
