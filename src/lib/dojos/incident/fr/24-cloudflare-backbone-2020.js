const PM = 'https://blog.cloudflare.com/cloudflare-outage-on-july-17-2020/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cloudflare-backbone-2020',
	part: 'Réseau et DNS',
	title: 'Cloudflare 2020 : le changement sur le routeur d’Atlanta qui a aspiré le trafic du backbone',
	minutes: 10,
	hook: [
		'Vendredi 17 juillet 2020, 20 h 25 UTC. Tu fais partie de l’équipe réseau de Cloudflare. Le lien du backbone entre Newark (EWR) et Chicago (ORD) tombe.',
		'Le backbone de Cloudflare est un ensemble de lignes privées entre ses data centers. La perte du lien provoque de la congestion sur le backbone entre Atlanta (ATL) et Washington (IAD).'
	],
	terms: [
		{ term: 'Backbone', def: 'Les lignes privées de Cloudflare entre ses data centers. Le trafic entre deux sites peut y passer au lieu de passer par l’Internet public.' },
		{ term: 'local-preference', def: 'Un attribut BGP échangé entre les routeurs d’un même réseau (iBGP). Quand deux routes mènent au même préfixe, celle qui a la valeur la plus haute gagne.' },
		{ term: 'Prefix list', def: 'Une liste nommée de préfixes IP dans la config d’un routeur. Un terme de politique qui contient `prefix-list X` dans son bloc `from` ne correspond qu’aux routes de cette liste.' },
		{ term: 'Limite maximum-prefix', def: 'Un plafond sur le nombre de préfixes qu’une session BGP accepte d’un voisin. Au-delà, le routeur coupe la session.' }
	],
	incident: {
		org: 'Cloudflare',
		title: 'Cloudflare outage on July 17, 2020',
		date: '2020-07-17',
		url: PM,
		steps: [
			{
				situation: [
					'Depuis 20 h 25, le tronçon ATL vers IAD du backbone est congestionné. Le lien Newark vers Chicago est toujours coupé.',
					'Le routeur backbone d’Atlanta annonce les routes d’Atlanta aux autres routeurs du backbone.'
				],
				q: 'Que fais-tu contre la congestion ?',
				options: [
					'Tu coupes tout le backbone jusqu’au retour du lien de Newark',
					'Tu retires du backbone une partie des routes d’Atlanta pour en sortir son trafic',
					'Tu fais passer le trafic de tous les data centers par l’Internet public',
					'Tu attends que le lien Newark vers Chicago revienne tout seul'
				],
				answer: 1,
				why: 'Sortir une partie du trafic d’Atlanta du backbone allège les liens ATL vers IAD sans toucher aux autres sites. Le postmortem : « the team had decided to remove some of Atlanta’s backbone traffic. » L’erreur est venue du changement qui a mis ce plan en œuvre.'
			},
			{
				situation: [
					'Sur le routeur `atl01`, la politique `6-BBONE-OUT` contient un terme `6-SITE-LOCAL`. Son bloc `from` contient `prefix-list 6-SITE-LOCAL`. Son bloc `then` pose `local-preference 200`, ajoute des communautés et fait `accept`.',
					'Les routes que les routeurs de bord apprennent de leurs propres nœuds de calcul ont une local-preference de 100.',
					'Le changement proposé tient en une ligne. En mode édition sur `atl01`, `show | compare` affiche : `! inactive: prefix-list 6-SITE-LOCAL { ... }`.'
				],
				q: 'Tu relis le diff. Que dis-tu ?',
				options: [
					'Tu valides : `atl01` n’annoncera plus les routes du site',
					'Tu refuses : le terme accepte maintenant toutes les routes, en 200',
					'Tu valides, en baissant la préférence à 150 dans le même changement',
					'Tu valides : une ligne inactive dans Junos n’agit qu’au redémarrage'
				],
				answer: 1,
				why: 'Sans prefix list dans `from`, le terme correspond à toutes les routes et les accepte avec une local-preference de 200, qui bat le 100 local. Le postmortem : « The correct change would have been to deactivate the term instead of the prefix-list. » Le changement a été appliqué, et la panne a commencé à 21 h 12.'
			},
			{
				situation: [
					'21 h 12 UTC. Le trafic sur le réseau de Cloudflare chute d’environ 50 %. Dans l’outil de gestion du trafic, le CPU d’Atlanta est en surcharge et celui de beaucoup d’autres data centers tombe presque à zéro.',
					'Les sites touchés sont ceux reliés au backbone, en Amérique du Nord, en Europe et au Brésil. Les autres sites tournent normalement.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Tu ajoutes des serveurs à Atlanta pour absorber le trafic en plus',
					'Tu redémarres les serveurs de bord des data centers sans trafic',
					'Tu désactives le routeur d’Atlanta pour le sortir du backbone',
					'Tu fais revenir le lien Newark vers Chicago avant tout le reste'
				],
				answer: 2,
				why: 'Les autres sites envoient leur trafic à Atlanta à cause des routes qu’annonce le routeur d’Atlanta. Sortir ce routeur du backbone retire ces routes, et le réseau de Cloudflare fonctionne sans backbone. L’équipe a désactivé le routeur d’Atlanta et le trafic est revenu à 21 h 39.'
			},
			{
				situation: [
					'De 21 h 47 à 22 h 10, un data center central qui traite les logs et les métriques est congestionné et perd une partie des logs. Le bord continue de servir. Le retour complet, logs compris, arrive à 22 h 10.',
					'Place aux correctifs. Pendant la fuite, Atlanta annonçait chaque route avec une local-preference de 200, et les routes propres à chaque site avaient 100.'
				],
				q: 'Quel changement empêche un site d’aspirer le trafic des autres ?',
				options: [
					'Exiger un deuxième relecteur sur chaque changement de routeur backbone',
					'Changer la local-preference des routes vers les serveurs de chaque site',
					'Retirer Atlanta du backbone pour de bon',
					'Passer tous les routeurs backbone sur une nouvelle version logicielle'
				],
				answer: 1,
				why: 'Si les routes vers les serveurs d’un site battent tout ce qui arrive par le backbone, une route qui fuit ne peut plus détourner son trafic. Cloudflare a déployé ce changement de local-preference juste après l’incident. Un deuxième relecteur ne change pas la route qui gagne si une fuite se reproduit.'
			}
		],
		outcome: [
			'La panne a duré 27 minutes, de 21 h 12 à 21 h 39 UTC. Le trafic a chuté d’environ 50 % sur le réseau, dans 19 sites, de San Jose à Moscou et Porto Alegre. Ce n’était pas une attaque.',
			'La cause est le changement d’une ligne sur `atl01`. Il désactivait `prefix-list 6-SITE-LOCAL` au lieu du terme. Le terme a alors envoyé toutes les routes BGP d’Atlanta à chaque routeur du backbone avec une local-preference de 200, au-dessus du 100 des routes locales de chaque site. Le trafic destiné aux nœuds de calcul locaux est parti vers Atlanta, et le routeur d’Atlanta a été submergé.',
			'Cloudflare annonce deux correctifs. La local-preference des routes vers les serveurs locaux a été changée juste après l’incident. Une limite maximum-prefix sur les sessions BGP du backbone était prévue pour le lundi 20 juillet : elle aurait coupé les sessions backbone d’Atlanta, et le réseau marche sans backbone.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi désactiver la prefix list, et non le terme, a-t-il changé les routes que le terme acceptait ?',
			options: [
				'Junos lit une prefix list inactive comme une liste vide, donc le terme ne prend rien',
				'Sans condition restante dans `from`, le terme prend toutes les routes',
				'Junos supprime tout le terme dès qu’une de ses lignes est inactive',
				'La prefix list était partagée, donc d’autres routeurs ont perdu leurs routes'
			],
			answer: 1,
			why: 'La prefix list était la seule condition du bloc `from`. Sans elle, le terme n’a plus de condition : chaque route correspond, reçoit une local-preference de 200 et est acceptée. Désactiver le terme aurait retiré la correspondance et ses actions d’un coup.'
		},
		{
			q: 'Les routeurs de bord avaient deux routes vers le même préfixe : la route locale de leurs nœuds de calcul (100) et celle d’Atlanta (200). Laquelle ont-ils prise ?',
			options: [
				'La route locale, parce que son chemin est plus court',
				'La route d’Atlanta, parce que la local-preference la plus haute gagne',
				'Les deux, en partageant le trafic dans un rapport de 100 à 200',
				'La route locale, parce qu’une route iBGP perd toujours face au local'
			],
			answer: 1,
			why: 'La RFC 4271 sur LOCAL_PREF : « The higher degree of preference MUST be preferred. » La local-preference est comparée avant la longueur du chemin, donc le 200 d’Atlanta a battu le 100 sur chaque routeur de bord.'
		},
		{
			q: 'Qu’aurait changé une limite maximum-prefix pendant cet incident ?',
			options: [
				'Elle aurait bloqué l’application du changement sur `atl01`',
				'Elle aurait coupé les sessions backbone d’Atlanta au saut du nombre de routes',
				'Elle aurait limité le débit du trafic envoyé vers Atlanta',
				'Elle aurait baissé la local-preference des routes qui fuyaient'
			],
			answer: 1,
			why: 'Une fuite de toutes les routes d’Atlanta fait passer le nombre de préfixes de chaque session backbone au-dessus du plafond. Le routeur ferme alors la session, ce qui sort Atlanta du backbone : le même effet que le correctif manuel, sans attendre un ingénieur.'
		}
	],
	recall: {
		q: 'Qu’a désactivé le changement d’une ligne sur le routeur d’Atlanta, et qu’aurait-il fallu désactiver ?',
		a: 'Il a désactivé `prefix-list 6-SITE-LOCAL` dans le terme, qui a alors envoyé toutes les routes avec une local-preference de 200. Il fallait désactiver le terme `6-SITE-LOCAL` lui-même.'
	},
	sources: [
		{ title: 'Blog Cloudflare : Cloudflare outage on July 17, 2020', url: PM },
		{ title: 'RFC 4271, section 5.1.5 : LOCAL_PREF', url: 'https://www.rfc-editor.org/rfc/rfc4271#section-5.1.5' }
	]
};
