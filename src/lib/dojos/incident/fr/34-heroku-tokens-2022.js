const PM = 'https://www.heroku.com/blog/april-2022-incident-review/';
const STATUS = 'https://status.heroku.com/incidents/2413';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'heroku-tokens-2022',
	part: 'Sécurité',
	title: 'Heroku 2022 : des tokens OAuth GitHub volés',
	minutes: 10,
	hook: [
		'Mercredi 13 avril 2022. GitHub prévient l’équipe sécurité de Heroku d’un possible problème de sécurité repéré la veille.',
		'Le signalement de GitHub : le 9 avril, un attaquant a téléchargé une partie des dépôts GitHub privés de Heroku, avec du code source de Heroku. Il est passé par le token OAuth d’un utilisateur de Heroku.',
		'Un client de Heroku peut relier un dépôt GitHub à une app et déployer depuis ce dépôt. Pour cela, le Heroku Dashboard garde un token OAuth pour chaque client relié.'
	],
	terms: [
		{ term: 'token OAuth', def: 'Un token que GitHub remet à une app comme Heroku, pour qu’elle agisse sur les dépôts d’un utilisateur sans son mot de passe.' },
		{ term: 'compte machine', def: 'Un compte utilisé par un logiciel et non par une personne, avec son propre token, par exemple pour qu’un système interne en appelle un autre.' },
		{ term: 'haché et salé', def: 'Un mot de passe stocké comme la sortie d’une fonction à sens unique, mélangé à une valeur aléatoire propre à chaque utilisateur : deux mots de passe identiques donnent deux valeurs stockées différentes.' },
		{ term: 'config var', def: 'Un réglage Heroku que l’app lit comme une variable d’environnement. Les clients y gardent des secrets.' }
	],
	incident: {
		org: 'Heroku',
		title: 'April 2022 Incident Review',
		date: '2022-04-07',
		url: PM,
		steps: [
			{
				situation: [
					'13 avril. Tu sais quel token OAuth d’un utilisateur de Heroku l’attaquant a utilisé pour télécharger les dépôts privés. Tu ne sais pas encore comment il a été volé.'
				],
				q: 'Que fais-tu en premier ?',
				options: [
					'Tu demandes à GitHub les journaux d’audit complets et tu attends avant d’agir',
					'Tu passes tous les dépôts de Heroku en lecture seule sur GitHub jusqu’à la fin',
					'Tu désactives tout de suite le token OAuth et le compte GitHub de cet utilisateur',
					'Tu écris à tous les employés pour qu’ils changent leur mot de passe GitHub'
				],
				answer: 2,
				why: 'Ce token est la seule porte d’entrée connue de l’attaquant. Heroku l’a coupé "within three hours" (en moins de trois heures) après l’alerte de GitHub, puis a cherché comment il avait été compromis.'
			},
			{
				situation: [
					'GitHub signale aussi que l’attaquant liste des comptes GitHub de clients avec des tokens OAuth émis pour l’intégration du Heroku Dashboard. Ces tokens peuvent donner un accès en lecture et en écriture aux dépôts reliés.',
					'15 avril. Tu préviens les clients et tu leur conseilles de déconnecter eux-mêmes Heroku de GitHub. Tu ne sais toujours pas comment l’attaquant a eu les tokens des clients.'
				],
				q: 'Que fais-tu des tokens des clients ?',
				options: [
					'Tu révoques tous les tokens de l’intégration Heroku et tu n’en émets plus',
					'Tu révoques seulement les tokens des clients qui signalent une activité bizarre',
					'Tu gardes les tokens et tu logues chaque appel pour repérer les abus',
					'Tu attends que GitHub envoie la liste des tokens utilisés par l’attaquant'
				],
				answer: 0,
				why: 'Heroku ne peut pas savoir quels tokens stockés l’attaquant détient, donc tous sont suspects. Le 16 avril à 17 h, heure du Pacifique, il avait révoqué tous les tokens et bloqué les nouveaux. Le prix : plus de déploiement depuis GitHub par le Dashboard ou l’automatisation, plus de nouvelles Review Apps, plus de nouveaux runs Heroku CI.'
			},
			{
				situation: [
					'23 avril. Les clients ne peuvent toujours pas déployer depuis GitHub. Heroku n’a pas fini son enquête et ne sait pas quand la reconnexion sera sûre.'
				],
				q: 'Que leur dis-tu ?',
				options: [
					'Que l’intégration revient sous 48 heures, pour qu’ils s’organisent',
					'Qu’ils peuvent reconnecter GitHub à leurs risques avec un nouveau token',
					'Qu’elle revient bientôt, sans date, et de surveiller la page de statut',
					'De déployer autrement, par exemple avec `git push heroku main`, sans attendre'
				],
				answer: 3,
				why: 'Une date que tu ne peux pas tenir laisse les clients bloqués quand elle glisse. Le 23 avril, Heroku a écrit qu’il ne reconnecterait pas "until we are certain that we can do so safely, which may take some time", et a renvoyé vers `git push heroku main`. L’intégration est revenue le 25 mai.'
			},
			{
				situation: [
					'L’enquête trouve la première porte d’entrée : un token compromis d’un compte machine de Heroku. L’attaquant l’a trouvé dans un dépôt GitHub privé archivé, qui contenait du code source de Heroku.',
					'L’attaquant a sans doute atteint ce dépôt par une intégration tierce reliée au dépôt. Heroku ne peut pas confirmer laquelle.'
				],
				q: 'Que fais-tu de ce compte machine ?',
				options: [
					'Tu supprimes le dépôt archivé pour que personne ne relise le token',
					'Tu fais la rotation de son token et des identifiants des autres comptes critiques',
					'Tu déplaces le dépôt archivé dans une organisation GitHub sans intégration',
					'Tu actives la protection de branche pour que personne ne pousse sur ce dépôt'
				],
				answer: 1,
				why: 'L’attaquant a déjà une copie du token : cacher le dépôt ne change rien tant que le token marche. Heroku a "disabled or rotated credentials of other critical accounts" et a commencé à passer en revue ses intégrations tierces, en retirant celles "not aligned with our security standards".'
			},
			{
				situation: [
					'Le même token de compte machine a servi à exfiltrer des données de la base des noms d’utilisateur et mots de passe des clients. Heroku stocke ces mots de passe hachés et salés.',
					'Tous les clients n’ont pas activé l’authentification multifacteur (MFA) sur leur compte Heroku.'
				],
				q: 'Que fais-tu des mots de passe des clients ?',
				options: [
					'Rien, des mots de passe hachés et salés ne peuvent pas être lus',
					'Tu réinitialises les mots de passe des clients sans MFA, et seulement eux',
					'Tu réinitialises le mot de passe de chaque client et tu renouvelles les accès touchés',
					'Tu envoies aux clients un conseil de changer leur mot de passe s’ils le veulent'
				],
				answer: 2,
				why: 'Avec les hachés, un attaquant peut tester des mots de passe hors ligne, aussi vite que son matériel le permet. Heroku a réinitialisé tous les comptes clients le 5 mai "due to not all of the customers having multi-factor authentication (MFA) enabled at the time and potential for password reuse."'
			}
		],
		outcome: [
			'Le 7 avril 2022, un attaquant a utilisé un token compromis d’un compte machine de Heroku pour atteindre une base de Heroku et télécharger les tokens OAuth GitHub des clients. Le 8 avril, il a listé des métadonnées des dépôts clients, et le 9 avril il a téléchargé les dépôts privés de Heroku.',
			'D’après GitHub, l’attaquant a aussi cloné des dépôts privés d’un petit nombre de clients. Le 7 avril, il a aussi téléchargé une base de config vars de pipeline pour Review Apps et Heroku CI, découverte le 16 mai et signalée aux clients touchés le 18 mai.',
			'L’attaquant a atteint les config vars chiffrées des apps Heroku, mais il "did not access the encryption key necessary to decrypt config var secrets." Heroku n’a aucune trace d’accès non autorisé à ses systèmes après le 14 avril 2022.',
			'Heroku parle d’une attaque de type supply chain. Il a gelé les changements en production, fait tourner et rechiffré identifiants et clés, éteint les systèmes non essentiels, et rétabli l’intégration GitHub avec de nouveaux tokens le 25 mai.'
		]
	},
	quiz: [
		{
			q: 'Que pouvait faire l’attaquant avec le token OAuth volé d’un client de l’intégration Heroku ?',
			options: [
				'Se connecter au compte Heroku du client et modifier ses apps',
				'Lire et peut-être modifier les dépôts GitHub du client reliés à Heroku',
				'Lire les config vars du client en appelant l’API de Heroku avec le token',
				'Réinitialiser le mot de passe GitHub du client par la page de récupération'
			],
			answer: 1,
			why: 'Le token est un identifiant GitHub que Heroku gardait. La page de statut de Heroku : "The compromised tokens could provide the threat actor access to customer GitHub repos, but not customer Heroku accounts."'
		},
		{
			q: 'Les mots de passe volés étaient hachés et salés. Pourquoi Heroku les a-t-il quand même tous réinitialisés ?',
			options: [
				'Le sel était dans la même table, ce qui rendait les hachés lisibles',
				'La fonction de hachage était MD5, que n’importe qui inverse en quelques secondes',
				'GitHub avait demandé à chaque intégrateur de réinitialiser les mots de passe',
				'Certains clients n’avaient pas de MFA, et un mot de passe deviné peut servir ailleurs'
			],
			answer: 3,
			why: 'Avec les hachés, un attaquant peut tester des mots de passe hors ligne, un sel à la fois. Un mot de passe deviné ouvre directement un compte sans MFA, et marche sur les autres sites où le client l’a réutilisé.'
		},
		{
			q: 'L’attaquant a aussi atteint les config vars chiffrées de Heroku. Pourquoi n’a-t-il pas pu lire les secrets ?',
			options: [
				'Il n’a jamais eu la clé de chiffrement qui déchiffre les config vars',
				'Heroku a supprimé les config vars avant que l’attaquant les copie',
				'Les config vars étaient dans une région que l’attaquant ne pouvait pas atteindre',
				'Chaque config var expirait une heure après sa création, avant la copie'
			],
			answer: 0,
			why: 'Le chiffrement au repos ne protège les données que tant que la clé reste hors de portée de l’attaquant. La page de statut de Heroku : l’attaquant "did not access the encryption key necessary to decrypt config var secrets."'
		}
	],
	recall: {
		q: 'Comment l’attaquant est-il entré dans l’environnement de Heroku en avril 2022 ?',
		a: 'Avec le token compromis d’un compte machine de Heroku, trouvé dans un dépôt GitHub privé archivé de code source Heroku, sans doute atteint par une intégration tierce.'
	},
	sources: [
		{ title: 'Heroku, April 2022 Incident Review (14 juin 2022)', url: PM },
		{ title: 'Heroku Status, incident 2413 : Heroku Security Notification (mises à jour du 15 avril au 14 juin 2022)', url: STATUS },
		{ title: 'OWASP, Password Storage Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html' }
	]
};
