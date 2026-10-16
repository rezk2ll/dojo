const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'messaging',
	part: 'La boîte à patterns',
	title: 'Messaging : files, garanties de livraison et dead letters',
	minutes: 10,
	hook: [
		'Ta boutique en ligne publie un message `OrderPaid`. Le service de stock échoue dessus cinq fois, et le broker le déplace dans une dead-letter queue. La personne d’astreinte y voit 40 messages et veut tous les renvoyer.',
		'L’un d’eux est un `PriceChanged` de la semaine dernière. **Rejoué aujourd’hui, il remet un prix qui a changé deux fois depuis.** Un autre est un `OrderPaid` qui a réussi à moitié : rejoue-le et le stock baisse deux fois.',
		'Toute configuration de queue répond à quatre questions : qui reçoit une copie, combien de fois, dans quel ordre, et où vont les échecs. Chaque réponse a un coût, et les 40 messages de cette queue en montrent deux.'
	],
	terms: [
		{ term: 'Competing consumers', def: 'Plusieurs consommateurs lisent la même queue (file), et chaque message ne va qu’à l’un d’eux. Avec plus de consommateurs, tu traites plus de messages par seconde, mais ils peuvent finir dans le désordre.' },
		{ term: 'At-least-once', def: 'Au moins une fois : un message n’est jamais perdu une fois que le broker l’a accepté, mais peut arriver deux fois. Le consommateur ne confirme qu’une fois le travail fait, et dédoublonne.' },
		{ term: 'Poison message', def: 'Un message qui échoue à chaque retry, à cause de données invalides, d’un bug ou d’un champ manquant. Si tu le laisses dans la queue, il la bloque ou tourne en boucle sans fin.' },
		{ term: 'Dead-letter queue (DLQ)', def: 'La queue où le broker range les messages qui ont échoué trop de fois. Quelqu’un doit recevoir une alerte, lire chaque message et décider quoi en faire.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["Nouveau post"] --> dist["DistributionWorker"]', 'dist -->|"un job par inbox d’abonné"| push["Queue Sidekiq : push"]', 'class push ext'],
				highlight: ['dist', 'push'],
				note: 'Qui reçoit une copie : pour chaque nouveau post, Mastodon met en queue un job de livraison par inbox distante. Un serveur lent ne retarde que le job qui le vise.'
			},
			{
				add: ['push -->|"plusieurs threads en concurrence"| workers["Threads DeliveryWorker"]', 'workers -->|"POST"| inboxA["inbox du serveur A"]', 'workers -->|"POST"| inboxB["inbox du serveur B"]', 'class inboxA,inboxB ext'],
				highlight: ['workers', 'inboxA', 'inboxB'],
				note: 'Dans quel ordre : plusieurs threads workers prennent des jobs dans la même queue `push`. Ces competing consumers livrent beaucoup de posts en parallèle, et deux jobs pour la même inbox peuvent finir dans n’importe quel ordre.'
			},
			{
				add: ['workers -.->|"5xx ou timeout"| retry["Retry set de Sidekiq"]', 'retry -.->|"après un backoff"| push'],
				highlight: ['retry'],
				note: 'Combien de fois : une livraison en échec part dans le retry set et revient après un délai croissant, jusqu’à 16 fois. Mastodon ne réessaie jamais une réponse 4xx comme 404. Un job peut donc tourner plus d’une fois, et **un crash en plein milieu peut le perdre**.'
			},
			{
				add: ['retry -.->|"16 retries épuisés, dead: false"| bin["jeté"]', 'workers -->|"note le jour de l’échec"| tracker["DeliveryFailureTracker"]', 'tracker -->|"échecs sur 7 jours"| unavail["domaine marqué indisponible"]'],
				highlight: ['bin', 'tracker', 'unavail'],
				note: 'Où vont les échecs : Mastodon n’a volontairement pas de Dead set, donc Sidekiq jette le job après le dernier retry. Mastodon compte plutôt les jours où un domaine a échoué. Au bout de 7, il arrête d’y envoyer jusqu’à ce que ce serveur lui envoie à nouveau une activité signée.'
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
			'La ligne 3 démarre un job qui envoie un post à une inbox distante. Le fan-out a lieu avant : [`push_bulk` met en queue un job par inbox d’abonné](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/raw_distribution_worker.rb#L25-L31).',
			'Les lignes 23 à 28 décident quelles réponses Sidekiq réessaie. Un 2xx positionne `@performed`. Un 501, ou un 4xx autre que 401, 408 et 429, est [unsalvageable](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379) : Mastodon le traite comme un poison message et termine le job sans retry. Pour tout le reste, la ligne 28 lève une erreur, et Sidekiq réessaie avec le backoff défini en haut de la classe.',
			'La ligne 1 pose `dead: false` : après le 16e retry, Sidekiq [jette le job au lieu de le déplacer dans le Dead set](https://github.com/sidekiq/sidekiq/blob/676ed276f39e0486b6436ff47fec3fa14092c283/lib/sidekiq/job_retry.rb#L264-L270). Personne ne lit la livraison ratée. Mastodon accepte de perdre un post destiné à un serveur disparu depuis des jours.',
			'Les lignes 9 à 16 enregistrent chaque tentative. Une tentative ratée ajoute la date du jour à un set Redis pour le domaine. À [7 jours distincts](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/delivery_failure_tracker.rb#L102-L113), Mastodon marque le domaine indisponible, et la ligne 6 le saute à partir de là. La marque disparaît quand ce serveur poste à nouveau une activité signée dans l’inbox de Mastodon.'
		]
	},
	tradeoff: {
		gain: [
			'Le fan-out donne à chaque serveur distant son propre job de livraison : un serveur lent ou mort ne retarde que sa propre copie.',
			'Sidekiq réessaie une livraison ratée jusqu’à 16 fois avec un délai croissant : un serveur en panne pendant peu de temps reçoit quand même le post, et personne n’est réveillé.',
			'Une DLQ sort le poison message de la queue, et les messages derrière lui continuent de passer.'
		],
		cost: [
			'Des competing consumers finissent dans n’importe quel ordre. Pour garder l’ordre, il faut un seul consommateur sur la queue, et un message bloqué retient alors tous ceux qui sont derrière.',
			'Les retries créent des doublons : un job qui a réussi à moitié tourne à nouveau. Chaque consommateur a besoin d’une clé de dédoublonnage, ou d’un travail qu’on peut répéter sans risque.',
			'Une DLQ demande une alerte, un runbook par type de message et un moyen de rejouer. Chez Mastodon, personne ne lirait les livraisons ratées, donc il les jette après 16 retries.'
		]
	},
	task: {
		prompt: 'Lundi matin, la DLQ du service de stock contient 40 messages : 37 `OrderPaid` et 3 `PriceChanged`. Un collègue veut renvoyer les 40 dans la queue principale. Écris ce que tu fais pour chaque type, et ce que tu mets en place pour être prévenu avant lundi la prochaine fois.',
		hint: 'Demande-toi, pour chaque type : l’appliquer deux fois est-il sans risque ? Un vieux message pourrait-il écraser une vérité plus récente ?',
		answer: [
			'`PriceChanged` : ne rejoue pas. Un ancien prix écraserait un prix plus récent. Lis plutôt le prix actuel depuis la source de vérité du catalogue, puis jette-les.',
			'`OrderPaid` : trouve d’abord la cause dans les logs et corrige-la. Ensuite rejoue, mais seulement si le handler dédoublonne sur l’id du message, ou si tu vérifies quelles commandes ont déjà retiré leur stock.',
			'Décide type de message par type de message, jamais pour toute la DLQ d’un coup, et écris cette décision là où la personne d’astreinte la trouvera.',
			'Mets une alerte sur la profondeur de la DLQ : la personne d’astreinte apprend l’arrivée du premier message mort le jour même, pas le lundi.'
		]
	},
	quiz: [
		{
			q: 'Trois services ont chacun besoin de chaque message `OrderPaid`. Comment une configuration RabbitMQ donne-t-elle une copie à chacun ?',
			options: ['Ils consomment tous la même queue, et RabbitMQ livre chaque message à chacun des trois consommateurs', 'Chaque service lie sa propre queue à un exchange fanout, qui copie le message dans chaque queue liée', 'Le producteur publie le message trois fois, une par service, avec la routing key de ce service', 'Le premier service qui a fini le message l’acquitte et en transmet une copie au service suivant'],
			answer: 1,
			why: 'Un exchange fanout copie un message dans chaque queue liée. Les consommateurs d’une même queue sont en concurrence : chaque message ne va qu’à l’un d’eux, donc trois services partageant une queue en verraient chacun un tiers.'
		},
		{
			q: 'Une queue a un seul consommateur actif qui prend un message à la fois. Qu’est-ce que ça t’apporte, et qu’est-ce que ça coûte ?',
			options: ['Chaque message est livré exactement une fois ; il faut en échange un second broker pour le failover', 'Un traitement plus rapide ; en échange, les messages peuvent maintenant arriver dans le désordre', 'Plus jamais de dead letters ; les messages en échec sont réessayés à l’infini à la place', 'Les messages sont traités dans l’ordre de la queue ; un message lent ou en échec retient tout ce qui est derrière lui'],
			answer: 3,
			why: 'Un seul consommateur qui prend un message à la fois garde l’ordre de la queue. Il traite aussi moins de messages par seconde, et un message bloqué bloque la queue jusqu’à ce qu’il réussisse ou parte en dead letter.'
		},
		{
			q: 'Le job de livraison de Mastodon définit `retry: 16, dead: false` dans Sidekiq. Qu’arrive-t-il à une livraison qui échoue aux 16 retries ?',
			options: ['Elle est jetée ; personne ne l’examinera', 'Elle part dans le Dead set pour qu’un humain la relance', 'Elle retourne dans la queue et est réessayée à l’infini', 'Sidekiq l’envoie plutôt au serveur de l’abonné suivant'],
			answer: 0,
			why: 'Sans `dead: false`, Sidekiq la déplacerait dans le Dead set. Avec, Sidekiq jette le job. Mastodon suit les domaines en échec autrement, en comptant les jours où ils ont échoué.'
		}
	],
	recall: {
		q: 'À quelles quatre questions répond toute configuration de queue, et que fait le job de livraison de Mastodon d’une livraison qui échoue à chaque retry ?',
		a: 'Qui reçoit une copie, combien de fois, dans quel ordre, et où vont les échecs. Mastodon réessaie 16 fois, puis jette le job (`dead: false`) et marque le domaine indisponible après 7 jours d’échecs.'
	},
	sources: [
		{ title: 'mastodon/mastodon, app/workers/activitypub/delivery_worker.rb', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L1-L100` },
		{ title: 'mastodon/mastodon, inboxes_controller.rb : une activité signée efface la marque d’indisponibilité', url: `${REPO}/app/controllers/activitypub/inboxes_controller.rb#L71-L78` },
		{ title: 'Sidekiq wiki, Error Handling: retries and the Dead set', url: 'https://github.com/sidekiq/sidekiq/wiki/Error-Handling' },
		{ title: 'Sidekiq wiki, Reliability: a crash mid-job loses the job', url: 'https://github.com/sidekiq/sidekiq/wiki/Reliability' },
		{ title: 'RabbitMQ, Exchanges', url: 'https://www.rabbitmq.com/docs/exchanges' },
		{ title: 'RabbitMQ, Dead letter exchanges', url: 'https://www.rabbitmq.com/docs/dlx' },
		{ title: 'Hohpe and Woolf, Enterprise Integration Patterns: Dead Letter Channel', url: 'https://www.enterpriseintegrationpatterns.com/patterns/messaging/DeadLetterChannel.html' }
	]
};
