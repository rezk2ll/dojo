/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'degradation',
	part: 'Fiabilité',
	title: 'Quand une dépendance tombe',
	minutes: 10,
	hook: [
		'Black Friday, 10 h 02. Le service de recommandations d’une librairie en ligne ne répond plus. Il accepte encore les connexions, mais il ne renvoie rien.',
		'Chaque page produit attend le bloc « Vous aimerez aussi ». Au bout de 2 secondes, tous les threads de tous les serveurs applicatifs l’attendent. Les pages produit, le panier et le paiement tombent en timeout, alors qu’aucun n’a besoin des recommandations pour marcher.',
		'L’équipe veut que la page produit s’affiche en moins d’une seconde pendant que le service de recommandations est en panne.'
	],
	terms: [
		{ term: 'Timeout', def: 'Le temps maximal qu’un appelant attend une réponse avant d’abandonner et de passer à la suite. Ici, un réglage du client HTTP qui appelle le service de recommandations.' },
		{ term: 'Repli', def: 'Ce que le code renvoie quand un appel échoue ou dépasse son timeout, par exemple une liste de meilleures ventes gardée en mémoire à la place des recommandations personnelles.' },
		{ term: 'Circuit breaker', def: 'Une enveloppe autour d’un appel qui compte les échecs récents. Au-delà d’un seuil, elle cesse de faire l’appel pendant un temps et échoue tout de suite, pour que l’appelant passe directement au repli.' }
	],
	kata: {
		brief: [
			'Une librairie en ligne sert 3 000 pages produit par seconde en pointe depuis 30 serveurs applicatifs, soit 100 pages par seconde chacun. Chaque serveur a 200 threads de travail, et une page garde un thread jusqu’à son envoi.',
			'Une page produit a besoin du livre en base (40 ms), du prix et du stock (30 ms), et du bloc de recommandations d’un service à part (80 ms d’habitude, 150 ms au 99e centile). Le rendu prend 50 ms. Aujourd’hui, le client HTTP attend jusqu’à 30 secondes le service de recommandations.',
			'Le service de recommandations peut tomber de deux façons : il renvoie des erreurs tout de suite, ou il accepte les connexions et ne répond jamais. Dans les deux cas, la page produit doit s’afficher en **moins d’une seconde** et montrer quand même des livres sous « Vous aimerez aussi ».'
		],
		minutes: 10,
		checklist: [
			'Ton design donne un chiffre pour l’attente des recommandations, et le total de la page reste sous 1 seconde.',
			'Ton design compte les threads bloqués par serveur quand le service ne répond plus, et ce nombre reste sous 200.',
			'Ton design dit ce que la page affiche dans le bloc de recommandations quand l’appel échoue.',
			'Ton design dit comment les serveurs arrêtent d’appeler un service qui échoue sans cesse, et quand ils réessaient.',
			'Ton design dit comment l’équipe apprend que des pages affichent le repli.'
		],
		sample: [
			'D’abord le problème. Avec 30 secondes d’attente et 100 pages par seconde, un serveur a besoin de 100 × 30 = 3 000 threads en attente quand le service ne répond plus. Il en a 200 : au bout de 2 secondes, tous attendent les recommandations, et plus aucune page n’est servie.',
			'La limite de temps. La page appelle la base, le prix et le stock, et les recommandations en parallèle. Le client HTTP des recommandations reçoit un timeout de **250 ms**, au-dessus des 150 ms du 99e centile. La pire page fait alors 250 ms plus 50 ms de rendu : 300 ms. Quand le service ne répond plus, chaque serveur y bloque 100 × 0,25 = 25 threads sur 200.',
			'Le repli. Chaque serveur garde en mémoire les 20 meilleures ventes de chaque catégorie, rechargées toutes les 10 minutes depuis la base. Quand l’appel échoue ou dépasse son timeout, le bloc montre ces livres pour la catégorie de la page. C’est le conseil de Hystrix : « provide a generic response, without any network dependency, from an in-memory cache » (une réponse générique, sans réseau, depuis un cache en mémoire).',
			'Le circuit breaker. L’appel passe par un `CircuitBreaker` Resilience4j avec `failureRateThreshold` à 50 (la valeur par défaut) sur les 100 derniers appels, et `slowCallDurationThreshold` à 250 ms avec `slowCallRateThreshold` à 50. Par défaut, toute exception compte comme un échec, timeouts compris. À 100 appels par seconde, un service mort ouvre le breaker de chaque serveur en moins de 2 secondes.',
			'Tant que le breaker est ouvert, l’appel est refusé tout de suite avec `CallNotPermittedException`, et la page passe au repli sans attendre 250 ms. Après `waitDurationInOpenState`, réglé à 30 secondes, le breaker passe en semi-ouvert et laisse passer 10 appels (la valeur par défaut de `permittedNumberOfCallsInHalfOpenState`). Sous les seuils, il se referme, sinon il reste ouvert 30 secondes de plus.',
			'Le voir. Chaque serveur compte les replis par minute et l’état de son breaker, et une alerte part si plus de 5 % des pages ont utilisé le repli pendant 5 minutes. Les 30 breakers décident chacun de leur côté : pendant quelques secondes, certains serveurs montrent des livres personnels et d’autres les meilleures ventes.',
			'Le prix. Pendant la panne, tous les lecteurs d’une catégorie voient les mêmes 20 livres, choisis sans tenir compte de ce que chacun a regardé avant. Une minute lente où le service répond en 300 ms ouvre aussi les breakers, et les lecteurs voient les meilleures ventes pendant au moins 30 secondes alors que le service marche encore.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, combien de threads par serveur un service de recommandations figé bloque-t-il, avec l’ancienne attente et avec la nouvelle ?',
		a: 'Avec 30 secondes : 100 × 30 = 3 000, plus que les 200 threads, donc le serveur s’arrête. Avec le timeout de 250 ms : 100 × 0,25 = 25 threads.'
	},
	sources: [
		{ title: 'Documentation Resilience4j, CircuitBreaker', url: 'https://resilience4j.readme.io/docs/circuitbreaker' },
		{ title: 'Wiki Netflix Hystrix, How it Works (Get the Fallback)', url: 'https://github.com/Netflix/Hystrix/wiki/How-it-Works' }
	]
};
