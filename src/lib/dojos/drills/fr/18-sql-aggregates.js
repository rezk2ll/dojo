/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-aggregates',
	part: 'SQL',
	title: 'Compter en SQL',
	minutes: 10,
	hook: [
		'C’est la fin du mois à la boutique de thé en ligne, et la gérante veut des chiffres : combien de commandes, combien d’argent, quels clients reviennent. Nettoyer un export dans un tableur prendrait une heure. Tu réponds à chaque question par une seule requête dans `psql`, sur PostgreSQL.',
		'La table `orders (id int PRIMARY KEY, customer_id int, status text, total numeric(8,2), ordered_at date)` contient 9 commandes. `status` vaut `paid`, `shipped` ou `cancelled`. Le client 1 a 3 commandes, les clients 2 et 3 en ont 2 chacun (dont une annulée), le client 4 en a 1. La commande 107 a été passée sans compte, donc son `customer_id` est NULL. La table `order_items (order_id int, product_id int, quantity int)` a une ligne par produit d’une commande.'
	],
	terms: [
		{ term: 'fonction d’agrégat', def: 'Une fonction comme `count`, `sum` ou `avg` qui lit plusieurs lignes et rend une seule valeur.' },
		{ term: 'groupe', def: 'L’ensemble des lignes qui ont les mêmes valeurs dans les colonnes du GROUP BY. La requête rend une ligne par groupe.' },
		{ term: 'HAVING', def: 'Une condition testée sur chaque groupe, une fois les agrégats calculés. Une condition WHERE porte sur chaque ligne, avant le regroupement.' }
	],
	reps: [
		{
			prompt: 'Compte toutes les commandes.',
			accept: ['SELECT COUNT(*) FROM orders', 'select count(*) from orders', 'SELECT count(*) FROM orders'],
			why: '`count(*)` compte les lignes en entrée, quel que soit leur contenu. Sans GROUP BY, toute la table forme un seul groupe, et la requête rend une ligne : `9`.'
		},
		{
			prompt: 'Additionne le `total` des commandes dont le statut est `shipped`.',
			accept: [
				"SELECT SUM(total) FROM orders WHERE status = 'shipped'",
				"select sum(total) from orders where status = 'shipped'",
				"SELECT sum(total) FROM orders WHERE status = 'shipped'"
			],
			why: 'WHERE garde d’abord les 4 commandes expédiées, puis `sum(total)` additionne leurs totaux : `137.00`. Si aucune ligne ne passait le WHERE, `sum` rendrait NULL, et non 0.'
		},
		{
			prompt: 'Affiche le plus petit puis le plus grand `total` de commande, sur une seule ligne.',
			accept: ['SELECT MIN(total), MAX(total) FROM orders', 'select min(total), max(total) from orders', 'SELECT min(total), max(total) FROM orders'],
			why: '`min` et `max` lisent chacun toutes les lignes et rendent une valeur. Deux agrégats dans la liste du SELECT donnent donc une ligne à deux colonnes : `9.50` et `59.00`.'
		},
		{
			prompt: 'Affiche le `total` moyen des commandes, arrondi à 2 décimales.',
			accept: [
				'SELECT ROUND(AVG(total), 2) FROM orders',
				'select round(avg(total), 2) from orders',
				'SELECT round(avg(total), 2) FROM orders',
				'SELECT ROUND(AVG(total),2) FROM orders',
				'select round(avg(total),2) from orders',
				'SELECT round(avg(total),2) FROM orders'
			],
			why: '`avg(total)` rend `27.3777…` pour ces 9 commandes, un numeric avec beaucoup de décimales. `round(…, 2)` en garde 2 : `27.38`.'
		},
		{
			prompt: 'Affiche chaque statut avec son nombre de commandes.',
			accept: [
				'SELECT status, COUNT(*) FROM orders GROUP BY status',
				'select status, count(*) from orders group by status',
				'SELECT status, count(*) FROM orders GROUP BY status'
			],
			why: '`GROUP BY status` crée un groupe par valeur de statut, et `count(*)` compte les lignes de chaque groupe : 3 groupes ici. `status` peut figurer dans la liste du SELECT, car il n’a qu’une valeur par groupe.'
		},
		{
			prompt: 'Dans `order_items`, affiche chaque `product_id` avec la quantité totale vendue.',
			accept: [
				'SELECT product_id, SUM(quantity) FROM order_items GROUP BY product_id',
				'select product_id, sum(quantity) from order_items group by product_id',
				'SELECT product_id, sum(quantity) FROM order_items GROUP BY product_id'
			],
			why: 'Chaque produit a son groupe, et `sum(quantity)` additionne les quantités de ses lignes. Un produit qui ne figure dans aucune commande n’a aucune ligne dans `order_items`, donc il n’apparaît pas.'
		},
		{
			prompt: 'Affiche chaque `customer_id` avec la somme des totaux de ses commandes, la plus grosse somme en premier.',
			accept: [
				'SELECT customer_id, SUM(total) FROM orders GROUP BY customer_id ORDER BY SUM(total) DESC',
				'select customer_id, sum(total) from orders group by customer_id order by sum(total) desc',
				'SELECT customer_id, sum(total) FROM orders GROUP BY customer_id ORDER BY sum(total) DESC',
				'SELECT customer_id, SUM(total) FROM orders GROUP BY customer_id ORDER BY 2 DESC',
				'select customer_id, sum(total) from orders group by customer_id order by 2 desc',
				'SELECT customer_id, sum(total) FROM orders GROUP BY customer_id ORDER BY 2 DESC'
			],
			why: 'ORDER BY passe après le regroupement, il peut donc trier sur `sum(total)`, ou sur `2`, la deuxième colonne du résultat. La commande sans compte forme son propre groupe, avec un `customer_id` NULL, à `9.50`.'
		},
		{
			prompt: 'Combien de clients différents ont commandé ? Affiche un seul nombre, sans compter la commande sans compte.',
			accept: [
				'SELECT COUNT(DISTINCT customer_id) FROM orders',
				'select count(distinct customer_id) from orders',
				'SELECT count(DISTINCT customer_id) FROM orders'
			],
			why: '`count(DISTINCT customer_id)` compte les valeurs distinctes non NULL : les clients 1, 2, 3 et 4, donc `4`. Le NULL de la commande 107 est ignoré, car `count` appliqué à une colonne saute les NULL.'
		},
		{
			prompt: 'Affiche chaque `customer_id` avec son nombre de commandes, seulement pour les clients qui ont plus de 2 commandes.',
			accept: [
				'SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) > 2',
				'select customer_id, count(*) from orders group by customer_id having count(*) > 2',
				'SELECT customer_id, count(*) FROM orders GROUP BY customer_id HAVING count(*) > 2',
				'SELECT customer_id, COUNT(*) FROM orders GROUP BY customer_id HAVING COUNT(*) >= 3',
				'select customer_id, count(*) from orders group by customer_id having count(*) >= 3',
				'SELECT customer_id, count(*) FROM orders GROUP BY customer_id HAVING count(*) >= 3'
			],
			why: 'HAVING écarte des groupes entiers une fois `count(*)` connu, et il reste le client 1 avec 3 commandes. `WHERE count(*) > 2` échoue avec `aggregate functions are not allowed in WHERE`, car WHERE passe avant que les groupes existent.'
		},
		{
			prompt: 'Sans compter les commandes annulées, affiche chaque `customer_id` avec son nombre de commandes, seulement pour les clients qui en ont au moins 2.',
			accept: [
				"SELECT customer_id, COUNT(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING COUNT(*) >= 2",
				"select customer_id, count(*) from orders where status <> 'cancelled' group by customer_id having count(*) >= 2",
				"SELECT customer_id, count(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING count(*) >= 2",
				"SELECT customer_id, COUNT(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING COUNT(*) >= 2",
				"select customer_id, count(*) from orders where status != 'cancelled' group by customer_id having count(*) >= 2",
				"SELECT customer_id, count(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING count(*) >= 2",
				"SELECT customer_id, COUNT(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING COUNT(*) > 1",
				"select customer_id, count(*) from orders where status <> 'cancelled' group by customer_id having count(*) > 1",
				"SELECT customer_id, count(*) FROM orders WHERE status <> 'cancelled' GROUP BY customer_id HAVING count(*) > 1",
				"SELECT customer_id, COUNT(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING COUNT(*) > 1",
				"select customer_id, count(*) from orders where status != 'cancelled' group by customer_id having count(*) > 1",
				"SELECT customer_id, count(*) FROM orders WHERE status != 'cancelled' GROUP BY customer_id HAVING count(*) > 1"
			],
			why: 'WHERE retire les 2 lignes annulées avant le regroupement, puis HAVING garde les groupes d’au moins 2 lignes. Il ne reste que le client 1 ; les clients 2 et 3 tombent à 1 commande chacun.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu veux les clients qui ont plus de 2 commandes. Pourquoi `WHERE count(*) > 2` échoue, et qu’écris-tu à la place ?',
		a: 'WHERE filtre les lignes avant que les groupes et leurs comptes existent, donc PostgreSQL y refuse un agrégat. Tu écris `GROUP BY customer_id HAVING count(*) > 2`.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Aggregate Functions (tutoriel)', url: 'https://www.postgresql.org/docs/current/tutorial-agg.html' },
		{ title: 'Doc PostgreSQL, Aggregate Functions', url: 'https://www.postgresql.org/docs/current/functions-aggregate.html' },
		{ title: 'Doc PostgreSQL, Table Expressions (GROUP BY et HAVING)', url: 'https://www.postgresql.org/docs/current/queries-table-expressions.html' },
		{ title: 'Doc PostgreSQL, Value Expressions (expressions d’agrégat)', url: 'https://www.postgresql.org/docs/current/sql-expressions.html' }
	]
};
