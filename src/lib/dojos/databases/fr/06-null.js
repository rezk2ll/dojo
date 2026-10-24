const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const QUERY = `${DJANGO}/django/db/models/sql/query.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'null',
	part: 'Les données et les questions',
	title: 'NULL en SQL : comparaisons, NOT IN et clés uniques',
	minutes: 10,
	hook: [
		'Ton tableau de bord liste les projets non archivés : `WHERE status <> \'archived\'`. Un client te dit qu’il manque trois de ses projets. Ils ne sont pas archivés. Ils n’ont jamais eu de statut : la colonne vaut NULL.',
		'En SQL, **NULL veut dire « inconnu »**. Un statut inconnu est-il différent de `\'archived\'` ? Personne ne le sait, donc la réponse vaut NULL elle aussi. Et `WHERE` ne garde une ligne que si la réponse est vraie.',
		'Ton ORM gère NULL à certains endroits, et pas toujours comme le SQL que tu écris à la main. Deux requêtes perdent des lignes de cette façon : `= NULL` et `NOT IN`.'
	],
	terms: [
		{ term: 'NULL', def: 'Un marqueur pour une valeur absente ou inconnue. NULL n’est ni 0, ni la chaîne vide, ni false.' },
		{ term: 'Logique à trois valeurs', def: 'Une condition SQL renvoie vrai, faux ou NULL (inconnu). `NULL AND false` vaut faux, `NULL OR true` vaut vrai, presque tout le reste avec un NULL vaut NULL.' },
		{ term: 'IS DISTINCT FROM', def: 'Une comparaison qui traite NULL comme une valeur ordinaire. Elle renvoie toujours vrai ou faux, jamais NULL.' },
		{ term: 'NULLS NOT DISTINCT', def: 'Une clause d’index ou de contrainte unique (PostgreSQL 15 et plus) qui fait compter deux NULL comme égaux : un seul est alors permis.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['row["Ligne : status vaut NULL"] --> cmp["status != \'archived\'"]'],
				highlight: ['row', 'cmp'],
				note: 'Une comparaison avec NULL renvoie NULL. La doc de PostgreSQL : « 7 = NULL yields null, as does 7 <> NULL » (les deux donnent null). Pareil pour `<`, `>` et `!=`. `x = NULL` vaut donc NULL même quand `x` est NULL, et seul `x IS NULL` teste une valeur absente.'
			},
			{
				add: ['cmp -->|"inconnu"| where["WHERE ne garde que le vrai"]', 'where --> drop["Ligne écartée"]'],
				highlight: ['where', 'drop'],
				note: 'WHERE garde une ligne seulement si la condition est vraie. La doc : « If the result of the condition is true, the row is kept in the output table, otherwise (i.e., if the result is false or null) it is discarded. » (si la condition est fausse ou null, la ligne est écartée). Le projet sans statut disparaît donc à la fois de `status = \'archived\'` et de `status != \'archived\'`.'
			},
			{
				add: ['notin["id NOT IN (1, NULL)"] -->|"jamais vrai"| where'],
				highlight: ['notin'],
				note: '`id NOT IN (1, NULL)` veut dire `id <> 1 AND id <> NULL`. La deuxième moitié vaut toujours NULL, donc la condition entière n’est jamais vraie. Avec un seul NULL dans la sous-requête, **NOT IN ne renvoie plus aucune ligne**. `NOT EXISTS` renvoie toujours les lignes sans correspondance quand la sous-requête contient un NULL.'
			},
			{
				add: ['fix["IS NULL, IS DISTINCT FROM, COALESCE"] -->|"toujours vrai ou faux"| keep["Ligne gardée"]'],
				highlight: ['fix', 'keep'],
				note: '`status IS DISTINCT FROM \'archived\'` est vrai pour la ligne à NULL. `COALESCE(status, \'none\')` renvoie son premier argument non NULL : il remplace le NULL par `\'none\'` avant la comparaison. `status IS NULL` teste directement la valeur absente. Aucun des trois ne renvoie jamais NULL.'
			},
			{
				add: ['uniq[("unique (user_id, team_id)")] -->|"(7, NULL) deux fois : les deux passent"| dup["Lignes en double"]', 'uniq -.->|"NULLS NOT DISTINCT"| one["Deuxième insert refusé"]'],
				highlight: ['uniq', 'dup', 'one'],
				note: 'Un index unique accepte plusieurs NULL. Par défaut, « null values in a unique column are not considered equal, allowing multiple nulls in the column » (les NULL ne sont pas considérés comme égaux, la colonne peut en contenir plusieurs). `(7, NULL)` peut donc être stocké deux fois. Depuis PostgreSQL 15, `NULLS NOT DISTINCT` fait échouer le deuxième insert.'
			}
		]
	},
	example: {
		title: 'django/db/models/sql/query.py : comment l’ORM fait se comporter NULL comme le None de Python',
		repo: 'django/django',
		url: `${QUERY}#L1440-L1669`,
		lang: 'python',
		code: `        lookup = lookup_class(lhs, rhs)
        # Interpret '__exact=None' as the sql 'is NULL'; otherwise, reject all
        # uses of None as a query value unless the lookup supports it.
        if lookup.rhs is None and not lookup.can_use_none_as_rhs:
            if lookup_name not in ("exact", "iexact"):
                raise ValueError("Cannot use None as a query value")
            return lhs.get_lookup("isnull")(lhs, True)
…
        require_outer = False
        if lookup_type == "isnull":
            # Both \`NOT (field IS NOT NULL)\` and \`field IS NULL\` require an
            # OUTER JOIN to effectively include related \`NULL\` values.
            # Otherwise an INNER JOIN can be used as it excludes them.
            require_outer = (
                condition.rhs is False if current_negated else condition.rhs is True
            )
        elif current_negated and condition.rhs is not None:
            require_outer = True
            # The condition added below will be SQL like this:
            # \`NOT (col IS NOT NULL)\`, where the first NOT is added in
            # upper layers of code. The reason for addition is that if col
            # \`IS NULL\`, then \`col != someval\` will result in SQL "unknown"
            # which isn't the same as in Python. The Python None handling
            # is wanted, and it can be achieved by
            # \`(col != someval OR col IS NULL)\` which is equivalent to
            # \`NOT (col = someval AND col IS NOT NULL)\`. The second form is
            # required here as the condition is negated per \`current_negated\`.
            if (
                self.is_nullable(targets[0])
                or self.alias_map[join_list[-1]].join_type == LOUTER
            ):
                lookup_class = targets[0].get_lookup("isnull")
                col = self._get_col(targets[0], join_info.targets[0], alias)
                # Use OR + IS NULL when RHS \`in\` values include None.
                if (
                    lookup_type == "in"
                    # Check containers (not strings or bytes).
                    and isinstance(condition.rhs, Iterable)
                    and not isinstance(condition.rhs, (str, bytes))
                    and any(v is None for v in condition.rhs)
                ):
                    clause.add(lookup_class(col, True), OR)
                else:
                    clause.add(lookup_class(col, False), AND)
            # If someval is a nullable column, someval IS NOT NULL is
            # added.
            if isinstance(value, Col) and self.is_nullable(value.target):
                lookup_class = value.target.get_lookup("isnull")
                clause.add(lookup_class(value, False), AND)
        return clause, used_joins if not require_outer else ()`,
		notes: [
			'Lignes 1 à 7 : dans [`build_lookup`](' + QUERY + '#L1440-L1446), `filter(status=None)` est réécrit en lookup `isnull`, donc Django n’envoie jamais `status = NULL`. Tout autre lookup avec `None`, comme `status__gt=None`, lève `ValueError("Cannot use None as a query value")`.',
			'Lignes 17 à 44 : pour une colonne nullable, [`build_filter`](' + QUERY + '#L1636-L1663) ajoute `col IS NOT NULL` à l’intérieur de la négation. Django envoie `exclude(status="archived")` sous la forme `NOT (status = \'archived\' AND status IS NOT NULL)`, qui est vrai pour un statut NULL. Un `WHERE status <> \'archived\'` écrit à la main écarte ces lignes.',
			'Les lignes 34 à 42 traitent un None dans `in`. Le [lookup `In`](' + DJANGO + '/django/db/models/lookups.py#L530-L539) dit pourquoi : « Remove None from the list as NULL is never equal to anything. » (NULL n’est jamais égal à rien). S’il ne reste rien, il lève `EmptyResultSet` et aucune requête ne part. Quand la liste d’un `exclude(...__in=[...])` contient un None, `build_filter` ajoute plutôt `OR col IS NULL`, pour que les lignes à NULL soient exclues elles aussi.',
			'`UniqueConstraint(..., nulls_distinct=False)` est traduit en SQL par [`_unique_index_nulls_distinct_sql`](' + DJANGO + '/django/db/backends/base/schema.py#L1847-L1852), qui émet `NULLS NOT DISTINCT`. La doc de Django prévient : « Unique constraints with `nulls_distinct` are ignored for databases besides PostgreSQL. » (ignorées sur les autres bases que PostgreSQL).'
		]
	},
	tradeoff: {
		gain: [
			'`avg(price)` et `count(price)` ignorent un prix NULL. Un 0 ou un `\'\'` stocké passerait pour une vraie donnée et ferait baisser la moyenne.',
			'Une clé étrangère nullable stocke un lien optionnel sans fausse valeur, et une colonne unique nullable accepte plein de lignes qui n’ont pas encore de valeur.',
			'Avec `IS NULL`, `IS DISTINCT FROM`, `COALESCE` et `NULLS NOT DISTINCT`, tu choisis ce que veut dire une valeur absente dans chaque requête et chaque clé.'
		],
		cost: [
			'Chaque condition sur une colonne nullable a un troisième cas, NULL. Si tu l’oublies, des lignes disparaissent d’un rapport sans la moindre erreur.',
			'Un seul NULL dans une sous-requête `NOT IN` vide le résultat. Le bug apparaît le jour où quelqu’un insère ce premier NULL, sans que la requête ait changé.',
			'Le `exclude()` de Django garde les lignes à NULL, et le `<>` que tu écris à la main les écarte.',
			'Les contraintes uniques laissent entrer des doublons quand une colonne est NULL, jusqu’à ce que tu ajoutes `NULLS NOT DISTINCT` ou que tu passes la colonne en `NOT NULL`.'
		]
	},
	task: {
		prompt: 'Dans `psql`, crée `projects(id int, name text, status text)` avec les lignes `(1, \'api\', \'active\')`, `(2, \'web\', \'archived\')`, `(3, \'docs\', NULL)`, et `members(user_id int, project_id int)` avec les lignes `(10, 1)` et `(11, NULL)`. Prédis, puis lance : (a) `SELECT count(*) FROM projects WHERE status <> \'archived\'` ; (b) la même avec `IS DISTINCT FROM` ; (c) `SELECT name FROM projects WHERE id NOT IN (SELECT project_id FROM members)` ; (d) `SELECT count(*), count(status) FROM projects`.',
		hint: 'Pour chaque ligne, écris la condition comme vrai, faux ou NULL. WHERE ne garde que les vraies.',
		answer: [
			'(a) 1. Seulement `api`. Pour `docs`, `NULL <> \'archived\'` vaut NULL, donc la ligne est écartée.',
			'(b) 2. `api` et `docs`. `IS DISTINCT FROM` traite le NULL comme une valeur différente de `\'archived\'`.',
			'(c) Aucune ligne, alors que `web` et `docs` n’ont pas de membres. Le NULL dans `members` rend chaque `NOT IN` NULL. `SELECT name FROM projects p WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.project_id = p.id)` renvoie `web` et `docs`.',
			'(d) 3 et 2. `count(*)` compte les lignes, `count(status)` compte les lignes où status n’est pas NULL.',
			'Bonus : `SELECT name, COALESCE(status, \'none\') FROM projects` affiche `none` pour `docs`, sans toucher aux données stockées.'
		],
		steps: [
			{
				title: 'Prédis le compte avec `<>`',
				questions: [
					{ q: 'Pour la ligne `docs`, que vaut `status <> \'archived\'` ?', options: ['vrai', 'faux', 'NULL', 'Une erreur'], answer: 2, why: 'Une comparaison avec NULL donne NULL. La doc : « 7 = NULL yields null, as does 7 <> NULL ».' },
					{ q: 'Quelles lignes WHERE garde-t-il ?', options: ['Les lignes où la condition est vraie ou NULL', 'Les lignes où la condition est vraie', 'Les lignes où la condition n’est pas fausse', 'Toutes, puis il filtre plus tard'], answer: 1, why: 'La doc : si le résultat « is false or null, it is discarded » (faux ou NULL, la ligne est écartée). Seul vrai survit.' },
					{ q: 'Que renvoie donc (a) ?', options: ['1', '2', '3', '0'], answer: 0, why: 'Seulement `api`. `web` vaut faux, et `docs` vaut NULL, donc les deux sont écartées.' },
					{ q: 'Tu essaies `WHERE status = NULL` pour trouver `docs`. Qu’obtiens-tu ?', options: ['La ligne `docs`', 'Une erreur sur NULL', 'Toutes les lignes', 'Aucune ligne'], answer: 3, why: '`x = NULL` vaut NULL même quand `x` est NULL. Seul `status IS NULL` teste une valeur absente.' }
				]
			},
			{
				title: 'Garde la ligne NULL',
				questions: [
					{ q: 'Que renvoie (b), avec `IS DISTINCT FROM` ?', options: ['1', '2', '3', '0'], answer: 1, why: '`api` et `docs`. Il traite le NULL comme une valeur différente de `\'archived\'`.' },
					{ q: 'Que peut renvoyer `status IS DISTINCT FROM \'archived\'` ?', options: ['Seulement vrai ou faux, jamais NULL', 'Vrai, faux ou NULL', 'Seulement NULL quand `status` est NULL', 'La valeur de `status`'], answer: 0, why: 'C’est tout son intérêt : il compare NULL comme une valeur ordinaire.' },
					{ q: 'Quelle autre condition garde aussi `docs` ?', options: ['`status <> \'archived\' AND status IS NOT NULL`', '`NOT (status = \'archived\')`', '`status != \'archived\'`', '`COALESCE(status, \'none\') <> \'archived\'`'], answer: 3, why: '`COALESCE` remplace le NULL par `\'none\'` avant la comparaison. Les trois autres tombent encore sur un NULL, ou l’écartent exprès.' },
					{ q: 'Quelles lignes renvoie ici le `exclude(status="archived")` de Django ?', options: ['Seulement `api`', 'Seulement `docs`', '`api` et `docs`', 'Aucune'], answer: 2, why: 'Django envoie `NOT (status = \'archived\' AND status IS NOT NULL)`, vrai pour un statut NULL. Il colle à (b), pas à (a).' }
				]
			},
			{
				title: 'Suis le NOT IN',
				questions: [
					{ q: 'La sous-requête renvoie `1` et `NULL`. Que veut dire `id NOT IN (1, NULL)` ?', options: ['`id <> 1 OR id <> NULL`', '`id <> 1 AND id <> NULL`', '`id <> 1`, les NULL sont sautés', '`id IS NOT NULL AND id <> 1`'], answer: 1, why: '`NOT IN` doit différer de chaque valeur de la liste, donc les tests se joignent par AND.' },
					{ q: 'Pour `web` (id 2), que vaut `2 <> 1 AND 2 <> NULL` ?', options: ['vrai', 'faux', 'Une erreur', 'NULL'], answer: 3, why: '`true AND NULL` vaut NULL, donc WHERE écarte la ligne.' },
					{ q: 'Que renvoie donc (c) ?', options: ['Aucune ligne', '`web` et `docs`', 'Seulement `docs`', 'Les trois projets'], answer: 0, why: 'Un seul NULL dans la sous-requête rend chaque `NOT IN` NULL ou faux, jamais vrai.' },
					{ q: 'Quelle requête renvoie `web` et `docs`, comme tu le voulais ?', options: ['`... WHERE id NOT IN (SELECT DISTINCT project_id FROM members)`', '`... WHERE id <> ALL (SELECT project_id FROM members)`', '`... WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.project_id = p.id)`', '`... WHERE id NOT IN (SELECT project_id FROM members ORDER BY 1)`'], answer: 2, why: '`NOT EXISTS` renvoie quand même les lignes sans correspondance quand la sous-requête contient un NULL. Les trois autres gardent le NULL dans la liste.' }
				]
			},
			{
				title: 'Compte les NULL',
				questions: [
					{ q: 'Que renvoie (d), `count(*), count(status)` ?', options: ['3 et 3', '2 et 2', '3 et 2', '3 et NULL'], answer: 2, why: '`count(*)` compte les lignes. `count(status)` compte les lignes où status n’est pas NULL.' },
					{ q: 'Pourquoi NULL sert-il mieux `avg(price)` qu’un 0 stocké ?', options: ['Il garde le prix absent hors du calcul, alors qu’un 0 tirerait la moyenne vers le bas', 'Les moyennes sont plus rapides sur les colonnes NULL', 'Un 0 fait renvoyer NULL à `avg`', 'Aucune différence'], answer: 0, why: 'Les agrégats sautent les NULL. Un 0 a l’air d’une vraie donnée.' },
					{ q: 'Que change `SELECT name, COALESCE(status, \'none\') FROM projects` dans la table ?', options: ['Il écrit `none` dans la ligne `docs`', 'Il ajoute une valeur par défaut à la colonne', 'Il rend `status` NOT NULL', 'Rien : il change seulement ce que la requête affiche'], answer: 3, why: '`COALESCE` renvoie son premier argument non NULL. Il agit sur la sortie, pas sur les données stockées.' },
					{ q: '`UNIQUE (user_id, team_id)` par défaut, et tu insères `(7, NULL)` deux fois. Que se passe-t-il ?', options: ['Les deux inserts passent', 'Le deuxième insert échoue', 'Le premier insert échoue', 'Le deuxième remplace le premier'], answer: 0, why: 'Par défaut, « null values in a unique column are not considered equal ». `NULLS NOT DISTINCT` (PostgreSQL 15 et plus) refuse le deuxième.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`SELECT * FROM projects WHERE id NOT IN (SELECT project_id FROM members)` ne renvoie aucune ligne, alors que certains projets n’ont pas de membres. Quelle est la cause la plus probable ?',
			options: [
				'Au moins un `members.project_id` vaut NULL, donc NOT IN n’est jamais vrai',
				'La sous-requête renvoie trop de lignes, donc PostgreSQL la tronque',
				'NOT IN a besoin d’un index sur `project_id` pour renvoyer des lignes',
				'La sous-requête voit un snapshot plus ancien que la requête externe'
			],
			answer: 0,
			why: '`x NOT IN (a, NULL)` vaut `x <> a AND x <> NULL`. La deuxième partie vaut toujours NULL, donc le test entier vaut NULL ou faux, jamais vrai, et WHERE écarte chaque ligne. `NOT EXISTS` donne la réponse que tu voulais.'
		},
		{
			q: 'Une table a `UNIQUE (user_id, team_id)`, créée avec les options par défaut. Tu insères `(7, NULL)` deux fois. Que se passe-t-il ?',
			options: [
				'Le deuxième insert échoue avec une erreur de clé dupliquée',
				'Les deux inserts passent, et la table contient deux lignes identiques',
				'Le premier insert échoue, car une colonne unique exige une valeur',
				'Le deuxième insert remplace la première ligne sans rien dire'
			],
			answer: 1,
			why: 'Par défaut, les NULL d’un index unique ne sont pas égaux entre eux, donc les deux lignes n’entrent pas en conflit. `UNIQUE NULLS NOT DISTINCT (user_id, team_id)` (PostgreSQL 15 et plus) fait échouer le deuxième insert.'
		},
		{
			q: '`status` est nullable. Quelles lignes renvoie le `Project.objects.exclude(status="archived")` de Django ?',
			options: [
				'Seulement les lignes dont le statut est renseigné et n’est pas `archived`',
				'Seulement les lignes dont le statut est NULL',
				'Les lignes dont le statut n’est pas `archived`, NULL compris',
				'Aucune : Django refuse `exclude()` sur une colonne nullable'
			],
			answer: 2,
			why: 'Django ajoute `IS NOT NULL` dans la négation, donc le SQL est `NOT (status = \'archived\' AND status IS NOT NULL)`, qui est vrai pour un statut NULL. Un `status <> \'archived\'` écrit à la main écarterait ces lignes.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir un NULL faire disparaître des lignes avec `<>` et `NOT IN`, les garder avec le bon test, et laisser un NULL passer une contrainte unique.',
		steps: [
			'Lance un PostgreSQL jetable : `docker run -d --name pg-null -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-null psql -U postgres`.',
			'Crée les données de l’exercice : `CREATE TABLE projects (id int, name text, status text); INSERT INTO projects VALUES (1, \'api\', \'active\'), (2, \'web\', \'archived\'), (3, \'docs\', NULL); CREATE TABLE members (user_id int, project_id int); INSERT INTO members VALUES (10, 1), (11, NULL);`',
			'Note tes quatre prédictions, puis lance (a) à (d) de l’exercice, et la version `NOT EXISTS` de (c).',
			'Regarde le NULL lui-même : `SELECT NULL = NULL AS eq, NULL IS NULL AS is_null;`',
			'Essaie la clé unique : `CREATE TABLE team_members (user_id int, team_id int, UNIQUE (user_id, team_id));` puis lance deux fois `INSERT INTO team_members VALUES (7, NULL);`. Ensuite `CREATE TABLE team_members2 (user_id int, team_id int, UNIQUE NULLS NOT DISTINCT (user_id, team_id));` et les deux mêmes inserts dedans. Quitte avec `\\q` et nettoie avec `docker rm -f pg-null`.'
		],
		done: [
			'(a) affiche 1, (b) affiche 2, (c) affiche `(0 rows)`, et la version `NOT EXISTS` affiche `web` et `docs`.',
			'(d) affiche 3 et 2.',
			'`eq` est vide (NULL) et `is_null` vaut `t`.',
			'`team_members` contient deux lignes `(7, NULL)` ; le deuxième insert dans `team_members2` échoue avec `duplicate key value violates unique constraint`.'
		],
		solution: [
			'(a) `SELECT count(*) FROM projects WHERE status <> \'archived\';` et (b) `SELECT count(*) FROM projects WHERE status IS DISTINCT FROM \'archived\';`',
			'(c) `SELECT name FROM projects WHERE id NOT IN (SELECT project_id FROM members);` puis `SELECT name FROM projects p WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.project_id = p.id);`',
			'(d) `SELECT count(*), count(status) FROM projects;`',
			'Les trois premières surprises ont une seule cause : une comparaison avec NULL vaut NULL, et WHERE ne garde que vrai. La dernière est un réglage par défaut : un index unique ne compte pas deux NULL comme égaux, sauf si tu écris `NULLS NOT DISTINCT`.'
		]
	},
	recall: {
		q: 'Un projet a un statut NULL. Pourquoi `WHERE status <> \'archived\'` l’écarte-t-il, et quelle condition le garde ?',
		a: '`NULL <> \'archived\'` vaut NULL, et WHERE ne garde que les lignes où la condition est vraie. `status IS DISTINCT FROM \'archived\'` est vrai pour cette ligne, donc elle reste.'
	},
	sources: [
		{ title: 'PostgreSQL docs, Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html' },
		{ title: 'PostgreSQL docs, Subquery Expressions', url: 'https://www.postgresql.org/docs/current/functions-subquery.html' },
		{ title: 'PostgreSQL docs, Unique Indexes', url: 'https://www.postgresql.org/docs/current/indexes-unique.html' },
		{ title: 'PostgreSQL docs, Conditional Expressions (COALESCE)', url: 'https://www.postgresql.org/docs/current/functions-conditional.html' },
		{ title: 'Django docs, UniqueConstraint.nulls_distinct', url: 'https://docs.djangoproject.com/en/dev/ref/models/constraints/#nulls-distinct' }
	]
};
