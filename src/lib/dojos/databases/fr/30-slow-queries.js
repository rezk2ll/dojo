const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8';
const PGSS = `${PG}/contrib/pg_stat_statements/pg_stat_statements.c`;
const AE = `${PG}/contrib/auto_explain/auto_explain.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'slow-queries',
	part: 'La garder en marche',
	title: 'Trouver les requêtes lentes',
	minutes: 10,
	hook: [
		'Le tableau de bord dit que la base est à 90 % de CPU. Chaque page est un peu plus lente, et aucune n’est cassée. **Quelle requête est en cause ?** Le log des requêtes lentes montre un rapport de 8 secondes, et ce rapport n’est pas ce qui remplit le CPU.',
		'Le coupable prend **3 millisecondes** et tourne 40 000 fois par minute : deux minutes de temps de base chaque minute. Aucun log de requêtes lentes ne l’attrape, parce qu’aucune exécution n’est lente. Tu ne le vois qu’en additionnant le temps de toutes ses exécutions.',
		'`pg_stat_statements` additionne chaque requête par forme. `log_min_duration_statement` et `auto_explain` attrapent les exécutions lentes isolées et leur plan.'
	],
	terms: [
		{ term: 'pg_stat_statements', def: 'Un module livré avec PostgreSQL qui compte les appels, le temps, les lignes et les blocs de chaque instruction exécutée par le serveur, et montre les totaux dans une vue.' },
		{ term: 'Normalisation', def: 'Les constantes d’une requête sont remplacées par `$1`, `$2` : `id = 42` et `id = 43` partagent une ligne, repérée par un hash `queryid`.' },
		{ term: 'total_exec_time', def: 'La somme du temps d’exécution sur tous les appels. Trie dessus pour voir où le serveur passe son temps ; `mean_exec_time` seul cache les requêtes rapides lancées souvent.' },
		{ term: 'log_min_duration_statement', def: 'Écrit dans le log chaque instruction qui a duré au moins ce temps, avec sa durée et son texte. `-1`, la valeur par défaut, n’écrit rien.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['q1["SELECT * FROM orders WHERE id = 42"] --> norm["Forme : WHERE id = $1"]', 'q2["SELECT * FROM orders WHERE id = 43"] --> norm'],
				highlight: ['norm'],
				note: 'Les constantes sont remplacées par un symbole de paramètre, donc les deux exécutions ont le même `queryid`. La vue contient « one row for each distinct combination of database ID, user ID, query ID » (une ligne par base, utilisateur et query ID), et par niveau principal ou non.'
			},
			{
				add: ['norm -->|"après chaque exécution : appels, temps, lignes, blocs"| pgss[("pg_stat_statements")]'],
				highlight: ['pgss'],
				note: 'Quand une instruction se termine, ses compteurs grossissent : un appel de plus, son temps ajouté au total, le min, le max, la moyenne et l’écart type mis à jour, ses lignes et ses blocs ajoutés. Le module ne garde aucune trace des exécutions isolées, seulement ces sommes.'
			},
			{
				add: ['top["ORDER BY total_exec_time DESC LIMIT 10"] -->|"lit"| pgss'],
				highlight: ['top'],
				note: 'L’exemple de la doc elle-même trie par `total_exec_time`. Ça place la requête de 3 ms à 40 000 appels par minute au-dessus du rapport de 8 secondes lancé une fois par nuit. Ensuite, lis `calls`, `mean_exec_time` et `rows` pour savoir de quel genre de problème il s’agit.'
			},
			{
				add: ['slow["Une exécution de 900 ms"] -->|"log_min_duration_statement = 250ms"| log["Log du serveur"]'],
				highlight: ['slow', 'log'],
				note: 'Une somme ne peut pas te dire qu’un appel a pris 900 ms avec ces paramètres-là. Avec `log_min_duration_statement` à 250ms, « all SQL statements that run 250ms or longer will be logged » (chaque instruction de 250 ms ou plus est écrite dans le log), avec sa durée.'
			},
			{
				add: ['ae["auto_explain, log_min_duration = 250ms"] -->|"le plan de cette exécution"| log'],
				highlight: ['ae'],
				note: '`auto_explain` est un module qui écrit dans le log le plan de chaque instruction au-delà de son seuil, la même sortie qu’EXPLAIN (jour 12). Le plan au moment où elle était lente diffère souvent de celui que tu obtiens plus tard dans `psql`.'
			}
		]
	},
	example: {
		title: 'contrib/pg_stat_statements/pg_stat_statements.c : chaque exécution s’ajoute à une seule entrée',
		repo: 'postgres/postgres',
		url: `${PGSS}#L1307-L1442`,
		lang: 'c',
		code: `	/* clear padding */
	memset(&key, 0, sizeof(pgssHashKey));

	key.userid = GetUserId();
	key.dbid = MyDatabaseId;
	key.queryid = queryId;
	key.toplevel = (nesting_level == 0);

	/* Lookup the hash table entry with shared lock. */
	LWLockAcquire(&pgss->lock.lock, LW_SHARED);

	entry = (pgssEntry *) hash_search(pgss_hash, &key, HASH_FIND, NULL);
…
	/* Increment the counts, except when jstate is not NULL */
	if (!jstate)
	{
		Assert(kind == PGSS_PLAN || kind == PGSS_EXEC);

		/*
		 * Grab the spinlock while updating the counters (see comment about
		 * locking rules at the head of the file)
		 */
		SpinLockAcquire(&entry->mutex);

		/* "Unstick" entry if it was previously sticky */
		if (IS_STICKY(entry->counters))
			entry->counters.usage = USAGE_INIT;

		entry->counters.calls[kind] += 1;
		entry->counters.total_time[kind] += total_time;

		if (entry->counters.calls[kind] == 1)
		{
			entry->counters.min_time[kind] = total_time;
			entry->counters.max_time[kind] = total_time;
			entry->counters.mean_time[kind] = total_time;
		}
		else
		{
			/*
			 * Welford's method for accurately computing variance. See
			 * <http://www.johndcook.com/blog/standard_deviation/>
			 */
			double		old_mean = entry->counters.mean_time[kind];

			entry->counters.mean_time[kind] +=
				(total_time - old_mean) / entry->counters.calls[kind];
			entry->counters.sum_var_time[kind] +=
				(total_time - old_mean) * (total_time - entry->counters.mean_time[kind]);

…
		entry->counters.rows += rows;
		entry->counters.shared_blks_hit += bufusage->shared_blks_hit;
		entry->counters.shared_blks_read += bufusage->shared_blks_read;
		entry->counters.shared_blks_dirtied += bufusage->shared_blks_dirtied;
		entry->counters.shared_blks_written += bufusage->shared_blks_written;`,
		notes: [
			'Lignes 4 à 7 : la clé de hash est `userid`, `dbid`, `queryid` et `toplevel`. La même requête lancée par deux rôles donne deux lignes. Sans query ID, [`pgss_store` repart](' + PGSS + '#L1291-L1296) sans rien enregistrer ; `compute_query_id = auto`, la valeur par défaut, l’active dès que le module est chargé.',
			'Pour une nouvelle entrée, [`generate_normalized_query`](' + PGSS + '#L1335-L1346) remplace les constantes par `$1`, `$2`, et le texte est ajouté à un fichier plutôt que gardé en mémoire partagée. La doc : le reste du texte « is that of the first query that had the particular queryid hash value » (est celui de la première requête arrivée avec ce queryid).',
			'Lignes 29 à 48 : chaque appel s’ajoute à `calls` et `total_time` et déplace la moyenne avec la méthode de Welford : `stddev_exec_time` ne coûte rien de plus. Une grande dispersion veut dire que la plupart des appels sont rapides et quelques-uns très lents : un plan qui bascule, ou une attente de verrou (jour 20).',
			'Lignes 52 à 54 : la même mise à jour ajoute `shared_blks_hit`, les pages trouvées dans les shared buffers, et `shared_blks_read`, celles demandées au système. Beaucoup de lectures par appel font penser à un index manquant ou à un cache froid. La requête d’exemple de la doc en tire un `hit_percent`. La colonne `shared_blk_read_time` reste à zéro tant que `track_io_timing` n’est pas activé.',
			'Dans auto_explain, [`explain_ExecutorStart`](' + AE + '#L347-L365) active les minuteurs **avant** que l’instruction tourne, puisqu’il ne peut pas encore savoir si elle sera lente. Seul `explain_ExecutorEnd` (dans les sources) compare la durée au seuil. La doc prévient donc que `log_analyze` « can have an extremely negative impact on performance » (peut plomber sérieusement les performances).'
		]
	},
	tradeoff: {
		gain: [
			'Les sommes montrent où part vraiment le temps, y compris les requêtes rapides lancées des millions de fois qui n’atteignent jamais le log des lentes.',
			'La normalisation replie des milliers de textes de requêtes en une courte liste de formes qui tient sur un écran.',
			'Le log des lentes et auto_explain gardent la rare mauvaise exécution avec son texte et son plan : tu vois pourquoi elle a été lente.'
		],
		cost: [
			'Le module va dans `shared_preload_libraries`, et « a server restart is needed to add or remove the module » (il faut redémarrer le serveur pour l’ajouter ou l’enlever).',
			'Les compteurs s’additionnent depuis la dernière remise à zéro : une requête corrigée la semaine dernière reste en tête tant que tu n’appelles pas `pg_stat_statements_reset()` ou que tu ne compares pas deux relevés.',
			'`pg_stat_statements.max` plafonne les entrées (5000 par défaut) ; au-delà, « information about the least-executed statements is discarded » (les instructions les moins lancées sont oubliées).',
			'`auto_explain.log_analyze` chronomètre chaque nœud de plan de chaque instruction, et un seuil bas peut remplir le disque des logs.'
		]
	},
	task: {
		prompt: 'Tes trois premières lignes de `pg_stat_statements`, triées par `total_exec_time` : (A) `SELECT * FROM products WHERE id = $1`, 2 400 000 appels, moyenne 0,9 ms, total 2 160 s. (B) `UPDATE carts SET updated_at = $1 WHERE id = $2`, 900 000 appels, moyenne 1,8 ms, écart type 40 ms, max 4 000 ms, total 1 620 s. (C) le rapport de ventes nocturne, 30 appels, moyenne 8 000 ms, total 240 s. Que regardes-tu pour chacune, et dans quel ordre t’en occupes-tu ?',
		hint: 'Chaque ligne est un problème différent : trop d’appels, un temps instable, ou une seule tâche lourde.',
		answer: [
			'Par total : A, puis B, puis C. C est la vedette du log des lentes, mais il pèse environ 6 % du temps des trois.',
			'A est rapide à chaque fois ; c’est le nombre qui pose problème. Trouve où l’appli l’appelle en boucle, un produit par ligne, et charge-les en une requête : `WHERE id = ANY($1)`. Vérifie que `rows / calls` vaut 1 et que le hit percent est élevé : ce n’est pas un problème d’index.',
			'B est rapide d’habitude mais prend parfois des secondes : moyenne 1,8 ms, écart type 40 ms. Ce profil indique une attente, pas un calcul lent. Pendant un pic, regarde `pg_stat_activity` pour `wait_event_type = \'Lock\'` : deux requêtes qui modifient la même ligne de panier (jour 20). Un nouvel index n’y changera rien.',
			'C tourne 30 fois. Déplace-le sur un réplica (jour 28) ou dans une vue matérialisée rafraîchie la nuit (jour 8), et règle `log_min_duration_statement` avec `auto_explain` pour garder son plan s’il se dégrade.',
			'Après chaque correction, `SELECT pg_stat_statements_reset();` (ou garde un relevé) pour que la lecture suivante montre le nouvel état, pas celui de la semaine dernière.'
		]
	},
	quiz: [
		{
			q: 'Avec `log_min_duration_statement = 250ms`, pourquoi une requête de 3 ms n’apparaît-elle jamais dans le log, même si elle occupe la moitié du serveur ?',
			options: [
				'Le réglage n’écrit que les instructions lancées dans une transaction explicite',
				'Le réglage écrit les exécutions de 250 ms ou plus, et aucune ne dure autant',
				'Les instructions de moins de 250 ms vont dans un fichier séparé à activer',
				'Le log ne garde que les 5000 instructions les plus récentes, les rapides sortent'
			],
			answer: 1,
			why: 'La doc le décrit ainsi : « Causes the duration of each completed statement to be logged if the statement ran for at least the specified amount of time. » Il regarde une exécution à la fois. Seule une somme sur toutes les exécutions, comme `total_exec_time`, montre une requête rapide lancée très souvent.'
		},
		{
			q: 'Deux serveurs d’appli lancent `SELECT * FROM users WHERE email = \'a@x.io\'` et la même avec `\'b@y.io\'`, avec le même rôle, dans la même base. Combien de lignes dans `pg_stat_statements` ?',
			options: [
				'Deux lignes, car les deux constantes rendent les textes de requête différents',
				'Deux lignes, car chaque serveur d’appli a son propre processus backend',
				'Aucune ligne tant que la requête n’a pas tourné `pg_stat_statements.max` fois',
				'Une ligne avec `calls = 2`, car la constante devient `$1`'
			],
			answer: 3,
			why: 'La normalisation remplace la constante par un symbole de paramètre, donc les deux exécutions ont le même `queryid`. La ligne est repérée par base, utilisateur, query ID et niveau principal, pas par client ni par processus.'
		},
		{
			q: 'Tu charges `auto_explain` avec `log_min_duration = 500ms` et `log_analyze = on`. Pourquoi toutes les requêtes peuvent-elles ralentir, même les rapides ?',
			options: [
				'Le chronométrage par nœud tourne pour toutes, la lenteur n’étant connue qu’à la fin',
				'auto_explain relance un EXPLAIN ANALYZE de chaque instruction une fois finie',
				'Chaque plan est d’abord écrit dans le log, et ceux des rapides sont effacés ensuite',
				'Le planificateur cesse de garder les plans des requêtes préparées tant qu’il est chargé'
			],
			answer: 0,
			why: 'La doc : « per-plan-node timing occurs for all statements executed, whether or not they run long enough to actually get logged. » Le code active les minuteurs dans `ExecutorStart` et vérifie la durée dans `ExecutorEnd`. Désactiver `auto_explain.log_timing` réduit ce coût.'
		}
	],
	recall: {
		q: 'Une requête de 3 ms tourne 40 000 fois par minute. Où la vois-tu, et pourquoi `log_min_duration_statement = 250ms` ne l’écrit-il jamais ?',
		a: 'Dans `pg_stat_statements` trié par `total_exec_time` : 40 000 × 3 ms font deux minutes de temps de base par minute. `log_min_duration_statement` regarde une exécution à la fois, et aucune n’atteint 250 ms.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, pg_stat_statements', url: 'https://www.postgresql.org/docs/current/pgstatstatements.html' },
		{ title: 'Doc PostgreSQL, auto_explain', url: 'https://www.postgresql.org/docs/current/auto-explain.html' },
		{ title: 'Doc PostgreSQL, log_min_duration_statement', url: 'https://www.postgresql.org/docs/current/runtime-config-logging.html#GUC-LOG-MIN-DURATION-STATEMENT' },
		{ title: 'Source PostgreSQL, contrib/pg_stat_statements/pg_stat_statements.c', url: PGSS },
		{ title: 'Source PostgreSQL, auto_explain.c, explain_ExecutorEnd', url: `${AE}#L434-L436` }
	]
};
