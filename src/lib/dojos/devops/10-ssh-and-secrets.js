const HOOKS = 'https://github.com/pre-commit/pre-commit-hooks/blob/2ee68084ed80421ef5a6d062cf1637825adfcb22';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ssh-and-secrets',
	part: 'Fundamentals',
	title: 'SSH keys and secrets: keep them out of Git',
	minutes: 10,
	hook: [
		'You have one SSH key, no passphrase, copied to every laptop you ever owned. It opens forty servers. Last week a colleague pasted the database password into `deploy.sh` and pushed it.',
		'Pipelines log in to servers and talk to databases, so they need keys and passwords too. Those secrets end up in scripts, env files, logs and Git history.',
		'You protect the key with a passphrase, and `ssh-agent` and `~/.ssh/config` save you the typing. A secret pushed to Git is in every clone of the repository, so **the fix is to rotate it**.'
	],
	terms: [
		{ term: 'Key pair', def: 'A private key that stays with you and a public key you put on servers, in `~/.ssh/authorized_keys`. Make one with `ssh-keygen -t ed25519 -C "you@laptop"`.' },
		{ term: 'ssh-agent', def: 'A process that holds your unlocked keys in memory, so you type the passphrase once per session, not once per login.' },
		{ term: 'Secret', def: 'Anything that grants access: a password, a token, a private key, an API key. If it leaks, someone else can act as you.' },
		{ term: 'Rotation', def: 'Replacing a secret with a new one and revoking the old one. After a leak, rotating the secret makes the leaked value useless.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['key["Private key: id_ed25519"]', 'pub["Public key in authorized_keys"]', 'key -.->|"proves you hold it"| pub'],
				highlight: ['key', 'pub'],
				note: 'The private key never leaves your machine. The server only has the public half. `ssh` **ignores a private key file that others can read**, so keep it at `chmod 600`.'
			},
			{
				add: ['agent["ssh-agent"]', 'key -->|"ssh-add, passphrase once"| agent'],
				highlight: ['agent'],
				note: 'The passphrase encrypts the key file on disk, so a stolen laptop does not give away the key. The agent holds the unlocked key, so you type the passphrase once. `ssh-add -t 8h` drops the key after eight hours, and `ssh-add -l` lists what the agent holds.'
			},
			{
				add: ['cfg["~/.ssh/config"]', 'bast["bastion"]', 'web["web1, private network"]', 'agent --> bast', 'bast -->|"ProxyJump"| web', 'cfg -.-> bast'],
				highlight: ['cfg', 'bast', 'web'],
				note: 'With `Host web1`, `HostName 10.0.1.5`, `User deploy` and `ProxyJump bastion` in the config, `ssh web1` connects through the bastion. ssh uses the first value it finds for each option, so put specific `Host` blocks first and `Host *` last. The OpenSSH docs call a jump host **safer than agent forwarding**.'
			},
			{
				add: ['sec["Secret: DB password"]', 'repo["Git repository"]', 'sec -->|"never"| repo'],
				highlight: ['sec', 'repo'],
				note: 'Once pushed, a secret lives in the history, in every clone and every fork. Deleting the file in a new commit removes nothing. GitHub\'s docs say the first step is to **revoke or rotate** the secret.'
			},
			{
				add: ['store["Secret store: CI secrets, a vault, systemd credentials"]', 'app["Service or pipeline"]', 'store -->|"injected at run time"| app', 'class store ext'],
				highlight: ['store', 'app'],
				note: 'The secret is stored **outside the code** and reaches the service at run time. Environment variables are common, but the systemd docs warn they are not suitable for secrets. For a service, `LoadCredential=` puts the secret in a file under `$CREDENTIALS_DIRECTORY` instead.'
			}
		]
	},
	example: {
		title: 'pre_commit_hooks/detect_private_key.py',
		repo: 'pre-commit/pre-commit-hooks',
		url: `${HOOKS}/pre_commit_hooks/detect_private_key.py#L6-L38`,
		lang: 'python',
		code: `BLACKLIST = [
    b'BEGIN RSA PRIVATE KEY',
    b'BEGIN DSA PRIVATE KEY',
    b'BEGIN EC PRIVATE KEY',
    b'BEGIN OPENSSH PRIVATE KEY',
    b'BEGIN PRIVATE KEY',
    b'PuTTY-User-Key-File-2',
    b'BEGIN SSH2 ENCRYPTED PRIVATE KEY',
    b'BEGIN PGP PRIVATE KEY BLOCK',
    b'BEGIN ENCRYPTED PRIVATE KEY',
    b'BEGIN OpenVPN Static key V1',
]
…
    for filename in args.filenames:
        with open(filename, 'rb') as f:
            content = f.read()
            if any(line in content for line in BLACKLIST):
                private_key_files.append(filename)

    if private_key_files:
        for private_key_file in private_key_files:
            print(f'Private key found: {private_key_file}')
        return 1
    else:
        return 0`,
		notes: [
			'Lines 1 to 12 list the key header lines the hook looks for. If a file you are about to commit contains one, lines 20 to 23 print its name and **return 1**. A non-zero exit code makes the commit fail, as in day 6.',
			'The hook is declared in [`.pre-commit-hooks.yaml`](https://github.com/pre-commit/pre-commit-hooks/blob/2ee68084ed80421ef5a6d062cf1637825adfcb22/.pre-commit-hooks.yaml#L125-L130) with `types: [text]`. The same file also ships `detect-aws-credentials`.',
			'Line 17 matches key headers only, so a database password in `deploy.sh` passes. Wider scanners exist, like [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning), which runs on the server side.',
			'`git commit --no-verify` skips a local hook. Keep the real secrets somewhere a commit cannot reach.'
		]
	},
	tradeoff: {
		gain: [
			'With a passphrase, a stolen key file is useless, and with the agent you still type the passphrase only once per session.',
			'With `~/.ssh/config`, you and your scripts type `ssh web1` instead of the full user, address and jump host.',
			'Secrets injected at run time can be rotated without changing or redeploying the code.'
		],
		cost: [
			'A secret store is one more system to run, back up and grant access to.',
			'With agent forwarding, root on the remote host can use your loaded keys through the forwarded socket.',
			'The OWASP cheat sheet notes that environment variables may end up in logs or system dumps, and Caddy\'s `--environ` from day 6 prints them all at startup.'
		]
	},
	task: {
		prompt: 'An hour ago a colleague pushed `DB_PASSWORD=S3cret!` inside `deploy.sh` to a shared GitHub repository. List what you do, in order.',
		hint: 'Ask what an attacker can do right now, and which step actually takes that away from them.',
		answer: [
			'Rotate first: change the database password now. Until then, anyone who cloned the repository can log in.',
			'Check the database logs for logins with the old password since the push.',
			'Move the secret out: `deploy.sh` reads it at run time, from the CI secret store or a file only the service user can read (`chmod 600`), never from the script itself.',
			'Rewriting history is optional and slow: the secret is still in every clone and fork, and GitHub\'s docs list the side effects. Only the new password locks the attacker out.',
			'Prevent the next one: a pre-commit hook, secret scanning on the server, and `.env` files in `.gitignore`.'
		]
	},
	quiz: [
		{
			q: 'You find a password committed to a shared Git repository last week. What do you do first?',
			options: [
				'Rewrite the history and force push',
				'Rotate the password',
				'Make the repository private',
				'Delete the file in a new commit'
			],
			answer: 1,
			why: 'The password is already in clones, forks and possibly someone\'s notes. Only rotation makes the leaked value useless. GitHub\'s docs put revoke or rotate as the first step.'
		},
		{
			q: 'After `chmod 644 ~/.ssh/id_ed25519`, ssh stops using that key. Why?',
			options: [
				'ssh ignores a private key file that is accessible by others',
				'chmod rewrote the key file in a format ssh cannot read',
				'ssh-agent locks any key that has the wrong file mode',
				'The server rejects keys that are stored with mode 644'
			],
			answer: 0,
			why: 'The ssh manual says it ignores a private key file if it is accessible by others. `chmod 600` fixes it. The server never sees the file mode.'
		},
		{
			q: 'You must reach `web1` through a bastion. According to the OpenSSH docs, which is the safer option?',
			options: [
				'`ForwardAgent yes`, then ssh again from the bastion',
				'`ProxyJump bastion` in `~/.ssh/config`',
				'Copy your private key to the bastion',
				'Turn off host key checking on the bastion'
			],
			answer: 1,
			why: 'With agent forwarding, anyone who can bypass file permissions on the bastion can use your loaded keys. ProxyJump tunnels through the bastion and your keys stay on your machine.'
		}
	],
	recall: {
		q: 'A password was pushed to a shared Git repository. What is the first step, and why does deleting the file not help?',
		a: 'Rotate the password: replace it and revoke the old one. A new commit that deletes the file leaves the password in the history, in every clone and in every fork.'
	},
	sources: [
		{ title: 'ssh(1) manual page (private key permissions, agent forwarding)', url: 'https://man7.org/linux/man-pages/man1/ssh.1.html' },
		{ title: 'ssh_config(5) manual page (Host, ProxyJump, ForwardAgent)', url: 'https://man7.org/linux/man-pages/man5/ssh_config.5.html' },
		{ title: 'GitHub Docs, Removing sensitive data from a repository', url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository' },
		{ title: 'OWASP Secrets Management Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html' },
		{ title: 'systemd.exec, Credentials (LoadCredential=)', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Credentials' }
	]
};
