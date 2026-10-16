/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'payments',
	part: 'Fiabilité',
	title: 'Encaisser des paiements',
	minutes: 10,
	hook: [
		'Black Friday, 23 h. Une cliente touche Payer pour une machine à café à 240 €. La roue tourne 30 secondes, la page affiche « Une erreur est survenue », et elle touche Payer une seconde fois.',
		'Le lendemain matin, son appli bancaire montre deux débits de 240 €. La première requête était bien arrivée chez le prestataire de paiement, qui avait débité la carte. Seule la réponse s’était perdue sur le chemin du retour.',
		'L’appli de la boutique envoie un débit de carte à son prestataire sans aucune trace des tentatives précédentes. À toi de concevoir un paiement où une réponse perdue ou un second clic ne débite jamais une carte deux fois.'
	],
	terms: [
		{ term: 'Résultat inconnu', def: 'L’état après une requête qui a expiré : le prestataire a peut-être débité la carte, ou n’a peut-être jamais vu la requête.' },
		{ term: 'Clé d’idempotence', def: 'Une valeur unique envoyée dans l’en-tête `Idempotency-Key`. Le prestataire exécute la première requête portant cette clé et répond à chaque nouvel essai avec le résultat enregistré.' },
		{ term: 'Webhook', def: 'Une requête HTTP que le prestataire envoie à ton serveur quand un événement se produit chez lui, par exemple un paiement réussi.' }
	],
	kata: {
		brief: [
			'Une boutique en ligne encaisse 20 000 paiements par carte par jour via Stripe, avec un pic de 10 par seconde les jours de soldes. Le prestataire répond à 99,9 % des appels en moins de 2 secondes. Le timeout de la boutique est de 10 secondes, donc environ 20 appels par jour restent sans réponse.',
			'Des clients touchent Payer deux fois. Les serveurs de l’appli redémarrent pendant les déploiements, parfois au milieu d’un appel de paiement. Stripe envoie aussi un webhook quand un paiement réussit.',
			'Règles : une carte n’est jamais débitée deux fois pour une commande. Une commande n’est jamais expédiée sans être payée. Un client dont l’appel a expiré sait en moins d’une minute s’il a payé.',
			'Conçois le paiement, du clic sur Payer jusqu’à la commande marquée payée. Dis ce que fait ton code après un timeout, après un crash et après un webhook reçu deux fois.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où la clé d’idempotence est créée et stockée, et qu’elle existe avant le premier appel au prestataire.',
			'Ton design dit ce qu’un second clic sur Payer envoie au prestataire.',
			'Ton design dit ce que fait le code après un timeout de 10 secondes, et quelle clé porte le nouvel essai.',
			'Ton design dit comment un serveur qui a planté en plein appel apprend si la carte a été débitée.',
			'Ton design dit ce qui se passe quand le même webhook arrive deux fois, ou avant la réponse de l’API.',
			'Ton design dit combien de temps le prestataire garde une clé, et ce que fait ton code d’une commande toujours inconnue après ce délai.'
		],
		sample: [
			'Le clic sur Payer valide d’abord une ligne `orders` avec `state = \'payment_pending\'` et une colonne `payment_key` qui contient un nouvel UUID v4. Le serveur n’appelle Stripe qu’après ce commit, avec `Idempotency-Key: <payment_key>`. Un second clic envoie le même id de commande, retrouve la ligne et réutilise sa clé. La doc Stripe : "generate and persist a key for the operation and supply it to every attempt".',
			'Stripe "saves the status code and body of the first request made with a given idempotency key" : un nouvel essai avec la même clé reçoit cette réponse enregistrée, sans second débit. Après un timeout, le serveur réessaie jusqu’à 3 fois avec la même clé, en attendant 2 secondes, puis 4, puis 8. Si Stripe répond `409`, la première requête tourne encore, et la doc dit d’attendre et de réessayer "with that key and the same parameters".',
			'Ne réessaie jamais avec une nouvelle clé : la doc prévient que "A new key can start a second operation". Le panier est verrouillé tant que la commande est en `payment_pending`. Stripe compare les paramètres d’un nouvel essai à ceux de la première requête et renvoie une erreur s’ils diffèrent.',
			'Un serveur peut planter après le débit de la carte par Stripe et avant l’enregistrement de la réponse. Une tâche de reprise tourne toutes les 30 secondes et réessaie, avec sa clé stockée, chaque commande en `payment_pending` depuis plus de 30 secondes. Stripe renvoie la réponse enregistrée, et la tâche passe la commande à `paid` ou `failed`. Avec 20 timeouts par jour, cette tâche fait quelques appels par jour.',
			'Les webhooks donnent un second chemin vers la même réponse. La doc Stripe : "Webhook endpoints might occasionally receive the same event more than once", et Stripe ne garantit pas leur ordre. Le handler insère l’id de l’événement dans une table à clé unique et saute les ids déjà vus. Il lance ensuite `UPDATE orders SET state = \'paid\' WHERE id = <id> AND state = \'payment_pending\'`, donc un doublon tardif ne change rien.',
			'Stripe peut supprimer une clé dès qu’elle est "at least 24 hours old" (vieille d’au moins 24 heures), et une clé réutilisée après cela lance une nouvelle requête. La tâche de reprise arrête donc de réessayer une commande au bout de 12 heures. Elle met la commande sur une liste qu’une personne vérifie dans le tableau de bord Stripe, et plus rien ne la réessaie.',
			'Ce design coûte un commit en base avant chaque appel de paiement, soit 20 000 par jour. Un client dont l’appel a expiré voit « Paiement en cours » pendant jusqu’à 1 minute, au lieu d’une erreur et d’un bouton Payer. Une commande qui reste inconnue 12 heures demande une intervention humaine.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, quelle clé porte le nouvel essai après un timeout de 10 secondes, et d’où vient-elle ?',
		a: 'La même `payment_key` UUID, lue dans la ligne `orders` validée avant le premier appel. Stripe répond au nouvel essai avec le résultat enregistré de la première requête, donc la carte n’est débitée qu’une fois.'
	},
	sources: [
		{ title: 'Référence API Stripe : requêtes idempotentes', url: 'https://docs.stripe.com/api/idempotent_requests' },
		{ title: 'Doc Stripe : gestion des erreurs bas niveau, idempotence et nouveaux essais', url: 'https://docs.stripe.com/error-low-level' },
		{ title: 'Doc Stripe : webhooks, événements en double et ordre des événements', url: 'https://docs.stripe.com/webhooks' }
	]
};
