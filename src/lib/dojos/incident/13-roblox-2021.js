const PM = 'https://about.roblox.com/newsroom/2022/01/roblox-return-to-service-10-28-10-31-2021';
const BBOLT = 'https://github.com/etcd-io/bbolt/blob/a4ef19710eb7ddc41fd1155336baf331b5c57ba8/README.md#L885-L890';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'roblox-2021',
	part: 'Data',
	title: 'Roblox 2021: the 73-hour Consul outage',
	minutes: 10,
	hook: [
		'Thursday 28 October 2021, 13:37. Roblox runs over 18,000 servers and 170,000 containers in its own data centers. Vault is slow, and one Consul server has a high CPU load. Players do not notice yet.',
		'Consul is the service registry: every Roblox service asks it where the services it calls are running. Nomad needs it to schedule containers, and Vault needs it to hand out production secrets.',
		'The Consul metrics show the median write latency of its key/value store at 2 seconds. It is normally under 300 ms.'
	],
	terms: [
		{ term: 'Consul', def: 'HashiCorp\'s service registry and key/value store. At Roblox, 5 voter servers hold the state and 5 non-voters serve extra reads.' },
		{ term: 'Raft leader', def: 'The one voter that replicates every write to the other voters and decides when a write is committed. Consul uses the Raft algorithm to elect it.' },
		{ term: 'Streaming', def: 'A feature of Consul 1.10 for sending updates across the cluster, designed to use less CPU and network bandwidth than long polling.' },
		{ term: 'Freelist', def: 'BoltDB\'s list of pages in its file that held deleted data and can be reused. The file itself never shrinks.' }
	],
	incident: {
		org: 'Roblox',
		title: 'Roblox Return to Service 10/28-10/31 2021',
		date: '2021-10-28',
		url: PM,
		steps: [
			{
				situation: [
					'13:37 to 16:00 on 28 October. One Consul server has a high CPU load, and median key/value write latency is 2 seconds instead of under 300 ms.',
					'At Roblox\'s scale hardware fails often, and Consul survives a dead server. A server that is slow but still up can drag the whole cluster down.'
				],
				q: 'What do you try first?',
				options: [
					'Replace the Consul server with the high CPU load',
					'Restart every Consul server at once',
					'Restore Consul from yesterday\'s snapshot',
					'Add 5 more non-voter servers for reads'
				],
				answer: 0,
				why: 'The evidence pointed at one server, and the team "began the process of replacing one of the Consul cluster nodes." It did not help: "At 16:35, the number of online players dropped to 50% of normal." By 19:00 they had moved most of the cluster to new 128-core machines, and writes still took about 2 seconds.'
			},
			{
				situation: [
					'02:00 on 29 October. The whole Roblox platform is down. The Consul leader is often out of sync with the other voters. The team will shut Consul down and reset it from a snapshot taken a few hours earlier, at the start of the outage.',
					'No players are connected, but internal Roblox services keep sending reads and writes to Consul for service discovery and health checks.'
				],
				q: 'How do you bring the reset cluster back?',
				options: [
					'Block client access with iptables, then let traffic back in a controlled way',
					'Start all servers at once and let the internal services reconnect',
					'Start the voters first, then the non-voters an hour later',
					'Restore the snapshot onto the old 64-core servers instead'
				],
				answer: 0,
				why: 'The team feared the internal load "might immediately push the cluster back into an unhealthy state", so they "configured iptables on the cluster to block access." The reset went well, but once the block was lifted, median write latency climbed back to 2 seconds.'
			},
			{
				situation: [
					'04:00 on 29 October, over 14 hours in. Faster hardware did not help, and neither did the reset. There is still no user traffic, and Consul is still slow.',
					'Thousands of containers try to reconnect to Consul. Many services run hundreds of instances, and health checks run every 60 seconds.'
				],
				q: 'What do you do next?',
				options: [
					'Cut Consul usage to what is essential, then bring services back slowly',
					'Reset Consul from an older snapshot, from the day before',
					'Add a second Consul cluster and split the services between the two',
					'Raise the Raft timeouts so the leader stops falling out of sync'
				],
				answer: 0,
				why: 'The team disabled "all non-essential usage", scaled services "to single digits", and moved health checks "from 60 seconds to 10 minutes". They restarted at 16:00. By 02:00 on 30 October Consul was unhealthy again, with much less load. The load from Roblox services was not the only cause.'
			},
			{
				situation: [
					'02:00 on 30 October, 36 hours in. Hardware, the cluster state and the load from Roblox services have each been ruled out as the only cause.'
				],
				q: 'Where do you look now?',
				options: [
					'Inside Consul: debug logs, OS metrics, perf reports and flame graphs',
					'In the network: packet loss between the Consul servers',
					'In the services: which client sends the most Consul requests',
					'In the Vault audit logs, since Vault slowed down first'
				],
				answer: 0,
				why: 'The team "started looking at Consul internals for clues." The data showed key/value writes "getting blocked for long periods of time". They first tried going back to 64-core servers, which did not help. Then perf reports showed most of the time "in kernel spin locks via the Streaming subscription code path."'
			},
			{
				situation: [
					'Around noon on 30 October. Roblox enabled Consul streaming on a few services months ago, then on more over time. On 27 October at 14:00, one day before the outage, it was enabled on the traffic routing service, along with 50% more traffic routing nodes.'
				],
				q: 'What do you change?',
				options: [
					'Disable streaming on every Consul system',
					'Disable streaming on the traffic routing service only',
					'Remove the 50% of extra traffic routing nodes',
					'Upgrade Consul to the newest 1.10 patch release'
				],
				answer: 0,
				why: 'The team "disabled the streaming feature for all Consul systems, including the traffic routing nodes." The change finished at 15:51, and median write latency fell to 300 ms. Some leaders were still slow, so the team kept those servers from staying elected and moved on to restoring services.'
			}
		],
		outcome: [
			'Two problems in Consul caused the outage. Under very high read and write load, streaming put heavy contention on a single Go channel, which blocked writes. The 128-core servers were dual socket machines with NUMA memory, and the contention got worse on them.',
			'The slow leaders came from BoltDB, the library Consul uses for its Raft log. One 4.2 GB log store the team examined held 489 MB of data, and its freelist had nearly a million free pages. On every log append of 16 kB or less, BoltDB wrote out a 7.8 MB freelist. The team compacted the database with BoltDB tooling and planned a move to its successor, bbolt.',
			'The way back took another day. The cache system, which handles 1 billion requests per second, had to be redeployed from scratch. Players were let in through DNS steering in steps of about 10%, while database and cache load were checked. At 16:45 on Sunday 31 October, 73 hours after the start, all players had access.',
			'The monitoring that would have helped depended on Consul too. Roblox removed that dependency, so the telemetry no longer relies on the systems it monitors. It also moved critical services to their own Consul clusters, deleted obsolete key/value data, and built out a second data center for backend services.'
		]
	},
	quiz: [
		{
			q: 'The team moved Consul to 128-core servers to handle more load. Why did that not help?',
			options: [
				'Streaming contended on one Go channel, and dual-socket NUMA servers made that contention worse',
				'The new servers had slower disks, so each Raft write took longer to reach storage',
				'Consul only uses one CPU core, so the extra cores sat idle during the outage',
				'The new servers needed a fresh snapshot, and the restore erased the cluster config'
			],
			answer: 0,
			why: 'Under very high read and write load, streaming blocked writes on a single Go channel. The 128-core servers were dual socket with a NUMA memory model: "The additional contention on shared resources thus got worse under this architecture." The new machines also had faster NVMe disks.'
		},
		{
			q: 'Why did a BoltDB log holding 489 MB of data make each 16 kB Raft write slow?',
			options: [
				'Every append also wrote a 7.8 MB freelist tracking nearly a million free pages',
				'The 4.2 GB file no longer fit in memory, so every write had to read it from disk',
				'BoltDB rewrites the whole file on each commit to keep it compact',
				'The snapshot that trims the log was locking the file during every write'
			],
			answer: 0,
			why: 'Consul deletes old log entries after each snapshot, but a BoltDB file never shrinks: the freed pages go on the freelist. The bbolt README: "deleting large chunks of data will not allow you to reclaim that space on disk." With a huge freelist, each small write carried 7.8 MB of bookkeeping.'
		},
		{
			q: 'What made the first day of diagnosis harder, and what did Roblox change for it?',
			options: [
				'The telemetry depended on Consul, so Roblox made it independent of the systems it monitors',
				'The logs were on the Consul servers, so Roblox now copies them off every hour',
				'HashiCorp staff had no access, so Roblox gave them standing access to production',
				'The dashboards showed averages, so Roblox switched all graphs to percentiles'
			],
			answer: 0,
			why: 'With Consul unhealthy, the monitoring that relied on it was degraded too. The postmortem: "Our telemetry systems no longer depend on the systems that they are configured to monitor."'
		}
	],
	recall: {
		q: 'Which two problems inside Consul caused Roblox\'s 73-hour outage?',
		a: 'Contention in the new streaming feature under very high read and write load, and BoltDB writing a 7.8 MB freelist on every Raft log append.'
	},
	sources: [
		{ title: 'Roblox: Roblox Return to Service 10/28-10/31 2021', url: PM },
		{ title: 'etcd-io/bbolt README: Caveats and limitations', url: BBOLT }
	]
};
