const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'messaging',
	part: 'The pattern toolbox',
	title: 'Messaging: queues, delivery guarantees and dead letters',
	minutes: 10,
	hook: [
		'Your online shop publishes an `OrderPaid` message. The stock service fails on it five times, and the broker moves it to a dead-letter queue. Someone on call sees 40 messages there and wants to push them all back.',
		'Wait. One of them is a `PriceChanged` from last week. **Replayed today, it puts back a price that was changed twice since.** Another is an `OrderPaid` that half succeeded: replay it and the stock drops twice.',
		'So a broker is not just a pipe. It makes four choices for you: **who gets a copy**, **how many times**, **in what order**, and **where the failures go**. Today, those four choices and what each one costs.'
	],
	terms: [
		{ term: 'Exchange and queue', def: 'In RabbitMQ, an exchange stores nothing. It routes each message to the queues whose binding matches it, and a fanout exchange copies it into every bound queue. A queue holds messages until a consumer takes them.' },
		{ term: 'Competing consumers', def: 'Several consumers on one queue. Each message goes to only one of them. You get throughput, and you lose order.' },
		{ term: 'At-most-once', def: 'A message may be lost, but never arrives twice. You get it by removing the message before the work, or by never retrying.' },
		{ term: 'At-least-once', def: 'A message is never lost once the broker accepts it, but may arrive twice. The consumer confirms only after the work is done, and dedupes.' },
		{ term: 'Poison message', def: 'A message that fails every time, whatever you retry: bad data, a bug, a missing field. Left in the queue, it blocks it or loops forever.' },
		{ term: 'Dead-letter queue (DLQ)', def: 'Where failed messages go. Treat it as a to-do list for a person, not a bin: someone must be alerted, read it, and decide per message.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["New post"] --> dist["DistributionWorker"]', 'dist -->|"one job per follower inbox"| push["Sidekiq queue: push"]', 'class push ext'],
				highlight: ['dist', 'push'],
				note: '**Who gets a copy.** In Mastodon, a new post becomes one delivery job per remote inbox. Each server gets its own copy, so a slow server only slows its own job, not everyone else\'s.'
			},
			{
				add: ['push -->|"many threads compete"| workers["DeliveryWorker threads"]', 'workers -->|"POST"| inboxA["server A inbox"]', 'workers -->|"POST"| inboxB["server B inbox"]', 'class inboxA,inboxB ext'],
				highlight: ['workers', 'inboxA', 'inboxB'],
				note: '**In what order.** Several worker threads take jobs from the same queue. These are competing consumers: fast, but two jobs for the same inbox can finish in any order.'
			},
			{
				add: ['workers -.->|"5xx or timeout"| retry["Sidekiq retry set"]', 'retry -.->|"after a backoff"| push'],
				highlight: ['retry'],
				note: '**How many times.** A failed delivery goes to the retry set and comes back after a growing delay, up to 16 times. A 4xx answer like 404 is treated as hopeless and never retried. So a job can run more than once, and **a crash in the middle can lose it**.'
			},
			{
				add: ['retry -.->|"16 retries used, dead: false"| bin["discarded"]', 'workers -->|"record the failure day"| tracker["DeliveryFailureTracker"]', 'tracker -->|"failures on 7 days"| unavail["domain marked unavailable"]'],
				highlight: ['bin', 'tracker', 'unavail'],
				note: '**Where failures go.** No dead set here, on purpose. After the last retry the job is dropped. Instead, Mastodon counts the days a domain failed. After 7, it stops sending there until that server sends Mastodon a signed activity again.'
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
			'This job sends one post to one remote inbox. The fan-out happens before it: [`push_bulk` queues one job per follower inbox](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/raw_distribution_worker.rb#L25-L31).',
			'**Only a raised error is retried.** A 2xx sets `@performed`. A 501, or a 4xx other than 401, 408 and 429, is [unsalvageable](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379): the job ends quietly, with no retry. Everything else raises, and Sidekiq retries it with the [backoff defined at the top of the class](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/delivery_worker.rb#L13-L21). That is poison detection by status code.',
			'`dead: false` means that after the 16th retry, Sidekiq [discards the job instead of moving it to the Dead set](https://github.com/sidekiq/sidekiq/blob/676ed276f39e0486b6436ff47fec3fa14092c283/lib/sidekiq/job_retry.rb#L264-L270). No person will ever read it. That is a fair choice for a post to a server that has been gone for days.',
			'The failure path still leaves a trace. Each failed attempt adds today\'s date to a Redis set for the domain. At [7 distinct days](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/delivery_failure_tracker.rb#L102-L113), the domain is marked unavailable, and `perform` skips it from then on. It is cleared when that server [next posts a signed activity to Mastodon\'s inbox](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/activitypub/inboxes_controller.rb#L71-L78).'
		]
	},
	tradeoff: {
		gain: [
			'Fan-out, one copy per consumer: a slow or dead consumer only delays its own copy.',
			'Retries with backoff: a short outage on the other side heals itself, with no one paged.',
			'A DLQ takes the poison message out of the way, so one bad message does not stop the rest.'
		],
		cost: [
			'**Order costs throughput.** Competing consumers finish in any order. Keeping a queue in order means one consumer on it, and one stuck message holds up the whole queue behind it.',
			'**Retries mean duplicates.** A job that half succeeded runs again. Every consumer needs a dedupe key, or work that is safe to repeat.',
			'**A DLQ needs an owner.** An alert, a runbook per message type, and a way to replay. If no one will read it, dropping on purpose, like Mastodon does, is more honest.'
		]
	},
	task: {
		prompt: 'Monday morning, the stock service\'s DLQ holds 40 messages: 37 `OrderPaid` and 3 `PriceChanged`. A teammate wants to push all 40 back into the main queue. Write what you do for each kind, and what you set up so you hear about it before Monday next time.',
		hint: 'Ask, per kind: is applying it twice safe? Could an old message undo a newer truth?',
		answer: [
			'`PriceChanged`: do not replay. An old price would overwrite a newer one. Read the current price from the catalog\'s source of truth instead, then drop them.',
			'`OrderPaid`: find the cause in the logs first and fix it. Then replay, but only if the handler dedupes on the message id, or you check which orders already removed their stock.',
			'Never shovel a DLQ blindly. Decide per message type, and write that decision down where the person on call will find it.',
			'Set up an alert on the DLQ\'s depth. A DLQ nobody watches is where work goes to be forgotten.'
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
			why: 'One consumer taking one message at a time keeps the queue\'s order. The price is throughput, and a stuck message blocks the queue until it succeeds or is dead-lettered.'
		},
		{
			q: 'Mastodon\'s delivery job sets `retry: 16, dead: false` in Sidekiq. What happens to a delivery that fails all 16 retries?',
			options: ['It is discarded; no one will review it', 'It moves to the Dead set for a person to retry', 'It goes back to the queue and retries forever', 'Sidekiq sends it to the next follower\'s server instead'],
			answer: 0,
			why: 'Without `dead: false`, Sidekiq would move it to the Dead set. With it, the job is dropped. Mastodon tracks failing domains another way, by counting the days they failed.'
		}
	],
	takeaway: 'For every queue, decide who gets a copy, how many times, in what order, and who reads the dead letters, before the first message is sent.',
	sources: [
		{ title: 'mastodon/mastodon, app/workers/activitypub/delivery_worker.rb', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L1-L100` },
		{ title: 'Sidekiq wiki, Error Handling: retries and the Dead set', url: 'https://github.com/sidekiq/sidekiq/wiki/Error-Handling' },
		{ title: 'Sidekiq wiki, Reliability: a crash mid-job loses the job', url: 'https://github.com/sidekiq/sidekiq/wiki/Reliability' },
		{ title: 'RabbitMQ, Exchanges', url: 'https://www.rabbitmq.com/docs/exchanges' },
		{ title: 'RabbitMQ, Dead letter exchanges', url: 'https://www.rabbitmq.com/docs/dlx' },
		{ title: 'Hohpe and Woolf, Enterprise Integration Patterns: Dead Letter Channel', url: 'https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html' }
	]
};
