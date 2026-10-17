/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'regex-groups',
	part: 'Texte et données',
	title: 'Les groupes en regex',
	minutes: 10,
	hook: [
		'Tu écris un petit script Node qui lit le `access.log` d’un serveur d’API et transforme chaque ligne en objet. Il te faut la date, l’IP du client, la méthode et le chemin de chaque ligne. Les parenthèses d’une regex JavaScript servent à ça : chaque paire garde le texte qu’elle a trouvé, et tu le relis par son numéro ou par son nom.',
		'Les exercices utilisent trois chaînes. Une ligne de `access.log` : `2026-10-14 09:12:03 10.0.0.12 GET /api/users/42 200 18ms`. Une ligne de `README.md` avec une faute : `Run the the tests before you push.` Une ligne de `app.conf` : `name="api" region="eu-west-1"`. Écris chaque réponse comme un littéral de regex, `/.../`, sans drapeau sauf si l’énoncé en demande un.'
	],
	terms: [
		{ term: 'Groupe capturant', def: '`(...)` dans une regex. Il garde le texte trouvé, numéroté 1, 2, 3 dans l’ordre des parenthèses ouvrantes.' },
		{ term: 'Groupe non capturant', def: '`(?:...)` dans une regex. Il regroupe une partie du motif pour `|` ou un quantificateur, sans rien garder.' },
		{ term: 'Référence arrière', def: '`\\1` ou `\\k<name>` dans un motif. Elle reconnaît le même texte que celui trouvé plus tôt par un groupe du motif.' },
		{ term: 'Quantificateur paresseux', def: 'Un quantificateur suivi de `?`, comme `*?` ou `+?`. Il prend le moins de caractères possible.' }
	],
	reps: [
		{
			prompt: 'Capture l’année, le mois et le jour de `2026-10-14` dans les groupes 1, 2 et 3.',
			accept: [
				'/(\\d{4})-(\\d{2})-(\\d{2})/',
				'/^(\\d{4})-(\\d{2})-(\\d{2})/',
				'/(\\d\\d\\d\\d)-(\\d\\d)-(\\d\\d)/',
				'/([0-9]{4})-([0-9]{2})-([0-9]{2})/',
				'/(\\d+)-(\\d+)-(\\d+)/'
			],
			why: 'Chaque `(...)` est un groupe capturant. MDN : "Capturing groups are numbered by the order of their opening parentheses." (les groupes sont numérotés dans l’ordre de leur parenthèse ouvrante). Sur la ligne de log, `exec()` renvoie `2026`, `10` et `14` aux index 1, 2 et 3, et la correspondance entière à l’index 0.'
		},
		{
			prompt: 'Même date, mais nomme les groupes `year`, `month` et `day`.',
			accept: [
				'/(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/',
				'/^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/',
				'/(?<year>\\d\\d\\d\\d)-(?<month>\\d\\d)-(?<day>\\d\\d)/',
				'/(?<year>[0-9]{4})-(?<month>[0-9]{2})-(?<day>[0-9]{2})/',
				'/(?<year>\\d+)-(?<month>\\d+)-(?<day>\\d+)/'
			],
			why: '`(?<year>...)` est un groupe capturant nommé. Le résultat range `2026` dans `m.groups.year`. Le groupe garde aussi son numéro : `m[1]` vaut aussi `2026`.'
		},
		{
			prompt: 'Tape la chaîne de remplacement pour `line.replace(/(\\d{4})-(\\d{2})-(\\d{2})/, ...)` qui change `2026-10-14` en `14/10/2026`.',
			accept: ["'$3/$2/$1'", '"$3/$2/$1"', '`$3/$2/$1`', '$3/$2/$1'],
			why: 'Dans une chaîne de remplacement, `$3` insère le texte du groupe 3, ici le jour `14`. `$2` est le mois et `$1` l’année. Les barres obliques entre eux sont du texte littéral.'
		},
		{
			prompt: 'Avec les groupes nommés de l’exercice 2 : tape la chaîne de remplacement qui change `2026-10-14` en `14/10/2026`.',
			accept: ["'$<day>/$<month>/$<year>'", '"$<day>/$<month>/$<year>"', '`$<day>/$<month>/$<year>`', '$<day>/$<month>/$<year>'],
			why: '`$<day>` insère le texte du groupe nommé `day`. MDN précise que `$n` et `$<Name>` ne marchent que si le premier argument de `replace()` est une regex. Avec un motif en simple chaîne, ils restent du texte littéral.'
		},
		{
			prompt: 'Reconnais l’IP `10.0.0.12` avec un groupe non capturant répété 3 fois.',
			accept: [
				'/\\d+(?:\\.\\d+){3}/',
				'/(?:\\d+\\.){3}\\d+/',
				'/\\d{1,3}(?:\\.\\d{1,3}){3}/',
				'/(?:\\d{1,3}\\.){3}\\d{1,3}/'
			],
			why: '`(?:\\.\\d+)` regroupe un point et un nombre pour que `{3}` répète les deux. Le début `(?:` fait que le groupe ne garde rien : `m[1]` n’existe pas et la correspondance vaut juste `10.0.0.12`. Le point est échappé, car un `.` seul reconnaît n’importe quel caractère.'
		},
		{
			prompt: 'Reconnais `GET` ou `POST`, une espace, puis capture le chemin dans le groupe 1. Ne capture pas la méthode.',
			accept: [
				'/(?:GET|POST) (\\S+)/',
				'/(?:POST|GET) (\\S+)/',
				'/(?:GET|POST)\\s(\\S+)/',
				'/(?:POST|GET)\\s(\\S+)/',
				'/(?:GET|POST) ([^ ]+)/',
				'/(?:POST|GET) ([^ ]+)/'
			],
			why: 'MDN : "A disjunction has the lowest precedence in a regular expression." (le `|` a la priorité la plus basse). Sans groupe, `/GET|POST (\\S+)/` veut dire `GET` tout seul, ou `POST` suivi d’un chemin. `(?:GET|POST)` limite le `|` à la méthode, et `(\\S+)` capture `/api/users/42` dans le groupe 1.'
		},
		{
			prompt: 'Dans la ligne de `README.md`, trouve un mot écrit deux fois de suite (`the the`). Utilise une référence arrière numérotée.',
			accept: [
				'/\\b(\\w+) \\1\\b/',
				'/\\b(\\w+)\\s\\1\\b/',
				'/\\b(\\w+)\\s+\\1\\b/',
				'/\\b(\\w+) \\1\\b/i',
				'/\\b(\\w+)\\s+\\1\\b/i'
			],
			why: '`(\\w+)` capture un mot, et `\\1` reconnaît exactement le texte trouvé par le groupe 1, ici `the`. Les `\\b` aux deux bouts empêchent de trouver `the theory`, où `the` n’est que le début d’un mot plus long.'
		},
		{
			prompt: 'Même recherche, avec un groupe nommé `word` et une référence arrière nommée.',
			accept: [
				'/\\b(?<word>\\w+) \\k<word>\\b/',
				'/\\b(?<word>\\w+)\\s\\k<word>\\b/',
				'/\\b(?<word>\\w+)\\s+\\k<word>\\b/',
				'/\\b(?<word>\\w+) \\k<word>\\b/i',
				'/\\b(?<word>\\w+)\\s+\\k<word>\\b/i'
			],
			why: '`\\k<word>` reconnaît le même texte que le groupe nommé `word`. Il fait le travail de `\\1`, mais il vise toujours le bon groupe si tu ajoutes plus tard un autre groupe devant.'
		},
		{
			prompt: 'Dans la ligne de `app.conf`, capture `api`, le texte entre la première paire de guillemets droits. Utilise un quantificateur paresseux.',
			accept: ['/"(.*?)"/', '/"(.+?)"/', '/name="(.*?)"/', '/name="(.+?)"/'],
			why: '`.*` seul est gourmand : `/"(.*)"/` va jusqu’au dernier guillemet et capture `api" region="eu-west-1`. Le `?` de `.*?` le rend paresseux : il s’arrête au premier guillemet fermant, et le groupe 1 vaut `api`.'
		},
		{
			prompt: 'Ajoute à la regex paresseuse de l’exercice 9 (`/"(.*?)"/`) le drapeau dont `line.matchAll()` a besoin, pour obtenir les deux valeurs entre guillemets.',
			accept: ['/"(.*?)"/g', '/"(.+?)"/g'],
			why: 'Le drapeau `g` fait chercher la regex dans toute la chaîne. MDN : `matchAll()` lève une `TypeError` si la regex n’a pas le drapeau `g`. Avec lui, les correspondances donnent `api` et `eu-west-1` dans le groupe 1.'
		}
	],
	quiz: [],
	recall: {
		q: 'Que change le `?` après `.*` dans `/"(.*?)"/` sur `name="api" region="eu-west-1"` ?',
		a: 'Il rend `.*` paresseux : il prend le moins de caractères possible, donc le groupe 1 s’arrête au premier guillemet fermant et vaut `api`. Sans lui, le groupe 1 vaut `api" region="eu-west-1`.'
	},
	sources: [
		{ title: 'MDN : groupe capturant', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Capturing_group' },
		{ title: 'MDN : groupe capturant nommé', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Named_capturing_group' },
		{ title: 'MDN : groupe non capturant', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Non-capturing_group' },
		{ title: 'MDN : référence arrière', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Backreference' },
		{ title: 'MDN : référence arrière nommée', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Named_backreference' },
		{ title: 'MDN : quantificateurs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Regular_expressions/Quantifier' },
		{ title: 'MDN : String.prototype.replace()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace' },
		{ title: 'MDN : String.prototype.matchAll()', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/matchAll' }
	]
};
