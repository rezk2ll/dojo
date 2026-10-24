const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'messaging',
	part: 'The pattern toolbox',
	title: 'Messaging: queues, delivery guarantees and dead letters',
	minutes: 10,
	hook: [
		'Your online shop publishes an `OrderPaid` message. The stock service fails on it five times, and the broker moves it to a dead-letter queue. Someone on call sees 40 messages there and wants to push them all back.',
		'One of them is a `PriceChanged` from last week. **Replayed today, it puts back a price that was changed twice since.** Another is an `OrderPaid` that half succeeded: replay it and the stock drops twice.',
		'Every queue setup answers four questions: who gets a copy, how many times, in what order, and where the failures go. Each answer has a cost, and the 40 messages in that queue show two of them.'
	],
	terms: [
		{ term: 'Competing consumers', def: 'Several consumers read from one queue, and each message goes to only one of them. More consumers handle more messages per second, but messages can finish out of order.' },
		{ term: 'At-least-once', def: 'A message is never lost once the broker accepts it, but may arrive twice. The consumer confirms only after the work is done, and dedupes.' },
		{ term: 'Poison message', def: 'A message that fails on every retry, because of bad data, a bug or a missing field. Left in the queue, it blocks it or loops forever.' },
		{ term: 'Dead-letter queue (DLQ)', def: 'The queue where the broker puts messages that failed too many times. Someone must get an alert, read each message, and decide what to do with it.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["New post"] --> dist["DistributionWorker"]', 'dist -->|"one job per follower inbox"| push["Sidekiq queue: push"]', 'class push ext'],
				highlight: ['dist', 'push'],
				note: 'Who gets a copy: for each new post, Mastodon queues one delivery job per remote inbox. A slow server only delays the job that targets it.'
			},
			{
				add: ['push -->|"many threads compete"| workers["DeliveryWorker threads"]', 'workers -->|"POST"| inboxA["server A inbox"]', 'workers -->|"POST"| inboxB["server B inbox"]', 'class inboxA,inboxB ext'],
				highlight: ['workers', 'inboxA', 'inboxB'],
				note: 'In what order: several worker threads take jobs from the same `push` queue. These competing consumers deliver many posts at once, and two jobs for the same inbox can finish in any order.'
			},
			{
				add: ['workers -.->|"5xx or timeout"| retry["Sidekiq retry set"]', 'retry -.->|"after a backoff"| push'],
				highlight: ['retry'],
				note: 'How many times: a failed delivery goes to the retry set and comes back after a growing delay, up to 16 times. Mastodon never retries a 4xx answer like 404. So a job can run more than once, and **a crash in the middle can lose it**.'
			},
			{
				add: ['retry -.->|"16 retries used, dead: false"| bin["discarded"]', 'workers -->|"record the failure day"| tracker["DeliveryFailureTracker"]', 'tracker -->|"failures on 7 days"| unavail["domain marked unavailable"]'],
				highlight: ['bin', 'tracker', 'unavail'],
				note: 'Where failures go: Mastodon keeps no Dead set, on purpose, so Sidekiq drops the job after the last retry. Mastodon counts the days a domain failed instead. After 7, it stops sending there until that server sends Mastodon a signed activity again.'
			}
		]
	},
	example: {
		title: 'app/workers/activitypub/delivery_worker.rb',
		repo: 'mastodon/mastodon',
		url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L11-L75`,
		lang: 'ruby',
		code: `  sidekiq_options queue: 'push', retry: 16, dead: false
…
  def perform(json, source_account_id, inbox_url, options = {})
    @options        = options.with_indifferent_access

    return unless @options[:bypass_availability] || DeliveryFailureTracker.available?(inbox_url)
…
    perform_request
  ensure
    if @inbox_url.present?
      if @performed
        failure_tracker.track_success!
      elsif !@unsalvageable
        failure_tracker.track_failure!
      end
    end
  end
…
  def perform_request
    stoplight_wrapper.run do
      request_pool.with(@host) do |http_client|
        build_request(http_client).perform do |response|
          if response_successful?(response)
            @performed = true
          elsif response_error_unsalvageable?(response) || unsalvageable_authorization_failure?(response)
            @unsalvageable = true
          else
            raise Mastodon::UnexpectedResponseError, response
          end
        end
      end
    end
  end`,
		notes: [
			'Line 3 starts a job that sends one post to one remote inbox. The fan-out happens before it: [`push_bulk` queues one job per follower inbox](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/raw_distribution_worker.rb#L25-L31).',
			'Lines 23 to 28 decide which responses Sidekiq retries. A 2xx sets `@performed`. A 501, or a 4xx other than 401, 408 and 429, is [unsalvageable](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379): Mastodon treats it as a poison message and ends the job with no retry. Everything else raises on line 28, and Sidekiq retries it with the backoff defined at the top of the class.',
			'Line 1 sets `dead: false`, so after the 16th retry Sidekiq [discards the job instead of moving it to the Dead set](https://github.com/sidekiq/sidekiq/blob/676ed276f39e0486b6436ff47fec3fa14092c283/lib/sidekiq/job_retry.rb#L264-L270). No person reads the failed delivery. Mastodon accepts losing a post to a server that has been gone for days.',
			'Lines 9 to 16 record each attempt. A failed attempt adds today\'s date to a Redis set for the domain. At [7 distinct days](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/delivery_failure_tracker.rb#L102-L113), the domain is marked unavailable, and line 6 skips it from then on. The mark is cleared when that server next posts a signed activity to Mastodon\'s inbox.'
		]
	},
	tradeoff: {
		gain: [
			'Fan-out gives each remote server its own delivery job, so a slow or dead server only delays its own copy.',
			'Sidekiq retries a failed delivery up to 16 times with a growing delay, so a server that is down for a short time still gets the post, and nobody is paged.',
			'A DLQ moves a poison message out of the queue, so the messages behind it keep flowing.'
		],
		cost: [
			'Competing consumers finish in any order. To keep order, a queue needs a single consumer, and then one stuck message holds up every message behind it.',
			'Retries cause duplicates: a job that half succeeded runs again. Every consumer needs a dedupe key, or work that is safe to repeat.',
			'A DLQ needs an alert, a runbook per message type, and a way to replay. Mastodon has no one to read failed deliveries, so it drops them after 16 retries instead.'
		]
	},
	task: {
		prompt: 'Monday morning, the stock service\'s DLQ holds 40 messages: 37 `OrderPaid` and 3 `PriceChanged`. A teammate wants to push all 40 back into the main queue. Write what you do for each kind, and what you set up so you hear about it before Monday next time.',
		hint: 'Ask, per kind: is applying it twice safe? Could an old message undo a newer truth?',
		answer: [
			'`PriceChanged`: do not replay. An old price would overwrite a newer one. Read the current price from the catalog\'s source of truth instead, then drop them.',
			'`OrderPaid`: find the cause in the logs first and fix it. Then replay, but only if the handler dedupes on the message id, or you check which orders already removed their stock.',
			'Decide per message type, never for the whole DLQ at once, and write that decision down where the person on call will find it.',
			'Set up an alert on the DLQ\'s depth, so the person on call hears about the first dead message on the day it lands, not on Monday.'
		],
		steps: [
			{
				title: 'Read what is in the DLQ',
				questions: [
					{ q: 'The teammate wants to push all 40 back at once. What is wrong with that?', options: ['The broker cannot replay more than 10 at a time', 'Each message type needs its own decision', 'Replaying from a DLQ is never allowed', 'Nothing: replaying is safe for every message'], answer: 1, why: 'A replay that is safe for one type can undo the truth for another.' },
					{ q: 'Which questions do you ask for each kind of message?', options: ['Is it safe to apply twice? Could an old one undo a newer truth?', 'Which consumer thread handled it?', 'How large is each message?', 'Who wrote the handler?'], answer: 0, why: 'Duplicates and stale data are the two ways a replay goes wrong.' },
					{ q: 'Why did these messages land in the DLQ?', options: ['They were handled and confirmed', 'The main queue was full', 'They failed too many times, so the broker moved them', 'Someone moved them there by hand'], answer: 2, why: 'The broker puts a message in the DLQ after too many failed tries.' },
					{ q: 'A message fails on every retry because of bad data. What is it called?', options: ['A duplicate', 'A competing consumer', 'A dead letter in transit', 'A poison message'], answer: 3, why: 'A poison message fails every time. The DLQ moves it out so the messages behind it keep flowing.' }
				]
			},
			{
				title: 'Decide for PriceChanged',
				questions: [
					{ q: 'You replay a `PriceChanged` from last week. What happens?', options: ['It puts back a price that was changed twice since', 'Nothing: a price update is safe to repeat', 'The broker refuses an old message', 'It confirms the current price'], answer: 0, why: 'The old message carries an old price, and it overwrites the newer one.' },
					{ q: 'So what do you do with the 3 `PriceChanged`?', options: ['Replay them in the order they arrived', 'Do not replay: read the current price from the catalog\'s source of truth, then drop them', 'Replay them twice to be sure', 'Leave them in the DLQ for good'], answer: 1, why: 'The catalog knows today\'s price. The messages only know last week\'s.' },
					{ q: 'The stock handler dedupes on the message id. Does that make replaying `PriceChanged` safe?', options: ['Yes: dedupe stops every replay problem', 'Yes, if you replay them in order', 'No: it was never applied, so dedupe lets it through, and it is still old', 'No: price messages have no id'], answer: 2, why: 'Dedupe stops a second copy. It does nothing about a first copy that arrives too late.' },
					{ q: 'Which of the two risks from the hint is this?', options: ['Applying it twice', 'An old message undoing a newer truth', 'Losing the message forever', 'Blocking the queue'], answer: 1, why: 'The price is not doubled, it goes back in time.' }
				]
			},
			{
				title: 'Decide for OrderPaid',
				questions: [
					{ q: 'What do you do first with the 37 `OrderPaid`?', options: ['Find the cause in the logs and fix it', 'Replay them right away', 'Drop them all', 'Move them to a second DLQ'], answer: 0, why: 'Replaying before the fix sends them straight back to the DLQ.' },
					{ q: 'Why can replaying an `OrderPaid` hurt?', options: ['It refunds the customer', 'It changes the price', 'It blocks the queue for good', 'One that half succeeded would drop the stock twice'], answer: 3, why: 'A message that failed halfway already did part of its work.' },
					{ q: 'When is replaying them safe?', options: ['When you replay them at night', 'When the handler dedupes on the message id, or you check which orders already removed their stock', 'When you replay one per minute', 'When fewer than 50 messages are waiting'], answer: 1, why: 'Either the handler skips repeats, or you skip them yourself before the replay.' },
					{ q: 'Which delivery guarantee makes that dedupe necessary?', options: ['At-most-once', 'Exactly-once', 'At-least-once', 'Best effort'], answer: 2, why: 'At-least-once never loses a message, but may deliver it twice. The consumer dedupes.' }
				]
			},
			{
				title: 'Hear about it sooner',
				questions: [
					{ q: 'What do you set up so you hear about it before Monday?', options: ['A weekly review of the DLQ', 'More retries before the DLQ', 'An alert on the DLQ\'s depth', 'A larger DLQ'], answer: 2, why: 'An alert on depth fires on the first dead message.' },
					{ q: 'When should the person on call hear about the first dead message?', options: ['On the day it lands', 'On Monday morning', 'When the DLQ is full', 'At the end of the month'], answer: 0, why: 'The sooner someone looks, the fewer messages pile up behind the same cause.' },
					{ q: 'Where do you write the per-type decision?', options: ['In a private note', 'Where the person on call will find it', 'Only in a commit message', 'Nowhere: it is obvious'], answer: 1, why: 'The next person on call faces the same 40 messages and needs the same answer.' },
					{ q: 'Besides the alert, what else does a DLQ need?', options: ['A second broker', 'A larger disk', 'A single consumer', 'A runbook per message type, and a way to replay'], answer: 3, why: 'A DLQ nobody reads just stores the problem. Mastodon has no one to read failed deliveries, so it drops them instead.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Three services each need every `OrderPaid` message. How does a RabbitMQ setup give each one a copy?',
			options: ['They all consume the same queue, and RabbitMQ delivers every message to each of the three consumers', 'Each service binds its own queue to a fanout exchange, which copies the message into every bound queue', 'The producer publishes the message three times, once per service, with that service\'s routing key', 'The first service to finish the message acks it and forwards a copy to the next service in line'],
			answer: 1,
			why: 'A fanout exchange copies a message into every bound queue. Consumers on one queue compete: each message goes to only one of them, so three services sharing a queue would each see a third.'
		},
		{
			q: 'A queue has a single active consumer that takes one message at a time. What does that buy, and what does it cost?',
			options: ['Each message is delivered exactly once; it needs a second broker for failover', 'Faster processing; messages may now arrive out of order', 'No dead letters ever; failing messages are retried forever instead', 'Messages are handled in queue order; one slow or failing message holds up everything behind it'],
			answer: 3,
			why: 'One consumer taking one message at a time keeps the queue\'s order. It also handles fewer messages per second, and a stuck message blocks the queue until it succeeds or is dead-lettered.'
		},
		{
			q: 'Mastodon\'s delivery job sets `retry: 16, dead: false` in Sidekiq. What happens to a delivery that fails all 16 retries?',
			options: ['It is discarded; no one will review it', 'It moves to the Dead set for a person to retry', 'It goes back to the queue and retries forever', 'Sidekiq sends it to the next follower\'s server instead'],
			answer: 0,
			why: 'Without `dead: false`, Sidekiq would move it to the Dead set. With it, Sidekiq discards the job. Mastodon tracks failing domains another way, by counting the days they failed.'
		}
	],
	recall: {
		q: 'Which four questions does every queue setup answer, and what does Mastodon\'s delivery job do with a delivery that fails every retry?',
		a: 'Who gets a copy, how many times, in what order, and where the failures go. Mastodon retries 16 times, then discards the job (`dead: false`) and marks the domain unavailable after 7 days of failures.'
	},
	sources: [
		{ title: 'mastodon/mastodon, app/workers/activitypub/delivery_worker.rb', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L1-L100` },
		{ title: 'mastodon/mastodon, inboxes_controller.rb: a signed activity clears the unavailable mark', url: `${REPO}/app/controllers/activitypub/inboxes_controller.rb#L71-L78` },
		{ title: 'Sidekiq wiki, Error Handling: retries and the Dead set', url: 'https://github.com/sidekiq/sidekiq/wiki/Error-Handling' },
		{ title: 'Sidekiq wiki, Reliability: a crash mid-job loses the job', url: 'https://github.com/sidekiq/sidekiq/wiki/Reliability' },
		{ title: 'RabbitMQ, Exchanges', url: 'https://www.rabbitmq.com/docs/exchanges' },
		{ title: 'RabbitMQ, Dead letter exchanges', url: 'https://www.rabbitmq.com/docs/dlx' },
		{ title: 'Hohpe and Woolf, Enterprise Integration Patterns: Dead Letter Channel', url: 'https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html' }
	]
};
