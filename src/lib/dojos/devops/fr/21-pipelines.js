const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/b795e7ababc193e9fe85de324f8dc3bb79d2ea90';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pipelines',
	part: 'CI/CD',
	title: 'Les pipelines : ta procédure de déploiement, exécutée par une machine',
	minutes: 10,
	hook: [
		'Tu connais ce déploiement. Tu te connectes en ssh, `git pull`, tu lances les tests si tu y penses, tu redémarres le service et tu surveilles les logs. Ça marche. Mais ça dépend de **toi**, un bon jour, qui fais chaque étape dans le bon ordre.',
		'Un **pipeline**, c’est cette procédure écrite sous forme de code et exécutée par une machine à chaque push. Mêmes étapes, même ordre, à chaque fois. Si une étape échoue, il **s’arrête**, avant que le code cassé n’arrive chez qui que ce soit.',
		'Aujourd’hui : ce que veulent vraiment dire CI, livraison continue et déploiement continu, et comment les stages, les artefacts et le fail fast s’emboîtent.'
	],
	terms: [
		{ term: 'Pipeline', def: 'Le chemin automatisé d’un changement, du `git push` à la production : une liste de stages exécutés dans l’ordre.' },
		{ term: 'Stage', def: 'Une étape du pipeline, comme build, test ou deploy. Les jobs d’un même stage peuvent tourner en parallèle. Le stage suivant attend que celui-ci passe.' },
		{ term: 'Artefact', def: 'Un fichier produit par un job et transmis aux jobs suivants : un binaire, une archive, un rapport de tests. Construit une fois, utilisé partout.' },
		{ term: 'Intégration continue (CI)', def: 'Tout le monde merge souvent de petits changements, et chaque changement est construit et testé automatiquement.' },
		{ term: 'Livraison continue', def: 'Chaque changement qui passe le pipeline **pourrait** partir en production à tout moment. Un humain décide quand.' },
		{ term: 'Déploiement continu', def: 'Chaque changement qui passe le pipeline **part** en production, sans humain au milieu.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['push["git push"] --> build["Build : compiler une fois"]'],
				highlight: ['push', 'build'],
				note: 'Un push lance le pipeline. Le premier stage construit le code **une seule fois**. C’est l’étape que tu faisais à la main sur le serveur.'
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
				note: 'Les jobs d’un même stage tournent **en parallèle**. Mets les vérifications rapides tôt : une erreur de lint doit te coûter quelques secondes, pas toute la suite de tests.'
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
				note: 'Le résultat du build est gardé comme **artefact**. Le staging reçoit ce fichier exact, pas un nouveau build. Ce que tu as testé, c’est ce que tu livres.'
			},
			{
				add: ['stg --> gate["Validation : un humain clique"]', 'gate --> prod["Déploiement en production"]'],
				highlight: ['gate', 'prod'],
				note: 'Avec le bouton de validation, c’est de la **livraison continue** : toujours prêt, mis en production à la demande. Enlève le bouton et chaque changement vert part : c’est du **déploiement continu**.'
			},
			{
				add: ['stop["Le lint échoue : les stages suivants ne démarrent jamais"]', 'lint -.-> stop', 'class stop ext'],
				highlight: ['stop'],
				note: '**Fail fast.** Un seul job rouge et le pipeline s’arrête. Rien ne tourne après, donc un changement cassé ne peut pas atteindre le staging, encore moins la production.'
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
			'C’est le pipeline de démarrage de GitLab. Les lignes `echo` remplacent les vraies commandes. Mets à la place ton build, tes tests et ton déploiement, et **la forme reste la même**.',
			'`stages` fixe l’ordre. La [doc GitLab](https://docs.gitlab.com/ci/yaml/#stages) le dit clairement : les jobs d’un même stage tournent en parallèle, et si un job échoue, **les jobs des stages suivants ne démarrent pas**. Le fail fast est intégré.',
			'Un détail : quand `lint-test-job` échoue au bout de 10 secondes, `unit-test-job`, dans le même stage, continue jusqu’au bout. Seuls les stages **suivants** sont sautés.',
			'`environment: production` marque `deploy-job` comme un déploiement, pour que GitLab puisse montrer ce qui est déployé où. On y revient au jour 23.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque changement passe par les mêmes vérifications. Fini le « j’ai oublié de lancer les tests ».',
			'De petits changements, testés à chaque push, sont plus faciles à corriger : quand ça casse, tu sais quel commit l’a fait.',
			'Les étapes de déploiement vivent dans le dépôt, relues comme du code, au lieu de rester dans la tête d’une seule personne.'
		],
		cost: [
			'Un pipeline lent est une taxe sur chaque push. Il faut le garder rapide, sinon les gens le contournent.',
			'Les tests instables font plus mal : un job rouge au hasard bloque tout le monde, et les gens apprennent à ignorer le rouge.',
			'Quelqu’un doit s’occuper du pipeline, de ses runners et de ses secrets. C’est un système comme un autre.'
		]
	},
	task: {
		prompt: 'Ta procédure de déploiement aujourd’hui : ssh sur le serveur, `git pull`, `make test`, `make build`, migration de la base, `systemctl restart app`. Réécris-la en stages de pipeline. Dis ce qui devient un artefact, ce qui tourne en parallèle, et où placer une validation humaine si tu veux de la livraison continue et pas du déploiement continu.',
		hint: 'Pour chaque étape, demande-toi : a-t-elle besoin du code, ou du résultat du build ? Dépend-elle d’une autre étape, ou peut-elle tourner à côté ?',
		answer: [
			'**Stage build :** `make build` une seule fois, dans le pipeline, pas sur le serveur. Le résultat (une archive, un binaire, plus tard une image de conteneur) est l’**artefact**.',
			'**Stage test :** `make test` et un linter, en parallèle. Si l’un échoue, rien ne tourne après.',
			'**Déploiement en staging :** copier l’artefact, lancer la migration, redémarrer. Les mêmes commandes que ta procédure, exécutées par la machine.',
			'**Validation, puis déploiement en production** avec le **même artefact**. C’est la validation qui en fait de la livraison continue. Retire-la quand tu fais confiance au pipeline, et ça devient du déploiement continu.',
			'Le `git pull` sur le serveur disparaît : le serveur ne construit plus rien, il reçoit seulement ce que le pipeline a construit.'
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
			why: 'Les deux gardent chaque changement livrable. La seule différence est la dernière étape : un bouton humain (livraison) ou pas de bouton (déploiement). Il faut faire de la livraison continue avant de pouvoir faire du déploiement continu.'
		},
		{
			q: 'Dans le pipeline Getting-Started de GitLab, `lint-test-job` échoue. Que devient `deploy-job` ?',
			options: [
				'Il tourne quand même, parce qu’il est dans un autre stage',
				'Il tourne, mais avec un avertissement',
				'Il ne démarre pas : un job en échec arrête tous les stages suivants',
				'Il attend que quelqu’un corrige le lint, puis démarre tout seul'
			],
			answer: 2,
			why: 'Les jobs d’un stage ne démarrent que si tous les jobs des stages précédents sont passés. Un job rouge et les stages suivants sont sautés. C’est le fail fast.'
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
			why: 'Un nouveau build peut récupérer une autre dépendance ou utiliser un autre compilateur. La production fait alors tourner quelque chose que personne n’a testé. Un seul artefact, promu de stage en stage, supprime cet écart.'
		}
	],
	takeaway: 'Un pipeline, c’est ta procédure sous forme de code : construire une fois, tester tôt et vite, s’arrêter au premier échec, et déployer le même artefact que celui que tu as testé.',
	sources: [
		{ title: 'Martin Fowler, Continuous Delivery', url: 'https://martinfowler.com/bliki/ContinuousDelivery.html' },
		{ title: 'Martin Fowler, Deployment Pipeline', url: 'https://martinfowler.com/bliki/DeploymentPipeline.html' },
		{ title: 'Doc GitLab, syntaxe YAML de CI/CD : stages', url: 'https://docs.gitlab.com/ci/yaml/#stages' },
		{ title: 'GitLab, template Getting-Started.gitlab-ci.yml', url: `${GITLAB}/lib/gitlab/ci/templates/Getting-Started.gitlab-ci.yml` },
		{ title: 'DORA, la capacité Continuous delivery', url: 'https://dora.dev/capabilities/continuous-delivery/' }
	]
};
