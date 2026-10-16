const REPO = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';
const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const PRODUCER = `${REPO}/clients/src/main/java/org/apache/kafka/clients/producer`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'scaling-data',
	part: 'Fait pour durer',
	title: 'Faire grandir les données',
	minutes: 10,
	hook: [
		'Ton SaaS de tickets garde les tickets de tous les clients dans un seul serveur Postgres. Chaque mois, il contient plus de lignes et reçoit plus d’écritures. Un jour, **une seule base ne suffit plus**.',
		'Une machine plus grosse fait gagner du temps, une fois. Après, il y a deux problèmes et deux solutions. **Trop de lectures** : garde des copies, appelées réplicas, et répartis les lectures dessus. **Trop de données ou trop d’écritures** : les copies n’aident pas, puisque chaque copie reçoit chaque écriture. Tu dois **découper les données**, pour que chaque nœud n’en garde qu’une partie.',
		'Découper est une porte à sens unique (jour 5). Une fois les lignes réparties selon une clé, chaque requête soit **nomme cette clé et touche un seul endroit, soit interroge tout le monde**. Aujourd’hui : comment Discourse place chaque site avec un annuaire, comment Kafka place chaque événement en hachant sa clé, et ce que coûte une requête sans la clé.'
	],
	terms: [
		{ term: 'Partition (shard)', def: 'Une tranche des données, gardée par un nœud ou un cluster. Chaque ligne vit dans exactement une partition. Le sharding, c’est le partitionnement sur plusieurs machines.' },
		{ term: 'Clé de partition', def: 'Le champ qui décide dans quelle partition va une ligne. Une requête qui la nomme lit une seule partition. Une requête qui ne la nomme pas doit les interroger toutes.' },
		{ term: 'Placement par annuaire', def: 'Une table de correspondance enregistre où vit chaque clé, au lieu de le calculer avec un hash. Facile d’y ajouter un nœud, mais la table elle-même doit toujours être lisible.' },
		{ term: 'Réplica', def: 'Une copie d’une partition sur un autre nœud. Elle ajoute de la capacité de lecture et survit à la perte d’un nœud. Elle n’ajoute aucune capacité d’écriture : chaque écriture va sur chaque copie.' },
		{ term: 'Scatter-gather', def: 'Envoyer une requête à chaque partition et fusionner les réponses. Son coût grandit avec le nombre de partitions, et la plus lente donne le rythme.' },
		{ term: 'Partition chaude', def: 'Une clé avec bien plus de données ou de trafic que les autres. Ajouter des nœuds ne l’aide pas : elle vit toujours au même endroit.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req(["Requête pour help.acme.example"]) --> app["Appli de tickets"]', 'app -->|"quelle base ?"| dir[("Annuaire : tenant vers base")]'],
				highlight: ['app', 'dir'],
				note: '**La clé de partition, c’est le tenant.** Avant toute requête, l’appli cherche où vit ce tenant. Le multisite de Discourse marche comme ça : un fichier de config associe les noms d’hôte de chaque site à sa propre base. C’est un **annuaire** : le placement est écrit, pas calculé.'
			},
			{
				add: ['app -->|"tenants 1 à 500"| db1[("Postgres A : plein, plus de nouveaux tenants")]', 'app -->|"nouveaux tenants"| db2[("Postgres B")]'],
				highlight: ['db1', 'db2'],
				note: 'Quand le serveur A est plein, ajoute un serveur B et envoie-y les **nouveaux tenants**. Les anciens restent où ils sont. Rien ne bouge, donc rien n’est rééquilibré. A continue de grossir à mesure que ses tenants ajoutent des tickets.'
			},
			{
				add: ['app -->|"ticket.updated, clé = id du ticket"| topic["Topic Kafka : 12 partitions"]'],
				highlight: ['topic'],
				note: '**Placement par hash.** Pour les événements, l’appli donne une clé à Kafka. Le producteur hache la clé et prend le modulo du nombre de partitions. **Même clé, même partition**, donc les événements d’un ticket restent dans l’ordre. Pas d’annuaire à lire, mais le nombre de partitions fait maintenant partie de l’adresse.'
			},
			{
				add: ['topic --> rep["Chaque partition : 1 leader, 2 followers"]'],
				highlight: ['rep'],
				note: '**Des réplicas dans chaque partition.** Avec un facteur de réplication de 3, toutes les écritures vont au leader de la partition et les followers copient son log. Les copies survivent à la perte d’un broker et peuvent servir des lectures. Elles n’ajoutent **aucune capacité d’écriture** : chacune reçoit chaque écriture.'
			},
			{
				add: ['report["Rapport : tickets ouverts de tous les tenants"] -->|"scatter"| db1', 'report -->|"scatter"| db2'],
				highlight: ['report'],
				note: '**Une requête sans la clé interroge tout le monde.** « Tickets ouverts du tenant 42 » lit une seule base. « Tickets ouverts de tous les tenants » les visite toutes et fusionne les réponses. Ajoute un troisième serveur, et le rapport a une base de plus à attendre.'
			}
		]
	},
	example: {
		title: 'clients/.../producer/KafkaProducer.java : comment un enregistrement choisit sa partition',
		repo: 'apache/kafka',
		url: `${PRODUCER}/KafkaProducer.java#L1681-L1701`,
		lang: 'java',
		code: `    private int partition(ProducerRecord<K, V> record, byte[] serializedKey, byte[] serializedValue, Cluster cluster) {
        if (record.partition() != null)
            return record.partition();

        if (partitionerPlugin.get() != null) {
            int customPartition = partitionerPlugin.get().partition(
                record.topic(), record.key(), serializedKey, record.value(), serializedValue, cluster);
            if (customPartition < 0) {
                throw new IllegalArgumentException(String.format(
                    "The partitioner generated an invalid partition number: %d. Partition number should always be non-negative.", customPartition));
            }
            return customPartition;
        }

        if (serializedKey != null && !partitionerIgnoreKeys) {
            // hash the keyBytes to choose a partition
            return BuiltInPartitioner.partitionForKey(serializedKey, cluster.partitionsForTopic(record.topic()).size());
        } else {
            return RecordMetadata.UNKNOWN_PARTITION;
        }
    }`,
		notes: [
			'**Trois façons de placer un enregistrement.** L’appelant nomme une partition, un partitioner personnalisé en choisit une, ou la clé décide. Sans clé, `UNKNOWN_PARTITION` laisse le choix au [partitioner intégré](' + PRODUCER + '/internals/BuiltInPartitioner.java#L33-L40), qui reste sur une partition le temps d’un lot puis passe à la suivante. Les enregistrements sans clé se répartissent sur les partitions, sans ordre entre eux.',
			'**Le hash est l’adresse.** [`partitionForKey`](' + PRODUCER + '/internals/BuiltInPartitioner.java#L410-L415), c’est le hash murmur2 de la clé, rendu positif, modulo le nombre de partitions. La [doc de conception](' + REPO + '/docs/design/design.md?plain=1#L127) donne l’intérêt : « if the key chosen was a user id then all data for a given user would be sent to the same partition » (si la clé est un id utilisateur, toutes les données d’un utilisateur vont dans la même partition). Ça veut aussi dire qu’un utilisateur avec dix fois plus de trafic chauffe dix fois plus **une seule** partition.',
			'**Le nombre de partitions fait partie de l’adresse.** La [doc d’exploitation](' + REPO + '/docs/operations/basic-kafka-operations.md?plain=1#L63) prévient qu’après l’ajout de partitions, « messages with the same key may be routed to different partitions » (des messages de même clé peuvent partir vers des partitions différentes), et que « Kafka will not attempt to automatically redistribute existing data » (Kafka ne redistribue pas automatiquement les données existantes). Et [pas de retour en arrière](' + REPO + '/docs/operations/basic-kafka-operations.md?plain=1#L98) : « Kafka does not currently support reducing the number of partitions for a topic. »',
			'**Les réplicas ne répartissent pas les écritures.** La [doc de conception](' + REPO + '/docs/design/design.md?plain=1#L285-L287) : « All writes go to the leader of the partition, and reads can go to the leader or the followers » (toutes les écritures vont au leader, les lectures peuvent aller au leader ou aux followers). Les followers « consume messages from the leader just as a normal Kafka consumer would » (consomment les messages du leader comme un consommateur Kafka normal).',
			'**La version annuaire.** L’[exemple de `multisite.yml`](' + DISCOURSE + '/config/multisite.yml.production-sample#L1-L14) de Discourse donne à chaque site sa propre `database` et ses propres `host_names`. Le [guide multisite](' + DISCOURSE + '/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md?plain=1#L7-L34) dit « A multisite server uses a different DB and hostname for each site » (un serveur multisite utilise une base et un nom d’hôte différents pour chaque site), et que les tâches rake ciblent un site via `RAILS_DB`. Une migration devient une migration par site.'
		]
	},
	tradeoff: {
		gain: [
			'La capacité grandit en ajoutant des serveurs ou des partitions, pas en achetant une seule machine plus grosse qui a un plafond.',
			'Partitionner par tenant colle à la façon dont les données sont lues : presque chaque requête nomme un seul tenant, donc elle arrive sur une seule base.',
			'Une requête qui nomme la clé de partition coûte à peu près pareil avec 10 nœuds ou 100.',
			'Les réplicas ajoutent de la capacité de lecture et laissent un nœud mourir sans perte de données (jour 9).'
		],
		cost: [
			'**Les requêtes sans la clé interrogent tout le monde.** Un rapport sur tous les tenants visite chaque base. Un consommateur qui a besoin de chaque événement lit chaque partition.',
			'**La clé est difficile à changer.** Les lignes ont été placées selon elle. La changer veut dire copier les données dans une nouvelle disposition, une migration à part entière (jour 32).',
			'**Le rééquilibrage est un travail à concevoir.** Un hash déplace des clés quand le nombre change. Un annuaire ne déplace rien, donc un vieux serveur reste aussi plein que le jour où il a cessé de prendre des tenants.',
			'**Une clé chaude reste chaude.** Un tenant avec dix fois plus de données vit toujours sur une seule base, ou une seule partition.',
			'**Les réplicas sont en retard ou coûtent des lectures en quorum.** Un réplica mis à jour de façon asynchrone peut répondre avec des données plus vieilles que l’écriture que tu viens de faire (jour 16). Attendre plus de copies coûte de la latence à la place.'
		]
	},
	task: {
		prompt: 'Ton appli de tickets publie `ticket.updated` sur un topic Kafka de 12 partitions, avec l’id du tenant comme clé. Un tenant fait maintenant 40 % de toutes les mises à jour, et le consommateur d’une partition a des heures de retard. Un collègue propose de passer à 48 partitions. Qu’est-ce que ça corrige, qu’est-ce que ça casse, et que ferais-tu à la place ?',
		hint: 'Où va le trafic du gros tenant avant et après le changement ? Puis demande-toi quel ordre tes consommateurs exigent vraiment : par tenant, ou par ticket ?',
		answer: [
			'Ça ne corrige pas la partition chaude. La clé du gros tenant se hache toujours vers une seule partition, donc ses 40 % arrivent toujours sur un seul consommateur.',
			'Ça casse l’ordre pour tous les autres pendant le changement : `hash(key) % 48` peut différer de `% 12`, donc les nouveaux événements d’un tenant peuvent partir vers une autre partition que ses anciens, pas encore lus. Et tu ne peux pas revenir à 12.',
			'Demande-toi quel ordre il te faut. Si les consommateurs ont seulement besoin des événements de chaque ticket dans l’ordre, prends l’id du ticket comme clé. Le trafic du gros tenant se répartit alors sur toutes les partitions.',
			'Si un consommateur a besoin de l’ordre par tenant, garde un topic avec le tenant comme clé pour lui, et publie un topic avec le ticket comme clé pour les autres. Ou donne au gros tenant son propre topic.',
			'Change la clé ou le nombre une seule fois, entre deux points nets : vide l’ancien topic, puis démarre un nouveau topic avec la nouvelle disposition, pour qu’aucune clé ne soit à cheval sur les deux.'
		]
	},
	quiz: [
		{
			q: 'Ta base est à sa limite en **écritures**. Quel changement ajoute de la capacité d’écriture ?',
			options: [
				'Ajouter deux réplicas en lecture derrière un load balancer',
				'Ajouter un cache devant les tables les plus lues',
				'Découper les lignes sur plusieurs serveurs selon une clé de partition',
				'Augmenter la taille du pool de connexions dans l’application'
			],
			answer: 2,
			why: 'Chaque réplica reçoit chaque écriture, et un cache n’économise que des lectures. Un pool plus grand envoie plus d’écritures au même serveur saturé. Seul le partitionnement permet à chaque serveur de prendre une part des écritures.'
		},
		{
			q: 'Un topic Kafka avec l’id client comme clé passe de 12 à 16 partitions. Qu’arrive-t-il aux événements du client 42 ?',
			options: [
				'Les nouveaux événements peuvent arriver sur une autre partition. Les anciens restent où ils étaient',
				'Kafka déplace ses anciens événements vers la nouvelle partition, donc l’ordre est conservé',
				'Rien ne change : une clé garde la partition qu’on lui a donnée la première fois',
				'Le producteur refuse d’envoyer tant que chaque consommateur n’a pas rattrapé son retard'
			],
			answer: 0,
			why: 'Le partitioner par défaut calcule `hash(key) % count`, donc un nouveau nombre peut donner une nouvelle partition. La doc dit que Kafka « will not attempt to automatically redistribute existing data », donc un consommateur peut voir de nouveaux événements avant d’anciens qui attendent encore ailleurs.'
		},
		{
			q: 'Discourse fait tourner plusieurs sites depuis un seul serveur en mode multisite. Qu’est-ce qui décide quelle base lit une requête ?',
			options: [
				'Un hash de l’id utilisateur, modulo le nombre de bases',
				'La première base qui répond, puisqu’elles contiennent toutes les mêmes données',
				'Un round robin sur toutes les bases, pour répartir la charge',
				'Le nom d’hôte de la requête, cherché dans `multisite.yml`'
			],
			answer: 3,
			why: 'C’est le placement par annuaire : l’entrée de chaque site liste ses `host_names` et sa propre `database`. Un nouveau site, c’est une nouvelle entrée, et rien d’autre ne bouge.'
		}
	],
	takeaway: 'Les réplicas font grandir les lectures, les partitions font grandir les données et les écritures. Choisis la clé de partition d’après ta requête la plus courante, et sache ce que coûtera chaque requête qui ne la nomme pas.',
	sources: [
		{ title: 'Apache Kafka, Introduction: partitions and replication', url: `${REPO}/docs/getting-started/introduction.md?plain=1#L83-L87` },
		{ title: 'Apache Kafka, Design: replication', url: `${REPO}/docs/design/design.md?plain=1#L281-L287` },
		{ title: 'Discourse, Set up a multisite development environment', url: `${DISCOURSE}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md?plain=1` },
		{ title: 'Unmesh Joshi, Patterns of Distributed Systems: Fixed Partitions', url: 'https://martinfowler.com/articles/patterns-of-distributed-systems/fixed-partitions.html' },
		{ title: 'Martin Kleppmann, Designing Data-Intensive Applications', url: 'https://dataintensive.net/' }
	]
};
