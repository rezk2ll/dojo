const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'tags-and-releases',
	part: 'Git',
	title: 'Tags, versions et releases',
	minutes: 10,
	hook: [
		'La production casse après le déploiement du vendredi. Ton chef demande : « qu’est-ce qui tournait jeudi ? » Si ta réponse est « le commit de vers 16 h, je crois », tu n’as pas de releases.',
		'Un **tag** est une ref qui nomme un commit : `v1.4.2`. Contrairement à une branche, il ne bouge pas quand tu commites. La version de jeudi a un nom que tu peux extraire, comparer, et sur lequel tu peux faire un rollback.',
		'Une **release** ajoute le reste : un numéro de version qui a un sens (le **semantic versioning**), un **changelog** écrit pour des humains, et les **artefacts** (un binaire, un paquet, une image) construits à partir de ce commit précis.'
	],
	terms: [
		{ term: 'Tag annoté', def: 'Un objet tag avec le nom et l’email de la personne qui tague, une date et un message. Créé avec `git tag -a`. Fait pour les releases.' },
		{ term: 'Tag léger', def: 'Juste un nom qui pointe vers un commit, rien d’autre. Fait pour des étiquettes privées ou temporaires.' },
		{ term: 'Semantic versioning', def: '`MAJOR.MINOR.PATCH` : MAJOR pour les changements incompatibles, MINOR pour les nouvelles fonctionnalités rétrocompatibles, PATCH pour les corrections de bugs rétrocompatibles.' },
		{ term: 'Changelog', def: 'Un fichier qui liste les changements notables de chaque version, du plus récent au plus ancien, pour les gens qui utilisent ton logiciel.' },
		{ term: 'Artefact de release', def: 'Le résultat construit que les utilisateurs installent : un paquet, un binaire, une image de conteneur. Construit une seule fois à partir du commit tagué.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tag["tag v1.4.0 : auteur, date, message"] --> c["commit 9fceb02"]'],
				highlight: ['tag', 'c'],
				note: '`git tag -a v1.4.0 -m "Release 1.4.0"` crée un **tag annoté** sur le commit courant. Les nouveaux commits font avancer la branche, le tag reste sur `9fceb02`.'
			},
			{
				add: ['tag -->|"git push origin v1.4.0"| remote[("Remote : GitHub")]'],
				highlight: ['remote'],
				note: '**`git push` n’envoie pas les tags par défaut.** Pousse le tag par son nom, ou utilise `git push --follow-tags` pour envoyer les tags annotés qui pointent vers des commits atteignables depuis ce que tu pousses.'
			},
			{
				add: ['remote -->|"release publiée"| ci["Job CI de release"]', 'ci --> art["artefacts : paquet, binaire, image"]'],
				highlight: ['ci', 'art'],
				note: 'Tu publies une GitHub Release à partir du tag. Cet événement lance un job de CI, qui extrait le commit tagué et construit les artefacts **une seule fois**.'
			},
			{
				add: ['art --> rel["Release v1.4.0 : notes et fichiers"]', 'log["CHANGELOG.md"] -.-> rel'],
				highlight: ['rel', 'log'],
				note: 'La page de release contient les notes et les fichiers. Les notes viennent du **changelog**, écrit pour des humains, pas d’un copier-coller de `git log`.'
			},
			{
				add: ['rel --> users["Utilisateurs : 2.0.0 veut dire lire avant de mettre à jour"]', 'class users ext'],
				highlight: ['users'],
				note: 'Le semantic versioning est une **promesse** aux utilisateurs. De 1.4.0 à 1.4.1 : correctif sans risque. Vers 1.5.0 : nouvelles fonctionnalités, rien ne casse. Vers 2.0.0 : quelque chose d’incompatible, lis d’abord le changelog.'
			}
		]
	},
	example: {
		title: 'ci/python-publish.yml',
		repo: 'actions/starter-workflows',
		url: `${SW}/ci/python-publish.yml#L9-L70`,
		lang: 'yaml',
		code: `name: Upload Python Package

on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  release-build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.x"

      - name: Build release distributions
        run: |
          # NOTE: put your own distribution build steps here.
          python -m pip install build
          python -m build

      - name: Upload distributions
        uses: actions/upload-artifact@v4
        with:
          name: release-dists
          path: dist/

  pypi-publish:
    runs-on: ubuntu-latest
    needs:
      - release-build
    permissions:
      # IMPORTANT: this permission is mandatory for trusted publishing
      id-token: write
…
    environment:
      name: pypi
…
    steps:
      - name: Retrieve release distributions
        uses: actions/download-artifact@v4
        with:
          name: release-dists
          path: dist/

      - name: Publish release distributions to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: dist/`,
		notes: [
			'`on: release: types: [published]` se déclenche quand quelqu’un publie une GitHub Release. Pour cet événement, GitHub met `GITHUB_REF` à `refs/tags/<tag_name>` et `GITHUB_SHA` au dernier commit de la release taguée. Donc `actions/checkout` récupère **exactement le commit tagué**.',
			'Construire une fois, publier ce qu’on a construit. `release-build` envoie `dist/` comme artefact, et `pypi-publish` (`needs: release-build`) télécharge ces mêmes fichiers. Rien n’est reconstruit entre les deux jobs.',
			'`id-token: write` sert au [trusted publishing](https://docs.pypi.org/trusted-publishers/) : PyPI fait confiance à un jeton d’identité de courte durée émis pour le workflow, donc tu ne stockes pas de token d’API PyPI dans un secret.',
			'`environment: name: pypi` : les commentaires du fichier recommandent fortement un environnement dédié avec des règles de protection pour la publication. Une release est le job où tu veux être le plus prudent.'
		]
	},
	tradeoff: {
		gain: [
			'Tout le monde peut nommer le code exact en production et le récupérer : `git checkout v1.4.2`.',
			'Le semantic versioning dit aux utilisateurs d’un coup d’œil si une mise à jour peut les casser.',
			'Des artefacts construits une fois à partir d’un tag : ce que tu as testé est ce que tu livres, et un rollback revient à « déployer la version précédente ».'
		],
		cost: [
			'Le semver demande une API publique claire. Sans elle, personne ne s’accorde sur MINOR ou MAJOR.',
			'Un bon changelog demande d’écrire. Un copier-coller de `git log` est rapide, et personne ne le lit.',
			'Un tag publié ne doit jamais bouger. Retaguer, c’est risquer que deux personnes aient chacune une « v1.4.2 » différente, donc une release ratée coûte un nouveau numéro de version.'
		]
	},
	task: {
		prompt: 'Tu maintiens un outil CLI interne en version 1.4.2. Depuis ce tag, `main` contient : un correctif de la rotation des logs, une nouvelle option `--dry-run`, et la suppression de l’option dépréciée `--force`. Choisis la prochaine version, écris l’entrée du changelog, et donne les commandes git pour taguer et publier.',
		hint: 'Pour un CLI, les options sont l’API publique. En supprimer une casse les scripts qui l’utilisent.',
		answer: [
			'Supprimer `--force` est un changement incompatible : on monte MAJOR. Prochaine version : **2.0.0**.',
			'Dans `CHANGELOG.md`, déplace les entrées de Unreleased sous `## [2.0.0] - 2026-10-16`, groupées en `### Added` (`--dry-run`), `### Removed` (`--force`), `### Fixed` (rotation des logs).',
			'`git tag -a v2.0.0 -m "Release 2.0.0"`, puis `git push origin v2.0.0`, parce qu’un simple `git push` n’envoie pas les tags.',
			'Publie une GitHub Release à partir de `v2.0.0` et laisse la CI construire et attacher les artefacts. Si la 2.0.0 s’avère cassée, sors une 2.0.1. Ne déplace jamais le tag.'
		]
	},
	quiz: [
		{
			q: 'Quel type de tag Git doit marquer une release, et pourquoi ?',
			options: [
				'Un tag léger, parce qu’il est plus petit, plus rapide, et que `git describe` l’utilise',
				'Une branche `release`, parce qu’elle peut avancer à chaque nouveau correctif',
				'Un tag annoté : il enregistre qui, quand et pourquoi, et `git describe` l’utilise par défaut',
				'Pas de tag, parce que le hash du commit identifie déjà la release exactement'
			],
			answer: 2,
			why: 'La doc de git-tag dit que les tags annotés sont faits pour les releases, et les tags légers pour des étiquettes privées ou temporaires. Certaines commandes comme `git describe` ignorent les tags légers par défaut.'
		},
		{
			q: 'Tu as lancé `git tag -a v1.5.0 -m "Release 1.5.0"`, puis `git push`. Le tag n’est pas sur GitHub. Pourquoi ?',
			options: [
				'`git push` n’envoie pas les tags par défaut, donc lance `git push origin v1.5.0`',
				'Les tags annotés ne peuvent pas être poussés, seuls les légers le peuvent',
				'GitHub n’accepte que les tags créés dans son interface web ou son API',
				'Le tag doit être signé avec `-s` avant de pouvoir être poussé'
			],
			answer: 0,
			why: 'Les tags se poussent explicitement : par leur nom, avec `--tags`, ou avec `--follow-tags` pour les tags annotés atteignables depuis les commits poussés.'
		},
		{
			q: 'La version 1.4.2 reçoit une nouvelle option facultative et rien d’autre ne change. Quelle est la version suivante selon le semantic versioning ?',
			options: ['1.4.3', '1.5.0', '2.0.0', '1.4.2-1'],
			answer: 1,
			why: 'Une nouvelle fonctionnalité rétrocompatible fait monter MINOR et remet PATCH à zéro. PATCH, c’est seulement pour les corrections de bugs, MAJOR pour les changements cassants.'
		}
	],
	takeaway: 'Tague chaque release avec un tag annoté, donne-lui une version sémantique, écris le changelog pour des humains, et construis les artefacts une seule fois à partir du commit tagué. Un tag publié ne bouge jamais.',
	sources: [
		{ title: 'Doc Git, git-tag', url: 'https://git-scm.com/docs/git-tag' },
		{ title: 'Pro Git, Tagging', url: 'https://git-scm.com/book/en/v2/Git-Basics-Tagging' },
		{ title: 'Semantic Versioning 2.0.0', url: 'https://semver.org/' },
		{ title: 'Keep a Changelog 1.1.0', url: 'https://keepachangelog.com/en/1.1.0/' },
		{ title: 'GitHub Docs, About releases', url: 'https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases' }
	]
};
