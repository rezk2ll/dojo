const APP = 'https://github.com/jenkins-docs/simple-java-maven-app/blob/bffd953ff1ea7e0ae32fb7ee2f4b5221d1d96918';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'jenkins',
	part: 'CI/CD',
	title: 'Jenkins: controller, agents and the Jenkinsfile',
	minutes: 10,
	hook: [
		'Somewhere in the server room there is a VM called `jenkins01`. It has run every build for years. It has dozens of plugins, and **nobody wants to be the one who upgrades it**.',
		'Jenkins is self-hosted and free, and plugins let it do almost anything. Teams used to configure its jobs by clicking in a web UI, so nobody could review or rebuild them.',
		'A Jenkinsfile puts the pipeline back in the repo. The controller schedules the builds, and agents run them.'
	],
	terms: [
		{ term: 'Controller', def: 'The Jenkins service itself: web UI, configuration, and the scheduler that decides where and when builds run.' },
		{ term: 'Agent', def: 'A machine (or container) that runs build steps for the controller. Agents carry labels, like `linux` or `docker`.' },
		{ term: 'Jenkinsfile', def: 'A text file in the repo that defines the pipeline, reviewed and versioned like code.' },
		{ term: 'Plugin', def: 'An add-on installed on the controller. Git, JUnit reports, credentials and the pipeline itself are all plugins.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['push["git push"] --> ctl["Controller: web UI, schedules builds"]'],
				highlight: ['push', 'ctl'],
				note: 'The **controller** is Jenkins itself. It hears about the push, decides a build must run, and keeps the history, so the controller is the machine you back up.'
			},
			{
				add: ['ctl --> ag1["Agent: linux-01, 2 executors"]', 'ctl --> ag2["Agent: linux-02, 2 executors"]'],
				highlight: ['ag1', 'ag2'],
				note: 'The work runs on **agents**. Each executor on an agent runs one build at a time, so these two agents run up to four builds. The Jenkins docs discourage running builds on the controller itself, for security, performance and scale. A build that runs `rm -rf` should not run on the machine that holds the credentials.'
			},
			{
				add: ['jf["Jenkinsfile, in the repo"]', 'jf -.->|read at each build| ctl'],
				highlight: ['jf'],
				note: 'With a **Jenkinsfile**, the pipeline lives in Git next to the code. You change it in a branch and review it in a pull request, with no job form to click through.'
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
				note: 'The declarative syntax, a `pipeline { }` block, lists **stages** as on day 21. If Test fails, Deliver never runs. The older scripted syntax is plain Groovy and harder to read.'
			},
			{
				add: ['plug["Plugins: Git, JUnit, Credentials"]', 'plug -.-> ctl', 'class plug ext'],
				highlight: ['plug'],
				note: 'There are over a thousand plugins, and they let Jenkins talk to almost any tool. Each plugin you add is code on the controller that you must keep updated, and that must stay compatible with the others.'
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
			'This Jenkinsfile comes from the official [Jenkins Maven tutorial](https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/). It has three stages: build without tests (lines 9 to 13), run the tests (lines 14 to 23), deliver (lines 24 to 28).',
			'Line 3, `label \'!windows\'`, is a label expression: run on any agent whose labels do not include `windows`. Jenkins [label expressions](https://github.com/jenkinsci/jenkins/blob/f5d0dcb8ab0ff713ec71d3bd38383fc9ff094037/core/src/main/resources/hudson/model/AbstractProject/help-label.html) also accept `&&` and `||`. The expression fits this file, where every step is an `sh` shell command.',
			'Lines 18 to 22, `post { always { junit … } }`, run whatever the result of the stage. So Jenkins records the test report **even when tests fail**, the case where you need to read it.',
			'Line 6, `skipStagesAfterUnstable()`: the [syntax reference](https://www.jenkins.io/doc/book/pipeline/syntax/#options) says it skips stages once the build status has gone to **UNSTABLE**, a status usually caused by test failures. A build with failing tests does not reach Deliver.'
		]
	},
	tradeoff: {
		gain: [
			'Fully self-hosted and free: it runs on your network, even with no internet access at all.',
			'Jenkins builds from any Git host: GitHub, GitLab, Bitbucket or a bare Git server.',
			'Agents run on any OS, including Windows, macOS and old Unix machines that hosted CI does not offer.'
		],
		cost: [
			'You run the controller: upgrades, backups, Java versions, disk full of old build logs.',
			'An upgrade of one plugin can break another. Many teams stop upgrading their Jenkins, and it then misses security fixes.',
			'Configuration done by clicking (credentials, global settings) still lives outside Git unless you put extra work into it.'
		]
	},
	task: {
		prompt: 'Add a `Deploy` stage after `Deliver`. It must run **only on the `main` branch** (this is a multibranch pipeline), and wait for a human to approve. Write the stage, and check the order in which Jenkins evaluates the conditions.',
		hint: 'Look up the `when` directive with `branch`, and the `input` directive. Which one does Jenkins evaluate first?',
		answer: [
			'`stage(\'Deploy\') { when { beforeInput true; branch \'main\' } input { message \'Deploy to production?\' } steps { sh \'./deploy.sh\' } }`',
			'`when { branch \'main\' }` only works in a multibranch pipeline. On other branches the stage is skipped.',
			'The order: by default Jenkins asks for `input` **before** it checks `when`. Without `beforeInput true`, every feature branch would stop and wait for an approval it does not need.',
			'Run it on an agent with the deploy credentials, not on the controller.'
		],
		steps: [
			{
				title: 'Place the stage',
				questions: [
					{ q: 'Where does the new `Deploy` stage go?', options: ['Inside `post { always { } }`', 'Inside `options { }`', 'Inside `stages { }`, after `stage(\'Deliver\')`', 'In a second Jenkinsfile'], answer: 2, why: 'Stages run in the order they are listed, so `Deploy` comes last.' },
					{ q: '`mvn test` fails. Does `Deploy` run?', options: ['No: once a stage fails, the later stages never run', 'Yes, it is a separate stage', 'Yes, but only after an approval', 'Only on `main`'], answer: 0, why: 'As with Deliver, a failure earlier in the pipeline stops everything after it.' },
					{ q: 'Some tests fail and the build goes UNSTABLE. What does `skipStagesAfterUnstable()` do to `Deploy`?', options: ['Nothing: it only affects Deliver', 'It runs `Deploy` with a warning', 'It retries the tests first', 'It skips it, like every stage after UNSTABLE'], answer: 3, why: 'The option skips all stages once the status has gone to UNSTABLE.' },
					{ q: 'Where should the `Deploy` steps run?', options: ['On the controller, which holds the credentials', 'On an agent with the deploy credentials', 'On any agent with the `windows` label', 'On the developer\'s laptop'], answer: 1, why: 'The Jenkins docs discourage builds on the controller. A deploy runs on an agent set up for it.' }
				]
			},
			{
				title: 'Limit it to main',
				questions: [
					{ q: 'Which directive keeps `Deploy` to the `main` branch?', options: ['`agent { label \'main\' }`', '`when { branch \'main\' }`', '`input { branch \'main\' }`', '`options { branch(\'main\') }`'], answer: 1, why: '`when` decides if a stage runs. `branch` checks the branch being built.' },
					{ q: 'Where does `when { branch \'main\' }` work?', options: ['Only in a multibranch pipeline', 'In any freestyle job', 'Only on the controller', 'Only with the scripted syntax'], answer: 0, why: 'A multibranch pipeline builds each branch, so Jenkins knows which branch it is on.' },
					{ q: 'A feature branch reaches `Deploy`. With only `when` and no `input`, what happens?', options: ['The build fails', 'The stage runs with no credentials', 'Jenkins asks which branch to use', 'The stage is skipped'], answer: 3, why: 'When the `when` condition is false, Jenkins skips the stage.' },
					{ q: 'Why write the branch check in the Jenkinsfile and not in the job settings?', options: ['The job form has no branch field', 'Jenkins reads job settings only once a day', 'The Jenkinsfile is reviewed and versioned like code', 'Plugins cannot read the Jenkinsfile'], answer: 2, why: 'Settings clicked in the web UI cannot be reviewed or rebuilt. The Jenkinsfile can.' }
				]
			},
			{
				title: 'Ask for approval',
				questions: [
					{ q: 'Which directive makes the stage wait for a human?', options: ['`input { message \'Deploy to production?\' }`', '`post { always { } }`', '`when { manual true }`', '`options { approve() }`'], answer: 0, why: '`input` pauses the stage and asks someone to approve.' },
					{ q: 'Where does `input` go?', options: ['In `options`, at the top of the file', 'In the `Deploy` stage, beside `when` and `steps`', 'In the `Deliver` stage', 'In `post`, after the stage'], answer: 1, why: 'The approval belongs to the stage it guards.' },
					{ q: 'What does the build do when it reaches `input`?', options: ['It approves itself after a short delay', 'It fails, so someone reruns it', 'It skips the stage', 'It stops and waits for someone to approve'], answer: 3, why: 'The build pauses until a human answers.' },
					{ q: 'When does `sh \'./deploy.sh\'` run?', options: ['On `main`, after someone approves', 'On every branch, before the approval', 'On `main`, before the approval', 'On every branch, after the approval'], answer: 0, why: 'The steps run only once both the branch check and the approval have passed.' }
				]
			},
			{
				title: 'Check the order',
				questions: [
					{ q: 'By default, which does Jenkins evaluate first in a stage?', options: ['`when`, then `input`', '`input`, then `when`', 'Both at the same time', '`steps`, then `when`'], answer: 1, why: 'By default Jenkins asks for `input` **before** it checks `when`.' },
					{ q: 'Without `beforeInput true`, what happens on a feature branch?', options: ['The stage is skipped at once', 'The build fails with a syntax error', 'The build stops and waits for an approval it does not need', 'Jenkins deploys the feature branch'], answer: 2, why: 'The `input` comes first, so every branch asks for approval before the branch check runs.' },
					{ q: 'What does `beforeInput true` change?', options: ['It removes the approval on `main`', 'It runs the approval on the controller', 'It skips `when` on `main`', 'Jenkins checks `when` before it asks for `input`'], answer: 3, why: 'With the check first, feature branches skip the stage and never ask.' },
					{ q: 'Where does `beforeInput true` go?', options: ['Inside `when { }`', 'Inside `input { }`', 'Inside `options { }`', 'Inside `steps { }`'], answer: 0, why: 'It is an option of `when`: `when { beforeInput true; branch \'main\' }`.' }
				]
			}
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
			why: 'Jenkins is self-hosted end to end and runs agents anywhere, including a network with no internet access. For zero maintenance or a small GitHub project, a hosted service is simpler.'
		}
	],
	recall: {
		q: 'A `Deploy` stage has `when { branch \'main\' }` and an `input`. Without `beforeInput true`, what happens on a feature branch?',
		a: 'Jenkins asks for the `input` before it checks `when`, so the feature branch build stops and waits for an approval. With `beforeInput true`, the stage is skipped on every branch but `main`.'
	},
	sources: [
		{ title: 'Jenkins docs, Pipeline syntax', url: 'https://www.jenkins.io/doc/book/pipeline/syntax/' },
		{ title: 'Jenkins docs, Using a Jenkinsfile', url: 'https://www.jenkins.io/doc/book/pipeline/jenkinsfile/' },
		{ title: 'Jenkins docs, Managing nodes (controller, agents, executors)', url: 'https://www.jenkins.io/doc/book/managing/nodes/' },
		{ title: 'Jenkins docs, Managing plugins', url: 'https://www.jenkins.io/doc/book/managing/plugins/' },
		{ title: 'Jenkins tutorial, Build a Java app with Maven', url: 'https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/' }
	]
};
