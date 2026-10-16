const PIR = 'https://www.atlassian.com/blog/how-we-build/post-incident-review-april-2022-outage';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'atlassian-2022',
	part: 'Changements et configuration',
	title: 'Atlassian 2022 : le script qui a supprimé 883 sites',
	minutes: 10,
	hook: [
		'Mardi 5 avril 2022, 07:46 UTC. Un client d’Atlassian Cloud ouvre un ticket de support : ses utilisateurs n’arrivent plus à ouvrir Jira ni Confluence.',
		'La supervision interne n’a déclenché aucune alerte. D’autres clients perdent à leur tour Jira, Confluence, Opsgenie et Statuspage sur leur site.',
		'À 08:17 UTC, Atlassian lance sa procédure d’incident majeur et tu rejoins l’équipe d’incident. Sept minutes plus tard, l’incident passe en Critical.'
	],
	terms: [
		{ term: 'Base multi-tenant', def: 'Une base de données partagée par plusieurs clients. Chaque shard contient les données de plusieurs tenants, isolées les unes des autres.' },
		{ term: 'Soft delete', def: 'Une suppression qui marque seulement les données comme supprimées. On peut les récupérer jusqu’à la fin d’une période de rétention.' },
		{ term: 'RTO', def: 'Recovery time objective : le délai maximal pour restaurer les données et les rendre au client.' },
		{ term: 'RPO', def: 'Recovery point objective : la quantité de données récentes qu’une restauration peut perdre, comptée à rebours depuis la panne.' }
	],
	incident: {
		org: 'Atlassian',
		title: 'Post-Incident Review on the Atlassian April 2022 outage',
		date: '2022-04-05',
		url: PIR,
		steps: [
			{
				situation: [
					'08:17 UTC. Le premier ticket date de 07:46. Sur les sites touchés, Jira, Confluence, Opsgenie et Statuspage ne répondent plus.',
					'La supervision interne ne signale rien.'
				],
				q: 'Que vérifies-tu en premier ?',
				options: [
					'Les scripts et changements qui ont touché ces sites depuis 07:00 UTC',
					'Tu traites ça comme une attaque et coupes d’abord les accès du personnel',
					'Tu attends que la supervision confirme avant de creuser',
					'Tu demandes au client de vider son cache et de se reconnecter'
				],
				answer: 0,
				why: 'À 08:53 UTC, l’équipe a « confirmed that the customer support ticket and the script run were related » (le ticket et l’exécution du script étaient liés). La supervision n’a rien vu parce que « the sites were deleted via a standard workflow ». L’équipe a aussi confirmé qu’il ne s’agissait pas d’une cyberattaque.'
			},
			{
				situation: [
					'08:53 UTC. Un script de maintenance a supprimé 883 sites entre 07:38 et 08:01 UTC. Environ 700 appartiennent à des clients, les autres à Atlassian.',
					'Les sauvegardes permettent de revenir à n’importe quel instant des 30 derniers jours. Chaque base est multi-tenant : elle contient aussi les données vivantes de clients épargnés.',
					'L’équipe a déjà restauré des sites supprimés un par un. Elle n’en a jamais restauré des centaines d’un coup.'
				],
				q: 'Comment lances-tu la restauration ?',
				options: [
					'Tu ramènes chaque base partagée à 07:30 UTC depuis les sauvegardes',
					'Un groupe restaure quelques sites à la main, un autre automatise les étapes',
					'Un ingénieur par site, et les 883 sites restaurés à la main',
					'Tu écris un outil de restauration en masse avant de toucher un site'
				],
				answer: 1,
				why: 'L’équipe s’est divisée en deux : un groupe manuel a restauré un petit nombre de sites, un groupe d’automatisation a scripté les mêmes étapes pour des lots plus gros. Ramener une base partagée en arrière aurait effacé les écritures de tous les clients non touchés.'
			},
			{
				situation: [
					'5 avril, 11:13 UTC. Atlassian a écrit sur Statuspage avoir trouvé la cause. Personne ne sait encore combien de temps durera la restauration.',
					'Le script a aussi effacé l’URL de chaque site et ses contacts System Admin. Le formulaire de support exige une URL Cloud valide : les clients touchés ne peuvent pas ouvrir de ticket.'
				],
				q: 'Que dis-tu aux clients ?',
				options: [
					'Tu publies partout ce que tu sais et ce que tu ne sais pas encore',
					'Tu attends d’avoir une date de retour fiable pour l’annoncer',
					'Tu écris aux contacts de facturation et rien en public',
					'Tu mets à jour seulement les tickets déjà ouverts par les clients'
				],
				answer: 0,
				why: 'Le premier message large d’Atlassian a été un tweet le 7 avril à 00:56 UTC, et beaucoup de contacts de facturation étaient périmés. La revue écrit : « Rather than wait until we had a full picture, we should have been transparent about what we did know and what we didn’t know. »'
			},
			{
				situation: [
					'9 avril. La méthode actuelle crée un nouveau site pour chaque site supprimé, avec un nouveau cloudId. Elle compte environ 70 étapes et prend environ 48 heures par lot.',
					'Beaucoup de systèmes stockent le cloudId dans leurs enregistrements, et il faut remapper les apps tierces site par site. À ce rythme, il faut trois semaines pour tout le monde.'
				],
				q: 'Que changes-tu ?',
				options: [
					'Tu restaures les anciens enregistrements et gardes les anciens identifiants',
					'Tu ajoutes des ingénieurs pour lancer plus de lots de la même méthode',
					'Tu demandes aux éditeurs d’apps de remapper plus vite les identifiants',
					'Tu restaures d’abord les gros sites et laisses les sites gratuits'
				],
				answer: 0,
				why: 'Restoration 2 a recréé les enregistrements supprimés, en commençant par le Catalogue Service, et a réutilisé les anciens identifiants. Cela a « removed over half of the steps » et pris environ 12 heures par site, pour 771 sites du 14 au 17 avril. Mener deux méthodes en parallèle a coûté du travail : scripts à modifier, validation faite deux fois.'
			},
			{
				situation: [
					'18 avril. Tous les sites sont revenus. Le script avait passé une relecture par un pair et un test en staging, et un premier passage en production sur 30 sites s’était bien déroulé.'
				],
				q: 'Que corriges-tu en premier ?',
				options: [
					'Toute suppression de données client passe par un soft delete avec rétention',
					'Un second relecteur sur chaque script de maintenance',
					'Chaque script passe d’abord sur 30 sites avant la liste complète',
					'Une alerte quand plus de 10 sites sont supprimés en une heure'
				],
				answer: 0,
				why: 'Atlassian a « immediately blocked bulk sites deletes », puis a mis le soft delete en tête de ses leçons : « globally prevent the deletion of customer data and metadata that has not gone through a soft-delete process. » La relecture portait sur « which endpoint was being called and how », et le passage sur 30 sites utilisait des identifiants corrects : aucun des deux n’a vérifié ce que désignaient les nouveaux identifiants.'
			}
		],
		outcome: [
			'Le script devait retirer l’ancienne app Insight des sites clients. L’équipe qui l’a demandé a fourni des identifiants de sites au lieu d’identifiants d’app. L’API acceptait les deux et supprimait ce que l’identifiant désignait, sans aucun avertissement.',
			'Le test en staging ne pouvait pas le voir : « the IDs did not exist in the Staging environment ». Le premier passage sur 30 sites utilisait des identifiants récupérés avant le malentendu, donc de vrais identifiants d’app. Une mise à jour d’avril ajoute que le script a aussi tourné « with the wrong execution mode » : suppression définitive au lieu d’un simple marquage.',
			'883 sites de 775 clients sont restés coupés jusqu’à 14 jours. Les premiers sont revenus le 8 avril, les derniers le 18. La perte de données s’arrête à cinq minutes avant la suppression : Atlassian a tenu son RPO d’une heure et manqué son RTO. Pour 57 clients restaurés tôt, certaines bases sont reparties d’un point plus ancien, et ces données ont été récupérées ensuite.',
			'Les correctifs annoncés : soft delete partout, avec déploiement progressif et retour arrière testé. Des restaurations automatisées de nombreux sites à la fois, répétées lors d’exercices de reprise après sinistre. Un playbook pour les gros incidents et un autre pour la communication. Une copie des contacts clés hors du produit, et un accès au support pour les clients sans URL de site valide.'
		]
	},
	quiz: [
		{
			q: 'Le script a passé un test en staging. Pourquoi ce test n’a-t-il pas repéré les mauvais identifiants ?',
			options: [
				'Les identifiants de sites de la liste n’existaient pas en staging',
				'Le staging tournait sur une ancienne version de l’API de suppression',
				'Le test vérifiait seulement la syntaxe du script',
				'L’app Insight n’était pas installée en staging'
			],
			answer: 0,
			why: 'La revue : le test « would not have detected that the IDs input were incorrect as the IDs did not exist in the Staging environment ». Un test qui reçoit des identifiants de production ne trouve rien à supprimer en staging.'
		},
		{
			q: 'Pourquoi Atlassian n’a-t-il pas ramené les bases à 07:37 UTC pour faire revenir les sites ?',
			options: [
				'Les sauvegardes ne gardaient que les dernières 24 heures',
				'Chaque base contient aussi les données vivantes de clients non touchés',
				'La restauration à un instant donné était désactivée en production',
				'Le script avait aussi effacé les sauvegardes de ces sites'
			],
			answer: 1,
			why: 'Chaque base contient les données de plusieurs clients, donc l’équipe a dû « manually extract and restore individual pieces from our backups ». Un retour arrière aurait effacé des heures d’écritures des autres clients des mêmes bases. Les sauvegardes couvraient 30 jours.'
		},
		{
			q: 'Quel correctif empêche une mauvaise liste d’identifiants de détruire des données pour de bon ?',
			options: [
				'Un second relecteur sur chaque script de maintenance',
				'Une alerte quand beaucoup de sites disparaissent en une heure',
				'Un soft delete qui garde les données jusqu’à la fin de la rétention',
				'Un essai de chaque script sur le staging'
			],
			answer: 2,
			why: 'Avec un soft delete, les données restent en production jusqu’à la fin de la rétention : on annule vite une suppression erronée. Un relecteur, une alerte ou un essai en staging peuvent laisser passer une liste d’identifiants valides mais faux, comme la relecture et le test d’avril 2022.'
		}
	],
	recall: {
		q: 'Qu’a fait l’API de suppression des identifiants reçus, et combien de sites a-t-elle supprimés ?',
		a: 'Elle a reçu des identifiants de sites au lieu d’identifiants de l’app Insight et a supprimé chaque site entier : 883 sites de 775 clients, entre 07:38 et 08:01 UTC le 5 avril 2022.'
	},
	sources: [
		{ title: 'Atlassian, Post-Incident Review on the Atlassian April 2022 outage', url: PIR },
		{ title: 'Atlassian, Update on the Atlassian outage affecting some customers (avril 2022)', url: 'https://www.atlassian.com/blog/how-we-build/april-2022-outage-update' }
	]
};
