/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'psql',
	part: 'SQL',
	title: 'psql',
	minutes: 10,
	hook: [
		'Le support signale que la page d’historique des commandes d’un client, l’id 42, met plusieurs secondes à charger. Tu ouvres un terminal sur ton portable et tu te connectes avec `psql shop`. Il te faut voir les tables, chronométrer la requête lente, demander son plan à PostgreSQL et sortir les lignes dans un fichier CSV pour le ticket.',
		'La base `shop` a une seule table : `orders (id bigint PRIMARY KEY, customer_id bigint NOT NULL, region text NOT NULL, total numeric(10,2) NOT NULL)`, avec 3 lignes. Ton dossier courant sur le portable contient `new_orders.csv`, avec la ligne d’en-tête `id,customer_id,region,total` et 2 commandes. Les exercices 1 à 9 se tapent à l’invite `shop=>`, les exercices 10 et 11 dans ton shell.'
	],
	terms: [
		{ term: 'méta-commande', def: 'Une commande psql qui commence par une barre oblique inverse, comme `\\dt`. psql l’exécute lui-même et ne l’envoie jamais au serveur.' },
		{ term: '\\copy', def: 'La méta-commande psql qui déplace des lignes entre une table et un fichier sur la machine où tourne psql, ici ton portable.' },
		{ term: 'plan', def: 'Les étapes que PostgreSQL choisit pour exécuter une requête, comme un parcours séquentiel de `orders` ou un parcours d’index. `EXPLAIN` l’affiche.' }
	],
	reps: [
		{
			prompt: 'Liste les tables de la base, et seulement les tables.',
			accept: ['\\dt'],
			why: '`\\d` ouvre la famille des commandes de description, et `t` veut dire tables. Un `\\d` seul liste aussi les vues, les vues matérialisées, les séquences et les tables distantes. Par défaut, seuls les objets que tu as créés s’affichent, pas les tables système.'
		},
		{
			prompt: 'Liste à nouveau les tables, cette fois avec leur taille sur le disque.',
			accept: ['\\dt+'],
			why: 'Le `+` ajoute des colonnes à la liste : la persistance, la taille sur le disque et la description. Il marche aussi sur les autres commandes `\\d`, comme `\\d+ orders`.'
		},
		{
			prompt: 'Affiche les colonnes, les types, les index et les contraintes de `orders`.',
			accept: ['\\d orders', '\\d public.orders'],
			why: '`\\d orders` affiche chaque colonne avec son type, si elle accepte NULL et sa valeur par défaut, puis les index. Ici le seul index est `orders_pkey` sur `id` : rien n’indexe `customer_id`.'
		},
		{
			prompt: 'psql affiche les résultats en tableau pour l’instant. Active l’affichage étendu, pour que chaque colonne d’une ligne s’affiche sur sa propre ligne.',
			accept: ['\\x on', '\\x'],
			why: '`\\x on` active le mode étendu, et psql répond `Expanded display is on`. Un `\\x` seul bascule le réglage, donc il l’active aussi quand il était coupé. `\\x auto` n’étend que les résultats plus larges que l’écran.'
		},
		{
			prompt: 'Fais afficher par psql la durée de chaque requête.',
			accept: ['\\timing on', '\\timing'],
			why: 'psql répond `Timing is on`, puis affiche une ligne comme `Time: 0.512 ms` après chaque requête. La durée est en millisecondes. Un `\\timing` seul bascule le réglage.'
		},
		{
			prompt: 'Exporte toute la table `orders` dans `orders.csv` sur ton portable, en CSV avec une ligne d’en-tête.',
			accept: [
				"\\copy orders TO 'orders.csv' WITH (FORMAT csv, HEADER)",
				"\\copy orders to 'orders.csv' with (format csv, header)",
				"\\copy orders TO 'orders.csv' (FORMAT csv, HEADER)",
				"\\copy orders TO 'orders.csv' WITH (FORMAT csv, HEADER true)",
				"\\copy orders TO 'orders.csv' CSV HEADER",
				"\\copy orders to 'orders.csv' csv header",
				"\\copy orders TO 'orders.csv' WITH CSV HEADER",
				"\\copy orders to 'orders.csv' with csv header"
			],
			why: '`\\copy` lance un `COPY` sur le serveur, et psql écrit le fichier sur ton portable avec tes propres droits. `FORMAT csv` sépare les champs par des virgules et `HEADER` écrit d’abord le nom des colonnes. Le `COPY orders TO \'orders.csv\'` en SQL écrirait le fichier sur le serveur de base de données.'
		},
		{
			prompt: 'Charge les 2 commandes de `new_orders.csv` dans `orders`. Le fichier est en CSV et sa première ligne est un en-tête.',
			accept: [
				"\\copy orders FROM 'new_orders.csv' WITH (FORMAT csv, HEADER)",
				"\\copy orders from 'new_orders.csv' with (format csv, header)",
				"\\copy orders FROM 'new_orders.csv' (FORMAT csv, HEADER)",
				"\\copy orders FROM 'new_orders.csv' WITH (FORMAT csv, HEADER true)",
				"\\copy orders FROM 'new_orders.csv' CSV HEADER",
				"\\copy orders from 'new_orders.csv' csv header",
				"\\copy orders FROM 'new_orders.csv' WITH CSV HEADER",
				"\\copy orders from 'new_orders.csv' with csv header"
			],
			why: '`FROM` lit le fichier et insère ses lignes, et psql affiche `COPY 2`. Avec `HEADER`, la première ligne est sautée. Sans lui, le chargement s’arrête sur `invalid input syntax for type bigint: "id"` et n’insère aucune ligne.'
		},
		{
			prompt: 'Exporte seulement les commandes du client 42 dans `customer42.csv`, en CSV avec une ligne d’en-tête.',
			accept: [
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' WITH (FORMAT csv, HEADER)",
				"\\copy (select * from orders where customer_id = 42) to 'customer42.csv' with (format csv, header)",
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' (FORMAT csv, HEADER)",
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' CSV HEADER",
				"\\copy (select * from orders where customer_id = 42) to 'customer42.csv' csv header",
				"\\copy (SELECT * FROM orders WHERE customer_id = 42) TO 'customer42.csv' WITH CSV HEADER",
				"\\copy (SELECT * FROM orders WHERE customer_id=42) TO 'customer42.csv' WITH (FORMAT csv, HEADER)"
			],
			why: 'À la place d’un nom de table, `\\copy` accepte une requête entre parenthèses, mais seulement avec `TO`. Le fichier reçoit l’en-tête et les commandes 1 et 3. psql prend tout le reste de la ligne comme arguments de `\\copy` : la commande doit tenir sur une ligne.'
		},
		{
			prompt: 'Affiche le plan de `SELECT * FROM orders WHERE customer_id = 42` avec le temps réel et le nombre réel de lignes de chaque étape.',
			accept: [
				'EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42',
				'explain analyze select * from orders where customer_id = 42',
				'EXPLAIN (ANALYZE) SELECT * FROM orders WHERE customer_id = 42',
				'explain (analyze) select * from orders where customer_id = 42',
				'EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id=42',
				'explain analyze select * from orders where customer_id=42'
			],
			why: '`EXPLAIN` seul affiche le plan avec des estimations. `ANALYZE` exécute vraiment la requête et ajoute le temps et les lignes réels de chaque étape, ici un `Seq Scan on orders`. Sur un `UPDATE` ou un `DELETE`, la modification a lieu aussi : entoure-le de `BEGIN` et `ROLLBACK`.'
		},
		{
			prompt: 'Depuis ton shell, lance `SELECT count(*) FROM orders` sur la base `shop` puis quitte.',
			accept: [
				"psql -d shop -c 'SELECT count(*) FROM orders'",
				'psql -d shop -c "SELECT count(*) FROM orders"',
				"psql shop -c 'SELECT count(*) FROM orders'",
				'psql shop -c "SELECT count(*) FROM orders"',
				"psql -c 'SELECT count(*) FROM orders' shop",
				'psql -c "SELECT count(*) FROM orders" shop',
				"psql -d shop -c 'select count(*) from orders'",
				"psql shop -c 'select count(*) from orders'"
			],
			why: '`-c` exécute une chaîne de commande et quitte sans lire l’entrée standard. `-d shop` nomme la base, et un `shop` sans option devant fait pareil. psql affiche le résultat en tableau, avec l’en-tête `count` et `(1 row)`.'
		},
		{
			prompt: 'Lance le même comptage pour un script shell : affiche seulement le nombre `3`, sans en-tête, sans pied `(1 row)` et sans espaces d’alignement.',
			accept: [
				"psql -d shop -At -c 'SELECT count(*) FROM orders'",
				"psql -d shop -tA -c 'SELECT count(*) FROM orders'",
				"psql -d shop -Atc 'SELECT count(*) FROM orders'",
				"psql -d shop -A -t -c 'SELECT count(*) FROM orders'",
				"psql shop -At -c 'SELECT count(*) FROM orders'",
				"psql shop -tA -c 'SELECT count(*) FROM orders'",
				"psql -At -d shop -c 'SELECT count(*) FROM orders'",
				'psql -d shop -At -c "SELECT count(*) FROM orders"'
			],
			why: '`-t` (tuples only) retire le nom des colonnes et le pied avec le nombre de lignes. `-A` (sans alignement) retire les espaces que psql ajoute pour aligner les colonnes. La sortie est la ligne `3`, prête pour `count=$(psql ...)`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu lances `\\copy orders TO \'orders.csv\' WITH (FORMAT csv, HEADER)` dans psql sur ton portable. Sur quelle machine apparaît `orders.csv`, et pourquoi ?',
		a: 'Sur ton portable. psql lit les lignes depuis le serveur et écrit le fichier lui-même, avec tes droits locaux. Le `COPY` en SQL l’écrirait sur le serveur de base de données.'
	},
	sources: [
		{ title: 'PostgreSQL : psql', url: 'https://www.postgresql.org/docs/current/app-psql.html' },
		{ title: 'PostgreSQL : COPY', url: 'https://www.postgresql.org/docs/current/sql-copy.html' },
		{ title: 'PostgreSQL : EXPLAIN', url: 'https://www.postgresql.org/docs/current/sql-explain.html' }
	]
};
