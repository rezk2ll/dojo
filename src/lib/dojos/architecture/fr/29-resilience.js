const R4J = 'https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba';
const ENVOY = 'https://github.com/envoyproxy/envoy/blob/76dfb8422a093b3c742360593176f46a0a9378bb';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'resilience',
	part: 'La boîte à patterns',
	title: 'Résilience : empêcher une panne de se propager',
	minutes: 10,
	hook: [
		'Black Friday, 9 h. Le service de recommandations de ta boutique en ligne est lent. Chaque appel prend 8 secondes au lieu de 80 millisecondes.',
		'La question qui fait peur n’est pas « les recommandations sont-elles en retard ? ». C’est **« la lenteur déborde-t-elle ? »** Si la page produit et le checkout partagent un même pool de threads, le checkout attend maintenant derrière les recommandations. Une fonctionnalité lente et optionnelle devient une boutique où plus personne ne peut payer.',
		'Le jour 15 t’a donné les timeouts et les retries : comment un appel échoue proprement. Aujourd’hui, on parle des murs entre les appels, pour qu’une panne reste dans sa propre pièce. Michael Nygard les appelle des « stability patterns ».'
	],
	terms: [
		{ term: 'Bulkhead (cloison)', def: 'Des pools, des files ou des limites séparés par type de travail, pour qu’un type puisse saturer sans affamer les autres. Le nom vient des cloisons étanches dans la coque d’un navire.' },
		{ term: 'Backpressure', def: 'Le consommateur dit au producteur « pas plus de N à la fois ». Le travail en trop est refusé ou attend en amont au lieu de s’empiler en mémoire.' },
		{ term: 'Rate limit', def: 'Un plafond de requêtes par appelant et par fenêtre de temps. Au-delà, la réponse est un `429` rapide au lieu d’un travail lent pour tout le monde.' },
		{ term: 'Circuit breaker', def: 'Après trop d’échecs, arrête d’appeler une dépendance pendant un moment et échoue tout de suite. Puis laisse passer quelques appels d’essai pour voir si elle s’est rétablie.' },
		{ term: 'Dégradation gracieuse', def: 'Garde la partie qui marche encore, et dis clairement ce qui ne marche pas. La page n’affiche pas de recommandations, mais le checkout fonctionne.' },
		{ term: 'Liveness vs readiness', def: 'Liveness : « redémarre-moi, je suis bloqué ». Readiness : « ne m’envoie pas de trafic pour l’instant ». Les confondre redémarre des pods en bonne santé.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: [
					'shop["appli boutique"] -->|"25 appels simultanés max"| bhR["bulkhead : recommandations"]',
					'shop -->|"25 appels simultanés max"| bhP["bulkhead : paiements"]',
					'bhP --> pay["prestataire de paiement"]',
					'class pay ext'
				],
				highlight: ['bhR', 'bhP'],
				note: '**Bulkhead.** Chaque dépendance a sa propre limite d’appels en cours. Dans resilience4j, la valeur par défaut est de [25 appels sans attente](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-bulkhead/src/main/java/io/github/resilience4j/bulkhead/BulkheadConfig.java#L33-L34). Les recommandations lentes remplissent leurs 25 places. Les paiements ont toujours les leurs.'
			},
			{
				add: [
					'bhR --> cb["circuit breaker : recommandations"]',
					'cb -->|"lent aujourd’hui"| recs["service de recommandations"]',
					'class recs ext'
				],
				highlight: ['cb', 'recs'],
				note: '**Circuit breaker.** Il surveille les derniers appels. Dans resilience4j, il s’ouvre quand le taux d’échec [atteint 50 % sur les 100 derniers appels](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/CircuitBreakerConfig.java#L43-L48), et seulement après au moins 100 appels. Ouvert, il refuse les appels pendant 60 secondes par défaut, puis laisse passer 10 appels d’essai.'
			},
			{
				add: ['cb -.->|"ouvert : échec immédiat"| fb["page produit sans recommandations"]'],
				highlight: ['fb'],
				note: '**Dégradation gracieuse.** Un appel refusé revient tout de suite, pas après 8 secondes. La boutique l’intercepte et affiche la page sans le bloc de recommandations. Le client voit une page un peu plus vide, **pas une page d’erreur**.'
			},
			{
				add: [
					'users(["clients et scrapers"]) -->|"au-delà de la limite : 429"| gw["rate limit de la gateway"]',
					'gw --> shop'
				],
				highlight: ['users', 'gw'],
				note: '**Rate limits et backpressure en bordure.** Un scraper qui demande 50 pages par seconde reçoit des `429` rapides à la gateway, avant de coûter un thread à la boutique. Un proxy peut aussi repousser : quand les limites d’Envoy sur les connexions ou les requêtes en attente débordent, il échoue vite et pose le header `x-envoy-overloaded`.'
			},
			{
				add: ['probe["Probes Kubernetes"] -.->|"liveness : le processus est-il bloqué ?"| shop'],
				highlight: ['probe'],
				note: '**Une liveness bien pensée.** Une probe de liveness en échec redémarre le conteneur. Redémarrer la boutique ne guérit pas le service de recommandations, donc un breaker ouvert ne doit pas faire échouer la liveness. L’indicateur de santé de resilience4j signale un breaker ouvert comme [`CIRCUIT_OPEN`, pas `DOWN`](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-spring-boot3/src/main/java/io/github/resilience4j/springboot3/circuitbreaker/monitoring/health/CircuitBreakersHealthIndicator.java#L85-L98), sauf si tu définis `allowHealthIndicatorToFail`.'
			}
		]
	},
	example: {
		title: 'CircuitBreakerStateMachine.java, OpenState.tryAcquirePermission',
		repo: 'resilience4j/resilience4j',
		url: `${R4J}/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L739-L755`,
		lang: 'java',
		code: `        @Override
        public boolean tryAcquirePermission() {
            // Thread-safe
            if (clock.instant().isAfter(retryAfterWaitDuration)) {
                toHalfOpenState();
                // Check if the call is allowed to run in HALF_OPEN state after state transition
                // super.tryAcquirePermission() doesn't work right that's why the code is copied
                boolean callPermitted = stateReference.get().tryAcquirePermission();
                if (!callPermitted) {
                    publishCallNotPermittedEvent();
                    circuitBreakerMetrics.onCallNotPermitted();
                }
                return callPermitted;
            }
            circuitBreakerMetrics.onCallNotPermitted();
            return false;
        }`,
		notes: [
			'C’est l’état **ouvert**. Avant la fin du temps d’attente, chaque appel reçoit `false` et la dépendance n’est jamais touchée. L’appelant reçoit alors une [`CallNotPermittedException`](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L757-L763) : c’est ton signal pour dégrader.',
			'Une fois l’attente terminée, le premier appel qui arrive fait passer le breaker en **half-open** (semi-ouvert). Le half-open distribue un [nombre fixe de permis d’essai](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L1116-L1124), 10 par défaut. Tout appel au-delà est refusé.',
			'Les résultats des essais décident. [Au seuil ou au-dessus, il s’ouvre à nouveau. En dessous, il se ferme](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L1188-L1195).',
			'L’état vit dans une `AtomicReference` au sein d’un seul processus. Donc **chaque instance a son propre breaker** : avec 6 pods, il y a 6 breakers qui apprennent chacun de leur côté. Envoy dit la même chose de ses limites : elles sont « entièrement distribuées (non coordonnées) ».'
		]
	},
	tradeoff: {
		gain: [
			'Une dépendance lente ou cassée ne pénalise que la fonctionnalité qui en a besoin. Le checkout continue de marcher pendant que les recommandations se rétablissent.',
			'Les refus rapides (`429`, un breaker ouvert, un bulkhead plein) libèrent tout de suite threads et mémoire, au lieu de les retenir 8 secondes chacun.',
			'Une dépendance cassée reçoit moins d’appels pendant sa panne, ce qui lui laisse de la place pour se rétablir.'
		],
		cost: [
			'**Les bulkheads n’isolent que ce que tu sépares.** Deux bulkheads partagent toujours le même CPU, la même mémoire et la même base. Si la partie partagée est celle qui est lente, les murs n’aident pas.',
			'**Chaque limite est un nombre à régler.** 25 en cours, c’est trop peu pour un service rapide et trop pour un service fragile. Le minimum de 100 appels du breaker veut dire qu’un endpoint à faible trafic peut échouer longtemps avant de le déclencher.',
			'**Les breakers ajoutent de l’état et de nouveaux modes de panne.** Déclenché trop tôt, il refuse du travail qu’un service sain aurait pu faire. Chaque pod a son propre breaker, donc ils ne sont pas d’accord pendant un moment.'
		]
	},
	task: {
		prompt: 'Ton appli SaaS de facturation appelle une API externe de taux de taxe pour chaque facture. L’API de taxe tombe pendant 10 minutes. Aujourd’hui, chaque facture attend 10 secondes, puis échoue avec un `500`. Esquisse un circuit breaker pour cet appel : quelles erreurs comptent, ce que l’utilisateur reçoit pendant qu’il est ouvert, et comment il se referme.',
		hint: 'Trois états : fermé, ouvert, half-open. Réfléchis aux erreurs qui veulent dire « l’API de taxe est malade » et à celles qui veulent dire « cette requête était fausse ». Existe-t-il un repli qui reste correct ?',
		answer: [
			'Ne compte que les échecs qui disent que l’API de taxe est malade : timeouts, erreurs de connexion, 5xx. Un `400` pour une adresse invalide est la faute de l’appelant et ne doit pas le déclencher. Dans resilience4j, ce sont `recordExceptions` et `ignoreExceptions`.',
			'Compte aussi les appels lents, avec un `slowCallDurationThreshold` bien en dessous des 10 secondes. Une API qui pend fait autant de mal qu’une API qui échoue.',
			'Pendant qu’il est ouvert, échoue tout de suite. Dégrade honnêtement : enregistre la facture comme brouillon marqué « taxe en attente » et termine-la plus tard. Ne devine jamais un taux de taxe.',
			'Après une attente (`waitDurationInOpenState`), passe en half-open et laisse passer quelques appels d’essai. De bons résultats ferment le breaker, de mauvais le rouvrent.',
			'Rends-le visible : logue chaque changement d’état et fais-en un graphe, pour que « API de taxe en panne » apparaisse sur un dashboard avant les tickets du support. Garde-le hors de la probe de liveness.'
		]
	},
	quiz: [
		{
			q: 'Le service de recommandations est lent. La boutique donne aux recommandations et aux paiements des bulkheads séparés de 25 appels chacun. Qu’arrive-t-il au checkout ?',
			options: [
				'Il ralentit aussi, parce que les deux bulkheads partagent un même pool de 25 threads',
				'Il s’arrête jusqu’à ce que les recommandations se rétablissent, pour que les pages restent cohérentes',
				'Il continue de marcher : les recommandations ne remplissent que leurs propres 25 places',
				'Ses appels sont refusés aussi, parce qu’un bulkhead plein ouvre tous les circuit breakers'
			],
			answer: 2,
			why: 'Chaque bulkhead a sa propre limite. Les appels lents aux recommandations consomment leurs propres places, et ceux en trop sont refusés. Les appels de paiement ont toujours leurs 25.'
		},
		{
			q: 'Quelle vérification a sa place dans une probe de **liveness**, celle qui redémarre le conteneur ?',
			options: [
				'Un thread worker est en deadlock depuis plus d’une minute',
				'Le circuit breaker vers le service de recommandations est ouvert',
				'La base ne répond pas à `select 1`',
				'Le pod est encore en train de chauffer son cache'
			],
			answer: 0,
			why: 'La liveness ne doit échouer que quand un redémarrage est la solution, comme pour un deadlock. Un redémarrage ne guérit ni un autre service ni la base. Un cache qui chauffe relève de la readiness : n’envoie pas encore de trafic.'
		},
		{
			q: 'Un circuit breaker resilience4j est resté ouvert pendant tout son temps d’attente. Que se passe-t-il au prochain appel ?',
			options: [
				'Il se ferme et laisse à nouveau passer tout le trafic',
				'Il reste ouvert jusqu’à ce qu’un opérateur le réinitialise à la main',
				'Il envoie un appel à toutes les instances de la dépendance en même temps',
				'Il passe en half-open et laisse passer un nombre limité d’appels d’essai'
			],
			answer: 3,
			why: 'L’état ouvert regarde l’horloge. Une fois l’attente terminée, il passe en half-open, qui distribue un nombre fixe de permis d’essai (10 par défaut). Leurs résultats décident s’il se ferme ou s’ouvre à nouveau.'
		}
	],
	takeaway: 'Mets des murs entre les types de travail, refuse vite au lieu d’empiler, et dégrade honnêtement, pour qu’une dépendance lente reste une seule fonctionnalité lente.',
	sources: [
		{ title: 'Michael Nygard, Release It! Second Edition (Pragmatic Bookshelf)', url: 'https://pragprog.com/titles/mnee2/release-it-second-edition/' },
		{ title: 'Martin Fowler, CircuitBreaker', url: 'https://martinfowler.com/bliki/CircuitBreaker.html' },
		{ title: 'resilience4j, CircuitBreakerStateMachine.java', url: `${R4J}/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L687-L838` },
		{ title: 'Envoy docs, circuit breaking', url: `${ENVOY}/docs/root/intro/arch_overview/upstream/circuit_breaking.rst?plain=1#L6-L10` },
		{ title: 'Kubernetes, Liveness, readiness and startup probes', url: 'https://kubernetes.io/docs/concepts/workloads/pods/probes/' }
	]
};
