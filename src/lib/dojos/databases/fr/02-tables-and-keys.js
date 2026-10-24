const GITEA = 'https://github.com/go-gitea/gitea/blob/078198d38dc02a05156b817648817799f11ebea2';
const ISSUE = `${GITEA}/models/issues/issue.go`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tables-and-keys',
	part: 'Les données et les questions',
	title: 'Tables, lignes et clés',
	minutes: 10,
	hook: [
		'Un client s’inscrit deux fois avec le même email, une fois en minuscules, une fois avec une majuscule. Te voilà avec **deux comptes, deux paniers et un ticket au support** qui demande lequel est le bon.',
		'Ou l’inverse : tu as pris l’email comme clé, le client en change, et **chaque commande, chaque facture et chaque ligne de log pointent encore vers l’ancien**.',
		'Les deux bugs viennent d’une question à laquelle tu réponds dès le premier jour, souvent sans t’en rendre compte : **qu’est-ce qui identifie une ligne ?** Une clé, c’est cette réponse, écrite noir sur blanc pour que la base la fasse respecter.'
	],
	terms: [
		{ term: 'Clé primaire', def: 'La ou les colonnes qui identifient une ligne. PostgreSQL exige qu’elles soient uniques et non nulles, et construit dessus un index B-tree unique.' },
		{ term: 'Clé étrangère', def: 'Une colonne dont la valeur doit correspondre à une clé d’une autre table. La base refuse une commande qui pointe vers un client qui n’existe pas.' },
		{ term: 'Clé naturelle', def: 'Une clé tirée du monde réel : un email, un ISBN, « le ticket 42 de ce dépôt ». Les gens peuvent la changer, comme un client qui change d’email.' },
		{ term: 'Clé de substitution', def: 'Une clé sans signification, fabriquée par la base : 1, 2, 3 tirés d’une séquence, ou un UUID aléatoire. Elle n’a jamais besoin de changer.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['repo[("repository : id = 7")]'],
				highlight: ['repo'],
				note: 'Dans Gitea, les tables des dépôts et des tickets commencent toutes deux par un `ID int64` marqué `pk autoincr`, une clé de substitution. Le nombre 7 ne contient aucun fait sur le dépôt, donc aucun fait n’a besoin de rester figé pour que la clé reste valable.'
			},
			{
				add: ['issue[("issue : id = 9001, repo_id = 7, index = 42")]', 'issue -->|"repo_id"| repo'],
				highlight: ['issue'],
				note: 'La ligne du ticket porte deux clés : sa propre clé de substitution `id`, et la paire unique `(repo_id, index)`. L’`index` est le « #42 » de l’URL. Les gens tapent ce numéro, le partagent et comptent sur lui : c’est une clé naturelle.'
			},
			{
				add: ['url["URL : /owner/repo/issues/42"] -->|"GetIssueByIndex(7, 42)"| issue'],
				highlight: ['url'],
				note: 'Les gens passent par la clé naturelle. Le [handler de la page du ticket](' + GITEA + '/routers/web/repo/issue.go#L183) appelle `GetIssueByIndex` avec l’ID du dépôt courant et le numéro de l’URL. Dans la base, les autres lignes pointent plutôt vers la clé de substitution `issue.ID`.'
			},
			{
				add: ['counter[("issue_index : group_id = 7, max_index = 42")]', 'counter -.->|"numéro suivant, même transaction"| issue'],
				highlight: ['counter'],
				note: 'Une séquence numérote les lignes de toute la table, elle ne peut donc pas donner à chaque dépôt ses propres 1, 2, 3. Gitea garde une ligne de compteur par dépôt et l’incrémente dans la transaction même qui insère le ticket.'
			},
			{
				add: ['comment[("comment : issue_id = 9001")]', 'comment -->|"issue_id"| issue'],
				highlight: ['comment'],
				note: 'Un commentaire stocke la clé de substitution `issue_id`, jamais `(repo_id, index)`. Le tag de struct sur `Comment.IssueID` demande un index et aucune clé étrangère. Donc quand un ticket est supprimé, c’est le code de Gitea qui doit supprimer chaque ligne enfant.'
			}
		]
	},
	example: {
		title: 'models/issues/issue.go : le ticket de Gitea, avec une clé de substitution et une clé naturelle',
		repo: 'go-gitea/gitea',
		url: `${ISSUE}#L54-L509`,
		lang: 'go',
		code: `type Issue struct {
	ID                int64                  \`xorm:"pk autoincr"\`
	RepoID            int64                  \`xorm:"INDEX UNIQUE(repo_index)"\`
	Repo              *repo_model.Repository \`xorm:"-"\`
	Index             int64                  \`xorm:"UNIQUE(repo_index)"\` // Index in one repository.
	PosterID          int64                  \`xorm:"INDEX"\`
…
func GetIssueByIndex(ctx context.Context, repoID, index int64) (*Issue, error) {
	if index < 1 {
		return nil, ErrIssueNotExist{}
	}
	issue, has, err := db.Get[Issue](ctx, builder.Eq{"repo_id": repoID, "\`index\`": index})
	if err != nil {
		return nil, err
	} else if !has {
		return nil, ErrIssueNotExist{0, repoID, index}
	}
	return issue, nil
}`,
		notes: [
			'La ligne 2 marque `ID` en `pk autoincr`, la clé de substitution. Les lignes 3 et 5 mettent `RepoID` et `Index` dans `UNIQUE(repo_index)`, une contrainte d’unicité sur deux colonnes qui porte la clé naturelle. La base refuse elle-même un second ticket 42 dans le même dépôt, quoi que fasse le code Go.',
			'La ligne 12 fait la recherche : `GetIssueByIndex` filtre sur `repo_id` et `index`. Un index unique couvre cette paire, donc la recherche lit quelques pages d’index au lieu de toute la table.',
			'Sur PostgreSQL, Gitea tire le numéro suivant d’un dépôt de [`postgresGetNextResourceIndex`](' + GITEA + '/models/db/index.go#L56-L67), un upsert : `INSERT ... ON CONFLICT (group_id) DO UPDATE SET max_index = %s.max_index+1 RETURNING max_index`. Son appelant `GetNextResourceIndex` prévient : « it must run in the same transaction where the resource is created » (à lancer dans la transaction qui crée la ressource), et `NewIssue` le fait (les deux sont dans les sources).',
			'Sans clés étrangères, Gitea fait le ménage à la main. [`deleteIssue`](' + GITEA + '/services/issue/issue.go#L199-L253) enchaîne 18 suppressions de lignes enfants, dans une seule transaction. Quelques lignes plus bas, `DeleteOrphanedIssues` sert à « delete issues without a repo », des lignes qu’une clé étrangère n’aurait jamais laissées exister.'
		]
	},
	tradeoff: {
		gain: [
			'Une clé primaire donne à chaque ligne une adresse qui ne bouge jamais, et PostgreSQL l’indexe pour toi.',
			'Une clé étrangère rend impossible « une commande pour un client qui n’existe pas », quel que soit le code qui l’écrit.',
			'Une clé de substitution laisse la clé naturelle changer : un nouvel email ou un dépôt renommé, c’est un UPDATE, pas la réécriture de chaque table qui pointe dessus.',
			'Une contrainte d’unicité sur la clé naturelle attrape quand même le doublon, même quand la clé primaire est un nombre sans signification.'
		],
		cost: [
			'Avec deux clés par table, chaque insert met à jour deux index.',
			'Une clé étrangère n’indexe pas le côté qui référence. La doc : « the declaration of a foreign key constraint does not automatically create an index on the referencing columns », donc un delete sur le parent peut parcourir toute la table enfant.',
			'Les UUID aléatoires tombent à des endroits aléatoires d’un B-tree. RFC 9562 : l’UUIDv4 a une « poor database-index locality » (mauvaise localité dans l’index), donc les inserts « are performed at random locations ». PostgreSQL 18 propose `uuidv7()`, ordonné dans le temps.',
			'Un bigint tiré d’une séquence trahit l’ordre et le volume (la commande 1041 est venue après la 1040), et la doc prévient qu’il peut y avoir des « holes » (des trous).'
		]
	},
	task: {
		prompt: 'Esquisse les clés d’une petite boutique dans `psql` : `customers`, `products` (chacun a un SKU imprimé sur la boîte), `orders` et `order_items`. Pour chaque table, écris la clé primaire, les clés étrangères avec leur action ON DELETE, et toute contrainte d’unicité en plus. Puis dis quel index PostgreSQL ne créera pas pour toi.',
		hint: 'Donne à chaque table une clé sans signification, puis demande-toi quelle valeur du monde réel ne doit quand même jamais se répéter. Pour ON DELETE, demande-toi si l’enfant peut exister sans son parent.',
		answer: [
			'`customers` : `id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, plus `CREATE UNIQUE INDEX ON customers (lower(email))`, pour que « Ana@x.io » et « ana@x.io » entrent en collision.',
			'`products` : un `id` de substitution, plus `sku text UNIQUE NOT NULL`. Le SKU est la clé naturelle par laquelle on cherche. Il reste hors des clés étrangères, pour pouvoir le corriger plus tard.',
			'`orders` : un `id` de substitution, `customer_id bigint NOT NULL REFERENCES customers ON DELETE RESTRICT`. Une commande est la trace d’une vente et ne doit pas disparaître avec un compte.',
			'`order_items` : `order_id REFERENCES orders ON DELETE CASCADE`, `product_id REFERENCES products ON DELETE RESTRICT`, `PRIMARY KEY (order_id, product_id)`. Une ligne fait partie de sa commande, comme dans l’exemple de la doc.',
			'Index manquants : `orders.customer_id` et `order_items.product_id`. Les clés primaires et les contraintes d’unicité sont indexées, les colonnes qui référencent ne le sont pas. Ajoute `CREATE INDEX ON orders (customer_id)` et `CREATE INDEX ON order_items (product_id)`.'
		],
		steps: [
			{
				title: 'Pose les clés des clients',
				questions: [
					{ q: 'Quelle clé primaire donnes-tu à `customers` ?', options: ['`email text PRIMARY KEY`', '`(email, name) PRIMARY KEY`', '`id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY`', '`phone text PRIMARY KEY`'], answer: 2, why: 'Une clé de substitution ne stocke aucun fait sur le client, donc aucun fait n’a besoin de rester le même pour que la clé reste valide.' },
					{ q: 'Pourquoi ne pas prendre l’email comme clé primaire ?', options: ['PostgreSQL ne sait pas indexer les colonnes texte', 'Le client en change, et chaque commande pointe encore vers l’ancien', 'Un email est trop long pour tenir dans une page de B-tree', 'Deux clients ne peuvent de toute façon jamais partager un email'], answer: 1, why: 'Une clé naturelle vient du monde réel, et les gens la changent. Avec une clé de substitution, un nouvel email, c’est un UPDATE.' },
					{ q: 'Comment faire entrer en collision « Ana@x.io » et « ana@x.io » ?', options: ['`CREATE UNIQUE INDEX ON customers (lower(email))`', '`email text UNIQUE`', '`CREATE INDEX ON customers (email)`', '`CHECK (email <> \'\')`'], answer: 0, why: 'Un simple `UNIQUE` compare le texte exact, donc les deux écritures passent. Un index unique sur `lower(email)` les compare en minuscules.' },
					{ q: 'Que fait PostgreSQL quand tu déclares une clé primaire ?', options: ['Il rend la colonne unique, mais accepte encore les nulls', 'Il crée une clé étrangère vers chaque table qui l’utilise', 'Il rend la colonne unique et non nulle, et construit un index B-tree unique', 'Il note seulement la clé ; l’index, c’est à toi de l’ajouter'], answer: 2, why: 'La clé primaire est unique et non nulle, et PostgreSQL l’indexe pour toi.' }
				]
			},
			{
				title: 'Pose les clés des produits',
				questions: [
					{ q: 'Chaque produit a un SKU imprimé sur la boîte. Quelle est la clé primaire de `products` ?', options: ['Le SKU, puisqu’il est déjà unique', 'Un `id` de substitution, avec le SKU en `UNIQUE NOT NULL`', 'Le nom du produit, avec le SKU en index', 'La paire `(sku, name)`'], answer: 1, why: 'Le SKU est la clé naturelle par laquelle on cherche. L’`id` de substitution est ce vers quoi pointent les autres tables.' },
					{ q: 'Pourquoi garder le SKU hors des clés étrangères de `order_items` ?', options: ['Pour pouvoir corriger le SKU plus tard avec un UPDATE', 'Parce qu’une clé étrangère ne peut pas pointer vers une colonne texte', 'Parce qu’un SKU est plus long qu’un bigint', 'Parce que les SKU ne sont pas uniques'], answer: 0, why: 'Si d’autres lignes stockaient le SKU, corriger une faute de frappe voudrait dire réécrire chaque table qui pointe dessus.' },
					{ q: 'La clé primaire est un nombre sans signification. Que t’apporte encore `sku text UNIQUE NOT NULL` ?', options: ['Des inserts plus rapides, avec un index de moins', 'Rien, la clé primaire le couvre déjà', 'Une clé étrangère de `order_items` vers le SKU', 'Un refus quand quelqu’un saisit deux fois le même SKU'], answer: 3, why: 'Une contrainte d’unicité sur la clé naturelle attrape quand même le doublon, même quand la clé primaire est un nombre.' },
					{ q: '`products` a maintenant un `id` de substitution et `sku UNIQUE NOT NULL`. Que coûte chaque nouveau produit à l’insert ?', options: ['Un parcours complet de `products` pour vérifier le SKU', 'Rien de plus : seule la clé primaire est indexée', 'Une entrée dans deux index, la clé primaire et le SKU', 'Un verrou sur chaque ligne de `order_items`'], answer: 2, why: 'Deux clés par table, ce sont deux index uniques, et les deux sont mis à jour à chaque insert.' }
				]
			},
			{
				title: 'Relie les commandes',
				questions: [
					{ q: 'Que fait `orders.customer_id` quand quelqu’un supprime le client ?', options: ['`ON DELETE CASCADE` : les commandes partent avec le compte', '`ON DELETE SET NULL` : les commandes restent, sans client', 'Pas de clé étrangère du tout, donc le delete passe toujours', '`ON DELETE RESTRICT` : le delete échoue tant qu’il y a des commandes'], answer: 3, why: 'Une commande est la trace d’une vente. Elle ne doit pas disparaître avec un compte.' },
					{ q: 'Que fait `order_items.order_id` quand quelqu’un supprime la commande ?', options: ['`ON DELETE CASCADE` : ses lignes partent avec elle', '`ON DELETE RESTRICT` : le delete échoue', '`ON DELETE SET NULL` : les lignes restent seules', 'Rien, les lignes n’ont pas de clé étrangère'], answer: 0, why: 'Une ligne fait partie de sa commande et ne peut pas exister sans elle, comme dans l’exemple de la doc.' },
					{ q: 'Que fait `order_items.product_id` quand quelqu’un supprime un produit ?', options: ['`ON DELETE CASCADE` : les anciennes lignes de commande disparaissent', '`ON DELETE RESTRICT` : le delete échoue tant que des lignes pointent dessus', '`ON DELETE SET NULL` : les lignes perdent leur produit', 'Pas de clé étrangère, donc le produit peut partir'], answer: 1, why: 'Les anciennes commandes doivent continuer à dire ce qui a été vendu, donc un produit utilisé ne peut pas être supprimé.' },
					{ q: 'Quelle est la clé primaire de `order_items` ?', options: ['`order_id` seul', '`product_id` seul', 'Un UUIDv4 aléatoire', '`PRIMARY KEY (order_id, product_id)`'], answer: 3, why: 'Une ligne est identifiée par sa commande et son produit. La paire apparaît une fois par commande.' }
				]
			},
			{
				title: 'Trouve les index manquants',
				questions: [
					{ q: 'Quelle colonne PostgreSQL n’indexera-t-il pas pour toi ?', options: ['`customers.id`', '`products.sku`', '`orders.customer_id`', '`order_items (order_id, product_id)`'], answer: 2, why: 'Les clés primaires et les contraintes d’unicité ont un index. Le côté qui référence d’une clé étrangère n’en a pas.' },
					{ q: 'Quelle autre colonne qui référence a besoin de son propre index ?', options: ['`order_items.product_id`', '`customers.email`', '`orders.id`', '`products.id`'], answer: 0, why: 'La doc : « the declaration of a foreign key constraint does not automatically create an index on the referencing columns ».' },
					{ q: 'Sans index sur `orders.customer_id`, qu’est-ce qui devient lent ?', options: ['Insérer un nouveau client', 'Supprimer un client, ce qui peut parcourir tout `orders`', 'Lire un client par son `id`', 'Changer l’email d’un client'], answer: 1, why: 'Pour faire respecter RESTRICT, PostgreSQL doit trouver les commandes de ce client. Sans index, un delete sur le parent peut parcourir toute la table enfant.' },
					{ q: 'Gitea ne déclare aucune clé étrangère. Que fait son code quand un ticket est supprimé ?', options: ['Rien : la base supprime les enfants', 'Il cache le ticket et garde toutes les lignes', 'Il lance lui-même les deletes de chaque ligne enfant, dans une transaction', 'Il laisse `DeleteOrphanedIssues` supprimer le ticket plus tard'], answer: 2, why: '`deleteIssue` aligne 18 deletes de lignes enfants dans une transaction. Une clé étrangère ferait cette vérification pour chaque chemin du code.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Gitea ouvre `/owner/repo/issues/42`. Quelles colonnes utilise-t-il pour trouver la ligne ?',
			options: [
				'`id`, car 42 est la clé primaire de la table des tickets',
				'`repo_id` et `index`, la paire couverte par `UNIQUE(repo_index)`',
				'`index` seul, car les numéros de tickets sont uniques dans tout Gitea',
				'`poster_id` et `index`, car chaque utilisateur numérote ses tickets'
			],
			answer: 1,
			why: '`GetIssueByIndex(ctx, repoID, index)` filtre sur `repo_id` et `index`. Le numéro de l’URL n’est unique que dans un dépôt, il lui faut donc le dépôt pour identifier une ligne. Les autres tables stockent la clé de substitution `id`.'
		},
		{
			q: 'Tu ajoutes `order_id bigint REFERENCES orders` à `order_items`. Quel index PostgreSQL crée-t-il pour cette contrainte ?',
			options: [
				'Un index sur `order_items.order_id`, pour garder les jointures et les deletes rapides',
				'Un index unique sur `order_items.order_id`, puisqu’il pointe vers une clé primaire',
				'Aucun pour la clé étrangère ; `orders.id` est déjà indexé comme clé primaire',
				'Les deux, un de chaque côté, car la contrainte est vérifiée depuis les deux tables'
			],
			answer: 2,
			why: 'Le côté référencé doit être une clé primaire ou unique, il a donc toujours un index. Le côté qui référence n’en a aucun : la doc dit « the declaration of a foreign key constraint does not automatically create an index on the referencing columns ». Ajoute-le toi-même si tu supprimes des parents ou fais souvent la jointure.'
		},
		{
			q: 'Une table de 500 millions de lignes utilise un UUIDv4 aléatoire comme clé primaire. Pourquoi les inserts sont-ils plus lents qu’avec un bigint tiré d’une séquence ?',
			options: [
				'Chaque nouvelle clé tombe à un endroit aléatoire du B-tree, donc plus de pages touchées',
				'PostgreSQL compare chaque nouvel UUID à tous les autres en parcourant toute la table',
				'Les UUID sont stockés en texte de 36 caractères, donc chaque entrée d’index est bien plus grosse',
				'Le type uuid ne s’indexe pas en B-tree, donc PostgreSQL passe par un index hash'
			],
			answer: 0,
			why: 'RFC 9562 : les valeurs UUIDv4 « are not close to each other in the index; thus, they require inserts to be performed at random locations ». Une séquence ajoute toujours au bord droit, et pour les UUID ordonnés dans le temps comme le v7, « the new values are near each other in the index ». Les B-trees reviennent au jour 10.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Poser les clés de la boutique dans un PostgreSQL local, voir chaque contrainte refuser une mauvaise ligne, et trouver les index que PostgreSQL n’a pas créés.',
		steps: [
			'Lance un PostgreSQL jetable : `docker run -d --name pg-keys -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis vérifie avec `docker exec pg-keys psql -U postgres -c "SELECT 1;"`.',
			'Écris `shop.sql` avec les quatre tables et les clés choisies dans l’exercice, plus un client `Ana@x.io`, un produit `MUG-01`, une commande et une ligne de commande.',
			'Charge-le : `docker exec -i pg-keys psql -U postgres < shop.sql`.',
			'Essaie trois mauvaises écritures : `docker exec pg-keys psql -U postgres -c "INSERT INTO customers (email) VALUES (\'ana@x.io\');"`, puis `-c "INSERT INTO orders (customer_id) VALUES (99);"`, puis `-c "DELETE FROM customers WHERE id = 1;"`.',
			'Supprime la commande et compte ses lignes : `docker exec pg-keys psql -U postgres -c "DELETE FROM orders WHERE id = 1;" -c "SELECT count(*) FROM order_items;"`. Puis liste les index avec `docker exec pg-keys psql -U postgres -c "\\di"`. Nettoie avec `docker rm -f pg-keys`.'
		],
		done: [
			'Le second email échoue avec `duplicate key value violates unique constraint`.',
			'La commande du client 99 échoue avec `violates foreign key constraint`, et la suppression du client échoue avec `violates RESTRICT setting`.',
			'Après la suppression de la commande, `order_items` compte `0` ligne.',
			'`\\di` ne liste aucun index sur `orders.customer_id` ni sur `order_items.product_id`.'
		],
		solution: [
			'`CREATE TABLE customers (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, email text NOT NULL); CREATE UNIQUE INDEX ON customers (lower(email));`',
			'`CREATE TABLE products (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, sku text UNIQUE NOT NULL);`',
			'`CREATE TABLE orders (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, customer_id bigint NOT NULL REFERENCES customers ON DELETE RESTRICT);`',
			'`CREATE TABLE order_items (order_id bigint REFERENCES orders ON DELETE CASCADE, product_id bigint REFERENCES products ON DELETE RESTRICT, qty int NOT NULL, PRIMARY KEY (order_id, product_id));`',
			'Les lignes de départ : `INSERT INTO customers (email) VALUES (\'Ana@x.io\'); INSERT INTO products (sku) VALUES (\'MUG-01\'); INSERT INTO orders (customer_id) VALUES (1); INSERT INTO order_items VALUES (1, 1, 2);`. Ajoute ensuite les deux index manquants avec `CREATE INDEX ON orders (customer_id); CREATE INDEX ON order_items (product_id);` et relance `\\di`.'
		]
	},
	recall: {
		q: 'Gitea range le ticket #42 du dépôt 7 dans la ligne d’id 9001. Quelle clé les commentaires stockent-ils, et qu’est-ce qui empêche un second #42 dans le dépôt 7 ?',
		a: 'Les commentaires stockent la clé de substitution, `issue_id = 9001`. La contrainte d’unicité `UNIQUE(repo_index)` sur `(repo_id, index)` refuse un second ticket 42 dans le dépôt 7.'
	},
	sources: [
		{ title: 'Gitea, models/db/index.go (GetNextResourceIndex)', url: `${GITEA}/models/db/index.go#L114` },
		{ title: 'Gitea, models/issues/issue_update.go (NewIssue)', url: `${GITEA}/models/issues/issue_update.go#L452-L461` },
		{ title: 'Gitea, services/issue/issue.go (DeleteOrphanedIssues)', url: `${GITEA}/services/issue/issue.go#L256-L257` },
		{ title: 'Doc PostgreSQL, Constraints (clés primaires et étrangères)', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'Doc PostgreSQL, Identity Columns', url: 'https://www.postgresql.org/docs/current/ddl-identity-columns.html' },
		{ title: 'Doc PostgreSQL, UUID Type', url: 'https://www.postgresql.org/docs/current/datatype-uuid.html' },
		{ title: 'Doc PostgreSQL, UUID Functions', url: 'https://www.postgresql.org/docs/current/functions-uuid.html' },
		{ title: 'Doc PostgreSQL, Serial Types', url: 'https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL' },
		{ title: 'RFC 9562, Universally Unique IDentifiers (UUIDs)', url: 'https://www.rfc-editor.org/rfc/rfc9562' }
	]
};
