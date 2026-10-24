const GRPCGO = 'https://github.com/grpc/grpc-go/blob/3d85ab3cf6bf8c3e19d1a763baadd0062be2fca7';
const GRPC = 'https://github.com/grpc/grpc/blob/00224790d3bdded7a4fafe9425116874cea04d62/doc';
const K8S_BLOG = 'https://kubernetes.io/blog/2018/11/07/grpc-load-balancing-on-kubernetes-without-tears/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'grpc',
	part: 'Between services',
	title: 'gRPC over HTTP/2',
	minutes: 10,
	hook: [
		'A team deploys a small gRPC app on Kubernetes. The voting service runs several Pods behind a normal Service. The Kubernetes CPU graphs show one Pod doing all the work and the others idle.',
		'William Morgan described this case on the Kubernetes blog in 2018: "only one of the pods is receiving any traffic". The Service balances TCP connections, and a gRPC client sends all its calls over one HTTP/2 connection.',
		'A gRPC call is an HTTP/2 POST. Its headers name the method and can carry a `grpc-timeout`, and its body holds Protobuf messages. The balancer has to read those streams to spread calls, and the deadline has to be set by the client.'
	],
	terms: [
		{ term: 'Stream', def: 'One request and its response inside an HTTP/2 connection, with its own stream id. Each gRPC call uses one stream, and many streams share one TCP connection at the same time.' },
		{ term: 'Deadline', def: 'The point in time after which the client stops waiting for a call. gRPC sends it to the server as the `grpc-timeout` header, a duration left.' },
		{ term: 'Connection-level balancing', def: 'A layer 4 balancer chooses a backend when a TCP connection opens and sends every byte of that connection to the same backend.' },
		{ term: 'Request-level balancing', def: 'A client library or an HTTP/2 proxy chooses a backend for each call, so one client\'s calls spread over several backends.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['client["orders client: 1 channel"] -->|"one TCP + TLS connection"| kp["ClusterIP 10.96.0.20:50051"]', 'kp -->|"backend chosen at connect"| p1["Pod orders-1"]'],
				highlight: ['client', 'kp', 'p1'],
				note: 'The client opens one connection to the Service address. The kube-proxy rule on the node picks a Pod for this connection when it opens, here `orders-1`. With the default `pick_first` policy, gRPC sends "all RPCs sent on the channel" to that one address.'
			},
			{
				add: ['client -.->|"stream 1: HEADERS :path /orders.Orders/Create, grpc-timeout 2000000u; DATA"| kp'],
				highlight: ['client'],
				note: 'Each call is a new stream with an odd id: 1, 3, 5. Its HEADERS frame carries `:method POST`, `:path /orders.Orders/Create` and `grpc-timeout`. Its DATA frames carry the Protobuf message, prefixed by a 1-byte compressed flag and a 4-byte length.'
			},
			{
				add: ['p2["Pod orders-2: idle"]', 'p3["Pod orders-3: idle"]', 'kp -.-|"no new connection"| p2', 'kp -.-|"no new connection"| p3'],
				highlight: ['p2', 'p3'],
				note: 'Streams 3, 5 and every later call ride the same TCP connection, so the node never makes a new choice. `orders-2` and `orders-3` get no calls. The Kubernetes blog: "Once the connection is established, there\'s no more balancing to be done."'
			},
			{
				add: ['p1 -->|"after 2 s: DEADLINE_EXCEEDED"| client'],
				highlight: ['p1'],
				note: 'The client gave the call 2 seconds. When they run out, the client fails the call with `DEADLINE_EXCEEDED` (status 4), and the server cancels its side of the call. The gRPC docs: the server application "is responsible for stopping any activity it has spawned".'
			},
			{
				add: ['rr["client with round_robin, dns:/// on a headless Service"] -->|"call 1"| p1', 'rr -->|"call 2"| p2', 'rr -->|"call 3"| p3'],
				highlight: ['rr'],
				note: 'A grpc-go client can also balance each call itself. A headless Service name resolves to every Pod IP, and the `round_robin` policy opens a connection to each one. It sends "each successive RPC to the next successive subchannel". An HTTP/2 proxy such as Envoy or Linkerd is the other fix.'
			}
		]
	},
	example: {
		title: 'grpc-go internal/transport/http2_client.go: the headers of every call',
		repo: 'grpc/grpc-go',
		url: `${GRPCGO}/internal/transport/http2_client.go#L591-L627`,
		lang: 'go',
		code: `	headerFields := make([]hpack.HeaderField, 0, hfLen)
	headerFields = append(headerFields, hpack.HeaderField{Name: ":method", Value: "POST"})
	headerFields = append(headerFields, hpack.HeaderField{Name: ":scheme", Value: t.scheme})
	headerFields = append(headerFields, hpack.HeaderField{Name: ":path", Value: callHdr.Method})
	headerFields = append(headerFields, hpack.HeaderField{Name: ":authority", Value: callHdr.Host})
	headerFields = append(headerFields, hpack.HeaderField{Name: "content-type", Value: grpcutil.ContentType(callHdr.ContentSubtype)})
	headerFields = append(headerFields, hpack.HeaderField{Name: "user-agent", Value: t.userAgent})
	headerFields = append(headerFields, hpack.HeaderField{Name: "te", Value: "trailers"})
…
	if dl, ok := ctx.Deadline(); ok {
		// Send out timeout regardless its value. The server can detect timeout context by itself.
		// TODO(mmukhi): Perhaps this field should be updated when actually writing out to the wire.
		timeout := time.Until(dl)
		if timeout <= 0 {
			return nil, status.Error(codes.DeadlineExceeded, context.DeadlineExceeded.Error())
		}
		headerFields = append(headerFields, hpack.HeaderField{Name: "grpc-timeout", Value: grpcutil.EncodeDuration(timeout)})
	}`,
		notes: [
			'Line 2 makes every call an HTTP/2 `POST`. Line 4 puts the method name in `:path`, such as `/orders.Orders/Create`. An HTTP/2 proxy reads this header to route or balance each call, and a layer 4 balancer never sees it.',
			'Line 8 sends `te: trailers`. The [gRPC protocol doc](' + GRPC + '/PROTOCOL-HTTP2.md?plain=1#L30) says this header is "Used to detect incompatible proxies". The call status `grpc-status` comes back in the trailers, after the response body.',
			'Line 10 reads the deadline from the Go `context`. Line 13 turns it into the time left, and line 17 sends it as `grpc-timeout`. A context with no deadline sends no header, and the protocol doc says a server "should assume an infinite timeout".',
			'Lines 14 and 15 fail the call with `DeadlineExceeded` before any byte leaves when the time is already spent. On the server, [http2_server.go](' + GRPCGO + '/internal/transport/http2_server.go#L535-L539) wraps the stream in `context.WithTimeout(ctx, timeout)`, so the handler sees the same deadline.'
		]
	},
	tradeoff: {
		gain: [
			'One TCP and TLS connection carries many calls at once, so a call pays no handshake.',
			'The deadline travels with each call in the `grpc-timeout` header. The gRPC docs: Go and Java propagate it to outgoing calls by default, minus the time already spent.',
			'`round_robin` in the client spreads calls over all Pods with no proxy hop, using a headless Service name.'
		],
		cost: [
			'A layer 4 balancer, such as a normal Kubernetes Service, sends every call of a connection to one backend.',
			'gRPC sets no deadline by default, so a client can "end up waiting for a response effectively forever".',
			'A cancelled call stops only the gRPC stream. The server code must check its context and stop the work it started.'
		]
	},
	task: {
		prompt: 'A Go client calls a gRPC server with a context deadline. [`EncodeDuration`](' + GRPCGO + '/internal/grpcutil/encode_duration.go#L26-L62) picks the smallest unit of `n`, `u`, `m`, `S`, `M`, `H` whose value fits in 8 digits (at most 99,999,999). Write the `grpc-timeout` header sent when 50 ms, 1.5 s and 10 minutes are left.',
		hint: 'Convert to nanoseconds first. If the number has more than 8 digits, try microseconds, then milliseconds.',
		answer: [
			'50 ms is 50,000,000 ns: 8 digits, it fits. The header is `grpc-timeout: 50000000n`.',
			'1.5 s is 1,500,000,000 ns: 10 digits, too many. In microseconds it is 1,500,000, so the header is `1500000u`.',
			'10 minutes is 600,000,000,000 ns, then 600,000,000 µs (9 digits), both too many. In milliseconds it is 600,000: `600000m`.',
			'In practice `time.Until` on line 13 returns a little less than the round value, and `div` rounds the last unit up. A real header for 1.5 s is a few microseconds under `1500000u`.'
		],
		steps: [
			{
				title: 'Learn the rule',
				questions: [
					{ q: 'In which order does `EncodeDuration` try the units?', options: ['`H`, `M`, `S`, `m`, `u`, `n`: largest first', '`n`, `u`, `m`, `S`, `M`, `H`: smallest first', '`S` first, then smaller units', 'Whichever unit gives the shortest number'], answer: 1, why: 'It picks the smallest unit whose value fits. Starting from nanoseconds keeps as much precision as the header allows.' },
					{ q: 'What is the largest value that fits?', options: ['99,999,999, 8 digits', '999,999,999, 9 digits', '2,147,483,647, the 32-bit limit', '65,535, like a port'], answer: 0, why: 'The value must fit in 8 digits, so at most 99,999,999.' },
					{ q: 'What do `m` and `M` stand for?', options: ['Both mean milliseconds', '`m` is minutes, `M` is milliseconds', '`m` is milliseconds, `M` is minutes', '`m` is microseconds, `M` is milliseconds'], answer: 2, why: 'The list goes `n`, `u`, `m`, `S`, `M`, `H`: lower case `m` sits between micro and seconds, upper case `M` between seconds and hours.' },
					{ q: 'Where does the time left come from on the client?', options: ['A fixed default of 30 s in grpc-go', 'The server\'s own timeout setting', 'The `:path` header of the call', '`time.Until` on the context deadline'], answer: 3, why: 'Line 10 reads the deadline from the Go `context`, line 13 turns it into the time left, line 17 sends it.' }
				]
			},
			{
				title: 'Encode 50 ms',
				questions: [
					{ q: 'How many nanoseconds is 50 ms?', options: ['50,000', '50,000,000', '5,000,000', '500,000,000'], answer: 1, why: 'One millisecond is 1,000,000 ns, so 50 ms is 50,000,000 ns.' },
					{ q: 'Does 50,000,000 fit in 8 digits?', options: ['Yes, it has exactly 8 digits', 'No, it has 9 digits', 'No, it is over 99,999,999', 'Only after rounding up'], answer: 0, why: '50,000,000 has 8 digits and is below 99,999,999, so nanoseconds work.' },
					{ q: 'What header does the client send?', options: ['`grpc-timeout: 50m`', '`grpc-timeout: 50000u`', '`grpc-timeout: 50000000n`', '`grpc-timeout: 0.05S`'], answer: 2, why: 'The smallest unit that fits wins, and `n` already fits. `50m` is the same time but not what the encoder picks.' },
					{ q: 'Why not `0.05S`?', options: ['Seconds are not a valid unit', 'The value must be a whole number', 'It would be too many digits', 'The server only reads `n`'], answer: 1, why: 'The header holds an integer and a unit. Fractions are handled by moving to a smaller unit.' }
				]
			},
			{
				title: 'Encode 1.5 s',
				questions: [
					{ q: 'How many nanoseconds is 1.5 s?', options: ['15,000,000', '150,000,000', '1,500,000', '1,500,000,000'], answer: 3, why: 'One second is 1,000,000,000 ns, so 1.5 s is 1,500,000,000 ns.' },
					{ q: 'Does that fit in 8 digits?', options: ['No, it has 10 digits', 'Yes, just under the limit', 'No, it has 9 digits', 'Yes, once the comma is dropped'], answer: 0, why: '1,500,000,000 has 10 digits, more than 8, so the encoder tries the next unit.' },
					{ q: 'In microseconds, what is 1.5 s?', options: ['1,500', '150,000', '1,500,000', '15,000,000'], answer: 2, why: 'One second is 1,000,000 µs, so 1.5 s is 1,500,000 µs: 7 digits, it fits.' },
					{ q: 'What header does the client send?', options: ['`grpc-timeout: 1500m`', '`grpc-timeout: 1500000u`', '`grpc-timeout: 1500000000n`', '`grpc-timeout: 2S`'], answer: 1, why: '`u` is the smallest unit whose value fits in 8 digits. `1500m` fits too, but it is a larger unit.' }
				]
			},
			{
				title: 'Encode 10 minutes',
				questions: [
					{ q: 'How many microseconds is 10 minutes?', options: ['600,000', '60,000,000', '6,000,000,000', '600,000,000'], answer: 3, why: '600 s × 1,000,000 µs is 600,000,000 µs: 9 digits, one too many.' },
					{ q: 'So which unit fits first?', options: ['Milliseconds: 600,000', 'Seconds: 600', 'Minutes: 10', 'Microseconds, rounded down'], answer: 0, why: '600,000 ms has 6 digits. It is the smallest unit after `u`, so it wins.' },
					{ q: 'What header does the client send?', options: ['`grpc-timeout: 10M`', '`grpc-timeout: 600S`', '`grpc-timeout: 600000m`', '`grpc-timeout: 600000000u`'], answer: 2, why: '`10M` and `600S` mean the same time, but the encoder stops at the smallest unit that fits.' },
					{ q: 'A real client calls `context.WithTimeout` with 1.5 s and sends a value a little under `1500000u`. Why?', options: ['The server subtracts network latency', '`time.Until` runs a moment after the deadline was set', 'HPACK compresses the number', 'The encoder always rounds down'], answer: 1, why: 'Some time passes between creating the context and line 13, so `time.Until` returns a little less than the round value.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A grpc-go client with default settings opens one channel to a normal Kubernetes Service with 3 Pods and sends 1000 calls. Where do they go?',
			options: [
				'About 333 to each Pod, because kube-proxy balances every call',
				'All 1000 to the one Pod chosen when the TCP connection opened',
				'To the Pod with the fewest open connections at the time of each call',
				'To all 3 Pods, because HTTP/2 opens one connection per stream'
			],
			answer: 1,
			why: 'kube-proxy chooses a backend per TCP connection. The default `pick_first` policy keeps one connection, and every call is a stream on it, so the choice is made once.'
		},
		{
			q: 'A Go client calls `GetUserProfile` with a 2 s deadline. The server spends 0.5 s, then calls `GetTransactionHistory` with the incoming context. What deadline does the second server get?',
			options: [
				'2 s, because the deadline is copied unchanged to every call',
				'None, because a deadline only applies to the first hop',
				'About 1.5 s, because the time already spent is deducted',
				'2 s plus the clock difference between the two servers'
			],
			answer: 2,
			why: 'Go propagates the deadline from the incoming context. gRPC converts it to a timeout with the elapsed time already deducted and sends it in `grpc-timeout`, which also avoids clock skew between servers.'
		},
		{
			q: 'A client sets no deadline and the server blocks forever on a database lock. What does the client see?',
			options: [
				'`DEADLINE_EXCEEDED` after the default gRPC timeout of 30 s',
				'`UNAVAILABLE` once the HTTP/2 connection reaches its idle timeout',
				'`CANCELLED`, because the server cancels calls with no deadline',
				'Nothing: the call waits, since no `grpc-timeout` header was sent'
			],
			answer: 3,
			why: 'Without a context deadline, line 10 sends no `grpc-timeout`, and the server assumes an infinite timeout. gRPC sets no deadline by default, so the call waits until something else breaks the connection.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Watch one gRPC channel carry every call over a single connection, and watch a client deadline reach the server and cancel the call.',
		steps: [
			'Set up a Go module: `mkdir grpc-lab && cd grpc-lab && go mod init grpclab && go get google.golang.org/grpc@v1.66.0`.',
			'In `main.go`, write a server mode that listens on `127.0.0.1:50051` and registers a `grpc_health_v1` Health server. Its `Check` prints `peer.FromContext(ctx)` and the time left on `ctx.Deadline()`, then waits 1 s or until `ctx.Done()`.',
			'In the same file, write a client mode: one `grpc.NewClient("127.0.0.1:50051", ...)`, then 3 `Check` calls, each under `context.WithTimeout` with the duration given on the command line.',
			'Build and start the server: `go mod tidy && go build -o lab . && ./lab server &`.',
			'Run the client twice: `./lab 2s`, then `./lab 500ms`. Read what the server printed, then stop it with `kill %1`.'
		],
		done: [
			'`./lab 2s` prints three calls with `error: <nil>`.',
			'The server prints the same client address and port for all three calls of one run.',
			'The server sees about `2s` left on each call of the first run, so the deadline crossed the wire.',
			'`./lab 500ms` prints `code = DeadlineExceeded` three times, and the server prints that each context ended.'
		],
		solution: [
			'Imports: `google.golang.org/grpc`, `.../grpc/credentials/insecure`, `.../grpc/health/grpc_health_v1` and `.../grpc/peer`. Embed `grpc_health_v1.UnimplementedHealthServer` in your server type.',
			'Handler: `p, _ := peer.FromContext(ctx); dl, ok := ctx.Deadline(); fmt.Println(p.Addr, ok, time.Until(dl))`, then `select { case <-time.After(time.Second): return &grpc_health_v1.HealthCheckResponse{}, nil; case <-ctx.Done(): fmt.Println(ctx.Err()); return nil, ctx.Err() }`.',
			'Client: `conn, _ := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))`, then in a loop `ctx, cancel := context.WithTimeout(context.Background(), d)`, call `Check`, print `fmt.Println("error:", err)`, then `cancel()`.',
			'One port per run is one TCP connection: each call is a new stream on it. Behind a layer 4 balancer, all three calls would land on the same backend.',
			'The `select` on `ctx.Done()` is the server code stopping its own work. Without it, the handler would keep running after the client gave up.'
		]
	},
	recall: {
		q: 'Why does a normal Kubernetes Service send all calls of a gRPC client to one Pod?',
		a: 'kube-proxy picks a Pod once per TCP connection, and gRPC sends every call as a stream on one long-lived HTTP/2 connection. Request-level balancing (`round_robin` in the client, or an HTTP/2 proxy) spreads the calls.'
	},
	sources: [
		{ title: 'gRPC over HTTP2 (PROTOCOL-HTTP2.md)', url: `${GRPC}/PROTOCOL-HTTP2.md` },
		{ title: 'gRPC docs, Deadlines', url: 'https://grpc.io/docs/guides/deadlines/' },
		{ title: 'gRPC, Load Balancing in gRPC (load-balancing.md)', url: `${GRPC}/load-balancing.md` },
		{ title: 'gRPC blog, gRPC Load Balancing', url: 'https://grpc.io/blog/grpc-load-balancing/' },
		{ title: 'Kubernetes blog, gRPC Load Balancing on Kubernetes without Tears (2018)', url: K8S_BLOG },
		{ title: 'grpc-go source, internal/transport/http2_client.go', url: `${GRPCGO}/internal/transport/http2_client.go` }
	]
};
