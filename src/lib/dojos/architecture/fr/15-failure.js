const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const SIDEKIQ = 'https://github.com/sidekiq/sidekiq/blob/1bb4aa06e5aa178a114a5e855f9f3d5c24f6c61b';
const PSS = `${REPO}/app/services/post_status_service.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'failure',
	part: 'Entre les services',
	title: 'L’échec : timeouts, retries, idempotence',
	minutes: 10,
	hook: [
		'Tu es dans le train. Tu appuies sur Publier dans ton appli Mastodon. Le spinner tourne, le réseau coupe, et au bout d’un moment l’appli abandonne.',
		'Maintenant, la question difficile : **le post est-il passé ?** Peut-être que la requête n’est jamais arrivée. Peut-être que le serveur l’a enregistré et que la réponse s’est perdue. Depuis le téléphone, les deux cas se ressemblent exactement.',
		'Alors l’appli va réessayer. Un retry n’est sûr que si faire le travail deux fois donne le même résultat que le faire une fois. Cette propriété a un nom, l’**idempotence**, et sans elle chaque retry risque de créer une deuxième copie de ton post.'
	],
	terms: [
		{ term: 'Timeout', def: 'Le temps que tu attends avant d’abandonner. Il te libère. Il ne te dit rien de ce qui s’est passé de l’autre côté.' },
		{ term: 'Retry avec backoff', def: 'Réessayer en attendant plus longtemps après chaque échec, pour laisser au service en difficulté la place de récupérer.' },
		{ term: 'Jitter', def: 'Une petite part d’aléatoire ajoutée à chaque attente, pour que mille clients qui ont échoué ensemble ne réessaient pas tous dans la même seconde.' },
		{ term: 'Idempotent', def: 'Le faire deux fois a le même effet que le faire une fois. « Passer le statut à supprimé » l’est. « Ajouter 10 € au solde » ne l’est pas.' },
		{ term: 'Clé d’idempotence', def: 'Une valeur unique que le client envoie avec une requête, et renvoie à chaque retry de cette requête, pour que le serveur repère la répétition.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['app(["Appli mobile"]) -->|"POST /api/v1/statuses, Idempotency-Key: k1"| api["API Mastodon"]'],
				highlight: ['app', 'api'],
				note: 'Le client choisit une clé **une seule fois par post**, et envoie la même clé à chaque retry. La doc de l’API Mastodon : « Pense à utiliser un hash ou un UUID généré côté client. »'
			},
			{
				add: ['api -->|"verrou, puis recherche de k1"| redis[("Redis")]'],
				highlight: ['redis'],
				note: 'Première requête : enregistrer le post, puis stocker son id sous la clé pendant **une heure**. Un retry avec la même clé trouve l’id et récupère **le même post**. Pas de deuxième copie, et pas de deuxième livraison.'
			},
			{
				add: ['deliv["DeliveryWorker"] -->|"connexion 5 s, chaque lecture 10 s, toutes les lectures 30 s"| remote["Inbox du serveur distant"]', 'class remote ext'],
				highlight: ['deliv', 'remote'],
				note: '**Chaque appel sortant a un timeout.** La classe `Request` de Mastodon passe les mêmes réglages [`TIMEOUT`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/request.rb#L83-L86) à chaque requête qu’elle fait. Sans eux, un seul serveur bloqué pourrait garder un worker très longtemps.'
			},
			{
				add: ['deliv -->|"échec : attendre count⁴ + 15 s + jitter"| retry["Retry set de Sidekiq"]', 'retry -->|"réessayer"| deliv'],
				highlight: ['retry'],
				note: '**Backoff avec jitter.** L’attente de base de Sidekiq croît avec la puissance quatre du nombre de retries. Mastodon ajoute son propre jitter par-dessus. **Les retries servent aux échecs qui peuvent guérir** : la plupart des réponses 4xx ne sont pas relancées du tout.'
			},
			{
				add: ['remote --> create["Côté distant : verrou sur l’URI du post, on passe s’il existe"]'],
				highlight: ['create'],
				note: 'Le destinataire est idempotent lui aussi. Une livraison relancée alors qu’elle avait en fait réussi trouve le post par son URI et **ne le crée pas une deuxième fois**.'
			}
		]
	},
	example: {
		title: 'app/services/post_status_service.rb, with_idempotency',
		repo: 'mastodon/mastodon',
		url: `${PSS}#L226-L256`,
		lang: 'ruby',
		code: `  def idempotency_key
    "idempotency:status:#{@account.id}:#{@options[:idempotency]}"
  end
…
  def idempotency_duplicate?
    @idempotency_duplicate = redis.get(idempotency_key)
  end

  def with_idempotency
    return yield unless idempotency_given?

    with_redis_lock("idempotency:lock:status:#{@account.id}:#{@options[:idempotency]}") do
      raise IdempotencyError, idempotency_duplicate if idempotency_duplicate?

      yield

      redis.setex(idempotency_key, 3_600, @status.id)
    end
  end`,
		notes: [
			'**Idempotence, style 1 : te souvenir de ce que tu as fait.** La clé est limitée au compte, donc deux utilisateurs ne peuvent pas entrer en collision. Un doublon lève `IdempotencyError` avec l’ancien post, et [`call` renvoie ce post](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/services/post_status_service.rb#L60-L78) sans mettre de nouveaux jobs en file.',
			'Le verrou compte. Deux copies de la requête au même moment rateraient toutes les deux la clé et enregistreraient toutes les deux. Avec le verrou, la seconde reçoit un [503 « réessaie »](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/concerns/api/error_handling.rb#L40-L42) et son retry trouve la clé.',
			'**Style 2 : ignorer ce qui existe déjà.** Le serveur destinataire [prend un verrou sur l’URI du post et cherche un statut existant](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/activitypub/activity/create.rb#L30-L38) avant d’en créer un. L’URI est la clé naturelle.',
			'Quels échecs sont relancés : [`response_error_unsalvageable?`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379) est vrai pour 501 et pour les 4xx sauf 401, 408 et 429. Ces jobs se terminent sans retry. Les timeouts et les 5xx lèvent une erreur et sont relancés avec [le jitter de Mastodon](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/delivery_worker.rb#L13-L21).'
		]
	},
	tradeoff: {
		gain: [
			'Les timeouts transforment un serveur bloqué en échec clair, et libèrent le worker pour le job suivant.',
			'Les retries absorbent les pannes courtes : un redémarrage, une coupure réseau, un déploiement. Le backoff et le jitter les étalent, donc un serveur qui revient n’est pas accueilli par un mur de trafic.',
			'Avec des handlers idempotents des deux côtés, « livrer au moins une fois » suffit. Tu arrêtes de courir après le « exactement une fois ».'
		],
		cost: [
			'**Un timeout n’annule pas le travail.** L’autre côté peut encore le terminer. Prévois le cas « c’est arrivé, je ne l’ai juste pas su ».',
			'**Les retries multiplient la charge.** L’exemple de l’Amazon Builders’ Library : cinq couches qui essaient chacune trois fois mettent **243 fois** la charge sur la base de données. Leur conseil pour les appels peu coûteux : réessayer à un seul endroit de la stack.',
			'**L’idempotence demande du design.** Une clé a besoin de stockage, d’un verrou et d’une expiration. La clé de Mastodon vit une heure : un retry après ce délai crée un deuxième post. Et si le processus meurt après l’enregistrement mais avant l’écriture de la clé, un retry crée quand même un doublon.'
		]
	},
	task: {
		prompt: 'Ton appli SaaS de facturation envoie un e-mail « paiement reçu » quand le prestataire de paiement appelle ton webhook. Le prestataire réessaie quand ton endpoint est lent, et les clients reçoivent deux e-mails. Rends le handler idempotent. Qu’est-ce que tu stockes, et quelle est sa clé ?',
		hint: 'Y a-t-il dans le webhook un id stable qui reste le même à chaque retry ? Si tu ne peux pas demander au serveur mail « est-ce que je l’ai déjà envoyé ? », tu dois t’en souvenir toi-même.',
		answer: [
			'Prends comme clé quelque chose de stable que chaque retry répète : l’id d’événement du prestataire, ou l’id du paiement. Pas un id aléatoire que tu génères à la réception : chaque retry en aurait un nouveau.',
			'Stocke une ligne comme `(event_id, processed_at)` avec une **contrainte d’unicité**. Insère d’abord. Si l’insertion échoue parce que c’est un doublon, réponds 200 et ne fais rien.',
			'Réponds vite au webhook, et envoie l’e-mail depuis un job. C’est justement un endpoint lent qui déclenche les retries du prestataire.',
			'L’ordre compte quand même : insérer, puis envoyer. Un crash entre les deux fait perdre un e-mail. Décide ce qui est le pire pour toi : un e-mail manquant ou un e-mail en double.',
			'Garde les lignes plus longtemps que la fenêtre de retry du prestataire, sinon un retry tardif passe à travers.'
		]
	},
	quiz: [
		{
			q: 'Un appel pour débiter une carte part en timeout. Que sais-tu du débit ?',
			options: ['Rien : il a peut-être eu lieu, peut-être pas, donc un retry doit être sûr dans les deux cas', 'Il a échoué, donc réessayer est sans risque', 'Il a réussi, la réponse était juste lente', 'Il sera annulé par le serveur'],
			answer: 0,
			why: 'Un timeout ne fait que libérer l’appelant. Le travail a pu être fait, à moitié fait ou jamais commencé. C’est pour ça que le retry doit être idempotent.'
		},
		{
			q: 'Pourquoi Mastodon ajoute-t-il une durée aléatoire à chaque délai de retry d’un job de livraison ?',
			options: ['Pour rendre les tests moins prévisibles', 'Parce que les timers de Redis ne sont pas précis', 'Pour que les livraisons qui ont échoué au même moment ne réessaient pas toutes au même moment', 'Pour que le délai grandisse après chaque échec'],
			answer: 2,
			why: 'C’est le jitter. La croissance, c’est le backoff. L’aléatoire disperse la foule, donc un serveur qui redémarre n’est pas frappé par des vagues synchronisées.'
		},
		{
			q: 'Un client envoie un nouveau post avec `Idempotency-Key: k1`, part en timeout, et le renvoie avec `k1` dix minutes plus tard. Que fait Mastodon ?',
			options: ['Il crée un deuxième post, puisque la première requête a expiré', 'Il rejette le retry avec une erreur 409', 'Il met le retry en attente jusqu’à la fin de la première requête', 'Il renvoie le post créé par la première requête'],
			answer: 3,
			why: 'La première requête a stocké l’id du post sous la clé pendant une heure. Le retry le trouve et récupère le même post, sans deuxième enregistrement ni deuxième livraison.'
		}
	],
	takeaway: 'Chaque retry suppose que le travail peut être fait deux fois. Rends-le d’abord idempotent, puis ajoute des timeouts, du backoff avec jitter, et une limite au nombre de retries.',
	sources: [
		{ title: 'Mastodon API docs, Post a new status (Idempotency-Key)', url: 'https://docs.joinmastodon.org/methods/statuses/' },
		{ title: 'Mastodon, post_status_service.rb, with_idempotency', url: `${PSS}#L226-L256` },
		{ title: 'Sidekiq 8.1.7, job_retry.rb, default delay and jitter', url: `${SIDEKIQ}/lib/sidekiq/job_retry.rb#L200-L248` },
		{ title: 'Marc Brooker, Timeouts, retries, and backoff with jitter (Amazon Builders\' Library)', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
		{ title: 'Stripe API reference, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' }
	]
};
