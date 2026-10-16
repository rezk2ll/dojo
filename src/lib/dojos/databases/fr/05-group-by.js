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
		'GROUP BY laisse la base compter là où vivent les données. **Il replie beaucoup de lignes en une ligne par groupe**, et les agrégats comme `count` et `sum` disent à quoi chaque groupe correspond. Le piège, c’est le taux de rebond : c’est un fait sur une visite, pas sur un événement, donc **tu regroupes deux fois**.'
	],
	terms: [
		{ term: 'Agrégat', def: 'Une fonction qui transforme beaucoup de lignes en une valeur : `count`, `sum`, `min`, `max`, `avg`. Sauf `count`, elles renvoient NULL quand aucune ligne n’arrive.' },
		{ term: 'GROUP BY', def: 'Découpe les lignes en groupes qui partagent les mêmes valeurs, puis rend une ligne par groupe. Toute autre colonne de la liste SELECT doit être dans un agrégat, sauf si elle dépend d’une clé primaire regroupée.' },
		{ term: 'HAVING', def: 'Un filtre sur les groupes, après le calcul des agrégats. WHERE filtre les lignes avant le regroupement et ne peut pas utiliser d’agrégat.' },
		{ term: 'count(DISTINCT x)', def: 'Compte les valeurs différentes de `x` dans un groupe, pas les lignes. Les visiteurs sont des identifiants de session distincts, pas des événements.' },
		{ term: 'Fonction de fenêtrage', def: 'Un calcul proche d’un agrégat, avec `OVER (...)`, qui ne replie pas les lignes : chaque ligne garde son identité et reçoit une valeur calculée à partir des lignes liées.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['events[("website_event : une ligne par événement")] -->|"WHERE website_id, période"| rows["les événements de la semaine"]'],
				highlight: ['events', 'rows'],
				note: '**WHERE choisit l’entrée.** D’abord, on sélectionne les lignes d’un site et d’une semaine. La doc : « WHERE selects input rows before groups and aggregates are computed ». Un agrégat dans WHERE échoue avec `aggregate functions are not allowed in WHERE`.'
			},
			{
				add: ['rows -->|"GROUP BY session_id, visit_id"| visits["une ligne par visite : c = pages vues, has_custom_event"]'],
				highlight: ['visits'],
				note: '**Premier repli : des événements aux visites.** Regrouper par session et par visite donne une ligne par visite. Dans chaque groupe, `sum(case ... then 1 else 0 end)` compte les événements qui ne sont ni des événements personnalisés, ni des mesures de performance.'
			},
			{
				add: ['visits -->|"HAVING c > 0"| kept["visites avec au moins une vue"]'],
				highlight: ['kept'],
				note: '**HAVING écarte des groupes entiers.** Une visite faite uniquement d’événements personnalisés a `c = 0`. HAVING la retire une fois les sommes connues, ce que WHERE ne peut pas faire : quand WHERE tourne, les sommes n’existent pas encore.'
			},
			{
				add: ['kept -->|"agrégat sans GROUP BY"| totals["une ligne : pageviews, visitors, visits, bounces"]'],
				highlight: ['totals'],
				note: '**Second repli : des visites aux totaux.** La requête externe a des agrégats mais pas de GROUP BY, donc toute l’entrée forme un seul groupe. `count(distinct session_id)` donne les visiteurs, et un rebond est une visite avec une seule vue et aucun événement personnalisé.'
			},
			{
				add: ['rows -.->|"row_number() OVER (PARTITION BY visit_id ORDER BY created_at)"| numbered["chaque événement garde sa ligne, plus son numéro d’étape"]'],
				highlight: ['numbered'],
				note: '**Une fenêtre ne replie pas.** Pour les parcours, Umami numérote les événements de chaque visite avec `row_number()`. La doc : les fonctions de fenêtrage « do not cause rows to become grouped into a single output row ». Chaque événement reste, avec sa position dans la visite.'
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
			'**C’est le chemin PostgreSQL.** Umami choisit `relationalQuery` quand [`runQuery`](' + UMAMI + '/src/lib/db.ts#L37-L39) voit une URL PostgreSQL, et une requête ClickHouse sinon. Les types d’événements viennent de [`EVENT_TYPE`](' + UMAMI + '/src/lib/constants.ts#L119-L125) : 2 est un événement personnalisé et 5 une mesure de performance, donc `NOT IN (2, 5)` garde les pages vues, les clics sur liens et les pixels.',
			'**`group by 1, 2` utilise des positions.** Les nombres désignent le premier et le deuxième élément de la liste SELECT, `session_id` et `visit_id`. La doc autorise « the name or ordinal number of an output column ». La clause HAVING répète tout le `sum(case ...)` au lieu de l’alias `c`.',
			'**`coalesce` parce que sum peut valoir NULL.** La requête externe rend toujours une ligne, même pour un site sans trafic. La doc : « sum of no rows returns null, not zero as one might expect ». `coalesce(sum(t.c), 0)` en fait 0, alors que `count(distinct ...)` rend déjà 0.',
			'**Le temps passé, à partir de deux agrégats.** Chaque visite garde le `min` et le `max` de `created_at`. [`getTimestampDiffSQL`](' + UMAMI + '/src/lib/prisma.ts#L127-L129) convertit l’écart en secondes avec `extract(epoch from ...)`, et le `sum` externe additionne les visites.',
			'**Une fenêtre pour les parcours.** [`getJourney`](' + UMAMI + '/src/queries/sql/journeys/getJourney.ts#L112-L117) utilise `row_number() OVER (PARTITION BY visit_id ORDER BY website_event.created_at)`. Même idée de groupe, mais sans repli : chaque événement reçoit son numéro d’étape dans sa visite.'
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
			'Les agrégats lisent chaque ligne qui correspond. Sur un site chargé, un tableau de bord sur un an parcourt un an d’événements. Les moteurs analytiques existent pour ça (jour 38).',
			'Les règles des NULL s’oublient vite : `count(x)` ignore les NULL, `count(*)` non, et `sum` de rien vaut NULL.'
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
	takeaway: 'GROUP BY replie les lignes en une ligne par groupe et HAVING filtre ces groupes ; quand un fait appartient à une visite et pas à un événement, regroupe d’abord par visite, puis agrège encore.',
	sources: [
		{ title: 'Doc PostgreSQL, GROUP BY and HAVING Clauses', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUP' },
		{ title: 'Tutoriel PostgreSQL, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/tutorial-agg.html' },
		{ title: 'Doc PostgreSQL, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'Tutoriel PostgreSQL, Window Functions', url: 'https://www.postgresql.org/docs/current/tutorial-window.html' },
		{ title: 'Doc PostgreSQL, Aggregate Expressions (FILTER)', url: 'https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES' }
	]
};
