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
		],
		steps: [
			{
				title: 'Classe-les par temps total',
				questions: [
					{ q: 'Dans quel ordre t’occupes-tu des trois lignes ?', options: ['C, puis B, puis A', 'A, puis B, puis C', 'B, puis A, puis C', 'C, puis A, puis B'], answer: 1, why: 'Le temps total, c’est là où le serveur passe son temps : 2 160 s, 1 620 s, puis 240 s.' },
					{ q: 'Quelle part des trois totaux pèse le rapport C, à peu près ?', options: ['Environ 60 %', 'Environ 25 %', 'Environ 6 %', 'Environ 40 %'], answer: 2, why: '240 s sur 4 020 s, c’est environ 6 %. C’est la vedette du log des lentes, pas du CPU.' },
					{ q: 'Pourquoi trier par `total_exec_time` plutôt que par `mean_exec_time` ?', options: ['La moyenne cache les requêtes rapides lancées très souvent', 'La moyenne n’est calculée que pour les requêtes lentes', 'Le total coûte moins cher à calculer', 'La moyenne repart de zéro chaque heure'], answer: 0, why: 'Une requête de 0,9 ms appelée 2,4 millions de fois coûte plus qu’un rapport de 8 secondes lancé 30 fois.' },
					{ q: 'Les appels de A viennent de deux rôles, l’appli web et un outil d’admin. Comment A apparaît-elle dans `pg_stat_statements` ?', options: ['En une ligne, puisque les constantes deviennent `$1`', 'En une ligne par valeur d’`id` distincte', 'Pas du tout, tant que les deux rôles n’ont pas accès à la vue', 'En deux lignes, une par rôle : additionne-les pour avoir le vrai total de A'], answer: 3, why: 'La clé d’une entrée contient `userid`, `dbid`, `queryid` et `toplevel`. La même requête lancée par deux rôles fait deux lignes, chacune avec une part du temps.' }
				]
			},
			{
				title: 'Lis la ligne A',
				questions: [
					{ q: 'La ligne A est rapide à chaque fois. Quel est son problème ?', options: ['Un index manquant', 'Une attente de verrou', 'Le nombre d’appels', 'Un mauvais plan'], answer: 2, why: '0,9 ms, c’est bien. 2,4 millions de fois, non.' },
					{ q: 'Où cherches-tu la cause ?', options: ['Dans l’appli : une boucle qui charge un produit par ligne', 'Dans `pg_locks`', 'Dans les réglages du planificateur', 'Dans l’archive WAL'], answer: 0, why: 'Une requête par id appelée aussi souvent vient en général d’un code qui charge les lignes une par une.' },
					{ q: 'Quelle est la correction ?', options: ['Un index sur `products(id)`', 'Charger les produits en une requête : `WHERE id = ANY($1)`', 'Augmenter `shared_buffers`', 'La passer à `auto_explain`'], answer: 1, why: 'Une seule requête pour toute la liste remplace beaucoup d’allers-retours. `id` est la clé primaire, donc déjà indexé.' },
					{ q: 'Quels chiffres confirment que ce n’est pas un problème d’index ?', options: ['Un `stddev_exec_time` élevé', 'Un `max_exec_time` élevé', 'Un petit nombre de `calls`', '`rows / calls` vaut 1 et le hit percent est élevé'], answer: 3, why: 'Une ligne par appel, lue dans des pages en cache : chaque exécution travaille peu. Beaucoup de lectures de blocs par appel pointeraient vers un index manquant.' }
				]
			},
			{
				title: 'Lis la ligne B',
				questions: [
					{ q: 'Moyenne 1,8 ms, écart type 40 ms, max 4 000 ms. Que dit ce profil ?', options: ['Chaque appel est lent', 'La requête a besoin d’un nouvel index', 'La plupart des appels sont rapides et quelques-uns attendent quelque chose', 'Les compteurs sont faux'], answer: 2, why: 'Un grand écart veut dire que la plupart des exécutions sont rapides et quelques-unes très lentes : un plan qui bascule, ou une attente de verrou.' },
					{ q: 'Où regardes-tu pendant un pic ?', options: ['`pg_stat_activity`, pour `wait_event_type = \'Lock\'`', '`pg_stat_replication`', 'La colonne `rows`', '`shared_blks_read`'], answer: 0, why: 'Une attente de verrou se voit en direct sur le backend qui attend.' },
					{ q: 'Quelle est la cause probable pour `UPDATE carts SET updated_at = $1 WHERE id = $2` ?', options: ['Un parcours séquentiel de `carts`', 'Deux requêtes qui modifient la même ligne de panier', 'Un disque lent', 'Trop d’index sur `carts`'], answer: 1, why: 'Deux updates sur une ligne : le second attend que le premier valide (jour 20).' },
					{ q: 'Un nouvel index corrigera-t-il B ?', options: ['Oui, sur `updated_at`', 'Oui, sur `id`', 'Seulement un index GIN', 'Non : le temps passe à attendre, pas à travailler'], answer: 3, why: 'L’update trouve déjà sa ligne vite. La correction est dans la façon dont l’appli écrit le même panier en même temps.' }
				]
			},
			{
				title: 'Traite C, puis mesure à nouveau',
				questions: [
					{ q: 'Où va le rapport nocturne ?', options: ['Sur un réplica ou dans une vue matérialisée rafraîchie la nuit', 'Dans une boucle de petites requêtes', 'Dans `pg_stat_statements_reset()`', 'Nulle part : supprime-le'], answer: 0, why: 'Il tourne 30 fois. Le sortir du primaire suffit (jours 28 et 8).' },
					{ q: 'Comment gardes-tu son plan s’il se dégrade ?', options: ['Lancer EXPLAIN à la main chaque matin', 'Augmenter `pg_stat_statements.max`', 'Régler `log_min_duration_statement` et `auto_explain`', 'Activer `track_io_timing`'], answer: 2, why: 'auto_explain écrit le plan de l’exécution lente elle-même, qui peut différer de celui que tu obtiens plus tard dans `psql`.' },
					{ q: 'Tu as corrigé A. Pourquoi est-elle encore en tête la semaine suivante ?', options: ['La correction n’a pas marché', 'Les compteurs s’additionnent depuis la dernière remise à zéro', 'pg_stat_statements garde l’ancien plan en cache', 'La normalisation garde l’ancien texte'], answer: 1, why: 'Les sommes incluent chaque appel depuis la dernière remise à zéro. Les anciens appels gardent A en tête.' },
					{ q: 'Que lances-tu après chaque correction ?', options: ['`VACUUM FULL`', 'Un redémarrage du serveur', '`DROP EXTENSION pg_stat_statements`', '`SELECT pg_stat_statements_reset();`, ou garde un relevé'], answer: 3, why: 'Ainsi la lecture suivante montre le nouvel état, pas celui de la semaine dernière.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Faire peser une requête rapide et fréquente plus lourd qu’un rapport lent, la trouver avec `pg_stat_statements`, et attraper le rapport avec le log des lentes et `auto_explain`.',
		steps: [
			'Lance PostgreSQL avec les deux modules chargés : `docker run -d --name dojo-pg -e POSTGRES_PASSWORD=dojo postgres:17 -c shared_preload_libraries=pg_stat_statements,auto_explain -c log_min_duration_statement=250ms -c auto_explain.log_min_duration=250ms`. Attends que `docker exec dojo-pg pg_isready` affiche `accepting connections`.',
			'Crée la vue et des données : `docker exec dojo-pg psql -U postgres -c "CREATE EXTENSION pg_stat_statements" -c "CREATE TABLE products (id int PRIMARY KEY, name text)" -c "INSERT INTO products SELECT g, \'p\' || g FROM generate_series(1, 10000) g"`',
			'Écris un fichier `fast.sql` de deux lignes : `\\set id random(1, 10000)` et `SELECT * FROM products WHERE name = \'p\' || :id;`. Copie-le : `docker cp fast.sql dojo-pg:/tmp/fast.sql`.',
			'Pars de zéro, puis lance la requête rapide 5 000 fois : `docker exec dojo-pg psql -U postgres -c "SELECT pg_stat_statements_reset()"` puis `docker exec dojo-pg pgbench -U postgres -n -f /tmp/fast.sql -t 5000 postgres`.',
			'Lance le « rapport » une fois : `docker exec dojo-pg psql -U postgres -c "SELECT count(*) FROM products a, products b WHERE a.id % 7 = b.id % 5"`',
			'Lis le classement : `docker exec dojo-pg psql -U postgres -c "SELECT calls, round(total_exec_time::numeric) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms, shared_blks_hit / calls AS hits_per_call, left(query, 45) AS query FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 3"`. Puis le log : `docker logs dojo-pg 2>&1 | grep -A4 "duration:"`.',
			'Corrige la requête rapide et mesure à nouveau : `docker exec dojo-pg psql -U postgres -c "CREATE INDEX ON products (name)" -c "SELECT pg_stat_statements_reset()"`, puis relance pgbench et le classement.'
		],
		done: [
			'À l’étape 6, la requête rapide est en tête avec `calls` à 5000 et une moyenne sous la milliseconde, au-dessus du rapport à `calls` 1. Son texte est `WHERE name = $1 || $2`.',
			'Le log montre le rapport deux fois, une fois avec `plan:` et son `Query Text`, et jamais la requête rapide.',
			'Après l’étape 7, le `hits_per_call` de la requête rapide passe de plusieurs dizaines à quelques-uns, et son total tombe très en dessous de celui du rapport à l’étape 6.'
		],
		solution: [
			'Chaque exécution rapide reste loin sous 250 ms, donc le log des lentes ne la voit jamais. Seule la somme dans `pg_stat_statements` montre qu’elle a pris plus de temps que le rapport.',
			'La normalisation a replié 5 000 noms différents en une ligne, avec les constantes remplacées par `$1` et `$2`.',
			'Des dizaines de hits de buffer par appel pour une recherche d’une ligne pointent vers un parcours : ici un index manquant sur `name`. Dans la ligne A du chapitre, la recherche se faisait déjà par clé primaire, donc la correction était moins d’appels, pas un index.',
			'Nettoie avec `docker rm -f dojo-pg`.'
		]
	},
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
