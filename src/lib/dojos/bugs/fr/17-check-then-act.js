const KAFKA = 'https://github.com/apache/kafka';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'check-then-act',
	part: 'L’état et le temps',
	title: 'Une map livrée à moitié remplie',
	minutes: 10,
	hook: [
		'Dans le client Java de Kafka, une `FetchResponse` contient les enregistrements qu’un broker a renvoyés pour chaque partition. `responseData` les transforme en une map de la partition vers ses données. Elle construit cette map une fois, au premier appel, et la garde pour les suivants.',
		'Plusieurs threads peuvent appeler `responseData` sur la même réponse. La méthode prend un verrou pour qu’un seul thread construise la map. Un contributeur a ouvert [KAFKA-13777](https://issues.apache.org/jira/browse/KAFKA-13777) : un autre thread pouvait quand même **récupérer la map avant qu’elle soit pleine**.'
	],
	terms: [
		{ term: 'Initialisation paresseuse', def: 'Construire une valeur la première fois qu’on la demande, puis la réutiliser.' },
		{ term: 'Double-checked locking', def: 'Tester un champ sans le verrou, puis prendre le verrou et le tester à nouveau avant de construire la valeur.' },
		{ term: 'volatile', def: 'Un modificateur de champ Java. Une écriture dans le champ est vue tout de suite par chaque thread qui le lit.' }
	],
	bug: {
		title: 'KAFKA-13777: Fix potential FetchResponse#responseData race condition issue (#11963)',
		repo: 'apache/kafka',
		url: `${KAFKA}/blob/1317f3f77a9e1e432e7a81de2dcb88365feeac43/clients/src/main/java/org/apache/kafka/common/requests/FetchResponse.java#L73-L120`,
		fix: `${KAFKA}/commit/366b998a229f26aa4601e6b114c2198de0697562`,
		lang: 'java',
		code: `private final FetchResponseData data;
// we build responseData when needed.
private volatile LinkedHashMap<TopicPartition, FetchResponseData.PartitionData> responseData = null;
…
public LinkedHashMap<TopicPartition, FetchResponseData.PartitionData> responseData(Map<Uuid, String> topicNames, short version) {
    if (responseData == null) {
        synchronized (this) {
            if (responseData == null) {
                responseData = new LinkedHashMap<>();
                data.responses().forEach(topicResponse -> {
                    String name;
                    if (version < 13) {
                        name = topicResponse.topic();
                    } else {
                        name = topicNames.get(topicResponse.topicId());
                    }
                    if (name != null) {
                        topicResponse.partitions().forEach(partition ->
                            responseData.put(new TopicPartition(name, partition.partitionIndex()), partition));
                    }
                });
            }
        }
    }
    return responseData;
}`,
		lines: [9, 19],
		diff: `             synchronized (this) {
                 if (responseData == null) {
-                    responseData = new LinkedHashMap<>();
+                    // Assigning the lazy-initialized responseData in the last step
+                    // to avoid other threads accessing a half-initialized object.
+                    final LinkedHashMap<TopicPartition, FetchResponseData.PartitionData> responseDataTmp =
+                            new LinkedHashMap<>();
                     data.responses().forEach(topicResponse -> {
 …
                             topicResponse.partitions().forEach(partition ->
-                                responseData.put(new TopicPartition(name, partition.partitionIndex()), partition));
+                                responseDataTmp.put(new TopicPartition(name, partition.partitionIndex()), partition));
                         }
                     });
+                    responseData = responseDataTmp;
                 }`,
		notes: [
			'**Le champ est publié avant d’être rempli.** Le premier `if (responseData == null)` tourne sans le verrou. Il demande « la map est-elle prête ? » mais ne sait répondre qu’à « le champ est-il affecté ? ». La ligne 9 affecte une map vide au champ, et la boucle la remplit ensuite.',
			'**Un entrelacement concret.** Une réponse contient 3 partitions. Le thread A prend le verrou, exécute la ligne 9 et a ajouté 1 partition. Le thread B appelle `responseData`, voit un champ non nul au premier test, saute le verrou et renvoie une map avec **1 entrée au lieu de 3**. En plus, `LinkedHashMap` n’est pas faite pour être lue pendant qu’un autre thread y écrit.',
			'**Le correctif.** La map est construite dans une variable locale, `responseDataTmp`, puis affectée au champ en dernier. Un thread qui voit le champ affecté voit maintenant une map pleine. Le champ est `volatile`, donc les entrées écrites avant cette affectation sont visibles pour le thread qui le lit.',
			'**Comment ça a été trouvé.** Le ticket JIRA cite la méthode et propose une réécriture, sans plantage joint. Son titre le dit : "Assignment of lazy-initialized members should be the last step with double-checked locking" (l’affectation doit être la dernière étape). Le message du commit ajoute que l’ancien ordre "would let other threads get the partial object".'
		]
	},
	quiz: [
		{
			q: 'Le thread A est dans le verrou et a ajouté 1 partition sur 3. Le thread B appelle `responseData`. Que reçoit B avec le code bogué ?',
			options: [
				'Il attend le verrou, puis reçoit les 3 partitions',
				'Il reçoit la même map, avec 1 partition pour l’instant',
				'Il construit sa propre map avec les 3 partitions',
				'Il reçoit null, parce que la map n’est pas finie'
			],
			answer: 1,
			why: 'Le premier test tourne sans le verrou. Le champ est déjà affecté, donc B n’attend jamais et renvoie la map que A est encore en train de remplir.'
		},
		{
			q: 'À quelle question répond vraiment le test fait hors du verrou ?',
			options: [
				'Si un autre thread tient le verrou en ce moment',
				'Si le champ a déjà été affecté',
				'Si toutes les partitions sont déjà dans la map',
				'Si le broker a envoyé la réponse complète'
			],
			answer: 1,
			why: 'Un test contre null dit seulement que le champ a été affecté. Avec l’affectation en premier, affecté et fini sont deux moments différents.'
		},
		{
			q: 'Tu relis un getter paresseux en double-checked locking. Que vérifies-tu en premier ?',
			options: [
				'Que le verrou porte sur `this` et pas sur un objet privé',
				'Que le champ n’est affecté qu’une fois la valeur complète',
				'Que le getter entier est déclaré `synchronized`',
				'Que le type de map garde l’ordre d’insertion'
			],
			answer: 1,
			why: 'Les lecteurs hors du verrou font confiance au champ dès qu’il n’est plus nul. La valeur doit être complète avant, et en Java le champ doit être `volatile`.'
		}
	],
	takeaway: 'Dans un getter paresseux, un lecteur qui saute le verrou agit sur le champ dès qu’il est affecté. Construis la valeur dans une variable locale et affecte le champ en dernier, pour qu’affecté veuille dire fini.',
	sources: [
		{ title: 'kafka, pull request #11963', url: `${KAFKA}/pull/11963` },
		{ title: 'KAFKA-13777 sur le JIRA de Kafka', url: 'https://issues.apache.org/jira/browse/KAFKA-13777' }
	]
};
