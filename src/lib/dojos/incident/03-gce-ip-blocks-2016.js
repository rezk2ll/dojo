const PM = 'https://status.cloud.google.com/incident/compute/16007';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'gce-ip-blocks-2016',
	part: 'Changes and config',
	title: 'Google Compute Engine 2016: the config push that withdrew every IP block',
	minutes: 10,
	hook: [
		'Monday 11 April 2016, 18:14 Pacific Time. You are a Google SRE on the network. An alert fires: the Cloud VPN in the asia-east1 region has stopped working.',
		'A second signal comes in. Latency from users to Google Compute Engine (GCE) is rising, as more and more users reach Google at sites that are far from them.',
		'Internal traffic between GCE VMs is not affected.'
	],
	terms: [
		{ term: 'IP block', def: 'A contiguous group of internet addresses. Google uses IP blocks for GCE VMs, network load balancers and Cloud VPNs.' },
		{ term: 'BGP', def: 'The protocol networks use to announce which IP blocks they can reach. Google announces each GCE IP block from several sites, so users take the shortest path.' },
		{ term: 'Canary step', def: 'Deploying a change at one site first and checking that the site still works before the change goes further.' },
		{ term: 'Progressive rollout', def: 'Pushing a change to a fraction of sites at a time, so that a new failure shows up before it reaches every site.' }
	],
	incident: {
		org: 'Google Cloud',
		title: 'Google Compute Engine Incident #16007: Connectivity issues in all regions',
		date: '2016-04-11',
		url: PM,
		steps: [
			{
				situation: [
					'Two things look wrong. The asia-east1 Cloud VPN stopped at 18:14, and latency to GCE keeps climbing for users in many places.',
					'Each GCE IP block is announced over BGP from several sites. When one site stops announcing, users are sent to the next closest site.'
				],
				q: 'What do you check first?',
				options: [
					'The VPN gateways in asia-east1, since they failed first',
					'How many sites still announce the GCE IP blocks',
					'The VMs of the customers who report the VPN failure',
					'The load on the HTTP load balancers in each region'
				],
				answer: 1,
				why: 'Users sent to far away sites mean fewer sites announce GCE. The engineers were "investigating a localized failure of the asia-east1 VPN" and were still looking for the cause 53 minutes later, at 19:07, when the last site stopped announcing.'
			},
			{
				situation: [
					'At 19:08, internal monitors fire dozens of alerts within seconds. By 19:09, inbound internet traffic to GCE in all regions is down by more than 95%.',
					'You do not know the cause yet. You know that recent configuration changes were made to the network.'
				],
				q: 'What do you do now?',
				options: [
					'Keep debugging until you know which change broke the network',
					'Move customer traffic to a region that still works',
					'Revert the most recent configuration changes to the network',
					'Restart the BGP sessions at every site, one region at a time'
				],
				answer: 2,
				why: 'Google: the engineers "decided to revert the most recent configuration changes made to the network even before knowing for sure what the problem was. This was the correct action". Every region was hit, so there was no region to move traffic to. The outage ended at 19:27, 18 minutes after the traffic loss.'
			},
			{
				situation: [
					'It is 19:27 and traffic flows again. The cause is still unknown. The revert of the latest network changes brought traffic back.'
				],
				q: 'What comes next?',
				options: [
					'Freeze all network configuration changes and watch that the systems stay stable',
					'Push the reverted changes again, one at a time, to find the bad one',
					'Close the incident and start the root cause review in the morning',
					'Let the other network teams carry on with their planned changes'
				],
				answer: 0,
				why: 'The team "froze all configuration changes to the network" and worked in shifts overnight. They first made sure the systems were stable and no customer was still hit, then looked for the root cause. By 07:00 on 12 April they had it.'
			},
			{
				situation: [
					'The root cause sits in the network configuration management software. At 14:50, engineers removed one unused GCE IP block. The software found the change in one config file but not yet in a second one. A bug made it push a config with no GCE IP blocks at all.',
					'The canary site found the new config unsafe. A second bug kept that result from reaching the push process, which then started the progressive rollout.'
				],
				q: 'Which new check would have stopped this push, whatever the bugs?',
				options: [
					'A second canary site in another region',
					'A slower rollout, with one site per hour',
					'A ban on removing IP blocks from the config',
					'A diff of IP block announcements before and after'
				],
				answer: 3,
				why: 'Google now compares "the IP block announcements before and after a network configuration change to ensure that they are identical in size and coverage". A second canary reports to the same push process that lost the first canary\'s result.'
			}
		],
		outcome: [
			'Engineers removed one unused IP block at 14:50. The software found the two config files out of sync. It is designed to "fail safe" and keep its current config. A bug made it remove all GCE IP blocks from the new config and push that instead.',
			'The canary step flagged the config as unsafe, but a second bug did not pass that result back to the push process. As each site got the config, it stopped announcing GCE. BGP sent users to the sites that were left, so users saw higher latency instead of errors until the last site got the config at 19:07.',
			'GCE instances in all regions lost external connectivity for 18 minutes, from 19:09 to 19:27 Pacific. Cloud VPN in asia-east1 was down from 18:14. Google gave credits of 10% of monthly GCE charges and 25% of VPN charges, more than its SLAs promise.',
			'Google wrote that "the safeguard of a progressive rollout can be undone by a system designed to mask partial failures". It planned 14 engineering changes. The first ones: monitor GCE network paths, compare IP block announcements before and after each change, and check that every config contains specific Cloud IP blocks.'
		]
	},
	quiz: [
		{
			q: 'The canary site found the new config unsafe. Why did the rollout go on?',
			options: [
				'The canary ran in a region with no GCE traffic',
				'A bug kept the canary\'s result from the push process',
				'An engineer overrode the canary to finish the change',
				'The canary only checked the config syntax'
			],
			answer: 1,
			why: '"A second software bug in the management software did not propagate the canary step\'s conclusion back to the push process". The push system took the config as valid and began the progressive rollout.'
		},
		{
			q: 'Engineers made the change at 14:50, but traffic only dropped at 19:09. Why did users see no errors before that?',
			options: [
				'Each site waited one hour before applying the new config',
				'The monitoring was turned off during the change window',
				'BGP sent users to the sites still announcing GCE',
				'The old config stayed cached in each VM for hours'
			],
			answer: 2,
			why: 'Each GCE IP block is announced from several sites. As sites stopped, BGP routed users to the rest, so users saw higher latency until the last site got the config at 19:07. Google now plans to monitor "directly for a decrease in capacity or redundancy even when the system is still functioning properly."'
		},
		{
			q: 'Before the bug, what was the software designed to do when two config files disagree?',
			options: [
				'Keep its current config and not apply the new one',
				'Apply the newer of the two files',
				'Page an engineer and stop all network changes',
				'Merge both files and push the result'
			],
			answer: 0,
			why: 'The software "is designed to ‘fail safe’ and revert to its current configuration rather than proceeding with the new configuration". The bug did the opposite: it removed all GCE IP blocks and pushed that config.'
		}
	],
	recall: {
		q: 'Which two bugs let one IP block removal take GCE off the internet on 11 April 2016?',
		a: 'The fail safe path removed all GCE IP blocks instead of keeping the current config, and a second bug never passed the canary\'s "unsafe" result to the push process.'
	},
	sources: [
		{ title: 'Google Cloud, Google Compute Engine Incident #16007', url: PM },
		{ title: 'Google SRE Workbook, Canarying Releases', url: 'https://sre.google/workbook/canarying-releases/' }
	]
};
