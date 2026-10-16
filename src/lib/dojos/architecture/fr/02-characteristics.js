const KAFKA = 'https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'characteristics',
	part: 'Penser en architecte',
	title: 'Les caractéristiques d’architecture : choisir les trois principales',
	minutes: 10,
	hook: [
		'Demande à n’importe quelle équipe ce que son système doit être, et tu obtiens toujours la même liste : rapide, sécurisé, scalable, simple, fiable, pas cher. L’équipe veut tout à la fois, au maximum. Avec cette liste, elle ne peut pas choisir entre deux conceptions.',
		'La doc de conception d’Apache Kafka commence par ce que Kafka doit faire : un **haut débit** pour l’agrégation de logs, de gros backlogs venant de chargements hors ligne, une livraison à faible latence pour la messagerie classique. Pour chaque besoin, la doc nomme une propriété, et pour chaque propriété tu peux montrer le code qui la fournit. En architecte, tu fais ce travail en premier.',
		'On appelle ces propriétés des caractéristiques d’architecture. « Les consumers peuvent revenir en arrière et relire d’anciens messages » est une fonctionnalité. « Un broker sert les consumers à une vitesse proche de celle du réseau » est une caractéristique : elle ne dit rien de ce que fait le système, et elle décide de la façon de le construire.'
	],
	terms: [
		{ term: 'Caractéristique', def: 'Une qualité que le système doit avoir et qui n’est pas une fonctionnalité : latence, débit, disponibilité, sécurité… On parle souvent d’une « -ilité ».' },
		{ term: 'Déterminante', def: 'Se dit des quelques caractéristiques qui façonnent la conception. Garde cette liste aussi courte que possible, trois au plus.' },
		{ term: 'Page cache', def: 'La mémoire que le système d’exploitation utilise pour garder les données de fichiers lues et écrites récemment. Kafka s’appuie dessus au lieu de construire son propre cache.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tput["Haut débit"]', 'backlog["Gros backlogs"]', 'lat["Livraison à faible latence"]'],
				highlight: ['tput', 'backlog', 'lat'],
				note: 'Pars de ce que le système doit faire. La doc de conception liste ces trois besoins avant toute conception. Personne ne peut encore les tester, car « haut » et « faible » n’ont pas de nombre.'
			},
			{
				add: ['tput --> batch["Regrouper les messages en message sets"] --> zero["Zero-copy : du page cache au socket"]'],
				highlight: ['batch', 'zero'],
				note: 'Kafka répond au besoin de débit par deux décisions. Il regroupe les messages pour qu’un seul aller-retour réseau et une seule écriture disque en transportent beaucoup. Puis il envoie les données du fichier directement du page cache au socket, sans copie dans l’application.'
			},
			{
				add: ['backlog --> log["Log en ajout seul sur disque, lectures et écritures en O(1)"] --> keep["Garder les messages environ une semaine"]'],
				highlight: ['log', 'keep'],
				note: 'Pour les gros backlogs, Kafka range les messages dans un log fait de simples fichiers. Ajouter et lire coûte pareil, quelle que soit la quantité de données stockées. Kafka garde donc un message pendant une durée fixée, même après sa lecture.'
			},
			{
				add: ['lat --> linger["Le producer attend au plus linger.ms, 5 ms par défaut"]'],
				highlight: ['linger'],
				note: 'Le besoin de latence plafonne le regroupement. Le producer attend quelques millisecondes pour remplir un lot, puis envoie quand même. Le seul réglage `linger.ms` arbitre entre débit et latence.'
			},
			{
				add: [],
				note: 'Chaque besoin a mené à une caractéristique, et chaque caractéristique à une décision. La doc nomme aussi ce que Kafka ne construit pas : un gros cache dans le processus. « Utiliser le système de fichiers et s’appuyer sur le page cache est supérieur », et ça « simplifie énormément le code ».'
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
			'Un broker envoie un morceau de log à un consumer avec cette méthode. Les lignes 10 à 13 ne lisent jamais les octets : elles passent le canal du fichier, une position et un nombre d’octets au canal réseau.',
			'Sur une connexion en clair, l’appel de la ligne 13 tient [en une ligne : `fileChannel.transferTo(position, count, socketChannel)`](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/PlaintextTransportLayer.java#L212-L215). La doc de conception bâtit le débit sur ce chemin zero-copy.',
			'Sur une connexion TLS, le même appel [lit le fichier dans un buffer de 32 Ko](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/common/network/SslTransportLayer.java#L1002-L1045) pour pouvoir le chiffrer. La doc : « sendfile n’est pas utilisé quand SSL est activé. » Activer TLS pour la sécurité fait perdre le chemin zero-copy construit pour le débit.',
			'La latence a son propre réglage : [`linger.ms` vaut 5 par défaut](https://github.com/apache/kafka/blob/59046aecc31bd1bed83a434c0db61aea95fd644a/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L154-L165). Il est « passé de 0 à 5 dans Apache Kafka 4.0 », parce que des lots plus gros donnaient de toute façon une latence similaire ou plus faible.'
		]
	},
	tradeoff: {
		gain: [
			'Avec trois caractéristiques écrites, tu peux refuser du travail : « Est-ce que ça aide le débit, les backlogs ou la latence ? Non ? Alors ça attendra. »',
			'Un nouveau venu peut relier chaque grosse décision, comme le zero-copy ou le log en ajout seul, à un besoin écrit dans la doc de conception.',
			'S’appuyer sur le page cache du système d’exploitation, c’est moins de code à maintenir. La doc précise que le cache reste aussi chaud quand le broker redémarre.'
		],
		cost: [
			'Activer TLS pour la sécurité désactive le chemin zero-copy construit pour le débit.',
			'Quand le trafic est faible, chaque producer attend jusqu’à `linger.ms` avant d’envoyer un lot.',
			'Le page cache est partagé avec tout ce qui tourne sur la machine. La mémoire utilisée par un autre processus, c’est du cache que le broker n’a pas.'
		]
	},
	task: {
		prompt: 'Prends un produit sur lequel tu travailles. Écris ses trois caractéristiques principales, et pour chacune la décision qu’elle impose. Trois seulement.',
		hint: 'Pars de ce qui mettrait les utilisateurs ou le business en colère si ça cassait. Puis demande-toi : qu’est-ce qu’on devrait construire autrement pour protéger ça ?',
		answer: [
			'Vérifie : ce sont bien des caractéristiques (le comment) et pas des fonctionnalités (le quoi) ? « Peut exporter un rapport » est une fonctionnalité, « l’export se termine en moins d’une minute pour un an de données » est une caractéristique.',
			'Vérifie : chacune est-elle liée à un besoin que tu pourrais dire à voix haute, comme « l’agrégation de logs en temps réel » de Kafka ?',
			'Vérifie : peux-tu nommer une décision que chacune impose ? Une caractéristique qui n’impose aucune décision ne guide pas la conception : retire-la.',
			'Vérifie : as-tu coupé quelque chose qui faisait mal à couper ? Si les trois étaient faciles, la liste est sans doute trop générique.'
		]
	},
	quiz: [
		{
			q: 'Laquelle de ces propositions est une **caractéristique** d’architecture, et pas une fonctionnalité ?',
			options: ['Les agents peuvent fusionner deux tickets de support en double en un seul', 'La recherche renvoie des résultats en moins de 200 ms sur 10 millions de tickets', 'Les clients reçoivent un e-mail avec un résumé quand leur ticket est fermé', 'Les utilisateurs peuvent joindre des captures et des fichiers de log à un ticket'],
			answer: 1,
			why: 'Un objectif de latence ne dit rien de ce que fait l’appli. Il contraint la façon de la construire (index, cache, sharding). Les trois autres options décrivent ce que les utilisateurs peuvent faire : ce sont des fonctionnalités.'
		},
		{
			q: 'Pourquoi garder courte la liste des caractéristiques déterminantes ?',
			options: ['Parce qu’un document de conception doit tenir sur une seule page', 'Parce que le catalogue standard ne définit que trois caractéristiques', 'Parce que les managers ne savent pas en suivre plus de quelques-unes à la fois', 'Parce que chacune coûte un effort de conception et qu’elles entrent souvent en conflit'],
			answer: 3,
			why: 'Tenir une caractéristique coûte de la complexité, et elles se font concurrence : dans Kafka, TLS pour la sécurité désactive le chemin zero-copy construit pour le débit.'
		},
		{
			q: 'Un consumer Kafka se connecte en TLS. Qu’arrive-t-il au chemin zero-copy quand le broker lui envoie des données du log ?',
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
	recall: {
		q: 'Kafka a besoin d’un haut débit. Quelles deux décisions ce besoin impose-t-il, et quelle caractéristique désactive l’une d’elles ?',
		a: 'Regrouper les messages en message sets, et le zero-copy du page cache au socket. TLS, pour la sécurité, désactive le zero-copy : le broker lit le fichier dans un buffer de 32 Ko pour le chiffrer.'
	},
	sources: [
		{ title: 'Apache Kafka docs, Design: Motivation', url: `${KAFKA}/docs/design/design.md?plain=1#L29-L43` },
		{ title: 'Apache Kafka docs, Design: Persistence and Efficiency', url: `${KAFKA}/docs/design/design.md?plain=1#L45-L111` },
		{ title: 'Apache Kafka, FileRecords.writeTo', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/common/record/internal/FileRecords.java#L279-L292` },
		{ title: 'Apache Kafka, ProducerConfig: linger.ms', url: `${KAFKA}/clients/src/main/java/org/apache/kafka/clients/producer/ProducerConfig.java#L152-L165` },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly, 2025)', url: 'https://www.developertoarchitect.com/books.html' }
	]
};
