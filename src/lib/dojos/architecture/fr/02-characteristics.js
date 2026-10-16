const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'characteristics',
	part: 'Penser en architecte',
	title: 'Choisis trois « -ilités », pas dix',
	minutes: 10,
	hook: [
		'Demande à n’importe quelle équipe ce que son système doit être, et tu obtiens la même liste : rapide, sécurisé, scalable, simple, fiable, pas cher. Tout ça à la fois, au maximum. Cette liste ne décide rien.',
		'La doc de conception d’Apache Kafka commence autrement. Elle dit ce que Kafka doit faire : un **haut débit** pour l’agrégation de logs, de **gros backlogs** venant de chargements hors ligne, une **livraison à faible latence** pour la messagerie classique. Chaque besoin devient une propriété, et chaque propriété du code que tu peux montrer du doigt. Cette traduction, c’est le premier vrai travail de l’architecte.',
		'Ces propriétés s’appellent des **caractéristiques d’architecture**. Ce ne sont pas des fonctionnalités. « Les consumers peuvent revenir en arrière et relire d’anciens messages » est une fonctionnalité. « Un broker sert les consumers à une vitesse proche de celle du réseau » est une caractéristique : elle ne dit rien de ce que fait le système, et tout de la façon dont il doit être construit.'
	],
	terms: [
		{ term: 'Caractéristique', def: 'Une qualité que le système doit avoir et qui n’est pas une fonctionnalité : latence, débit, disponibilité, sécurité… On parle souvent d’une « -ilité ».' },
		{ term: 'Déterminante', def: 'Les quelques caractéristiques qui façonnent vraiment la conception. Garde cette liste aussi courte que possible. Trois, c’est un bon objectif.' },
		{ term: 'Implicite', def: 'Attendue mais jamais écrite, comme une sécurité de base ou « un redémarrage ne perd pas de données ». Dangereuse, parce que personne ne conçoit exprès pour elle.' },
		{ term: 'Page cache', def: 'La mémoire que le système d’exploitation utilise pour garder les données de fichiers lues et écrites récemment. Kafka s’appuie dessus au lieu de construire son propre cache.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tput["Haut débit"]', 'backlog["Gros backlogs"]', 'lat["Livraison à faible latence"]'],
				highlight: ['tput', 'backlog', 'lat'],
				note: 'Pars de ce que le système doit faire. La doc de conception liste ces besoins avant toute conception. Ce sont encore des souhaits : tu ne peux pas tester « haut ».'
			},
			{
				add: ['tput --> batch["Regrouper les messages en message sets"] --> zero["Zero-copy : du page cache au socket"]'],
				highlight: ['batch', 'zero'],
				note: 'Le **débit** devient deux décisions. Regrouper les messages pour qu’un seul aller-retour réseau et une seule écriture disque en transportent beaucoup. Puis envoyer les données du fichier directement du page cache au socket, sans copie dans l’application.'
			},
			{
				add: ['backlog --> log["Log en ajout seul sur disque, lectures et écritures en O(1)"] --> keep["Garder les messages environ une semaine"]'],
				highlight: ['log', 'keep'],
				note: 'Les **gros backlogs** deviennent un log fait de simples fichiers. Ajouter et lire coûte pareil, quelle que soit la quantité de données stockées. Donc Kafka ne supprime pas un message une fois lu, il le garde pendant une durée fixée.'
			},
			{
				add: ['lat --> linger["Le producer attend au plus linger.ms, 5 ms par défaut"]'],
				highlight: ['linger'],
				note: 'La **faible latence** plafonne le regroupement. Le producer attend quelques millisecondes pour remplir un lot, puis envoie quand même. Un seul réglage se trouve pile entre deux caractéristiques.'
			},
			{
				add: [],
				note: 'Le besoin, puis la caractéristique, puis la décision. La doc dit aussi ce qu’elle a refusé de construire : pas de gros cache dans le processus. « Utiliser le système de fichiers et s’appuyer sur le page cache est supérieur », et ça « simplifie énormément le code ».'
			}
		]
	},
	example: {
		title: 'clients/…/common/record/internal/FileRecords.java',
		repo: 'apache/kafka',
		url: `${KAFKA}/clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java#L279-L292`,
		lang: 'java',
		code: `    @Override
    public int writeTo(TransferableChannel destChannel, int offset, int length) throws IOException {
        long newSize = Math.min(channel.size(), end) - start;
        int oldSize = sizeInBytes();
        if (newSize < oldSize)
            throw new KafkaException(String.format(
                    "Size of FileRecords %s has been truncated during write: old size %d, new size %d",
                    file.getAbsolutePath(), oldSize, newSize));

        long position = start + offset;
        int count = Math.min(length, oldSize - offset);
        // safe to cast to int since \`count\` is an int
        return (int) destChannel.transferFrom(channel, position, count);
    }`,
		notes: [
			'Voilà comment un broker envoie un morceau de log à un consumer. Il ne lit jamais les octets lui-même. Il passe le canal du fichier, une position et un nombre d’octets au canal réseau.',
			'Sur une connexion en clair, cet appel tient [en une ligne : `fileChannel.transferTo(position, count, socketChannel)`](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/PlaintextTransportLayer.java#L212-L215). C’est le chemin zero-copy sur lequel la [doc de conception](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/docs/design/design.md?plain=1#L90-L109) construit le débit.',
			'Sur une connexion TLS, le même appel [lit le fichier dans un buffer de 32 Ko](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/SslTransportLayer.java#L1002-L1045) pour pouvoir le chiffrer. La doc le dit clairement : « sendfile n’est pas utilisé quand SSL est activé. » La sécurité coûte du débit, et le code montre où.',
			'La latence a son propre bouton : [`linger.ms` vaut 5 par défaut](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L154-L165). Il est « passé de 0 à 5 dans Apache Kafka 4.0 », parce que des lots plus gros donnaient de toute façon une latence similaire ou plus faible.'
		]
	},
	tradeoff: {
		gain: [
			'Une liste courte te permet de dire non. « Est-ce que ça aide le débit, les backlogs ou la latence ? Non ? Alors ça attendra. »',
			'Chaque grosse décision remonte à une raison qu’un nouveau venu peut lire, écrite avant la conception.',
			'S’appuyer sur le page cache du système d’exploitation, c’est moins de code à maintenir. La doc précise que le cache reste aussi chaud quand le broker redémarre.'
		],
		cost: [
			'Les caractéristiques se battent entre elles. Activer TLS pour la sécurité désactive le chemin zero-copy construit pour le débit.',
			'Regrouper pour le débit ajoute de l’attente. Chaque producer paie jusqu’à `linger.ms` quand le trafic est faible.',
			'Le page cache est partagé avec tout ce qui tourne sur la machine. La mémoire utilisée par un autre processus, c’est du cache que le broker n’a pas.'
		]
	},
	task: {
		prompt: 'Prends un produit sur lequel tu travailles. Écris ses trois caractéristiques principales, et pour chacune la décision qu’elle impose. Trois seulement.',
		hint: 'Pars de ce qui mettrait les utilisateurs ou le business en colère si ça cassait. Puis demande-toi : qu’est-ce qu’on devrait construire autrement pour protéger ça ?',
		answer: [
			'Vérifie : ce sont bien des caractéristiques (le comment) et pas des fonctionnalités (le quoi) ? « Peut exporter un rapport » est une fonctionnalité, « l’export se termine en moins d’une minute pour un an de données » est une caractéristique.',
			'Vérifie : chacune est-elle liée à un besoin que tu pourrais dire à voix haute, comme « l’agrégation de logs en temps réel » de Kafka ?',
			'Vérifie : peux-tu nommer une décision que chacune impose ? Sinon, c’est un souhait, pas une caractéristique déterminante.',
			'Vérifie : as-tu coupé quelque chose qui faisait mal à couper ? Si les trois étaient faciles, la liste est sans doute trop générique.'
		]
	},
	quiz: [
		{
			q: 'Laquelle de ces propositions est une **caractéristique** d’architecture, et pas une fonctionnalité ?',
			options: ['Les agents peuvent fusionner deux tickets de support en double en un seul', 'La recherche renvoie des résultats en moins de 200 ms sur 10 millions de tickets', 'Les clients reçoivent un e-mail avec un résumé quand leur ticket est fermé', 'Les utilisateurs peuvent joindre des captures et des fichiers de log à un ticket'],
			answer: 1,
			why: 'Un objectif de latence ne dit rien de ce que fait l’appli, il contraint la façon dont elle est construite (index, cache, sharding). Les autres sont des fonctionnalités.'
		},
		{
			q: 'Pourquoi garder courte la liste des caractéristiques déterminantes ?',
			options: ['Parce qu’un document de conception doit tenir sur une seule page', 'Parce que le catalogue standard ne définit que trois caractéristiques', 'Parce que les managers ne savent pas en suivre plus de quelques-unes à la fois', 'Parce que chacune coûte un effort de conception et qu’elles entrent souvent en conflit'],
			answer: 3,
			why: 'Tenir une caractéristique coûte de la complexité, et elles se font concurrence : dans Kafka, TLS pour la sécurité désactive le chemin zero-copy construit pour le débit.'
		},
		{
			q: 'Un consumer Kafka se connecte en TLS. Que devient le chemin zero-copy quand le broker lui envoie des données du log ?',
			options: [
				'Il n’est pas utilisé : le broker lit le fichier dans un buffer pour pouvoir chiffrer les données',
				'Il marche toujours, parce que le noyau chiffre le page cache avant que sendfile le lise',
				'Le broker refuse TLS pour les consumers et ne l’accepte qu’entre brokers',
				'Le consumer déchiffre le fichier directement sur le disque du broker, donc aucune copie n’est faite'
			],
			answer: 0,
			why: 'Le zero-copy envoie les octets du fichier directement du page cache au socket. TLS doit d’abord les chiffrer, en espace utilisateur. La doc de conception dit : « sendfile n’est pas utilisé quand SSL est activé. »'
		}
	],
	takeaway: 'Transforme les besoins du système en trois caractéristiques au plus, puis nomme la décision que chacune impose.',
	sources: [
		{ title: 'Apache Kafka docs, Design: Motivation', url: `${KAFKA}/docs/design/design.md?plain=1#L29-L43` },
		{ title: 'Apache Kafka docs, Design: Persistence and Efficiency', url: `${KAFKA}/docs/design/design.md?plain=1#L45-L111` },
		{ title: 'Apache Kafka, FileRecords.writeTo', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java#L279-L292` },
		{ title: 'Apache Kafka, ProducerConfig: linger.ms', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L152-L165` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' }
	]
};
