const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'branching-strategies',
	part: 'Git',
	title: 'Trunk-based development ou GitFlow',
	minutes: 10,
	hook: [
		'Dans une ancienne boîte, une release, c’était un week-end. Trois mois de travail sur une branche `develop`. Puis un gel du code, un gros merge, et une semaine à réparer ce que le merge avait cassé.',
		'Une **stratégie de branches**, c’est la règle d’équipe : quelles branches existent, combien de temps elles vivent, et comment le code arrive en production. Git s’en fiche. Ton équipe, non.',
		'Deux réponses connues. **GitFlow** : plusieurs branches longues et des releases planifiées. **Trunk-based development** : une seule branche principale, et tout le monde merge dedans au moins une fois par jour. La recherche DORA relie la deuxième à une meilleure livraison.'
	],
	terms: [
		{ term: 'Trunk', def: 'La branche partagée unique dans laquelle tout le monde merge, en général `main`.' },
		{ term: 'Trunk-based development', def: 'De petits changements mergés dans le trunk au moins une fois par jour, via des branches courtes ou directement sur le trunk.' },
		{ term: 'Branche courte', def: 'Une branche qui vit quelques heures, un ou deux jours au maximum, puis est mergée et supprimée.' },
		{ term: 'GitFlow', def: 'Un modèle de 2010 avec deux branches permanentes, `master` (souvent renommée `main` aujourd’hui) et `develop`, plus des branches feature, release et hotfix.' },
		{ term: 'Feature flag', def: 'Un interrupteur dans le code qui active ou désactive une fonctionnalité sans déploiement. Un release toggle cache le travail pas fini.' },
		{ term: 'Gel du code', def: 'Une période où personne n’a le droit de merger, pour stabiliser la release. Le signe de branches qui vivent trop longtemps.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'subgraph gf["GitFlow"]',
					'gfeat["feature/x"] --> gdev["develop"]',
					'gdev --> grel["release/1.2"] --> gmain["main : production"]',
					'ghot["hotfix/1.2.1"] --> gmain',
					'end'
				],
				highlight: ['gdev', 'gmain'],
				note: 'Avec GitFlow, les features sont mergées dans `develop`. Une branche release part de `develop`, est stabilisée, puis mergée dans `main`. Les hotfix partent de `main`. `develop` et `main` vivent **pour toujours**, et chaque release est un événement.'
			},
			{
				add: [
					'subgraph tb["Trunk-based"]',
					'tb1["branche courte, moins d’un jour"] -->|"PR et CI"| trunk["main, le trunk"]',
					'tb2["une autre branche courte"] -->|"PR et CI"| trunk',
					'end'
				],
				highlight: ['tb1', 'tb2', 'trunk'],
				note: 'En trunk-based development, il y a **une seule** branche longue. Chaque changement est petit, relu, testé par la CI et mergé le jour même. Les conflits restent petits parce que personne ne s’éloigne beaucoup.'
			},
			{
				add: [
					'trunk -->|"tout commit vert"| prod["production"]',
					'flag["feature flag : off"] -.-> prod'
				],
				highlight: ['prod', 'flag'],
				note: 'Le trunk est toujours livrable. Une fonctionnalité qui prend trois semaines est quand même mergée chaque jour, cachée derrière un **feature flag** qui reste sur off jusqu’à ce qu’elle soit finie.'
			}
		]
	},
	example: {
		title: 'ci/go.yml',
		repo: 'actions/starter-workflows',
		url: `${SW}/ci/go.yml#L4-L28`,
		lang: 'yaml',
		code: `name: Go

on:
  push:
    branches: [ $default-branch ]
  pull_request:
    branches: [ $default-branch ]

jobs:

  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Set up Go
      uses: actions/setup-go@v4
      with:
        go-version: '1.20'

    - name: Build
      run: go build -v ./...

    - name: Test
      run: go test -v ./...`,
		notes: [
			'C’est la CI de démarrage de GitHub pour Go. Elle surveille **une seule** branche, la branche par défaut. C’est la forme trunk-based : un trunk, des branches courtes qui y mènent.',
			'`pull_request` lance les tests sur chaque pull request vers le trunk, avant le merge. `push` les relance sur le trunk après le merge. Le trunk doit rester vert, parce que tout le monde construit dessus chaque jour.',
			'`$default-branch` est un placeholder du template. Le [README de starter-workflows](https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7/README.md#L68) dit que GitHub le remplace par la branche par défaut de ton dépôt, comme `main`.',
			'Avec GitFlow, il faudrait aussi lister `develop` et les branches release, et les garder toutes vertes. Plus de branches, plus de pipelines à surveiller.'
		]
	},
	tradeoff: {
		gain: [
			'De petits merges quotidiens : les conflits sont petits, et tu les trouves le jour même.',
			'Pas de gel du code ni de phase d’intégration. La recherche DORA relie l’abandon des deux à une meilleure livraison.',
			'Le trunk est toujours livrable, donc un déploiement est un jour normal, pas un week-end.'
		],
		cost: [
			'Il faut des tests automatiques rapides et fiables. Un trunk cassé bloque tout le monde.',
			'Les feature flags ajoutent des chemins de code à tester, et chacun doit être retiré plus tard. Fowler les décrit comme un stock qui a un coût de possession.',
			'Si tu dois maintenir plusieurs versions publiées en même temps, il te faut quand même des branches release. L’auteur de GitFlow dit qu’il est fait pour ce cas.'
		]
	},
	task: {
		prompt: 'Ton équipe : 6 devs, une appli web. Une release tous les deux mois depuis `develop` via une branche `release/*`, avec une semaine de gel du code. Une fonctionnalité (une nouvelle page de facturation) va prendre trois semaines. Prévois le passage au trunk-based development en 4 étapes.',
		hint: 'Une seule branche longue. De petits merges chaque jour. Le travail pas fini est mergé mais désactivé. Mesure.',
		answer: [
			'Fais de `main` le trunk. Merge `develop` dedans une dernière fois, puis supprime `develop`.',
			'Nouvelle règle : les branches vivent moins d’un jour et sont mergées via une pull request avec la CI verte. La consigne DORA : merger dans le trunk au moins une fois par jour.',
			'Page de facturation : merge-la par petits morceaux derrière un feature flag sur off. Active-le quand elle est finie, puis **supprime le flag**.',
			'Déploie depuis `main`, sans gel. Garde une branche release seulement si tu dois patcher une ancienne version. Suis le nombre de branches actives : DORA dit trois ou moins.'
		]
	},
	quiz: [
		{
			q: 'Que demande le trunk-based development à chaque développeur ?',
			options: [
				'Garder une branche perso pour chaque release',
				'Pousser directement en production sans relecture ni tests',
				'Merger de petits changements dans le trunk partagé au moins une fois par jour',
				'Travailler sur `develop` et merger dans `main` une fois par release'
			],
			answer: 2,
			why: 'Une seule branche longue, de petits changements, mergés chaque jour. La relecture et la CI sont toujours là, simplement rapides et fréquentes.'
		},
		{
			q: 'Du code pas fini est mergé dans `main`, mais les utilisateurs ne doivent pas encore le voir. Qu’est-ce qui le cache ?',
			options: [
				'Une branche feature qui vit longtemps',
				'Un feature flag sur off',
				'Un gel du code',
				'Un tag léger'
			],
			answer: 1,
			why: 'Un release toggle permet d’envoyer du code incomplet en production sous forme de code dormant. La branche reste courte, et le flag décide de ce que voient les utilisateurs.'
		},
		{
			q: 'Dans sa note de 2020, dans quel cas l’auteur de GitFlow dit-il qu’il reste adapté ?',
			options: [
				'Un logiciel versionné explicitement, ou avec plusieurs versions maintenues dans la nature',
				'Une appli web déployée plusieurs fois par jour, où chaque release a sa propre branche',
				'Toute équipe qui héberge son code sur GitHub et relit les changements en pull request',
				'Une équipe sans tests automatiques, qui a besoin de longues phases de release manuelles'
			],
			answer: 0,
			why: 'Pour les applis web en livraison continue, il conseille un flow plus simple. GitFlow est pour les logiciels versionnés explicitement, ou quand tu maintiens plusieurs versions à la fois.'
		}
	],
	takeaway: 'Garde un seul trunk, merge de petits changements dedans chaque jour, et cache le travail pas fini derrière des feature flags. Les branches longues n’ont leur place que si tu livres vraiment plusieurs versions.',
	sources: [
		{ title: 'DORA, Trunk-based development', url: 'https://dora.dev/capabilities/trunk-based-development/' },
		{ title: 'trunkbaseddevelopment.com', url: 'https://trunkbaseddevelopment.com/' },
		{ title: 'Vincent Driessen, A successful Git branching model (avec la note de 2020)', url: 'https://nvie.com/posts/a-successful-git-branching-model/' },
		{ title: 'Martin Fowler, Feature Toggles', url: 'https://martinfowler.com/articles/feature-toggles.html' },
		{ title: 'Martin Fowler, Patterns for Managing Source Code Branches', url: 'https://martinfowler.com/articles/branching-patterns.html' }
	]
};
