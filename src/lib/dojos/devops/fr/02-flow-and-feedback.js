const STARTER = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'flow-and-feedback',
	part: 'L’état d’esprit DevOps',
	title: 'Petits lots, feedback rapide',
	minutes: 10,
	hook: [
		'Fenêtre de maintenance mensuelle, samedi soir. Tu appliques trente changements d’un coup : une mise à jour du noyau, une nouvelle config nginx, deux releases de l’appli, une règle de pare-feu. Dimanche matin, **la latence a doublé**.',
		'Lequel des trente ? Tu n’en sais rien. Tu fais un rollback de tout, tu perds le travail du mois, et la fenêtre suivante est encore plus grosse.',
		'Imagine maintenant un changement à la fois, chacun vérifié en quelques minutes. Quand la latence double, **tu sais exactement quel changement regarder**.'
	],
	terms: [
		{ term: 'Chaîne de valeur', def: 'Toutes les étapes que traverse un changement, de l’idée jusqu’à la prod, devant les utilisateurs.' },
		{ term: 'Les Three Ways', def: 'Les trois principes de Gene Kim derrière DevOps : le flux, le feedback, et l’expérimentation et l’apprentissage continus.' },
		{ term: 'Taille de lot', def: 'La quantité de changements que tu livres d’un coup. Un commit, c’est un petit lot. Une release trimestrielle, un lot énorme.' },
		{ term: 'Travail en cours (WIP)', def: 'Le travail que quelqu’un a commencé sans le finir. Une limite de WIP plafonne le nombre d’éléments dans une même étape au même moment.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'idea["Idée"] --> build["Développement"]',
					'build --> test["Tests"]',
					'test --> prod["Exploitation en prod"]',
					'prod --> users["Utilisateurs"]',
					'class users ext'
				],
				highlight: ['idea', 'build', 'test', 'prod'],
				note: 'La First Way, c’est le flux : tu regardes toute la chaîne de valeur, de gauche à droite, à travers toutes les équipes. Gagner du temps en dev ne sert à rien si le travail attend ensuite deux semaines aux tests. Un défaut connu reste dans l’étape où on l’a trouvé.'
			},
			{
				add: [
					'prod -.->|"alertes, logs"| build',
					'users -.->|"plaintes, usage"| idea'
				],
				highlight: ['prod', 'users'],
				note: 'La Second Way, c’est le feedback : alertes, logs et plaintes reviennent de droite à gauche, vers ceux qui peuvent agir. Tu rends chaque boucle **plus courte et plus difficile à rater**, pour qu’ils corrigent une erreur tant qu’elle est petite.'
			},
			{
				add: [
					'ci["CI : lint et tests à chaque push"]',
					'build -->|"minutes"| ci',
					'ci -.->|"rouge ou vert"| build'
				],
				highlight: ['ci'],
				note: 'La CI vérifie chaque push automatiquement, et l’auteur voit rouge ou vert en quelques minutes, quand il a encore le changement en tête. Sans une vérification aussi bon marché, trente petits changements demandent trente vérifications à la main.'
			},
			{
				add: ['wip["Limite de WIP : 3 cartes max en dev"]', 'wip -.-> build'],
				highlight: ['wip'],
				note: 'Avec une limite de 3 cartes, personne ne jongle avec dix tâches à moitié faites en dev. Le conseil de DORA : quand tu atteins la limite et que quelqu’un n’a rien à faire, **garde la limite**. Cette personne aide à débloquer l’étape coincée.'
			},
			{
				add: ['learn["Apprendre et s’entraîner"]', 'prod -.->|"postmortem"| learn', 'learn --> idea'],
				highlight: ['learn'],
				note: 'La Third Way, c’est l’expérimentation et l’apprentissage : l’équipe prend des risques, tire les leçons de ses échecs en postmortem, et s’entraîne jusqu’à ce qu’une tâche soit routinière. Elle met dans son planning du temps pour améliorer le travail quotidien, pour ne pas attendre « plus tard ».'
			}
		]
	},
	example: {
		title: 'ci/python-app.yml',
		repo: 'actions/starter-workflows',
		url: `${STARTER}/ci/python-app.yml#L6-L39`,
		lang: 'yaml',
		code: `on:
  push:
    branches: [ $default-branch ]
  pull_request:
    branches: [ $default-branch ]
…
    - name: Lint with flake8
      run: |
        # stop the build if there are Python syntax errors or undefined names
        flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
        # exit-zero treats all errors as warnings. The GitHub editor is 127 chars wide
        flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics
    - name: Test with pytest
      run: |
        pytest`,
		notes: [
			'Lignes 1 à 5 : le workflow tourne à **chaque push et chaque pull request** sur la branche par défaut. `$default-branch` est un placeholder de modèle : GitHub le remplace par le nom de la branche par défaut de ton dépôt quand tu crées le workflow ([doc](https://docs.github.com/en/actions/how-tos/reuse-automations/create-workflow-templates)). Tu apprendras GitHub Actions dans la partie 5.',
			'Ligne 10 : le premier appel à `flake8` ne sélectionne que quelques codes graves : `E9` (des erreurs comme un fichier qui ne se parse même pas) et des codes `F` comme `F82` (noms non définis). Ceux-là font échouer le job. Ces vérifications coûtent peu, donc les erreurs les plus courantes reviennent en quelques secondes.',
			'La ligne 12 ajoute `--exit-zero` : flake8 sort alors avec le code 0 même s’il trouve des problèmes ([options flake8](https://flake8.pycqa.org/en/latest/user/options.html)). Les soucis de style apparaissent dans le log sans jamais faire échouer le job. L’équipe a choisi **quelles vérifications bloquent un merge et lesquelles se contentent de signaler**.',
			'Les lignes 13 à 15 lancent `pytest` après le lint. Par défaut, un step ne tourne que si tous les précédents ont réussi ([fonctions de statut](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)), donc un lint en échec saute `pytest`. L’auteur voit l’échec du lint en quelques secondes, sans attendre toute la suite de tests.'
		]
	},
	tradeoff: {
		gain: [
			'Quand quelque chose casse, tu sais quel petit changement regarder, et un rollback d’un seul changement fait perdre peu.',
			'Le feedback arrive pendant que le changement est encore frais dans la tête de son auteur.',
			'Avec une limite de WIP, le travail commencé se termine, et une étape bloquée se voit à sa colonne pleine au lieu de se cacher derrière des gens occupés.'
		],
		cost: [
			'Les petits lots demandent des vérifications et des déploiements peu coûteux. Sans automatisation, livrer trente fois coûte trente fois l’effort manuel.',
			'Les fonctionnalités pas finies doivent partir cachées (feature flags, dark launches), ce qui fait du travail et des chemins de code en plus.',
			'Une limite de WIP laisse parfois des gens sans rien à commencer, et l’équipe doit accepter ce temps mort.'
		]
	},
	task: {
		prompt: 'Reprends la fenêtre de maintenance mensuelle du début : trente changements, appliqués ensemble le samedi soir, la latence a doublé et personne ne sait pourquoi. Repense-la avec les Three Ways. Donne au moins un changement concret pour le flux, un pour le feedback et un pour l’apprentissage.',
		hint: 'Pose trois questions. Comment chaque changement peut-il voyager seul ? Au bout de combien de temps saurais-tu qu’il a dégradé la latence ? Que fera l’équipe différemment le mois prochain ?',
		answer: [
			'Flux : arrête de grouper. Applique chaque changement seul (la mise à jour du noyau, puis la config nginx, puis chaque release), idéalement au rythme de petits changements quotidiens ou hebdomadaires au lieu d’une grosse fenêtre.',
			'Feedback : après chaque changement, vérifie quelques chiffres clés (latence, taux d’erreur) avant le suivant. Automatise ces vérifications pour avoir la réponse en quelques minutes. Teste les changements de config en CI avant qu’ils n’arrivent sur un serveur.',
			'WIP : ne commence pas le changement suivant tant que le précédent n’est pas vérifié et terminé.',
			'Apprentissage : fais une courte revue sans reproche de l’incident du samedi. Elle se termine par un changement de processus, par exemple « chaque changement a une étape de rollback écrite avant d’être appliqué ». Elle ne désigne aucun coupable.'
		]
	},
	quiz: [
		{
			q: 'Dans les Three Ways de Gene Kim, de quoi parle la Second Way ?',
			options: [
				'Faire circuler le travail de gauche à droite dans tout le système',
				'Raccourcir et amplifier les boucles de feedback, de droite à gauche',
				'Une culture d’expérimentation et d’apprentissage continus',
				'Automatiser tous les serveurs avec de la gestion de configuration'
			],
			answer: 1,
			why: 'First Way : le flux, de gauche à droite. Second Way : les boucles de feedback de droite à gauche, plus courtes et plus difficiles à rater. Third Way : l’expérimentation et l’apprentissage.'
		},
		{
			q: 'Pourquoi livrer par petits lots rend-il les pannes plus faciles à corriger ?',
			options: [
				'Moins de changements partent ensemble, donc tu sais lequel regarder et tu peux faire un rollback de lui seul',
				'Les petits lots ne provoquent jamais de panne, car chaque changement est trop petit pour casser',
				'Les petits lots peuvent sauter la longue suite de tests, donc le correctif arrive plus vite',
				'Les petits lots demandent moins de serveurs, donc une panne a moins d’endroits où se cacher'
			],
			answer: 0,
			why: 'Avec un changement par déploiement, un incident n’a qu’un suspect, et tu ne fais le rollback que de ce changement. Avec trente changements par déploiement, tu as trente suspects.'
		},
		{
			q: 'Ton équipe a atteint sa limite de WIP dans la colonne « En cours » et deux personnes n’ont rien à prendre. Que recommande DORA ?',
			options: [
				'Augmenter la limite de WIP pour qu’elles puissent commencer autre chose',
				'Donner deux tâches en parallèle à chaque personne libre',
				'Garder la limite et les faire aider à débloquer la partie coincée de la chaîne de valeur',
				'Suivre leur nouveau travail dans une colonne séparée et cachée pour que la limite tienne'
			],
			answer: 2,
			why: 'La limite montre où le travail est bloqué. L’augmenter, éparpiller les gens ou cacher le travail masque à nouveau cette étape bloquée.'
		}
	],
	recall: {
		q: 'Quelles sont les Three Ways de Gene Kim, et que conseille DORA quand une équipe atteint sa limite de WIP ?',
		a: 'Le flux (de gauche à droite), le feedback (de droite à gauche), puis l’expérimentation et l’apprentissage. Garder la limite et faire aider les personnes libres à débloquer l’étape coincée.'
	},
	sources: [
		{ title: 'Gene Kim, The Three Ways: The Principles Underpinning DevOps', url: 'https://itrevolution.com/articles/the-three-ways-principles-underpinning-devops/' },
		{ title: 'DORA, Working in small batches', url: 'https://dora.dev/capabilities/working-in-small-batches/' },
		{ title: 'DORA, Work in process limits', url: 'https://dora.dev/capabilities/wip-limits/' },
		{ title: 'Doc GitHub, Building and testing Python', url: 'https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-python' },
		{ title: 'actions/starter-workflows, python-app.yml', url: `${STARTER}/ci/python-app.yml` }
	]
};
