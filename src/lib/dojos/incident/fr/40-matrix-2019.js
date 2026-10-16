const PM = 'https://matrix.org/blog/2019/05/08/post-mortem-and-remediations-for-apr-11-security-incident/';
const JENKINS = 'https://www.jenkins.io/security/advisory/2019-01-08/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'matrix-2019',
	part: 'Sécurité',
	title: 'Matrix.org 2019 : le Jenkins pas à jour et les clés SSH transférées',
	minutes: 10,
	hook: [
		'Mardi 9 avril 2019, en fin de journée. Tu gères l’infrastructure du homeserver Matrix.org : une trentaine d’hôtes Debian, du homeserver et ses bases de données jusqu’au site web et à la CI.',
		'Un chercheur en sécurité t’envoie un message privé sur Twitter. Ce chercheur est tombé sur ton Jenkins public via Google, et ce Jenkins n’est pas à jour.',
		'Le chercheur a raison. Ton Jenkins tourne en version 2.117, et ses plugins ont été mis à jour à la main, de temps en temps. La plupart de ta CI est passée sur d’autres services, et personne n’a vu le dernier bulletin de sécurité.'
	],
	terms: [
		{ term: 'Transfert d’agent SSH', def: 'Une option SSH (`ssh -A`, ou `ForwardAgent yes`) qui permet à un serveur distant d’utiliser les clés privées de ton portable tant que tu y es connecté.' },
		{ term: 'authorized_keys', def: 'Le fichier d’un serveur qui liste les clés SSH publiques autorisées à se connecter à un compte. Par défaut, sshd lit aussi l’ancien fichier `authorized_keys2`.' },
		{ term: 'RCE', def: 'Remote code execution : un bug qui permet à quelqu’un sur le réseau d’exécuter son propre code sur ton serveur.' },
		{ term: 'Clé d’API', def: 'Une chaîne secrète qu’un script envoie à un service, ici Cloudflare, pour faire des changements sans qu’une personne se connecte.' }
	],
	incident: {
		org: 'Matrix.org',
		title: 'Post-mortem and remediations for Apr 11 security incident',
		date: '2019-04-10',
		url: PM,
		steps: [
			{
				situation: [
					'Le projet Jenkins a corrigé le 8 janvier 2019 un contournement du bac à sable de son plugin Script Security, la CVE-2019-1003000. Elle permet à un utilisateur avec la permission Overall/Read d’exécuter du code arbitraire sur le contrôleur Jenkins.',
					'Ton Jenkins est joignable depuis internet, pour que chaque contributeur voie les résultats de la CI.'
				],
				q: 'Que fais-tu le 10 avril ?',
				options: [
					'Remercier le chercheur et prévoir la mise à jour la semaine prochaine',
					'Mettre Jenkins à jour, puis chercher si la faille a servi',
					'Mettre Jenkins à jour et clore le signalement',
					'Mettre Jenkins derrière un login sans changer de version'
				],
				answer: 1,
				why: 'Le 10 avril, l’équipe a « updated the Jenkins and investigated to see if any vulnerabilities had been exploited ». Le correctif existait depuis trois mois, et une mise à jour seule n’efface pas ce que quelqu’un a pu faire pendant ce temps.'
			},
			{
				situation: [
					'Sur le serveur de build Jenkins, tu trouves une clé SSH inconnue dans `/root/.ssh/authorized_keys2`. Elle n’est pas dans ta base de clés, et `authorized_keys2` est un fichier hérité du passage de SSH1 à SSH2.',
					'Tu fouilles les autres hôtes. 19 hôtes ont la même clé dans le même fichier.'
				],
				q: 'Que fais-tu avant de retirer la clé ?',
				options: [
					'Rien : supprimer la clé sur les 19 hôtes tout de suite',
					'Redémarrer les 19 hôtes pour couper les sessions de l’attaquant',
					'Faire un snapshot des hôtes et étudier ce qu’a fait l’attaquant',
					'Changer les mots de passe root des 19 hôtes'
				],
				answer: 2,
				why: 'L’équipe a lancé l’analyse forensique et pris des « snapshots of the hosts to protect data in case the attacker realised we were aware and attempted to vandalise or cover their tracks ». Supprimer la clé tout de suite préviendrait l’attaquant, avant que tu saches ce qu’il a laissé d’autre.'
			},
			{
				situation: [
					'L’analyse montre le chemin. L’attaquant a utilisé la faille Jenkins le 13 mars, puis atteint Flywheel, un vieux Mac Pro qui servait d’esclave Jenkins, avec un port SSH ouvert sur internet. Il y a posé un piège qui attendait qu’on s’y connecte avec un agent SSH transféré.',
					'Le 4 avril à 12 h 32 GMT, un membre de l’équipe s’est connecté à Flywheel avec le transfert d’agent activé. Le piège a utilisé la clé transférée pour ajouter la clé de l’attaquant à root sur de nombreux hôtes. L’attaquant a pris la base passbolt, lu la base de production et laissé un shell root setuid dans `/usr/share/bsd-mail/shroot`.'
				],
				q: 'Comment remets-tu les hôtes en état ?',
				options: [
					'Retirer les clés et le shell trouvés, et garder les hôtes',
					'Réinstaller les 19 hôtes qui avaient la clé et garder les autres',
					'Restaurer chaque hôte depuis les sauvegardes du 1er avril',
					'Reconstruire chaque hôte de zéro, avec tous les secrets changés'
				],
				answer: 3,
				why: 'L’équipe a écrit que « the only responsible course of action when an attacker has acquired root is to salt the earth and start over afresh ». Cela voulait dire « rotating all secrets; isolating the old hosts entirely (including ones which appeared to not have been compromised, for safety) » et tout redéployer sur de nouveaux hôtes. Deux autres hôtes avaient été compromis le 5 avril, et toute restauration d’avant le 4 avril ramènerait le Jenkins compromis le 13 mars.'
			},
			{
				situation: [
					'À 1 h le 12 avril, le serveur Matrix.org principal tourne à nouveau sur de nouveaux hôtes. L’attaquant a lu la base de production, qui contient les jetons d’accès des utilisateurs et les empreintes de mots de passe, faites avec 4096 tours de bcrypt.'
				],
				q: 'Que fais-tu pour les utilisateurs ?',
				options: [
					'Supprimer tous les jetons d’accès et demander de changer les mots de passe',
					'Rien, puisqu’une empreinte bcrypt ne se renverse pas',
					'Demander de changer les mots de passe, sans toucher aux sessions',
					'Bloquer seulement les comptes des membres de l’équipe'
				],
				answer: 0,
				why: 'L’équipe n’avait « no choice but drop all access_tokens for matrix.org, to stop the attacker accessing user accounts », ce qui a déconnecté tous les utilisateurs. Elle leur a aussi demandé de changer leur mot de passe, car les empreintes « had likely been exfiltrated ». Un jeton d’accès volé marche sans le mot de passe, donc changer le mot de passe seul laisse ces sessions ouvertes.'
			},
			{
				situation: [
					'Vers 7 h le 12 avril, matrix.org affiche une page défigurée. L’inspection ne trouve pas l’attaquant sur les nouveaux hôtes. L’attaquant a utilisé l’API de Cloudflare pour faire pointer le DNS de matrix.org vers une page à lui.',
					'Tu as changé la clé d’API admin de Cloudflare pendant la reconstruction du 11 avril. Pour cela, tu t’es connecté en tant que compte admin et tu as cliqué sur `Change API Key` dans son menu Profile.'
				],
				q: 'Que vérifies-tu en premier ?',
				options: [
					'Si les nouveaux hôtes cachent une porte dérobée oubliée',
					'Si Cloudflare lui-même a été piraté',
					'Si le changement a bien touché la clé que tu visais',
					'Si les caches DNS gardent encore les anciens enregistrements'
				],
				answer: 2,
				why: 'Le bouton a changé la clé d’API personnelle de la personne connectée, pas celle du compte admin. L’équipe : « in our rush we thought we’d rotated the admin API key, but we hadn’t ». Elle s’est connectée directement en tant qu’admin, a changé la clé et a remis le DNS en place.'
			}
		],
		outcome: [
			'L’attaquant est entré par un Jenkins public qui n’avait pas le correctif de janvier 2019. Il s’est propagé par le transfert d’agent SSH : plusieurs membres de l’équipe avaient `Host *.matrix.org ForwardAgent: yes` dans leur config SSH. Le login root en SSH et le transfert d’agent étaient des réglages par défaut de Debian que personne n’avait changés depuis l’installation des hôtes en août 2017.',
			'La clé de l’attaquant était sur 19 hôtes, et deux autres hôtes ont été compromis le 5 avril. L’essentiel des accès a eu lieu entre le 4 et le 6 avril. L’attaquant a pris la base passbolt et probablement les empreintes de mots de passe de la base de production. L’équipe n’a trouvé aucune trace de modification du code source ni des paquets distribués.',
			'L’équipe a remis les services principaux en route les 11 et 12 avril, puis plus de 100 autres services par ordre de priorité. Buildkite a remplacé Jenkins, des sites statiques ont remplacé WordPress, GitLab a remplacé cgit, et la configuration est passée sous Ansible avec les secrets dans des coffres chiffrés.',
			'Côté SSH, l’équipe a désactivé le transfert d’agent sur les serveurs et retiré SSH d’internet, derrière un VPN et des bastions. Elle a commencé à déployer l’authentification à deux facteurs pour SSH, et seul Ansible gère désormais les clés, dans `/etc/ssh/authorized_keys/%u`.'
		]
	},
	quiz: [
		{
			q: 'Tu lances `ssh -A flywheel` et tu restes connecté. Que peut faire un code qui tourne sous ton utilisateur sur flywheel ?',
			options: [
				'Lire ton fichier de clé privée et le copier',
				'Rien, puisque la clé reste sur ton portable',
				'Utiliser ta clé pour se connecter à d’autres hôtes en ton nom',
				'Lire seulement les fichiers de ton répertoire personnel'
			],
			answer: 2,
			why: 'L’agent garde la clé sur ton portable et signe les connexions pour le serveur. Le post de Matrix.org : tes clés « end up available for use by the server for as long as you are logged into it, letting the server impersonate you ».'
		},
		{
			q: 'Après la reconstruction, les clés ne vivent plus que dans `/etc/ssh/authorized_keys/%u`, gérées par Ansible. Qu’est-ce que cela empêche ?',
			options: [
				'L’ajout d’une clé dans les fichiers `~/.ssh` d’un utilisateur',
				'Les attaques par force brute sur les mots de passe SSH',
				'L’usage d’une clé privée volée',
				'Les connexions SSH depuis l’extérieur du VPN'
			],
			answer: 0,
			why: 'sshd ne lit que les fichiers que nomme `AuthorizedKeysFile`. Sa valeur par défaut est `.ssh/authorized_keys .ssh/authorized_keys2`, donc avec `/etc/ssh/authorized_keys/%u`, une clé qu’un utilisateur ajoute dans son répertoire personnel n’est jamais vérifiée.'
		},
		{
			q: 'Pourquoi la défiguration a-t-elle été possible alors que l’équipe avait changé ses secrets ?',
			options: [
				'L’attaquant avait encore root sur certains des nouveaux hôtes',
				'Le bouton a changé la clé personnelle, pas la clé admin',
				'Cloudflare a restauré l’ancienne clé depuis une sauvegarde',
				'Les enregistrements DNS étaient en cache pour 24 heures'
			],
			answer: 1,
			why: 'L’équipe a cliqué sur `Change API Key` connectée en tant que compte admin, et le bouton a changé la clé personnelle de la personne connectée. L’ancienne clé admin marchait toujours, et l’attaquant s’en est servi pour rediriger le DNS.'
		}
	],
	recall: {
		q: 'Comment l’attaquant de Matrix.org est-il passé d’un esclave Jenkins à root sur de nombreux hôtes ?',
		a: 'Un piège sur l’esclave Jenkins Flywheel a détourné l’agent SSH transféré d’un membre de l’équipe le 4 avril 2019 à 12 h 32 GMT, et s’en est servi pour ajouter la clé de l’attaquant dans `/root/.ssh/authorized_keys2` sur d’autres hôtes.'
	},
	sources: [
		{ title: 'Matrix.org, Post-mortem and remediations for Apr 11 security incident', url: PM },
		{ title: 'Bulletin de sécurité Jenkins du 8 janvier 2019 (SECURITY-1266, CVE-2019-1003000)', url: JENKINS },
		{ title: 'OpenSSH, sshd_config(5), AuthorizedKeysFile', url: 'https://github.com/openssh/openssh-portable/blob/6545e6a55d4aaad0f48f2bb5c865935692ce32ea/sshd_config.5#L303-L322' }
	]
};
