/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-select',
	part: 'SQL',
	title: 'Les bases de SELECT',
	minutes: 10,
	hook: [
		'Tu gères la base d’une petite boutique de thé en ligne. La personne qui achète le stock t’envoie des questions toute la matinée : ce qui est bon marché, ce qui est en rupture, ce qu’il y a dans la gamme de thés verts. Tu réponds à chacune par une requête dans `psql`, sur PostgreSQL.',
		'La table est `products (id int PRIMARY KEY, name text UNIQUE, category text, price numeric(6,2), stock int)`. Ses 10 lignes : en `green`, Sencha 12.50 (stock 40), Gyokuro 28.00 (0) et Jasmine Pearls 19.90 (15) ; en `black`, Earl Grey 9.50 (60), Earl Grey Cream 11.00 (25) et Assam 8.00 (0) ; en `oolong`, Tie Guan Yin 22.00 (12) et Da Hong Pao 34.00 (5) ; en `teaware`, Glass Teapot 24.50 (8) et Bamboo Whisk 15.00 (30). Deux produits n’ont jamais le même prix.'
	],
	terms: [
		{ term: 'liste du SELECT', def: 'Les expressions entre SELECT et FROM. Chacune donne une colonne du résultat.' },
		{ term: 'motif', def: 'Le texte à droite de LIKE. `%` correspond à n’importe quelle suite de caractères, même vide, et `_` à un seul caractère.' },
		{ term: 'OFFSET', def: 'Le nombre de lignes triées à sauter avant que LIMIT commence à compter les lignes renvoyées.' }
	],
	reps: [
		{
			prompt: 'Affiche le nom et le prix de chaque produit, dans cet ordre de colonnes.',
			accept: ['SELECT name, price FROM products', 'select name, price from products'],
			why: 'La liste `name, price` choisit deux colonnes, dans cet ordre. Sans WHERE, les 10 lignes reviennent, et sans ORDER BY leur ordre n’est pas défini.'
		},
		{
			prompt: 'Affiche le nom des produits de la catégorie `green`.',
			accept: ["SELECT name FROM products WHERE category = 'green'", "select name from products where category = 'green'"],
			why: 'WHERE garde les 3 lignes pour lesquelles `category = \'green\'` est vrai. Une valeur texte s’écrit entre apostrophes droites ; avec des guillemets doubles, `"green"` serait un nom de colonne et PostgreSQL répondrait `column "green" does not exist`.'
		},
		{
			prompt: 'Affiche le nom et le prix de chaque produit, du plus cher au moins cher.',
			accept: ['SELECT name, price FROM products ORDER BY price DESC', 'select name, price from products order by price desc'],
			why: '`ORDER BY price` trie le résultat, et `DESC` met la plus grande valeur en premier. Sans `DESC`, le tri est croissant, c’est le défaut.'
		},
		{
			prompt: 'Affiche le nom et le prix des 3 produits les moins chers.',
			accept: [
				'SELECT name, price FROM products ORDER BY price LIMIT 3',
				'select name, price from products order by price limit 3',
				'SELECT name, price FROM products ORDER BY price ASC LIMIT 3',
				'select name, price from products order by price asc limit 3',
				'SELECT name, price FROM products ORDER BY price FETCH FIRST 3 ROWS ONLY',
				'select name, price from products order by price fetch first 3 rows only'
			],
			why: '`ORDER BY price` place les moins chers en tête, puis `LIMIT 3` garde les 3 premières lignes : Assam, Earl Grey et Earl Grey Cream. Sans ORDER BY, LIMIT rendrait 3 lignes dans un ordre que rien ne garantit.'
		},
		{
			prompt: 'Liste chaque catégorie une seule fois.',
			accept: ['SELECT DISTINCT category FROM products', 'select distinct category from products'],
			why: '`DISTINCT` se place juste après SELECT et retire les lignes en double du résultat. Les 10 produits donnent 4 lignes : `green`, `black`, `oolong` et `teaware`.'
		},
		{
			prompt: 'Affiche les noms qui commencent par `Earl`, en respectant la casse.',
			accept: ["SELECT name FROM products WHERE name LIKE 'Earl%'", "select name from products where name like 'Earl%'"],
			why: 'Dans `\'Earl%\'`, `%` accepte n’importe quels caractères après `Earl`, même aucun. LIKE doit couvrir toute la chaîne, donc `\'Earl\'` seul ne trouverait aucune ligne ici.'
		},
		{
			prompt: 'Affiche les noms qui contiennent `tea` n’importe où, sans tenir compte de la casse.',
			accept: ["SELECT name FROM products WHERE name ILIKE '%tea%'", "select name from products where name ilike '%tea%'"],
			why: 'Un `%` de chaque côté laisse `tea` à n’importe quelle place dans le nom. `ILIKE` est le LIKE insensible à la casse de PostgreSQL : il trouve `Glass Teapot`, que LIKE raterait à cause du T majuscule.'
		},
		{
			prompt: 'Affiche le nom et la catégorie des produits des catégories `green` ou `oolong`. Utilise IN.',
			accept: [
				"SELECT name, category FROM products WHERE category IN ('green', 'oolong')",
				"select name, category from products where category in ('green', 'oolong')",
				"SELECT name, category FROM products WHERE category IN ('oolong', 'green')",
				"select name, category from products where category in ('oolong', 'green')",
				"SELECT name, category FROM products WHERE category IN ('green','oolong')",
				"select name, category from products where category in ('green','oolong')"
			],
			why: '`category IN (\'green\', \'oolong\')` est vrai quand la catégorie vaut l’une des valeurs de la liste. Cela revient à `category = \'green\' OR category = \'oolong\'`, et renvoie 5 lignes.'
		},
		{
			prompt: 'Affiche le nom et le prix des produits qui coûtent de 10 à 20, bornes comprises. Utilise BETWEEN.',
			accept: [
				'SELECT name, price FROM products WHERE price BETWEEN 10 AND 20',
				'select name, price from products where price between 10 and 20',
				'SELECT name, price FROM products WHERE price BETWEEN 10.00 AND 20.00',
				'select name, price from products where price between 10.00 and 20.00'
			],
			why: '`BETWEEN 10 AND 20` équivaut à `price >= 10 AND price <= 20` : les deux bornes comptent. Tu obtiens Sencha, Jasmine Pearls, Earl Grey Cream et Bamboo Whisk.'
		},
		{
			prompt: 'Affiche le nom et le prix des thés verts en stock (`stock > 0`), du moins cher au plus cher.',
			accept: [
				"SELECT name, price FROM products WHERE category = 'green' AND stock > 0 ORDER BY price",
				"select name, price from products where category = 'green' and stock > 0 order by price",
				"SELECT name, price FROM products WHERE stock > 0 AND category = 'green' ORDER BY price",
				"select name, price from products where stock > 0 and category = 'green' order by price",
				"SELECT name, price FROM products WHERE category = 'green' AND stock > 0 ORDER BY price ASC",
				"select name, price from products where category = 'green' and stock > 0 order by price asc"
			],
			why: '`AND` ne garde une ligne que si les deux conditions sont vraies, donc Gyokuro (stock 0) disparaît. ORDER BY passe après WHERE et trie les 2 lignes restantes : Sencha, puis Jasmine Pearls.'
		},
		{
			prompt: 'Affiche la page 2 des noms de produits par ordre alphabétique, 5 noms par page.',
			accept: [
				'SELECT name FROM products ORDER BY name LIMIT 5 OFFSET 5',
				'select name from products order by name limit 5 offset 5',
				'SELECT name FROM products ORDER BY name OFFSET 5 LIMIT 5',
				'select name from products order by name offset 5 limit 5',
				'SELECT name FROM products ORDER BY name OFFSET 5 ROWS FETCH NEXT 5 ROWS ONLY',
				'select name from products order by name offset 5 rows fetch next 5 rows only'
			],
			why: '`OFFSET 5` saute les 5 noms de la page 1, puis `LIMIT 5` rend les 5 suivants, de Glass Teapot à Tie Guan Yin. Le serveur calcule quand même les lignes sautées, donc un grand OFFSET coûte du temps.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu veux les 3 produits les moins chers. Pourquoi `SELECT name FROM products LIMIT 3` ne suffit pas ?',
		a: 'Sans `ORDER BY price`, PostgreSQL rend les lignes dans un ordre non défini, et LIMIT 3 garde 3 lignes au hasard de cet ordre. Il faut `ORDER BY price LIMIT 3`.'
	},
	sources: [
		{ title: 'Doc PostgreSQL, Lexical Structure', url: 'https://www.postgresql.org/docs/current/sql-syntax-lexical.html' },
		{ title: 'Doc PostgreSQL, Select Lists', url: 'https://www.postgresql.org/docs/current/queries-select-lists.html' },
		{ title: 'Doc PostgreSQL, Sorting Rows (ORDER BY)', url: 'https://www.postgresql.org/docs/current/queries-order.html' },
		{ title: 'Doc PostgreSQL, LIMIT and OFFSET', url: 'https://www.postgresql.org/docs/current/queries-limit.html' },
		{ title: 'Doc PostgreSQL, Comparison Functions and Operators', url: 'https://www.postgresql.org/docs/current/functions-comparison.html' },
		{ title: 'Doc PostgreSQL, Pattern Matching', url: 'https://www.postgresql.org/docs/current/functions-matching.html' },
		{ title: 'Doc PostgreSQL, Row and Array Comparisons', url: 'https://www.postgresql.org/docs/current/functions-comparisons.html' }
	]
};
