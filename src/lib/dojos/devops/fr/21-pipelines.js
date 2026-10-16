const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/b795e7ababc193e9fe85de324f8dc3bb79d2ea90';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pipelines',
	part: 'CI/CD',
	title: 'Les pipelines : la procédure de déploiement lancée à chaque push',
	minutes: 10,
	hook: [
		'Tu connais ce déploiement. Tu te connectes en ssh, `git pull`, tu lances les tests si tu y penses, tu redémarres le service et tu surveilles les logs. Ça marche quand tu fais chaque étape, dans le bon ordre.',
		'Un **pipeline**, c’est cette procédure écrite en code, qu’une machine exécute à chaque push. Elle lance les mêmes étapes dans le même ordre à chaque fois. Quand une étape échoue, le pipeline s’arrête avant que le code cassé arrive sur un serveur.',
		'Le pipeline a des stages, il passe des artefacts d’un stage au suivant, et il s’arrête au premier échec. L’endroit où un humain valide la mise en ligne sépare la livraison continue du déploiement continu.'
	],
	terms: [
		{ term: 'Stage', def: 'Une étape du pipeline, comme build, test ou deploy. Les jobs d’un même stage peuvent tourner en parallèle. Le stage suivant attend que celui-ci passe.' },
		{ term: 'Artefact', def: 'Un fichier qu’un job produit et transmet aux jobs suivants : un binaire, une archive, un rapport de tests.' },
		{ term: 'Livraison continue', def: 'Chaque changement qui passe le pipeline **pourrait** partir en production à tout moment. Un humain décide quand.' },
		{ term: 'Déploiement continu', def: 'Chaque changement qui passe le pipeline part en production, sans humain au milieu.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['push["git push"] --> build["Build : compiler une fois"]'],
				highlight: ['push', 'build'],
				note: 'Un push lance le pipeline. Le premier stage construit le code **une seule fois**. Avant, tu faisais cette étape à la main sur le serveur.'
			},
			{
				add: [
					'subgraph tst["Stage de test"]',
					'unit["Tests unitaires"]',
					'lint["Lint"]',
					'end',
					'build --> unit',
					'build --> lint'
				],
				highlight: ['unit', 'lint'],
				note: 'Les jobs d’un même stage tournent **en parallèle**. Mets les vérifications rapides tôt : tu vois une erreur de lint au bout de quelques secondes, avant que toute la suite de tests ait tourné.'
			},
			{
				add: [
					'art[("Artefact : app-1.4.2.tar.gz")]',
					'build -.-> art',
					'unit --> stg["Déploiement en staging"]',
					'lint --> stg',
					'art -.-> stg'
				],
				highlight: ['art', 'stg'],
				note: 'Le pipeline garde le résultat du build comme artefact, `app-1.4.2.tar.gz`. Le staging reçoit ce fichier exact, et rien n’est reconstruit. La production recevra ensuite le fichier même sur lequel les tests ont tourné.'
			},
			{
				add: ['stg --> gate["Validation : un humain clique"]', 'gate --> prod["Déploiement en production"]'],
				highlight: ['gate', 'prod'],
				note: 'Avec le bouton de validation, c’est de la **livraison continue** : chaque changement vert est prêt, et un humain choisit quand il part. Enlève le bouton et chaque changement vert part en production : c’est du déploiement continu.'
			},
			{
				add: ['stop["Le lint échoue : les stages suivants ne démarrent jamais"]', 'lint -.-> stop', 'class stop ext'],
				highlight: ['stop'],
				note: 'Quand un job échoue, le pipeline s’arrête (fail fast). Aucun stage suivant ne tourne, donc un changement cassé n’arrive ni en staging ni en production.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml',
		repo: 'gitlabhq/gitlabhq',
		url: `${GITLAB}/lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml#L18-L48`,
		lang: 'yaml',
		code: `stages:          # List of stages for jobs, and their order of execution
  - build
  - test
  - deploy

build-job:       # This job runs in the build stage, which runs first.
  stage: build
  script:
    - echo "Compiling the code..."
    - echo "Compile complete."

unit-test-job:   # This job runs in the test stage.
  stage: test    # It only starts when the job in the build stage completes successfully.
  script:
    - echo "Running unit tests... This will take about 60 seconds."
    - sleep 60
    - echo "Code coverage is 90%"

lint-test-job:   # This job also runs in the test stage.
  stage: test    # It can run at the same time as unit-test-job (in parallel).
  script:
    - echo "Linting code... This will take about 10 seconds."
    - sleep 10
    - echo "No lint issues found."

deploy-job:      # This job runs in the deploy stage.
  stage: deploy  # It only runs when *both* jobs in the test stage complete successfully.
  environment: production
  script:
    - echo "Deploying application..."
    - echo "Application successfully deployed."`,
		notes: [
			'GitLab fournit ce fichier comme pipeline de démarrage. Les lignes `echo` tiennent la place des vraies commandes. Tu les remplaces par ton build, tes tests et ton déploiement, et tu gardes les stages et les jobs tels quels.',
			'Les lignes 1 à 4 fixent l’ordre des stages. La [doc GitLab](https://docs.gitlab.com/ci/yaml/#stages) précise que les jobs d’un même stage tournent en parallèle, et que si un job échoue, **les jobs des stages suivants ne démarrent pas**.',
			'Les lignes 12 à 24 mettent deux jobs dans le stage de test. Quand `lint-test-job` échoue au bout de 10 secondes, `unit-test-job` continue jusqu’au bout. GitLab saute seulement les jobs des stages suivants.',
			'La ligne 28, `environment: production`, marque `deploy-job` comme un déploiement, pour que GitLab puisse montrer ce qui est déployé où. On y revient au jour 23.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque changement passe par les mêmes vérifications, donc personne ne livre sans lancer les tests.',
			'De petits changements, testés à chaque push, se corrigent plus facilement : quand un job échoue, tu sais quel commit l’a cassé.',
			'Les étapes de déploiement sont dans le dépôt et se relisent comme du code. Personne n’a besoin de s’en souvenir.'
		],
		cost: [
			'Chaque push attend la fin du pipeline. S’il ralentit, les gens le contournent.',
			'Un test instable échoue au hasard et bloque tout le monde. Après quelques faux échecs, plus personne ne regarde les jobs rouges.',
			'Quelqu’un doit s’occuper du pipeline, de ses runners et de ses secrets, et les réparer quand ils cassent.'
		]
	},
	task: {
		prompt: 'Ta procédure de déploiement aujourd’hui : ssh sur le serveur, `git pull`, `make test`, `make build`, migration de la base, `systemctl restart app`. Réécris-la en stages de pipeline. Dis quel résultat sert d’artefact, ce qui tourne en parallèle, et où placer une validation humaine si tu veux de la livraison continue et pas du déploiement continu.',
		hint: 'Pour chaque étape, demande-toi : a-t-elle besoin du code, ou du résultat du build ? Dépend-elle d’une autre étape, ou peut-elle tourner à côté ?',
		answer: [
			'Stage build : `make build` tourne une seule fois, dans le pipeline. Le serveur ne construit rien. Le résultat (une archive, un binaire, plus tard une image de conteneur) est l’**artefact**.',
			'Stage test : `make test` et un linter tournent en parallèle. Si l’un échoue, aucun stage suivant ne tourne.',
			'Déploiement en staging : copier l’artefact, lancer la migration, redémarrer. Ce sont les commandes de ta procédure, lancées par la machine.',
			'Validation, puis déploiement en production avec le **même artefact**. La validation en fait de la livraison continue. Si tu la retires quand tu fais confiance au pipeline, tu passes au déploiement continu.',
			'Le `git pull` sur le serveur disparaît : le serveur reçoit seulement ce que le pipeline a construit.'
		]
	},
	quiz: [
		{
			q: 'Quelle est la différence entre livraison continue et déploiement continu ?',
			options: [
				'La livraison continue construit et empaquette le code, alors que le déploiement continu lance aussi toute la suite de tests',
				'En livraison continue, chaque changement validé est prêt et un humain décide quand le mettre en ligne. En déploiement continu, il part tout seul',
				'Le déploiement continu est pour les plateformes de conteneurs, la livraison continue pour les équipes qui livrent encore des VM',
				'Ce sont deux noms pour la même pratique, et les deux veulent dire que chaque changement validé part tout seul chez les utilisateurs'
			],
			answer: 1,
			why: 'Les deux gardent chaque changement livrable. Seule la dernière étape change : un bouton humain (livraison) ou pas de bouton (déploiement). Il te faut une livraison continue qui marche avant de passer au déploiement continu.'
		},
		{
			q: 'Dans le pipeline Getting-Started de GitLab, `lint-test-job` échoue. Qu’arrive-t-il à `deploy-job` ?',
			options: [
				'Il tourne quand même, parce qu’il est dans un autre stage',
				'Il tourne, mais avec un avertissement',
				'Il ne démarre pas : un job en échec arrête tous les stages suivants',
				'Il attend que quelqu’un corrige le lint, puis démarre tout seul'
			],
			answer: 2,
			why: 'Les jobs d’un stage ne démarrent que si tous les jobs des stages précédents sont passés. Après un job en échec, GitLab saute les stages suivants.'
		},
		{
			q: 'Pourquoi un pipeline construit-il l’artefact une seule fois et le transmet au staging puis à la production, au lieu de reconstruire à chaque fois ?',
			options: [
				'Parce que les outils de CI interdisent au même job de construire deux fois dans un pipeline',
				'Pour économiser de l’espace disque et des minutes de build sur le runner partagé',
				'Pour que le fichier déployé en production soit exactement celui que tu as testé',
				'Parce que les serveurs de production ne peuvent pas lancer de compilateur ni récupérer de dépendances'
			],
			answer: 2,
			why: 'Un nouveau build peut récupérer une autre dépendance ou utiliser un autre compilateur. La production fait alors tourner quelque chose que personne n’a testé. Quand le pipeline promeut un seul artefact de stage en stage, la production fait tourner le fichier testé.'
		}
	],
	recall: {
		q: 'Dans le pipeline de démarrage de GitLab, le job de lint échoue. Quels jobs tournent encore, et que change le retrait de la validation avant la production ?',
		a: 'Le job de tests unitaires du même stage va jusqu’au bout, et aucun job d’un stage suivant ne démarre. Sans la validation, chaque changement validé part en production : c’est du déploiement continu.'
	},
	sources: [
		{ title: 'Martin Fowler, Continuous Delivery', url: 'https://martinfowler.com/bliki/ContinuousDelivery.html' },
		{ title: 'Martin Fowler, Deployment Pipeline', url: 'https://martinfowler.com/bliki/DeploymentPipeline.html' },
		{ title: 'Doc GitLab, syntaxe YAML de CI/CD : stages', url: 'https://docs.gitlab.com/ci/yaml/#stages' },
		{ title: 'GitLab, template Getting-Started.gitlab-ci.yml', url: `${GITLAB}/lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml` },
		{ title: 'DORA, la capacité Continuous delivery', url: 'https://dora.dev/capabilities/continuous-delivery/' }
	]
};
