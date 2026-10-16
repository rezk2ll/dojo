const GITLAB = 'https://github.com/gitlabhq/gitlabhq/blob/b795e7ababc193e9fe85de324f8dc3bb79d2ea90';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gitlab-ci',
	part: 'CI/CD',
	title: 'GitLab CI : stages, runners, cache et artefacts',
	minutes: 10,
	hook: [
		'Beaucoup d’entreprises font tourner leur propre GitLab, sur leurs propres serveurs, et c’est peut-être toi qui l’as installé. Quand l’équipe demande de la CI, le pipeline tournera aussi sur des machines que tu gères.',
		'GitLab CI lit un seul fichier à la racine du dépôt, `.gitlab-ci.yml`. GitLab en tire un pipeline de jobs regroupés en stages, et confie chaque job à un **runner** : un petit agent que tu installes sur un serveur, une VM ou un cluster Kubernetes.',
		'Un job garde les paquets téléchargés dans le cache, et passe les fichiers construits aux stages suivants comme artefacts. Si tu confonds les deux, tes déploiements cassent.'
	],
	terms: [
		{ term: 'Runner', def: 'Le programme GitLab Runner qui prend les jobs et les exécute. Sur GitLab.com tu peux utiliser ceux hébergés par GitLab, sur ton propre GitLab tu les installes et tu les gères.' },
		{ term: 'rules', def: 'Des conditions que GitLab vérifie quand il crée le pipeline. Elles décident si un job est ajouté au pipeline, et comment (par exemple `when: manual`).' },
		{ term: 'Cache', def: 'Des fichiers qu’un job garde pour accélérer les runs suivants, comme les paquets téléchargés. Le job doit quand même marcher quand le cache est vide.' },
		{ term: 'Artefacts', def: 'Des fichiers qu’un job produit et que GitLab stocke, comme un résultat de build ou un rapport. Les stages suivants du même pipeline les téléchargent.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['push["git push"] --> gl["GitLab lit .gitlab-ci.yml"]'],
				highlight: ['push', 'gl'],
				note: 'Chaque push crée un pipeline à partir du `.gitlab-ci.yml` **de ce commit**. Modifie le fichier dans une branche, et seuls les pipelines de cette branche changent.'
			},
			{
				add: [
					'subgraph ts["Stage test, jobs en parallèle"]',
					't["test"]',
					'r["run"]',
					'pg["pages : branche par défaut seulement"]',
					'end',
					'gl --> ts'
				],
				highlight: ['t', 'r', 'pg'],
				note: 'Le template Python ne met pas de `stage` sur ces jobs, donc GitLab les place dans le stage par défaut **test**. Une règle sur `pages` n’ajoute ce job que sur la branche par défaut.'
			},
			{
				add: ['rn["Runner : lance chaque job dans python:latest"]', 'ts -.->|pris par| rn', 'class rn ext'],
				highlight: ['rn'],
				note: 'GitLab lui-même n’exécute rien. Un **runner** demande du travail, reçoit un job, lance son `script`, puis renvoie le log et les fichiers. Les `tags` de runner permettent à un job de demander un type de machine précis.'
			},
			{
				add: [
					'ca[("Cache : .cache/pip")]',
					'ar[("Artefacts : build/*")]',
					't -.->|garde pour les pipelines suivants| ca',
					'r -->|stocke dans GitLab| ar'
				],
				highlight: ['ca', 'ar'],
				note: 'Le cache garde ce que les jobs téléchargent, comme les paquets pip, pour que le pipeline suivant aille plus vite. Les **artefacts** gardent ce que les jobs construisent, comme `build/*`, et GitLab les passe aux stages suivants. Si un déploiement lit un résultat de build dans le cache, il casse chaque fois que le cache est vide.'
			},
			{
				add: [
					'dep["deploy : environment production"]',
					'ts --> dep',
					'ar -.-> dep',
					'env["Page environnement : ce qui tourne où, rollback"]',
					'dep --> env'
				],
				highlight: ['dep', 'env'],
				note: '`deploy` est dans le stage **deploy**, il ne démarre donc que si tous les jobs du stage test sont passés. `environment: production` nomme une cible de déploiement : GitLab note quel commit y est parti et quand, sur une page avec un bouton de rollback vers un déploiement précédent.'
			}
		]
	},
	example: {
		title: 'lib/gitlab/ci/templates/Python.gitlab-ci.yml',
		repo: 'gitlabhq/gitlabhq',
		url: `${GITLAB}/lib/gitlab/ci/templates/Python.gitlab-ci.yml#L8-L55`,
		lang: 'yaml',
		code: `image: python:latest

# Change pip's cache directory to be inside the project directory since we can
# only cache local items.
variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"

# https://pip.pypa.io/en/stable/topics/caching/
cache:
  paths:
    - .cache/pip
…
test:
  script:
    - pip install ruff tox  # you can also use tox
    - pip install --editable ".[test]"
    - tox -e py,ruff

run:
  script:
    - pip install .
    # run the command here
  artifacts:
    paths:
      - build/*

pages:
  script:
…
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy:
  stage: deploy
  script: echo "Define your deployment script!"
  environment: production`,
		notes: [
			'Il n’y a pas de liste `stages:`, donc GitLab utilise ses [valeurs par défaut](https://docs.gitlab.com/ci/yaml/#stages) : `.pre`, `build`, `test`, `deploy`, `.post`. Un job sans `stage` atterrit dans `test`. La ligne 37 place `deploy` dans le stage `deploy`, qui vient après, donc il attend les trois autres.',
			'Les lignes 3 à 6 déplacent le dossier de téléchargement de pip dans le projet. Les chemins de cache et d’artefacts sont [relatifs au dossier du projet](https://docs.gitlab.com/ci/caching/#how-cache-is-different-from-artifacts) et ne peuvent pas pointer en dehors, donc les lignes 9 à 11 ne peuvent mettre en cache que `.cache/pip` à cet endroit.',
			'Les lignes 23 à 25 gardent `build/*` de `run` comme **artefacts**. Par défaut, les jobs des stages suivants téléchargent les artefacts des stages précédents, et ils [expirent au bout de 30 jours par défaut](https://docs.gitlab.com/ci/caching/#artifacts) (un réglage de l’instance) sauf si le job définit `expire_in`.',
			'GitLab vérifie les `rules` dans l’ordre quand il crée le pipeline. Aux lignes 33 et 34, la seule règle correspond sur la branche par défaut. Sur une branche de feature rien ne correspond, donc le [job `pages` n’est pas ajouté](https://docs.gitlab.com/ci/yaml/#rules) du tout.',
			'La ligne 1, `image: python:latest`, fait tourner chaque job dans cette image de conteneur. Comme au jour 19, le tag `latest` pointe vers une nouvelle image Python après chaque version, donc épingle une version.'
		]
	},
	tradeoff: {
		gain: [
			'Auto-hébergé de bout en bout : GitLab, les runners et les artefacts peuvent tous rester sur ton réseau.',
			'Les runners sont à toi, donc un job peut joindre des serveurs internes, utiliser un GPU, ou tourner sur l’OS exact où tu déploies.',
			'Chaque environnement a un historique de déploiement et un bouton de rollback, sans configuration en plus.'
		],
		cost: [
			'C’est toi qui fais tourner les runners : installation, mises à jour, place disque pour les caches, capacité quand dix pipelines démarrent en même temps.',
			'Un attaquant qui prend la main sur un runner qui déploie en production peut déployer n’importe quoi. Protège ce runner comme un serveur de production.',
			'Chaque runner garde son propre cache, sauf si tu mets en place un cache partagé (S3 ou équivalent). Avec plusieurs runners, un job ne trouve le cache que s’il tombe sur le runner qui l’a enregistré.'
		]
	},
	task: {
		prompt: 'Modifie le template Python pour que : les stages soient explicites (`build`, `test`, `deploy`), `run` construise dans le stage `build`, et `deploy` tourne seulement sur la branche par défaut et **seulement quand un humain clique**. Écris les lignes que tu changes.',
		hint: 'Regarde `rules` avec `when`. Et souviens-toi que les artefacts d’un stage précédent sont téléchargés par défaut.',
		answer: [
			'Ajoute `stages: [build, test, deploy]` en haut, et `stage: build` sur `run`.',
			'Sur `deploy` : `rules:` puis `- if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` avec `when: manual`. Sur les autres branches aucune règle ne correspond, donc le job n’est pas dans le pipeline.',
			'`deploy` récupère `build/*` de `run` sans ligne en plus : les stages suivants téléchargent les artefacts précédents par défaut.',
			'Garde `environment: production`. Chaque clic est maintenant noté sur la page de l’environnement, et tu peux faire un rollback vers le déploiement précédent depuis là.'
		]
	},
	quiz: [
		{
			q: 'Dans GitLab CI, un job compile un binaire qu’un job de déploiement, dans un stage suivant, doit utiliser. Où doit aller le binaire ?',
			options: [
				'Dans `cache`, parce que c’est plus rapide et partagé avec les stages suivants',
				'Dans `artifacts`, que GitLab stocke et passe aux stages suivants',
				'Dans une variable CI/CD, définie par le job de build pour le déploiement',
				'Nulle part : le job de déploiement doit le recompiler depuis les sources'
			],
			answer: 1,
			why: 'Le cache garde les dépendances, et un job peut démarrer avec un cache vide. GitLab stocke les artefacts et les télécharge pour les stages suivants du même pipeline.'
		},
		{
			q: 'Ton `.gitlab-ci.yml` n’a pas de liste `stages:`, et un job n’a pas de clé `stage:`. Dans quel stage tourne le job ?',
			options: ['`build`', '`.pre`', '`deploy`', '`test`'],
			answer: 3,
			why: 'Les valeurs par défaut de GitLab sont `.pre`, `build`, `test`, `deploy`, `.post`, et un job sans `stage` est placé dans `test`.'
		},
		{
			q: 'Un job a `rules: - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH` et rien d’autre. Tu pushes sur une branche de feature. Qu’arrive-t-il à ce job ?',
			options: [
				'Il tourne et échoue',
				'Il apparaît comme sauté, en attente d’un clic manuel',
				'Il n’est pas ajouté au pipeline',
				'Il tourne, parce que les rules ne s’appliquent qu’aux merge requests'
			],
			answer: 2,
			why: 'Si aucune règle ne correspond, le job n’est pas ajouté au pipeline du tout. Un seul fichier peut donc donner des jobs différents aux branches de feature et à la branche par défaut.'
		}
	],
	recall: {
		q: 'Un job de build produit `build/*`, et un job de déploiement d’un stage suivant en a besoin. Tu le mets dans `cache` ou dans `artifacts`, et pourquoi ?',
		a: 'Dans `artifacts`. GitLab les stocke et les stages suivants les téléchargent par défaut. Le cache sert aux téléchargements comme `.cache/pip`, et un job peut démarrer avec un cache vide.'
	},
	sources: [
		{ title: 'Doc GitLab, référence de la syntaxe YAML de CI/CD', url: 'https://docs.gitlab.com/ci/yaml/' },
		{ title: 'Doc GitLab, le cache dans GitLab CI/CD', url: 'https://docs.gitlab.com/ci/caching/' },
		{ title: 'Doc GitLab, Environments', url: 'https://docs.gitlab.com/ci/environments/' },
		{ title: 'Doc GitLab, GitLab Runner', url: 'https://docs.gitlab.com/runner/' },
		{ title: 'GitLab, template Python.gitlab-ci.yml', url: `${GITLAB}/lib/gitlab/ci/templates/Python.gitlab-ci.yml` }
	]
};
