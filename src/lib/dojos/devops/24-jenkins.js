const APP = 'https://github.com/jenkins-docs/simple-java-maven-app/blob/bffd953ff1ea7e0ae32fb7ee2f4b5221d1d96918';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'jenkins',
	part: 'CI/CD',
	title: 'Jenkins: the server you will inherit',
	minutes: 10,
	hook: [
		'Somewhere in the server room there is a VM called `jenkins01`. It has run every build for years. It has dozens of plugins, and **nobody wants to be the one who upgrades it**.',
		'You will meet Jenkins. It is self-hosted, free, and it does almost anything through plugins. Its old weakness was jobs configured by clicking in a web UI, so nobody could review or rebuild them.',
		'Today: the **controller** and its **agents**, the **Jenkinsfile** that puts the pipeline back in the repo, and when Jenkins is still the right choice.'
	],
	terms: [
		{ term: 'Controller', def: 'The Jenkins service itself: web UI, configuration, and the "brain" that decides where and when builds run.' },
		{ term: 'Agent', def: 'A machine (or container) that runs build steps for the controller. Agents carry labels, like `linux` or `docker`.' },
		{ term: 'Executor', def: 'A slot on an agent for one task at a time. Two executors on an agent means two builds can run there at once.' },
		{ term: 'Jenkinsfile', def: 'A text file in the repo that defines the pipeline. Reviewed and versioned like code.' },
		{ term: 'Declarative pipeline', def: 'The structured Jenkinsfile syntax: a `pipeline { }` block with `agent`, `stages`, `steps` and `post`. Easier to read than the older scripted syntax, which is plain Groovy.' },
		{ term: 'Plugin', def: 'An add-on installed on the controller. Git, JUnit reports, credentials and the pipeline itself are all plugins.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['push["git push"] --> ctl["Controller: web UI, schedules builds"]'],
				highlight: ['push', 'ctl'],
				note: 'The **controller** is Jenkins itself. It hears about the push, decides a build must run, and keeps the history. It is the box you back up.'
			},
			{
				add: ['ctl --> ag1["Agent: linux-01, 2 executors"]', 'ctl --> ag2["Agent: linux-02, 2 executors"]'],
				highlight: ['ag1', 'ag2'],
				note: 'The work runs on **agents**. The Jenkins docs discourage running builds on the controller itself, for security, performance and scale. A build that runs `rm -rf` should not run where the credentials live.'
			},
			{
				add: ['jf["Jenkinsfile, in the repo"]', 'jf -.->|read at each build| ctl'],
				highlight: ['jf'],
				note: 'With a **Jenkinsfile**, the pipeline lives in Git next to the code. Change it in a branch, review it in a pull request. No more clicking through job forms.'
			},
			{
				add: [
					'subgraph pl["Pipeline, on an agent"]',
					'b["Build"] --> t["Test"]',
					't --> d["Deliver"]',
					'end',
					'ag1 --> b'
				],
				highlight: ['b', 't', 'd'],
				note: 'A declarative pipeline is a list of **stages**, same idea as day 21. If Test fails, Deliver never runs.'
			},
			{
				add: ['plug["Plugins: Git, JUnit, Credentials"]', 'plug -.-> ctl', 'class plug ext'],
				highlight: ['plug'],
				note: '**Plugins** are Jenkins\' strength and its pain. There are over a thousand. Each one you add is code on the controller that you must keep updated, and that must stay compatible with the others.'
			}
		]
	},
	example: {
		title: 'jenkins/Jenkinsfile',
		repo: 'jenkins-docs/simple-java-maven-app',
		url: `${APP}/jenkins/Jenkinsfile#L1-L30`,
		lang: 'groovy',
		code: `pipeline {
    agent {
        label '!windows'
    }
    options {
        skipStagesAfterUnstable()
    }
    stages {
        stage('Build') {
            steps {
                sh 'mvn -B -DskipTests clean package'
            }
        }
        stage('Test') {
            steps {
                sh 'mvn test'
            }
            post {
                always {
                    junit 'target/surefire-reports/*.xml'
                }
            }
        }
        stage('Deliver') { 
            steps {
                sh './jenkins/scripts/deliver.sh' 
            }
        }
    }
}`,
		notes: [
			'This is the app from the official [Jenkins Maven tutorial](https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/). Three stages: build without tests, run the tests, deliver.',
			'`label \'!windows\'` is a label expression: run on any agent whose labels do not include `windows`. Jenkins [label expressions](https://github.com/jenkinsci/jenkins/blob/f5d0dcb8ab0ff713ec71d3bd38383fc9ff094037/core/src/main/resources/hudson/model/AbstractProject/help-label.html) also accept `&&` and `||`. It fits here: every step is an `sh` shell command.',
			'`post { always { junit … } }` runs whatever the result of the stage. So the test report is recorded **even when tests fail**, which is exactly when you need it.',
			'`skipStagesAfterUnstable()`: the [syntax reference](https://www.jenkins.io/doc/book/pipeline/syntax/#options) says it skips stages once the build status has gone to **UNSTABLE**, a status usually caused by test failures. A build with failing tests does not reach Deliver.'
		]
	},
	tradeoff: {
		gain: [
			'Fully self-hosted and free: it runs on your network, even with no internet access at all.',
			'Not tied to one Git host. GitHub, GitLab, Bitbucket or a bare Git server, Jenkins can build from it.',
			'A plugin for almost everything, and agents on any OS: Windows, macOS, old Unix boxes that hosted CI does not offer.'
		],
		cost: [
			'You run the controller: upgrades, backups, Java versions, disk full of old build logs.',
			'Plugins break each other on upgrade. Many teams freeze their Jenkins, then it becomes a security risk.',
			'Configuration done by clicking (credentials, global settings) still lives outside Git unless you put extra work into it.'
		]
	},
	task: {
		prompt: 'Add a `Deploy` stage after `Deliver`. It must run **only on the `main` branch** (this is a multibranch pipeline), and wait for a human to approve. Write the stage, and watch out for one trap in the order Jenkins checks things.',
		hint: 'Look up the `when` directive with `branch`, and the `input` directive. Which one does Jenkins evaluate first?',
		answer: [
			'`stage(\'Deploy\') { when { beforeInput true; branch \'main\' } input { message \'Deploy to production?\' } steps { sh \'./deploy.sh\' } }`',
			'`when { branch \'main\' }` only works in a multibranch pipeline. On other branches the stage is skipped.',
			'The trap: by default Jenkins asks for `input` **before** it checks `when`. Without `beforeInput true`, every feature branch would stop and wait for an approval it does not need.',
			'Run it on an agent with the deploy credentials, not on the controller.'
		]
	},
	quiz: [
		{
			q: 'In Jenkins, what is the difference between the controller and an agent?',
			options: [
				'The controller runs the builds, and agents only store the logs and artifacts',
				'The controller is Jenkins itself (UI, config, scheduling). Agents run the build steps',
				'The controller is the Jenkinsfile, and agents are the plugins it loads',
				'There is no difference, they are two names for the same server'
			],
			answer: 1,
			why: 'The controller decides how, when and where to run tasks. Agents run them. Keeping builds off the controller protects the place where credentials and configuration live.'
		},
		{
			q: 'In the tutorial Jenkinsfile, why is `junit` inside `post { always { } }` and not after `mvn test` in `steps`?',
			options: [
				'Because `junit` cannot run inside `steps`',
				'So the test report is recorded even when `mvn test` fails',
				'So the report is only recorded when all tests pass',
				'Because `post` blocks run on the controller'
			],
			answer: 1,
			why: 'When `mvn test` fails, the next steps of that stage do not run. `post { always }` runs whatever the result, so you get the report exactly when tests fail.'
		},
		{
			q: 'Which situation is the strongest reason to pick Jenkins over a hosted CI service?',
			options: [
				'You want zero servers to maintain and no agents to patch',
				'You want the whole pipeline defined in a YAML file in the repo',
				'Builds must run on your own offline network, on agents you control',
				'You only build one small open-source project hosted on GitHub'
			],
			answer: 2,
			why: 'Jenkins is self-hosted end to end and runs agents anywhere. That is its edge. For zero maintenance or a small GitHub project, a hosted service is simpler.'
		}
	],
	takeaway: 'Jenkins is a controller that schedules and agents that build. Put the pipeline in a Jenkinsfile, keep builds off the controller, and treat every plugin as code you have to maintain.',
	sources: [
		{ title: 'Jenkins docs, Pipeline syntax', url: 'https://www.jenkins.io/doc/book/pipeline/syntax/' },
		{ title: 'Jenkins docs, Using a Jenkinsfile', url: 'https://www.jenkins.io/doc/book/pipeline/jenkinsfile/' },
		{ title: 'Jenkins docs, Managing nodes (controller, agents, executors)', url: 'https://www.jenkins.io/doc/book/managing/nodes/' },
		{ title: 'Jenkins docs, Managing plugins', url: 'https://www.jenkins.io/doc/book/managing/plugins/' },
		{ title: 'Jenkins tutorial, Build a Java app with Maven', url: 'https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/' }
	]
};
