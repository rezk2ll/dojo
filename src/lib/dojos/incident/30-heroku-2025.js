const PM = 'https://www.heroku.com/blog/summary-of-june-10-outage/';
const STATUS = 'https://status.heroku.com/incidents/2822';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'heroku-2025',
	part: 'Capacity and cascades',
	title: 'Heroku 2025: the OS update that cut dyno networking',
	minutes: 10,
	hook: [
		'Tuesday 10 June 2025, 06:00 UTC. You are on call at Heroku. Customers report that logins to Heroku work only some of the time.',
		'Your monitoring detects widespread errors with dyno networking. Customer apps start to fail.',
		'Your own internal tools are affected too, and so is the Heroku Status Page.'
	],
	terms: [
		{ term: 'Dyno', def: 'A Heroku container where an app’s code runs.' },
		{ term: 'Private Space', def: 'A dedicated Heroku environment that runs dynos and some add-ons in an isolated network.' },
		{ term: 'Unattended upgrade', def: 'An operating system package upgrade that a host installs on its own, with no operator starting it.' }
	],
	incident: {
		org: 'Heroku',
		title: 'Summary of Heroku June 10 Outage',
		date: '2025-06-10',
		url: PM,
		steps: [
			{
				situation: [
					'08:04. You post the first status update: "Engineers are investigating an issue with the Heroku platform." The Heroku Status site runs on the same infrastructure as the apps that fail.',
					'Requests to the Status site time out, and the site looks as if there were no active incident.'
				],
				q: 'How do you keep customers informed?',
				options: [
					'Keep posting on the Status site, since it is the official channel',
					'Post on a channel that does not run on your own infrastructure',
					'Email every customer from your internal notification tool',
					'Post nothing until you know the root cause'
				],
				answer: 1,
				why: 'The status page and internal tools ran on the affected infrastructure, so "our ability to respond and communicate with you was also severely impaired." A workaround to post on the @herokustatus account on X came at 13:58, almost 8 hours after the start. Status emails from early in the incident were only delivered after service was restored.'
			},
			{
				situation: [
					'08:26. The investigation confirms the core issue: most dynos in Private Spaces cannot make outbound HTTP requests.',
					'The cause could sit at an upstream provider or in your own infrastructure. Some of your hosts are healthy, and some are not.'
				],
				q: 'Where do you look next?',
				options: [
					'Open a case with the upstream provider and wait for its answer',
					'Compare a healthy host with an unhealthy one',
					'Roll back the latest Heroku deploy to every host',
					'Recycle every dyno in the fleet right away'
				],
				answer: 1,
				why: 'The team found it was "not an upstream provider issue", but a failure in Heroku’s own infrastructure. Comparing healthy and unhealthy hosts, engineers found missing network routes at 11:54.'
			},
			{
				situation: [
					'11:54. The unhealthy hosts are missing network routes. Without them, the dynos on those hosts have no outbound connectivity.',
					'You do not yet know what removed the routes.'
				],
				q: 'What do you do now?',
				options: [
					'Add the routes back by hand on each host and close the incident',
					'Find what removed the routes, and restart hosts in turn for relief',
					'Replace every unhealthy host with a newly built one',
					'Wait to see whether the routes come back by themselves'
				],
				answer: 1,
				why: 'At 12:56 the team began rotating restarts of internal instances, which "provided some relief". At 13:11 it learned of an unexpected restart of the network service, and at 13:42 it found the trigger: "an automated upgrade of a system package".'
			},
			{
				situation: [
					'13:42. An automated operating system update ran on production hosts, where it should have been disabled. It restarted the host networking service.',
					'A legacy script applies the correct routes only at first boot, so the restart left the routes missing. The automated updates can still reach more hosts.'
				],
				q: 'What do you do first?',
				options: [
					'Recycle every dyno in the fleet to restore the routes',
					'Stop the automated updates from reaching any more hosts',
					'Fix the legacy script on every host so a restart keeps the routes',
					'Roll back the system package on the hosts already hit'
				],
				answer: 1,
				why: 'Heroku asked the upstream vendor to invalidate the token used for the automated updates. That was confirmed at 17:30 and completed at 19:18, "preventing any further hosts from being impacted." Only then, at 22:01, did the team start a fleetwide dyno recycle.'
			},
			{
				situation: [
					'21:54. The Heroku Dashboard works again. Some customer apps are still affected.',
					'Customers can see and stop their own dynos with the Heroku CLI: `heroku ps` and `heroku ps:stop`.'
				],
				q: 'What do you tell customers who are still affected?',
				options: [
					'Restart all your dynos at once to get the fix quickly',
					'Restart your dynos one at a time',
					'Wait for the fleetwide recycle and change nothing',
					'Delete the app and deploy it again from scratch'
				],
				answer: 1,
				why: 'The status update at 21:54 listed the two CLI commands and said: "dynos should be restarted one at a time to avoid a service disruption." The fleetwide recycle started at 22:01, and the incident was declared resolved at 05:50 on 11 June.'
			}
		],
		outcome: [
			'Root cause: an automated operating system update ran on production infrastructure "when it should have been disabled". It restarted the host networking service. A legacy script applied the correct routes only on initial boot, so the restart cut outbound connectivity for all dynos on the host.',
			'Impact: from 06:00 UTC on 10 June, many customers had up to 24 hours of downtime. Heroku said it was not a security incident and no customer data was lost. The Status Page ran on the same infrastructure, so updates came late.',
			'Fixes in the June summary: disable the automated upgrade service, with no system changes outside the controlled deployment process, and fix network routing so services survive a graceful restart. Heroku also planned independent backup channels for communication and faster tooling to diagnose and recover.',
			'The September update reports: a permanent halt on unattended vendor OS upgrades, automated startup scripts for the networking services, CDN caching on the Status site, and a move of incident communication to the Salesforce Trust site.'
		]
	},
	quiz: [
		{
			q: 'Why did one restart of the networking service take the dynos on a host offline?',
			options: [
				'The restart deleted the host’s DNS cache and the dynos could not resolve names',
				'The routes were applied by a script that runs only at first boot',
				'The restart changed the host’s IP address and broke the Private Space',
				'The upgraded package removed the network driver from the host'
			],
			answer: 1,
			why: 'The networking service "relied on a legacy script that only applied correct routing rules on initial boot." When the service restarted, nothing applied the routes again, so the dynos lost outbound connectivity.'
		},
		{
			q: 'Why did stopping the automated updates come before the fleetwide dyno recycle?',
			options: [
				'The recycle needed the update token to run',
				'While updates still ran, more hosts kept losing their routes',
				'The vendor would not allow a recycle during an update',
				'The recycle had to wait for the Dashboard to come back'
			],
			answer: 1,
			why: 'Each automated update restarted networking on another host and removed its routes. Invalidating the token, completed at 19:18, stopped "any further hosts from being impacted"; the recycle at 22:01 then fixed the hosts already hit.'
		},
		{
			q: 'Your servers run Ubuntu with automatic package upgrades on. What does this incident suggest you check first?',
			options: [
				'That every upgrade log is sent to your central log server',
				'That no upgrade can change a production host outside a deploy',
				'That the upgrades only run at night, when traffic is low',
				'That each upgrade downloads its packages from a mirror you host'
			],
			answer: 1,
			why: 'Heroku’s root cause was "an unexpected change to our running environment", and its fix was that "No system changes will occur outside our controlled deployment process". An upgrade at night would still have restarted networking and dropped the routes.'
		}
	],
	recall: {
		q: 'What cut outbound networking for Heroku dynos on 10 June 2025?',
		a: 'An automated OS update that should have been disabled restarted the host networking service. A legacy script set the routes only at first boot, so after the restart the dynos had no outbound routes.'
	},
	sources: [
		{ title: 'Heroku blog, Summary of Heroku June 10 Outage (15 June 2025)', url: PM },
		{ title: 'Heroku Status, incident 2822: Investigating an issue with access to Heroku services', url: STATUS },
		{ title: 'Heroku blog, Corrective Action Update for the Heroku June 10th Outage (5 September 2025)', url: 'https://www.heroku.com/blog/corrective-action-update-june-10-outage/' },
		{ title: 'Heroku Dev Center, Private Spaces', url: 'https://devcenter.heroku.com/articles/private-spaces' }
	]
};
