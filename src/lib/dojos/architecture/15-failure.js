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
		'You are on a train, and you tap Publish in your Mastodon app. The spinner turns, the signal drops, and after a while the app gives up.',
		'Now the hard question: **did the post go through?** Maybe the request never arrived. Maybe the server saved it and the answer got lost. From the phone, the two look exactly the same.',
		'So the app will try again. A retry is only safe if doing the work twice gives the same result as doing it once. That property has a name, **idempotency**, and without it every retry risks a second copy of your post.'
	],
	terms: [
		{ term: 'Timeout', def: 'How long you wait before giving up. It frees you. It tells you nothing about what happened on the other side.' },
		{ term: 'Retry with backoff', def: 'Try again, waiting longer after each failure, so a struggling service gets room to recover. Jitter adds a random bit to each wait, so a thousand clients that failed together do not all retry in the same second.' },
		{ term: 'Idempotent', def: 'Doing it twice has the same effect as doing it once. Setting a status to deleted twice leaves it deleted. Adding 10 € to a balance twice adds 20 €.' },
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
				note: 'First request: save the post, then store its id under the key for one hour. A retry with the same key finds the id and gets the **same post** back. No second copy, and no second delivery.'
			},
			{
				add: ['deliv["DeliveryWorker"] -->|"connect 5 s, each read 10 s, all reads 30 s"| remote["Remote server inbox"]', 'class remote ext'],
				highlight: ['deliv', 'remote'],
				note: 'Mastodon\'s `Request` class gives **every outbound call a timeout**: it passes the same [`TIMEOUT`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/request.rb#L83-L86) settings with each request it makes. Without them, one hung server could hold a worker for a very long time.'
			},
			{
				add: ['deliv -->|"failed: wait count⁴ + 15 s + jitter"| retry["Sidekiq retry set"]', 'retry -->|"try again"| deliv'],
				highlight: ['retry'],
				note: 'Sidekiq\'s base wait grows with the fourth power of the retry count, and Mastodon adds its own jitter on top. Retries are only for failures that may go away on their own: **most 4xx answers are not retried at all**.'
			},
			{
				add: ['remote --> create["Remote side: lock on the post URI, skip if it exists"]'],
				highlight: ['create'],
				note: 'The receiving server also handles a repeat safely. A delivery that is retried after it actually worked finds the post by its URI and **does not create it again**.'
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
			'Here Mastodon remembers what it did. Line 2 scopes the key to the account, so two users cannot collide. On a duplicate, line 13 raises `IdempotencyError` carrying the old post, and [`call` returns that post](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/services/post_status_service.rb#L60-L78) without queuing new jobs.',
			'Line 12 takes a lock. Without it, two copies of the request at the same moment would both miss the key and both save. With the lock, the second one gets a [503 "please try again"](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/concerns/api/error_handling.rb#L40-L42) and its retry finds the key.',
			'The receiving server skips what already exists. It [takes a lock on the post\'s URI and looks for an existing status](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/activitypub/activity/create.rb#L30-L38) before it creates one, so the post URI works as the idempotency key.',
			'Which failures are retried: [`response_error_unsalvageable?`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379) is true for 501 and for 4xx except 401, 408 and 429. Those jobs end without a retry. Timeouts and 5xx raise and are retried with Mastodon\'s jitter (`DeliveryWorker`, in the sources).'
		]
	},
	tradeoff: {
		gain: [
			'With a timeout, a hung server produces an error instead of holding the worker, and the worker moves on to the next job.',
			'Retries cover short outages: a restart, a network blip, a deploy. Backoff and jitter spread the retries out, so a server that comes back up does not get them all in the same second.',
			'With idempotent handlers on both sides, a delivery that arrives twice still creates one post. The sender can then deliver "at least once" and skip the harder "exactly once".'
		],
		cost: [
			'A timeout does not cancel the work, and the other side may still finish it. Plan for the case where the work happened and you never got the answer.',
			'In the Amazon Builders\' Library example, five layers that each try three times put **243 times** the load on the database. Their advice for cheap calls: retry at a single point in the stack.',
			'An idempotency key needs storage, a lock and an expiry. Mastodon\'s key lives one hour: a retry after that creates a second post. If the process dies after the save but before the key is written, a retry also makes a duplicate.'
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
		],
		steps: [
			{
				title: 'See why there are two',
				questions: [
					{ q: 'Your handler sends the email, then takes 40 seconds to answer, and the provider\'s call times out. What happened to that first email?', options: ['The timeout cancelled it', 'The provider deleted it', 'It went out: a timeout does not cancel the work', 'It waits until the retry arrives'], answer: 2, why: 'The timeout only freed the provider. Your side kept running and finished the work, so the retry is a second run.' },
					{ q: 'Why does the retry send a second email?', options: ['The provider sends two different events on purpose', 'The handler is not idempotent: running it twice sends twice', 'The mail server copies every email', 'The timeout cancelled the first email'], answer: 1, why: 'Idempotent means twice has the same effect as once. Sending an email is not.' },
					{ q: 'Which part of the handler is not safe to repeat?', options: ['Parsing the webhook body', 'Logging the request', 'Sending the email', 'Answering 200'], answer: 2, why: 'Reading and logging change nothing for the customer. The email is the side effect they see twice.' },
					{ q: 'The provider retries until you answer in time. Which delivery promise is that?', options: ['Exactly once', 'At most once', 'Once per hour', 'At least once'], answer: 3, why: 'Retries mean a call can arrive more than once. The receiver must make the repeat harmless.' }
				]
			},
			{
				title: 'Pick the key',
				questions: [
					{ q: 'Which value makes a good idempotency key here?', options: ['The provider\'s event id, or the payment id', 'A random id you generate on receipt', 'The time the webhook arrived', 'The customer\'s email address'], answer: 0, why: 'Every retry repeats it, so the second call carries the same key as the first.' },
					{ q: 'Why not a random id generated on receipt?', options: ['Random ids are too long for a column', 'Each retry would get a new one, so no repeat is ever spotted', 'The provider would reject it', 'It would leak the customer\'s data'], answer: 1, why: 'The key must be the same on every retry of one event. A fresh random id never matches.' },
					{ q: 'Why not key on the customer\'s email address?', options: ['Email addresses are too long to index', 'Email addresses change case', 'One customer can pay twice, and each payment is its own event', 'The provider does not send it'], answer: 2, why: 'The key must name one event, not one person. Otherwise a real second payment would get no email.' },
					{ q: 'In Mastodon, who picks the `Idempotency-Key` for a new post?', options: ['The server, when it saves the post', 'Redis, when the lock is taken', 'Sidekiq, when the job is queued', 'The client, once per post, sent again on every retry'], answer: 3, why: 'The API docs suggest a hash or UUID generated client side, kept for every retry of that post.' }
				]
			},
			{
				title: 'Store it',
				questions: [
					{ q: 'What do you store?', options: ['The full text of each email sent', 'A row like `(event_id, processed_at)` with a **unique constraint**', 'A counter of retries per customer', 'Nothing: the provider remembers for you'], answer: 1, why: 'You cannot ask the mail server what it sent, so you remember it yourself, one row per event.' },
					{ q: 'Do you insert first, or check first?', options: ['Insert first, and let the unique constraint reject a repeat', 'Check with a `SELECT`, then insert', 'Send the email, then insert', 'Insert once a day, in a batch'], answer: 0, why: 'Two copies at the same moment would both pass a `SELECT`. The constraint lets only one insert win.' },
					{ q: 'The insert fails as a duplicate. What do you answer?', options: ['500, so the provider tries again', '409, as an error', '200, and do nothing', '202, and send the email again'], answer: 2, why: 'The event was already handled. A 200 stops the retries, and nothing else must happen.' },
					{ q: 'Mastodon takes a lock around its key lookup. Why?', options: ['Redis needs a lock to read a key', 'To slow retries down on purpose', 'To make the key expire', 'Two copies at the same moment would both miss the key and both save'], answer: 3, why: 'The same race your unique constraint closes. With the lock, the second copy gets a 503 and its retry finds the key.' }
				]
			},
			{
				title: 'Close the gaps',
				questions: [
					{ q: 'The handler is slow because it sends the email itself. What do you change?', options: ['Raise the provider\'s timeout', 'Retry the email three times inside the request', 'Answer fast, and send the email from a job', 'Ask the provider to stop retrying'], answer: 2, why: 'A slow endpoint is what triggers the provider\'s retries in the first place.' },
					{ q: 'You insert, then send. The process crashes between the two. What happens?', options: ['The email goes out twice', 'One email is lost', 'The row is rolled back', 'The provider sends a new event id'], answer: 1, why: 'The row says done, so the retry skips it. Decide which is worse for you: a missing email or a duplicate.' },
					{ q: 'How long do you keep the rows?', options: ['Longer than the provider\'s retry window', 'One hour, like Mastodon', 'Until the email is sent', 'Only for the current request'], answer: 0, why: 'A retry that comes after the row is gone is treated as new, and sends again.' },
					{ q: 'Mastodon writes its key after the post is saved. The process dies between the two, and the client retries a minute later. What happens?', options: ['It gets the same post back', 'It gets a 503', 'It is rejected with a 409', 'It creates a second post'], answer: 3, why: 'No key was stored, so the retry looks new. Your insert-then-send handler has the same kind of gap between its two steps.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A call to charge a card times out. What do you know about the charge?',
			options: ['Nothing: it may or may not have happened, so a retry must be safe', 'It failed: no answer came back, so retrying the charge is safe', 'It succeeded: the server got it, the answer was just slow to come', 'It was rolled back: a server undoes the work when its caller times out'],
			answer: 0,
			why: 'A timeout only frees the caller. The work may have been done, half done or never started. A retry of the charge must be idempotent, or the card may be charged twice.'
		},
		{
			q: 'Why does Mastodon add a random amount to each retry delay of a delivery job?',
			options: ['To make delivery tests less predictable and catch hidden timing bugs', 'Because Redis timers are not precise, so each delay is rounded at random', 'So deliveries that failed together do not all retry in the same second', 'To make the delay grow after each failure, so the remote gets room to recover'],
			answer: 2,
			why: 'The random amount is jitter, and the growing delay is the backoff. Jitter spreads deliveries that failed together over time, so a server coming back up does not get them all in the same second.'
		},
		{
			q: 'A client sends a new post with `Idempotency-Key: k1`, times out, and sends it again with `k1` ten minutes later. What does Mastodon do?',
			options: ['Creates a second post, since the first request timed out', 'Rejects the retry with a 409 error', 'Queues the retry until the first request finishes', 'Returns the post created by the first request'],
			answer: 3,
			why: 'The first request stored the post id under the key for an hour. The retry finds it and gets the same post back, without a second save or delivery.'
		}
	],
	recall: {
		q: 'A Mastodon client retries a post with the same `Idempotency-Key`. How does the server avoid a second post, and for how long does that work?',
		a: 'Under a Redis lock, it finds the key and returns the post id stored under it. The key lives 3,600 seconds, so a retry after one hour creates a second post.'
	},
	sources: [
		{ title: 'Mastodon API docs, Post a new status (Idempotency-Key)', url: 'https://docs.joinmastodon.org/methods/statuses/' },
		{ title: 'Mastodon, post_status_service.rb, with_idempotency', url: `${PSS}#L226-L256` },
		{ title: 'Sidekiq 8.1.7, job_retry.rb, default delay and jitter', url: `${SIDEKIQ}/lib/sidekiq/job_retry.rb#L200-L248` },
		{ title: 'Mastodon, activitypub/delivery_worker.rb, retry jitter', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L13-L21` },
		{ title: 'Marc Brooker, Timeouts, retries, and backoff with jitter (Amazon Builders\' Library)', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
		{ title: 'Stripe API reference, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' }
	]
};
