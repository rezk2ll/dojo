const FIX_SHA = '505826b469b16ab36693360da9e11fd13213421b';
const DJ = `https://github.com/django/django/blob/${FIX_SHA}`;
const FIX = `https://github.com/django/django/commit/${FIX_SHA}`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-injection',
	part: 'Les entrées et les sorties',
	title: 'L’injection SQL',
	minutes: 10,
	hook: [
		'Le 3 février 2020, Django sort les versions 3.0.3, 2.2.10 et 1.11.28 pour la CVE-2020-7471. Les notes de version : « `StringAgg` aggregation function was subject to SQL injection, using a suitably crafted `delimiter`. »',
		'`StringAgg(\'name\', delimiter=\', \')` demande à PostgreSQL `STRING_AGG(name, \', \')` : tous les noms collés en une seule chaîne. Django recopiait le séparateur dans le texte SQL, entre deux apostrophes. Un séparateur qui contient un `\'` ferme la chaîne trop tôt, et la base lit la suite comme du SQL.',
		'Le correctif tient en quelques lignes : envoyer le séparateur comme paramètre de requête, hors du texte SQL.'
	],
	terms: [
		{ term: 'Injection SQL', def: 'Une saisie utilisateur est collée dans le texte d’une requête SQL, et des caractères comme `\'` ou `--` dans cette saisie changent ce que fait la requête.' },
		{ term: 'Requête paramétrée', def: 'Le texte SQL contient des marqueurs comme `%s`, et les valeurs partent vers le driver dans une liste à part : `cursor.execute(sql, [value])`.' },
		{ term: 'Marqueur', def: 'L’emplacement d’une valeur dans une requête paramétrée : `%s` dans Django, `?` dans un `PreparedStatement` Java. Il remplace une valeur, jamais un nom de table ou de colonne.' },
		{ term: 'Liste d’autorisation', def: 'Une liste fixe d’entrées acceptées, écrite dans le code, comme `{"name": "last_name", "age": "age"}`. Le code refuse toute entrée qui n’est pas une clé de cette liste.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['input["q = x\' OR \'1\'=\'1"] --> concat["Concaténation : WHERE last_name = \' + q + \'"]'],
				highlight: ['input', 'concat'],
				note: 'Le champ de recherche envoie la charge classique `x\' OR \'1\'=\'1`. Le code construit la requête en collant les chaînes, avec des apostrophes autour de la valeur.'
			},
			{
				add: ['concat --> parsed["WHERE last_name = \'x\' OR \'1\'=\'1\'"]', 'parsed --> all["Toutes les lignes correspondent"]'],
				highlight: ['parsed', 'all'],
				note: 'Le premier `\'` de la saisie ferme la chaîne littérale. `OR \'1\'=\'1\'` entre dans la condition, et il est vrai pour chaque ligne. La base analyse tout le texte et ne sait pas quels caractères viennent de l’utilisateur.'
			},
			{
				add: ['input --> param["cursor.execute(sql avec WHERE last_name = %s, [q])"]', 'param --> literal["Cherche un last_name égal à toute la chaîne, 0 ligne"]'],
				highlight: ['param', 'literal'],
				note: 'Avec une requête paramétrée, `q` n’apparaît jamais dans le texte SQL. La doc de Django : les paramètres « are escaped by the underlying database driver ». La fiche OWASP : la requête cherche alors une valeur qui « literally matches the entire string ».'
			},
			{
				add: ['sort["?sort=age"] --> allow["ORDER BY attend un nom de colonne : vérifie-le avec une liste d’autorisation"]'],
				highlight: ['sort', 'allow'],
				note: 'Un marqueur ne porte qu’une valeur. L’OWASP cite les parties qui « can’t use bind variables, such as table names, column names, or sort order indicators (ASC or DESC) ». Pour celles-là, associe la saisie à un nom écrit dans le code.'
			}
		]
	},
	example: {
		title: 'django/contrib/postgres/aggregates/general.py : StringAgg après le correctif de la CVE-2020-7471',
		repo: 'django/django',
		url: `${DJ}/django/contrib/postgres/aggregates/general.py#L53-L65`,
		lang: 'python',
		code: `class StringAgg(OrderableAggMixin, Aggregate):
    function = 'STRING_AGG'
    template = '%(function)s(%(distinct)s%(expressions)s %(ordering)s)'
    allow_distinct = True

    def __init__(self, expression, delimiter, **extra):
        delimiter_expr = Value(str(delimiter))
        super().__init__(expression, delimiter_expr, **extra)

    def convert_value(self, value, expression, connection):
        if not value:
            return ''
        return value`,
		notes: [
			'La ligne 3 est le gabarit corrigé. [Avant le correctif](' + FIX + '), il valait `"%(function)s(%(distinct)s%(expressions)s, \'%(delimiter)s\'%(ordering)s)"`. Le formatage `%` de Python plaçait le séparateur entre deux apostrophes dans le texte SQL : la même erreur qu’à l’étape 1 du schéma.',
			'La ligne 7 enveloppe le séparateur dans `Value(str(delimiter))`. Le séparateur est maintenant une expression, comme la colonne, et il passe dans `%(expressions)s` avec les autres arguments.',
			'[`Value.as_sql`](' + DJ + '/django/db/models/expressions.py#L664-L680) se termine par `return \'%s\', [val]` : un marqueur dans le texte SQL, la valeur dans la liste des paramètres. Le driver reçoit le séparateur comme une donnée.',
			'Le commit ajoute un test avec `delimiter="\'"`, le caractère qui cassait la requête. Il attend `"Foo1\'Foo2\'Foo4\'Foo3"` : l’apostrophe apparaît entre les noms, comme du texte.'
		]
	},
	tradeoff: {
		gain: [
			'La doc de Django : les querysets « are protected from SQL injection since their queries are constructed using query parameterization ». `Person.objects.filter(last_name=q)` ne demande aucune précaution en plus.',
			'Une relecture peut chercher les quelques appels à risque : `raw(`, `extra(`, `RawSQL(` et `cursor.execute(` avec `%` ou une f-string dans le premier argument.'
		],
		cost: [
			'Les noms de table, de colonne et `ASC`/`DESC` ne passent pas par un marqueur. Chacun demande une liste d’autorisation écrite à la main.',
			'Dans `raw()` et `cursor.execute()`, c’est toi qui écris les marqueurs. La doc de Django met en garde contre le « string formatting on raw queries » et contre les apostrophes autour de `%s`.',
			'L’ORM lui-même peut avoir des trous : les archives de sécurité de Django listent 16 corrections d’injection SQL dans Django entre août 2019 et février 2026, dont la CVE-2020-7471.'
		]
	},
	task: {
		prompt: 'Trouve les deux trous de cette vue Django et réécris la requête. `q = request.GET.get("q", "")`, `sort = request.GET.get("sort", "last_name")`, puis `Person.objects.raw(f"SELECT * FROM app_person WHERE last_name = \'{q}\' ORDER BY {sort}")`.',
		hint: 'Une des saisies est une valeur et peut aller dans la liste des paramètres. L’autre est un nom de colonne. Laquelle un marqueur peut-il porter ?',
		answer: [
			'Trou 1 : `q` est recopié dans le texte SQL entre apostrophes. `?q=x\' OR \'1\'=\'1` renvoie toutes les personnes. Correction : `WHERE last_name = %s` avec `[q]` en paramètres, et sans apostrophes autour de `%s`, comme l’exige la doc de Django.',
			'Trou 2 : `sort` est recopié après `ORDER BY`. Un marqueur ne peut pas porter un nom de colonne, donc les paramètres n’aident pas ici.',
			'Correction pour `sort` : `columns = {"name": "last_name", "age": "age"}` et `column = columns.get(sort, "last_name")`. Seules des chaînes écrites dans le code arrivent dans le SQL.',
			'Résultat : `Person.objects.raw("SELECT * FROM app_person WHERE last_name = %s ORDER BY " + column, [q])`. Sans SQL brut : `Person.objects.filter(last_name=q).order_by(column)`, toujours avec la liste d’autorisation pour `column`.'
		]
	},
	quiz: [
		{
			q: 'Un développeur écrit `cursor.execute("SELECT * FROM person WHERE last_name = \'%s\'", [name])`. Qu’en dit la doc de Django ?',
			options: [
				'C’est sûr, puisque la valeur passe dans la liste des paramètres',
				'Retire les apostrophes autour de `%s` : les mettre est un risque',
				'Remplace `%s` par une f-string, le driver ignore les apostrophes',
				'C’est sûr sous PostgreSQL mais pas sous SQLite, sans paramètres'
			],
			answer: 1,
			why: 'La doc : « you must not include quotes around the %s placeholders in the SQL string », et « If you use string interpolation or quote the placeholder, you’re at risk for SQL injection. » Une f-string recollerait la valeur dans le texte SQL.'
		},
		{
			q: 'Pourquoi `ORDER BY %s` avec `[request.GET["sort"]]` ne donne-t-il pas un tri sûr choisi par l’utilisateur ?',
			options: [
				'Un marqueur porte une valeur, une colonne demande une liste fixe',
				'Ça marche, mais seulement sur les bases à paramètres nommés',
				'Le driver rejette tout paramètre qui ressemble à une colonne',
				'`ORDER BY` est évalué avant les paramètres, donc il plante'
			],
			answer: 0,
			why: 'Une variable liée remplace une valeur (une chaîne, un nombre). L’OWASP range les noms de colonne et `ASC`/`DESC` parmi les parties qui « can’t use bind variables » : le code doit faire correspondre la saisie à un nom de colonne qu’il connaît déjà.'
		},
		{
			q: 'Comment Django a-t-il corrigé la CVE-2020-7471 dans `StringAgg` ?',
			options: [
				'En doublant chaque `\'` du séparateur avant de formater le gabarit',
				'En n’acceptant que des séparateurs d’un seul signe de ponctuation',
				'En passant le séparateur en `Value()`, compilé en `%s`',
				'En supprimant l’argument `delimiter` au profit d’une virgule fixe'
			],
			answer: 2,
			why: 'Le commit retire `\'%(delimiter)s\'` du gabarit et passe `Value(str(delimiter))` comme expression en plus. `Value.as_sql` renvoie `\'%s\', [val]`, donc le séparateur arrive au driver comme paramètre. Doubler les apostrophes à la main, c’est l’échappement que l’OWASP classe « STRONGLY DISCOURAGED ».'
		}
	],
	recall: {
		q: 'Dans la CVE-2020-7471 de Django, quel argument arrivait dans le texte SQL, et par quoi a-t-il été remplacé ?',
		a: 'Le `delimiter` de `StringAgg`, collé entre apostrophes par le gabarit. Django 3.0.3 l’envoie en `Value(str(delimiter))`, compilé en un marqueur `%s` plus un paramètre.'
	},
	sources: [
		{ title: 'Django, versions de sécurité du 3 février 2020 (CVE-2020-7471)', url: 'https://www.djangoproject.com/weblog/2020/feb/03/security-releases/' },
		{ title: 'Commit de correction Django 505826b, StringAgg(delimiter) échappé', url: FIX },
		{ title: 'Doc Django, Performing raw SQL queries', url: 'https://docs.djangoproject.com/en/5.2/topics/db/sql/' },
		{ title: 'Doc Django, Security in Django : SQL injection protection', url: 'https://docs.djangoproject.com/en/5.2/topics/security/#sql-injection-protection' },
		{ title: 'Doc Django, Archive of security issues', url: 'https://docs.djangoproject.com/en/dev/releases/security/' },
		{ title: 'OWASP SQL Injection Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html' }
	]
};
