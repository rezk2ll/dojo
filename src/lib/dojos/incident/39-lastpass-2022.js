const PM = 'https://blog.lastpass.com/posts/security-incident-update-recommended-actions';
const NOTICE = 'https://blog.lastpass.com/posts/notice-of-recent-security-incident';
const I1 = 'https://support.lastpass.com/s/document-item?bundleId=lastpass&topicId=LastPass/incident-1-details.html';
const I2 = 'https://support.lastpass.com/s/document-item?bundleId=lastpass&topicId=LastPass/incident-2-details.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'lastpass-2022',
	part: 'Security',
	title: 'LastPass 2022: a developer\'s home computer and the backup keys',
	minutes: 10,
	hook: [
		'Friday 12 August 2022. You are on the LastPass security team. An alert reports suspicious activity in a cloud development environment that engineers use for pre-production work and tests.',
		'Over the next 24 hours, you see access patterns that do not match the software engineer whose account made them. The engineer\'s corporate laptop has been compromised, and its EDR agent was tampered with and never fired.',
		'The development environment holds no customer data and no vaults. It is physically and logically separate from the production data centers.'
	],
	terms: [
		{ term: 'Master password', def: 'The one password a LastPass user types to open their vault. LastPass never stores it, and the vault key is derived from it on the user\'s device.' },
		{ term: 'PBKDF2', def: 'A function that turns a password into a key by hashing it many times. LastPass\'s default in 2022 was 100,100 iterations, so each guess costs an attacker 100,100 hashes.' },
		{ term: 'Keylogger', def: 'Malware that records every key a person types, including passwords.' },
		{ term: 'Decryption key', def: 'The secret that turns encrypted data back into readable data. An attacker who copies an encrypted file without its key gets only unreadable bytes.' }
	],
	incident: {
		org: 'LastPass',
		title: 'Security Incident Update and Recommended Actions',
		date: '2022-08-12',
		url: PM,
		steps: [
			{
				situation: [
					'The attacker took 14 of about 200 source code repositories between 8 and 12 August. Some held cleartext credentials and certificates for the development environment.',
					'Others held encrypted credentials used in production, for example for backups. They need a separate decryption key that neither the engineer nor the attacker had.'
				],
				q: 'What do you do with the encrypted production credentials?',
				options: [
					'Leave them, since the attacker cannot decrypt them',
					'Rotate them now, with the cleartext ones',
					'Rotate them only if they show up for sale online',
					'Encrypt them a second time with a new key'
				],
				answer: 1,
				why: 'The encrypted credentials stayed valid until LastPass reset them. LastPass later wrote that the attacker used information from the first incident "prior to the reset completed by our teams" to reach its cloud storage. In that second incident, the attacker got hold of the decryption keys.'
			},
			{
				situation: [
					'LastPass rebuilds the development environment from scratch over six weeks and replaces the engineer\'s laptop. The stolen documentation describes how the environment works.',
					'The decryption keys for the backup credentials live in two places: a secured orchestration platform and key-value store, and a restricted set of shared folders in a LastPass vault. Four DevOps engineers can open those folders.'
				],
				q: 'What do you do next?',
				options: [
					'Declare the incident closed, since the attacker is out',
					'Move the keys into the development environment you just rebuilt',
					'Reset the four engineers\' passwords and close the incident',
					'Treat the four engineers with key access as the next targets'
				],
				answer: 3,
				why: 'LastPass "declared this incident closed but later learned that information stolen in the first incident was used to identify targets and initiate the second incident." The attacker went after "one of the four DevOps engineers who had access to the decryption keys".'
			},
			{
				situation: [
					'From 12 August to 26 October, someone uses the valid credentials of a senior DevOps engineer to read a shared cloud storage environment. Logging and alerting are on, but nothing looks unusual.',
					'Then AWS GuardDuty raises alerts: the same credentials try to use cloud IAM roles for actions they are not allowed to do.'
				],
				q: 'What does the GuardDuty alert tell you to check?',
				options: [
					'Whether the engineer made these calls, or someone holding their credentials',
					'Whether GuardDuty is misconfigured, since the user is a senior engineer',
					'Whether the S3 buckets are full',
					'Whether the IAM roles need wider rights for the engineer'
				],
				answer: 0,
				why: 'The attacker used "valid credentials stolen from a senior DevOps engineer", which "initially made it difficult for investigators to differentiate between threat actor activity and ongoing legitimate activity". The GuardDuty alerts on IAM role use were what showed the "anomalous behavior".'
			},
			{
				situation: [
					'The investigation reaches the engineer\'s home computer. A vulnerable third-party media software package on it allowed remote code execution, and the attacker installed a keylogger.',
					'The keylogger captured the engineer\'s master password after the engineer had passed MFA. The attacker then exported the corporate vault and its shared folders, with the access and decryption keys for the AWS S3 production backups.'
				],
				q: 'What do you do first?',
				options: [
					'Reimage the engineer\'s corporate laptop',
					'Ask the engineer to change their master password',
					'Rotate the high privilege credentials the attacker could see',
					'Remove the media software from every company laptop'
				],
				answer: 2,
				why: 'LastPass "rotated critical and high privilege credentials that were known to be available to the threat actor" first, and the lower priority items after. It also began re-issuing the certificates and rotated production IAM user keys. A new master password does not change keys that the attacker already exported.'
			},
			{
				situation: [
					'With the S3 keys, the attacker copied a backup of customer vaults. Website URLs in it are not encrypted. Usernames, passwords, secure notes and form data are encrypted with AES-256, using a key derived from each user\'s master password.',
					'Since 2018 LastPass has required master passwords of at least 12 characters, and its default is 100,100 PBKDF2 iterations. Some accounts do not use these defaults.'
				],
				q: 'What do you tell customers?',
				options: [
					'Change your master password, which re-encrypts the stolen copy',
					'No one needs to act, because every vault is encrypted',
					'Delete your LastPass account so the copy is removed',
					'If below the defaults, change the passwords stored in your vault'
				],
				answer: 3,
				why: 'LastPass wrote on 22 December that the attacker "may attempt to use brute force to guess your master password", offline, on the copy. Users without the defaults "should consider minimizing risk by changing passwords of websites you have stored". The stolen copy stays encrypted with the key from the old master password.'
			}
		],
		outcome: [
			'The first incident (8 to 12 August 2022) started from a software engineer\'s compromised laptop and took 14 repositories, with some secrets. Information from it was used to pick a target for the second incident, which ran from 12 August to 26 October 2022.',
			'The second attacker went after one of the four DevOps engineers with access to the backup decryption keys. A keylogger on the engineer\'s home computer, installed through a vulnerable media software package, captured the master password and opened the corporate vault.',
			'The attacker copied customer account data, a backup of all customer vaults and a backup of the MFA and federation database. That database was encrypted, but its decryption key was among the stolen secrets. Vault fields such as passwords stayed encrypted with keys derived from each user\'s master password.',
			'LastPass rotated the exposed credentials and certificates, put tighter IAM policies and more logging on the cloud storage, deleted old IAM users and blocked long-lived development IAM users. It also helped the engineer harden their home network. On 1 March 2023 it wrote that it "should have communicated more frequently and comprehensively".'
		]
	},
	quiz: [
		{
			q: 'The encrypted credentials stolen in August needed a key the attacker did not have. How did the attacker get that key?',
			options: [
				'By cracking the encryption with brute force over weeks',
				'From a DevOps engineer\'s vault, opened with a keylogger',
				'By asking LastPass support to reset the engineer\'s account',
				'By reading it in the source code stolen in August'
			],
			answer: 1,
			why: 'The keys sat in shared folders in a LastPass vault that four DevOps engineers could open. The keylogger on one engineer\'s home computer captured the master password, and the attacker exported the vault.'
		},
		{
			q: 'The engineer passed MFA before typing the master password. Why did MFA not stop the attacker?',
			options: [
				'MFA was turned off for DevOps engineers at the time',
				'The attacker had reset the engineer\'s MFA device first',
				'MFA only protects the mobile app, not the browser',
				'The keylogger ran on the engineer\'s own computer, after MFA'
			],
			answer: 3,
			why: 'MFA checks who logs in. The keylogger captured the master password "as it was entered, after the employee authenticated with MFA".'
		},
		{
			q: 'A vault copy is encrypted with a key derived by 100,100 PBKDF2 iterations. What does the attacker pay for each master password guess?',
			options: [
				'One request to LastPass\'s servers',
				'100,100 hash computations, run offline',
				'One AES decryption and nothing more',
				'Nothing, because the URLs reveal the password'
			],
			answer: 1,
			why: 'Each guess must go through the same 100,100 iterations to produce a candidate key. The work happens on the attacker\'s machines, so no rate limit applies, and only the cost per guess slows them down.'
		}
	],
	recall: {
		q: 'How did the attacker get the keys to the LastPass cloud backups in 2022?',
		a: 'A keylogger on a DevOps engineer\'s home computer, installed through a vulnerable third-party media software package, captured the engineer\'s master password. The attacker exported the corporate vault, whose shared folders held the AWS S3 access and decryption keys.'
	},
	sources: [
		{ title: 'LastPass Blog, Security Incident Update and Recommended Actions (1 March 2023)', url: PM },
		{ title: 'LastPass Support, Incident 2: Additional details of the attack', url: I2 },
		{ title: 'LastPass Support, Incident 1: Additional details of the attack', url: I1 },
		{ title: 'LastPass Blog, Notice of Recent Security Incident (22 December 2022)', url: NOTICE }
	]
};
