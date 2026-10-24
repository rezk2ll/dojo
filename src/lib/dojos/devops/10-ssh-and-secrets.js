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
		],
		steps: [
			{
				title: 'Size up the leak',
				questions: [
					{ q: 'The push was an hour ago. Who may already have the password?', options: ['Nobody, the repository is shared only with the team', 'Anyone who cloned or forked the repository since', 'Only GitHub staff', 'Only the colleague who pushed it'], answer: 1, why: 'A pushed secret is in every clone and every fork, and you cannot recall those copies.' },
					{ q: 'What can an attacker with that password do right now?', options: ['Log in to the database', 'Push to the repository', 'Read your SSH keys', 'Nothing until the next deploy'], answer: 0, why: 'A secret grants access. Until it changes, anyone holding it can act as the service.' },
					{ q: '`deploy.sh` also sets `DB_HOST`, `DB_USER` and `DB_PORT`. Which line is the secret?', options: ['`DB_HOST=db1.internal`', '`DB_USER=deploy`', '`DB_PASSWORD=S3cret!`', '`DB_PORT=5432`'], answer: 2, why: 'A secret is anything that grants access. The host, user and port tell an attacker where the door is; only the password opens it.' },
					{ q: 'An attacker logs in with the leaked password. Why is that hard to spot in the database logs?', options: ['Databases do not log logins', 'The attacker deletes the password from Git first', 'Logins with a leaked password are encrypted', 'It looks like a normal login by the service account'], answer: 3, why: 'Whoever holds a secret can act as its owner. The login is valid, so only details like the source address or the time give it away.' }
				]
			},
			{
				title: 'Rotate and check',
				questions: [
					{ q: 'You change the database password and do nothing else. What fails?', options: ['New connections from the service, which still sends the old password', 'Nothing: the service picks up the new one by itself', 'The Git history', 'The SSH agent'], answer: 0, why: 'Rotation revokes the old value, and `deploy.sh` still holds it. Put the new password where the service reads it as part of the same change.' },
					{ q: 'Right after rotating, what do you check?', options: ['The CI logs for build times', 'The database logs for logins with the old password since the push', 'The size of the repository', 'The SSH config on the bastion'], answer: 1, why: 'The logs tell you whether someone used the leaked password before you changed it.' },
					{ q: 'Once the old password is revoked, what is the copy in the Git history?', options: ['Still a working password until you rewrite history', 'Encrypted by GitHub', 'A useless value: it no longer opens the database', 'Deleted from every clone'], answer: 2, why: 'Rotating makes the leaked value useless. It is still in every clone and fork, and it no longer grants access.' },
					{ q: 'Why does rotation come before rewriting history?', options: ['Rewriting history is forbidden', 'Rotation is slower', 'GitHub rewrites history for you', 'Rewriting is slow, and the secret is already in clones and forks'], answer: 3, why: 'Rewriting history is optional and has side effects. Only the new password locks the attacker out.' }
				]
			},
			{
				title: 'Move the secret out of the code',
				questions: [
					{ q: 'Where should `deploy.sh` get the password from?', options: ['A constant at the top of the script', 'A comment in the README', 'At run time, from the CI secret store or a file only the service user can read', 'The Git commit message'], answer: 2, why: 'The secret is stored outside the code and reaches the service at run time.' },
					{ q: 'Which file mode fits a file that holds the password?', options: ['`chmod 600`', '`chmod 644`', '`chmod 755`', '`chmod 777`'], answer: 0, why: '`600` lets only the owner read and write it.' },
					{ q: 'What do the systemd docs say about environment variables for secrets?', options: ['They are the safest option', 'They are not suitable for secrets', 'They are encrypted by default', 'They are only visible to root'], answer: 1, why: 'The systemd docs warn against them. `LoadCredential=` puts the secret in a file under `$CREDENTIALS_DIRECTORY` instead.' },
					{ q: 'What is a cost of injecting secrets at run time from a store?', options: ['You cannot rotate them', 'The code must be redeployed for every change', 'The secret ends up in Git anyway', 'The store is one more system to run, back up and grant access to'], answer: 3, why: 'The gain is rotation without redeploying. The cost is running the store.' }
				]
			},
			{
				title: 'Prevent the next one',
				questions: [
					{ q: 'Which local check stops a private key before it is committed?', options: ['A pre-commit hook such as `detect-private-key`', '`git log -p`', '`ssh-add -l`', '`chmod 600`'], answer: 0, why: 'The hook looks for key headers in staged files and returns 1, which makes the commit fail.' },
					{ q: 'Would `detect-private-key` have caught `DB_PASSWORD=S3cret!`?', options: ['Yes, it scans every line', 'Yes, because it ends with `!`', 'No, it matches key headers only', 'Only in `.env` files'], answer: 2, why: 'It looks for lines like `BEGIN OPENSSH PRIVATE KEY`, so a plain password passes.' },
					{ q: 'Why add secret scanning on the server too?', options: ['It replaces rotation', '`git commit --no-verify` skips a local hook', 'It deletes leaked secrets', 'Local hooks only run on Linux'], answer: 1, why: 'A local hook can be skipped. Scanning on the server side still sees the push.' },
					{ q: 'Which files go in `.gitignore`?', options: ['`deploy.sh`', '`.gitignore` itself', '`README.md`', '`.env` files'], answer: 3, why: 'Files that hold secrets should never be staged in the first place.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'In a throwaway repo, see a "deleted" password survive in the history, move it to a file read at run time, then protect a key with a passphrase and a pre-commit hook.',
		steps: [
			'Make a repo and leak a password: `mkdir -p ~/secrets-lab && cd ~/secrets-lab && git init -q && git config user.name lab && git config user.email lab@localhost`, then `printf \'#!/usr/bin/env bash\\nDB_PASSWORD=S3cret!\\necho "deploying"\\n\' > deploy.sh && git add deploy.sh && git commit -qm "add deploy"`.',
			'"Fix" it in a new commit: `printf \'#!/usr/bin/env bash\\nset -euo pipefail\\nDB_PASSWORD=$(cat "${DB_PASSWORD_FILE:?}")\\necho "deploying with ${#DB_PASSWORD} chars"\\n\' > deploy.sh && git commit -qam "read password from file"`. Then search: `grep -c S3cret deploy.sh` and `git log -p | grep S3cret`.',
			'Rotate and keep the new value out of Git: `printf \'N3wPass\\n\' > db_password && chmod 600 db_password && echo db_password >> .gitignore`. Run `DB_PASSWORD_FILE=./db_password bash deploy.sh`, then `bash deploy.sh; echo $?` without the variable, and `git status --short`.',
			'Make a key with a passphrase: `ssh-keygen -t ed25519 -C "lab@laptop" -f ./lab_key -N \'correct horse\'`. Try `ssh-keygen -y -P wrong -f lab_key`, then `ssh-keygen -y -P \'correct horse\' -f lab_key`. Then `chmod 644 lab_key`, run the second one again, and put it back with `chmod 600 lab_key`.',
			'Add a pre-commit hook that refuses key headers: `printf \'#!/bin/sh\\nif git diff --cached --name-only -z | xargs -0 grep -l "PRIVATE KEY" 2>/dev/null; then\\n  echo "Private key found, commit refused" >&2\\n  exit 1\\nfi\\n\' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`. Try `git add lab_key && git commit -m oops; echo $?`, then `git reset -q lab_key`.'
		],
		done: [
			'`grep -c S3cret deploy.sh` prints `0`, and `git log -p | grep S3cret` still prints the password.',
			'`deploy.sh` prints `deploying with 7 chars`, `ls -l db_password` starts with `-rw-------`, and `git status --short` does not list `db_password`.',
			'The wrong passphrase prints `incorrect passphrase supplied`. With mode 644, ssh-keygen prints `UNPROTECTED PRIVATE KEY FILE!`.',
			'The commit of `lab_key` prints `Private key found, commit refused` and exits `1`.'
		],
		solution: [
			'The history keeps every version of `deploy.sh`, which is why rotation, not the second commit, ends the leak.',
			'Without the variable, the script stops with `DB_PASSWORD_FILE: parameter null or not set` and exits `1`, instead of running without a password. `set -e` matters here: without it, bash prints the error and still runs the next line.',
			'`git commit --no-verify` skips this hook, which is why the chapter adds secret scanning on the server too. Delete `~/secrets-lab` when done: it holds a test key.'
		]
	},
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
