/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'feature-flags',
	part: 'Petits services',
	title: 'Les feature flags',
	minutes: 10,
	hook: [
		'Vendredi, 16 h. Une équipe met en ligne une nouvelle page de paiement, cachée derrière un `if`. Elle veut la montrer d’abord à 10 % des utilisateurs, plus aux 40 personnes du support.',
		'À 16 h 20, le taux d’erreur de la nouvelle page grimpe. L’équipe veut la couper tout de suite. Un déploiement sur 200 serveurs prend 25 minutes, et chaque minute coûte des commandes.',
		'Un service de feature flags permet de changer ce `if` depuis un écran d’administration. Tu conçois ce service, avec au plus 30 secondes entre le clic et le dernier serveur qui applique la nouvelle règle.'
	],
	terms: [
		{ term: 'Feature flag', def: 'Un interrupteur nommé, comme `new-checkout`, que le code lit pendant l’exécution et dont les règles vivent hors du code.' },
		{ term: 'Déploiement progressif', def: 'Une règle qui active un flag pour un pourcentage d’utilisateurs, choisis par un hash de leur identifiant.' },
		{ term: 'Stickiness', def: 'Un même utilisateur reçoit la même réponse pour un flag à chaque requête et sur chaque serveur.' },
		{ term: 'Intervalle de rafraîchissement', def: 'La fréquence à laquelle chaque serveur va chercher les règles auprès du service de flags.' }
	],
	kata: {
		brief: [
			'Une boutique fait tourner son backend sur 200 serveurs. Les équipes produit gèrent 300 flags. Chaque flag a des règles : actif ou inactif, actif pour une liste d’identifiants, ou actif pour un pourcentage d’utilisateurs.',
			'Les 300 flags et leurs règles tiennent dans 120 Ko de JSON. La boutique compte 3 millions d’utilisateurs. Les admins modifient environ 20 flags par jour, et le flag le plus lu est testé à chaque affichage de page.',
			'Une modification faite dans l’écran d’administration doit atteindre les 200 serveurs en moins de 30 secondes. Un utilisateur dans les 10 % doit y rester à chaque requête et sur chaque serveur.',
			'Le service de flags peut tomber. La boutique doit continuer à vendre pendant la panne.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où un flag est évalué : dans la mémoire du serveur, ou par un appel réseau à chaque affichage de page.',
			'Ton design donne le délai maximal entre le clic sur « enregistrer » et le moment où le dernier des 200 serveurs applique la nouvelle règle.',
			'Ton design dit comment un utilisateur tombe dans les 10 % ou en dehors, de la même façon sur chaque serveur.',
			'Ton design dit ce qui arrive aux utilisateurs déjà inclus quand un admin passe le déploiement de 10 % à 25 %.',
			'Ton design compte les requêtes par seconde que les 200 serveurs envoient au service de flags.',
			'Ton design dit ce que fait un serveur quand le service de flags est en panne, en marche comme au démarrage.'
		],
		sample: [
			'Chaque serveur garde en mémoire les 120 Ko de règles et évalue les flags lui-même. Un affichage de page n’attend jamais le réseau pour un flag. Les SDK backend d’Unleash font pareil : le SDK "serves flag values from memory, without making additional requests" (il répond depuis sa mémoire, sans autre requête).',
			'Chaque serveur demande les règles toutes les 15 secondes, l’intervalle par défaut des SDK backend d’Unleash. Une modification enregistrée juste après un appel arrive sur ce serveur 15 secondes plus tard, plus la durée d’une requête. Le pire cas reste sous la limite de 30 secondes, avec 15 secondes de marge pour un appel lent.',
			'200 serveurs qui interrogent toutes les 15 secondes envoient environ 13 requêtes par seconde. Le serveur envoie la version qu’il possède dans `If-None-Match`. Si rien n’a changé, le service de flags répond `304 Not Modified`, sans corps. Après une modification, chaque serveur télécharge 120 Ko une fois : 24 Mo au total.',
			'Pour un pourcentage, le serveur hashe le nom du flag avec l’identifiant de l’utilisateur et obtient un nombre de 1 à 100. Le flag est actif si ce nombre est inférieur ou égal au pourcentage. Unleash hashe vers un nombre entre 0 et 100 avec MurmurHash, et sa doc précise : "Increasing the percentage keeps existing users in the rollout and adds new ones." À 10 %, environ 300 000 des 3 millions d’utilisateurs voient la nouvelle page, et ils la gardent quand on passe à 25 %.',
			'La liste d’identifiants reste petite : les 40 personnes du support tiennent dans moins de 1 Ko. Une liste de 500 000 identifiants ajouterait plusieurs Mo à chaque téléchargement. Pour un groupe de cette taille, la règle doit lire un attribut de l’utilisateur, comme `plan = beta`.',
			'Quand le service de flags est en panne, les serveurs gardent les dernières règles reçues. Chaque serveur écrit aussi les règles dans un fichier local après chaque téléchargement, pour qu’un serveur qui redémarre pendant la panne parte avec elles. Un serveur tout neuf, sans fichier, prend la valeur par défaut écrite dans le code : inactif.',
			'Le prix de l’interrogation périodique est une fenêtre de 15 secondes au plus où les serveurs ne sont pas d’accord. Un utilisateur dont deux requêtes tombent sur deux serveurs peut voir la nouvelle page de paiement, puis l’ancienne. Pousser les changements sur une connexion ouverte réduirait cette fenêtre, mais le service de flags tiendrait alors 200 connexions et devrait renvoyer l’état à chaque coupure.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, à quelle fréquence chaque serveur récupère-t-il les flags, et combien de requêtes par seconde le service de flags reçoit-il ?',
		a: 'Toutes les 15 secondes, donc les 200 serveurs envoient environ 13 requêtes par seconde, et la plupart reçoivent un 304 sans corps.'
	},
	sources: [
		{ title: 'Doc Unleash : Stickiness', url: 'https://docs.getunleash.io/concepts/stickiness' },
		{ title: 'Doc Unleash : vue d’ensemble des SDK (intervalles par défaut)', url: 'https://docs.getunleash.io/sdks' },
		{ title: 'MDN : If-None-Match', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-None-Match' }
	]
};
