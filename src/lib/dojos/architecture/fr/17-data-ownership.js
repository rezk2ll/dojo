const SHOP = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';
const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'data-ownership',
	part: 'Entre les services',
	title: 'À qui appartiennent les données',
	minutes: 10,
	hook: [
		'Dans une boutique en ligne, un client valide un panier de trois mugs. Le checkout a besoin du **prix d’un mug**. Ce prix se trouve dans les données du catalogue, à une lecture de fichier ou une chaîne de connexion près.',
		'Suppose que le checkout lise directement la table du catalogue. Ça marche le premier jour. Puis l’équipe catalogue renomme une colonne, ajoute des prix soldés ou change de stockage, et le checkout casse. Personne dans l’équipe catalogue ne savait que le checkout lisait cette table.',
		'Les services évitent ça avec une règle : **chaque donnée a exactement un propriétaire**, et lui seul l’écrit. Tout autre service lui pose la question, garde une copie alimentée par ses événements, ou garde seulement une référence.'
	],
	terms: [
		{ term: 'Propriétaire', def: 'Le seul service autorisé à écrire une donnée. C’est lui qui fait respecter les règles (invariants) sur cette donnée.' },
		{ term: 'Événement publié', def: 'Un message que le propriétaire envoie après un changement (« prix modifié »), pour que les autres puissent réagir sans lire sa base.' },
		{ term: 'Copie', def: 'Une donnée que tu gardes sans en être propriétaire. Elle peut dater, donc tu dois savoir qui la met à jour, et tu ne la modifies jamais toi-même.' },
		{ term: 'Référence', def: 'Seulement l’id de la donnée de quelqu’un d’autre. Tu n’as rien à synchroniser, mais tu dois demander au propriétaire pour voir le contenu.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cat["Catalogue produits"] --> catdata[("Produits : noms, prix")]', 'cart["Service panier"] --> redis[("Redis : paniers")]', 'cur["Service devises"] --> rates[("Taux de change")]'],
				highlight: ['cat', 'cart', 'cur'],
				note: 'Dans la démo Online Boutique de Google, **chaque service a ses propres données**. Le catalogue garde les produits, le service panier garde les paniers dans Redis, et le service devises garde les taux.'
			},
			{
				add: ['cart --> ref["CartItem : product_id, quantity"]'],
				highlight: ['ref'],
				note: 'Le panier garde une **référence** : l’id du produit et la quantité, sans nom ni prix. Un changement de prix n’exige aucune synchronisation, car le panier n’a jamais eu le prix.'
			},
			{
				add: ['co["Checkout"] -->|"GetCart"| cart', 'co -->|"GetProduct pour chaque id"| cat', 'co -->|"convertir le prix"| cur'],
				highlight: ['co'],
				note: 'Au moment du paiement, le service **demande à chaque propriétaire** : les ids au panier, le prix au catalogue, et la conversion au service devises. Le checkout ne stocke aucune de ces données.'
			},
			{
				add: ['co --> snap["OrderResult : articles avec leur coût"]', 'snap -->|"confirmation"| mail["Service e-mail"]'],
				highlight: ['snap', 'mail'],
				note: 'La commande garde une **copie** de chaque prix : celui que le client a payé, même si le catalogue le change demain. Cette copie est un instantané, donc les changements du catalogue ne doivent jamais la modifier.'
			},
			{
				add: ['co -.->|"lit les produits directement"| catdata'],
				highlight: ['catdata'],
				note: 'Ici, le checkout lit lui-même les données du catalogue, et la base du catalogue sert de base d’intégration. L’équipe catalogue ne peut plus changer ses tables sans casser le checkout, et **les règles de prix sont dans deux services**.'
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
			'La ligne 1 reçoit les articles du panier. Dans le [`demo.proto`](' + SHOP + '/protos/demo.proto#L29-L32) partagé, un `CartItem` contient un `product_id` et une `quantity`, et le service panier ne stocke rien d’autre.',
			'La ligne 6 appelle `GetProduct` sur le catalogue pour chaque id, et la ligne 10 prend `price_usd` dans la réponse. Si le catalogue change sa façon de stocker les prix, ce code ne bouge pas, tant que l’API reste la même.',
			'Les lignes 14 à 16 associent l’article du panier à son `Cost` de ce moment-là. [`PlaceOrder`](' + SHOP + '/src/checkoutservice/main.go#L243-L277) additionne ces coûts, débite la carte et envoie l’`OrderResult` par mail. Le checkout est propriétaire de cette copie, car elle enregistre la vente.',
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
			'Le checkout appelle maintenant le catalogue et le service devises à chaque commande, donc si l’un des deux tombe, aucun client ne peut payer.',
			'Chaque paiement fait plus d’appels : un `GetProduct` par ligne de panier, et chacun est un aller-retour réseau.',
			'Une question qui touche plusieurs propriétaires demande des données de plusieurs services. « Les paniers qui contiennent des produits retirés de la vente » ne peut pas être une seule requête dans le Redis du panier.'
		]
	},
	task: {
		prompt: 'Une appli de billetterie a trois services : Events (concerts, salles, plans de salle), Booking (réservations) et Accounts (clients). Pour chaque donnée, nomme le propriétaire, puis dis si Booking la possède, la copie ou la référence : (a) la date d’un concert, (b) le nombre de places libres, (c) le prix payé pour un billet, (d) l’e-mail d’un client, (e) l’id de la place à laquelle correspond un billet.',
		hint: 'Pour chacune, demande-toi : qui doit faire respecter une règle à son sujet ? Et Booking a-t-il besoin de la valeur du jour, ou de la valeur au moment de la vente ?',
		answer: [
			'(a) Events est le propriétaire. Booking peut garder une **copie** alimentée par des événements « concert reprogrammé », pour l’imprimer sur le billet, mais ne la modifie jamais.',
			'(b) Events est le propriétaire, puisqu’il détient le plan de salle. Booking **demande** à Events de bloquer des places et n’écrit jamais le compteur.',
			'(c) **Booking** est le propriétaire. Le prix payé est un fait de la vente, un instantané comme le `OrderItem.cost` d’Online Boutique.',
			'(d) Accounts est le propriétaire. Booking garde une **référence** (l’id du client) et demande au moment d’envoyer un mail, ou une copie alimentée par des événements « e-mail modifié ».',
			'(e) Events possède la place. Booking garde une **référence** : l’id de la place sur le billet.'
		],
		steps: [
			{
				title: 'Nomme chaque propriétaire',
				questions: [
					{ q: 'Qui est propriétaire de (a), la date d’un concert ?', options: ['Booking', 'Events', 'Accounts', 'Chaque service qui l’imprime'], answer: 1, why: 'Events détient les concerts. C’est le seul endroit qui change une date.' },
					{ q: 'Qui est propriétaire de (b), le nombre de places libres ?', options: ['Booking, puisqu’il vend les places', 'Accounts, puisque les clients prennent les places', 'Events, puisqu’il détient le plan de salle', 'Events et Booking ensemble'], answer: 2, why: 'Le compteur découle du plan de salle, et le plan de salle, ce sont les données d’Events. Deux écrivains voudraient dire deux jeux de règles.' },
					{ q: 'Qui est propriétaire de (c), le prix payé pour un billet ?', options: ['Events, puisqu’il possède le concert', 'Accounts, puisque c’est le client qui a payé', 'Le service qui envoie le reçu', 'Booking : c’est un fait de la vente'], answer: 3, why: 'Le prix payé est enregistré par la vente, comme `OrderItem.Cost` dans Online Boutique.' },
					{ q: 'Qui est propriétaire de (d), l’e-mail d’un client ?', options: ['Booking', 'Events', 'Accounts', 'Le serveur mail'], answer: 2, why: 'Accounts détient les clients, donc c’est le seul service qui écrit leur e-mail.' }
				]
			},
			{
				title: 'Demande ce dont Booking a besoin',
				questions: [
					{ q: 'Un concert passe de mai à juin. Quelle date doit afficher un billet vendu en avril ?', options: ['Mai, la date au moment de la vente', 'Juin, la valeur du jour chez Events', 'Les deux dates, côte à côte', 'Aucune date tant que le concert n’est pas confirmé'], answer: 1, why: 'Contrairement au prix payé, la date n’est pas un fait de la vente. Le client doit venir le jour où le concert a vraiment lieu.' },
					{ q: 'Quelle question t’aide à nommer le propriétaire ?', options: ['Quel service tourne le plus vite ?', 'Quelle table est la plus grosse ?', 'Qui doit faire respecter une règle à son sujet ?', 'Quel service l’a lue en premier ?'], answer: 2, why: 'Le propriétaire est le seul service qui fait respecter les invariants de cette donnée.' },
					{ q: 'Booking envoie un mail à un client. De quel e-mail a-t-il besoin ?', options: ['L’e-mail au moment de la vente', 'L’e-mail de la première réservation', 'Aucun : Booking n’envoie jamais de mail', 'L’e-mail actuel, pour que le mail arrive au client'], answer: 3, why: 'Un vieil e-mail peut ne plus marcher. C’est pour ça que Booking demande à Accounts au moment d’envoyer.' },
					{ q: 'Booking demande l’e-mail à Accounts à chaque envoi. Accounts est en panne. Que devient le mail ?', options: ['Il part vers l’e-mail de la dernière réservation', 'Il ne peut pas partir tant qu’Accounts ne répond pas', 'Il part vers une adresse par défaut', 'Booking lit la base d’Accounts à la place'], answer: 1, why: 'Demander au propriétaire, c’est dépendre de lui, comme le checkout et le catalogue dans Online Boutique. Une copie alimentée par des événements laisserait partir le mail.' }
				]
			},
			{
				title: 'Possède, copie ou référence',
				questions: [
					{ q: '(a) Booking imprime la date du concert sur le billet. Que garde-t-il ?', options: ['Une copie alimentée par des événements « concert reprogrammé »', 'Sa propre date, dont il est propriétaire', 'Une copie qu’il modifie quand la salle appelle', 'Aucune date : les billets ne l’affichent jamais'], answer: 0, why: 'Une copie convient tant que seuls les événements du propriétaire la modifient.' },
					{ q: '(d) Les billets gardent l’id du client. Un client change son e-mail. Que doit mettre à jour Booking ?', options: ['L’id sur chaque billet', 'Une copie de l’e-mail sur chaque billet', 'Rien : un id n’a pas besoin d’être synchronisé', 'La ligne du client dans Accounts'], answer: 2, why: 'L’id ne change pas. La prochaine fois que Booking demande à Accounts, il reçoit le nouvel e-mail.' },
					{ q: '(e) Que garde un billet à propos de sa place ?', options: ['La propriété de la place', 'Une copie de tout le plan de salle', 'Rien du tout', 'Une référence : l’id de la place'], answer: 3, why: 'Events possède la place. Un id n’a rien à synchroniser.' },
					{ q: '(d) Booking doit envoyer un mail au client. Laquelle de ces options est sûre ?', options: ['Sa propre colonne e-mail qu’il modifie', 'Une référence, l’id du client, et demander à Accounts au moment d’envoyer', 'Une copie saisie à la réservation et jamais mise à jour', 'L’e-mail de la dernière réservation'], answer: 1, why: 'Une référence ne peut pas dater. Une copie n’est sûre que si les événements « e-mail modifié » d’Accounts l’alimentent.' }
				]
			},
			{
				title: 'Dis comment Booking l’obtient',
				questions: [
					{ q: 'Comment Booking prend-il des places pour une vente ?', options: ['Il demande à Events de bloquer les places, et n’écrit jamais le compteur', 'Il écrit le compteur dans la table d’Events', 'Il tient son propre compteur de places libres', 'Il copie le plan de salle chaque nuit'], answer: 0, why: 'Seul le propriétaire écrit. Booking demande, et Events garde le compteur juste.' },
					{ q: 'Un concert est reprogrammé. Comment la copie de la date chez Booking change-t-elle ?', options: ['Booking la modifie quand un client se plaint', 'Booking lit la base d’Events chaque nuit', 'Elle ne change plus une fois le billet vendu', 'Events publie « concert reprogrammé », et Booking met sa copie à jour à partir de lui'], answer: 3, why: 'Le propriétaire envoie le changement, et la copie suit. Personne ne lit les tables d’Events.' },
					{ q: 'Qui peut modifier la copie de l’e-mail d’un client chez Booking ?', options: ['Booking, quand un client appelle', 'Tout service qui a l’id', 'Seulement le propriétaire, par un événement « e-mail modifié » d’Accounts', 'Personne, une fois qu’il est stocké'], answer: 2, why: 'Seul le propriétaire modifie une copie. Mastodon rejette un `Update` sur un compte que l’expéditeur ne possède pas.' },
					{ q: 'Booking lit directement la table des places d’Events, en lecture seule. Qu’est-ce qui coince ?', options: ['Rien : une requête en lecture seule ne peut rien casser', 'Events ne peut plus changer ses tables sans casser Booking', 'Booking devient propriétaire des places', 'Events doit publier plus d’événements'], answer: 1, why: 'La table devient une base d’intégration. Le propriétaire perd le droit de changer son propre schéma.' }
				]
			}
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
			why: 'Le catalogue possède les prix, donc le checkout lui demande. Une lecture directe lie le checkout aux tables du catalogue. Une colonne dans le panier est une copie qu’aucun propriétaire ne met à jour, et un prix codé en dur ne change jamais.'
		},
		{
			q: 'Une commande stocke le prix de chaque article. Pourquoi est-il juste que cette copie ne suive pas les changements de prix ultérieurs ?',
			options: [
				'Le checkout ne peut plus joindre le catalogue une fois la commande passée',
				'Elle garde ce que le client a accepté de payer, un fait de la vente qui lui appartient',
				'Les changements de prix sont trop rares pour valoir une synchro des anciennes commandes',
				'Le catalogue interdit aux autres services de stocker ses prix, même en copie'
			],
			answer: 1,
			why: 'Le prix au moment du paiement est un nouveau fait de la vente, et la commande en est propriétaire. Le catalogue reste propriétaire du prix actuel.'
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
			why: 'Les événements et les API sont les contrats que les propriétaires ont choisis. Une connexion en lecture seule lie quand même le rapport à leurs tables, et un dump nocturne lit les mêmes tables en gros. Des totaux écrits dans la base du catalogue donnent deux écrivains à cette base.'
		}
	],
	recall: {
		q: 'Dans Online Boutique, le panier stocke un `product_id` et une `quantity`. Comment le checkout obtient-il le prix, et où est gardé le prix payé ?',
		a: 'Le checkout appelle `GetProduct` sur le catalogue, qui possède les prix. Le prix payé est copié dans chaque `OrderItem` sous `Cost`, un instantané qui appartient au checkout.'
	},
	sources: [
		{ title: 'Martin Fowler, IntegrationDatabase', url: 'https://martinfowler.com/bliki/IntegrationDatabase.html' },
		{ title: 'Chris Richardson, Database per service', url: 'https://microservices.io/patterns/data/database-per-service.html' },
		{ title: 'Online Boutique, README: the services and what each one holds', url: `${SHOP}/README.md?plain=1#L24-L38` },
		{ title: 'Online Boutique, demo.proto', url: `${SHOP}/protos/demo.proto#L29-L32` },
		{ title: 'Online Boutique, checkoutservice/main.go', url: `${SHOP}/src/checkoutservice/main.go#L230-L357` }
	]
};
