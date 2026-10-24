const SALEOR = 'https://github.com/saleor/saleor/blob/0c0e2697cc72aa999f7786ae8aeda7665bd4285f';
const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/doc/src/sgml';
const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone',
	part: 'Au-delà d’un serveur',
	title: 'Capstone : les données d’une boutique',
	minutes: 10,
	hook: [
		'Une amie vend des mugs en ligne. Les commandes sont dans un tableur, le stock est un nombre qu’elle met à jour à la main, et le mois dernier **deux personnes ont payé le dernier mug bleu**.',
		'Elle te demande de construire la base de sa nouvelle boutique. Tu la conçois **des clés jusqu’aux sauvegardes**, et chaque choix renvoie à un jour que tu as déjà fait.'
	],
	terms: [
		{ term: 'Transaction de checkout', def: 'Une seule transaction qui crée la commande, ses lignes, la baisse du stock et la tâche de confirmation. Tout est validé, ou rien (jour 17).' },
		{ term: 'Clé d’idempotence', def: 'Une valeur que le client envoie avec sa requête pour qu’un nouvel essai soit reconnu. Une contrainte unique dessus transforme le deuxième essai en no-op (jour 23).' },
		{ term: 'Update gardé', def: 'Un UPDATE dont le WHERE vérifie aussi la règle, comme `stock >= 1`. S’il ne touche aucune ligne, la règle a échoué et la transaction est annulée.' },
		{ term: 'Tâche outbox', def: 'Une ligne dans une table de tâches, écrite dans la même transaction que la commande. Un worker la prend plus tard, donc aucun e-mail ne part pour une commande annulée (jour 24).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cust[("customers")] --> orders[("orders")]', 'orders --> lines[("order_lines")]', 'prod[("products")] --> lines'],
				highlight: ['orders', 'lines'],
				note: 'La boutique a besoin de quatre tables. Chaque table a une clé primaire technique, et les faits que les gens saisissent ont leur propre contrainte unique : l’e-mail d’un client, le SKU d’un produit (jour 2). Des clés étrangères relient les lignes aux commandes et aux produits, et c’est à toi de les indexer (jour 22).'
			},
			{
				add: ['app["Requête de checkout"] -->|"une transaction"| orders', 'app -->|"stock = stock - 1 where stock >= 1"| prod'],
				highlight: ['app', 'prod'],
				note: 'Le checkout tourne dans une seule transaction. Il insère la commande avec sa clé d’idempotence, baisse le stock avec un update gardé et ajoute les lignes. Un `CHECK (stock >= 0)` reste derrière comme dernier garde-fou si un chemin de code oublie le WHERE (jour 22).'
			},
			{
				add: ['orders -->|"même commit"| jobs[("jobs")]', 'worker["Worker d’e-mails"] -->|"FOR UPDATE SKIP LOCKED"| jobs'],
				highlight: ['jobs', 'worker'],
				note: 'Le checkout n’envoie pas l’e-mail lui-même : il écrit une tâche dans la même transaction. Les workers prennent les tâches avec `SKIP LOCKED`, donc deux workers ne prennent jamais la même (jour 24). Si le checkout est annulé, la tâche est annulée avec lui et aucun e-mail ne part.'
			},
			{
				add: ['orders -.->|"flux WAL"| replica[("Réplica en lecture")]', 'replica --> report["Rapport de chiffre d’affaires mensuel"]'],
				highlight: ['replica', 'report'],
				note: 'La requête du chiffre d’affaires mensuel parcourt toutes les commandes de l’année. Elle tourne sur un réplica, donc elle ne concurrence jamais les checkouts (jour 28). Quand elle est trop lourde pour un stockage en lignes, copie les commandes dans un stockage en colonnes (jour 38).'
			},
			{
				add: ['orders -.->|"sauvegarde de base + archive WAL"| backup[("Dépôt de sauvegardes")]'],
				highlight: ['backup'],
				note: 'Une sauvegarde de base chaque nuit plus le WAL archivé te permettent de restaurer à n’importe quelle seconde, par exemple une seconde avant que quelqu’un supprime une table (jour 27). Un réplica n’est pas une sauvegarde : il rejoue aussi la suppression.'
			}
		]
	},
	example: {
		title: 'saleor/order/models.py : comment une boutique open source stocke ses commandes',
		repo: 'saleor/saleor',
		url: `${SALEOR}/saleor/order/models.py#L102-L428`,
		lang: 'python',
		code: `def get_order_number():
    with connection.cursor() as cursor:
        cursor.execute("SELECT nextval('order_order_number_seq')")
        result = cursor.fetchone()
        return result[0]


class Order(ModelWithMetadata, ModelWithExternalReference):
    id = models.UUIDField(primary_key=True, editable=False, unique=True, default=uuid4)
    number = models.IntegerField(unique=True, default=get_order_number, editable=False)
    use_old_id = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=now, editable=False)
    updated_at = models.DateTimeField(auto_now=True, editable=False, db_index=True)
…
    user = models.ForeignKey(
        "account.User",
        blank=True,
        null=True,
        related_name="orders",
        on_delete=models.SET_NULL,
    )
…
    channel = models.ForeignKey(
        Channel,
        related_name="orders",
        on_delete=models.PROTECT,
    )
…
        indexes = [
            *ModelWithMetadata.Meta.indexes,
            GinIndex(
                name="order_search_gin",
                # \`opclasses\` and \`fields\` should be the same length
                fields=["search_document"],
                opclasses=["gin_trgm_ops"],
            ),
            GinIndex(
                name="order_tsearch",
                fields=["search_vector"],
            ),
            GinIndex(
                name="order_email_search_gin",
                # \`opclasses\` and \`fields\` should be the same length
                fields=["user_email"],
                opclasses=["gin_trgm_ops"],
            ),
            models.Index(fields=["created_at"], name="idx_order_created_at"),
            GinIndex(fields=["voucher_code"], name="order_voucher_code_idx"),
            GinIndex(
                fields=["user_email", "user_id"],
                name="order_user_email_user_id_idx",
            ),
            BTreeIndex(fields=["checkout_token"], name="checkout_token_btree_idx"),`,
		notes: [
			'La ligne 9 fait de `id` une clé primaire UUID, qu’on peut montrer dans une URL sans risque. La ligne 10 fait de `number` un petit entier pour les humains, tiré par les lignes 1 à 5 d’une séquence que la [migration 0129](' + SALEOR + '/saleor/order/migrations/0129_alter_order_number.py#L22-L24) crée (jour 2). Attends-toi à des trous : la doc PostgreSQL dit qu’une valeur de `nextval` « is not reclaimed for re-use if the calling transaction later aborts » (n’est pas réutilisée si la transaction est annulée, func-sequence dans les sources).',
			'Chaque clé étrangère choisit l’effet d’une suppression. Supprimer un utilisateur garde ses commandes et met `user` à NULL (ligne 20). Supprimer un canal qui a des commandes est refusé (`PROTECT`, ligne 26). La [doc Django](' + DJ + '/docs/ref/models/fields.txt#L1753-L1756) précise que, hors variantes `DB_*`, ces « values make Django perform the relevant actions » (c’est Django qui agit) : la base seule ne les applique pas.',
			'Chaque index sert un écran de l’admin. Des index GIN trigrammes (lignes 31 à 36 et 41 à 46) servent la recherche sur `search_document` et `user_email` (jour 11), un index GIN sur `search_vector` (lignes 37 à 40) sert la recherche plein texte (jour 37), et un B-tree sur `created_at` (ligne 47) sert les listes triées par date. Django [indexe chaque `ForeignKey`](' + DJ + '/docs/ref/models/fields.txt#L1714) pour toi, alors que PostgreSQL seul ne le fait pas (ddl, dans les sources).',
			'Saleor ne stocke jamais l’argent en float. Les totaux comme `total_net_amount` sont des `DecimalField` à [20 chiffres, dont 3 après la virgule](' + SALEOR + '/saleor/settings.py#L485-L486), que Django stocke en `numeric`. PostgreSQL recommande numeric « for storing monetary amounts and other quantities where exactness is required » (pour les montants et tout ce qui doit être exact, datatype dans les sources).'
		]
	},
	tradeoff: {
		gain: [
			'Les règles qui comptent (pas de stock négatif, une commande par tentative de paiement, chaque ligne a sa commande) tiennent même quand l’appli a un bug, parce que la base les vérifie.',
			'Avec une transaction par checkout, un crash laisse soit toute la commande, soit rien.',
			'La file, la recherche et les rapports vivent d’abord dans PostgreSQL : un seul système à sauvegarder, surveiller et restaurer.'
		],
		cost: [
			'Chaque contrainte et chaque index se paient à chaque écriture, et chaque changement de schéma sur une table chargée demande une migration prudente (jour 26).',
			'Un update gardé sur le stock fait attendre les checkouts d’un même produit sur un verrou de ligne. Pour une vente flash sur un seul article, cette ligne est le goulot (jour 20).',
			'La file et les rapports chargent la base principale. Surveille les lignes mortes que les tâches supprimées laissent dans la table de tâches (jour 16), et sors les rapports quand les checkouts ralentissent pendant qu’ils tournent.'
		]
	},
	task: {
		prompt: 'Conçois la base de la boutique de mugs. Il faut : des clients, des produits avec du stock, des commandes avec des lignes, un prestataire de paiement qui rappelle son callback en cas d’échec, un e-mail de confirmation par commande, un rapport de chiffre d’affaires mensuel, et un moyen de revenir en arrière si quelqu’un supprime la table des commandes à 14:05. Écris le DDL, la transaction de checkout et la requête du rapport, et à côté de chaque choix, le jour d’où il vient.',
		hint: 'Suis l’ordre du diagramme : tables et clés, puis ce que le checkout écrit dans une transaction, puis ce qui tourne plus tard (tâches, rapports), puis comment tout récupérer.',
		answer: [
			'Clés (jour 2) : `id bigint generated always as identity primary key` sur chaque table, plus `customers.email` et `products.sku` uniques. Les commandes ont aussi un `public_id uuid unique` pour les URL, pour ne pas révéler le nombre de commandes.',
			'Contraintes (jours 6, 22) : `NOT NULL` partout où le métier n’a pas d’« inconnu ». `products.stock integer not null check (stock >= 0)`, `price numeric(12,2) check (price >= 0)`, `order_lines.quantity check (quantity > 0)`, `orders.status check (status in (\'pending\', \'paid\', \'shipped\', \'cancelled\'))`. `order_lines` a `primary key (order_id, product_id)` et copie `unit_price`, parce que le prix du produit changera plus tard (jour 8).',
			'Index (jours 12, 14) : `orders (customer_id, created_at desc)` pour « mes commandes, les plus récentes d’abord », `order_lines (product_id)` parce que PostgreSQL n’indexe pas une clé étrangère pour toi, `jobs (run_at)` pour la file. Vérifie chacun avec EXPLAIN sur des données réalistes, pas sur dix lignes.',
			'Checkout (jours 17, 23) : dans une transaction, `insert into orders (..., idempotency_key) values (...) on conflict (idempotency_key) do nothing returning id`. Aucune ligne en retour, c’est un nouvel essai : renvoie la commande existante. Puis `update products set stock = stock - $2 where id = $1 and stock >= $2` ; zéro ligne modifiée, c’est épuisé, donc annule. Puis les lignes, puis `insert into jobs (kind, payload) values (\'order_confirmation\', ...)`.',
			'Callback de paiement (jour 23) : l’id d’événement du prestataire est unique dans une table `payments`, donc un callback répété n’insère rien et ne change rien.',
			'File (jour 24) : un worker lance `select id, kind, payload from jobs where run_at <= now() order by run_at limit 10 for update skip locked`, envoie l’e-mail, supprime la ligne, valide.',
			'Rapport (jours 28, 38) : `select date_trunc(\'month\', created_at) as month, sum(total) from orders where status <> \'cancelled\' group by 1 order by 1`, lancé sur le réplica. Quand il ralentit, exporte les commandes dans un fichier en colonnes et interroge celui-ci.',
			'Sauvegardes (jour 27) : sauvegardes de base plus archivage du WAL sur une autre machine, et un exercice de restauration chaque mois : restaure la sauvegarde de la nuit sur un serveur de secours pour prouver qu’elle marche. Pour la suppression de 14:05, restaure à 14:04:59 avec la restauration à un instant donné (PITR), puis recopie la table des commandes.'
		],
		steps: [
			{
				title: 'Pose les tables et les clés',
				questions: [
					{ q: 'Quelle clé primaire reçoit chaque table ?', options: ['`id bigint generated always as identity primary key`', 'L’e-mail du client, ou le SKU du produit', 'Un id `text` construit par l’application', 'Aucune : les contraintes uniques suffisent'], answer: 0, why: 'Une clé de substitution ne change jamais. Les faits que les gens tapent, comme un e-mail ou un SKU, ont leur propre contrainte unique (jour 2).' },
					{ q: 'Pourquoi les commandes ont-elles aussi un `public_id uuid unique` pour les URL ?', options: ['Les UUID accélèrent les jointures', 'Pour que l’URL ne révèle pas combien de commandes a la boutique', 'Les clés étrangères exigent un UUID', 'Les colonnes identity ne peuvent pas être affichées'], answer: 1, why: 'Un numéro de commande dans l’URL donne à n’importe qui le nombre de commandes. Un UUID aléatoire ne dit rien.' },
					{ q: 'Pourquoi `order_lines` copie-t-elle `unit_price` au lieu de lire le prix du produit ?', options: ['Ça accélère la jointure avec products', 'Les clés étrangères ne peuvent pas pointer vers des prix', 'Le prix du produit va changer, et la commande doit garder ce qui a été payé', 'Pour éviter les prix NULL'], answer: 2, why: 'La commande est la trace d’une vente passée. La ligne du produit ne connaît que le prix du jour (jour 8).' },
					{ q: 'Quel index dois-tu créer toi-même ?', options: ['Un sur `orders.id`', 'Un sur `products.sku`', 'Un sur `customers.email`', 'Un sur `order_lines (product_id)`'], answer: 3, why: 'Les clés primaires et les contraintes uniques viennent avec un index. PostgreSQL n’indexe pas une clé étrangère pour toi (jour 22).' }
				]
			},
			{
				title: 'Écris le checkout',
				questions: [
					{ q: 'Deux clients achètent le dernier mug bleu en même temps. Quel update du stock ne laisse gagner qu’un seul ?', options: ['`update products set stock = stock - 1 where id = $1 and stock >= 1`', 'Un simple `select stock`, puis un update s’il est au-dessus de zéro', 'Un index unique sur `order_lines (product_id)`', 'Un compteur de stock dans le cache de l’application'], answer: 0, why: 'L’update gardé revérifie le stock sur la ligne qu’il verrouille. Le deuxième checkout attend, puis voit 0 et ne modifie rien (jour 20).' },
					{ q: 'L’update gardé annonce zéro ligne. Que fais-tu ?', options: ['Le relancer jusqu’à ce qu’il passe', 'Annuler : le mug est épuisé', 'Valider la commande quand même', 'Mettre le stock à 0 à la main'], answer: 1, why: 'Aucune ligne touchée veut dire que la règle a échoué. Annuler retire la commande et ses lignes avec elle (jour 17).' },
					{ q: 'L’insert de commande utilise `on conflict (idempotency_key) do nothing returning id` et ne renvoie aucune ligne. Que s’est-il passé ?', options: ['L’insert a échoué et le stock est faux', 'La clé d’idempotence manque', 'C’est un nouvel essai d’un checkout déjà passé : renvoie la commande existante', 'La base a perdu la commande'], answer: 2, why: 'La contrainte unique a transformé le deuxième essai en no-op (jour 23).' },
					{ q: 'Un futur chemin de code oublie la garde `stock >= 1`. Qu’est-ce qui empêche encore un stock négatif ?', options: ['L’index unique sur `sku`', 'La clé étrangère depuis `order_lines`', 'La clé d’idempotence', '`check (stock >= 0)` sur `products`'], answer: 3, why: 'Le CHECK est la dernière garde. L’update échoue avec une erreur de contrainte au lieu de vendre un mug qui n’existe pas.' }
				]
			},
			{
				title: 'Gère ce qui tourne plus tard',
				questions: [
					{ q: 'Comment le checkout déclenche-t-il l’e-mail de confirmation ?', options: ['Il insère une ligne de tâche dans la même transaction', 'Il envoie l’e-mail avant le commit', 'Le prestataire de paiement l’envoie depuis son callback', 'Un job de nuit envoie les commandes du jour'], answer: 0, why: 'Si le checkout est annulé, la ligne de tâche l’est avec lui, donc aucun e-mail ne part pour une commande qui n’existe pas (jour 24).' },
					{ q: 'Comment deux workers évitent-ils d’envoyer deux fois le même e-mail ?', options: ['Chacun lit les tâches avec un simple `select`', 'Ils prennent les tâches avec `for update skip locked`', 'Ils choisissent les tâches avec `order by random()`', 'Ils passent à tour de rôle, un par minute'], answer: 1, why: 'Une ligne verrouillée par un worker est sautée par l’autre, donc chaque tâche n’est prise qu’une fois (jour 24).' },
					{ q: 'Le prestataire de paiement rappelle son callback. Qu’est-ce qui rend ce rappel inoffensif ?', options: ['Une vérification dans l’application d’un paiement des dernières secondes', 'Une séquence qui donne un nouveau numéro au rappel', 'Une contrainte unique sur l’id d’événement du prestataire dans `payments`', 'Un CHECK qui impose un montant au-dessus de zéro'], answer: 2, why: 'La base vérifie la contrainte unique au moment de l’insert, entre transactions concurrentes. Une vérification dans l’application subit une course (jour 23).' },
					{ q: 'Où tourne le rapport de chiffre d’affaires mensuel ?', options: ['Dans la transaction de checkout, pour des données fraîches', 'Sur le primaire, avec un B-tree sur chaque colonne', 'À partir d’un total courant dans une colonne JSONB', 'Sur un réplica, puis sur une copie en colonnes quand il le dépasse'], answer: 3, why: 'Il parcourt toutes les commandes de l’année. Un réplica tient ça loin des checkouts (jour 28), et une copie en colonnes rend le parcours peu coûteux (jour 38).' }
				]
			},
			{
				title: 'Prévois le retour en arrière',
				questions: [
					{ q: 'Qu’est-ce qui permet de restaurer la base à n’importe quelle seconde ?', options: ['Des sauvegardes de base plus le WAL archivé', 'Un réplica en streaming', 'Un `pg_dump` de nuit seul', 'Du RAID sur le disque de la base'], answer: 0, why: 'Une sauvegarde de base est le point de départ, et rejouer le WAL archivé l’amène jusqu’à la seconde choisie (jour 27).' },
					{ q: 'Pourquoi le réplica ne sert à rien après la suppression de la table `orders` ?', options: ['Il a quelques secondes de retard', 'Il rejoue la suppression lui aussi', 'Il est en lecture seule', 'Il ne contient que les index'], answer: 1, why: 'Un réplica copie chaque changement, erreurs comprises. Un réplica n’est pas une sauvegarde.' },
					{ q: 'La table a été supprimée à 14:05. Quelle cible de restauration choisis-tu ?', options: ['La sauvegarde de la nuit, sans WAL', '14:06, par sécurité', '14:04:59', 'Le dernier WAL, pour ne rien perdre'], answer: 2, why: 'Arrête-toi une seconde avant la suppression, puis recopie la table des commandes dans la base en service.' },
					{ q: 'Comment sais-tu que les sauvegardes marcheront le jour où tu en auras besoin ?', options: ['Le job de sauvegarde sort avec 0', 'Les fichiers de sauvegarde ont la bonne taille', 'L’archive WAL est sur une autre machine', 'Un exercice mensuel restaure la sauvegarde de la nuit sur un serveur de secours'], answer: 3, why: 'Seule une restauration prouve une sauvegarde. Les autres vérifications montrent que des fichiers existent, pas qu’ils remettent la boutique en marche.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Deux clients passent commande du dernier mug bleu au même moment. Quelle conception garantit qu’un seul des deux l’obtient ?',
			options: [
				'Baisser le stock avec `where id = $1 and stock >= 1`, et annuler si aucune ligne n’a changé',
				'Lire le stock avec un simple SELECT d’abord, puis le baisser s’il est encore au-dessus de zéro',
				'Ajouter un index unique sur `order_lines (product_id)` pour que chaque produit se vende une fois',
				'Garder le stock dans un cache côté appli et le baisser avant d’écrire la commande'
			],
			answer: 0,
			why: 'L’update gardé revérifie le stock sur la ligne qu’il verrouille, donc le deuxième checkout voit 0 et ne modifie rien. Un simple SELECT puis UPDATE laisse les deux lire 1 avant que l’un des deux écrive (jour 20).'
		},
		{
			q: 'Le prestataire de paiement appelle ton callback deux fois pour le même paiement, à une seconde d’écart. Qu’est-ce qui rend le deuxième appel sans effet ?',
			options: [
				'Vérifier dans l’appli si un paiement a été enregistré dans les dernières secondes',
				'Une contrainte unique sur l’id d’événement du prestataire, insérée avec ON CONFLICT DO NOTHING',
				'Une séquence pour les numéros de paiement, pour que le deuxième appel ait un autre numéro',
				'Une contrainte CHECK qui impose que le montant de chaque paiement soit au-dessus de zéro'
			],
			answer: 1,
			why: 'Seule la contrainte unique est vérifiée par la base au moment de l’insertion, entre transactions concurrentes. Une vérification dans l’appli est une course : les deux appels peuvent regarder avant que l’un des deux insère (jour 23).'
		},
		{
			q: 'Le rapport de chiffre d’affaires mensuel prend maintenant une minute, et les checkouts ralentissent pendant qu’il tourne. Quel est le meilleur premier geste ?',
			options: [
				'Ajouter un index B-tree sur chaque colonne que le rapport groupe ou filtre',
				'Lancer le rapport dans la transaction de checkout pour qu’il lise des données fraîches',
				'Le lancer sur un réplica, puis le passer sur une copie en colonnes quand ça ne suffit plus',
				'Stocker un total de chiffre d’affaires cumulé dans une colonne JSONB de chaque commande'
			],
			answer: 2,
			why: 'Un rapport qui lit toutes les commandes est un parcours complet qu’aucun index n’évite. Un réplica retire la charge du primaire (jour 28), et une copie en colonnes rend le parcours lui-même peu coûteux (jour 38).'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Construire les tables centrales de la boutique et prouver quatre règles pour de vrai : un seul acheteur pour le dernier mug, un checkout rejoué ne fait rien, une commande annulée n’envoie pas d’e-mail, et deux workers ne prennent jamais la même tâche.',
		steps: [
			'Lance PostgreSQL : `docker run -d --name shop-lab -e POSTGRES_PASSWORD=lab postgres:16`, attends quelques secondes, puis ouvre deux terminaux, A et B, qui lancent chacun `docker exec -it shop-lab psql -U postgres`.',
			'Dans A, crée les tables : `CREATE TABLE products (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sku text NOT NULL UNIQUE, price numeric(12,2) NOT NULL CHECK (price >= 0), stock integer NOT NULL CHECK (stock >= 0)); CREATE TABLE orders (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, idempotency_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT \'pending\' CHECK (status IN (\'pending\', \'paid\', \'shipped\', \'cancelled\')), total numeric(12,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE jobs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL, run_at timestamptz NOT NULL DEFAULT now()); INSERT INTO products (sku, price, stock) VALUES (\'MUG-BLUE\', 12.00, 1);`. Puis essaie `UPDATE products SET stock = stock - 2 WHERE sku = \'MUG-BLUE\';`.',
			'Le dernier mug : dans A, `BEGIN; UPDATE products SET stock = stock - 1 WHERE sku = \'MUG-BLUE\' AND stock >= 1;`. Dans B, lance les deux mêmes instructions et regarde-le attendre. Dans A, `COMMIT;`. Lis le résultat de B, puis `ROLLBACK;` dans B.',
			'Le checkout rejoué : dans A, lance deux fois `INSERT INTO orders (idempotency_key, total) VALUES (\'pay-7f3a\', 12.00) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id;`.',
			'L’outbox : dans A, `BEGIN; INSERT INTO orders (idempotency_key, total) VALUES (\'pay-9c01\', 12.00); INSERT INTO jobs (kind, payload) VALUES (\'order_confirmation\', \'{}\'); ROLLBACK; SELECT count(*) FROM jobs;`.',
			'Deux workers : dans A, `INSERT INTO jobs (kind, payload) SELECT \'order_confirmation\', jsonb_build_object(\'n\', g) FROM generate_series(1, 3) g;`. Puis dans A et dans B, `BEGIN; SELECT id FROM jobs WHERE run_at <= now() ORDER BY run_at LIMIT 2 FOR UPDATE SKIP LOCKED;`, A d’abord. `COMMIT;` dans les deux. Quand tu as fini : `docker rm -f shop-lab`.'
		],
		done: [
			'`stock - 2` échoue avec `violates check constraint "products_stock_check"`.',
			'B attend que A valide, puis affiche `UPDATE 0`, et `SELECT stock FROM products` montre 0.',
			'Le premier insert idempotent renvoie un id et `INSERT 0 1`. Le deuxième ne renvoie aucune ligne et `INSERT 0 0`.',
			'Après l’annulation, `SELECT count(*) FROM jobs` vaut 0.',
			'A obtient deux ids de tâche, B obtient le troisième : aucun id n’apparaît des deux côtés.'
		],
		solution: [
			'Le `UPDATE 0` de B est le signal d’épuisement : l’application annule et prévient le deuxième client. Personne n’a payé un mug qui n’existait pas.',
			'Dans l’application, un `RETURNING` vide veut dire nouvel essai : retrouve la commande par sa `idempotency_key` et renvoie-la.',
			'Insère encore une commande et regarde son id : elle reçoit 4, pas 2, parce que l’insert en conflit et la commande annulée ont quand même consommé des valeurs identity. `orders.id` a des trous. C’est normal, et une raison de plus d’afficher `public_id` à la place.',
			'La restauration à un instant donné demande l’archivage du WAL et un deuxième serveur, donc elle est laissée de côté ici. Le jour 27 la détaille.'
		]
	},
	recall: {
		q: 'Deux clients achètent le dernier mug bleu au même moment. Quelle instruction de la transaction de checkout arrête le deuxième, et qu’arrive-t-il à sa commande ?',
		a: '`update products set stock = stock - 1 where id = $1 and stock >= 1`. Pour le deuxième checkout, elle ne modifie aucune ligne, donc la transaction est annulée : sa commande, ses lignes et sa tâche d’e-mail ne sont jamais validées.'
	},
	sources: [
		{ title: 'Sources de la doc PostgreSQL, func-sequence.sgml (les valeurs de nextval ne sont pas réutilisées)', url: `${PG}/func/func-sequence.sgml#L183-L185` },
		{ title: 'Sources de la doc PostgreSQL, ddl.sgml (les clés étrangères ne sont pas indexées pour toi)', url: `${PG}/ddl.sgml#L1398-L1401` },
		{ title: 'Sources de la doc PostgreSQL, datatype.sgml (numeric pour l’argent)', url: `${PG}/datatype.sgml#L520-L523` },
		{ title: 'saleor/saleor, Order.total_net_amount', url: `${SALEOR}/saleor/order/models.py#L270-L274` },
		{ title: 'Documentation PostgreSQL, Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'Documentation PostgreSQL, SELECT, la clause de verrouillage', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' },
		{ title: 'Documentation PostgreSQL, Continuous archiving and point-in-time recovery', url: 'https://www.postgresql.org/docs/current/continuous-archiving.html' },
		{ title: 'saleor/saleor, modèles de commande', url: 'https://github.com/saleor/saleor/blob/0c0e2697cc72aa999f7786ae8aeda7665bd4285f/saleor/order/models.py' }
	]
};
