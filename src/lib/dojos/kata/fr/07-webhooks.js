/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'webhooks',
	part: 'Petits services',
	title: 'Envoyer des webhooks',
	minutes: 10,
	hook: [
		'Une petite boutique en ligne utilise un service de facturation. À chaque facture payée, ce service envoie un POST à `https://shop.example/hooks/invoices`, et la boutique marque la commande comme prête à expédier.',
		'Mardi, le serveur de la boutique est coupé de 2 h à 8 h pour un changement de disque. 300 factures sont payées pendant ces 6 heures. Si le service de facturation envoie chaque POST une seule fois puis abandonne, 300 commandes attendent pour toujours sans que personne ne sache pourquoi.',
		'Tu travailles au service de facturation. Tu conçois la partie qui envoie ces POST à tous les clients, y compris ceux qui sont lents ou en panne.'
	],
	terms: [
		{ term: 'Webhook', def: 'Un POST HTTP que ton service envoie à une URL enregistrée par le client, quand un événement se produit chez toi.' },
		{ term: 'Livraison au moins une fois', def: 'Chaque événement arrive chez le client une fois ou plus : l’expéditeur réessaie jusqu’à recevoir un `2xx`, donc le client peut recevoir un doublon.' },
		{ term: 'Backoff exponentiel', def: 'Chaque nouvel essai attend deux fois plus longtemps que le précédent, en partant de 1 minute.' },
		{ term: 'Signature', def: 'Un HMAC du corps de la requête, calculé avec un secret partagé avec le client, qui permet au client de vérifier qui l’envoie.' }
	],
	kata: {
		brief: [
			'Le service de facturation a 5 000 clients qui ont enregistré une URL de webhook. Ensemble, ils reçoivent 2 millions d’événements par jour. Au pic, le trafic vaut 5 fois la moyenne de la journée. Chaque événement pèse environ 2 Ko de JSON.',
			'Environ 1 URL client sur 10 met plus de 5 secondes à répondre. Chaque jour, quelques dizaines d’URL sont en panne pendant des heures. Un client en panne doit quand même recevoir chaque événement à son retour, jusqu’à 3 jours plus tard.',
			'Un client lent ou cassé ne doit pas retarder les événements des autres. Les clients doivent pouvoir vérifier qu’un POST vient bien du service de facturation.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où un événement est stocké entre le moment où il se produit et le moment où le client répond `2xx`.',
			'Ton design dit combien de temps l’expéditeur attend une URL lente avant de compter l’essai comme raté.',
			'Ton design dit comment un client en panne pendant 6 heures ne ralentit pas les envois vers les 4 999 autres.',
			'Ton design donne le calendrier des nouveaux essais et le moment où ils s’arrêtent.',
			'Ton design dit ce qui se passe quand un expéditeur plante après le POST mais avant d’avoir noté le succès, et comment le client repère le doublon.',
			'Ton design dit comment un client vérifie qu’un POST vient du service de facturation.',
			'Ton design compte les événements par seconde au pic.'
		],
		sample: [
			'2 millions d’événements par jour font environ 23 par seconde en moyenne, donc environ 116 par seconde au pic de 5 fois. Quand une facture est payée, la même transaction insère une ligne dans une table `deliveries`. Si la transaction est annulée, aucun webhook n’existe. À 2 Ko par ligne, une journée prend environ 4 Go, et 7 jours d’historique prennent 28 Go.',
			'Chaque ligne contient l’identifiant de l’événement, l’URL du client et le corps de 2 Ko. Elle porte aussi un compteur d’essais et `next_attempt_at`, l’heure du prochain essai.',
			'Les workers d’envoi prennent des lignes avec `SELECT ... WHERE next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 50 FOR UPDATE SKIP LOCKED`. La doc de PostgreSQL dit que SKIP LOCKED "can be used to avoid lock contention with multiple consumers accessing a queue-like table" (plusieurs consommateurs lisent une table qui sert de file sans s’attendre). Dans la même transaction, le worker repousse `next_attempt_at` de 1 minute, comme un bail, puis valide. L’appel HTTP se fait hors de toute transaction.',
			'Chaque POST a un délai maximal de 10 secondes. Un worker garde au plus 5 POST en cours vers une même URL client. Un client qui répond en 10 secondes reçoit donc au plus 5 événements toutes les 10 secondes, et ses autres lignes attendent dans la table. Les autres clients gardent leurs 5 places à eux.',
			'Une réponse `2xx` marque la ligne comme livrée. Toute autre réponse, ou un dépassement du délai, programme l’essai suivant avec un backoff exponentiel qui part de 1 minute et plafonne à 6 heures. Les 9 premiers essais couvrent environ 8 h 30, puis un essai toutes les 6 heures remplit les 3 jours : environ 20 essais en tout. Après 3 jours, la ligne passe en échec et le client reçoit un e-mail.',
			'Un worker peut planter après la réponse `200` du client, mais avant de marquer la ligne comme livrée. Le bail de 1 minute expire et un autre worker renvoie le même événement. Chaque POST porte l’identifiant de l’événement dans un en-tête, et le client ignore les identifiants déjà traités. Stripe demande la même chose à ses clients : "Track event IDs to identify duplicate deliveries".',
			'Chaque POST porte un en-tête avec un horodatage et un HMAC SHA-256 de l’horodatage et du corps, calculé avec un secret propre au client. Le client recalcule le HMAC et compare. Il refuse aussi un horodatage de plus de 5 minutes, la tolérance par défaut des bibliothèques de Stripe, pour qu’un attaquant ne puisse pas rejouer une vieille requête.',
			'Le choix principal est une table PostgreSQL comme file : un seul endroit pour voir les événements en attente de chaque client, sans autre système à faire tourner. La table reçoit environ 350 écritures par seconde au pic, une insertion et deux mises à jour par événement. Le prix est une livraison au moins une fois, sans ordre : un événement réessayé peut arriver après un plus récent, et les clients doivent gérer eux-mêmes les doublons et l’ordre.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, pourquoi un client peut-il recevoir deux fois le même événement, et avec quoi l’ignore-t-il ?',
		a: 'Un worker peut planter après le POST mais avant de marquer la ligne comme livrée : le bail de 1 minute expire et un autre worker renvoie l’événement. Le client l’ignore grâce à son identifiant d’événement.'
	},
	sources: [
		{ title: 'Doc Stripe : recevoir les événements Stripe sur ton endpoint de webhook', url: 'https://docs.stripe.com/webhooks' },
		{ title: 'Doc PostgreSQL : SELECT, la clause de verrouillage', url: 'https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE' }
	]
};
