/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'autocomplete',
	part: 'Les données',
	title: 'L’autocomplétion de recherche',
	minutes: 10,
	hook: [
		'Yusuf tape `iph` dans la barre de recherche d’une boutique d’électronique. Avant qu’il tape la lettre suivante, une liste se déroule : « iPhone 15 Pro », « coque iPhone 15 », « chargeur iPhone ». Il touche la première ligne.',
		'La première version de la boutique lançait `WHERE name ILIKE \'%iph%\'` sur la table des produits à chaque touche. Avec 1 million de lignes, chaque touche relisait toute la table, et la liste arrivait quand l’utilisateur avait fini de taper.',
		'Tu conçois le service de suggestions : 10 suggestions pour ce que l’utilisateur a tapé jusque-là, renvoyées avant la touche suivante.'
	],
	terms: [
		{ term: 'Completion suggester', def: 'Une fonction d’Elasticsearch qui renvoie les entrées indexées commençant par un préfixe donné, depuis une structure gardée en mémoire.' },
		{ term: 'Debounce', def: 'Le client attend un court instant après la dernière touche, puis envoie une seule requête pour le texte tapé à ce moment.' },
		{ term: 'Poids', def: 'Un nombre stocké avec chaque suggestion pour la classer, ici les ventes du produit sur 30 jours.' }
	],
	kata: {
		brief: [
			'Une boutique en ligne vend 1 million de produits. Un nom de produit fait environ 30 caractères et 4 mots, comme « Apple iPhone 15 Pro ». Environ 5 000 produits sont ajoutés chaque jour.',
			'Au pic, les utilisateurs lancent 400 recherches par seconde et tapent en moyenne 8 caractères par recherche. La boutique a mesuré qu’un client qui attend 100 ms après la dernière touche envoie 4 requêtes par recherche au lieu de 8. La moitié de ces requêtes portent sur un texte de 2 ou 3 caractères.',
			'La liste doit s’afficher dans les 100 ms qui suivent une requête. Elle doit trouver un mot placé n’importe où dans le nom : `pro` doit proposer « Apple iPhone 15 Pro ». Les meilleures ventes passent en premier.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit où le million de noms est cherché, sans parcourir la table des produits à chaque touche.',
			'Ton design dit comment `pro` trouve « Apple iPhone 15 Pro », où le mot cherché n’est pas le premier.',
			'Ton design dit comment les 10 suggestions sont classées.',
			'Ton design compte les requêtes par seconde qui atteignent le backend de recherche au pic, après ce que fait le client pour en envoyer moins.',
			'Ton design dit ce que fait le client quand la réponse pour `ip` arrive après la réponse pour `iph`.',
			'Ton design dit comment un produit ajouté aujourd’hui apparaît dans les suggestions.',
			'Ton design dit ce qui est mis en cache, et pour combien de temps.'
		],
		sample: [
			'400 recherches par seconde à 8 caractères chacune font 3 200 frappes par seconde. L’attente de 100 ms ramène ce chiffre à 1 600 requêtes par seconde.',
			'La moitié de ces requêtes, celles de 2 ou 3 caractères, reçoivent une réponse en cache gardée 10 minutes. Avec des minuscules et des chiffres, il existe au plus 36² + 36³ = 47 952 textes de ce genre, donc le cache reste petit. Environ 800 requêtes par seconde atteignent le backend.',
			'Le backend est un index Elasticsearch avec un champ `completion`. La doc dit que le completion suggester "uses data structures that enable fast lookups, but are costly to build and are stored in-memory" (rapide à lire, coûteux à construire, gardé en mémoire). Une requête envoie `"prefix": "iph"` avec `"size": 10` et reçoit les 10 entrées correspondantes au poids le plus haut.',
			'Le completion suggester compare depuis le début d’une entrée. Chaque produit est donc indexé avec une entrée par début de mot : « apple iphone 15 pro », « iphone 15 pro », « 15 pro » et « pro ». 1 million de noms donnent alors environ 4 millions d’entrées, chacune sous la limite par défaut `max_input_length` de 50 caractères.',
			'Chaque entrée porte comme poids les ventes du produit sur 30 jours, pour que les meilleures ventes passent en premier. Une tâche de nuit recalcule les poids et réindexe les produits. Un produit ajouté dans la journée est indexé tout de suite avec un poids de 1, et la doc dit que les nouvelles suggestions "can be made visible by refresh" : il apparaît après le prochain refresh de l’index.',
			'La doc prévient que les suggestions "return the full document _source by default". Un produit complet avec sa description alourdirait chaque réponse. La requête fixe `"_source": "name"`, et une réponse ne porte que l’identifiant du produit et son nom affiché.',
			'Chaque requête porte le texte pour lequel elle a été envoyée. Le client n’affiche une réponse que si ce texte correspond encore au contenu de la barre. Une réponse tardive pour `ip`, arrivée après celle pour `iph`, est jetée.',
			'Le prix de ce design est un second système à faire tourner à côté de la base des produits, alimenté par une tâche qui peut prendre du retard. Les poids ont jusqu’à un jour de retard. Le suggester ne trouve que des débuts de mots, donc `phone` ne trouve pas « iPhone ».'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse proposée, combien de requêtes par seconde atteignent Elasticsearch au pic, et qu’est-ce qui ramène les 3 200 frappes par seconde à ce chiffre ?',
		a: 'Environ 800. L’attente de 100 ms laisse 1 600 requêtes, et le cache de 10 minutes répond à la moitié qui fait 2 ou 3 caractères.'
	},
	sources: [
		{ title: 'Doc Elasticsearch : Suggesters (completion suggester)', url: 'https://www.elastic.co/docs/reference/elasticsearch/rest-apis/search-suggesters' }
	]
};
