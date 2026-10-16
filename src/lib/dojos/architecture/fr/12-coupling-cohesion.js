const REPO = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';
const MAIN = `${REPO}/src/checkoutservice/main.go`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'coupling-cohesion',
	part: 'À l’intérieur d’un service',
	title: 'Couplage et cohésion dans un service de checkout',
	minutes: 10,
	hook: [
		'Online Boutique, c’est la boutique de démo de Google : 11 services dans cinq langages. Tu cliques sur « Place order ». Le service de checkout, en Go, appelle alors **six autres services** avant de te répondre.',
		'Le checkout n’importe le code d’aucun d’entre eux. Et pourtant, si le service de paiement change sa requête, le checkout casse. Le **couplage**, c’est ce qu’un module doit savoir d’un autre.',
		'La cohésion mesure à quel point les éléments d’un même module vont ensemble. Tu veux un couplage faible entre les modules et une cohésion forte à l’intérieur. Une règle empirique couvre les deux : le code qui change pour la même raison va dans un seul module. Online Boutique enfreint cette règle une fois, dans son package `money`.'
	],
	terms: [
		{ term: 'Couplage', def: 'Ce qu’un module doit savoir d’un autre pour fonctionner. Plus de couplage veut dire qu’un changement dans l’un force un changement dans l’autre.' },
		{ term: 'Cohésion', def: 'À quel point les parties d’un module servent le même travail. Cohésion faible : un module qui fait deux choses sans rapport.' },
		{ term: 'Couplage statique', def: 'Visible dans le code ou le build : imports, bibliothèques partagées, code généré. Un compilateur ou un grep le trouve.' },
		{ term: 'Couplage dynamique', def: 'Il se produit à l’exécution : un appel gRPC, un message dans une file. Aucun import ne relie les deux côtés, donc grep ne le voit pas.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['front["frontend (Go)"] -->|"gRPC PlaceOrder"| co["checkoutservice (Go)"]'],
				highlight: ['front', 'co'],
				note: 'Le README donne un seul travail au checkout : il « récupère le panier de l’utilisateur, prépare la commande et orchestre le paiement, la livraison et la notification par e-mail ». Le checkout change quand **la façon de passer une commande** change.'
			},
			{
				add: ['co -->|GetCart| cart["cartservice"]', 'co -->|GetProduct| cat["productcatalogservice (Go)"]', 'co -->|Convert| cur["currencyservice (Node.js)"]', 'co -->|"GetQuote, ShipOrder"| ship["shippingservice (Go)"]', 'co -->|Charge| pay["paymentservice (Node.js)"]', 'co -->|SendOrderConfirmation| mail["emailservice (Python)"]'],
				highlight: ['cart', 'cat', 'cur', 'ship', 'pay', 'mail'],
				note: 'Le checkout fait six appels gRPC, et chacun crée un couplage dynamique. Le checkout lit chaque adresse dans une variable d’environnement au démarrage. Il n’importe rien du code Node.js, Python ou Go des autres services : aucun compilateur ne vérifie ces flèches.'
			},
			{
				add: ['proto["protos/demo.proto"] -->|"protoc, vers genproto"| co', 'proto -->|"protoc, vers genproto"| front'],
				highlight: ['proto'],
				note: 'Les services Go génèrent du code depuis un seul fichier partagé avec `protoc`. Le service de paiement en Node.js, lui, charge sa copie de `demo.proto` au démarrage. Dans les deux cas, le contrat vient de `demo.proto` : un couplage statique choisi exprès.'
			},
			{
				add: ['money["package money"] -->|copié dans| co', 'money -->|copié dans| front'],
				highlight: ['money'],
				note: 'Ici, Online Boutique enfreint la règle. Les calculs monétaires se trouvent dans `src/checkoutservice/money` **et** dans `src/frontend/money`. Les deux fichiers `money.go` ne diffèrent que par leur chemin d’import. Une règle monétaire qui change doit changer deux fois.'
			}
		]
	},
	example: {
		title: 'src/checkoutservice/main.go, PlaceOrder',
		repo: 'GoogleCloudPlatform/microservices-demo',
		url: `${MAIN}#L230-L280`,
		lang: 'go',
		code: `func (cs *checkoutService) PlaceOrder(ctx context.Context, req *pb.PlaceOrderRequest) (*pb.PlaceOrderResponse, error) {
	…
	prep, err := cs.prepareOrderItemsAndShippingQuoteFromCart(ctx, req.UserId, req.UserCurrency, req.Address)
	if err != nil {
		return nil, status.Errorf(codes.Internal, err.Error())
	}
	…
	txID, err := cs.chargeCard(ctx, &total, req.CreditCard)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to charge card: %+v", err)
	}
	log.Infof("payment went through (transaction_id: %s)", txID)

	shippingTrackingID, err := cs.shipOrder(ctx, req.Address, prep.cartItems)
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "shipping error: %+v", err)
	}

	_ = cs.emptyUserCart(ctx, req.UserId)
	…
	if err := cs.sendOrderConfirmation(ctx, req.Email, orderResult); err != nil {
		log.Warnf("failed to send order confirmation to %q: %+v", req.Email, err)
	} else {
		log.Infof("order confirmation email sent to %q", req.Email)
	}`,
		notes: [
			'Le couplage a une **force**, et ces lignes la montrent. Les lignes 3 à 17 renvoient une erreur : une panne du panier, du catalogue, des devises, du paiement ou de la livraison fait échouer la commande. La ligne 19 ignore l’erreur du panier avec `_ =`. Les lignes 21 et 22 ne font que logger un avertissement quand l’e-mail échoue.',
			'Le seul import qui touche les autres services est `pb`, le code généré. Le checkout trouve les services par leur nom à l’exécution : [six appels `mustMapEnv` et six appels `mustConnGRPC`](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/src/checkoutservice/main.go#L111-L123). Les adresses viennent de la config de déploiement.',
			'Le contrat partagé : [`OrderResult` dans demo.proto](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/protos/demo.proto#L208-L214). Le guide protobuf dit qu’un numéro de champ « ne peut plus être changé une fois que ton type de message est utilisé, car il identifie le champ dans le format binaire du message ».',
			'Chaque service lance son propre générateur : [`genproto.sh`](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/src/checkoutservice/genproto.sh#L19-L23) appelle `protoc` sur `../../protos/demo.proto`. Si tu changes le proto, chaque service qui l’utilise doit régénérer son code ou rafraîchir sa copie.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque service a une seule capacité et un seul langage. Le service de devises pourrait être réécrit de Node.js en Go sans que le checkout s’en aperçoive, tant que le contrat tient.',
			'Le contrat, c’est un seul fichier `.proto`. Dans les services Go, le code généré à partir de lui est vérifié par le compilateur, donc un mauvais type dans un appel fait échouer le build.',
			'Le checkout se contente de logger un e-mail raté : une panne d’e-mail ne fait pas perdre la commande.'
		],
		cost: [
			'Cinq des six appels doivent réussir : une seule commande a besoin de cinq services disponibles au même moment.',
			'Chaque service se construit sur le même `demo.proto`. Un changement imprudent d’un numéro de champ casse tous les consommateurs d’un coup.',
			'Le package `money` existe dans deux services. Rien dans l’organisation du code n’oblige les deux copies à rester identiques.'
		]
	},
	task: {
		prompt: 'Nouvelle règle : les montants doivent être arrondis de la même façon sur la page panier et au checkout. Aujourd’hui, le code `money` est copié dans `frontend` et dans `checkoutservice`. Donne deux façons de le faire vivre à un seul endroit, et le couplage que chacune ajoute.',
		hint: 'Un seul endroit, ça peut être une bibliothèque que les deux services importent, ou un service que les deux appellent. Quel genre de couplage chacune crée-t-elle ?',
		answer: [
			'Un module Go partagé pour `money`, importé par les deux. Couplage statique : les deux doivent monter de version pour avoir la correction, mais le compilateur vérifie chaque usage.',
			'Confier les calculs à `currencyservice`, puisqu’il convertit déjà les montants. Couplage dynamique : un appel réseau de plus par prix, et un service de plus qui doit être disponible.',
			'Pas une option : une troisième copie. Il faudrait alors modifier trois fichiers pour chaque règle monétaire.',
			'La question de l’architecte : les calculs monétaires changent-ils pour la même raison que la conversion de devises ? Si oui, la deuxième option les met là où ils ont leur place.'
		]
	},
	quiz: [
		{
			q: 'Deux services ne se parlent que par gRPC. Aucun n’importe le code de l’autre. Sont-ils couplés ?',
			options: ['Non, le couplage demande qu’un côté importe le code de l’autre', 'Seulement s’ils sont écrits dans le même langage et partagent des types', 'Seulement s’ils partagent une base de données ou écrivent dans les mêmes tables','Oui, à l’exécution : un changement de la requête ou de la réponse peut casser l’appelant'],
			answer: 3,
			why: 'Un appel gRPC crée un couplage dynamique. Aucun compilateur ne relie les deux côtés, donc il te faut un contrat partagé et des tests pour le voir.'
		},
		{
			q: 'Quel signe indique une **cohésion faible** dans un module ?',
			options: ['Il est découpé en beaucoup de petits fichiers répartis dans plusieurs dossiers', 'Il mélange du code qui change pour des raisons sans rapport, comme la plomberie réseau et la TVA', 'Il est importé par beaucoup d’autres modules, donc chaque changement se propage à tous', 'Il n’a pas de tests unitaires, donc personne ne sait quelles parties marchent encore'],
			answer: 1,
			why: 'Un module qui mélange plomberie réseau et TVA change pour deux raisons sans rapport. Chaque changement d’une partie t’oblige à toucher, tester et livrer l’autre.'
		},
		{
			q: 'Dans Online Boutique, un e-mail de confirmation raté ne fait que logger un avertissement, alors qu’un paiement raté fait échouer la commande. Qu’est-ce que ça montre ?',
			options: ['Le couplage a une force : l’appelant décide avec quelles pannes il peut vivre', 'Le service d’e-mail n’est pas vraiment appelé, juste mis en file pour plus tard', 'Les services Python ne peuvent pas renvoyer d’erreurs gRPC au checkout', 'Le service de paiement est couplé statiquement au checkout'],
			answer: 0,
			why: 'Le checkout appelle les deux services en gRPC à l’exécution. Il traite le paiement comme obligatoire et l’e-mail comme du best effort : le service d’e-mail est donc une dépendance bien plus faible.'
		}
	],
	recall: {
		q: 'Le checkout appelle six services en gRPC et n’importe le code d’aucun. Quel genre de couplage est-ce, et quel code partagent-ils ?',
		a: 'Du couplage dynamique. Le seul code partagé est `pb`, que `protoc` génère à partir de `protos/demo.proto`.'
	},
	sources: [
		{ title: 'Online Boutique (microservices-demo), README', url: `${REPO}/README.md` },
		{ title: 'microservices-demo, checkoutservice/main.go, PlaceOrder', url: `${MAIN}#L230-L280` },
		{ title: 'microservices-demo, protos/demo.proto', url: `${REPO}/protos/demo.proto` },
		{ title: 'Protocol Buffers, Language Guide (proto 3)', url: 'https://protobuf.dev/programming-guides/proto3/' },
		{ title: 'Neal Ford, Mark Richards et al., Software Architecture: The Hard Parts (O\'Reilly, 2021)', url: 'https://www.developertoarchitect.com/books.html' }
	]
};
