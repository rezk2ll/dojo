const EXAMPLES = 'https://github.com/ansible/ansible-examples/blob/b50586543c6c4be907fdc88f9f78a2b35d2a895f';
const ANSIBLE_DOCS = 'https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'toil-and-automation',
	part: 'The DevOps mindset',
	title: 'Toil: the work that should not need you',
	minutes: 10,
	hook: [
		'Every Monday you SSH into six web servers. You check the disk, delete old files in `/tmp`, and restart the app if memory looks high. Forty minutes. **Next Monday, the exact same forty minutes.**',
		'Nothing is better after you finish. The servers are where they were last week. And when the company adds six more servers, your Monday doubles.',
		'Google\'s SRE teams have a precise word for this kind of work: **toil**. Today you learn to spot it, measure it, and decide what to automate first.'
	],
	terms: [
		{ term: 'Toil', def: 'Work tied to running a production service that tends to be manual, repetitive, automatable, tactical (interrupt-driven and reactive), leaves no lasting improvement, and grows with the size of the service. A task does not need all six traits to be toil.' },
		{ term: 'Overhead', def: 'Admin work not tied to running the service: meetings, HR paperwork, goal setting. Necessary, but not toil.' },
		{ term: 'Engineering work', def: 'Work that needs human judgment and makes a lasting improvement: writing automation, fixing a root cause, improving monitoring.' },
		{ term: 'Runbook', def: 'Written steps for a recurring task or alert: "log in to X, run this, check the output, restart Y if...". In other words, pseudocode.' },
		{ term: 'Rolling update', def: 'Updating servers a few at a time, taking each out of the load balancer while it changes, so the service stays up.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['alert["Alert: /tmp at 95%"] --> human["You: ssh, find, rm, restart"]'],
				highlight: ['human'],
				note: 'Pure toil. Manual, repetitive, triggered by an interrupt, and the server is no better afterwards. It also scales linearly: twice the servers, twice the work.'
			},
			{
				add: ['human -.->|"write it down"| runbook["Runbook: steps and checks"]'],
				highlight: ['runbook'],
				note: 'Step one is writing the steps down. The SRE workbook points out that a runbook saying "log in to X, run this, restart Y if..." is **already pseudocode** for someone who can program.'
			},
			{
				add: ['runbook --> script["Script: a human runs it"]'],
				highlight: ['script'],
				note: 'Partial automation. Faster and the same every time. But careful: the SRE book says **the hands-on time you spend running a script is still toil**.'
			},
			{
				add: ['script --> auto["Automation: detects and fixes, no human"]'],
				highlight: ['auto'],
				note: 'Full automation: the system notices the problem and fixes it. Safety matters now. Automation with admin powers needs checks, and should **hand over to a human** when something looks unsafe.'
			},
			{
				add: ['auto -.->|"better still"| fix["Root cause fixed: the app stops filling /tmp"]'],
				highlight: ['fix'],
				note: 'The best toil is the toil that no longer exists. Ask **why** `/tmp` fills up, and get it fixed at the source. A clever cleanup script can hide a bug that should have been fixed instead.'
			}
		]
	},
	example: {
		title: 'lamp_haproxy/rolling_update.yml',
		repo: 'ansible/ansible-examples',
		url: `${EXAMPLES}/lamp_haproxy/rolling_update.yml#L14-L47`,
		lang: 'yaml',
		code: `- hosts: webservers
  serial: 1

  # These are the tasks to run before applying updates:
  pre_tasks:
  - name: disable nagios alerts for this host webserver service
    nagios: 'action=disable_alerts host={{ inventory_hostname }} services=webserver'
    delegate_to: "{{ item }}"
    with_items: "{{ groups.monitoring }}"

  - name: disable the server in haproxy
    haproxy: 'state=disabled backend=myapplb host={{ inventory_hostname }} socket=/var/lib/haproxy/stats'
    delegate_to: "{{ item }}"
    with_items: "{{ groups.lbservers }}"

  roles:
  - common
  - base-apache
  - web

  # These tasks run after the roles:
  post_tasks:
  - name: wait for webserver to come up
    wait_for: 'host={{ inventory_hostname }} port=80 state=started timeout=80'

  - name: enable the server in haproxy
    haproxy: 'state=enabled backend=myapplb host={{ inventory_hostname }} socket=/var/lib/haproxy/stats'
    delegate_to: "{{ item }}"
    with_items: "{{ groups.lbservers }}"
…`,
		notes: [
			'This is a **runbook turned into code**. Silence the alerts, take the server out of HAProxy, update it, wait until port 80 answers, put it back. The steps you used to do by hand at night, in the same order every time. You will learn Ansible in part 6.',
			'`serial: 1` makes Ansible handle **one host at a time** instead of all of them in parallel, which is what a rolling update needs ([Ansible docs](https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide/playbooks_strategies.rst#setting-the-batch-size-with-serial)).',
			'`delegate_to` runs a task on another machine: the HAProxy and Nagios tasks run on the load balancer and monitoring hosts, about the web server being updated ([delegation docs](https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide/playbooks_delegation.rst)). Ansible runs `pre_tasks`, then the roles, then `post_tasks`.',
			'A safety check is built in. If port 80 does not answer within 80 seconds, `wait_for` fails, and by default Ansible stops running tasks on that host. The broken server is **never put back** into HAProxy.',
			'The repo is archived and the style is old (`key=value` arguments, `with_items`). The `haproxy` and `nagios` modules now live in the `community.general` collection. The idea has not aged.'
		]
	},
	tradeoff: {
		gain: [
			'Hands-on time drops, and it stops growing every time the fleet grows.',
			'The same steps every time, including at 3 a.m. when people make mistakes.',
			'Time comes back for engineering work. Google SRE caps operational work at 50% of each SRE\'s time for exactly this reason.'
		],
		cost: [
			'Automation takes time to build and to maintain. The SRE workbook asks you to compare that cost with the time it saves.',
			'Automation with admin powers can cause outages fast. It needs safety checks and a way to stop and call a human.',
			'A script can hide a root cause, and the team can forget how the system really works underneath.'
		]
	},
	task: {
		prompt: 'Your weekly ops list: (a) clean `/tmp` on six web servers, 40 min; (b) team meeting, 60 min; (c) create user accounts on request, about 10 tickets of 15 min, more each time the company hires; (d) write an Ansible role for nginx, a one-off of about 6 hours; (e) renew a TLS certificate by hand, 30 min every quarter. Label each one toil, overhead or engineering. Then pick what to tackle first and say how.',
		hint: 'Use the SRE checklist: manual, repetitive, automatable, reactive, no lasting value, grows with the service. Then measure in minutes per week, and remember that rejecting or removing a task at the source beats automating it.',
		answer: [
			'**Toil:** (a), (c) and (e). **Overhead:** (b). **Engineering:** (d), because it is a one-off that leaves a lasting improvement.',
			'Measure first. (c) is about 150 min per week **and grows with headcount**. (a) is 40 min per week. (e) is about 30 min per quarter.',
			'Tackle (c) first. Move it toward self-service: a form or a script that creates the account, falling back to a ticket only for special cases.',
			'For (a), before scripting the cleanup, ask why `/tmp` fills up. Fixing the app or setting up a cleanup at the source removes the task entirely.',
			'For (e), automate the renewal with an ACME client such as certbot, and alert on certificates close to expiry. Small task, but forgetting it causes an outage.'
		]
	},
	quiz: [
		{
			q: 'According to the Google SRE book, which of these is toil?',
			options: [
				'A weekly team meeting',
				'A one-time cleanup of the whole alerting configuration',
				'Restarting the same service by hand every time the same alert fires',
				'Filling in HR paperwork'
			],
			answer: 2,
			why: 'Meetings and paperwork are overhead. A one-time cleanup is grungy but leaves a lasting improvement. The repeated manual restart is manual, repetitive, reactive and changes nothing for the long run.'
		},
		{
			q: 'Each week you run a cleanup script by hand. It saves time compared with typing the commands. Is your time running it still toil?',
			options: [
				'Yes: the hands-on time a human spends running a script is still toil',
				'No: once there is a script, the task counts as automated work',
				'No: only tasks that take longer than an hour a week count as toil',
				'Only if the script fails and you have to finish the steps by hand'
			],
			answer: 0,
			why: 'The SRE book is explicit: running a script may be faster than doing the steps, but the hands-on time is still toil. Full automation removes the human from the loop.'
		},
		{
			q: 'The SRE workbook names one option you should consider first for a toil-intensive task. Which one?',
			options: [
				'Design a complete system that removes all of the team\'s toil at once',
				'Reject the toil: weigh the cost of doing it against the cost of not doing it',
				'Give it to the newest team member, so seniors keep time for engineering',
				'Do it faster by skipping the checks that never seem to catch anything'
			],
			answer: 1,
			why: 'The workbook says rejecting a toil-intensive task should be the first option you consider. It also warns against trying to design the perfect system, and recommends starting small.'
		}
	],
	takeaway: 'Toil is manual, repetitive work that leaves nothing better and grows with the service. Measure it, reject or remove what you can, and turn the rest from runbook to script to automation.',
	sources: [
		{ title: 'Google SRE book, Eliminating Toil', url: 'https://sre.google/sre-book/eliminating-toil/' },
		{ title: 'Google SRE workbook, Eliminating Toil', url: 'https://sre.google/workbook/eliminating-toil/' },
		{ title: 'Ansible docs, Controlling playbook execution (serial)', url: `${ANSIBLE_DOCS}/playbooks_strategies.rst` },
		{ title: 'Ansible docs, Error handling in playbooks', url: `${ANSIBLE_DOCS}/playbooks_error_handling.rst` },
		{ title: 'ansible-examples, lamp_haproxy rolling update', url: `${EXAMPLES}/lamp_haproxy/rolling_update.yml` }
	]
};
