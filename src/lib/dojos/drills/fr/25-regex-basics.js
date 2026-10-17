/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'regex-basics',
	part: 'Texte et données',
	title: 'Les bases des regex',
	minutes: 10,
	hook: [
		'La visionneuse de logs de ton équipe a un champ de filtre qui prend une expression régulière JavaScript, écrite `/motif/drapeaux`. Une consigne « Garde » demande une regex qui correspond exactement aux lignes citées. Une consigne « Trouve » demande une regex dont la première correspondance dans chaque ligne est exactement le texte cité.',
		'Le service de paiement a écrit 7 lignes dans la dernière minute : `ERROR order 4821 failed: timeout`, `INFO order 4822 paid`, `WARN disk 91% full`, `error order 77 failed: card declined`, `INFO user ana@example.com logged in`, `INFO order 4823 paid in 2 tries` et `DEBUG cache hit`.'
	],
	terms: [
		{ term: 'ancre', def: 'Une partie de regex qui correspond à une position et pas à un caractère : `^` est le début de l’entrée, `$` la fin et `\\b` une limite de mot.' },
		{ term: 'classe de caractères', def: 'Un ensemble de caractères qui correspond à un seul caractère, comme `[0-9]`, son raccourci `\\d`, ou `[^ ]` pour tout caractère sauf l’espace.' },
		{ term: 'quantificateur', def: 'Un suffixe qui dit combien de fois l’élément qui le précède se répète : `+` pour 1 fois ou plus, `*` pour 0 fois ou plus, `{4}` pour exactement 4.' }
	],
	reps: [
		{
			prompt: 'Garde seulement les lignes qui commencent par `INFO`.',
			accept: ['/^INFO/', '/^INFO /', '/^INFO\\b/', '/^INFO\\s/'],
			why: '`^` correspond au début de l’entrée, et `INFO` doit suivre tout de suite. Les 3 lignes `INFO` passent. Une ligne avec `INFO` au milieu ne passerait pas.'
		},
		{
			prompt: 'Garde seulement les lignes qui finissent par `paid`.',
			accept: ['/paid$/', '/ paid$/', '/\\bpaid$/'],
			why: '`$` correspond à la fin de l’entrée. `INFO order 4822 paid` passe. `INFO order 4823 paid in 2 tries` a `paid` au milieu, donc elle ne passe pas.'
		},
		{
			prompt: 'Garde les lignes qui contiennent `error` en majuscules ou en minuscules, `ERROR` ou `error`. Utilise un drapeau.',
			accept: ['/error/i', '/ERROR/i', '/^error/i', '/^ERROR/i'],
			why: 'Le drapeau `i`, après la barre oblique de fin, rend la recherche insensible à la casse. Sans lui, `/error/` ne garde que la ligne de la commande 77.'
		},
		{
			prompt: 'Garde les lignes avec `order`, une espace, puis exactement 4 chiffres. La ligne de la commande 77 ne doit pas passer.',
			accept: ['/order \\d{4}/', '/order [0-9]{4}/', '/order \\d\\d\\d\\d/', '/order \\d{4}\\b/', '/order [0-9]{4}\\b/'],
			why: '`\\d` correspond à un chiffre, comme `[0-9]`. `{4}` le répète exactement 4 fois : les commandes 4821, 4822 et 4823 passent, `order 77` ne passe pas.'
		},
		{
			prompt: 'Trouve un nombre d’un chiffre ou plus suivi de `%`. Dans la ligne du disque, la correspondance doit être `91%`.',
			accept: ['/\\d+%/', '/[0-9]+%/'],
			why: '`+` répète `\\d` 1 fois ou plus, donc `\\d+` prend les deux chiffres de `91`. `%` n’a pas de sens spécial dans une regex : pas besoin de barre oblique inverse.'
		},
		{
			prompt: 'Trouve `failed: ` et la suite de la ligne. Dans la première ligne, la correspondance doit être `failed: timeout`.',
			accept: ['/failed: .*/', '/failed: .*$/', '/failed:.*/', '/failed: .+/', '/failed: .+$/'],
			why: '`.` correspond à n’importe quel caractère sauf un saut de ligne, et `*` le répète 0 fois ou plus. La correspondance va jusqu’au bout de la ligne : `failed: card declined` pour la commande 77.'
		},
		{
			prompt: 'Trouve `user ` et les caractères qui suivent jusqu’à la prochaine espace. La correspondance doit être `user ana@example.com`.',
			accept: ['/user [^ ]+/', '/user \\S+/', '/user [^\\s]+/'],
			why: '`[^ ]` est une classe niée : elle correspond à un caractère qui n’est pas une espace. `+` la répète jusqu’à l’espace avant `logged`. `\\S`, tout caractère qui n’est pas un blanc, donne ici la même correspondance.'
		},
		{
			prompt: 'Trouve une adresse e-mail : des caractères de mot, `@`, des caractères de mot, un point littéral, puis des caractères de mot. La correspondance doit être `ana@example.com`.',
			accept: ['/\\w+@\\w+\\.\\w+/', '/\\w+@\\w+\\.[a-z]+/', '/[\\w.]+@\\w+\\.\\w+/'],
			why: '`\\w` correspond à une lettre, un chiffre ou `_`, comme `[A-Za-z0-9_]`. `\\.` est un point littéral. Un `.` sans barre correspond à n’importe quel caractère : `/\\w+@\\w+.\\w+/` accepte aussi `ana@example-com`.'
		},
		{
			prompt: 'Garde les lignes qui contiennent `in` comme mot entier. `declined`, dans la ligne de la commande 77, contient `in` et ne doit pas passer.',
			accept: ['/\\bin\\b/'],
			why: '`\\b` correspond à une position où un caractère de mot n’a pas de caractère de mot d’un côté, comme entre `n` et une espace. Elle n’occupe aucun caractère. `logged in` et `paid in 2 tries` passent. Dans `declined`, `in` est entre `l` et `e` : pas de limite.'
		},
		{
			prompt: 'Garde les lignes qui commencent par `WARN` ou par `ERROR`. Utilise un groupe avec `|` à l’intérieur.',
			accept: ['/^(WARN|ERROR)/', '/^(ERROR|WARN)/', '/^(?:WARN|ERROR)/', '/^(?:ERROR|WARN)/'],
			why: '`|` a la priorité la plus basse dans une regex : `/^WARN|ERROR/` veut dire `^WARN` ou `ERROR` n’importe où. Le groupe `( )` garde `^` devant les deux mots. `(?:...)` groupe sans capturer et garde les mêmes 2 lignes.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `/^WARN|ERROR/` accepte une ligne avec `ERROR` au milieu, et comment corriger ?',
		a: '`|` a la priorité la plus basse : la regex se lit `^WARN` ou `ERROR` n’importe où. Un groupe corrige : `/^(WARN|ERROR)/`.'
	},
	sources: [
		{ title: 'MDN : guide des expressions régulières', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions' },
		{ title: 'MDN : classes de caractères', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Character_classes' },
		{ title: 'MDN : assertions', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Assertions' },
		{ title: 'MDN : quantificateurs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Quantifiers' },
		{ title: 'MDN : disjonction', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Disjunction' }
	]
};
