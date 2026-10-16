const PM = 'https://web.archive.org/web/20141003124426/http://www.joyent.com/blog/postmortem-for-outage-of-us-east-1-may-27-2014';
const BOOTER = 'https://github.com/TritonDataCenter/sdc-booter/blob/acf1a7e692fa9c0e719aff1f621f5e069c2b0dd9/README.md';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'joyent-2014',
	part: 'Capacity and cascades',
	title: 'Joyent 2014: every server in us-east-1 rebooted at once',
	minutes: 10,
	hook: [
		'Tuesday 27 May 2014, 20:13 UTC (13:13 PDT). You run operations for the Joyent public cloud. Its us-east-1 datacenter runs SmartDataCenter, the Joyent software that manages every server and the customer instances (VMs) on them.',
		'At 20:13, every server in us-east-1 reboots at the same moment. That includes the servers of the control plane, which serves the us-east-1 API, and every customer instance.',
		'The control plane is built to survive any two failures inside the datacenter. Right now every one of its servers is down together.'
	],
	terms: [
		{ term: 'PXE boot', def: 'A server boots from the network: it asks a DHCP server for an address and downloads its boot image over TFTP. Joyent compute nodes boot this way.' },
		{ term: 'Throttle', def: 'A limit on how much work a service takes at once. Joyent infrastructure has throttles "to ensure that it cannot run away with a machine".' },
		{ term: 'Control plane', def: 'The SmartDataCenter services that run the API and the boot sequences. Some of its components are stateful: they keep data that they must get back after a restart.' },
		{ term: 'Split brain', def: 'Two parts of a cluster each act as the only leader and accept writes. Their data then disagrees, and some of it gets lost.' }
	],
	incident: {
		org: 'Joyent',
		title: 'Postmortem for outage of us-east-1',
		date: '2014-05-27',
		url: PM,
		steps: [
			{
				situation: [
					'Right after the reboot, every compute node is sending PXE boot requests at the same time. The DHCP and TFTP system caches what it needs, so it can answer boots while the control plane is down.',
					'The contention on the TFTP boot infrastructure is extremely high. Its throttles are on, and the nodes boot slowly.'
				],
				q: 'What do you do about the slow boots?',
				options: [
					'Remove the throttles on the TFTP boot infrastructure',
					'Keep the throttles and boot the nodes by hand, one rack at a time',
					'Hold all customer nodes until the control plane is back',
					'Set up a second TFTP server first and split the nodes between both'
				],
				answer: 0,
				why: 'The postmortem: "We removed the throttles when we identified this was causing the compute nodes to boot more slowly." Most customer instances then came online over the following 20 to 30 minutes.'
			},
			{
				situation: [
					'20:45. About 80 percent of customer instances are back. A small number of compute nodes on legacy hardware are still down: they failed to get a DHCP lease at boot.',
					'The cause is a known, transient bug in the network card driver on those platforms. It hits about 10 percent of their boots.'
				],
				q: 'What do you do with those nodes?',
				options: [
					'Leave them, since the DHCP client retries on its own',
					'Reboot each affected node again',
					'Move their instances to newer hardware right now',
					'Build and deploy a fixed network driver first'
				],
				answer: 1,
				why: 'The postmortem: "The mitigation for this is for an operator to simply initiate another reboot". Joyent rebooted the affected nodes "as soon as we identified them". Newer servers use other network cards, so only a smaller set of nodes had the problem.'
			},
			{
				situation: [
					'The customer instances are coming back, but the us-east-1 API is still down. Its stateful components all failed at the same moment.',
					'They did not keep enough history to bring themselves back online.'
				],
				q: 'How do you bring the stateful components back?',
				options: [
					'Start every copy from its own local state and let them catch up later',
					'Restore every component from the last nightly backup',
					'Recover the components by hand, so that the copies agree before they serve',
					'Leave them off and run the API without its stateful parts for now'
				],
				answer: 2,
				why: 'The postmortem: "we would rather systems be unavailable than come up "split brain" and suffer data loss as a result." The manual recovery kept the API down until 21:30 UTC, 1 hour and 17 minutes in total.'
			},
			{
				situation: [
					'The review finds what happened at 20:13. An operator was upgrading some new servers with the tool that runs commands remotely on compute nodes.',
					'The reboot command for the new servers was mistyped and named every server in the datacenter instead. The tool asked for no confirmation and rebooted them all without delay.'
				],
				q: 'What do you change first?',
				options: [
					'Add a training session on the tool for every operator',
					'Make the tool refuse a reboot of all servers at once',
					'Take the remote command tool away from every operator',
					'Log every command the tool runs, for a later audit'
				],
				answer: 1,
				why: 'Joyent wrote that the tool "does not have enough input validation to prevent this from happening without extra steps/confirmation". Its first fix: input validation that "will not allow for all servers, and control plane servers to be rebooted simultaneously". Joyent also planned to rethink "what tools are necessary", so that "full power" tools are not the only way to do routine tasks.'
			}
		],
		outcome: [
			'Root cause: an operator upgrading new capacity mistyped a reboot command in the remote update tool. It specified every server in us-east-1, and the tool rebooted them all at 20:13 UTC.',
			'Impact: customer instances were down for at least 20 minutes and at most 149 minutes. 80 percent were back within 32 minutes, and over 90 percent within 59 minutes. The API was back at 21:30 UTC, after 1 hour and 17 minutes.',
			'Three things slowed recovery: the TFTP throttles, the network card bug on legacy hardware, and the manual recovery of the stateful control plane components.',
			'The fixes Joyent listed: strict input validation in the tools that humans and systems use, a control plane that records enough state on each node to recover from a full reboot without an operator, and faster migration of customer instances off the legacy hardware.'
		]
	},
	quiz: [
		{
			q: 'Why did the boot throttles slow the recovery on 27 May?',
			options: [
				'They limited each node to one boot attempt, so failed boots stayed down',
				'Every server sent its boot request at once, and the throttles held most of them back',
				'They blocked boots until the control plane was back online',
				'They sent all boot requests to one TFTP server in another datacenter'
			],
			answer: 1,
			why: 'The throttles exist so that the boot infrastructure "cannot run away with a machine". With every server in the datacenter booting together, Joyent found that they were "causing the compute nodes to boot more slowly".'
		},
		{
			q: 'The control plane survives any two failures. Why did its API stay down for over an hour?',
			options: [
				'Its servers were the last ones in the datacenter to get a DHCP lease',
				'Its stateful parts all failed together and lacked the history to restart',
				'The operator had deleted its data with the same mistyped command',
				'Its servers ran on the legacy hardware with the network card bug'
			],
			answer: 1,
			why: 'Surviving two failures assumes the other copies keep running. Here every copy rebooted at once, and none kept enough history to bring itself back, so operators had to recover them by hand.'
		},
		{
			q: 'Three database nodes all restart at once after a power cut. Why not let each one start and accept writes from its own local data?',
			options: [
				'Each node would need a new IP address before it can accept writes',
				'Several nodes could each act as leader and accept writes, so their data would disagree',
				'The nodes would boot too fast and overload the TFTP server',
				'Local data is always deleted on restart, so there is nothing to start from'
			],
			answer: 1,
			why: 'The Google SRE book describes this case: "each side (incorrectly) elects a master and accepts writes and deletions, leading to a split-brain scenario and data corruption." Joyent chose a longer API outage over that risk.'
		}
	],
	recall: {
		q: 'What rebooted every server in Joyent us-east-1 on 27 May 2014?',
		a: 'An operator mistyped a reboot command in the remote update tool. Meant for a few new servers, it named every server in the datacenter, and the tool had no input validation or confirmation to stop it.'
	},
	sources: [
		{ title: 'Joyent blog, Postmortem for outage of us-east-1 (28 May 2014, Internet Archive copy)', url: PM },
		{ title: 'Google SRE book, chapter 23: Managing Critical State (split brain)', url: 'https://sre.google/sre-book/managing-critical-state/' },
		{ title: 'TritonDataCenter/sdc-booter README: the DHCP server used to boot compute nodes', url: BOOTER }
	]
};
