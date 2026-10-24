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
		'Une **release** ajoute le reste : un numéro de version qui dit aux utilisateurs ce qui a changé (le semantic versioning), un changelog écrit pour des humains, et les artefacts (un binaire, un paquet, une image) construits à partir de ce commit précis.'
	],
	terms: [
		{ term: 'Tag annoté', def: 'Un objet tag avec le nom et l’email de la personne qui tague, une date et un message. Créé avec `git tag -a`. Fait pour les releases. Un tag léger n’est qu’un nom qui pointe vers un commit, pour des étiquettes privées ou temporaires.' },
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
				note: 'Pousse le tag par son nom, car **`git push` n’envoie pas les tags par défaut**. Ou utilise `git push --follow-tags` pour envoyer les tags annotés qui pointent vers des commits atteignables depuis ce que tu pousses.'
			},
			{
				add: ['remote -->|"release publiée"| ci["Job CI de release"]', 'ci --> art["artefacts : paquet, binaire, image"]'],
				highlight: ['ci', 'art'],
				note: 'Tu publies une GitHub Release à partir du tag. Cet événement lance un job de CI, qui extrait le commit tagué et construit les artefacts **une seule fois**.'
			},
			{
				add: ['art --> rel["Release v1.4.0 : notes et fichiers"]', 'log["CHANGELOG.md"] -.-> rel'],
				highlight: ['rel', 'log'],
				note: 'La page de release contient les notes et les fichiers. Les notes viennent du **changelog**, qui regroupe les changements notables pour les utilisateurs. Un copier-coller de `git log` listerait chaque commit.'
			},
			{
				add: ['rel --> users["Utilisateurs : 2.0.0 veut dire lire avant de mettre à jour"]', 'class users ext'],
				highlight: ['users'],
				note: 'Avec le semantic versioning, le numéro dit aux utilisateurs ce que fait une mise à jour. De 1.4.0 à 1.4.1 : correctif sans risque. Vers 1.5.0 : nouvelles fonctionnalités, rien ne casse. Vers 2.0.0 : quelque chose d’incompatible, lis d’abord le changelog.'
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
			'Les lignes 3 à 5 lancent le workflow quand quelqu’un publie une GitHub Release. Pour cet événement, GitHub met `GITHUB_REF` à `refs/tags/<tag_name>` et `GITHUB_SHA` au dernier commit de la release taguée. Donc `actions/checkout`, ligne 15, récupère **exactement le commit tagué**.',
			'Les lignes 27 à 31 envoient `dist/` comme artefact. Dans `pypi-publish` (`needs: release-build`), les lignes 45 à 49 téléchargent ces mêmes fichiers : PyPI reçoit ce que `release-build` a construit, sans second build.',
			'Ligne 39 : `id-token: write` sert au [trusted publishing](https://docs.pypi.org/trusted-publishers/). PyPI fait confiance à un jeton d’identité de courte durée émis pour le workflow, donc tu ne stockes pas de token d’API PyPI dans un secret.',
			'Les lignes 41 et 42 font tourner le job dans l’environnement `pypi`. Les commentaires du fichier recommandent fortement un environnement dédié avec des règles de protection pour la publication.'
		]
	},
	tradeoff: {
		gain: [
			'Tout le monde peut nommer le code exact en production et le récupérer : `git checkout v1.4.2`.',
			'Avec le seul numéro, le semantic versioning dit aux utilisateurs si une mise à jour peut les casser : seul un saut de MAJOR le peut.',
			'Les artefacts sont construits une fois à partir du tag, donc tu livres les fichiers que tu as testés, et un rollback consiste à redéployer la version précédente.'
		],
		cost: [
			'Le semver demande une API publique claire : sans elle, personne ne s’accorde sur MINOR ou MAJOR.',
			'Quelqu’un doit écrire le changelog à la main. Un copier-coller de `git log` va vite, mais il liste des commits au lieu des changements utiles aux utilisateurs.',
			'Tu ne déplaces jamais un tag publié : après un retag, deux personnes peuvent avoir chacune un build « v1.4.2 » différent. Une release ratée coûte donc un nouveau numéro de version.'
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
		],
		steps: [
			{
				title: 'Trie les changements',
				questions: [
					{ q: 'Pour un CLI, qu’est-ce qui compte comme API publique ?', options: ['L’organisation du code source', 'Ses options', 'Le changelog', 'L’historique Git'], answer: 1, why: 'Les scripts appellent le CLI par ses options. Les changer, c’est changer ce dont les utilisateurs dépendent.' },
					{ q: 'Le correctif de la rotation des logs, tout seul, ferait monter quelle partie ?', options: ['PATCH', 'MINOR', 'MAJOR', 'Aucune : un correctif n’a pas besoin de nouvelle version'], answer: 0, why: 'PATCH est fait pour les corrections de bugs rétrocompatibles.' },
					{ q: 'La nouvelle option `--dry-run`, toute seule, ferait monter quelle partie ?', options: ['PATCH', 'MAJOR', 'Aucune : les options facultatives ne comptent pas', 'MINOR'], answer: 3, why: 'Une nouvelle fonctionnalité rétrocompatible fait monter MINOR.' },
					{ q: 'Pourquoi la suppression de `--force` est-elle différente des deux autres ?', options: ['C’est le plus gros changement de code', 'Elle était dépréciée, donc elle ne compte pas', 'Elle casse les scripts qui l’utilisent encore', 'Elle demande un nouveau fichier de changelog'], answer: 2, why: 'Supprimer une option est un changement incompatible de l’API publique. C’est à ça que sert MAJOR.' }
				]
			},
			{
				title: 'Choisis la version',
				questions: [
					{ q: 'Quelle est la version suivante après 1.4.2 ?', options: ['1.4.3', '1.5.0', '2.0.0', '2.5.3'], answer: 2, why: 'Le plus gros saut l’emporte. Un seul changement incompatible donne MAJOR, et MINOR et PATCH repassent à 0.' },
					{ q: 'Que dit 2.0.0 aux utilisateurs, avec le seul numéro ?', options: ['Quelque chose est incompatible : lis le changelog avant de mettre à jour', 'Seulement des correctifs, mise à jour sans risque', 'De nouvelles fonctionnalités, rien ne casse', 'Rien : un numéro de version n’a pas de sens'], answer: 0, why: 'Avec le semver, seul un saut de MAJOR peut casser les utilisateurs.' },
					{ q: 'Si tu avais seulement ajouté `--dry-run`, quelle version viendrait ensuite ?', options: ['1.4.3', '2.0.0', '1.4.2-1', '1.5.0'], answer: 3, why: 'Une nouvelle fonctionnalité rétrocompatible fait monter MINOR et remet PATCH à zéro.' },
					{ q: 'Qu’est-ce qui rend difficile le choix entre MINOR et MAJOR sur certains projets ?', options: ['Utiliser des tags annotés', 'Pas d’API publique claire, donc personne ne s’accorde sur ce qui casse', 'Pousser les tags par leur nom', 'Un long changelog'], answer: 1, why: 'Le semver demande une API publique claire. Sans elle, le numéro devient une affaire d’opinion.' }
				]
			},
			{
				title: 'Écris le changelog',
				questions: [
					{ q: 'Quel titre ouvre la nouvelle entrée de `CHANGELOG.md` ?', options: ['`## [2.0.0] - 2026-10-16`', '`## Derniers changements`', '`## v1.4.2`', '`## Unreleased`, inchangé'], answer: 0, why: 'Tu déplaces les entrées de Unreleased sous un titre avec la version et la date.' },
					{ q: 'Dans quel groupe va `--force` ?', options: ['`### Fixed`', '`### Added`', '`### Removed`', '`### Changed`'], answer: 2, why: 'L’option a disparu, donc elle va sous Removed, là où les utilisateurs cherchent les changements cassants.' },
					{ q: 'Où se place la nouvelle entrée dans le fichier ?', options: ['En bas, la plus ancienne d’abord', 'En haut, la plus récente d’abord', 'Dans un fichier séparé par version', 'Seulement dans le message du tag'], answer: 1, why: 'Un changelog liste les changements notables de chaque version, du plus récent au plus ancien.' },
					{ q: 'Pourquoi ne pas coller `git log` comme notes de release ?', options: ['`git log` ne sait pas afficher les tags', 'C’est trop lent à lancer', 'Les utilisateurs ne lisent pas le Markdown', 'Il liste chaque commit, pas les changements utiles aux utilisateurs'], answer: 3, why: 'Un changelog est écrit pour les gens qui utilisent le logiciel. Un copier-coller du log va vite mais liste des commits.' }
				]
			},
			{
				title: 'Tague et publie',
				questions: [
					{ q: 'Quelle commande tague la release ?', options: ['`git tag v2.0.0`', '`git branch v2.0.0`', '`git tag -a v2.0.0 -m "Release 2.0.0"`', '`git commit -m "v2.0.0"`'], answer: 2, why: 'Un tag annoté enregistre qui, quand et pourquoi. La doc dit que les tags annotés sont faits pour les releases.' },
					{ q: 'Tu as lancé un simple `git push`. Le tag est-il sur GitHub ?', options: ['Non : lance `git push origin v2.0.0`', 'Oui, les tags suivent toujours la branche', 'Oui, si le tag est annoté', 'Seulement une fois la release publiée'], answer: 0, why: '`git push` n’envoie pas les tags par défaut. Tu les pousses par leur nom, ou avec `--follow-tags`.' },
					{ q: 'Qui construit les artefacts de la 2.0.0 ?', options: ['Toi, sur ton portable, avant de taguer', 'Chaque utilisateur, depuis les sources', 'La CI, une fois par cible de déploiement', 'La CI, une seule fois, à partir du commit tagué quand la release est publiée'], answer: 3, why: 'L’événement de release lance un job de CI qui extrait le commit tagué et construit les fichiers une seule fois.' },
					{ q: 'La 2.0.0 s’avère cassée. Que fais-tu ?', options: ['Déplacer le tag `v2.0.0` sur le commit corrigé', 'Sortir une 2.0.1', 'Supprimer la release et réutiliser 2.0.0', 'Pousser le correctif sans tag'], answer: 1, why: 'Ne déplace jamais un tag publié. Deux personnes pourraient alors avoir des builds « 2.0.0 » différents.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Taguer une release, voir la différence entre un tag annoté et un tag léger, et prouver que `git push` laisse les tags derrière lui.',
		steps: [
			'Crée un « remote » local et un dépôt : `mkdir -p ~/tag-lab && cd ~/tag-lab && git init --bare -q remote.git && git init -q -b main cli && cd cli && git remote add origin ../remote.git`.',
			'Commite et tague : `echo v1 > cli.sh && git add . && git commit -qm "First release" && git tag -a v1.4.2 -m "Release 1.4.2" && git tag try-this`. Compare `git cat-file -t v1.4.2` avec `git cat-file -t try-this`, puis lance `git show v1.4.2 --no-patch`.',
			'Commite un correctif après le tag : `echo fix >> cli.sh && git commit -qam "Fix log rotation"`. Lance `git describe` et `git log --oneline`.',
			'Pousse seulement la branche, puis le tag : `git push -q origin main && git ls-remote --tags origin`, puis `git push -q origin v1.4.2 && git ls-remote --tags origin`.',
			'Tague la release suivante et pousse les deux d’un coup : `git tag -a v2.0.0 -m "Release 2.0.0" && git push -q --follow-tags origin main && git ls-remote --tags origin`.'
		],
		done: [
			'`git cat-file -t v1.4.2` affiche `tag` et `git cat-file -t try-this` affiche `commit`.',
			'`git show v1.4.2 --no-patch` montre une ligne `Tagger:`, une date et `Release 1.4.2`.',
			'À l’étape 3, `git describe` affiche `v1.4.2-1-g` suivi d’un hash court.',
			'À l’étape 4, le premier `git ls-remote --tags origin` n’affiche rien ; le second liste `refs/tags/v1.4.2`.',
			'À l’étape 5, `git ls-remote --tags origin` liste aussi `refs/tags/v2.0.0`.'
		],
		solution: [
			'Un tag annoté est un objet à part, avec auteur, date et message. Un tag léger n’est qu’un nom pour un commit.',
			'`v1.4.2-1-g…` veut dire un commit après `v1.4.2` : le tag est resté en place pendant que `main` avançait.',
			'`git push origin main` n’envoie aucun tag. Pousse-le par son nom, ou utilise `--follow-tags` pour les tags annotés des commits que tu pousses.'
		]
	},
	recall: {
		q: 'Ton CLI en 1.4.2 supprime l’option `--force`. Quelle est la version suivante, et quelles commandes la taguent et la publient ?',
		a: '2.0.0, parce que supprimer une option casse les scripts qui l’utilisent. `git tag -a v2.0.0 -m "Release 2.0.0"`, puis `git push origin v2.0.0`, car un simple `git push` n’envoie aucun tag.'
	},
	sources: [
		{ title: 'Doc Git, git-tag', url: 'https://git-scm.com/docs/git-tag' },
		{ title: 'Pro Git, Tagging', url: 'https://git-scm.com/book/en/v2/Git-Basics-Tagging' },
		{ title: 'Semantic Versioning 2.0.0', url: 'https://semver.org/' },
		{ title: 'Keep a Changelog 1.1.0', url: 'https://keepachangelog.com/en/1.1.0/' },
		{ title: 'GitHub Docs, About releases', url: 'https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases' }
	]
};
