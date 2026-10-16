/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'rate-limiter',
	part: 'Petits services',
	title: 'Un limiteur de débit',
	minutes: 10,
	hook: [
		'Lundi, 9 h 02. Un client déploie un script de synchro bogué : quand un appel échoue, il réessaie aussitôt, sans fin. En une minute, il envoie 40 000 requêtes à ton API publique.',
		'Tes 8 serveurs d’appli passent leur temps sur cette seule clé d’API. Les requêtes des 3 999 autres clients commencent à expirer, et la boîte du support se remplit.',
		'Le contrat dit que chaque clé a droit à 100 requêtes par minute. Aucun code ne le vérifie encore.'
	],
	terms: [
		{ term: 'Fenêtre fixe', def: 'Un compteur par clé pour chaque minute de l’horloge (12:00, 12:01...). Le compte repart de 0 quand la minute change.' },
		{ term: '429 Too Many Requests', def: 'Le statut HTTP d’un client qui a envoyé trop de requêtes dans un temps donné. Il peut porter un en-tête `Retry-After` qui dit quand réessayer.' },
		{ term: 'Fail open', def: 'Quand le limiteur lui-même est en panne, laisser passer les requêtes au lieu de toutes les refuser.' }
	],
	kata: {
		brief: [
			'Une API publique tourne sur **8 serveurs d’appli** derrière un répartiteur de charge. 4 000 clients l’appellent, chacun avec sa clé d’API. Ensemble, ils envoient 3 000 requêtes par seconde au pic.',
			'Chaque clé a droit à **100 requêtes par minute**, comptées sur les 8 serveurs ensemble. Une requête au-delà reçoit une erreur qui dit au client quand réessayer.',
			'Une courte rafale au-delà de la limite au changement de minute est acceptée. Un débit régulier au-dessus de 100 par minute ne l’est pas. La vérification peut ajouter un aller-retour réseau à chaque requête.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où vit le compteur d’une clé, pour que les 8 serveurs voient le même nombre.',
			'Ton design dit ce qui arrive au compteur à la fin d’une minute, et ce qui efface les vieux compteurs.',
			'Ton design dit combien d’opérations par seconde le stockage des compteurs reçoit au pic.',
			'Ton design nomme la réponse d’un client au-delà de la limite, et ce qu’elle lui dit.',
			'Ton design dit combien de requêtes une clé peut faire passer dans les 2 secondes autour d’un changement de minute.',
			'Ton design dit ce que l’API fait d’une requête quand le stockage des compteurs ne répond pas.'
		],
		sample: [
			'Pourquoi un compteur partagé : chacun des 8 serveurs pourrait autoriser 100 / 8, environ 12 requêtes par minute. Mais un client sur une seule connexion keep-alive reste sur un seul serveur, et n’aurait droit qu’à 12. Le compteur vit donc dans une instance Redis que les 8 serveurs appellent.',
			'Chaque requête lance `INCR rl:<key>:<minute>` et `EXPIRE rl:<key>:<minute> 120` dans un `MULTI` / `EXEC`. `<minute>` est l’heure Unix divisée par 60. La doc Redis montre cette forme dans son motif "rate limiter 1", avec `MULTI` et `EXEC` "to make sure that we\'ll both increment and set the expire at every API call" (pour que chaque appel incrémente et pose l’expiration).',
			'Si `INCR` renvoie plus de 100, le serveur répond `429 Too Many Requests` avec `Retry-After` égal aux secondes qui restent dans la minute. La RFC 6585 dit qu’une réponse 429 "MUST NOT be stored by a cache" : aucun proxy ne la resservira plus tard au client.',
			'La charge : 3 000 requêtes par seconde au pic font 3 000 transactions de 2 commandes, soit 6 000 commandes par seconde sur un seul Redis. Il existe au plus 4 000 clés par minute, et `EXPIRE 120` en garde au plus 2 minutes : 8 000 petites clés.',
			'Le prix des fenêtres fixes : un client peut envoyer 100 requêtes à 12:00:59 et 100 autres à 12:01:00. Une clé obtient donc **200 requêtes en 2 secondes**, ce que l’énoncé accepte. Un journal glissant l’empêcherait, mais il stocke un horodatage par requête, jusqu’à 100 par clé, au lieu d’un compteur.',
			'Si Redis ne répond pas en 50 ms, le serveur d’appli laisse passer la requête et l’écrit dans les logs. Tant que Redis est en panne, il n’y a plus de limite, et les 8 serveurs prennent tout le trafic qui arrive. Tout refuser à la place ferait d’une panne de Redis une panne complète de l’API.'
		]
	},
	quiz: [],
	recall: {
		q: 'Avec la fenêtre fixe de la réponse, combien de requêtes une clé peut-elle faire passer autour d’un changement de minute ?',
		a: '200 en environ 2 secondes : 100 à la fin d’une minute et 100 au début de la suivante. L’énoncé accepte cette rafale.'
	},
	sources: [
		{ title: 'Documentation Redis, INCR (Pattern: rate limiter)', url: 'https://redis.io/docs/latest/commands/incr/' },
		{ title: 'RFC 6585, Additional HTTP Status Codes, 4. 429 Too Many Requests', url: 'https://www.rfc-editor.org/rfc/rfc6585#section-4' }
	]
};
