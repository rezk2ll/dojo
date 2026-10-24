const UMAMI = 'https://github.com/umami-software/umami/blob/ec0ff50388c264ed8ce46f00967e92f7e71476ae';
const STATS = `${UMAMI}/src/queries/sql/getWebsiteStats.ts`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'group-by',
	part: 'Les données et les questions',
	title: 'Compter avec GROUP BY',
	minutes: 10,
	hook: [
		'L’équipe marketing veut quatre chiffres pour la semaine dernière : pages vues, visiteurs, visites et taux de rebond. Les données, c’est une table avec **une ligne par événement** : une page vue, un clic, une inscription.',
		'Tu pourrais charger tous les événements dans l’app et compter dans une boucle. Avec dix millions d’événements, **ça fait dix millions de lignes sur le réseau pour produire quatre chiffres**.',
		'GROUP BY laisse la base compter là où sont les données. Il replie beaucoup de lignes en une ligne par groupe, et les agrégats comme `count` et `sum` calculent les valeurs de chaque groupe. Le taux de rebond décrit une visite, alors que chaque ligne est un événement, donc **tu regroupes deux fois** : les événements en visites, puis les visites en totaux.'
	],
	terms: [
		{ term: 'Agrégat', def: 'Une fonction qui transforme beaucoup de lignes en une valeur : `count`, `sum`, `min`, `max`, `avg`. Sauf `count`, elles renvoient NULL quand aucune ligne n’arrive.' },
		{ term: 'GROUP BY', def: 'Découpe les lignes en groupes qui partagent les mêmes valeurs, puis rend une ligne par groupe. Toute autre colonne de la liste SELECT doit être dans un agrégat, sauf si elle dépend d’une clé primaire regroupée.' },
		{ term: 'HAVING', def: 'Un filtre sur les groupes, après le calcul des agrégats. WHERE filtre les lignes avant le regroupement et ne peut pas utiliser d’agrégat.' },
		{ term: 'Fonction de fenêtrage', def: 'Un calcul proche d’un agrégat, avec `OVER (...)`, qui ne replie pas les lignes : chaque ligne garde son identité et reçoit une valeur calculée à partir des lignes liées.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['events[("website_event : une ligne par événement")] -->|"WHERE website_id, période"| rows["les événements de la semaine"]'],
				highlight: ['events', 'rows'],
				note: 'D’abord, WHERE sélectionne les lignes d’un site et d’une semaine. La doc : « WHERE selects input rows before groups and aggregates are computed ». Un agrégat dans WHERE échoue avec `aggregate functions are not allowed in WHERE`.'
			},
			{
				add: ['rows -->|"GROUP BY session_id, visit_id"| visits["une ligne par visite : c = pages vues, has_custom_event"]'],
				highlight: ['visits'],
				note: 'Le regroupement par session et par visite replie les événements en une ligne par visite. Dans chaque groupe, `sum(case ... then 1 else 0 end)` compte les événements qui ne sont ni des événements personnalisés, ni des mesures de performance.'
			},
			{
				add: ['visits -->|"HAVING c > 0"| kept["visites avec au moins une vue"]'],
				highlight: ['kept'],
				note: 'Une visite faite uniquement d’événements personnalisés a `c = 0`, et HAVING écarte ce groupe entier. HAVING passe une fois les sommes connues, ce que WHERE ne peut pas faire : quand WHERE tourne, les sommes n’existent pas encore.'
			},
			{
				add: ['kept -->|"agrégat sans GROUP BY"| totals["une ligne : pageviews, visitors, visits, bounces"]'],
				highlight: ['totals'],
				note: 'La requête externe replie les visites en totaux. Elle a des agrégats mais pas de GROUP BY, donc toute l’entrée forme un seul groupe. `count(distinct session_id)` donne les visiteurs, et un rebond est une visite avec une seule vue et aucun événement personnalisé.'
			},
			{
				add: ['rows -.->|"row_number() OVER (PARTITION BY visit_id ORDER BY created_at)"| numbered["chaque événement garde sa ligne, plus son numéro d’étape"]'],
				highlight: ['numbered'],
				note: 'Pour les parcours, Umami numérote les événements de chaque visite avec `row_number()`, une fonction de fenêtrage. La doc : les fonctions de fenêtrage « do not cause rows to become grouped into a single output row ». Chaque événement reste, avec sa position dans la visite.'
			}
		]
	},
	example: {
		title: 'src/queries/sql/getWebsiteStats.ts : les chiffres du tableau de bord d’Umami en une requête PostgreSQL',
		repo: 'umami-software/umami',
		url: `${STATS}#L26-L73`,
		lang: 'typescript',
		code: `async function relationalQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<WebsiteStatsData[]> {
…
  if (!hasEventFilters) {
    return rawQuery(
      \`
      select
        cast(coalesce(sum(t.c), 0) as bigint) as "pageviews",
        count(distinct t.session_id) as "visitors",
        count(distinct t.visit_id) as "visits",
        \${excludeBounce ? '0' : 'coalesce(sum(case when t.c = 1 and t.has_custom_event = 0 then 1 else 0 end), 0)'} as "bounces",
        cast(coalesce(sum(\${getTimestampDiffSQL('t.min_time', 't.max_time')}), 0) as bigint) as "totaltime"
      from (
        select
          website_event.session_id,
          website_event.visit_id,
          sum(case when website_event.event_type NOT IN (2, 5) then 1 else 0 end) as "c",
          min(case when website_event.event_type NOT IN (2, 5) then website_event.created_at end) as "min_time",
          max(case when website_event.event_type NOT IN (2, 5) then website_event.created_at end) as "max_time",
          max(case when website_event.event_type = \${EVENT_TYPE.customEvent} then 1 else 0 end) as "has_custom_event"
        from website_event
        \${cohortQuery}
        \${excludeBounceQuery}
        \${joinSessionQuery}
        where website_event.website_id = {{websiteId::uuid}}
          and website_event.created_at between {{startDate}} and {{endDate}}
          and website_event.event_type != \${EVENT_TYPE.performance}
          \${filterQuery}
        group by 1, 2
        having sum(case when website_event.event_type NOT IN (2, 5) then 1 else 0 end) > 0
      ) as t
      \`,
      queryParams,
      FUNCTION_NAME,
    ).then(result => result?.[0]);`,
		notes: [
			'La ligne 1, `relationalQuery`, est le chemin PostgreSQL. Umami la choisit quand [`runQuery`](' + UMAMI + '/src/lib/db.ts#L37-L39) voit une URL PostgreSQL, et prend une requête ClickHouse sinon. Dans `EVENT_TYPE` (dans les sources), 2 est un événement personnalisé et 5 une mesure de performance, donc le `NOT IN (2, 5)` de la ligne 19 garde les pages vues, les clics sur liens et les pixels.',
			'La ligne 31, `group by 1, 2`, désigne le premier et le deuxième élément de la liste SELECT interne, `session_id` et `visit_id`. La doc autorise « the name or ordinal number of an output column ». La ligne 32 répète tout le `sum(case ...)` dans HAVING au lieu de l’alias `c`.',
			'La requête externe rend toujours une ligne, même pour un site sans trafic. La doc : « sum of no rows returns null, not zero as one might expect ». La ligne 10, `coalesce(sum(t.c), 0)`, remplace ce NULL par 0, alors que les `count(distinct ...)` des lignes 11 et 12 rendent déjà 0.',
			'Les lignes 20 et 21 gardent le `min` et le `max` de `created_at` de chaque visite. [`getTimestampDiffSQL`](' + UMAMI + '/src/lib/prisma.ts#L127-L129) convertit l’écart en secondes avec `extract(epoch from ...)`, et le `sum` externe de la ligne 14 additionne les visites.',
			'Pour les parcours, [`getJourney`](' + UMAMI + '/src/queries/sql/journeys/getJourney.ts#L112-L117) utilise `row_number() OVER (PARTITION BY visit_id ORDER BY website_event.created_at)`. Il groupe les événements par visite sans les replier : chaque événement reçoit son numéro d’étape dans sa visite.'
		]
	},
	tradeoff: {
		gain: [
			'La base compte là où sont les données : quatre chiffres traversent le réseau au lieu de millions de lignes.',
			'Deux niveaux de regroupement expriment des faits sur les visites (« a rebondi ») qu’aucun événement seul ne porte.',
			'Les fonctions de fenêtrage ajoutent des chiffres par groupe (rang, cumul, numéro d’étape) en gardant chaque ligne.'
		],
		cost: [
			'Chaque colonne non agrégée doit être dans GROUP BY. Sinon PostgreSQL refuse la requête : `must appear in the GROUP BY clause or be used in an aggregate function`.',
			'`count(DISTINCT ...)` coûte plus cher que `count(*)`. L’[exécuteur](https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/executor/nodeAgg.c?plain=1#L33-L39) de PostgreSQL l’écrit : « we sort the input tuples and eliminate duplicates », et « partial aggregation is not supported in these cases » (pas d’agrégation partielle).',
			'Un agrégat lit chaque ligne qui correspond, donc sur un site chargé, un tableau de bord sur un an parcourt un an d’événements. Les moteurs analytiques existent pour ça (jour 38).',
			'Trois règles des NULL s’appliquent : `count(x)` ignore les NULL, `count(*)` non, et `sum` de rien vaut NULL.'
		]
	},
	task: {
		prompt: 'Table `website_event(session_id, visit_id, event_type, created_at)`, avec `event_type` à 1 pour une page vue et 2 pour un événement personnalisé. Dans `psql`, écris : (1) les pages vues par jour ; (2) les visites de plus de 5 pages vues ; (3) la part de visites qui rebondissent ; (4) les pages vues par jour avec un cumul.',
		hint: 'Pour chacune, demande-toi ce que représente une ligne de sortie : un jour, une visite, ou toute la semaine. Pour (3), il te faut une ligne par visite avant de pouvoir compter les rebonds.',
		answer: [
			'(1) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;` Une ligne par jour.',
			'(2) `SELECT visit_id, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY visit_id HAVING count(*) > 5;` WHERE garde les pages vues, HAVING garde les grosses visites. Les inverser échoue : `aggregate functions are not allowed in WHERE`.',
			'(3) Regroupe deux fois : `SELECT avg(CASE WHEN views = 1 THEN 1.0 ELSE 0 END) FROM (SELECT visit_id, count(*) FILTER (WHERE event_type = 1) AS views FROM website_event GROUP BY visit_id) v WHERE views > 0;` La requête interne fait une ligne par visite. `FILTER` est l’écriture standard du `sum(case ...)` d’Umami.',
			'(4) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views, sum(count(*)) OVER (ORDER BY date_trunc(\'day\', created_at)) AS running FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;` La fenêtre passe après GROUP BY, donc elle additionne les comptes du jour.'
		],
		steps: [
			{
				title: 'Compte les vues par jour',
				questions: [
					{ q: 'Dans (1), que représente une ligne de sortie ?', options: ['Un événement', 'Une visite', 'Un jour', 'Toute la semaine'], answer: 2, why: 'Tu regroupes par jour, donc chaque ligne de sortie est un jour avec son compte.' },
					{ q: 'Où va `event_type = 1` ?', options: ['Dans WHERE, pour que seules les pages vues arrivent dans les groupes', 'Dans HAVING, une fois le compte connu', 'Dans ORDER BY', 'Dans `date_trunc`'], answer: 0, why: 'Il filtre des lignes, pas des groupes. WHERE « selects input rows before groups and aggregates are computed ».' },
					{ q: 'Vers quoi pointe `GROUP BY 1` ?', options: ['La première colonne de la table', 'La valeur 1, donc toutes les lignes forment un seul groupe', 'Les lignes où `event_type` vaut 1', 'Le premier élément de la liste SELECT, le jour'], answer: 3, why: 'La doc accepte « the name or ordinal number of an output column » (le nom ou le numéro d’une colonne de sortie). Umami écrit `group by 1, 2` de la même façon.' },
					{ q: 'Tu ajoutes `visit_id` à la liste SELECT de (1) sans rien changer d’autre. Que se passe-t-il ?', options: ['PostgreSQL choisit une visite par jour', 'Ça échoue : `must appear in the GROUP BY clause or be used in an aggregate function`', 'Ça rend une ligne par visite à la place', 'La colonne revient à NULL'], answer: 1, why: 'Chaque ligne de sortie est un jour, et un jour a beaucoup de visites. PostgreSQL ne devine pas laquelle tu voulais.' }
				]
			},
			{
				title: 'Garde les grosses visites',
				questions: [
					{ q: 'Dans (2), par quoi regroupes-tu ?', options: ['`visit_id`', '`event_type`', '`created_at`', 'Rien, un seul groupe suffit'], answer: 0, why: 'La question porte sur les visites, donc une ligne de sortie est une visite.' },
					{ q: 'Où va `count(*) > 5` ?', options: ['Dans WHERE', 'Dans ORDER BY', 'Dans HAVING', 'Dans la liste SELECT'], answer: 2, why: 'HAVING filtre les groupes après le calcul des agrégats.' },
					{ q: 'Tu écris `WHERE count(*) > 5` à la place. Que dit PostgreSQL ?', options: ['Il rend toutes les visites en ignorant le filtre', '`aggregate functions are not allowed in WHERE`', '`column "count" does not exist`', 'Ça marche, mais plus lentement'], answer: 1, why: 'WHERE passe avant que les groupes existent, donc il n’y a pas encore de compte à comparer.' },
					{ q: 'Pourquoi garder `event_type = 1` dans WHERE et pas dans HAVING ?', options: ['HAVING ne sait pas comparer des nombres', 'WHERE est toujours plus rapide pour n’importe quel filtre', 'HAVING n’accepte que `count`', 'C’est un test sur des lignes, et `event_type` n’est pas une colonne regroupée'], answer: 3, why: 'Les filtres sur les lignes vont dans WHERE, ceux sur les groupes dans HAVING. Dans HAVING, `event_type` demanderait un GROUP BY ou un agrégat.' }
				]
			},
			{
				title: 'Regroupe deux fois pour les rebonds',
				questions: [
					{ q: 'Pourquoi le taux de rebond demande-t-il deux niveaux de regroupement ?', options: ['Un rebond est un fait sur une visite, mais chaque ligne est un événement', 'PostgreSQL n’accepte qu’un agrégat par requête', 'HAVING a besoin d’une sous-requête pour tourner', 'On ne peut pas calculer de moyenne sur des événements'], answer: 0, why: 'Replie d’abord les événements en visites, puis les visites en une seule part.' },
					{ q: 'Que rend la requête interne ?', options: ['Une ligne par événement, avec son numéro', 'Une ligne avec le total', 'Une ligne par jour', 'Une ligne par visite, avec ses pages vues'], answer: 3, why: 'Elle regroupe par `visit_id` et compte les pages vues de chacune.' },
					{ q: 'Quel compte interne correspond au `sum(case when ... then 1 else 0 end)` d’Umami ?', options: ['`count(event_type)`', '`count(*) FILTER (WHERE event_type = 1)`', '`count(DISTINCT event_type)`', '`max(event_type = 1)`'], answer: 1, why: '`FILTER` est l’écriture standard : il ne compte que les lignes qui passent sa condition.' },
					{ q: 'Que retire le `WHERE views > 0` externe ?', options: ['Les visites d’une seule page vue', 'Les jours sans trafic', 'Les visites faites seulement d’événements personnalisés', 'Les visites des utilisateurs connectés'], answer: 2, why: 'Une visite sans page vue n’est pas une visite pour le tableau de bord. Umami la retire avec `HAVING ... > 0`.' }
				]
			},
			{
				title: 'Ajoute le cumul',
				questions: [
					{ q: 'Quel outil garde une ligne par jour et ajoute un cumul ?', options: ['Un second GROUP BY', 'Une fonction de fenêtrage avec `OVER (ORDER BY ...)`', 'HAVING avec `sum`', 'Une auto-jointure sur le jour'], answer: 1, why: 'Les fonctions de fenêtrage « do not cause rows to become grouped into a single output row ». Chaque jour garde sa ligne.' },
					{ q: 'Pourquoi (4) écrit-il `sum(count(*)) OVER (...)` ?', options: ['La fenêtre passe après GROUP BY, donc elle additionne les comptes du jour', '`count(*)` ne peut pas tourner seul avec une fenêtre', 'Il compte chaque événement deux fois exprès', 'Sans lui, les jours reviennent dans le désordre'], answer: 0, why: '`count(*)` donne son compte à chaque jour, puis le `sum` de la fenêtre additionne ces comptes dans l’ordre des jours.' },
					{ q: 'Quelle différence entre `count(*) ... GROUP BY visit_id` et `count(*) OVER (PARTITION BY visit_id)` ?', options: ['Aucune', 'Le premier est plus rapide sur toute table', 'Le second compte les visites distinctes', 'Le second garde chaque ligne d’événement, chacune avec le total de sa visite'], answer: 3, why: 'GROUP BY replie les lignes. Avec une fenêtre, « the rows retain their separate identities ».' },
					{ q: 'La semaine n’a eu aucun événement. Que rend `sum` sur zéro ligne ?', options: ['0', 'Aucune ligne', 'NULL', 'Une erreur'], answer: 2, why: 'La doc : « sum of no rows returns null, not zero as one might expect ». `count` rend 0, c’est pourquoi Umami n’entoure que les sommes de `coalesce`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu veux les sessions de plus de 10 événements en mars. Pourquoi `WHERE count(*) > 10` échoue-t-il ?',
			options: [
				'count(*) a besoin d’un nom de colonne quand on l’utilise dans un filtre',
				'WHERE passe avant que les groupes existent, donc il n’y a pas encore de compte',
				'WHERE ne compare que des colonnes, et count(*) renvoie une table entière',
				'PostgreSQL a besoin d’un ORDER BY avant de filtrer sur un compte'
			],
			answer: 1,
			why: 'WHERE « selects input rows before groups and aggregates are computed ». Garde le filtre sur mars dans WHERE et déplace le test sur le compte dans HAVING, qui porte sur les groupes.'
		},
		{
			q: 'La requête externe d’Umami lance `sum(t.c)` sur un site sans événement dans la période. Sans `coalesce`, que vaudrait `pageviews` ?',
			options: [
				'0, car sum part de zéro et n’y ajoute rien',
				'Aucune ligne, car il n’y avait aucun groupe à rendre',
				'NULL, car sum sur zéro ligne renvoie NULL, pas zéro',
				'Une erreur, car sum ne tourne pas sur une sous-requête vide'
			],
			answer: 2,
			why: 'Un agrégat sans GROUP BY rend toujours une ligne, et la doc prévient que « sum of no rows returns null, not zero as one might expect ». `count` est l’exception et rend 0, c’est pourquoi seules les sommes sont entourées de `coalesce`.'
		},
		{
			q: 'Quelle différence entre `count(*) ... GROUP BY visit_id` et `count(*) OVER (PARTITION BY visit_id)` ?',
			options: [
				'Le premier rend une ligne par visite, le second garde chaque ligne d’événement',
				'Le premier compte des lignes, le second ne compte que les visit_id distincts',
				'Le premier passe après ORDER BY, le second passe avant WHERE',
				'Aucune : OVER n’est qu’une autre façon d’écrire GROUP BY'
			],
			answer: 0,
			why: 'GROUP BY replie les lignes de chaque visite en une seule. Une fonction de fenêtrage calcule le même compte, mais « the rows retain their separate identities », donc chaque ligne d’événement porte le total de sa visite.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Calculer un petit tableau de bord d’audience en SQL : les vues par jour, les grosses visites, le taux de rebond et un cumul.',
		steps: [
			'Lance un PostgreSQL jetable : `docker run -d --name pg-group -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-group psql -U postgres`.',
			'Crée la table : `CREATE TABLE website_event (session_id int, visit_id int, event_type int, created_at timestamptz);`',
			'Ajoute 40 visites de 0 à 7 pages vues chacune, sur trois jours : `INSERT INTO website_event SELECT v / 2, v, 1, timestamptz \'2024-03-01\' + (v % 3) * interval \'1 day\' + n * interval \'1 minute\' FROM generate_series(1, 40) v, generate_series(1, 7) n WHERE n <= v % 8;`. Puis un événement personnalisé une visite sur cinq : `INSERT INTO website_event SELECT v / 2, v, 2, timestamptz \'2024-03-01\' + (v % 3) * interval \'1 day\' FROM generate_series(5, 40, 5) v;`',
			'Écris les quatre requêtes de l’exercice une par une. Pour (2), essaie d’abord `WHERE count(*) > 5` et lis l’erreur.',
			'Vérifie le cas vide : `SELECT sum(x) FROM (SELECT 1 AS x WHERE false) t;` et `SELECT count(*) FROM website_event WHERE event_type = 9;`. Quitte avec `\\q` et nettoie avec `docker rm -f pg-group`.'
		],
		done: [
			'(1) rend trois jours avec 49, 47 et 44 vues.',
			'`WHERE count(*) > 5` échoue avec `aggregate functions are not allowed in WHERE`, et la version HAVING rend 10 visites.',
			'(3) rend environ `0.1428` : 5 visites d’une seule page vue sur 35 qui ont une page vue. Avec la règle d’Umami (aucun événement personnalisé non plus), on tombe à environ `0.1143`.',
			'(4) affiche un cumul de 49, 96, puis 140.',
			'La `sum` vide affiche une case vide (NULL), le `count` vide affiche `0`.'
		],
		solution: [
			'(1) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;`',
			'(2) `SELECT visit_id, count(*) AS views FROM website_event WHERE event_type = 1 GROUP BY visit_id HAVING count(*) > 5;`',
			'(3) `SELECT avg(CASE WHEN views = 1 THEN 1.0 ELSE 0 END) FROM (SELECT visit_id, count(*) FILTER (WHERE event_type = 1) AS views FROM website_event GROUP BY visit_id) v WHERE views > 0;`. La visite 40 n’a qu’un événement personnalisé, donc le WHERE externe la retire.',
			'Pour Umami, un rebond n’a pas non plus d’événement personnalisé, et la visite 25 a une page vue plus un événement personnalisé. Ajoute `max(CASE WHEN event_type = 2 THEN 1 ELSE 0 END) AS custom` à la requête interne et `AND custom = 0` au CASE : 4 rebonds sur 35.',
			'(4) `SELECT date_trunc(\'day\', created_at) AS day, count(*) AS views, sum(count(*)) OVER (ORDER BY date_trunc(\'day\', created_at)) AS running FROM website_event WHERE event_type = 1 GROUP BY 1 ORDER BY 1;`'
		]
	},
	recall: {
		q: 'Pourquoi le compte des rebonds d’Umami demande-t-il deux niveaux de regroupement, et quelle clause écarte les visites sans page vue ?',
		a: 'Un rebond décrit une visite : une seule vue et aucun événement personnalisé. La requête interne regroupe les événements par `session_id, visit_id`, et `HAVING sum(...) > 0` écarte les visites sans vue. La requête externe compte ensuite les rebonds sur ces visites.'
	},
	sources: [
		{ title: 'Umami, src/lib/constants.ts (EVENT_TYPE)', url: `${UMAMI}/src/lib/constants.ts#L119-L125` },
		{ title: 'Doc PostgreSQL, GROUP BY and HAVING Clauses', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUP' },
		{ title: 'Tutoriel PostgreSQL, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/tutorial-agg.html' },
		{ title: 'Doc PostgreSQL, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'Tutoriel PostgreSQL, Window Functions', url: 'https://www.postgresql.org/docs/current/tutorial-window.html' },
		{ title: 'Doc PostgreSQL, Aggregate Expressions (FILTER)', url: 'https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES' }
	]
};
