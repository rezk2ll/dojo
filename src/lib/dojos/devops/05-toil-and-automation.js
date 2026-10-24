const EXAMPLES = 'https://github.com/ansible/ansible-examples/blob/b50586543c6c4be907fdc88f9f78a2b35d2a895f';
const ANSIBLE_DOCS = 'https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'toil-and-automation',
	part: 'The DevOps mindset',
	title: 'Toil: finding and automating repetitive ops work',
	minutes: 10,
	hook: [
		'Every Monday you SSH into six web servers. You check the disk, delete old files in `/tmp`, and restart the app if memory looks high. Forty minutes. **Next Monday, the exact same forty minutes.**',
		'The servers end the morning in the same state as last week. When the company adds six more servers, your Monday doubles.',
		'Google\'s SRE teams call this kind of work toil. You can spot it, measure it in minutes per week, and decide what to automate first.'
	],
	terms: [
		{ term: 'Toil', def: 'Work tied to running a production service that tends to be manual, repetitive, automatable, tactical (interrupt-driven and reactive), leaves no lasting improvement, and grows with the size of the service. A task does not need all six traits to be toil.' },
		{ term: 'Overhead', def: 'Admin work not tied to running the service: meetings, HR paperwork, goal setting. You still have to do it, and it does not count as toil.' },
		{ term: 'Engineering work', def: 'Work that needs human judgment and makes a lasting improvement: writing automation, fixing a root cause, improving monitoring.' },
		{ term: 'Runbook', def: 'Written steps for a recurring task or alert: "log in to X, run this, check the output, restart Y if...". Someone who can program reads it as pseudocode.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['alert["Alert: /tmp at 95%"] --> human["You: ssh, find, rm, restart"]'],
				highlight: ['human'],
				note: 'This task has every toil trait: manual, repetitive, triggered by an interrupt, and the server is no better afterwards. It also scales linearly: twice the servers, twice the work.'
			},
			{
				add: ['human -.->|"write it down"| runbook["Runbook: steps and checks"]'],
				highlight: ['runbook'],
				note: 'First you write the steps down. The SRE workbook points out that a runbook saying "log in to X, run this, restart Y if..." is **already pseudocode** for someone who can program.'
			},
			{
				add: ['runbook --> script["Script: a human runs it"]'],
				highlight: ['script'],
				note: 'A script a human runs is partial automation: faster, and the same steps every time. The SRE book still counts **the hands-on time you spend running a script as toil**.'
			},
			{
				add: ['script --> auto["Automation: detects and fixes, no human"]'],
				highlight: ['auto'],
				note: 'With full automation, the system notices the problem and fixes it with no human. Automation with admin powers needs safety checks, and should **hand over to a human** when something looks unsafe.'
			},
			{
				add: ['auto -.->|"better still"| fix["Root cause fixed: the app stops filling /tmp"]'],
				highlight: ['fix'],
				note: 'If the app stops filling `/tmp`, no alert fires and nothing needs a script. Ask **why** `/tmp` fills up, and get it fixed at the source. A cleanup script can hide the bug that fills it.'
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
			'This playbook does the steps of a written runbook, so a person no longer types them. Lines 5 to 14 silence the alerts and take the server out of HAProxy, line 16 updates it, line 24 waits until port 80 answers, and lines 26 to 29 put it back. You will learn Ansible in part 6.',
			'Line 2, `serial: 1`, makes Ansible handle one host at a time instead of all of them in parallel. That gives a rolling update: each server leaves the load balancer while it changes, and the others keep serving ([Ansible docs](https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide/playbooks_strategies.rst#setting-the-batch-size-with-serial)).',
			'Lines 8 and 13: `delegate_to` runs a task on another machine: the HAProxy and Nagios tasks run on the load balancer and monitoring hosts, about the web server being updated ([delegation docs](https://github.com/ansible/ansible-documentation/blob/8f66c43ba55198c517054bed5ccaf2b4bf6721c0/docs/docsite/rst/playbook_guide/playbooks_delegation.rst)). Ansible runs `pre_tasks`, then the roles, then `post_tasks`.',
			'Line 24 is the safety check. If port 80 does not answer within 80 seconds, `wait_for` fails, and by default Ansible stops running tasks on that host. The broken server is **never put back** into HAProxy.',
			'The repo is archived and the style is old (`key=value` arguments, `with_items`). The `haproxy` and `nagios` modules now live in the `community.general` collection. The order of the steps is still how a rolling update works.'
		]
	},
	tradeoff: {
		gain: [
			'Hands-on time drops, and it stops growing every time the fleet grows.',
			'The playbook runs the same steps every time, including at 3 a.m. when people make mistakes.',
			'The saved hours go to engineering work. Google SRE caps operational work at 50% of each SRE\'s time for this reason.'
		],
		cost: [
			'You spend time building and maintaining the automation. The SRE workbook asks you to compare that cost with the time it saves.',
			'Automation with admin powers can cause outages fast. It needs safety checks and a way to stop and call a human.',
			'A script can hide a root cause, and the team can forget how the system really works underneath.'
		]
	},
	task: {
		prompt: 'Your weekly ops list: (a) clean `/tmp` on six web servers, 40 min; (b) team meeting, 60 min; (c) create user accounts on request, about 10 tickets of 15 min, more each time the company hires; (d) write an Ansible role for nginx, a one-off of about 6 hours; (e) renew a TLS certificate by hand, 30 min every quarter. Label each one toil, overhead or engineering. Then pick what to tackle first and say how.',
		hint: 'Use the SRE checklist: manual, repetitive, automatable, reactive, no lasting value, grows with the service. Then measure in minutes per week, and remember that rejecting or removing a task at the source beats automating it.',
		answer: [
			'Toil: (a), (c) and (e). Overhead: (b). Engineering: (d), because it is a one-off that leaves a lasting improvement.',
			'Measure first. (c) is about 150 min per week **and grows with headcount**. (a) is 40 min per week. (e) is about 30 min per quarter.',
			'Tackle (c) first. Move it toward self-service: a form or a script that creates the account, falling back to a ticket only for special cases.',
			'For (a), before scripting the cleanup, ask why `/tmp` fills up. Fixing the app or setting up a cleanup at the source removes the task entirely.',
			'For (e), automate the renewal with an ACME client such as certbot, and alert on certificates close to expiry. It takes 30 minutes a quarter, and a forgotten renewal takes the site down.'
		],
		steps: [
			{
				title: 'Label each task',
				questions: [
					{ q: '(a) Clean `/tmp` on six web servers by hand, 40 min a week.', options: ['Toil', 'Overhead', 'Engineering', 'Neither: it is a one-off'], answer: 0, why: 'Manual, repetitive, automatable, and it leaves nothing better behind: every box on the SRE checklist.' },
					{ q: '(b) The weekly team meeting, 60 min.', options: ['Toil', 'Overhead', 'Engineering', 'Neither: it is a one-off'], answer: 1, why: 'The SRE book counts meetings as overhead: administrative work not tied to running the service.' },
					{ q: '(c) Create user accounts on request, about 10 tickets of 15 min, more with each hire.', options: ['Toil', 'Overhead', 'Engineering', 'Neither: it is a one-off'], answer: 0, why: 'Manual, reactive, repetitive, and it **grows with the company**: the textbook toil.' },
					{ q: '(d) Write an Ansible role for nginx, about 6 hours, once.', options: ['Toil', 'Overhead', 'Engineering', 'Neither: it is a one-off'], answer: 2, why: 'A one-off that leaves a lasting improvement is engineering, even when it is tedious.' }
				]
			},
			{
				title: 'Measure it',
				questions: [
					{ q: 'How much time does (c) take per week today?', options: ['About 15 min', 'About 40 min', 'About 150 min', 'About 600 min'], answer: 2, why: '10 tickets × 15 min is 150 min, and it goes up with headcount.' },
					{ q: '(e), renewing a TLS certificate by hand for 30 min a quarter, is about how much per week?', options: ['About 2 min', 'About 30 min', 'About 10 min', 'About 1 hour'], answer: 0, why: '30 min over 13 weeks is a little over 2 min a week.' },
					{ q: 'Which task gets bigger as the company grows, even if nobody changes anything?', options: ['(a) the `/tmp` cleanup', '(c) the account tickets', '(e) the certificate renewal', '(b) the meeting'], answer: 1, why: 'Every hire adds tickets. Toil that scales with the service is the one to watch.' },
					{ q: 'Why measure in minutes per week before choosing?', options: ['To compare the cost of automating with the time it saves', 'Because the SRE book caps toil at 10 minutes a week', 'To decide who on the team should do the task', 'Because only tasks over an hour count as toil'], answer: 0, why: 'The SRE workbook asks you to weigh the cost of building and maintaining automation against the time it saves.' }
				]
			},
			{
				title: 'Pick what comes first',
				questions: [
					{ q: 'Which task do you tackle first?', options: ['(c) the account tickets', '(a) the `/tmp` cleanup', '(e) the certificate renewal', '(d) the Ansible role'], answer: 0, why: 'It is the largest toil today and the only one that grows with the company.' },
					{ q: '(e) is only about 2 min a week. Why still fix it soon?', options: ['A forgotten renewal takes the whole site down', 'Certificates must be renewed every week', 'It is overhead, and overhead goes first', 'It cannot be automated, so it needs a process'], answer: 0, why: 'Small but risky: the cost of missing it once is an outage, not a few minutes.' },
					{ q: 'Before you script the `/tmp` cleanup, what do you ask first?', options: ['Why `/tmp` fills up at all', 'Which shell the script should use', 'Whether to run it daily or weekly', 'Who will run the script by hand'], answer: 0, why: 'Removing a task at the source beats automating it. Something writes those files.' },
					{ q: 'Once (c) is self-service, where should the saved hours go?', options: ['Engineering work, such as the nginx role in (d)', 'More account tickets from new hires', 'A longer weekly meeting', 'Running the `/tmp` cleanup twice a week'], answer: 0, why: 'Removing toil frees time for work that leaves a lasting improvement. Google SRE caps operational work at 50% of each SRE\'s time for this reason.' }
				]
			},
			{
				title: 'Say how',
				questions: [
					{ q: 'How do you get rid of (c)?', options: ['A self-service form or script, with a ticket only for special cases', 'A shared document with the steps, so anyone can do it', 'A second person to review each ticket', 'Batch the tickets and do them on Fridays'], answer: 0, why: 'Self-service removes the human from the loop for the common case. A runbook still leaves the hands-on time.' },
					{ q: 'How do you get rid of (e)?', options: ['An ACME client such as certbot, plus an alert on certificates close to expiry', 'A calendar reminder every quarter', 'Buy certificates valid for ten years', 'A script you run by hand when the reminder fires'], answer: 0, why: 'Automatic renewal removes the task, and the alert catches the day it breaks.' },
					{ q: 'You first write the 40-minute `/tmp` routine down as a runbook. Why is that a good start toward automating it?', options: ['Someone who can program reads it as pseudocode', 'It replaces the need for a script', 'It removes the toil by itself', 'The SRE book forbids scripts without one'], answer: 0, why: 'The SRE workbook points out that "log in to X, run this, restart Y if..." is already pseudocode. The runbook alone still leaves the hands-on time.' },
					{ q: 'Your account script has admin rights. What does it need before it runs on its own?', options: ['Safety checks and a way to stop it and call a human', 'Nothing: scripts do not make mistakes', 'A rewrite in a compiled language', 'A run every minute, so mistakes get fixed fast'], answer: 0, why: 'Automation with admin powers can cause outages fast, so it needs guard rails and a stop button.' }
				]
			}
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
			why: 'The SRE book counts meetings and paperwork as overhead. A one-time cleanup is grungy but leaves a lasting improvement. The repeated manual restart is manual, repetitive, reactive and changes nothing for the long run.'
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
	lab: {
		minutes: 20,
		goal: 'Turn a by-hand cleanup into one that runs on its own, with a guard rail.',
		steps: [
			'Make a scratch folder with old and new files: `mkdir -p ~/toil-lab && cd ~/toil-lab && touch -t 202001010000 old-{1..5}.log && touch new-{1..3}.log`.',
			'Do the cleanup by hand once and time it: list what is older than 7 days with `find . -name "*.log" -mtime +7`, then delete those files.',
			'Recreate the files, then write `cleanup.sh`: it takes the folder as its argument, runs the same `find` with `-delete`, and stops with an error for any folder other than `~/toil-lab`.',
			'Run it with `bash -x cleanup.sh ~/toil-lab` to see every command, then schedule it: `crontab -e` and add `0 3 * * * bash ~/toil-lab/cleanup.sh ~/toil-lab`.'
		],
		done: [
			'`ls ~/toil-lab/*.log` shows only the three `new-*.log` files after the script runs.',
			'`bash cleanup.sh /tmp` refuses to delete anything.',
			'`crontab -l` lists the nightly line.'
		],
		solution: [
			'`#!/usr/bin/env bash`, then `set -euo pipefail`.',
			'`dir=$(cd "$1" && pwd -P); [ "$dir" = "$(cd ~/toil-lab && pwd -P)" ] || { echo "refusing to clean $1" >&2; exit 1; }`',
			'`find "$dir" -maxdepth 1 -name "*.log" -mtime +7 -print -delete`: `-print` leaves a trace in the cron mail of what was removed.',
			'Then ask the lesson\'s question: what writes these files? A log rotation setting at the source would make the script unnecessary.'
		]
	},
	recall: {
		q: 'You run a cleanup script by hand every week. Is that time toil, and what does the SRE workbook say to consider first for a toil-heavy task?',
		a: 'Yes, the hands-on time running a script is still toil. The first option is to reject the task: weigh the cost of doing it against the cost of not doing it.'
	},
	sources: [
		{ title: 'Google SRE book, Eliminating Toil', url: 'https://sre.google/sre-book/eliminating-toil/' },
		{ title: 'Google SRE workbook, Eliminating Toil', url: 'https://sre.google/workbook/eliminating-toil/' },
		{ title: 'Ansible docs, Controlling playbook execution (serial)', url: `${ANSIBLE_DOCS}/playbooks_strategies.rst` },
		{ title: 'Ansible docs, Error handling in playbooks', url: `${ANSIBLE_DOCS}/playbooks_error_handling.rst` },
		{ title: 'ansible-examples, lamp_haproxy rolling update', url: `${EXAMPLES}/lamp_haproxy/rolling_update.yml` }
	]
};
