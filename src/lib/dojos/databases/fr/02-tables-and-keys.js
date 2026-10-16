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
		{ term: 'Table et ligne', def: 'Une table contient une sorte de chose (des tickets, des utilisateurs). Chaque ligne en est une, avec les mêmes colonnes que toutes les autres.' },
		{ term: 'Clé primaire', def: 'La ou les colonnes qui identifient une ligne. PostgreSQL exige qu’elles soient uniques et non nulles, et construit dessus un index B-tree unique.' },
		{ term: 'Clé étrangère', def: 'Une colonne dont la valeur doit correspondre à une clé d’une autre table. La base refuse une commande qui pointe vers un client qui n’existe pas.' },
		{ term: 'Clé naturelle', def: 'Une clé tirée du monde réel : un email, un ISBN, « le ticket 42 de ce dépôt ». Elle a du sens, mais le monde peut la changer.' },
		{ term: 'Clé de substitution', def: 'Une clé sans signification, fabriquée par la base : 1, 2, 3 tirés d’une séquence, ou un UUID aléatoire. Elle n’a jamais besoin de changer.' },
		{ term: 'bigint ou UUID', def: 'Deux clés de substitution courantes. Un bigint fait 8 octets et compte vers le haut. Un UUID fait 128 bits et peut être créé n’importe où, sans demander à la base.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['repo[("repository : id = 7")]'],
				highlight: ['repo'],
				note: '**Une clé de substitution par dépôt.** Dans Gitea, les tables des dépôts et des tickets commencent toutes deux par un `ID int64` marqué `pk autoincr`. Le nombre ne veut rien dire, exprès : aucun fait sur le dépôt n’y est rangé, donc aucun fait n’a besoin de rester figé pour qu’il reste valable.'
			},
			{
				add: ['issue[("issue : id = 9001, repo_id = 7, index = 42")]', 'issue -->|"repo_id"| repo'],
				highlight: ['issue'],
				note: '**Deux clés sur une ligne.** Le ticket a sa propre clé de substitution `id`, et aussi `(repo_id, index)`, qui est unique. L’`index`, c’est le « #42 » de l’URL. C’est une clé naturelle : les gens la tapent, la partagent et s’attendent à ce qu’elle ne bouge pas.'
			},
			{
				add: ['url["URL : /owner/repo/issues/42"] -->|"GetIssueByIndex(7, 42)"| issue'],
				highlight: ['url'],
				note: '**Les gens utilisent la clé naturelle.** Le [handler de la page du ticket](' + GITEA + '/routers/web/repo/issue.go#L183) appelle `GetIssueByIndex` avec l’ID du dépôt courant et le numéro de l’URL. Dans la base, les autres lignes pointent plutôt vers la clé de substitution `issue.ID`.'
			},
			{
				add: ['counter[("issue_index : group_id = 7, max_index = 42")]', 'counter -.->|"numéro suivant, même transaction"| issue'],
				highlight: ['counter'],
				note: '**Une clé naturelle demande son propre compteur.** Une séquence numérote les lignes de toute la table, elle ne peut donc pas donner à chaque dépôt ses propres 1, 2, 3. Gitea garde une ligne de compteur par dépôt et l’incrémente dans la transaction même qui insère le ticket.'
			},
			{
				add: ['comment[("comment : issue_id = 9001")]', 'comment -->|"issue_id"| issue'],
				highlight: ['comment'],
				note: '**Les enfants pointent vers la clé de substitution.** Un commentaire stocke `issue_id`, pas `(repo_id, index)`. Le tag de struct sur `Comment.IssueID` demande un index, pas une clé étrangère, donc quand un ticket est supprimé, c’est le code de Gitea qui doit supprimer chaque ligne enfant.'
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
			'**Les deux clés dans les tags.** `ID` est `pk autoincr` : la clé de substitution. `RepoID` et `Index` partagent `UNIQUE(repo_index)`, une contrainte d’unicité sur deux colonnes. C’est la clé naturelle, et c’est la base, pas le code Go, qui garantit qu’aucun dépôt n’a deux tickets numéro 42.',
			'**La recherche utilise la paire.** `GetIssueByIndex` filtre sur `repo_id` et `index`. L’unicité de ces deux colonnes repose sur un index unique, donc la recherche lit quelques pages d’index, pas toute la table.',
			'**Le compteur est un upsert.** Sur PostgreSQL, [`postgresGetNextResourceIndex`](' + GITEA + '/models/db/index.go#L56-L67) lance `INSERT ... ON CONFLICT (group_id) DO UPDATE SET max_index = %s.max_index+1 RETURNING max_index`. Son appelant [`GetNextResourceIndex`](' + GITEA + '/models/db/index.go#L114) prévient : « it must run in the same transaction where the resource is created » (à lancer dans la transaction qui crée la ressource), et [`NewIssue`](' + GITEA + '/models/issues/issue_update.go#L452-L461) fait exactement ça.',
			'**Sans clés étrangères, le ménage est manuel.** [`deleteIssue`](' + GITEA + '/services/issue/issue.go#L199-L253) enchaîne 18 suppressions de lignes enfants, dans une seule transaction. Quelques lignes plus bas vit [`DeleteOrphanedIssues`](' + GITEA + '/services/issue/issue.go#L256-L257), « delete issues without a repo » : le ménage qu’une clé étrangère aurait rendu inutile.'
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
			'Deux clés par table, c’est deux index à tenir à jour à chaque insert.',
			'Une clé étrangère n’indexe pas le côté qui référence. La doc : « the declaration of a foreign key constraint does not automatically create an index on the referencing columns », donc un delete sur le parent peut parcourir toute la table enfant.',
			'Les UUID aléatoires sont durs pour un B-tree. RFC 9562 : l’UUIDv4 a une « poor database-index locality » (mauvaise localité dans l’index), donc les inserts « are performed at random locations ». PostgreSQL 18 propose `uuidv7()`, ordonné dans le temps.',
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
	takeaway: 'Donne à chaque ligne une clé primaire sans signification qui ne change jamais, protège l’identité réelle par une contrainte d’unicité, et laisse les clés étrangères, pas le code, garder les références honnêtes.',
	sources: [
		{ title: 'Doc PostgreSQL, Constraints (clés primaires et étrangères)', url: 'https://www.postgresql.org/docs/current/ddl-constraints.html' },
		{ title: 'Doc PostgreSQL, Identity Columns', url: 'https://www.postgresql.org/docs/current/ddl-identity-columns.html' },
		{ title: 'Doc PostgreSQL, UUID Type', url: 'https://www.postgresql.org/docs/current/datatype-uuid.html' },
		{ title: 'Doc PostgreSQL, UUID Functions', url: 'https://www.postgresql.org/docs/current/functions-uuid.html' },
		{ title: 'Doc PostgreSQL, Serial Types', url: 'https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL' },
		{ title: 'RFC 9562, Universally Unique IDentifiers (UUIDs)', url: 'https://www.rfc-editor.org/rfc/rfc9562' }
	]
};
