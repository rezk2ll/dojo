const REPO = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';
const MAIN = `${REPO}/src/checkoutservice/main.go`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'coupling-cohesion',
	part: 'Inside a service',
	title: 'Coupling and cohesion in a checkout service',
	minutes: 10,
	hook: [
		'Online Boutique is Google\'s demo shop: 11 services in five languages. You press "Place order". The checkout service, in Go, now calls **six other services** before it answers you.',
		'Checkout imports none of their code. Yet if the payment service changes its request, checkout breaks. **Coupling** is how much one module has to know about another.',
		'Cohesion is how much the things inside one module belong together. You want low coupling between modules and high cohesion inside them. A rule of thumb covers both: code that changes for the same reason goes in one module. Online Boutique breaks that rule once, in its `money` package.'
	],
	terms: [
		{ term: 'Coupling', def: 'How much a module must know about another to work. More coupling means a change in one forces a change in the other.' },
		{ term: 'Cohesion', def: 'How closely the parts of one module belong to the same job. Low cohesion: a module that does two unrelated things.' },
		{ term: 'Static coupling', def: 'Visible in the code or build: imports, shared libraries, generated code. A compiler or a grep finds it.' },
		{ term: 'Dynamic coupling', def: 'Happens at run time: a gRPC call, a message on a queue. No import links the two sides, so grep cannot see it.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['front["frontend (Go)"] -->|"gRPC PlaceOrder"| co["checkoutservice (Go)"]'],
				highlight: ['front', 'co'],
				note: 'The README gives checkout one job: it "retrieves user cart, prepares order and orchestrates the payment, shipping and the email notification". Checkout changes when **the way an order is placed** changes.'
			},
			{
				add: ['co -->|GetCart| cart["cartservice"]', 'co -->|GetProduct| cat["productcatalogservice (Go)"]', 'co -->|Convert| cur["currencyservice (Node.js)"]', 'co -->|"GetQuote, ShipOrder"| ship["shippingservice (Go)"]', 'co -->|Charge| pay["paymentservice (Node.js)"]', 'co -->|SendOrderConfirmation| mail["emailservice (Python)"]'],
				highlight: ['cart', 'cat', 'cur', 'ship', 'pay', 'mail'],
				note: 'Checkout makes six gRPC calls, and each one is dynamic coupling. Checkout learns each address from an environment variable at start up. It imports none of the other services\' Node.js, Python or Go code, so no compiler checks these arrows.'
			},
			{
				add: ['proto["protos/demo.proto"] -->|"protoc, into genproto"| co', 'proto -->|"protoc, into genproto"| front'],
				highlight: ['proto'],
				note: 'The Go services generate code from one shared file with `protoc`. The Node.js payment service loads its copy of `demo.proto` at start up instead. In both cases the contract comes from `demo.proto`, a static coupling chosen on purpose.'
			},
			{
				add: ['money["money package"] -->|copied into| co', 'money -->|copied into| front'],
				highlight: ['money'],
				note: 'Here Online Boutique breaks the rule. Money arithmetic sits in `src/checkoutservice/money` **and** `src/frontend/money`. The two `money.go` files differ only in their import path. A money rule that changes must change twice.'
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
			'Coupling has a **strength**, and these lines show it. Lines 3 to 17 return an error, so a cart, catalog, currency, payment or shipping failure fails the order. Line 19 ignores the cart error with `_ =`. Lines 21 and 22 only log a warning when the email fails.',
			'The only import that touches the other services is `pb`, the generated code. Checkout finds the services by name at run time: [six `mustMapEnv` and six `mustConnGRPC` calls](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/src/checkoutservice/main.go#L111-L123). The addresses come from the deployment config.',
			'The shared contract: [`OrderResult` in demo.proto](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/protos/demo.proto#L208-L214). The protobuf guide says a field number "cannot be changed once your message type is in use because it identifies the field in the message wire format".',
			'Each service runs its own generator: [`genproto.sh`](https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389/src/checkoutservice/genproto.sh#L19-L23) calls `protoc` on `../../protos/demo.proto`. Change the proto, and every service that uses it must regenerate its code or refresh its copy.'
		]
	},
	tradeoff: {
		gain: [
			'Each service has one capability and one language. Currency could be rewritten from Node.js to Go, and checkout would not notice as long as the contract holds.',
			'The contract is one `.proto` file. In the Go services, code generated from it is checked by the compiler, so a wrong type on a call fails the build.',
			'Checkout only logs a failed email, so an email outage does not lose the order.'
		],
		cost: [
			'Five of the six calls must succeed, so one order needs five services up at the same moment.',
			'Every service builds on the same `demo.proto`. A careless change to a field number breaks every consumer at once.',
			'The `money` package lives in two services. Nothing in the layout forces the two copies to stay the same.'
		]
	},
	task: {
		prompt: 'A new rule: amounts must round the same way in the cart page and at checkout. Today the `money` code is copied into `frontend` and `checkoutservice`. Give two ways to make it live in one place, and the coupling each one adds.',
		hint: 'One place can be a library that both services import, or a service that both call. Which kind of coupling does each create?',
		answer: [
			'A shared Go module for `money`, imported by both. Static coupling: both must upgrade to get the fix, but the compiler checks every use.',
			'Make `currencyservice` own the arithmetic, since it already converts amounts. Dynamic coupling: one more network call per price, and one more service that must be up.',
			'Not an option: a third copy. Then three files must change for each money rule.',
			'The architect\'s question: does money arithmetic change for the same reason as currency conversion? If yes, the second option puts it where it belongs.'
		]
	},
	quiz: [
		{
			q: 'Two services talk only through gRPC. Neither imports the other\'s code. Are they coupled?',
			options: ['No, coupling needs one side to import the other side\'s code', 'Only if both services are written in the same language and share their types', 'Only if they share a database or write to the same tables', 'Yes, at run time: a change to the request or response can break the caller'],
			answer: 3,
			why: 'A gRPC call couples the two services at run time, which is dynamic coupling. No compiler links the two sides, so you need a shared contract and tests to see it.'
		},
		{
			q: 'Which sign points to **low cohesion** in a module?',
			options: ['It is split into many small files spread across several folders', 'It mixes code that changes for unrelated reasons, like network plumbing and tax rules', 'It is imported by many other modules, so each change ripples out to all of them', 'It has no unit tests, so nobody can say which parts of it still work'],
			answer: 1,
			why: 'A module that mixes network plumbing and tax rules changes for two unrelated reasons. Each change to one part forces you to touch, test and release the other.'
		},
		{
			q: 'In Online Boutique, a failed confirmation email only logs a warning, while a failed payment fails the order. What does that show?',
			options: ['Coupling has a strength: the caller decides which failures it can live with', 'The email service is not really called, only queued for a later retry', 'Python services cannot return gRPC errors, so checkout never sees a failure', 'The payment service is statically coupled to checkout, the email one is not'],
			answer: 0,
			why: 'Checkout calls both services over gRPC at run time. It treats payment as required and email as best effort, so the email service is a much weaker dependency.'
		}
	],
	recall: {
		q: 'Checkout calls six services over gRPC and imports none of their code. What kind of coupling is that, and which code do they share?',
		a: 'Dynamic coupling. The only shared code is `pb`, which `protoc` generates from `protos/demo.proto`.'
	},
	sources: [
		{ title: 'Online Boutique (microservices-demo), README', url: `${REPO}/README.md` },
		{ title: 'microservices-demo, checkoutservice/main.go, PlaceOrder', url: `${MAIN}#L230-L280` },
		{ title: 'microservices-demo, protos/demo.proto', url: `${REPO}/protos/demo.proto` },
		{ title: 'Protocol Buffers, Language Guide (proto 3)', url: 'https://protobuf.dev/programming-guides/proto3/' },
		{ title: 'Neal Ford, Mark Richards et al., Software Architecture: The Hard Parts (O\'Reilly, 2021)', url: 'https://www.developertoarchitect.com/books.html' }
	]
};
