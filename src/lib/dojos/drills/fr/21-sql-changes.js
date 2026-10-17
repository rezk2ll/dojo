/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sql-changes',
	part: 'SQL',
	title: 'Modifier les données',
	minutes: 10,
	hook: [
		'Tu t’occupes de la base d’une petite boutique en ligne. Le paiement baisse le stock à chaque commande, et un fournisseur envoie un fichier de produits chaque nuit. Cette nuit, l’import s’est arrêté au milieu : tu corriges les lignes à la main dans `psql`. Chaque requête doit toucher seulement les lignes que tu vises.',
		'La base est PostgreSQL. La table est `products (sku text PRIMARY KEY, price numeric(8,2) NOT NULL, stock int NOT NULL DEFAULT 0)`. Elle contient 3 lignes : `MUG-01` à 12.00 avec un stock de 40, `TEE-02` à 20.00 avec 15, et `CAP-03` à 15.00 avec 0. Chaque exercice repart de ces 3 lignes.'
	],
	terms: [
		{ term: 'RETURNING', def: 'Une clause à la fin d’un INSERT, d’un UPDATE ou d’un DELETE qui renvoie des colonnes des lignes modifiées.' },
		{ term: 'cible du conflit', def: 'La liste de colonnes après ON CONFLICT, par exemple `(sku)`. PostgreSQL s’en sert pour choisir l’index unique qui décide ce qui compte comme doublon.' },
		{ term: 'EXCLUDED', def: 'Un nom de table spécial dans ON CONFLICT DO UPDATE. Il contient la ligne que l’INSERT a essayé d’ajouter.' }
	],
	reps: [
		{
			prompt: 'Ajoute le produit `BAG-04` au prix `18.00` avec un stock de `25`. Nomme les colonnes.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('BAG-04', 18.00, 25)",
				"insert into products (sku, price, stock) values ('BAG-04', 18.00, 25)",
				"INSERT INTO products(sku, price, stock) VALUES ('BAG-04', 18.00, 25)",
				"insert into products(sku, price, stock) values ('BAG-04', 18.00, 25)",
				"INSERT INTO products (sku, price, stock) VALUES('BAG-04', 18.00, 25)",
				"insert into products (sku, price, stock) values('BAG-04', 18.00, 25)",
				"INSERT INTO products (sku, price, stock) VALUES ('BAG-04', 18, 25)",
				"insert into products (sku, price, stock) values ('BAG-04', 18, 25)"
			],
			why: '`(sku, price, stock)` liste les colonnes, et `VALUES` leur donne des valeurs de gauche à droite. Le texte va entre apostrophes droites, les nombres sans.'
		},
		{
			prompt: 'Ajoute `KEY-05` (prix `5.00`, stock `100`) et `PIN-06` (prix `3.50`, stock `200`) en une seule requête.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"insert into products (sku, price, stock) values ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"INSERT INTO products(sku, price, stock) VALUES ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"insert into products(sku, price, stock) values ('KEY-05', 5.00, 100), ('PIN-06', 3.50, 200)",
				"INSERT INTO products (sku, price, stock) VALUES ('KEY-05', 5, 100), ('PIN-06', 3.50, 200)",
				"insert into products (sku, price, stock) values ('KEY-05', 5, 100), ('PIN-06', 3.50, 200)"
			],
			why: '`VALUES` accepte plusieurs lignes, chacune entre parenthèses, séparées par des virgules. Les deux lignes partent en une requête et un seul aller-retour vers le serveur.'
		},
		{
			prompt: 'Ajoute `HAT-07` au prix `22.00` et laisse `stock` prendre sa valeur par défaut.',
			accept: [
				"INSERT INTO products (sku, price) VALUES ('HAT-07', 22.00)",
				"insert into products (sku, price) values ('HAT-07', 22.00)",
				"INSERT INTO products(sku, price) VALUES ('HAT-07', 22.00)",
				"insert into products(sku, price) values ('HAT-07', 22.00)",
				"INSERT INTO products (sku, price, stock) VALUES ('HAT-07', 22.00, DEFAULT)",
				"insert into products (sku, price, stock) values ('HAT-07', 22.00, default)",
				"INSERT INTO products (sku, price) VALUES ('HAT-07', 22)",
				"insert into products (sku, price) values ('HAT-07', 22)"
			],
			why: '`stock` n’est pas dans la liste des colonnes, donc PostgreSQL y met son défaut déclaré, `0`. Une colonne sans défaut déclaré reçoit NULL. Le mot `DEFAULT` dans `VALUES` fait pareil pour une colonne que tu listes.'
		},
		{
			prompt: 'Passe le prix de `MUG-01` à `14.00`.',
			accept: [
				"UPDATE products SET price = 14.00 WHERE sku = 'MUG-01'",
				"update products set price = 14.00 where sku = 'MUG-01'",
				"UPDATE products SET price=14.00 WHERE sku='MUG-01'",
				"update products set price=14.00 where sku='MUG-01'",
				"UPDATE products SET price = 14 WHERE sku = 'MUG-01'",
				"update products set price = 14 where sku = 'MUG-01'"
			],
			why: '`SET price = 14.00` nomme la colonne et sa nouvelle valeur. `WHERE sku = \'MUG-01\'` limite le changement à une ligne. Sans le `WHERE`, les 3 produits passeraient à 14.00.'
		},
		{
			prompt: 'Un client vient d’acheter un `TEE-02`. Baisse son stock de 1.',
			accept: [
				"UPDATE products SET stock = stock - 1 WHERE sku = 'TEE-02'",
				"update products set stock = stock - 1 where sku = 'TEE-02'",
				"UPDATE products SET stock=stock-1 WHERE sku='TEE-02'",
				"update products set stock=stock-1 where sku='TEE-02'",
				"UPDATE products SET stock = stock-1 WHERE sku = 'TEE-02'",
				"update products set stock = stock-1 where sku = 'TEE-02'"
			],
			why: 'À droite du `=`, `stock` vaut ce que la ligne contient avant la mise à jour, 15. La ligne finit à 14, et ton appli n’a pas eu à lire l’ancienne valeur avant.'
		},
		{
			prompt: 'Vends un `TEE-02` et récupère son nouveau stock dans la même requête. Renvoie seulement la colonne `stock`.',
			accept: [
				"UPDATE products SET stock = stock - 1 WHERE sku = 'TEE-02' RETURNING stock",
				"update products set stock = stock - 1 where sku = 'TEE-02' returning stock",
				"UPDATE products SET stock=stock-1 WHERE sku='TEE-02' RETURNING stock",
				"update products set stock=stock-1 where sku='TEE-02' returning stock",
				"UPDATE products SET stock = stock-1 WHERE sku = 'TEE-02' RETURNING stock",
				"update products set stock = stock-1 where sku = 'TEE-02' returning stock"
			],
			why: '`RETURNING stock` renvoie une ligne avec la valeur 14. Dans un UPDATE, RETURNING montre la ligne après le changement. Tu évites le `SELECT` que tu aurais lancé ensuite.'
		},
		{
			prompt: 'Supprime tous les produits dont le stock vaut `0`.',
			accept: [
				'DELETE FROM products WHERE stock = 0',
				'delete from products where stock = 0',
				'DELETE FROM products WHERE stock=0',
				'delete from products where stock=0'
			],
			why: '`DELETE FROM products` retire des lignes, et `WHERE stock = 0` ne garde que `CAP-03`. La doc : "If the WHERE clause is absent, the effect is to delete all rows in the table." (sans WHERE, toute la table est vidée).'
		},
		{
			prompt: 'Le fichier de la nuit renvoie `MUG-01` à `12.00` avec un stock de `40`. Insère-le, et ne fais rien si ce `sku` existe déjà.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT (sku) DO NOTHING",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 40) on conflict (sku) do nothing",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT DO NOTHING",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 40) on conflict do nothing",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT(sku) DO NOTHING",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 40) on conflict(sku) do nothing",
				"INSERT INTO products(sku, price, stock) VALUES ('MUG-01', 12.00, 40) ON CONFLICT (sku) DO NOTHING",
				"insert into products(sku, price, stock) values ('MUG-01', 12.00, 40) on conflict (sku) do nothing"
			],
			why: 'Un INSERT simple échoue ici avec l’erreur `duplicate key value violates unique constraint`. `ON CONFLICT (sku) DO NOTHING` saute la ligne et insère 0 ligne. Avec DO NOTHING, la cible du conflit `(sku)` est facultative.'
		},
		{
			prompt: 'Insère `MUG-01` à `12.00` avec un stock de `10`. Si `MUG-01` existe déjà, ajoute plutôt ces 10 à son stock actuel.',
			accept: [
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT (sku) DO UPDATE SET stock = products.stock + EXCLUDED.stock",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 10) on conflict (sku) do update set stock = products.stock + excluded.stock",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT (sku) DO UPDATE SET stock = products.stock + excluded.stock",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT(sku) DO UPDATE SET stock = products.stock + EXCLUDED.stock",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 10) on conflict(sku) do update set stock = products.stock + excluded.stock",
				"INSERT INTO products (sku, price, stock) VALUES ('MUG-01', 12.00, 10) ON CONFLICT (sku) DO UPDATE SET stock = EXCLUDED.stock + products.stock",
				"insert into products (sku, price, stock) values ('MUG-01', 12.00, 10) on conflict (sku) do update set stock = excluded.stock + products.stock"
			],
			why: '`products.stock` est la ligne déjà enregistrée (40) et `EXCLUDED.stock` celle que tu voulais insérer (10) : le stock passe à 50. Un `stock` seul échoue avec l’erreur `column reference "stock" is ambiguous`. DO UPDATE exige la cible du conflit `(sku)`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Dans `ON CONFLICT (sku) DO UPDATE SET ...`, comment nommes-tu la valeur que l’INSERT voulait ajouter ?',
		a: 'Avec la table spéciale `EXCLUDED`, par exemple `EXCLUDED.stock`. La ligne déjà enregistrée se nomme par la table : `products.stock`.'
	},
	sources: [
		{ title: 'PostgreSQL : INSERT', url: 'https://www.postgresql.org/docs/current/sql-insert.html' },
		{ title: 'PostgreSQL : UPDATE', url: 'https://www.postgresql.org/docs/current/sql-update.html' },
		{ title: 'PostgreSQL : DELETE', url: 'https://www.postgresql.org/docs/current/sql-delete.html' },
		{ title: 'PostgreSQL : renvoyer les lignes modifiées', url: 'https://www.postgresql.org/docs/current/dml-returning.html' }
	]
};
