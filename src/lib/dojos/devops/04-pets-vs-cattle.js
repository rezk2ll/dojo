const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pets-vs-cattle',
	part: 'The DevOps mindset',
	title: 'Pets vs cattle: rebuild, do not repair',
	minutes: 10,
	hook: [
		'There is a server called `web01`. It has been up for 900 days. Four admins have edited its nginx.conf by hand over the years. Nobody dares to reboot it, and **nobody could rebuild it** if its disk died tonight.',
		'`web01` is a **pet**. It has a name, it is cared for by hand, and when it is sick everyone drops what they are doing.',
		'The other way: servers numbered `www001` to `www100`, all built by the same automated recipe. When one goes bad, **you throw it away and start a fresh one**. Those are **cattle**. Today is about why that is safer, and what it costs.'
	],
	terms: [
		{ term: 'Pet', def: 'A server treated as unique and indispensable, built and fixed by hand. If it goes down, it is an emergency.' },
		{ term: 'Cattle', def: 'Servers built by automation, all alike, designed so that any one of them can fail or be replaced without anyone noticing.' },
		{ term: 'Snowflake server', def: 'A server whose setup is unique and undocumented, the result of years of manual changes. Hard to reproduce, scary to change.' },
		{ term: 'Configuration drift', def: 'Ad hoc changes to a server\'s configuration that nobody records. Drift is how a clean server slowly becomes a snowflake.' },
		{ term: 'Immutable server', def: 'A server that is never modified once deployed. To change it, you build a new image and replace the server.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["You, over SSH"] -->|"apt upgrade, vim nginx.conf"| pet["web01: edited by hand for years"]'],
				highlight: ['pet'],
				note: 'The way you know. Each fix is reasonable on the day. After a few years, the server is a **snowflake**: its exact state exists nowhere except on that disk.'
			},
			{
				add: ['pet -.->|"drift"| unknown["Nobody knows the real config"]'],
				highlight: ['unknown'],
				note: '**Configuration drift.** Unrecorded changes pile up. You cannot build a test copy that really matches, and upgrades have knock-on effects nobody can predict.'
			},
			{
				add: ['repo["Recipe in Git"] --> image["Tested image v42"]'],
				highlight: ['repo', 'image'],
				note: 'The cattle way starts here. The whole server setup is written as a recipe and kept in version control. Every change goes into the recipe, gets tested, and produces a new image.'
			},
			{
				add: ['image --> w1["www001"]', 'image --> w2["www002"]', 'image --> w3["www003"]'],
				highlight: ['w1', 'w2', 'w3'],
				note: 'Every server comes from the same image, so they are identical. They have numbers, not names. Nobody logs in to change them.'
			},
			{
				add: [
					'w2 -.->|"broken or outdated"| w4["www004 from image v43"]',
					'data[("Data: kept outside the servers")]',
					'w1 --> data',
					'w3 --> data',
					'w4 --> data'
				],
				highlight: ['w4', 'data'],
				note: '**Rebuild instead of repair.** A broken or outdated server is replaced by a fresh one from the latest image. That only works if **the data lives elsewhere**: a database, a volume, central logs. Disposable servers, durable data.'
			}
		]
	},
	example: {
		title: 'content/en/examples/controllers/nginx-deployment.yaml',
		repo: 'kubernetes/website',
		url: `${K8S}/content/en/examples/controllers/nginx-deployment.yaml#L1-L21`,
		lang: 'yaml',
		code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80`,
		notes: [
			'This is cattle written as a file. You will learn Kubernetes in part 7. Today, just read the idea: `replicas: 3` says "I want three identical copies", not "these three servers".',
			'The Deployment creates a ReplicaSet, whose job is to keep a stable set of replica Pods running ([ReplicaSet docs](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)). If one disappears, a new one is started to get back to three. Nobody repairs the old one.',
			'The Pods get generated names like `nginx-deployment-1564180365-khku8` (from the docs\' example output). Numbers, not pet names.',
			'To upgrade nginx you do not log in anywhere. You change `image: nginx:1.14.2` to `nginx:1.16.1`. Kubernetes creates a **new** ReplicaSet, scales it up to 3 and scales the old one down to 0 ([Deployment docs](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)). Old Pods are replaced, never modified: that is immutable infrastructure.'
		]
	},
	tradeoff: {
		gain: [
			'Losing one server is a non-event. Replacing it is routine, not a weekend of archaeology.',
			'No drift: test and production come from the same recipe, so "works in staging" means something.',
			'Every change is in version control: you can review it, audit it and roll it back.'
		],
		cost: [
			'You must build the automation first: recipes, images, a way to replace servers. That is real work before any payoff.',
			'Data and state have to move off the servers (databases, volumes, central logs). Some old apps assume local disk and fight this.',
			'A one-line fix now goes through build, test and replace. Slower for one change, but the same every time.'
		]
	},
	task: {
		prompt: 'You run three things today: `bob`, the company mail server (one box), `web01` and `web02` behind HAProxy, and a single PostgreSQL primary. You may turn **one** of them into cattle this quarter. Which one, how, and what do you do about the other two?',
		hint: 'Start where there is no state on the server and already more than one copy. Then ask, for each remaining box, "could I rebuild it from a file if the disk died tonight?"',
		answer: [
			'**Web servers first.** They hold no data and you already run two. Write their setup as a recipe in Git, build a new server from it, put it behind HAProxy, remove an old one. Repeat until no hand-built web server is left.',
			'**PostgreSQL** holds the data, so it cannot simply be thrown away. Keep it a pet for now, but make sure backups work and are tested. Later options: replication, or a managed database service.',
			'**bob** is the textbook pet. Even if it stays one box, write its configuration down as a recipe in Git. Then rebuilding it is a plan, not a hope.',
			'In all three cases, stop editing servers by hand. Changes go into the recipe first.'
		]
	},
	quiz: [
		{
			q: 'What makes a server "cattle" rather than a "pet"?',
			options: [
				'It runs in a public cloud',
				'It is built by automation and can be destroyed and replaced at any time without drama',
				'It has more than one network interface',
				'It runs containers instead of system packages'
			],
			answer: 1,
			why: 'The line is disposability, not location or technology. A cloud VM edited by hand is still a pet. A bare-metal box built from a recipe can be cattle.'
		},
		{
			q: 'What is configuration drift?',
			options: [
				'The time between a commit and a deployment',
				'A server\'s clock slowly losing accuracy',
				'Unrecorded ad hoc changes that make a server differ from its known configuration',
				'Moving a VM from one host to another'
			],
			answer: 2,
			why: 'Each manual fix that is not written back to the recipe makes the server drift further from what anyone can rebuild.'
		},
		{
			q: 'Your web servers are immutable. A security patch for nginx is out. What do you do?',
			options: [
				'Build a new image with the patch, test it, then replace the running servers with new ones',
				'SSH into each server and run the package upgrade',
				'Patch one server by hand, then copy its disk to the others',
				'Wait for the next scheduled reboot to apply it'
			],
			answer: 0,
			why: 'Immutable means you never change a running server. The fix goes into the image, and servers built from the old image are replaced.'
		}
	],
	takeaway: 'Treat servers as replaceable copies built from a recipe in Git. When one is broken or outdated, rebuild it instead of repairing it, and keep the data somewhere else.',
	sources: [
		{ title: 'Randy Bias, The History of Pets vs Cattle and How to Use the Analogy Properly', url: 'https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/' },
		{ title: 'Martin Fowler, SnowflakeServer', url: 'https://martinfowler.com/bliki/SnowflakeServer.html' },
		{ title: 'Martin Fowler, PhoenixServer', url: 'https://martinfowler.com/bliki/PhoenixServer.html' },
		{ title: 'Kief Morris, ImmutableServer', url: 'https://martinfowler.com/bliki/ImmutableServer.html' },
		{ title: 'Kubernetes docs, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' }
	]
};
