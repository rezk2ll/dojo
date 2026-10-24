const SB = 'https://github.com/spring-projects/spring-boot/blob/e9644b19f559db8ad4825526c245ab5a5cb40909/module/spring-boot-actuator-autoconfigure/src/main/java/org/springframework/boot/actuate/autoconfigure/endpoint';
const FILTER = `${SB}/expose/IncludeExcludeEndpointFilter.java`;
const EXPOSURE = `${SB}/expose/EndpointExposure.java`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'attack-surface',
	part: 'Threats',
	title: 'Attack surface: what an attacker can reach',
	minutes: 10,
	hook: [
		'On 1 March 2022, Spring published CVE-2022-22947 for Spring Cloud Gateway. A remote attacker could send a crafted request and run code on the host. NVD scored it 10.0, the maximum. On 16 May 2022, CISA added it to its catalog of vulnerabilities exploited in the wild.',
		'The advisory names one condition. Apps were vulnerable "when the Gateway Actuator endpoint is enabled, exposed and unsecured." A gateway with that endpoint switched off ran the same vulnerable jar, and that condition did not apply to it.'
	],
	terms: [
		{ term: 'Attack surface', def: 'OWASP: "all of the different points where an attacker could get into a system, and where they could get data out." Ports, URLs, file inputs, message queues and the code behind each one.' },
		{ term: 'Listening socket', def: 'A port a process has opened to accept connections. `ss -tlnp` lists the TCP ones with the address and the process. `0.0.0.0` means every network interface, `127.0.0.1` means this machine only.' },
		{ term: 'Actuator endpoint', def: 'A Spring Boot URL under `/actuator` for operations: `health`, `env`, `threaddump`, `heapdump`, and `gateway` in Spring Cloud Gateway.' },
		{ term: 'Exposure', def: 'The Spring Boot setting `management.endpoints.web.exposure.include`: the list of endpoint ids that answer over HTTP. Its default is `health`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['scan["Scanner on the internet"] --> port["Gateway host: 0.0.0.0:8080 open"]'],
				highlight: ['scan', 'port'],
				note: 'The gateway listens on `0.0.0.0:8080`, so every network interface accepts connections. Anyone who can route a packet to the host can talk to port 8080. A port bound to `127.0.0.1` would only accept connections from the same machine.'
			},
			{
				add: ['port --> act["GET /actuator/gateway/routes answers"]'],
				highlight: ['act'],
				note: 'Someone set `management.endpoints.web.exposure.include=gateway`. The gateway docs list what this endpoint offers: `POST /actuator/gateway/routes/{id}` creates a route and `POST /actuator/gateway/refresh` applies it. Without authentication, a stranger can call both.'
			},
			{
				add: ['act -->|"crafted request"| rce["Code runs on the host: CVE-2022-22947"]'],
				highlight: ['rce'],
				note: 'On Spring Cloud Gateway 3.1.0, and 3.0.6 and earlier, a crafted request to this endpoint runs code on the host. The fix is in 3.1.1 and 3.0.7. The advisory names this endpoint as the condition for the attack.'
			},
			{
				add: ['cut["exposure.include=health, the default"] -.->|"gateway endpoint not mapped"| act', 'mgmt["management.server.address=127.0.0.1"] -.->|"no remote connection"| port'],
				highlight: ['cut', 'mgmt'],
				note: 'Two cuts break the path. With the default include list, Spring Boot never maps `/actuator/gateway`. With `management.server.port=8081` and `management.server.address=127.0.0.1`, the docs say the app "does not allow remote management connections". The advisory\'s own fallback is `management.endpoint.gateway.enabled: false`.'
			}
		]
	},
	example: {
		title: 'IncludeExcludeEndpointFilter.java: which actuator endpoints Spring Boot exposes',
		repo: 'spring-projects/spring-boot',
		url: `${FILTER}#L113-L169`,
		lang: 'java',
		code: `	public final boolean match(EndpointId endpointId) {
		return isIncluded(endpointId) && !isExcluded(endpointId);
	}

	private boolean isIncluded(EndpointId endpointId) {
		if (this.include.isEmpty()) {
			return this.defaultIncludes.matches(endpointId);
		}
		return this.include.matches(endpointId);
	}

	private boolean isExcluded(EndpointId endpointId) {
		if (this.exclude.isEmpty()) {
			return false;
		}
		return this.exclude.matches(endpointId);
	}
…
		EndpointPatterns(@Nullable Collection<String> patterns) {
			patterns = (patterns != null) ? patterns : Collections.emptySet();
			boolean matchesAll = false;
			Set<EndpointId> endpointIds = new LinkedHashSet<>();
			for (String pattern : patterns) {
				if ("*".equals(pattern)) {
					matchesAll = true;
				}
				else {
					endpointIds.add(EndpointId.fromPropertyValue(pattern));
				}
			}
			this.empty = patterns.isEmpty();
			this.matchesAll = matchesAll;
			this.endpointIds = endpointIds;
		}

		boolean isEmpty() {
			return this.empty;
		}

		boolean matches(EndpointId endpointId) {
			return this.matchesAll || this.endpointIds.contains(endpointId);
		}`,
		notes: [
			'The default list is one id. In [`EndpointExposure.java`](' + EXPOSURE + '#L18-L23) the web exposure is `WEB("health")`, and `WebEndpointAutoConfiguration` passes it as `defaultIncludes` (lines 135 to 138). An app with no exposure property answers on `/actuator/health` only.',
			'`isIncluded` falls back to the default only when your include list is empty. Set `include=gateway` and the list holds `gateway` alone, so `health` stops answering unless you add it.',
			'The `"*".equals(pattern)` line sets `matchesAll`. One character in `application.properties` then exposes every endpoint the app has. `match` returns `isIncluded && !isExcluded`, so an id in `exclude` stays off even under `*`.',
			'Spring Boot also checks access per endpoint. The docs: "By default, access to all endpoints except for shutdown and heapdump is unrestricted." Current Spring Cloud Gateway docs say the `gateway` endpoint "has its access disabled by default".'
		]
	},
	tradeoff: {
		gain: [
			'With `exposure.include=health`, the gateway endpoint has no URL, so a bug in its code cannot be reached over HTTP on any version.',
			'Fewer entry points leave fewer cases to test. OWASP suggests counting them by type (admin interfaces, APIs, file inputs) to budget the review.',
			'Binding the management port to `127.0.0.1` keeps `/actuator` off the network even when someone later adds `*` to the include list.'
		],
		cost: [
			'Operations tools lose data: a Prometheus server cannot scrape `/actuator/prometheus` until someone adds `prometheus` to the include list.',
			'A separate management port 8081 needs its own routing. On Cloud Foundry, the docs say apps receive requests "only on port 8080" by default.',
			'Each new dependency, route or port changes the list, and OWASP says such a change "should trigger threat modeling".'
		]
	},
	task: {
		prompt: 'A server prints this for `ss -tlnp`: `0.0.0.0:22 sshd`, `0.0.0.0:8080 java`, `0.0.0.0:6379 redis-server`, `127.0.0.1:5432 postgres`. The Java app has `management.endpoints.web.exposure.include=*`. Only port 8080 should serve users. Write down what another machine can reach, and the change that removes each extra item.',
		hint: 'Read the address column first: which lines say `0.0.0.0`? Then ask which actuator ids `*` turns on.',
		answer: [
			'Reachable from other machines: 22 (SSH), 8080 (the app) and 6379 (Redis), because all three listen on `0.0.0.0`. PostgreSQL on `127.0.0.1:5432` only accepts local connections.',
			'Redis: set `bind 127.0.0.1` in `redis.conf`, or block 6379 at the firewall. SSH: allow port 22 from your admin network only.',
			'Actuator: `*` sets `matchesAll`, so `env`, `beans`, `mappings`, `threaddump` and every other endpoint with unrestricted access answer on 8080. Replace it with `include=health`, or move management to `management.server.port=8081` with `management.server.address=127.0.0.1`.',
			'Check again: `ss -tlnp` shows 6379 on `127.0.0.1`, and `curl http://host:8080/actuator/env` from another machine no longer returns the endpoint.'
		],
		steps: [
			{
				title: 'Read the address column',
				questions: [
					{ q: 'In each `ss -tlnp` line, which part tells you who can connect?', options: ['The process name, such as `redis-server`', 'The address in front of the port', 'The order of the lines', 'The port number alone'], answer: 1, why: 'The address a socket is bound to decides which interfaces accept connections. The port number and the process name say nothing about who can reach it.' },
					{ q: 'Which ports can another machine reach?', options: ['Only 8080', '8080 and 5432', 'All four of them', '22, 8080 and 6379'], answer: 3, why: 'These three listen on `0.0.0.0`. PostgreSQL on `127.0.0.1` only takes local connections.' },
					{ q: 'The Java app on this same server connects to `127.0.0.1:5432`. Does that work?', options: ['No: 5432 is not on `0.0.0.0`', 'Only with an extra firewall rule', 'Yes: a process on the same machine can use loopback', 'Only if the app runs as root'], answer: 2, why: '`127.0.0.1` accepts connections from processes on this machine. The app keeps its database, and other machines still cannot reach it.' },
					{ q: 'Only 8080 should serve users. Which reachable items are extra?', options: ['Redis on 6379, and SSH from outside your admins', 'Only PostgreSQL', 'Only SSH', 'Nothing: every port is needed'], answer: 0, why: 'Users need 8080. Redis has no reason to be reachable, and SSH only from your admin network.' }
				]
			},
			{
				title: 'Cut the extra ports',
				questions: [
					{ q: 'Which change takes Redis off the network?', options: ['Move it to port 16379', 'Set `protected-mode no`', '`bind 127.0.0.1` in `redis.conf`', 'Rename the `redis-server` process'], answer: 2, why: 'Bound to loopback, it only accepts local clients. Blocking 6379 at the firewall also works.' },
					{ q: 'What do you do with SSH on port 22?', options: ['Allow it from your admin network only', 'Close it and lose remote access', 'Move it to port 2222 and leave it open', 'Leave it, since SSH has a password'], answer: 0, why: 'Admins still need it. Limiting who can reach it shrinks the surface without losing access.' },
					{ q: 'Why does moving a service to another port not shrink the surface?', options: ['Scanners only check low ports', 'It still answers anyone who can reach the new port', 'Ports above 1024 are private', 'It does shrink it, by half'], answer: 1, why: 'The service still answers anyone who can route a packet to it. Only the number changed.' },
					{ q: 'What does OWASP count as attack surface?', options: ['Only open TCP ports', 'Only the public URLs of the site', 'Only code with a known CVE', 'Every point where an attacker can get in or get data out'], answer: 3, why: 'OWASP: "all of the different points where an attacker could get into a system, and where they could get data out."' }
				]
			},
			{
				title: 'Cut the actuator',
				questions: [
					{ q: 'What does `exposure.include=*` do?', options: ['It sets `matchesAll`, so every endpoint answers', 'It exposes `health` and `info` only', 'It exposes nothing until you list ids', 'It exposes only read-only endpoints'], answer: 0, why: 'The `"*".equals(pattern)` line sets `matchesAll`. One character exposes every endpoint the app has.' },
					{ q: 'Which endpoints then answer on 8080?', options: ['Only `health`', 'Only `shutdown` and `heapdump`', '`env`, `beans`, `threaddump` and every other unrestricted one', 'Only the ones listed in `exclude`'], answer: 2, why: 'By default, every endpoint except `shutdown` and `heapdump` has unrestricted access, so `*` puts them all on the user port.' },
					{ q: 'Monitoring needs metrics, so you set `include=health,prometheus`. Does `/actuator/env` still answer on 8080?', options: ['Yes: `env` is always exposed', 'Yes, until the app restarts twice', 'Only for GET requests', 'No: only `health` and `prometheus` are exposed'], answer: 3, why: 'With a non-empty include list, `isIncluded` matches only the ids in it. Every other endpoint, `env` included, has no URL.' },
					{ q: 'Which other setup keeps `/actuator` off the network?', options: ['`management.server.port=8080` on all interfaces', '`management.server.port=8081` with `management.server.address=127.0.0.1`', 'A second copy of the app on port 8080', '`management.endpoints.web.base-path=/hidden`'], answer: 1, why: 'The docs say the app then "does not allow remote management connections". Even a later `*` stays off the network.' }
				]
			},
			{
				title: 'Check again',
				questions: [
					{ q: 'Which output shows the Redis fix worked?', options: ['`ss -tlnp` shows 6379 on `0.0.0.0`', 'Redis answers `PONG` from another machine', '`redis-cli ping` fails on the server', '`ss -tlnp` shows 6379 on `127.0.0.1`'], answer: 3, why: 'The address column is the proof: loopback only.' },
					{ q: 'How do you test the actuator change?', options: ['`curl localhost:8080/actuator/env` on the server', '`curl http://host:8080/actuator/env` from another machine', 'Read `application.properties` again', 'Restart the app and read its log'], answer: 1, why: 'Test from where an attacker stands. The endpoint must no longer come back.' },
					{ q: 'After the fixes, what can another machine reach?', options: ['8080 for users, and 22 from the admin network', '8080, plus Redis in read-only mode', '8080, 6379 and 5432', 'Nothing at all'], answer: 0, why: 'Redis and the actuator are off the network, and SSH is limited to your admins.' },
					{ q: 'A teammate later opens a new port. What does OWASP say that change should trigger?', options: ['Nothing, if the port is above 1024', 'A new CVSS score', 'Threat modeling', 'A restart of every service'], answer: 2, why: 'Each new route, dependency or port changes the list, and OWASP says such a change "should trigger threat modeling".' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`ss -tlnp` shows `0.0.0.0:6379 redis-server` and `127.0.0.1:5432 postgres`. Which can another machine on the network connect to?',
			options: [
				'Only PostgreSQL, because 127.0.0.1 is the server\'s public address',
				'Only Redis, because 0.0.0.0 means every interface of the server',
				'Neither, because both addresses are reserved for local traffic',
				'Both, because `ss -tlnp` only lists ports that accept remote connections'
			],
			answer: 1,
			why: 'A socket bound to `0.0.0.0` accepts connections on every interface, including the external one. `127.0.0.1` is the loopback address, so only processes on the same machine can connect to PostgreSQL there.'
		},
		{
			q: 'A Spring Boot app has the actuator dependency and no `management.endpoints.web.exposure.include` property. Which actuator endpoints answer over HTTP?',
			options: [
				'All of them except `shutdown` and `heapdump`',
				'`health` and `info`, the two read-only endpoints',
				'Only `health`',
				'None, until the property is set'
			],
			answer: 2,
			why: '`EndpointExposure.WEB` has the default includes `"health"`. With an empty include list, `isIncluded` falls back to that default, so `health` is the only endpoint mapped over HTTP.'
		},
		{
			q: 'You run Spring Cloud Gateway 3.1.0 and cannot upgrade today. What does the CVE-2022-22947 advisory tell you to do?',
			options: [
				'Set `management.endpoint.gateway.enabled: false`, or secure the actuator with Spring Security',
				'Move the gateway from port 8080 to port 8443 so that scanners skip it',
				'Add `gateway` to `management.endpoints.web.exposure.exclude` and keep `include=*`',
				'Turn off the `health` endpoint, because scanners use it to find gateways'
			],
			answer: 0,
			why: 'The advisory says the bug needs the gateway actuator endpoint "enabled, exposed and unsecured". Disabling it, or putting authentication in front, removes that path. The `exclude` option would also hide the endpoint, but it is not what the advisory says, and `*` still exposes everything else.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Open two listening sockets, one on every interface and one on loopback, and see which one the network can reach.',
		steps: [
			'Make a folder and start two web servers: `mkdir -p ~/surface-lab && cd ~/surface-lab`, then `python3 -m http.server 8001 --bind 0.0.0.0 &` and `python3 -m http.server 8002 --bind 127.0.0.1 &`.',
			'List the listening sockets. Linux: `ss -tln | grep 800`. macOS: `lsof -nP -iTCP -sTCP:LISTEN | grep 800`.',
			'Find your LAN address: `hostname -I` on Linux, `ipconfig getifaddr en0` on macOS. Call both ports through it: `curl -s -o /dev/null -w "%{http_code}\\n" http://<your-ip>:8001/`, then the same for `8002`.',
			'List everything your laptop listens on: `ss -tlnp` (Linux) or `lsof -nP -iTCP -sTCP:LISTEN` (macOS). Mark each line on `0.0.0.0`, `*` or `[::]` as reachable from the network.',
			'Stop the two servers: `kill %1 %2`.'
		],
		done: [
			'The list shows `0.0.0.0:8001` (`*:8001` in lsof) and `127.0.0.1:8002`.',
			'Through your LAN address, 8001 returns `200` and 8002 returns `000`: the connection is refused.',
			'You have a list of the sockets on your own laptop that listen on every interface.'
		],
		solution: [
			'The bind address decides who can connect. `0.0.0.0` accepts on every interface, `127.0.0.1` only from the same machine.',
			'A request to the LAN address arrives on the external interface, where nothing listens on 8002. That is why it is refused.',
			'The task\'s Redis fix is the same move: `bind 127.0.0.1` in `redis.conf`, after which `ss -tlnp` shows `127.0.0.1:6379`.'
		]
	},
	recall: {
		q: 'Under which condition was a Spring Cloud Gateway 3.1.0 app open to CVE-2022-22947, and what is Spring Boot\'s default HTTP exposure?',
		a: 'When the gateway actuator endpoint was enabled, exposed and unsecured. By default, Spring Boot exposes only `health` over HTTP.'
	},
	sources: [
		{ title: 'Spring advisory CVE-2022-22947, Spring Cloud Gateway code injection', url: 'https://spring.io/security/cve-2022-22947' },
		{ title: 'NVD, CVE-2022-22947', url: 'https://nvd.nist.gov/vuln/detail/CVE-2022-22947' },
		{ title: 'Spring Boot docs, Actuator endpoints', url: 'https://docs.spring.io/spring-boot/reference/actuator/endpoints.html' },
		{ title: 'Spring Boot docs, Monitoring and management over HTTP', url: 'https://docs.spring.io/spring-boot/reference/actuator/monitoring.html' },
		{ title: 'Spring Cloud Gateway docs, Actuator API', url: 'https://docs.spring.io/spring-cloud-gateway/reference/spring-cloud-gateway-server-webflux/actuator-api.html' },
		{ title: 'OWASP Attack Surface Analysis Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Attack_Surface_Analysis_Cheat_Sheet.html' },
		{ title: 'ss(8) man page', url: 'https://man7.org/linux/man-pages/man8/ss.8.html' }
	]
};
