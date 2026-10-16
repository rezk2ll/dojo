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
		'Ton SaaS de tickets garde les tickets de tous les clients dans un seul serveur Postgres. Chaque mois, il contient plus de lignes et reçoit plus d’écritures. Un jour, **un seul serveur Postgres ne suit plus**.',
		'Une machine plus grosse aide jusqu’à ce que tu atteignes la plus grosse que tu puisses acheter. Si le problème vient de trop de lectures, garde des copies, appelées réplicas, et répartis les lectures dessus. Si le problème vient de trop de données ou de trop d’écritures, les copies n’aident pas, puisque chaque copie reçoit chaque écriture. Tu dois alors **découper les données**, pour que chaque nœud n’en garde qu’une partie.',
		'Découper est une porte à sens unique (jour 5) : pour revenir en arrière, tu dois déplacer chaque ligne à nouveau. Une fois les lignes réparties selon une clé, une requête qui **nomme cette clé lit un seul endroit**, et une requête sans elle interroge chaque nœud. Discourse place chaque site avec un annuaire, et Kafka place chaque événement en hachant sa clé.'
	],
	terms: [
		{ term: 'Partition (shard)', def: 'Une tranche des données, gardée par un nœud ou un cluster. Chaque ligne vit dans exactement une partition. Répartir les partitions sur plusieurs machines s’appelle le sharding.' },
		{ term: 'Clé de partition', def: 'Le champ qui décide dans quelle partition va une ligne. Une requête qui la nomme lit une seule partition. Une requête qui ne la nomme pas doit les interroger toutes.' },
		{ term: 'Placement par annuaire', def: 'Une table de correspondance enregistre où vit chaque clé, au lieu de le calculer avec un hash. Facile d’y ajouter un nœud, mais la table elle-même doit toujours être lisible.' },
		{ term: 'Réplica', def: 'Une copie d’une partition sur un autre nœud. Elle ajoute de la capacité de lecture et survit à la perte d’un nœud. Elle n’ajoute aucune capacité d’écriture : chaque écriture va sur chaque copie.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req(["Requête pour help.acme.example"]) --> app["Appli de tickets"]', 'app -->|"quelle base ?"| dir[("Annuaire : tenant vers base")]'],
				highlight: ['app', 'dir'],
				note: 'La clé de partition est le tenant, donc avant toute requête l’appli cherche où vit ce tenant. Le multisite de Discourse marche comme ça : un fichier de config associe les noms d’hôte de chaque site à sa propre base. Cette table de correspondance est un **annuaire** : le placement y est écrit au lieu d’être calculé à partir de la clé.'
			},
			{
				add: ['app -->|"tenants 1 à 500"| db1[("Postgres A : plein, plus de nouveaux tenants")]', 'app -->|"nouveaux tenants"| db2[("Postgres B")]'],
				highlight: ['db1', 'db2'],
				note: 'Quand le serveur A est plein, ajoute un serveur B et envoie-y les **nouveaux tenants**. Les tenants déjà sur A restent sur A, donc aucune donnée ne bouge. A continue de grossir à mesure que ses tenants ajoutent des tickets.'
			},
			{
				add: ['app -->|"ticket.updated, clé = id du ticket"| topic["Topic Kafka : 12 partitions"]'],
				highlight: ['topic'],
				note: 'Les événements utilisent le placement par hash : l’appli donne une clé à Kafka. Le producteur hache la clé et prend le modulo du nombre de partitions. **Même clé, même partition**, donc les événements d’un ticket restent dans l’ordre. Il n’y a pas d’annuaire à lire, mais un nouveau nombre de partitions envoie les clés vers de nouvelles partitions.'
			},
			{
				add: ['topic --> rep["Chaque partition : 1 leader, 2 followers"]'],
				highlight: ['rep'],
				note: 'Avec un facteur de réplication de 3, chaque partition a un leader et deux followers. Toutes les écritures vont au leader de la partition et les followers copient son log. Les copies survivent à la perte d’un broker et peuvent servir des lectures. Elles n’ajoutent **aucune capacité d’écriture** : chacune reçoit chaque écriture.'
			},
			{
				add: ['report["Rapport : tickets ouverts de tous les tenants"] -->|"scatter"| db1', 'report -->|"scatter"| db2'],
				highlight: ['report'],
				note: '« Tickets ouverts du tenant 42 » nomme la clé et lit une seule base. « Tickets ouverts de tous les tenants » n’a pas de clé, donc la requête visite chaque base et fusionne les réponses. Ajoute un troisième serveur, et le rapport a une base de plus à attendre.'
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
			'Les lignes 2 et 3 prennent la partition que nomme l’appelant, les lignes 5 à 13 demandent à un partitioner personnalisé, et la ligne 17 laisse la clé décider. Sans clé, la ligne 19 renvoie `UNKNOWN_PARTITION`, et le [partitioner intégré](' + PRODUCER + '/internals/BuiltInPartitioner.java#L33-L40) choisit : il reste sur une partition le temps d’un lot puis passe à la suivante. Les enregistrements sans clé se répartissent sur les partitions, sans ordre entre eux.',
			'La ligne 17 appelle [`partitionForKey`](' + PRODUCER + '/internals/BuiltInPartitioner.java#L410-L415) : le hash murmur2 de la clé, rendu positif, modulo le nombre de partitions. La doc de conception donne la raison : « if the key chosen was a user id then all data for a given user would be sent to the same partition » (si la clé est un id utilisateur, toutes les données d’un utilisateur vont dans la même partition). Un utilisateur avec dix fois plus de trafic met alors dix fois plus de charge sur **une seule** partition.',
			'Le nombre de partitions est dans cette formule, et la [doc d’exploitation](' + REPO + '/docs/operations/basic-kafka-operations.md?plain=1#L63) prévient qu’après l’ajout de partitions, « messages with the same key may be routed to different partitions » (des messages de même clé peuvent partir vers des partitions différentes), et que « Kafka will not attempt to automatically redistribute existing data » (Kafka ne redistribue pas automatiquement les données existantes). Elle dit aussi : « Kafka does not currently support reducing the number of partitions for a topic. »',
			'La [doc de conception](' + REPO + '/docs/design/design.md?plain=1#L285-L287) montre pourquoi les réplicas ne répartissent pas les écritures : « All writes go to the leader of the partition, and reads can go to the leader or the followers » (toutes les écritures vont au leader, les lectures peuvent aller au leader ou aux followers). Les followers « consume messages from the leader just as a normal Kafka consumer would » (consomment les messages du leader comme un consommateur Kafka normal).',
			'Discourse utilise le placement par annuaire : son [exemple de `multisite.yml`](' + DISCOURSE + '/config/multisite.yml.production-sample#L1-L14) donne à chaque site sa propre `database` et ses propres `host_names`. Le guide multisite dit « A multisite server uses a different DB and hostname for each site » (un serveur multisite utilise une base et un nom d’hôte différents pour chaque site), et que les tâches rake ciblent un site via `RAILS_DB`. Une migration de schéma tourne donc une fois par site.'
		]
	},
	tradeoff: {
		gain: [
			'Tu ajoutes de la capacité en ajoutant des serveurs ou des partitions, au lieu d’acheter une seule machine plus grosse qui a un plafond.',
			'Partitionner par tenant colle à la façon dont les données sont lues : presque chaque requête nomme un seul tenant, donc elle arrive sur une seule base.',
			'Une requête qui nomme la clé de partition coûte à peu près pareil avec 10 nœuds ou 100.',
			'Les réplicas ajoutent de la capacité de lecture et laissent un nœud mourir sans perte de données (jour 9).'
		],
		cost: [
			'Un rapport sur tous les tenants visite chaque base, et un consommateur qui a besoin de chaque événement lit chaque partition.',
			'Les lignes ont été placées selon la clé, donc changer la clé veut dire copier les données dans une nouvelle disposition, une migration à part entière (jour 32).',
			'Un hash déplace des clés quand le nombre de partitions change. Un annuaire ne déplace rien, donc un vieux serveur reste aussi plein que le jour où il a cessé de prendre des tenants.',
			'Un réplica mis à jour de façon asynchrone peut répondre avec des données plus vieilles que l’écriture que tu viens de faire (jour 16). Les lectures en quorum évitent ça, mais chaque lecture attend plus de copies.'
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
			why: 'Discourse utilise le placement par annuaire : l’entrée de chaque site liste ses `host_names` et sa propre `database`. Un nouveau site, c’est une nouvelle entrée, et rien d’autre ne bouge.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui ajoute de la capacité d’écriture, les réplicas ou les partitions, et comment Kafka choisit-il la partition d’un enregistrement qui a une clé ?',
		a: 'Les partitions, puisque chaque réplica reçoit chaque écriture. Kafka prend le hash murmur2 de la clé modulo le nombre de partitions, donc une clé reste sur une partition tant que ce nombre ne change pas.'
	},
	sources: [
		{ title: 'Apache Kafka, Design: semantic partitioning by key', url: `${REPO}/docs/design/design.md?plain=1#L127` },
		{ title: 'Apache Kafka, Operations: reducing partitions', url: `${REPO}/docs/operations/basic-kafka-operations.md?plain=1#L98` },
		{ title: 'Apache Kafka, Introduction: partitions and replication', url: `${REPO}/docs/getting-started/introduction.md?plain=1#L83-L87` },
		{ title: 'Apache Kafka, Design: replication', url: `${REPO}/docs/design/design.md?plain=1#L281-L287` },
		{ title: 'Discourse, Set up a multisite development environment', url: `${DISCOURSE}/docs/developer-guides/docs/02-development-environments/09-multisite-setup.md?plain=1` },
		{ title: 'Unmesh Joshi, Patterns of Distributed Systems: Fixed Partitions', url: 'https://martinfowler.com/articles/patterns-of-distributed-systems/fixed-partitions.html' },
		{ title: 'Martin Kleppmann, Designing Data-Intensive Applications', url: 'https://dataintensive.net/' }
	]
};
