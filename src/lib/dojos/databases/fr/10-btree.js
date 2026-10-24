const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src/backend/access/nbtree';
const README = `${PG}/README`;
const SEARCH = `${PG}/nbtsearch.c`;
const SPLITLOC = `${PG}/nbtsplitloc.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'btree',
	part: 'Dans le moteur',
	title: 'Les index B-tree',
	minutes: 10,
	hook: [
		'`SELECT * FROM users WHERE id = 424242` sur une table d’un million de lignes répond en une fraction de milliseconde. Sans index, la même requête lit les 7 300 pages de la table. Avec un index, elle en lit **quatre**.',
		'Cet index est un B-tree : un arbre peu profond de pages de 8 Ko, où chaque page découpe l’intervalle des clés en quelques centaines d’intervalles plus petits. **Chaque niveau descendu divise la recherche par quelques centaines.** Avec une clé `bigint`, un million de lignes tiennent sur trois niveaux, cent millions sur quatre.',
		'Le même arbre garde ses clés triées, donc il sert aussi `BETWEEN`, `ORDER BY ... LIMIT` et `UNIQUE`. En échange, **chaque insert écrit aussi dans chaque index** de la table.'
	],
	terms: [
		{ term: 'B-tree', def: 'Un arbre de pages équilibré. Tous les chemins de la racine à une feuille ont la même longueur, donc chaque recherche coûte le même nombre de lectures de pages.' },
		{ term: 'Racine, interne, feuille', def: 'La racine est la page du haut. Les pages internes contiennent des clés de séparation et des liens vers le niveau du dessous. Les feuilles contiennent chaque clé avec le ctid de sa ligne.' },
		{ term: 'Fan-out', def: 'Le nombre d’enfants vers lesquels pointe une page interne. Avec des clés petites, il se compte en centaines, ce qui garde l’arbre à quelques niveaux.' },
		{ term: 'Page split', def: 'Quand un insert ne tient pas dans une feuille, une partie de ses entrées part dans une nouvelle page et le parent reçoit une nouvelle clé de séparation. Les splits peuvent remonter jusqu’à la racine.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['root["Page racine : 10 clés de séparation"]'],
				highlight: ['root'],
				note: 'Le vrai index sur `users(id)` avec un million de lignes a une page racine de 10 entrées. Chaque entrée dit « les clés d’ici à là sont sous ce lien ». Dans une page, PostgreSQL trouve la bonne entrée par recherche dichotomique.'
			},
			{
				add: ['root -->|"424242 est dans cet intervalle"| inner["Page interne : environ 270 séparateurs"]'],
				highlight: ['inner'],
				note: 'Un niveau plus bas, il y a 10 pages internes, qui pointent chacune vers environ 270 feuilles. La recherche lit exactement une page par niveau, donc **le nombre de pages d’index lues est égal au nombre de niveaux**, trois ici.'
			},
			{
				add: ['inner --> leaf["Feuille : paires (clé, ctid) triées"]', 'leaf -->|"ctid (3119,58)"| heap[("Page 3119 du heap")]'],
				highlight: ['leaf', 'heap'],
				note: 'La feuille contient `424242` à côté de son ctid, `(3119,58)` : page 3119 de la table, line pointer 58 (jour 9). Une lecture de plus va chercher cette page du heap. Racine, interne, feuille, heap : quatre pages sur plus de 7 000.'
			},
			{
				add: ['leaf -->|"lien droit"| leaf2["Feuille suivante : les clés d’après"]'],
				highlight: ['leaf2'],
				note: 'Chaque page pointe vers sa voisine de gauche et de droite sur le même niveau, dans l’ordre des clés. Pour `id BETWEEN 1000 AND 1100`, PostgreSQL descend une fois jusqu’à 1000, puis suit les liens vers la droite. Le README : le parcours « looks only at leaf pages and never at higher tree levels » (ne regarde que les feuilles, jamais les niveaux supérieurs). Les lignes sortent dans l’ordre des clés, sans étape de tri.'
			},
			{
				add: ['ins["INSERT dans une feuille pleine"] -->|"split : déplace des entrées vers une nouvelle page"| leaf', 'leaf -.->|"nouveau séparateur"| inner'],
				highlight: ['ins'],
				note: 'Chaque insert ajoute une entrée dans chaque index de la table. Quand une feuille est pleine, elle se coupe en deux, et le parent reçoit un nouveau séparateur. La doc : « Page splits must also insert a new downlink to the new page in the parent page, which may cause the parent to split in turn. » (le parent peut devoir se couper à son tour). Un split de la racine ajoute un niveau.'
			}
		]
	},
	example: {
		title: 'src/backend/access/nbtree/nbtsearch.c : _bt_search descend d’un niveau à chaque tour de boucle',
		repo: 'postgres/postgres',
		url: SEARCH + '#L101-L188',
		lang: 'c',
		code: `BTStack
_bt_search(Relation rel, Relation heaprel, BTScanInsert key, Buffer *bufP,
		   int access, bool returnstack)
{
…
	/* Get the root page to start with */
	*bufP = _bt_getroot(rel, heaprel, access);

	/* If index is empty and access = BT_READ, no root page is created. */
	if (!BufferIsValid(*bufP))
		return (BTStack) NULL;

	/* Loop iterates once per level descended in the tree */
	for (;;)
	{
		Page		page;
		BTPageOpaque opaque;
		OffsetNumber offnum;
		ItemId		itemid;
		IndexTuple	itup;
		BlockNumber child;
		BTStack		new_stack;

…
		*bufP = _bt_moveright(rel, heaprel, key, *bufP, (access == BT_WRITE),
							  stack_in, page_access);

		/* if this is a leaf page, we're done */
		page = BufferGetPage(*bufP);
		opaque = BTPageGetOpaque(page);
		if (P_ISLEAF(opaque))
			break;

		/*
		 * Find the appropriate pivot tuple on this page.  Its downlink points
		 * to the child page that we're about to descend to.
		 */
		offnum = _bt_binsrch(rel, key, *bufP);
		itemid = PageGetItemId(page, offnum);
		itup = (IndexTuple) PageGetItem(page, itemid);
		Assert(BTreeTupleIsPivot(itup) || !key->heapkeyspace);
		child = BTreeTupleGetDownLink(itup);
…
		/* drop the read lock on the page, then acquire one on its child */
		*bufP = _bt_relandgetbuf(rel, *bufP, child, page_access);

		/* okay, all set to move down a level */
	}`,
		notes: [
			'Ligne 13 : « Loop iterates once per level descended in the tree » (un tour par niveau descendu). Sur chaque page interne, ligne 38, [`_bt_binsrch`](' + SEARCH + '#L155-L159) cherche par dichotomie le pivot dont le lien couvre la clé. Ligne 45, `_bt_relandgetbuf` lâche le verrou sur cette page et en prend un sur l’enfant. Les lignes 31 et 32 arrêtent la boucle à la première feuille.',
			'Les lecteurs ne verrouillent pas le chemin depuis la racine. Ligne 25, `_bt_moveright` gère une course : son commentaire prévient que la page « may have split since we read its downlink in its parent page » (a pu être coupée depuis qu’on a lu son lien dans le parent). Le [README](' + README + '#L17-L22) explique ce choix repris de Lehman et Yao : un lien droit et une « high key » sur chaque page permettent à une recherche de détecter un split concurrent et d’aller à droite, ce qui « allows the tree to be searched without holding any read locks (except to keep a single page from being modified while reading it) » (permet de parcourir l’arbre sans verrou de lecture, sauf pour la page en cours de lecture).',
			'Un parcours d’intervalle ne remonte jamais. Le [README](' + README + '#L70-L75) sur les parcours : « once we have descended the tree to the correct start point for the scan, the scan looks only at leaf pages and never at higher tree levels » (une fois au bon point de départ, le parcours ne regarde que les feuilles). Un lien gauche sur chaque page permet la même marche à l’envers, pour `ORDER BY id DESC`.',
			'Des clés croissantes remplissent bien les pages. Quand la feuille la plus à droite se coupe, [`nbtsplitloc.c`](' + SPLITLOC + '#L95-L99) laisse la page de gauche remplie à fillfactor% (90 par défaut pour les B-trees), donc « when we are inserting successively increasing keys (consider sequences, timestamps, etc) we will end up with a tree whose pages are about fillfactor% full, instead of the 50% full result » (avec des clés croissantes, les pages finissent remplies à fillfactor% au lieu de 50 %). Le README ajoute un raccourci qui garde en cache la feuille la plus à droite et évite la descente.'
		]
	},
	tradeoff: {
		gain: [
			'Une recherche coûte quelques lectures de pages, et ce nombre augmente d’une unité chaque fois que la table grandit de quelques centaines de fois.',
			'Les clés sont triées : `<`, `<=`, `BETWEEN`, `IN`, `ORDER BY ... LIMIT` et `LIKE \'foo%\'` (avec la bonne collation ou la bonne classe d’opérateurs) peuvent tous s’en servir.',
			'Dans PostgreSQL, seuls les index B-tree peuvent être uniques, donc chaque `UNIQUE` et chaque `PRIMARY KEY` en est un.'
		],
		cost: [
			'Chaque `INSERT` et chaque `DELETE`, et chaque `UPDATE` qui n’est pas un update heap-only, écrit dans chaque index. Cinq index, cinq écritures en plus par ligne.',
			'Les index prennent de la place et du cache : ici, 21 Mo d’index pour une table de 57 Mo, pour une seule colonne `bigint`.',
			'Des clés aléatoires comme les UUIDv4 tombent sur des feuilles au hasard. Les inserts touchent des pages dans tout l’index et les coupent, au lieu de remplir la feuille la plus à droite.',
			'Un B-tree n’aide que si la requête suit son ordre : `WHERE email LIKE \'%@example.com\'` lit toujours toute la table.'
		]
	},
	task: {
		prompt: 'Dans `psql` : crée `users(id bigint, email text)`, insère un million de lignes avec `generate_series`, lance `CREATE INDEX ON users(id)` et `VACUUM ANALYZE users`. Prédis le nombre de niveaux de l’index et le nombre de pages que lit `id = 424242`, puis vérifie avec `CREATE EXTENSION pageinspect; SELECT level FROM bt_metap(\'users_id_idx\');` et `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE id = 424242`. Pour finir, sur papier : combien de niveaux pour 100 millions de lignes ?',
		hint: 'Une feuille contient environ 370 clés `bigint`. Une page interne pointe vers quelques centaines d’enfants. Compte combien de fois tu dois diviser.',
		answer: [
			'1 000 000 / 370, c’est environ 2 700 feuilles. Une page interne pointe vers quelques centaines de feuilles, donc environ 10 pages internes, et une racine au-dessus. Trois niveaux.',
			'`bt_metap` affiche `level = 2` : les niveaux se comptent à partir de 0 pour les feuilles, donc 2 veut dire racine, un niveau interne, feuilles. L’index fait environ 2 750 pages.',
			'Le plan montre un `Index Scan`. Lance-le deux fois : la deuxième fois affiche `Buffers: shared hit=4`, la racine, une page interne, une feuille et une page du heap. (La première exécution d’une session en lit quelques-unes de plus, comme la métapage de l’index.) Un `Seq Scan` lirait chaque page de la table.',
			'100 millions de lignes : environ 270 000 feuilles, environ 1 000 pages internes au-dessus, quelques pages au-dessus de celles-là, puis la racine. Quatre niveaux : une lecture de plus pour une table cent fois plus grosse.'
		],
		steps: [
			{
				title: 'Prédis les niveaux',
				questions: [
					{ q: 'Une feuille contient environ 370 clés `bigint`. Combien de feuilles pour un million de lignes ?', options: ['Environ 370', 'Environ 2 700', 'Environ 27 000', 'Environ 7 300'], answer: 1, why: '1 000 000 / 370, c’est environ 2 700.' },
					{ q: 'Une page interne pointe vers quelques centaines d’enfants. Combien de pages internes au-dessus de ces feuilles ?', options: ['Environ 10', 'Environ 270', 'Environ 2 700', 'Une seule'], answer: 0, why: '2 700 feuilles divisées par quelques centaines donnent environ 10 pages.' },
					{ q: 'Combien de niveaux a l’arbre ?', options: ['Deux', 'Quatre', 'Cinq', 'Trois'], answer: 3, why: 'Les feuilles, un niveau interne d’environ 10 pages, et une racine au-dessus.' },
					{ q: '`bt_metap` affiche `level = 2`. Est-ce que ça contredit les trois niveaux ?', options: ['Oui, l’arbre a deux niveaux', 'Oui, la racine n’est pas comptée', 'Non, les niveaux se comptent à partir de 0 pour les feuilles', 'Non, `level` compte les pages internes'], answer: 2, why: '0, ce sont les feuilles, 1 le niveau interne, 2 la racine.' }
				]
			},
			{
				title: 'Prédis les lectures',
				questions: [
					{ q: 'La feuille contient `424242` à côté du ctid `(3119,58)`. Quelle page la dernière lecture va-t-elle chercher ?', options: ['La page 3119 de la table', 'La page 58 de la table', 'La métapage de l’index', 'La feuille 3119 de l’index'], answer: 0, why: 'Un ctid, c’est la page du heap, puis le line pointer (jour 9). La dernière lecture est la page 3119 de `users`, et la ligne est à l’emplacement 58.' },
					{ q: 'Pourquoi les pages d’index lues sont-elles aussi nombreuses que les niveaux ?', options: ['Chaque niveau est mis en cache comme une seule page', 'La recherche lit exactement une page par niveau en descendant', 'Le planificateur lit la racine une fois par niveau', 'Les feuilles sont lues en bloc'], answer: 1, why: '`_bt_search` boucle une fois par niveau, fait une recherche dichotomique dans la page, et suit un seul lien vers le bas.' },
					{ q: 'Tu lances la requête deux fois. Qu’affiche la deuxième ?', options: ['`Buffers: shared hit=1`', '`Buffers: shared read=7300`', '`Buffers: shared hit=7`', '`Buffers: shared hit=4`'], answer: 3, why: 'Les quatre pages du chemin sont maintenant dans le cache, donc ce sont des hits.' },
					{ q: 'Pourquoi la première exécution d’une session peut-elle lire quelques pages de plus ?', options: ['La première exécution parcourt toujours la table', 'Elle lit aussi des pages comme la métapage de l’index', 'Elle construit l’index à la volée', 'Elle lit chaque feuille une fois'], answer: 1, why: 'La métapage note où est la racine (c’est elle que montre `bt_metap`), et la première exécution la lit en plus du chemin. Les exécutions suivantes de la session ne touchent que les quatre pages du chemin.' }
				]
			},
			{
				title: 'Lis le plan',
				questions: [
					{ q: 'Quel nœud de plan attends-tu pour `WHERE id = 424242` ?', options: ['`Seq Scan`', '`Hash Join`', '`Index Scan`', '`Sort`'], answer: 2, why: 'Le B-tree sur `id` répond à une égalité en quelques lectures de pages.' },
					{ q: 'Sans l’index, que lirait la requête ?', options: ['Chaque page de la table, plus de 7 000', 'La moitié de la table en moyenne', 'Seulement la première page', 'Quatre pages, comme avec l’index'], answer: 0, why: 'Un `Seq Scan` lit toutes les pages de la table pour trouver une ligne.' },
					{ q: 'La feuille contient déjà `424242`. Pourquoi la requête lit-elle quand même une page du heap ?', options: ['La page du heap contient la racine de l’index', 'PostgreSQL vérifie toujours chaque clé deux fois', 'La feuille ne range qu’une clé sur dix', '`SELECT *` demande `email`, et la feuille ne contient que la clé et le ctid'], answer: 3, why: 'Une entrée de feuille, c’est une clé et l’adresse de sa ligne. Toutes les autres colonnes vivent dans la table, à une lecture de là.' },
					{ q: 'Que fait `WHERE email LIKE \'%@example.com\'` avec un B-tree sur `email` ?', options: ['Il utilise l’index par la droite', 'Il lit quand même toute la table', 'Il ne lit que les feuilles', 'Il lit quatre pages'], answer: 1, why: 'Un B-tree n’aide que si la requête suit son ordre, et un `%` au début ne donne aucun point de départ.' }
				]
			},
			{
				title: 'Passe à 100 millions de lignes',
				questions: [
					{ q: 'Environ combien de feuilles pour 100 millions de clés `bigint` ?', options: ['Environ 2 700', 'Environ 27 millions', 'Environ 270 000', 'Environ 1 000'], answer: 2, why: '100 000 000 / 370, c’est environ 270 000.' },
					{ q: 'Combien de pages internes juste au-dessus de ces feuilles ?', options: ['Environ 1 000', 'Environ 10', 'Environ 270 000', 'Une seule'], answer: 0, why: '270 000 divisé par quelques centaines, c’est environ 1 000. Quelques pages au-dessus, puis la racine.' },
					{ q: 'Combien de niveaux en tout ?', options: ['Trois', 'Cinq', 'Six', 'Quatre'], answer: 3, why: 'Les feuilles, environ 1 000 pages internes, quelques pages au-dessus, et la racine.' },
					{ q: 'Quand la table passe d’un million à 100 millions de lignes, quel événement ajoute le quatrième niveau ?', options: ['Un VACUUM de l’index', 'Une scission de la page racine', 'Chaque nouvelle feuille', 'Un ANALYZE de la table'], answer: 1, why: 'Une page pleine se scinde et envoie un nouveau séparateur à son parent. Quand la racine elle-même se scinde, une nouvelle racine s’ajoute au-dessus, un niveau plus haut.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une table passe d’un million à 100 millions de lignes. En gros, comment évolue le nombre de pages d’index lues par `WHERE id = 42` ?',
			options: [
				'Il est multiplié par cent, comme la table',
				'Il augmente d’environ une page, de trois niveaux à quatre',
				'Il reste à une seule page, puisque la clé est unique',
				'Il double, parce que l’arbre a besoin d’une deuxième racine'
			],
			answer: 1,
			why: 'Chaque niveau divise l’intervalle des clés par le fan-out, quelques centaines. Multiplier les lignes par cent ajoute au plus un niveau, donc une recherche lit une page de plus.'
		},
		{
			q: 'Pourquoi `SELECT * FROM orders ORDER BY created_at LIMIT 20` peut-il utiliser un B-tree sur `created_at` sans trier ?',
			options: [
				'Le planificateur garde en cache la sortie triée des requêtes précédentes',
				'Le heap est physiquement trié selon chaque colonne indexée',
				'Les feuilles gardent les clés dans l’ordre et pointent vers la suivante',
				'Les B-trees rangent les 20 premières clés de chaque page dans la racine'
			],
			answer: 2,
			why: 'Le parcours descend une fois jusqu’à la plus petite clé, puis suit les liens droits le long des feuilles, dans l’ordre des clés. Il s’arrête après 20 lignes. Le heap, lui, n’a aucun ordre particulier (jour 9).'
		},
		{
			q: 'Une table a six index. Tu insères une ligne. Dans combien de structures PostgreSQL écrit-il ?',
			options: [
				'Seulement le heap ; autovacuum reconstruit les index plus tard',
				'Le heap et l’index de clé primaire, les autres sont paresseux',
				'Le heap et chacun des six index, plus le WAL pour tout ça',
				'Seulement le WAL ; heap et index sont écrits au checkpoint'
			],
			answer: 2,
			why: 'Chaque index doit pointer vers la nouvelle ligne, donc chacun reçoit une nouvelle entrée de feuille, et peut-être un split. Tous ces changements passent dans le WAL. Avec six index, un insert fait six écritures de feuille : supprime les index qu’aucune requête n’utilise.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Construire un B-tree sur un million de lignes, compter ses niveaux avec `pageinspect`, et voir une recherche lire quatre pages quand un parcours les lit toutes.',
		steps: [
			'Lance un PostgreSQL jetable : `docker run -d --name pg-btree -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-btree psql -U postgres`.',
			'Construis la table et l’index : `CREATE TABLE users (id bigint, email text); INSERT INTO users SELECT g, \'user\' || g || \'@example.com\' FROM generate_series(1, 1000000) g; CREATE INDEX ON users(id); VACUUM ANALYZE users;`',
			'Compte les niveaux et les pages : `CREATE EXTENSION pageinspect;` puis `SELECT root, level FROM bt_metap(\'users_id_idx\');`, `SELECT live_items FROM bt_page_stats(\'users_id_idx\', (SELECT root FROM bt_metap(\'users_id_idx\'))::int);` et `SELECT pg_relation_size(\'users_id_idx\') / 8192 AS index_pages, pg_relation_size(\'users\') / 8192 AS table_pages;`',
			'Lance deux fois `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE id = 424242;` et lis la ligne `Buffers` de la deuxième.',
			'Compare avec une requête que l’index ne peut pas aider : `EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM users WHERE email LIKE \'%@example.com\';`, et avec `EXPLAIN SELECT * FROM users ORDER BY id LIMIT 20;`. Quitte avec `\\q` et nettoie avec `docker rm -f pg-btree`.'
		],
		done: [
			'`bt_metap` affiche `level` 2, et la racine a 10 `live_items`.',
			'L’index fait environ 2 750 pages et la table environ 7 350.',
			'La deuxième recherche affiche `Index Scan using users_id_idx` et `Buffers: shared hit=4`.',
			'La requête `LIKE` montre un `Seq Scan` dont les buffers couvrent toutes les pages de la table, et le plan `ORDER BY ... LIMIT 20` a un `Index Scan` et aucun `Sort`.'
		],
		solution: [
			'Le niveau 2, compté à partir de 0 pour les feuilles, veut dire trois niveaux : la racine avec 10 entrées, 10 pages internes, environ 2 700 feuilles.',
			'Les quatre hits sont la racine, une page interne, une feuille et la page du heap. Le parcours lit chaque page parce qu’un `%` au début ne donne au B-tree aucun point de départ.',
			'Pour 100 millions de lignes, le même calcul donne quatre niveaux : une lecture de plus par recherche.'
		]
	},
	recall: {
		q: 'Combien de pages lit `WHERE id = 424242` sur une table `users` d’un million de lignes avec un B-tree sur `id`, et pourquoi si peu ?',
		a: 'Quatre : la racine, une page interne, une feuille et la page du heap. Chaque niveau divise l’intervalle des clés par quelques centaines, donc un million de clés `bigint` tiennent sur trois niveaux.'
	},
	sources: [
		{ title: 'PostgreSQL source, nbtsearch.c (_bt_moveright comment)', url: SEARCH + '#L130-L133' },
		{ title: 'PostgreSQL source, nbtree README (rightmost leaf fast path)', url: README + '#L494-L499' },
		{ title: 'PostgreSQL docs, B-Tree Indexes', url: 'https://www.postgresql.org/docs/current/btree.html' },
		{ title: 'PostgreSQL docs, Index Types', url: 'https://www.postgresql.org/docs/current/indexes-types.html' },
		{ title: 'PostgreSQL docs, Indexes and ORDER BY', url: 'https://www.postgresql.org/docs/current/indexes-ordering.html' },
		{ title: 'PostgreSQL source, src/backend/access/nbtree/README', url: README }
	]
};
