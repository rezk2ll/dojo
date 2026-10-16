const PM = 'https://blog.cloudflare.com/cloudflare-outage-on-july-17-2020/';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cloudflare-backbone-2020',
	part: 'Networks and DNS',
	title: 'Cloudflare 2020: the Atlanta router change that pulled in the backbone’s traffic',
	minutes: 10,
	hook: [
		'Friday 17 July 2020, 20:25 UTC. You are on Cloudflare’s network engineering team. The backbone link between Newark (EWR) and Chicago (ORD) goes down.',
		'Cloudflare’s backbone is a set of private lines between its data centers. The loss of the link leads to congestion on the backbone between Atlanta (ATL) and Washington, DC (IAD).'
	],
	terms: [
		{ term: 'Backbone', def: 'Cloudflare’s private lines between its data centers. Traffic between two sites can use them instead of the public Internet.' },
		{ term: 'local-preference', def: 'A BGP attribute shared between routers of the same network (iBGP). When two routes reach the same prefix, the route with the higher value wins.' },
		{ term: 'Prefix list', def: 'A named list of IP prefixes in a router config. A policy term that has `prefix-list X` in its `from` block only matches routes in that list.' },
		{ term: 'Maximum-prefix limit', def: 'A cap on how many prefixes a BGP session accepts from a peer. Above the cap, the router shuts the session down.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare outage on July 17, 2020',
		date: '2020-07-17',
		url: PM,
		steps: [
			{
				situation: [
					'Since 20:25, the ATL to IAD part of the backbone has been congested. The Newark to Chicago link is still down.',
					'Atlanta’s backbone router announces Atlanta’s routes to the other backbone routers.'
				],
				q: 'What do you do about the congestion?',
				options: [
					'Shut down the whole backbone until the Newark link is back',
					'Remove some of Atlanta’s routes from the backbone to move its traffic off',
					'Send every data center’s traffic over the public Internet',
					'Wait for the Newark to Chicago link to come back on its own'
				],
				answer: 1,
				why: 'Moving part of Atlanta’s traffic off the backbone puts less load on the ATL to IAD links and leaves the other sites alone. The postmortem: "the team had decided to remove some of Atlanta’s backbone traffic." The mistake came in the change that carried out this plan.'
			},
			{
				situation: [
					'On router `atl01`, the policy `6-BBONE-OUT` has a term `6-SITE-LOCAL`. Its `from` block holds `prefix-list 6-SITE-LOCAL`. Its `then` block sets `local-preference 200`, adds communities and runs `accept`.',
					'The routes that edge routers learn from their own compute nodes have a local-preference of 100.',
					'The proposed change is one line. In edit mode on `atl01`, `show | compare` prints: `! inactive: prefix-list 6-SITE-LOCAL { ... }`.'
				],
				q: 'You review the diff. What do you say?',
				options: [
					'Commit it: it stops `atl01` from announcing the site’s routes',
					'Reject it: the term now matches every route, with preference 200',
					'Commit it, but lower the preference to 150 in the same change',
					'Commit it: an inactive line in Junos only takes effect on reboot'
				],
				answer: 1,
				why: 'With no prefix list in `from`, the term matches all routes and accepts them with local-preference 200, which beats the local 100. The postmortem: "The correct change would have been to deactivate the term instead of the prefix-list." The change was committed, and the outage started at 21:12.'
			},
			{
				situation: [
					'21:12 UTC. Traffic across Cloudflare’s network drops by about 50%. In the traffic manager, Atlanta’s CPU use is in overload, and the CPU of many other data centers falls to near zero.',
					'The affected sites are the ones connected to the backbone, in North America, Europe and Brazil. Other locations run normally.'
				],
				q: 'What do you do?',
				options: [
					'Add servers in Atlanta so it can serve the extra traffic',
					'Restart the edge servers in the data centers with no traffic',
					'Disable the Atlanta router so it drops off the backbone',
					'Bring the Newark to Chicago link back before anything else'
				],
				answer: 2,
				why: 'The other sites are sending their traffic to Atlanta because of routes the Atlanta router announces. Taking that router off the backbone withdraws them, and Cloudflare’s network works without the backbone. The team disabled the Atlanta router and traffic flowed again at 21:39.'
			},
			{
				situation: [
					'From 21:47 to 22:10, a core data center that processes logs and metrics is congested and drops some logs. The edge keeps serving. Full recovery, logs included, comes at 22:10.',
					'Now you pick the fixes. During the leak, Atlanta announced every route with local-preference 200, and each site’s own routes had 100.'
				],
				q: 'Which change stops one site from pulling in other sites’ traffic?',
				options: [
					'Require a second reviewer for every backbone router change',
					'Change the local-preference of each site’s local server routes',
					'Remove Atlanta from the backbone for good',
					'Move all backbone routers to a new software release'
				],
				answer: 1,
				why: 'If each site’s own server routes beat anything learned over the backbone, a leaked route cannot pull its traffic away. Cloudflare deployed that local-preference change right after the incident. A second reviewer does not change which route wins if a leak happens again.'
			}
		],
		outcome: [
			'The outage lasted 27 minutes, from 21:12 to 21:39 UTC. Traffic dropped by about 50% across the network, in 19 locations from San Jose to Moscow and Porto Alegre. It was not an attack.',
			'The cause was the one line change on `atl01`. It deactivated `prefix-list 6-SITE-LOCAL` instead of the term. The term then sent all of Atlanta’s BGP routes to every backbone router with local-preference 200, above the 100 of each site’s local routes, so traffic meant for local compute nodes went to Atlanta. The Atlanta router was overwhelmed.',
			'Cloudflare listed two fixes. The local-preference of local server routes was changed right after the incident. A maximum-prefix limit on backbone BGP sessions was set for Monday 20 July: it would have shut down the backbone sessions in Atlanta, and the network works without the backbone.'
		]
	},
	quiz: [
		{
			q: 'Why did deactivating the prefix list, and not the term, change which routes the term matched?',
			options: [
				'Junos reads an inactive prefix list as an empty list, so the term matches nothing',
				'With no condition left in `from`, the term matches every route',
				'Junos deletes the whole term when one of its lines is inactive',
				'The prefix list was shared, so other routers lost their routes too'
			],
			answer: 1,
			why: 'The prefix list was the only condition in `from`. Without it, the term has no condition, so every route matches, gets local-preference 200 and is accepted. Deactivating the term would have removed the whole match and its actions.'
		},
		{
			q: 'Edge routers had two routes to the same prefix: local from their compute nodes (100) and from Atlanta (200). Which did they use?',
			options: [
				'The local route, because it has the shorter path',
				'The route from Atlanta, because higher local-preference wins',
				'Both, sharing traffic in proportion 100 to 200',
				'The local route, because iBGP routes always lose to local ones'
			],
			answer: 1,
			why: 'RFC 4271 on LOCAL_PREF: "The higher degree of preference MUST be preferred." Local-preference is compared before path length, so 200 from Atlanta beat 100 on every edge router.'
		},
		{
			q: 'How would a maximum-prefix limit have changed this incident?',
			options: [
				'It would have blocked the commit on `atl01`',
				'It would have shut the Atlanta backbone sessions when the route count jumped',
				'It would have rate limited the traffic flowing to Atlanta',
				'It would have lowered the local-preference of the leaked routes'
			],
			answer: 1,
			why: 'A leak of all of Atlanta’s routes makes the number of prefixes on each backbone session jump above the cap. The router then closes the session, which drops Atlanta off the backbone, the same effect as the manual fix, with no engineer in the loop.'
		}
	],
	recall: {
		q: 'What did the one line change on Cloudflare’s Atlanta router deactivate, and what should it have deactivated?',
		a: 'It deactivated `prefix-list 6-SITE-LOCAL` inside the term, so the term sent every route with local-preference 200. It should have deactivated the term `6-SITE-LOCAL` itself.'
	},
	sources: [
		{ title: 'Cloudflare blog: Cloudflare outage on July 17, 2020', url: PM },
		{ title: 'RFC 4271, section 5.1.5: LOCAL_PREF', url: 'https://www.rfc-editor.org/rfc/rfc4271#section-5.1.5' }
	]
};
