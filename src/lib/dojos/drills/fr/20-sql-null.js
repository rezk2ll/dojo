/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-null',
	part: 'SQL',
	title: 'NULL dans les requêtes',
	minutes: 10,
	hook: [
		'Le rapport marketing de la boutique de thé annonce 0 client sans commande, alors qu’Emma et Farid ont un compte et n’ont rien commandé. La requête du rapport utilise `NOT IN`, et une commande a un `customer_id` NULL. Tu réécris les requêtes du rapport une par une dans `psql`, sur PostgreSQL.',
		'`customers (id, name, city, phone)` contient 6 lignes : Ana Costa, Ben Okafor, Chloé Martin, Dmitri Ivanov, Emma Schulz et Farid Benali. Ben, Dmitri et Farid ont un `phone` NULL. Emma et Farid n’ont aucune commande.',
		'`orders (id, customer_id, status, coupon, shipped_at)` contient 9 lignes. La commande 107, passée sans compte, a un `customer_id` NULL. `coupon` vaut `WELCOME10` sur 2 commandes, `TEA5` sur 2, NULL sur 3, et une chaîne vide `\'\'` sur 2, enregistrée par un ancien formulaire de paiement. `shipped_at` porte une date sur les 4 commandes expédiées et vaut NULL sur les 5 autres.'
	],
	terms: [
		{ term: 'NULL', def: 'Le marqueur d’une valeur absente. `=`, `<>` et les autres comparaisons rendent NULL quand un côté est NULL, et WHERE écarte une ligne dont la condition vaut NULL.' },
		{ term: 'COALESCE', def: 'Une fonction qui rend le premier de ses arguments qui n’est pas NULL, comme `COALESCE(phone, \'none\')`.' },
		{ term: 'NULLIF', def: 'Une fonction qui rend NULL quand ses 2 arguments sont égaux, et son premier argument sinon.' }
	],
	reps: [
		{
			prompt: 'Affiche le nom des clients sans numéro de téléphone.',
			accept: [
				'SELECT name FROM customers WHERE phone IS NULL',
				'select name from customers where phone is null'
			],
			why: '`IS NULL` est vrai pour une valeur absente, donc Ben, Dmitri et Farid reviennent. `phone = NULL` rend NULL pour chaque ligne, et la requête ne renverrait aucune ligne.'
		},
		{
			prompt: 'Affiche l’`id` des commandes qui ont une date `shipped_at`.',
			accept: [
				'SELECT id FROM orders WHERE shipped_at IS NOT NULL',
				'select id from orders where shipped_at is not null'
			],
			why: '`IS NOT NULL` garde les 4 lignes où `shipped_at` contient une date. `shipped_at <> NULL` rendrait lui aussi NULL pour chaque ligne et ne garderait rien.'
		},
		{
			prompt: 'Affiche le nom et le téléphone de chaque client, avec le texte `none` quand le téléphone est NULL.',
			accept: [
				"SELECT name, COALESCE(phone, 'none') FROM customers",
				"SELECT name, COALESCE(phone,'none') FROM customers",
				"SELECT name, coalesce(phone, 'none') FROM customers",
				"SELECT name, coalesce(phone,'none') FROM customers",
				"select name, coalesce(phone, 'none') from customers",
				"select name, coalesce(phone,'none') from customers"
			],
			why: '`COALESCE(phone, \'none\')` rend `phone` quand il n’est pas NULL, et `\'none\'` sinon. La colonne elle-même ne change pas : seul le résultat affiche `none`.'
		},
		{
			prompt: 'En une requête sans WHERE, affiche le nombre de commandes, puis le nombre de commandes dont le `coupon` n’est pas NULL.',
			accept: [
				'SELECT COUNT(*), COUNT(coupon) FROM orders',
				'SELECT count(*), count(coupon) FROM orders',
				'select count(*), count(coupon) from orders'
			],
			why: '`count(*)` compte les lignes : `9`. `count(coupon)` compte les lignes où `coupon` n’est pas NULL : `6`, car les 2 chaînes vides sont des valeurs et non des NULL.'
		},
		{
			prompt: 'Affiche l’`id` de chaque commande avec son `coupon`, en transformant la chaîne vide `\'\'` en NULL.',
			accept: [
				"SELECT id, NULLIF(coupon, '') FROM orders",
				"SELECT id, NULLIF(coupon,'') FROM orders",
				"SELECT id, nullif(coupon, '') FROM orders",
				"SELECT id, nullif(coupon,'') FROM orders",
				"select id, nullif(coupon, '') from orders",
				"select id, nullif(coupon,'') from orders"
			],
			why: '`NULLIF(coupon, \'\')` rend NULL quand `coupon` vaut `\'\'`, et `coupon` sinon. Les commandes 103 et 108 affichent alors NULL, comme les 3 commandes qui n’ont jamais eu de coupon.'
		},
		{
			prompt: 'Sans WHERE, compte les commandes qui ont un vrai code de coupon : ni NULL, ni `\'\'`.',
			accept: [
				"SELECT COUNT(NULLIF(coupon, '')) FROM orders",
				"SELECT COUNT(NULLIF(coupon,'')) FROM orders",
				"SELECT count(nullif(coupon, '')) FROM orders",
				"SELECT count(nullif(coupon,'')) FROM orders",
				"select count(nullif(coupon, '')) from orders",
				"select count(nullif(coupon,'')) from orders"
			],
			why: '`NULLIF` transforme les 2 chaînes vides en NULL, et `count` saute chaque NULL. Le résultat est `4` : les 2 `WELCOME10` et les 2 `TEA5`.'
		},
		{
			prompt: 'Affiche l’`id` et `shipped_at` de chaque commande, la dernière expédition en premier et les commandes non expédiées à la fin.',
			accept: [
				'SELECT id, shipped_at FROM orders ORDER BY shipped_at DESC NULLS LAST',
				'select id, shipped_at from orders order by shipped_at desc nulls last'
			],
			why: 'PostgreSQL trie NULL comme plus grand que toute date, donc `DESC` seul mettrait les 5 commandes non expédiées en tête. `NULLS LAST` les envoie à la fin.'
		},
		{
			prompt: 'Affiche l’`id` de chaque commande dont le coupon n’est pas `WELCOME10`, y compris les commandes au coupon NULL.',
			accept: [
				"SELECT id FROM orders WHERE coupon IS DISTINCT FROM 'WELCOME10'",
				"SELECT id FROM orders WHERE coupon <> 'WELCOME10' OR coupon IS NULL",
				"SELECT id FROM orders WHERE coupon != 'WELCOME10' OR coupon IS NULL",
				"SELECT id FROM orders WHERE coupon IS NULL OR coupon <> 'WELCOME10'",
				"SELECT id FROM orders WHERE coupon IS NULL OR coupon != 'WELCOME10'",
				"select id from orders where coupon is distinct from 'WELCOME10'",
				"select id from orders where coupon <> 'WELCOME10' or coupon is null",
				"select id from orders where coupon != 'WELCOME10' or coupon is null",
				"select id from orders where coupon is null or coupon <> 'WELCOME10'",
				"select id from orders where coupon is null or coupon != 'WELCOME10'"
			],
			why: '`IS DISTINCT FROM` traite NULL comme une valeur : `NULL IS DISTINCT FROM \'WELCOME10\'` est vrai, et la requête rend 7 commandes. `coupon <> \'WELCOME10\'` seul en rend 4, car il écarte les 3 lignes NULL.'
		},
		{
			prompt: 'Affiche `c.name` pour les clients qui n’ont jamais commandé. Utilise NOT EXISTS.',
			accept: [
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)',
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE c.id = o.customer_id)',
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT * FROM orders o WHERE o.customer_id = c.id)',
				'SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT * FROM orders o WHERE c.id = o.customer_id)',
				'select c.name from customers c where not exists (select 1 from orders o where o.customer_id = c.id)',
				'select c.name from customers c where not exists (select 1 from orders o where c.id = o.customer_id)',
				'select c.name from customers c where not exists (select * from orders o where o.customer_id = c.id)',
				'select c.name from customers c where not exists (select * from orders o where c.id = o.customer_id)'
			],
			why: '`NOT EXISTS` est vrai quand la sous-requête ne rend aucune ligne pour ce client, ce qui trouve Emma et Farid. Le NULL de la commande 107 ne correspond à aucun `c.id`, donc il ne change rien ici.'
		},
		{
			prompt: 'Affiche le nom des clients qui n’ont jamais commandé, avec `id NOT IN (…)` sur une sous-requête de `orders`. La requête doit rendre Emma et Farid.',
			accept: [
				'SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM orders WHERE customer_id IS NOT NULL)',
				'select name from customers where id not in (select customer_id from orders where customer_id is not null)'
			],
			why: 'Sans le WHERE intérieur, la liste contient le NULL de la commande 107, et `5 NOT IN (1, 2, 3, 4, NULL)` vaut NULL, pas vrai : la requête rend 0 ligne. `WHERE customer_id IS NOT NULL` retire ce NULL de la liste.'
		}
	],
	quiz: [],
	recall: {
		q: 'Pourquoi `WHERE id NOT IN (SELECT customer_id FROM orders)` ne rend aucun client quand une commande a un `customer_id` NULL ?',
		a: 'Pour un `id` absent de la liste, NOT IN le compare au NULL et obtient NULL, pas vrai, donc WHERE écarte chaque ligne. Retire les NULL de la sous-requête, ou utilise NOT EXISTS.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html' },
		{ title: 'Doc PostgreSQL, Conditional Expressions (COALESCE, NULLIF)', url: 'https://www.postgresql.org/docs/current/functions-conditional.html' },
		{ title: 'Doc PostgreSQL, Subquery Expressions (EXISTS, NOT IN)', url: 'https://www.postgresql.org/docs/current/functions-subquery.html' },
		{ title: 'Doc PostgreSQL, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'Doc PostgreSQL, Sorting Rows (ORDER BY)', url: 'https://www.postgresql.org/docs/current/queries-order.html' }
	]
};
