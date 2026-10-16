const PM = 'https://circleci.com/blog/jan-4-2023-incident-report/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'circleci-2023',
	part: 'Sécurité',
	title: 'CircleCI 2023 : une session volée et tous les secrets des clients',
	minutes: 10,
	hook: [
		'Jeudi 29 décembre 2022. Un client de CircleCI signale une activité OAuth GitHub suspecte. CircleCI garde un token OAuth GitHub pour chaque client qui a connecté GitHub.',
		'CircleCI stocke aussi ce dont les pipelines des clients ont besoin pour joindre d’autres systèmes : variables d’environnement, tokens d’API, clés SSH et clés AWS.',
		'L’équipe sécurité de CircleCI lance une enquête avec GitHub. Personne ne sait encore si un seul client est exposé, ou tous.'
	],
	terms: [
		{ term: 'session SSO', def: 'Le cookie qu’un fournisseur d’authentification unique remet au navigateur après une connexion, étape 2FA comprise. Tout navigateur qui envoie ce cookie est traité comme connecté.' },
		{ term: 'token OAuth', def: 'Un token qui permet à CircleCI d’agir sur le compte GitHub d’un client, par exemple pour lire ses dépôts.' },
		{ term: 'exfiltration', def: 'La copie de données hors des systèmes d’une entreprise, vers un endroit que l’attaquant contrôle.' },
		{ term: 'rotation', def: 'Remplacer un secret par un nouveau dans le système qu’il ouvre, et y révoquer l’ancien.' }
	],
	incident: {
		org: 'CircleCI',
		title: 'CircleCI Jan 4, 2023 security incident report',
		date: '2022-12-16',
		url: PM,
		steps: [
			{
				situation: [
					'30 décembre 2022. L’enquête montre que le token OAuth GitHub de ce client a été compromis par un tiers non autorisé. Le client a déjà réglé le problème de son côté.',
					'Tu ne sais pas si d’autres clients sont touchés. Faire la rotation de tous les tokens GitHub passe par les limites de débit de l’API GitHub et prend du temps.'
				],
				q: 'Que fais-tu maintenant ?',
				options: [
					'Tu fais la rotation des tokens OAuth GitHub de tous les clients et tu élargis l’enquête',
					'Tu fermes le dossier : le client a réglé le souci et la fuite vient peut-être de chez lui',
					'Tu envoies à ce seul client une liste des autres secrets à changer',
					'Tu coupes l’intégration GitHub pour tous les clients jusqu’à la fin de l’enquête'
				],
				answer: 0,
				why: 'Si un token gardé par CircleCI a été volé, la fuite peut venir de CircleCI, donc tous les tokens sont suspects. Le 31 décembre, "out of an abundance of caution" (par excès de prudence), CircleCI a lancé la rotation de tous les tokens OAuth GitHub. Elle s’est terminée le 7 janvier à 07:30 UTC.'
			},
			{
				situation: [
					'4 janvier 2023. L’enquête trouve le point d’entrée. Un malware sur le portable d’un ingénieur de CircleCI a volé une session SSO valide, protégée par 2FA. L’antivirus ne l’a pas détecté.',
					'Avec cette session, l’attaquant s’est fait passer pour l’ingénieur depuis un autre lieu. Pour son travail, l’ingénieur pouvait générer des tokens d’accès à la production.'
				],
				q: 'Quels accès coupes-tu, et jusqu’où ?',
				options: [
					'Tu fais changer à l’ingénieur son mot de passe SSO et enregistrer un nouvel appareil 2FA',
					'Tu coupes tous les accès de l’ingénieur, puis l’accès production de presque tout le monde',
					'Tu bloques les IP de l’attaquant au pare-feu et tu laisses tous les comptes ouverts',
					'Tu retires seulement ses tokens de production à l’ingénieur, pour qu’il continue le reste'
				],
				answer: 1,
				why: 'L’attaquant agissait en tant qu’ingénieur, donc tout ce que ce compte pouvait atteindre était exposé. CircleCI a coupé tous les accès de l’ingénieur à 16:35 UTC, puis l’accès production de presque tous les employés à 18:30 UTC, sans aucune preuve que quelqu’un d’autre était compromis.'
			},
			{
				situation: [
					'L’attaquant a atteint une partie des systèmes de production. Des données sont sorties le 22 décembre, et l’attaquant a extrait des clés de chiffrement d’un processus en cours d’exécution.',
					'Chaque machine de production que l’attaquant a touchée peut encore faire tourner quelque chose qu’il y a laissé.'
				],
				q: 'Que fais-tu des machines de production ?',
				options: [
					'Tu passes l’antivirus sur chaque machine et tu gardes celles qui sortent propres',
					'Tu redémarres toutes les machines pour tuer les processus lancés par l’attaquant',
					'Tu remplaces chaque machine peut-être exposée par une machine neuve',
					'Tu les laisses tourner et tu observes leur trafic pour voir ce que fait l’attaquant'
				],
				answer: 2,
				why: 'Ce même antivirus avait raté le malware sur le portable. CircleCI a remplacé toutes les machines de production potentiellement exposées avant 22:30 UTC le 4 janvier, et s’est dit alors "confident that we had eliminated both the attack vector and the potential of a lingering corrupted host."'
			},
			{
				situation: [
					'Les données sorties contiennent les variables d’environnement, tokens et clés des clients. Elles étaient chiffrées au repos, mais l’attaquant a les clés prises dans le processus.',
					'Tu ne peux pas voir si l’attaquant a déjà utilisé ces secrets sur les systèmes des clients.'
				],
				q: 'Que dis-tu aux clients ?',
				options: [
					'Rien pour l’instant : tu attends que l’enquête nomme les clients dont les secrets ont servi',
					'Tu préviens seulement les clients qui signalent une activité suspecte chez eux',
					'Tu dis à tous de supprimer au plus vite les secrets qu’ils ont mis dans CircleCI',
					'Tu dis à tous de considérer leurs secrets comme volés et d’en faire la rotation à la source'
				],
				answer: 3,
				why: 'Une clé supprimée de CircleCI marche toujours là où elle ouvre quelque chose. CircleCI a prévenu tout le monde à 02:30 UTC le 5 janvier, puis a écrit : "you should rotate keys at the source (the system to which they provide access) and then store the new secrets on CircleCI. Simply removing them from CircleCI is not enough."'
			},
			{
				situation: [
					'Les machines sont remplacées, et seul un tout petit groupe garde l’accès production. Ce groupe doit continuer à travailler, et une session SSO peut être volée de la même façon.'
				],
				q: 'Qu’ajoutes-tu d’abord pour ceux qui gardent l’accès production ?',
				options: [
					'Une authentification renforcée à chaque accès à la production',
					'Une reconnexion SSO une fois par jour au lieu d’une fois par semaine',
					'Une formation pour repérer les e-mails de phishing et les faux installeurs',
					'Des mots de passe SSO plus longs, d’au moins 20 caractères'
				],
				answer: 0,
				why: 'Un cookie de session volé passe outre le mot de passe et la 2FA qui l’ont précédé. CircleCI a ajouté "additional step-up authentication steps and controls" pour l’accès production, afin de bloquer l’accès "even in the case of a stolen 2FA-backed SSO session."'
			}
		],
		outcome: [
			'Le portable a été compromis le 16 décembre 2022. L’attaquant a fait du repérage le 19 décembre et exfiltré les données le 22 décembre, la dernière activité non autorisée que CircleCI a trouvée en production.',
			'CircleCI a révoqué tous les Project API Tokens le 5 janvier à 03:26 UTC, puis le 6 janvier tous les Personal API Tokens créés avant le 5 janvier. Il a fait la rotation des tokens Bitbucket avec Atlassian, et travaillé avec AWS pour prévenir les clients dont les clés AWS ont pu fuir.',
			'Au moment du rapport, moins de 5 clients avaient signalé à CircleCI un accès non autorisé à des systèmes tiers. CircleCI ne peut pas savoir combien de secrets ont servi, car ils ouvrent des systèmes qu’il ne gère pas.',
			'Les correctifs annoncés : détection et blocage du comportement de ce malware sur les portables, accès production réservé à très peu d’employés avec authentification renforcée, rotation automatique et régulière des tokens OAuth, et passage d’OAuth aux GitHub apps, aux permissions plus fines.'
		]
	},
	quiz: [
		{
			q: 'La connexion SSO de l’ingénieur exigeait la 2FA. Pourquoi la 2FA n’a-t-elle pas arrêté l’attaquant ?',
			options: [
				'L’attaquant a deviné les codes 2FA, qui ne changeaient qu’une fois par minute',
				'Le malware a volé le cookie de session émis une fois l’étape 2FA passée',
				'Le fournisseur SSO avait un bug qui permettait de sauter l’écran 2FA',
				'L’ingénieur a validé par erreur une demande 2FA envoyée par l’attaquant'
			],
			answer: 1,
			why: 'Le rapport parle de "session cookie theft". Un cookie de session prouve qu’une connexion a déjà eu lieu, 2FA comprise, donc l’attaquant n’a jamais eu à passer la 2FA.'
		},
		{
			q: 'Les secrets des clients étaient chiffrés au repos. Pourquoi l’attaquant a-t-il pu les lire quand même ?',
			options: [
				'Le chiffrement utilisait un algorithme faible, cassé hors ligne par l’attaquant',
				'Les sauvegardes copiées par l’attaquant étaient stockées sans chiffrement',
				'L’attaquant a pris les clés de chiffrement dans un processus qui les détenait',
				'Les builds qui utilisaient ces secrets les écrivaient en clair dans leurs logs'
			],
			answer: 2,
			why: 'Les clés étaient dans la mémoire d’un processus en cours, et l’attaquant avait accès à cette machine. Il a "extracted encryption keys from a running process", ce qui rendait les données copiées lisibles.'
		},
		{
			q: 'Quel changement dans tes propres pipelines laisse le moins à prendre chez un fournisseur de CI comme CircleCI ?',
			options: [
				'Utiliser des tokens OIDC pour ne stocker aucun identifiant cloud durable dans la CI',
				'Mettre chaque clé cloud dans deux projets de CI, pour en changer une à la fois',
				'Chiffrer les variables d’environnement de la CI avec ta propre phrase secrète',
				'Faire la rotation des clés stockées en CI une fois par an, avant l’audit annuel'
			],
			answer: 0,
			why: 'Avec OIDC, chaque job reçoit un token qui expire une heure après son émission, donc la CI ne garde aucun identifiant durable à voler. Première recommandation de CircleCI : "Use OIDC tokens wherever possible to avoid storing long-lived credentials in CircleCI."'
		}
	],
	recall: {
		q: 'Comment l’attaquant est-il entré dans les systèmes de production de CircleCI ?',
		a: 'Un malware sur le portable d’un ingénieur, raté par l’antivirus, a volé une session SSO protégée par 2FA le 16 décembre 2022. Cet ingénieur pouvait générer des tokens d’accès à la production.'
	},
	sources: [
		{ title: 'CircleCI, Jan 4, 2023 security incident report', url: PM },
		{ title: 'CircleCI, security alert: Rotate any secrets stored in CircleCI (mises à jour du 4 au 13 janvier 2023)', url: 'https://circleci.com/blog/january-4-2023-security-alert/' },
		{ title: 'Documentation CircleCI, Using OpenID Connect tokens in jobs', url: 'https://circleci.com/docs/guides/permissions-authentication/openid-connect-tokens/' }
	]
};
