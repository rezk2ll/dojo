/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'chat',
	part: 'Temps réel',
	title: 'Une messagerie de groupe',
	minutes: 10,
	hook: [
		'Inès gère un club d’escalade de 480 membres. Chaque vendredi à 18 h, elle poste le point de rendez-vous du week-end dans le groupe du club, et en une minute 60 personnes répondent « je viens » ou « je passe ».',
		'Si son message arrive cinq minutes en retard chez la moitié des membres, dix personnes partent vers la mauvaise falaise. Si une réponse disparaît, quelqu’un perd sa place en voiture. Les membres remontent aussi au mois dernier pour retrouver la liste du matériel.',
		'Tu conçois l’appli qui transporte ces messages pour un million de personnes par jour.'
	],
	terms: [
		{ term: 'Passerelle (gateway)', def: 'Un serveur qui garde ouvertes les connexions WebSocket des clients et y pousse les nouveaux messages.' },
		{ term: 'Pub/Sub', def: 'Les canaux Redis : un éditeur envoie un message sur un nom de canal, et Redis le transmet à chaque client abonné à ce nom à cet instant.' },
		{ term: 'Fan-out', def: 'Transformer un message envoyé en une livraison par membre du groupe.' },
		{ term: 'Clé de partition', def: 'La partie de la clé d’une ligne qui choisit le nœud qui la stocke. Les lignes de même clé de partition sont rangées ensemble sur disque.' }
	],
	kata: {
		brief: [
			'1 million de personnes utilisent l’appli chaque jour. Au pic du soir, 300 000 sont connectées en même temps. Chaque utilisateur envoie environ 40 messages par jour, et le trafic au pic vaut 3 fois la moyenne de la journée.',
			'Un groupe compte de 2 à 500 membres, 30 en moyenne. Un message doit s’afficher en moins d’1 seconde chez chaque membre connecté. L’historique est gardé pour toujours et se charge du plus récent au plus ancien quand un membre remonte.',
			'Tes tests de charge montrent qu’une passerelle tient 50 000 connexions ouvertes. Un message pèse environ 200 octets. Les identifiants de message viennent d’un service qui distribue des ids triables de 64 bits : un id plus grand désigne un message plus récent.',
			'Un téléphone perd sa connexion pendant 30 secondes dans un tunnel. À la sortie, il doit afficher tous les messages manqués, dans l’ordre, sans doublon.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma donne le nombre de passerelles au pic, calculé à partir de 300 000 et 50 000.',
			'Ton schéma dit où le message est écrit avant que quiconque en soit prévenu.',
			'Ton schéma dit comment un message atteint des membres connectés à des passerelles différentes.',
			'Ton schéma dit comment le téléphone sorti du tunnel retrouve les messages manqués.',
			'Ton schéma dit ce qui empêche un message de s’afficher deux fois quand l’appli de l’expéditeur réessaie.',
			'Ton schéma donne le stockage par an, calculé à partir du nombre de messages et de 200 octets.',
			'Ton schéma dit comment l’historique d’un groupe de 5 ans est découpé pour qu’aucune partition ne grossisse sans fin.'
		],
		sample: [
			'Chaque client garde un WebSocket ouvert vers une passerelle. 300 000 connexions à 50 000 par passerelle font 6 serveurs ; la réponse type en fait tourner 8, pour qu’une panne laisse les autres sous 50 000 chacune. Une passerelle garde, pour chaque groupe, la liste de ses propres connexions qui appartiennent à ce groupe.',
			'Envoyer est un appel HTTP au service de chat. L’appli joint un id client au message. Le service écrit le message dans le stockage avec un nouvel id triable et garde l’id client : un nouvel essai avec le même id client renvoie le message déjà stocké au lieu de l’écrire une seconde fois. Le service ne publie le message sur le canal Redis `group:<group_id>` qu’après cette écriture.',
			'Chaque passerelle s’abonne à `group:<group_id>` pour tout groupe dont au moins un de ses utilisateurs est en ligne. Un message au club de 480 membres part une fois vers Redis, puis vers 8 passerelles au plus, et chaque passerelle l’écrit sur ses propres sockets. Les 480 livraisons se font dans les passerelles.',
			'Les chiffres au pic : 1 million d’utilisateurs à 40 messages font 40 millions par jour, 463 par seconde en moyenne et environ 1 400 par seconde au pic. Avec 30 membres par groupe, cela donne 42 000 livraisons par seconde, environ 5 250 par passerelle. Stockage : 40 millions fois 200 octets font 8 Go par jour, environ 2,9 To par an avant réplication.',
			'Le stockage reprend la clé que Discord a décrite pour sa table de messages Cassandra : `((channel_id, bucket), message_id)`, où le bucket se calcule à partir de l’id du message. Discord a choisi environ 10 jours par bucket pour garder chaque partition sous 100 Mo. Charger l’historique lit d’abord le bucket le plus récent, puis recule.',
			'La doc Redis indique que Pub/Sub livre au plus une fois : un abonné qui se déconnecte perd le message pour de bon. Pub/Sub ne sert donc que de voie rapide. Chaque téléphone retient le plus grand id de message vu par groupe. À la sortie du tunnel, il demande au service les messages d’id plus grand, les reçoit triés par id et ignore ceux qu’il a déjà.',
			'Le prix de ce choix : une passerelle qui perd sa connexion à Redis rate les messages en direct de tous ses utilisateurs. Ils ne les voient qu’une fois que leur appli a relu l’historique, ce qui prend plus d’1 seconde.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse type, comment le téléphone sorti du tunnel récupère-t-il les messages perdus par Pub/Sub ?',
		a: 'Il envoie le plus grand id de message vu dans chaque groupe et demande au service de chat tous les messages d’id plus grand, lus dans le stockage.'
	},
	sources: [
		{ title: 'Discord : How Discord Stores Billions of Messages (2017)', url: 'https://discord.com/blog/how-discord-stores-billions-of-messages' },
		{ title: 'Doc Redis : Redis Pub/Sub', url: 'https://redis.io/docs/latest/develop/pubsub/' }
	]
};
