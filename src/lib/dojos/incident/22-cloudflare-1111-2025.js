const PM = 'https://blog.cloudflare.com/cloudflare-1-1-1-1-incident-on-july-14-2025/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cloudflare-1111-2025',
	part: 'Networks and DNS',
	title: 'Cloudflare 1.1.1.1 2025: the resolver prefixes withdrawn by a test change',
	minutes: 10,
	hook: [
		'Monday 14 July 2025, 21:52 UTC. You are on call at Cloudflare. DNS traffic to the 1.1.1.1 public resolver starts to drop, in every region at once.',
		'Most users of the resolver have 1.1.1.1, 1.0.0.1 or their IPv6 versions set as their DNS server. When those addresses stop answering, their browsers and apps cannot turn names into addresses. For many of them, almost every Internet service stops working.'
	],
	terms: [
		{ term: 'Prefix', def: 'A block of IP addresses announced as one route, such as `1.1.1.0/24` (the 256 addresses from 1.1.1.0 to 1.1.1.255).' },
		{ term: 'Anycast', def: 'Announcing the same prefix from many data centers, so each user reaches the nearest one. Cloudflare serves almost all its services this way.' },
		{ term: 'BGP withdrawal', def: 'A BGP message that tells peers a route to a prefix is no longer available. Once every route is withdrawn, packets to that prefix have nowhere to go.' },
		{ term: 'Service topology', def: 'Cloudflare’s list of the data centers where a service’s prefixes should be announced. Data Localization Suite (DLS) services use it to stay inside one region.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare 1.1.1.1 incident on July 14, 2025',
		date: '2025-07-14',
		url: PM,
		steps: [
			{
				situation: [
					'At 22:01 UTC, internal health alerts fire for the resolver. They report query failures, proxy failures and data center failures. You declare an incident.',
					'Queries over UDP, TCP and DNS over TLS have fallen sharply. The traffic toward the resolver prefixes is no longer reaching the edge data centers at all.'
				],
				q: 'What do you check first?',
				options: [
					'The resolver process logs on a few edge servers',
					'Whether the resolver’s BGP routes are still announced from the servers',
					'The response times of the root and top level domain name servers',
					'The CPU load of the resolver fleet in the busiest regions'
				],
				answer: 1,
				why: 'Traffic that never arrives points to routing, not to the resolver software. The postmortem: "we found the Resolver routes from servers were completely missing."'
			},
			{
				situation: [
					'The 1.1.1.1 routes are gone from Cloudflare’s own routers, for all the resolver prefixes. Then Cloudflare Radar reports something new: Tata Communications India (AS4755) is announcing `1.1.1.0/24`.',
					'From the outside, that looks exactly like a prefix hijack. The withdrawn list is longer: it also holds `1.0.0.0/24` and IPv6 prefixes such as `2606:4700:4700::/48`.'
				],
				q: 'What do you do with the Tata announcement?',
				options: [
					'Make the hijack the main lead and call Tata to stop it',
					'Note it and keep working on why your own routes were withdrawn',
					'Announce more specific /25 routes to win back 1.1.1.0/24',
					'Post on the status page that an attack caused the outage'
				],
				answer: 1,
				why: 'A hijack of one prefix cannot remove the routes from Cloudflare’s own servers for every prefix. The postmortem: "this BGP hijack was not the cause of the outage." The withdrawal had made the hijack visible, and Cloudflare is following up with Tata.'
			},
			{
				situation: [
					'At 21:48 UTC, 4 minutes before traffic dropped, a configuration change went out for a DLS service that was not in production. It attached an offline test location to it.',
					'The change triggered a refresh of the network configuration in every data center. It was peer reviewed by several engineers. The system that applied it has no canary stage.'
				],
				q: 'How do you bring the routes back?',
				options: [
					'Revert the 21:48 change to the previous configuration',
					'Add the 1.1.1.1 prefixes by hand on each edge router',
					'Edit the DLS service again to remove the test location',
					'Move the resolver to a new prefix and update the docs'
				],
				answer: 0,
				why: 'The previous configuration was known to work, and a revert is one change. Cloudflare reverted at 22:20 UTC and "near instantly" began announcing the withdrawn prefixes again. A new edit to the same service would be one more untested change.'
			},
			{
				situation: [
					'After the revert, 1.1.1.1 traffic is back to about 77% of its level before the incident.',
					'During the outage, about 23% of the edge servers were reconfigured automatically to remove the IP bindings the resolver needs. The change management system puts them back with a progressive rollout that normally takes several hours.'
				],
				q: 'What do you do with the 23% of servers?',
				options: [
					'Let the normal rollout run for several hours',
					'Push the bindings to every server at once with no test',
					'Test the fix in testing locations, then speed up the rollout',
					'Take those servers out of service until tomorrow'
				],
				answer: 2,
				why: 'The normal pace would leave a quarter of the fleet broken for hours, and pushing untested changes everywhere is how the outage began. Cloudflare "accelerated the rollout of the fix after verifying the changes in testing locations". Traffic was normal at 22:54 UTC.'
			},
			{
				situation: [
					'The service is back. You now know the chain: on 6 June, a change to the same DLS service included the 1.1.1.1 prefixes by mistake. It changed no routes, so no traffic moved and no alert fired for five weeks.',
					'Cloudflare runs a legacy addressing system that hard codes lists of data centers per prefix, and a newer system that supports staged deployments. Cloudflare syncs data between the two.'
				],
				q: 'What do you fix first?',
				options: [
					'Require two more reviewers on every topology change',
					'Move addressing changes to staged rollouts with health checks',
					'Add an alert for BGP hijacks of Cloudflare prefixes',
					'Give the resolver a fourth IPv4 address as a backup'
				],
				answer: 1,
				why: 'The change was already "peer-reviewed by multiple engineers", and it still reached every data center in one step. Cloudflare plans to deprecate the legacy systems so that addressing changes get "progressive and health mediated deployment".'
			}
		],
		outcome: [
			'The 1.1.1.1 resolver was unreachable worldwide from 21:52 to 22:54 UTC, for 62 minutes. Gateway DNS was degraded at times. DNS over HTTPS mostly kept working, because most clients reach it through `cloudflare-dns.com`, which uses different IP addresses.',
			'The root cause was the 6 June mistake. It linked the resolver’s prefixes to the topology of a DLS service that was not live. On 14 July, a change to that service refreshed the routes, and the resolver’s topology shrank "from all locations down to a single, offline location". Every data center withdrew the 1.1.1.1 prefixes.',
			'The alerts fired at 22:01, 9 minutes after traffic began to drop. The revert at 22:20 brought back 77% of traffic; the last 23% waited for edge servers to get their IP bindings back.',
			'Cloudflare listed two fixes: staged, health checked deployments for addressing changes, and a faster deprecation of the legacy addressing systems.'
		]
	},
	quiz: [
		{
			q: 'How did a change to a service with no users take 1.1.1.1 offline?',
			options: [
				'The test location sent so much traffic that the resolver ran out of capacity',
				'An earlier error had put the resolver’s prefixes in that service’s topology',
				'The new location announced 1.1.1.1 with a shorter path and pulled all traffic',
				'The change deleted the resolver’s DNS zone files in every data center'
			],
			answer: 1,
			why: 'On 6 June the resolver prefixes were included in the DLS service topology by mistake. The 14 July change reduced that topology to one offline location, so every other data center withdrew the prefixes.'
		},
		{
			q: 'Why did most DNS over HTTPS users keep working during the outage?',
			options: [
				'HTTPS traffic has priority on Cloudflare’s routers',
				'DoH clients cache every answer for 24 hours',
				'They reach `cloudflare-dns.com`, which uses other IP addresses',
				'DoH runs only in data centers that kept their routes'
			],
			answer: 2,
			why: 'Most DoH users point their browser at the name `cloudflare-dns.com`, not at 1.1.1.1. That name resolves to a different set of addresses, and those prefixes were never withdrawn.'
		},
		{
			q: 'The 6 June error sat in production for five weeks. Why did no alert catch it?',
			options: [
				'It changed no routes, so no traffic moved and nothing looked wrong',
				'The alerts for the resolver had been switched off for maintenance',
				'The error only existed in the newer system, which had no alerts',
				'Cloudflare only alerts on changes made during business hours'
			],
			answer: 0,
			why: 'Alerts watched traffic and health, and the June change moved neither. A check that compares each prefix’s intended topology with the configured one could flag it before any traffic moves.'
		}
	],
	recall: {
		q: 'What did the 14 July change shrink the 1.1.1.1 prefixes’ service topology to, and how long did the outage last?',
		a: 'To a single offline data center location, so every other location withdrew the prefixes. The resolver was down for 62 minutes, from 21:52 to 22:54 UTC.'
	},
	sources: [
		{ title: 'Cloudflare blog: Cloudflare 1.1.1.1 incident on July 14, 2025', url: PM },
		{ title: 'RFC 4271: A Border Gateway Protocol 4 (BGP-4), withdrawn routes', url: 'https://www.rfc-editor.org/rfc/rfc4271#section-3.1' }
	]
};
