const PM = 'https://blog.lastpass.com/posts/security-incident-update-recommended-actions';
const NOTICE = 'https://blog.lastpass.com/posts/notice-of-recent-security-incident';
const I1 = 'https://support.lastpass.com/s/document-item?bundleId=lastpass&topicId=LastPass/incident-1-details.html';
const I2 = 'https://support.lastpass.com/s/document-item?bundleId=lastpass&topicId=LastPass/incident-2-details.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'lastpass-2022',
	part: 'Sécurité',
	title: 'LastPass 2022 : l’ordinateur personnel d’un ingénieur et les clés des sauvegardes',
	minutes: 10,
	hook: [
		'Vendredi 12 août 2022. Tu fais partie de l’équipe sécurité de LastPass. Une alerte signale une activité suspecte dans un environnement de développement cloud, celui que les ingénieurs utilisent pour la préproduction et les tests.',
		'Dans les 24 heures qui suivent, tu vois des accès qui ne collent pas avec l’ingénieur logiciel dont le compte les a faits. Son portable professionnel a été compromis, et son agent EDR a été trafiqué sans jamais se déclencher.',
		'L’environnement de développement ne contient ni données clients ni coffres. Il est séparé physiquement et logiquement des data centers de production.'
	],
	terms: [
		{ term: 'Mot de passe maître', def: 'Le seul mot de passe qu’un utilisateur LastPass tape pour ouvrir son coffre. LastPass ne le stocke jamais, et la clé du coffre en est dérivée sur l’appareil de l’utilisateur.' },
		{ term: 'PBKDF2', def: 'Une fonction qui transforme un mot de passe en clé en le hachant de nombreuses fois. Par défaut en 2022, LastPass faisait 100 100 itérations, donc chaque essai coûte 100 100 hachages à l’attaquant.' },
		{ term: 'Keylogger', def: 'Un logiciel malveillant qui enregistre chaque touche tapée, mots de passe compris.' },
		{ term: 'Clé de déchiffrement', def: 'Le secret qui rend lisibles des données chiffrées. Un attaquant qui copie un fichier chiffré sans sa clé n’obtient que des octets illisibles.' }
	],
	incident: {
		org: 'LastPass',
		title: 'Security Incident Update and Recommended Actions',
		date: '2022-08-12',
		url: PM,
		steps: [
			{
				situation: [
					'Entre le 8 et le 12 août, l’attaquant a pris 14 des quelque 200 dépôts de code source. Certains contenaient en clair des identifiants et des certificats de l’environnement de développement.',
					'D’autres contenaient des identifiants chiffrés utilisés en production, par exemple pour les sauvegardes. Il faut pour eux une clé de déchiffrement à part, que ni l’ingénieur ni l’attaquant n’avaient.'
				],
				q: 'Que fais-tu des identifiants de production chiffrés ?',
				options: [
					'Les laisser, puisque l’attaquant ne peut pas les déchiffrer',
					'Les changer tout de suite, avec ceux en clair',
					'Les changer seulement s’ils apparaissent en vente en ligne',
					'Les chiffrer une seconde fois avec une nouvelle clé'
				],
				answer: 1,
				why: 'Les identifiants chiffrés restaient valides tant que LastPass ne les avait pas changés. LastPass a écrit ensuite que l’attaquant s’est servi des informations du premier incident « prior to the reset completed by our teams » pour atteindre son stockage cloud. Lors de ce second incident, l’attaquant a obtenu les clés de déchiffrement.'
			},
			{
				situation: [
					'LastPass reconstruit l’environnement de développement de zéro en six semaines et remplace le portable de l’ingénieur. La documentation volée décrit le fonctionnement de cet environnement.',
					'Les clés de déchiffrement des identifiants de sauvegarde sont à deux endroits : une plateforme d’orchestration avec un stockage clé-valeur sécurisés, et quelques dossiers partagés très restreints dans un coffre LastPass. Quatre ingénieurs DevOps peuvent ouvrir ces dossiers.'
				],
				q: 'Que fais-tu ensuite ?',
				options: [
					'Déclarer l’incident clos, puisque l’attaquant est dehors',
					'Ranger les clés dans l’environnement de développement tout neuf',
					'Changer le mot de passe des quatre ingénieurs et clore l’incident',
					'Traiter les quatre ingénieurs qui ont accès aux clés comme les prochaines cibles'
				],
				answer: 3,
				why: 'LastPass « declared this incident closed but later learned that information stolen in the first incident was used to identify targets and initiate the second incident. » L’attaquant a visé « one of the four DevOps engineers who had access to the decryption keys ».'
			},
			{
				situation: [
					'Du 12 août au 26 octobre, quelqu’un utilise les identifiants valides d’un ingénieur DevOps senior pour fouiller un stockage cloud partagé. Les logs et les alertes sont actifs, mais rien ne paraît anormal.',
					'Puis AWS GuardDuty lève des alertes : ces mêmes identifiants tentent d’utiliser des rôles IAM pour des actions qui ne leur sont pas permises.'
				],
				q: 'Que te pousse à vérifier l’alerte GuardDuty ?',
				options: [
					'Si c’est l’ingénieur qui a fait ces appels, ou quelqu’un qui a ses identifiants',
					'Si GuardDuty est mal configuré, puisqu’il s’agit d’un ingénieur senior',
					'Si les buckets S3 sont pleins',
					'Si les rôles IAM ont besoin de droits plus larges pour l’ingénieur'
				],
				answer: 0,
				why: 'L’attaquant utilisait des « valid credentials stolen from a senior DevOps engineer », ce qui « initially made it difficult for investigators to differentiate between threat actor activity and ongoing legitimate activity ». Ce sont les alertes GuardDuty sur l’usage des rôles IAM qui ont montré le « anomalous behavior ».'
			},
			{
				situation: [
					'L’enquête remonte jusqu’à l’ordinateur personnel de l’ingénieur. Un logiciel multimédia tiers vulnérable y permettait d’exécuter du code à distance, et l’attaquant y a installé un keylogger.',
					'Le keylogger a capté le mot de passe maître de l’ingénieur après que celui-ci a passé le MFA. L’attaquant a ensuite exporté le coffre professionnel et ses dossiers partagés, avec les clés d’accès et de déchiffrement des sauvegardes AWS S3 de production.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Réinstaller le portable professionnel de l’ingénieur',
					'Demander à l’ingénieur de changer son mot de passe maître',
					'Changer les identifiants à hauts privilèges que l’attaquant a pu voir',
					'Retirer le logiciel multimédia de tous les portables de l’entreprise'
				],
				answer: 2,
				why: 'LastPass a d’abord « rotated critical and high privilege credentials that were known to be available to the threat actor », puis les éléments moins prioritaires. L’équipe a aussi commencé à réémettre les certificats et changé les clés des utilisateurs IAM de production. Un nouveau mot de passe maître ne change rien aux clés déjà exportées.'
			},
			{
				situation: [
					'Avec les clés S3, l’attaquant a copié une sauvegarde des coffres clients. Dans cette copie, les URL des sites restent en clair. Les identifiants, mots de passe, notes sécurisées et données de formulaires sont chiffrés en AES-256, avec une clé dérivée du mot de passe maître de chaque utilisateur.',
					'Depuis 2018, LastPass impose au moins 12 caractères pour le mot de passe maître, et son réglage par défaut est de 100 100 itérations PBKDF2. Certains comptes n’utilisent pas ces réglages.'
				],
				q: 'Que dis-tu aux clients ?',
				options: [
					'Changez votre mot de passe maître, ce qui rechiffre la copie volée',
					'Personne n’a rien à faire, car tous les coffres sont chiffrés',
					'Supprimez votre compte LastPass pour effacer la copie',
					'Sous les réglages par défaut, changez les mots de passe du coffre'
				],
				answer: 3,
				why: 'LastPass a écrit le 22 décembre que l’attaquant « may attempt to use brute force to guess your master password », hors ligne, sur la copie. Les utilisateurs sans ces réglages « should consider minimizing risk by changing passwords of websites you have stored ». La copie volée reste chiffrée avec la clé de l’ancien mot de passe maître.'
			}
		],
		outcome: [
			'Le premier incident (du 8 au 12 août 2022) est parti du portable compromis d’un ingénieur logiciel et a emporté 14 dépôts, avec quelques secrets. Ses informations ont servi à choisir la cible du second incident, qui a duré du 12 août au 26 octobre 2022.',
			'Le second attaquant a visé l’un des quatre ingénieurs DevOps qui avaient accès aux clés de déchiffrement des sauvegardes. Un keylogger sur son ordinateur personnel, installé via un logiciel multimédia vulnérable, a capté le mot de passe maître et ouvert le coffre professionnel.',
			'L’attaquant a copié les données des comptes clients, une sauvegarde de tous les coffres clients et une sauvegarde de la base MFA et fédération. Cette base était chiffrée, mais sa clé de déchiffrement faisait partie des secrets volés. Les champs des coffres, comme les mots de passe, sont restés chiffrés avec des clés dérivées du mot de passe maître de chaque utilisateur.',
			'LastPass a changé les identifiants et certificats exposés, durci les règles IAM et ajouté des logs sur le stockage cloud, supprimé d’anciens utilisateurs IAM et interdit les utilisateurs IAM de développement à longue durée de vie. L’équipe a aussi aidé l’ingénieur à sécuriser son réseau domestique. Le 1er mars 2023, LastPass a reconnu qu’elle « should have communicated more frequently and comprehensively ».'
		]
	},
	quiz: [
		{
			q: 'Les identifiants chiffrés volés en août demandaient une clé que l’attaquant n’avait pas. Comment l’a-t-il obtenue ?',
			options: [
				'En cassant le chiffrement par force brute pendant des semaines',
				'Dans le coffre d’un ingénieur DevOps, ouvert grâce à un keylogger',
				'En demandant au support LastPass de réinitialiser le compte',
				'En la lisant dans le code source volé en août'
			],
			answer: 1,
			why: 'Les clés étaient dans des dossiers partagés d’un coffre LastPass que quatre ingénieurs DevOps pouvaient ouvrir. Le keylogger sur l’ordinateur personnel de l’un d’eux a capté le mot de passe maître, et l’attaquant a exporté le coffre.'
		},
		{
			q: 'L’ingénieur avait passé le MFA avant de taper son mot de passe maître. Pourquoi le MFA n’a-t-il pas arrêté l’attaquant ?',
			options: [
				'Le MFA était désactivé pour les ingénieurs DevOps à ce moment-là',
				'L’attaquant avait d’abord réinitialisé l’appareil MFA de l’ingénieur',
				'Le MFA ne protège que l’appli mobile, pas le navigateur',
				'Le keylogger tournait sur l’ordinateur même de l’ingénieur, après le MFA'
			],
			answer: 3,
			why: 'Le MFA vérifie qui se connecte. Le keylogger a capté le mot de passe maître « as it was entered, after the employee authenticated with MFA ».'
		},
		{
			q: 'Une copie de coffre est chiffrée avec une clé dérivée par 100 100 itérations PBKDF2. Que coûte à l’attaquant chaque essai de mot de passe maître ?',
			options: [
				'Une requête vers les serveurs de LastPass',
				'100 100 calculs de hachage, faits hors ligne',
				'Un seul déchiffrement AES, rien de plus',
				'Rien, car les URL révèlent le mot de passe'
			],
			answer: 1,
			why: 'Chaque essai doit passer par les mêmes 100 100 itérations pour produire une clé candidate. Le calcul tourne sur les machines de l’attaquant, sans limite de débit, et seul le coût de chaque essai le ralentit.'
		}
	],
	recall: {
		q: 'Comment l’attaquant a-t-il obtenu les clés des sauvegardes cloud de LastPass en 2022 ?',
		a: 'Un keylogger sur l’ordinateur personnel d’un ingénieur DevOps, installé via un logiciel multimédia tiers vulnérable, a capté son mot de passe maître. L’attaquant a exporté le coffre professionnel, dont les dossiers partagés contenaient les clés d’accès et de déchiffrement AWS S3.'
	},
	sources: [
		{ title: 'Blog LastPass, Security Incident Update and Recommended Actions (1er mars 2023)', url: PM },
		{ title: 'Support LastPass, Incident 2: Additional details of the attack', url: I2 },
		{ title: 'Support LastPass, Incident 1: Additional details of the attack', url: I1 },
		{ title: 'Blog LastPass, Notice of Recent Security Incident (22 décembre 2022)', url: NOTICE }
	]
};
