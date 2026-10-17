/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'grep',
	part: 'Le shell',
	title: 'Chercher dans du texte',
	minutes: 10,
	hook: [
		'Des clients signalent des paiements refusés depuis 08:00. Tu as un shell dans `~/shop` avec le `grep` de GNU, le log de l’appli de ce matin et le code source. Tu veux les lignes en échec, leur nombre, et l’endroit où le code règle le délai de paiement.',
		'`logs/app.log` compte 8 lignes, chacune commence par une date, une heure et un niveau. On y trouve 3 lignes `INFO`, 2 `WARN`, 2 `ERROR` ("payment failed: timeout" et "payment failed: card declined"), et 1 ligne `error retrying payment` en minuscules. `src/` contient `payment.js`, avec la variable `timeoutMs` aux lignes 1 et 5 et le mot `timeout` dans un commentaire à la ligne 4. Il contient aussi `config.json`, une seule ligne `{ "timeout": 5000, "retries": 3 }`, et `cart.js`, qui ne parle pas de délai. Chaque exercice se tape dans `~/shop`.'
	],
	terms: [
		{ term: 'motif', def: 'Le texte ou l’expression régulière que `grep` cherche dans chaque ligne, comme `ERROR` ou `WARN|ERROR`.' },
		{ term: 'correspondance', def: 'Une ligne qui contient le motif. Par défaut, `grep` affiche chaque correspondance et rien d’autre.' },
		{ term: 'caractère de mot', def: 'Une lettre, un chiffre ou `_`. `-w` s’en sert pour savoir où un mot commence et finit.' }
	],
	reps: [
		{
			prompt: 'Affiche les lignes de `logs/app.log` qui contiennent `ERROR`.',
			accept: ['grep ERROR logs/app.log', "grep 'ERROR' logs/app.log", 'grep "ERROR" logs/app.log', 'grep -e ERROR logs/app.log'],
			why: '`grep ERROR logs/app.log` affiche chaque ligne qui contient `ERROR`. Il en sort 2 : la recherche respecte la casse, donc `error retrying payment` n’apparaît pas.'
		},
		{
			prompt: 'Affiche les lignes de `logs/app.log` qui contiennent `error`, en majuscules ou en minuscules.',
			accept: [
				'grep -i error logs/app.log',
				'grep -i ERROR logs/app.log',
				"grep -i 'error' logs/app.log",
				'grep -i "error" logs/app.log',
				'grep --ignore-case error logs/app.log',
				'grep --ignore-case ERROR logs/app.log'
			],
			why: 'Avec `-i`, une majuscule et sa minuscule se valent. La sortie compte maintenant 3 lignes, dont `error retrying payment`.'
		},
		{
			prompt: 'Affiche les lignes `WARN` de `logs/app.log` avec leur numéro de ligne.',
			accept: ['grep -n WARN logs/app.log', "grep -n 'WARN' logs/app.log", 'grep -n "WARN" logs/app.log', 'grep --line-number WARN logs/app.log'],
			why: '`-n` place le numéro de ligne et deux-points devant chaque correspondance : `2:` et `8:`.'
		},
		{
			prompt: 'Affiche seulement le nombre de lignes de `logs/app.log` qui contiennent `ERROR`.',
			accept: ['grep -c ERROR logs/app.log', "grep -c 'ERROR' logs/app.log", 'grep -c "ERROR" logs/app.log', 'grep --count ERROR logs/app.log'],
			why: '`-c` remplace les lignes par le nombre de lignes qui correspondent et affiche `2`. Il compte des lignes : une ligne avec deux fois `ERROR` compte une seule fois.'
		},
		{
			prompt: 'Affiche les lignes de `logs/app.log` qui ne contiennent pas `INFO`.',
			accept: ['grep -v INFO logs/app.log', "grep -v 'INFO' logs/app.log", 'grep -v "INFO" logs/app.log', 'grep --invert-match INFO logs/app.log'],
			why: '`-v` garde les lignes qui ne correspondent pas. Il affiche les 5 lignes qui ne sont pas `INFO` : 2 `WARN`, 2 `ERROR` et la ligne `error` en minuscules.'
		},
		{
			prompt: 'Affiche les lignes de `logs/app.log` qui contiennent `WARN` ou `ERROR`, avec une seule expression régulière étendue.',
			accept: [
				"grep -E 'WARN|ERROR' logs/app.log",
				'grep -E "WARN|ERROR" logs/app.log',
				"grep -E 'ERROR|WARN' logs/app.log",
				'grep -E "ERROR|WARN" logs/app.log',
				"grep --extended-regexp 'WARN|ERROR' logs/app.log"
			],
			why: '`-E` lit le motif comme une expression régulière étendue, où `|` veut dire ou. Les guillemets empêchent le shell de prendre `|` pour un pipe. Sans `-E`, `grep` chercherait le texte `WARN|ERROR` tel quel et n’afficherait rien.'
		},
		{
			prompt: 'Cherche `timeout` dans tous les fichiers sous `src`.',
			accept: ['grep -r timeout src', 'grep -r timeout src/', "grep -r 'timeout' src", 'grep -r "timeout" src', 'grep -R timeout src', 'grep --recursive timeout src'],
			why: '`-r` lit chaque fichier sous `src`, et chaque correspondance commence par le nom de son fichier, comme `src/config.json:`. Il trouve 4 lignes, car `timeout` fait aussi partie de `timeoutMs`.'
		},
		{
			prompt: 'Affiche seulement le nom des fichiers sous `src` qui contiennent `timeout`.',
			accept: [
				'grep -rl timeout src',
				'grep -lr timeout src',
				'grep -r -l timeout src',
				'grep -l -r timeout src',
				'grep -rl timeout src/',
				"grep -rl 'timeout' src",
				'grep -r --files-with-matches timeout src'
			],
			why: '`-l` affiche chaque nom de fichier une fois au lieu des lignes, et arrête de lire un fichier à sa première correspondance. Il affiche `src/payment.js` et `src/config.json`.'
		},
		{
			prompt: 'Cherche `timeout` comme mot entier dans tous les fichiers sous `src`, pour que `timeoutMs` ne compte pas.',
			accept: [
				'grep -rw timeout src',
				'grep -wr timeout src',
				'grep -r -w timeout src',
				'grep -w -r timeout src',
				'grep -rw timeout src/',
				"grep -rw 'timeout' src",
				'grep -r --word-regexp timeout src'
			],
			why: '`-w` ne garde une correspondance que si les caractères autour ne sont pas des caractères de mot. Dans `timeoutMs`, le caractère suivant est `M` : il reste 2 lignes, le commentaire de `payment.js` et `"timeout"` dans `config.json`.'
		},
		{
			prompt: 'Cherche `timeout` sous `src`, mais seulement dans les fichiers dont le nom finit par `.js`.',
			accept: [
				"grep -r --include='*.js' timeout src",
				'grep -r --include="*.js" timeout src',
				'grep -r --include=*.js timeout src',
				"grep -r timeout --include='*.js' src",
				"grep -r timeout src --include='*.js'",
				'grep -r timeout src --include="*.js"',
				"grep -r --include '*.js' timeout src"
			],
			why: 'Avec `--include=\'*.js\'`, `grep -r` ne lit que les fichiers dont le nom de base correspond au glob. `config.json` est sauté : les 3 lignes viennent toutes de `src/payment.js`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quelle option empêche `grep timeout` de trouver `timeoutMs`, et que vérifie-t-elle ?',
		a: '`-w`. Elle ne garde une correspondance que si les caractères juste avant et juste après ne sont ni des lettres, ni des chiffres, ni `_`. Dans `timeoutMs`, le `M` qui suit est une lettre.'
	},
	sources: [
		{ title: 'grep(1), page de manuel de GNU grep', url: 'https://man7.org/linux/man-pages/man1/grep.1.html' },
		{ title: 'regex(7), expressions régulières POSIX', url: 'https://man7.org/linux/man-pages/man7/regex.7.html' }
	]
};
