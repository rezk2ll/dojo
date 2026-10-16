const PM = 'https://blog.cloudflare.com/cloudflare-1-1-1-1-incident-on-july-14-2025/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cloudflare-1111-2025',
	part: 'Réseau et DNS',
	title: 'Cloudflare 1.1.1.1 2025 : les préfixes du résolveur retirés par un changement de test',
	minutes: 10,
	hook: [
		'Lundi 14 juillet 2025, 21 h 52 UTC. Tu es d’astreinte chez Cloudflare. Le trafic DNS vers le résolveur public 1.1.1.1 se met à chuter, dans toutes les régions en même temps.',
		'La plupart des utilisateurs du résolveur ont configuré 1.1.1.1, 1.0.0.1 ou leurs équivalents IPv6 comme serveur DNS. Quand ces adresses ne répondent plus, navigateurs et applis ne savent plus traduire un nom en adresse. Pour beaucoup, presque tout Internet cesse de marcher.'
	],
	terms: [
		{ term: 'Préfixe', def: 'Un bloc d’adresses IP annoncé comme une seule route, par exemple `1.1.1.0/24` (les 256 adresses de 1.1.1.0 à 1.1.1.255).' },
		{ term: 'Anycast', def: 'Le même préfixe annoncé depuis beaucoup de data centers, pour que chaque utilisateur arrive au plus proche. Cloudflare sert presque tous ses services ainsi.' },
		{ term: 'Retrait BGP', def: 'Un message BGP qui prévient les voisins qu’une route vers un préfixe n’est plus disponible. Quand toutes les routes sont retirées, les paquets vers ce préfixe n’ont plus de chemin.' },
		{ term: 'Topologie de service', def: 'La liste, chez Cloudflare, des data centers où les préfixes d’un service doivent être annoncés. Les services du Data Localization Suite (DLS) s’en servent pour rester dans une seule région.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare 1.1.1.1 incident on July 14, 2025',
		date: '2025-07-14',
		url: PM,
		steps: [
			{
				situation: [
					'À 22 h 01 UTC, les alertes de santé internes du résolveur se déclenchent. Elles signalent des échecs de requêtes, de proxy et de data centers. Tu déclares un incident.',
					'Les requêtes en UDP, en TCP et en DNS over TLS ont fortement baissé. Le trafic vers les préfixes du résolveur n’arrive plus du tout aux data centers du bord.'
				],
				q: 'Que vérifies-tu en premier ?',
				options: [
					'Les logs du processus résolveur sur quelques serveurs du bord',
					'Si les routes BGP du résolveur sont encore annoncées par les serveurs',
					'Les temps de réponse des serveurs racine et des domaines de premier niveau',
					'La charge CPU des résolveurs dans les régions les plus chargées'
				],
				answer: 1,
				why: 'Un trafic qui n’arrive jamais désigne le routage, pas le logiciel du résolveur. Le postmortem : « we found the Resolver routes from servers were completely missing. »'
			},
			{
				situation: [
					'Les routes de 1.1.1.1 ont disparu des routeurs de Cloudflare, pour tous les préfixes du résolveur. Puis Cloudflare Radar signale autre chose : Tata Communications India (AS4755) annonce `1.1.1.0/24`.',
					'Vu de l’extérieur, ça ressemble trait pour trait à un détournement de préfixe. La liste des préfixes retirés est plus longue : elle contient aussi `1.0.0.0/24` et des préfixes IPv6 comme `2606:4700:4700::/48`.'
				],
				q: 'Que fais-tu de l’annonce de Tata ?',
				options: [
					'Tu en fais la piste principale et tu appelles Tata',
					'Tu la notes et tu cherches pourquoi tes propres routes ont été retirées',
					'Tu annonces des routes /25 plus précises pour reprendre 1.1.1.0/24',
					'Tu écris sur la page de statut qu’une attaque a causé la panne'
				],
				answer: 1,
				why: 'Un détournement d’un seul préfixe ne peut pas retirer, sur les serveurs de Cloudflare, les routes de tous les préfixes. Le postmortem : « this BGP hijack was not the cause of the outage. » Le retrait des routes avait rendu le détournement visible, et Cloudflare en discute avec Tata.'
			},
			{
				situation: [
					'À 21 h 48 UTC, 4 minutes avant la chute du trafic, un changement de configuration est parti pour un service DLS pas encore en production. Il rattachait à ce service un site de test hors ligne.',
					'Ce changement a déclenché un rafraîchissement de la configuration réseau dans tous les data centers. Plusieurs ingénieurs l’avaient relu. Le système qui l’a appliqué n’a pas d’étape canary.'
				],
				q: 'Comment fais-tu revenir les routes ?',
				options: [
					'Tu annules le changement de 21 h 48 pour revenir à la config précédente',
					'Tu ajoutes les préfixes de 1.1.1.1 à la main sur chaque routeur du bord',
					'Tu modifies encore le service DLS pour retirer le site de test',
					'Tu passes le résolveur sur un nouveau préfixe et tu mets la doc à jour'
				],
				answer: 0,
				why: 'La configuration précédente marchait, et revenir en arrière ne demande qu’un changement. Cloudflare a annulé à 22 h 20 UTC et a recommencé « near instantly » à annoncer les préfixes retirés. Une nouvelle modification du même service aurait été un changement de plus, non testé.'
			},
			{
				situation: [
					'Après l’annulation, le trafic de 1.1.1.1 remonte à environ 77 % de son niveau d’avant l’incident.',
					'Pendant la panne, environ 23 % des serveurs du bord ont été reconfigurés automatiquement : ils ont perdu les liaisons d’adresses IP dont le résolveur a besoin. Le système de gestion des changements les remet en place par un déploiement progressif qui prend d’habitude plusieurs heures.'
				],
				q: 'Que fais-tu des 23 % de serveurs ?',
				options: [
					'Tu laisses le déploiement normal tourner plusieurs heures',
					'Tu pousses les liaisons sur tous les serveurs d’un coup, sans test',
					'Tu testes sur les sites de test, puis tu accélères le déploiement',
					'Tu sors ces serveurs du service jusqu’au lendemain'
				],
				answer: 2,
				why: 'Au rythme normal, un quart de la flotte resterait cassé pendant des heures, et c’est un changement poussé partout sans test qui a lancé la panne. Cloudflare « accelerated the rollout of the fix after verifying the changes in testing locations ». Le trafic était normal à 22 h 54 UTC.'
			},
			{
				situation: [
					'Le service est revenu. Tu connais maintenant l’enchaînement : le 6 juin, un changement sur le même service DLS a inclus par erreur les préfixes de 1.1.1.1. Aucune route n’a bougé, donc aucun trafic n’a changé et aucune alerte n’a sonné pendant cinq semaines.',
					'Cloudflare fait tourner un ancien système d’adressage qui code en dur des listes de data centers par préfixe, et un système plus récent qui sait déployer par étapes. Cloudflare synchronise les données entre les deux.'
				],
				q: 'Que corriges-tu en premier ?',
				options: [
					'Tu exiges deux relecteurs de plus sur chaque changement de topologie',
					'Tu passes l’adressage en déploiement par étapes avec contrôles de santé',
					'Tu ajoutes une alerte sur les détournements de préfixes Cloudflare',
					'Tu donnes au résolveur une quatrième adresse IPv4 de secours'
				],
				answer: 1,
				why: 'Le changement avait déjà été « peer-reviewed by multiple engineers », et il a quand même atteint tous les data centers d’un coup. Cloudflare prévoit d’abandonner les anciens systèmes pour donner à l’adressage un « progressive and health mediated deployment ».'
			}
		],
		outcome: [
			'Le résolveur 1.1.1.1 était injoignable dans le monde entier de 21 h 52 à 22 h 54 UTC, soit 62 minutes. Gateway DNS a été dégradé par moments. Le DNS over HTTPS a presque toujours marché : la plupart des clients passent par `cloudflare-dns.com`, qui utilise d’autres adresses IP.',
			'La cause racine est l’erreur du 6 juin. Elle reliait les préfixes du résolveur à la topologie d’un service DLS pas encore actif. Le 14 juillet, un changement sur ce service a rafraîchi les routes, et la topologie du résolveur est passée « from all locations down to a single, offline location ». Tous les data centers ont retiré les préfixes de 1.1.1.1.',
			'Les alertes ont sonné à 22 h 01, 9 minutes après le début de la chute. L’annulation de 22 h 20 a ramené 77 % du trafic ; les derniers 23 % ont attendu que les serveurs du bord retrouvent leurs liaisons IP.',
			'Cloudflare annonce deux correctifs : des déploiements par étapes, avec contrôles de santé, pour les changements d’adressage, et un abandon plus rapide des anciens systèmes d’adressage.'
		]
	},
	quiz: [
		{
			q: 'Comment un changement sur un service sans utilisateurs a-t-il mis 1.1.1.1 hors ligne ?',
			options: [
				'Le site de test a envoyé tant de trafic que le résolveur a saturé',
				'Une erreur plus ancienne avait mis les préfixes du résolveur dans la topologie de ce service',
				'Le nouveau site annonçait 1.1.1.1 avec un chemin plus court et a aspiré tout le trafic',
				'Le changement a effacé les fichiers de zone du résolveur dans chaque data center'
			],
			answer: 1,
			why: 'Le 6 juin, les préfixes du résolveur ont été inclus par erreur dans la topologie du service DLS. Le changement du 14 juillet a réduit cette topologie à un site hors ligne, donc tous les autres data centers ont retiré les préfixes.'
		},
		{
			q: 'Pourquoi la plupart des utilisateurs de DNS over HTTPS n’ont-ils pas été touchés ?',
			options: [
				'Le trafic HTTPS est prioritaire sur les routeurs de Cloudflare',
				'Les clients DoH gardent chaque réponse en cache 24 heures',
				'Ils passent par `cloudflare-dns.com`, qui a d’autres adresses IP',
				'DoH ne tourne que dans les data centers qui ont gardé leurs routes'
			],
			answer: 2,
			why: 'La plupart des utilisateurs DoH configurent le nom `cloudflare-dns.com` dans leur navigateur, pas l’adresse 1.1.1.1. Ce nom pointe vers d’autres adresses, dont les préfixes n’ont jamais été retirés.'
		},
		{
			q: 'L’erreur du 6 juin est restée cinq semaines en production. Pourquoi aucune alerte ne l’a vue ?',
			options: [
				'Aucune route n’a bougé, donc le trafic n’a pas changé',
				'Les alertes du résolveur étaient coupées pour maintenance',
				'L’erreur n’existait que dans le système récent, qui n’a pas d’alertes',
				'Cloudflare n’alerte que sur les changements faits en heures de bureau'
			],
			answer: 0,
			why: 'Les alertes surveillaient le trafic et la santé, et le changement de juin ne touchait ni l’un ni l’autre. Un contrôle qui compare la topologie voulue de chaque préfixe avec celle configurée pourrait la signaler avant que le trafic bouge.'
		}
	],
	recall: {
		q: 'À quoi le changement du 14 juillet a-t-il réduit la topologie des préfixes de 1.1.1.1, et combien de temps la panne a-t-elle duré ?',
		a: 'À un seul site de data center hors ligne, donc tous les autres sites ont retiré les préfixes. Le résolveur est resté coupé 62 minutes, de 21 h 52 à 22 h 54 UTC.'
	},
	sources: [
		{ title: 'Blog Cloudflare : Cloudflare 1.1.1.1 incident on July 14, 2025', url: PM },
		{ title: 'RFC 4271 : A Border Gateway Protocol 4 (BGP-4), les routes retirées', url: 'https://www.rfc-editor.org/rfc/rfc4271#section-3.1' }
	]
};
