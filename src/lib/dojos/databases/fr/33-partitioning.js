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
