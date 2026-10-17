/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ssh',
	part: 'Outils d’exploitation',
	title: 'ssh et scp',
	minutes: 10,
	hook: [
		'Premier jour : tu reçois un accès à un nouvel environnement. Seul `bastion.example.com` accepte le SSH depuis ton portable. L’hôte de base de données `db.internal` fait tourner PostgreSQL sur le port 5432 et n’accepte que les connexions venues du bastion.',
		'Ton utilisateur est `ana`, sur le portable comme sur les deux hôtes. Le portable a un dossier `reports/` avec `jan.csv` et `q3/sep.csv`. Sur le bastion, l’appli écrit `/var/log/app.log`, et `/srv/reports/` contient un vieux fichier `old.csv` du mois dernier.'
	],
	terms: [
		{ term: 'paire de clés', def: 'Une clé privée qui reste sur ton portable et une clé publique, même nom de fichier avec `.pub`, que tu copies sur les serveurs.' },
		{ term: 'bastion', def: 'Un hôte qui accepte le SSH depuis l’extérieur et par lequel tu passes pour joindre les hôtes derrière lui.' },
		{ term: 'redirection de port locale', def: 'Un port de ton portable que ssh relie, à travers la connexion SSH, à un hôte et un port de l’autre côté.' }
	],
	reps: [
		{
			prompt: 'Crée une paire de clés ed25519 avec le commentaire `ana@laptop`, enregistrée au chemin par défaut.',
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
			why: '`-t ed25519` choisit le type de clé et `-C` fixe le commentaire placé à la fin de la clé publique. La clé privée va dans `~/.ssh/id_ed25519`, la clé publique dans `~/.ssh/id_ed25519.pub`.'
		},
		{
			prompt: 'Installe ta nouvelle clé publique sur le bastion, pour te connecter en `ana` sans mot de passe à partir de maintenant.',
			accept: ['ssh-copy-id ana@bastion.example.com', 'ssh-copy-id -i ~/.ssh/id_ed25519.pub ana@bastion.example.com', 'ssh-copy-id -i ~/.ssh/id_ed25519 ana@bastion.example.com'],
			why: '`ssh-copy-id` se connecte une fois avec ton mot de passe et ajoute la clé à `~/.ssh/authorized_keys` sur le bastion. Sans `-i`, il prend le fichier `~/.ssh/id*.pub` le plus récent (ou les clés de ton ssh-agent).'
		},
		{
			prompt: 'Lance `df -h /` sur le bastion et affiche sa sortie sur ton portable, sans ouvrir de shell là-bas.',
			accept: ['ssh ana@bastion.example.com df -h /', "ssh ana@bastion.example.com 'df -h /'", 'ssh ana@bastion.example.com "df -h /"'],
			why: 'Les mots après la destination forment la commande que ssh lance sur l’hôte distant. ssh affiche la sortie et s’arrête quand la commande se termine.'
		},
		{
			prompt: 'Télécharge `/var/log/app.log` depuis le bastion dans ton répertoire courant.',
			accept: ['scp ana@bastion.example.com:/var/log/app.log .', 'scp ana@bastion.example.com:/var/log/app.log ./', 'scp ana@bastion.example.com:/var/log/app.log ./app.log'],
			why: '`hôte:chemin` désigne un fichier sur l’hôte distant. La source vient d’abord, la destination en dernier, ici `.` pour le répertoire courant.'
		},
		{
			prompt: 'Copie le dossier `reports` et tout son contenu dans `/tmp` sur le bastion, avec `scp`.',
			accept: [
				'scp -r reports ana@bastion.example.com:/tmp',
				'scp -r reports ana@bastion.example.com:/tmp/',
				'scp -r reports/ ana@bastion.example.com:/tmp',
				'scp -r reports/ ana@bastion.example.com:/tmp/',
				'scp -r ./reports ana@bastion.example.com:/tmp/'
			],
			why: '`-r` copie des répertoires entiers. Le bastion a ensuite `/tmp/reports/jan.csv` et `/tmp/reports/q3/sep.csv` ; sans `-r`, scp s’arrête sur `local "reports" is not a regular file`.'
		},
		{
			prompt: 'Copie le contenu de `reports` dans `/srv/reports/` sur le bastion avec `rsync`, en mode archive, en listant chaque fichier, avec compression pendant le transfert.',
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
			why: '`-a` est le mode archive, raccourci de `-rlptgoD` : il descend dans les dossiers et garde les métadonnées des fichiers, comme les droits et les dates de modification. `-v` liste les fichiers et `-z` compresse. La barre dans `reports/` copie le contenu : tu obtiens `/srv/reports/jan.csv`.'
		},
		{
			prompt: 'Copie maintenant le dossier `reports` lui-même dans `/srv/reports/`, pour que le bastion ait `/srv/reports/reports/jan.csv`. Mêmes options.',
			accept: [
				'rsync -avz reports ana@bastion.example.com:/srv/reports/',
				'rsync -avz reports ana@bastion.example.com:/srv/reports',
				'rsync -azv reports ana@bastion.example.com:/srv/reports/',
				'rsync -a -v -z reports ana@bastion.example.com:/srv/reports/',
				'rsync --archive --verbose --compress reports ana@bastion.example.com:/srv/reports/',
				'rsync -avz ./reports ana@bastion.example.com:/srv/reports/'
			],
			why: 'Sans barre après `reports`, rsync copie le répertoire par son nom et crée `reports/` dans la destination. Ici seule la barre de la source compte ; celle de la destination ne change rien.'
		},
		{
			prompt: 'Fais de `/srv/reports/` une copie exacte du contenu de `reports` : mêmes options qu’avant, et supprime aussi `old.csv`, absent de la source.',
			accept: [
				'rsync -avz --delete reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -avz --delete reports/ ana@bastion.example.com:/srv/reports',
				'rsync --delete -avz reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -azv --delete reports/ ana@bastion.example.com:/srv/reports/',
				'rsync -avz reports/ ana@bastion.example.com:/srv/reports/ --delete'
			],
			why: '`--delete` supprime dans la destination les fichiers que la source n’a pas, ici `old.csv`. La page de manuel conseille un premier passage avec `--dry-run` (`-n`) pour voir ce qui serait supprimé.'
		},
		{
			prompt: 'Fais que le port local 5433 atteigne PostgreSQL sur `db.internal:5432` à travers le bastion, sans lancer de commande distante.',
			accept: [
				'ssh -N -L 5433:db.internal:5432 ana@bastion.example.com',
				'ssh -L 5433:db.internal:5432 -N ana@bastion.example.com',
				'ssh -NL 5433:db.internal:5432 ana@bastion.example.com',
				'ssh -N ana@bastion.example.com -L 5433:db.internal:5432',
				'ssh -fN -L 5433:db.internal:5432 ana@bastion.example.com',
				'ssh -N -L localhost:5433:db.internal:5432 ana@bastion.example.com',
				'ssh -N -L 127.0.0.1:5433:db.internal:5432 ana@bastion.example.com'
			],
			why: '`-L 5433:db.internal:5432` écoute sur le port 5433 du portable et ouvre chaque connexion depuis le bastion vers `db.internal:5432`. `-N` ne lance aucune commande distante : ssh ne fait que rediriger. Un client sur le portable se connecte alors à `localhost:5433`.'
		},
		{
			prompt: 'Ouvre un shell sur `db.internal` en tant qu’`ana`, en passant par le bastion comme hôte de rebond, en une seule commande.',
			accept: ['ssh -J ana@bastion.example.com ana@db.internal', 'ssh ana@db.internal -J ana@bastion.example.com'],
			why: '`-J` se connecte d’abord au bastion, puis ouvre de là une redirection TCP vers `db.internal`. Ton portable fait passer la session SSH vers `db.internal` par cette redirection.'
		}
	],
	quiz: [],
	recall: {
		q: 'Que change la barre finale dans `rsync -avz reports/ host:/srv/reports/` ?',
		a: 'Elle copie le contenu de `reports` : les fichiers arrivent dans `/srv/reports/`. Sans elle, rsync crée `/srv/reports/reports/`.'
	},
	sources: [
		{ title: 'Page de manuel ssh(1) (en anglais)', url: 'https://manpages.debian.org/bookworm/openssh-client/ssh.1.en.html' },
		{ title: 'Page de manuel ssh-keygen(1) (en anglais)', url: 'https://manpages.debian.org/bookworm/openssh-client/ssh-keygen.1.en.html' },
		{ title: 'Page de manuel ssh-copy-id(1) (en anglais)', url: 'https://manpages.debian.org/bookworm/openssh-client/ssh-copy-id.1.en.html' },
		{ title: 'Page de manuel scp(1) (en anglais)', url: 'https://manpages.debian.org/bookworm/openssh-client/scp.1.en.html' },
		{ title: 'Page de manuel rsync(1) (en anglais)', url: 'https://manpages.debian.org/bookworm/rsync/rsync.1.en.html' }
	]
};
