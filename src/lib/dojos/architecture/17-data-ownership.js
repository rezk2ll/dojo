const SHOP = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';
const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'data-ownership',
	part: 'Between services',
	title: 'Who owns the data',
	minutes: 10,
	hook: [
		'A customer checks out three mugs in an online shop. Checkout needs **the price of a mug**. The price sits in the catalog\'s data, one file read or one connection string away.',
		'Say checkout reads the catalog\'s table directly. It works on day one. Then the catalog team renames a column, adds sale prices, or moves to another store, and checkout breaks. Nobody on the catalog team knew that checkout read that table.',
		'Services avoid this with one rule: **every piece of data has exactly one owner**, and only the owner writes it. Every other service asks the owner, keeps a copy fed by the owner\'s events, or keeps only a reference to it.'
	],
	terms: [
		{ term: 'Owner', def: 'The one service allowed to write a piece of data. It keeps the rules (invariants) about that data true.' },
		{ term: 'Published event', def: 'A message the owner sends after a change ("price changed"), so others can react without reading its database.' },
		{ term: 'Copy', def: 'Data you keep but do not own. It can go stale, so you must know who updates it, and you never edit it yourself.' },
		{ term: 'Reference', def: 'Only the id of someone else\'s data. There is nothing to keep in step, but you must ask the owner to see the content.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cat["Product catalog"] --> catdata[("Products: names, prices")]', 'cart["Cart service"] --> redis[("Redis: carts")]', 'cur["Currency service"] --> rates[("Exchange rates")]'],
				highlight: ['cat', 'cart', 'cur'],
				note: 'In Google\'s Online Boutique demo, **each service has its own data**. The catalog holds the products, the cart service holds carts in Redis, and the currency service holds the rates.'
			},
			{
				add: ['cart --> ref["CartItem: product_id, quantity"]'],
				highlight: ['ref'],
				note: 'The cart keeps a **reference**: product id and quantity, with no name and no price. A price change needs no sync, because the cart never had the price.'
			},
			{
				add: ['co["Checkout"] -->|"GetCart"| cart', 'co -->|"GetProduct for each id"| cat', 'co -->|"convert price"| cur'],
				highlight: ['co'],
				note: 'At checkout, the service **asks each owner**: the cart for the ids, the catalog for the price, and the currency service for the conversion. Checkout stores none of that data.'
			},
			{
				add: ['co --> snap["OrderResult: items with cost"]', 'snap -->|"confirmation"| mail["Email service"]'],
				highlight: ['snap', 'mail'],
				note: 'The order keeps a **copy** of each price: the price the customer paid, even if the catalog changes it tomorrow. This copy is a snapshot, so later catalog changes must never update it.'
			},
			{
				add: ['co -.->|"reads products directly"| catdata'],
				highlight: ['catdata'],
				note: 'Here checkout reads the catalog\'s data itself, and the catalog\'s database works as an integration database. The catalog team can no longer change its tables without breaking checkout, and **the pricing rules sit in two services**.'
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
			'Line 1 takes the cart items. In the shared [`demo.proto`](' + SHOP + '/protos/demo.proto#L29-L32), a `CartItem` is a `product_id` and a `quantity`, and the cart service stores nothing more.',
			'Line 6 calls `GetProduct` on the catalog for each id, and line 10 takes `price_usd` from the answer. If the catalog changes how it stores prices, this code does not change, as long as the API stays the same.',
			'Lines 14 to 16 pair the cart item with its `Cost` at that moment. [`PlaceOrder`](' + SHOP + '/src/checkoutservice/main.go#L243-L277) sums those costs, charges the card and mails the `OrderResult`. Checkout owns this copy, because it records the sale.',
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
			'Checkout now calls the catalog and the currency service on every order, so if either is down, no customer can pay.',
			'Each checkout makes more calls: one `GetProduct` per cart line, each one a network round trip.',
			'A question that spans owners needs data from several services. "Carts that contain discontinued products" cannot be one query in the cart\'s Redis.'
		]
	},
	task: {
		prompt: 'A ticketing app has three services: Events (concerts, venues, seat maps), Booking (reservations) and Accounts (customers). For each piece of data, name the owner, then say whether Booking owns it, copies it, or references it: (a) a concert\'s date, (b) the number of free seats, (c) the price paid for a ticket, (d) a customer\'s email, (e) the id of the seat a ticket is for.',
		hint: 'Ask of each: who must keep a rule about it true? And does Booking need today\'s value, or the value at the moment of sale?',
		answer: [
			'(a) Events is the owner. Booking can keep a **copy** fed by "concert rescheduled" events, to print on the ticket, but never edits it.',
			'(b) Events is the owner, since it holds the seat map. Booking **asks** Events to hold seats and never writes the count.',
			'(c) Booking is the owner. The price paid is a fact about the sale, a snapshot like Online Boutique\'s `OrderItem.cost`.',
			'(d) Accounts is the owner. Booking keeps a **reference** (the customer id) and asks when it sends a mail, or a copy fed by "email changed" events.',
			'(e) Events owns the seat. Booking keeps a **reference**: the seat id on the ticket.'
		],
		steps: [
			{
				title: 'Name each owner',
				questions: [
					{ q: 'Who owns (a), a concert\'s date?', options: ['Booking', 'Events', 'Accounts', 'Every service that prints it'], answer: 1, why: 'Events holds the concerts. It is the one place that changes a date.' },
					{ q: 'Who owns (b), the number of free seats?', options: ['Booking, since it sells the seats', 'Accounts, since customers take the seats', 'Events, since it holds the seat map', 'Events and Booking together'], answer: 2, why: 'The count follows from the seat map, and the seat map is Events\' data. Two writers would mean two sets of rules.' },
					{ q: 'Who owns (c), the price paid for a ticket?', options: ['Events, since it owns the concert', 'Accounts, since the customer paid', 'Whichever service sends the receipt', 'Booking: it is a fact about the sale'], answer: 3, why: 'The price paid is recorded by the sale, like `OrderItem.Cost` in Online Boutique.' },
					{ q: 'Who owns (d), a customer\'s email?', options: ['Booking', 'Events', 'Accounts', 'The mail server'], answer: 2, why: 'Accounts holds the customers, so it is the only service that writes their email.' }
				]
			},
			{
				title: 'Ask what Booking needs',
				questions: [
					{ q: 'For the price paid, does Booking need today\'s value or the value at the sale?', options: ['Today\'s value, read from Events', 'The value at the moment of sale', 'Neither: it never shows a price', 'Both, kept in step'], answer: 1, why: 'The ticket records what the customer agreed to pay. A later price change must not touch it.' },
					{ q: 'Which question helps you name the owner?', options: ['Which service runs fastest?', 'Which table is the biggest?', 'Who must keep a rule about it true?', 'Which service read it first?'], answer: 2, why: 'The owner is the one service that keeps the invariants about that data.' },
					{ q: 'Booking mails a customer. Which email does it need?', options: ['The email at the moment of sale', 'The email from the first booking', 'None: Booking never sends mail', 'The current one, so the mail reaches the customer'], answer: 3, why: 'An old email may no longer work. That is why Booking asks Accounts when it sends.' },
					{ q: 'In Online Boutique, which value does an order keep for each item?', options: ['The catalog\'s current price, read again on each view', 'The `Cost` at the moment of sale', 'Only the product id', 'The price in USD before conversion'], answer: 1, why: 'Checkout copies the price into `OrderItem.Cost`, a snapshot that later catalog changes never update.' }
				]
			},
			{
				title: 'Own, copy or reference',
				questions: [
					{ q: '(a) Booking prints the concert date on the ticket. What does it keep?', options: ['A copy fed by "concert rescheduled" events', 'Its own date, which it owns', 'A copy it edits when the venue calls', 'No date: tickets never show it'], answer: 0, why: 'A copy is fine as long as only the owner\'s events change it.' },
					{ q: '(c) What is the price paid, for Booking?', options: ['A copy fed by Events', 'A reference to Events\' price', 'Data Booking owns, a snapshot of the sale', 'A value it asks Events for each time'], answer: 2, why: 'The price paid is a new fact created by the sale, and Booking records the sale.' },
					{ q: '(e) What does a ticket keep about its seat?', options: ['Ownership of the seat', 'A copy of the whole seat map', 'Nothing at all', 'A reference: the seat id'], answer: 3, why: 'Events owns the seat. An id needs no keeping in step.' },
					{ q: '(d) Booking must mail the customer. Which of these is safe to keep?', options: ['Its own email column that it edits', 'A reference, the customer id, and ask Accounts when mailing', 'A copy typed in at booking and never updated', 'The email from the last booking'], answer: 1, why: 'A reference cannot go stale. A copy is safe only when Accounts\' "email changed" events feed it.' }
				]
			},
			{
				title: 'Say how Booking gets it',
				questions: [
					{ q: 'How does Booking take seats for a sale?', options: ['It asks Events to hold the seats, and never writes the count', 'It writes the count in Events\' table', 'It keeps its own count of free seats', 'It copies the seat map every night'], answer: 0, why: 'Only the owner writes. Booking asks, and Events keeps the count right.' },
					{ q: 'A concert is rescheduled. How does Booking\'s copy of the date change?', options: ['Booking edits it when a customer complains', 'Booking reads Events\' database each night', 'It never changes once a ticket is sold', 'Events publishes "concert rescheduled", and Booking updates its copy from it'], answer: 3, why: 'The owner sends the change, and the copy follows. No one reads Events\' tables.' },
					{ q: 'Who may change Booking\'s copy of a customer\'s email?', options: ['Booking, when a customer calls', 'Any service that has the id', 'Only the owner, through an "email changed" event from Accounts', 'Nobody, once it is stored'], answer: 2, why: 'Only the owner changes a copy. Mastodon rejects an `Update` about an account the sender does not own.' },
					{ q: 'Booking reads Events\' seat table directly, read-only. What goes wrong?', options: ['Nothing: a read-only query cannot break anything', 'Events can no longer change its tables without breaking Booking', 'Booking becomes the owner of the seats', 'Events must publish more events'], answer: 1, why: 'The table becomes an integration database. The owner loses the right to change its own schema.' }
				]
			}
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
			why: 'The catalog owns prices, so checkout asks it. A direct read ties checkout to the catalog\'s tables. A column in the cart is a copy that no owner updates, and a hard-coded price never updates at all.'
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
			why: 'The price at checkout is a new fact about the sale, and the order owns it. The catalog still owns the current price.'
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
			why: 'Events and APIs are the contracts the owners chose. A read-only connection still ties the report to their tables, and a nightly dump reads the same tables in bulk. Totals written into the catalog\'s database give that database two writers.'
		}
	],
	recall: {
		q: 'In Online Boutique, the cart stores a `product_id` and a `quantity`. How does checkout get the price, and where is the price paid kept?',
		a: 'Checkout calls `GetProduct` on the catalog, which owns prices. The price paid is copied into each `OrderItem` as `Cost`, a snapshot that checkout owns.'
	},
	sources: [
		{ title: 'Martin Fowler, IntegrationDatabase', url: 'https://martinfowler.com/bliki/IntegrationDatabase.html' },
		{ title: 'Chris Richardson, Database per service', url: 'https://microservices.io/patterns/data/database-per-service.html' },
		{ title: 'Online Boutique, README: the services and what each one holds', url: `${SHOP}/README.md?plain=1#L24-L38` },
		{ title: 'Online Boutique, demo.proto', url: `${SHOP}/protos/demo.proto#L29-L32` },
		{ title: 'Online Boutique, checkoutservice/main.go', url: `${SHOP}/src/checkoutservice/main.go#L230-L357` }
	]
};
