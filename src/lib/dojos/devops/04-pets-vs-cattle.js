const K8S = 'https://github.com/kubernetes/website/blob/2f85f2802e59eb2128543dbfbf114ad641db4be0';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'pets-vs-cattle',
	part: 'The DevOps mindset',
	title: 'Pets vs cattle: replacing servers instead of repairing them',
	minutes: 10,
	hook: [
		'There is a server called `web01`. It has been up for 900 days. Four admins have edited its nginx.conf by hand over the years. Nobody dares to reboot it, and **nobody could rebuild it** if its disk died tonight.',
		'`web01` is a pet. It has a name, people fix it by hand, and when it is sick everyone drops what they are doing.',
		'The other way: servers numbered `www001` to `www100`, all built by the same automated recipe. When one goes bad, **you throw it away and start a fresh one**. Those servers are cattle.'
	],
	terms: [
		{ term: 'Pet', def: 'A server treated as unique and indispensable, built and fixed by hand. When it goes down, the team drops everything to save it.' },
		{ term: 'Cattle', def: 'Servers built by automation, all alike, designed so that any one of them can fail or be replaced without anyone noticing.' },
		{ term: 'Configuration drift', def: 'Ad hoc changes to a server\'s configuration that nobody records. After enough of them, nobody can rebuild the server.' },
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
				note: 'Unrecorded changes pile up, which is called configuration drift. You cannot build a test copy that really matches, and upgrades have knock-on effects nobody can predict.'
			},
			{
				add: ['repo["Recipe in Git"] --> image["Tested image v42"]'],
				highlight: ['repo', 'image'],
				note: 'The cattle way starts here. The whole server setup is written as a recipe and kept in version control. Every change goes into the recipe, gets tested, and produces a new image.'
			},
			{
				add: ['image --> w1["www001"]', 'image --> w2["www002"]', 'image --> w3["www003"]'],
				highlight: ['w1', 'w2', 'w3'],
				note: 'Every server comes from the same image, so they are identical. They are numbered `www001`, `www002`, `www003`. Nobody logs in to change them.'
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
				note: 'A broken or outdated server is replaced by a fresh one from the latest image, here `www004` from v43. That only works if **the data lives elsewhere**: a database, a volume, central logs. You can then delete any server without losing data.'
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
			'This file describes cattle. You will learn Kubernetes in part 7. Line 8, `replicas: 3`, asks for three identical copies, without naming any server.',
			'The Deployment creates a ReplicaSet, whose job is to keep a stable set of replica Pods running ([ReplicaSet docs](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)). If one disappears, a new one is started to get back to three. Nobody repairs the old one.',
			'The Pods get generated names like `nginx-deployment-1564180365-khku8` (from the docs\' example output). Nobody picks those names.',
			'To upgrade nginx you do not log in anywhere. You change line 19 from `image: nginx:1.14.2` to `nginx:1.16.1`. Kubernetes creates a **new** ReplicaSet, scales it up to 3 and scales the old one down to 0 ([Deployment docs](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)). Old Pods are replaced and never modified, which is what immutable infrastructure means.'
		]
	},
	tradeoff: {
		gain: [
			'When one server dies, you start a new one from the same recipe. Nobody spends a weekend working out how the old one was set up.',
			'Test and production come from the same recipe, so "works in staging" means something.',
			'Every change is in version control: you can review it, audit it and roll it back.'
		],
		cost: [
			'You must build the automation first: recipes, images, a way to replace servers. You do that work before you get any benefit.',
			'Data and state have to move off the servers (databases, volumes, central logs). Some old apps assume local disk and fight this.',
			'A one-line fix goes through build, test and replace. For one change it takes longer, and it runs the same steps every time.'
		]
	},
	task: {
		prompt: 'You run three things today: `bob`, the company mail server (one box), `web01` and `web02` behind HAProxy, and a single PostgreSQL primary. You may turn **one** of them into cattle this quarter. Which one, how, and what do you do about the other two?',
		hint: 'Start where there is no state on the server and already more than one copy. Then ask, for each remaining box, "could I rebuild it from a file if the disk died tonight?"',
		answer: [
			'Web servers first: they hold no data and you already run two. Write their setup as a recipe in Git, build a new server from it, put it behind HAProxy, remove an old one. Repeat until no hand-built web server is left.',
			'PostgreSQL: it holds the data, so you cannot simply throw it away. Keep it a pet for now, but make sure backups work and are tested. Later options: replication, or a managed database service.',
			'`bob` is the textbook pet. Even if it stays one box, write its configuration down as a recipe in Git. If its disk dies, you rebuild it from that recipe.',
			'In all three cases, stop editing servers by hand. Changes go into the recipe first.'
		]
	},
	quiz: [
		{
			q: 'What makes a server "cattle" rather than a "pet"?',
			options: [
				'It runs in a public cloud, where any VM can be rented or dropped on demand',
				'It is built by automation and can be destroyed and replaced at any time',
				'It has more than one network interface, so traffic can fail over to another',
				'It runs containers instead of system packages, so nothing is installed by hand'
			],
			answer: 1,
			why: 'What counts is whether you can throw the server away and rebuild it. A cloud VM edited by hand is still a pet. A bare-metal box built from a recipe can be cattle.'
		},
		{
			q: 'What is configuration drift?',
			options: [
				'The time between a commit and its deployment, which grows when pipelines are slow',
				'A server\'s clock slowly losing accuracy until certificates and logs disagree',
				'Unrecorded ad hoc changes that make a server differ from its known configuration',
				'Moving a VM from one host to another while it keeps running its workload'
			],
			answer: 2,
			why: 'Each manual fix that is not written back to the recipe makes the server drift further from what anyone can rebuild.'
		},
		{
			q: 'Your web servers are immutable. A security patch for nginx is out. What do you do?',
			options: [
				'Build a new image with the patch, test it, then replace the running servers with new ones',
				'SSH into each server and run the package upgrade, then restart nginx',
				'Patch one server by hand, test it, then copy its disk image to all the others',
				'Wait for the next scheduled reboot, when the servers pull the patch themselves'
			],
			answer: 0,
			why: 'Nobody changes an immutable server after it runs. The fix goes into the image, and servers built from the old image are replaced.'
		}
	],
	recall: {
		q: 'What makes a server cattle, and where must its data live before you can replace it?',
		a: 'It is built by automation from a recipe in Git and can be destroyed and replaced at any time. Its data lives outside it: a database, a volume, central logs.'
	},
	sources: [
		{ title: 'Randy Bias, The History of Pets vs Cattle and How to Use the Analogy Properly', url: 'https://cloudscaling.com/blog/cloud-computing/the-history-of-pets-vs-cattle/' },
		{ title: 'Martin Fowler, SnowflakeServer', url: 'https://martinfowler.com/bliki/SnowflakeServer.html' },
		{ title: 'Martin Fowler, PhoenixServer', url: 'https://martinfowler.com/bliki/PhoenixServer.html' },
		{ title: 'Kief Morris, ImmutableServer', url: 'https://martinfowler.com/bliki/ImmutableServer.html' },
		{ title: 'Kubernetes docs, Deployments', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' }
	]
};
