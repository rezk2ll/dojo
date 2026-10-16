const REPO = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';
const MAIN = `${REPO}/src/checkoutservice/main.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'coupling-cohesion',
	part: 'Inside a service',
	title: 'Coupling and cohesion: what changes together lives together',
	minutes: 10,
	hook: [
		'Online Boutique is Google\'s demo shop: 11 services in five languages. You press "Place order". The checkout service, in Go, now calls **six other services** before it answers you.',
		'None of their code is imported. Yet if the payment service changes its request, checkout breaks. **Coupling** is how much one module has to know about another. **Cohesion** is how much the things inside one module belong together. You want low coupling between modules and high cohesion inside them.',
		'One rule of thumb covers both: **what changes together should live together**. Today you look for the places where Online Boutique keeps that rule, and the one place where it does not.'
	],
	terms: [
		{ term: 'Coupling', def: 'How much a module must know about another to work. More coupling means a change in one forces a change in the other.' },
		{ term: 'Cohesion', def: 'How closely the parts of one module belong to the same job. Low cohesion: a module that does two unrelated things.' },
		{ term: 'Static coupling', def: 'Visible in the code or build: imports, shared libraries, generated code. A compiler or a grep finds it.' },
		{ term: 'Dynamic coupling', def: 'Happens at run time: a gRPC call, a message on a queue. No import links the two sides, so grep cannot see it.' },
		{ term: 'Change together, live together', def: 'Code that changes for the same reason goes in one module. Code that changes for different reasons goes apart.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['front["frontend (Go)"] -->|"gRPC PlaceOrder"| co["checkoutservice (Go)"]'],
				highlight: ['front', 'co'],
				note: 'The README gives checkout one job: it "retrieves user cart, prepares order and orchestrates the payment, shipping and the email notification". One reason to change: **how an order is placed**.'
			},
			{
				add: ['co -->|GetCart| cart["cartservice"]', 'co -->|GetProduct| cat["productcatalogservice (Go)"]', 'co -->|Convert| cur["currencyservice (Node.js)"]', 'co -->|"GetQuote, ShipOrder"| ship["shippingservice (Go)"]', 'co -->|Charge| pay["paymentservice (Node.js)"]', 'co -->|SendOrderConfirmation| mail["emailservice (Python)"]'],
				highlight: ['cart', 'cat', 'cur', 'ship', 'pay', 'mail'],
				note: '**Dynamic coupling**, six times. Checkout learns each address from an environment variable at start up. No import of the other services\' Node.js, Python or Go code, so no compiler ever checks these arrows.'
			},
			{
				add: ['proto["protos/demo.proto"] -->|"protoc, into genproto"| co', 'proto -->|"protoc, into genproto"| front'],
				highlight: ['proto'],
				note: '**Static coupling**, on purpose. The Go services generate code from one shared file with `protoc`. The Node.js payment service loads its copy of `demo.proto` at start up instead. Either way, the contract is written down in one place.'
			},
			{
				add: ['money["money package"] -->|copied into| co', 'money -->|copied into| front'],
				highlight: ['money'],
				note: 'The broken rule. Money arithmetic sits in `src/checkoutservice/money` **and** `src/frontend/money`. The two `money.go` files differ only in their import path. A money rule that changes must change twice.'
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
			'Coupling has a **strength**, and you can read it here. Cart, catalog, currency, payment and shipping failures fail the order. Emptying the cart ignores its error with `_ =`. A failed email only logs a warning.',
			'The only import that touches the other services is `pb`, the generated code. The services are found by name at run time: [six `mustMapEnv` and six `mustConnGRPC` calls](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/src/checkoutservice/main.go#L111-L123). That coupling lives in the deployment config, not in Go.',
			'The shared contract: [`OrderResult` in demo.proto](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/protos/demo.proto#L208-L214). The protobuf guide says a field number "cannot be changed once your message type is in use because it identifies the field in the message wire format".',
			'Each service runs its own generator: [`genproto.sh`](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/src/checkoutservice/genproto.sh#L19-L23) calls `protoc` on `../../protos/demo.proto`. Change the proto, and every service that uses it must regenerate its code or refresh its copy.'
		]
	},
	tradeoff: {
		gain: [
			'Each service is cohesive: one capability, one language. Currency could be rewritten from Node.js to Go, and checkout would not notice as long as the contract holds.',
			'The contract is one `.proto` file. In the Go services, code generated from it is checked by the compiler, so a wrong type on a call fails the build.',
			'Weak coupling where it matters little: an email outage does not lose the order.'
		],
		cost: [
			'**Dynamic coupling still couples.** Five of the six calls must succeed, so one order needs five services up at the same moment.',
			'**A shared file is shared coupling.** Every service builds on the same `demo.proto`. A careless change to a field number breaks every consumer at once.',
			'**Copies drift.** The `money` package lives in two services. Nothing in the layout forces the copies to stay the same.'
		]
	},
	task: {
		prompt: 'A new rule: amounts must round the same way in the cart page and at checkout. Today the `money` code is copied into `frontend` and `checkoutservice`. Give two ways to make it live in one place, and the coupling each one adds.',
		hint: 'One place can be a library that both services import, or a service that both call. Which kind of coupling does each create?',
		answer: [
			'A shared Go module for `money`, imported by both. Static coupling: both must upgrade to get the fix, but the compiler checks every use.',
			'Make `currencyservice` own the arithmetic, since it already converts amounts. Dynamic coupling: one more network call per price, and one more service that must be up.',
			'Not an option: a third copy. That is how the drift started.',
			'The architect\'s question: does money arithmetic change for the same reason as currency conversion? If yes, the second option puts it where it belongs.'
		]
	},
	quiz: [
		{
			q: 'Two services talk only through gRPC. Neither imports the other\'s code. Are they coupled?',
			options: ['No, coupling needs an import', 'Only if they are written in the same language', 'Only if they share a database', 'Yes, at run time: a change to the request or response can break the caller'],
			answer: 3,
			why: 'That is dynamic coupling. No compiler links the two sides, so you need a shared contract and tests to see it.'
		},
		{
			q: 'Which sign points to **low cohesion** in a module?',
			options: ['It has many small files', 'It mixes code that changes for unrelated reasons, like network plumbing and tax rules', 'It is imported by many other modules', 'It has no tests'],
			answer: 1,
			why: 'Cohesion is about whether the contents belong together. Two reasons to change pull one module in two directions.'
		},
		{
			q: 'In Online Boutique, a failed confirmation email only logs a warning, while a failed payment fails the order. What does that show?',
			options: ['Coupling has a strength: the caller decides which failures it can live with', 'The email service is not really called', 'Python services cannot return gRPC errors', 'The payment service is statically coupled to checkout'],
			answer: 0,
			why: 'Both are runtime calls. Checkout treats one as required and one as best effort, which makes the email service a much weaker dependency.'
		}
	],
	takeaway: 'Put what changes together in one place, and treat every call between services as coupling that only a contract can see.',
	sources: [
		{ title: 'Online Boutique (microservices-demo), README', url: `${REPO}/README.md` },
		{ title: 'microservices-demo, checkoutservice/main.go, PlaceOrder', url: `${MAIN}#L230-L280` },
		{ title: 'microservices-demo, protos/demo.proto', url: `${REPO}/protos/demo.proto` },
		{ title: 'Protocol Buffers, Language Guide (proto 3)', url: 'https://protobuf.dev/programming-guides/proto3/' },
		{ title: 'Neal Ford, Mark Richards et al., Software Architecture: The Hard Parts (O\'Reilly, 2021)', url: 'https://www.developertoarchitect.com/books.html' }
	]
};
