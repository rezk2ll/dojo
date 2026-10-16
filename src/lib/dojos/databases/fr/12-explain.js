const GL = 'https://github.com/gitlabhq/gitlabhq/blob/28f70ed3725bbc2bb6cbfa635ab6dd9bfa57af9a';
const DOC = `${GL}/doc/development/database/understanding_explain_plans.md?plain=1`;
const PG = 'https://github.com/postgres/postgres/blob/92d47d544bf64274b6a7aa8775f7b35bcf71f339/doc/src/sgml';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'explain',
	part: 'Dans le moteur',
	title: 'Lire EXPLAIN',
	minutes: 10,
	hook: [
		'Une page qui compte des utilisateurs met 1,2 seconde. Quelqu’un ajoute un index. Elle met maintenant 300 ms. C’est mieux, mais toujours lent, et personne ne sait dire pourquoi.',
		'D’habitude, on devine : un autre index, un plus gros serveur, un cache. **`EXPLAIN` met fin aux devinettes.** Il affiche le plan que PostgreSQL a choisi : quels parcours, dans quel ordre, combien de lignes il attendait et, avec `ANALYZE`, combien il en a vraiment eu et combien de pages il a touchées.',
		'Aujourd’hui : lire un plan de l’intérieur vers l’extérieur, distinguer l’**estimé** du **réel**, et se fier aux **buffers** (les pages lues), le chiffre qui ne ment pas. Les plans viennent du guide base de données de GitLab.'
	],
	terms: [
		{ term: 'Nœud de plan', def: 'Une étape du plan : un parcours, une jointure, un tri, un agrégat. Les nœuds forment un arbre. Les plus internes tournent d’abord et remontent leurs lignes à leur parent.' },
		{ term: 'Coût', def: '`cost=startup..total`, en unités arbitraires où lire une page dans l’ordre vaut 1.0 par défaut. Startup, c’est le travail avant la première ligne, total celui pour les rendre toutes. Le coût d’un parent inclut celui de ses enfants.' },
		{ term: 'rows (estimé)', def: 'Le nombre de lignes que le planificateur pense voir sortir du nœud, après son filtre. Pas le nombre qu’il lit.' },
		{ term: 'EXPLAIN ANALYZE', def: 'Exécute vraiment la requête et affiche, à côté de chaque estimation, le temps réel en millisecondes, les lignes réelles et les boucles. Ça exécute pour de vrai : un UPDATE met vraiment à jour.' },
		{ term: 'loops', def: 'Le nombre de fois où le nœud a tourné. Le temps et les lignes réels sont des moyennes par boucle : multiplie par loops pour avoir le total.' },
		{ term: 'Buffers', def: 'Les pages de 8 kB touchées par le nœud : `hit` dans le cache de PostgreSQL, `read` depuis l’OS ou le disque. Inclus par défaut avec ANALYZE depuis PostgreSQL 18.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['scan["Seq Scan sur users"] -->|"les lignes remontent"| agg["Aggregate : count(*)"]'],
				highlight: ['scan', 'agg'],
				note: '**Lis de l’intérieur vers l’extérieur.** Le nœud le plus indenté tourne en premier. Ici, un parcours séquentiel lit `users` et passe ses lignes à un agrégat qui les compte. Le guide de GitLab compare un plan à des « nested function calls, returning their results as they unwind » (des appels de fonctions imbriqués qui rendent leur résultat en remontant).'
			},
			{
				add: ['est["Estimé : cost=0.00..844969.99 rows=56087"] -.-> scan'],
				highlight: ['est'],
				note: '**L’estimation, c’est ce que croyait le planificateur.** Le coût est en unités du planificateur, pas en millisecondes. `rows=56087`, c’est le nombre de lignes qu’il pensait voir **sortir** du parcours après le filtre. Un `EXPLAIN` seul s’arrête là : il n’exécute rien.'
			},
			{
				add: ['act["Réel : rows=51833 loops=1, 1265 ms"] -.-> scan'],
				highlight: ['act'],
				note: '**ANALYZE ajoute ce qui s’est vraiment passé.** 51 833 lignes pour 56 087 attendues : une bonne estimation. La doc de PostgreSQL dit que la première chose à regarder est « whether the estimated row counts are reasonably close to reality » (si les lignes estimées sont proches de la réalité). Quand elles sont loin, le planificateur a choisi un plan pour le mauvais nombre de lignes (jour 13).'
			},
			{
				add: ['filt["Rows Removed by Filter : 2487813"] -.-> scan'],
				highlight: ['filt'],
				note: '**La ligne du filtre montre le gaspillage.** Pour sortir 51 833 lignes, le parcours en a lu environ 2,5 millions et en a jeté 98 %. Un gros « Rows Removed » sous un parcours qui rend peu de lignes, c’est le signe classique qu’un index pourrait aider.'
			},
			{
				add: ['buf["Buffers : shared hit=202662, environ 1,6 GB de pages"] -.-> agg'],
				highlight: ['buf'],
				note: '**Les buffers comptent le travail.** Chaque buffer est une page de 8 kB, donc 202 662 buffers font environ 1,6 GB touchés pour compter 51 833 lignes. Le temps dépend de ce qui est en cache, les buffers non. Les buffers d’un parent incluent ceux de ses enfants.'
			}
		]
	},
	example: {
		title: 'doc/development/database/understanding_explain_plans.md : une requête, deux plans',
		repo: 'gitlabhq/gitlabhq',
		url: `${DOC}#L312-L393`,
		lang: 'sql',
		code: `EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM users
WHERE twitter != '';
…
Aggregate  (cost=845110.21..845110.22 rows=1 width=8) (actual time=1271.157..1271.158 rows=1 loops=1)
  Buffers: shared hit=202662
  ->  Seq Scan on users  (cost=0.00..844969.99 rows=56087 width=0) (actual time=0.019..1265.883 rows=51833 loops=1)
        Filter: ((twitter)::text <> ''::text)
        Rows Removed by Filter: 2487813
        Buffers: shared hit=202662
Planning time: 0.390 ms
Execution time: 1271.180 ms
…
CREATE INDEX CONCURRENTLY twitter_test ON users (twitter);
…
Aggregate  (cost=61002.82..61002.83 rows=1 width=8) (actual time=297.311..297.312 rows=1 loops=1)
  Buffers: shared hit=51854 dirtied=19
  ->  Index Only Scan using twitter_test on users  (cost=0.43..60873.13 rows=51877 width=0) (actual time=279.184..293.532 rows=51833 loops=1)
        Filter: ((twitter)::text <> ''::text)
        Rows Removed by Filter: 2487830
        Heap Fetches: 26037
        Buffers: shared hit=51854 dirtied=19
Planning time: 0.191 ms
Execution time: 297.334 ms`,
		notes: [
			'**L’index a aidé, mais le filtre est toujours là.** Le second plan lit l’index au lieu de la table, et pourtant `Rows Removed by Filter` vaut encore environ 2,5 millions. L’index contient toutes les valeurs de `twitter`, chaînes vides comprises, donc le parcours les traverse toutes et jette les vides. GitLab règle ça avec un index partiel, c’est le jour 14.',
			'**Un index-only scan peut quand même aller dans la table.** Le guide note que [dans certains cas](' + DOC + '#L240-L244) « an index only scan might still fetch data from the table » (il va quand même chercher des données dans la table), et le nœud affiche alors `Heap Fetches`. Ici, 26 037 lignes ont demandé un aller-retour vers la table.',
			'**Compare les buffers, pas les millisecondes.** Le conseil de GitLab : le temps [« can be too volatile to be used for comparison »](' + DOC + '#L461-L467) (trop instable pour comparer), donc « look at the number of buffers used (read and hit), and work on reducing these numbers ». 202 662 buffers sont devenus 51 854 : c’est ça, le vrai gain, quoi qu’ait fait le cache.',
			'**Un parcours séquentiel est parfois le bon choix.** Le même guide compte les projets avec `visibility_level IN (0, 20)`, soit [98 % de la table](' + DOC + '#L540-L542) : « there isn\'t really much we can do to improve this query, other than _not_ running it at all » (on ne peut guère faire mieux que ne pas la lancer). Le planificateur lit toute la table parce qu’il doit en rendre presque tout.',
			'**ANALYZE exécute l’instruction.** La référence d’`EXPLAIN` prévient que [« the statement is actually executed »](' + PG + '/ref/explain.sgml#L90-L104) et que ses effets de bord ont lieu. Entoure l’`EXPLAIN ANALYZE` d’un UPDATE ou d’un DELETE avec `BEGIN` et `ROLLBACK`.'
		]
	},
	tradeoff: {
		gain: [
			'Tu vois le plan que la base a choisi au lieu de deviner : quel index, quelle jointure, où les lignes sont jetées.',
			'Les lignes estimées à côté des lignes réelles te disent si le planificateur a été trompé, ce qu’aucun matériel ne corrige.',
			'Les buffers donnent un chiffre que tu peux comparer entre deux exécutions, deux index ou deux serveurs, sans le bruit du cache.'
		],
		cost: [
			'`EXPLAIN ANALYZE` exécute la requête : une requête lente reste lente, et une écriture écrit vraiment si tu ne fais pas de rollback.',
			'Chronométrer chaque nœud a un prix. La doc prévient que « the measurement overhead added by EXPLAIN ANALYZE can be significant » (le surcoût de mesure peut être important) sur les machines où lire l’horloge est lent. Utilise `TIMING OFF` quand seuls les lignes et les buffers t’intéressent.',
			'Les plans dépendent des données et des statistiques. La doc prévient que « results on a toy-sized table cannot be assumed to apply to large tables » (une table jouet ne dit rien d’une grosse). C’est pour ça que les équipes de GitLab tirent leurs plans d’un clone de la base de production.'
		]
	},
	task: {
		prompt: 'Dans `psql`, crée `orders(id bigint generated always as identity primary key, customer_id int not null, status text not null, total numeric not null)` avec 1 million de lignes : `customer_id` au hasard entre 0 et 20 000, `status` à `\'paid\'` 95 % du temps et `\'refunded\'` sinon. Lance `VACUUM ANALYZE orders`. Puis `EXPLAIN ANALYZE SELECT count(*) FROM orders WHERE customer_id = 42`. Lis le plan. Ajoute un index sur `customer_id` et relis-le. Enfin, indexe `status` et lance l’explain de `sum(total)` pour `\'paid\'` puis pour `\'refunded\'`.',
		hint: 'Regarde `loops` sur le nœud de parcours avant de lire ses `rows`. Compare la ligne `Buffers` du nœud du haut d’un plan à l’autre.',
		answer: [
			'Sans index (PostgreSQL 18, 2 workers) : `Parallel Seq Scan on orders ... rows=16.33 loops=3`, `Rows Removed by Filter: 333317`, `Buffers: shared hit=6434`. Les lignes sont des moyennes par boucle : 16,33 × 3 fait environ 49 lignes trouvées, sur un million lues. Les 6 434 buffers, c’est toute la table.',
			'Avec l’index : `Index Only Scan using orders_customer_id_idx ... rows=49.00 loops=1`, `Heap Fetches: 0`, `Buffers: shared hit=1 read=3`. De 6 434 pages à 4. Les heap fetches sont à 0 parce que `VACUUM` vient de marquer chaque page comme visible pour tous.',
			'`status = \'paid\'` garde un Parallel Seq Scan même avec l’index : la condition touche environ 95 % des lignes, donc lire la table dans l’ordre coûte moins cher que sauter par l’index pour chacune.',
			'`status = \'refunded\'` (environ 5 %) passe à `Index Scan using orders_status_idx`. Même index, même colonne : le planificateur a choisi selon le nombre de lignes estimé, et c’est le sujet du jour 13.'
		]
	},
	quiz: [
		{
			q: 'Un plan affiche `Index Scan ... (actual time=0.003..0.003 rows=1 loops=36)`. Combien de lignes ce nœud a-t-il rendues au total ?',
			options: [
				'Une ligne, parce que la valeur rows est le total du nœud',
				'36 lignes : rows est une moyenne par boucle, donc 1 fois 36 boucles',
				'0,003 ligne par milliseconde, trop peu pour être comptée',
				'Impossible à savoir sans activer l’option BUFFERS'
			],
			answer: 1,
			why: 'Pour un nœud qui tourne plusieurs fois, le temps et les lignes réels sont des moyennes par exécution. Multiplie par `loops` pour avoir le total. C’est typique du côté interne d’une boucle imbriquée, qui tourne une fois par ligne externe.'
		},
		{
			q: 'Une requête est lente. Le plan affiche `Seq Scan ... rows=5746969`, `Rows Removed by Filter: 65677`. Qu’est-ce que ça suggère ?',
			options: [
				'Un index sur la colonne filtrée la rendrait rapide, parce qu’un parcours séquentiel est toujours le chemin lent',
				'Le planificateur s’est trompé, parce qu’il ne devrait jamais parcourir une table de plus d’un million de lignes',
				'La requête rend presque toute la table, donc un index n’aiderait pas et le parcours est le bon choix',
				'La table a besoin d’un VACUUM, parce que les lignes retirées sont des lignes mortes que le filtre a sautées'
			],
			answer: 2,
			why: 'Le parcours sort 5,7 millions de lignes et n’en jette que 65 677 : il rend environ 99 % de ce qu’il lit. Un index ne peut pas éviter de lire des lignes qu’il faut rendre. Le guide de GitLab dit que la seule solution pour cette requête est de ne pas la lancer.'
		},
		{
			q: 'Tu compares deux versions d’une requête. La version B a été plus rapide, mais son plan montre plus de buffers que la version A. À quoi te fier ?',
			options: [
				'Au temps, parce que l’utilisateur ne sent que les millisecondes et que les buffers sont un détail',
				'Aux buffers, parce que le temps de B peut venir d’un cache chaud, pas d’un travail plus petit',
				'À rien, parce que les chiffres d’EXPLAIN ANALYZE sont des estimations qui changent à chaque fois',
				'Au coût, parce qu’il est dans la même unité que le temps et inclut aussi les buffers'
			],
			answer: 1,
			why: 'Le temps bouge avec l’état du cache et la charge. Les buffers comptent les pages que la requête a dû toucher, c’est-à-dire le travail lui-même. Le coût est en unités du planificateur, pas en millisecondes, et les chiffres d’ANALYZE sont mesurés, pas estimés.'
		}
	],
	takeaway: 'Lis le plan de l’intérieur vers l’extérieur, compare les lignes estimées aux lignes réelles, multiplie par loops, et juge un changement aux buffers qu’il touche, pas aux millisecondes d’une exécution.',
	sources: [
		{ title: 'Doc PostgreSQL 18, Using EXPLAIN', url: 'https://www.postgresql.org/docs/18/using-explain.html' },
		{ title: 'Doc PostgreSQL 18, EXPLAIN', url: 'https://www.postgresql.org/docs/18/sql-explain.html' },
		{ title: 'Doc GitLab, Understanding EXPLAIN plans', url: 'https://docs.gitlab.com/development/database/understanding_explain_plans/' }
	]
};
