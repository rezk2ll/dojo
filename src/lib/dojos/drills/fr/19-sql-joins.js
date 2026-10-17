/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-joins',
	part: 'SQL',
	title: 'Les jointures',
	minutes: 10,
	hook: [
		'La boutique de thé veut écrire aux clients inscrits qui n’ont jamais commandé, et remercier ceux qui ont fait venir des amis. Les noms sont dans une table et les commandes dans une autre, donc chaque réponse demande une jointure. Tu les écris dans `psql`, sur PostgreSQL.',
		'`customers (id, name, city, referred_by)` : Ana Costa (Lyon), Ben Okafor (Paris, parrainé par Ana), Chloé Martin (Lyon, parrainée par Ana), Dmitri Ivanov (sans ville, parrainé par Ben), Emma Schulz (Lille) et Farid Benali (Paris). `referred_by` contient l’`id` d’un autre client, ou NULL.',
		'`orders (id, customer_id, status, ordered_at)` contient 9 commandes ; Emma et Farid n’en ont aucune, et la commande 107, passée sans compte, a un `customer_id` NULL. `order_items (order_id, product_id, quantity)` relie les commandes à `products (id, name)`, et la colonne `name` de `customers` comme de `products` est UNIQUE. Écris les alias `c`, `o`, `oi`, `p` et `r` sans AS, comme dans `customers c`.'
	],
	terms: [
		{ term: 'condition de jointure', def: 'Le test après ON, comme `o.customer_id = c.id`. Une paire de lignes entre dans le résultat quand il est vrai.' },
		{ term: 'LEFT JOIN', def: 'Une jointure qui garde chaque ligne de la table de gauche. Quand aucune ligne de droite ne correspond, les colonnes de droite valent NULL.' },
		{ term: 'alias de table', def: 'Un nom court pour une table le temps d’une requête, comme `c` dans `customers c`. Une auto-jointure a besoin de deux alias pour la même table.' }
	],
	reps: [
		{
			prompt: 'Affiche l’`id` de chaque commande avec le nom de son client : `o.id`, puis `c.name`.',
			accept: [
				'SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id',
				'SELECT o.id, c.name FROM orders o JOIN customers c ON o.customer_id = c.id',
				'SELECT o.id, c.name FROM orders o INNER JOIN customers c ON c.id = o.customer_id',
				'SELECT o.id, c.name FROM orders o INNER JOIN customers c ON o.customer_id = c.id',
				'select o.id, c.name from orders o join customers c on c.id = o.customer_id',
				'select o.id, c.name from orders o join customers c on o.customer_id = c.id',
				'select o.id, c.name from orders o inner join customers c on c.id = o.customer_id',
				'select o.id, c.name from orders o inner join customers c on o.customer_id = c.id'
			],
			why: '`JOIN … ON c.id = o.customer_id` associe chaque commande au client dont l’`id` correspond. JOIN est une jointure interne : la commande 107 a un `customer_id` NULL qui ne correspond à aucun client, donc 8 des 9 commandes reviennent.'
		},
		{
			prompt: 'Affiche l’`id` des commandes passées par des clients qui habitent Lyon.',
			accept: [
				"SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.city = 'Lyon'",
				"SELECT o.id FROM orders o JOIN customers c ON o.customer_id = c.id WHERE c.city = 'Lyon'",
				"SELECT o.id FROM orders o INNER JOIN customers c ON c.id = o.customer_id WHERE c.city = 'Lyon'",
				"SELECT o.id FROM orders o INNER JOIN customers c ON o.customer_id = c.id WHERE c.city = 'Lyon'",
				"select o.id from orders o join customers c on c.id = o.customer_id where c.city = 'Lyon'",
				"select o.id from orders o join customers c on o.customer_id = c.id where c.city = 'Lyon'",
				"select o.id from orders o inner join customers c on c.id = o.customer_id where c.city = 'Lyon'",
				"select o.id from orders o inner join customers c on o.customer_id = c.id where c.city = 'Lyon'"
			],
			why: 'La jointure place les colonnes du client à côté de chaque commande, puis `WHERE c.city = \'Lyon\'` filtre les lignes jointes. Ana et Chloé habitent Lyon, ce qui donne 5 commandes.'
		},
		{
			prompt: 'Affiche le nom de chaque client avec l’`id` de chacune de ses commandes, y compris les clients sans commande : `c.name`, puis `o.id`.',
			accept: [
				'SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id',
				'SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON c.id = o.customer_id',
				'SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id',
				'SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id',
				'select c.name, o.id from customers c left join orders o on o.customer_id = c.id',
				'select c.name, o.id from customers c left join orders o on c.id = o.customer_id',
				'select c.name, o.id from customers c left outer join orders o on o.customer_id = c.id',
				'select c.name, o.id from customers c left outer join orders o on c.id = o.customer_id'
			],
			why: '`LEFT JOIN` garde chaque ligne de `customers`, la table à sa gauche. Emma et Farid ne correspondent à aucune commande, donc chacun a une ligne avec `o.id` à NULL.'
		},
		{
			prompt: 'Affiche le nom des clients qui n’ont jamais commandé. Utilise un LEFT JOIN.',
			accept: [
				'SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.customer_id IS NULL',
				'SELECT c.name FROM customers c LEFT JOIN orders o ON c.id = o.customer_id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT JOIN orders o ON c.id = o.customer_id WHERE o.customer_id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id WHERE o.customer_id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id WHERE o.id IS NULL',
				'SELECT c.name FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id WHERE o.customer_id IS NULL',
				'select c.name from customers c left join orders o on o.customer_id = c.id where o.id is null',
				'select c.name from customers c left join orders o on o.customer_id = c.id where o.customer_id is null',
				'select c.name from customers c left join orders o on c.id = o.customer_id where o.id is null',
				'select c.name from customers c left join orders o on c.id = o.customer_id where o.customer_id is null',
				'select c.name from customers c left outer join orders o on o.customer_id = c.id where o.id is null',
				'select c.name from customers c left outer join orders o on o.customer_id = c.id where o.customer_id is null',
				'select c.name from customers c left outer join orders o on c.id = o.customer_id where o.id is null',
				'select c.name from customers c left outer join orders o on c.id = o.customer_id where o.customer_id is null'
			],
			why: 'Après le LEFT JOIN, un client sans commande a NULL dans toutes les colonnes de `o`. `WHERE o.id IS NULL` garde seulement ces lignes : Emma Schulz et Farid Benali. `o.id = NULL` n’en garderait aucune, car `=` avec une entrée NULL rend NULL, jamais vrai.'
		},
		{
			prompt: 'Pour chaque client parrainé, affiche son nom et le nom du client qui l’a parrainé. Utilise l’alias `r` pour le parrain.',
			accept: [
				'SELECT c.name, r.name FROM customers c JOIN customers r ON r.id = c.referred_by',
				'SELECT c.name, r.name FROM customers c JOIN customers r ON c.referred_by = r.id',
				'SELECT c.name, r.name FROM customers c INNER JOIN customers r ON r.id = c.referred_by',
				'SELECT c.name, r.name FROM customers c INNER JOIN customers r ON c.referred_by = r.id',
				'select c.name, r.name from customers c join customers r on r.id = c.referred_by',
				'select c.name, r.name from customers c join customers r on c.referred_by = r.id',
				'select c.name, r.name from customers c inner join customers r on r.id = c.referred_by',
				'select c.name, r.name from customers c inner join customers r on c.referred_by = r.id'
			],
			why: 'Une auto-jointure lit `customers` deux fois, sous 2 alias. `ON r.id = c.referred_by` trouve la ligne du parrain, ce qui donne 3 paires : Ben et Ana, Chloé et Ana, Dmitri et Ben.'
		},
		{
			prompt: 'En partant de `orders o`, affiche la date de commande, le nom du produit et la quantité de chaque ligne de commande : `o.ordered_at`, `p.name`, `oi.quantity`.',
			accept: [
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN products p ON oi.product_id = p.id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON oi.order_id = o.id INNER JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON oi.order_id = o.id INNER JOIN products p ON oi.product_id = p.id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON o.id = oi.order_id INNER JOIN products p ON p.id = oi.product_id',
				'SELECT o.ordered_at, p.name, oi.quantity FROM orders o INNER JOIN order_items oi ON o.id = oi.order_id INNER JOIN products p ON oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on oi.order_id = o.id join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on oi.order_id = o.id join products p on oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on o.id = oi.order_id join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o join order_items oi on o.id = oi.order_id join products p on oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on oi.order_id = o.id inner join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on oi.order_id = o.id inner join products p on oi.product_id = p.id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on o.id = oi.order_id inner join products p on p.id = oi.product_id',
				'select o.ordered_at, p.name, oi.quantity from orders o inner join order_items oi on o.id = oi.order_id inner join products p on oi.product_id = p.id'
			],
			why: 'Le premier JOIN ajoute les lignes de commande à chaque commande, le second ajoute le produit de chaque ligne. Chaque JOIN a son propre ON. Le résultat a une ligne par ligne de `order_items`, soit 11 ici.'
		},
		{
			prompt: 'Affiche chaque nom de produit avec la quantité totale vendue. Regroupe par `p.name`.',
			accept: [
				'SELECT p.name, SUM(oi.quantity) FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, SUM(oi.quantity) FROM products p JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'SELECT p.name, SUM(oi.quantity) FROM products p INNER JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, SUM(oi.quantity) FROM products p INNER JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p INNER JOIN order_items oi ON oi.product_id = p.id GROUP BY p.name',
				'SELECT p.name, sum(oi.quantity) FROM products p INNER JOIN order_items oi ON p.id = oi.product_id GROUP BY p.name',
				'select p.name, sum(oi.quantity) from products p join order_items oi on oi.product_id = p.id group by p.name',
				'select p.name, sum(oi.quantity) from products p join order_items oi on p.id = oi.product_id group by p.name',
				'select p.name, sum(oi.quantity) from products p inner join order_items oi on oi.product_id = p.id group by p.name',
				'select p.name, sum(oi.quantity) from products p inner join order_items oi on p.id = oi.product_id group by p.name'
			],
			why: 'La jointure donne une ligne par ligne de commande avec le nom du produit, et `GROUP BY p.name` additionne `oi.quantity` par nom. Une jointure interne écarte les produits jamais commandés : 8 des 10 produits apparaissent.'
		},
		{
			prompt: 'Affiche le nom de chaque client avec son nombre de commandes, et `0` pour ceux qui n’ont jamais commandé. Regroupe par `c.name`.',
			accept: [
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, COUNT(o.id) FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id GROUP BY c.name',
				'SELECT c.name, count(o.id) FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id GROUP BY c.name',
				'select c.name, count(o.id) from customers c left join orders o on o.customer_id = c.id group by c.name',
				'select c.name, count(o.id) from customers c left join orders o on c.id = o.customer_id group by c.name',
				'select c.name, count(o.id) from customers c left outer join orders o on o.customer_id = c.id group by c.name',
				'select c.name, count(o.id) from customers c left outer join orders o on c.id = o.customer_id group by c.name'
			],
			why: '`count(o.id)` compte les valeurs de `o.id` non NULL, donc la ligne NULL d’Emma ou de Farid compte `0`. `count(*)` compterait cette ligne et afficherait `1` pour eux.'
		},
		{
			prompt: 'Affiche le nom de chaque client avec l’`id` de ses commandes annulées, et NULL pour les clients sans commande annulée. Place le test sur le statut dans le ON.',
			accept: [
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON c.id = o.customer_id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.status = 'cancelled' AND o.customer_id = c.id",
				"SELECT c.name, o.id FROM customers c LEFT JOIN orders o ON o.status = 'cancelled' AND c.id = o.customer_id",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.customer_id = c.id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON c.id = o.customer_id AND o.status = 'cancelled'",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.status = 'cancelled' AND o.customer_id = c.id",
				"SELECT c.name, o.id FROM customers c LEFT OUTER JOIN orders o ON o.status = 'cancelled' AND c.id = o.customer_id",
				"select c.name, o.id from customers c left join orders o on o.customer_id = c.id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left join orders o on c.id = o.customer_id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left join orders o on o.status = 'cancelled' and o.customer_id = c.id",
				"select c.name, o.id from customers c left join orders o on o.status = 'cancelled' and c.id = o.customer_id",
				"select c.name, o.id from customers c left outer join orders o on o.customer_id = c.id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left outer join orders o on c.id = o.customer_id and o.status = 'cancelled'",
				"select c.name, o.id from customers c left outer join orders o on o.status = 'cancelled' and o.customer_id = c.id",
				"select c.name, o.id from customers c left outer join orders o on o.status = 'cancelled' and c.id = o.customer_id"
			],
			why: 'Dans le ON, `o.status = \'cancelled\'` choisit les commandes qui correspondent avant que le LEFT JOIN ajoute les lignes NULL, donc les 6 clients restent. Dans le WHERE, le même test passerait après la jointure et retirerait chaque client sans commande annulée : il ne resterait que Ben et Chloé.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu fais un LEFT JOIN de `customers c` vers `orders o`. Quelle condition WHERE garde seulement les clients qui n’ont jamais commandé, et pourquoi ça marche ?',
		a: '`WHERE o.id IS NULL`. Un client sans commande correspondante reçoit une ligne dont toutes les colonnes de `o` valent NULL.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Joins Between Tables (tutoriel)', url: 'https://www.postgresql.org/docs/current/tutorial-join.html' },
		{ title: 'Doc PostgreSQL, Table Expressions (tables jointes)', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html' }
	]
};
