/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sort-uniq',
	part: 'Le shell',
	title: 'Trier et compter',
	minutes: 10,
	hook: [
		'L’API a ralenti à 14 h et tu soupçonnes un client de la bombarder. Tu as sorti les IP clientes du log d’accès dans un fichier. Tu veux savoir quelle IP a envoyé le plus de requêtes, et quels endpoints ont été les plus lents.',
		'Les exercices utilisent 4 fichiers. `ips.txt` contient 10 lignes, une IP chacune, dans l’ordre d’arrivée : `10.0.0.7`, `10.0.0.3`, `10.0.0.7`, `10.0.0.12`, `10.0.0.3`, `10.0.0.7`, `10.0.0.9`, `10.0.0.7`, `10.0.0.12`, `10.0.0.3`. `sizes.txt` contient 5 nombres, un par ligne : `512`, `64`, `2048`, `9`, `128`. `requests.txt` a 5 lignes `chemin statut ms` séparées par des espaces, comme `/api/users 500 1200` et `/health 200 3`. `orders.csv` a 4 lignes `id,client,total` sans en-tête, comme `102,omar,7.99`.'
	],
	terms: [
		{ term: 'champ', def: 'Une colonne d’une ligne. Par défaut, `sort` coupe les champs là où commencent les blancs ; `-t` choisit un autre séparateur.' },
		{ term: 'clé de tri', def: 'La partie de chaque ligne que `sort` compare, choisie avec `-k`. Sans `-k`, `sort` compare les lignes entières.' },
		{ term: 'lignes adjacentes', def: 'Des lignes qui se suivent. `uniq` ne fusionne des lignes égales que si elles sont adjacentes.' }
	],
	reps: [
		{
			prompt: 'Trie les lignes de `sizes.txt` avec la comparaison texte par défaut.',
			accept: ['sort sizes.txt', 'sort < sizes.txt', 'sort <sizes.txt', 'cat sizes.txt | sort'],
			why: '`sort` compare les lignes entières comme du texte. Tu obtiens `128`, `2048`, `512`, `64`, `9`, car `1` passe avant `2`, `5`, `6` et `9`.'
		},
		{
			prompt: 'Trie `sizes.txt` par valeur numérique, du plus petit au plus grand.',
			accept: ['sort -n sizes.txt', 'sort --numeric-sort sizes.txt', 'sort -n < sizes.txt', 'sort --sort=numeric sizes.txt'],
			why: '`-n` compare les nombres en début de ligne. Tu obtiens `9`, `64`, `128`, `512`, `2048`.'
		},
		{
			prompt: 'Trie `sizes.txt` par valeur numérique, du plus grand au plus petit.',
			accept: [
				'sort -rn sizes.txt',
				'sort -nr sizes.txt',
				'sort -n -r sizes.txt',
				'sort -r -n sizes.txt',
				'sort --numeric-sort --reverse sizes.txt',
				'sort --reverse --numeric-sort sizes.txt',
				'sort -n --reverse sizes.txt',
				'sort -r --numeric-sort sizes.txt'
			],
			why: '`-r` inverse le résultat de chaque comparaison et `-n` la rend numérique. `2048` sort en premier.'
		},
		{
			prompt: 'Trie `requests.txt` sur sa 3e colonne, le temps en ms, le plus lent d’abord.',
			accept: [
				'sort -k3 -rn requests.txt',
				'sort -k3 -nr requests.txt',
				'sort -rn -k3 requests.txt',
				'sort -nr -k3 requests.txt',
				'sort -k3,3 -rn requests.txt',
				'sort -k3,3 -nr requests.txt',
				'sort -rn -k3,3 requests.txt',
				'sort -nr -k3,3 requests.txt',
				'sort -k 3 -rn requests.txt',
				'sort -k3rn requests.txt',
				'sort -k3,3rn requests.txt',
				'sort -k3nr requests.txt',
				'sort -k3,3nr requests.txt'
			],
			why: '`-k3` fait commencer la clé de tri au champ 3 : `sort` compare `1200`, `880` et les autres temps au lieu des chemins. `-rn` trie cette clé comme un nombre, du plus grand au plus petit. `-k3,3` arrête aussi la clé au champ 3, ce qui donne le même résultat ici puisque le temps est la dernière colonne.'
		},
		{
			prompt: 'Trie `orders.csv` sur son 3e champ séparé par des virgules, le total, du plus petit au plus grand.',
			accept: [
				'sort -t, -k3 -n orders.csv',
				'sort -t, -k3,3 -n orders.csv',
				'sort -t, -n -k3 orders.csv',
				'sort -n -t, -k3 orders.csv',
				'sort -t , -k3 -n orders.csv',
				"sort -t ',' -k3 -n orders.csv",
				"sort -t',' -k3 -n orders.csv",
				'sort -t, -k3n orders.csv',
				'sort -t, -k3,3n orders.csv',
				'sort -t, -nk3 orders.csv'
			],
			why: '`-t,` fait de la virgule le séparateur de champs : le champ 3 est le total. `-k3 -n` le trie comme un nombre : `7.99` d’omar arrive en premier, `120.00` d’ines en dernier.'
		},
		{
			prompt: 'Affiche chaque IP de `ips.txt` une seule fois.',
			accept: ['sort -u ips.txt', 'sort --unique ips.txt', 'sort ips.txt | uniq', 'cat ips.txt | sort | uniq', 'sort ips.txt|uniq'],
			why: '`sort -u` trie puis garde la première ligne de chaque groupe de lignes égales. Il reste 4 lignes, une par IP.'
		},
		{
			prompt: 'Compte combien de requêtes chaque IP de `ips.txt` a envoyées. Affiche le compte devant chaque IP.',
			accept: ['sort ips.txt | uniq -c', 'sort ips.txt | uniq --count', 'cat ips.txt | sort | uniq -c', 'sort < ips.txt | uniq -c', 'sort ips.txt|uniq -c'],
			why: '`sort` place les IP égales les unes à côté des autres, puis `uniq -c` affiche chaque groupe une fois avec sa taille devant, comme `4 10.0.0.7`. Sans `sort`, `uniq -c ips.txt` affiche 10 lignes qui disent toutes `1`.'
		},
		{
			prompt: 'Affiche les 3 IP de `ips.txt` qui ont envoyé le plus de requêtes, avec leur compte, la plus active d’abord.',
			accept: [
				'sort ips.txt | uniq -c | sort -rn | head -3',
				'sort ips.txt | uniq -c | sort -rn | head -n 3',
				'sort ips.txt | uniq -c | sort -rn | head -n3',
				'sort ips.txt | uniq -c | sort -nr | head -3',
				'sort ips.txt | uniq -c | sort -nr | head -n 3',
				'sort ips.txt | uniq -c | sort -nr | head -n3',
				'sort ips.txt | uniq -c | sort -n -r | head -3',
				'sort ips.txt | uniq -c | sort -n -r | head -n 3'
			],
			why: '`uniq -c` met le compte en début de ligne, donc le second `sort -rn` range les IP par compte, du plus grand au plus petit. `head -3` garde `4 10.0.0.7`, `3 10.0.0.3` et `2 10.0.0.12`.'
		},
		{
			prompt: 'Affiche seulement les IP de `ips.txt` qui apparaissent plus d’une fois, chacune sur une ligne.',
			accept: ['sort ips.txt | uniq -d', 'sort ips.txt | uniq --repeated', 'cat ips.txt | sort | uniq -d', 'sort < ips.txt | uniq -d'],
			why: '`uniq -d` affiche une ligne par groupe de doublons et saute les lignes uniques. `10.0.0.9` n’apparaît pas.'
		},
		{
			prompt: 'Trie `sizes.txt` par valeur numérique et réécris le résultat dans `sizes.txt`.',
			accept: [
				'sort -n -o sizes.txt sizes.txt',
				'sort -n sizes.txt -o sizes.txt',
				'sort -o sizes.txt -n sizes.txt',
				'sort -no sizes.txt sizes.txt',
				'sort -n --output=sizes.txt sizes.txt',
				'sort --numeric-sort --output=sizes.txt sizes.txt',
				'sort -n sizes.txt --output=sizes.txt'
			],
			why: '`-o sizes.txt` désigne le fichier de sortie, et `sort` de GNU lit toute son entrée avant d’ouvrir ce fichier. Avec `sort -n sizes.txt > sizes.txt`, tu obtiens un fichier vide : le shell vide `sizes.txt` avant que `sort` démarre.'
		}
	],
	quiz: [],
	recall: {
		q: 'Qu’affiche `uniq -c ips.txt` si tu oublies `sort`, et pourquoi ?',
		a: '10 lignes qui commencent toutes par `1`. `uniq` ne fusionne que des lignes égales adjacentes, et dans `ips.txt` aucune IP n’est à côté d’une IP identique.'
	},
	sources: [
		{ title: 'sort(1)', url: 'https://man7.org/linux/man-pages/man1/sort.1.html' },
		{ title: 'GNU coreutils : sort invocation', url: 'https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html' },
		{ title: 'uniq(1)', url: 'https://man7.org/linux/man-pages/man1/uniq.1.html' },
		{ title: 'head(1)', url: 'https://man7.org/linux/man-pages/man1/head.1.html' }
	]
};
