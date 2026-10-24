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
		],
		steps: [
			{
				title: 'Lis la procédure',
				questions: [
					{ q: 'Quel est le point faible de ta procédure actuelle ?', options: ['Elle demande un serveur accessible en ssh', 'Elle ne marche que si un humain fait chaque étape, dans le bon ordre', 'Elle lance les tests trop souvent', 'Elle construit sur une machine trop lente'], answer: 1, why: 'Sur le papier, la procédure tient. Elle casse le jour où quelqu’un saute `make test` ou inverse deux étapes.' },
					{ q: 'Dans le pipeline, où tourne `make build` ?', options: ['Sur chaque serveur, après `git pull`', 'Une fois en staging, puis encore en production', 'Une seule fois, dans le stage build du pipeline', 'Seulement après les tests, sur le serveur'], answer: 2, why: 'Le pipeline construit le code **une seule fois**. Le serveur ne construit rien.' },
					{ q: 'Quelle étape de la procédure disparaît complètement ?', options: ['La migration de la base', 'Le `systemctl restart app`', '`make test`', 'Le `git pull` sur le serveur'], answer: 3, why: 'Le serveur reçoit seulement ce que le pipeline a construit, il n’a donc jamais besoin des sources.' },
					{ q: 'Quelles commandes visent encore le serveur, lancées maintenant par la machine ?', options: ['Copier l’artefact, lancer la migration, redémarrer', '`git pull`, `make build`, redémarrer', '`make test` et le linter', 'Seulement `make build`'], answer: 0, why: 'Ce sont les commandes de ta procédure. Le pipeline les lance dans le stage de déploiement.' }
				]
			},
			{
				title: 'Regroupe les stages',
				questions: [
					{ q: 'Dans quel ordre vont les stages ?', options: ['Test, build, déploiement en staging, déploiement en production', 'Build, test, déploiement en staging, validation, production', 'Build, déploiement en production, puis test', 'Déploiement en staging, build, test, production'], answer: 1, why: 'Chaque stage attend que le précédent passe, donc un changement cassé n’atteint jamais un serveur.' },
					{ q: 'Qu’est-ce qui tourne en parallèle ?', options: ['`make test` et un linter, dans le stage de test', 'Le build et le déploiement en staging', 'La migration et le redémarrage', 'Les déploiements en staging et en production'], answer: 0, why: 'Les jobs d’un même stage tournent en parallèle. Aucune des deux vérifications n’a besoin de l’autre.' },
					{ q: 'La migration et `systemctl restart app` font tous deux partie du déploiement. Pourquoi ne pas en faire deux jobs parallèles ?', options: ['Des jobs parallèles ne peuvent pas joindre un serveur en ssh', 'GitLab n’accepte qu’un job dans un stage de déploiement', 'Le redémarrage doit attendre la migration, donc ils tournent l’un après l’autre', 'La migration a besoin du résultat du linter'], answer: 2, why: 'Les jobs d’un même stage tournent en parallèle, donc réserve les jobs parallèles aux étapes qui ne dépendent pas l’une de l’autre. L’application redémarrée attend le schéma migré, donc le redémarrage vient après la migration.' },
					{ q: 'Pourquoi mettre les vérifications rapides en premier ?', options: ['Parce que le linter a besoin du résultat du build', 'Pour pouvoir sauter les tests lents', 'Parce que GitLab lance de toute façon les jobs rapides d’abord', 'Pour qu’une erreur de lint apparaisse en quelques secondes, pas après toute la suite'], answer: 3, why: 'Échouer vite : la vérification la moins chère qui peut attraper une erreur doit tourner en premier.' }
				]
			},
			{
				title: 'Nomme l’artefact',
				questions: [
					{ q: 'Quel résultat sert d’artefact ?', options: ['Les sources récupérées par `git pull`', 'La base après la migration', 'Ce que produit `make build` : une archive, un binaire, plus tard une image', 'Le log de `systemctl restart app`'], answer: 2, why: 'Un artefact est un fichier qu’un job produit et transmet aux jobs suivants. Ici, c’est le résultat du build.' },
					{ q: 'Que reçoit le staging ?', options: ['Le fichier exact produit par le stage build', 'Un nouveau build du même commit', 'Le dépôt, à construire sur le serveur', 'Seulement le rapport de tests'], answer: 0, why: 'Rien n’est reconstruit. Le staging reçoit le fichier sur lequel les tests ont tourné.' },
					{ q: 'Que reçoit la production ?', options: ['Un nouveau build avec des options de production', 'Le code d’un `git pull`', 'Ce que le staging a reconstruit', 'Le même artefact que le staging'], answer: 3, why: 'Le pipeline promeut un seul artefact de stage en stage.' },
					{ q: 'Comment vérifies-tu que la production a reçu le fichier sur lequel les tests ont tourné ?', options: ['Tu vérifies que les deux déploiements ont eu lieu le même jour', 'Tu compares octet par octet le résultat du build et la copie en production, par exemple avec `cmp`', 'Tu lances `git pull` sur le serveur et tu compares l’arborescence', 'Tu cherches un badge de pipeline vert'], answer: 1, why: 'La production doit recevoir le même artefact, donc les deux fichiers sont identiques. Dans le lab, `cmp dist/app.tar.gz prod/app.tar.gz` n’affiche rien.' }
				]
			},
			{
				title: 'Place la validation',
				questions: [
					{ q: 'Où va la validation humaine pour faire de la livraison continue ?', options: ['Avant le stage build', 'Entre le build et les tests', 'Après le staging, avant la production', 'Après le déploiement en production'], answer: 2, why: 'Chaque changement vert arrive en staging. Un humain choisit quand il part en production.' },
					{ q: 'Avec la validation en place, quand la migration de la base tourne-t-elle pour la première fois sur une vraie base ?', options: ['Au déploiement en staging, avant que quiconque clique', 'Seulement en production, après le clic', 'Dans le stage build, avec `make build`', 'Dans le stage de test, à côté du linter'], answer: 0, why: 'Le déploiement en staging lance les commandes de la procédure : copier l’artefact, lancer la migration, redémarrer. La validation se place après le staging, donc la migration y a déjà tourné quand un humain décide.' },
					{ q: 'Tu retires la validation. Qu’est-ce qui reste pour arrêter un mauvais changement avant la production ?', options: ['L’humain qui cliquait avant', 'Rien : la production se vérifie toute seule', 'L’équipe ops qui lit les logs après la mise en ligne', 'Seulement les jobs avant la production : build, tests, lint et déploiement en staging'], answer: 3, why: 'Sans humain entre les deux, chaque changement qui passe le pipeline part en production. Les jobs précédents sont le seul filtre restant, c’est pourquoi tu ne retires le bouton qu’une fois que tu leur fais confiance.' },
					{ q: 'Quand peux-tu retirer la validation sans risque ?', options: ['Dès le premier jour, pour livrer plus vite', 'Quand tu fais confiance au pipeline', 'Quand les tests deviennent trop lents', 'Jamais : la livraison continue l’exige pour toujours'], answer: 1, why: 'Il te faut une livraison continue qui marche avant de passer au déploiement continu.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Écrire un petit pipeline en bash qui construit une fois, teste en parallèle, s’arrête au premier échec et attend un humain avant la production.',
		steps: [
			'Crée une appli jetable : `mkdir -p ~/pipe-lab && cd ~/pipe-lab && printf \'echo hello v1\\n\' > app.sh`.',
			'Écris `pipeline.sh` avec `set -euo pipefail` et quatre stages, chacun ouvert par une ligne comme `echo "== build"` : build (`tar -czf dist/app.tar.gz app.sh`), test (deux jobs lancés avec `&`, puis un `wait` par job), déploiement en staging (copier et décompresser l’archive dans `staging/`), déploiement en production (la même archive, dans `prod/`).',
			'Avant la production, demande une validation : `read -r -p "Ship to production? [y/N] " ok` et arrête-toi si la réponse n’est pas `y`.',
			'Lance `bash pipeline.sh` et réponds `y`. Puis casse l’appli avec `printf \'echo bye\\n\' > app.sh` et relance.'
		],
		done: [
			'Après le premier passage, `cmp dist/app.tar.gz prod/app.tar.gz` n’affiche rien : la production a reçu le fichier sur lequel les tests ont tourné.',
			'Après le passage cassé, `echo $?` juste après `bash pipeline.sh` affiche `1` et la sortie s’arrête à `== test`.',
			'`bash prod/app.sh` affiche toujours `hello v1`.'
		],
		solution: [
			'`mkdir -p dist && tar -czf dist/app.tar.gz app.sh`',
			'`(bash app.sh | grep -q hello) & unit=$!` et `bash -n app.sh & lint=$!`, puis `wait "$unit"` et `wait "$lint"` sur deux lignes séparées. Reliés par `&&`, un échec n’arrêterait pas `set -e`.',
			'`mkdir -p staging && cp dist/app.tar.gz staging/ && tar -xzf staging/app.tar.gz -C staging`, et pareil avec `prod`.',
			'`[ "$ok" = y ] || { echo "stopped before production"; exit 0; }`. Supprime cette ligne et tu as du déploiement continu.'
		]
	},
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
