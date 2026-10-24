const CITUS = 'https://github.com/citusdata/citus/blob/84489d85ff6576ece7ffce2c4b942e6760722043';
const DOCS = 'https://github.com/citusdata/citus_docs/blob/74f978bccea9e64e744b117e3778820f8cc54a3a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sharding',
	part: 'Au-delà d’un serveur',
	title: 'Le sharding',
	minutes: 10,
	hook: [
		'Ta base tourne déjà sur la plus grosse machine que vend ton hébergeur. Les réplicas ont pris les lectures (jour 28). Mais **chaque écriture arrive encore sur un seul primaire**, et il est à sa limite aux heures de pointe.',
		'Le partitionnement (jour 33) a découpé la table, mais toutes les partitions vivent encore sur ce serveur. Pour aller plus loin, les lignes elles-mêmes doivent vivre sur **plusieurs serveurs, chacun primaire pour sa part**.',
		'Avec le **sharding**, une clé de sharding décide quel serveur garde une ligne. Une requête qui donne la clé va sur un seul serveur, et une requête qui ne la donne pas doit interroger tous les serveurs. Si presque chaque requête donne la clé, la plupart des requêtes touchent un seul serveur. Si les pages ne la donnent pas, chaque affichage de page interroge tous les serveurs.'
	],
	terms: [
		{ term: 'Shard', def: 'Un morceau d’une table shardée, une table normale sur un serveur. Citus en crée 32 par table par défaut et les répartit sur les nœuds workers.' },
		{ term: 'Clé de sharding', def: 'La colonne qui décide du shard d’une ligne. Citus l’appelle la distribution column. En général, c’est un id de tenant ou de client.' },
		{ term: 'Co-location', def: 'Des tables shardées sur la même clé et les mêmes plages gardent les lignes qui vont ensemble sur le même nœud, donc les jointures et les transactions sur une clé restent locales.' },
		{ term: 'Fan-out', def: 'Une requête qu’on ne peut pas router par la clé : elle tourne sur chaque shard et les résultats sont fusionnés.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : WHERE tenant_id = 6"] --> coord["Coordinateur Citus"]'],
				highlight: ['app', 'coord'],
				note: 'L’application se connecte au coordinateur, un PostgreSQL ordinaire avec l’extension Citus. Il garde les métadonnées : quels shards existent, et quel worker tient chacun.'
			},
			{
				add: ['coord -->|"hash(6) tombe dans une plage"| w1[("Worker 1")]', 'coord ~~~ w2[("Worker 2")]'],
				highlight: ['w1'],
				note: 'Le coordinateur hashe `6`, trouve le shard dont la plage le contient, et envoie toute la requête au worker qui le tient. Un seul nœud fait le travail, comme si c’était une seule base.'
			},
			{
				add: ['w1 --> ev["shard event de cette plage"]', 'w1 --> pg["shard page de la même plage"]'],
				highlight: ['ev', 'pg'],
				note: '`event` et `page` sont toutes deux shardées sur `tenant_id`, donc les shards de la même plage sont sur le même nœud. La jointure entre elles tourne en local, avec tout le SQL et les transactions.'
			},
			{
				add: ['fan["Requête sans tenant_id"] -.->|"une tâche par shard"| w1', 'fan -.-> w2'],
				highlight: ['fan'],
				note: 'Une requête qui ne filtre pas sur la clé part vers chaque shard, et le coordinateur fusionne les résultats. Un rapport de nuit peut se le permettre. Une page qui fait ça charge tous les shards à chaque affichage.'
			},
			{
				add: ['w3[("Nouveau worker 3")]', 'w1 -->|"le rééquilibreur déplace des shards entiers"| w3'],
				highlight: ['w3'],
				note: 'Ajoute un worker, et le rééquilibreur y déplace une partie des shards avec la réplication logique. Aucune ligne ne change de shard, donc Citus ne rehashe rien. Seul un changement du nombre de shards déplacerait des lignes.'
			}
		]
	},
	example: {
		title: 'Citus, src/backend/distributed/utils/shardinterval_utils.c : d’une valeur de clé à un shard',
		repo: 'citusdata/citus',
		url: `${CITUS}/src/backend/distributed/utils/shardinterval_utils.c?plain=1#L259-L453`,
		lang: 'c',
		code: `ShardInterval *
FindShardInterval(Datum partitionColumnValue, CitusTableCacheEntry *cacheEntry)
{
	Datum searchedValue = partitionColumnValue;

	if (IsCitusTableTypeCacheEntry(cacheEntry, HASH_DISTRIBUTED))
	{
		searchedValue = FunctionCall1Coll(cacheEntry->hashFunction,
										  cacheEntry->partitionColumn->varcollid,
										  partitionColumnValue);
	}

	int shardIndex = FindShardIntervalIndex(searchedValue, cacheEntry);

	if (shardIndex == INVALID_SHARD_INDEX)
	{
		return NULL;
	}

	return cacheEntry->sortedShardIntervalArray[shardIndex];
}
…
int
CalculateUniformHashRangeIndex(int hashedValue, int shardCount)
{
	int64 hashedValue64 = (int64) hashedValue;

	/* normalize to the 0-UINT32_MAX range */
	int64 normalizedHashValue = hashedValue64 - PG_INT32_MIN;

	/* size of each hash range */
	int64 hashRangeSize = HASH_TOKEN_COUNT / shardCount;

	/* index of hash range into which the hash value falls */
	int shardIndex = (int) (normalizedHashValue / hashRangeSize);

	if (shardIndex < 0 || shardIndex > shardCount)
	{
		ereport(ERROR, (errmsg("bug: shard index %d out of bounds", shardIndex)));
	}

	/*
	 * If the shard count is not power of 2, the range of the last
	 * shard becomes larger than others. For that extra piece of range,
	 * we still need to use the last shard.
	 */
	if (shardIndex == shardCount)
	{
		shardIndex = shardCount - 1;
	}

	return shardIndex;
}`,
		notes: [
			'Les lignes 6 à 10 appliquent à la clé la fonction de hash de la colonne, celle que PostgreSQL utilise lui-même pour ce type ([`hash_proc_finfo`](' + CITUS + '/src/backend/distributed/metadata/metadata_cache.c?plain=1#L1874-L1880)). La ligne 20 renvoie le shard à cet index dans un tableau trié, donc la même clé tombe toujours dans le même shard.',
			'La ligne 32 divise l’espace de hash, [`HASH_TOKEN_COUNT`](' + CITUS + '/src/include/distributed/metadata_utility.h#L35) soit 2^32 valeurs, par le nombre de shards. Avec 32 shards par défaut, chaque shard possède 134 217 728 valeurs, et la ligne 35 trouve l’index en une division. Des tables avec les mêmes plages donnent le même index pour la même clé : Citus appelle ça la co-location.',
			'La ligne 32 utilise `shardCount`, fixé quand la table est distribuée et bien plus grand que le nombre de nœuds. Ajouter un nœud déplace donc des shards entiers. Le [rééquilibreur](' + DOCS + '/admin_guide/cluster_management.rst?plain=1#L156) utilise la réplication logique, qui "allows application reads and writes to continue uninterrupted" (laisse les lectures et écritures continuer sans interruption), avec un bref verrou d’écriture à la bascule. Pour changer le nombre lui-même, il faut `alter_distributed_table`.',
			'La [doc](' + DOCS + '/sharding/data_modeling.rst?plain=1#L55-L59) de Citus demande une clé avec "high cardinality" (beaucoup de valeurs distinctes) et "even distribution" (une répartition égale) : une colonne `status` à trois valeurs ne remplira jamais plus de trois shards. Elle déconseille aussi un timestamp, parce que le hash disperse une plage de temps sur tous les shards. Une requête sur "the most recent data" (les données récentes) tourne alors sur chaque shard. Partitionne plutôt par le temps dans chaque shard.',
			'Citus liste les cas où [il n’est pas adapté](' + DOCS + '/get_started/what_is_citus.rst?plain=1#L131-L139), à commencer par "When you do not expect your workload to ever grow beyond a single Postgres node" (quand ta charge ne dépassera jamais un seul nœud Postgres). Chaque requête, contrainte et transaction entre shards coûte plus cher que sur un seul serveur.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque nœud est primaire pour ses propres shards, donc ajouter des nœuds ajoute de la capacité d’écriture en plus de la capacité de lecture.',
			'Une requête routée par la clé touche un nœud et un petit shard, quelle que soit la taille de la table entière.',
			'Ajouter un nœud déplace des shards entiers, en ligne, avec la réplication logique, et aucune ligne n’est réécrite.'
		],
		cost: [
			'Chaque table et chaque requête doivent porter la clé. Les contraintes uniques doivent l’inclure, et une recherche par un autre id, comme `order_id` seul, tourne sur chaque shard.',
			'Les jointures, transactions et clés étrangères entre shards sont plus lentes ou limitées. La co-location ne couvre que les requêtes sur une seule valeur de clé.',
			'Un très gros tenant vit quand même sur un seul shard. Avec une clé déséquilibrée, un nœud prend l’essentiel de la charge et les autres restent presque inactifs.',
			'Changer de clé plus tard déplace chaque ligne vers un nouveau shard.'
		]
	},
	task: {
		prompt: 'Ta boutique a `customers`, `orders(order_id, customer_id, ...)`, `order_items(order_id, product_id, qty)` et `products` (10 000 lignes). Tu passes sur Citus. Sur papier : choisis la colonne de distribution de chaque table, dis ce que tu dois changer dans le schéma, et dis si chacune de ces requêtes va sur un shard ou part en fan-out : (a) l’historique de commandes d’un client, (b) le top 10 des produits de la semaine, (c) la page de commande `/orders/123`.',
		hint: 'Trouve l’id auquel presque toutes les requêtes se limitent. Une table qui n’a pas cette colonne ne peut pas être co-localisée tant que tu ne l’ajoutes pas.',
		answer: [
			'Distribue `customers`, `orders` et `order_items` sur `customer_id`, co-localisées. `order_items` n’a pas de `customer_id` : ajoute-le, et fais des clés `(customer_id, order_id)` et `(customer_id, order_id, product_id)`, car les contraintes uniques doivent contenir la colonne de distribution.',
			'`products` est petite et tout le monde la joint : fais-en une table de référence, copiée sur chaque nœud.',
			'(a) un shard : `WHERE customer_id = 42` est routée, et la jointure avec `order_items` reste locale grâce à la co-location.',
			'(b) fan-out : elle lit les lignes de tous les clients. Acceptable pour un rapport, sinon précalcule-la dans une table de rollup.',
			'(c) fan-out si l’URL ne porte que `order_id`. Mets le client dans la route, `/customers/42/orders/123`, ou retrouve `customer_id` depuis la session, pour que la requête puisse dire `WHERE customer_id = 42 AND order_id = 123`.'
		],
		steps: [
			{
				title: 'Trouve la clé de sharding',
				questions: [
					{ q: 'À quel id presque toutes les requêtes de la boutique se limitent-elles ?', options: ['`customer_id`', '`order_id`', '`product_id`', '`created_at`'], answer: 0, why: 'Historique, panier, pages de commande : presque tout ce que fait un client nomme ce client. C’est donc la colonne de distribution.' },
					{ q: 'Pourquoi ne pas distribuer sur `created_at`, puisque beaucoup de pages montrent les commandes récentes ?', options: ['Citus ne sait pas hacher un timestamp', 'Le hash éparpille une plage de temps sur tous les shards', 'Un timestamp a trop peu de valeurs distinctes', 'Les timestamps ne sont pas uniques'], answer: 1, why: 'Des instants proches tombent sur des shards différents, donc « la dernière semaine » les touche tous. Partitionne par le temps dans chaque shard à la place (jour 33).' },
					{ q: 'Que demande la doc Citus à une colonne de distribution ?', options: ['Peu de valeurs, pour que chaque shard reste gros', 'Une colonne qui n’apparaît jamais dans un `WHERE`', 'Une forte cardinalité et une répartition égale', 'Un timestamp, pour garder les données dans l’ordre'], answer: 2, why: 'Une colonne `status` à trois valeurs ne remplira jamais plus de trois shards. Beaucoup de clients se répartissent bien.' },
					{ q: 'Pourquoi ne pas distribuer `orders` sur `order_id` ?', options: ['L’historique de commandes d’un client partirait alors en fan-out sur tous les shards', '`order_id` ne peut pas être haché', 'Citus interdit une clé primaire comme clé de sharding', 'Les valeurs de `order_id` sont trop grandes pour le hash'], answer: 0, why: 'La plupart des requêtes nomment le client, pas une commande. Avec `order_id` comme clé, elles perdraient toutes leur routage.' }
				]
			},
			{
				title: 'Change le schéma',
				questions: [
					{ q: '`order_items` n’a pas de `customer_id`. Que fais-tu ?', options: ['La distribuer sur `order_id` à la place', 'En faire une table de référence', 'La garder seulement sur le coordinateur', 'Lui ajouter `customer_id`'], answer: 3, why: 'Une table sans la clé ne peut pas être co-localisée avec `orders`. Ajouter la colonne garde une commande et ses lignes sur le même nœud.' },
					{ q: 'Que devient la clé primaire de `orders` ?', options: ['`(order_id)`', '`(customer_id, order_id)`', '`(order_id, created_at)`', '`(customer_id)`'], answer: 1, why: 'La clé doit contenir la colonne de distribution. `order_id` seul n’est plus accepté.' },
					{ q: 'Pourquoi chaque contrainte unique doit-elle inclure `customer_id` ?', options: ['Chaque shard ne peut vérifier l’unicité que parmi ses propres lignes', 'Citus trie chaque index sur sa première colonne', 'Ça rend l’index plus petit', 'Les clés étrangères ne marchent que sur la première colonne'], answer: 0, why: 'Les contraintes uniques doivent contenir la colonne de distribution, pour que deux clés égales tombent toujours sur le même shard, où on peut les vérifier.' },
					{ q: '`products` a 10 000 lignes et toutes les requêtes la joignent. Qu’en fais-tu ?', options: ['Une table distribuée sur `product_id`', 'Une table distribuée sur `customer_id`', 'Une table de référence, copiée sur chaque nœud', 'Une table sur un seul worker'], answer: 2, why: 'Une petite table que tout le monde joint est copiée sur chaque nœud, donc chaque jointure avec elle reste locale.' }
				]
			},
			{
				title: 'Route les trois requêtes',
				questions: [
					{ q: '(a) L’historique de commandes d’un client, `WHERE customer_id = 42`. Où tourne-t-elle ?', options: ['Sur un seul shard', 'Sur tous les shards', 'Sur deux shards, commandes et lignes', 'Sur le coordinateur seulement'], answer: 0, why: 'Le coordinateur hache 42, trouve le seul shard dont la plage le contient, et y envoie toute la requête.' },
					{ q: 'Pourquoi la jointure de `orders` vers `order_items` reste-t-elle sur ce nœud ?', options: ['Le coordinateur y copie les lignes', 'Les deux sont shardées sur `customer_id` avec les mêmes plages : la co-location', '`order_items` est une table de référence', 'Citus met en cache chaque résultat de jointure'], answer: 1, why: 'Des tables co-localisées gardent les lignes qui vont ensemble sur le même nœud, donc les jointures et les transactions sur une clé restent locales.' },
					{ q: '(b) Le top 10 des produits de la semaine. Où tourne-t-elle ?', options: ['Sur un shard, puisque `products` est une table de référence', 'Sur un shard, puisque la semaine est une plage connue', 'Sur le coordinateur seulement', 'Sur tous les shards : elle lit les lignes de tous les clients'], answer: 3, why: 'La requête ne nomme aucun client, donc elle doit interroger chaque shard et fusionner les réponses.' },
					{ q: '(c) `/orders/123`, avec seulement `order_id` dans l’URL. Où tourne-t-elle ?', options: ['Sur un shard, trouvé à partir de `order_id`', 'Sur le coordinateur, qui garde toutes les commandes', 'Sur tous les shards', 'Sur le worker le plus récent'], answer: 2, why: 'Le routage a besoin de la valeur de la colonne de distribution. Sans `customer_id`, le shard est inconnu.' }
				]
			},
			{
				title: 'Corrige ce qui part en fan-out',
				questions: [
					{ q: 'Comment routes-tu la page de commande (c) vers un seul shard ?', options: ['Fais porter le client : `/customers/42/orders/123`, ou `customer_id` depuis la session', 'Ajoute un index sur `order_id`', 'Augmente le nombre de shards', 'Fais de `orders` une table de référence'], answer: 0, why: 'Avec `WHERE customer_id = 42 AND order_id = 123`, le coordinateur connaît le shard. Un index ne lui dit pas quel shard interroger.' },
					{ q: 'Le rapport top 10 (b) tourne à chaque affichage de page. Que fais-tu ?', options: ['Distribuer aussi `order_items` sur `product_id`', 'Le précalculer dans une table de rollup', 'Ajouter des workers', 'Indexer `created_at` sur chaque shard'], answer: 1, why: 'Un fan-out passe pour un rapport de nuit. Sur une page, lis plutôt un rollup précalculé.' },
					{ q: 'Un client passe un tiers de toutes les commandes. Que se passe-t-il ?', options: ['Citus répartit ce client sur tous les shards', 'Le rebalancer déplace ses lignes vers le nœud le plus vide', 'Toutes ses lignes vivent encore sur un shard, donc un nœud prend l’essentiel de la charge', 'Ses commandes sont copiées sur chaque nœud'], answer: 2, why: 'Une valeur de clé correspond à un seul shard. Une clé déséquilibrée laisse un nœud surchargé pendant que les autres attendent.' },
					{ q: 'Plus tard, tu ajoutes un troisième worker et tu rééquilibres. Qu’est-ce qui bouge ?', options: ['Chaque ligne est re-hachée dans de nouveaux shards', 'Rien, tant que tu n’augmentes pas le nombre de shards', 'Seules les nouvelles lignes vont sur le nouveau worker', 'Quelques shards entiers, et chaque ligne garde son shard'], answer: 3, why: 'Le nombre de shards est fixe, donc le rebalancer déplace des shards entiers par réplication logique. Rien n’est re-haché.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une équipe distribue sa table `events` sur `created_at`. La plupart des requêtes lisent la dernière heure. Que se passe-t-il ?',
			options: [
				'La dernière heure tombe sur un seul shard, qui devient le seul nœud occupé',
				'Le hash éparpille la dernière heure sur tous les shards, d’où un fan-out',
				'Citus refuse dans tous les cas de distribuer une table sur une colonne timestamp',
				'Les requêtes vont sur un seul shard, parce que la plage de temps est connue'
			],
			answer: 1,
			why: 'Le hash d’un timestamp disperse des instants proches sur des shards différents. Toute plage de temps touche alors chaque shard. La doc dit de distribuer sur un id de tenant ou d’entité, et d’utiliser le partitionnement PostgreSQL pour le temps (jour 33).'
		},
		{
			q: 'Un cluster Citus a deux workers et une table de 32 shards. Tu ajoutes un troisième worker et tu rééquilibres. Qu’est-ce qui bouge ?',
			options: [
				'Chaque ligne est rehashée dans 48 nouveaux shards répartis sur trois workers',
				'Rien, tant que tu n’augmentes pas le nombre de shards avec `alter_distributed_table`',
				'Des shards entiers sont copiés vers le nouveau worker, et les lignes gardent leur shard',
				'Les nouvelles lignes vont sur le nouveau worker, les anciennes restent où elles sont'
			],
			answer: 2,
			why: 'Le nombre de shards est fixé quand la table est distribuée. Le rééquilibrage déplace des shards entiers entre nœuds avec la réplication logique, donc aucune ligne ne change de shard et rien n’est rehashé.'
		},
		{
			q: '`orders` est distribuée sur `customer_id`. Pourquoi `SELECT * FROM orders WHERE order_id = 123` coûte cher ?',
			options: [
				'Citus doit d’abord reconstruire un index global sur order_id entre les workers',
				'Le coordinateur garde une copie de chaque commande et doit tout parcourir',
				'order_id est hashé avec une autre fonction, donc le routage échoue',
				'Sans customer_id, le shard est inconnu, donc chaque shard est interrogé'
			],
			answer: 3,
			why: 'Le routage a besoin de la valeur de la colonne de distribution. Sans elle, le coordinateur envoie la requête à tous les shards et fusionne les réponses : un fan-out. Fais porter la clé à chaque requête.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Sharder le schéma de la boutique sur `customer_id` dans un Citus à un nœud, et lire `Task Count` dans `EXPLAIN` pour voir quelles requêtes vont sur un shard et lesquelles partent en fan-out.',
		steps: [
			'Lance Citus, une image PostgreSQL avec l’extension chargée, et ouvre `psql` : `docker run -d --name shard-lab -e POSTGRES_PASSWORD=lab citusdata/citus:12.1`, attends quelques secondes, puis `docker exec -it shard-lab psql -U postgres`. Un seul nœud est à la fois coordinateur et worker, ce qui suffit pour voir le routage.',
			'Crée les quatre tables avec les clés de l’exercice : `customers (customer_id bigint PRIMARY KEY, name text)`, `orders (customer_id bigint, order_id bigint, total numeric, PRIMARY KEY (customer_id, order_id))`, `order_items (customer_id bigint, order_id bigint, product_id bigint, qty int, PRIMARY KEY (customer_id, order_id, product_id))` et `products (product_id bigint PRIMARY KEY, name text)`.',
			'Distribue-les : `SELECT create_distributed_table(\'customers\', \'customer_id\');`, pareil pour `orders` et `order_items` avec `colocate_with => \'customers\'`, et `SELECT create_reference_table(\'products\');`. Compte les shards : `SELECT logicalrelid, count(*) FROM pg_dist_shard GROUP BY 1;`.',
			'Essaie une table dont la clé oublie la colonne de distribution : `CREATE TABLE bad (id bigint PRIMARY KEY, customer_id bigint); SELECT create_distributed_table(\'bad\', \'customer_id\');`.',
			'Lance `EXPLAIN (COSTS OFF)` sur les trois requêtes de l’exercice : (a) `SELECT o.order_id, i.product_id FROM orders o JOIN order_items i USING (customer_id, order_id) WHERE o.customer_id = 42;`, (b) `SELECT product_id, sum(qty) FROM order_items GROUP BY product_id ORDER BY 2 DESC LIMIT 10;`, (c) `SELECT * FROM orders WHERE order_id = 123;`. Puis corrige (c) en ajoutant `customer_id = 42` et relance l’`EXPLAIN`.',
			'Quand tu as fini : `docker rm -f shard-lab`.'
		],
		done: [
			'`pg_dist_shard` liste 32 shards pour chaque table distribuée et 1 pour `products`.',
			'Distribuer `bad` échoue : `Distributed relations cannot have UNIQUE, EXCLUDE, or PRIMARY KEY constraints that do not include the partition column`.',
			'(a) affiche `Task Count: 1`, avec la jointure vers `order_items` dans cette seule tâche.',
			'(b) et (c) affichent `Task Count: 32`.',
			'(c) avec `customer_id = 42 AND order_id = 123` affiche `Task Count: 1`.'
		],
		solution: [
			'`SELECT create_distributed_table(\'orders\', \'customer_id\', colocate_with => \'customers\');` et la même ligne pour `order_items`.',
			'(c) corrigée : `EXPLAIN (COSTS OFF) SELECT * FROM orders WHERE customer_id = 42 AND order_id = 123;`. Le plan est un seul index scan sur un seul shard.',
			'`Task Count` est le nombre de shards que le coordinateur interroge. Avec plus de workers, un compte de 32 veut dire que chaque worker travaille à chaque appel.'
		]
	},
	recall: {
		q: '`orders` est distribuée sur `customer_id`. Quelles requêtes vont sur un seul shard, et lesquelles vont sur tous ?',
		a: 'Une requête avec `WHERE customer_id = 42` va sur le seul shard dont la plage de hash contient 42. Une requête sans `customer_id`, comme `WHERE order_id = 123`, part sur tous les shards, 32 par défaut.'
	},
	sources: [
		{ title: 'Doc Citus, Choosing Distribution Column', url: 'https://docs.citusdata.com/en/stable/sharding/data_modeling.html' },
		{ title: 'Doc Citus, Cluster Management', url: 'https://docs.citusdata.com/en/stable/admin_guide/cluster_management.html' },
		{ title: 'Source Citus, shared_library_init.c : nombre de shards par défaut', url: `${CITUS}/src/backend/distributed/shared_library_init.c?plain=1#L2688-L2697` },
		{ title: 'Source de la doc Citus, api_udf.rst : alter_distributed_table', url: `${DOCS}/develop/api_udf.rst?plain=1#L242-L262` },
		{ title: 'Doc Vitess, Sharding', url: 'https://vitess.io/docs/reference/features/sharding/' }
	]
};
