/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'backpressure',
	part: 'Reliability',
	title: 'A queue that fills up',
	minutes: 10,
	hook: [
		'Every night at 2 a.m., 40 sellers on a marketplace push their price and stock changes through an API. Each change is a job in a queue. Workers take the jobs and write them into the search index.',
		'For 30 minutes, the sellers send 5 000 jobs per second. The workers finish 3 000. The queue gains 2 000 jobs every second, and a buyer at 2:30 a.m. still sees yesterday\'s price.',
		'Someone has to decide what happens to job number 5 000 in a second that only has room for 3 000. If nobody decides, the queue grows until the broker runs out of memory or disk.'
	],
	terms: [
		{ term: 'Backlog', def: 'The jobs waiting in the queue that no worker has taken yet.' },
		{ term: 'Backpressure', def: 'A signal from the consumer side back to the producer that says "send less", so the backlog stops growing.' },
		{ term: 'Publisher confirm', def: 'A RabbitMQ message from the broker to the producer that says whether it accepted a message (`basic.ack`) or refused it (`basic.nack`).' }
	],
	kata: {
		brief: [
			'Sellers call `POST /updates` on an API with one price or stock change. The API publishes it as a job of about 1 KB to a RabbitMQ queue. Ten workers each write 300 jobs per second into the search index.',
			'The search index takes at most 3 000 writes per second, so more workers do not help. During the nightly import, from 2:00 to 2:30, sellers send 5 000 jobs per second. The rest of the day they send 800.',
			'The target: a change is in the search index at most 15 minutes after the API accepts it. A change the API accepts must never be lost. The broker has 8 GB of disk free for this queue.',
			'Design what happens during the import: where jobs wait, when the API says no, and how sellers find out.'
		],
		minutes: 10,
		checklist: [
			'Your design says how many jobs wait in the queue at 2:30 if nothing is refused, and how many GB that is.',
			'Your design says the longest time a job waits before a worker takes it, and compares it with the 15-minute target.',
			'Your design puts a limit on the queue, in jobs or in bytes, and gives the number.',
			'Your design says what happens to the job that arrives when the queue is full, and whether the producer knows.',
			'Your design says how the API learns that the broker refused a job, and what the seller receives.',
			'Your design says when a refused seller retries, so the retries do not land in the same overloaded minute.',
			'Your design says how long the queue takes to empty after 2:30.'
		],
		sample: [
			'Without a limit, the queue gains 2 000 jobs per second for 1 800 seconds: 3.6 million jobs, about 3.6 GB. That fits on the disk. The last job waits 3.6 million / 3 000 = 1 200 seconds, 20 minutes. That breaks the 15-minute target.',
			'So the limit comes from the target: 15 minutes of work is 3 000 × 900 = 2.7 million jobs. The queue gets a policy with `max-length` 2 700 000, about 2.7 GB, under the 8 GB free. RabbitMQ counts only ready jobs, so the few jobs workers hold unacknowledged sit outside the limit.',
			'The policy sets `overflow` to `reject-publish`. The default, drop from the head, would delete the oldest accepted price changes without telling anyone. With `reject-publish` and publisher confirms on, RabbitMQ answers the new job with `basic.nack`, and the API knows the job is not stored.',
			'The API waits for the confirm before it answers the seller. On `basic.ack` it returns `202 Accepted`. On `basic.nack` it returns `503 Service Unavailable` with `Retry-After: 1800`, so the retry comes after the import. The seller\'s integration sees the 503 and waits 30 minutes before it sends that change again.',
			'The queue fills after 2.7 million / 2 000 = 1 350 seconds, at about 2:22. For the last 450 seconds, the API refuses 2 000 jobs per second: 900 000 jobs. Sellers whose integration does not retry lose those changes until their next import.',
			'After 2:30, 800 jobs arrive per second and 3 000 leave, so the queue shrinks by 2 200 per second. The 2.7 million jobs are gone in about 1 230 seconds, so the queue is empty near 2:51. The retries arrive from 2:52 to 3:00, at 2 000 per second plus the usual 800. The workers finish 3 000 per second, so those 2 800 do not build a new backlog.',
			'The cost of this design: from 2:22 to 2:30, sellers get errors and must retry. Their changes reach the search index about 30 minutes later than if they had been accepted. The 2.7 million accepted jobs all meet the 15-minute target.'
		]
	},
	quiz: [],
	recall: {
		q: 'How do you size the queue limit when producers send 5 000 jobs per second, workers finish 3 000, and the target is 15 minutes?',
		a: 'Take 15 minutes of worker capacity: 3 000 × 900 = 2.7 million jobs. Beyond that, RabbitMQ `reject-publish` sends `basic.nack` and the API returns 503 with `Retry-After`.'
	},
	sources: [
		{ title: 'RabbitMQ docs: Queue Length Limit', url: 'https://github.com/rabbitmq/rabbitmq-website/blob/302cc25ab3383e80a6a32795a22d00de79b53c3c/docs/maxlength/index.md' },
		{ title: 'Amazon Builders\' Library: Avoiding insurmountable queue backlogs', url: 'https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/' },
		{ title: 'RFC 9110: 503 Service Unavailable', url: 'https://www.rfc-editor.org/rfc/rfc9110#name-503-service-unavailable' }
	]
};
