const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const SIDEKIQ = 'https://github.com/sidekiq/sidekiq/blob/1bb4aa06e5aa178a114a5e855f9f3d5c24f6c61b';
const PSS = `${REPO}/app/services/post_status_service.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'failure',
	part: 'Between services',
	title: 'Failure: timeouts, retries, idempotency',
	minutes: 10,
	hook: [
		'You are on a train. You tap Publish in your Mastodon app. The spinner turns, the signal drops, and after a while the app gives up.',
		'Now the hard question: **did the post go through?** Maybe the request never arrived. Maybe the server saved it and the answer got lost. From the phone, the two look exactly the same.',
		'So the app will try again. A retry is only safe if doing the work twice gives the same result as doing it once. That property has a name, **idempotency**, and without it every retry risks a second copy of your post.'
	],
	terms: [
		{ term: 'Timeout', def: 'How long you wait before giving up. It frees you. It tells you nothing about what happened on the other side.' },
		{ term: 'Retry with backoff', def: 'Try again, waiting longer after each failure, so a struggling service gets room to recover.' },
		{ term: 'Jitter', def: 'A random bit added to each wait, so a thousand clients that failed together do not all retry in the same second.' },
		{ term: 'Idempotent', def: 'Doing it twice has the same effect as doing it once. "Set status to deleted" is. "Add 10 € to the balance" is not.' },
		{ term: 'Idempotency key', def: 'A unique value the client sends with a request, and sends again with every retry of it, so the server can spot the repeat.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app(["Phone app"]) -->|"POST /api/v1/statuses, Idempotency-Key: k1"| api["Mastodon API"]'],
				highlight: ['app', 'api'],
				note: 'The client picks a key **once per post**, and sends the same key on every retry. Mastodon\'s API docs: "Consider using a hash or UUID generated client-side."'
			},
			{
				add: ['api -->|"lock, then look up k1"| redis[("Redis")]'],
				highlight: ['redis'],
				note: 'First request: save the post, then store its id under the key for **one hour**. A retry with the same key finds the id and gets the **same post** back. No second copy, and no second delivery.'
			},
			{
				add: ['deliv["DeliveryWorker"] -->|"connect 5 s, each read 10 s, all reads 30 s"| remote["Remote server inbox"]', 'class remote ext'],
				highlight: ['deliv', 'remote'],
				note: '**Every outbound call gets a timeout.** Mastodon\'s `Request` class passes the same [`TIMEOUT`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/request.rb#L83-L86) settings with each request it makes. Without them, one hung server could hold a worker for a very long time.'
			},
			{
				add: ['deliv -->|"failed: wait count⁴ + 15 s + jitter"| retry["Sidekiq retry set"]', 'retry -->|"try again"| deliv'],
				highlight: ['retry'],
				note: '**Backoff with jitter.** Sidekiq\'s base wait grows with the fourth power of the retry count. Mastodon adds its own jitter on top. **Retries are for failures that can heal**: most 4xx answers are not retried at all.'
			},
			{
				add: ['remote --> create["Remote side: lock on the post URI, skip if it exists"]'],
				highlight: ['create'],
				note: 'The receiver is idempotent too. A delivery that is retried after it actually worked finds the post by its URI and **does not create it again**.'
			}
		]
	},
	example: {
		title: 'app/services/post_status_service.rb, with_idempotency',
		repo: 'mastodon/mastodon',
		url: `${PSS}#L226-L256`,
		lang: 'ruby',
		code: `  def idempotency_key
    "idempotency:status:#{@account.id}:#{@options[:idempotency]}"
  end
…
  def idempotency_duplicate?
    @idempotency_duplicate = redis.get(idempotency_key)
  end

  def with_idempotency
    return yield unless idempotency_given?

    with_redis_lock("idempotency:lock:status:#{@account.id}:#{@options[:idempotency]}") do
      raise IdempotencyError, idempotency_duplicate if idempotency_duplicate?

      yield

      redis.setex(idempotency_key, 3_600, @status.id)
    end
  end`,
		notes: [
			'**Idempotency style 1: remember what you did.** The key is scoped to the account, so two users cannot collide. A duplicate raises `IdempotencyError` carrying the old post, and [`call` returns that post](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/services/post_status_service.rb#L60-L78) without queuing new jobs.',
			'The lock matters. Two copies of the request at the same moment would both miss the key and both save. With the lock, the second one gets a [503 "please try again"](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/concerns/api/error_handling.rb#L40-L42) and its retry finds the key.',
			'**Style 2: skip what already exists.** The receiving server [takes a lock on the post\'s URI and looks for an existing status](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/activitypub/activity/create.rb#L30-L38) before it creates one. The URI is the natural key.',
			'Which failures are retried: [`response_error_unsalvageable?`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379) is true for 501 and for 4xx except 401, 408 and 429. Those jobs end without a retry. Timeouts and 5xx raise and are retried with [Mastodon\'s jitter](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/delivery_worker.rb#L13-L21).'
		]
	},
	tradeoff: {
		gain: [
			'Timeouts turn a hung server into a clear failure, and free the worker for the next job.',
			'Retries absorb short outages: a restart, a network blip, a deploy. Backoff and jitter spread them out, so a recovering server is not met by a wall of traffic.',
			'With idempotent handlers on both sides, "deliver at least once" is good enough. You stop chasing exactly once.'
		],
		cost: [
			'**A timeout does not cancel the work.** The other side may still finish it. Plan for "it happened, I just did not hear".',
			'**Retries multiply load.** The Amazon Builders\' Library example: five layers that each try three times put **243 times** the load on the database. Their advice for cheap calls: retry at a single point in the stack.',
			'**Idempotency costs design.** A key needs storage, a lock and an expiry. Mastodon\'s key lives one hour: a retry after that creates a second post. And if the process dies after the save but before the key is written, a retry still makes a duplicate.'
		]
	},
	task: {
		prompt: 'Your SaaS invoicing app sends a "payment received" email when the payment provider calls your webhook. The provider retries when your endpoint is slow, and customers get two emails. Make the handler idempotent. What do you store, and what is its key?',
		hint: 'Is there a stable id in the webhook that stays the same on every retry? If you cannot ask the mail server "did I already send this?", you must remember it yourself.',
		answer: [
			'Key on something stable that every retry repeats: the provider\'s event id, or the payment id. Not a random id you generate on receipt: each retry would get a new one.',
			'Store a row like `(event_id, processed_at)` with a **unique constraint**. Insert first. If the insert fails as a duplicate, answer 200 and do nothing.',
			'Answer the webhook fast, and send the email from a job. A slow endpoint is what triggers the provider\'s retries in the first place.',
			'Order still matters: insert, then send. A crash between the two loses one email. Decide which is worse for you: a missing email or a duplicate one.',
			'Keep the rows longer than the provider\'s retry window, or a late retry slips past.'
		]
	},
	quiz: [
		{
			q: 'A call to charge a card times out. What do you know about the charge?',
			options: ['Nothing: it may or may not have happened, so a retry must be safe either way', 'It failed, so retrying is safe', 'It succeeded, the answer was just slow', 'It will be rolled back by the server'],
			answer: 0,
			why: 'A timeout only frees the caller. The work may have been done, half done or never started. That is why the retry has to be idempotent.'
		},
		{
			q: 'Why does Mastodon add a random amount to each retry delay of a delivery job?',
			options: ['To make tests less predictable', 'Because Redis timers are not precise', 'So deliveries that failed at the same moment do not all retry at the same moment', 'To make the delay grow after each failure'],
			answer: 2,
			why: 'That is jitter. The growth is the backoff. The randomness spreads the crowd out, so a server coming back up is not hit by synchronized waves.'
		},
		{
			q: 'A client sends a new post with `Idempotency-Key: k1`, times out, and sends it again with `k1` ten minutes later. What does Mastodon do?',
			options: ['Creates a second post, since the first request timed out', 'Rejects the retry with a 409 error', 'Queues the retry until the first request finishes', 'Returns the post created by the first request'],
			answer: 3,
			why: 'The first request stored the post id under the key for an hour. The retry finds it and gets the same post back, without a second save or delivery.'
		}
	],
	takeaway: 'Every retry assumes the work can be done twice. Make it idempotent first, then add timeouts, backoff with jitter, and a limit on retries.',
	sources: [
		{ title: 'Mastodon API docs, Post a new status (Idempotency-Key)', url: 'https://docs.joinmastodon.org/methods/statuses/' },
		{ title: 'Mastodon, post_status_service.rb, with_idempotency', url: `${PSS}#L226-L256` },
		{ title: 'Sidekiq 8.1.7, job_retry.rb, default delay and jitter', url: `${SIDEKIQ}/lib/sidekiq/job_retry.rb#L200-L248` },
		{ title: 'Marc Brooker, Timeouts, retries, and backoff with jitter (Amazon Builders\' Library)', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
		{ title: 'Stripe API reference, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' }
	]
};
