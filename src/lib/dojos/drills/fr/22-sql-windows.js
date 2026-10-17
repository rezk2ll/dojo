/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-windows',
	part: 'SQL',
	title: 'Les fonctions de fenêtrage',
	minutes: 10,
	hook: [
		'La responsable des ventes veut un rapport hebdomadaire : chaque commande avec son rang, le cumul de sa région et l’écart avec la commande d’avant. Un `GROUP BY region` rend une ligne par région et perd les commandes. Une fonction de fenêtrage calcule sur un groupe de lignes et rend quand même chaque commande.',
		'La base est PostgreSQL. La table est `orders (id int PRIMARY KEY, region text, day date, amount int)`, avec 6 lignes. Dans `north` : id 1 le `2026-10-01` pour 100, id 2 le `2026-10-02` pour 250, id 3 le `2026-10-03` pour 250. Dans `south` : id 4 le `2026-10-01` pour 80, id 5 le `2026-10-02` pour 300, id 6 le `2026-10-03` pour 120.'
	],
	terms: [
		{ term: 'OVER', def: 'La clause placée juste après une fonction, qui en fait une fonction de fenêtrage. À l’intérieur, PARTITION BY et ORDER BY disent quelles lignes la fonction voit et dans quel ordre.' },
		{ term: 'partition', def: 'Le groupe des lignes qui ont la même valeur de PARTITION BY, ici une par région. Sans PARTITION BY, tout le résultat forme une seule partition.' },
		{ term: 'pair', def: 'Une ligne qui a la même valeur d’ORDER BY que la ligne courante, comme les ids 2 et 3 à 250 chacun.' }
	],
	reps: [
		{
			prompt: 'Numérote les commandes `north` par `day`, la plus ancienne d’abord. Renvoie `id` et le numéro sous le nom `n`.',
			accept: [
				"SELECT id, ROW_NUMBER() OVER (ORDER BY day) AS n FROM orders WHERE region = 'north'",
				"SELECT id, row_number() OVER (ORDER BY day) AS n FROM orders WHERE region = 'north'",
				"select id, row_number() over (order by day) as n from orders where region = 'north'",
				"SELECT id, ROW_NUMBER() OVER (ORDER BY day) n FROM orders WHERE region = 'north'",
				"select id, row_number() over (order by day) n from orders where region = 'north'",
				"SELECT id, ROW_NUMBER() OVER(ORDER BY day) AS n FROM orders WHERE region = 'north'",
				"select id, row_number() over(order by day) as n from orders where region = 'north'"
			],
			why: '`ROW_NUMBER()` compte les lignes à partir de 1, dans l’ordre donné par `OVER (ORDER BY day)`. Le `WHERE` passe avant : la fonction ne voit que les 3 lignes `north` et les numérote de 1 à 3.'
		},
		{
			prompt: 'Numérote les commandes par `day` dans chaque région, en repartant de 1 pour chaque région. Renvoie `id`, `region` et le numéro sous le nom `n`.',
			accept: [
				'SELECT id, region, ROW_NUMBER() OVER (PARTITION BY region ORDER BY day) AS n FROM orders',
				'SELECT id, region, row_number() OVER (PARTITION BY region ORDER BY day) AS n FROM orders',
				'select id, region, row_number() over (partition by region order by day) as n from orders',
				'SELECT id, region, ROW_NUMBER() OVER (PARTITION BY region ORDER BY day) n FROM orders',
				'select id, region, row_number() over (partition by region order by day) n from orders',
				'SELECT id, region, ROW_NUMBER() OVER(PARTITION BY region ORDER BY day) AS n FROM orders',
				'select id, region, row_number() over(partition by region order by day) as n from orders'
			],
			why: '`PARTITION BY region` coupe les lignes en une partition `north` et une partition `south`. La numérotation repart dans chacune : les ids 1 et 4 reçoivent tous les deux 1.'
		},
		{
			prompt: 'Classe toutes les commandes par `amount`, la plus grosse d’abord, avec le même rang pour deux montants égaux. Renvoie `id`, `amount` et le rang sous le nom `r`.',
			accept: [
				'SELECT id, amount, RANK() OVER (ORDER BY amount DESC) AS r FROM orders',
				'SELECT id, amount, rank() OVER (ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, rank() over (order by amount desc) as r from orders',
				'SELECT id, amount, RANK() OVER (ORDER BY amount DESC) r FROM orders',
				'select id, amount, rank() over (order by amount desc) r from orders',
				'SELECT id, amount, RANK() OVER(ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, rank() over(order by amount desc) as r from orders'
			],
			why: 'Les ids 2 et 3 sont pairs à 250 et prennent tous les deux le rang 2. `RANK()` saute ensuite le 3 : l’id 6, à 120, prend le rang 4. `ROW_NUMBER()` donnerait 2 et 3 aux deux commandes à 250, dans un ordre non garanti.'
		},
		{
			prompt: 'Classe les commandes par `amount`, la plus grosse d’abord, sans trou après une égalité : 300 a le rang 1, 250 le rang 2, 120 le rang 3. Renvoie `id`, `amount` et le rang sous le nom `r`.',
			accept: [
				'SELECT id, amount, DENSE_RANK() OVER (ORDER BY amount DESC) AS r FROM orders',
				'SELECT id, amount, dense_rank() OVER (ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, dense_rank() over (order by amount desc) as r from orders',
				'SELECT id, amount, DENSE_RANK() OVER (ORDER BY amount DESC) r FROM orders',
				'select id, amount, dense_rank() over (order by amount desc) r from orders',
				'SELECT id, amount, DENSE_RANK() OVER(ORDER BY amount DESC) AS r FROM orders',
				'select id, amount, dense_rank() over(order by amount desc) as r from orders'
			],
			why: '`DENSE_RANK()` compte les groupes de pairs : le rang qui suit les deux commandes à 250 est 3. La plus petite commande, l’id 4 à 80, prend 5 ici et 6 avec `RANK()`.'
		},
		{
			prompt: 'Affiche le cumul de `amount` dans chaque région, par `day`. Renvoie `id`, `region`, `day` et le cumul sous le nom `running`.',
			accept: [
				'SELECT id, region, day, SUM(amount) OVER (PARTITION BY region ORDER BY day) AS running FROM orders',
				'SELECT id, region, day, sum(amount) OVER (PARTITION BY region ORDER BY day) AS running FROM orders',
				'select id, region, day, sum(amount) over (partition by region order by day) as running from orders',
				'SELECT id, region, day, SUM(amount) OVER (PARTITION BY region ORDER BY day) running FROM orders',
				'select id, region, day, sum(amount) over (partition by region order by day) running from orders',
				'SELECT id, region, day, SUM(amount) OVER(PARTITION BY region ORDER BY day) AS running FROM orders',
				'select id, region, day, sum(amount) over(partition by region order by day) as running from orders'
			],
			why: 'Avec un `ORDER BY` dans `OVER`, `SUM` additionne les lignes du début de la partition jusqu’à la ligne courante et ses pairs. `north` donne 100, 350, 600 et `south` donne 80, 380, 500.'
		},
		{
			prompt: 'À côté de chaque commande, affiche le total de `amount` de sa région, en gardant une ligne par commande. Renvoie `id`, `region` et le total sous le nom `region_total`.',
			accept: [
				'SELECT id, region, SUM(amount) OVER (PARTITION BY region) AS region_total FROM orders',
				'SELECT id, region, sum(amount) OVER (PARTITION BY region) AS region_total FROM orders',
				'select id, region, sum(amount) over (partition by region) as region_total from orders',
				'SELECT id, region, SUM(amount) OVER (PARTITION BY region) region_total FROM orders',
				'select id, region, sum(amount) over (partition by region) region_total from orders',
				'SELECT id, region, SUM(amount) OVER(PARTITION BY region) AS region_total FROM orders',
				'select id, region, sum(amount) over(partition by region) as region_total from orders'
			],
			why: 'Sans `ORDER BY` dans `OVER`, `SUM` additionne toutes les lignes de la partition. Les 3 lignes `north` affichent 600, les 3 lignes `south` affichent 500, et la requête rend toujours 6 lignes.'
		},
		{
			prompt: 'Pour chaque commande, affiche le montant de la commande précédente dans la même région, par `day`. Renvoie `id`, `amount` et ce montant sous le nom `prev`.',
			accept: [
				'SELECT id, amount, LAG(amount) OVER (PARTITION BY region ORDER BY day) AS prev FROM orders',
				'SELECT id, amount, lag(amount) OVER (PARTITION BY region ORDER BY day) AS prev FROM orders',
				'select id, amount, lag(amount) over (partition by region order by day) as prev from orders',
				'SELECT id, amount, LAG(amount) OVER (PARTITION BY region ORDER BY day) prev FROM orders',
				'select id, amount, lag(amount) over (partition by region order by day) prev from orders',
				'SELECT id, amount, LAG(amount) OVER(PARTITION BY region ORDER BY day) AS prev FROM orders',
				'select id, amount, lag(amount) over(partition by region order by day) as prev from orders'
			],
			why: '`LAG(amount)` lit `amount` sur la ligne située 1 position plus tôt dans la partition. La première commande de chaque région n’a pas de ligne avant elle : les ids 1 et 4 reçoivent NULL.'
		},
		{
			prompt: 'Affiche de combien chaque commande monte ou baisse par rapport à la commande précédente de la même région, par `day`. Renvoie `id` et l’écart sous le nom `diff`.',
			accept: [
				'SELECT id, amount - LAG(amount) OVER (PARTITION BY region ORDER BY day) AS diff FROM orders',
				'SELECT id, amount - lag(amount) OVER (PARTITION BY region ORDER BY day) AS diff FROM orders',
				'select id, amount - lag(amount) over (partition by region order by day) as diff from orders',
				'SELECT id, amount - LAG(amount) OVER (PARTITION BY region ORDER BY day) diff FROM orders',
				'select id, amount - lag(amount) over (partition by region order by day) diff from orders',
				'SELECT id, amount - LAG(amount) OVER(PARTITION BY region ORDER BY day) AS diff FROM orders',
				'select id, amount - lag(amount) over(partition by region order by day) as diff from orders'
			],
			why: 'La fonction de fenêtrage se place dans une expression ordinaire : `amount - LAG(...)`. L’id 5 donne 300 - 80 = 220 et l’id 6 donne 120 - 300 = -180. Les ids 1 et 4 donnent NULL, car un nombre moins NULL vaut NULL.'
		},
		{
			prompt: 'Renvoie `id` et `amount` des 2 plus grosses commandes de chaque région. Numérote-les avec ROW_NUMBER sous le nom `n`, dans une sous-requête nommée `t`.',
			accept: [
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, row_number() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n <= 2',
				'select id, amount from (select id, amount, row_number() over (partition by region order by amount desc) as n from orders) as t where n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) t WHERE n <= 2',
				'select id, amount from (select id, amount, row_number() over (partition by region order by amount desc) as n from orders) t where n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) n FROM orders) t WHERE n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER(PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n <= 2',
				'SELECT id, amount FROM (SELECT id, amount, ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS n FROM orders) AS t WHERE n < 3',
				'select id, amount from (select id, amount, row_number() over (partition by region order by amount desc) as n from orders) as t where n < 3'
			],
			why: 'PostgreSQL refuse les fonctions de fenêtrage dans `WHERE`, car elles s’exécutent après lui. La sous-requête `t` calcule `n` d’abord, puis le `WHERE n <= 2` extérieur garde les ids 2 et 3 dans `north` et les ids 5 et 6 dans `south`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `SUM(amount) OVER (PARTITION BY region ORDER BY day)` donne un cumul, alors que `SUM(amount) OVER (PARTITION BY region)` donne le total de la région ?',
		a: 'Avec ORDER BY, `SUM` additionne les lignes du début de la partition jusqu’à la ligne courante et ses pairs. Sans ORDER BY, `SUM` additionne toute la partition : 600 sur chaque ligne `north`.'
	},
	sources: [
		{ title: 'Tutoriel PostgreSQL : fonctions de fenêtrage', url: 'https://www.postgresql.org/docs/current/tutorial-window.html' },
		{ title: 'PostgreSQL : référence des fonctions de fenêtrage', url: 'https://www.postgresql.org/docs/current/functions-window.html' }
	]
};
