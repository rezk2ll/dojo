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
		],
		steps: [
			{
				title: 'Find the copies',
				questions: [
					{ q: 'Where does the money arithmetic live today?', options: ['Only in `currencyservice`', 'In `src/checkoutservice/money` and `src/frontend/money`', 'In `protos/demo.proto`', 'In `cartservice`, next to the cart'], answer: 1, why: 'The package is copied into two services. That is where the diagram shows the rule being broken.' },
					{ q: 'How do the two `money.go` files differ?', options: ['In their rounding rules', 'One is Go, the other Node.js', 'Only in their import path', 'One has tests, the other has none'], answer: 2, why: 'They are the same code twice. Nothing in the layout keeps them that way.' },
					{ q: 'The rounding rule changes. What must happen with the code as it is?', options: ['It must change twice, once per copy', 'The compiler updates both copies', '`protoc` regenerates both copies', 'Only checkout needs the change'], answer: 0, why: 'Two copies of one rule means two edits, and two chances to make them differ.' },
					{ q: 'Which rule of thumb does the copy break?', options: ['Every service must use one language', 'Each service makes at most six calls', 'Every contract lives in a `.proto` file', 'Code that changes for the same reason goes in one module'], answer: 3, why: 'Money arithmetic changes for one reason but lives in two modules.' }
				]
			},
			{
				title: 'Try a shared library',
				questions: [
					{ q: 'First way: a shared Go module for `money`, imported by both. Which coupling does it add?', options: ['Dynamic coupling, at run time', 'Static coupling, visible in the build', 'No coupling at all', 'Coupling through a shared database'], answer: 1, why: 'An import is static coupling. It shows in the code and the build.' },
					{ q: 'What does the shared module gain?', options: ['No service needs a new release', 'Each service may keep its own rounding', 'The compiler checks every use', 'Checkout stops calling the payment service'], answer: 2, why: 'Both services build against one module, so a wrong call fails the build.' },
					{ q: 'What does it cost?', options: ['Both services must upgrade to get a fix', 'One more network call per price', 'One more service that must be up', 'A third copy of the code'], answer: 0, why: 'One source, but each importer picks up the fix only when it moves to the new version.' },
					{ q: 'How do you find this kind of coupling?', options: ['Only from traces at run time', 'A compiler or a grep finds it', 'Only from the deployment config', 'You cannot see it at all'], answer: 1, why: 'Static coupling lives in imports and shared libraries, so tools can see it.' }
				]
			},
			{
				title: 'Try a service',
				questions: [
					{ q: 'Second way: one service owns the arithmetic. Which one fits best?', options: ['`emailservice`', '`cartservice`', '`currencyservice`, since it already converts amounts', '`shippingservice`'], answer: 2, why: 'It already works on amounts, so the arithmetic sits next to a related job.' },
					{ q: 'How would `frontend` find `currencyservice` for the new call?', options: ['By importing its Node.js code', 'By scanning the cluster network', 'From `protos/demo.proto`', 'From an address in an environment variable, read at start up'], answer: 3, why: 'Like checkout\'s six `mustMapEnv` calls, the address comes from the deployment config. No import links the two sides, so grep cannot see this coupling.' },
					{ q: 'What does it cost?', options: ['Both services must upgrade to get a fix', 'One more network call per price, and one more service that must be up', 'The compiler stops checking the build', 'The `.proto` file goes away'], answer: 1, why: 'Dynamic coupling trades build checks for run time ones: the service must answer each time.' },
					{ q: 'Where would the new call\'s contract live?', options: ['In `protos/demo.proto`, like every other call', 'In the `money` package', 'In an environment variable', 'In the frontend templates'], answer: 0, why: 'Every service builds on the same `demo.proto`. A new call is a new entry there.' }
				]
			},
			{
				title: 'Decide',
				questions: [
					{ q: 'Someone suggests a third copy of `money`. Why say no?', options: ['It adds a network call per price', 'It breaks the proto field numbers', 'Then three files must change for each money rule', 'Go modules cannot be copied'], answer: 2, why: 'A copy makes the problem worse: one more place for the rule to drift.' },
					{ q: 'Which question picks between the two ways?', options: ['Does money arithmetic change for the same reason as currency conversion?', 'Which way needs fewer lines of code?', 'Which language runs faster?', 'Which team owns the frontend?'], answer: 0, why: 'Code that changes for the same reason belongs in one module.' },
					{ q: 'If the answer is yes, which way fits?', options: ['The shared Go module', 'Moving it into `currencyservice`', 'Keeping both copies', 'A third copy in checkout'], answer: 1, why: 'Then the arithmetic belongs with conversion, and the second option puts it there.' },
					{ q: 'You move it into `currencyservice`, and that service goes down. What happens to an order?', options: ['It goes through, and checkout logs a warning', 'Checkout falls back to its local copy', 'The frontend rounds the amount itself', 'It fails, as a currency failure already does today'], answer: 3, why: 'Checkout returns an error when the currency call fails. Currency was already a required dependency.' }
				]
			}
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
