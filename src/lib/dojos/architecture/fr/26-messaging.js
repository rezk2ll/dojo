const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'messaging',
	part: 'La boîte à patterns',
	title: 'Messaging : files, garanties de livraison et dead letters',
	minutes: 10,
	hook: [
		'Ta boutique en ligne publie un message `OrderPaid`. Le service de stock échoue dessus cinq fois, et le broker le déplace dans une dead-letter queue. La personne d’astreinte y voit 40 messages et veut tous les renvoyer.',
		'Attends. L’un d’eux est un `PriceChanged` de la semaine dernière. **Rejoué aujourd’hui, il remet un prix qui a changé deux fois depuis.** Un autre est un `OrderPaid` qui a réussi à moitié : rejoue-le et le stock baisse deux fois.',
		'Un broker n’est donc pas qu’un tuyau. Il fait quatre choix à ta place : **qui reçoit une copie**, **combien de fois**, **dans quel ordre**, et **où vont les échecs**. Aujourd’hui : ces quatre choix et ce que chacun coûte.'
	],
	terms: [
		{ term: 'Exchange et queue', def: 'Dans RabbitMQ, un exchange ne stocke rien. Il route chaque message vers les queues (files) dont le binding correspond, et un exchange fanout le copie dans chaque queue liée. Une queue garde les messages jusqu’à ce qu’un consommateur les prenne.' },
		{ term: 'Competing consumers', def: 'Plusieurs consommateurs sur une même queue (consommateurs concurrents). Chaque message ne va qu’à l’un d’eux. Tu gagnes du débit, et tu perds l’ordre.' },
		{ term: 'At-most-once', def: 'Au plus une fois : un message peut être perdu, mais n’arrive jamais deux fois. Tu l’obtiens en retirant le message avant le travail, ou en ne réessayant jamais.' },
		{ term: 'At-least-once', def: 'Au moins une fois : un message n’est jamais perdu une fois que le broker l’a accepté, mais peut arriver deux fois. Le consommateur ne confirme qu’une fois le travail fait, et dédoublonne.' },
		{ term: 'Poison message', def: 'Un message qui échoue à chaque fois, quel que soit le nombre de retries : données invalides, bug, champ manquant. Laissé dans la queue, il la bloque ou tourne en boucle pour toujours.' },
		{ term: 'Dead-letter queue (DLQ)', def: 'Là où vont les messages en échec. Traite-la comme une liste de tâches pour un humain, pas comme une poubelle : quelqu’un doit être alerté, la lire, et décider message par message.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["Nouveau post"] --> dist["DistributionWorker"]', 'dist -->|"un job par inbox d’abonné"| push["Queue Sidekiq : push"]', 'class push ext'],
				highlight: ['dist', 'push'],
				note: '**Qui reçoit une copie.** Dans Mastodon, un nouveau post devient un job de livraison par inbox distante. Chaque serveur reçoit sa propre copie, donc un serveur lent ne ralentit que son propre job, pas celui des autres.'
			},
			{
				add: ['push -->|"plusieurs threads en concurrence"| workers["Threads DeliveryWorker"]', 'workers -->|"POST"| inboxA["inbox du serveur A"]', 'workers -->|"POST"| inboxB["inbox du serveur B"]', 'class inboxA,inboxB ext'],
				highlight: ['workers', 'inboxA', 'inboxB'],
				note: '**Dans quel ordre.** Plusieurs threads workers prennent des jobs dans la même queue. Ce sont des competing consumers : rapides, mais deux jobs pour la même inbox peuvent finir dans n’importe quel ordre.'
			},
			{
				add: ['workers -.->|"5xx ou timeout"| retry["Retry set de Sidekiq"]', 'retry -.->|"après un backoff"| push'],
				highlight: ['retry'],
				note: '**Combien de fois.** Une livraison en échec part dans le retry set et revient après un délai croissant, jusqu’à 16 fois. Une réponse 4xx comme 404 est jugée sans espoir et n’est jamais réessayée. Un job peut donc tourner plus d’une fois, et **un crash en plein milieu peut le perdre**.'
			},
			{
				add: ['retry -.->|"16 retries épuisés, dead: false"| bin["jeté"]', 'workers -->|"note le jour de l’échec"| tracker["DeliveryFailureTracker"]', 'tracker -->|"échecs sur 7 jours"| unavail["domaine marqué indisponible"]'],
				highlight: ['bin', 'tracker', 'unavail'],
				note: '**Où vont les échecs.** Pas de Dead set ici, c’est voulu. Après le dernier retry, le job est abandonné. À la place, Mastodon compte les jours où un domaine a échoué. Au bout de 7, il arrête d’y envoyer jusqu’à ce que ce serveur envoie à nouveau une activité signée à Mastodon.'
			}
		]
	},
	example: {
		title: 'app/workers/activitypub/delivery_worker.rb',
		repo: 'mastodon/mastodon',
		url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L11-L75`,
		lang: 'ruby',
		code: `  sidekiq_options queue: 'push', retry: 16, dead: false
…
  def perform(json, source_account_id, inbox_url, options = {})
    @options        = options.with_indifferent_access

    return unless @options[:bypass_availability] || DeliveryFailureTracker.available?(inbox_url)
…
    perform_request
  ensure
    if @inbox_url.present?
      if @performed
        failure_tracker.track_success!
      elsif !@unsalvageable
        failure_tracker.track_failure!
      end
    end
  end
…
  def perform_request
    stoplight_wrapper.run do
      request_pool.with(@host) do |http_client|
        build_request(http_client).perform do |response|
          if response_successful?(response)
            @performed = true
          elsif response_error_unsalvageable?(response) || unsalvageable_authorization_failure?(response)
            @unsalvageable = true
          else
            raise Mastodon::UnexpectedResponseError, response
          end
        end
      end
    end
  end`,
		notes: [
			'Ce job envoie un post à une inbox distante. Le fan-out a lieu avant : [`push_bulk` met en queue un job par inbox d’abonné](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/raw_distribution_worker.rb#L25-L31).',
			'**Seule une erreur levée est réessayée.** Un 2xx positionne `@performed`. Un 501, ou un 4xx autre que 401, 408 et 429, est [unsalvageable](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379) : le job se termine sans bruit, sans retry. Tout le reste lève une erreur, et Sidekiq réessaie avec le [backoff défini en haut de la classe](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/delivery_worker.rb#L13-L21). C’est de la détection de poison par code de statut.',
			'`dead: false` veut dire qu’après le 16e retry, Sidekiq [jette le job au lieu de le déplacer dans le Dead set](https://github.com/sidekiq/sidekiq/blob/676ed276f39e0486b6436ff47fec3fa14092c283/lib/sidekiq/job_retry.rb#L264-L270). Personne ne le lira jamais. C’est un choix honnête pour un post destiné à un serveur disparu depuis des jours.',
			'Le chemin d’échec laisse quand même une trace. Chaque tentative ratée ajoute la date du jour à un set Redis pour le domaine. À [7 jours distincts](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/delivery_failure_tracker.rb#L102-L113), le domaine est marqué indisponible, et `perform` le saute à partir de là. Il est réhabilité quand ce serveur [poste à nouveau une activité signée dans l’inbox de Mastodon](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/activitypub/inboxes_controller.rb#L71-L78).'
		]
	},
	tradeoff: {
		gain: [
			'Fan-out, une copie par consommateur : un consommateur lent ou mort ne retarde que sa propre copie.',
			'Retries avec backoff : une courte panne de l’autre côté se résout toute seule, sans réveiller personne.',
			'Une DLQ écarte le poison message, pour qu’un mauvais message n’arrête pas tous les autres.'
		],
		cost: [
			'**L’ordre coûte du débit.** Des competing consumers finissent dans n’importe quel ordre. Garder une queue dans l’ordre veut dire un seul consommateur dessus, et un message bloqué retient toute la queue derrière lui.',
			'**Les retries créent des doublons.** Un job qui a réussi à moitié tourne à nouveau. Chaque consommateur a besoin d’une clé de dédoublonnage, ou d’un travail qu’on peut répéter sans risque.',
			'**Une DLQ a besoin d’un responsable.** Une alerte, un runbook par type de message, et un moyen de rejouer. Si personne ne va la lire, jeter volontairement, comme le fait Mastodon, est plus honnête.'
		]
	},
	task: {
		prompt: 'Lundi matin, la DLQ du service de stock contient 40 messages : 37 `OrderPaid` et 3 `PriceChanged`. Un collègue veut renvoyer les 40 dans la queue principale. Écris ce que tu fais pour chaque type, et ce que tu mets en place pour être prévenu avant lundi la prochaine fois.',
		hint: 'Demande-toi, pour chaque type : l’appliquer deux fois est-il sans risque ? Un vieux message pourrait-il écraser une vérité plus récente ?',
		answer: [
			'`PriceChanged` : ne rejoue pas. Un ancien prix écraserait un prix plus récent. Lis plutôt le prix actuel depuis la source de vérité du catalogue, puis jette-les.',
			'`OrderPaid` : trouve d’abord la cause dans les logs et corrige-la. Ensuite rejoue, mais seulement si le handler dédoublonne sur l’id du message, ou si tu vérifies quelles commandes ont déjà retiré leur stock.',
			'Ne renvoie jamais une DLQ à l’aveugle. Décide par type de message, et écris cette décision là où la personne d’astreinte la trouvera.',
			'Mets une alerte sur la profondeur de la DLQ. Une DLQ que personne ne surveille, c’est là où le travail part pour être oublié.'
		]
	},
	quiz: [
		{
			q: 'Trois services ont chacun besoin de chaque message `OrderPaid`. Comment une configuration RabbitMQ donne-t-elle une copie à chacun ?',
			options: ['Ils consomment la même queue, et RabbitMQ envoie chaque message aux trois', 'Chaque service lie sa propre queue à un exchange fanout, et l’exchange copie le message dans chaque queue liée', 'Le producteur publie le message trois fois, une par service', 'Le premier service qui a fini le message le transmet au suivant'],
			answer: 1,
			why: 'Un exchange fanout copie un message dans chaque queue liée. Les consommateurs d’une même queue sont en concurrence : chaque message ne va qu’à l’un d’eux, donc trois services partageant une queue en verraient chacun un tiers.'
		},
		{
			q: 'Une queue a un seul consommateur actif qui prend un message à la fois. Qu’est-ce que ça t’apporte, et qu’est-ce que ça coûte ?',
			options: ['Chaque message est livré exactement une fois ; il faut un second broker pour le failover', 'Un traitement plus rapide ; les messages peuvent maintenant arriver dans le désordre', 'Plus jamais de dead letters ; les messages en échec sont réessayés à l’infini à la place', 'Les messages sont traités dans l’ordre de la queue ; un message lent ou en échec retient tout ce qui est derrière lui'],
			answer: 3,
			why: 'Un seul consommateur qui prend un message à la fois garde l’ordre de la queue. Le prix, c’est le débit, et un message bloqué bloque la queue jusqu’à ce qu’il réussisse ou parte en dead letter.'
		},
		{
			q: 'Le job de livraison de Mastodon définit `retry: 16, dead: false` dans Sidekiq. Que devient une livraison qui échoue aux 16 retries ?',
			options: ['Elle est jetée ; personne ne l’examinera', 'Elle part dans le Dead set pour qu’un humain la relance', 'Elle retourne dans la queue et est réessayée à l’infini', 'Sidekiq l’envoie plutôt au serveur de l’abonné suivant'],
			answer: 0,
			why: 'Sans `dead: false`, Sidekiq la déplacerait dans le Dead set. Avec, le job est abandonné. Mastodon suit les domaines en échec autrement, en comptant les jours où ils ont échoué.'
		}
	],
	takeaway: 'Pour chaque queue, décide qui reçoit une copie, combien de fois, dans quel ordre, et qui lit les dead letters, avant que le premier message parte.',
	sources: [
		{ title: 'mastodon/mastodon, app/workers/activitypub/delivery_worker.rb', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L1-L100` },
		{ title: 'Sidekiq wiki, Error Handling: retries and the Dead set', url: 'https://github.com/sidekiq/sidekiq/wiki/Error-Handling' },
		{ title: 'Sidekiq wiki, Reliability: a crash mid-job loses the job', url: 'https://github.com/sidekiq/sidekiq/wiki/Reliability' },
		{ title: 'RabbitMQ, Exchanges', url: 'https://www.rabbitmq.com/docs/exchanges' },
		{ title: 'RabbitMQ, Dead letter exchanges', url: 'https://www.rabbitmq.com/docs/dlx' },
		{ title: 'Hohpe and Woolf, Enterprise Integration Patterns: Dead Letter Channel', url: 'https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html' }
	]
};
