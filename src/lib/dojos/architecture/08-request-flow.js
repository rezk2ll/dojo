const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'request-flow',
	part: 'Seeing the system',
	title: 'Following one request end to end',
	minutes: 10,
	hook: [
		'A user says: "publishing a post sometimes hangs for several seconds, but only when I mention someone." Yesterday\'s container diagram shows the boxes. It does not show **which boxes one click touches**, or in what order.',
		'For that, C4 has the **dynamic diagram**: pick one real use case and number the steps as it moves through the containers. Today we follow one request, "publish a post", through Mastodon\'s code.',
		'Keep one idea in mind while reading. **Every hop is a place where the request can fail or wait.** Count the hops and you know where to look for the slow seconds.'
	],
	terms: [
		{ term: 'Dynamic diagram', def: 'A C4 view of one use case at runtime: the same boxes as the static diagrams, with numbered steps.' },
		{ term: 'Hop', def: 'One step where the request crosses into another part: another layer of code, or worse, another container over the network.' },
		{ term: 'Hot path', def: 'The code every request runs before it can answer. A slow call there makes the user wait.' },
		{ term: 'Fan-out', def: 'One event turned into many jobs: one post copied into every follower\'s feed, and sent to every follower\'s server.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'app(["Web or mobile app"]) -->|"1. POST /api/v1/statuses"| api["web: StatusesController"]',
					'api -->|"2. check the OAuth token"| pg[("PostgreSQL")]'
				],
				highlight: ['app', 'api', 'pg'],
				note: 'Before any posting code runs, the controller requires a token with the `write` or [`write:statuses` scope](' + REPO + '/app/controllers/api/v1/statuses_controller.rb#L8). Tokens live in PostgreSQL, in `oauth_access_tokens`. No valid token, and the request stops here.'
			},
			{
				add: [
					'api --> svc["3. PostStatusService"]',
					'svc -->|"4. unknown remote mention? look it up"| fedi["Other fediverse servers"]',
					'class fedi ext'
				],
				highlight: ['svc', 'fedi'],
				note: 'The [service](' + REPO + '/app/services/post_status_service.rb#L94-L110) first scans the text for mentions. A mention of a remote account it does not know yet is **resolved now**: a WebFinger request to that other server. **A hop to a server you don\'t run, inside the user\'s request.**'
			},
			{
				add: ['svc -->|"5. save the post, in a transaction"| pg'],
				highlight: ['svc', 'pg'],
				note: 'Then `@status.save!` inside `ApplicationRecord.transaction`. From here on the post **exists**. Everything that follows is about who gets to see it.'
			},
			{
				add: [
					'svc -->|"6. enqueue jobs"| redis[("Redis")]',
					'api -->|"7. 200, the post as JSON"| app'
				],
				highlight: ['redis'],
				note: '[`postprocess_status!`](' + REPO + '/app/services/post_status_service.rb#L172-L181) processes hashtags inline, then **enqueues** the rest: `DistributionWorker`, `ActivityPub::DistributionWorker`, a link preview crawl. The response goes back without waiting for any of them.'
			},
			{
				add: [
					'sk["sidekiq: fan-out jobs"] -->|"8. take jobs, fill home feeds"| redis',
					'redis -->|"9. pub/sub"| stream["streaming"]',
					'sk -->|"10. one delivery per inbox"| fedi'
				],
				highlight: ['sk', 'stream'],
				note: 'The **fan-out**, in Sidekiq. One job per follower writes the post into their home feed in Redis, and a message on a Redis channel reaches the streaming server, which pushes it to open apps. Another job sends the post to each remote inbox, [retried for days](' + REPO + '/app/workers/activitypub/delivery_worker.rb#L11-L21) if a server is down.'
			}
		]
	},
	example: {
		title: 'app/services/process_mentions_service.rb, a hop that can hide seconds',
		repo: 'mastodon/mastodon',
		url: `${REPO}/app/services/process_mentions_service.rb#L25-L48`,
		lang: 'ruby',
		code: `  def scan_text!
    @status.text = @status.text.gsub(Account::MENTION_RE) do |match|
      username, domain = Regexp.last_match(1).split('@')

      domain = if TagManager.instance.local_domain?(domain)
                 nil
               else
                 TagManager.instance.normalize_domain(domain)
               end

      mentioned_account = Account.find_remote(username, domain)

      # Unapproved and unconfirmed accounts should not be mentionable
      next match if mentioned_account&.local? && !(mentioned_account.user_confirmed? && mentioned_account.user_approved?)

      # If the account cannot be found or isn't the right protocol,
      # first try to resolve it
      if mention_undeliverable?(mentioned_account)
        begin
          mentioned_account = ResolveAccountService.new.call(Regexp.last_match(1))
        rescue Webfinger::Error, *Mastodon::HTTP_CONNECTION_ERRORS, Mastodon::UnexpectedResponseError
          mentioned_account = nil
        end
      end`,
		notes: [
			'This is step 4. [`ResolveAccountService`](' + REPO + '/app/services/resolve_account_service.rb#L91-L105) runs a WebFinger query on the other server, and then fetches the account. That is **network calls to someone else\'s machine**, once per unknown mention, before the post is even saved.',
			'How long can one call wait? Mastodon\'s HTTP client sets [`TIMEOUT = { connect_timeout: 5, read_timeout: 10, write_timeout: 10, read_deadline: 30 }`](' + REPO + '/app/lib/request.rb#L86). A slow server costs seconds. A server that never answers costs at least the 5 second connect timeout, and the comment above that line puts the worst case for opening a connection at about 15 seconds.',
			'Look at the `rescue`: connection errors and bad answers become `mentioned_account = nil`. The post is still published, and the mention stays **plain text**. A failure here is invisible to the user, except as a wait.',
			'You only find this by reading the path hop by hop. A dashboard would show "POST /api/v1/statuses p99 = 6 s" and nothing more. The fix starts with knowing that step 4 exists.'
		]
	},
	tradeoff: {
		gain: [
			'Saving the post inside the request gives the user a definite answer: 200 means the post exists.',
			'Enqueueing the fan-out keeps it off the response time. The cost of a big follower list lands on Sidekiq, not on the user\'s click.',
			'Clear hops (controller, service, database, queue) let you put a timer around each one.'
		],
		cost: [
			'The request is only as available as **all** its synchronous hops together: PostgreSQL and Redis. A remote server named in a mention cannot fail it (the error is rescued), but it can stall it.',
			'Latency adds up, and one hop is outside your control: a slow remote server makes your user wait.',
			'The async part has no answer at all. If deliveries pile up in a queue, the 200 the user got tells them nothing.'
		]
	},
	task: {
		prompt: 'Using the diagram, say which step explains each report: (a) "401 when I post", (b) "my post took 6 seconds", (c) "my post is on my profile but my followers on another server never saw it", (d) "the post shows my mention as plain text".',
		hint: 'Walk the steps in order and ask, at each one, "what can go wrong here, and does the user find out?"',
		answer: [
			'(a) Step 2: the token is missing, revoked, or not valid.',
			'(b) Look at every synchronous hop. The first suspect is step 4: a mention of an unknown remote account, resolved over the network before saving.',
			'(c) Step 10: the delivery job is queued or retrying, or Sidekiq is not running. The request (steps 1 to 7) succeeded, so it cannot tell you.',
			'(d) Step 4 again: resolving the account failed, the error was rescued, and the mention was left as text.'
		]
	},
	quiz: [
		{
			q: 'In a C4 **dynamic diagram**, what do the numbers on the arrows show?',
			options: [
				'How many instances of each container run',
				'The order of the interactions for one use case',
				'The priority of each container',
				'The version of each API'
			],
			answer: 1,
			why: 'A dynamic diagram shows how the elements of the static diagrams collaborate at runtime for one feature or use case. The numbers give the order.'
		},
		{
			q: 'When Mastodon publishes a post, which of these happens **inside** the user\'s HTTP request?',
			options: [
				'Writing the post into each follower\'s home feed',
				'Sending the post to each remote follower\'s inbox',
				'Resolving a mentioned remote account it does not know yet',
				'Fetching the preview card of a link in the post'
			],
			answer: 2,
			why: 'Mention resolution runs in `ProcessMentionsService`, before the post is saved. Feed fan-out, deliveries and the link crawl are all enqueued in `postprocess_status!` and run later in Sidekiq.'
		},
		{
			q: 'Resolving a mentioned remote account fails with a connection error. What does Mastodon do with the post?',
			options: [
				'It publishes the post, with the mention left as plain text',
				'It answers 502 to the client and does not save the post',
				'It retries the mention forever before it saves the post',
				'It saves the post as a draft until the mention resolves'
			],
			answer: 0,
			why: 'The `rescue` sets `mentioned_account = nil`, and the code then keeps the original text for that mention. The user gets their post, maybe after a wait, and no error.'
		}
	],
	takeaway: 'Trace one real request through the code. Each hop is a place it can fail or wait, and the slow seconds hide in one of them.',
	sources: [
		{ title: 'C4 model, Dynamic diagram', url: 'https://c4model.com/diagrams/dynamic' },
		{ title: 'mastodon, PostStatusService', url: `${REPO}/app/services/post_status_service.rb` },
		{ title: 'mastodon, ProcessMentionsService', url: `${REPO}/app/services/process_mentions_service.rb` },
		{ title: 'mastodon, FanOutOnWriteService', url: `${REPO}/app/services/fan_out_on_write_service.rb` },
		{ title: 'Mastodon docs, Scaling up your server (Sidekiq queues)', url: 'https://docs.joinmastodon.org/admin/scaling/' }
	]
};
