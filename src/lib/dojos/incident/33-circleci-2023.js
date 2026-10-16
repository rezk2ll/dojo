const PM = 'https://circleci.com/blog/jan-4-2023-incident-report/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'circleci-2023',
	part: 'Security',
	title: 'CircleCI 2023: a stolen session and every customer secret',
	minutes: 10,
	hook: [
		'Thursday 29 December 2022. A CircleCI customer reports suspicious GitHub OAuth activity. CircleCI holds a GitHub OAuth token on behalf of each customer who connects GitHub.',
		'CircleCI also stores what customers’ pipelines need to reach other systems: environment variables, API tokens, SSH keys and AWS keys.',
		'CircleCI’s security team starts a review with GitHub. Nobody knows yet whether one customer or all of them are exposed.'
	],
	terms: [
		{ term: 'SSO session', def: 'The cookie a single sign-on provider gives the browser after a login, including the 2FA step. Any browser that sends this cookie is treated as logged in.' },
		{ term: 'OAuth token', def: 'A token that lets CircleCI act on a customer’s GitHub account, for example to read their repositories.' },
		{ term: 'exfiltration', def: 'Copying data out of a company’s systems to a place the attacker controls.' },
		{ term: 'rotate', def: 'Replace a secret with a new one at the system it unlocks, and revoke the old one there.' }
	],
	incident: {
		org: 'CircleCI',
		title: 'CircleCI Jan 4, 2023 security incident report',
		date: '2022-12-16',
		url: PM,
		steps: [
			{
				situation: [
					'30 December 2022. The review finds that this customer’s GitHub OAuth token was compromised by an unauthorized third party. The customer has already fixed it on their side.',
					'You do not know whether other customers are affected. Rotating every customer’s GitHub token goes through GitHub’s API rate limits and takes time.'
				],
				q: 'What do you do now?',
				options: [
					'Rotate every customer’s GitHub OAuth token, and widen the investigation',
					'Close the case, since the customer fixed it and the leak may be on their side',
					'Email this one customer a checklist for rotating their other secrets',
					'Turn off the GitHub integration for all customers until the review ends'
				],
				answer: 0,
				why: 'A stolen token stored by CircleCI could mean CircleCI itself leaked it, so every token is suspect. On 31 December, "out of an abundance of caution", CircleCI started rotating all GitHub OAuth tokens. The rotation finished on 7 January at 07:30 UTC.'
			},
			{
				situation: [
					'4 January 2023. The investigation finds the entry path. Malware on a CircleCI engineer’s laptop stole a valid, 2FA-backed SSO session. The antivirus did not detect it.',
					'With that session, the attacker impersonated the engineer from a remote location. The engineer could generate production access tokens as part of the job.'
				],
				q: 'Whose access do you cut, and how far?',
				options: [
					'Make the engineer change their SSO password and enrol a new 2FA device',
					'Cut all of the engineer’s access, then production access for nearly everyone',
					'Block the attacker’s IP addresses at the firewall and keep every account open',
					'Cut the engineer’s production tokens only, so the rest of their work goes on'
				],
				answer: 1,
				why: 'The attacker acted as the engineer, so everything that account could reach was exposed. CircleCI shut down all access for the engineer at 16:35 UTC and production access for nearly all employees at 18:30 UTC, though it had no evidence that anyone else was compromised.'
			},
			{
				situation: [
					'The attacker reached a subset of production systems. Data was exfiltrated on 22 December, and the attacker extracted encryption keys from a running process.',
					'Any production host the attacker touched may still run something planted there.'
				],
				q: 'What do you do with the production hosts?',
				options: [
					'Run the antivirus on each host and keep the ones that come back clean',
					'Reboot every host so any process the attacker started is killed',
					'Replace every potentially exposed host with a freshly built one',
					'Leave them running and watch their traffic to learn what the attacker does'
				],
				answer: 2,
				why: 'The same antivirus had missed the malware on the laptop. CircleCI rotated all potentially exposed production hosts by 22:30 UTC on 4 January, after which it was "confident that we had eliminated both the attack vector and the potential of a lingering corrupted host."'
			},
			{
				situation: [
					'The exfiltrated data includes customers’ environment variables, tokens and keys. It was encrypted at rest, but the attacker has the keys from the running process.',
					'You cannot see whether the attacker has used any of those secrets on the customers’ own systems.'
				],
				q: 'What do you tell customers?',
				options: [
					'Nothing yet: wait until forensics can name the customers whose secrets were used',
					'Warn only the customers who report suspicious activity on their own systems',
					'Tell everyone to delete the secrets they stored in CircleCI as soon as possible',
					'Tell everyone to assume their stored secrets leaked and rotate them at the source'
				],
				answer: 3,
				why: 'A key deleted from CircleCI still works wherever it unlocks something. CircleCI disclosed at 02:30 UTC on 5 January and later wrote: "you should rotate keys at the source (the system to which they provide access) and then store the new secrets on CircleCI. Simply removing them from CircleCI is not enough."'
			},
			{
				situation: [
					'The host rotation is done, and only a very small group still has production access. That group needs to keep working, and an SSO session can be stolen again the same way.'
				],
				q: 'What do you add first for the people who keep production access?',
				options: [
					'A step-up authentication check each time they reach production',
					'A rule that they log in to SSO once a day instead of once a week',
					'A training session on spotting phishing emails and fake installers',
					'A longer password policy for their SSO accounts, with 20 characters'
				],
				answer: 0,
				why: 'A stolen session cookie skips the password and the 2FA it was issued after. CircleCI added "additional step-up authentication steps and controls" for production access, to prevent it "even in the case of a stolen 2FA-backed SSO session."'
			}
		],
		outcome: [
			'The laptop was compromised on 16 December 2022. The attacker did reconnaissance on 19 December and exfiltrated data on 22 December, the last unauthorized activity CircleCI found in production.',
			'CircleCI revoked all Project API Tokens on 5 January at 03:26 UTC and all Personal API Tokens created before 5 January on 6 January. It rotated Bitbucket tokens with Atlassian and worked with AWS to notify customers whose AWS keys may have leaked.',
			'At the time of the report, fewer than 5 customers had told CircleCI of unauthorized access to third-party systems. CircleCI cannot know how many secrets were used, because they unlock systems it does not run.',
			'The fixes listed: detection and blocking of this malware’s behaviour on laptops, production access limited to very few employees with step-up authentication, periodic automatic OAuth token rotation, and a move from OAuth to GitHub apps with finer permissions.'
		]
	},
	quiz: [
		{
			q: 'The engineer’s SSO login required 2FA. Why did 2FA not stop the attacker?',
			options: [
				'The attacker guessed the 2FA codes, since they changed only once a minute',
				'The malware stole the session cookie issued after the 2FA step had passed',
				'The SSO provider had a bug that let the attacker skip the 2FA screen',
				'The engineer approved a 2FA push sent by the attacker by mistake'
			],
			answer: 1,
			why: 'The report says the malware executed "session cookie theft". A session cookie proves a login already happened, 2FA included, so the attacker never faced the 2FA step.'
		},
		{
			q: 'Customer secrets were encrypted at rest. Why could the attacker still read them?',
			options: [
				'The encryption used a weak algorithm that the attacker broke offline',
				'The backups that the attacker copied were stored without encryption',
				'The attacker took the encryption keys from a running process that held them',
				'The secrets were logged in plain text by the builds that used them'
			],
			answer: 2,
			why: 'The keys sat in the memory of a running process, and the attacker had access to that host. The attacker "extracted encryption keys from a running process", which made the copied data readable.'
		},
		{
			q: 'Which change in your own pipelines leaves the least for an attacker to take from a CI provider like CircleCI?',
			options: [
				'Use OIDC tokens so no long-lived cloud credentials are stored in the CI',
				'Store each cloud key in two CI projects, so one can be rotated at a time',
				'Encrypt the environment variables in CI with a passphrase of your own',
				'Rotate the keys stored in CI once a year, before the yearly audit'
			],
			answer: 0,
			why: 'With OIDC, each job gets a token that expires one hour after it is issued, so the CI stores no long-lived credential to steal. CircleCI’s first recommendation: "Use OIDC tokens wherever possible to avoid storing long-lived credentials in CircleCI."'
		}
	],
	recall: {
		q: 'How did the attacker get into CircleCI’s production systems?',
		a: 'Malware on an engineer’s laptop, missed by the antivirus, stole a 2FA-backed SSO session on 16 December 2022. That engineer could generate production access tokens.'
	},
	sources: [
		{ title: 'CircleCI, Jan 4, 2023 security incident report', url: PM },
		{ title: 'CircleCI, security alert: Rotate any secrets stored in CircleCI (updates from 4 to 13 January 2023)', url: 'https://circleci.com/blog/january-4-2023-security-alert/' },
		{ title: 'CircleCI docs, Using OpenID Connect tokens in jobs', url: 'https://circleci.com/docs/guides/permissions-authentication/openid-connect-tokens/' }
	]
};
