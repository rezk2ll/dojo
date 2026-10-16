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
		'Imagine maintenant un changement à la fois, chacun vérifié en quelques minutes. Quand la latence double, **tu sais exactement quel changement regarder**. C’est toute l’idée du jour : les petits lots et le feedback rapide.'
	],
	terms: [
		{ term: 'Chaîne de valeur', def: 'Toutes les étapes que traverse un changement, de l’idée jusqu’à la prod, devant les utilisateurs.' },
		{ term: 'Les Three Ways', def: 'Les trois principes de Gene Kim derrière DevOps : le flux, le feedback, et l’expérimentation et l’apprentissage continus.' },
		{ term: 'Taille de lot', def: 'La quantité de changements que tu livres d’un coup. Un commit, c’est un petit lot. Une release trimestrielle, un lot énorme.' },
		{ term: 'Boucle de feedback', def: 'Le chemin que prend l’information pour revenir à ceux qui ont fait un changement : un test qui échoue, une alerte, une plainte d’utilisateur. Plus elle est courte, mieux c’est.' },
		{ term: 'Travail en cours (WIP)', def: 'Le travail commencé mais pas fini. Une limite de WIP plafonne le nombre d’éléments dans une même étape au même moment.' }
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
				note: '**La First Way : le flux.** Regarde toute la chaîne de valeur, de gauche à droite, pas une seule équipe. Une étape de dev rapide ne sert à rien si le travail attend ensuite deux semaines aux tests. Ne jamais passer un défaut connu à l’étape suivante.'
			},
			{
				add: [
					'prod -.->|"alertes, logs"| build',
					'users -.->|"plaintes, usage"| idea'
				],
				highlight: ['prod', 'users'],
				note: '**La Second Way : le feedback.** L’information circule de droite à gauche, vers ceux qui peuvent agir. Le but est de rendre ces boucles **plus courtes et plus audibles**, pour corriger les erreurs tant qu’elles sont petites.'
			},
			{
				add: [
					'ci["CI : lint et tests à chaque push"]',
					'build -->|"minutes"| ci',
					'ci -.->|"rouge ou vert"| build'
				],
				highlight: ['ci'],
				note: 'La boucle la plus courte que tu puisses construire. Chaque petit changement est vérifié automatiquement et la réponse revient en quelques minutes, pas en fin de mois. Les petits lots ne marchent que si les vérifier coûte peu.'
			},
			{
				add: ['wip["Limite de WIP : 3 cartes max en dev"]', 'wip -.-> build'],
				highlight: ['wip'],
				note: 'Commencer moins, finir plus. Une limite de WIP empêche de jongler avec dix tâches à moitié faites. Le conseil de DORA : quand tu atteins la limite et que quelqu’un n’a rien à faire, **n’augmente pas la limite**. Aide à débloquer l’étape coincée.'
			},
			{
				add: ['learn["Apprendre et s’entraîner"]', 'prod -.->|"postmortem"| learn', 'learn --> idea'],
				highlight: ['learn'],
				note: '**La Third Way : expérimentation et apprentissage.** Prendre des risques, apprendre des échecs, et répéter jusqu’à ce que ce soit la routine. Le temps pour améliorer le travail quotidien est planifié, pas laissé pour « plus tard ».'
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
			'Le workflow tourne à **chaque push et chaque pull request** sur la branche par défaut. `$default-branch` est un placeholder de modèle : GitHub le remplace par le nom de la branche par défaut de ton dépôt quand tu crées le workflow ([doc](https://docs.github.com/en/actions/how-tos/reuse-automations/create-workflow-templates)). Tu apprendras GitHub Actions dans la partie 5.',
			'Le premier appel à `flake8` ne sélectionne que quelques codes graves : `E9` (des erreurs comme un fichier qui ne se parse même pas) et des codes `F` comme `F82` (noms non définis). Ceux-là font échouer le job. Les vérifications peu coûteuses d’abord, pour que les erreurs les plus courantes reviennent en quelques secondes.',
			'Le second appel ajoute `--exit-zero` : flake8 sort alors avec le code 0 même s’il trouve des problèmes ([options flake8](https://flake8.pycqa.org/en/latest/user/options.html)). Les soucis de style sont signalés, mais n’arrêtent jamais la chaîne. Choisir **quel feedback bloque et lequel informe seulement** est une décision de conception.',
			'Les steps tournent dans l’ordre. Par défaut, un step ne tourne que si tous les précédents ont réussi ([fonctions de statut](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)), donc un lint cassé saute `pytest`. Tu obtiens le premier échec vite au lieu de tous les échecs lentement.'
		]
	},
	tradeoff: {
		gain: [
			'Quand quelque chose casse, tu sais quel petit changement regarder, et un rollback d’un seul changement fait perdre peu.',
			'Le feedback arrive pendant que le changement est encore frais dans la tête de son auteur.',
			'Moins de WIP, c’est du travail qui se termine vraiment, et des blocages visibles au lieu d’être cachés derrière des gens occupés.'
		],
		cost: [
			'Les petits lots demandent des vérifications et des déploiements peu coûteux. Sans automatisation, livrer trente fois coûte trente fois l’effort manuel.',
			'Les fonctionnalités pas finies doivent partir cachées (feature flags, dark launches), ce qui fait du travail et des chemins de code en plus.',
			'Les limites de WIP laissent parfois des gens attendre. Ça paraît du gâchis même quand c’est le bon choix.'
		]
	},
	task: {
		prompt: 'Reprends la fenêtre de maintenance mensuelle du début : trente changements, appliqués ensemble le samedi soir, la latence a doublé et personne ne sait pourquoi. Repense-la avec les Three Ways. Donne au moins un changement concret pour le flux, un pour le feedback et un pour l’apprentissage.',
		hint: 'Pose trois questions. Comment chaque changement peut-il voyager seul ? Au bout de combien de temps saurais-tu qu’il a dégradé la latence ? Que fera l’équipe différemment le mois prochain ?',
		answer: [
			'**Flux :** arrête de grouper. Applique chaque changement seul (la mise à jour du noyau, puis la config nginx, puis chaque release), idéalement au rythme de petits changements quotidiens ou hebdomadaires au lieu d’une grosse fenêtre.',
			'**Feedback :** après chaque changement, vérifie quelques chiffres clés (latence, taux d’erreur) avant le suivant. Automatise ces vérifications pour avoir la réponse en quelques minutes. Teste les changements de config en CI avant qu’ils n’arrivent sur un serveur.',
			'**WIP :** ne commence pas le changement suivant tant que le précédent n’est pas vérifié et terminé.',
			'**Apprentissage :** fais une courte revue sans reproche de l’incident du samedi. Le résultat est un changement de processus (par exemple « chaque changement a une étape de rollback écrite avant d’être appliqué »), pas une personne à blâmer.'
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
			why: 'First Way : le flux. Second Way : les boucles de feedback, plus courtes et plus audibles. Third Way : l’expérimentation et l’apprentissage.'
		},
		{
			q: 'Pourquoi livrer par petits lots rend-il les pannes plus faciles à corriger ?',
			options: [
				'Moins de changements partent en même temps, donc tu sais quel changement regarder et tu peux faire un rollback de celui-là seulement',
				'Les petits lots ne provoquent jamais de panne',
				'Les petits lots peuvent sauter les tests',
				'Les petits lots demandent moins de serveurs'
			],
			answer: 0,
			why: 'Un changement par déploiement, c’est un suspect par incident. Trente changements par déploiement, trente suspects.'
		},
		{
			q: 'Ton équipe a atteint sa limite de WIP dans la colonne « En cours » et deux personnes n’ont rien à prendre. Que recommande DORA ?',
			options: [
				'Augmenter la limite de WIP pour qu’elles puissent commencer autre chose',
				'Donner deux tâches en parallèle à chaque personne libre',
				'Garder la limite et les faire aider à débloquer la partie coincée de la chaîne de valeur',
				'Suivre leur nouveau travail dans une colonne séparée et cachée'
			],
			answer: 2,
			why: 'La limite sert à révéler les goulots d’étranglement. L’augmenter, éparpiller les gens ou cacher le travail enterre le problème qu’elle venait de montrer.'
		}
	],
	takeaway: 'Livre moins à la fois et apprends plus tôt. Le flux de gauche à droite, le feedback de droite à gauche, et du temps réservé pour apprendre des deux.',
	sources: [
		{ title: 'Gene Kim, The Three Ways: The Principles Underpinning DevOps', url: 'https://itrevolution.com/articles/the-three-ways-principles-underpinning-devops/' },
		{ title: 'DORA, Working in small batches', url: 'https://dora.dev/capabilities/working-in-small-batches/' },
		{ title: 'DORA, Work in process limits', url: 'https://dora.dev/capabilities/wip-limits/' },
		{ title: 'Doc GitHub, Building and testing Python', url: 'https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-python' },
		{ title: 'actions/starter-workflows, python-app.yml', url: `${STARTER}/ci/python-app.yml` }
	]
};
