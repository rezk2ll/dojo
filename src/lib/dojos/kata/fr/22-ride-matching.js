/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ride-matching',
	part: 'Temps réel',
	title: 'Associer passagers et chauffeurs',
	minutes: 10,
	hook: [
		'Vendredi, 2 h du matin, les bars du centre-ville ferment. 400 personnes ouvrent l’appli de VTC en dix minutes, et chacune veut la voiture la plus proche.',
		'Le mois dernier, deux passagers de la même rue ont reçu le même chauffeur. L’un d’eux a attendu 12 minutes une voiture déjà partie avec l’autre.',
		'Le responsable des opérations demande deux choses : l’offre va au chauffeur libre le plus proche, et un chauffeur n’a jamais deux offres en même temps.'
	],
	terms: [
		{ term: 'Index géospatial', def: 'Une structure qui répond à « quels points sont à moins de 3 km d’ici ? » sans lire tous les points. Redis en stocke un dans un sorted set, rempli avec `GEOADD`.' },
		{ term: 'Verrou à expiration', def: 'Une clé qu’un seul processus peut créer, et qui s’efface d’elle-même après un délai fixé. En Redis : `SET key value NX EX 15`.' },
		{ term: 'Position périmée', def: 'La dernière position envoyée par un chauffeur avant que son appli arrête de répondre. Le chauffeur peut être loin, ou hors ligne.' }
	],
	kata: {
		brief: [
			'Une ville compte 30 000 chauffeurs connectés au pic. L’appli de chaque chauffeur envoie sa position toutes les 5 secondes, environ 100 octets. Au pic, les passagers envoient 500 demandes de course par minute.',
			'Un passager doit recevoir le chauffeur libre le plus proche moins de 2 secondes après avoir touché Commander. Le chauffeur a ensuite 15 secondes pour accepter, sinon l’offre passe au suivant. Un chauffeur n’a jamais deux offres à la fois.',
			'Un chauffeur dont l’appli n’envoie plus rien depuis 15 secondes (tunnel, batterie vide) ne doit plus recevoir d’offres. Ton test de charge montre qu’une instance Redis tient 50 000 commandes simples par seconde.',
			'Conçois le stockage des positions, la recherche d’un chauffeur pour une demande, et ce qui empêche deux demandes de la même seconde d’obtenir le même chauffeur.'
		],
		minutes: 10,
		checklist: [
			'Ton design donne le nombre de mises à jour de position par seconde, calculé à partir de 30 000 chauffeurs et de 5 secondes.',
			'Ton design dit où sont stockées les positions, et ce qui est perdu si ce stockage redémarre.',
			'Ton design dit comment une demande trouve les chauffeurs libres proches sans lire les 30 000 positions.',
			'Ton design dit ce qui empêche deux demandes de la même seconde de proposer le même chauffeur.',
			'Ton design dit ce qui arrive à une offre que le chauffeur ignore pendant 15 secondes.',
			'Ton design dit comment un chauffeur dont le téléphone s’est éteint il y a 2 minutes cesse de recevoir des offres.'
		],
		sample: [
			'30 000 chauffeurs toutes les 5 secondes, cela fait 6 000 mises à jour par seconde, environ 600 Ko par seconde en entrée. Des serveurs de localisation sans état les reçoivent. Pour un chauffeur libre, chaque mise à jour lance `GEOADD drivers:free <lon> <lat> driver:42` et `ZADD drivers:seen <unix time> driver:42`. Avec deux commandes par mise à jour, Redis reçoit 12 000 commandes par seconde, le quart de ce que le test de charge a tenu.',
			'Une demande lance `GEOSEARCH drivers:free FROMLONLAT <lon> <lat> BYRADIUS 3 km ASC COUNT 5 WITHDIST`. La doc : `ASC` trie "nearest first" (le plus proche d’abord), et `COUNT` renvoie "at most count matches". Redis ne lit que les chauffeurs de la grille autour du cercle, donc le coût dépend du nombre de chauffeurs près du passager. 500 demandes par minute, cela fait environ 8 par seconde.',
			'Deux demandes à 100 ms d’écart peuvent toutes deux obtenir `driver:42` en premier. Avant d’envoyer une offre, le matcher lance `SET offer:driver:42 <ride id> NX EX 15`. `NX` ne crée la clé que "if it does not already exist", donc un seul matcher réussit. L’autre reçoit une réponse nil et passe au suivant de ses 5 chauffeurs.',
			'`EX 15` efface la clé au bout de 15 secondes, le temps laissé au chauffeur pour accepter. Un chauffeur qui ignore l’offre peut en recevoir une autre ensuite, sans tâche de nettoyage. Quand le chauffeur accepte, la course est écrite dans PostgreSQL et `ZREM drivers:free driver:42` le retire de la recherche.',
			'`GEOADD` n’a aucune option d’expiration : un chauffeur dont le téléphone s’est éteint reste dans `drivers:free` à sa dernière position. Un balayeur tourne toutes les 5 secondes. Il lit dans `drivers:seen` les chauffeurs dont le score date de plus de 15 secondes et les retire des deux sets avec `ZREM`.',
			'Les positions vivent seulement dans la mémoire de Redis. Si Redis redémarre, `drivers:free` est vide, et chaque chauffeur libre revient dans les 5 secondes, à sa mise à jour suivante. La réponse accepte 5 secondes sans aucune association, pour ne pas écrire 6 000 lignes par seconde dans une base de données.',
			'La distance est une ligne droite : Redis connaît des coordonnées, pas les routes. Un chauffeur à 800 m de l’autre côté d’un fleuve sans pont peut passer devant un chauffeur à 1,2 km dans la même rue. Pour corriger, on demande à un service d’itinéraire le temps de trajet des 5 candidats, ce qui ajoute un appel par demande.',
			'Une position a jusqu’à 5 secondes. À 50 km/h, une voiture parcourt environ 70 m en 5 secondes : le chauffeur le plus proche sur la carte peut être à 70 m de l’endroit où Redis le place.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, qu’est-ce qui empêche deux demandes de la même seconde de proposer le même chauffeur ?',
		a: 'Avant d’envoyer une offre, le matcher lance `SET offer:driver:<id> <ride id> NX EX 15`. Un seul `SET` réussit ; l’autre matcher passe au chauffeur suivant, et la clé expire au bout de 15 secondes.'
	},
	sources: [
		{ title: 'Doc Redis : GEOSEARCH', url: 'https://redis.io/docs/latest/commands/geosearch/' },
		{ title: 'Doc Redis : GEOADD (l’index est un sorted set, on retire avec ZREM)', url: 'https://redis.io/docs/latest/commands/geoadd/' },
		{ title: 'Doc Redis : SET avec NX et EX', url: 'https://redis.io/docs/latest/commands/set/' }
	]
};
