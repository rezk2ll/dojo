const PM = 'https://blog.cloudflare.com/thanksgiving-2023-security-incident/';
const OKTA = 'https://blog.cloudflare.com/how-cloudflare-mitigated-yet-another-okta-compromise/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cloudflare-okta-2023',
	part: 'Security',
	title: 'Cloudflare 2023: the credentials left over from the Okta breach',
	minutes: 10,
	hook: [
		'Wednesday 18 October 2023. You are on Cloudflare\'s security team. Someone attacks your systems, and you trace it back to Okta.',
		'An attacker got into Okta\'s customer support system. From a support ticket that a Cloudflare employee created, the attacker took a session token and used it to reach Cloudflare\'s own Okta instance.',
		'Your team detects it more than 24 hours before Okta tells you, and contains it. The attacker saw a set of Cloudflare credentials. Now you have to replace them. (All times in this chapter are UTC.)'
	],
	terms: [
		{ term: 'Service account', def: 'An account that a program uses instead of a person, for example the account a SaaS tool uses to read and write Jira tickets.' },
		{ term: 'Credential rotation', def: 'Replacing a password, token or key with a new one and revoking the old one, so a copy of the old one stops working.' },
		{ term: 'Persistence', def: 'A way back in that an attacker sets up so that removing the first stolen account does not lock them out, such as a second account or an installed program.' },
		{ term: 'C2', def: 'Command and control: a program on a hacked machine that connects to the attacker\'s server and runs the commands it receives.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Thanksgiving 2023 security incident',
		date: '2023-11-23',
		url: PM,
		steps: [
			{
				situation: [
					'The list of credentials to rotate has thousands of entries. Among them are credentials of integrations: a Moveworks service token, a Smartsheet service account with admin access to Jira, a Bitbucket service account and an AWS account.',
					'Some of these integration credentials look unused.'
				],
				q: 'Which credentials do you rotate?',
				options: [
					'Only the ones that logged in during the last 30 days',
					'Only the ones that belong to people',
					'Every credential on the list, including the ones that look unused',
					'Only the ones with admin access'
				],
				answer: 2,
				why: 'Cloudflare "failed to rotate one service token and three service accounts (out of thousands)". They "were not rotated because mistakenly it was believed they were unused". From 14 November the attacker used them to probe Cloudflare, and on 15 November to get into Jira and Confluence.'
			},
			{
				situation: [
					'Thursday 23 November, Thanksgiving Day. At 15:58, someone adds the Smartsheet service account to an administrator group in Atlassian. An automated alert about the change reaches the security team at 16:00.',
					'At 16:12, the security operations center (SOC) starts to investigate.'
				],
				q: 'What do you do first?',
				options: [
					'Deactivate the Smartsheet service account',
					'Watch the account for a day to learn what the attacker wants',
					'Force a password reset for every employee',
					'Email Smartsheet and ask them to check their systems'
				],
				answer: 0,
				why: 'The SOC deactivated the Smartsheet service account at 16:35, 35 minutes after the alert. The account had admin access to Jira, and the attacker had just added it to an administrator group.'
			},
			{
				situation: [
					'At 16:35 the Smartsheet account is off. It had admin access to Jira.'
				],
				q: 'What do you look for next?',
				options: [
					'Nothing: the stolen account is off, so you close the alert',
					'Accounts, groups and plugins that the stolen account created or changed',
					'A new API key for Smartsheet, so the integration works again',
					'A list of customers to warn about a breach of their data'
				],
				answer: 1,
				why: 'At 17:23 the SOC found and deactivated an Atlassian user that the attacker had created on 16 November. It "looked like a normal Cloudflare user" and sat in several groups "should the Smartsheet service account be removed". On 22 November the attacker had also installed Sliver, a C2 framework, through the ScriptRunner for Jira plugin.'
			},
			{
				situation: [
					'The internal incident is declared at 17:43, and firewall rules block the attacker\'s known IP addresses at 21:31. On 24 November, the last attacker activity is at 10:44 and Sliver is removed at 11:59.',
					'The logs show that the attacker viewed 120 of your 11,904 code repositories. On 76 of them, the attacker used the Bitbucket git archive feature to download them to the Atlassian server. You cannot confirm whether the archives left the server.'
				],
				q: 'How do you treat the 76 repositories?',
				options: [
					'As safe, since nothing shows that they left the server',
					'As public, so you open-source all 76 at once',
					'As lost, so you delete them and restore from backup',
					'As stolen, so you search them for secrets and rotate those'
				],
				answer: 3,
				why: 'Cloudflare "decided to treat them as having been exfiltrated". The team searched the 76 repositories for embedded secrets and rotated them, even the ones that were already "strongly encrypted". Cloudflare wrote that it worried less about the code itself than about "embedded secrets (such as a key or token) and vulnerabilities".'
			},
			{
				situation: [
					'The attacker searched the wiki for "remote access, secret, client-secret, openconnect, cloudflared, and token". They read Jira tickets about vulnerability management, secret rotation, MFA bypass, network access and the response to the Okta incident. Their access stayed inside the Atlassian suite and its server.',
					'From the Atlassian server, they also tried to reach a console server in a São Paulo data center that was not yet in production. The access was denied.'
				],
				q: 'How far does the clean up go?',
				options: [
					'Rotate the secrets found in Atlassian and rebuild the Atlassian server',
					'Rotate every production credential and reimage every machine',
					'Rebuild the Atlassian server and leave the rest in place',
					'Reset the passwords of the employees whose tickets were read'
				],
				answer: 1,
				why: 'Cloudflare aimed "to prevent the attacker from using the technical information about the operations of our network as a way to get back in". It rotated more than 5,000 production credentials, ran forensic triage on 4,893 systems and reimaged every machine in its global network. The São Paulo equipment went back to its manufacturers, and Cloudflare replaced it.'
			}
		],
		outcome: [
			'The root cause was one service token and three service accounts that Cloudflare did not rotate after the Okta breach of October 2023, because it believed they were unused. The Moveworks token let the attacker authenticate through Cloudflare\'s gateway, and the Smartsheet account had admin access to Jira.',
			'The attacker read 36 of 2,059,357 Jira tickets and 202 of 194,100 wiki pages, viewed 120 repositories and archived 76. Cloudflare saw no access to its global network or to customer data. Cloudflare believes a nation state carried out the attack.',
			'CrowdStrike\'s forensic team joined on 26 November. Its independent analysis "did not bring to light any activities that we had missed" and put the last attacker activity at 10:44 on 24 November.',
			'From 27 November to 5 January, a large part of Cloudflare\'s technical staff worked on "Code Red". They rotated over 5,000 credentials, physically split test and staging systems, reimaged every machine and deleted all HAR files uploaded to the wiki in case they held tokens.'
		]
	},
	quiz: [
		{
			q: 'Why did the attacker create an Atlassian user that looked like a normal employee?',
			options: [
				'To read tickets that the Smartsheet account could not see',
				'To keep access if the Smartsheet service account was removed',
				'To pass the hard security key check',
				'To send phishing emails from inside Jira'
			],
			answer: 1,
			why: 'The second account was persistence. When the SOC turned off the Smartsheet account at 16:35, this user stayed active until the SOC found and deactivated it at 17:23.'
		},
		{
			q: 'The stolen Smartsheet credential was a service account. Why did it matter that it had admin access to Jira?',
			options: [
				'Admin access let it read the Okta logs',
				'Admin access gave it a login to the São Paulo data center',
				'Admin access let it turn off the automated alerts',
				'Admin access let it create users and install Sliver'
			],
			answer: 3,
			why: 'With admin rights in Jira, the attacker created a user, added it to groups, and installed Sliver with ScriptRunner for Jira. Cloudflare: "Since the Smartsheet service account had administrative access to Atlassian Jira, the threat actor was able to install the Sliver Adversary Emulation Framework".'
		},
		{
			q: 'Cloudflare deleted every HAR file uploaded to its wiki. What is the risk in a HAR file?',
			options: [
				'It can hold the browser\'s session tokens',
				'It runs scripts when someone opens it',
				'It holds the full source code of the web page',
				'It stores the user\'s hard security key'
			],
			answer: 0,
			why: 'A HAR file is a browser\'s network log. Exported "with sensitive data", it keeps headers such as `Cookie` and `Authorization`. The Okta breach started with a session token taken from a file uploaded to a support ticket, so Cloudflare deleted HAR files "in case they contained tokens of any sort".'
		}
	],
	recall: {
		q: 'How did the attacker get into Cloudflare\'s Atlassian systems in November 2023?',
		a: 'With one service token (Moveworks) and three service accounts (Smartsheet, Bitbucket, AWS) leaked in the October 2023 Okta breach, which Cloudflare did not rotate because it believed they were unused.'
	},
	sources: [
		{ title: 'Cloudflare Blog, Thanksgiving 2023 security incident', url: PM },
		{ title: 'Cloudflare Blog, How Cloudflare mitigated yet another Okta compromise', url: OKTA },
		{ title: 'Chrome DevTools, Network features reference (Save all network requests to a HAR file)', url: 'https://developer.chrome.com/docs/devtools/network/reference' }
	]
};
