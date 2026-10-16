const APP = 'https://github.com/jenkins-docs/simple-java-maven-app/blob/bffd953ff1ea7e0ae32fb7ee2f4b5221d1d96918';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'jenkins',
	part: 'CI/CD',
	title: 'Jenkins : controller, agents et Jenkinsfile',
	minutes: 10,
	hook: [
		'Quelque part dans la salle serveur, il y a une VM qui s’appelle `jenkins01`. Elle fait tous les builds depuis des années. Elle a des dizaines de plugins, et **personne ne veut être celui qui la met à jour**.',
		'Jenkins est auto-hébergé et gratuit, et ses plugins lui permettent de faire presque tout. Les équipes configuraient ses jobs en cliquant dans une interface web, et personne ne pouvait les relire ni les reconstruire.',
		'Un Jenkinsfile remet le pipeline dans le dépôt. Le controller planifie les builds, et les agents les exécutent.'
	],
	terms: [
		{ term: 'Controller', def: 'Le service Jenkins lui-même : interface web, configuration, et le planificateur qui décide où et quand les builds tournent.' },
		{ term: 'Agent', def: 'Une machine (ou un conteneur) qui exécute les étapes de build pour le controller. Les agents portent des labels, comme `linux` ou `docker`.' },
		{ term: 'Jenkinsfile', def: 'Un fichier texte dans le dépôt qui définit le pipeline, et que tu relis et versionnes comme du code.' },
		{ term: 'Plugin', def: 'Un module ajouté au controller. Git, les rapports JUnit, les credentials et le pipeline lui-même sont tous des plugins.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['push["git push"] --> ctl["Controller : interface web, planifie les builds"]'],
				highlight: ['push', 'ctl'],
				note: 'Le **controller**, c’est Jenkins lui-même. Il apprend qu’il y a eu un push, décide qu’un build doit tourner, et garde l’historique : c’est donc le controller que tu sauvegardes.'
			},
			{
				add: ['ctl --> ag1["Agent : linux-01, 2 executors"]', 'ctl --> ag2["Agent : linux-02, 2 executors"]'],
				highlight: ['ag1', 'ag2'],
				note: 'Le travail tourne sur les **agents**. Chaque executor d’un agent fait tourner un build à la fois, donc ces deux agents lancent jusqu’à quatre builds. La doc Jenkins déconseille de lancer des builds sur le controller lui-même, pour la sécurité, les performances et la montée en charge. Un build qui lance `rm -rf` ne doit pas tourner sur la machine qui garde les credentials.'
			},
			{
				add: ['jf["Jenkinsfile, dans le dépôt"]', 'jf -.->|lu à chaque build| ctl'],
				highlight: ['jf'],
				note: 'Avec un **Jenkinsfile**, le pipeline vit dans Git à côté du code. Tu le modifies dans une branche et tu le relis dans une pull request, sans formulaire de job à remplir.'
			},
			{
				add: [
					'subgraph pl["Pipeline, sur un agent"]',
					'b["Build"] --> t["Test"]',
					't --> d["Deliver"]',
					'end',
					'ag1 --> b'
				],
				highlight: ['b', 't', 'd'],
				note: 'La syntaxe déclarative, un bloc `pipeline { }`, liste des **stages** comme au jour 21. Si Test échoue, Deliver ne tourne jamais. L’ancienne syntaxe scriptée est du Groovy brut, plus dur à lire.'
			},
			{
				add: ['plug["Plugins : Git, JUnit, Credentials"]', 'plug -.-> ctl', 'class plug ext'],
				highlight: ['plug'],
				note: 'Il existe plus d’un millier de plugins, et ils permettent à Jenkins de parler à presque tous les outils. Chaque plugin que tu ajoutes est du code sur le controller que tu dois tenir à jour, et qui doit rester compatible avec les autres.'
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
			'Ce Jenkinsfile vient du [tutoriel Maven officiel de Jenkins](https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/). Il a trois stages : build sans les tests (lignes 9 à 13), lancer les tests (lignes 14 à 23), livrer (lignes 24 à 28).',
			'La ligne 3, `label \'!windows\'`, est une expression de label : tourner sur n’importe quel agent dont les labels ne contiennent pas `windows`. Les [expressions de label](https://github.com/jenkinsci/jenkins/blob/f5d0dcb8ab0ff713ec71d3bd38383fc9ff094037/core/src/main/resources/hudson/model/AbstractProject/help-label.html) de Jenkins acceptent aussi `&&` et `||`. Cette expression convient à ce fichier, où chaque step est une commande shell `sh`.',
			'Les lignes 18 à 22, `post { always { junit … } }`, tournent quel que soit le résultat du stage. Jenkins enregistre donc le rapport de tests **même quand les tests échouent**, le cas où tu as besoin de le lire.',
			'La ligne 6, `skipStagesAfterUnstable()` : la [référence de syntaxe](https://www.jenkins.io/doc/book/pipeline/syntax/#options) dit qu’il saute les stages dès que le statut du build est passé à **UNSTABLE**, un statut en général causé par des tests en échec. Un build avec des tests rouges n’atteint pas Deliver.'
		]
	},
	tradeoff: {
		gain: [
			'Entièrement auto-hébergé et gratuit : il tourne sur ton réseau, même sans aucun accès à internet.',
			'Jenkins construit depuis n’importe quel hébergeur Git : GitHub, GitLab, Bitbucket ou un simple serveur Git.',
			'Les agents tournent sur n’importe quel OS, y compris Windows, macOS et de vieilles machines Unix que la CI hébergée ne propose pas.'
		],
		cost: [
			'C’est toi qui fais tourner le controller : mises à jour, sauvegardes, versions de Java, disque plein de vieux logs de build.',
			'La mise à jour d’un plugin peut en casser un autre. Beaucoup d’équipes arrêtent de mettre leur Jenkins à jour, et il rate alors les correctifs de sécurité.',
			'La configuration faite en cliquant (credentials, réglages globaux) reste hors de Git, sauf si tu fais un effort en plus.'
		]
	},
	task: {
		prompt: 'Ajoute un stage `Deploy` après `Deliver`. Il doit tourner **seulement sur la branche `main`** (c’est un pipeline multibranche), et attendre la validation d’un humain. Écris le stage, et vérifie dans quel ordre Jenkins évalue les conditions.',
		hint: 'Regarde la directive `when` avec `branch`, et la directive `input`. Laquelle Jenkins évalue-t-il en premier ?',
		answer: [
			'`stage(\'Deploy\') { when { beforeInput true; branch \'main\' } input { message \'Deploy to production?\' } steps { sh \'./deploy.sh\' } }`',
			'`when { branch \'main\' }` ne marche que dans un pipeline multibranche. Sur les autres branches le stage est sauté.',
			'L’ordre : par défaut, Jenkins demande l’`input` **avant** de vérifier `when`. Sans `beforeInput true`, chaque branche de feature s’arrêterait pour attendre une validation dont elle n’a pas besoin.',
			'Fais-le tourner sur un agent qui a les credentials de déploiement, pas sur le controller.'
		]
	},
	quiz: [
		{
			q: 'Dans Jenkins, quelle est la différence entre le controller et un agent ?',
			options: [
				'Le controller fait les builds, les agents ne stockent que les logs et les artefacts',
				'Le controller est Jenkins lui-même (interface, config, planification). Les agents exécutent les builds',
				'Le controller est le Jenkinsfile, et les agents sont les plugins qu’il charge',
				'Aucune différence, ce sont deux noms pour le même serveur'
			],
			answer: 1,
			why: 'Le controller décide comment, quand et où lancer les tâches. Les agents les exécutent. Garder les builds hors du controller protège l’endroit où vivent les credentials et la configuration.'
		},
		{
			q: 'Dans le Jenkinsfile du tutoriel, pourquoi `junit` est-il dans `post { always { } }` et pas après `mvn test` dans `steps` ?',
			options: [
				'Parce que `junit` ne peut pas tourner dans `steps`',
				'Pour que le rapport de tests soit enregistré même quand `mvn test` échoue',
				'Pour que le rapport ne soit enregistré que quand tous les tests passent',
				'Parce que les blocs `post` tournent sur le controller'
			],
			answer: 1,
			why: 'Quand `mvn test` échoue, les steps suivants de ce stage ne tournent pas. `post { always }` tourne quel que soit le résultat, donc tu as le rapport justement quand les tests échouent.'
		},
		{
			q: 'Quelle situation est la meilleure raison de choisir Jenkins plutôt qu’un service de CI hébergé ?',
			options: [
				'Tu ne veux aucun serveur à maintenir ni aucun agent à mettre à jour',
				'Tu veux tout le pipeline décrit dans un fichier YAML versionné avec le code',
				'Les builds doivent tourner sur ton réseau sans internet, sur des agents que tu contrôles',
				'Tu ne construis qu’un petit projet open source hébergé sur GitHub'
			],
			answer: 2,
			why: 'Jenkins est auto-hébergé de bout en bout et fait tourner des agents n’importe où, y compris sur un réseau sans accès à internet. Pour zéro maintenance ou un petit projet GitHub, un service hébergé est plus simple.'
		}
	],
	recall: {
		q: 'Un stage `Deploy` a `when { branch \'main\' }` et un `input`. Sans `beforeInput true`, que se passe-t-il sur une branche de feature ?',
		a: 'Jenkins demande l’`input` avant de vérifier `when`, donc le build de la branche de feature s’arrête et attend une validation. Avec `beforeInput true`, le stage est sauté sur toutes les branches sauf `main`.'
	},
	sources: [
		{ title: 'Doc Jenkins, syntaxe des pipelines', url: 'https://www.jenkins.io/doc/book/pipeline/syntax/' },
		{ title: 'Doc Jenkins, utiliser un Jenkinsfile', url: 'https://www.jenkins.io/doc/book/pipeline/jenkinsfile/' },
		{ title: 'Doc Jenkins, gérer les nœuds (controller, agents, executors)', url: 'https://www.jenkins.io/doc/book/managing/nodes/' },
		{ title: 'Doc Jenkins, gérer les plugins', url: 'https://www.jenkins.io/doc/book/managing/plugins/' },
		{ title: 'Tutoriel Jenkins, construire une application Java avec Maven', url: 'https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/' }
	]
};
