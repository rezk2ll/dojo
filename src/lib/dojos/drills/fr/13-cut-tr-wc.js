/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cut-tr-wc',
	part: 'Le shell',
	title: 'Découper des colonnes',
	minutes: 10,
	hook: [
		'Tu es sur un serveur sans Python ni tableur. On te demande quels comptes se connectent avec un vrai shell, combien de lignes l’appli a écrites aujourd’hui, et pourquoi l’import du CSV échoue sur chaque ligne. `cut`, `tr`, `wc`, `head` et `tail` répondent à chaque question en une ligne.',
		'Les exercices utilisent 5 fichiers. `passwd.txt` a 4 lignes au format de `/etc/passwd`, 7 champs séparés par `:`, comme `deploy:x:1001:1001:Deploy User:/home/deploy:/bin/bash`. `app.log` a 200 lignes comme `2026-10-17T09:00:01 INFO request id=1`. `users.csv` a un en-tête `name,email` et 3 lignes. `export.csv` a le même genre de lignes, mais chacune finit par un retour chariot avant le saut de ligne (CRLF). `ps.txt` a 3 lignes `nom pid cpu`, alignées avec plusieurs espaces, comme `nginx     1201  0.5`.'
	],
	terms: [
		{ term: 'délimiteur', def: 'Le caractère qui sépare les champs d’une ligne, comme `:` dans `passwd.txt`. `cut -d` le choisit ; par défaut, c’est une tabulation.' },
		{ term: 'CRLF', def: 'Une fin de ligne faite d’un retour chariot (`\\r`) et d’un saut de ligne (`\\n`). `cut` ne coupe les lignes que sur le saut de ligne, donc le `\\r` reste collé à la fin du dernier champ.' },
		{ term: 'suivre', def: 'Ce que fait `tail -f` : il affiche les dernières lignes, garde le fichier ouvert et affiche chaque nouvelle ligne ajoutée.' }
	],
	reps: [
		{
			prompt: 'Affiche seulement les noms d’utilisateur de `passwd.txt`, le 1er champ.',
			accept: [
				'cut -d: -f1 passwd.txt',
				'cut -d : -f1 passwd.txt',
				"cut -d ':' -f1 passwd.txt",
				"cut -d':' -f1 passwd.txt",
				'cut -d: -f 1 passwd.txt',
				'cut -d : -f 1 passwd.txt',
				'cut -f1 -d: passwd.txt',
				'cut --delimiter=: --fields=1 passwd.txt'
			],
			why: '`-d:` fait de `:` le délimiteur et `-f1` garde le champ 1. Tu obtiens `root`, `daemon`, `www-data`, `deploy`.'
		},
		{
			prompt: 'Affiche le nom d’utilisateur et le shell de connexion (le 7e champ) de chaque ligne de `passwd.txt`.',
			accept: [
				'cut -d: -f1,7 passwd.txt',
				'cut -d : -f1,7 passwd.txt',
				"cut -d ':' -f1,7 passwd.txt",
				"cut -d':' -f1,7 passwd.txt",
				'cut -d: -f 1,7 passwd.txt',
				'cut -f1,7 -d: passwd.txt',
				'cut --delimiter=: --fields=1,7 passwd.txt'
			],
			why: '`-f1,7` garde les champs 1 et 7, et `cut` les recolle avec le délimiteur d’entrée. La dernière ligne donne `deploy:/bin/bash`.'
		},
		{
			prompt: 'Affiche seulement l’horodatage de chaque ligne de `app.log` : ses 19 premiers caractères.',
			accept: ['cut -c1-19 app.log', 'cut -c 1-19 app.log', 'cut -c-19 app.log', 'cut -c -19 app.log', 'cut --characters=1-19 app.log'],
			why: '`-c1-19` garde les caractères 1 à 19 de chaque ligne, bornes comprises. La première ligne donne `2026-10-17T09:00:01`.'
		},
		{
			prompt: '`tr` ne prend pas de nom de fichier. Affiche `passwd.txt` en majuscules.',
			accept: [
				'tr a-z A-Z < passwd.txt',
				"tr 'a-z' 'A-Z' < passwd.txt",
				"tr '[:lower:]' '[:upper:]' < passwd.txt",
				'tr "[:lower:]" "[:upper:]" < passwd.txt',
				'cat passwd.txt | tr a-z A-Z',
				"cat passwd.txt | tr 'a-z' 'A-Z'",
				"cat passwd.txt | tr '[:lower:]' '[:upper:]'",
				'< passwd.txt tr a-z A-Z'
			],
			why: '`tr` ne lit que son entrée standard, donc `< passwd.txt` lui donne le fichier. Il remplace chaque caractère de `a-z` par celui qui est à la même place dans `A-Z`.'
		},
		{
			prompt: 'Supprime les retours chariot de `export.csv` et écris le résultat dans `clean.csv`.',
			accept: [
				"tr -d '\\r' < export.csv > clean.csv",
				'tr -d "\\r" < export.csv > clean.csv',
				"cat export.csv | tr -d '\\r' > clean.csv",
				"tr -d '\\015' < export.csv > clean.csv",
				"tr -d '\\r' <export.csv >clean.csv",
				"tr --delete '\\r' < export.csv > clean.csv"
			],
			why: '`-d` supprime chaque caractère de l’ensemble au lieu de le remplacer, et `\\r` désigne le retour chariot. `clean.csv` reçoit les 3 mêmes lignes, terminées par un simple saut de ligne.'
		},
		{
			prompt: 'Affiche la colonne pid (la 2e) de `ps.txt`. Réduis d’abord les suites d’espaces, puis coupe sur une seule espace.',
			accept: [
				"tr -s ' ' < ps.txt | cut -d' ' -f2",
				"tr -s ' ' < ps.txt | cut -d ' ' -f2",
				"tr -s ' ' < ps.txt | cut -d ' ' -f 2",
				'tr -s " " < ps.txt | cut -d" " -f2',
				'tr -s " " < ps.txt | cut -d " " -f2',
				"cat ps.txt | tr -s ' ' | cut -d' ' -f2",
				"cat ps.txt | tr -s ' ' | cut -d ' ' -f2"
			],
			why: '`tr -s \' \'` remplace chaque suite d’espaces par une seule, donc `nginx     1201` donne `nginx 1201`. `cut -d\' \' -f2` affiche ensuite `1201`, `884`, `97`. Sans cette étape, le champ 2 est le texte vide entre les deux premières espaces.'
		},
		{
			prompt: 'Compte les lignes de `app.log`.',
			accept: ['wc -l app.log', 'wc --lines app.log'],
			why: '`wc -l` compte les sauts de ligne et affiche le nombre suivi du nom du fichier : `200 app.log`.'
		},
		{
			prompt: 'Affiche les 5 premières lignes de `app.log`.',
			accept: ['head -n 5 app.log', 'head -5 app.log', 'head -n5 app.log', 'head --lines=5 app.log'],
			why: '`-n 5` affiche 5 lignes au lieu des 10 par défaut. `-5` est une ancienne syntaxe que `head` de GNU accepte encore si elle vient en premier.'
		},
		{
			prompt: 'Affiche les 20 dernières lignes de `app.log`.',
			accept: ['tail -n 20 app.log', 'tail -20 app.log', 'tail -n20 app.log', 'tail --lines=20 app.log'],
			why: '`tail -n 20` affiche les 20 dernières lignes, de `id=181` à `id=200`.'
		},
		{
			prompt: 'Affiche toutes les lignes de `users.csv` sauf l’en-tête.',
			accept: ['tail -n +2 users.csv', 'tail -n+2 users.csv', 'tail --lines=+2 users.csv'],
			why: 'Avec un `+`, `tail -n +2` commence à la ligne 2 au lieu de compter depuis la fin. Il affiche les 3 lignes de données et saute `name,email`.'
		},
		{
			prompt: 'Affiche la fin de `app.log` et continue d’afficher les nouvelles lignes au fur et à mesure que l’appli les écrit.',
			accept: ['tail -f app.log', 'tail --follow app.log'],
			why: '`-f` affiche les 10 dernières lignes puis attend les données ajoutées. Ctrl+C l’arrête.'
		},
		{
			prompt: 'Suis `app.log` et continue quand la rotation des logs le renomme et crée un nouveau `app.log`.',
			accept: ['tail -F app.log', 'tail --follow=name --retry app.log', 'tail --retry --follow=name app.log'],
			why: '`-F` vaut `--follow=name --retry` : `tail` suit le nom `app.log` et le rouvre quand un nouveau fichier apparaît. Avec `-f`, `tail` suit le fichier ouvert et continue donc à lire l’ancien log renommé.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `cut -d\' \' -f2 ps.txt` affiche-t-il des lignes vides, et comment corriger ?',
		a: 'Les colonnes sont alignées avec plusieurs espaces, donc le champ 2 est le texte vide entre les deux premières. `tr -s \' \'` réduit chaque suite à une seule espace avant `cut`.'
	},
	sources: [
		{ title: 'cut(1)', url: 'https://man7.org/linux/man-pages/man1/cut.1.html' },
		{ title: 'tr(1)', url: 'https://man7.org/linux/man-pages/man1/tr.1.html' },
		{ title: 'wc(1)', url: 'https://man7.org/linux/man-pages/man1/wc.1.html' },
		{ title: 'tail(1)', url: 'https://man7.org/linux/man-pages/man1/tail.1.html' },
		{ title: 'GNU coreutils : head invocation', url: 'https://www.gnu.org/software/coreutils/manual/html_node/head-invocation.html' }
	]
};
