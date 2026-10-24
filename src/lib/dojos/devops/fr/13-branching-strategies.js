const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'branching-strategies',
	part: 'Git',
	title: 'Trunk-based development ou GitFlow',
	minutes: 10,
	hook: [
		'Dans une ancienne boîte, une release, c’était un week-end. Trois mois de travail sur une branche `develop`. Puis un gel du code, un gros merge, et une semaine à réparer ce que le merge avait cassé.',
		'Une **stratégie de branches**, c’est la règle d’équipe : quelles branches existent, combien de temps elles vivent, et comment le code arrive en production.',
		'GitFlow utilise plusieurs branches longues et des releases planifiées. En **trunk-based development**, tout le monde merge de petits changements dans une seule branche principale, au moins une fois par jour. La recherche DORA relie le trunk-based development à une meilleure livraison.'
	],
	terms: [
		{ term: 'Trunk', def: 'La branche partagée unique dans laquelle tout le monde merge, en général `main`.' },
		{ term: 'Branche courte', def: 'Une branche qui vit quelques heures, un ou deux jours au maximum, puis est mergée et supprimée.' },
		{ term: 'GitFlow', def: 'Un modèle de 2010 avec deux branches permanentes, `master` (souvent renommée `main` aujourd’hui) et `develop`, plus des branches feature, release et hotfix.' },
		{ term: 'Feature flag', def: 'Un interrupteur dans le code qui active ou désactive une fonctionnalité sans déploiement. Un release toggle cache le travail pas fini.' }
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
				note: 'Avec GitFlow, les features sont mergées dans `develop`. Une branche release part de `develop`, est stabilisée, puis mergée dans `main`. Les hotfix partent de `main`. `develop` et `main` vivent **pour toujours**.'
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
				note: 'Tout commit de `main` avec une CI verte peut partir en production. Une fonctionnalité qui prend trois semaines est quand même mergée chaque jour, cachée derrière un **feature flag** qui reste sur off jusqu’à ce qu’elle soit finie.'
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
			'La CI de démarrage de GitHub pour Go. Les lignes 3 à 7 surveillent **une seule** branche, la branche par défaut, qui sert de trunk en trunk-based development.',
			'La ligne 6 (`pull_request`) lance les tests sur chaque pull request vers le trunk, avant le merge. La ligne 4 (`push`) les relance sur le trunk après le merge. Tout le monde part du trunk chaque jour, donc un trunk rouge les bloque tous.',
			'Lignes 5 et 7 : `$default-branch` est un placeholder du template. Le [README de starter-workflows](https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7/README.md#L68) dit que GitHub le remplace par la branche par défaut de ton dépôt, comme `main`.',
			'Avec GitFlow, les lignes 5 et 7 listeraient aussi `develop` et les branches release, et chacune aurait besoin d’une CI verte.'
		]
	},
	tradeoff: {
		gain: [
			'De petits merges quotidiens : les conflits sont petits, et tu les trouves le jour même.',
			'La recherche DORA relie l’abandon du gel du code et de la phase d’intégration à une meilleure livraison.',
			'Tout commit vert du trunk peut être livré, donc tu déploies n’importe quel jour, sans week-end de release.'
		],
		cost: [
			'Chaque merge repose sur des tests automatiques rapides et fiables, car un trunk cassé bloque tout le monde.',
			'Les feature flags ajoutent des chemins de code à tester. Fowler les décrit comme un stock qui a un coût de possession : chaque flag coûte du travail tant que personne ne le retire.',
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
		],
		steps: [
			{
				title: 'Choisis le trunk',
				questions: [
					{ q: 'Quelle branche devient le trunk ?', options: ['`develop`, puisque toutes les features y sont déjà mergées', '`main`', 'Une nouvelle branche `trunk` à côté de `develop`', 'La branche `release/*` en cours'], answer: 1, why: 'Le trunk est la branche partagée unique dans laquelle tout le monde merge, en général `main`.' },
					{ q: 'Que fais-tu de `develop` ?', options: ['La merger dans `main` une dernière fois, puis la supprimer', 'La garder comme sauvegarde de `main`', 'La renommer en `main` et supprimer l’ancien `main`', 'La geler jusqu’à la fin de la page de facturation'], answer: 0, why: 'Le trunk-based development a **une seule** branche longue. Garder `develop`, c’est en garder deux.' },
					{ q: 'Pourquoi une branche `develop` qui dure fait-elle mal à cette équipe aujourd’hui ?', options: ['GitHub ne peut pas lancer la CI dessus', 'Elle prend plus de disque sur le serveur', 'Le travail dérive pendant des semaines, donc le merge de release est gros et casse des choses', 'Un seul développeur peut pousser dessus'], answer: 2, why: 'Deux mois sur `develop` finissent en gros merge et en jours de réparation. De petits merges quotidiens gardent les conflits petits.' },
					{ q: 'Quelles branches le workflow de CI surveille-t-il après le passage ?', options: ['`develop` et chaque branche `release/*`', 'Chaque branche feature, au push seulement', 'Seulement les branches dont le nom commence par `feature/`', 'Le trunk, au push et sur les pull requests vers lui'], answer: 3, why: 'Le workflow de démarrage surveille une seule branche, la branche par défaut. Avec GitFlow, il listerait aussi `develop` et les branches release.' }
				]
			},
			{
				title: 'Fixe la règle des branches',
				questions: [
					{ q: 'Combien de temps une branche peut-elle vivre avec la nouvelle règle ?', options: ['Jusqu’à ce que la fonctionnalité soit finie', 'Moins d’un jour', 'Un sprint', 'Jusqu’à la prochaine release'], answer: 1, why: 'Une branche courte vit quelques heures, un ou deux jours au maximum, puis est mergée et supprimée.' },
					{ q: 'Les 6 développeurs suivent la consigne DORA. Combien de merges dans `main` une journée de travail normale apporte-t-elle ?', options: ['Un environ, de celui qui finit le premier', 'Un par sprint, pour toute l’équipe', 'Aucun tant que la page de facturation n’est pas finie', 'Au moins six, un ou plus par développeur'], answer: 3, why: 'La consigne DORA est que chaque développeur merge dans le trunk au moins une fois par jour, donc six personnes font au moins six petits merges.' },
					{ q: 'Comment un changement arrive-t-il dans `main` ?', options: ['Par une pull request, avec la CI verte', 'Par un push direct, pour gagner du temps', 'Par `develop`, comme avant', 'Une fois par semaine, en lot'], answer: 0, why: 'La relecture et la CI tournent toujours sur chaque pull request. Trunk-based ne veut pas dire les sauter.' },
					{ q: 'En quoi l’équipe doit-elle avoir confiance avant que les merges quotidiens soient sûrs ?', options: ['Une longue phase de tests manuels', 'Un gel du code chaque semaine', 'Des tests automatiques rapides et fiables', 'Une personne qui valide chaque merge'], answer: 2, why: 'Chaque merge repose sur des tests rapides et fiables, car un trunk cassé bloque tout le monde.' }
				]
			},
			{
				title: 'Livre la facturation éteinte',
				questions: [
					{ q: 'Quel type de feature flag cache la page de facturation à moitié faite ?', options: ['Un flag de permission pour les admins', 'Un release toggle', 'Un coupe-circuit pour les pannes', 'Une règle de protection de branche'], answer: 1, why: 'Un release toggle est le flag qui cache le travail pas fini alors que son code est déjà dans `main`.' },
					{ q: 'La page de facturation est prête. Comment les utilisateurs l’obtiennent-ils ?', options: ['Tu merges `feature/billing` dans `main`', 'Tu crées une branche `release/*` pour elle', 'Tu attends la prochaine release à deux mois', 'Quelqu’un passe le flag sur on, sans nouveau déploiement'], answer: 3, why: 'Un feature flag active ou coupe une fonctionnalité sans déploiement. Le code est déjà en production depuis des semaines.' },
					{ q: 'Six mois plus tard, le flag de facturation est toujours dans le code, toujours sur on. Que coûte-t-il ?', options: ['Du travail : un chemin de code en plus à garder et à tester tant que personne ne le retire', 'Rien, puisqu’il est toujours sur on', 'Un déploiement plus lent, car les flags bloquent la CI', 'Une branche longue, car les flags vivent sur des branches'], answer: 0, why: 'Fowler décrit les flags comme un stock qui a un coût de possession. Chacun coûte du travail tant que personne ne le retire.' },
					{ q: 'Pourquoi ne pas tester seulement le chemin « flag sur on » ?', options: ['Parce que les flags sont retirés avant le déploiement', 'Parce que la CI ne sait pas lire les flags', 'Parce qu’un flag ajoute des chemins de code, et les deux tournent en production', 'Parce que le flag n’existe que sur la branche'], answer: 2, why: 'Les flags ajoutent des chemins de code à tester. Tant que le flag est là, les deux chemins sont réels.' }
				]
			},
			{
				title: 'Déploie et mesure',
				questions: [
					{ q: 'Quel commit peut partir en production ?', options: ['Seulement un commit sur une branche `release/*`', 'Seulement un commit après un gel du code', 'Seulement un commit tagué sur `develop`', 'Tout commit de `main` avec la CI verte'], answer: 3, why: 'En trunk-based development, tout commit vert du trunk peut être livré, donc tu déploies n’importe quel jour.' },
					{ q: 'Que devient la semaine de gel du code ?', options: ['Elle passe à la veille de chaque déploiement', 'Elle disparaît', 'Elle passe à deux semaines par sécurité', 'Elle ne s’applique plus qu’à la page de facturation'], answer: 1, why: 'La recherche DORA relie l’abandon du gel du code et de la phase d’intégration à une meilleure livraison.' },
					{ q: 'Cette équipe a une seule application web, et les utilisateurs ne voient que la version en production. Garde-t-elle des branches `release/*` ?', options: ['Non : il n’y a pas d’ancienne version publiée à patcher', 'Oui, une par déploiement, comme avant', 'Oui, mais seulement pour la page de facturation', 'Seulement tant qu’un feature flag est sur off'], answer: 0, why: 'Les branches release servent à patcher d’anciennes versions encore utilisées. Une application web unique n’a en production que la version de `main`.' },
					{ q: 'Quel chiffre suis-tu pour voir si le passage marche ?', options: ['Le nombre de tags', 'Les lignes de code par développeur', 'Le nombre de branches actives, trois ou moins', 'La durée du gel du code'], answer: 2, why: 'DORA conseille de suivre les branches actives. Trois ou moins veut dire que personne ne s’éloigne trop du trunk.' }
				]
			}
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
			why: 'Chaque changement est petit et mergé le jour même dans l’unique branche longue. La relecture et la CI tournent toujours sur chaque pull request.'
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
	lab: {
		minutes: 15,
		goal: 'Payer une fois le prix d’une branche longue, puis livrer du travail inachevé sur le trunk derrière un flag sur off, et retirer le flag quand c’est fini.',
		steps: [
			'Crée un dépôt où une branche longue réécrit chaque ligne pendant que `main` avance aussi : `mkdir -p ~/branch-lab/long && cd ~/branch-lab/long && git init -q -b main && seq 1 10 > app.txt && git add app.txt && git commit -qm start`, puis `git switch -c feature/billing && seq 1 10 | sed \'s/$/ billing/\' > app.txt && git commit -qam "billing, three weeks"`, puis `git switch main && seq 1 10 | sed \'s/$/ hotfix/\' > app.txt && git commit -qam "fixes on main"`.',
			'Merge-la à la fin, comme en GitFlow : `git merge feature/billing`. Compte les lignes que tu devrais lire pour résoudre le conflit avec `sed -n \'/^<<<<<<</,/^>>>>>>>/p\' app.txt | wc -l`, puis recule avec `git merge --abort`.',
			'Démarre un dépôt trunk-based et une branche courte : `mkdir -p ~/branch-lab/trunk && cd ~/branch-lab/trunk && git init -q -b main && git commit -q --allow-empty -m start && git switch -c billing-flag`. Écris `app.sh` : il affiche `billing v1`, ou `billing v2 (unfinished)` quand `BILLING_V2=on`.',
			'Merge-la le jour même et supprime la branche : `git add app.sh && git commit -qm "billing v2 behind a flag, off" && git switch main && git merge --ff-only billing-flag && git branch -d billing-flag`. Lance `bash app.sh`, puis `BILLING_V2=on bash app.sh`.',
			'La fonctionnalité est finie, donc retire le flag par une autre branche courte : `git switch -c remove-flag`, fais en sorte que `app.sh` affiche seulement `billing v2`, commite, puis `git switch main && git merge --ff-only remove-flag && git branch -d remove-flag`.'
		],
		done: [
			'L’étape 2 compte 23 lignes : les 10 lignes deux fois, plus trois marqueurs.',
			'Depuis le même commit sur `main`, `bash app.sh` affiche `billing v1` et `BILLING_V2=on bash app.sh` affiche `billing v2 (unfinished)`.',
			'Après l’étape 5, `app.sh` n’a plus de `if`, `git branch` ne liste que `main`, et `git log --oneline` montre trois petits commits.'
		],
		solution: [
			'Les deux branches ont modifié les mêmes 10 lignes pendant qu’elles étaient séparées, donc Git ne peut pas choisir un côté. Plus une branche vit longtemps, plus les deux côtés touchent de lignes. Les branches courtes gardent ce nombre proche de zéro.',
			'`app.sh` : `if [ "${BILLING_V2:-off}" = on ]; then echo "billing v2 (unfinished)"; else echo "billing v1"; fi`.',
			'Le code inachevé était sur `main` et pouvait être déployé, mais les utilisateurs auraient vu la v1. C’est le flag qui décidait ce que voient les utilisateurs, pas la branche.',
			'L’étape 5 paie le coût de stockage dont parle Fowler : tant que tu ne le supprimes pas, le flag double les chemins à tester. Nettoie avec `rm -rf ~/branch-lab`.'
		]
	},
	recall: {
		q: 'Une fonctionnalité prend trois semaines. En trunk-based development, comment son code arrive-t-il dans `main` sans que les utilisateurs le voient ?',
		a: 'Tu le merges dans `main` par petits morceaux au moins une fois par jour, derrière un feature flag qui reste sur off jusqu’à la fin. Ensuite tu supprimes le flag.'
	},
	sources: [
		{ title: 'DORA, Trunk-based development', url: 'https://dora.dev/capabilities/trunk-based-development/' },
		{ title: 'trunkbaseddevelopment.com', url: 'https://trunkbaseddevelopment.com/' },
		{ title: 'Vincent Driessen, A successful Git branching model (avec la note de 2020)', url: 'https://nvie.com/posts/a-successful-git-branching-model/' },
		{ title: 'Martin Fowler, Feature Toggles', url: 'https://martinfowler.com/articles/feature-toggles.html' },
		{ title: 'Martin Fowler, Patterns for Managing Source Code Branches', url: 'https://martinfowler.com/articles/branching-patterns.html' }
	]
};
