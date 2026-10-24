const EQB = 'https://github.com/miniflux/v2/blob/c317f84bc3779bc5d936b75408b631589983c81a/internal/storage/entry_query_builder.go';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'select',
	part: 'Les données et les questions',
	title: 'Interroger avec SELECT',
	minutes: 10,
	hook: [
		'Tu veux les longs articles d’un lecteur de flux. Tu écris `SELECT title, reading_time * 60 AS seconds FROM entries WHERE seconds > 600`. PostgreSQL répond : `column "seconds" does not exist`, alors que l’alias figure quelques mots plus tôt dans la même requête.',
		'PostgreSQL n’applique pas les clauses dans l’ordre où tu les tapes. Tu écris SELECT en premier, mais la base le calcule presque à la fin, après avoir déjà filtré les lignes avec WHERE. Au moment où WHERE tourne, `seconds` n’existe pas encore.',
		'L’ordre réel est FROM, WHERE, puis SELECT, puis ORDER BY, puis LIMIT. Il explique trois surprises : **pourquoi un alias marche dans ORDER BY mais pas dans WHERE, pourquoi la page 2 montre une ligne déjà vue en page 1, et pourquoi un total peut ignorer LIMIT**.'
	],
	terms: [
		{ term: 'Liste SELECT', def: 'Les expressions après SELECT : les colonnes et les valeurs calculées de chaque ligne de sortie. `AS` donne un nom à l’une d’elles, un alias.' },
		{ term: 'ORDER BY', def: 'La clause qui trie le résultat. Sans elle, PostgreSQL rend les lignes « in whatever order the system finds fastest to produce » (dans l’ordre qui lui coûte le moins).' },
		{ term: 'Ordre logique', def: 'L’ordre dans lequel les clauses agissent, que la doc de SELECT décrit étape par étape. Il décide de ce que chaque clause peut voir.' },
		{ term: 'Pagination par clé', def: 'Demander « les lignes suivantes après la dernière que j’ai vue » avec un WHERE sur la clé de tri, au lieu de sauter des lignes avec OFFSET.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['from["FROM entries, JOIN feeds, users"]'],
				highlight: ['from'],
				note: 'La base part des tables de FROM, jointes ensemble. Chaque colonne de chaque table jointe est disponible ici, mais aucun alias de la liste SELECT n’existe encore. Les jointures ont leur propre chapitre demain (jour 4).'
			},
			{
				add: ['from --> where["WHERE e.user_id = $1 AND e.status = $2"]'],
				highlight: ['where'],
				note: 'WHERE écarte des lignes. La doc : « all rows that do not satisfy the condition are eliminated from the output ». WHERE ne voit que les colonnes des tables, donc `WHERE seconds > 600` échoue. Écris plutôt l’expression `reading_time * 60 > 600`.'
			},
			{
				add: ['where --> list["Liste SELECT : e.title, f.title AS feed_title, count(*) OVER()"]'],
				highlight: ['list'],
				note: 'La base calcule la liste SELECT pour chaque ligne qui a passé WHERE. Les alias comme `feed_title` existent à partir de cette étape. Une fonction de fenêtrage comme `count(*) OVER()` tourne aussi ici, sur toutes les lignes restantes.'
			},
			{
				add: ['list --> order["ORDER BY published_at DESC, id DESC"]'],
				highlight: ['order'],
				note: 'ORDER BY passe après la liste SELECT, donc `ORDER BY seconds` marche. La doc ajoute un piège : un nom de colonne de sortie « has to stand alone » (doit être seul), donc `ORDER BY seconds + 1` échoue de nouveau.'
			},
			{
				add: ['order --> limit["LIMIT 100 OFFSET 200"]', 'limit --> out[("20 lignes vers l’app")]'],
				highlight: ['limit'],
				note: 'LIMIT passe en dernier, donc il garde les premières lignes de l’ordre que tu as demandé. Sans ordre unique, la doc prévient que tu « will get an unpredictable subset of the query\'s rows » (un sous-ensemble imprévisible).'
			}
		]
	},
	example: {
		title: 'internal/storage/entry_query_builder.go : Miniflux construit un seul SELECT à partir de petits morceaux',
		repo: 'miniflux/v2',
		url: `${EQB}#L294-L551`,
		lang: 'go',
		code: `// fetchEntries is the shared implementation for GetEntries and GetEntriesWithCount.
// When withCount is true, count(*) OVER() is included in the SELECT and the total
// count of matching rows is returned; otherwise the returned count is 0.
func (e *EntryQueryBuilder) fetchEntries(withCount bool) (model.Entries, int, error) {
	countColumn := ""
	if withCount {
		countColumn = "count(*) OVER(),"
	}

	query := \`
		SELECT
			\` + countColumn + \`
			e.id,
			e.user_id,
…
			entries e
		INNER JOIN
			feeds f ON f.id=e.feed_id
		INNER JOIN
			categories c ON c.id=f.category_id
		LEFT JOIN
			feed_icons fi ON fi.feed_id=f.id
		LEFT JOIN
			icons i ON i.id=fi.icon_id
		INNER JOIN
			users u ON u.id=e.user_id
		WHERE \` + e.buildCondition() + " " + e.buildSorting()

	rows, err := e.store.db.Query(query, e.args...)
…
func (e *EntryQueryBuilder) buildCondition() string {
	return strings.Join(e.conditions, " AND ")
}

func (e *EntryQueryBuilder) buildSorting() string {
	var parts string

	if len(e.sortExpressions) > 0 {
		parts += " ORDER BY " + strings.Join(e.sortExpressions, ", ")
	}

	if e.limit > 0 {
		parts += " LIMIT " + strconv.Itoa(e.limit)
	}

	if e.offset > 0 {
		parts += " OFFSET " + strconv.Itoa(e.offset)
	}

	return parts
…
// NewEntryQueryBuilder returns a new EntryQueryBuilder.
func (s *Storage) NewEntryQueryBuilder(userID int64) *EntryQueryBuilder {
	return &EntryQueryBuilder{
		store:      s,
		args:       []any{userID},
		conditions: []string{"e.user_id = $1"},
	}
}`,
		notes: [
			'Chaque méthode `With...` ajoute une condition à une liste. Les lignes 31 à 33 relient la liste avec `" AND "`, et la ligne 27 la place après WHERE. La ligne 57 ouvre la liste avec `e.user_id = $1`, donc chaque requête porte sur les entrées d’un seul utilisateur.',
			'Des conditions comme `BeforeEntryID` ajoutent `$2`, `$3` et passent la valeur à part. Une colonne de tri ne peut pas être un paramètre : la doc de PREPARE définit les paramètres comme des « values that are substituted into the statement » (des valeurs substituées dans la requête). Alors [`WithSorting`](' + EQB + '#L191-L200) met le nom de colonne entre guillemets et n’accepte que ASC ou DESC.',
			'La ligne 7 met `count(*) OVER()` dans la liste SELECT, calculée avant l’ORDER BY et le LIMIT des lignes 38 à 44. Chaque ligne rendue porte le nombre de lignes qui ont passé WHERE, donc une seule requête donne une page et le total pour la pagination.',
			'La ligne 43 ajoute le LIMIT. [`WithLimit`](' + EQB + '#L202-L206) ramène une limite absente ou énorme à `model.MaxEntryLimit` « so callers cannot request an unbounded result set » (pour qu’aucun appelant ne demande un résultat sans borne). OFFSET est géré aussi, mais la doc prévient : « a large OFFSET might be inefficient », car les lignes sautées sont quand même calculées.'
		]
	},
	tradeoff: {
		gain: [
			'Un SELECT remplace une boucle sur les lignes : tu dis ce que tu veux, et la base trouve la façon la plus rapide de le produire.',
			'Connaître l’ordre logique explique la plupart des erreurs « column does not exist » avant même de les chercher.',
			'Un ORDER BY avec un départage unique rend la pagination stable : la même requête rend les mêmes lignes.',
			'Une fonction de fenêtrage comme `count(*) OVER()` donne la page et le total en un seul aller-retour.'
		],
		cost: [
			'Tu écris SELECT en premier, mais il passe après WHERE, donc `WHERE seconds > 600` échoue avec `column "seconds" does not exist`.',
			'Tu répètes des expressions : WHERE a besoin de `reading_time * 60` car il ne voit pas l’alias. Une sous-requête ou une CTE peut le nommer une fois, au prix d’un niveau de plus.',
			'OFFSET ralentit à mesure que tu avances, car « the rows skipped by an OFFSET clause still have to be computed inside the server » (les lignes sautées sont quand même calculées).',
			'`count(*) OVER()` compte quand même chaque ligne qui correspond, même si tu n’en affiches que 20.'
		]
	},
	task: {
		prompt: 'Table à la Miniflux : `entries(id bigint primary key, user_id bigint, title text, status text, published_at timestamptz, reading_time int)`. Dans `psql`, écris : (1) les 20 entrées non lues les plus récentes de l’utilisateur 7, stables d’une page à l’autre ; (2) la page suivante après la dernière ligne reçue, sans OFFSET ; (3) une correction de `SELECT title, reading_time * 60 AS seconds FROM entries WHERE seconds > 600 ORDER BY seconds DESC`.',
		hint: 'Plusieurs entrées peuvent partager un même `published_at`. Qu’est-ce qui rend l’ordre unique ? Et pour la page 2, quelles valeurs de la dernière ligne as-tu encore ?',
		answer: [
			'(1) `SELECT id, title, published_at FROM entries WHERE user_id = 7 AND status = \'unread\' ORDER BY published_at DESC, id DESC LIMIT 20;` L’`id` départage les égalités, donc aucune ligne ne peut changer de page.',
			'(2) Garde le `published_at` et l’`id` de la dernière ligne, puis ajoute `AND (published_at, id) < ($1, $2)` avec le même ORDER BY et le même LIMIT. Dans cette pagination par clé, la comparaison de lignes suit l’ordre de tri, et elle ne lit pas les lignes qu’elle saute.',
			'(3) Répète l’expression dans WHERE et garde l’alias dans ORDER BY : `... WHERE reading_time * 60 > 600 ORDER BY seconds DESC`. WHERE tourne avant que l’alias existe, ORDER BY après.',
			'Vérifie : lance (3) avec l’alias dans WHERE et lis l’erreur, `column "seconds" does not exist`. Puis essaie `ORDER BY seconds + 0` et constate qu’un alias doit être seul.'
		],
		steps: [
			{
				title: 'Trie la première page',
				questions: [
					{ q: 'Quel WHERE donne les entrées non lues de l’utilisateur 7 ?', options: ['`WHERE user_id = 7 OR status = \'unread\'`', '`WHERE user_id = 7 AND status = \'unread\'`', '`WHERE id = 7 AND status = \'unread\'`', '`WHERE user_id = 7 LIMIT \'unread\'`'], answer: 1, why: 'Les deux conditions doivent tenir, elles se joignent donc par AND, comme Miniflux joint sa liste de conditions avec `" AND "`.' },
					{ q: 'Quel ORDER BY rend les 20 plus récentes stables d’une page à l’autre ?', options: ['`ORDER BY published_at DESC`', '`ORDER BY id DESC, published_at DESC`', '`ORDER BY published_at ASC, id ASC`', '`ORDER BY published_at DESC, id DESC`'], answer: 3, why: 'Les plus récentes d’abord, et l’`id` unique départage les égalités, donc chaque ligne a une place fixe.' },
					{ q: 'Pourquoi `ORDER BY published_at DESC` seul ne suffit-il pas ?', options: ['Plusieurs entrées partagent un horodatage, et les égalités reviennent dans n’importe quel ordre', 'PostgreSQL ne sait pas trier seul une colonne `timestamptz`', 'DESC est ignoré si aucune seconde colonne ne le suit', 'Il trie par date d’insertion, pas par `published_at`'], answer: 0, why: 'Des lignes à clé de tri égale n’ont pas d’ordre fixe, et il peut changer d’une exécution à l’autre. C’est comme ça que la page 2 montre une ligne de la page 1.' },
					{ q: 'Quel ordre obtiens-tu sans aucun ORDER BY ?', options: ['L’ordre de la clé primaire', 'L’ordre d’insertion des lignes', 'L’ordre qui coûte le moins au système', 'L’ordre de la première colonne de la liste SELECT'], answer: 2, why: 'La doc ne promet rien sans ORDER BY. LIMIT garde alors « an unpredictable subset of the query’s rows » (un sous-ensemble imprévisible).' }
				]
			},
			{
				title: 'Va chercher la page suivante',
				questions: [
					{ q: 'Quelles valeurs de la dernière ligne gardes-tu pour la page 2 ?', options: ['Son `published_at` et son `id`', 'Sa position, 20', 'Son `title` et son `status`', 'Seulement son `id`'], answer: 0, why: 'Ce sont les deux clés de tri. La page suivante commence juste après cette paire.' },
					{ q: 'Quelle condition ajoutes-tu pour la page suivante ?', options: ['`AND published_at < $1`', '`AND (published_at, id) > ($1, $2)`', '`AND id < $2`', '`AND (published_at, id) < ($1, $2)`'], answer: 3, why: 'La comparaison de lignes suit l’ordre de tri `published_at DESC, id DESC`, donc elle reprend pile là où la page précédente s’est arrêtée.' },
					{ q: 'Pourquoi pas simplement `AND published_at < $1` ?', options: ['Un horodatage ne peut pas passer en paramètre', 'C’est plus lent que la comparaison de lignes dans tous les cas', 'Ça saute les entrées qui partagent l’horodatage de la dernière ligne', 'Ça rend des lignes d’autres utilisateurs'], answer: 2, why: 'Les entrées au même `published_at` mais à l’`id` plus petit n’apparaîtraient jamais. La partie `id` les garde.' },
					{ q: 'Pourquoi éviter `OFFSET 20` pour la page 2 ?', options: ['OFFSET ne marche qu’avec une clé primaire', 'Les lignes sautées doivent quand même être calculées dans le serveur', 'OFFSET tourne avant WHERE, donc il saute les mauvaises lignes', 'PostgreSQL plafonne OFFSET à 100'], answer: 1, why: 'La doc : « a large OFFSET might be inefficient ». La pagination par clé ne lit pas les lignes qu’elle saute.' }
				]
			},
			{
				title: 'Lis l’erreur',
				questions: [
					{ q: '`... WHERE seconds > 600` échoue avec `column "seconds" does not exist`. Pourquoi ?', options: ['`seconds` est un mot réservé', 'WHERE tourne avant que la liste SELECT crée l’alias', 'Les alias ne marchent qu’après GROUP BY', 'Un alias doit être entre guillemets doubles'], answer: 1, why: 'Dans l’ordre logique, WHERE filtre d’abord les lignes, puis la liste SELECT calcule `seconds`.' },
					{ q: 'Dans quel ordre les clauses agissent-elles ?', options: ['SELECT, FROM, WHERE, ORDER BY, LIMIT', 'FROM, SELECT, WHERE, LIMIT, ORDER BY', 'FROM, WHERE, SELECT, ORDER BY, LIMIT', 'FROM, WHERE, ORDER BY, LIMIT, SELECT'], answer: 2, why: 'La doc de SELECT le décrit étape par étape. Tu écris SELECT en premier, mais il tourne en troisième.' },
					{ q: '`ORDER BY seconds DESC` peut-il utiliser l’alias ?', options: ['Oui : ORDER BY tourne après la liste SELECT', 'Non : aucune clause ne voit un alias', 'Seulement si `seconds` est aussi une colonne de la table', 'Seulement avec un GROUP BY'], answer: 0, why: 'La doc : un nom de colonne de sortie s’utilise « in ORDER BY and GROUP BY clauses, but not in the WHERE or HAVING clauses ».' },
					{ q: 'Que peut voir WHERE ?', options: ['Chaque alias de la liste SELECT', 'Seulement la clé primaire', 'Le résultat des fonctions de fenêtrage comme `count(*) OVER()`', 'Les colonnes des tables de FROM'], answer: 3, why: 'WHERE travaille sur les lignes produites par FROM. Les alias et les fonctions de fenêtrage viennent plus tard.' }
				]
			},
			{
				title: 'Écris la correction',
				questions: [
					{ q: 'Quelle version de (3) marche ?', options: ['`WHERE reading_time * 60 > 600 ORDER BY seconds DESC`', '`WHERE seconds > 600 ORDER BY reading_time * 60 DESC`', '`WHERE "seconds" > 600 ORDER BY seconds DESC`', '`HAVING seconds > 600 ORDER BY seconds DESC`'], answer: 0, why: 'Répète l’expression là où l’alias n’existe pas encore, et garde l’alias là où il existe.' },
					{ q: 'Tu essaies `ORDER BY seconds + 0 DESC`. Que se passe-t-il ?', options: ['Ça marche comme `ORDER BY seconds DESC`', 'Ça échoue : un alias dans ORDER BY doit être seul', 'Ça trie par le texte de la colonne', 'Ça trie dans un ordre aléatoire'], answer: 1, why: 'La doc : un nom de colonne de sortie « has to stand alone » (doit être seul). Dans une expression, PostgreSQL cherche de nouveau une colonne de table.' },
					{ q: 'Tu veux écrire `reading_time * 60` une seule fois. Qu’utilises-tu ?', options: ['Un second alias dans WHERE', 'Une clause OFFSET', 'Une sous-requête ou un CTE qui le nomme', 'Une fonction de fenêtrage'], answer: 2, why: 'La requête intérieure crée `seconds`, donc le WHERE extérieur le voit. Le prix, c’est un niveau de plus.' },
					{ q: 'Tu ajoutes `count(*) OVER()` et `LIMIT 20` à la correction. Que contient le compte ?', options: ['20, la taille de la page', 'Les lignes de toute la table', 'Le numéro de ligne, de 1 à 20', 'Chaque ligne qui a passé WHERE'], answer: 3, why: 'La fonction de fenêtrage tourne avec la liste SELECT, avant LIMIT. Une seule requête donne la page et le total.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Pourquoi `SELECT price * qty AS total FROM lines WHERE total > 100` échoue-t-il dans PostgreSQL ?',
			options: [
				'WHERE s’applique aux lignes d’entrée avant que la liste SELECT calcule `total`',
				'Un alias n’est utilisable que si la requête contient une clause GROUP BY',
				'Les alias ne sont visibles que par le client, jamais dans la requête SQL',
				'`total` est un mot réservé, il faut donc des guillemets doubles pour l’utiliser'
			],
			answer: 0,
			why: 'Dans l’ordre logique, WHERE retire d’abord des lignes, puis la liste SELECT est calculée. La doc dit qu’un nom de colonne de sortie s’utilise « in ORDER BY and GROUP BY clauses, but not in the WHERE or HAVING clauses ».'
		},
		{
			q: 'Miniflux lance sa requête d’entrées avec `count(*) OVER()` et `LIMIT 100`. 730 entrées passent la clause WHERE. Que contient la colonne de comptage dans chaque ligne rendue ?',
			options: [
				'100, car LIMIT s’applique avant le calcul de la liste SELECT',
				'730, car la fonction de fenêtrage tourne avant ORDER BY et LIMIT',
				'De 1 à 100, car `count(*) OVER()` numérote les lignes dans l’ordre',
				'Le nombre de lignes de toute la table entries, tous utilisateurs confondus'
			],
			answer: 1,
			why: 'La liste SELECT, fonctions de fenêtrage comprises, est calculée pour chaque ligne qui a passé WHERE. LIMIT vient en dernier et ne fait que retirer des lignes de sortie, donc une seule requête peut rendre une page et le total.'
		},
		{
			q: 'La page 1 est `ORDER BY published_at DESC LIMIT 20`, la page 2 ajoute `OFFSET 20`. Beaucoup d’entrées partagent un horodatage. Un utilisateur voit une entrée sur les deux pages. Qu’est-ce qui corrige ça ?',
			options: [
				'Mettre les deux pages dans une transaction, pour qu’elles voient les mêmes données',
				'Ajouter un index sur `published_at`, pour que le tri se fasse toujours pareil',
				'Ajouter `id DESC` à l’ORDER BY, pour que chaque ligne ait une place fixe',
				'Passer à `SELECT DISTINCT`, pour qu’une ligne ne puisse pas apparaître deux fois'
			],
			answer: 2,
			why: 'Des lignes à clé de tri égale peuvent revenir dans n’importe quel ordre, et cet ordre peut changer d’une exécution à l’autre. La doc : utilise « an ORDER BY clause that constrains the result rows into a unique order ». Un départage unique comme `id` fait ça.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir l’ordre logique de SELECT à l’œuvre : un alias que WHERE ne voit pas, des égalités qui demandent un départage, et une page 2 sans OFFSET.',
		steps: [
			'Lance un PostgreSQL jetable : `docker run -d --name pg-select -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis ouvre un shell avec `docker exec -it pg-select psql -U postgres`.',
			'Crée la table et 100 entrées, dix par heure pour que les horodatages soient à égalité : `CREATE TABLE entries (id bigint PRIMARY KEY, user_id bigint, title text, status text, published_at timestamptz, reading_time int);` puis `INSERT INTO entries SELECT g, 7, \'entry \' || g, \'unread\', timestamptz \'2024-01-01\' + (g / 10) * interval \'1 hour\', g % 30 FROM generate_series(1, 100) g;`',
			'Lance la requête cassée : `SELECT title, reading_time * 60 AS seconds FROM entries WHERE seconds > 600 ORDER BY seconds DESC;`. Corrige-la, puis essaie `ORDER BY seconds + 0 DESC`.',
			'Récupère la page 1 avec cinq lignes pour qu’elle tienne à l’écran : `SELECT id, published_at FROM entries WHERE user_id = 7 AND status = \'unread\' ORDER BY published_at DESC, id DESC LIMIT 5;`. Note le `published_at` et l’`id` de la dernière ligne.',
			'Récupère la page 2 avec une comparaison de lignes sur ces deux valeurs, puis ajoute `count(*) OVER () AS total` à la liste SELECT de la requête corrigée de l’étape 3, avec `LIMIT 3`. Quitte avec `\\q` et nettoie avec `docker rm -f pg-select`.'
		],
		done: [
			'L’étape 3 affiche d’abord `column "seconds" does not exist`, et la version `seconds + 0` aussi.',
			'La page 1 finit sur l’`id` 96 à `2024-01-01 09:00:00+00`, et la page 2 commence à l’`id` 95 au même horodatage : aucune ligne sautée ni répétée.',
			'La colonne `total` affiche `57` sur les trois lignes, alors que `LIMIT 3` en a rendu trois.'
		],
		solution: [
			'Correction de l’étape 3 : `SELECT title, reading_time * 60 AS seconds FROM entries WHERE reading_time * 60 > 600 ORDER BY seconds DESC;`',
			'Page 2 : `SELECT id, published_at FROM entries WHERE user_id = 7 AND status = \'unread\' AND (published_at, id) < (\'2024-01-01 09:00:00+00\', 96) ORDER BY published_at DESC, id DESC LIMIT 5;`',
			'Total : `SELECT count(*) OVER () AS total, title FROM entries WHERE reading_time * 60 > 600 ORDER BY id LIMIT 3;`. La fonction de fenêtrage tourne avant LIMIT, donc elle compte chaque ligne qui a passé WHERE.'
		]
	},
	recall: {
		q: 'Dans quel ordre PostgreSQL applique-t-il FROM, WHERE, SELECT, ORDER BY et LIMIT, et pourquoi `WHERE seconds > 600` échoue-t-il ?',
		a: 'FROM, WHERE, la liste SELECT, ORDER BY, puis LIMIT. WHERE passe avant que la liste SELECT crée l’alias `seconds`, donc il doit répéter `reading_time * 60`. ORDER BY passe après et peut utiliser l’alias.'
	},
	sources: [
		{ title: 'Miniflux, entry_query_builder.go (BeforeEntryID)', url: `${EQB}#L100-L106` },
		{ title: 'Doc PostgreSQL, SELECT', url: 'https://www.postgresql.org/docs/current/sql-select.html' },
		{ title: 'Doc PostgreSQL, Sorting Rows (ORDER BY)', url: 'https://www.postgresql.org/docs/current/queries-order.html' },
		{ title: 'Doc PostgreSQL, LIMIT and OFFSET', url: 'https://www.postgresql.org/docs/current/queries-limit.html' },
		{ title: 'Doc PostgreSQL, Window Function Processing', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-WINDOW' },
		{ title: 'Doc PostgreSQL, PREPARE', url: 'https://www.postgresql.org/docs/current/sql-prepare.html' }
	]
};
