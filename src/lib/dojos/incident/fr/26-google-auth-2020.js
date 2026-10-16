const PM = 'https://status.cloud.google.com/incident/zall/20013';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'google-auth-2020',
	part: 'Capacité et effets en cascade',
	title: 'Google 2020 : le User ID Service à court de quota',
	minutes: 10,
	hook: [
		'Lundi 14 décembre 2020, 03:43 heure du Pacifique. Une alerte automatique de capacité se déclenche sur le Google User ID Service. Ce service garde l’identifiant de chaque compte Google et gère les identifiants derrière les jetons OAuth et les cookies.',
		'À 03:46, une deuxième alerte arrive : des erreurs sur le même service. À 03:48, ton pager sonne, une minute après le début de l’impact pour les clients.',
		'Gmail, Agenda, Docs, la Cloud Console et BigQuery renvoient des erreurs 5xx sur presque toutes les requêtes qui demandent un compte Google connecté. Beaucoup de tes outils internes renvoient les mêmes erreurs.'
	],
	terms: [
		{ term: 'Quota', def: 'La quantité d’une ressource, ici le stockage de la base des comptes, qu’un service a le droit d’utiliser. Chez Google, des outils automatiques fixent ces quotas.' },
		{ term: 'Délai de grâce', def: 'Le temps qui sépare une nouvelle décision de quota du moment où le système de quotas l’applique.' },
		{ term: 'Paxos', def: 'Un protocole où une majorité de processus doit accepter chaque proposition avant qu’elle soit validée. La base du User ID Service l’utilise, avec un processus leader qui fait les écritures.' },
		{ term: 'Donnée périmée', def: 'Une lecture qui peut manquer les dernières écritures. Le User ID Service refuse ces lectures, « for security reasons » (pour des raisons de sécurité).' }
	],
	incident: {
		org: 'Google',
		title: 'Google Cloud Infrastructure Components Incident #20013',
		date: '2020-12-14',
		url: PM,
		steps: [
			{
				situation: [
					'03:48. La délivrance des identifiants et la lecture des métadonnées échouent pour tous les comptes Google. Sans elles, Google ne sait plus si une requête vient d’un utilisateur connecté.',
					'Tu as deux alertes ouvertes. L’alerte de capacité sur le User ID Service date de 03:43. L’alerte d’erreurs sur ce même service date de 03:46.'
				],
				q: 'Que regardes-tu en premier ?',
				options: [
					'L’alerte de 03:43 : quelle limite le service a atteinte et ce qui l’a baissée',
					'Le dernier déploiement de Gmail, car ses utilisateurs signalent le plus d’erreurs',
					'Les répartiteurs de charge devant les comptes Google, d’où partent souvent les 5xx',
					'Les courbes de trafic, pour trouver un pic de connexions qui sature le service'
				],
				answer: 0,
				why: 'L’alerte de capacité est arrivée trois minutes avant les erreurs, sur le service en panne. Le rapport : « The scope of the problem was immediately clear as the new quotas took effect. » L’équipe tenait la cause et un correctif possible à 04:08, 20 minutes après l’appel.'
			},
			{
				situation: [
					'04:08. Un système automatique de quotas a baissé le quota de stockage de la base des comptes. Pour ce système, le User ID Service consomme 0.',
					'Avec ce quota réduit, le leader Paxos de la base ne peut plus écrire. La plupart des lectures sont périmées et le service les refuse. Le correctif proposé : désactiver l’application des quotas pour cette base.'
				],
				q: 'Comment appliques-tu le correctif ?',
				options: [
					'Dans un seul datacenter d’abord, tu regardes les erreurs, puis dans tous les autres',
					'Dans tous les datacenters d’un coup, puisque tous les utilisateurs sont coupés',
					'Tu fixes le quota à la main : la consommation mesurée plus 50 % de marge',
					'Tu laisses le service accepter les lectures périmées jusqu’au retour des écritures'
				],
				answer: 0,
				why: 'L’équipe a désactivé les quotas dans un datacenter à 04:22, a vu que ça « quickly improved the situation », puis l’a fait partout à 04:27. Les erreurs étaient normales à 04:33 : vérifier d’abord a coûté 5 minutes. La consommation mesurée vaut 0, donc une marge dessus ne donne aucun quota, et le refus des lectures périmées est voulu.'
			},
			{
				situation: [
					'Les clients cherchent des nouvelles sur les pages de statut de Google Cloud et de Google Workspace. Le support Cloud y publie avec des outils internes.',
					'Ces outils internes tombent avec les mêmes erreurs. Les clients ne peuvent ni créer ni consulter de ticket dans la Cloud Console.'
				],
				q: 'Comment préviens-tu les clients ?',
				options: [
					'Tu attends que le correctif soit en place, puis tu publies un seul message complet',
					'Tu publies par un canal dont la connexion ne passe pas par les comptes Google',
					'Tu relances l’outil de la page de statut jusqu’à ce qu’une connexion passe',
					'Tu demandes aux clients d’ouvrir un ticket pour répondre à chacun'
				],
				answer: 1,
				why: 'Les outils internes sont tombés avec le User ID Service. Le rapport dit que ça « delayed our ability to share outage communications », et le premier message est parti à 05:34, après la fin de l’impact. Le correctif 3 du rapport vise des outils de communication qui marchent « during outages that affect internal tools ».'
			},
			{
				situation: [
					'04:33. Le taux d’erreurs du User ID Service est revenu à la normale. La plupart des produits se rétablissent seuls en quelques minutes.',
					'La mesure de 04:27 est en place : l’application des quotas est désactivée dans tous les datacenters.'
				],
				q: 'Que fais-tu maintenant ?',
				options: [
					'Tu fermes l’incident et tu planifies le postmortem',
					'Tu gardes l’incident ouvert et tu vérifies les erreurs restantes de chaque produit',
					'Tu réactives les quotas, puisque le service va bien',
					'Tu demandes à toutes les équipes clientes de rejouer leurs requêtes en échec tout de suite'
				],
				answer: 1,
				why: 'Plusieurs produits échouaient encore après 04:33. Google Agenda et la console d’administration Workspace ont renvoyé des erreurs jusqu’à 05:21 « due to a traffic spike following initial recovery », et des utilisateurs de Gmail ont vu des erreurs en cache jusqu’à une heure. Le rapport range « fixing the underlying cause » dans le travail à faire, donc la consommation à 0 n’était pas encore corrigée.'
			},
			{
				situation: [
					'La revue de l’outil de quotas trouve quatre garde-fous censés bloquer une mauvaise baisse. Le premier bloque les changements qui touchent beaucoup d’utilisateurs. Le deuxième bloque un quota sous la consommation. Le troisième bloque les grosses baisses sur les systèmes de stockage, le quatrième les quotas très bas.',
					'Aucun ne s’est déclenché. Le changement visait un seul service, et sa consommation mesurée valait 0.'
				],
				q: 'Quelle règle ajoutes-tu d’abord à l’outil de quotas ?',
				options: [
					'Abaisser le seuil « beaucoup d’utilisateurs » pour qu’un seul service compte',
					'Doubler la durée du délai de grâce avant l’application',
					'Bloquer toute baisse quand un service chargé annonce soudain 0 de consommation',
					'Exiger qu’une baisse de quota reste au-dessus de la consommation mesurée'
				],
				answer: 2,
				why: 'Le rapport : les garde-fous « did not cover the scenario of zero reported load for a single service ». La règle sur la consommation existait déjà et est passée, car elle comparait à 0. Un délai de grâce plus long retarde seulement la baisse, puisque aucune alerte n’a sonné pendant le premier.'
			}
		],
		outcome: [
			'Cause : en octobre, Google a inscrit le User ID Service dans un nouveau système de quotas. Des morceaux de l’ancien système sont restés et annonçaient une consommation de 0. À la fin du délai de grâce, l’outil automatique a baissé le quota de la base des comptes.',
			'Le leader Paxos de la base n’a plus pu écrire. Peu après, la plupart des lectures étaient périmées et le User ID Service les refusait, donc les vérifications d’authentification échouaient.',
			'Impact : de 03:46 à 04:33 heure du Pacifique, soit 47 minutes, Google a renvoyé des erreurs 5xx sur presque tout le trafic authentifié. Toutes les applis Google Workspace authentifiées étaient coupées. Les requêtes de streaming BigQuery échouaient à environ 75 %, et environ 15 % des requêtes Cloud Storage ont échoué.',
			'Une correction du 22 décembre ajoute que « some operations with Cloud service accounts experienced elevated error rates ». Le premier rapport disait que les comptes de service n’étaient pas touchés.',
			'Les correctifs annoncés par Google : revoir l’outil de quotas « to prevent fast implementation of global changes », repérer plus tôt les configurations fausses, pouvoir communiquer quand les outils internes tombent, rendre la base du User ID Service plus résistante aux échecs d’écriture, et limiter l’impact sur les data planes de Google Cloud quand le User ID Service tombe.'
		]
	},
	quiz: [
		{
			q: 'La baisse de quota a bloqué les écritures dans la base des comptes. Pourquoi les connexions, qui font surtout des lectures, ont-elles échoué ?',
			options: [
				'Les lectures comptent aussi dans le quota de stockage, donc elles ont été refusées',
				'Sans nouvelles écritures, la plupart des lectures étaient périmées, et le service les refuse',
				'Le leader Paxos sert aussi toutes les lectures, et il a planté quand ses écritures ont échoué',
				'Chaque connexion écrit un nouveau cookie, donc elle échoue avec les écritures'
			],
			answer: 1,
			why: 'Le User ID Service refuse une requête « when it detects outdated data », pour la sécurité. Dès que le leader Paxos n’a plus pu écrire, la plupart des lectures étaient périmées, et le service les a refusées.'
		},
		{
			q: 'Le changement de quota date d’octobre. Pourquoi les utilisateurs ne l’ont-ils senti que le 14 décembre ?',
			options: [
				'Le nouveau système de quotas a mis deux mois à collecter les données de consommation',
				'Un délai de grâce a retardé l’application, et aucune alerte n’a sonné pendant ce délai',
				'Le trafic d’octobre était trop faible pour atteindre le quota réduit',
				'Le changement d’octobre attendait la fenêtre de déploiement de décembre'
			],
			answer: 1,
			why: 'Le rapport : « An existing grace period on enforcing quota restrictions delayed the impact, which eventually expired ». Le garde-fou sur les grosses baisses de stockage n’a pas joué, « since no alert fired during the grace period ».'
		},
		{
			q: 'Ta page de statut et ton outil de support se connectent tous les deux par le SSO de ton entreprise. Que te pousse à changer cet incident ?',
			options: [
				'Ajouter un deuxième serveur SSO dans le même cluster que le premier',
				'Donner à la page de statut une connexion qui n’utilise pas ton SSO',
				'Monter le quota du SSO pour que la page de statut ait toujours de la place',
				'Garder en cache les jetons SSO de la page de statut pendant une heure'
			],
			answer: 1,
			why: 'Google n’a pas pu mettre à jour ses pages de statut avant 05:34, car ses outils internes tombaient avec les mêmes erreurs. L’outil qui annonce une panne aux clients doit marcher quand c’est son propre fournisseur de connexion qui est en panne.'
		}
	],
	recall: {
		q: 'Pourquoi l’outil automatique de quotas a-t-il baissé le quota du User ID Service le 14 décembre 2020 ?',
		a: 'Après une migration en octobre, un reste de l’ancien système de quotas annonçait une consommation de 0. À la fin du délai de grâce, l’outil a baissé le quota, et le leader Paxos de la base des comptes n’a plus pu écrire.'
	},
	sources: [
		{ title: 'Google Cloud Status Dashboard, Google Cloud Infrastructure Components Incident #20013 (déclaration préliminaire, rapport complet et correction)', url: PM },
		{ title: 'Google SRE book, chapitre 23 : Managing Critical State, Distributed Consensus for Reliability (Paxos)', url: 'https://sre.google/sre-book/managing-critical-state/' }
	]
};
