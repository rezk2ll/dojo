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
		],
		steps: [
			{
				title: 'Compute the window keys',
				questions: [
					{ q: 'What does `key_and_expiry` add to the counter key?', options: ['The client IP', '`(time / period).to_i`, the window number', 'A random nonce', 'The full Unix time'], answer: 1, why: 'Each period gets its own counter, named by the integer division of the time by the period.' },
					{ q: 'What is 1,000,019 / 20, as an integer division?', options: ['50,001', '50,000.95', '50,000', '50,019'], answer: 2, why: '20 × 50,000 is 1,000,000, and 19 more does not reach the next multiple.' },
					{ q: 'And 1,000,020 / 20?', options: ['50,001', '50,000', '50,002', '50,020'], answer: 0, why: '1,000,020 is exactly 20 × 50,001, the start of a new window.' },
					{ q: 'What happens to the counter at the start of a new window?', options: ['It keeps the old count', 'It halves', 'It doubles the limit', 'A new key starts at 0'], answer: 3, why: 'A fixed window starts again at each multiple of the period. The old key just expires.' }
				]
			},
			{
				title: 'Count part 1',
				questions: [
					{ q: 'With `limit: 5`, which request in a window is the first to get `429`?', options: ['The 5th', 'The 6th', 'The 4th', 'The 20th'], answer: 1, why: 'Line 19 throttles when `count > current_limit`. A count of 5 is not above 5.' },
					{ q: 'The first burst of 5 lands in window 50,000. How many pass?', options: ['4', '0', '1', '5'], answer: 3, why: 'Counts 1 to 5 are all at or below the limit.' },
					{ q: 'The second burst of 5 lands in window 50,001. How many pass?', options: ['5', '0', '1', '4'], answer: 0, why: 'It is a new counter, so the second burst also counts from 1 to 5.' },
					{ q: 'So how many of the 10 attempts reach the app, and over what time?', options: ['5, over 20 seconds', '6, over 1 second', '10, within about one second', '10, over 40 seconds'], answer: 2, why: 'The two bursts straddle a window edge, so a fixed window lets twice the limit through in about a second.' }
				]
			},
			{
				title: 'Read the part 2 traffic',
				questions: [
					{ q: '50,000 IPs each send one login. What does each `logins/ip` counter reach?', options: ['1', '5', '50,000', '6'], answer: 0, why: 'The throttle counts per discriminator, and each IP sends only one request.' },
					{ q: 'Each request is for a different account. What does each `logins/email` counter reach?', options: ['5', '50,000', '0', '1'], answer: 3, why: 'One try per account, so every email counter stays at 1.' },
					{ q: 'So how many requests get `429`?', options: ['45,000', 'None', 'All of them after the 5th', 'Half'], answer: 1, why: '`count > 5` is false for every counter. The rate limit does not see this attack.' },
					{ q: 'What is this attack called?', options: ['Password spraying', 'Session fixation', 'Credential stuffing', 'Account lockout'], answer: 2, why: 'Credential stuffing tries username and password pairs from another site’s breach, one per account.' }
				]
			},
			{
				title: 'Pick the defences',
				questions: [
					{ q: 'Which defence does the OWASP Credential Stuffing cheat sheet name first?', options: ['Multi-factor authentication', 'A lower throttle limit', 'Longer usernames', 'Blocking all foreign IPs'], answer: 0, why: 'A reused password is not enough when a second factor is required.' },
					{ q: 'What does OWASP also list, which acts on the password itself?', options: ['Forcing a password change every 30 days', 'Hashing passwords twice', 'Hiding the login form', 'Checking passwords against breached lists such as Pwned Passwords'], answer: 3, why: 'A password already in a breach list is the exact password this attack uses.' },
					{ q: 'What did the ICO name as missing in the 23andMe fine?', options: ['A CAPTCHA', 'A per-IP throttle', 'Mandatory multi-factor authentication', 'A web application firewall'], answer: 2, why: 'The ICO listed missing "mandatory multi-factor authentication, secure password protocols, or unpredictable usernames".' },
					{ q: 'Why not just lower `logins/email` to 1 attempt per window?', options: ['Rack::Attack does not allow it', 'It still counts 1 per account, and lets an attacker lock real users out', 'It would slow down the cache', 'It only works with `GET`'], answer: 1, why: 'Stuffing sends one try per account anyway, and a tight per-account limit lets anyone who knows an email keep its owner out.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Build the same fixed-window counter as Rack::Attack and watch it let 10 attempts through at a window edge, miss one-try-per-account traffic, and lock a real user out.',
		steps: [
			'Make a folder: `mkdir -p ~/throttle-lab && cd ~/throttle-lab`.',
			'Write `throttle.py` with a function `allowed(name, key, now, limit=5, period=20)`. It counts under the key `name:key:now // period`, increments before it compares, and returns whether the count is at most the limit.',
			'Replay part 1: `python3 -c \'from throttle import allowed; print(sum(allowed("logins/email", "ann@example.com", t) for t in [1000019]*5 + [1000020]*5))\'`.',
			'Replay part 2, one try per IP and per account: `python3 -c \'from throttle import allowed; print(sum(allowed("logins/ip", f"10.0.{i // 256}.{i % 256}", 1000000) and allowed("logins/email", f"user{i}@example.com", 1000000) for i in range(50000)))\'`.',
			'Lock Ann out: `python3 -c \'from throttle import allowed; [allowed("logins/email", "ann@example.com", 1000000) for _ in range(6)]; print(allowed("logins/email", "ann@example.com", 1000005))\'`.'
		],
		done: [
			'Part 1 prints `10`.',
			'Part 2 prints `50000`: no request is throttled.',
			'The lockout check prints `False`: Ann’s own login 5 seconds later is refused.'
		],
		solution: [
			'`counts = Counter()` from `collections`, then in `allowed`: `k = f"{name}:{key}:{now // period}"`, `counts[k] += 1`, `return counts[k] <= limit`.',
			'Part 1 passes 10 because 1000019 and 1000020 fall in windows 50000 and 50001, each with its own counter.',
			'Part 2 passes all 50,000 because every counter stays at 1. Only MFA or a breached-password check acts on that traffic.',
			'The lockout works because the counter is keyed by the email, not by who sends the request. Clean up with `rm -rf ~/throttle-lab`.'
		]
	},
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
