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
		'C’est le **sharding** : une clé de sharding décide quel serveur garde une ligne. Une requête qui donne la clé va sur **un seul serveur**. Une requête qui ne la donne pas doit interroger **tous les serveurs**. Choisis bien la clé et le cluster ressemble à une seule base. Choisis-la mal et chaque page devient un fan-out.'
	],
	terms: [
		{ term: 'Shard', def: 'Un morceau d’une table shardée, une table normale sur un serveur. Citus en crée 32 par table par défaut et les répartit sur les nœuds workers.' },
		{ term: 'Clé de sharding', def: 'La colonne qui décide du shard d’une ligne. Citus l’appelle distribution column. En général un id de tenant ou de client.' },
		{ term: 'Plage de hash', def: 'Chaque shard possède une tranche de l’espace de hash sur 32 bits. Une ligne va dans le shard dont la tranche contient le hash de sa clé.' },
		{ term: 'Co-location', def: 'Des tables shardées sur la même clé et les mêmes plages gardent les lignes qui vont ensemble sur le même nœud, donc les jointures et les transactions sur une clé restent locales.' },
		{ term: 'Table de référence', def: 'Une petite table partagée, comme les pays ou les produits, copiée en entier sur chaque nœud pour que tout shard puisse la joindre.' },
		{ term: 'Fan-out', def: 'Une requête qu’on ne peut pas router par la clé : elle tourne sur chaque shard et les résultats sont fusionnés.' },
		{ term: 'Rééquilibrage', def: 'Déplacer des shards entiers vers d’autres nœuds, par exemple après en avoir ajouté un. Les lignes gardent leur shard ; seule la maison du shard change.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app["App : WHERE tenant_id = 6"] --> coord["Coordinateur Citus"]'],
				highlight: ['app', 'coord'],
				note: '**Un seul point d’entrée.** L’application se connecte au coordinateur, un PostgreSQL ordinaire avec l’extension Citus. Il garde les métadonnées : quels shards existent, et quel worker tient chacun.'
			},
			{
				add: ['coord -->|"hash(6) tombe dans une plage"| w1[("Worker 1")]', 'coord ~~~ w2[("Worker 2")]'],
				highlight: ['w1'],
				note: '**Routée.** Le coordinateur hashe `6`, trouve le shard dont la plage le contient, et envoie toute la requête au worker qui le tient. Un seul nœud fait le travail, comme si c’était une seule base.'
			},
			{
				add: ['w1 --> ev["shard event de cette plage"]', 'w1 --> pg["shard page de la même plage"]'],
				highlight: ['ev', 'pg'],
				note: '**Co-localisées.** `event` et `page` sont toutes deux shardées sur `tenant_id`, donc les shards de la même plage sont sur le même nœud. La jointure entre elles tourne en local, avec tout le SQL et les transactions.'
			},
			{
				add: ['fan["Requête sans tenant_id"] -.->|"une tâche par shard"| w1', 'fan -.-> w2'],
				highlight: ['fan'],
				note: '**Fan-out.** Une requête qui ne filtre pas sur la clé part vers chaque shard, et le coordinateur fusionne les résultats. Très bien pour un rapport nocturne, cher à chaque affichage de page.'
			},
			{
				add: ['w3[("Nouveau worker 3")]', 'w1 -->|"le rééquilibreur déplace des shards entiers"| w3'],
				highlight: ['w3'],
				note: '**Grandir.** Ajoute un worker, et le rééquilibreur y déplace une partie des shards avec la réplication logique. Les lignes ne changent jamais de shard, donc rien n’est rehashé. Seul un changement du nombre de shards déplacerait des lignes.'
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
			'**Hasher, puis indexer.** `FindShardInterval` applique à la clé la fonction de hash de la colonne, celle que PostgreSQL utilise lui-même pour ce type ([`hash_proc_finfo`](' + CITUS + '/src/backend/distributed/metadata/metadata_cache.c?plain=1#L1874-L1880)), puis prend le shard à cet index dans un tableau trié. La même clé tombe toujours dans le même shard.',
			'**Du calcul, pas une recherche.** L’espace de hash a [`HASH_TOKEN_COUNT`](' + CITUS + '/src/include/distributed/metadata_utility.h#L35) valeurs, 2^32. Avec les [32 shards par défaut](' + CITUS + '/src/backend/distributed/shared_library_init.c?plain=1#L2688-L2697), chacun en possède 134 217 728, et `CalculateUniformHashRangeIndex` se résume à une division. Des tables avec les mêmes plages donnent le même index pour la même clé : c’est la [co-location](' + DOCS + '/sharding/data_modeling.rst?plain=1#L104).',
			'**Pourquoi beaucoup de petits shards.** Le nombre de shards est fixé quand la table est distribuée, et il est bien plus grand que le nombre de nœuds. Ajouter un nœud déplace des shards entiers. Le [rééquilibreur](' + DOCS + '/admin_guide/cluster_management.rst?plain=1#L156) utilise la réplication logique, qui "allows application reads and writes to continue uninterrupted" (laisse les lectures et écritures continuer sans interruption), avec un bref verrou d’écriture à la bascule. Changer le nombre lui-même passe par [`alter_distributed_table`](' + DOCS + '/develop/api_udf.rst?plain=1#L242-L262).',
			'**Choisir la clé.** La [doc](' + DOCS + '/sharding/data_modeling.rst?plain=1#L55-L59) demande "high cardinality" (beaucoup de valeurs distinctes) et "even distribution" (une répartition égale) : une colonne `status` à trois valeurs ne remplira jamais plus de trois shards. Et [pas de timestamp](' + DOCS + '/sharding/data_modeling.rst?plain=1#L76-L84) : le hash disperse une plage de temps sur tous les shards, donc "the most recent data" (les données récentes) devient un fan-out. Partitionne plutôt par le temps dans chaque shard.',
			'**Quand s’abstenir.** Citus liste les cas où [il n’est pas adapté](' + DOCS + '/get_started/what_is_citus.rst?plain=1#L131-L139), à commencer par "When you do not expect your workload to ever grow beyond a single Postgres node" (quand ta charge ne dépassera jamais un seul nœud Postgres). Chaque requête, contrainte et transaction entre shards coûte plus cher que sur un seul serveur.'
		]
	},
	tradeoff: {
		gain: [
			'Les écritures passent à l’échelle : chaque nœud est primaire pour ses shards, donc ajouter des nœuds ajoute de la capacité d’écriture, pas seulement de lecture.',
			'Une requête routée par la clé touche un nœud et un petit shard, quelle que soit la taille de la table entière.',
			'Grandir, c’est déplacer des shards, en ligne, avec la réplication logique, pas réécrire chaque ligne.'
		],
		cost: [
			'Chaque table et chaque requête doivent porter la clé. Les contraintes uniques doivent l’inclure, et une recherche par un autre id, comme `order_id` seul, devient un fan-out.',
			'Les jointures, transactions et clés étrangères entre shards sont plus lentes ou limitées. La co-location ne couvre que les requêtes sur une seule valeur de clé.',
			'Un très gros tenant vit quand même sur un seul shard. Une clé déséquilibrée donne un nœud brûlant et des nœuds qui dorment.',
			'Changer de clé plus tard, c’est déplacer chaque ligne. C’est la décision la plus dure à défaire de tout le design.'
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
				'Citus refuse tout simplement de distribuer une table sur une colonne timestamp',
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
	takeaway: 'Ne sharde que quand un seul primaire ne tient plus les écritures, sur une clé que presque chaque requête nomme : les requêtes routées restent aussi peu chères que sur un serveur, et tout le reste part en fan-out.',
	sources: [
		{ title: 'Doc Citus, Choosing Distribution Column', url: 'https://docs.citusdata.com/en/stable/sharding/data_modeling.html' },
		{ title: 'Doc Citus, Cluster Management', url: 'https://docs.citusdata.com/en/stable/admin_guide/cluster_management.html' },
		{ title: 'Doc Vitess, Sharding', url: 'https://vitess.io/docs/reference/features/sharding/' }
	]
};
