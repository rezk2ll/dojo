const SHOP = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';
const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'data-ownership',
	part: 'Between services',
	title: 'Who owns the data',
	minutes: 10,
	hook: [
		'An online shop. A customer checks out three mugs. Checkout needs **the price of a mug**. The price sits in the catalog\'s data, one file read or one connection string away.',
		'Now picture the shortcut. Checkout reads the catalog\'s table directly. It works on day one. Then the catalog team renames a column, adds sale prices, or moves to another store, and checkout breaks. Nobody on the catalog team even knew checkout read that table.',
		'The fix is a rule, not a tool: **every piece of data has exactly one owner**. Only the owner writes it. Everyone else asks the owner, keeps a copy fed by the owner\'s events, or keeps just a reference to it.'
	],
	terms: [
		{ term: 'Owner', def: 'The one service allowed to write a piece of data. It keeps the rules (invariants) about that data true.' },
		{ term: 'Integration database', def: 'One database shared by several applications as their way to exchange data. The anti-pattern of today.' },
		{ term: 'Published event', def: 'A message the owner sends after a change ("price changed"), so others can react without reading its database.' },
		{ term: 'Copy', def: 'Data you keep but do not own. It can go stale, so you must know who updates it and never edit it yourself.' },
		{ term: 'Reference', def: 'Only the id of someone else\'s data. Nothing to keep in step, but you must ask the owner to see the content.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cat["Product catalog"] --> catdata[("Products: names, prices")]', 'cart["Cart service"] --> redis[("Redis: carts")]', 'cur["Currency service"] --> rates[("Exchange rates")]'],
				highlight: ['cat', 'cart', 'cur'],
				note: 'In Google\'s Online Boutique demo, **each service has its own data**. The catalog holds the products, the cart service holds carts in Redis, the currency service holds the rates.'
			},
			{
				add: ['cart --> ref["CartItem: product_id, quantity"]'],
				highlight: ['ref'],
				note: 'The cart keeps a **reference**: product id and quantity, nothing else. No name, no price. A price change needs no sync, because the cart never had the price.'
			},
			{
				add: ['co["Checkout"] -->|"GetCart"| cart', 'co -->|"GetProduct for each id"| cat', 'co -->|"convert price"| cur'],
				highlight: ['co'],
				note: 'At checkout, the service **asks each owner**. The cart for the ids, the catalog for the price, the currency service for the conversion. Checkout owns none of that data.'
			},
			{
				add: ['co --> snap["OrderResult: items with cost"]', 'snap -->|"confirmation"| mail["Email service"]'],
				highlight: ['snap', 'mail'],
				note: 'The order is a **copy**, on purpose. It records the price the customer paid, even if the catalog changes it tomorrow. This copy is a snapshot: it should never follow the owner.'
			},
			{
				add: ['co -.->|"reads products directly"| catdata'],
				highlight: ['catdata'],
				note: 'The anti-pattern: checkout reads the catalog\'s data itself. Now the **catalog\'s storage is a contract** with a team that does not know it, and the pricing rules live in two places.'
			}
		]
	},
	example: {
		title: 'src/checkoutservice/main.go: ask the owner for the price',
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
			'**The cart holds references.** In the shared [`demo.proto`](' + SHOP + '/protos/demo.proto#L29-L32), a `CartItem` is a `product_id` and a `quantity`. That is all the cart service stores.',
			'**The owner answers.** For each id, checkout calls `GetProduct` on the catalog and takes `price_usd` from the answer. If the catalog changes how it stores prices, this code does not change, as long as the API stays.',
			'**The snapshot.** `OrderItem` pairs the cart item with the `Cost` at that moment. [`PlaceOrder`](' + SHOP + '/src/checkoutservice/main.go#L243-L277) sums those costs, charges the card and mails the `OrderResult`. That copy is checkout\'s own fact.',
			'Copies fed by the owner follow the same rule: only the owner changes them. Mastodon keeps local copies of accounts from other servers. When an `Update` to an account arrives, it [rejects the payload](' + MASTODON + '/app/lib/activitypub/activity/update.rb#L23-L27) unless it is about the sender\'s own account (`@account.uri != object_uri`).'
		]
	},
	tradeoff: {
		gain: [
			'Every service sees the same prices, because there is one place that changes them.',
			'The owner can change its schema or storage without asking anyone. Only its API and its events are contracts.',
			'A reference costs nothing to keep in step: the cart stores a product id and never worries about prices.'
		],
		cost: [
			'Checkout now depends on the catalog and the currency service being up. If either is down, nobody can pay.',
			'More calls on the hot path: one `GetProduct` per cart line, each one a network round trip.',
			'Queries across owners get hard. "Carts that contain discontinued products" cannot be one query in the cart\'s Redis.'
		]
	},
	task: {
		prompt: 'A ticketing app has three services: Events (concerts, venues, seat maps), Booking (reservations) and Accounts (customers). For each piece of data, name the owner, then say whether Booking owns it, copies it, or references it: (a) a concert\'s date, (b) the number of free seats, (c) the price paid for a ticket, (d) a customer\'s email, (e) the id of the seat a ticket is for.',
		hint: 'Ask of each: who must keep a rule about it true? And does Booking need today\'s value, or the value at the moment of sale?',
		answer: [
			'(a) **Events** owns it. Booking can keep a **copy** fed by "concert rescheduled" events, to print on the ticket, but never edits it.',
			'(b) **Events** owns it, since it holds the seat map. Booking **asks** Events to hold seats and never writes the count.',
			'(c) **Booking** owns it. It is a fact about the sale, a snapshot like Online Boutique\'s `OrderItem.cost`.',
			'(d) **Accounts** owns it. Booking keeps a **reference** (the customer id) and asks when it sends a mail, or a copy fed by "email changed" events.',
			'(e) **Events** owns the seat. Booking keeps a **reference**: the seat id on the ticket.'
		]
	},
	quiz: [
		{
			q: 'In a shop built from services, checkout needs a product\'s current price. Which approach respects data ownership?',
			options: [
				'Read the catalog\'s database directly, read-only',
				'Keep a price column in the cart and update it by hand',
				'Hard-code the prices in checkout\'s configuration',
				'Ask the catalog service through its API'
			],
			answer: 3,
			why: 'The catalog owns prices, so it answers. A direct read makes its storage a contract, a column in the cart is a copy nobody owns, and a hard-coded price is a copy that never updates.'
		},
		{
			q: 'An order stores the price of each item. Why is it right that this copy does not follow later price changes?',
			options: [
				'Checkout loses its connection to the catalog once the order is placed',
				'It records what the customer agreed to pay, a fact of the sale the order owns',
				'Price changes are too rare to be worth syncing into old orders',
				'The catalog forbids other services from storing any of its prices'
			],
			answer: 1,
			why: 'Some copies are snapshots on purpose. The price at checkout is a new fact, and the order owns it. The catalog still owns the current price.'
		},
		{
			q: 'A report needs, per product, how many units were ordered last month. Which approach respects data ownership?',
			options: [
				'Give the reporting job read-only access to every service\'s database: a read cannot break anything',
				'Let checkout write the totals into the catalog\'s database',
				'Build the report from the owners\' events or APIs, into a store the reporting job owns',
				'Copy all the databases every night and join them'
			],
			answer: 2,
			why: 'The owners say what they know through contracts they chose. Even a read-only connection makes their schemas a contract, and a nightly dump is the same read in bulk. Totals written into the catalog\'s database give it two writers.'
		}
	],
	takeaway: 'One owner writes each piece of data. Everyone else keeps a copy fed by its events, or just its id, and never writes either.',
	sources: [
		{ title: 'Martin Fowler, IntegrationDatabase', url: 'https://martinfowler.com/bliki/IntegrationDatabase.html' },
		{ title: 'Chris Richardson, Database per service', url: 'https://microservices.io/patterns/data/database-per-service.html' },
		{ title: 'Online Boutique, README: the services and what each one holds', url: `${SHOP}/README.md?plain=1#L24-L38` },
		{ title: 'Online Boutique, demo.proto', url: `${SHOP}/protos/demo.proto#L29-L32` },
		{ title: 'Online Boutique, checkoutservice/main.go', url: `${SHOP}/src/checkoutservice/main.go#L230-L357` }
	]
};
