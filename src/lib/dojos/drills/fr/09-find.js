/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'find',
	part: 'Le shell',
	title: 'Trouver des fichiers',
	minutes: 10,
	hook: [
		'Le disque du serveur `shop` est plein à 97 %, et l’appli cesse d’enregistrer les commandes à 100 %. Tu as un shell dans `~/shop` et le `find` de GNU. Tu veux savoir quels fichiers prennent la place, quels logs sont vieux, et ce que tu peux supprimer sans risque.',
		'`~/shop` contient `README.md`, `docs/readme.txt` et 4 répertoires. `logs/` contient `app.log` (3 Mo), `app.log.1` (240 Mo) et `worker.log` (2 Mo, écrit il y a 35 jours), plus `logs/old/2026-08-30.log` et `logs/old/2026-08-31.log` (1 Mo chacun, écrits il y a 48 et 47 jours). `src/` contient `index.js` (3 lignes), `cart.js` (2 lignes) et `cart.test.js` (1 ligne). `tmp/` contient `cache-1.tmp`, `cache-2.tmp`, `cache-3.tmp` et un `upload-7f3a.bin` de 150 Mo. Tous les autres fichiers datent d’aujourd’hui. Chaque exercice se tape dans `~/shop` et repart de cet état.'
	],
	terms: [
		{ term: 'point de départ', def: 'Le répertoire que tu donnes en premier à `find`, comme `.` ou `logs`. Il cherche dans ce répertoire et dans tout ce qu’il contient.' },
		{ term: 'test', def: 'Une condition comme `-name` ou `-size`, vraie ou fausse pour chaque fichier. `find` n’affiche un fichier que si tous les tests sont vrais.' },
		{ term: 'glob', def: 'Un motif du shell où `*` remplace n’importe quelle suite de caractères et `?` un seul caractère, comme `*.log`.' }
	],
	reps: [
		{
			prompt: 'Liste tous les fichiers sous `.` dont le nom finit par `.log`.',
			accept: [
				"find . -name '*.log'",
				'find . -name "*.log"',
				'find . -name \\*.log',
				"find -name '*.log'",
				'find -name "*.log"',
				"find . -type f -name '*.log'",
				'find . -type f -name "*.log"',
				"find . -name '*.log' -type f",
				'find . -name "*.log" -type f'
			],
			why: '`-name \'*.log\'` compare le glob au nom du fichier, sans ses répertoires. Les guillemets empêchent le shell de développer `*.log` lui-même. `app.log.1` n’apparaît pas : son nom finit par `.1`.'
		},
		{
			prompt: 'Liste `README.md` et `docs/readme.txt` avec un seul test : les noms qui commencent par `readme`, majuscules ou minuscules.',
			accept: [
				"find . -iname 'readme*'",
				'find . -iname "readme*"',
				"find . -iname 'README*'",
				'find . -iname "README*"',
				"find -iname 'readme*'",
				'find -iname "readme*"'
			],
			why: '`-iname` fait comme `-name` mais sans tenir compte de la casse : `readme*` trouve `README.md` comme `readme.txt`.'
		},
		{
			prompt: 'Liste tous les répertoires sous `.`, `.` compris.',
			accept: ['find . -type d', 'find -type d'],
			why: '`-type d` n’est vrai que pour les répertoires. La sortie contient `.`, car `find` teste aussi le point de départ, puis les 5 répertoires en dessous.'
		},
		{
			prompt: 'Liste les fichiers de plus de 100 Mio.',
			accept: [
				'find . -size +100M',
				'find -size +100M',
				'find . -type f -size +100M',
				'find . -size +100M -type f',
				'find -type f -size +100M',
				'find -size +100M -type f'
			],
			why: '`-size +100M` est vrai quand la taille, arrondie au Mio supérieur, dépasse 100. Il trouve `./logs/app.log.1` et `./tmp/upload-7f3a.bin`. Le `+` veut dire plus de ; `-100M` voudrait dire moins de.'
		},
		{
			prompt: 'Liste les fichiers de `logs` et de ses sous-répertoires modifiés pour la dernière fois il y a plus de 30 jours.',
			accept: [
				'find logs -mtime +30',
				'find logs -type f -mtime +30',
				'find logs -mtime +30 -type f',
				'find logs/ -mtime +30',
				'find ./logs -mtime +30',
				'find logs/ -type f -mtime +30',
				'find ./logs -type f -mtime +30'
			],
			why: '`-mtime +30` compte les périodes entières de 24 heures depuis la dernière modification et est vrai au-delà de 30. Il trouve `worker.log` et les 2 fichiers de `logs/old`.'
		},
		{
			prompt: 'Liste les fichiers `.log` placés directement dans `logs`, sans descendre dans `logs/old`.',
			accept: [
				"find logs -maxdepth 1 -name '*.log'",
				'find logs -maxdepth 1 -name "*.log"',
				"find logs -maxdepth 1 -type f -name '*.log'",
				'find logs -maxdepth 1 -type f -name "*.log"',
				"find logs/ -maxdepth 1 -name '*.log'",
				"find ./logs -maxdepth 1 -name '*.log'"
			],
			why: '`-maxdepth 1` s’arrête 1 niveau sous le point de départ : `find` liste `logs/app.log` et `logs/worker.log` sans jamais lire `logs/old`. Avec `-maxdepth 0`, il ne testerait que `logs` lui-même.'
		},
		{
			prompt: 'Supprime les 3 fichiers `.tmp` de `tmp`, et rien d’autre.',
			accept: [
				"find tmp -name '*.tmp' -delete",
				'find tmp -name "*.tmp" -delete',
				"find tmp -type f -name '*.tmp' -delete",
				'find tmp -type f -name "*.tmp" -delete',
				"find tmp -name '*.tmp' -type f -delete",
				"find . -name '*.tmp' -delete",
				'find . -name "*.tmp" -delete'
			],
			why: '`find` lit la ligne de gauche à droite : `-delete` ne s’applique qu’aux fichiers qui ont passé `-name \'*.tmp\'`. Placé en premier, comme dans `find tmp -delete -name \'*.tmp\'`, il supprimerait aussi `upload-7f3a.bin` et `tmp` lui-même.'
		},
		{
			prompt: 'Compte les lignes de chaque fichier `.js` de `src` avec un seul appel à `wc -l`, pour avoir aussi le total.',
			accept: [
				"find src -name '*.js' -exec wc -l {} +",
				'find src -name "*.js" -exec wc -l {} +',
				"find src -name '*.js' -exec wc -l '{}' +",
				"find src -type f -name '*.js' -exec wc -l {} +",
				'find src -type f -name "*.js" -exec wc -l {} +'
			],
			why: 'Avec `{} +`, `find` ajoute tous les noms de fichiers à une seule ligne de commande `wc -l`. `wc` affiche une ligne par fichier, puis `6 total`.'
		},
		{
			prompt: 'Compresse avec `gzip` chaque fichier `.log` de `logs` vieux de plus de 30 jours, en lançant `gzip` une fois par fichier.',
			accept: [
				"find logs -name '*.log' -mtime +30 -exec gzip {} \\;",
				'find logs -name "*.log" -mtime +30 -exec gzip {} \\;',
				"find logs -name '*.log' -mtime +30 -exec gzip {} ';'",
				"find logs -mtime +30 -name '*.log' -exec gzip {} \\;",
				'find logs -mtime +30 -name "*.log" -exec gzip {} \\;',
				"find logs -type f -name '*.log' -mtime +30 -exec gzip {} \\;"
			],
			why: 'Avec `{} \\;`, `find` lance la commande une fois par fichier, en mettant le nom du fichier à la place de `{}`. La barre oblique inverse transmet `;` à `find` au lieu de laisser le shell y terminer la commande. `gzip` remplace les 3 vieux logs par `worker.log.gz` et 2 autres fichiers `.gz`.'
		},
		{
			prompt: 'Supprime les fichiers `.log` de `logs` et de ses sous-répertoires vieux de plus de 30 jours.',
			accept: [
				"find logs -name '*.log' -mtime +30 -delete",
				'find logs -name "*.log" -mtime +30 -delete',
				"find logs -mtime +30 -name '*.log' -delete",
				'find logs -mtime +30 -name "*.log" -delete',
				"find logs -type f -name '*.log' -mtime +30 -delete",
				"find logs -type f -mtime +30 -name '*.log' -delete"
			],
			why: 'Les deux tests doivent être vrais avant que `-delete` s’exécute : `find` supprime `worker.log` et les 2 fichiers de `logs/old`. `app.log` reste car il est récent, et `app.log.1` reste car son nom ne correspond pas à `*.log`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `-delete` doit-il venir en dernier dans `find tmp -name \'*.tmp\' -delete` ?',
		a: '`find` évalue la ligne de gauche à droite. Placé en premier, `-delete` s’exécute avant le test `-name` et supprime tous les fichiers sous `tmp`, puis `tmp` lui-même.'
	},
	sources: [{ title: 'find(1), page de manuel de GNU findutils', url: 'https://man7.org/linux/man-pages/man1/find.1.html' }]
};
