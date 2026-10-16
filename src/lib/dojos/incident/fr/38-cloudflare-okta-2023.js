const PM = 'https://blog.cloudflare.com/thanksgiving-2023-security-incident/';
const OKTA = 'https://blog.cloudflare.com/how-cloudflare-mitigated-yet-another-okta-compromise/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cloudflare-okta-2023',
	part: 'Sécurité',
	title: 'Cloudflare 2023 : les identifiants oubliés après la fuite chez Okta',
	minutes: 10,
	hook: [
		'Mercredi 18 octobre 2023. Tu fais partie de l’équipe sécurité de Cloudflare. Quelqu’un attaque tes systèmes, et tu remontes la piste jusqu’à Okta.',
		'Un attaquant est entré dans le système de support client d’Okta. Dans un ticket ouvert par un employé de Cloudflare, il a pris un jeton de session, puis s’en est servi pour atteindre l’instance Okta de Cloudflare.',
		'Ton équipe le détecte plus de 24 heures avant qu’Okta ne te prévienne, et le bloque. L’attaquant a vu une série d’identifiants de Cloudflare. Il faut maintenant les remplacer. (Toutes les heures de ce chapitre sont en UTC.)'
	],
	terms: [
		{ term: 'Compte de service', def: 'Un compte qu’utilise un programme à la place d’une personne, par exemple le compte avec lequel un outil SaaS lit et écrit des tickets Jira.' },
		{ term: 'Rotation d’identifiants', def: 'Remplacer un mot de passe, un jeton ou une clé par un nouveau et révoquer l’ancien, pour qu’une copie de l’ancien ne marche plus.' },
		{ term: 'Persistance', def: 'Un moyen de revenir que l’attaquant installe, pour que la coupure du premier compte volé ne le mette pas dehors : un second compte, un programme installé.' },
		{ term: 'C2', def: 'Command and control : un programme sur une machine piratée qui se connecte au serveur de l’attaquant et exécute les commandes qu’il reçoit.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Thanksgiving 2023 security incident',
		date: '2023-11-23',
		url: PM,
		steps: [
			{
				situation: [
					'La liste des identifiants à changer compte des milliers de lignes. On y trouve des identifiants d’intégrations : un jeton de service Moveworks, un compte de service Smartsheet avec un accès admin à Jira, un compte de service Bitbucket et un compte AWS.',
					'Certains de ces identifiants d’intégration semblent inutilisés.'
				],
				q: 'Quels identifiants changes-tu ?',
				options: [
					'Seulement ceux qui se sont connectés dans les 30 derniers jours',
					'Seulement ceux qui appartiennent à des personnes',
					'Tous ceux de la liste, y compris ceux qui semblent inutilisés',
					'Seulement ceux qui ont un accès admin'
				],
				answer: 2,
				why: 'Cloudflare « failed to rotate one service token and three service accounts (out of thousands) ». Ils « were not rotated because mistakenly it was believed they were unused ». Dès le 14 novembre, l’attaquant s’en est servi pour sonder Cloudflare, puis le 15 pour entrer dans Jira et Confluence.'
			},
			{
				situation: [
					'Jeudi 23 novembre, jour de Thanksgiving. À 15 h 58, quelqu’un ajoute le compte de service Smartsheet à un groupe d’administrateurs dans Atlassian. Une alerte automatique sur ce changement arrive à l’équipe sécurité à 16 h 00.',
					'À 16 h 12, le centre des opérations de sécurité (SOC) commence l’enquête.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Désactiver le compte de service Smartsheet',
					'Observer le compte pendant un jour pour comprendre ce que veut l’attaquant',
					'Forcer un changement de mot de passe pour tous les employés',
					'Écrire à Smartsheet pour qu’ils vérifient leurs systèmes'
				],
				answer: 0,
				why: 'Le SOC a désactivé le compte de service Smartsheet à 16 h 35, 35 minutes après l’alerte. Ce compte avait un accès admin à Jira, et l’attaquant venait de l’ajouter à un groupe d’administrateurs.'
			},
			{
				situation: [
					'À 16 h 35, le compte Smartsheet est coupé. Il avait un accès admin à Jira.'
				],
				q: 'Que cherches-tu ensuite ?',
				options: [
					'Rien : le compte volé est coupé, tu fermes l’alerte',
					'Les comptes, groupes et plugins que ce compte a créés ou modifiés',
					'Une nouvelle clé d’API Smartsheet, pour que l’intégration remarche',
					'La liste des clients à prévenir d’une fuite de leurs données'
				],
				answer: 1,
				why: 'À 17 h 23, le SOC a trouvé et désactivé un utilisateur Atlassian créé par l’attaquant le 16 novembre. Il « looked like a normal Cloudflare user » et faisait partie de plusieurs groupes, « should the Smartsheet service account be removed ». Le 22 novembre, l’attaquant avait aussi installé Sliver, un framework de C2, via le plugin ScriptRunner for Jira.'
			},
			{
				situation: [
					'L’incident interne est déclaré à 17 h 43, et des règles de pare-feu bloquent les adresses IP connues de l’attaquant à 21 h 31. Le 24 novembre, la dernière activité de l’attaquant date de 10 h 44 et Sliver est retiré à 11 h 59.',
					'Les logs montrent que l’attaquant a consulté 120 de tes 11 904 dépôts de code. Sur 76 d’entre eux, il a utilisé la fonction d’archive git de Bitbucket pour les télécharger sur le serveur Atlassian. Tu ne peux pas confirmer si les archives sont sorties du serveur.'
				],
				q: 'Comment traites-tu ces 76 dépôts ?',
				options: [
					'Comme sûrs, puisque rien ne montre qu’ils sont sortis',
					'Comme publics, donc tu ouvres les 76 en open source',
					'Comme perdus, donc tu les supprimes et les restaures',
					'Comme volés, donc tu y cherches les secrets et tu les changes'
				],
				answer: 3,
				why: 'Cloudflare a « decided to treat them as having been exfiltrated ». L’équipe a cherché les secrets embarqués dans les 76 dépôts et les a changés, même ceux qui étaient déjà « strongly encrypted ». Cloudflare explique que le code l’inquiétait moins que les « embedded secrets (such as a key or token) and vulnerabilities ».'
			},
			{
				situation: [
					'L’attaquant a cherché dans le wiki « remote access, secret, client-secret, openconnect, cloudflared, and token ». Il a lu des tickets Jira sur la gestion des vulnérabilités, la rotation des secrets, le contournement du MFA, l’accès réseau et la réponse à l’incident Okta. Son accès est resté dans la suite Atlassian et son serveur.',
					'Depuis le serveur Atlassian, il a aussi tenté d’atteindre un serveur console dans un data center de São Paulo, pas encore en production. L’accès a été refusé.'
				],
				q: 'Jusqu’où va le nettoyage ?',
				options: [
					'Changer les secrets trouvés dans Atlassian et reconstruire le serveur Atlassian',
					'Changer chaque identifiant de production et réinstaller chaque machine',
					'Reconstruire le serveur Atlassian et laisser le reste en place',
					'Réinitialiser le mot de passe des employés dont les tickets ont été lus'
				],
				answer: 1,
				why: 'Cloudflare voulait « to prevent the attacker from using the technical information about the operations of our network as a way to get back in ». L’équipe a changé plus de 5 000 identifiants de production, fait un tri forensique sur 4 893 systèmes et réinstallé chaque machine du réseau mondial. Le matériel de São Paulo est reparti chez ses fabricants, et Cloudflare l’a remplacé.'
			}
		],
		outcome: [
			'La cause racine : un jeton de service et trois comptes de service que Cloudflare n’a pas changés après la fuite chez Okta d’octobre 2023, parce qu’elle les croyait inutilisés. Le jeton Moveworks permettait de s’authentifier à travers la passerelle de Cloudflare, et le compte Smartsheet avait un accès admin à Jira.',
			'L’attaquant a lu 36 tickets Jira sur 2 059 357 et 202 pages de wiki sur 194 100, a consulté 120 dépôts et en a archivé 76. Cloudflare n’a vu aucun accès à son réseau mondial ni aux données clients. Cloudflare attribue l’attaque à un État.',
			'L’équipe forensique de CrowdStrike est arrivée le 26 novembre. Son analyse indépendante « did not bring to light any activities that we had missed » et place la dernière activité de l’attaquant le 24 novembre à 10 h 44.',
			'Du 27 novembre au 5 janvier, une grande partie des équipes techniques de Cloudflare a travaillé sur « Code Red ». Elles ont changé plus de 5 000 identifiants, séparé physiquement les systèmes de test et de préproduction, réinstallé chaque machine et supprimé tous les fichiers HAR déposés sur le wiki, au cas où ils contiendraient des jetons.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi l’attaquant a-t-il créé un utilisateur Atlassian qui ressemblait à un employé ordinaire ?',
			options: [
				'Pour lire des tickets que le compte Smartsheet ne voyait pas',
				'Pour garder un accès si le compte Smartsheet était supprimé',
				'Pour passer le contrôle des clés de sécurité matérielles',
				'Pour envoyer des emails de phishing depuis Jira'
			],
			answer: 1,
			why: 'Ce second compte servait de persistance. Quand le SOC a coupé le compte Smartsheet à 16 h 35, cet utilisateur est resté actif jusqu’à ce que le SOC le trouve et le désactive à 17 h 23.'
		},
		{
			q: 'L’identifiant Smartsheet volé était un compte de service. Pourquoi son accès admin à Jira comptait-il ?',
			options: [
				'Il lui permettait de lire les logs d’Okta',
				'Il lui donnait un accès au data center de São Paulo',
				'Il lui permettait de couper les alertes automatiques',
				'Il lui permettait de créer des comptes et d’installer Sliver'
			],
			answer: 3,
			why: 'Avec les droits admin dans Jira, l’attaquant a créé un utilisateur, l’a ajouté à des groupes et a installé Sliver avec ScriptRunner for Jira. Cloudflare : « Since the Smartsheet service account had administrative access to Atlassian Jira, the threat actor was able to install the Sliver Adversary Emulation Framework ».'
		},
		{
			q: 'Cloudflare a supprimé tous les fichiers HAR déposés sur son wiki. Quel est le risque d’un fichier HAR ?',
			options: [
				'Il peut contenir les jetons de session du navigateur',
				'Il exécute des scripts quand on l’ouvre',
				'Il contient tout le code source de la page web',
				'Il stocke la clé de sécurité matérielle'
			],
			answer: 0,
			why: 'Un fichier HAR est le journal réseau d’un navigateur. Exporté « with sensitive data », il garde des en-têtes comme `Cookie` et `Authorization`. La fuite chez Okta est partie d’un jeton de session pris dans un fichier joint à un ticket de support, d’où la suppression des fichiers HAR « in case they contained tokens of any sort ».'
		}
	],
	recall: {
		q: 'Comment l’attaquant est-il entré dans les systèmes Atlassian de Cloudflare en novembre 2023 ?',
		a: 'Avec un jeton de service (Moveworks) et trois comptes de service (Smartsheet, Bitbucket, AWS) exposés lors de la fuite chez Okta d’octobre 2023. Cloudflare ne les avait pas changés parce qu’elle les croyait inutilisés.'
	},
	sources: [
		{ title: 'Blog Cloudflare, Thanksgiving 2023 security incident', url: PM },
		{ title: 'Blog Cloudflare, How Cloudflare mitigated yet another Okta compromise', url: OKTA },
		{ title: 'Chrome DevTools, Network features reference (Save all network requests to a HAR file)', url: 'https://developer.chrome.com/docs/devtools/network/reference' }
	]
};
