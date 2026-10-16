/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'thumbnails',
	part: 'Petits services',
	title: 'Des miniatures d’images',
	minutes: 10,
	hook: [
		'Une appli de photos de famille redimensionne chaque photo pendant la requête d’envoi. Un dimanche soir, un père envoie 40 photos d’un anniversaire depuis une connexion mobile faible.',
		'Chaque envoi attend que le serveur fabrique trois tailles. Des requêtes atteignent le délai de 30 secondes, l’appli affiche « Échec de l’envoi », et il renvoie les mêmes photos.',
		'L’équipe veut que l’envoi se termine dès que les octets sont stockés, et que le redimensionnement se fasse ailleurs.'
	],
	terms: [
		{ term: 'URL présignée', def: 'Une URL que ton API signe pour qu’un téléphone envoie un objet directement dans le bucket, sans avoir ses propres identifiants de stockage.' },
		{ term: 'Notification d’événement', def: 'Un message que le service de stockage envoie quand un objet est créé dans un bucket. Ici, il part dans une file.' },
		{ term: 'Délai de visibilité', def: 'Dans Amazon SQS, le temps pendant lequel un message reçu reste caché aux autres workers. Si le worker ne le supprime pas dans ce délai, le message réapparaît.' }
	],
	kata: {
		brief: [
			'Les utilisateurs envoient **50 000 photos par jour**, de 4 Mo en moyenne. La plupart des envois ont lieu le soir, et le pic vaut 10 fois la moyenne de la journée.',
			'Chaque photo a besoin de trois tailles : 150 px (10 Ko), 600 px (60 Ko) et 1 200 px (250 Ko). Fabriquer les trois prend 1,5 seconde d’un cœur de CPU.',
			'Un envoi doit se terminer dès que la photo est stockée. Les miniatures doivent apparaître en moins d’une minute la plupart du temps. Une photo dont le redimensionnement échoue ne doit pas être perdue, et doit recevoir ses miniatures plus tard.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma montre où vont les octets de la photo pendant l’envoi, et qu’aucun serveur ne redimensionne avant de répondre à l’envoi.',
			'Ton design dit ce qui prévient les workers de redimensionnement qu’une nouvelle photo existe.',
			'Ton design donne les envois par seconde au pic et le nombre de cœurs de CPU dont les workers ont besoin.',
			'Ton design dit ce qui arrive à une photo quand un worker plante en plein redimensionnement.',
			'Ton design dit ce qui se passe quand la même photo est annoncée deux fois.',
			'Ton design dit ce que l’appli affiche tant que les miniatures n’existent pas.',
			'Ton design donne le stockage par an pour les originaux et pour les miniatures.'
		],
		sample: [
			'D’abord les chiffres. 50 000 photos par jour font 0,58 par seconde en moyenne, donc environ **6 par seconde au pic**. À 1,5 seconde de cœur chacune, le pic demande 9 cœurs. Trois workers de 4 cœurs donnent 12 cœurs, avec de la marge pour rattraper un retard.',
			'Le stockage : les originaux font 4 Mo × 50 000 = 200 Go par jour, environ 73 To par an. Les trois tailles ajoutent 320 Ko par photo : 16 Go par jour, environ 5,8 To par an. Les miniatures pèsent 8 % des octets.',
			'L’envoi : le téléphone demande à l’API une URL PUT présignée pour `originals/<photoId>.jpg` et envoie les octets directement dans Amazon S3. La doc S3 dit qu’une URL présignée permet un envoi "without requiring another party to have AWS security credentials or permissions". Les serveurs d’API ne portent jamais les 4 Mo : un envoi leur coûte une petite requête.',
			'S3 envoie une notification `ObjectCreated` dans une file Amazon SQS. Les workers lisent la file, lisent l’original, écrivent `thumbs/<photoId>/150.jpg`, `600.jpg` et `1200.jpg`, puis suppriment le message. La doc S3 : "Typically, event notifications are delivered in seconds but can sometimes take a minute or longer." Ça tient dans la minute de l’énoncé la plupart du temps.',
			'Un worker qui plante ne supprime jamais le message. Le délai de visibilité de la file vaut 60 secondes, bien au-dessus des 1,5 seconde de travail. Au bout de 60 secondes, le message réapparaît et un autre worker redimensionne la photo.',
			'La doc S3 dit aussi que les notifications sont "designed to be delivered at least once" (livrées au moins une fois), et que ses nouvelles tentatives peuvent créer des doublons. Ici, un doublon ne casse rien : un worker réécrit les trois mêmes clés avec les mêmes octets.',
			'Le choix principal est de redimensionner après l’envoi. Son prix : pendant quelques secondes, ou une minute un mauvais jour, une photo existe sans miniatures. L’appli affiche un carré gris à sa place et charge l’image de 150 px dès qu’elle existe.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, qu’est-ce qui donne ses miniatures à une photo quand un worker plante en plein travail ?',
		a: 'Le worker n’a jamais supprimé le message SQS : il réapparaît après le délai de visibilité de 60 secondes, et un autre worker redimensionne la photo.'
	},
	sources: [
		{ title: 'Amazon S3 User Guide, Amazon S3 Event Notifications', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html' },
		{ title: 'Amazon SQS Developer Guide, Visibility timeout', url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html' },
		{ title: 'Amazon S3 User Guide, Uploading objects with presigned URLs', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html' }
	]
};
