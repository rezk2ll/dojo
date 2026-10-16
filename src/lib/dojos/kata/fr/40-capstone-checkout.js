/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capstone-checkout',
	part: 'Architecture',
	title: 'Synthèse : le paiement d’une boutique en ligne',
	minutes: 10,
	hook: [
		'Une boutique vend de l’électroménager et de l’électronique en ligne. Un jour normal, elle prend environ 30 commandes par minute. Vendredi prochain, elle fait une vente : 2 000 téléviseurs à moitié prix, annoncés à 400 000 abonnés de la newsletter à 9 h.',
		'L’an dernier, la vente a mal tourné de trois façons. Deux clients ont eu le dernier téléviseur d’un modèle. Une carte a été débitée deux fois après un timeout. Les e-mails de confirmation sont arrivés avec une heure de retard.',
		'Cet exercice rassemble des katas précédents : un stock qui ne passe jamais sous zéro, un paiement qui ne s’exécute jamais deux fois, et du travail qui sort du paiement par une file. Prends 15 minutes.'
	],
	terms: [
		{ term: 'Réservation', def: 'Du stock retiré du nombre disponible au moment de la commande, avant le paiement, et remis si le paiement n’arrive jamais.' },
		{ term: 'Clé d’idempotence', def: 'Une chaîne unique envoyée avec une requête, pour que le serveur reconnaisse une nouvelle tentative et renvoie le premier résultat au lieu de refaire le travail.' },
		{ term: 'Outbox', def: 'Une table écrite dans la même transaction que la commande, qui contient les messages (comme les e-mails) qu’un worker envoie ensuite.' }
	],
	kata: {
		brief: [
			'La boutique tourne sur 6 serveurs applicatifs et un primaire PostgreSQL. Les paiements par carte passent par Stripe. Un appel Stripe prend en général 1 à 2 secondes.',
			'Un jour normal : 500 requêtes par seconde, 30 commandes par minute, 3 articles par commande. Pour la vente, prévois 20 fois plus : 10 000 requêtes par seconde et 600 commandes par minute, presque toutes pour le même téléviseur.',
			'Règles : une unité n’est jamais vendue deux fois ; une carte n’est jamais débitée deux fois pour une commande ; l’e-mail de confirmation part moins d’une minute après le paiement ; une commande non payée rend son stock au bout de 15 minutes.',
			'Conçois le panier, l’étape commande et stock, l’étape paiement, les e-mails, et la façon dont la vente tient sur ce matériel.'
		],
		minutes: 15,
		checklist: [
			'Ton design écrit le SQL ou la règle qui empêche le stock du téléviseur de passer sous zéro.',
			'Ton design dit si l’appel Stripe se fait dans la transaction qui tient la ligne de stock.',
			'Ton design dit quelle clé la nouvelle tentative de paiement envoie, et ce que fait Stripe quand il voit cette clé deux fois.',
			'Ton design dit comment l’e-mail de confirmation est enregistré, pour qu’un crash après le paiement ne le perde pas.',
			'Ton design dit comment deux workers d’e-mails évitent d’envoyer le même e-mail.',
			'Ton design donne le nombre de commandes par seconde le jour de la vente, et la part des 10 000 requêtes par seconde qui arrive à PostgreSQL.',
			'Ton design dit quand et comment le stock d’une commande jamais payée revient en vente.'
		],
		sample: [
			'Garde le panier dans une table PostgreSQL `carts` : on n’y écrit que quand quelqu’un ajoute un article. Les pages produits et les listes viennent d’un cache devant l’application, donc la plupart des 10 000 requêtes par seconde n’arrivent jamais à PostgreSQL. La vente demande 600 commandes par minute, soit 10 commandes par seconde.',
			'Passer une commande, c’est une transaction courte : insère la commande avec le statut `pending_payment`, puis pour chaque ligne lance `UPDATE stock SET available = available - 1 WHERE sku = $1 AND available >= 1`. Si l’UPDATE touche 0 ligne, l’article est épuisé et la transaction est annulée. En Read Committed, un second `UPDATE` sur la même ligne attend le commit du premier, puis réévalue le `WHERE` sur la nouvelle valeur : le stock ne peut pas passer sous zéro.',
			'L’appel Stripe se fait après ce commit, jamais dedans. Dedans, chaque acheteur du téléviseur attendrait 1 à 2 secondes le verrou de ligne tenu pendant le paiement de l’acheteur précédent : la ligne du téléviseur prendrait environ une commande par seconde au lieu de 10.',
			'Envoie l’id de commande comme `Idempotency-Key` Stripe. Sur un timeout, l’application réessaie avec la même clé. Stripe enregistre le code de statut et le corps de la première requête et les renvoie à chaque nouvelle tentative : la carte n’est débitée qu’une fois. Stripe peut purger les clés après 24 heures, donc les nouvelles tentatives s’arrêtent bien avant.',
			'Quand Stripe confirme, une transaction passe la commande à `paid` et insère une ligne dans `outbox`. Si l’application plante après ce commit, la ligne est toujours là. Deux workers d’e-mails lancent chacun `SELECT ... FROM outbox WHERE sent_at IS NULL LIMIT 50 FOR UPDATE SKIP LOCKED` et prennent ainsi des lignes que l’autre n’a pas verrouillées. À 10 commandes par seconde, ça fait 10 e-mails par seconde, largement dans la minute.',
			'Un job tourne chaque minute et annule les commandes `pending_payment` de plus de 15 minutes, en rajoutant leurs unités à `available` dans la même transaction.',
			'Le prix à payer : un téléviseur réservé par un acheteur qui abandonne apparaît épuisé jusqu’à 15 minutes. Un worker qui plante après l’envoi d’un e-mail et avant d’écrire `sent_at` le renvoie, donc un client peut recevoir deux confirmations.'
		]
	},
	quiz: [],
	recall: {
		q: 'Pourquoi l’appel Stripe se fait-il après le commit de la transaction de stock, et quelle clé la nouvelle tentative envoie-t-elle ?',
		a: 'Dans la transaction, chaque appel Stripe de 1 à 2 secondes tiendrait le verrou de la ligne du téléviseur : cette ligne prendrait environ une commande par seconde au lieu de 10. La nouvelle tentative envoie l’id de commande comme `Idempotency-Key`, et Stripe renvoie le premier résultat.'
	},
	sources: [
		{ title: 'Stripe API, Idempotent requests', url: 'https://docs.stripe.com/api/idempotent_requests' },
		{ title: 'PostgreSQL, isolation des transactions (Read Committed)', url: 'https://www.postgresql.org/docs/current/transaction-iso.html' },
		{ title: 'PostgreSQL, SELECT (clause de verrouillage et SKIP LOCKED)', url: 'https://www.postgresql.org/docs/current/sql-select.html' }
	]
};
