/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'live-scores',
	part: 'Temps réel',
	title: 'Scores sportifs en direct',
	minutes: 10,
	hook: [
		'Dimanche, 21 h, finale de la coupe. 2 millions de personnes ont la page du match ouverte dans ton appli de sport : au bureau, dans le train, sur leur téléphone. Beaucoup ne peuvent pas regarder le match et le suivent uniquement sur cette page.',
		'Aujourd’hui, la page télécharge un fichier de score toutes les 30 secondes. Quand l’attaquant marque, le SMS d’un ami arrive avant que la page affiche 1-0.',
		'Le product owner veut voir le but sur tous les écrans moins de 2 secondes après la saisie par l’opérateur au stade.'
	],
	terms: [
		{ term: 'Server-sent events (SSE)', def: 'Une réponse HTTP que le serveur garde ouverte pour y écrire des événements, en `text/event-stream`. Le navigateur la lit avec `EventSource`.' },
		{ term: 'Fan-out', def: 'Envoyer un message reçu à de nombreux destinataires. Ici, un but part vers 2 millions de connexions ouvertes.' },
		{ term: 'Last-Event-ID', def: 'L’en-tête HTTP que l’`EventSource` du navigateur envoie quand il se reconnecte, avec l’`id` du dernier événement reçu.' },
		{ term: 'Tempête de reconnexions', def: 'Des milliers de clients qui se reconnectent dans la même seconde, parce que le serveur auquel ils étaient connectés s’est arrêté.' }
	],
	kata: {
		brief: [
			'Dans chaque stade, un opérateur saisit chaque événement dans un petit formulaire web : but, carton, remplacement, coup de sifflet. Un match en compte environ 150. Chaque événement dont la page a besoin pèse environ 200 octets de JSON.',
			'Le soir de la finale, 2 millions de spectateurs suivent la finale, et 20 autres matchs se jouent en même temps. Un spectateur qui ouvre la page à la 70e minute doit voir le score actuel tout de suite.',
			'Un but doit atteindre chaque page ouverte en moins de 2 secondes après le clic de l’opérateur sur Enregistrer. Ton test de charge montre qu’un serveur de connexions tient 50 000 connexions ouvertes, presque toutes inactives.',
			'Conçois le chemin entre le formulaire de l’opérateur et 2 millions d’écrans. Dis ce que voit un spectateur qui a perdu le réseau 20 secondes dans un tunnel.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit combien de serveurs tiennent les 2 millions de connexions ouvertes, et par quel nombre tu as divisé.',
			'Ton design dit combien de messages quittent tes serveurs pour un but, et combien d’octets cela représente.',
			'Ton design dit où le score actuel est stocké, pour qu’un spectateur qui arrive à la 70e minute le voie aussitôt.',
			'Ton design dit ce que reçoit un navigateur qui se reconnecte après 20 secondes sans réseau.',
			'Ton design nomme l’étape qui peut perdre un message, et comment le spectateur finit quand même avec le bon score.',
			'Ton design dit ce qui se passe quand un serveur de connexions meurt et que tous ses spectateurs se reconnectent dans la même seconde.'
		],
		sample: [
			'Le formulaire de l’opérateur poste vers une API de score. L’API insère l’événement dans une table PostgreSQL `match_events`, dont la colonne `id` ne fait que croître. Elle lance ensuite `PUBLISH match:<id>` dans Redis avec l’événement et son `id`. À l’ouverture, la page demande l’état actuel du match à l’API, puis ouvre une connexion SSE.',
			'2 000 000 de spectateurs divisés par 50 000 connexions par serveur donnent 40 serveurs de connexions. La réponse en prévoit 60, pour garder de la marge si quelques-uns tombent : environ 33 000 spectateurs chacun. Chaque serveur fait un seul `SUBSCRIBE` Redis pour les 21 matchs. Un `PUBLISH` atteint donc 60 abonnés, et chaque serveur écrit ensuite le but sur ses 33 000 connexions.',
			'Un but, c’est 2 millions d’écritures de 200 octets : 400 Mo sortent des 60 serveurs, environ 7 Mo chacun. Avec 150 événements, la finale entière fait environ 60 Go. L’horloge du match ne coûte aucun message : la page compte les minutes elle-même à partir de l’heure du coup d’envoi.',
			'La doc Redis : "Redis\' Pub/Sub exhibits at-most-once message delivery semantics", soit au plus une livraison par message. Un serveur de connexions qui perd son lien avec Redis pendant 3 secondes rate tous les événements de ces 3 secondes. Chaque serveur garde donc en mémoire les 200 derniers événements de chaque match. Après une reconnexion à Redis, il relit dans `match_events` toutes les lignes dont l’`id` dépasse le dernier qu’il a.',
			'Chaque événement SSE porte `id: <id>`. Quand le téléphone sort du tunnel, `EventSource` se reconnecte et envoie l’en-tête `Last-Event-ID` avec le dernier id vu. Le serveur renvoie depuis sa mémoire les événements qui suivent cet id : une reconnexion ne lit jamais PostgreSQL. 200 événements de 200 octets pour 21 matchs, cela fait environ 840 Ko par serveur.',
			'Quand un serveur meurt, ses 33 000 spectateurs se reconnectent. Le champ SSE `retry` fixe en millisecondes l’attente du navigateur avant de se reconnecter. Chaque serveur envoie à chaque connexion un `retry` tiré au hasard entre 1 000 et 10 000. Les 33 000 reconnexions s’étalent alors sur 9 secondes, environ 3 700 par seconde réparties sur 59 serveurs.',
			'La page est servie en HTTP/2. MDN prévient que sans HTTP/2, un navigateur ouvre au plus 6 connexions SSE par domaine, tous onglets confondus. Un supporter avec 7 onglets ouverts en HTTP/1.1 ne reçoit rien dans le septième.',
			'Ce design garde 2 millions de connexions ouvertes pendant tout le match. Chaque déploiement d’un serveur de connexions en coupe 33 000, donc les déploiements attendent la fin de la finale. Le load balancer doit avoir un délai d’inactivité plus long que l’écart entre deux événements, ou bien le serveur envoie une ligne de commentaire (`:`) toutes les 30 secondes.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, comment un téléphone resté 20 secondes sans réseau récupère-t-il le but manqué ?',
		a: 'À la reconnexion, `EventSource` envoie `Last-Event-ID` avec le dernier id reçu. Le serveur de connexions renvoie tous les événements qui suivent cet id, parmi les 200 qu’il garde en mémoire.'
	},
	sources: [
		{ title: 'Doc Redis : Pub/Sub, garanties de livraison', url: 'https://redis.io/docs/latest/develop/pubsub/' },
		{ title: 'MDN : utiliser les server-sent events', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events' },
		{ title: 'HTML Living Standard : server-sent events et l’en-tête Last-Event-ID', url: 'https://html.spec.whatwg.org/multipage/server-sent-events.html' }
	]
};
