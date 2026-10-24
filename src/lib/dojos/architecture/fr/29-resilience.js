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
		'Les clients peuvent acheter sans recommandations, donc le retard seul coûte peu. La vraie question est de savoir **si la lenteur atteint les autres fonctionnalités**. Si la page produit et le checkout partagent un même pool de threads, le checkout attend maintenant derrière les recommandations, et plus personne ne peut payer.',
		'Le jour 15 a traité les timeouts et les retries pour un seul appel. Les patterns de ce chapitre posent des limites entre types d’appels, pour qu’une dépendance lente ne bloque que la fonctionnalité qui l’utilise. Michael Nygard les appelle des « stability patterns ».'
	],
	terms: [
		{ term: 'Bulkhead (cloison)', def: 'Des pools, des files ou des limites séparés par type de travail, pour qu’un type puisse saturer sans affamer les autres. Le nom vient des cloisons étanches dans la coque d’un navire.' },
		{ term: 'Circuit breaker', def: 'Après trop d’échecs, arrête d’appeler une dépendance pendant un moment et échoue tout de suite. Puis laisse passer quelques appels d’essai pour voir si elle s’est rétablie.' },
		{ term: 'Dégradation gracieuse', def: 'L’appli continue de servir ce qui marche et laisse de côté ce qui ne marche pas. La page n’affiche pas de recommandations, et le checkout fonctionne toujours.' },
		{ term: 'Liveness vs readiness', def: 'Une probe de liveness en échec fait redémarrer le conteneur par Kubernetes. Une probe de readiness en échec coupe seulement le trafic vers le pod. Un problème de readiness testé dans la liveness redémarre des pods en bonne santé.' }
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
				note: 'Chaque dépendance a son propre bulkhead, une limite d’appels en cours. Dans resilience4j, la valeur par défaut est de [25 appels sans attente](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-bulkhead/src/main/java/io/github/resilience4j/bulkhead/BulkheadConfig.java#L33-L34). Les recommandations lentes remplissent leurs 25 places, et les paiements gardent les leurs.'
			},
			{
				add: [
					'bhR --> cb["circuit breaker : recommandations"]',
					'cb -->|"lent aujourd’hui"| recs["service de recommandations"]',
					'class recs ext'
				],
				highlight: ['cb', 'recs'],
				note: 'Le circuit breaker surveille les derniers appels. Dans resilience4j, il s’ouvre quand le taux d’échec [atteint 50 % sur les 100 derniers appels](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/CircuitBreakerConfig.java#L43-L48), et seulement après au moins 100 appels. Ouvert, il refuse les appels pendant 60 secondes par défaut, puis laisse passer 10 appels d’essai.'
			},
			{
				add: ['cb -.->|"ouvert : échec immédiat"| fb["page produit sans recommandations"]'],
				highlight: ['fb'],
				note: 'Quand le breaker est ouvert, un appel refusé revient tout de suite au lieu d’attendre 8 secondes. La boutique l’intercepte et affiche la page sans le bloc de recommandations. Le client voit une page un peu plus vide, **pas une page d’erreur**.'
			},
			{
				add: [
					'users(["clients et scrapers"]) -->|"au-delà de la limite : 429"| gw["rate limit de la gateway"]',
					'gw --> shop'
				],
				highlight: ['users', 'gw'],
				note: 'En bordure, un scraper qui demande 50 pages par seconde reçoit des `429` rapides du rate limit de la gateway, avant de coûter un thread à la boutique. Un proxy peut aussi repousser la charge (backpressure) : quand les limites d’Envoy sur les connexions ou les requêtes en attente débordent, il échoue vite et pose le header `x-envoy-overloaded`.'
			},
			{
				add: ['probe["Probes Kubernetes"] -.->|"liveness : le processus est-il bloqué ?"| shop'],
				highlight: ['probe'],
				note: 'Une probe de liveness en échec redémarre le conteneur. Redémarrer la boutique ne guérit pas le service de recommandations, donc un breaker ouvert ne doit pas faire échouer la liveness. L’indicateur de santé de resilience4j signale un breaker ouvert comme [`CIRCUIT_OPEN`, pas `DOWN`](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-spring-boot3/src/main/java/io/github/resilience4j/springboot3/circuitbreaker/monitoring/health/CircuitBreakersHealthIndicator.java#L85-L98), sauf si tu définis `allowHealthIndicatorToFail`.'
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
			'Cette méthode tourne dans l’état **ouvert**. Avant la fin du temps d’attente, les lignes 15 et 16 renvoient `false`, et la dépendance n’est jamais touchée. L’appelant reçoit alors une [`CallNotPermittedException`](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L757-L763), que ton code intercepte pour afficher la page dégradée.',
			'Une fois l’attente terminée, la ligne 5 fait passer le breaker en half-open (semi-ouvert) au premier appel qui arrive. Le half-open distribue un [nombre fixe de permis d’essai](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L1116-L1124), 10 par défaut, et la ligne 8 en demande un. Les appels au-delà de ces 10 sont refusés.',
			'Les résultats des appels d’essai fixent l’état suivant. [Au seuil d’échec ou au-dessus, le breaker s’ouvre à nouveau, et en dessous, il se ferme](https://github.com/resilience4j/resilience4j/blob/b7c0069802e373ed72dff0b817c270fbb6e966ba/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L1188-L1195).',
			'L’état vit dans une `AtomicReference` au sein d’un seul processus, donc **chaque instance a son propre breaker** : avec 6 pods, il y a 6 breakers qui apprennent chacun de leur côté. La doc d’Envoy dit de ses limites qu’elles sont « entièrement distribuées (non coordonnées) ».'
		]
	},
	tradeoff: {
		gain: [
			'Une dépendance lente ou cassée ne pénalise que la fonctionnalité qui en a besoin : le checkout continue de marcher pendant que les recommandations se rétablissent.',
			'Les refus rapides (`429`, un breaker ouvert, un bulkhead plein) libèrent tout de suite threads et mémoire, au lieu de les retenir 8 secondes chacun.',
			'Une dépendance cassée reçoit moins d’appels pendant sa panne, ce qui lui laisse de la place pour se rétablir.'
		],
		cost: [
			'Un bulkhead n’isole que ce que tu sépares. Deux bulkheads partagent toujours le même CPU, la même mémoire et la même base, et si la partie partagée est la lente, les limites n’aident pas.',
			'Chaque limite est un nombre à régler : 25 appels en cours, c’est trop peu pour un service rapide et trop pour un service fragile. Avec son minimum de 100 appels, le breaker laisse un endpoint à faible trafic échouer longtemps avant de se déclencher.',
			'Un breaker qui se déclenche trop tôt refuse du travail qu’un service sain aurait pu faire. Chaque pod a son propre breaker, donc pendant un moment certains pods refusent des appels que d’autres envoient encore.'
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
		],
		steps: [
			{
				title: 'Choisis les erreurs qui comptent',
				questions: [
					{ q: 'Quels échecs doivent compter pour déclencher le breaker ?', options: ['Les timeouts, les erreurs de connexion et les 5xx', 'Toutes les exceptions, `400` compris', 'Seulement les réponses `400`', 'Seulement les appels de plus de 60 secondes'], answer: 0, why: 'Ceux-là disent que l’API de taxe est malade. Les autres erreurs disent autre chose.' },
					{ q: 'L’API de taxe répond `400` pour une adresse invalide. Est-ce que ça compte ?', options: ['Oui : une erreur est une erreur', 'Non : c’est la faute de l’appelant, pas une API malade', 'Seulement après 100 d’entre elles', 'Seulement dans l’état half-open'], answer: 1, why: 'Une requête fausse ne dit rien de la santé de l’API : elle ne doit pas déclencher le breaker.' },
					{ q: 'Dans resilience4j, quels réglages choisissent ce qui compte ?', options: ['`waitDurationInOpenState`', '`allowHealthIndicatorToFail`', '`recordExceptions` et `ignoreExceptions`', 'Seulement `slowCallDurationThreshold`'], answer: 2, why: 'L’un liste les exceptions à enregistrer, l’autre celles à ignorer.' },
					{ q: 'Les appels lents doivent-ils compter aussi ?', options: ['Non : seules les erreurs comptent', 'Oui, mais seulement au-delà des 10 secondes', 'Seulement quand la réponse est un 5xx', 'Oui, avec un `slowCallDurationThreshold` bien en dessous des 10 secondes'], answer: 3, why: 'Une API qui pend fait autant de mal qu’une API qui échoue.' }
				]
			},
			{
				title: 'Décide ce que reçoit l’utilisateur',
				questions: [
					{ q: 'Le breaker est ouvert. Que fait l’appel de taxe ?', options: ['Il échoue tout de suite', 'Il attend 10 secondes, puis échoue', 'Il réessaie jusqu’à ce que l’API réponde', 'Il appelle l’API quand même'], answer: 0, why: 'Un breaker ouvert refuse l’appel sans toucher la dépendance : aucun thread n’attend.' },
					{ q: 'Que devient la facture ?', options: ['Elle prend le dernier taux de taxe connu', 'Elle est enregistrée comme brouillon marqué « taxe en attente » et terminée plus tard', 'Elle prend un taux à 0 %', 'L’utilisateur reçoit une page `500`'], answer: 1, why: 'Le brouillon garde le travail, et la taxe est ajoutée quand l’API revient.' },
					{ q: 'Pourquoi ne jamais deviner un taux de taxe ?', options: ['Deviner est plus lent qu’attendre', 'Le breaker bloque toute supposition', 'Un repli doit rester correct, et un taux deviné peut être faux', 'L’API rejetterait la facture plus tard'], answer: 2, why: 'Dégrade honnêtement : laisse la taxe de côté plutôt que d’en mettre une fausse sur une facture.' },
					{ q: 'Comment s’appelle ce comportement ?', options: ['La backpressure', 'Un bulkhead', 'Le rate limiting', 'La dégradation gracieuse'], answer: 3, why: 'L’appli continue de servir ce qui marche et laisse de côté ce qui ne marche pas.' }
				]
			},
			{
				title: 'Referme-le',
				questions: [
					{ q: 'L’attente se termine à 9 h 01, mais la facture suivante n’arrive qu’à 9 h 06. Quand le breaker quitte-t-il l’état ouvert ?', options: ['À 9 h 01 pile, sur un minuteur', 'À 9 h 06, sur ce premier appel', 'Quand un admin le réinitialise', 'Après 100 appels de plus'], answer: 1, why: '`tryAcquirePermission` regarde l’horloge quand un appel arrive, et c’est seulement là qu’il passe en half-open.' },
					{ q: 'En half-open, 30 factures arrivent d’un coup. Avec les valeurs par défaut, combien atteignent l’API de taxe ?', options: ['10, et les 20 autres sont refusées', 'Les 30', 'Aucune', '1, puis le breaker décide'], answer: 0, why: 'Le half-open distribue 10 permis d’essai par défaut. Les appels en plus sont refusés, donc ces 20 factures prennent le chemin « taxe en attente ».' },
					{ q: 'Les appels d’essai se passent bien. Et ensuite ?', options: ['Le breaker se rouvre', 'Il reste half-open pour de bon', 'Le breaker se ferme', 'Le pod redémarre'], answer: 2, why: 'Sous le seuil d’échec, le breaker se ferme et le trafic normal reprend.' },
					{ q: 'Les appels d’essai échouent. Et ensuite ?', options: ['Le breaker se ferme', 'Le pod redémarre', 'Il reste half-open pour de bon', 'Le breaker se rouvre'], answer: 3, why: 'Au seuil d’échec ou au-delà, il se rouvre et attend à nouveau.' }
				]
			},
			{
				title: 'Rends-le visible',
				questions: [
					{ q: 'Comment rends-tu le breaker visible ?', options: ['Tu logues chaque changement d’état et tu en fais un graphe', 'Tu ne logues que les `500`', 'Tu écris au support pour chaque facture ratée', 'Tu ne fais rien : il se répare tout seul'], answer: 0, why: 'Un changement d’état, c’est le moment où l’API de taxe est tombée malade ou s’est rétablie.' },
					{ q: 'Que t’apporte le graphe ?', options: ['Un breaker plus lent', 'Un seuil qui se règle tout seul', 'Moins d’appels à l’API de taxe', '« API de taxe en panne » sur un dashboard avant les tickets du support'], answer: 3, why: 'Tu l’apprends par tes propres données, pas par tes clients.' },
					{ q: 'Un breaker ouvert doit-il faire échouer la probe de liveness ?', options: ['Oui : l’appli est en mauvaise santé', 'Non : redémarrer l’appli ne soigne pas l’API de taxe', 'Oui, au bout de 10 minutes', 'Non : la liveness ne vérifie que le disque'], answer: 1, why: 'Une probe de liveness en échec redémarre le conteneur, et ça ne répare rien ici.' },
					{ q: 'L’appli tourne sur 6 pods. Combien y a-t-il de breakers ?', options: ['1, partagé par tous les pods', 'Un par facture', '6, qui apprennent chacun de leur côté', 'Aucun : c’est Kubernetes qui fait le breaker'], answer: 2, why: 'L’état vit dans chaque processus : pendant un moment, certains pods refusent des appels que d’autres envoient encore.' }
				]
			}
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
			why: 'Dans l’état ouvert, chaque appel regarde l’horloge. Une fois l’attente terminée, il passe en half-open, qui distribue un nombre fixe de permis d’essai (10 par défaut). Leurs résultats décident s’il se ferme ou s’ouvre à nouveau.'
		}
	],
	recall: {
		q: 'Avec les valeurs par défaut de resilience4j, quand un circuit breaker s’ouvre-t-il, et que fait-il une fois ouvert ?',
		a: 'Il s’ouvre quand 50 % des 100 derniers appels ont échoué, après au moins 100 appels. Il refuse les appels pendant 60 secondes, puis passe en half-open et laisse 10 appels d’essai décider s’il se ferme ou s’ouvre à nouveau.'
	},
	sources: [
		{ title: 'Michael Nygard, Release It! Second Edition (Pragmatic Bookshelf)', url: 'https://pragprog.com/titles/mnee2/release-it-second-edition/' },
		{ title: 'Martin Fowler, CircuitBreaker', url: 'https://martinfowler.com/bliki/CircuitBreaker.html' },
		{ title: 'resilience4j, CircuitBreakerStateMachine.java', url: `${R4J}/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/internal/CircuitBreakerStateMachine.java#L687-L838` },
		{ title: 'Envoy docs, circuit breaking', url: `${ENVOY}/docs/root/intro/arch_overview/upstream/circuit_breaking.rst?plain=1#L6-L10` },
		{ title: 'Kubernetes, Liveness, readiness and startup probes', url: 'https://kubernetes.io/docs/concepts/workloads/pods/probes/' }
	]
};
