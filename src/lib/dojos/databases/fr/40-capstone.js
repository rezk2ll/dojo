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
		'Elle te demande de construire la base de sa nouvelle boutique. Pas de nouvel outil aujourd’hui. Tu la conçois **des clés jusqu’aux sauvegardes**, et chaque choix renvoie à un jour que tu as déjà fait.'
	],
	terms: [
		{ term: 'Transaction de checkout', def: 'Une seule transaction qui crée la commande, ses lignes, la baisse du stock et la tâche de confirmation. Tout est validé, ou rien (jour 17).' },
		{ term: 'Clé d’idempotence', def: 'Une valeur que le client envoie avec sa requête pour qu’un nouvel essai soit reconnu. Une contrainte unique dessus transforme le deuxième essai en no-op (jour 23).' },
		{ term: 'Update gardé', def: 'Un UPDATE dont le WHERE vérifie aussi la règle, comme `stock >= 1`. S’il ne touche aucune ligne, la règle a échoué et la transaction est annulée.' },
		{ term: 'Tâche outbox', def: 'Une ligne dans une table de tâches, écrite dans la même transaction que la commande. Un worker la prend plus tard, donc aucun e-mail ne part pour une commande annulée (jour 24).' },
		{ term: 'Exercice de restauration', def: 'Restaurer régulièrement la sauvegarde de la nuit sur un serveur de secours, pour prouver qu’elle marche avant d’en avoir besoin (jour 27).' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cust[("customers")] --> orders[("orders")]', 'orders --> lines[("order_lines")]', 'prod[("products")] --> lines'],
				highlight: ['orders', 'lines'],
				note: '**Quatre tables portent la boutique.** Chaque table a une clé primaire technique, et les faits que les gens saisissent ont leur propre contrainte unique : l’e-mail d’un client, le SKU d’un produit (jour 2). Des clés étrangères relient les lignes aux commandes et aux produits, et c’est à toi de les indexer (jour 22).'
			},
			{
				add: ['app["Requête de checkout"] -->|"une transaction"| orders', 'app -->|"stock = stock - 1 where stock >= 1"| prod'],
				highlight: ['app', 'prod'],
				note: '**Le checkout est une transaction.** Il insère la commande avec sa clé d’idempotence, baisse le stock avec un update gardé et ajoute les lignes. Un `CHECK (stock >= 0)` reste derrière comme dernier garde-fou si un chemin de code oublie le WHERE (jour 22).'
			},
			{
				add: ['orders -->|"même commit"| jobs[("jobs")]', 'worker["Worker d’e-mails"] -->|"FOR UPDATE SKIP LOCKED"| jobs'],
				highlight: ['jobs', 'worker'],
				note: '**L’e-mail est une ligne, pas un appel.** Le checkout écrit une tâche dans la même transaction. Les workers prennent les tâches avec `SKIP LOCKED`, donc deux workers ne prennent jamais la même (jour 24). Si le checkout est annulé, la tâche n’a jamais existé.'
			},
			{
				add: ['orders -.->|"flux WAL"| replica[("Réplica en lecture")]', 'replica --> report["Rapport de chiffre d’affaires mensuel"]'],
				highlight: ['replica', 'report'],
				note: '**Les rapports lisent ailleurs.** La requête du chiffre d’affaires mensuel parcourt toutes les commandes de l’année. Elle tourne sur un réplica, donc elle ne concurrence jamais les checkouts (jour 28). Quand elle devient trop lourde pour un stockage en lignes, copie les commandes dans un stockage en colonnes (jour 38).'
			},
			{
				add: ['orders -.->|"sauvegarde de base + archive WAL"| backup[("Dépôt de sauvegardes")]'],
				highlight: ['backup'],
				note: '**Les sauvegardes terminent la conception.** Une sauvegarde de base chaque nuit plus le WAL archivé te permettent de restaurer à n’importe quelle seconde, par exemple une seconde avant que quelqu’un supprime une table (jour 27). Un réplica n’est pas une sauvegarde : il rejoue aussi la suppression.'
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
			'**Deux clés, deux rôles.** `id` est une clé primaire UUID, qu’on peut montrer dans une URL sans risque. `number` est un petit entier pour les humains, tiré d’une séquence que la [migration 0129](' + SALEOR + '/saleor/order/migrations/0129_alter_order_number.py#L22-L24) crée (jour 2). Attends-toi à des trous : la doc PostgreSQL dit qu’une valeur de `nextval` « is not reclaimed for re-use if the calling transaction later aborts » (n’est pas réutilisée si la transaction est annulée) ([func-sequence](' + PG + '/func/func-sequence.sgml#L183-L185)).',
			'**Supprimer est une décision par clé étrangère.** Supprimer un utilisateur garde ses commandes et met `user` à NULL. Supprimer un canal qui a des commandes est refusé (`PROTECT`). La [doc Django](' + DJ + '/docs/ref/models/fields.txt#L1753-L1756) précise que, hors variantes `DB_*`, ces « values make Django perform the relevant actions » (c’est Django qui agit) : la base seule ne les applique pas.',
			'**Les index suivent les écrans.** Des index GIN trigrammes servent la recherche de l’admin sur `search_document` et `user_email` (jour 11), un index GIN sur `search_vector` sert la recherche plein texte (jour 37), et un B-tree sur `created_at` sert les listes triées par date. Django [indexe chaque `ForeignKey`](' + DJ + '/docs/ref/models/fields.txt#L1714) pour toi. PostgreSQL seul [ne le fait pas](' + PG + '/ddl.sgml#L1398-L1401).',
			'**L’argent n’est jamais un float.** Les totaux comme [`total_net_amount`](' + SALEOR + '/saleor/order/models.py#L270-L274) sont des `DecimalField` à [20 chiffres, dont 3 après la virgule](' + SALEOR + '/saleor/settings.py#L485-L486), que Django stocke en `numeric`. PostgreSQL recommande numeric « for storing monetary amounts and other quantities where exactness is required » (pour les montants et tout ce qui doit être exact) ([datatype](' + PG + '/datatype.sgml#L520-L523)).'
		]
	},
	tradeoff: {
		gain: [
			'Les règles qui comptent (pas de stock négatif, une commande par tentative de paiement, chaque ligne a sa commande) tiennent même quand l’appli a un bug, parce que la base les vérifie.',
			'Une transaction par checkout, c’est zéro commande à moitié faite : un crash laisse soit toute la commande, soit rien.',
			'La file, la recherche et les rapports vivent d’abord dans PostgreSQL : un seul système à sauvegarder, surveiller et restaurer.'
		],
		cost: [
			'Chaque contrainte et chaque index se paient à chaque écriture, et chaque changement de schéma sur une table chargée demande une migration prudente (jour 26).',
			'Un update gardé sur le stock fait attendre les checkouts d’un même produit sur un verrou de ligne. Pour une vente flash sur un seul article, cette ligne est le goulot (jour 20).',
			'Garder la file et les rapports dans la base principale ne coûte rien, jusqu’au jour où ça coûte. Surveille les lignes mortes de la table de tâches (jour 16) et sors les rapports quand ils gênent.'
		]
	},
	task: {
		prompt: 'Le kata. Conçois la base de la boutique de mugs. Il faut : des clients, des produits avec du stock, des commandes avec des lignes, un prestataire de paiement qui rappelle son callback en cas d’échec, un e-mail de confirmation par commande, un rapport de chiffre d’affaires mensuel, et un moyen de revenir en arrière si quelqu’un supprime la table des commandes à 14:05. Écris le DDL, la transaction de checkout et la requête du rapport, et à côté de chaque choix, le jour d’où il vient.',
		hint: 'Suis l’ordre du diagramme : tables et clés, puis ce que le checkout écrit dans une transaction, puis ce qui tourne plus tard (tâches, rapports), puis comment tout récupérer.',
		answer: [
			'**Clés** (jour 2) : `id bigint generated always as identity primary key` sur chaque table, plus `customers.email` et `products.sku` uniques. Les commandes ont aussi un `public_id uuid unique` pour les URL, pour ne pas révéler le nombre de commandes.',
			'**Contraintes** (jours 6, 22) : `NOT NULL` partout où le métier n’a pas d’« inconnu ». `products.stock integer not null check (stock >= 0)`, `price numeric(12,2) check (price >= 0)`, `order_lines.quantity check (quantity > 0)`, `orders.status check (status in (\'pending\', \'paid\', \'shipped\', \'cancelled\'))`. `order_lines` a `primary key (order_id, product_id)` et copie `unit_price`, parce que le prix du produit changera plus tard (jour 8).',
			'**Index** (jours 12, 14) : `orders (customer_id, created_at desc)` pour « mes commandes, les plus récentes d’abord », `order_lines (product_id)` parce que PostgreSQL n’indexe pas une clé étrangère pour toi, `jobs (run_at)` pour la file. Vérifie chacun avec EXPLAIN sur des données réalistes, pas sur dix lignes.',
			'**Checkout** (jours 17, 23) : dans une transaction, `insert into orders (..., idempotency_key) values (...) on conflict (idempotency_key) do nothing returning id`. Aucune ligne en retour, c’est un nouvel essai : renvoie la commande existante. Puis `update products set stock = stock - $2 where id = $1 and stock >= $2` ; zéro ligne modifiée, c’est épuisé, donc annule. Puis les lignes, puis `insert into jobs (kind, payload) values (\'order_confirmation\', ...)`.',
			'**Callback de paiement** (jour 23) : l’id d’événement du prestataire est unique dans une table `payments`, donc un callback répété n’insère rien et ne change rien.',
			'**File** (jour 24) : un worker lance `select id, kind, payload from jobs where run_at <= now() order by run_at limit 10 for update skip locked`, envoie l’e-mail, supprime la ligne, valide.',
			'**Rapport** (jours 28, 38) : `select date_trunc(\'month\', created_at) as month, sum(total) from orders where status <> \'cancelled\' group by 1 order by 1`, lancé sur le réplica. Quand il devient lent, exporte les commandes dans un fichier en colonnes et interroge celui-ci.',
			'**Sauvegardes** (jour 27) : sauvegardes de base plus archivage du WAL sur une autre machine, et un exercice de restauration chaque mois. Pour la suppression de 14:05, restaure à 14:04:59 avec la restauration à un instant donné (PITR), puis recopie la table des commandes.'
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
	takeaway: 'Les données d’une boutique, ce sont des clés et des contraintes qui tiennent les règles, une transaction par checkout, une file et des rapports qui tournent à côté, et des sauvegardes que tu as restaurées au moins une fois. Chaque morceau est un jour que tu as déjà fait.',
	sources: [
		{ title: 'Documentation PostgreSQL, Constraints', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'Documentation PostgreSQL, SELECT, la clause de verrouillage', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' },
		{ title: 'Documentation PostgreSQL, Continuous archiving and point-in-time recovery', url: 'https://www.postgresql.org/docs/current/continuous-archiving.html' },
		{ title: 'saleor/saleor, modèles de commande', url: 'https://github.com/saleor/saleor/blob/0c0e2697cc72aa999f7786ae8aeda7665bd4285f/saleor/order/models.py' }
	]
};
