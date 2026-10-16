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
