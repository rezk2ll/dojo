const SHOP = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';
const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'data-ownership',
	part: 'Entre les services',
	title: 'À qui appartiennent les données',
	minutes: 10,
	hook: [
		'Une boutique en ligne. Un client valide un panier de trois mugs. Le checkout a besoin du **prix d’un mug**. Ce prix se trouve dans les données du catalogue, à une lecture de fichier ou une chaîne de connexion près.',
		'Imagine maintenant le raccourci. Le checkout lit directement la table du catalogue. Ça marche le premier jour. Puis l’équipe catalogue renomme une colonne, ajoute des prix soldés ou change de stockage, et le checkout casse. Personne dans l’équipe catalogue ne savait même que le checkout lisait cette table.',
		'La solution est une règle, pas un outil : **chaque donnée a exactement un propriétaire**. Seul le propriétaire l’écrit. Tous les autres lui posent la question, gardent une copie alimentée par ses événements, ou gardent juste une référence.'
	],
	terms: [
		{ term: 'Propriétaire', def: 'Le seul service autorisé à écrire une donnée. C’est lui qui fait respecter les règles (invariants) sur cette donnée.' },
		{ term: 'Base d’intégration', def: 'Une seule base partagée par plusieurs applications comme moyen d’échanger des données. L’anti-pattern du jour.' },
		{ term: 'Événement publié', def: 'Un message que le propriétaire envoie après un changement (« prix modifié »), pour que les autres puissent réagir sans lire sa base.' },
		{ term: 'Copie', def: 'Une donnée que tu gardes sans en être propriétaire. Elle peut devenir périmée, donc tu dois savoir qui la met à jour, et ne jamais la modifier toi-même.' },
		{ term: 'Référence', def: 'Seulement l’id de la donnée de quelqu’un d’autre. Rien à synchroniser, mais il faut demander au propriétaire pour voir le contenu.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cat["Catalogue produits"] --> catdata[("Produits : noms, prix")]', 'cart["Service panier"] --> redis[("Redis : paniers")]', 'cur["Service devises"] --> rates[("Taux de change")]'],
				highlight: ['cat', 'cart', 'cur'],
				note: 'Dans la démo Online Boutique de Google, **chaque service a ses propres données**. Le catalogue garde les produits, le service panier garde les paniers dans Redis, le service devises garde les taux.'
			},
			{
				add: ['cart --> ref["CartItem : product_id, quantity"]'],
				highlight: ['ref'],
				note: 'Le panier garde une **référence** : l’id du produit et la quantité, rien d’autre. Pas de nom, pas de prix. Un changement de prix n’exige aucune synchronisation, car le panier n’a jamais eu le prix.'
			},
			{
				add: ['co["Checkout"] -->|"GetCart"| cart', 'co -->|"GetProduct pour chaque id"| cat', 'co -->|"convertir le prix"| cur'],
				highlight: ['co'],
				note: 'Au moment du paiement, le service **demande à chaque propriétaire**. Au panier les ids, au catalogue le prix, au service devises la conversion. Le checkout ne possède aucune de ces données.'
			},
			{
				add: ['co --> snap["OrderResult : articles avec leur coût"]', 'snap -->|"confirmation"| mail["Service e-mail"]'],
				highlight: ['snap', 'mail'],
				note: 'La commande est une **copie**, volontairement. Elle enregistre le prix payé par le client, même si le catalogue le change demain. Cette copie est un instantané : elle ne doit jamais suivre le propriétaire.'
			},
			{
				add: ['co -.->|"lit les produits directement"| catdata'],
				highlight: ['catdata'],
				note: 'L’anti-pattern : le checkout lit lui-même les données du catalogue. Le **stockage du catalogue devient un contrat** avec une équipe qui l’ignore, et les règles de prix vivent à deux endroits.'
			}
		]
	},
	example: {
		title: 'src/checkoutservice/main.go : demander le prix au propriétaire',
		repo: 'GoogleCloudPlatform/microservices-demo',
		url: `${SHOP}/src/checkoutservice/main.go#L339-L357`,
		lang: 'go',
		code: `func (cs *checkoutService) prepOrderItems(ctx context.Context, items []*pb.CartItem, userCurrency string) ([]*pb.OrderItem, error) {
	out := make([]*pb.OrderItem, len(items))
	cl := pb.NewProductCatalogServiceClient(cs.productCatalogSvcConn)

	for i, item := range items {
		product, err := cl.GetProduct(ctx, &pb.GetProductRequest{Id: item.GetProductId()})
		if err != nil {
			return nil, fmt.Errorf("failed to get product #%q", item.GetProductId())
		}
		price, err := cs.convertCurrency(ctx, product.GetPriceUsd(), userCurrency)
		if err != nil {
			return nil, fmt.Errorf("failed to convert price of %q to %s", item.GetProductId(), userCurrency)
		}
		out[i] = &pb.OrderItem{
			Item: item,
			Cost: price}
	}
	return out, nil
}`,
		notes: [
			'**Le panier garde des références.** Dans le [`demo.proto`](' + SHOP + '/protos/demo.proto#L29-L32) partagé, un `CartItem`, c’est un `product_id` et une `quantity`. C’est tout ce que stocke le service panier.',
			'**Le propriétaire répond.** Pour chaque id, le checkout appelle `GetProduct` sur le catalogue et prend `price_usd` dans la réponse. Si le catalogue change sa façon de stocker les prix, ce code ne bouge pas, tant que l’API reste la même.',
			'**L’instantané.** `OrderItem` associe l’article du panier au `Cost` de ce moment-là. [`PlaceOrder`](' + SHOP + '/src/checkoutservice/main.go#L243-L277) additionne ces coûts, débite la carte et envoie l’`OrderResult` par mail. Cette copie est un fait qui appartient au checkout.',
			'Les copies alimentées par le propriétaire suivent la même règle : seul le propriétaire les modifie. Mastodon garde des copies locales des comptes d’autres serveurs. Quand un `Update` sur un compte arrive, il [rejette le contenu](' + MASTODON + '/app/lib/activitypub/activity/update.rb#L23-L27) sauf s’il concerne le propre compte de l’expéditeur (`@account.uri != object_uri`).'
		]
	},
	tradeoff: {
		gain: [
			'Chaque service voit les mêmes prix, parce qu’il n’y a qu’un seul endroit qui les modifie.',
			'Le propriétaire peut changer son schéma ou son stockage sans demander à personne. Seuls son API et ses événements sont des contrats.',
			'Une référence ne coûte rien à synchroniser : le panier stocke un id de produit et ne se soucie jamais des prix.'
		],
		cost: [
			'Le checkout dépend maintenant de la disponibilité du catalogue et du service devises. Si l’un des deux tombe, personne ne peut payer.',
			'Plus d’appels sur le chemin critique : un `GetProduct` par ligne de panier, chacun étant un aller-retour réseau.',
			'Les requêtes qui traversent plusieurs propriétaires deviennent difficiles. « Les paniers qui contiennent des produits retirés de la vente » ne peut pas être une seule requête dans le Redis du panier.'
		]
	},
	task: {
		prompt: 'Une appli de billetterie a trois services : Events (concerts, salles, plans de salle), Booking (réservations) et Accounts (clients). Pour chaque donnée, nomme le propriétaire, puis dis si Booking la possède, la copie ou la référence : (a) la date d’un concert, (b) le nombre de places libres, (c) le prix payé pour un billet, (d) l’e-mail d’un client, (e) l’id de la place à laquelle correspond un billet.',
		hint: 'Pour chacune, demande-toi : qui doit faire respecter une règle à son sujet ? Et Booking a-t-il besoin de la valeur du jour, ou de la valeur au moment de la vente ?',
		answer: [
			'(a) C’est **Events** le propriétaire. Booking peut garder une **copie** alimentée par des événements « concert reprogrammé », pour l’imprimer sur le billet, mais ne la modifie jamais.',
			'(b) C’est **Events** le propriétaire, puisqu’il détient le plan de salle. Booking **demande** à Events de bloquer des places et n’écrit jamais le compteur.',
			'(c) C’est **Booking** le propriétaire. C’est un fait de la vente, un instantané comme le `OrderItem.cost` d’Online Boutique.',
			'(d) C’est **Accounts** le propriétaire. Booking garde une **référence** (l’id du client) et demande au moment d’envoyer un mail, ou une copie alimentée par des événements « e-mail modifié ».',
			'(e) **Events** possède la place. Booking garde une **référence** : l’id de la place sur le billet.'
		]
	},
	quiz: [
		{
			q: 'Dans une boutique faite de services, le checkout a besoin du prix actuel d’un produit. Quelle approche respecte la propriété des données ?',
			options: [
				'Lire directement la base du catalogue, en lecture seule',
				'Garder une colonne prix dans le panier et la mettre à jour à la main',
				'Coder les prix en dur dans la configuration du checkout',
				'Demander au service catalogue via son API'
			],
			answer: 3,
			why: 'Le catalogue possède les prix, donc c’est lui qui répond. Une lecture directe fait de son stockage un contrat, une colonne dans le panier est une copie sans propriétaire, et un prix codé en dur est une copie qui ne se met jamais à jour.'
		},
		{
			q: 'Une commande stocke le prix de chaque article. Pourquoi est-il juste que cette copie ne suive pas les changements de prix ultérieurs ?',
			options: [
				'Le checkout ne peut plus joindre le catalogue après la commande',
				'La commande enregistre ce que le client a accepté de payer. C’est un fait de la vente, qui appartient à la commande',
				'Les changements de prix sont trop rares pour compter',
				'Le catalogue interdit aux autres services de stocker des prix'
			],
			answer: 1,
			why: 'Certaines copies sont des instantanés, volontairement. Le prix au moment du paiement est un nouveau fait, et la commande en est propriétaire. Le catalogue reste propriétaire du prix actuel.'
		},
		{
			q: 'Un rapport a besoin, par produit, du nombre d’unités commandées le mois dernier. Quelle approche respecte la propriété des données ?',
			options: [
				'Donner au job de reporting un accès en lecture seule à la base de chaque service : une lecture ne peut rien casser',
				'Laisser le checkout écrire les totaux dans la base du catalogue',
				'Construire le rapport à partir des événements ou des API des propriétaires, dans un stockage qui appartient au job de reporting',
				'Copier toutes les bases chaque nuit et faire les jointures'
			],
			answer: 2,
			why: 'Les propriétaires disent ce qu’ils savent via des contrats qu’ils ont choisis. Même une connexion en lecture seule fait de leurs schémas un contrat, et un dump nocturne, c’est la même lecture en gros. Des totaux écrits dans la base du catalogue lui donnent deux écrivains.'
		}
	],
	takeaway: 'Un seul propriétaire écrit chaque donnée. Tous les autres gardent une copie alimentée par ses événements, ou juste son id, et n’écrivent jamais ni l’une ni l’autre.',
	sources: [
		{ title: 'Martin Fowler, IntegrationDatabase', url: 'https://martinfowler.com/bliki/IntegrationDatabase.html' },
		{ title: 'Chris Richardson, Database per service', url: 'https://microservices.io/patterns/data/database-per-service.html' },
		{ title: 'Online Boutique, README: the services and what each one holds', url: `${SHOP}/README.md?plain=1#L24-L38` },
		{ title: 'Online Boutique, demo.proto', url: `${SHOP}/protos/demo.proto#L29-L32` },
		{ title: 'Online Boutique, checkoutservice/main.go', url: `${SHOP}/src/checkoutservice/main.go#L230-L357` }
	]
};
