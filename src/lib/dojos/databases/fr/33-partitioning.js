const PARTMAN = 'https://github.com/pgpartman/pg_partman/blob/c737cc1d32a46a37120aa691f7dd0bce6ad07660';
const DOC = `${PARTMAN}/doc/pg_partman.md?plain=1`;
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/doc/src/sgml/ddl.sgml';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'partitioning',
	part: 'Au-delà d’un serveur',
	title: 'Partitionner les grosses tables',
	minutes: 10,
	hook: [
		'Ta table `events` a deux milliards de lignes. Chaque nuit, un job lance `DELETE FROM events WHERE created_at < now() - interval \'90 days\'`. Ça prend des heures, les réplicas prennent du retard, et le lendemain matin **l’autovacuum nettoie encore les lignes mortes** (jour 16).',
		'De toute façon, la plupart des requêtes ne lisent que la dernière semaine. Pourtant les index couvrent deux ans, et ils ne tiennent plus en mémoire.',
		'Le partitionnement découpe une grosse table en tables plus petites, une par mois par exemple, derrière un seul nom. L’application écrit toujours dans `events`, et une requête sur la semaine dernière lit une seule partition. Pour retirer un mois de vieilles lignes, il suffit d’**un `DROP TABLE` sur une partition**, qui finit en un instant au lieu de plusieurs heures.'
	],
	terms: [
		{ term: 'Clé de partitionnement', def: 'La colonne (ou les colonnes) qui décide dans quelle partition va une ligne. Souvent un timestamp pour range, une région ou un tenant pour list.' },
		{ term: 'Élagage de partitions', def: 'Le planificateur prouve, à partir du `WHERE`, que certaines partitions ne peuvent pas contenir de lignes qui correspondent, et les retire du plan. En anglais, on dit partition pruning.' },
		{ term: 'Partition par défaut', def: 'Un fourre-tout pour les lignes qui ne vont dans aucune autre partition. Sans elle, PostgreSQL refuse un tel insert avec une erreur.' },
		{ term: 'Rétention', def: 'La règle qui supprime ou détache les partitions dès que toutes leurs données dépassent un âge limite. pg_partman la fait tourner pour toi.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["INSERT INTO events"] --> parent["events, partitionnée par created_at"]'],
				highlight: ['app', 'parent'],
				note: 'L’application insère dans `events` comme avant. Le parent n’a pas de stockage : PostgreSQL envoie chaque ligne dans une partition selon son `created_at`.'
			},
			{
				add: ['parent --> sep[("events_p2026_09")]', 'parent --> oct[("events_p2026_10")]', 'parent --> def[("events_default")]'],
				highlight: ['sep', 'oct', 'def'],
				note: 'Une partition range inclut sa borne basse et exclut sa borne haute, donc minuit le 1er octobre va en octobre. Une ligne qui ne va dans aucune partition tombe dans la partition par défaut. Sans partition par défaut, l’insert échoue.'
			},
			{
				add: ['q["SELECT ... WHERE created_at >= \'2026-10-01\'"] -.->|"élagué à une partition"| oct'],
				highlight: ['q'],
				note: 'Le planificateur lit les bornes de chaque partition et retire du plan celles qui ne peuvent pas correspondre. `EXPLAIN` (jour 12) ne montre que `events_p2026_10`. Une requête qui ne filtre pas sur `created_at` lit quand même toutes les partitions.'
			},
			{
				add: ['maint["pg_partman run_maintenance()"] -->|"premake : créer en avance"| nov[("events_p2026_11")]', 'parent --> nov'],
				highlight: ['maint', 'nov'],
				note: 'pg_partman garde un certain nombre de partitions futures prêtes, `premake`, 4 par défaut. Lance sa maintenance depuis cron ou son background worker, et novembre existe avant la première ligne de novembre.'
			},
			{
				add: ['maint -->|"rétention : détacher, ou supprimer"| sep'],
				highlight: ['sep'],
				note: 'Quand toute une partition dépasse l’intervalle de rétention, la maintenance la détache, ou la supprime. Aucune ligne n’est supprimée une par une, donc le vacuum n’a pas de lignes mortes à nettoyer ensuite.'
			}
		]
	},
	example: {
		title: 'pg_partman, sql/functions/drop_partition_time.sql : la rétention en détachant ou en supprimant des partitions entières',
		repo: 'pgpartman/pg_partman',
		url: `${PARTMAN}/sql/functions/drop_partition_time.sql#L158-L269`,
		lang: 'sql',
		code: `FOR v_row IN
    SELECT partition_schemaname, partition_tablename FROM @extschema@.show_partitions(p_parent_table, 'ASC')
LOOP
…
    IF (v_partition_timestamp + v_partition_interval) < (p_reference_timestamp - v_retention) THEN
…
        SELECT count(*) INTO v_count FROM @extschema@.show_partitions(p_parent_table);
        IF v_count = 1 AND v_sub_parent IS NULL THEN
            RAISE WARNING 'Attempt to drop final partition in partition set % as part of retention policy. If you see this message multiple times for the same table, advise reviewing retention policy and/or data entry into the partition set. Also consider setting "infinite_time_partitions = true" if there are large gaps in data insertion.).', p_parent_table;
            CONTINUE;
        END IF;
…
        IF v_retention_keep_table = true OR v_retention_schema IS NOT NULL THEN
…
            v_sql := format('ALTER TABLE %I.%I DETACH PARTITION %I.%I'
                , v_parent_schema
                , v_parent_tablename
                , v_row.partition_schemaname
                , v_row.partition_tablename);
            EXECUTE v_sql;
…
        IF v_retention_schema IS NULL THEN
            IF v_retention_keep_table = false THEN
                IF v_jobmon_schema IS NOT NULL THEN
                    v_step_id := add_step(v_job_id, format('Drop table %s.%s', v_row.partition_schemaname, v_row.partition_tablename));
                END IF;
                IF v_detach_before_drop THEN
                    v_sql := format('ALTER TABLE %I.%I DETACH PARTITION %I.%I'
                    , v_parent_schema
                    , v_parent_tablename
                    , v_row.partition_schemaname
                    , v_row.partition_tablename);
                    EXECUTE v_sql;
                END IF;
                v_sql := 'DROP TABLE %I.%I';
                EXECUTE format(v_sql, v_row.partition_schemaname, v_row.partition_tablename);`,
		notes: [
			'Lignes 1 à 5 : la boucle parcourt les partitions de la plus ancienne à la plus récente. Une partition ne part que si son début plus un intervalle, sa borne haute, est plus ancien que maintenant moins `retention`. La [doc](' + DOC + '#L120) : "any partitions containing only data older than that will be dropped" (les partitions qui ne contiennent que des données plus vieilles seront supprimées). Une partition qui a encore des lignes plus récentes que la limite reste.',
			'Lignes 7 à 11 : s’il ne reste qu’une partition, la fonction lève un warning et passe à la suite. La [doc](' + DOC + '#L126) : "retention will never drop the last child table in a set" (la rétention ne supprime jamais la dernière table enfant).',
			'Les lignes 13 à 20 tournent quand `retention_keep_table` vaut true, la [valeur par défaut](' + DOC + '#L118). La partition est seulement détachée : elle reste sur le disque comme table simple, hors du parent. La doc PostgreSQL propose de la sauvegarder à ce moment avec `COPY` ou `pg_dump`, puis de la supprimer.',
			'Les lignes 35 et 36 suppriment la table. Un `DROP TABLE` sur une partition "can very quickly delete millions of records" (supprime très vite des millions de lignes), mais [il prend](' + PG + '#L4646-L4656) un verrou `ACCESS EXCLUSIVE` sur le parent, alors que `DETACH PARTITION ... CONCURRENTLY` n’a besoin que de `SHARE UPDATE EXCLUSIVE`. Comme au jour 26, une longue requête sur `events` fait attendre la suppression, et toutes les requêtes en file derrière elle attendent aussi.',
			'pg_partman crée toujours une [partition par défaut](' + DOC + '#L14) et la surveille avec `check_default()`. Ses auteurs préfèrent ça à créer des tables à la demande puis nettoyer "potentially hundreds or thousands of unwanted partitions" (des centaines ou des milliers de partitions inutiles). `run_maintenance()` crée les partitions en avance, et tu peux la lancer plus souvent que nécessaire sans risque.'
		]
	},
	tradeoff: {
		gain: [
			'Pour supprimer un mois, un `DROP TABLE` ou un `DETACH` remplace des millions de suppressions de lignes, et ne laisse aucune ligne morte au vacuum.',
			'Les requêtes qui filtrent sur la clé ne lisent que les partitions utiles. Chaque partition a des index plus petits, qui tiennent plus facilement en mémoire.',
			'La maintenance se fait par partition : vacuum, reindex ou déplacement d’un mois à la fois, sans toucher aux vieilles partitions.'
		],
		cost: [
			'Une clé primaire ou une contrainte unique doit inclure la clé de partitionnement. `PRIMARY KEY (id)` seul est refusé ; tu obtiens `(id, created_at)`, et la base ne garantit plus que `id` est unique sur toute la table.',
			'Les requêtes qui ne filtrent pas sur la clé planifient et lisent maintenant toutes les partitions. La doc dit que le planificateur gère "up to a few thousand partitions fairly well" (quelques milliers de partitions sans souci) seulement si les requêtes en élaguent presque toutes ; au-delà, le temps de planification et la mémoire grimpent.',
			'Quelqu’un doit créer les prochaines partitions à temps. Sans job, ou sans partition par défaut, les inserts se mettent à échouer à minuit le premier du mois.',
			'La doc dit que le partitionnement ne vaut le coup "only when a table would otherwise be very large" (que si la table serait sinon très grosse). Une table plus petite garde quand même la règle sur la clé primaire, le coût de planification et le job qui crée les partitions.'
		]
	},
	task: {
		prompt: 'Dans `psql`, traduis ce design en SQL : `events(id bigint, user_id bigint, created_at timestamptz, payload jsonb)`, partitionnée par mois sur `created_at`, avec octobre et novembre 2026 et une partition par défaut. Puis dis lesquelles de ces requêtes sont élaguées : (a) `WHERE created_at >= \'2026-10-05\' AND created_at < \'2026-10-06\'`, (b) `WHERE user_id = 42`. Enfin, écris comment tu retires septembre une fois la rétention passée.',
		hint: 'La clé primaire doit contenir la clé de partitionnement. Les bornes range s’écrivent `FROM (lower) TO (upper)`, borne haute exclue.',
		answer: [
			'`CREATE TABLE events (id bigint, user_id bigint, created_at timestamptz NOT NULL, payload jsonb, PRIMARY KEY (id, created_at)) PARTITION BY RANGE (created_at);`',
			'`CREATE TABLE events_p2026_10 PARTITION OF events FOR VALUES FROM (\'2026-10-01\') TO (\'2026-11-01\');` et pareil pour novembre. `CREATE TABLE events_default PARTITION OF events DEFAULT;`',
			'(a) est élaguée : l’intervalle tient dans octobre, donc `EXPLAIN` (jour 12) laisse novembre de côté et montre `events_p2026_10`. (b) lit toutes les partitions : le filtre ne dit rien sur `created_at`. Un index sur `user_id` aide dans chaque partition, mais chaque partition est quand même visitée.',
			'Pour retirer septembre : `ALTER TABLE events DETACH PARTITION events_p2026_09 CONCURRENTLY;`, sauvegarde-la si besoin, puis `DROP TABLE events_p2026_09;`. Rapide quel que soit le nombre de lignes, et rien à nettoyer pour le vacuum.'
		],
		steps: [
			{
				title: 'Crée la table parente',
				questions: [
					{ q: 'Quelle clé primaire PostgreSQL accepte-t-il sur `events` ?', options: ['`PRIMARY KEY (id)`', '`PRIMARY KEY (id, created_at)`', '`PRIMARY KEY (user_id)`', 'Aucune : une table partitionnée ne peut pas en avoir'], answer: 1, why: 'Une contrainte unique sur une table partitionnée doit inclure la clé de partitionnement, parce que l’index de chaque partition ne voit que ses lignes.' },
					{ q: 'Quelle clause partitionne la table par mois sur `created_at` ?', options: ['`PARTITION BY LIST (created_at)`', '`PARTITION BY HASH (id)`', '`PARTITION BY RANGE (created_at)`', '`CLUSTER BY created_at`'], answer: 2, why: 'Les mois sont des intervalles de timestamps. List convient à une région ou un tenant, pas à un timestamp.' },
					{ q: 'Que stocke le parent `events` lui-même ?', options: ['Rien : chaque ligne est envoyée dans une partition', 'Une copie de chaque ligne, par sécurité', 'Seulement les lignes qui ne vont dans aucune partition', 'Seulement les index des partitions'], answer: 0, why: 'Le parent n’a pas de stockage. L’application écrit dans `events`, et PostgreSQL range chaque ligne selon son `created_at`.' },
					{ q: 'Avec `PRIMARY KEY (id, created_at)`, que ne garantit plus la base ?', options: ['Que `id` n’est pas NULL', 'Que chaque paire `(id, created_at)` est unique', 'Que les lignes arrivent dans l’ordre du temps', 'Que `id` est unique sur toute la table'], answer: 3, why: 'Deux partitions pourraient contenir le même `id` avec des dates différentes. L’unicité globale de `id` est maintenant ton affaire.' }
				]
			},
			{
				title: 'Ajoute les partitions',
				questions: [
					{ q: 'Quelles bornes donnent octobre 2026 ?', options: ['`FROM (\'2026-10-01\') TO (\'2026-10-31\')`', '`FROM (\'2026-10-01\') TO (\'2026-11-01\')`', '`FROM (\'2026-09-30\') TO (\'2026-10-31\')`', '`FROM (\'2026-10-02\') TO (\'2026-11-01\')`'], answer: 1, why: 'La borne haute est exclue, donc `TO (\'2026-11-01\')` couvre tout le 31 octobre et rien de novembre.' },
					{ q: 'Une ligne a un `created_at` pile à minuit le 1er novembre. Où va-t-elle ?', options: ['En octobre', 'En novembre', 'Dans la partition par défaut', 'Dans les deux, en copie'], answer: 1, why: 'Une partition range inclut sa borne basse et exclut sa borne haute. Minuit est la borne basse de novembre.' },
					{ q: 'Quelle instruction crée la partition par défaut ?', options: ['`CREATE TABLE events_default PARTITION OF events DEFAULT;`', '`ALTER TABLE events SET DEFAULT PARTITION;`', '`CREATE TABLE events_default (LIKE events);`', '`CREATE DEFAULT PARTITION ON events;`'], answer: 0, why: '`PARTITION OF ... DEFAULT` attache un fourre-tout pour les lignes qui ne vont dans aucune autre partition.' },
					{ q: 'Sans partition par défaut, une ligne arrive pour le 2 décembre. Que se passe-t-il ?', options: ['PostgreSQL crée une partition de décembre', 'La ligne va en novembre', 'L’insert échoue avec une erreur', 'La ligne attend dans la table parente'], answer: 2, why: 'Une ligne qui ne correspond à aucune partition est une erreur. C’est pour ça que pg_partman crée les partitions en avance et ajoute une partition par défaut.' }
				]
			},
			{
				title: 'Vérifie l’élagage',
				questions: [
					{ q: 'Quelles partitions lit la requête (a), un jour d’octobre ?', options: ['Seulement `events_p2026_10`', 'Octobre et novembre', 'Toutes les partitions', 'Seulement la partition par défaut'], answer: 0, why: 'L’intervalle tient dans les bornes d’octobre, donc le planificateur prouve que les autres ne peuvent pas correspondre et les laisse de côté.' },
					{ q: 'Quelles partitions lit la requête (b), `WHERE user_id = 42` ?', options: ['Seulement la plus récente', 'Toutes les partitions', 'Seulement la partition par défaut', 'Aucune, elle passe par la clé primaire'], answer: 1, why: 'Le filtre ne dit rien sur `created_at`, donc aucune partition ne peut être écartée.' },
					{ q: 'Comment vois-tu quelles partitions une requête lit ?', options: ['Un `SELECT count(*)` sur la requête', '`VACUUM VERBOSE events`', 'Un `pg_dump` du parent', 'Un `EXPLAIN` de la requête'], answer: 3, why: '`EXPLAIN` (jour 12) ne liste que les partitions restées dans le plan.' },
					{ q: 'Tu ajoutes un index sur `user_id`. Qu’est-ce qui change pour (b) ?', options: ['Chaque partition est fouillée plus vite, mais toutes sont encore visitées', 'La requête est élaguée à une partition', 'Rien : les tables partitionnées ne peuvent pas avoir d’index', 'Seule la partition par défaut est fouillée'], answer: 0, why: 'Un index aide dans chaque partition. L’élagage demande toujours un filtre sur la clé de partitionnement.' }
				]
			},
			{
				title: 'Retire septembre',
				questions: [
					{ q: 'Septembre a passé la rétention. Quelle est la façon la moins chère de le retirer ?', options: ['`DELETE FROM events WHERE created_at < \'2026-10-01\'`', 'Détacher la partition, puis la supprimer', '`TRUNCATE events`, puis recopier octobre et novembre', 'La supprimer par lots de 10 000 lignes'], answer: 1, why: 'Supprimer une partition retire toutes ses lignes d’un coup, quel que soit leur nombre.' },
					{ q: 'Pourquoi une partition supprimée ne laisse-t-elle rien à faire au vacuum ?', options: ['Aucune ligne n’est supprimée une à une, donc il n’y a pas de lignes mortes', 'Le vacuum ignore les tables partitionnées', 'Les lignes partent dans la partition par défaut', 'Le drop lance d’abord un `VACUUM FULL`'], answer: 0, why: 'Un gros `DELETE` laisse des millions de lignes mortes à l’autovacuum (jour 16). Un `DROP TABLE` retire le fichier.' },
					{ q: 'Quel verrou prend `DROP TABLE` sur une partition, côté parent ?', options: ['`SHARE UPDATE EXCLUSIVE`', 'Aucun verrou', '`ACCESS EXCLUSIVE`', 'Un verrou sur chaque ligne'], answer: 2, why: 'Une longue requête sur `events` fait donc attendre la suppression, et toutes les requêtes derrière elle attendent aussi, comme au jour 26.' },
					{ q: 'Pourquoi détacher d’abord au lieu de supprimer tout de suite ?', options: ['`DROP TABLE` refuse une partition attachée', 'Le détachement supprime les lignes plus vite', 'La rétention ne marche que sur des tables détachées', 'La table détachée reste sur le disque, donc tu peux la sauvegarder avant'], answer: 3, why: 'Une partition détachée devient une table simple. La doc PostgreSQL propose un `COPY` ou un `pg_dump` à ce moment, puis la suppression.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`events` est partitionnée par range sur `created_at`. Pourquoi `ALTER TABLE events ADD PRIMARY KEY (id)` échoue ?',
			options: [
				'L’index de chaque partition ne voit que ses lignes, donc la clé doit inclure created_at',
				'Une table partitionnée n’a pas de stockage, donc elle ne peut porter ni index ni contrainte',
				'Les clés primaires d’une table partitionnée se créent partition par partition, à la main',
				'La colonne id doit d’abord être déclarée comme clé de partitionnement hash pour être unique'
			],
			answer: 0,
			why: 'Une contrainte unique sur une table partitionnée est faite d’un index par partition, et chacun ne garantit l’unicité que dans sa partition. Ce n’est que si la clé contient la clé de partitionnement que la structure elle-même empêche la même valeur dans deux partitions.'
		},
		{
			q: 'Il n’y a pas de partition par défaut, et les partitions vont jusqu’à fin octobre. Une ligne arrive avec un `created_at` au 2 novembre. Que se passe-t-il ?',
			options: [
				'PostgreSQL crée la partition de novembre à la volée et y range la ligne',
				'La ligne va dans la partition d’octobre, l’intervalle existant le plus proche',
				'L’insert échoue avec une erreur tant que personne ne crée une partition adaptée',
				'La ligne reste dans la table parente jusqu’à ce que la maintenance la déplace'
			],
			answer: 2,
			why: 'Insérer une ligne qui ne correspond à aucune partition est une erreur ; il faut d’abord créer la partition. Pour l’éviter, pg_partman crée les partitions en avance avec `premake` et ajoute une partition par défaut comme filet de sécurité.'
		},
		{
			q: 'Tu dois supprimer tout ce qui a plus de 90 jours dans une table partitionnée par mois. Quelle est la façon correcte la moins chère ?',
			options: [
				'Un seul `DELETE ... WHERE created_at < now() - interval \'90 days\'`, puis un `VACUUM FULL`',
				'Détacher et supprimer les partitions dont tout l’intervalle a plus de 90 jours',
				'Un `TRUNCATE` sur la table parente, puis recopier les lignes des 90 derniers jours',
				'Supprimer par lots de 10 000 lignes dans chaque partition jusqu’à épuisement'
			],
			answer: 1,
			why: 'Supprimer ou détacher une partition retire ses lignes sans les toucher une par une, et ne laisse aucune ligne morte pour le vacuum (jour 16). La partition qui n’a qu’une partie de ses données au-delà de 90 jours reste jusqu’à ce qu’elle soit entièrement passée.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Construire une table partitionnée par mois, voir l’élagage dans `EXPLAIN`, et retirer un mois avec un seul `DROP TABLE`.',
		steps: [
			'Lance PostgreSQL et ouvre `psql` : `docker run -d --name part-lab -e POSTGRES_PASSWORD=lab postgres:16`, attends quelques secondes, puis `docker exec -it part-lab psql -U postgres`.',
			'Essaie d’abord la clé naïve : `CREATE TABLE events (id bigint PRIMARY KEY, user_id bigint, created_at timestamptz NOT NULL, payload jsonb) PARTITION BY RANGE (created_at);`. Lis l’erreur, puis crée la table avec la clé que PostgreSQL accepte.',
			'Crée septembre, octobre et novembre 2026 avec `CREATE TABLE events_p2026_09 PARTITION OF events FOR VALUES FROM (\'2026-09-01\') TO (\'2026-10-01\');` et pareil pour les deux mois suivants. Insère une ligne de décembre : `INSERT INTO events VALUES (1, 1, \'2026-12-02\', \'{}\');`.',
			'Ajoute la partition par défaut, relance le même insert, puis charge des données : `INSERT INTO events SELECT g, g % 100, timestamptz \'2026-09-01\' + (g % 91) * interval \'1 day\', \'{}\' FROM generate_series(2, 30000) g;`. Regarde où sont allées les lignes : `SELECT tableoid::regclass AS partition, count(*) FROM events GROUP BY 1 ORDER BY 1;`.',
			'Lance `EXPLAIN (COSTS OFF)` sur `SELECT * FROM events WHERE created_at >= \'2026-10-05\' AND created_at < \'2026-10-06\';` et sur `SELECT * FROM events WHERE user_id = 42;`.',
			'Retire septembre : essaie `ALTER TABLE events DETACH PARTITION events_p2026_09 CONCURRENTLY;`, puis lance-le sans `CONCURRENTLY`, puis `DROP TABLE events_p2026_09;`, et recompte par partition. Quand tu as fini : `docker rm -f part-lab`.'
		],
		done: [
			'`PRIMARY KEY (id)` échoue avec `unique constraint on partitioned table must include all partitioning columns`.',
			'L’insert de décembre échoue avec `no partition of relation "events" found for row` avant la partition par défaut, et arrive dans `events_default` après.',
			'Le plan de la requête d’octobre ne montre que `events_p2026_10`. Le plan sur `user_id` a un `Append` sur les quatre partitions.',
			'`DETACH ... CONCURRENTLY` échoue avec `cannot detach partitions concurrently when a default partition exists`, et le `DETACH` simple passe.',
			'Après la suppression, le compte par partition ne liste plus `events_p2026_09`.'
		],
		solution: [
			'`CREATE TABLE events (id bigint, user_id bigint, created_at timestamptz NOT NULL, payload jsonb, PRIMARY KEY (id, created_at)) PARTITION BY RANGE (created_at);`',
			'`CREATE TABLE events_p2026_10 PARTITION OF events FOR VALUES FROM (\'2026-10-01\') TO (\'2026-11-01\');`, pareil avec `11` et `12` pour novembre, et `CREATE TABLE events_default PARTITION OF events DEFAULT;`.',
			'`ALTER TABLE events DETACH PARTITION events_p2026_09;` puis `DROP TABLE events_p2026_09;`. Entre les deux, la table détachée est une table simple que tu peux sauvegarder avec `COPY` ou `pg_dump`.',
			'Le `DETACH` simple prend un verrou plus fort que `CONCURRENTLY`. Avec une partition par défaut en place, PostgreSQL refuse la forme concurrente, donc prévois le détachement à un moment calme.'
		]
	},
	recall: {
		q: '`events` est partitionnée par mois sur `created_at`. Comment retires-tu les lignes de plus de 90 jours, et quelles partitions partent ?',
		a: 'Tu détaches puis supprimes chaque partition dont tout l’intervalle a plus de 90 jours : `DETACH PARTITION ... CONCURRENTLY`, puis `DROP TABLE`. Une partition qui a encore des lignes récentes reste, et le vacuum n’a aucune ligne morte à nettoyer.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Table Partitioning', url: 'https://www.postgresql.org/docs/current/ddl-partitioning.html' },
		{ title: 'Source de la doc PostgreSQL, ddl.sgml : sauvegarder une partition détachée', url: `${PG}#L4658-L4680` },
		{ title: 'Doc pg_partman', url: `${PARTMAN}/doc/pg_partman.md` },
		{ title: 'pg_partman howto', url: `${PARTMAN}/doc/pg_partman_howto.md` }
	]
};
