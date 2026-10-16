const PM = 'https://www.heroku.com/blog/april-2022-incident-review/';
const STATUS = 'https://status.heroku.com/incidents/2413';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'heroku-tokens-2022',
	part: 'Security',
	title: 'Heroku 2022: stolen GitHub OAuth tokens',
	minutes: 10,
	hook: [
		'Wednesday 13 April 2022. GitHub notifies Heroku’s security team of a potential security issue it found the day before.',
		'GitHub’s report: on 9 April, a threat actor downloaded a subset of Heroku’s private GitHub repositories, with some Heroku source code. The download went through one Heroku user’s OAuth token.',
		'Heroku customers can connect a GitHub repository to an app and deploy from it. For that, the Heroku Dashboard stores an OAuth token for each connected customer.'
	],
	terms: [
		{ term: 'OAuth token', def: 'A token GitHub issues to an app like Heroku, so the app can act on a user’s repositories without the user’s password.' },
		{ term: 'machine account', def: 'An account used by software instead of a person, with its own token, for example to let one internal system call another.' },
		{ term: 'hashed and salted', def: 'A password stored as the output of a one-way function, mixed with a random value per user, so equal passwords give different stored values.' },
		{ term: 'config var', def: 'A Heroku setting that an app reads as an environment variable. Customers keep secrets in config vars.' }
	],
	incident: {
		org: 'Heroku',
		title: 'April 2022 Incident Review',
		date: '2022-04-07',
		url: PM,
		steps: [
			{
				situation: [
					'13 April. You know which Heroku user’s OAuth token the attacker used to download Heroku’s private repositories. You do not know yet how it was stolen.'
				],
				q: 'What do you do first?',
				options: [
					'Ask GitHub for the full audit logs and wait for them before acting',
					'Make every Heroku repository read-only on GitHub until the review ends',
					'Disable that user’s OAuth token and GitHub account right away',
					'Email all Heroku employees to change their GitHub passwords'
				],
				answer: 2,
				why: 'The token is the attacker’s known way in. Heroku did this "within three hours" of GitHub’s notice, then started to look for how the token was compromised.'
			},
			{
				situation: [
					'GitHub also reports that the attacker is listing customers’ GitHub accounts with OAuth tokens issued to the Heroku Dashboard integration. These tokens may give read and write access to customers’ connected repositories.',
					'15 April. You tell customers and recommend that they disconnect Heroku from GitHub themselves. You still do not know how the attacker got the customer tokens.'
				],
				q: 'What do you do about the customer tokens?',
				options: [
					'Revoke every Heroku integration token and stop issuing new ones',
					'Revoke only the tokens of customers who report strange activity',
					'Keep the tokens and log every call made with them to spot misuse',
					'Wait until GitHub sends the list of tokens the attacker has used'
				],
				answer: 0,
				why: 'Heroku cannot tell which stored tokens the attacker holds, so every one is suspect. On 16 April at 5:00 p.m. PT it finished revoking all of them and blocked new ones. The cost: no deploys from GitHub through the Dashboard or automation, no new Review Apps, and no new Heroku CI runs.'
			},
			{
				situation: [
					'23 April. Customers still cannot deploy from GitHub. Heroku has not finished its investigation and does not know when reconnecting will be safe.'
				],
				q: 'What do you tell them?',
				options: [
					'That the integration returns within 48 hours, so they can plan for it',
					'That they can reconnect GitHub at their own risk with a new token',
					'That it is coming soon, without a date, and to watch the status page',
					'To deploy another way, like `git push heroku main`, and not wait'
				],
				answer: 3,
				why: 'A date you cannot promise leaves customers blocked when it slips. On 23 April Heroku wrote that it would not reconnect "until we are certain that we can do so safely, which may take some time", and pointed to `git push heroku main`. The integration came back on 25 May.'
			},
			{
				situation: [
					'The investigation finds the first way in: a compromised token for a Heroku machine account. The attacker found it in an archived private GitHub repository with Heroku source code.',
					'The attacker most likely reached that repository through a third-party integration connected to it. Heroku cannot confirm which one.'
				],
				q: 'What do you do about that machine account?',
				options: [
					'Delete the archived repository so nobody can read the token in it again',
					'Rotate its token and the credentials of other critical accounts',
					'Move the archived repository to a GitHub organization with no integrations',
					'Turn on branch protection so nobody can push to the archived repository'
				],
				answer: 1,
				why: 'The attacker already has a copy of the token, so hiding the repository changes nothing until the token is revoked. Heroku "disabled or rotated credentials of other critical accounts" and started reviewing its third-party integrations, "removing any that are not aligned with our security standards".'
			},
			{
				situation: [
					'The same machine account token was used to exfiltrate data from the database of customer usernames and passwords. The passwords are hashed and salted.',
					'Not every customer has multi-factor authentication (MFA) on their Heroku account.'
				],
				q: 'What do you do about customer passwords?',
				options: [
					'Nothing, because hashed and salted passwords cannot be read',
					'Reset the passwords of the customers who have no MFA, and only those',
					'Reset every customer’s password and refresh affected credentials',
					'Email customers a tip to change their password if they want to'
				],
				answer: 2,
				why: 'An attacker with the hashes can try guesses offline, as fast as their hardware allows. Heroku reset all customer accounts by 5 May "due to not all of the customers having multi-factor authentication (MFA) enabled at the time and potential for password reuse."'
			}
		],
		outcome: [
			'On 7 April 2022, an attacker used a compromised Heroku machine account token to reach a Heroku database and download the customers’ GitHub integration OAuth tokens. On 8 April they listed metadata about customer repositories, and on 9 April they downloaded Heroku’s private repositories.',
			'According to GitHub, the attacker also cloned private repositories of a small number of Heroku customers. On 7 April they also downloaded a database of pipeline-level config vars for Review Apps and Heroku CI, found on 16 May and reported to those customers on 18 May.',
			'The attacker reached the encrypted config vars of Heroku apps, but "did not access the encryption key necessary to decrypt config var secrets." Heroku has no evidence of unauthorized access to its systems after 14 April 2022.',
			'Heroku called it a supply-chain type attack. It put a production moratorium in place, rotated and re-encrypted credentials and keys, shut down non-essential systems, and restored the GitHub integration with new tokens on 25 May.'
		]
	},
	quiz: [
		{
			q: 'What could the attacker do with a customer’s stolen Heroku integration OAuth token?',
			options: [
				'Log in to the customer’s Heroku account and change their apps',
				'Read and possibly write the customer’s GitHub repos connected to Heroku',
				'Read the customer’s config vars by asking Heroku’s API with the token',
				'Reset the customer’s GitHub password through the account recovery page'
			],
			answer: 1,
			why: 'The token is a GitHub credential that Heroku stored. Heroku’s status page: "The compromised tokens could provide the threat actor access to customer GitHub repos, but not customer Heroku accounts."'
		},
		{
			q: 'The stolen customer passwords were hashed and salted. Why did Heroku still reset all of them?',
			options: [
				'The salt was stored in the same table, which made the hashes readable',
				'The hash function was MD5, which anyone can reverse in seconds',
				'GitHub asked every integrator to reset passwords after the attack',
				'Some customers had no MFA, and a guessed password may be reused elsewhere'
			],
			answer: 3,
			why: 'With the hashes, an attacker can try guesses offline, one salt at a time. A guessed password logs straight in where MFA is off, and works on other sites where the customer reused it.'
		},
		{
			q: 'The attacker reached Heroku’s encrypted config vars too. Why could they not read the secrets?',
			options: [
				'They never got the encryption key needed to decrypt the config vars',
				'Heroku deleted the config vars before the attacker could copy them',
				'The config vars were stored in a region the attacker could not reach',
				'Each config var expired an hour after it was set, before the copy'
			],
			answer: 0,
			why: 'Encryption at rest protects data only while the key stays out of the attacker’s hands. Heroku’s status update: the threat actor "did not access the encryption key necessary to decrypt config var secrets."'
		}
	],
	recall: {
		q: 'How did the attacker first get into Heroku’s environment in April 2022?',
		a: 'With a compromised token for a Heroku machine account, found in an archived private GitHub repository of Heroku source code, probably reached through a third-party integration.'
	},
	sources: [
		{ title: 'Heroku, April 2022 Incident Review (14 June 2022)', url: PM },
		{ title: 'Heroku Status, incident 2413: Heroku Security Notification (updates from 15 April to 14 June 2022)', url: STATUS },
		{ title: 'OWASP, Password Storage Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html' }
	]
};
