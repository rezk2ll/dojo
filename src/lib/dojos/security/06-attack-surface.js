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
