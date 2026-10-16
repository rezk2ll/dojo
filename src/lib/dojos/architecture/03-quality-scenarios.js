const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const RACK_ATTACK = 'https://github.com/rack/rack-attack/blob/65f1ead3bc648b1e972fd8df0078949f056699d9';
const RAILS = 'https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'quality-scenarios',
	part: 'Thinking like an architect',
	title: '"Secure" is not a requirement. A scenario is.',
	minutes: 10,
	hook: [
		'Yesterday you picked three characteristics. Today\'s problem: "the system must be secure" cannot be tested, cannot be argued with, and cannot tell you when you are done.',
		'Take a Mastodon server. Someone gets a list of leaked passwords and tries them, one after another, on the login form. One of them will work for some user who reused it somewhere else.',
		'"Protect accounts from password guessing" is a wish. A **quality attribute scenario** turns it into one sentence with six parts, ending in a number you can test. Mastodon ships the mechanism, and its config holds the numbers.'
	],
	terms: [
		{ term: 'Scenario', def: 'A short, testable story: who does what to which part, in which situation, what the system must do, and how you measure it.' },
		{ term: 'Stimulus', def: 'The event that hits the system: a burst of logins, a crash, a traffic spike, an attack.' },
		{ term: 'Response measure', def: 'The number that says pass or fail. Without it, it is still a wish.' },
		{ term: 'Rate limit', def: 'A cap on how much one caller can do in a time window. Here: login attempts per IP address and per account.' },
		{ term: 'Fail open, fail closed', def: 'What a check does when it cannot run. Fail open lets the request through. Fail closed refuses it.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['source["Source: attacker with leaked passwords"] -->|sends| stimulus["Stimulus: 1000 logins in 5 minutes"]'],
				highlight: ['source', 'stimulus'],
				note: '**Who** acts, and **what** they do. Not "a bad actor", but a script trying real passwords, one login at a time.'
			},
			{
				add: ['stimulus -->|hits| artifact["Artifact: login throttles in Rack::Attack"]'],
				highlight: ['artifact'],
				note: '**Which part** of the system is hit. Not "the server", but the Rack::Attack middleware that sees every `POST /auth/sign_in` before Rails checks the password.'
			},
			{
				add: ['env["Environment: normal load, Redis up"] -.->|while| artifact', 'class env ext'],
				highlight: ['env'],
				note: '**In which situation.** The counters live in Redis, through the Rails cache. Normal load? During a deploy? With Redis down? The same stimulus can need a different answer in each.'
			},
			{
				add: ['artifact -->|must| response["Response: 429 Too Many Requests"]'],
				highlight: ['response'],
				note: '**What must happen.** Attempts under the limit reach the password check as usual. The rest get a `429` with `X-RateLimit-Reset`, so honest clients know when to retry.'
			},
			{
				add: ['response -->|tested by| measure["Measure: at most 25 per IP per 5 minute window reach the password check"]'],
				highlight: ['measure'],
				note: '**How you check.** Mastodon\'s limit is 25 per IP per 5 minutes, counted in fixed windows, so a burst that spans a window boundary gets 25 in each. QA can send 1000 from one IP and count per window. Now you argue about the number, not the adjective.'
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
			'The **measure** is data, not logic: `limit: 25, period: 5.minutes`. Change the number and the scenario\'s pass line moves with it.',
			'The **response** is the responder: a `429` and three headers that say the limit, what is left, and when the window resets.',
			'Two throttles, because a second scenario found a second stimulus. An attacker who spreads the guesses for one account over many IPs slips under the per-IP limit, so the per-account limit (25 an hour) catches them. And [`throttleable_remote_ip`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/config/initializers/rack_attack.rb#L20-L30) counts a whole IPv6 `/64` as one address, so rotating addresses inside one network does not help either.',
			'The **environment** hides in the store. Mastodon\'s production cache is Redis. If Redis is down, the Rails cache [swallows the error and returns `nil`](https://github.com/rails/rails/blob/c3466ea00d7121798e3aa3144ffdf7174b81d8cb/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503), and Rack::Attack [treats `nil` as a count of 1](https://github.com/rack/rack-attack/blob/65f1ead3bc648b1e972fd8df0078949f056699d9/lib/rack/attack/cache.rb#L76-L89). Every attempt looks like the first. That is "fail open". Whether you want it is a scenario question.'
		]
	},
	tradeoff: {
		gain: [
			'Vague words become tests. "Protect accounts" turns into "at most 25 guesses per IP per 5 minute window reach the password check".',
			'Disagreements get concrete: people argue about 25 or 100 attempts, not about "secure enough".',
			'Scenarios make good acceptance tests and good review checklists. They also find missing cases, like an attacker with a thousand IP addresses.'
		],
		cost: [
			'Writing them takes real thought, and they force you to discover what you don\'t know (what happens to the limits when Redis is down?).',
			'Too many scenarios is noise. Write them for your top three characteristics first.',
			'A number can be wrong. Set the limit too low and a whole office behind one IP address gets locked out.'
		]
	},
	task: {
		prompt: 'Write the scenario for the same attacker, but **Redis is down**. Then pick what the login throttle should do: fail open (today\'s behavior), fail closed, or fall back to a counter in each app process\'s memory.',
		hint: 'Each choice protects a different characteristic. Ask who suffers during the outage: the attacker, or every honest user who wants to log in.',
		answer: [
			'**Source:** attacker with leaked passwords. **Stimulus:** 1000 logins in 5 minutes. **Artifact:** the login throttles. **Environment:** Redis unreachable for 10 minutes.',
			'**Fail open** (what the code does today): logins keep working for everyone, and the attacker gets 10 minutes with no limit. Availability wins, security loses.',
			'**Fail closed:** refuse every login while the counter is unreachable. The attacker is stopped, and so is every honest user. Security wins, availability loses.',
			'**Local fallback:** each process counts in its own memory. Limits still apply, but they multiply by the number of processes, and a restart resets them. A middle answer, with more code to own.',
			'**Response and measure**, for example: "logins keep working; at most 25 × (number of web processes) attempts per IP per 5 minutes reach the password check while Redis is down." Yours may differ. What matters is that it has a number.'
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
			why: 'The measure is the pass or fail line. Without it nobody can tell if the design meets the need.'
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
			why: 'The Rails Redis cache returns `nil` on connection errors, and Rack::Attack reads `nil` as a count of 1. The check fails open. A scenario with "Redis down" as its environment is how you decide if that is what you want.'
		}
	],
	takeaway: 'If it has no number, it is a wish. Source, stimulus, artifact, environment, response, measure.',
	sources: [
		{ title: 'Mastodon, config/initializers/rack_attack.rb', url: `${MASTODON}/config/initializers/rack_attack.rb#L148-L172` },
		{ title: 'Mastodon docs, API rate limits', url: 'https://docs.joinmastodon.org/api/rate-limits/' },
		{ title: 'rack-attack 6.8.0, Cache#do_count', url: `${RACK_ATTACK}/lib/rack/attack/cache.rb#L76-L89` },
		{ title: 'Rails 8.1.4, RedisCacheStore failsafe', url: `${RAILS}/activesupport/lib/active_support/cache/redis_cache_store.rb#L490-L503` },
		{ title: 'SEI, Quality Attribute Workshops, 3rd ed. (the six parts of a scenario)', url: 'https://www.sei.cmu.edu/documents/716/2003_005_001_14249.pdf' }
	]
};
