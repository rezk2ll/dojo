const FB = 'https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/';
const CF = 'https://blog.cloudflare.com/october-2021-facebook-outage/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'facebook-2021',
	part: 'Networks and DNS',
	title: 'Facebook 2021: the backbone that took its own DNS offline',
	minutes: 10,
	hook: [
		'Monday 4 October 2021, around 15:40 UTC. Cloudflare sees a peak of BGP routing changes coming from Facebook\'s network.',
		'By 15:50, `facebook.com`, `whatsapp.com` and `instagram.com` stop resolving. Public DNS resolvers answer `SERVFAIL` for these names.',
		'You work at Facebook. The tools you would use to look into this are failing too.'
	],
	terms: [
		{ term: 'Backbone', def: 'The network Facebook built to connect all its computing facilities, with fiber links between every data center.' },
		{ term: 'BGP', def: 'Border Gateway Protocol: how networks on the Internet tell each other which IP address ranges they can reach.' },
		{ term: 'Authoritative name server', def: 'The DNS server that holds the answers for a domain. Facebook\'s run at fixed IP addresses that Facebook advertises with BGP.' },
		{ term: 'SERVFAIL', def: 'The DNS error a resolver returns when it cannot get an answer from a domain\'s name servers.' }
	],
	incident: {
		org: 'Facebook',
		title: 'More details about the October 4 outage',
		date: '2021-10-04',
		url: FB,
		steps: [
			{
				situation: [
					'At 15:58 UTC, Cloudflare notices from outside that Facebook no longer announces the routes to its DNS prefixes. Other Facebook prefixes are still routed.',
					'Your authoritative name servers are still running, and by design they withdraw their BGP advertisements when they cannot reach Facebook\'s data centers.'
				],
				q: 'Where do you look first?',
				options: [
					'The DNS server software, for a crash or a bad zone push',
					'The traffic graphs, for a DDoS against the name servers',
					'The links between the DNS sites and the data centers',
					'The domain registrar, for an expired or changed delegation'
				],
				answer: 2,
				why: 'Running servers that withdrew their own routes point at the check that makes them withdraw: their link to the data centers. Facebook writes that "the entire backbone was removed from operation, making these locations declare themselves unhealthy and withdraw those BGP advertisements." The result: "our DNS servers became unreachable even though they were still operational."'
			},
			{
				situation: [
					'The backbone is down, so engineers cannot reach the data centers through their normal network. The out-of-band network access is down as well.',
					'With DNS gone, many internal tools that the team uses to investigate outages are broken.'
				],
				q: 'How do you get hands on the routers?',
				options: [
					'Keep retrying the VPN until a path comes back',
					'Send engineers to the data centers to work on site',
					'Ask a transit provider to announce your prefixes for you',
					'Wait for the routers to reload their last config'
				],
				answer: 1,
				why: 'Every remote path ran over the network that was down. Facebook "sent engineers onsite to the data centers to have them debug the issue and restart the systems." It took time: the sites are "hard to get into", and the routers are "designed to be difficult to modify even when you have physical access to them".'
			},
			{
				situation: [
					'The on-site engineers confirm the issue and bring the backbone back. Around 21:00 UTC, Cloudflare sees BGP activity from Facebook again, peaking at 21:17.',
					'While the services were offline, individual data centers reported dips in power usage of tens of megawatts.'
				],
				q: 'How do you turn the services back on?',
				options: [
					'All at once, to end the outage as fast as possible',
					'In steps, watching load as you would in a region failure drill',
					'One app at a time, starting with the one that has fewest users',
					'Only after every cache has been warmed from backups'
				],
				answer: 1,
				why: 'Facebook writes that "flipping our services back on all at once could potentially cause a new round of crashes due to a surge in traffic." Reversing the power dip at once "could put everything from electrical systems to caches at risk." Its "storm" drills, which take a service, a data center or a region offline, had trained the team to "carefully manage the increasing loads".'
			},
			{
				situation: [
					'Services are back, and the review notes that the data center security hardening slowed the recovery, for an outage that no attacker caused.'
				],
				q: 'What do you do with the data center access rules?',
				options: [
					'Keep them, and accept slower recovery in a rare event',
					'Remove the physical checks for on-call engineers',
					'Give routers a remote console on the public Internet',
					'Store router passwords in the shared on-call wiki'
				],
				answer: 0,
				why: 'Facebook kept the hardening and wrote: "I believe a tradeoff like this is worth it". It weighs daily security against a slower recovery in a rare event. Each wrong option opens a path an attacker could use every day.'
			},
			{
				situation: [
					'The trigger was a command run during routine maintenance "to assess the availability of global backbone capacity". It took down every connection in the backbone. An audit tool should have stopped it, but a bug in that tool let it through.',
					'Facebook\'s storm drills had taken services, data centers and whole regions offline, but never the global backbone.'
				],
				q: 'What do you add to the drills?',
				options: [
					'A drill that restarts one DNS server at a time',
					'A drill that takes the global backbone offline',
					'A drill that fails over one database cluster',
					'A drill that blocks one office\'s Internet link'
				],
				answer: 1,
				why: 'The recovery worked where drills had trained the team, and the backbone case had never been rehearsed. Facebook writes: "we\'ve never previously run a storm that simulated our global backbone being taken offline, we\'ll certainly be looking for ways to simulate events like this moving forward."'
			}
		],
		outcome: [
			'A command issued during routine maintenance, meant to assess global backbone capacity, took down every connection in Facebook\'s backbone. An audit tool built to block such commands had a bug and did not stop it.',
			'With the backbone gone, the DNS sites declared themselves unhealthy and withdrew their BGP advertisements. Running name servers became unreachable, so no one on the Internet could find Facebook\'s servers.',
			'Cloudflare\'s resolver could not resolve `facebook.com` from around 15:50 to 21:20 UTC, about five and a half hours. Public resolvers handled 30 times more queries than usual as apps and people retried.',
			'Facebook listed its next steps: strengthen testing and drills, and look for ways to simulate the global backbone going offline in its storm exercises. It chose to keep the data center hardening that slowed the recovery.'
		]
	},
	quiz: [
		{
			q: 'Facebook\'s name servers were running during the outage. Why could nobody reach them?',
			options: [
				'Their DNS zone files had been deleted by the command',
				'They withdrew their own BGP routes after losing the backbone',
				'Public resolvers had blocked Facebook\'s IP addresses',
				'Their TLS certificates had expired during the outage'
			],
			answer: 1,
			why: 'Each DNS site stops advertising its BGP routes when it cannot reach the data centers, to take an unhealthy site out of service. With the whole backbone down, every site withdrew at once, and the Internet had no route left to any name server.'
		},
		{
			q: 'Why did the outage also slow down the people fixing it?',
			options: [
				'Their internal tools and remote access ran on the same network and DNS',
				'The on-call rotation had no one assigned for that Monday',
				'The routers refused all logins during a capacity check',
				'Their status page was hosted on `facebook.com`'
			],
			answer: 0,
			why: 'The engineers\' remote access, out-of-band access included, and many internal tools depended on the backbone and DNS that were down. Recovery needed people on site, inside sites designed with high physical and system security.'
		},
		{
			q: 'Public DNS resolvers saw 30 times their usual query rate during the outage. Why?',
			options: [
				'Facebook\'s servers sent their traffic to public resolvers',
				'Attackers used the outage to launch a DNS flood',
				'Resolvers lost their caches when Facebook\'s routes went away',
				'Apps and people retried every lookup that returned `SERVFAIL`'
			],
			answer: 3,
			why: 'Cloudflare writes that apps "start retrying, sometimes aggressively" and users reload pages or relaunch apps. One big site going dark added load to DNS resolvers that served everyone else.'
		}
	],
	recall: {
		q: 'What disconnected Facebook\'s data centers on 4 October 2021, and why was it not blocked?',
		a: 'A maintenance command meant to assess global backbone capacity took down every backbone connection. The audit tool that should have stopped it had a bug.'
	},
	sources: [
		{ title: 'Facebook Engineering: More details about the October 4 outage', url: FB },
		{ title: 'Facebook Engineering: Update about the October 4th outage', url: 'https://engineering.fb.com/2021/10/04/networking-traffic/outage/' },
		{ title: 'Cloudflare: Understanding how Facebook disappeared from the Internet', url: CF }
	]
};
