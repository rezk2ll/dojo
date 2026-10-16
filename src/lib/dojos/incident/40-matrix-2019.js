const PM = 'https://matrix.org/blog/2019/05/08/post-mortem-and-remediations-for-apr-11-security-incident/';
const JENKINS = 'https://www.jenkins.io/security/advisory/2019-01-08/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'matrix-2019',
	part: 'Security',
	title: 'Matrix.org 2019: the outdated Jenkins and the forwarded SSH keys',
	minutes: 10,
	hook: [
		'Tuesday 9 April 2019, late in the day. You run the infrastructure of the Matrix.org homeserver: about 30 Debian hosts, from the homeserver and its databases to the website and the CI.',
		'A security researcher sends you a direct message on Twitter. The researcher found your public Jenkins through Google, and it is outdated.',
		'The researcher is right. Your Jenkins runs version 2.117, and its plugins were updated by hand from time to time. Most of your CI has moved to other services, and nobody saw the last security advisory.'
	],
	terms: [
		{ term: 'SSH agent forwarding', def: 'An SSH option (`ssh -A`, or `ForwardAgent yes`) that lets a remote server use the private keys on your laptop for as long as you are logged in.' },
		{ term: 'authorized_keys', def: 'The file on a server that lists the SSH public keys allowed to log in to an account. By default, sshd also reads the legacy file `authorized_keys2`.' },
		{ term: 'RCE', def: 'Remote code execution: a bug that lets someone on the network run their own code on your server.' },
		{ term: 'API key', def: 'A secret string that a script sends to a service, here Cloudflare, to make changes without a person logging in.' }
	],
	incident: {
		org: 'Matrix.org',
		title: 'Post-mortem and remediations for Apr 11 security incident',
		date: '2019-04-10',
		url: PM,
		steps: [
			{
				situation: [
					'The Jenkins project fixed a sandbox bypass in its Script Security plugin, CVE-2019-1003000, on 8 January 2019. It lets a user with Overall/Read permission run arbitrary code on the Jenkins controller.',
					'Your Jenkins is reachable from the internet so that every contributor can see CI results.'
				],
				q: 'What do you do on 10 April?',
				options: [
					'Thank the researcher and plan the upgrade for next week',
					'Upgrade Jenkins, then look for signs that the hole was used',
					'Upgrade Jenkins and close the report',
					'Put Jenkins behind a login and leave the version as it is'
				],
				answer: 1,
				why: 'On 10 April the team "updated the Jenkins and investigated to see if any vulnerabilities had been exploited". The fix had been out for three months, so an upgrade alone could not undo what someone did in that time.'
			},
			{
				situation: [
					'On the Jenkins build server you find an SSH key you do not recognise in `/root/.ssh/authorized_keys2`. It is not in your key database, and `authorized_keys2` is a legacy file from the move from SSH1 to SSH2.',
					'You search the other hosts. 19 hosts have the same key in the same file.'
				],
				q: 'What do you do before you remove the key?',
				options: [
					'Nothing: delete the key on all 19 hosts right away',
					'Reboot the 19 hosts to end the attacker\'s sessions',
					'Snapshot the hosts and study what the attacker did',
					'Rotate the root passwords on the 19 hosts'
				],
				answer: 2,
				why: 'The team started forensics and took "snapshots of the hosts to protect data in case the attacker realised we were aware and attempted to vandalise or cover their tracks". Deleting the key at once would tell the attacker they were found, before you know what else they left behind.'
			},
			{
				situation: [
					'The forensics show the path. The attacker used the Jenkins hole on 13 March, then reached Flywheel, an old Mac Pro used as a Jenkins slave, whose SSH port was open to the internet. There they set a trap that waited for someone to log in with a forwarded SSH agent.',
					'On 4 April at 12:32 GMT, a team member logged into Flywheel with agent forwarding on. The trap used the forwarded key to add the attacker\'s key to root on many hosts. The attacker took the passbolt database, read the production database and left a setuid root shell at `/usr/share/bsd-mail/shroot`.'
				],
				q: 'How do you recover the hosts?',
				options: [
					'Remove the keys and the shell you found, and keep the hosts',
					'Reinstall the 19 hosts that had the key and keep the rest',
					'Restore every host from the backups of 1 April',
					'Rebuild every host from scratch, with all secrets rotated'
				],
				answer: 3,
				why: 'The team wrote that "the only responsible course of action when an attacker has acquired root is to salt the earth and start over afresh". That meant "rotating all secrets; isolating the old hosts entirely (including ones which appeared to not have been compromised, for safety)" and redeploying on new hosts. Two more hosts had been compromised on 5 April, and anything restored from before 4 April would bring back the Jenkins compromised on 13 March.'
			},
			{
				situation: [
					'By 1 a.m. on 12 April the core Matrix.org server runs again on new hosts. The attacker read the production database, which holds user access tokens and password hashes made with 4096 rounds of bcrypt.'
				],
				q: 'What do you do for the users?',
				options: [
					'Drop every access token and ask users to change their passwords',
					'Nothing, since bcrypt hashes cannot be reversed',
					'Ask users to change their passwords, and keep their sessions',
					'Lock only the accounts of the team members'
				],
				answer: 0,
				why: 'The team had "no choice but drop all access_tokens for matrix.org, to stop the attacker accessing user accounts", which logged out every user. It also told users to change their passwords, because the hashes "had likely been exfiltrated". A stolen access token works without the password, so a password change alone leaves those sessions open.'
			},
			{
				situation: [
					'At about 7 a.m. on 12 April, matrix.org shows a defacement. Inspection finds no attacker on the new hosts. The attacker used the Cloudflare API to point the DNS of matrix.org at a page of their own.',
					'You rotated the Cloudflare admin API key during the rebuild on 11 April. To do it, you logged in as the admin account and clicked `Change API Key` in its Profile menu.'
				],
				q: 'What do you check first?',
				options: [
					'Whether the new hosts have a backdoor you missed',
					'Whether Cloudflare itself was breached',
					'Whether the rotation changed the key you meant to change',
					'Whether DNS caches still hold the old records'
				],
				answer: 2,
				why: 'The button changed the personal API key of the logged in user, not the admin one. The team wrote: "in our rush we thought we’d rotated the admin API key, but we hadn’t". They logged in directly as the admin user, changed the key and pointed the DNS back.'
			}
		],
		outcome: [
			'The attacker entered through a public Jenkins that had missed a fix from January 2019. They spread through SSH agent forwarding: several team members had `Host *.matrix.org ForwardAgent: yes` in their SSH client config. Root SSH login and agent forwarding were Debian defaults that nobody had changed since the hosts were set up in August 2017.',
			'The attacker\'s key sat on 19 hosts, and two more hosts were compromised on 5 April. Most of the access happened between 4 and 6 April. The attacker took the passbolt database and likely the password hashes from the production database. The team found no sign of tampering with the source code or the distributed packages.',
			'The team restored the core services on 11 and 12 April, then over 100 other services in order of priority. Jenkins was replaced by Buildkite, WordPress by static sites, cgit by GitLab, and the configuration moved to Ansible with secrets in vaults.',
			'For SSH, they disabled agent forwarding on the servers and took SSH off the internet, behind a VPN and bastion hosts. They started rolling out two-factor authentication for SSH, and only Ansible now manages keys, in `/etc/ssh/authorized_keys/%u`.'
		]
	},
	quiz: [
		{
			q: 'You run `ssh -A flywheel` and stay logged in. What can code running as your user on flywheel do?',
			options: [
				'Read your private key file and copy it',
				'Nothing, since the key stays on your laptop',
				'Use your key to log in to other hosts as you',
				'Only read the files in your home directory'
			],
			answer: 2,
			why: 'The agent keeps the key on your laptop and signs logins for the server. The Matrix.org post: your keys "end up available for use by the server for as long as you are logged into it, letting the server impersonate you".'
		},
		{
			q: 'After the rebuild, keys live only in `/etc/ssh/authorized_keys/%u`, managed by Ansible. What does that stop?',
			options: [
				'Adding a key to a user\'s own `~/.ssh` files',
				'Brute force attacks on SSH passwords',
				'Use of a stolen private key',
				'SSH connections from outside the VPN'
			],
			answer: 0,
			why: 'sshd reads only the files that `AuthorizedKeysFile` names. Its default is `.ssh/authorized_keys .ssh/authorized_keys2`, so with `/etc/ssh/authorized_keys/%u` a key a user adds in their home directory is never checked.'
		},
		{
			q: 'Why was the defacement possible after the team had rotated its secrets?',
			options: [
				'The attacker still had root on some of the new hosts',
				'The button changed the personal key, not the admin key',
				'Cloudflare restored the old key from a backup',
				'The DNS records were cached for 24 hours'
			],
			answer: 1,
			why: 'The team clicked `Change API Key` while logged in as the admin account, and it changed the personal key of the logged in person. The old admin key still worked, and the attacker used it to repoint the DNS.'
		}
	],
	recall: {
		q: 'How did the Matrix.org attacker get from one Jenkins slave to root on many hosts?',
		a: 'A trap on the Jenkins slave Flywheel hijacked a team member\'s forwarded SSH agent on 4 April 2019 at 12:32 GMT and used it to add the attacker\'s key to `/root/.ssh/authorized_keys2` on other hosts.'
	},
	sources: [
		{ title: 'Matrix.org, Post-mortem and remediations for Apr 11 security incident', url: PM },
		{ title: 'Jenkins Security Advisory 2019-01-08 (SECURITY-1266, CVE-2019-1003000)', url: JENKINS },
		{ title: 'OpenSSH, sshd_config(5), AuthorizedKeysFile', url: 'https://github.com/openssh/openssh-portable/blob/6545e6a55d4aaad0f48f2bb5c865935692ce32ea/sshd_config.5#L303-L322' }
	]
};
