const PM = 'https://aws.amazon.com/message/11201/';
const CELLS = 'https://docs.aws.amazon.com/wellarchitected/latest/reducing-scope-of-impact-with-cell-based-architecture/what-is-a-cell-based-architecture.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'aws-kinesis-2020',
	part: 'Capacité et effets en cascade',
	title: 'AWS Kinesis 2020 : l’ajout de capacité qui a dépassé une limite de threads de l’OS',
	minutes: 10,
	hook: [
		'Mercredi 25 novembre 2020, Virginie du Nord (US-EAST-1). Entre 2 h 44 et 3 h 47 PST, l’équipe Kinesis ajoute un peu de capacité à la flotte front-end de Kinesis.',
		'À 5 h 15 PST, les premières alarmes sonnent : erreurs à l’écriture et à la lecture d’enregistrements Kinesis. Kinesis est un service de flux de données, et d’autres services AWS s’en servent. CloudWatch et EventBridge renvoient eux aussi des erreurs dès 5 h 15.'
	],
	terms: [
		{ term: 'Flotte front-end', def: 'Les serveurs Kinesis qui gèrent l’authentification, la limitation de débit et l’envoi de chaque requête vers le bon shard. Elle compte plusieurs milliers de serveurs.' },
		{ term: 'Shard-map', def: 'Le cache que chaque serveur front-end garde pour savoir quel cluster back-end possède quel shard. Sans shard-map complète, un serveur ne sait pas où envoyer les requêtes.' },
		{ term: 'Limite de threads de l’OS', def: 'Un réglage du système d’exploitation qui plafonne le nombre de threads d’un serveur. Un processus qui en demande plus ne peut pas les créer.' },
		{ term: 'Cellule', def: 'Une copie isolée parmi plusieurs d’un même service. Chaque copie traite une partie des requêtes, donc une panne reste dans sa copie.' }
	],
	incident: {
		org: 'Amazon Web Services',
		title: 'Summary of the Amazon Kinesis Event in the Northern Virginia (US-EAST-1) Region',
		date: '2020-11-25',
		url: PM,
		steps: [
			{
				situation: [
					'Il est 5 h 15 PST. L’ajout de capacité à la flotte front-end s’est terminé à 3 h 47. L’équipe lit les logs.',
					'Les erreurs sont de toutes sortes, sur les anciens comme sur les nouveaux serveurs front-end. Certaines n’ont pas l’air liées à la nouvelle capacité, et continueraient sans doute même si on la retirait.'
				],
				q: 'Que fais-tu de la nouvelle capacité ?',
				options: [
					'Tu la gardes, puisque plusieurs erreurs n’ont rien à voir avec elle',
					'Tu la retires par précaution et tu continues d’étudier les autres erreurs',
					'Tu ajoutes encore des serveurs front-end pour absorber les erreurs',
					'Tu redémarres toute la flotte front-end avec les nouveaux serveurs'
				],
				answer: 1,
				why: 'La capacité était le changement le plus récent, même si elle n’expliquait peut-être pas toutes les erreurs. AWS : « Still, as a precaution, we began removing the new capacity while researching the other errors. » Ajouter des serveurs aurait aggravé le vrai problème.'
			},
			{
				situation: [
					'Tu es dans l’équipe Cognito. Cognito envoie ses données d’accès aux API vers Kinesis au mieux, avec un tampon local pour les courtes coupures de Kinesis.',
					'Les serveurs web de Cognito se bloquent sur les tampons Kinesis en retard. Les utilisateurs ne peuvent plus se connecter ni obtenir d’identifiants AWS temporaires. Ajouter des serveurs pour tamponner plus d’appels a aidé au début, mais à 7 h 01 les erreurs ont fortement augmenté.'
				],
				q: 'Que fais-tu ensuite ?',
				options: [
					'Tu ajoutes encore des serveurs Cognito pour un tampon plus grand',
					'Tu modifies Cognito pour que ses requêtes ne dépendent plus de Kinesis',
					'Tu attends le retour de Kinesis, puisque Cognito n’a rien',
					'Tu redémarres tous les serveurs Cognito pour vider leurs tampons'
				],
				answer: 1,
				why: 'Un tampon plus grand ne fait que retarder le moment où il se remplit tant que Kinesis reste en panne. L’équipe Cognito travaillait déjà « in parallel on a change to Cognito to reduce the dependency on Kinesis ». Le déploiement a commencé à 10 h 15, et Cognito était normal à 14 h 18.'
			},
			{
				situation: [
					'7 h 51. L’équipe a réduit la cause à deux ou trois pistes. La piste principale est un problème qui semble créer une pression mémoire. Chaque correctif possible oblige à changer la config de tous les serveurs front-end et à redémarrer la flotte.',
					'Un serveur front-end remplit sa shard-map avec les mêmes ressources qu’il utilise pour servir les requêtes. Des serveurs remis en service trop vite répondent lentement, sont jugés en mauvaise santé et retirés. Un redémarrage complet est long et délicat, et un mauvais correctif impose un second redémarrage.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Tu appliques le correctif mémoire et tu redémarres tout de suite',
					'Tu redémarres toute la flotte d’un coup pour gagner du temps',
					'Tu confirmes la cause en préparant un démarrage plus rapide',
					'Tu remets sur chaque serveur front-end le build de la semaine dernière'
				],
				answer: 2,
				why: 'Un mauvais pari aurait fait « double the recovery time ». En parallèle de l’enquête, AWS a ajouté une config pour que les serveurs chargent leurs données « directly from the authoritative metadata store rather than from front-end server neighbors » au démarrage. À 9 h 39, la cause s’est révélée ne pas être la pression mémoire.'
			},
			{
				situation: [
					'9 h 39. La cause est confirmée. Chaque serveur front-end crée un thread de l’OS pour chacun des autres serveurs de la flotte. La nouvelle capacité a fait passer tous les serveurs au-dessus du nombre maximum de threads permis par un réglage de l’OS.',
					'Au-delà de la limite, la construction de la shard-map échoue et les serveurs ne savent plus router les requêtes. Le retrait de la nouvelle capacité vient de se terminer.'
				],
				q: 'Que changes-tu avant le redémarrage ?',
				options: [
					'Tu relèves la limite de threads de l’OS sur chaque serveur',
					'Tu remets la nouvelle capacité pour avoir plus de serveurs',
					'Rien de plus : sans la capacité ajoutée, les threads tiennent',
					'Tu coupes la limitation de débit pour réduire les threads'
				],
				answer: 2,
				why: 'Moins de serveurs veut dire moins de threads par serveur, donc la flotte repasse sous la limite. AWS « didn’t want to increase the operating system limit without further testing », et, la capacité retirée, a « determined that the thread count would no longer exceed the operating system limit ».'
			},
			{
				situation: [
					'10 h 07. Le premier groupe de serveurs front-end redémarrés reçoit du trafic Kinesis. La flotte compte plusieurs milliers de serveurs.',
					'Chaque serveur qui revient doit construire sa shard-map tout en servant des requêtes.'
				],
				q: 'À quel rythme remets-tu les serveurs en service ?',
				options: [
					'Tous d’un coup, pour finir la panne plus vite',
					'La moitié maintenant et l’autre dans une heure',
					'Quelques centaines par heure, en suivant le taux d’erreur',
					'Un serveur par heure, pour ne prendre aucun risque'
				],
				answer: 2,
				why: 'Trop vite, les serveurs se disputent les ressources, ralentissent et sont retirés comme malades, ce qui fait reculer la reprise. AWS « could only add servers at the rate of a few hundred per hour ». Le taux d’erreur a baissé régulièrement à partir de midi, et Kinesis était normal à 22 h 23.'
			}
		],
		outcome: [
			'Kinesis a renvoyé des erreurs de 5 h 15 à 22 h 23 PST. Chaque serveur front-end garde un thread par autre serveur, donc son nombre de threads est « directly proportional to the number of servers in the fleet ». Le petit ajout a fait dépasser la limite de threads de l’OS à tous les serveurs en même temps.',
			'Plusieurs services AWS qui reposent sur Kinesis ont échoué à leur tour. CloudWatch n’a pas pu traiter la plupart des métriques avant le début de sa reprise à 17 h 47, ce qui a retardé l’AutoScaling réactif. Chez Lambda, la mise en tampon locale des métriques a saturé la mémoire des hôtes de 6 h 15 jusqu’à un correctif à 10 h 36. Les retards d’EventBridge ont bloqué la gestion des clusters ECS et EKS jusque vers 16 h 15.',
			'AWS n’a pas pu mettre à jour le Service Health Dashboard au début, car l’outil de publication utilise Cognito. L’outil de secours a marché, mais les opérateurs du support le connaissaient moins bien, et les premières publications ont pris du retard.',
			'Correctifs pour Kinesis : des serveurs plus gros pour avoir moins de serveurs et moins de threads, des alarmes sur l’usage des threads, des tests d’une limite de threads plus haute, une flotte dédiée au cache de shard-map, une flotte front-end séparée pour CloudWatch et un découpage en cellules accéléré du front-end. Cognito supporte maintenant les erreurs Kinesis sans remplir ses tampons, et CloudWatch garde 3 heures de métriques dans un stockage local.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi un petit ajout de capacité a-t-il fait dépasser la limite de threads à tous les serveurs front-end, et pas seulement aux nouveaux ?',
			options: [
				'Les nouveaux serveurs avaient un build avec une fuite de threads qui s’est propagée',
				'Chaque serveur ouvre un thread par autre serveur, donc tous en avaient besoin de plus',
				'Les nouveaux serveurs envoyaient tant de requêtes que les autres créaient des threads',
				'La limite de l’OS était partagée par la flotte, et les nouveaux l’ont épuisée'
			],
			answer: 1,
			why: 'Chaque serveur front-end crée un thread de l’OS pour chacun des autres serveurs de la flotte. Ajouter des serveurs a augmenté le nombre de threads sur tous les serveurs existants, et tous ont franchi la même limite.'
		},
		{
			q: 'Cognito n’utilisait Kinesis que pour des statistiques au mieux. Pourquoi ses utilisateurs n’arrivaient-ils plus à se connecter ?',
			options: [
				'Cognito stockait ses user pools dans des flux Kinesis',
				'Un bug latent bloquait les serveurs web sur le tampon Kinesis en retard',
				'Les serveurs de Cognito tournaient sur la flotte front-end de Kinesis',
				'AWS a coupé Cognito pour libérer de la capacité pour Kinesis'
			],
			answer: 1,
			why: 'Le tampon devait absorber de courtes coupures de Kinesis. La longue panne a « triggered a latent bug in this buffering code », et les serveurs web se sont bloqués dessus. Une dépendance facultative a arrêté le chemin principal des requêtes.'
		},
		{
			q: 'En quoi découper le front-end de Kinesis en cellules aide-t-il face à ce genre de limite ?',
			options: [
				'Chaque cellule a son propre OS, donc la limite de threads disparaît',
				'Chaque cellule a un nombre borné de serveurs, donc les threads restent testés',
				'Les cellules permettent d’envoyer tout le trafic vers une autre région',
				'Les cellules partagent une shard-map, donc les serveurs n’ont plus besoin de threads'
			],
			answer: 1,
			why: 'Les threads par serveur augmentent avec le nombre de serveurs à qui il parle. Une cellule garde son nombre de serveurs dans une plage testée, donc aucun serveur ne parle à toute la flotte. AWS : le découpage en cellules « will provide better protection against any future unknown scaling limit. »'
		}
	],
	recall: {
		q: 'Quelle limite les serveurs front-end de Kinesis ont-ils atteinte le 25 novembre 2020, et pourquoi ?',
		a: 'La limite de l’OS sur le nombre de threads par serveur. Chaque serveur front-end fait tourner un thread par autre serveur, et la nouvelle capacité a fait dépasser la limite à tous, donc les shard-maps ne se construisaient plus.'
	},
	sources: [
		{ title: 'AWS : Summary of the Amazon Kinesis Event in the Northern Virginia (US-EAST-1) Region', url: PM },
		{ title: 'AWS Well-Architected : What is a cell-based architecture?', url: CELLS }
	]
};
