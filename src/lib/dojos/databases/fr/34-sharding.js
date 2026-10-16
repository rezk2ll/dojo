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
