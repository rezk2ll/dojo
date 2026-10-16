const PG = 'https://github.com/postgres/postgres/blob/26bd08fb5c069fbdf55867adc398cfca0f55d5c8/src';
const HTUP = `${PG}/include/access/htup_details.h`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pages-and-rows',
	part: 'Dans le moteur',
	title: 'Pages et lignes sur le disque',
	minutes: 10,
	hook: [
		'Une table à deux colonnes `int` et un million de lignes : 8 Mo de données, te dis-tu. `pg_relation_size` répond 35 Mo. Tu supprimes la moitié des lignes, et il répond toujours 35 Mo. Le fichier de la table est une suite de pages, et une suppression les y laisse toutes.',
		'PostgreSQL range chaque table comme **un tableau de pages de 8 Ko**. Une page contient un en-tête, une liste de pointeurs, et les lignes tassées depuis la fin. Lire une ligne, c’est lire toute sa page, depuis le cache ou depuis le disque.',
		'Chaque ligne porte aussi un en-tête de 23 octets que ton ORM ne te montre jamais : qui l’a insérée, qui l’a supprimée, où se trouve sa version plus récente. Cet en-tête et la disposition des pages expliquent les 35 Mo, et les prochains chapitres sur les index et VACUUM s’appuient dessus.'
	],
	terms: [
		{ term: 'Page', def: 'Un bloc fixe de 8 Ko (par défaut) dans un fichier de table ou d’index. PostgreSQL lit, met en cache et écrit des pages entières.' },
		{ term: 'Tuple', def: 'Une version stockée d’une ligne, avec son en-tête. Un UPDATE écrit un nouveau tuple, donc une ligne peut en avoir plusieurs.' },
		{ term: 'Line pointer', def: 'Un emplacement de 4 octets en haut de la page, qui contient la position et la longueur d’un tuple. L’adresse d’une ligne désigne cet emplacement, et la position en octets peut changer.' },
		{ term: 'TOAST', def: 'Le stockage des grosses valeurs. Une ligne de plus de 2 ko environ voit ses gros champs compressés et, si besoin, déplacés par morceaux dans une table annexe.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['file[("Fichier de table : page 0, page 1, page 2 ...")]'],
				highlight: ['file'],
				note: 'La doc : « Every table and index is stored as an array of pages of a fixed size (usually 8 kB, although a different page size can be selected when compiling the server). » (chaque table et chaque index est un tableau de pages de taille fixe, 8 ko en général). La page 0 est les 8 premiers Ko du fichier, la page 1 les suivants, et ainsi de suite.'
			},
			{
				add: ['file --> page["Page : en-tête de 24 octets, line pointers, espace libre, tuples"]'],
				highlight: ['page'],
				note: 'Dans cette page à emplacements, les line pointers poussent vers le bas depuis l’en-tête, les tuples remontent depuis la fin. Le code source dit « a page is full when nothing can be added between pd_lower and pd_upper » (la page est pleine quand plus rien ne rentre entre les deux), ces deux positions qui bornent l’espace libre au milieu.'
			},
			{
				add: ['page --> lp["Line pointer 3 : position et longueur"]', 'lp --> tup["Tuple en (0,3) : en-tête de 23 octets, bitmap des NULL, colonnes"]'],
				highlight: ['lp', 'tup'],
				note: 'Chaque tuple a une adresse, son `ctid`, que `SELECT ctid, * FROM t` affiche. `(0,3)` veut dire page 0, line pointer 3. Comme l’adresse désigne le pointeur et non une position en octets, PostgreSQL peut déplacer les tuples dans la page pour récupérer de la place sans changer leur adresse.'
			},
			{
				add: ['tup -->|"ligne de plus de 2 ko environ"| toast[("Table TOAST : valeurs compressées, en morceaux")]'],
				highlight: ['toast'],
				note: 'Un tuple ne peut pas s’étaler sur plusieurs pages. Donc quand une ligne dépasserait `TOAST_TUPLE_THRESHOLD` (« normally 2 kB », 2 ko en temps normal), PostgreSQL compresse ses gros champs et les sort de la ligne. La ligne garde un petit pointeur vers eux.'
			},
			{
				add: ['upd["UPDATE qty = qty + 1"] -->|"écrit un nouveau tuple"| tup2["Nouvelle version en (5,76)"]', 'tup -.->|"t_ctid pointe vers la version plus récente"| tup2'],
				highlight: ['upd', 'tup2'],
				note: 'Un UPDATE écrit un nouveau tuple. L’ancienne version reste sur sa page, marquée avec la transaction qui l’a modifiée dans `t_xmax`, et son `t_ctid` pointe vers la nouvelle. Les lecteurs qui ont commencé avant continuent de voir l’ancienne version (jour 18), et les versions mortes s’entassent jusqu’à ce que VACUUM les retire (jour 16).'
			}
		]
	},
	example: {
		title: 'src/include/access/htup_details.h : l’en-tête que porte chaque ligne PostgreSQL',
		repo: 'postgres/postgres',
		url: `${HTUP}#L65-L181`,
		lang: 'c',
		code: ` * The overall structure of a heap tuple looks like:
 *			fixed fields (HeapTupleHeaderData struct)
 *			nulls bitmap (if HEAP_HASNULL is set in t_infomask)
 *			alignment padding (as needed to make user data MAXALIGN'd)
 *			object ID (if HEAP_HASOID_OLD is set in t_infomask, not created
 *          anymore)
 *			user data fields
…
typedef struct HeapTupleFields
{
	TransactionId t_xmin;		/* inserting xact ID */
	TransactionId t_xmax;		/* deleting or locking xact ID */

	union
	{
		CommandId	t_cid;		/* inserting or deleting command ID, or both */
		TransactionId t_xvac;	/* old-style VACUUM FULL xact ID */
	}			t_field3;
} HeapTupleFields;
…
struct HeapTupleHeaderData
{
	union
	{
		HeapTupleFields t_heap;
		DatumTupleFields t_datum;
	}			t_choice;

	ItemPointerData t_ctid;		/* current TID of this or newer tuple (or a
								 * speculative insertion token) */

	/* Fields below here must match MinimalTupleData! */

#define FIELDNO_HEAPTUPLEHEADERDATA_INFOMASK2 2
	uint16		t_infomask2;	/* number of attributes + various flags */

#define FIELDNO_HEAPTUPLEHEADERDATA_INFOMASK 3
	uint16		t_infomask;		/* various flag bits, see below */

#define FIELDNO_HEAPTUPLEHEADERDATA_HOFF 4
	uint8		t_hoff;			/* sizeof header incl. bitmap, padding */

	/* ^ - 23 bytes - ^ */

#define FIELDNO_HEAPTUPLEHEADERDATA_BITS 5
	uint8		t_bits[FLEXIBLE_ARRAY_MEMBER];	/* bitmap of NULLs */

	/* MORE DATA FOLLOWS AT END OF STRUCT */
};`,
		notes: [
			'Lignes 11 et 12 : `t_xmin` est la transaction qui a inséré cette version, `t_xmax` celle qui l’a supprimée ou verrouillée. Chaque transaction lit ces deux identifiants de 4 octets pour décider quelles versions elle peut voir (jour 18).',
			'La ligne 29 porte la chaîne des updates. Le [commentaire sur `t_ctid`](' + HTUP + '#L86-L88) dit : « whenever a new tuple is stored on disk, its t_ctid is initialized with its own TID (location). If the tuple is ever updated, its t_ctid is changed to point to the replacement version of the tuple. » (à l’écriture, t_ctid pointe sur le tuple lui-même ; après un update, il pointe sur la version qui le remplace).',
			'La ligne 46 est le bitmap des NULL. Son [commentaire](' + HTUP + '#L114-L116) dit qu’il « is *not* stored if t_infomask shows that there are no nulls in the tuple » (n’est pas stocké si le tuple n’a aucun NULL). Quand il est là, il a un bit par colonne, et une colonne NULL ne prend aucune place pour sa valeur.',
			'[`bufpage.h`](' + PG + '/include/storage/bufpage.h#L24-L47) dessine la page autour du tuple : l’en-tête, puis `linp1 linp2 ...`, puis l’espace libre, puis les tuples ajoutés « backwards » (à l’envers). Chaque line pointer est le champ de bits `ItemIdData` : 15 bits de position, 2 de drapeaux, 15 de longueur.',
			'Le seuil TOAST de 2 ko vient de [`heaptoast.h`](' + PG + '/include/access/heaptoast.h#L20-L48), qui fixe `TOAST_TUPLES_PER_PAGE` à 4 et définit le seuil comme la plus grande taille de tuple pour laquelle quatre tiennent sur une page de heap. Sur des pages de 8 Ko, ça fait environ 2 ko.'
		]
	},
	tradeoff: {
		gain: [
			'Les lectures disque, le cache des shared buffers et le WAL travaillent tous avec les mêmes pages de 8 Ko.',
			'Les line pointers donnent à chaque ligne une adresse stable dans sa page, donc les tuples peuvent être tassés sans casser les index qui pointent vers eux.',
			'TOAST sort les grosses valeurs de la ligne. Un scan qui ne lit jamais `body` lit des lignes petites et moins de pages.'
		],
		cost: [
			'Chaque tuple paie environ 28 octets avant sa première colonne (en-tête de 23 octets, aligné à 24, plus un line pointer de 4 octets). Une table de deux colonnes `int` dépense plus de place en surcoût qu’en données.',
			'Lire une ligne, c’est lire toute sa page de 8 Ko. Des lignes éparpillées sur plein de pages coûtent plein de lectures.',
			'Un UPDATE écrit un nouveau tuple complet, même pour changer un booléen. L’ancien reste jusqu’à ce que VACUUM le nettoie.',
			'L’ordre des colonnes peut gaspiller de la place : les types sont alignés, donc un `boolean` suivi d’un `bigint` laisse du remplissage entre les deux.'
		]
	},
	task: {
		prompt: 'Une table `t(id bigint, qty int, flag boolean)` n’a aucun NULL. Avec un en-tête de page de 24 octets, un en-tête de tuple de 23 octets, un alignement de chaque tuple sur 8 octets et un line pointer de 4 octets, combien de lignes tiennent dans une page de 8 Ko ? Puis vérifie dans `psql` : insère 1000 lignes et lance `SELECT ctid, id FROM t WHERE id IN (185, 186)` et `SELECT pg_relation_size(\'t\') / 8192`.',
		hint: 'En-tête plus données, arrondi au multiple de 8 supérieur, plus le line pointer. Puis divise la place qui reste après l’en-tête de page.',
		answer: [
			'Tuple : en-tête de 23 octets complété à 24, puis 8 + 4 + 1 = 13 octets de données : 37 octets, arrondis à 40.',
			'Chaque ligne coûte 40 + 4 = 44 octets de la page. (8192 - 24) / 44 = 185,6, donc 185 lignes par page.',
			'Dans `psql` : l’id 185 est en `(0,185)` et l’id 186 en `(1,1)`, le premier emplacement de la page 1. 1000 lignes demandent 6 pages, donc `pg_relation_size` vaut 49152 octets.',
			'Lance `UPDATE t SET qty = qty + 1 WHERE id = 1` et regarde encore son `ctid` : il a bougé vers un emplacement libre en fin de table, parce que l’update a écrit un nouveau tuple.'
		]
	},
	quiz: [
		{
			q: 'Une ligne a une colonne `int` nullable à NULL, et une autre colonne aussi à NULL. Combien de place prend le `int` NULL dans ce tuple ?',
			options: [
				'Quatre octets, la largeur d’un int, remplis de zéros',
				'Un bit dans le bitmap des NULL, et aucun octet pour la valeur',
				'Un pointeur vers une valeur NULL partagée dans la table TOAST',
				'Rien du tout, et le tuple ne stocke pas non plus de bitmap'
			],
			answer: 1,
			why: 'Dès qu’un tuple a un NULL, il porte un bitmap des NULL avec un bit par colonne. Une colonne NULL y est marquée et ne prend aucune place dans la zone de données. Sans aucun NULL, le bitmap est omis.'
		},
		{
			q: 'Tu lances `UPDATE accounts SET active = false WHERE id = 42`. Qu’écrit PostgreSQL dans le fichier de la table ?',
			options: [
				'Seulement l’octet modifié, sur place dans le tuple existant',
				'Un petit enregistrement de différence dans la table TOAST qui pointe vers la ligne',
				'Une nouvelle version complète de la ligne, l’ancienne restant pour l’instant',
				'Rien pour l’instant : le changement ne vit que dans le WAL jusqu’à VACUUM'
			],
			answer: 2,
			why: 'Un UPDATE écrit un nouveau tuple avec toutes les colonnes. L’ancien reçoit la transaction qui l’a modifié dans `t_xmax` et un `t_ctid` qui pointe vers le nouveau. Il reste jusqu’à ce que VACUUM le retire, quand plus aucune transaction ne peut le voir.'
		},
		{
			q: 'Une colonne `body text` contient un article de 100 Ko. Où vit cette valeur ?',
			options: [
				'Dans TOAST, compressée ou découpée en morceaux, avec un pointeur dans la ligne',
				'Dans la page du heap, qui grandit au-delà de 8 Ko pour contenir la ligne',
				'Sur treize pages du heap reliées les unes aux autres dans l’ordre',
				'Nulle part : PostgreSQL refuse toute ligne plus grande qu’une page de 8 Ko'
			],
			answer: 0,
			why: 'Un tuple ne peut pas s’étaler sur plusieurs pages. Au-delà de 2 ko environ, TOAST compresse les gros champs et, si la ligne est encore trop large, les déplace par morceaux dans la table TOAST de la table. La ligne du heap garde un pointeur.'
		}
	],
	recall: {
		q: 'Vers quoi pointe `ctid = (0,3)`, et que se passe-t-il quand tu fais un UPDATE sur cette ligne ?',
		a: 'Vers la page 0, line pointer 3, dans les pages de 8 Ko de la table. L’UPDATE écrit un nouveau tuple à un autre ctid, et le `t_ctid` de l’ancien tuple pointe vers lui jusqu’à ce que VACUUM retire l’ancien.'
	},
	sources: [
		{ title: 'PostgreSQL source, itemid.h (ItemIdData)', url: `${PG}/include/storage/itemid.h#L25-L30` },
		{ title: 'PostgreSQL docs, Database Page Layout', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' },
		{ title: 'PostgreSQL docs, TOAST', url: 'https://www.postgresql.org/docs/current/storage-toast.html' },
		{ title: 'PostgreSQL docs, pageinspect', url: 'https://www.postgresql.org/docs/current/pageinspect.html' }
	]
};
