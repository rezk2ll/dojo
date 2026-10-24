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
		],
		steps: [
			{
				title: 'Mesure un tuple',
				questions: [
					{ q: 'La ligne n’a aucun NULL. Combien d’octets viennent avant la première colonne ?', options: ['23', '24', '28', '32'], answer: 1, why: 'L’en-tête de 23 octets est complété à 24, pour que les données des colonnes commencent alignées.' },
					{ q: 'Pourquoi ce tuple n’a-t-il pas de bitmap des NULL ?', options: ['Les bitmaps ne servent qu’aux colonnes texte', 'La table est trop petite', 'Il n’est pas stocké quand le tuple n’a aucun NULL', 'Il vit dans l’en-tête de page à la place'], answer: 2, why: 'Le source : le bitmap « is *not* stored if t_infomask shows that there are no nulls in the tuple ».' },
					{ q: 'Combien d’octets de données prend `(bigint, int, boolean)` ?', options: ['13', '16', '12', '24'], answer: 0, why: '8 pour le `bigint`, 4 pour le `int`, 1 pour le `boolean`.' },
					{ q: 'En-tête plus données font 37 octets. Que prend le tuple avec un alignement sur 8 octets ?', options: ['37', '38', '48', '40'], answer: 3, why: '37 arrondi au multiple de 8 supérieur donne 40.' }
				]
			},
			{
				title: 'Remplis la page',
				questions: [
					{ q: 'Combien coûte chaque ligne dans la page, line pointer compris ?', options: ['40 octets', '44 octets', '41 octets', '48 octets'], answer: 1, why: '40 pour le tuple, plus un line pointer de 4 octets en haut de la page.' },
					{ q: 'Combien de place reste-t-il après l’en-tête de page ?', options: ['8192 octets', '8000 octets', '8168 octets', '8144 octets'], answer: 2, why: '8192 moins l’en-tête de page de 24 octets.' },
					{ q: 'Combien de lignes tiennent donc dans une page ?', options: ['185', '186', '204', '630'], answer: 0, why: '8168 / 44 = 185,6. Un tuple ne peut pas s’étaler sur deux pages, donc la page en garde 185.' },
					{ q: 'Sur ces 44 octets par ligne, combien sont tes données ?', options: ['44', '40', '24', '13'], answer: 3, why: 'Le reste, c’est l’en-tête, le remplissage et le line pointer. Sur une table aussi étroite, le surcoût pèse plus que les données.' }
				]
			},
			{
				title: 'Vérifie dans psql',
				questions: [
					{ q: 'Après avoir inséré les ids 1 à 1000, où est l’id 186 ?', options: ['`(0,186)`', '`(1,1)`', '`(1,186)`', '`(0,1)`'], answer: 1, why: 'La page 0 est pleine après 185 lignes, donc l’id 186 prend le premier emplacement de la page 1.' },
					{ q: 'Que désigne un `ctid` de `(1,1)` ?', options: ['La page 1, line pointer 1', 'L’octet 1 de la ligne 1', 'La transaction 1, commande 1', 'L’entrée d’index 1 de la page 1'], answer: 0, why: 'L’adresse désigne la page et l’emplacement, pas une position en octets, donc les tuples peuvent bouger dans la page.' },
					{ q: 'Combien de pages demandent 1000 lignes ?', options: ['5', '4', '8', '6'], answer: 3, why: '1000 / 185 font environ 5,4, donc une sixième page porte les dernières lignes.' },
					{ q: 'Que renvoie donc `pg_relation_size(\'t\')` en octets ?', options: ['8192', '40960', '49152', '44000'], answer: 2, why: 'Six pages de 8192 octets. Le fichier grandit par pages entières.' }
				]
			},
			{
				title: 'Regarde un update déplacer la ligne',
				questions: [
					{ q: 'Tu lances `UPDATE t SET qty = qty + 1 WHERE id = 1`. Où va la nouvelle version ?', options: ['Elle écrase `(0,1)` sur place', 'Dans un emplacement libre en fin de table', 'Dans la table TOAST', 'Seulement dans le WAL, jusqu’à VACUUM'], answer: 1, why: 'Un UPDATE écrit un nouveau tuple. La page 0 est pleine, donc il atterrit là où il y a de la place, comme `(5,76)` dans le schéma.' },
					{ q: 'Que reste-t-il en `(0,1)` juste après l’update ?', options: ['Rien, l’emplacement est libéré tout de suite', 'La nouvelle version', 'Un tuple vide avec seulement un en-tête', 'L’ancienne version, avec `t_xmax` rempli et `t_ctid` qui pointe vers la nouvelle'], answer: 3, why: 'Des lecteurs qui ont commencé avant peuvent encore en avoir besoin. Elle reste jusqu’à ce que VACUUM la retire.' },
					{ q: 'Tu supprimes la moitié des lignes. Que dit `pg_relation_size` ?', options: ['Les mêmes 49152 octets', 'Environ la moitié, 24576 octets', '0, jusqu’au passage de VACUUM', 'Plus, à cause des suppressions'], answer: 0, why: 'Un delete marque les tuples, il ne réduit pas le fichier. Ce sont les 35 Mo du début qui restent 35 Mo.' },
					{ q: 'Quelle colonne de l’ancien tuple dit quelle transaction l’a modifié ?', options: ['`t_xmin`', '`t_hoff`', '`t_xmax`', '`t_bits`'], answer: 2, why: '`t_xmin` est la transaction qui l’a inséré, `t_xmax` celle qui l’a supprimé ou verrouillé.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Vérifier le calcul des 185 lignes par page sur une vraie table, lire un en-tête de tuple avec `pageinspect`, et voir qu’un delete ne réduit pas le fichier.',
		steps: [
			'Lance un PostgreSQL jetable : `docker run -d --name pg-pages -e POSTGRES_PASSWORD=lab postgres:18`, attends quelques secondes, puis `docker exec -it pg-pages psql -U postgres`.',
			'Crée et remplis la table : `CREATE TABLE t (id bigint, qty int, flag boolean); INSERT INTO t SELECT g, 1, true FROM generate_series(1, 1000) g;`',
			'Vérifie le calcul : `SELECT ctid, id FROM t WHERE id IN (185, 186);` et `SELECT pg_relation_size(\'t\') / 8192 AS pages, pg_relation_size(\'t\') AS bytes;`',
			'Regarde dans la page 0 pendant qu’un update est encore ouvert : `CREATE EXTENSION pageinspect;` puis `BEGIN; UPDATE t SET qty = qty + 1 WHERE id = 1; SELECT lp, lp_len, t_xmin, t_xmax, t_ctid FROM heap_page_items(get_raw_page(\'t\', 0)) LIMIT 2; SELECT ctid FROM t WHERE id = 1; COMMIT;`',
			'Supprime la moitié des lignes et mesure de nouveau : `DELETE FROM t WHERE id % 2 = 0;` puis `SELECT pg_relation_size(\'t\');`. Quitte avec `\\q` et nettoie avec `docker rm -f pg-pages`.'
		],
		done: [
			'L’id 185 est en `(0,185)` et l’id 186 en `(1,1)` ; la table fait 6 pages, 49152 octets.',
			'`heap_page_items` affiche un `lp_len` de 37 pour chaque tuple : l’en-tête de 24 octets plus 13 octets de données, avant alignement.',
			'Le line pointer 1 a un `t_xmax` différent de 0 et un `t_ctid` égal au nouveau `ctid` de l’id 1.',
			'Après la suppression de 500 lignes, `pg_relation_size` affiche toujours `49152`.'
		],
		solution: [
			'Les 37 octets s’arrondissent à 40 dans la page, plus 4 pour le line pointer : 44 octets par ligne, et 8168 / 44 donne 185 lignes.',
			'L’ancienne version de l’id 1 reste dans la page 0 avec la transaction qui l’a modifiée dans `t_xmax`, et son `t_ctid` pointe vers le nouveau tuple. Le nouveau `ctid` est dans la dernière page, là où il y avait de la place.',
			'Un delete ne fait que marquer les tuples, donc chaque page reste dans le fichier. Les tuples morts s’accumulent jusqu’à ce que VACUUM les retire (jour 16).'
		]
	},
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
