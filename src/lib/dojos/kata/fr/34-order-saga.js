/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'order-saga',
	part: 'Architecture',
	title: 'Une commande à travers plusieurs services',
	minutes: 10,
	hook: [
		'Lucas commande la dernière paire de bottes en 43. Le service de paiement débite sa carte de 120 euros. Puis le service de stock répond : quelqu’un d’autre a pris les bottes deux secondes plus tôt.',
		'Chaque service a sa propre base de données, donc une seule transaction SQL ne peut pas couvrir les trois. Le support rembourse Lucas à la main le lendemain matin. Cette semaine-là, l’équipe compte 400 commandes restées à moitié faites.',
		'La règle du métier : chaque commande finit soit payée et expédiée, soit annulée, sans argent pris et avec le stock remis en rayon.'
	],
	terms: [
		{ term: 'Saga', def: 'Une suite de transactions locales, une par service. Chaque étape terminée a une étape de compensation qui l’annule si une étape suivante échoue.' },
		{ term: 'Transaction de compensation', def: 'L’étape qui défait une étape précédente : libérer le stock réservé, annuler l’autorisation de la carte.' },
		{ term: 'Orchestrateur', def: 'Un composant qui garde l’état de la saga et dit à chaque service quelle étape lancer ensuite.' },
		{ term: 'Autorisation et capture', def: 'Deux appels sur la carte : l’autorisation bloque le montant sur la carte, la capture prend l’argent plus tard.' }
	],
	kata: {
		brief: [
			'Quatre services, chacun avec sa base PostgreSQL : Orders, Stock, Payment (qui appelle Stripe) et Shipping (qui réserve un enlèvement chez un transporteur). La boutique prend 20 000 commandes par jour.',
			'Sur 100 commandes, 2 échouent sur le stock parce que deux acheteurs se disputent le dernier article, 3 échouent parce que la carte est refusée, et 1 sur 200 échoue parce que le transporteur refuse l’adresse. L’entrepôt remet le colis au transporteur sous 2 jours.',
			'N’importe quel service peut être coupé jusqu’à 10 minutes pendant un déploiement. Un appel réseau peut expirer alors que l’autre côté a déjà fait le travail.',
			'Conçois le parcours d’une commande : l’ordre des étapes, ce qui annule chacune, où vit l’état d’une commande, et ce que voit l’acheteur pendant que la commande avance.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma liste les étapes dans l’ordre et dit pourquoi l’étape la plus dure à annuler est vers la fin.',
			'Ton schéma donne à chaque étape une étape de compensation, ou dit pourquoi elle n’en a pas besoin.',
			'Ton schéma dit où est stocké l’état d’une commande, et ce que dit cette ligne après un crash à mi-chemin.',
			'Ton schéma dit ce qui se passe quand Payment expire et que tu ne sais pas si la carte a été débitée.',
			'Ton schéma dit ce que fait l’orchestrateur pendant les 10 minutes où Stock est coupé.',
			'Ton schéma dit ce que voit l’acheteur juste après le clic sur « Payer », avant que toutes les étapes soient faites.',
			'Ton schéma dit combien de commandes par jour finissent annulées, et à quelle étape.'
		],
		sample: [
			'Le service Orders est l’orchestrateur. Chaque commande a une ligne avec une colonne `state` : `STOCK_PENDING`, `AUTH_PENDING`, `SHIP_PENDING`, `CAPTURE_PENDING`, puis `DONE` ou `CANCELLED`. Le changement d’état et la commande suivante s’écrivent dans une seule transaction locale, dans la ligne et dans une table outbox. Un relais lit l’outbox et publie la commande : un crash ne laisse jamais un changement d’état sans sa commande.',
			'L’étape un réserve le stock : la libérer ne coûte presque rien. L’étape deux autorise la carte chez Stripe avec `capture_method` à `manual`. La doc de Stripe : « Authorizing a payment guarantees the amount by holding it on the customer’s payment method. » La compensation annule le PaymentIntent, et l’acheteur n’est jamais débité.',
			'L’étape trois réserve l’enlèvement chez le transporteur. L’étape quatre capture le paiement quand le transporteur scanne le colis. La doc de Stripe : « Usually, an authorization for an online card payment is valid for 7 days. » Les 2 jours de l’entrepôt tiennent dedans ; une commande en rupture qui dépasserait le jour 6 annule l’autorisation à la place.',
			'Chaque commande envoyée porte une clé faite de l’id de commande et de l’étape, par exemple `ord_8812:authorize`. Payment la passe à Stripe comme clé d’idempotence. La doc de Stripe : « Retries with the same key return the saved response, including 500 errors. » Après un timeout, l’orchestrateur renvoie la même commande, et la carte n’est pas débitée deux fois.',
			'Pendant que Stock est coupé, la commande attend dans la file et la ligne reste en `STOCK_PENDING`. L’acheteur reçoit tout de suite `202 Accepted` avec l’id de commande. La page de commande interroge `GET /orders/{id}` et affiche « confirmation en cours » jusqu’à `SHIP_PENDING` ou `CANCELLED`.',
			'Par jour, 400 commandes s’arrêtent à l’étape un, sans rien à annuler. Environ 600 sont refusées à l’étape deux et libèrent leur stock. Environ 100 échouent à l’étape trois : elles annulent l’autorisation, puis libèrent le stock. Les lignes de commande ajoutent 20 000 × 365 = 7,3 millions de lignes par an, environ 7 Go à 1 Ko chacune.',
			'Ce que coûte ce schéma : une commande refusée bloque sa paire de bottes quelques secondes, et un autre acheteur peut voir « rupture de stock » pendant ce temps. La page de microservices.io appelle ça le « Lack of isolation » des sagas (l’absence d’isolation). Si la capture échoue après le départ du colis, aucune compensation n’existe : la commande part dans une file du support, pour un humain.'
		]
	},
	quiz: [],
	recall: {
		q: 'Pourquoi la carte reçoit une autorisation à l’étape deux et une capture seulement à l’étape quatre ?',
		a: 'Annuler une autorisation libère le montant bloqué, et l’acheteur n’est jamais débité. Chez Stripe, une autorisation de carte en ligne vaut en général 7 jours, assez pour les 2 jours de l’entrepôt.'
	},
	sources: [
		{ title: 'microservices.io : Pattern: Saga', url: 'https://microservices.io/patterns/data/saga.html' },
		{ title: 'Documentation Stripe : Place a hold on a payment method', url: 'https://docs.stripe.com/payments/place-a-hold-on-a-payment-method' },
		{ title: 'Référence de l’API Stripe : Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' }
	]
};
