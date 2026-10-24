const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const RACK_ATTACK = 'https://github.com/rack/rack-attack/blob/65f1ead3bc648b1e972fd8df0078949f056699d9';
const RAILS = 'https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'quality-scenarios',
	part: 'Thinking like an architect',
	title: 'Quality scenarios: making "secure" testable',
	minutes: 10,
	hook: [
		'Yesterday you picked three characteristics, like security. Nobody can test "the system must be secure", and nobody can say when it is done.',
		'Take a Mastodon server. Someone gets a list of leaked passwords and tries them one after another on the login form. One of them will work for a user who reused it on another site.',
		'A **quality attribute scenario** describes that attack in one sentence with six parts, and the last part is a number QA can check. Mastodon ships the mechanism, and its config holds the numbers.'
	],
	terms: [
		{ term: 'Scenario', def: 'One testable sentence: who does what to which part, in which situation, what the system must do, and how you measure it.' },
		{ term: 'Stimulus', def: 'The event that reaches the system: a burst of logins, a crash, a traffic spike.' },
		{ term: 'Response measure', def: 'The number that decides pass or fail, like "at most 25 attempts per IP in 5 minutes".' },
		{ term: 'Fail open, fail closed', def: 'What a check does when it cannot run. Fail open lets the request through. Fail closed refuses it.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['source["Source: attacker with leaked passwords"] -->|sends| stimulus["Stimulus: 1000 logins in 5 minutes"]'],
				highlight: ['source', 'stimulus'],
				note: 'The source and the stimulus say who acts and what they do. Here the source is a script, and the stimulus is 1000 logins with leaked passwords, sent one at a time.'
			},
			{
				add: ['stimulus -->|hits| artifact["Artifact: login throttles in Rack::Attack"]'],
				highlight: ['artifact'],
				note: 'The artifact is the part of the system that gets hit. Here it is the Rack::Attack middleware, which sees every `POST /auth/sign_in` before Rails checks the password.'
			},
			{
				add: ['env["Environment: normal load, Redis up"] -.->|while| artifact', 'class env ext'],
				highlight: ['env'],
				note: 'The environment is the state of the system when the stimulus arrives. The counters live in Redis, through the Rails cache. Normal load, a deploy and Redis down can each need a different answer to the same attack.'
			},
			{
				add: ['artifact -->|must| response["Response: 429 Too Many Requests"]'],
				highlight: ['response'],
				note: 'The response says what must happen. Attempts under the limit reach the password check as usual. The others get a `429` with an `X-RateLimit-Reset` header, so honest clients know when to retry.'
			},
			{
				add: ['response -->|tested by| measure["Measure: at most 25 per IP per 5 minute window reach the password check"]'],
				highlight: ['measure'],
				note: 'The measure says how you check. Mastodon allows 25 attempts per IP per 5 minutes, counted in fixed windows, so a burst that spans a window boundary gets 25 in each. QA can send 1000 logins from one IP and count how many reach the password check in each window.'
			}
		]
	},
	example: {
		title: 'config/initializers/rack_attack.rb',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/config/initializers/rack_attack.rb#L148-L172`,
		lang: 'ruby',
		code: `  throttle('throttle_login_attempts/ip', limit: 25, period: 5.minutes) do |req|
    req.throttleable_remote_ip if req.post? && req.path_matches?('/auth/sign_in')
  end

  throttle('throttle_login_attempts/email', limit: 25, period: 1.hour) do |req|
    req.session[:attempt_user_id] || req.normalized_email if req.post? && req.path_matches?('/auth/sign_in')
  end
…
  self.throttled_responder = lambda do |request|
    now        = Time.now.utc
    match_data = request.env['rack.attack.match_data']

    headers = {
      'Content-Type' => 'application/json',
      'X-RateLimit-Limit' => match_data[:limit].to_s,
      'X-RateLimit-Remaining' => '0',
      'X-RateLimit-Reset' => (now + (match_data[:period] - (now.to_i % match_data[:period]))).iso8601(6),
    }

    [429, headers, [{ error: I18n.t('errors.429') }.to_json]]
  end`,
		notes: [
			'Lines 1 to 3 hold the measure as data: `limit: 25, period: 5.minutes`. Change the number and the pass line of the scenario changes with it.',
			'Lines 9 to 21 are the response: a `429` and three headers that give the limit, the attempts left, and the time the window resets.',
			'Lines 5 to 7 add a second throttle for a second stimulus. An attacker who spreads guesses for one account over many IPs stays under the per-IP limit, so a limit of 25 per hour per account catches them. [`throttleable_remote_ip`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/config/initializers/rack_attack.rb#L20-L30) also counts a whole IPv6 `/64` as one address, so rotating addresses inside one network does not help.',
			'The environment shows up in the cache store. If Redis is down, the Rails cache [swallows the error and returns `nil`](https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503), and Rack::Attack counts `nil` as 1 (`Cache#do_count`, in the sources). Every attempt then looks like the first one, so the throttle fails open.'
		]
	},
	tradeoff: {
		gain: [
			'QA can test the goal: send 1000 logins from one IP and check that at most 25 per 5 minute window reach the password check.',
			'The team argues about a number, 25 or 100 attempts, instead of about "secure enough".',
			'Writing a second scenario found a second attacker, one account guessed from many IPs, and Mastodon has a throttle for it.'
		],
		cost: [
			'Each scenario takes thought, and it shows what you do not know yet, like what the throttle does when Redis is down.',
			'Each scenario needs a test and an owner. Start with your top three characteristics.',
			'With a limit set too low, a whole office behind one IP address gets locked out.'
		]
	},
	task: {
		prompt: 'Write the scenario for the same attacker, but **Redis is down**. Then pick what the login throttle should do: fail open (today\'s behavior), fail closed, or fall back to a counter in each app process\'s memory.',
		hint: 'Each choice protects a different characteristic. Ask who suffers during the outage: the attacker, or every honest user who wants to log in.',
		answer: [
			'Source: an attacker with leaked passwords. Stimulus: 1000 logins in 5 minutes. Artifact: the login throttles. Environment: Redis unreachable for 10 minutes.',
			'Fail open, what the code does today: logins keep working for everyone, and the attacker gets 10 minutes with no limit.',
			'Fail closed: every login is refused while the counter is unreachable. The attacker is stopped, and so is every honest user.',
			'Local fallback: each process counts in its own memory. The limit still applies, but it is multiplied by the number of processes, and a restart resets it. You also have more code to maintain.',
			'A possible response and measure: "logins keep working; at most 25 × (number of web processes) attempts per IP per 5 minutes reach the password check while Redis is down." Your numbers may differ, but the measure must be a number.'
		],
		steps: [
			{
				title: 'Write the first four parts',
				questions: [
					{ q: 'Which part changes from the chapter\'s scenario?', options: ['The source: a different attacker', 'The stimulus: fewer logins', 'The environment: Redis is unreachable', 'The artifact: the password check'], answer: 2, why: 'Same attacker, same attack. Only the state of the system when it arrives is different.' },
					{ q: 'What is the stimulus?', options: ['An attacker with leaked passwords', '1000 logins in 5 minutes', 'The login throttles', 'Redis unreachable for 10 minutes'], answer: 1, why: 'The stimulus is the event that reaches the system. The attacker is the source.' },
					{ q: 'What is the artifact?', options: ['The login throttles in Rack::Attack', 'The Redis server', 'The password check in Rails', 'The login form in the browser'], answer: 0, why: 'The artifact is the part that gets hit. Rack::Attack sees every `POST /auth/sign_in` first.' },
					{ q: 'Why write a separate scenario for Redis down?', options: ['Redis down is a different attacker', 'QA only tests one scenario per sprint', 'The measure stays the same, only the words change', 'The same attack can need a different answer in a different environment'], answer: 3, why: 'Normal load, a deploy and Redis down can each need their own answer to the same burst.' }
				]
			},
			{
				title: 'See what the code does today',
				questions: [
					{ q: 'Redis is down. What does the Rails cache return for the counter?', options: ['An error that stops the request', '`nil`, after swallowing the error', 'The last count it knew', 'Zero, read from PostgreSQL'], answer: 1, why: 'The Rails Redis cache swallows connection errors and returns `nil`.' },
					{ q: 'How does Rack::Attack read that `nil`?', options: ['As a count over the limit', 'As an error to raise', 'As a count of 1', 'As a reason to refuse the request'], answer: 2, why: '`Cache#do_count` counts `nil` as 1, so every attempt looks like the first.' },
					{ q: 'Redis is down, and the attacker sends 1000 logins from one IP in 5 minutes. How many reach the password check?', options: ['All 1000', '25', '25 × the number of web processes', 'None: each one gets a `429`'], answer: 0, why: 'Every attempt counts as the first, so the limit of 25 never trips. The whole burst reaches the password check.' },
					{ q: 'With fail open, who wins during 10 minutes of Redis outage?', options: ['Honest users, who get locked out', 'QA, who can run more tests', 'Nobody, since logins stop', 'The attacker, who gets 10 minutes with no limit'], answer: 3, why: 'Logins keep working for everyone, attacker included.' }
				]
			},
			{
				title: 'Weigh the three choices',
				questions: [
					{ q: 'You fail closed. What happens?', options: ['Only the attacker is refused', 'Every login is refused: the attacker, and every honest user too', 'Logins keep working with no limit', 'Each process counts on its own'], answer: 1, why: 'Without the counter, the throttle cannot tell the attacker from anyone else.' },
					{ q: 'You fall back to a counter in each process\'s memory. What does the limit become?', options: ['25 per IP, exactly as before', 'Zero, so every login is refused', 'Multiplied by the number of processes, and reset by a restart', 'Shared between processes through memory'], answer: 2, why: 'Each process counts only what it sees, and its memory is gone after a restart.' },
					{ q: 'What other cost does the local fallback bring?', options: ['More code to maintain', 'A `429` on every login', 'A `500` on every login', 'A new dependency on PostgreSQL'], answer: 0, why: 'A second counting path is code someone has to own and test.' },
					{ q: 'Which question helps you choose between the three?', options: ['Which one needs the fewest lines of code?', 'Which one does Rails pick by default?', 'Which one can QA test the fastest?', 'Who suffers during the outage: the attacker, or every honest user?'], answer: 3, why: 'Each choice protects a different characteristic. Name who pays for it.' }
				]
			},
			{
				title: 'Write the response and measure',
				questions: [
					{ q: 'You pick the local fallback. Which response fits?', options: ['Every login gets a `429`', 'Logins keep working', 'Logins return a `500`', 'Logins wait until Redis is back'], answer: 1, why: 'The fallback keeps logins open and still applies a limit.' },
					{ q: 'Which measure fits the local fallback?', options: ['At most 25 attempts per IP per 5 minutes, as before', 'No attempt reaches the password check', 'At most 25 × (number of web processes) attempts per IP per 5 minutes reach the password check', 'The throttle stays as secure as possible'], answer: 2, why: 'It is a number QA can check, and it is honest about the multiplied limit.' },
					{ q: 'Why "25 × number of processes" and not 25?', options: ['Each process counts only the attempts it sees', 'Redis multiplies the limit when it restarts', 'Rack::Attack doubles limits on errors', 'The per-account throttle adds its own 25'], answer: 0, why: 'An attacker whose attempts spread over every process gets 25 in each.' },
					{ q: 'How does QA check the local fallback\'s measure?', options: ['They read the Rack::Attack config and approve it', 'They send one login and check that it gets a `429`', 'They ask the team whether the throttle feels secure', 'They stop Redis, send 1000 logins from one IP, and count how many reach the password check per window'], answer: 3, why: 'The measure is a number, so a test can count against it. The test has to run in the scenario\'s environment, with Redis down.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'What turns "the system must be fast" into something testable?',
			options: [
				'Writing it down as a requirement in an ADR that the whole team signs',
				'Rewriting the hot path in a faster language, like Go or Rust',
				'A response measure, like "p95 under 300 ms at 200 requests per second"',
				'Adding a cache in front of the database so most reads are quick'
			],
			answer: 2,
			why: 'With a measure, a load test passes or fails: p95 under 300 ms at 200 requests per second either holds or it does not. Without one, nobody can tell if the design meets the need.'
		},
		{
			q: 'In a quality scenario, the **environment** describes…',
			options: [
				'The state the system is in when the stimulus arrives: normal load, a deploy, Redis down',
				'The language and framework the service is written in, like Ruby on Rails',
				'The stage the scenario is tested in, like staging or production',
				'The team that owns the service and answers the pages when it breaks'
			],
			answer: 0,
			why: 'The same burst of logins needs one answer when Redis is up and a different one when it is down.'
		},
		{
			q: 'Mastodon counts login attempts in Redis through the Rails cache. Redis goes down. What happens to the login throttle?',
			options: [
				'Every login is refused with a 429 until the Redis connection is back',
				'Mastodon switches to counting attempts in PostgreSQL until Redis comes back',
				'The throttle raises an error, so the next login fails with a 500',
				'Every attempt is counted as the first in its window, so nothing is throttled'
			],
			answer: 3,
			why: 'The Rails Redis cache returns `nil` on connection errors, and Rack::Attack reads `nil` as a count of 1. No attempt is throttled while Redis is down.'
		}
	],
	recall: {
		q: 'Which part of a quality scenario makes it testable, and what is it for Mastodon\'s login throttle?',
		a: 'The response measure. For Mastodon it is at most 25 login attempts per IP per 5 minute window reaching the password check.'
	},
	sources: [
		{ title: 'Mastodon, config/initializers/rack_attack.rb', url: `${MASTODON}/config/initializers/rack_attack.rb#L148-L172` },
		{ title: 'Mastodon docs, API rate limits', url: 'https://docs.joinmastodon.org/api/rate-limits/' },
		{ title: 'rack-attack 6.8.0, Cache#do_count', url: `${RACK_ATTACK}/lib/rack/attack/cache.rb#L76-L89` },
		{ title: 'Rails 8.1.4, RedisCacheStore failsafe', url: `${RAILS}/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503` },
		{ title: 'SEI, Quality Attribute Workshops, 3rd ed. (the six parts of a scenario)', url: 'https://www.sei.cmu.edu/documents/716/2003_005_001_14249.pdf' }
	]
};
