/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'notifications',
	part: 'Temps réel',
	title: 'Les notifications',
	minutes: 10,
	hook: [
		'Marc vend des vélos d’occasion sur une appli de petites annonces. À 21 h 04, un acheteur commente son annonce. Marc veut une notification push sur son téléphone, une pastille dans l’appli, et pas d’e-mail : il les a coupés dans ses réglages.',
		'À 21 h 05, son téléphone vibre trois fois pour le même commentaire. Le service des commentaires a renvoyé son événement deux fois après une réponse lente. Marc coupe toutes les notifications, et l’acheteur suivant n’obtient jamais de réponse.',
		'Tu conçois le service qui décide qui est prévenu de quoi, sur quel canal, une seule fois.'
	],
	terms: [
		{ term: 'Canal', def: 'Un moyen de joindre un utilisateur : l’e-mail, le push sur le téléphone, ou la liste de notifications dans l’appli.' },
		{ term: 'Envoi (delivery)', def: 'Une ligne qui signifie « prévenir cet utilisateur de cet événement sur ce canal ». Sa clé est `(event_id, user_id, channel)`.' },
		{ term: 'Au moins une fois', def: 'L’expéditeur réessaie tant qu’il n’a pas d’accusé de réception, donc le destinataire peut recevoir le même événement plusieurs fois.' },
		{ term: 'Collapse id', def: 'L’en-tête APNs `apns-collapse-id`. Les requêtes push qui portent la même valeur s’affichent comme une seule notification sur le téléphone.' }
	],
	kata: {
		brief: [
			'D’autres services envoient des événements comme « nouveau commentaire sur l’annonce 8812 », avec un `event_id` unique. Ils livrent au moins une fois : sur un délai dépassé, ils renvoient le même événement.',
			'Le service fait 5 millions d’envois par jour : 2,5 millions dans l’appli, 2 millions en push et 0,5 million par e-mail. Le pic du soir vaut 6 fois la moyenne de la journée. Chaque utilisateur choisit, par catégorie, les canaux actifs.',
			'Le prestataire e-mail accepte 50 e-mails par seconde avec ton forfait. Le push passe par APNs pour les iPhone. Une ligne d’envoi pèse environ 300 octets, et les notifications de l’appli sont gardées 90 jours.',
			'Un utilisateur ne doit jamais voir deux fois la même notification sur le même canal, et un canal qu’il a coupé doit rester muet.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma dit ce qui se passe quand le service des commentaires envoie trois fois l’événement 8812.',
			'Ton schéma dit où les choix de canaux sont vérifiés, et ce qu’un changement de choix fait aux notifications déjà en attente.',
			'Ton schéma dit comment plusieurs workers se partagent les envois en attente sans que deux d’entre eux envoient le même.',
			'Ton schéma dit ce qui se passe quand un worker plante après que le prestataire a accepté le message, mais avant que le worker l’ait noté.',
			'Ton schéma donne le débit d’e-mails au pic et le compare aux 50 par seconde du prestataire.',
			'Ton schéma donne le stockage pour 90 jours d’envois.'
		],
		sample: [
			'Les événements arrivent dans un service de notifications. Il lit les choix de l’utilisateur pour la catégorie de l’événement, puis insère une ligne par canal actif dans une table PostgreSQL `deliveries` dont la clé primaire est `(event_id, user_id, channel)`. L’insertion utilise `ON CONFLICT DO NOTHING`. Quand l’événement 8812 revient, PostgreSQL n’insère aucune ligne, la commande renvoie 0, et le service s’arrête là.',
			'Le canal de l’appli n’a pas besoin d’expéditeur : l’appli lit les 50 lignes `in_app` les plus récentes de l’utilisateur dans la même table. Les lignes push et e-mail démarrent en `pending`. Les workers de chaque canal lancent `SELECT ... WHERE channel = \'push\' AND status = \'pending\' LIMIT 100 FOR UPDATE SKIP LOCKED`. PostgreSQL saute les lignes qu’un autre worker a verrouillées, donc deux workers ne prennent jamais le même envoi.',
			'Le service vérifie les choix une seule fois, quand il insère les lignes. Un utilisateur qui coupe le push à 21 h 05 reçoit quand même les push de 21 h 04 déjà en attente. La réponse type accepte ce trou : vérifier au moment d’envoyer ajouterait une lecture à chacun des 2 millions de push quotidiens.',
			'Un worker garde sa transaction ouverte pendant l’envoi, puis marque la ligne `sent` et valide. S’il plante entre l’envoi et la validation, la transaction se termine sans validation, PostgreSQL libère le verrou de ligne, et un autre worker renvoie le message. Pour le push, le worker met l’id de l’envoi dans `apns-collapse-id`, et le second push se fond dans le premier sur le téléphone. La doc d’Apple limite cette valeur à 64 octets. L’e-mail n’a pas ce mécanisme ici : un plantage au mauvais moment peut envoyer un e-mail en double.',
			'Les chiffres : 5 millions par jour font 58 par seconde en moyenne et environ 350 au pic. L’e-mail représente 0,5 million par jour, 5,8 par seconde en moyenne et environ 35 au pic, sous les 50 du prestataire. Stockage : 5 millions de lignes de 300 octets font 1,5 Go par jour, 135 Go pour 90 jours, sans compter les index. Une tâche de nuit supprime les lignes de plus de 90 jours.',
			'Le prix d’une table PostgreSQL utilisée comme file : chaque push et chaque e-mail coûte un verrou, une mise à jour et une validation sur le primaire. Ces 2,5 millions par jour donnent environ 175 mises à jour par seconde au pic, et la tâche de nuit supprime 5 millions de lignes.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse type, qu’est-ce qui empêche la troisième copie de l’événement 8812 de créer un troisième push ?',
		a: 'La clé primaire `(event_id, user_id, channel)` avec `INSERT ... ON CONFLICT DO NOTHING` : le doublon insère 0 ligne, donc aucun envoi n’est créé.'
	},
	sources: [
		{ title: 'Doc PostgreSQL : INSERT (ON CONFLICT)', url: 'https://www.postgresql.org/docs/current/sql-insert.html' },
		{ title: 'Doc PostgreSQL : SELECT (clause de verrouillage et SKIP LOCKED)', url: 'https://www.postgresql.org/docs/current/sql-select.html' },
		{ title: 'Doc Apple : Sending notification requests to APNs', url: 'https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns' }
	]
};
