const ESLINT = 'https://github.com/eslint/eslint';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'missing-check',
	part: 'La logique',
	title: 'Un tableau qui passe pour une sévérité',
	minutes: 10,
	hook: [
		'ESLint valide chaque règle d’une config avant de linter quoi que ce soit. Une entrée de règle est une sévérité, ou un tableau avec la sévérité en premier et les options de la règle ensuite. La doc autorise six sévérités : `0`, `1`, `2`, `"off"`, `"warn"` et `"error"`.',
		'Un utilisateur a passé `\'comma-dangle\': [[\'error\'], \'never\']` à `CLIEngine`. La sévérité est le tableau `[\'error\']`, et ESLint 2.3.0 l’a **acceptée sans erreur**.'
	],
	terms: [
		{ term: 'Sévérité', def: 'La façon dont ESLint signale une règle : désactivée, avertissement ou erreur, écrite 0, 1, 2 ou sous forme de chaîne.' },
		{ term: 'Coercition de type', def: 'JavaScript qui convertit tout seul une valeur vers un autre type, par exemple un tableau en chaîne.' },
		{ term: 'RegExp.prototype.test', def: 'Renvoie true quand le motif correspond. Convertit d’abord en chaîne un argument qui n’en est pas une.' }
	],
	bug: {
		title: 'Fix: validate the type of severity level (fixes #5499)',
		repo: 'eslint/eslint',
		url: `${ESLINT}/blob/d727f17f4efc888ed0e59259a4e4cac01a42f0d9/lib/config/config-validator.js#L64-L113`,
		fix: `${ESLINT}/commit/641b3f784098d109f29eb7ca2c94db6c1a641fd7`,
		lang: 'javascript',
		code: `function validateRuleOptions(id, options, source) {
    var validateRule = validators.rules[id],
        message,
        severity,
        localOptions,
        schema = getRuleOptionsSchema(id),
        validSeverity = true;
…
    // if it's not an array, it should be just a severity
    if (Array.isArray(options)) {
        localOptions = options.concat();    // clone
        severity = localOptions.shift();
    } else {
        severity = options;
        localOptions = [];
    }

    validSeverity = (severity === 0 || severity === 1 || severity === 2 || /^(?:off|warn|error)$/i.test(severity));

    if (validateRule) {
        validateRule(localOptions);
    }

    if ((validateRule && validateRule.errors) || !validSeverity) {
…
        throw new Error(message.join(""));
    }
}`,
		lines: [18],
		diff: `         localOptions = [];
     }

-    validSeverity = (severity === 0 || severity === 1 || severity === 2 || /^(?:off|warn|error)$/i.test(severity));
+    validSeverity = (
+        severity === 0 || severity === 1 || severity === 2 ||
+        (typeof severity === "string" && /^(?:off|warn|error)$/i.test(severity))
+    );

     if (validateRule) {`,
		notes: [
			'La ligne 18 suppose que tout ce qui n’est pas 0, 1 ou 2 est une chaîne. `RegExp.prototype.test` convertit son argument en chaîne, donc le test demande en réalité si `String(severity)` ressemble à une sévérité.',
			'Dans le rapport, `options` vaut `[[\'error\'], \'never\']`. À la ligne 12, `shift()` prend le premier élément, donc `severity` vaut `[\'error\']`. `String([\'error\'])` donne `"error"`, la regex de la ligne 18 correspond, et la ligne 26 ne lève rien. Un tableau à deux éléments comme `[\'warn\', \'error\']` donne la chaîne `"warn,error"` et reste refusé : seuls les tableaux à un élément passent.',
			'Le correctif ajoute `typeof severity === "string"` avant la regex de la ligne 18. ESLint teste toujours les nombres avec `===` et les chaînes avec la regex, et tout autre type échoue désormais.',
			'L’[issue #5499](' + ESLINT + '/issues/5499) s’intitule "An array is unexpectedly regarded as a valid ESLint severity". L’auteur y donnait la cause : "`String([\'error\'])` returns `\'error\'`. Unfortunately, that also matches `/^(?:off|warn|error)$/i`."'
		]
	},
	quiz: [
		{
			q: 'Que renvoie `/^(?:off|warn|error)$/i.test([\'error\'])` ?',
			options: [
				'`false`, car un tableau n’est pas une chaîne',
				'`true`, car le tableau devient la chaîne `"error"`',
				'Une `TypeError` pour un argument qui n’est pas une chaîne',
				'`false`, car la chaîne convertie vaut `"[error]"`'
			],
			answer: 1,
			why: '`test` convertit son argument avec `String()`. Un tableau à un élément donne la chaîne de cet élément, `"error"`, qui correspond au motif.'
		},
		{
			q: 'Laquelle de ces sévérités le test bogué refuse-t-il ?',
			options: [
				'`[\'off\']`, un tableau avec une chaîne',
				'`\'ERROR\'`, une chaîne en capitales',
				'`2`, le nombre pour une erreur',
				'`[\'warn\', \'error\']`, un tableau de deux'
			],
			answer: 3,
			why: '`String([\'warn\', \'error\'])` donne `"warn,error"`, qui ne correspond pas. `[\'off\']` donne `"off"` et passe à tort. `\'ERROR\'` et `2` sont des sévérités valides.'
		},
		{
			q: 'Tu valides une valeur avec une regex. Qu’est-ce qui empêche les autres types de passer ?',
			options: [
				'Ajouter le flag `u` pour rendre la regex plus stricte',
				'Appeler `String(value)` avant le test, pour avoir toujours une chaîne',
				'Mettre le test dans un `try` et refuser en cas d’exception',
				'Tester `typeof value === "string"` avant la regex'
			],
			answer: 3,
			why: 'La regex ne voit qu’une chaîne, quelle que soit l’entrée. Le type doit être vérifié à part, avant la conversion.'
		}
	],
	recall: {
		q: 'Pourquoi ESLint 2.3.0 acceptait `[\'error\']` comme sévérité, et qu’a ajouté le correctif ?',
		a: '`RegExp.prototype.test` convertit son argument avec `String()`, et `String([\'error\'])` donne `"error"`, que la regex accepte. Le correctif vérifie `typeof severity === "string"` avant la regex.'
	},
	sources: [
		{ title: 'eslint, issue #5499', url: `${ESLINT}/issues/5499` },
		{ title: 'eslint, pull request #5527', url: `${ESLINT}/pull/5527` }
	]
};
