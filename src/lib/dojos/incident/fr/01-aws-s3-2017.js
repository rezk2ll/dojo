const PM = 'https://aws.amazon.com/message/41926/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'aws-s3-2017',
	part: 'Changements et configuration',
	title: 'AWS S3 2017 : la commande qui a retiré trop de serveurs',
	minutes: 10,
	hook: [
		'Mardi 28 février 2017, Virginie du Nord (US-EAST-1). Tu fais partie de l’équipe Amazon S3. Le système de facturation de S3 avance plus lentement que prévu, et l’équipe cherche pourquoi.',
		'À 9 h 37 (heure du Pacifique), un membre de l’équipe suit un playbook établi et lance une commande. Elle doit sortir quelques serveurs d’un sous-système de S3 qui sert à la facturation.',
		'Puis S3 cesse de répondre dans la région : plus de GET, de LIST, de PUT ni de DELETE. La console S3 tombe, comme le lancement de nouvelles instances EC2 et AWS Lambda.'
	],
	terms: [
		{ term: 'Sous-système d’index', def: 'La partie de S3 qui garde les métadonnées et l’emplacement de chaque objet S3 de la région. Chaque GET, LIST, PUT et DELETE en a besoin.' },
		{ term: 'Sous-système de placement', def: 'La partie de S3 qui alloue le stockage d’un nouvel objet pendant un PUT. Il ne marche que si l’index marche.' },
		{ term: 'Service Health Dashboard', def: 'La page publique d’AWS (SHD) où AWS affiche l’état de chaque service dans chaque région.' },
		{ term: 'Cellule', def: 'Une copie isolée d’un service parmi plusieurs. Chaque copie traite une partie des requêtes, donc une panne dans une copie ne touche que cette partie.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the Amazon S3 Service Disruption in the Northern Virginia (US-EAST-1) Region',
		date: '2017-02-28',
		url: PM,
		steps: [
			{
				situation: [
					'La commande de 9 h 37 a retiré bien plus de serveurs que prévu. AWS l’écrira ainsi : "one of the inputs to the command was entered incorrectly and a larger set of servers was removed than intended." (un paramètre mal saisi).',
					'Ces serveurs portaient une grande partie du sous-système d’index et du sous-système de placement. Les deux sont tombés, et S3 ne sert plus aucune requête.'
				],
				q: 'Que fais-tu des deux sous-systèmes ?',
				options: [
					'Relancer la même commande avec le bon paramètre',
					'Attendre qu’ils se rééquilibrent sur les serveurs restants',
					'Redémarrer complètement les deux sous-systèmes',
					'Leur ajouter des serveurs neufs sans les arrêter'
				],
				answer: 2,
				why: 'Le postmortem : "Removing a significant portion of the capacity caused each of these systems to require a full restart." Relancer la commande aurait retiré encore plus de serveurs.'
			},
			{
				situation: [
					'Tu dois relancer deux sous-systèmes. Le placement "requires the index subsystem to be functioning properly to correctly operate." : sans index en état de marche, il ne fonctionne pas.',
					'GET, LIST et DELETE n’ont besoin que de l’index. PUT a besoin des deux.'
				],
				q: 'Dans quel ordre les redémarres-tu ?',
				options: [
					'Le placement d’abord, pour que les clients puissent de nouveau envoyer des objets',
					'L’index d’abord, puis le placement quand l’index marche',
					'Les deux en même temps, pour que les quatre API reviennent ensemble',
					'Le sous-système de facturation d’abord, puisque tout a commencé là'
				],
				answer: 1,
				why: 'AWS a relancé l’index en premier. Le placement "began recovery when the index subsystem was functional". Démarré sans index qui marche, le placement ne peut pas allouer de stockage.'
			},
			{
				situation: [
					'AWS signale ses pannes sur le Service Health Dashboard, où chaque service de chaque région a son propre état.',
					'Tu essaies de mettre à jour la ligne de S3, sans succès. La console d’administration du SHD dépend d’Amazon S3, et S3 est en panne dans US-EAST-1.'
				],
				q: 'Comment informes-tu les clients ?',
				options: [
					'Attendre le retour de S3, puis mettre le tableau de bord à jour',
					'Publier sur le compte Twitter d’AWS et dans la bannière du SHD',
					'Passer tous les services de la région en rouge à la main dans la base',
					'Écrire un e-mail à chaque client de la région, un par un'
				],
				answer: 1,
				why: 'Du début de l’incident jusqu’à 11 h 37, AWS "used the AWS Twitter feed (@AWSCloud) and SHD banner text to communicate status". Les lignes de chaque service sont restées périmées jusqu’à 11 h 37.'
			},
			{
				situation: [
					'Les redémarrages traînent. AWS n’avait "not completely restarted the index subsystem or the placement subsystem in our larger regions for many years", et S3 a beaucoup grossi depuis.',
					'Le redémarrage comprend des contrôles de sécurité qui vérifient l’intégrité des métadonnées. Ces contrôles prennent longtemps.'
				],
				q: 'S3 ne sert plus rien depuis 9 h 37. Que fais-tu des contrôles ?',
				options: [
					'Les sauter et servir dès que les serveurs sont prêts',
					'Ne contrôler qu’un échantillon des métadonnées',
					'Servir tout de suite et contrôler en tâche de fond',
					'Laisser tourner les contrôles complets avant de servir'
				],
				answer: 3,
				why: 'Le postmortem parle de "the necessary safety checks to validate the integrity of the metadata". AWS les a gardés, et le redémarrage "took longer than expected". Les GET sont revenus à 12 h 26.'
			},
			{
				situation: [
					'À 12 h 26, GET, LIST et DELETE marchent de nouveau. L’index est complètement rétabli à 13 h 18, le placement à 13 h 54.',
					'D’autres services AWS doivent encore rattraper le travail accumulé pendant la panne. L’équipe choisit quoi changer en premier.'
				],
				q: 'Quel changement empêche un paramètre mal saisi de recommencer ?',
				options: [
					'Ralentir l’outil et l’empêcher de passer sous la capacité minimale',
					'Supprimer le playbook pour que personne ne retire de serveurs à la main',
					'Exiger que deux personnes tapent la commande ensemble',
					'Doubler le nombre de serveurs du sous-système d’index'
				],
				answer: 0,
				why: 'Pour AWS, "the tool used allowed too much capacity to be removed too quickly." L’outil retire maintenant la capacité plus lentement et refuse de faire passer un sous-système sous sa capacité minimale. AWS : "This will prevent an incorrect input from triggering a similar event in the future."'
			}
		],
		outcome: [
			'Le déclencheur : un seul paramètre mal saisi dans une commande d’un playbook établi. La commande a retiré des serveurs de l’index et du placement, et les deux ont dû redémarrer entièrement. Selon AWS, l’outil "allowed too much capacity to be removed too quickly."',
			'S3 n’a servi aucune requête dans US-EAST-1 de 9 h 37 à 12 h 26 (heure du Pacifique), près de 3 heures. PUT est revenu en dernier, à 13 h 54. La console S3, le lancement de nouvelles instances EC2, les volumes EBS qui avaient besoin d’un snapshot S3 et Lambda ont aussi été touchés.',
			'AWS a modifié l’outil : il retire la capacité plus lentement et s’arrête à la capacité minimale de chaque sous-système. AWS passe aussi en revue ses autres outils d’exploitation pour y ajouter le même contrôle.',
			'AWS a avancé un découpage prévu de l’index en cellules plus petites, pour "reduce blast radius and improve recovery" (toucher moins de clients et repartir plus vite). La console d’administration du SHD tourne désormais sur plusieurs régions AWS.'
		]
	},
	quiz: [
		{
			q: 'GET, LIST et DELETE remarchent à 12 h 26, mais PUT seulement à 13 h 54. Pourquoi PUT a-t-il mis plus longtemps ?',
			options: [
				'AWS a bridé les PUT exprès pour protéger la facturation',
				'PUT a aussi besoin du placement, qui attend que l’index marche',
				'Les serveurs retirés stockaient tous les nouveaux envois',
				'AWS a relancé le placement en premier et il a échoué'
			],
			answer: 1,
			why: 'Un PUT passe par l’index pour les métadonnées de l’objet et par le placement pour lui allouer du stockage. Le placement dépend de l’index, donc il n’a pu repartir qu’après lui.'
		},
		{
			q: 'La page d’état d’AWS ne pouvait pas afficher S3 en panne, car sa console dépendait de S3. Qu’a changé AWS ?',
			options: [
				'Il a déplacé la console dans un autre compte de US-EAST-1',
				'Il a remplacé le tableau de bord par le compte Twitter',
				'Il a fait tourner la console sur plusieurs régions AWS',
				'Il a mis le tableau de bord en cache dans le navigateur des clients'
			],
			answer: 2,
			why: 'AWS "changed the SHD administration console to run across multiple AWS regions". Le 28 février, la console n’a pas pu mettre à jour l’état de chaque service avant 11 h 37, car S3 était en panne dans US-EAST-1.'
		},
		{
			q: 'Un service tourne sur 10 cellules et reçoit 100 requêtes. Une cellule tombe. Combien de requêtes réussissent encore ?',
			options: ['0, car les cellules partagent un seul index', '50', '90', '99'],
			answer: 2,
			why: 'Chaque cellule est indépendante et traite sa part des requêtes. Le guide d’AWS sur les cellules prend ce cas précis : avec 10 cellules pour 100 requêtes, une cellule en panne laisse 90 % des requêtes intactes.'
		}
	],
	recall: {
		q: 'Quels deux changements AWS a-t-il faits sur son outil de retrait de capacité après la panne de S3 ?',
		a: 'L’outil retire la capacité plus lentement, et il refuse un retrait qui ferait passer un sous-système sous sa capacité minimale.'
	},
	sources: [
		{ title: 'AWS, Summary of the Amazon S3 Service Disruption in the Northern Virginia (US-EAST-1) Region', url: PM },
		{
			title: 'AWS Well-Architected, What is a cell-based architecture?',
			url: 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html'
		}
	]
};
