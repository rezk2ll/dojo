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
		],
		steps: [
			{
				title: 'Pars des besoins',
				questions: [
					{ q: 'D’où pars-tu pour choisir les trois principales ?', options: ['Du catalogue standard des « -ilités », de haut en bas', 'De ce qui mettrait les utilisateurs ou le business en colère si ça cassait', 'Des technologies que l’équipe connaît déjà', 'De la liste « rapide, sécurisé, scalable, simple, fiable, pas cher »'], answer: 1, why: 'Une caractéristique protège quelque chose qui compte. Pars de ce qui fait mal quand ça casse.' },
					{ q: 'Qu’a écrit la doc de conception de Kafka avant toute conception ?', options: ['Les classes et leurs méthodes', 'La valeur par défaut de `linger.ms`', 'Trois besoins : haut débit, gros backlogs, livraison à faible latence', 'La quantité de page cache d’un broker'], answer: 2, why: 'La doc part de ce que Kafka doit faire. Les décisions viennent après.' },
					{ q: 'Une équipe veut « rapide, sécurisé, scalable, simple, fiable, pas cher », tout au maximum. Qu’est-ce qui ne va pas ?', options: ['Ce sont des fonctionnalités, pas des caractéristiques', 'La liste est trop courte pour couvrir le système', 'Elle n’aide pas l’équipe à choisir entre deux conceptions', 'Elle oublie la latence'], answer: 2, why: 'Si tout compte au maximum, rien ne te dit quelle conception choisir.' },
					{ q: 'Le premier besoin de Kafka parle d’un « haut » débit, sans nombre. Qu’est-ce que ça veut dire pour l’instant ?', options: ['Personne ne peut encore le tester', 'C’est une fonctionnalité, pas une caractéristique', 'Il ne guide pas la conception', 'Il faut le retirer de la liste'], answer: 0, why: '« Haut » et « faible » n’ont pas encore de nombre, donc personne ne peut les vérifier.' }
				]
			},
			{
				title: 'Vérifie que ce sont des caractéristiques',
				questions: [
					{ q: 'Ta liste dit « peut exporter un rapport ». Que fais-tu de cette ligne ?', options: ['Tu la gardes : les utilisateurs tiennent aux exports', 'Tu ajoutes les formats gérés, CSV et PDF', 'Tu la réécris en disant à quel point l’export doit bien marcher, comme « en moins d’une minute pour un an de données »', 'Tu la passes en fin de liste'], answer: 2, why: 'Telle quelle, elle dit ce que les utilisateurs peuvent faire : c’est une fonctionnalité. Une limite sur la façon dont ça marche est une caractéristique, qui façonne la construction.' },
					{ q: '« Les consumers peuvent revenir en arrière et relire d’anciens messages. » Qu’est-ce que c’est ?', options: ['Une caractéristique : le débit', 'Une fonctionnalité', 'Une caractéristique : la disponibilité', 'Une caractéristique déterminante'], answer: 1, why: 'Ça décrit ce que fait le système, donc c’est une fonctionnalité.' },
					{ q: 'Qu’est-ce qui sépare une caractéristique d’une fonctionnalité ?', options: ['Une caractéristique coûte moins cher à construire', 'Une fonctionnalité est toujours testée, une caractéristique non', 'Une fonctionnalité vit dans le code, une caractéristique seulement dans la doc', 'Une caractéristique dit comment construire le système, une fonctionnalité ce qu’il fait'], answer: 3, why: 'Les fonctionnalités sont le quoi. Les caractéristiques sont le comment, et elles façonnent la conception.' },
					{ q: '« Un broker sert les consumers à une vitesse proche de celle du réseau. » Qu’est-ce que c’est ?', options: ['Une caractéristique : ça ne dit rien de ce que fait le système', 'Une fonctionnalité : ça décrit ce que reçoivent les consumers', 'Une fonctionnalité : les utilisateurs voient la vitesse', 'Ni l’un ni l’autre : c’est un détail d’implémentation'], answer: 0, why: 'Ça n’ajoute aucun comportement. Ça décide de la façon de construire le broker.' }
				]
			},
			{
				title: 'Relie chacune à une décision',
				questions: [
					{ q: 'Qu’est-ce que le document de conception de Kafka décide de **ne pas** construire ?', options: ['Le regroupement en message sets', 'Un log en ajout seul sur disque', 'Un gros cache dans le processus, puisque s’appuyer sur le page cache est plus simple', 'Une attente du producer de `linger.ms`'], answer: 2, why: 'Le document dit que s’appuyer sur le page cache « simplifie grandement le code ». Une décision, c’est aussi ce que tu laisses de côté.' },
					{ q: 'Quelle décision vient du besoin de gros backlogs ?', options: ['Le zero-copy du page cache au socket', 'Un log en ajout seul sur disque, avec des messages gardés environ une semaine', 'Une attente du producer de `linger.ms`', 'TLS entre les brokers'], answer: 1, why: 'Ajouter et lire coûte pareil quelle que soit la quantité stockée, donc Kafka peut garder les messages pendant une durée fixée.' },
					{ q: 'Quelle décision vient du besoin de faible latence ?', options: ['Le producer attend au plus `linger.ms` avant d’envoyer', 'Le log garde les messages environ une semaine', 'Le broker lit les fichiers dans un buffer de 32 Ko', 'Le broker construit son propre cache'], answer: 0, why: 'La latence plafonne le regroupement : attendre quelques millisecondes, puis envoyer quand même.' },
					{ q: 'Une de tes caractéristiques n’impose aucune décision. Que fais-tu ?', options: ['Tu la gardes : c’est quand même une qualité voulue', 'Tu la transformes en fonctionnalité', 'Tu la mets en premier des trois', 'Tu la retires : elle ne guide pas la conception'], answer: 3, why: 'Une caractéristique qui n’impose aucune décision ne façonne rien, donc elle n’a pas sa place dans la liste.' }
				]
			},
			{
				title: 'Coupe à trois',
				questions: [
					{ q: 'Tu retires « fiable » de ta liste. Est-ce que le produit a le droit d’être peu fiable ?', options: ['Oui : tout ce qui sort de la liste est ignoré', 'Non : ça compte toujours, ça ne guide simplement pas la conception', 'Oui, jusqu’à la prochaine version', 'Non : ça devient une fonctionnalité'], answer: 1, why: 'La liste des caractéristiques déterminantes garde les quelques qualités qui façonnent la conception. Les autres comptent toujours, et elles cèdent quand elles entrent en conflit avec les trois.' },
					{ q: 'Kafka regroupe les messages pour le débit. Qu’est-ce que ça coûte en latence quand le trafic est faible ?', options: ['Rien : le regroupement ne fait qu’aider', 'Le broker jette les petits lots', 'Chaque producer attend jusqu’à `linger.ms` avant d’envoyer', 'Les consumers doivent lire chaque message deux fois'], answer: 2, why: 'Avec peu de trafic, un lot se remplit lentement, donc le producer attend la fin de `linger.ms` avant d’envoyer. Débit et latence tirent en sens inverse.' },
					{ q: 'Toutes tes coupes ont été faciles. Qu’est-ce que ça suggère ?', options: ['La liste est sans doute trop générique', 'La liste est finie et correcte', 'Tu devrais en ajouter une quatrième', 'Tu as choisi des fonctionnalités par erreur'], answer: 0, why: 'Un vrai top trois te coûte quelque chose. Si rien n’a fait mal, tu n’as pas choisi.' },
					{ q: 'Que peux-tu faire une fois les trois écrites ?', options: ['Te passer de doc de conception pour l’instant', 'Ignorer les demandes de fonctionnalités jusqu’à l’an prochain', 'Promettre les six qualités au maximum', 'Refuser du travail : « Ça aide l’une des trois ? Non ? Ça attendra. »'], answer: 3, why: 'Une liste courte te donne une raison de dire non, et un nouveau venu peut relier chaque décision à un besoin.' }
				]
			}
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
