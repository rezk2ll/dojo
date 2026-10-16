const PM = 'https://status.cloud.google.com/incident/zall/20013';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'google-auth-2020',
	part: 'Capacity and cascades',
	title: 'Google 2020: the User ID Service that ran out of quota',
	minutes: 10,
	hook: [
		'Monday 14 December 2020, 03:43 US/Pacific. An automated alert fires for capacity on the Google User ID Service. This service holds the ID of every Google account and handles the credentials behind OAuth tokens and cookies.',
		'At 03:46 a second alert fires: errors from the User ID Service. At 03:48 you are paged, one minute after customers start to feel it.',
		'Gmail, Calendar, Docs, the Cloud Console and BigQuery now return 5xx errors on almost every request that needs a signed-in Google account. Many of your own internal tools return the same errors.'
	],
	terms: [
		{ term: 'Quota', def: 'The amount of a resource, here storage for the account database, that a service is allowed to use. Google sets quotas with automation.' },
		{ term: 'Grace period', def: 'A delay between a new quota decision and the moment the quota system enforces it.' },
		{ term: 'Paxos', def: 'A protocol where a majority of processes must accept each proposal before it is committed. The User ID Service database uses it, with one leader process doing the writes.' },
		{ term: 'Outdated data', def: 'A read that may miss the latest writes. The User ID Service rejects such reads "for security reasons".' }
	],
	incident: {
		org: 'Google',
		title: 'Google Cloud Infrastructure Components Incident #20013',
		date: '2020-12-14',
		url: PM,
		steps: [
			{
				situation: [
					'03:48. Credential issuance and account metadata lookups fail for all Google user accounts. Without them, Google cannot tell whether a request comes from a signed-in user.',
					'You have two open alerts. The capacity alert on the User ID Service fired at 03:43. The error alert on the same service fired at 03:46.'
				],
				q: 'What do you look at first?',
				options: [
					'The capacity alert from 03:43: which limit the service hit and what lowered it',
					'The latest Gmail deploy, since Gmail users report the most errors',
					'The load balancers in front of Google accounts, where 5xx errors usually start',
					'Traffic graphs for a surge of sign-ins that could exhaust the service'
				],
				answer: 0,
				why: 'The capacity alert came three minutes before the errors, on the service that fails. The report: "The scope of the problem was immediately clear as the new quotas took effect." The team had the root cause and a possible fix at 04:08, 20 minutes after the page.'
			},
			{
				situation: [
					'04:08. An automated quota system lowered the storage quota of the account database. The quota system sees the User ID Service usage as 0.',
					'With the lower quota, the Paxos leader of the account database cannot write. Most reads are now outdated, and the service rejects them. The proposed fix: disable quota enforcement for this database.'
				],
				q: 'How do you apply the fix?',
				options: [
					'Disable enforcement in one datacenter, watch the errors, then do all the others',
					'Disable enforcement in every datacenter at once, since every user is down',
					'Set the quota by hand to the reported usage plus a 50 percent margin',
					'Let the service accept outdated reads until writes work again'
				],
				answer: 0,
				why: 'The team disabled enforcement in one datacenter at 04:22, saw it "quickly improved the situation", and applied it to all datacenters at 04:27. Error rates were normal by 04:33, so checking first cost 5 minutes. The reported usage is 0, so a margin on top of it gives no quota, and outdated reads are rejected on purpose.'
			},
			{
				situation: [
					'Customers look for news on the Google Cloud and Google Workspace status dashboards. Cloud Support posts there with internal tools.',
					'Those internal tools fail with the same errors. Customers cannot create or view support cases in the Cloud Console.'
				],
				q: 'How do you get word to customers?',
				options: [
					'Wait for the fix to land, then post one complete update',
					'Post through a channel whose sign-in does not use Google accounts',
					'Keep retrying the dashboard tool until one sign-in goes through',
					'Ask customers to open support cases so you can answer each one'
				],
				answer: 1,
				why: 'The internal tools failed with the User ID Service. The report says this "delayed our ability to share outage communications", and the first update went out at 05:34, after the impact had ended. Fix 3 in the report is to make the tools for external communication work "during outages that affect internal tools".'
			},
			{
				situation: [
					'04:33. Error rates of the User ID Service are back to normal. Most products recover by themselves within a few minutes.',
					'The mitigation from 04:27 is in place: quota enforcement is disabled in all datacenters.'
				],
				q: 'What do you do now?',
				options: [
					'Close the incident and schedule the postmortem',
					'Keep the incident open and check each product for errors that remain',
					'Turn quota enforcement back on, since the service is healthy again',
					'Ask every client team to retry all their failed requests right now'
				],
				answer: 1,
				why: 'Several products still failed after 04:33. Google Calendar and the Workspace Admin Console served errors until 05:21 "due to a traffic spike following initial recovery", and some Gmail users saw cached errors for up to an hour. The report lists "fixing the underlying cause" as work still to do, so the zero usage report was not yet fixed.'
			},
			{
				situation: [
					'The review of the quota automation finds four safety checks that should block a bad cut. One blocks changes that hit a large number of users. One blocks lowering a quota below usage. One blocks large cuts to storage systems, and one blocks very low quotas.',
					'None of them fired. The change targeted a single service, and its reported usage was 0.'
				],
				q: 'Which rule do you add first to the quota automation?',
				options: [
					'Raise the "large number of users" threshold so one service counts',
					'Make the grace period before enforcement twice as long',
					'Block any cut when a busy service suddenly reports a usage of 0',
					'Require that quota cuts stay above the reported usage'
				],
				answer: 2,
				why: 'The report: the checks "did not cover the scenario of zero reported load for a single service". The rule on usage already existed and passed, because the usage it compared against was 0. A longer grace period only delays the cut, since no alert fired during the first one.'
			}
		],
		outcome: [
			'Root cause: in October, Google registered the User ID Service with a new quota system. Parts of the old quota system stayed in place and reported the service usage as 0. When the grace period on enforcement expired, the automation lowered the quota of the account database.',
			'The Paxos leader of the account database could then no longer write. Shortly after, most reads were outdated, and the User ID Service rejected them, so authentication lookups failed.',
			'Impact: from 03:46 to 04:33 US/Pacific, 47 minutes, Google served 5xx errors on almost all authenticated traffic. All authenticated Google Workspace apps were down. BigQuery streaming requests returned about 75 percent errors, and about 15 percent of Cloud Storage requests failed.',
			'A correction on 22 December added that "some operations with Cloud service accounts experienced elevated error rates". The first report had said service accounts were not affected.',
			'The fixes Google listed: review the quota automation "to prevent fast implementation of global changes", catch incorrect configurations sooner, make external communication work when internal tools fail, make the User ID Service database more resilient to write failures, and limit the impact on Google Cloud data planes when the User ID Service fails.'
		]
	},
	quiz: [
		{
			q: 'The quota cut stopped writes to the account database. Why did sign-ins fail, which mostly need reads?',
			options: [
				'Reads also count against the storage quota, so they were refused as well',
				'Without new writes most reads became outdated, and the service rejects outdated reads',
				'The Paxos leader also serves every read, and it crashed when its writes failed',
				'Sign-ins write a new cookie on every request, so they failed with the writes'
			],
			answer: 1,
			why: 'The User ID Service rejects requests "when it detects outdated data", for security. Once the Paxos leader could not write, most reads became outdated and the service refused them.'
		},
		{
			q: 'The quota change was made in October. Why did users only feel it on 14 December?',
			options: [
				'The new quota system needed two months to collect usage data',
				'A grace period delayed enforcement, and no alert fired while it ran',
				'Traffic in October was too low to reach the lowered quota',
				'The October change had to wait for the December deploy window'
			],
			answer: 1,
			why: 'The report: "An existing grace period on enforcing quota restrictions delayed the impact, which eventually expired". The check on large storage cuts did not fire "since no alert fired during the grace period".'
		},
		{
			q: 'Your status page and your support tool both sign in through your company SSO. What does this incident tell you to change?',
			options: [
				'Add a second SSO server in the same cluster as the first',
				'Give the status page a sign-in that does not use your SSO',
				'Raise the SSO quota so the status page always has room',
				'Cache SSO tokens on the status page for one full hour'
			],
			answer: 1,
			why: 'Google could not update its dashboards until 05:34 because its internal tools failed with the same errors. A tool that tells customers about an outage has to work when the system it depends on is the one that is down.'
		}
	],
	recall: {
		q: 'Why did the automated quota system cut the User ID Service quota on 14 December 2020?',
		a: 'After an October migration, a leftover part of the old quota system reported the service usage as 0. When the grace period expired, the automation lowered the quota, and the Paxos leader of the account database could no longer write.'
	},
	sources: [
		{ title: 'Google Cloud Status Dashboard, Google Cloud Infrastructure Components Incident #20013 (preliminary statement, full report and correction)', url: PM },
		{ title: 'Google SRE book, chapter 23: Managing Critical State, Distributed Consensus for Reliability (Paxos)', url: 'https://sre.google/sre-book/managing-critical-state/' }
	]
};
