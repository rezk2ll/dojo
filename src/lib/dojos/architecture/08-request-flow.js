const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'request-flow',
	part: 'Seeing the system',
	title: 'Following one request end to end',
	minutes: 10,
	hook: [
		'A user says: "publishing a post sometimes hangs for several seconds, but only when I mention someone." Yesterday\'s container diagram shows the boxes. It does not show **which boxes one click touches**, or in what order.',
		'For that, C4 has the dynamic diagram: pick one real use case and number the steps as it moves through the containers. Here the use case is "publish a post", followed through Mastodon\'s code.',
		'At every hop, the request can fail or wait. If you list the hops in order, you know where to look for the slow seconds.'
	],
	terms: [
		{ term: 'Dynamic diagram', def: 'A C4 view of one use case at runtime: the same boxes as the static diagrams, with numbered steps.' },
		{ term: 'Hop', def: 'One step where the request crosses into another part: another layer of code, or another container over the network, which is slower and can fail.' },
		{ term: 'Hot path', def: 'The code every request runs before it can answer. A slow call there makes the user wait.' },
		{ term: 'Fan-out', def: 'One event that starts many jobs: one post copied into every follower\'s feed, and sent to every follower\'s server.' }
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
				note: 'Before any posting code runs, the controller requires a token with the `write` or [`write:statuses` scope](' + REPO + '/app/controllers/api/v1/statuses_controller.rb#L8). Tokens live in PostgreSQL, in `oauth_access_tokens`. Without a valid token, the request stops here.'
			},
			{
				add: [
					'api --> svc["3. PostStatusService"]',
					'svc -->|"4. unknown remote mention? look it up"| fedi["Other fediverse servers"]',
					'class fedi ext'
				],
				highlight: ['svc', 'fedi'],
				note: 'The [service](' + REPO + '/app/services/post_status_service.rb#L94-L110) first scans the text for mentions. For a remote account it does not know yet, it sends a WebFinger request to that other server **right away**. The user\'s request waits on a server you don\'t run.'
			},
			{
				add: ['svc -->|"5. save the post, in a transaction"| pg'],
				highlight: ['svc', 'pg'],
				note: 'Then `@status.save!` runs inside `ApplicationRecord.transaction`, and the post **exists** in PostgreSQL. The steps after this one decide who sees it.'
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
				note: 'Sidekiq runs the **fan-out**. One job per follower writes the post into their home feed in Redis, and a message on a Redis channel tells the streaming server to push it to open apps. Another job sends the post to each remote inbox, [retried for days](' + REPO + '/app/workers/activitypub/delivery_worker.rb#L11-L21) if a server is down.'
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
			'Line 20 is step 4. [`ResolveAccountService`](' + REPO + '/app/services/resolve_account_service.rb#L91-L105) runs a WebFinger query on the other server, and then fetches the account. These are **network calls to someone else\'s machine**, once per unknown mention, before the post is even saved.',
			'Mastodon\'s HTTP client sets [`TIMEOUT = { connect_timeout: 5, read_timeout: 10, write_timeout: 10, read_deadline: 30 }`](' + REPO + '/app/lib/request.rb#L86). A slow server adds seconds to the request. A server that never answers costs at least the 5 second connect timeout, and the comment above that line puts the worst case for opening a connection at about 15 seconds.',
			'Lines 21 and 22 catch connection errors and bad answers and set `mentioned_account = nil`. The post is still published, and the mention stays **plain text**. The user sees no error, only the wait.',
			'You only find this by reading the path hop by hop. A dashboard would show "POST /api/v1/statuses p99 = 6 s" and nothing more. To fix it, you first need to know that step 4 exists.'
		]
	},
	tradeoff: {
		gain: [
			'Saving the post inside the request gives the user a definite answer: 200 means the post exists.',
			'The fan-out is enqueued, so it adds nothing to the response time. Sidekiq pays for a big follower list, and the user\'s click returns as fast as for a small one.',
			'Each hop (controller, service, database, queue) is a separate call, so you can put a timer around each one.'
		],
		cost: [
			'The request fails when **any** of its synchronous hops is down: PostgreSQL or Redis. A remote server named in a mention cannot make it fail (the error is rescued), but it can make it wait.',
			'The waits add up, and one hop is outside your control: a slow remote server makes your user wait.',
			'The user gets no answer about the async part. If deliveries pile up in a queue, the 200 they got says nothing about it.'
		]
	},
	task: {
		prompt: 'Using the diagram, say which step explains each report: (a) "401 when I post", (b) "my post took 6 seconds", (c) "my post is on my profile but my followers on another server never saw it", (d) "the post shows my mention as plain text".',
		hint: 'Walk the steps in order and ask, at each one, "what can go wrong here, and does the user find out?"',
		answer: [
			'(a) Step 2: the token is missing, revoked, or not valid.',
			'(b) Check each synchronous hop. The first suspect is step 4: a mention of an unknown remote account, resolved over the network before saving.',
			'(c) Step 10: the delivery job is queued or retrying, or Sidekiq is not running. The request (steps 1 to 7) succeeded, so it cannot tell you.',
			'(d) Step 4 again: resolving the account failed, the error was rescued, and the mention was left as text.'
		],
		steps: [
			{
				title: 'Split the request from the jobs',
				questions: [
					{ q: 'Which steps run inside the user\'s HTTP request?', options: ['1 to 5', '1 to 7', '1 to 10', '8 to 10'], answer: 1, why: 'Step 7 sends the 200 back. Steps 8 to 10 run later in Sidekiq.' },
					{ q: 'At which step does the post exist?', options: ['Step 3: the service starts', 'Step 7: the 200 goes back', 'Step 5: `@status.save!` in a transaction', 'Step 8: home feeds are filled'], answer: 2, why: 'Once the transaction commits, the post is in PostgreSQL. The steps after decide who sees it.' },
					{ q: 'What does step 6 do with the fan-out?', options: ['It runs it before answering', 'It skips it for big accounts', 'It sends it straight to the streaming server', 'It enqueues it in Redis, and the response goes back without waiting'], answer: 3, why: '`postprocess_status!` enqueues the workers and returns.' },
					{ q: 'Which outage makes the post request itself fail?', options: ['PostgreSQL or Redis is down', 'A remote server named in a mention is down', 'The streaming server is down', 'Sidekiq is down'], answer: 0, why: 'Both sit on synchronous hops, at steps 2, 5 and 6. A dead remote server only makes the request wait, since that error is rescued, and the others run after the response.' }
				]
			},
			{
				title: 'Explain (a) and (b)',
				questions: [
					{ q: '(a) "401 when I post." Which step?', options: ['Step 4: the mention lookup', 'Step 5: saving the post', 'Step 2: the token is missing, revoked or not valid', 'Step 10: the deliveries'], answer: 2, why: 'Without a valid token, the request stops before any posting code runs.' },
					{ q: 'What does step 2 require?', options: ['A token with the `write` or `write:statuses` scope', 'A token with the `read` scope', 'A logged-in browser session', 'A WebFinger lookup of the user'], answer: 0, why: 'The controller checks the scope on a token stored in `oauth_access_tokens`.' },
					{ q: '(b) "My post took 6 seconds." What is the first suspect?', options: ['Step 8: the fan-out to followers', 'Step 4: an unknown remote mention, resolved over the network', 'Step 10: the deliveries', 'Step 9: the pub/sub message'], answer: 1, why: 'It is the one synchronous hop that waits on someone else\'s machine.' },
					{ q: 'Why is step 8 not a suspect for (b)?', options: ['It is too fast to measure', 'Redis never slows down', 'It runs before step 2', 'It is enqueued, so it adds nothing to the response time'], answer: 3, why: 'Sidekiq pays for a big follower list, and the click returns as fast as for a small one.' }
				]
			},
			{
				title: 'Explain (c)',
				questions: [
					{ q: '(c) "My post is on my profile, but followers on another server never saw it." Which step?', options: ['Step 10: delivery to each remote inbox', 'Step 5: saving the post', 'Step 4: the mention lookup', 'Step 2: the token check'], answer: 0, why: 'The post is saved, so steps 1 to 7 worked. The delivery to other servers is what failed.' },
					{ q: 'Why can the request not tell the user about it?', options: ['The request crashed before it answered', 'Steps 1 to 7 succeeded, and step 10 runs later in Sidekiq', 'The 200 hid an error inside its JSON', 'The streaming server swallowed the error'], answer: 1, why: 'The 200 says nothing about the async part.' },
					{ q: 'Which causes fit (c)?', options: ['The token expired, the scope is wrong, or the user is banned', 'PostgreSQL is down, Redis is full, or the disk is full', 'The mention failed, the link crawl failed, or a hashtag is wrong', 'The delivery job is queued or retrying, or Sidekiq is not running'], answer: 3, why: 'Each one leaves the post saved and undelivered.' },
					{ q: 'A remote server is down. What does the delivery job do?', options: ['It gives up after one try', 'It fails the user\'s request', 'It retries for days', 'It deletes the post'], answer: 2, why: 'The code expects remote servers to be down sometimes, so the job retries.' }
				]
			},
			{
				title: 'Explain (d)',
				questions: [
					{ q: '(d) "The post shows my mention as plain text." Which step?', options: ['Step 9: the pub/sub message', 'Step 6: the enqueue', 'Step 7: the JSON response', 'Step 4 again: resolving the account failed'], answer: 3, why: 'The mention is plain text when the lookup at step 4 found no account.' },
					{ q: 'In `scan_text!`, which call goes out to the other server?', options: ['`Account.find_remote(username, domain)`', '`ResolveAccountService.new.call(...)`, when `mention_undeliverable?` is true', '`TagManager.instance.normalize_domain(domain)`', '`@status.text.gsub(Account::MENTION_RE)`'], answer: 1, why: '`find_remote` looks in Mastodon\'s own database. Only an account it cannot deliver to yet goes to `ResolveAccountService`, which runs WebFinger on the other server.' },
					{ q: 'What does the user see?', options: ['No error, only the wait', 'An error message on the post', 'A `401`', 'A draft in their profile'], answer: 0, why: 'The failure is rescued, so only the delay shows.' },
					{ q: 'A remote server that never answers costs the request at least how long?', options: ['1 second', 'Nothing: the error is rescued', 'The 5 second connect timeout', '30 seconds, every time'], answer: 2, why: '`connect_timeout: 5` sets the floor. The comment puts the worst case for opening a connection at about 15 seconds.' }
				]
			}
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
			why: 'A dynamic diagram shows how the elements of the static diagrams collaborate at runtime for one feature or use case, and each number gives the position of one interaction in that sequence.'
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
	recall: {
		q: 'Which step of "publish a post" can make Mastodon\'s request wait on another server, and what happens if that server fails?',
		a: 'Step 4: `ProcessMentionsService` resolves an unknown remote mention with WebFinger before the post is saved, with a 5 second connect timeout. If the call fails, the error is rescued and the mention stays plain text.'
	},
	sources: [
		{ title: 'C4 model, Dynamic diagram', url: 'https://c4model.com/diagrams/dynamic' },
		{ title: 'mastodon, PostStatusService', url: `${REPO}/app/services/post_status_service.rb` },
		{ title: 'mastodon, ProcessMentionsService', url: `${REPO}/app/services/process_mentions_service.rb` },
		{ title: 'mastodon, FanOutOnWriteService', url: `${REPO}/app/services/fan_out_on_write_service.rb` },
		{ title: 'Mastodon docs, Scaling up your server (Sidekiq queues)', url: 'https://docs.joinmastodon.org/admin/scaling/' }
	]
};
