const REPO = 'https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'outbox-and-sagas',
	part: 'La boîte à patterns',
	title: 'Outbox et sagas : quand un changement touche deux systèmes',
	minutes: 10,
	hook: [
		'Une boutique en ligne prend une commande. Le code du checkout enregistre la commande dans Postgres, puis publie `OrderPlaced` pour que l’entrepôt la prépare. Deux écritures, dans deux systèmes.',
		'Ce soir, le broker redémarre à la mauvaise seconde. L’enregistrement est commité, la publication lève une exception, et le code logue une erreur. **La commande existe. L’entrepôt n’en a jamais entendu parler.**',
		'C’est le **problème de la double écriture** : aucune transaction ne couvre à la fois une base de données et un broker. Aujourd’hui, deux patterns qui font avec. L’**outbox** transforme les deux écritures en une seule. La **saga** déroule un processus entre des services qui ne partagent aucune transaction.'
	],
	terms: [
		{ term: 'Dual write (double écriture)', def: 'Un même changement écrit dans deux systèmes, par exemple une base et un broker, sans transaction qui couvre les deux. Un crash ou une panne entre les deux les désynchronise.' },
		{ term: 'Transactional outbox', def: 'Écris le message sortant dans une table, dans la même transaction que le changement. Les deux sont commités, ou aucun. Un relais le publie plus tard.' },
		{ term: 'Relais', def: 'Le code qui lit les nouvelles lignes de l’outbox et les publie. Il peut interroger la table à intervalles réguliers, ou suivre le journal de la base. Un crash après une publication peut envoyer une ligne deux fois : le relais garantit donc at-least-once.' },
		{ term: 'Saga', def: 'Un processus réparti sur plusieurs services, où chaque étape est sa propre transaction locale. Si une étape suivante échoue, les étapes précédentes sont annulées par des actions de compensation.' },
		{ term: 'Action de compensation', def: 'Une nouvelle action qui annule l’effet d’une précédente : libérer le stock, rembourser la carte. Ce n’est pas un rollback : d’autres ont peut-être déjà vu la première étape.' },
		{ term: 'Chorégraphie vs orchestration', def: 'Chorégraphie : chaque service réagit à des événements, et personne ne détient le plan complet. Orchestration : un service envoie des commandes, suit les réponses et décide de la suite.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['checkout["Service checkout"] -->|"1 : commit de la commande"| db[("Base des commandes")]', 'checkout -.->|"2 : publication, peut échouer"| kafka["Kafka"]', 'class kafka ext'],
				highlight: ['checkout', 'kafka'],
				note: '**La double écriture.** L’étape 1 est commitée. L’étape 2 peut échouer, et rien ne la renvoie. Inverse l’ordre et tu obtiens le bug inverse : un événement sur une commande que la base refuse ensuite d’enregistrer.'
			},
			{
				add: ['checkout -->|"même transaction"| outbox[("table outbox")]'],
				highlight: ['outbox'],
				note: '**L’outbox.** Le checkout insère la commande et une ligne d’outbox dans **une seule** transaction. Un rollback supprime les deux. Un commit garde les deux. Le checkout ne parle jamais à Kafka.'
			},
			{
				add: ['dbz["Debezium : outbox event router"] -->|"suit le write-ahead log"| outbox', 'dbz -->|"topic outbox.event.order, clé = id de commande"| kafka', 'class dbz ext'],
				highlight: ['dbz'],
				note: '**Le relais.** Debezium lit chaque insertion commitée dans le journal de la base et la transforme en message Kafka. Pas de polling, et pas de seconde écriture dans le checkout. S’il crashe, il reprend à sa dernière position enregistrée, donc certains messages peuvent partir deux fois.'
			},
			{
				add: ['kafka -->|"OrderPlaced"| stock["Stock : réserver les articles"]', 'stock -->|"StockReserved"| pay["Paiement : débiter la carte"]'],
				highlight: ['stock', 'pay'],
				note: '**Une saga par chorégraphie.** Passer une commande est un seul processus réparti sur trois services. Personne ne le pilote : chaque service fait sa transaction locale et publie l’événement suivant, via sa propre outbox.'
			},
			{
				add: ['pay -->|"PaymentFailed"| release["Stock : libérer les articles"]', 'release -->|"StockReleased"| cancel["Checkout : annuler la commande"]'],
				highlight: ['release', 'cancel'],
				note: '**Annuler, et l’ordre des étapes.** Un paiement échoué déclenche des actions de compensation : libérer le stock, annuler la commande. La carte est débitée **en dernier**, parce qu’un remboursement est l’étape la plus difficile à annuler proprement.'
			}
		]
	},
	example: {
		title: 'EventRouterDelegate.java, apply',
		repo: 'debezium/debezium',
		url: `${REPO}/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterDelegate.java#L109-L259`,
		lang: 'java',
		code: `        Struct debeziumEventValue = requireStruct(r.value(), "Detect Debezium Operation");
        String op = debeziumEventValue.getString(Envelope.FieldName.OPERATION);

        // Skipping deletes
        if (op.equals(Envelope.Operation.DELETE.code())) {
            LOGGER.debug("Delete message {} ignored", maybeRedactSensitiveData(r.key()));
            return null;
        }

        // Dealing with unexpected update operations
        if (op.equals(Envelope.Operation.UPDATE.code())) {
            handleUnexpectedOperation(r);
            return null;
        }
…
        Object eventId = eventStruct.get(fieldEventId);
…
        Headers headers = r.headers();
        headers.add("id", eventId, eventIdField.schema());
…
        Object recordKey = defineRecordKey(fieldEventKey, eventStruct);

        R newRecord = r.newRecord(
                eventStruct.getString(routeByField),
                partition.get(),
                defineRecordKeySchema(fieldEventKey, eventValueSchema),
                recordKey,
                updatedSchema,
                updatedValue,
                timestamp,
                headers);
…
        return regexRouter.apply(newRecord);
    }`,
		notes: [
			'Ce code tourne sur chaque changement que Debezium lit dans la table outbox. **L’outbox est une file d’insertions.** Une suppression est ignorée, donc le service peut nettoyer les vieilles lignes sans rien envoyer. Une mise à jour est inattendue : par [défaut](https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterConfigDefinition.java#L230-L237), elle est ignorée avec un avertissement.',
			'L’`id` de la ligne devient le header `id` du message. La doc Debezium dit à quoi il sert : **« supprimer les messages en double »**. La FAQ de Debezium le dit clairement : après un crash, les consommateurs peuvent voir certains événements plus d’une fois.',
			'Le topic vient de `route.by.field` et la clé du message de `table.field.event.key`. Leurs [valeurs par défaut](https://github.com/debezium/debezium/blob/8974b2bed859560cd9bacab5e2e6e85ff42a843f/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterConfigDefinition.java#L247-L327) sont les colonnes `aggregatetype` et `aggregateid`, et le topic devient `outbox.event.<aggregatetype>`. Même id de commande, même clé, même partition Kafka : **les événements d’une commande restent dans l’ordre.**',
			'Ce qu’il ne fait pas : ouvrir une transaction dans ton service. Ton code doit toujours insérer la ligne d’outbox dans la même transaction que le changement. Debezium garantit seulement qu’une ligne commitée finit par être envoyée.'
		]
	},
	tradeoff: {
		gain: [
			'Avec une outbox, un changement commité a toujours son événement stocké, même si le broker est en panne pendant une heure. Le relais rattrape son retard.',
			'La chorégraphie garde les services séparés : le checkout ne sait pas qui réserve le stock ou encaisse le paiement. Un nouveau service s’abonne, sans changement en amont.',
			'Chaque étape de la saga est commitée seule, donc aucun verrou n’est tenu entre services pendant qu’un paiement est en attente.'
		],
		cost: [
			'**L’outbox exige le message et le changement dans une même base.** Un service qui écrit dans un système sans transaction partagée, comme une API distante, vit toujours avec la double écriture.',
			'**Le relais est un système à faire tourner, et après un crash il envoie des doublons.** Un job de polling, ou un connecteur Debezium avec Kafka Connect, plus des consommateurs qui ignorent les répétitions grâce à l’id d’événement.',
			'**Personne ne voit la saga entière.** Avec la chorégraphie, « où est bloquée la commande 42 ? » n’a pas de responsable unique. Et une compensation peut échouer aussi, en laissant un processus à moitié fait et une ligne de log.'
		]
	},
	task: {
		prompt: 'Ton appli de billetterie vend des places de concert. La réservation fait trois choses dans trois services : bloquer la place, débiter la carte, envoyer le billet par e-mail. Conçois-la comme une saga : l’ordre des étapes, la compensation de chacune, et ce que chaque consommateur doit faire de l’id d’événement.',
		hint: 'Quelle étape est la plus difficile à annuler ? Laquelle ne peut jamais être annulée du tout ?',
		answer: [
			'Bloque la place d’abord, avec une expiration : c’est peu coûteux à libérer. Sa compensation est « libérer la place ».',
			'Débite la carte ensuite. Si ça échoue, libère la place. Sa propre compensation, un remboursement, coûte cher : garde-la pour le cas où une étape suivante échoue vraiment.',
			'Envoie le billet par e-mail en dernier. Un e-mail ne peut jamais être « désenvoyé », donc il part seulement après la réussite du débit.',
			'Chaque service écrit son événement dans sa propre outbox, dans la même transaction que son changement. Chaque consommateur stocke les ids d’événements qu’il a traités et saute les répétitions, pour qu’un doublon ne débite jamais deux fois.'
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui rend une transactional outbox fiable ?',
			options: ['Le broker garde le message en attente jusqu’à ce que la base confirme le commit', 'Le relais publie chaque message exactement une fois, donc les consommateurs ne voient jamais de doublon', 'Le message est écrit dans une table, dans la même transaction que le changement qu’il décrit', 'Le service réessaie la publication depuis la mémoire, de plus en plus espacée, jusqu’à ce que le broker l’accepte'],
			answer: 2,
			why: 'Le changement et le message sont commités ensemble, ou aucun des deux. Le message peut alors être envoyé plus tard, autant de fois que nécessaire. Le broker ne participe jamais à la transaction, et le relais garantit at-least-once, pas exactly-once.'
		},
		{
			q: 'Un relais publie une ligne d’outbox, puis crashe avant d’enregistrer où il en est. Que se passe-t-il ensuite ?',
			options: ['Au redémarrage, le relais republie la ligne, et le consommateur ignore la répétition grâce à son id d’événement', 'La ligne est perdue, parce que le crash a effacé la progression que le relais gardait en mémoire', 'Le broker repère le doublon grâce à sa clé et le supprime avant que les consommateurs le voient', 'La base fait un rollback de la transaction, donc le changement de la commande est annulé aussi'],
			answer: 0,
			why: 'La publication est hors de la base, donc rien ne peut l’annuler. Le relais reprend à son dernier point enregistré, et la ligne repart : at-least-once. Un id d’événement stable permet au consommateur de repérer la répétition.'
		},
		{
			q: 'L’outbox event router de Debezium utilise par défaut la colonne `aggregateid` comme clé du message Kafka. Pourquoi est-ce important ?',
			options: ['Il chiffre le message avec une clé qui appartient à cet agrégat', 'Kafka supprime tout message suivant avec la même clé, donc chaque événement arrive une fois', 'Il fait ignorer au router les événements de suppression de cet agrégat, donc les lignes restent', 'Les messages de même clé vont dans la même partition, donc les événements d’une commande restent dans l’ordre'],
			answer: 3,
			why: 'Kafka garde l’ordre au sein d’une partition, et la clé choisit la partition. Kafka ne dédoublonne pas par clé : c’est le rôle du header `id`.'
		}
	],
	takeaway: 'Quand un changement doit atteindre deux systèmes, écris le message là où le changement est commité, laisse un relais l’envoyer au moins une fois, et prévois l’annulation de chaque étape de la saga.',
	sources: [
		{ title: 'debezium/debezium, EventRouterDelegate.java', url: `${REPO}/debezium-connect-plugins/src/main/java/io/debezium/transforms/outbox/EventRouterDelegate.java#L96-L259` },
		{ title: 'Debezium documentation: Outbox Event Router', url: 'https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html' },
		{ title: 'Debezium FAQ: why consumers must expect duplicate events', url: 'https://debezium.io/documentation/faq/#why_must_consuming_applications_expect_duplicate_events' },
		{ title: 'Chris Richardson, microservices.io: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
		{ title: 'Chris Richardson, microservices.io: Saga', url: 'https://microservices.io/patterns/data/saga.html' }
	]
};
