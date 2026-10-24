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
		'Tu es dans le train, et tu appuies sur Publier dans ton appli Mastodon. Le spinner tourne, le réseau coupe, et au bout d’un moment l’appli abandonne.',
		'Maintenant, la question difficile : **le post est-il passé ?** Peut-être que la requête n’est jamais arrivée. Peut-être que le serveur l’a enregistré et que la réponse s’est perdue. Depuis le téléphone, les deux cas se ressemblent exactement.',
		'Alors l’appli va réessayer. Un retry n’est sûr que si faire le travail deux fois donne le même résultat que le faire une fois. Cette propriété a un nom, l’**idempotence**, et sans elle chaque retry risque de créer une deuxième copie de ton post.'
	],
	terms: [
		{ term: 'Timeout', def: 'Le temps que tu attends avant d’abandonner. Il te libère. Il ne te dit rien de ce qui s’est passé de l’autre côté.' },
		{ term: 'Retry avec backoff', def: 'Réessayer en attendant plus longtemps après chaque échec, pour laisser au service en difficulté le temps de récupérer. Le jitter ajoute un peu d’aléatoire à chaque attente, pour que mille clients qui ont échoué ensemble ne réessaient pas tous dans la même seconde.' },
		{ term: 'Idempotent', def: 'Le faire deux fois a le même effet que le faire une fois. Passer deux fois un statut à supprimé le laisse supprimé. Ajouter deux fois 10 € à un solde ajoute 20 €.' },
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
				note: 'Première requête : enregistrer le post, puis stocker son id sous la clé pendant une heure. Un retry avec la même clé trouve l’id et récupère **le même post**. Pas de deuxième copie, et pas de deuxième livraison.'
			},
			{
				add: ['deliv["DeliveryWorker"] -->|"connexion 5 s, chaque lecture 10 s, toutes les lectures 30 s"| remote["Inbox du serveur distant"]', 'class remote ext'],
				highlight: ['deliv', 'remote'],
				note: 'La classe `Request` de Mastodon donne **un timeout à chaque appel sortant** : elle passe les mêmes réglages [`TIMEOUT`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/request.rb#L83-L86) à chaque requête qu’elle fait. Sans eux, un seul serveur bloqué pourrait garder un worker très longtemps.'
			},
			{
				add: ['deliv -->|"échec : attendre count⁴ + 15 s + jitter"| retry["Retry set de Sidekiq"]', 'retry -->|"réessayer"| deliv'],
				highlight: ['retry'],
				note: 'L’attente de base de Sidekiq croît avec la puissance quatre du nombre de retries, et Mastodon ajoute son propre jitter par-dessus. Les retries ne servent qu’aux échecs qui peuvent disparaître d’eux-mêmes : **la plupart des réponses 4xx ne sont pas relancées du tout**.'
			},
			{
				add: ['remote --> create["Côté distant : verrou sur l’URI du post, on passe s’il existe"]'],
				highlight: ['create'],
				note: 'Le serveur destinataire gère lui aussi une répétition sans risque. Une livraison relancée alors qu’elle avait en fait réussi trouve le post par son URI et **ne le crée pas une deuxième fois**.'
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
			'Ici, Mastodon se souvient de ce qu’il a fait. La ligne 2 limite la clé au compte : deux utilisateurs ne peuvent pas entrer en collision. Sur un doublon, la ligne 13 lève `IdempotencyError` avec l’ancien post, et [`call` renvoie ce post](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/services/post_status_service.rb#L60-L78) sans mettre de nouveaux jobs en file.',
			'La ligne 12 prend un verrou. Sans lui, deux copies de la requête au même moment rateraient toutes les deux la clé et enregistreraient toutes les deux. Avec le verrou, la seconde reçoit un [503 « réessaie »](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/controllers/concerns/api/error_handling.rb#L40-L42) et son retry trouve la clé.',
			'Le serveur destinataire ignore ce qui existe déjà. Il [prend un verrou sur l’URI du post et cherche un statut existant](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/activitypub/activity/create.rb#L30-L38) avant d’en créer un : l’URI du post sert de clé d’idempotence.',
			'Quels échecs sont relancés : [`response_error_unsalvageable?`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/helpers/json_ld_helper.rb#L377-L379) est vrai pour 501 et pour les 4xx sauf 401, 408 et 429. Ces jobs se terminent sans retry. Les timeouts et les 5xx lèvent une erreur et sont relancés avec le jitter de Mastodon (`DeliveryWorker`, dans les sources).'
		]
	},
	tradeoff: {
		gain: [
			'Avec un timeout, un serveur bloqué renvoie une erreur au lieu de garder le worker, et le worker passe au job suivant.',
			'Les retries couvrent les pannes courtes : un redémarrage, une coupure réseau, un déploiement. Le backoff et le jitter étalent les retries, pour qu’un serveur qui redémarre ne les reçoive pas tous dans la même seconde.',
			'Avec des handlers idempotents des deux côtés, une livraison reçue deux fois ne crée qu’un seul post. L’expéditeur peut alors livrer « au moins une fois », sans viser le « exactement une fois », plus difficile.'
		],
		cost: [
			'Un timeout n’annule pas le travail, et l’autre côté peut encore le terminer. Prévois le cas où le travail a eu lieu sans que tu reçoives la réponse.',
			'Dans l’exemple de l’Amazon Builders’ Library, cinq couches qui essaient chacune trois fois mettent **243 fois** la charge sur la base de données. Leur conseil pour les appels peu coûteux : réessayer à un seul endroit de la stack.',
			'Une clé d’idempotence a besoin de stockage, d’un verrou et d’une expiration. La clé de Mastodon vit une heure : un retry après ce délai crée un deuxième post. Si le processus meurt après l’enregistrement mais avant l’écriture de la clé, un retry crée aussi un doublon.'
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
		],
		steps: [
			{
				title: 'Vois pourquoi il y en a deux',
				questions: [
					{ q: 'Ton endpoint est lent, et l’appel du prestataire part en timeout. Que sait le prestataire de ton handler ?', options: ['Qu’il a échoué, donc un retry est sans risque', 'Qu’il a réussi, donc il peut s’arrêter', 'Rien : il a peut-être tourné, peut-être pas, donc il réessaie', 'Que ton serveur a annulé le travail'], answer: 2, why: 'Un timeout ne fait que libérer l’appelant. Il ne dit rien de ce qui s’est passé de ton côté.' },
					{ q: 'Pourquoi le retry envoie-t-il un deuxième e-mail ?', options: ['Le prestataire envoie exprès deux événements différents', 'Le handler n’est pas idempotent : le lancer deux fois envoie deux fois', 'Le serveur mail copie chaque e-mail', 'Le timeout a annulé le premier e-mail'], answer: 1, why: 'Idempotent veut dire que deux fois a le même effet qu’une fois. Envoyer un e-mail ne l’est pas.' },
					{ q: 'Quelle partie du handler n’est pas sûre à répéter ?', options: ['Lire le corps du webhook', 'Logger la requête', 'Envoyer l’e-mail', 'Répondre 200'], answer: 2, why: 'Lire et logger ne changent rien pour le client. L’e-mail est l’effet qu’il voit deux fois.' },
					{ q: 'Le prestataire réessaie jusqu’à ce que tu répondes à temps. Quelle promesse de livraison est-ce ?', options: ['Exactement une fois', 'Au plus une fois', 'Une fois par heure', 'Au moins une fois'], answer: 3, why: 'Avec des retries, un appel peut arriver plus d’une fois. Le destinataire doit rendre la répétition sans effet.' }
				]
			},
			{
				title: 'Choisis la clé',
				questions: [
					{ q: 'Quelle valeur fait une bonne clé d’idempotence ici ?', options: ['L’id d’événement du prestataire, ou l’id du paiement', 'Un id aléatoire que tu génères à la réception', 'L’heure d’arrivée du webhook', 'L’adresse e-mail du client'], answer: 0, why: 'Chaque retry la répète, donc le deuxième appel porte la même clé que le premier.' },
					{ q: 'Pourquoi pas un id aléatoire généré à la réception ?', options: ['Les id aléatoires sont trop longs pour une colonne', 'Chaque retry en aurait un nouveau, donc aucune répétition ne serait repérée', 'Le prestataire le refuserait', 'Il ferait fuiter les données du client'], answer: 1, why: 'La clé doit être la même à chaque retry d’un événement. Un nouvel id aléatoire ne correspond jamais.' },
					{ q: 'Pourquoi ne pas prendre l’adresse e-mail du client comme clé ?', options: ['Les adresses e-mail sont trop longues à indexer', 'Les adresses e-mail changent de casse', 'Un client peut payer deux fois, et chaque paiement est un événement à part', 'Le prestataire ne l’envoie pas'], answer: 2, why: 'La clé doit désigner un événement, pas une personne. Sinon, un vrai deuxième paiement n’aurait pas d’e-mail.' },
					{ q: 'Dans Mastodon, qui choisit l’`Idempotency-Key` d’un nouveau post ?', options: ['Le serveur, quand il enregistre le post', 'Redis, quand le verrou est pris', 'Sidekiq, quand le job est mis en file', 'Le client, une fois par post, renvoyée à chaque retry'], answer: 3, why: 'La doc de l’API conseille un hash ou un UUID généré côté client, gardé pour chaque retry de ce post.' }
				]
			},
			{
				title: 'Stocke-la',
				questions: [
					{ q: 'Qu’est-ce que tu stockes ?', options: ['Le texte complet de chaque e-mail envoyé', 'Une ligne comme `(event_id, processed_at)` avec une **contrainte d’unicité**', 'Un compteur de retries par client', 'Rien : le prestataire s’en souvient pour toi'], answer: 1, why: 'Tu ne peux pas demander au serveur mail ce qu’il a envoyé, donc tu t’en souviens toi-même, une ligne par événement.' },
					{ q: 'Tu insères d’abord, ou tu vérifies d’abord ?', options: ['Insère d’abord, et laisse la contrainte d’unicité rejeter une répétition', 'Vérifie avec un `SELECT`, puis insère', 'Envoie l’e-mail, puis insère', 'Insère une fois par jour, par lot'], answer: 0, why: 'Deux copies au même moment passeraient toutes les deux un `SELECT`. La contrainte ne laisse gagner qu’une seule insertion.' },
					{ q: 'L’insertion échoue parce que c’est un doublon. Que réponds-tu ?', options: ['500, pour que le prestataire réessaie', '409, comme une erreur', '200, et ne fais rien', '202, et renvoie l’e-mail'], answer: 2, why: 'L’événement a déjà été traité. Un 200 arrête les retries, et rien d’autre ne doit se passer.' },
					{ q: 'Mastodon prend un verrou autour de la recherche de sa clé. Pourquoi ?', options: ['Redis a besoin d’un verrou pour lire une clé', 'Pour ralentir les retries exprès', 'Pour faire expirer la clé', 'Deux copies au même moment rateraient toutes les deux la clé et enregistreraient toutes les deux'], answer: 3, why: 'C’est la même course que ferme ta contrainte d’unicité. Avec le verrou, la seconde copie reçoit un 503 et son retry trouve la clé.' }
				]
			},
			{
				title: 'Bouche les trous',
				questions: [
					{ q: 'Le handler est lent parce qu’il envoie l’e-mail lui-même. Que changes-tu ?', options: ['Augmente le timeout du prestataire', 'Relance l’e-mail trois fois dans la requête', 'Réponds vite, et envoie l’e-mail depuis un job', 'Demande au prestataire d’arrêter les retries'], answer: 2, why: 'C’est justement un endpoint lent qui déclenche les retries du prestataire.' },
					{ q: 'Tu insères, puis tu envoies. Le processus plante entre les deux. Que se passe-t-il ?', options: ['L’e-mail part deux fois', 'Un e-mail est perdu', 'La ligne est annulée', 'Le prestataire envoie un nouvel id d’événement'], answer: 1, why: 'La ligne dit « fait », donc le retry passe son tour. Décide ce qui est le pire pour toi : un e-mail manquant ou un doublon.' },
					{ q: 'Combien de temps gardes-tu les lignes ?', options: ['Plus longtemps que la fenêtre de retry du prestataire', 'Une heure, comme Mastodon', 'Jusqu’à l’envoi de l’e-mail', 'Seulement pendant la requête en cours'], answer: 0, why: 'Un retry qui arrive après la disparition de la ligne est traité comme nouveau, et renvoie l’e-mail.' },
					{ q: 'La clé de Mastodon vit une heure. Un client réessaie un post au bout de deux heures. Que se passe-t-il ?', options: ['Il récupère le même post', 'Il reçoit un 503', 'Il est rejeté avec un 409', 'Il crée un deuxième post'], answer: 3, why: 'La clé est stockée 3 600 secondes. Après ça, rien ne se souvient de la première requête.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un appel pour débiter une carte part en timeout. Que sais-tu du débit ?',
			options: ['Rien : il a peut-être eu lieu, peut-être pas, donc un retry doit être sûr', 'Il a échoué : aucune réponse n’est revenue, donc réessayer est sans risque', 'Il a réussi : le serveur l’a reçu, la réponse était juste lente à venir', 'Il a été annulé : un serveur défait le travail quand l’appelant expire'],
			answer: 0,
			why: 'Un timeout ne fait que libérer l’appelant. Le travail a pu être fait, à moitié fait ou jamais commencé. Le retry du débit doit être idempotent, sinon la carte risque d’être débitée deux fois.'
		},
		{
			q: 'Pourquoi Mastodon ajoute-t-il une durée aléatoire à chaque délai de retry d’un job de livraison ?',
			options: ['Pour rendre les tests de livraison moins prévisibles et trouver des bugs de timing', 'Parce que les timers de Redis ne sont pas précis, donc chaque délai est arrondi au hasard', 'Pour que les livraisons qui ont échoué ensemble ne réessaient pas toutes à la même seconde', 'Pour que le délai grandisse après chaque échec, et laisse le serveur distant se remettre'],
			answer: 2,
			why: 'La durée aléatoire s’appelle le jitter, et le délai qui grandit s’appelle le backoff. Le jitter étale dans le temps les livraisons qui ont échoué ensemble : un serveur qui redémarre ne les reçoit pas toutes dans la même seconde.'
		},
		{
			q: 'Un client envoie un nouveau post avec `Idempotency-Key: k1`, part en timeout, et le renvoie avec `k1` dix minutes plus tard. Que fait Mastodon ?',
			options: ['Il crée un deuxième post, puisque la première requête a expiré', 'Il rejette le retry avec une erreur 409', 'Il met le retry en attente jusqu’à la fin de la première requête', 'Il renvoie le post créé par la première requête'],
			answer: 3,
			why: 'La première requête a stocké l’id du post sous la clé pendant une heure. Le retry le trouve et récupère le même post, sans deuxième enregistrement ni deuxième livraison.'
		}
	],
	recall: {
		q: 'Un client Mastodon relance un post avec la même `Idempotency-Key`. Comment le serveur évite-t-il un deuxième post, et pendant combien de temps ?',
		a: 'Sous un verrou Redis, il trouve la clé et renvoie l’id du post stocké sous elle. La clé vit 3 600 secondes : un retry après une heure crée un deuxième post.'
	},
	sources: [
		{ title: 'Mastodon API docs, Post a new status (Idempotency-Key)', url: 'https://docs.joinmastodon.org/methods/statuses/' },
		{ title: 'Mastodon, post_status_service.rb, with_idempotency', url: `${PSS}#L226-L256` },
		{ title: 'Sidekiq 8.1.7, job_retry.rb, default delay and jitter', url: `${SIDEKIQ}/lib/sidekiq/job_retry.rb#L200-L248` },
		{ title: 'Mastodon, activitypub/delivery_worker.rb, retry jitter', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L13-L21` },
		{ title: 'Marc Brooker, Timeouts, retries, and backoff with jitter (Amazon Builders\' Library)', url: 'https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/' },
		{ title: 'Stripe API reference, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' }
	]
};
