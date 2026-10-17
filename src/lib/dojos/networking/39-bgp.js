const EXA = 'https://github.com/Exa-Networks/exabgp/blob/685f772e4ede5c818d2ff5c84f4ae040afd37be6';
const FB = 'https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/';
const CF = 'https://blog.cloudflare.com/october-2021-facebook-outage/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'bgp',
	part: 'Debugging the network',
	title: 'BGP and anycast',
	minutes: 10,
	hook: [
		'On 4 October 2021 at 15:51 UTC, Cloudflare engineers opened an internal incident titled "Facebook DNS lookup returning SERVFAIL". `dig @1.1.1.1 facebook.com` answered `status: SERVFAIL`. They first suspected their own resolver.',
		'At 15:58 UTC they saw that Facebook had stopped announcing the routes to its DNS prefixes. On a public route server, `show ip bgp 129.134.30.0/23` printed `% Network not in table`. facebook.com stayed unavailable on 1.1.1.1 until about 21:20 UTC.',
		'Facebook\'s own post: "our DNS servers became unreachable even though they were still operational." **The servers had withdrawn their own routes, as designed, when they lost contact with the data centers.**'
	],
	terms: [
		{ term: 'Autonomous system', def: 'A network with one routing policy and a number, the ASN. Facebook is AS32934 and Cloudflare is AS13335.' },
		{ term: 'Announcement', def: 'A BGP UPDATE message that tells a peer it can reach a prefix through the sender, with an AS_PATH listing the ASes the route passed through.' },
		{ term: 'Withdrawal', def: 'The Withdrawn Routes part of an UPDATE. It tells peers the prefix is no longer reachable through the sender, and they pass that on.' },
		{ term: 'Anycast', def: 'RFC 4786: "making a particular Service Address available in multiple, discrete, autonomous locations". Each router sends packets for that address to the site its BGP routes pick.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['edge["Facebook edge sites, AS32934"] -->|"UPDATE: Facebook prefixes"| t6453["AS6453"]', 't6453 -->|"AS_PATH 6453 32934"| t3303["AS3303"]', 't3303 -->|"AS_PATH 3303 6453 32934"| rv["route-views"]'],
				highlight: ['edge', 'rv'],
				note: 'Each AS that passes the route to an external peer adds its own number to the AS_PATH. Cloudflare\'s post shows route-views holding Facebook\'s 129.134.0.0/17 with the path `3303 6453 32934`, read right to left: Facebook, then AS6453, then AS3303.'
			},
			{
				add: ['res["Resolvers, such as 1.1.1.1"] -->|"query a.ns.facebook.com, 129.134.30.12"| t3303'],
				highlight: ['res'],
				note: 'Facebook\'s smaller edge facilities answer DNS queries from well known addresses announced over BGP. On 2026-10-17, `dig a.ns.facebook.com` returned 129.134.30.12, inside 129.134.30.0/23. A resolver\'s packets follow the route its network picked. Among equally preferred routes, RFC 4271 keeps the one with the fewest AS numbers in AS_PATH.'
			},
			{
				add: ['bb["Backbone between data centers: all links down"] -.->|"DNS servers cannot reach data centers"| edge'],
				highlight: ['bb'],
				note: 'A maintenance command "unintentionally took down all the connections in our backbone network". Facebook\'s DNS servers "disable those BGP advertisements if they themselves can not speak to our data centers". The whole backbone was out, so every edge site declared itself unhealthy.'
			},
			{
				add: ['edge -->|"UPDATE: withdraw 129.134.30.0/23"| t6453', 'rv -->|"% Network not in table"| gone["No route to the DNS prefixes"]'],
				highlight: ['gone'],
				note: 'Cloudflare saw a peak of routing changes from Facebook around 15:40 UTC, with routes being withdrawn. Once every site had withdrawn, resolvers "had no way to connect to their nameservers". They returned SERVFAIL, and handled 30 times more queries than usual as apps and users retried.'
			},
			{
				add: ['back["21:00 UTC: renewed BGP activity, peak 21:17"] -->|"announce again"| t6453'],
				highlight: ['back'],
				note: 'Engineers went on site to bring the backbone back. Cloudflare saw BGP activity from Facebook again around 21:00 UTC, peaking at 21:17. facebook.com resolved on 1.1.1.1 again at about 21:20 UTC.'
			}
		]
	},
	example: {
		title: 'src/exabgp/application/healthcheck.py in ExaBGP: announce or withdraw a service route',
		repo: 'Exa-Networks/exabgp',
		url: `${EXA}/src/exabgp/application/healthcheck.py#L123-L618`,
		lang: 'python',
		code: `    g.add_argument('--rise', metavar='N', default=3, type=int, help='check N times before considering the service up')
    g.add_argument('--fall', metavar='N', default=3, type=int, help='check N times before considering the service down')
…
    g.add_argument('--withdraw-on-down', action='store_true', help='Instead of increasing the metric on health failure, withdraw the route')
…
        for ip in options.ips:
            if options.withdraw_on_down or target is States.EXIT:
                action = 'announce' if target is States.UP else 'withdraw'
            else:
                action = 'announce'
            command = f'{prefix} {action}'
            announce = f'route {ip} next-hop {options.next_hop or "self"}'

            if action == 'announce':
                announce = f'{announce} med {metric}'
…
            metric += options.increase

            # Send and flush command
            logger.debug(f'exabgp: {command} {announce}')
            sys.stdout.write(f'{command} {announce}\\n')
            sys.stdout.flush()
…
        elif state == States.FALLING:
            if not successful:
                checks += 1
                if checks >= options.fall:
                    state = trigger(States.DOWN)`,
		notes: [
			'Lines 24 to 28 count failed checks, and line 2 sets the threshold to 3. Checks run every 5 seconds, and every 1 second once the state starts falling. So a dead service is marked down about 2 to 7 seconds after it stops answering, plus the check time.',
			'Lines 6 to 10: without `--withdraw-on-down` (line 4), the route is never withdrawn while the process runs. Line 7 also withdraws it when the process exits, in state `EXIT`.',
			'Line 15 sets the MED. The defaults are `--up-metric 100` and `--down-metric 1000`, so a sick node keeps announcing with a worse MED. RFC 4271 compares MED only between routes "learned from the same neighboring AS". If every node is down, the route stays and traffic still arrives somewhere.',
			'Lines 20 to 22 print a line such as `peer * announce route <ip> next-hop self med 100` on stdout. ExaBGP reads it from the process named in its config and sends the BGP UPDATE to its peers.'
		]
	},
	tradeoff: {
		gain: [
			'With anycast, one address such as 129.134.30.12 is served from many sites, and each network sends its users along its own BGP route to one of them.',
			'Withdrawing a sick site\'s route moves its traffic to the other sites without any DNS change.',
			'Each AS on the path adds its number to AS_PATH, so a router can drop a route that already contains its own AS and avoid a loop.'
		],
		cost: [
			'If every site withdraws at the same time, the address disappears from the Internet. For facebook.com on 1.1.1.1 that lasted from about 15:50 to 21:20 UTC.',
			'RFC 4786 warns that "rapid advertisement/withdrawal oscillations can cause operational problems". A flapping health check needs a delay before the route comes back.',
			'A route leak, in RFC 7908\'s words, is "the propagation of routing announcement(s) beyond their intended scope". The receiving ASes then send traffic along that wrong path.',
			'BGP notices a silent peer only when the Hold Time expires: RFC 4271 suggests 90 seconds, with a KEEPALIVE every 30.'
		]
	},
	task: {
		prompt: 'You run anycast DNS for `192.0.2.53` on 3 sites. Each site runs `python3 -m exabgp healthcheck --ip 192.0.2.53/32 --cmd "dig @127.0.0.1 example.com +time=1"`. Say what happens to traffic in two cases: (a) the DNS daemon dies on site 2 only, and (b) the database all 3 sites depend on goes down, so the check fails everywhere. Then do it again with `--withdraw-on-down` added.',
		hint: 'Without the flag, a down site keeps announcing with a different MED. With it, a down site sends a withdrawal. Then list which sites still announce `192.0.2.53/32` in each case.',
		answer: [
			'Default, case (a): after 3 failed checks, site 2 announces `med 1000` and sites 1 and 3 keep `med 100`. Where routers compare MED, which needs routes from the same neighbouring AS, they pick sites 1 or 3.',
			'Default, case (b): all 3 sites announce `med 1000`. The route stays, and queries keep arriving at sites whose check fails. The address stays reachable, and answers depend on whether the daemon can still serve anything.',
			'With `--withdraw-on-down`, case (a): site 2 withdraws `192.0.2.53/32` and routers move its users to sites 1 and 3, whatever their neighbour AS.',
			'With `--withdraw-on-down`, case (b): all 3 sites withdraw and `192.0.2.53` has no route at all, the same failure Facebook had in October 2021. Resolvers time out and answer SERVFAIL.'
		]
	},
	quiz: [
		{
			q: 'Facebook\'s DNS servers were running during the outage. Why could no resolver reach them?',
			options: [
				'Their TLS certificates expired, so resolvers refused the answers',
				'Their records had a 0 second TTL and caches emptied at once',
				'Every site had withdrawn the BGP routes to their prefixes',
				'The root servers removed facebook.com from the .com zone'
			],
			answer: 2,
			why: 'The DNS servers withdraw their BGP announcements when they cannot reach the data centers. The backbone outage cut every site at once, so every site withdrew and no route to 129.134.30.0/23 was left.'
		},
		{
			q: 'A router has two equally preferred routes to an anycast prefix, with AS_PATH `3303 6453 32934` and `174 32934`. Which one does it pick under RFC 4271?',
			options: [
				'The first, because it was learned first',
				'The second, because it has fewer AS numbers',
				'The first, because AS3303 has a lower number',
				'Both, splitting packets evenly between them'
			],
			answer: 1,
			why: 'In the tie-break of section 9.1.2.2, the first rule removes every route that does not have the smallest number of AS numbers in its AS_PATH. 2 beats 3.'
		},
		{
			q: 'ExaBGP healthcheck runs with its defaults on all anycast sites, and the check fails everywhere. What do the routers see?',
			options: [
				'No route, because every site sends a withdrawal',
				'The same route from every site, with `med 1000`',
				'Only the site that failed last, with `med 100`',
				'A route leak, because the MED changed'
			],
			answer: 1,
			why: 'Without `--withdraw-on-down`, a DOWN state still announces the route, only with the down metric of 1000 instead of 100. Line 7 withdraws only with that flag or in state `EXIT`, when the process stops.'
		}
	],
	recall: {
		q: 'What did Facebook\'s DNS servers do on 4 October 2021 when they lost the backbone, and what did resolvers see?',
		a: 'They withdrew their BGP announcements for the DNS prefixes, such as 129.134.30.0/23, at every site. With no route left, resolvers like 1.1.1.1 returned SERVFAIL from about 15:50 to 21:20 UTC.'
	},
	sources: [
		{ title: 'Facebook Engineering, More details about the October 4 outage', url: FB },
		{ title: 'Cloudflare blog, Understanding how Facebook disappeared from the Internet', url: CF },
		{ title: 'RFC 4271, A Border Gateway Protocol 4 (BGP-4)', url: 'https://www.rfc-editor.org/rfc/rfc4271' },
		{ title: 'RFC 4786, Operation of Anycast Services', url: 'https://www.rfc-editor.org/rfc/rfc4786' },
		{ title: 'RFC 7908, Problem Definition and Classification of BGP Route Leaks', url: 'https://www.rfc-editor.org/rfc/rfc7908' },
		{ title: 'ExaBGP, healthcheck.py', url: `${EXA}/src/exabgp/application/healthcheck.py` },
		{ title: 'ExaBGP, etc/exabgp/example-healthcheck.conf', url: `${EXA}/etc/exabgp/example-healthcheck.conf` }
	]
};
