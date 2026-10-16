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
		'Ce découpage, c’est la décision du jour : **qu’est-ce que l’appelant doit savoir avant que tu répondes, et qu’est-ce qui peut se faire plus tard ?** Tout ce que tu déplaces vers « plus tard » devient plus simple à faire tourner et plus difficile à comprendre.'
	],
	terms: [
		{ term: 'Appel synchrone', def: 'L’appelant attend la réponse. Il obtient le résultat, ou l’erreur, tout de suite.' },
		{ term: 'Job asynchrone', def: 'L’appelant reçoit une réponse avant que le travail soit fait. Le travail tourne plus tard, ailleurs, et ses erreurs arrivent par un autre chemin, ou pas du tout.' },
		{ term: 'File de jobs', def: 'Une liste de jobs qui attendent un worker. Ici : des files Sidekiq stockées dans Redis.' },
		{ term: 'Fan-out', def: 'Transformer un job en plusieurs : ici, un job de livraison par inbox distante au lieu d’un seul pour tout le post.' },
		{ term: 'Dead set', def: 'L’endroit où Sidekiq garde un job après son dernier retry raté, pour qu’une personne puisse l’examiner. Un job peut refuser ce mécanisme et être jeté à la place.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you(["Tu cliques sur Publier"]) -->|"POST /api/v1/statuses, attend"| pss["PostStatusService"]', 'pss -->|"save!"| db[("PostgreSQL")]'],
				highlight: ['you', 'pss', 'db'],
				note: '**La partie synchrone.** Vérifier les médias, les mentions et les règles anti-spam, puis enregistrer. Ce sont les erreurs sur lesquelles tu peux agir tout de suite, donc elles reviennent dans la réponse. La réponse, c’est ton post enregistré.'
			},
			{
				add: ['pss -->|"perform_async(status.id)"| q["Files Sidekiq dans Redis"]', 'class q ext'],
				highlight: ['q'],
				note: '**Le passage de relais.** Le service met en file des jobs qui ne portent que l’id du post : un pour les timelines locales, un pour les serveurs distants, un pour récupérer les aperçus de liens. Ta requête est terminée.'
			},
			{
				add: ['q --> dist["ActivityPub::DistributionWorker"]', 'dist -->|"push_bulk : un job par inbox"| q'],
				highlight: ['dist'],
				note: '**Fan-out.** Le worker de distribution trouve chaque inbox qui doit recevoir le post. Il met en file un job `DeliveryWorker` **par inbox**, dans le même Redis.'
			},
			{
				add: ['q --> deliv["ActivityPub::DeliveryWorker"]', 'deliv -->|"POST signé"| inbox["Inbox du serveur distant"]', 'class inbox ext'],
				highlight: ['deliv', 'inbox'],
				note: '**Un job, un serveur.** Le worker envoie un seul POST HTTP signé. Un succès efface le compteur d’échecs de ce serveur.'
			},
			{
				add: ['deliv -.->|"erreur : retry, jusqu’à 16 fois"| q', 'deliv -.->|"échecs sur 7 jours différents"| un["UnavailableDomain"]'],
				highlight: ['un'],
				note: 'Une livraison ratée est relancée, **pour ce seul serveur**. Après le dernier retry, le job est jeté, parce qu’il définit `dead: false`. Un serveur qui continue d’échouer sur 7 jours différents est marqué indisponible et ignoré. **Personne ne te prévient.**'
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
			'Lis l’ordre dans [`call`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/services/post_status_service.rb#L51-L78) : d’abord enregistrer, puis `postprocess_status!`. Les hashtags sont traités dans la requête. La livraison, les aperçus de liens et les timelines sont des jobs.',
			'Le fan-out tient en trois lignes : [`RawDistributionWorker#distribute!`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/raw_distribution_worker.rb#L25-L31) appelle `DeliveryWorker.push_bulk(inboxes, limit: 1_000)`, avec un jeu d’arguments par `inbox_url`.',
			'[`DeliveryWorker`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/delivery_worker.rb#L11-L21) définit `retry: 16, dead: false`. Dans Sidekiq, [`dead == false` veut dire jeté](https://github.com/sidekiq/sidekiq/blob/1bb4aa06e5aa178a114a5e855f9f3d5c24f6c61b/lib/sidekiq/job_retry.rb#L264-L270) : le job n’arrive jamais dans le dead set.',
			'La règle « on laisse tomber ce serveur », c’est [`DeliveryFailureTracker`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/delivery_failure_tracker.rb#L6-L24) : il stocke une entrée par jour d’échec et crée un `UnavailableDomain` à 7.'
		]
	},
	tradeoff: {
		gain: [
			'Publier n’attend que ton propre serveur. Les serveurs de 2 000 abonnés coûtent à l’auteur à peu près autant que ceux de 20.',
			'Les échecs sont par serveur. Un serveur en panne refait ses retries tout seul, pendant que les autres ont déjà le post.',
			'Chaque côté va à son rythme. Les workers piochent dans des files pondérées (`push` a un poids de 6 dans `sidekiq.yml`), et une rafale attend dans Redis au lieu de ralentir l’API.'
		],
		cost: [
			'**Les erreurs perdent leur public.** Personne ne dit à l’auteur qu’un serveur n’a jamais reçu le post. Avec `dead: false`, après environ deux jours et demi de retries, le job a tout simplement disparu.',
			'**Une fenêtre d’incohérence.** Les abonnés des autres serveurs voient le post plus tard que les abonnés locaux. Un serveur qui était en panne le voit avec des heures ou des jours de retard.',
			'**Deux écritures, aucune transaction.** Le post est enregistré dans PostgreSQL, puis le job est poussé dans Redis. Si le processus meurt entre les deux, le post existe et rien dans ce chemin de code ne le livre.'
		]
	},
	task: {
		prompt: 'Sur ta plateforme vidéo, la requête d’envoi transcode la vidéo en quatre résolutions avant de répondre. Ça prend deux minutes et ça part souvent en timeout. Découpe-la : qu’est-ce qui reste synchrone, qu’est-ce qui devient un job, comment l’utilisateur apprend-il le résultat, et où atterrissent les échecs ?',
		hint: 'Demande-toi : quelles erreurs l’utilisateur peut-il corriger tout de suite, et qu’est-ce qui doit exister avant que tu puisses dire « accepté » ?',
		answer: [
			'Synchrone : ce que l’utilisateur peut corriger maintenant. Le type et la taille du fichier, son quota, le titre. Ensuite, stocke le fichier original et enregistre une ligne vidéo avec le statut `processing`.',
			'Réponds **202 Accepted** avec l’id de la vidéo. L’envoi est maintenant à l’abri, même si tous les workers sont en panne.',
			'Les jobs : un job de transcodage par résolution (fan-out), pour qu’un job 4K raté ne refasse pas le 480p.',
			'Le résultat arrive à l’utilisateur par un autre chemin : la page de la vidéo interroge le statut régulièrement, ou une notification dit « ta vidéo est prête ».',
			'Les échecs : retry avec une limite, puis garde le job dans un dead set **et** passe la vidéo en `failed`, pour que l’utilisateur le voie. Un job jeté avec une ligne `processing` pour toujours, c’est le pire des deux mondes.'
		]
	},
	quiz: [
		{
			q: 'Qu’est-ce qui est vrai d’un job asynchrone, comparé à un appel synchrone ?',
			options: ['L’appelant reçoit une réponse avant la fin du travail, et les erreurs doivent atteindre quelqu’un par un autre chemin', 'L’appelant reçoit toujours le résultat final dans la réponse, juste un peu plus tard que d’habitude', 'C’est toujours plus rapide du début à la fin, puisque le travail tourne en arrière-plan', 'Il ne peut pas échouer, puisque la file garde le job jusqu’à ce qu’un worker le termine'],
			answer: 0,
			why: 'L’asynchrone déplace le travail après la réponse. L’appelant est libéré plus tôt, mais les erreurs ne reviennent plus dans la réponse, donc tu dois décider où elles atterrissent.'
		},
		{
			q: 'Pourquoi Mastodon met-il en file un job de livraison par inbox, au lieu d’un seul job qui boucle sur toutes les inbox ?',
			options: ['Redis ne peut pas stocker un seul job qui porte une longue liste d’inbox', 'Pour que les posts arrivent sur chaque serveur dans l’ordre où ils ont été écrits', 'Pour qu’un serveur en échec soit relancé tout seul, sans rejouer ni bloquer la livraison aux autres', 'Parce que les signatures HTTP ne marchent que si chaque requête tourne dans son propre job'],
			answer: 2,
			why: 'Un job est relancé en entier. Avec une inbox par job, un serveur mort ne relance que sa propre livraison, et beaucoup de workers peuvent livrer en parallèle.'
		},
		{
			q: '`ActivityPub::DeliveryWorker` définit `retry: 16, dead: false`. Que se passe-t-il quand le dernier retry échoue ?',
			options: ['Le job part dans le dead set pour qu’un admin le relance', 'Le job est jeté, et l’auteur n’est pas prévenu', 'Le post est supprimé du serveur de l’auteur', 'Sidekiq relance à l’infini avec un délai plus long'],
			answer: 1,
			why: 'Avec `dead: false`, Sidekiq marque le job comme jeté au lieu de l’envoyer dans le dead set. Pour un post vers un serveur, Mastodon accepte cette perte.'
		}
	],
	takeaway: 'Ne fais attendre l’appelant que pour ce sur quoi il peut agir tout de suite. Passe le reste à un job, et décide où ses échecs atterriront et qui les regardera.',
	sources: [
		{ title: 'Mastodon, app/services/post_status_service.rb', url: `${PSS}#L51-L78` },
		{ title: 'Mastodon, app/workers/activitypub/raw_distribution_worker.rb', url: `${REPO}/app/workers/activitypub/raw_distribution_worker.rb#L25-L31` },
		{ title: 'Mastodon, app/workers/activitypub/delivery_worker.rb', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L11-L45` },
		{ title: 'Sidekiq 8.1.7, lib/sidekiq/job_retry.rb, retries exhausted', url: `${SIDEKIQ}/lib/sidekiq/job_retry.rb#L250-L273` },
		{ title: 'Sidekiq wiki, Error Handling', url: 'https://github.com/sidekiq/sidekiq/wiki/Error-Handling' }
	]
};
