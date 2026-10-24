const DD = 'https://github.com/duckdb/duckdb/blob/1b4c3e54ba3625bac56ad184f0ce642a8d2bfbd5';
const CKPT = `${DD}/src/storage/table/column_data_checkpointer.cpp`;
const DW = 'https://github.com/duckdb/duckdb-web/blob/704f9e622a04b799e63d3d2d2cabeef1a2c6ba39/docs/current';
const CH = 'https://github.com/ClickHouse/clickhouse-docs/blob/89036285e33b88b424ebc397cce3cb70e9c2b5a9';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'columnar',
	part: 'Au-delà d’un serveur',
	title: 'Des colonnes pour l’analytique',
	minutes: 10,
	hook: [
		'La compta veut le chiffre d’affaires par mois sur les trois dernières années. La requête tient en une ligne : `SELECT date_trunc(\'month\', created_at), sum(total) FROM orders GROUP BY 1`. Sur ta table `orders` à 40 colonnes, **elle tourne pendant des minutes** et ralentit le paiement en attendant.',
		'La requête a besoin de deux colonnes. Mais PostgreSQL range **des lignes entières ensemble** dans des pages de 8 Ko (jour 9) : pour lire `total`, il lit aussi l’adresse, les notes et les 36 autres colonnes, pour chaque commande jamais passée.',
		'Les moteurs analytiques comme DuckDB et ClickHouse rangent les données autrement : **chaque colonne est stockée à part**, compressée, avec un min et un max par bloc. La même requête lit une petite partie des données, et saute souvent des blocs entiers sans les ouvrir.'
	],
	terms: [
		{ term: 'Stockage en lignes', def: 'Toutes les colonnes d’une ligne sont côte à côte sur le disque. Rapide pour lire ou modifier une ligne entière. Le heap de PostgreSQL range les lignes ainsi.' },
		{ term: 'Stockage en colonnes', def: 'Chaque colonne est stockée à part. Une requête ne lit que les colonnes qu’elle nomme. DuckDB et ClickHouse fonctionnent ainsi.' },
		{ term: 'Row group', def: 'Une tranche horizontale d’une table, stockée colonne par colonne. Dans DuckDB, 122 880 lignes par défaut. La compression et le parallélisme travaillent par row group.' },
		{ term: 'Zonemap', def: 'Le min et le max d’une colonne dans un bloc. Un filtre qui tombe hors de l’intervalle saute le bloc sans le lire. On dit aussi index min-max.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['q["sum(total) par mois"] --> heap[("Stockage en lignes : chaque page contient des lignes entières, 40 colonnes")]'],
				highlight: ['q', 'heap'],
				note: 'Dans un stockage en lignes, `total` est éparpillé dans toutes les pages de la table, entre les autres colonnes. Pour en faire la somme, PostgreSQL lit toutes les pages. Cette disposition convient au paiement, qui lit et écrit une commande entière à la fois.'
			},
			{
				add: ['q --> rg["Row group : 122 880 lignes"]', 'rg --> c1[("created_at")]', 'rg --> c2[("total")]', 'rg -.->|"pas lues"| c3[("38 autres colonnes")]'],
				highlight: ['rg', 'c1', 'c2'],
				note: 'DuckDB découpe une table en row groups et stocke chaque colonne d’un row group à part. Selon la [FAQ](' + CH + '/docs/faq/general/columnar-database.md#L15) de ClickHouse, cette disposition « allows reading data from disk only for those columns that are used in any given query » (permet de ne lire sur le disque que les colonnes utilisées par la requête). Les 38 autres colonnes ne sont jamais touchées.'
			},
			{
				add: ['rg --> comp["Par colonne : essayer chaque encodage, garder le plus petit"]'],
				highlight: ['comp'],
				note: 'Une colonne `status` contient trois mots répétés un million de fois. Au checkpoint, DuckDB analyse chaque colonne avec chaque encodage candidat et garde celui dont la taille estimée est la plus faible : dictionnaire pour `status`, bit packing pour les nombres qui tiennent sur peu de bits.'
			},
			{
				add: ['zm["Zonemap : min et max par row group"] -->|"saute les groupes avant 2026"| rg'],
				highlight: ['zm'],
				note: 'DuckDB garde le min et le max de chaque colonne pour chaque row group. Avec `WHERE created_at >= \'2026-01-01\'`, chaque row group dont le max est plus ancien est sauté. Ça ne marche bien que si les données sont à peu près triées sur cette colonne, comme le sont souvent les dates.'
			},
			{
				add: ['c2 -->|"2048 valeurs à la fois"| vec["Agrégat vectorisé"]'],
				highlight: ['vec'],
				note: 'Les opérateurs de DuckDB travaillent sur des vecteurs de taille fixe, 2048 valeurs par défaut. Un vecteur est un tableau d’un seul type, qui peut même rester compressé. Un appel d’opérateur traite 2048 valeurs au lieu d’une ligne.'
			}
		]
	},
	example: {
		title: 'src/storage/table/column_data_checkpointer.cpp : DuckDB choisit une compression par colonne',
		repo: 'duckdb/duckdb',
		url: `${CKPT}#L172-L254`,
		lang: 'cpp',
		code: `vector<CheckpointAnalyzeResult> ColumnDataCheckpointer::DetectBestCompressionMethod() {
…
	InitAnalyze();
	// scan over all the segments and run the analyze step
	ScanSegments([&](Vector &scan_vector) {
		for (idx_t i = 0; i < checkpoint_states.size(); i++) {
			auto &functions = compression_functions[i];
			auto &states = analyze_states[i];
			for (idx_t j = 0; j < functions.size(); j++) {
				auto &state = states[j];
				auto &func = functions[j];

				if (!state) {
					continue;
				}
				if (!func->analyze(*state, scan_vector)) {
					state = nullptr;
					func = nullptr;
				}
			}
		}
	});
…
		unique_ptr<AnalyzeState> chosen_state;
		idx_t best_score = NumericLimits<idx_t>::Maximum();
		idx_t compression_idx = DConstants::INVALID_INDEX;

		D_ASSERT(functions.size() == states.size());
		for (idx_t j = 0; j < functions.size(); j++) {
			auto &function = functions[j];
			auto &state = states[j];

			if (!state) {
				continue;
			}

			//! Check if the method type is the forced method (if forced is used)
			bool forced_method_found = function->type == forced_method;
			// now that we have passed over all the data, we need to figure out the best method
			// we do this using the final_analyze method
			auto score = function->final_analyze(*state);

			//! The finalize method can return this value from final_analyze to indicate it should not be used.
			if (score == DConstants::INVALID_INDEX) {
				continue;
			}

			if (score < best_score || forced_method_found) {
				compression_idx = j;
				best_score = score;
				chosen_state = std::move(state);
			}
			//! If we have found the forced method, we're done
			if (forced_method_found) {
				break;
			}
		}`,
		notes: [
			'Les lignes 5 à 22 passent les données de la colonne, vecteur par vecteur, à la fonction `analyze` de chaque encodage candidat. Une méthode qui ne sait pas gérer les données renvoie false à la ligne 16 et n’est plus essayée. Ce code tourne quand une colonne est [écrite sur le disque](' + CKPT + '#L310-L312) au checkpoint.',
			'La ligne 41 obtient de `final_analyze` un score, une estimation en octets, et les lignes 48 à 52 gardent le plus bas. Pour le run-length, le score vaut [(compteur + valeur) fois le nombre de séries](' + DD + '/src/storage/compression/rle.cpp#L130-L134), et pour le bit packing, la taille totale compactée. Une méthode imposée par les réglages (ligne 38) passe avant ce choix.',
			'La [doc](' + DW + '/internals/storage.md#L214-L218) dit que la compression et le parallélisme « are based on row groups » (reposent sur les row groups), dont la taille par défaut est de 122 880 lignes. Une colonne peut être encodée en dictionnaire dans un row group et stockée sans compression dans le suivant.',
			'Le [guide sur l’indexation](' + DW + '/guides/performance/indexing.md#L19-L24) dit « The more ordered the data within a column, the more valuable the zonemap indexes will be » (plus une colonne est ordonnée, plus les zonemaps servent), et qu’avec des valeurs aléatoires DuckDB « will likely be unable to skip any row groups ». Les données triées se compressent aussi mieux : dans le même guide, une colonne de dates ordonnée est 2,5 fois plus petite qu’une colonne non ordonnée.'
		]
	},
	tradeoff: {
		gain: [
			'Une requête qui nomme 2 colonnes sur 40 lit à peu près 2 colonnes de données, pas 40.',
			'Les valeurs d’un même type et d’un même sens sont regroupées, donc elles se compressent bien. La [doc](' + DW + '/internals/storage.md#L211-L212) de DuckDB estime que 100 Go de CSV non compressé prennent environ 25 Go une fois chargés.',
			'Les zonemaps sautent des row groups entiers sur une colonne triée, sans index à créer ni à entretenir.',
			'Les opérateurs travaillent sur des vecteurs de 2048 valeurs d’un seul type, donc chaque appel fait le travail de 2048 lignes.'
		],
		cost: [
			'Lire une commande par son id touche chaque fichier de colonne. La FAQ de ClickHouse : « operations that affect whole rows become proportionally more expensive » (les opérations sur des lignes entières coûtent proportionnellement plus).',
			'Le [guide d’insertion](' + CH + '/docs/best-practices/_snippets/_async_inserts.md#L7) de ClickHouse prévient que « Sending many small batches in synchronous mode isn\'t recommended » (envoyer beaucoup de petits lots en synchrone est déconseillé). Une copie des commandes par lots s’y prête, alors que le paiement écrit une commande à la fois.',
			'Un second moteur, c’est un pipeline pour y copier les données, et des rapports en retard sur la base en service.',
			'Les zonemaps n’aident que sur les colonnes selon lesquelles les données sont ordonnées. Un filtre sur un UUID aléatoire lit tous les row groups.'
		]
	},
	task: {
		prompt: 'Ta table `orders` a 50 millions de lignes d’environ 200 octets chacune, sur 40 colonnes. Le rapport a besoin de `created_at` (8 octets) et `total` (8 octets) pour 2026 seulement, et les commandes ont été insérées dans l’ordre des dates sur 5 ans. Estime combien d’octets lit un stockage en lignes et combien lit un stockage en colonnes, avant compression. Puis essaie en petit dans DuckDB et regarde `pragma_storage_info(\'orders\')`.',
		hint: 'En lignes : chaque page contient des lignes entières. En colonnes : deux colonnes, puis retire ce que la zonemap peut sauter.',
		answer: [
			'En lignes : 50 millions fois 200 octets, environ 10 Go, lus en entier, parce que le filtre ne peut pas éviter de pages sans index, et même avec un index le rapport touche un cinquième de la table.',
			'En colonnes, deux colonnes seulement : 50 millions fois 16 octets, soit 800 Mo.',
			'Zonemaps sur `created_at` : les données sont dans l’ordre des dates, donc les row groups d’avant 2026 ont un max sous le filtre et sont sautés. Une année sur cinq laisse environ 160 Mo, avant toute compression.',
			'Avec DuckDB 1.5, une copie d’un million de lignes avec un `id`, un `created_at` toutes les 30 secondes, un `status` à 3 valeurs et un `total` a montré `Dictionary` pour `status` et `BitPacking` pour les autres dans `pragma_storage_info`. Le fichier de base pesait 2,7 Mio, alors que les mêmes lignes dans un heap PostgreSQL prenaient 58 Mo.',
			'Conclusion : garde le paiement sur PostgreSQL, et copie les commandes par lots vers un stockage en colonnes pour les rapports, en acceptant qu’ils aient quelques minutes de retard.'
		],
		steps: [
			{
				title: 'Estime le stockage en lignes',
				questions: [
					{ q: 'Sans index sur `created_at`, combien d’octets lit un stockage en lignes pour le rapport, avant compression ?', options: ['Environ 10 Go', 'Environ 800 Mo', 'Environ 160 Mo', 'Environ 2 Go'], answer: 0, why: '50 millions de lignes de 200 octets, c’est environ 10 Go, et chaque page est lue.' },
					{ q: 'Pourquoi lit-il tout ça pour deux colonnes ?', options: ['Il décompresse d’abord chaque page', 'Chaque page contient des lignes entières, donc `total` vient avec les 38 autres colonnes', 'Il lit aussi chaque index', 'PostgreSQL lit chaque ligne deux fois'], answer: 1, why: 'Les deux colonnes sont réparties dans toutes les pages de la table, entre les autres colonnes.' },
					{ q: 'Tu ajoutes un index sur `created_at`. Pourquoi le rapport reste-t-il cher ?', options: ['Les index ne servent pas pour un `sum`', 'L’index est ignoré sur les timestamps', '2026 fait un cinquième de la table, et chaque ligne lue reste une ligne entière', 'L’index grossit les pages'], answer: 2, why: 'Un index trouve des lignes, mais chaque ligne trouvée amène encore ses 40 colonnes.' },
					{ q: 'À quoi le stockage en lignes est-il bon, alors ?', options: ['Le chiffre d’affaires par mois sur cinq ans', 'Compter les visiteurs distincts sur un an', 'Des moyennes sur toutes les commandes passées', 'Lire ou écrire une commande entière, comme le paiement'], answer: 3, why: 'Une ligne entière tient dans une page, donc une commande, c’est une lecture ou une écriture de page.' }
				]
			},
			{
				title: 'Estime le stockage en colonnes',
				questions: [
					{ q: 'De combien d’octets par ligne le rapport a-t-il besoin ?', options: ['16', '200', '8', '40'], answer: 0, why: '`created_at` fait 8 octets et `total` 8 octets.' },
					{ q: 'Combien d’octets lit le stockage en colonnes pour ces deux colonnes, avant de sauter quoi que ce soit ?', options: ['Environ 10 Go', 'Environ 800 Mo', 'Environ 160 Mo', 'Environ 80 Mo'], answer: 1, why: '50 millions de lignes fois 16 octets, c’est 800 Mo.' },
					{ q: 'Pourquoi ne touche-t-il jamais les 38 autres colonnes ?', options: ['Elles sont compressées à rien', 'Une zonemap les saute', 'Chaque colonne est stockée à part, et la requête n’en nomme que deux', 'Il garde un index sur chaque colonne'], answer: 2, why: 'Une requête ne lit que les colonnes qu’elle nomme. Les autres restent dans leurs propres fichiers, sans être touchées.' },
					{ q: 'Qu’est-ce qui rend le vrai chiffre encore plus petit ?', options: ['Des row groups plus gros', 'Un B-tree sur chaque colonne', 'L’échantillonnage d’une partie des lignes', 'La compression : les valeurs d’une colonne se ressemblent'], answer: 3, why: 'Une colonne d’un seul type et d’un seul sens se compresse bien, donc encore moins d’octets sortent du disque.' }
				]
			},
			{
				title: 'Applique les zonemaps',
				questions: [
					{ q: 'Que garde une zonemap pour chaque row group ?', options: ['Le min et le max de la colonne', 'Toutes les valeurs, triées', 'Un hash de chaque valeur', 'Seulement le nombre de NULL'], answer: 0, why: 'Un filtre qui tombe hors de l’intervalle min-max saute le row group sans le lire.' },
					{ q: 'Pourquoi les row groups d’avant 2026 peuvent-ils être sautés ici ?', options: ['DuckDB connaît l’année en cours', 'Les commandes ont été insérées dans l’ordre des dates, donc leur max est sous le filtre', 'Les vieux row groups sont plus compressés', 'Les vieux row groups sont supprimés au checkpoint'], answer: 1, why: 'Les zonemaps paient quand les données sont à peu près triées sur la colonne filtrée, comme des dates insérées au fil du temps.' },
					{ q: 'Il reste une année sur cinq. Combien d’octets ça fait, avant compression ?', options: ['Environ 800 Mo', 'Environ 10 Go', 'Environ 160 Mo', 'Environ 16 Mo'], answer: 2, why: 'Un cinquième de 800 Mo, c’est 160 Mo.' },
					{ q: 'Si les commandes avaient été chargées dans un ordre de dates aléatoire, qu’est-ce qui changerait ?', options: ['Rien : les zonemaps trient les données', 'Plus de row groups seraient sautés', 'Le stockage en colonnes refuserait le filtre', 'Chaque row group couvrirait toutes les dates, donc aucun ne pourrait être sauté'], answer: 3, why: 'Avec des valeurs aléatoires, DuckDB "will likely be unable to skip any row groups" (ne pourra sans doute sauter aucun row group).' }
				]
			},
			{
				title: 'Vérifie et décide',
				questions: [
					{ q: 'Où vois-tu l’encodage que DuckDB a choisi pour chaque colonne ?', options: ['`pragma_storage_info(\'orders\')`', 'Un `EXPLAIN` du rapport', 'Le `pg_stats` de PostgreSQL', '`information_schema.columns`'], answer: 0, why: 'Il liste chaque segment de chaque colonne avec sa compression.' },
					{ q: 'Quel encodage convient à `status`, trois mots répétés un million de fois ?', options: ['Le bit packing', 'L’encodage par dictionnaire', 'Pas de compression', 'Un fichier par valeur'], answer: 1, why: 'Un dictionnaire stocke les trois mots une fois et un petit code par ligne.' },
					{ q: 'Comment DuckDB choisit-il un encodage ?', options: ['Un encodage fixe par type', 'Tu le nommes dans le `CREATE TABLE`', 'Il essaie chaque candidat au checkpoint et garde la plus petite taille estimée', 'Il prend le plus récent'], answer: 2, why: 'Chaque candidat analyse les données de la colonne et renvoie une estimation de taille, et la plus petite gagne.' },
					{ q: 'Que fais-tu du paiement et des rapports ?', options: ['Passer aussi le paiement sur DuckDB', 'Indexer les 40 colonnes dans PostgreSQL', 'Envoyer chaque commande à ClickHouse dès qu’elle est passée', 'Garder le paiement sur PostgreSQL, et copier les commandes par lots vers un stockage en colonnes pour les rapports'], answer: 3, why: 'Le paiement écrit une ligne à la fois, ce qu’un stockage en lignes fait le mieux. Les rapports acceptent quelques minutes de retard.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une table de 40 colonnes contient 100 millions de lignes. Pourquoi `SELECT avg(total) FROM orders` va-t-il bien plus vite sur un stockage en colonnes ?',
			options: [
				'Il ne lit que la colonne `total`, qui est en plus stockée compressée',
				'Il garde une moyenne courante de chaque colonne, mise à jour à chaque insert',
				'Il construit un B-tree sur chaque colonne, donc la moyenne est dans l’index',
				'Il échantillonne une partie des lignes et renvoie un résultat estimé'
			],
			answer: 0,
			why: 'Chaque colonne est stockée à part, donc la requête lit une colonne sur quarante. Les valeurs d’une colonne se ressemblent, donc elles se compressent bien, et encore moins d’octets sont lus.'
		},
		{
			q: 'Quelle charge convient mieux à un stockage en lignes comme PostgreSQL qu’à un stockage en colonnes ?',
			options: [
				'Le chiffre d’affaires par pays et par mois sur cinq ans de commandes',
				'Charger la commande complète, toutes colonnes, d’un paiement par id',
				'Compter les visiteurs uniques par page sur un milliard de pages vues',
				'Le retard moyen de livraison par transporteur sur tous les envois'
			],
			answer: 1,
			why: 'Lire ou écrire une ligne entière, c’est ce qu’un stockage en lignes fait le mieux : la ligne tient dans une page. Dans un stockage en colonnes, la même lecture touche chaque colonne séparément, ce qui est « proportionally more expensive ».'
		},
		{
			q: 'Une table DuckDB est filtrée avec `WHERE event_id = \'…\'` sur une colonne d’UUID aléatoires, et le parcours lit tous les row groups. Pourquoi ?',
			options: [
				'DuckDB ne garde pas de min et de max pour les colonnes de texte',
				'Des valeurs aléatoires donnent à chaque row group un min et un max très écartés',
				'Les zonemaps ne marchent que si la table a une clé primaire explicite',
				'Les filtres d’égalité ignorent toujours les zonemaps et lisent tout'
			],
			answer: 1,
			why: 'Une zonemap ne saute un row group que si la valeur tombe hors de son intervalle min-max. Avec des UUID aléatoires, chaque intervalle est large, donc rien n’est sauté. Le guide de DuckDB conseille des entiers ordonnés pour ce genre de filtre.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Charger un million de commandes dans DuckDB, lire les encodages choisis, et voir les zonemaps sauter des row groups sur des données triées mais pas sur des données mélangées.',
		steps: [
			'Installe DuckDB pour Python dans un dossier à part : `mkdir -p ~/col-lab && cd ~/col-lab && python3 -m venv venv && venv/bin/pip install duckdb==2.0.0`.',
			'Écris `q.py`, qui lance une instruction SQL sur `orders.duckdb` : `import duckdb, sys`, `con = duckdb.connect("orders.duckdb")`, `r = con.sql(sys.argv[1])`, puis `if r is not None: print(r.fetchall()[0][1] if sys.argv[1].startswith("EXPLAIN") else r)`.',
			'Charge cinq ans de commandes dans l’ordre des dates : `venv/bin/python q.py "CREATE TABLE orders AS SELECT i AS id, TIMESTAMP \'2022-01-01\' + i * INTERVAL 158 SECOND AS created_at, ([\'paid\', \'shipped\', \'refunded\'])[1 + i % 3] AS status, (i % 500)::DECIMAL(10,2) AS total FROM range(1000000) t(i)"`, puis `venv/bin/python q.py "CHECKPOINT"` et `ls -l orders.duckdb`.',
			'Lis les encodages : `venv/bin/python q.py "SELECT column_name, compression, count(*) AS segments FROM pragma_storage_info(\'orders\') GROUP BY ALL ORDER BY ALL"`.',
			'Lance le rapport avec un filtre sur 2026 et lis le parcours : `venv/bin/python q.py "EXPLAIN ANALYZE SELECT sum(total) FROM orders WHERE created_at >= \'2026-01-01\'" | grep "Row Groups"`.',
			'Fais une copie mélangée et lance le même filtre dessus : `venv/bin/python q.py "CREATE TABLE shuffled AS SELECT * FROM orders ORDER BY random()"`, puis le même `EXPLAIN ANALYZE` sur `shuffled`.'
		],
		done: [
			'`orders.duckdb` pèse environ 3 Mo pour un million de lignes.',
			'`pragma_storage_info` montre `BitPacking` pour `id`, `created_at` et `total`, et un encodage par dictionnaire (`DICT_FSST` dans DuckDB 2.0) pour `status`.',
			'Sur `orders`, le parcours affiche `Row Groups Scanned: 3 / 9`.',
			'Sur `shuffled`, la même requête affiche `Row Groups Scanned: 9 / 9`.'
		],
		solution: [
			'Les row groups contiennent 122 880 lignes chacun, donc un million de lignes en font 9. Dans l’ordre des dates, seuls les trois derniers peuvent contenir 2026, et les zonemaps écartent les six autres.',
			'Après le mélange, chaque row group contient des dates des cinq années, donc chaque intervalle min-max couvre le filtre et rien n’est sauté.',
			'Pour comparer, la note de l’exercice a mesuré les mêmes lignes dans un heap PostgreSQL à 58 Mo. Le stockage en colonnes gagne sur les octets lus, et perd toujours pour lire une commande entière par id.'
		]
	},
	recall: {
		q: 'Un rapport fait la somme de 2 colonnes d’une table de 40, filtrée sur une date. Que saute un stockage en colonnes comme DuckDB, alors qu’un stockage en lignes le lit ?',
		a: 'Les 38 autres colonnes, et chaque row group dont le max de `created_at` dans la zonemap est sous le filtre. Un row group contient 122 880 lignes par défaut.'
	},
	sources: [
		{ title: 'DuckDB, bitpacking.cpp (estimation de la taille compactée)', url: `${DD}/src/storage/compression/bitpacking.cpp#L431-L439` },
		{ title: 'DuckDB, storage_info.hpp (taille d’un row group)', url: `${DD}/src/include/duckdb/storage/storage_info.hpp#L22-L23` },
		{ title: 'Sources de la doc DuckDB, indexing.md (taille ordonnée ou non)', url: `${DW}/guides/performance/indexing.md#L30-L35` },
		{ title: 'Documentation ClickHouse, What is a columnar database?', url: 'https://clickhouse.com/docs/faq/general/columnar-database' },
		{ title: 'Documentation DuckDB, Storage', url: 'https://duckdb.org/docs/stable/internals/storage' },
		{ title: 'Documentation DuckDB, Indexing (zonemaps)', url: 'https://duckdb.org/docs/stable/guides/performance/indexing' },
		{ title: 'Documentation DuckDB, Execution format (vecteurs)', url: 'https://duckdb.org/docs/stable/internals/vector' },
		{ title: 'Documentation PostgreSQL, Database Page Layout', url: 'https://www.postgresql.org/docs/current/storage-page-layout.html' }
	]
};
