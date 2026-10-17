/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ssh',
	part: 'Ops tools',
	title: 'ssh and scp',
	minutes: 10,
	hook: [
		'You get access to a new environment on your first day. Only `bastion.example.com` accepts SSH from your laptop. The database host `db.internal` runs PostgreSQL on port 5432 and accepts connections only from the bastion.',
		'Your user is `ana` on the laptop and on both hosts. The laptop has a folder `reports/` with `jan.csv` and `q3/sep.csv`. On the bastion, the app writes `/var/log/app.log`, and `/srv/reports/` holds an old file `old.csv` from last month.'
	],
	terms: [
		{ term: 'key pair', def: 'A private key that stays on your laptop and a public key, the same file name with `.pub`, that you copy to servers.' },
		{ term: 'bastion', def: 'A host that accepts SSH from outside and that you go through to reach the hosts behind it.' },
		{ term: 'local port forward', def: 'A port on your laptop that ssh connects, through the SSH connection, to a host and port on the far side.' }
	],
	reps: [
		{
			prompt: 'Create an ed25519 key pair with the comment `ana@laptop`, saved at the default path.',
			accept: [
				'ssh-keygen -t ed25519 -C "ana@laptop"',
				"ssh-keygen -t ed25519 -C 'ana@laptop'",
				'ssh-keygen -t ed25519 -C ana@laptop',
				'ssh-keygen -C "ana@laptop" -t ed25519',
				"ssh-keygen -C 'ana@laptop' -t ed25519",
				'ssh-keygen -C ana@laptop -t ed25519',
				'ssh-keygen -t ed25519 -C "ana@laptop" -f ~/.ssh/id_ed25519',
				'ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -C "ana@laptop"'
			],
			why: '`-t ed25519` picks the key type and `-C` sets the comment at the end of the public key. The private key goes to `~/.ssh/id_ed25519` and the public key to `~/.ssh/id_ed25519.pub`.'
		},
		{
			prompt: 'Install your new public key on the bastion, so that you log in as `ana` without a password from now on.',
			accept: ['ssh-copy-id ana@bastion.example.com', 'ssh-copy-id -i ~/.ssh/id_ed25519.pub ana@bastion.example.com', 'ssh-copy-id -i ~/.ssh/id_ed25519 ana@bastion.example.com'],
			why: '`ssh-copy-id` logs in once with your password and appends the key to `~/.ssh/authorized_keys` on the bastion. Without `-i`, it takes the most recent `~/.ssh/id*.pub` file (or the keys in your ssh-agent).'
		},
		{
			prompt: 'Run `df -h /` on the bastion and print its output on your laptop, without opening a shell there.',
			accept: ['ssh ana@bastion.example.com df -h /', "ssh ana@bastion.example.com 'df -h /'", 'ssh ana@bastion.example.com "df -h /"'],
			why: 'Words after the destination are the command that ssh runs on the remote host. ssh prints its output and exits when the command ends.'
		},
		{
			prompt: 'Download `/var/log/app.log` from the bastion into your current directory.',
			accept: ['scp ana@bastion.example.com:/var/log/app.log .', 'scp ana@bastion.example.com:/var/log/app.log ./', 'scp ana@bastion.example.com:/var/log/app.log ./app.log'],
			why: '`host:path` names a file on the remote host. The source comes first and the destination last, here `.` for the current directory.'
		},
		{
			prompt: 'Copy the folder `reports` and everything in it to `/tmp` on the bastion, with `scp`.',
			accept: [
				'scp -r reports ana@bastion.example.com:/tmp',
				'scp -r reports ana@bastion.example.com:/tmp/',
				'scp -r reports/ ana@bastion.example.com:/tmp',
				'scp -r reports/ ana@bastion.example.com:/tmp/',
				'scp -r ./reports ana@bastion.example.com:/tmp/'
			],
			why: '`-r` copies whole directories. The bastion then has `/tmp/reports/jan.csv` and `/tmp/reports/q3/sep.csv`; without `-r`, scp stops with `local "reports" is not a regular file`.'
		},
		{
			prompt: 'Copy the contents of `reports` into `/srv/reports/` on the bastion with `rsync`, in archive mode, listing each file, compressed in transit.',
			accept: [
				'rsync -avz reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -avz reports/ ana@bastion.example.com:/srv/reports',
				'rsync -azv reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -vaz reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -zav reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -a -v -z reports/ ana@bastion.example.com:/srv/reports/',
				'rsync --archive --verbose --compress reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -avz ./reports/ ana@bastion.example.com:/srv/reports/'
			],
			why: '`-a` is archive mode, short for `-rlptgoD`: it recurses into folders and keeps file metadata such as permissions and modification times. `-v` lists files and `-z` compresses. The slash in `reports/` copies the contents, so you get `/srv/reports/jan.csv`.'
		},
		{
			prompt: 'Now copy the folder `reports` itself into `/srv/reports/`, so that the bastion gets `/srv/reports/reports/jan.csv`. Same flags.',
			accept: [
				'rsync -avz reports ana@bastion.example.com:/srv/reports/',
				'rsync -avz reports ana@bastion.example.com:/srv/reports',
				'rsync -azv reports ana@bastion.example.com:/srv/reports/',
				'rsync -a -v -z reports ana@bastion.example.com:/srv/reports/',
				'rsync --archive --verbose --compress reports ana@bastion.example.com:/srv/reports/',
				'rsync -avz ./reports ana@bastion.example.com:/srv/reports/'
			],
			why: 'With no slash after `reports`, rsync copies the directory by name and creates `reports/` inside the destination. Only the source slash matters here; the destination slash changes nothing.'
		},
		{
			prompt: 'Make `/srv/reports/` an exact copy of the contents of `reports`: same flags as before, and also remove `old.csv`, which is not in the source.',
			accept: [
				'rsync -avz --delete reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -avz --delete reports/ ana@bastion.example.com:/srv/reports',
				'rsync --delete -avz reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -azv --delete reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -avz reports/ ana@bastion.example.com:/srv/reports/ --delete'
			],
			why: '`--delete` removes files in the destination that the source does not have, here `old.csv`. The man page suggests a first run with `--dry-run` (`-n`) to see what would be deleted.'
		},
		{
			prompt: 'Make local port 5433 reach PostgreSQL on `db.internal:5432` through the bastion, without running a remote command.',
			accept: [
				'ssh -N -L 5433:db.internal:5432 ana@bastion.example.com',
				'ssh -L 5433:db.internal:5432 -N ana@bastion.example.com',
				'ssh -NL 5433:db.internal:5432 ana@bastion.example.com',
				'ssh -N ana@bastion.example.com -L 5433:db.internal:5432',
				'ssh -fN -L 5433:db.internal:5432 ana@bastion.example.com',
				'ssh -N -L localhost:5433:db.internal:5432 ana@bastion.example.com',
				'ssh -N -L 127.0.0.1:5433:db.internal:5432 ana@bastion.example.com'
			],
			why: '`-L 5433:db.internal:5432` listens on port 5433 of the laptop and opens each connection from the bastion to `db.internal:5432`. `-N` runs no remote command, so ssh only forwards. A client on the laptop then connects to `localhost:5433`.'
		},
		{
			prompt: 'Open a shell on `db.internal` as `ana`, going through the bastion as a jump host, in one command.',
			accept: ['ssh -J ana@bastion.example.com ana@db.internal', 'ssh ana@db.internal -J ana@bastion.example.com'],
			why: '`-J` connects to the bastion first, then opens a TCP forward from there to `db.internal`. Your laptop runs the SSH session to `db.internal` through that forward.'
		}
	],
	quiz: [],
	recall: {
		q: 'What does the trailing slash in `rsync -avz reports/ host:/srv/reports/` change?',
		a: 'It copies the contents of `reports`, so the files land in `/srv/reports/`. Without it, rsync creates `/srv/reports/reports/`.'
	},
	sources: [
		{ title: 'ssh(1) manual page', url: 'https://manpages.debian.org/bookworm/openssh-client/ssh.1.en.html' },
		{ title: 'ssh-keygen(1) manual page', url: 'https://manpages.debian.org/bookworm/openssh-client/ssh-keygen.1.en.html' },
		{ title: 'ssh-copy-id(1) manual page', url: 'https://manpages.debian.org/bookworm/openssh-client/ssh-copy-id.1.en.html' },
		{ title: 'scp(1) manual page', url: 'https://manpages.debian.org/bookworm/openssh-client/scp.1.en.html' },
		{ title: 'rsync(1) manual page', url: 'https://manpages.debian.org/bookworm/rsync/rsync.1.en.html' }
	]
};
