const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const QUERY = `${DJANGO}/django/db/models/sql/query.py`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'null',
	part: 'Les données et les questions',
	title: 'NULL n’est pas une valeur',
	minutes: 10,
	hook: [
		'Ton tableau de bord liste les projets non archivés : `WHERE status <> \'archived\'`. Un client te dit qu’il manque trois de ses projets. Ils ne sont pas archivés. **Ils n’ont jamais eu de statut** : la colonne vaut NULL.',
		'En SQL, **NULL veut dire « inconnu »**, pas « vide », pas zéro. Un statut inconnu est-il différent de `\'archived\'` ? Personne ne le sait, donc la réponse est NULL elle aussi. Et `WHERE` ne garde une ligne que si la réponse est vraie.',
		'Ton ORM te cache une partie de tout ça, et pas toujours comme le ferait du SQL écrit à la main. Ce chapitre te donne les règles, les deux pièges classiques (`= NULL` et `NOT IN`) et les outils qui répondent vrai ou faux à chaque fois.'
	],
	terms: [
		{ term: 'NULL', def: 'Un marqueur pour une valeur absente ou inconnue. Ce n’est pas une valeur du type de la colonne : ni 0, ni la chaîne vide, ni false.' },
		{ term: 'Logique à trois valeurs', def: 'Une condition SQL renvoie vrai, faux ou NULL (inconnu). `NULL AND false` vaut faux, `NULL OR true` vaut vrai, presque tout le reste avec un NULL vaut NULL.' },
		{ term: 'IS NULL', def: 'Le seul test correct pour une valeur absente. `x = NULL` vaut toujours NULL, même quand `x` est NULL.' },
		{ term: 'IS DISTINCT FROM', def: 'Une comparaison qui traite NULL comme une valeur ordinaire. Elle renvoie toujours vrai ou faux, jamais NULL.' },
		{ term: 'COALESCE', def: 'Renvoie son premier argument qui n’est pas NULL. `COALESCE(status, \'none\')` transforme un statut absent en une valeur que tu peux afficher ou comparer.' },
		{ term: 'NULLS NOT DISTINCT', def: 'Une clause d’index ou de contrainte unique (PostgreSQL 15 et plus) qui fait compter deux NULL comme égaux : un seul est alors permis.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['row["Ligne : status vaut NULL"] --> cmp["status != \'archived\'"]'],
				highlight: ['row', 'cmp'],
				note: '**Comparer avec NULL donne NULL.** La doc de PostgreSQL le dit sans détour : « 7 = NULL yields null, as does 7 <> NULL » (les deux donnent null). Pareil pour `<`, `>` et `!=`. NULL veut dire inconnu, donc le résultat de la comparaison est inconnu lui aussi.'
			},
			{
				add: ['cmp -->|"inconnu"| where["WHERE ne garde que le vrai"]', 'where --> drop["Ligne écartée"]'],
				highlight: ['where', 'drop'],
				note: '**WHERE veut du vrai, pas du « pas faux ».** La doc : « If the result of the condition is true, the row is kept in the output table, otherwise (i.e., if the result is false or null) it is discarded. » (si la condition est fausse ou null, la ligne est écartée). Le projet sans statut disparaît donc à la fois de `status = \'archived\'` et de `status != \'archived\'`.'
			},
			{
				add: ['notin["id NOT IN (1, NULL)"] -->|"jamais vrai"| where'],
				highlight: ['notin'],
				note: '**Le piège du NOT IN.** `id NOT IN (1, NULL)` veut dire `id <> 1 AND id <> NULL`. La deuxième moitié vaut toujours NULL, donc l’ensemble n’est jamais vrai. Un seul NULL dans la sous-requête et **NOT IN ne renvoie plus aucune ligne**. Utilise `NOT EXISTS`, qui n’a pas ce problème.'
			},
			{
				add: ['fix["IS NULL, IS DISTINCT FROM, COALESCE"] -->|"toujours vrai ou faux"| keep["Ligne gardée"]'],
				highlight: ['fix', 'keep'],
				note: '**Pose une question qui a une réponse.** `status IS DISTINCT FROM \'archived\'` est vrai pour la ligne à NULL. `COALESCE(status, \'none\')` remplace le NULL avant la comparaison. `IS NULL` pose la question directement. Aucun ne renvoie jamais NULL.'
			},
			{
				add: ['uniq[("unique (user_id, team_id)")] -->|"(7, NULL) deux fois : les deux passent"| dup["Lignes en double"]', 'uniq -.->|"NULLS NOT DISTINCT"| one["Deuxième insert refusé"]'],
				highlight: ['uniq', 'dup', 'one'],
				note: '**Les index uniques laissent passer les NULL.** Par défaut, « null values in a unique column are not considered equal, allowing multiple nulls in the column » (les NULL ne sont pas considérés comme égaux, la colonne peut en contenir plusieurs). `(7, NULL)` peut donc être stocké deux fois. Depuis PostgreSQL 15, `NULLS NOT DISTINCT` fait échouer le deuxième insert.'
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
			'**`= None` devient IS NULL.** Dans [`build_lookup`](' + QUERY + '#L1440-L1446), `filter(status=None)` est réécrit en lookup `isnull`, donc Django n’envoie jamais `status = NULL`. Tout autre lookup avec `None`, comme `status__gt=None`, lève `ValueError("Cannot use None as a query value")`.',
			'**`exclude()` garde les lignes à NULL.** Pour une colonne nullable, [`build_filter`](' + QUERY + '#L1636-L1663) ajoute `col IS NOT NULL` à l’intérieur de la négation. `exclude(status="archived")` devient `NOT (status = \'archived\' AND status IS NOT NULL)`, qui est vrai pour un statut NULL. Un `WHERE status <> \'archived\'` écrit à la main écarte ces lignes. **Même intention, autre réponse.**',
			'**Un None dans `in` est jeté.** Le [lookup `In`](' + DJANGO + '/django/db/models/lookups.py#L530-L539) dit pourquoi : « Remove None from the list as NULL is never equal to anything. » (NULL n’est jamais égal à rien). S’il ne reste rien, il lève `EmptyResultSet` et aucune requête ne part. Quand la liste d’un `exclude(...__in=[...])` contient un None, `build_filter` ajoute plutôt `OR col IS NULL`, pour que les lignes à NULL soient exclues elles aussi.',
			'**Unicité et NULL.** `UniqueConstraint(..., nulls_distinct=False)` est traduit en SQL par [`_unique_index_nulls_distinct_sql`](' + DJANGO + '/django/db/backends/base/schema.py#L1847-L1852), qui émet `NULLS NOT DISTINCT`. La doc de Django prévient : « Unique constraints with `nulls_distinct` are ignored for databases besides PostgreSQL. » (ignorées sur les autres bases que PostgreSQL).'
		]
	},
	tradeoff: {
		gain: [
			'NULL est honnête. Un prix à 0 ou un nom à `\'\'` ressemble à une vraie donnée, et `avg(price)` le compterait. Les agrégats comme `avg` et `count(price)` ignorent les NULL.',
			'Un fait optionnel n’a pas besoin de fausse valeur : une clé étrangère nullable est un lien optionnel, et une colonne unique nullable accepte plein de lignes qui n’ont pas encore de valeur.',
			'Les règles sont écrites. `IS NULL`, `IS DISTINCT FROM`, `COALESCE` et `NULLS NOT DISTINCT` te laissent dire exactement ce que doit signifier une valeur absente.'
		],
		cost: [
			'Chaque condition sur une colonne nullable a un troisième cas. Oublie-le et des lignes disparaissent d’un rapport sans la moindre erreur.',
			'Un seul NULL dans une sous-requête `NOT IN` vide le résultat. Le bug apparaît le jour où quelqu’un insère ce premier NULL, pas le jour où tu as écrit la requête.',
			'L’ORM et le SQL brut ne sont pas d’accord. Le `exclude()` de Django garde les lignes à NULL, le `<>` écrit à la main les écarte.',
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
	takeaway: 'NULL veut dire inconnu, et tout ce qu’on compare à de l’inconnu est inconnu. WHERE ne garde que le vrai : teste les valeurs absentes avec IS NULL, IS DISTINCT FROM ou COALESCE, préfère NOT EXISTS à NOT IN, et décide ce que NULL veut dire dans tes clés uniques.',
	sources: [
		{ title: 'PostgreSQL docs, Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html' },
		{ title: 'PostgreSQL docs, Subquery Expressions', url: 'https://www.postgresql.org/docs/current/functions-subquery.html' },
		{ title: 'PostgreSQL docs, Unique Indexes', url: 'https://www.postgresql.org/docs/current/indexes-unique.html' },
		{ title: 'PostgreSQL docs, Conditional Expressions (COALESCE)', url: 'https://www.postgresql.org/docs/current/functions-conditional.html' },
		{ title: 'Django docs, UniqueConstraint.nulls_distinct', url: 'https://docs.djangoproject.com/en/dev/ref/models/constraints/#nulls-distinct' }
	]
};
