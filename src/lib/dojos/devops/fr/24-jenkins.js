const APP = 'https://github.com/jenkins-docs/simple-java-maven-app/blob/bffd953ff1ea7e0ae32fb7ee2f4b5221d1d96918';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'jenkins',
	part: 'CI/CD',
	title: 'Jenkins : le serveur dont tu vas hériter',
	minutes: 10,
	hook: [
		'Quelque part dans la salle serveur, il y a une VM qui s’appelle `jenkins01`. Elle fait tous les builds depuis des années. Elle a des dizaines de plugins, et **personne ne veut être celui qui la met à jour**.',
		'Tu vas croiser Jenkins. Il est auto-hébergé, gratuit, et il fait presque tout grâce aux plugins. Son vieux défaut : des jobs configurés en cliquant dans une interface web, que personne ne pouvait relire ni reconstruire.',
		'Aujourd’hui : le **controller** et ses **agents**, le **Jenkinsfile** qui remet le pipeline dans le dépôt, et quand Jenkins reste le bon choix.'
	],
	terms: [
		{ term: 'Controller', def: 'Le service Jenkins lui-même : interface web, configuration, et le « cerveau » qui décide où et quand les builds tournent.' },
		{ term: 'Agent', def: 'Une machine (ou un conteneur) qui exécute les étapes de build pour le controller. Les agents portent des labels, comme `linux` ou `docker`.' },
		{ term: 'Executor', def: 'Un emplacement sur un agent pour une tâche à la fois. Deux executors sur un agent, c’est deux builds possibles en même temps.' },
		{ term: 'Jenkinsfile', def: 'Un fichier texte dans le dépôt qui définit le pipeline. Relu et versionné comme du code.' },
		{ term: 'Pipeline déclaratif', def: 'La syntaxe structurée du Jenkinsfile : un bloc `pipeline { }` avec `agent`, `stages`, `steps` et `post`. Plus lisible que l’ancienne syntaxe scriptée, qui est du Groovy brut.' },
		{ term: 'Plugin', def: 'Un module ajouté au controller. Git, les rapports JUnit, les credentials et le pipeline lui-même sont tous des plugins.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['push["git push"] --> ctl["Controller : interface web, planifie les builds"]'],
				highlight: ['push', 'ctl'],
				note: 'Le **controller**, c’est Jenkins lui-même. Il apprend qu’il y a eu un push, décide qu’un build doit tourner, et garde l’historique. C’est la machine que tu sauvegardes.'
			},
			{
				add: ['ctl --> ag1["Agent : linux-01, 2 executors"]', 'ctl --> ag2["Agent : linux-02, 2 executors"]'],
				highlight: ['ag1', 'ag2'],
				note: 'Le travail tourne sur les **agents**. La doc Jenkins déconseille de lancer des builds sur le controller lui-même, pour la sécurité, les performances et la montée en charge. Un build qui lance `rm -rf` ne doit pas tourner là où vivent les credentials.'
			},
			{
				add: ['jf["Jenkinsfile, dans le dépôt"]', 'jf -.->|lu à chaque build| ctl'],
				highlight: ['jf'],
				note: 'Avec un **Jenkinsfile**, le pipeline vit dans Git à côté du code. Modifie-le dans une branche, relis-le dans une pull request. Fini les clics dans les formulaires de job.'
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
				note: 'Un pipeline déclaratif est une liste de **stages**, même idée qu’au jour 21. Si Test échoue, Deliver ne tourne jamais.'
			},
			{
				add: ['plug["Plugins : Git, JUnit, Credentials"]', 'plug -.-> ctl', 'class plug ext'],
				highlight: ['plug'],
				note: 'Les **plugins** sont la force de Jenkins et sa douleur. Il y en a plus d’un millier. Chacun que tu ajoutes est du code sur le controller que tu dois tenir à jour, et qui doit rester compatible avec les autres.'
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
			'C’est l’application du [tutoriel Maven officiel de Jenkins](https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/). Trois stages : build sans les tests, lancer les tests, livrer.',
			'`label \'!windows\'` est une expression de label : tourner sur n’importe quel agent dont les labels ne contiennent pas `windows`. Les [expressions de label](https://github.com/jenkinsci/jenkins/blob/f5d0dcb8ab0ff713ec71d3bd38383fc9ff094037/core/src/main/resources/hudson/model/AbstractProject/help-label.html) de Jenkins acceptent aussi `&&` et `||`. Ça colle ici : chaque step est une commande shell `sh`.',
			'`post { always { junit … } }` tourne quel que soit le résultat du stage. Le rapport de tests est donc enregistré **même quand les tests échouent**, c’est-à-dire exactement quand tu en as besoin.',
			'`skipStagesAfterUnstable()` : la [référence de syntaxe](https://www.jenkins.io/doc/book/pipeline/syntax/#options) dit qu’il saute les stages dès que le statut du build est passé à **UNSTABLE**, un statut en général causé par des tests en échec. Un build avec des tests rouges n’atteint pas Deliver.'
		]
	},
	tradeoff: {
		gain: [
			'Entièrement auto-hébergé et gratuit : il tourne sur ton réseau, même sans aucun accès à internet.',
			'Pas lié à un seul hébergeur Git. GitHub, GitLab, Bitbucket ou un simple serveur Git, Jenkins sait construire depuis.',
			'Un plugin pour presque tout, et des agents sur n’importe quel OS : Windows, macOS, vieilles machines Unix que la CI hébergée ne propose pas.'
		],
		cost: [
			'C’est toi qui fais tourner le controller : mises à jour, sauvegardes, versions de Java, disque plein de vieux logs de build.',
			'Les plugins se cassent entre eux lors des mises à jour. Beaucoup d’équipes figent leur Jenkins, qui devient alors un risque de sécurité.',
			'La configuration faite en cliquant (credentials, réglages globaux) reste hors de Git, sauf si tu fais un effort en plus.'
		]
	},
	task: {
		prompt: 'Ajoute un stage `Deploy` après `Deliver`. Il doit tourner **seulement sur la branche `main`** (c’est un pipeline multibranche), et attendre la validation d’un humain. Écris le stage, et méfie-toi d’un piège dans l’ordre où Jenkins vérifie les choses.',
		hint: 'Regarde la directive `when` avec `branch`, et la directive `input`. Laquelle Jenkins évalue-t-il en premier ?',
		answer: [
			'`stage(\'Deploy\') { when { beforeInput true; branch \'main\' } input { message \'Deploy to production?\' } steps { sh \'./deploy.sh\' } }`',
			'`when { branch \'main\' }` ne marche que dans un pipeline multibranche. Sur les autres branches le stage est sauté.',
			'Le piège : par défaut, Jenkins demande l’`input` **avant** de vérifier `when`. Sans `beforeInput true`, chaque branche de feature s’arrêterait pour attendre une validation dont elle n’a pas besoin.',
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
			why: 'Jenkins est auto-hébergé de bout en bout et fait tourner des agents n’importe où. C’est son atout. Pour zéro maintenance ou un petit projet GitHub, un service hébergé est plus simple.'
		}
	],
	takeaway: 'Jenkins, c’est un controller qui planifie et des agents qui construisent. Mets le pipeline dans un Jenkinsfile, garde les builds hors du controller, et traite chaque plugin comme du code que tu dois maintenir.',
	sources: [
		{ title: 'Doc Jenkins, syntaxe des pipelines', url: 'https://www.jenkins.io/doc/book/pipeline/syntax/' },
		{ title: 'Doc Jenkins, utiliser un Jenkinsfile', url: 'https://www.jenkins.io/doc/book/pipeline/jenkinsfile/' },
		{ title: 'Doc Jenkins, gérer les nœuds (controller, agents, executors)', url: 'https://www.jenkins.io/doc/book/managing/nodes/' },
		{ title: 'Doc Jenkins, gérer les plugins', url: 'https://www.jenkins.io/doc/book/managing/plugins/' },
		{ title: 'Tutoriel Jenkins, construire une application Java avec Maven', url: 'https://www.jenkins.io/doc/tutorials/build-a-java-app-with-maven/' }
	]
};
