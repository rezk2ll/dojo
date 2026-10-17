const RA = 'https://github.com/rack/rack-attack/blob/b771ea18afb9e6b625906a641d2d331e6d0c282b';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'login-rate-limit',
	part: 'Identity',
	title: 'Slowing down guessing',
	minutes: 10,
	hook: [
		'On 1 October 2023, someone posted online a claim to have 23andMe users’ profile information. In its SEC filing of 1 December 2023, 23andMe wrote that the attacker got into 0.1% of user accounts, those whose username and password "were the same as those used on other websites that had been previously compromised". From those accounts, the attacker reached files about other users who had opted in to the DNA Relatives feature.',
		'The UK Information Commissioner’s Office fined 23andMe £2.31 million on 17 June 2025. It found that the credential stuffing ran between April and September 2023 and reached data on 155,592 UK residents. The ICO listed missing "mandatory multi-factor authentication, secure password protocols, or unpredictable usernames".',
		'In credential stuffing, each account gets one try, with a password its owner used on another site. A rule that locks an account after 5 wrong passwords never fires on that traffic. Below: how Rack::Attack counts login attempts per IP and per account, what each counter catches, and how a per-account limit lets an attacker lock a real user out.'
	],
	terms: [
		{ term: 'Credential stuffing', def: 'Trying username and password pairs taken from the breach of another site (OWASP). It works on every user who reused a password.' },
		{ term: 'Discriminator', def: 'In Rack::Attack, the value a throttle counts by: the client IP, a normalized email, or anything the block returns. A `nil` discriminator means the request is not counted.' },
		{ term: 'Fixed window', def: 'A counter that starts again at each multiple of the period. With a 20-second period, Unix times 1,000,000 to 1,000,019 share one counter, and 1,000,020 starts a new one.' },
		{ term: 'Account lockout', def: 'Refusing logins for an account after a number of failed attempts within an observation window, for a lockout duration (OWASP Authentication Cheat Sheet).' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["POST /login from 203.0.113.7, email Ann@Example.com"] --> ra["Rack::Attack middleware, before the app"]'],
				highlight: ['req', 'ra'],
				note: 'Rack::Attack sits in front of the app as Rack middleware. For each request, `call` checks the safelists, then the blocklists, then the throttles, and only then passes the request to the app.'
			},
			{
				add: ['ra --> ipkey["logins/ip counter: 203.0.113.7"]', 'ra --> emkey["logins/email counter: ann@example.com"]'],
				highlight: ['ipkey', 'emkey'],
				note: 'The example configuration defines two throttles on `POST /login`, each with `limit: 5, period: 20.seconds`. One counts by `req.ip`, the other by the email parameter, lowercased with spaces removed. The same request adds 1 to both counters.'
			},
			{
				add: ['emkey --> count["store.increment(key), count 6 in this window"]', 'count -->|"count above limit 5"| deny["429 Retry later, the app never runs"]'],
				highlight: ['count', 'deny'],
				note: 'The cache store increments the counter for the current window. When the count is above the limit, Rack::Attack answers `429` with the body `Retry later`. The login code and its password hashing do not run.'
			},
			{
				add: ['bots["Many IPs, one stolen pair per account"] -->|"1 request per IP, 1 per email"| pass["Both counters stay at 1"]'],
				highlight: ['bots', 'pass'],
				note: 'A credential stuffing run sends one request per account and spreads them over many addresses. OWASP: proxy networks "may defeat both IP block-lists and rate limiting, as per IP request volume may remain relatively low". Every counter stays under 5.'
			},
			{
				add: ['mal["Attacker sends 6 wrong passwords for ann@example.com"] --> locked["Ann gets 429 until the window ends"]'],
				highlight: ['mal', 'locked'],
				note: 'The per-email counter does not know who is typing. The example configuration warns that "a malicious user could intentionally throttle logins for another user". OWASP suggests letting the forgotten password flow work while an account is locked.'
			}
		]
	},
	example: {
		title: 'lib/rack/attack/throttle.rb: Rack::Attack’s matched_by?',
		repo: 'rack/rack-attack',
		url: `${RA}/lib/rack/attack/throttle.rb#L25-L49`,
		lang: 'ruby',
		code: `      def matched_by?(request)
        discriminator = discriminator_for(request)
        return false unless discriminator

        current_period  = period_for(request)
        current_limit   = limit_for(request)
        count           = cache.count("#{name}:#{discriminator}", current_period)

        data = {
          discriminator: discriminator,
          count: count,
          period: current_period,
          limit: current_limit,
          epoch_time: cache.last_epoch_time
        }

        annotate_request_with_throttle_data(request, data)

        (count > current_limit).tap do |throttled|
          if throttled
            annotate_request_with_matched_data(request, data)
            Rack::Attack.instrument(request)
          end
        end
      end`,
		notes: [
			'Line 2 runs the throttle’s block. Line 3 skips the request when the block returns `nil`, which is how a login throttle ignores every request that is not `POST /login`. Before line 2 returns, the [default normalizer](' + RA + '/lib/rack/attack.rb#L92-L94) applies `to_s.strip.downcase` to the discriminator.',
			'Line 7 counts under the key `name:discriminator`. [`key_and_expiry`](' + RA + '/lib/rack/attack/cache.rb#L73-L78) adds `(@last_epoch_time / period).to_i` to the key, so each period gets its own counter, and sets it to expire at the end of the period plus 1 second.',
			'Line 19 throttles when `count > current_limit`: with `limit: 5`, requests 1 to 5 in a window pass and the 6th gets `429`. The increment on line 7 runs before this comparison, so successful logins and throttled requests are counted too.',
			'The counter lives in the cache store, not in the Ruby process. The [README](' + RA + '/README.md#L315) warns that an in-memory store is "mostly ineffective" with several processes, since each one keeps its own counts.'
		]
	},
	tradeoff: {
		gain: [
			'A single machine gets at most 5 login attempts per 20 seconds, which is 900 per hour, under the `logins/ip` throttle.',
			'The `logins/email` throttle caps guesses against one account at the same rate, however many IPs the attacker uses.',
			'A throttled request gets `429` before the app runs, so it costs no password hash and no database query.'
		],
		cost: [
			'Credential stuffing sends one request per account from many IPs, so neither counter reaches its limit.',
			'Anyone who knows a user’s email can send 6 bad passwords per window and keep that user out.',
			'A fixed window resets at each multiple of the period, so a client can send 5 requests at the end of one window and 5 more a second later.'
		]
	},
	task: {
		prompt: 'Your app uses the `logins/email` throttle: `limit: 5, period: 20.seconds`.\n\nPart 1. An attacker sends 5 login attempts for `ann@example.com` at Unix time 1,000,019 and 5 more at 1,000,020. How many reach the app, and why?\n\nPart 2. Next week, 50,000 different IPs each send one login for a different account, every one with a password leaked from another site. What do the two throttles see, and which defences from this chapter’s sources act on this traffic?',
		hint: 'The key holds `Time.now.to_i / period`, an integer division. Compute it for both times. For part 2, count requests per IP and per email.',
		answer: [
			'Part 1: 1,000,019 / 20 is 50,000 and 1,000,020 / 20 is 50,001. The two bursts land in two windows, each with its own counter, and each counter reaches 5, which is not above the limit. All 10 attempts reach the app within about one second.',
			'Part 2: every IP counter and every email counter is at 1, so nothing is throttled. The rate limit does not see this attack.',
			'The OWASP Credential Stuffing cheat sheet names multi-factor authentication first and also lists checking passwords against breached password lists such as Pwned Passwords. The ICO named missing mandatory MFA in the 23andMe fine.'
		]
	},
	quiz: [
		{
			q: 'A throttle has `limit: 5, period: 20`. How many requests from one IP reach the app within one 20-second window?',
			options: ['4', '5', '6', '20'],
			answer: 1,
			why: '`matched_by?` returns true when `count > current_limit`. Counts 1 to 5 are not above 5, so they pass. The 6th request makes the count 6 and gets `429`.'
		},
		{
			q: 'A credential stuffing run uses 10,000 IPs and tries each stolen pair once. Why do the `logins/ip` and `logins/email` throttles not fire?',
			options: [
				'Rack::Attack skips throttles for requests that carry a valid password',
				'Each IP and each email reaches a count of 1, below the limit of 5',
				'The attacker sends the requests with a `GET` instead of a `POST`',
				'The cache store drops counters when more than 1,000 keys exist'
			],
			answer: 1,
			why: 'Each throttle counts per discriminator. With one request per IP and one per account, every counter stays at 1, and the limit check `count > 5` is false for all of them.'
		},
		{
			q: 'The `logins/email` throttle allows 5 attempts per 20 seconds. What can an attacker who knows Ann’s email do with it?',
			options: [
				'Read Ann’s password from the 429 response body',
				'Keep Ann out by sending 6 bad passwords every window',
				'Raise the limit for Ann’s email to 100 attempts',
				'Reset Ann’s password through the throttle counter'
			],
			answer: 1,
			why: 'The counter is keyed by the email, not by who sends the request. Once the attacker pushes it to 6, Ann’s own correct login in that window also gets `429`.'
		}
	],
	recall: {
		q: 'Why does a per-account login limit not stop credential stuffing, and what risk does it add?',
		a: 'Credential stuffing tries each account once, so a per-account count stays at 1. Because the count is keyed by the account and not by the sender, anyone can push it over the limit and keep the real user out.'
	},
	sources: [
		{ title: '23andMe, Form 8-K/A of 1 December 2023', url: 'https://www.sec.gov/Archives/edgar/data/1804591/000119312523287449/d242666d8ka.htm' },
		{ title: 'ICO, 23andMe fined £2.31 million for failing to protect UK users’ genetic data', url: 'https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/06/23andme-fined-for-failing-to-protect-uk-users-genetic-data/' },
		{ title: 'Rack::Attack, example configuration', url: `${RA}/docs/example_configuration.md` },
		{ title: 'OWASP, Credential Stuffing Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html' },
		{ title: 'OWASP, Authentication Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html' }
	]
};
