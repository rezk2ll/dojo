const FB = 'https://engineering.fb.com/2021/10/05/networking-traffic/outage-details/';
const CF = 'https://blog.cloudflare.com/october-2021-facebook-outage/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'facebook-2021',
	part: 'Réseau et DNS',
	title: 'Facebook 2021 : le backbone qui a coupé son propre DNS',
	minutes: 10,
	hook: [
		'Lundi 4 octobre 2021, vers 15 h 40 UTC. Cloudflare voit un pic de changements de routes BGP venant du réseau de Facebook.',
		'Vers 15 h 50, `facebook.com`, `whatsapp.com` et `instagram.com` ne se résolvent plus. Les résolveurs DNS publics répondent `SERVFAIL` pour ces noms.',
		'Tu travailles chez Facebook. Les outils qui te serviraient à enquêter tombent eux aussi.'
	],
	terms: [
		{ term: 'Backbone', def: 'Le réseau que Facebook a construit pour relier tous ses sites de calcul, avec des liens en fibre entre chaque data center.' },
		{ term: 'BGP', def: 'Border Gateway Protocol : la façon dont les réseaux d’Internet s’annoncent les plages d’adresses IP qu’ils savent joindre.' },
		{ term: 'Serveur de noms faisant autorité', def: 'Le serveur DNS qui détient les réponses pour un domaine. Ceux de Facebook ont des adresses IP fixes que Facebook annonce en BGP.' },
		{ term: 'SERVFAIL', def: 'L’erreur DNS que renvoie un résolveur quand il n’obtient pas de réponse des serveurs de noms d’un domaine.' }
	],
	incident: {
		org: 'Facebook',
		title: 'More details about the October 4 outage',
		date: '2021-10-04',
		url: FB,
		steps: [
			{
				situation: [
					'À 15 h 58 UTC, Cloudflare constate de l’extérieur que Facebook n’annonce plus les routes de ses préfixes DNS, alors que ses autres préfixes restent routés.',
					'Tes serveurs de noms faisant autorité tournent toujours. Ils sont conçus pour retirer leurs annonces BGP quand ils ne joignent plus les data centers de Facebook.'
				],
				q: 'Où regardes-tu en premier ?',
				options: [
					'Le logiciel DNS, pour un crash ou une zone mal poussée',
					'Les graphes de trafic, pour un DDoS sur les serveurs de noms',
					'Les liens entre les sites DNS et les data centers',
					'Le registrar, pour une délégation expirée ou modifiée'
				],
				answer: 2,
				why: 'Des serveurs qui tournent mais ont retiré leurs routes renvoient au test qui déclenche ce retrait : leur lien vers les data centers. Facebook écrit que "the entire backbone was removed from operation, making these locations declare themselves unhealthy and withdraw those BGP advertisements." Résultat : "our DNS servers became unreachable even though they were still operational."'
			},
			{
				situation: [
					'Le backbone est tombé, donc les ingénieurs ne joignent plus les data centers par le réseau habituel. L’accès réseau hors bande est coupé lui aussi.',
					'Sans DNS, beaucoup d’outils internes qui servent à enquêter sur les pannes ne marchent plus.'
				],
				q: 'Comment arrives-tu jusqu’aux routeurs ?',
				options: [
					'Réessayer le VPN jusqu’à ce qu’un chemin revienne',
					'Envoyer des ingénieurs travailler sur place dans les data centers',
					'Demander à un opérateur de transit d’annoncer tes préfixes',
					'Attendre que les routeurs rechargent leur dernière config'
				],
				answer: 1,
				why: 'Tous les accès à distance passaient par le réseau en panne. Facebook a "sent engineers onsite to the data centers to have them debug the issue and restart the systems." Cela a pris du temps : les sites sont "hard to get into", et les routeurs sont "designed to be difficult to modify even when you have physical access to them".'
			},
			{
				situation: [
					'Les ingénieurs sur place confirment le problème et relancent le backbone. Vers 21 h 00 UTC, Cloudflare revoit de l’activité BGP de Facebook, avec un pic à 21 h 17.',
					'Pendant la coupure, certains data centers ont vu leur consommation électrique baisser de plusieurs dizaines de mégawatts.'
				],
				q: 'Comment rallumes-tu les services ?',
				options: [
					'Tout d’un coup, pour finir la panne au plus vite',
					'Par étapes, en suivant la charge comme dans un exercice de panne de région',
					'Une appli à la fois, en commençant par celle qui a le moins d’utilisateurs',
					'Seulement après avoir rechargé chaque cache depuis les sauvegardes'
				],
				answer: 1,
				why: 'Facebook écrit que "flipping our services back on all at once could potentially cause a new round of crashes due to a surge in traffic." Inverser d’un coup la baisse de consommation "could put everything from electrical systems to caches at risk." Ses exercices "storm", qui coupent un service, un data center ou une région, avaient appris à l’équipe à "carefully manage the increasing loads".'
			},
			{
				situation: [
					'Les services sont revenus, et l’analyse note que le durcissement de la sécurité des data centers a ralenti la reprise, pour une panne qu’aucun attaquant n’a causée.'
				],
				q: 'Que fais-tu des règles d’accès aux data centers ?',
				options: [
					'Les garder, et accepter une reprise plus lente en cas rare',
					'Supprimer les contrôles physiques pour les ingénieurs d’astreinte',
					'Donner aux routeurs une console distante sur Internet',
					'Ranger les mots de passe des routeurs dans le wiki d’astreinte'
				],
				answer: 0,
				why: 'Facebook garde le durcissement et écrit : "I believe a tradeoff like this is worth it". Le texte met en balance la sécurité de chaque jour et une reprise plus lente lors d’un événement rare. Chaque mauvaise option ouvre un accès qu’un attaquant pourrait utiliser tous les jours.'
			},
			{
				situation: [
					'Le déclencheur : une commande lancée pendant une maintenance de routine "to assess the availability of global backbone capacity". Elle a coupé toutes les connexions du backbone. Un outil d’audit aurait dû la bloquer, mais un bug l’a laissée passer.',
					'Les exercices "storm" de Facebook avaient déjà coupé des services, des data centers et des régions entières, mais jamais le backbone mondial.'
				],
				q: 'Qu’ajoutes-tu aux exercices ?',
				options: [
					'Un exercice qui redémarre un serveur DNS à la fois',
					'Un exercice qui coupe le backbone mondial',
					'Un exercice qui bascule un cluster de base de données',
					'Un exercice qui coupe le lien Internet d’un bureau'
				],
				answer: 1,
				why: 'La reprise a marché là où les exercices avaient entraîné l’équipe, et le cas du backbone n’avait jamais été répété. Facebook écrit : "we\'ve never previously run a storm that simulated our global backbone being taken offline, we\'ll certainly be looking for ways to simulate events like this moving forward."'
			}
		],
		outcome: [
			'Une commande lancée pendant une maintenance de routine, pour évaluer la capacité du backbone mondial, a coupé toutes les connexions du backbone de Facebook. L’outil d’audit censé bloquer ce genre de commande avait un bug et ne l’a pas arrêtée.',
			'Sans backbone, les sites DNS se sont déclarés en mauvaise santé et ont retiré leurs annonces BGP. Les serveurs de noms tournaient mais restaient injoignables, et plus personne sur Internet ne trouvait les serveurs de Facebook.',
			'Le résolveur de Cloudflare n’a pas pu résoudre `facebook.com` d’environ 15 h 50 à 21 h 20 UTC, soit à peu près cinq heures et demie. Les résolveurs publics ont reçu 30 fois plus de requêtes que d’habitude, parce que les applis et les gens réessayaient, parfois de façon agressive.',
			'Facebook a annoncé ses suites : renforcer les tests et les exercices, et chercher comment simuler la perte du backbone mondial dans ses exercices "storm". L’entreprise garde le durcissement des data centers qui a ralenti la reprise.'
		]
	},
	quiz: [
		{
			q: 'Les serveurs de noms de Facebook tournaient pendant la panne. Pourquoi personne ne pouvait les joindre ?',
			options: [
				'La commande avait effacé leurs fichiers de zone DNS',
				'Ils avaient retiré leurs routes BGP après la perte du backbone',
				'Les résolveurs publics bloquaient les adresses IP de Facebook',
				'Leurs certificats TLS avaient expiré pendant la panne'
			],
			answer: 1,
			why: 'Chaque site DNS arrête d’annoncer ses routes BGP quand il ne joint plus les data centers, pour sortir un site malade du service. Avec tout le backbone à terre, tous les sites se sont retirés en même temps, et Internet n’avait plus aucune route vers un serveur de noms.'
		},
		{
			q: 'Pourquoi la panne a-t-elle aussi ralenti ceux qui la réparaient ?',
			options: [
				'Leurs outils internes et leurs accès distants passaient par ce réseau et ce DNS',
				'Personne n’était d’astreinte ce lundi-là',
				'Les routeurs refusaient toute connexion pendant un contrôle de capacité',
				'Leur page de statut était hébergée sur `facebook.com`'
			],
			answer: 0,
			why: 'Les accès distants des ingénieurs, accès hors bande compris, et beaucoup d’outils internes dépendaient du backbone et du DNS en panne. La reprise demandait des gens sur place, dans des sites conçus avec une forte sécurité physique et logique.'
		},
		{
			q: 'Les résolveurs DNS publics ont reçu 30 fois leur volume habituel pendant la panne. Pourquoi ?',
			options: [
				'Les serveurs de Facebook envoyaient leur trafic aux résolveurs publics',
				'Des attaquants ont profité de la panne pour lancer un flood DNS',
				'Les résolveurs ont perdu leur cache quand les routes ont disparu',
				'Applis et utilisateurs réessayaient chaque requête en `SERVFAIL`'
			],
			answer: 3,
			why: 'Cloudflare écrit que les applis "start retrying, sometimes aggressively", et que les gens rechargent les pages ou relancent les applis. Un gros site éteint a chargé des résolveurs DNS qui servent tout le monde.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a coupé les data centers de Facebook le 4 octobre 2021, et pourquoi rien ne l’a bloqué ?',
		a: 'Une commande de maintenance destinée à évaluer la capacité du backbone mondial a coupé toutes ses connexions. L’outil d’audit qui devait l’arrêter avait un bug.'
	},
	sources: [
		{ title: 'Facebook Engineering : More details about the October 4 outage', url: FB },
		{ title: 'Facebook Engineering : Update about the October 4th outage', url: 'https://engineering.fb.com/2021/10/04/networking-traffic/outage/' },
		{ title: 'Cloudflare : Understanding how Facebook disappeared from the Internet', url: CF }
	]
};
