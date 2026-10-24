const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const SIDEKIQ = 'https://github.com/sidekiq/sidekiq/blob/1bb4aa06e5aa178a114a5e855f9f3d5c24f6c61b';
const PSS = `${REPO}/app/services/post_status_service.rb`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'sync-vs-async',
	part: 'Entre les services',
	title: 'Appels synchrones ou jobs asynchrones',
	minutes: 10,
	hook: [
		'Tu publies sur Mastodon. Tes abonnés vivent sur 2 000 autres serveurs, et chacun doit recevoir ton post. Si ton serveur appelait les 2 000 **pendant ta requête**, tu fixerais un spinner pendant des minutes, et un seul serveur lent bloquerait tout le monde.',
		'Alors Mastodon découpe le travail. Ta requête enregistre le post et **met un job en file**. Des workers livrent ensuite à chaque serveur, un job par inbox.',
		'La question de conception : **que doit savoir l’appelant avant que tu répondes ?** Le reste peut tourner plus tard, dans un job. Un job garde la requête courte, mais ses erreurs ne reviennent plus à l’appelant.'
	],
	terms: [
		{ term: 'Appel synchrone', def: 'L’appelant attend la réponse. Il obtient le résultat, ou l’erreur, tout de suite.' },
		{ term: 'Job asynchrone', def: 'L’appelant reçoit une réponse avant que le travail soit fait. Le travail tourne plus tard, depuis une file comme celles de Sidekiq dans Redis, et ses erreurs arrivent par un autre chemin, ou pas du tout.' },
		{ term: 'Fan-out', def: 'Transformer un job en plusieurs : ici, un job de livraison par inbox distante au lieu d’un seul pour tout le post.' },
		{ term: 'Dead set', def: 'L’endroit où Sidekiq garde un job après son dernier retry raté, pour qu’une personne puisse l’examiner. Un job peut refuser ce mécanisme et être jeté à la place.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you(["Tu cliques sur Publier"]) -->|"POST /api/v1/statuses, attend"| pss["PostStatusService"]', 'pss -->|"save!"| db[("PostgreSQL")]'],
				highlight: ['you', 'pss', 'db'],
				note: 'Ta requête vérifie les médias, les mentions et les règles anti-spam, puis enregistre le post. Tu peux corriger ces erreurs tout de suite : elles reviennent donc dans la réponse, avec le post enregistré.'
			},
			{
				add: ['pss -->|"perform_async(status.id)"| q["Files Sidekiq dans Redis"]', 'class q ext'],
				highlight: ['q'],
				note: 'Le service met ensuite en file des jobs qui ne portent que l’id du post : un pour les timelines locales, un pour les serveurs distants, un pour récupérer les aperçus de liens. Puis ta requête se termine et tu reçois la réponse.'
			},
			{
				add: ['q --> dist["ActivityPub::DistributionWorker"]', 'dist -->|"push_bulk : un job par inbox"| q'],
				highlight: ['dist'],
				note: 'Le worker de distribution fait le fan-out. Il trouve chaque inbox qui doit recevoir le post, et met en file un job `DeliveryWorker` **par inbox**, dans le même Redis.'
			},
			{
				add: ['q --> deliv["ActivityPub::DeliveryWorker"]', 'deliv -->|"POST signé"| inbox["Inbox du serveur distant"]', 'class inbox ext'],
				highlight: ['deliv', 'inbox'],
				note: 'Chaque job de livraison envoie un seul POST HTTP signé à un seul serveur. Un succès efface le compteur d’échecs de ce serveur.'
			},
			{
				add: ['deliv -.->|"erreur : retry, jusqu’à 16 fois"| q', 'deliv -.->|"échecs sur 7 jours différents"| un["UnavailableDomain"]'],
				highlight: ['un'],
				note: 'Sidekiq relance une livraison ratée **pour ce seul serveur**. Après le dernier retry, le job est jeté, parce qu’il définit `dead: false`. Un serveur qui échoue sur 7 jours différents est marqué indisponible et ignoré, et personne ne prévient l’auteur.'
			}
		]
	},
	example: {
		title: 'app/services/post_status_service.rb, postprocess_status!',
		repo: 'mastodon/mastodon',
		url: `${PSS}#L172-L181`,
		lang: 'ruby',
		code: `  def postprocess_status!
    process_hashtags_service.call(@status)
    Trends.tags.register(@status)
    LinkCrawlWorker.perform_async(@status.id)
    DistributionWorker.perform_async(@status.id)
    process_email_subscriptions!
    ActivityPub::DistributionWorker.perform_async(@status.id)
    PollExpirationNotifyWorker.perform_at(@status.poll.expires_at, @status.poll.id) if @status.poll
    ActivityPub::QuoteRequestWorker.perform_async(@status.quote.id) if @status.quote&.quoted_status.present? && !@status.quote&.quoted_status&.local?
  end`,
		notes: [
			'Lis l’ordre dans [`call`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/services/post_status_service.rb#L51-L78) : d’abord enregistrer, puis `postprocess_status!`. La ligne 2 traite les hashtags dans la requête. Les lignes 4, 5 et 7 mettent en file les jobs des aperçus de liens, des timelines et de la livraison.',
			'Le fan-out tient en trois lignes : [`RawDistributionWorker#distribute!`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/raw_distribution_worker.rb#L25-L31) appelle `DeliveryWorker.push_bulk(inboxes, limit: 1_000)`, avec un jeu d’arguments par `inbox_url`.',
			'[`DeliveryWorker`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/delivery_worker.rb#L11-L21) définit `retry: 16, dead: false`. Dans `job_retry.rb` de Sidekiq (dans les sources), `dead == false` veut dire jeté : le job n’arrive jamais dans le dead set.',
			'La règle « on laisse tomber ce serveur », c’est [`DeliveryFailureTracker`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/delivery_failure_tracker.rb#L6-L24) : il stocke une entrée par jour d’échec et crée un `UnavailableDomain` à 7.'
		]
	},
	tradeoff: {
		gain: [
			'La requête de l’auteur n’attend que son propre serveur. Avec les serveurs de 2 000 abonnés, elle dure à peu près autant qu’avec 20.',
			'Un serveur en panne relance son propre job de livraison, pendant que les autres serveurs ont déjà le post.',
			'Les workers piochent dans des files pondérées (`push` a un poids de 6 dans `sidekiq.yml`), et une rafale de jobs attend dans Redis au lieu de ralentir l’API.'
		],
		cost: [
			'Personne ne dit à l’auteur qu’un serveur n’a jamais reçu le post. Avec `dead: false`, le job est supprimé après environ deux jours et demi de retries.',
			'Les abonnés des autres serveurs voient le post plus tard que les abonnés locaux. Un serveur qui était en panne le voit avec des heures ou des jours de retard.',
			'Le post est enregistré dans PostgreSQL, puis le job est poussé dans Redis, sans transaction autour des deux. Si le processus meurt entre les deux écritures, le post existe et rien dans ce chemin de code ne le livre.'
		]
	},
	task: {
		prompt: 'Sur ta plateforme vidéo, la requête d’envoi transcode la vidéo en quatre résolutions avant de répondre. Ça prend deux minutes et ça part souvent en timeout. Découpe-la : qu’est-ce qui reste synchrone, qu’est-ce qui passe dans un job, comment l’utilisateur apprend-il le résultat, et où atterrissent les échecs ?',
		hint: 'Demande-toi : quelles erreurs l’utilisateur peut-il corriger tout de suite, et qu’est-ce qui doit exister avant que tu puisses dire « accepté » ?',
		answer: [
			'Synchrone : ce que l’utilisateur peut corriger maintenant. Le type et la taille du fichier, son quota, le titre. Ensuite, stocke le fichier original et enregistre une ligne vidéo avec le statut `processing`.',
			'Réponds **202 Accepted** avec l’id de la vidéo. L’envoi est maintenant à l’abri, même si tous les workers sont en panne.',
			'Les jobs : un job de transcodage par résolution (fan-out), pour qu’un job 4K raté ne refasse pas le 480p.',
			'Le résultat arrive à l’utilisateur par un autre chemin : la page de la vidéo interroge le statut régulièrement, ou une notification dit « ta vidéo est prête ».',
			'Les échecs : retry avec une limite, puis garde le job dans un dead set **et** passe la vidéo en `failed`, pour que l’utilisateur le voie. Le pire résultat : un job jeté et une ligne bloquée en `processing` pour toujours.'
		],
		steps: [
			{
				title: 'Garde ce que l’utilisateur peut corriger',
				questions: [
					{ q: 'Quelle vérification reste dans la requête d’envoi ?', options: ['Le transcodage en 480p', 'Le type et la taille du fichier', 'Le transcodage en 4K', 'L’envoi de la notification « prête »'], answer: 1, why: 'L’utilisateur peut corriger un mauvais fichier tout de suite, donc cette erreur a sa place dans la réponse.' },
					{ q: 'Pourquoi la vérification du quota reste-t-elle synchrone ?', options: ['C’est l’étape la plus lente', 'Les workers ne savent pas lire les quotas', 'Les jobs n’ont pas le droit d’échouer', 'L’utilisateur peut agir dessus maintenant, donc l’erreur doit revenir dans la réponse'], answer: 3, why: 'Demande-toi ce que l’appelant doit savoir avant ta réponse. Un quota plein en fait partie.' },
					{ q: 'Qu’est-ce qui doit exister avant que tu puisses dire « accepté » ?', options: ['Le fichier 4K', 'Les quatre résolutions', 'L’original stocké et une ligne vidéo avec le statut `processing`', 'Une notification envoyée à l’utilisateur'], answer: 2, why: 'Une fois l’original stocké et la ligne enregistrée, l’envoi est à l’abri, même si tous les workers sont en panne.' },
					{ q: 'Que répond la requête ?', options: ['**202 Accepted** avec l’id de la vidéo', '200 OK avec les quatre URL de la vidéo', '500 quand un worker est en panne', 'Rien tant que le transcodage n’est pas fini'], answer: 0, why: '202 dit que le travail est accepté mais pas fait. L’id permet à l’utilisateur de retrouver le résultat plus tard.' }
				]
			},
			{
				title: 'Déplace le travail lent',
				questions: [
					{ q: 'Combien de jobs de transcodage mets-tu en file par vidéo ?', options: ['Un seul job pour les quatre résolutions', 'Un par résolution, quatre en tout', 'Un par spectateur de la vidéo', 'Aucun : transcode dans la requête'], answer: 1, why: 'C’est un fan-out, comme le job de livraison par inbox de Mastodon.' },
					{ q: 'Pourquoi un job par résolution ?', options: ['Parce que Redis ne peut pas stocker de gros jobs', 'Pour que les résolutions finissent dans l’ordre', 'Pour qu’un job 4K raté ne refasse pas le 480p', 'Parce que chaque job a besoin de son propre serveur'], answer: 2, why: 'Sidekiq relance un job raté en entier. Des petits jobs ne relancent que ce qui a échoué.' },
					{ q: 'Que met Mastodon dans les jobs qu’il met en file après un post ?', options: ['Tout le post et ses médias', 'La liste des abonnés', 'La réponse envoyée à l’auteur', 'Seulement l’id du post'], answer: 3, why: '`perform_async(@status.id)` : le job va chercher le reste quand il tourne.' },
					{ q: 'Tous les workers sont en panne quand l’utilisateur envoie sa vidéo. L’envoi est-il perdu ?', options: ['Oui, les jobs échouent tout de suite', 'Non, l’original et la ligne sont enregistrés avant la réponse', 'Oui, sauf si le navigateur réessaie', 'Non, parce que le navigateur garde une copie'], answer: 1, why: 'Les jobs attendent dans la file. C’est l’original enregistré qui rend « accepté » vrai.' }
				]
			},
			{
				title: 'Préviens l’utilisateur',
				questions: [
					{ q: 'L’utilisateur ferme son navigateur juste après le 202. Le transcodage s’arrête-t-il ?', options: ['Non : les jobs tournent sur les workers, quoi que fasse le navigateur', 'Oui : fermer l’onglet annule la requête', 'Oui, sauf si la page continue d’interroger le statut', 'Seul le job 4K s’arrête'], answer: 0, why: 'Le travail a quitté la requête au moment de la mise en file. Le résultat attend dans la ligne vidéo jusqu’à ce que l’utilisateur revienne.' },
					{ q: 'Comment l’utilisateur apprend-il que la vidéo est prête ?', options: ['La requête d’envoi reste ouverte jusqu’à la fin', 'L’utilisateur la renvoie pour vérifier', 'La page de la vidéo interroge le statut, ou une notification dit qu’elle est prête', 'L’utilisateur lit la file dans Redis'], answer: 2, why: 'La ligne vidéo porte le statut. La page peut le lire, ou une notification peut le pousser.' },
					{ q: 'Que montre la page de la vidéo pendant que les jobs tournent ?', options: ['`failed`', '`processing`', 'Un lecteur vide', 'Une page 404'], answer: 1, why: 'La requête a enregistré la ligne avec le statut `processing`. Les jobs le changent quand ils finissent.' },
					{ q: 'Mastodon ne prévient personne quand une livraison est jetée. Pourquoi ça ne suffit pas ici ?', options: ['Les vidéos sont plus grosses que les posts', 'Sidekiq l’interdit pour les jobs vidéo', 'L’interrogation du statut ne marche qu’avec un dead set', 'L’utilisateur attend un résultat, et un abandon silencieux le laisse attendre pour toujours'], answer: 3, why: 'Pour un post vers un serveur, Mastodon accepte la perte. Ici, le résultat, c’est la vidéo de l’utilisateur.' }
				]
			},
			{
				title: 'Fais atterrir les échecs',
				questions: [
					{ q: 'Un job de transcodage échoue. Que se passe-t-il d’abord ?', options: ['Il est relancé pour toujours', 'Il est relancé, avec une limite', 'Il est jeté tout de suite', 'La requête d’envoi échoue'], answer: 1, why: 'Un retry corrige une erreur passagère. Une limite empêche un job cassé de tourner en boucle.' },
					{ q: 'Après le dernier retry, où va le job ?', options: ['Dans un dead set, et la vidéo passe en `failed`', 'Jeté, avec `dead: false`', 'Au début de la file', 'Seulement dans le log de la requête'], answer: 0, why: 'Le dead set le garde pour une personne, et `failed` permet à l’utilisateur de le voir.' },
					{ q: 'La requête enregistre la ligne vidéo, puis pousse les quatre jobs dans Redis, sans transaction autour des deux. Le processus meurt entre les deux. Que reste-t-il ?', options: ['Rien : PostgreSQL annule la ligne', 'Quatre jobs et aucune ligne', 'Une ligne en `processing` et aucun job pour la transcoder', 'Une ligne en `failed`'], answer: 2, why: 'Deux écritures dans deux stockages, et seule la première a eu lieu. Mastodon a le même trou entre l’enregistrement d’un post et la mise en file de ses jobs.' },
					{ q: 'Quel est le pire résultat ?', options: ['Un job 4K relancé deux fois', 'Un utilisateur qui voit `failed`', 'Une réponse 202 à l’envoi', 'Un job jeté et une ligne bloquée en `processing` pour toujours'], answer: 3, why: 'Personne ne sait que le travail s’est arrêté, et l’utilisateur attend pour rien.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui est vrai d’un job asynchrone, comparé à un appel synchrone ?',
			options: ['L’appelant reçoit une réponse avant la fin du travail, et les erreurs doivent atteindre quelqu’un par un autre chemin', 'L’appelant reçoit toujours le résultat final dans la réponse, juste un peu plus tard que d’habitude', 'C’est toujours plus rapide du début à la fin, puisque le travail tourne en arrière-plan', 'Il ne peut pas échouer, puisque la file garde le job jusqu’à ce qu’un worker le termine'],
			answer: 0,
			why: 'Un job asynchrone tourne après l’envoi de la réponse. L’appelant est libéré plus tôt, mais les erreurs ne reviennent plus dans la réponse, donc tu dois décider où elles atterrissent.'
		},
		{
			q: 'Pourquoi Mastodon met-il en file un job de livraison par inbox, au lieu d’un seul job qui boucle sur toutes les inbox ?',
			options: ['Redis ne peut pas stocker un seul job qui porte une longue liste d’inbox', 'Pour que les posts arrivent sur chaque serveur dans l’ordre où ils ont été écrits', 'Pour qu’un serveur en échec soit relancé tout seul, sans rejouer ni bloquer la livraison aux autres', 'Parce que les signatures HTTP ne marchent que si chaque requête tourne dans son propre job'],
			answer: 2,
			why: 'Sidekiq relance un job raté en entier. Avec une inbox par job, un serveur mort ne relance que sa propre livraison, et beaucoup de workers peuvent livrer en parallèle.'
		},
		{
			q: '`ActivityPub::DeliveryWorker` définit `retry: 16, dead: false`. Que se passe-t-il quand le dernier retry échoue ?',
			options: ['Le job part dans le dead set pour qu’un admin le relance', 'Le job est jeté, et l’auteur n’est pas prévenu', 'Le post est supprimé du serveur de l’auteur', 'Sidekiq relance à l’infini avec un délai plus long'],
			answer: 1,
			why: 'Avec `dead: false`, Sidekiq marque le job comme jeté au lieu de l’envoyer dans le dead set. Pour un post vers un serveur, Mastodon accepte cette perte.'
		}
	],
	recall: {
		q: 'Quand tu publies sur Mastodon, qu’est-ce qui tourne dans ta requête, et qu’arrive-t-il à une livraison qui échoue sans cesse ?',
		a: 'La requête vérifie et enregistre le post, traite les hashtags et met des jobs en file. Sidekiq relance un job de livraison 16 fois, puis le jette à cause de `dead: false`, et personne ne prévient l’auteur.'
	},
	sources: [
		{ title: 'Mastodon, app/services/post_status_service.rb', url: `${PSS}#L51-L78` },
		{ title: 'Mastodon, app/workers/activitypub/raw_distribution_worker.rb', url: `${REPO}/app/workers/activitypub/raw_distribution_worker.rb#L25-L31` },
		{ title: 'Mastodon, app/workers/activitypub/delivery_worker.rb', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L11-L45` },
		{ title: 'Sidekiq 8.1.7, lib/sidekiq/job_retry.rb, retries exhausted', url: `${SIDEKIQ}/lib/sidekiq/job_retry.rb#L250-L273` },
		{ title: 'Sidekiq wiki, Error Handling', url: 'https://github.com/sidekiq/sidekiq/wiki/Error-Handling' }
	]
};
