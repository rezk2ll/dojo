const PM = 'https://status.cloud.google.com/incident/compute/16007';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'gce-ip-blocks-2016',
	part: 'Changements et configuration',
	title: 'Google Compute Engine 2016 : la config qui a retiré tous les blocs IP',
	minutes: 10,
	hook: [
		'Lundi 11 avril 2016, 18 h 14, heure du Pacifique. Tu es SRE réseau chez Google. Une alerte part : le Cloud VPN de la région asia-east1 ne marche plus.',
		'Un deuxième signal arrive. La latence entre les utilisateurs et Google Compute Engine (GCE) augmente : de plus en plus d’utilisateurs entrent chez Google par des sites loin de chez eux.',
		'Le trafic interne entre les VM GCE n’est pas touché.'
	],
	terms: [
		{ term: 'Bloc IP', def: 'Un groupe contigu d’adresses internet. Google en utilise pour les VM GCE, les répartiteurs de charge réseau et les Cloud VPN.' },
		{ term: 'BGP', def: 'Le protocole par lequel les réseaux annoncent les blocs IP qu’ils savent joindre. Google annonce chaque bloc IP de GCE depuis plusieurs sites, pour que chacun prenne le chemin le plus court.' },
		{ term: 'Étape canary', def: 'Déployer un changement sur un seul site d’abord, et vérifier que ce site marche encore avant d’aller plus loin.' },
		{ term: 'Déploiement progressif', def: 'Pousser un changement sur une fraction des sites à la fois, pour qu’une panne inédite se voie avant d’atteindre tous les sites.' }
	],
	incident: {
		org: 'Google Cloud',
		title: 'Google Compute Engine Incident #16007: Connectivity issues in all regions',
		date: '2016-04-11',
		url: PM,
		steps: [
			{
				situation: [
					'Deux choses clochent. Le Cloud VPN d’asia-east1 s’est arrêté à 18 h 14, et la latence vers GCE continue de grimper pour des utilisateurs un peu partout.',
					'Chaque bloc IP de GCE est annoncé en BGP depuis plusieurs sites. Quand un site arrête de l’annoncer, les utilisateurs partent vers le site suivant le plus proche.'
				],
				q: 'Que vérifies-tu en premier ?',
				options: [
					'Les passerelles VPN d’asia-east1, puisqu’elles sont tombées en premier',
					'Combien de sites annoncent encore les blocs IP de GCE',
					'Les VM des clients qui signalent la panne de VPN',
					'La charge des répartiteurs HTTP dans chaque région'
				],
				answer: 1,
				why: 'Si des utilisateurs partent vers des sites lointains, moins de sites annoncent GCE. Les ingénieurs enquêtaient sur "a localized failure of the asia-east1 VPN" et cherchaient encore la cause 53 minutes plus tard, à 19 h 07, quand le dernier site a cessé d’annoncer.'
			},
			{
				situation: [
					'À 19 h 08, les sondes internes lancent des dizaines d’alertes en quelques secondes. À 19 h 09, le trafic entrant depuis internet vers GCE a chuté de plus de 95 % dans toutes les régions.',
					'Tu ne connais pas encore la cause. Tu sais que des changements de configuration récents ont touché le réseau.'
				],
				q: 'Que fais-tu maintenant ?',
				options: [
					'Continuer à chercher quel changement a cassé le réseau',
					'Basculer le trafic des clients vers une région qui marche',
					'Annuler les derniers changements de configuration du réseau',
					'Relancer les sessions BGP de chaque site, région par région'
				],
				answer: 2,
				why: 'Google : les ingénieurs "decided to revert the most recent configuration changes made to the network even before knowing for sure what the problem was. This was the correct action". Toutes les régions étaient touchées, il n’y avait donc aucune région vers où basculer. La panne a pris fin à 19 h 27, 18 minutes après la perte du trafic.'
			},
			{
				situation: [
					'Il est 19 h 27 et le trafic passe de nouveau. La cause reste inconnue. C’est l’annulation des derniers changements réseau qui a rétabli le trafic.'
				],
				q: 'Et ensuite ?',
				options: [
					'Geler tous les changements de config réseau et vérifier que tout reste stable',
					'Repousser les changements annulés un par un pour trouver le fautif',
					'Clore l’incident et lancer l’analyse des causes le lendemain matin',
					'Laisser les autres équipes réseau faire leurs changements prévus'
				],
				answer: 0,
				why: 'L’équipe a "froze all configuration changes to the network" (gelé tous les changements) et a travaillé par équipes toute la nuit. D’abord vérifier que les systèmes tenaient et qu’aucun client n’était encore touché, ensuite chercher la cause. À 7 h 00 le 12 avril, elle l’avait.'
			},
			{
				situation: [
					'La cause est dans le logiciel de gestion de la configuration réseau. À 14 h 50, des ingénieurs ont retiré un bloc IP de GCE inutilisé. Le logiciel a vu le retrait dans un fichier de config, mais pas encore dans un second. Un bug lui a fait pousser une config sans aucun bloc IP de GCE.',
					'Le site canary a jugé la nouvelle config dangereuse. Un second bug a empêché ce résultat d’arriver au processus de push, qui a lancé le déploiement progressif.'
				],
				q: 'Quel nouveau contrôle aurait bloqué ce push, quels que soient les bugs ?',
				options: [
					'Un second site canary dans une autre région',
					'Un déploiement plus lent, un site par heure',
					'Une interdiction de retirer des blocs IP',
					'Comparer les annonces IP avant et après'
				],
				answer: 3,
				why: 'Google compare désormais "the IP block announcements before and after a network configuration change to ensure that they are identical in size and coverage". Un second canary rendrait son verdict au même processus de push, celui qui a perdu le résultat du premier.'
			}
		],
		outcome: [
			'À 14 h 50, des ingénieurs ont retiré un bloc IP inutilisé. Le logiciel a trouvé deux fichiers de config désynchronisés. Il est conçu pour échouer sans danger (« fail safe ») et garder sa config actuelle. Un bug lui a fait retirer tous les blocs IP de GCE de la nouvelle config et la pousser à la place.',
			'L’étape canary a signalé la config comme dangereuse, mais un second bug n’a pas transmis ce résultat au processus de push. Chaque site qui recevait la config cessait d’annoncer GCE. BGP envoyait les utilisateurs vers les sites restants, donc ils ont vu de la latence et pas d’erreurs, jusqu’à ce que le dernier site reçoive la config à 19 h 07.',
			'Les instances GCE de toutes les régions ont perdu leur connectivité externe pendant 18 minutes, de 19 h 09 à 19 h 27 (heure du Pacifique). Le Cloud VPN d’asia-east1 était coupé depuis 18 h 14. Google a offert des avoirs de 10 % de la facture mensuelle GCE et de 25 % de celle du VPN, au-delà de ce que promettent ses SLA.',
			'Google écrit que "the safeguard of a progressive rollout can be undone by a system designed to mask partial failures" : un système qui masque les pannes partielles peut annuler la protection du déploiement progressif. 14 changements techniques étaient prévus. Les premiers : surveiller les chemins réseau de GCE, comparer les annonces de blocs IP avant et après chaque changement, et vérifier que chaque config contient certains blocs IP Cloud précis.'
		]
	},
	quiz: [
		{
			q: 'Le site canary a jugé la nouvelle config dangereuse. Pourquoi le déploiement a-t-il continué ?',
			options: [
				'Le canary tournait dans une région sans trafic GCE',
				'Un bug a bloqué le résultat du canary avant le push',
				'Un ingénieur a passé outre le canary pour finir',
				'Le canary ne vérifiait que la syntaxe de la config'
			],
			answer: 1,
			why: '"A second software bug in the management software did not propagate the canary step\'s conclusion back to the push process". Le système de push a pris la config pour valide et a lancé le déploiement progressif.'
		},
		{
			q: 'Les ingénieurs ont fait le changement à 14 h 50, mais le trafic n’a chuté qu’à 19 h 09. Pourquoi les utilisateurs n’ont-ils vu aucune erreur avant ?',
			options: [
				'Chaque site attendait une heure avant d’appliquer la config',
				'La supervision était coupée pendant la fenêtre de changement',
				'BGP envoyait les utilisateurs vers les sites qui annonçaient encore GCE',
				'L’ancienne config restait en cache dans chaque VM pendant des heures'
			],
			answer: 2,
			why: 'Chaque bloc IP de GCE est annoncé depuis plusieurs sites. À mesure que des sites s’arrêtaient, BGP routait vers les autres : les utilisateurs voyaient de la latence, jusqu’au dernier site à 19 h 07. Google prévoit de surveiller "directly for a decrease in capacity or redundancy even when the system is still functioning properly."'
		},
		{
			q: 'Hors bug, que devait faire le logiciel quand deux fichiers de config ne concordent pas ?',
			options: [
				'Garder sa config actuelle et ne pas appliquer la nouvelle',
				'Appliquer le plus récent des deux fichiers',
				'Alerter un ingénieur et bloquer tous les changements réseau',
				'Fusionner les deux fichiers et pousser le résultat'
			],
			answer: 0,
			why: 'Le logiciel "is designed to ‘fail safe’ and revert to its current configuration rather than proceeding with the new configuration". Le bug a fait l’inverse : il a retiré tous les blocs IP de GCE et poussé cette config.'
		}
	],
	recall: {
		q: 'Quels deux bugs ont permis au retrait d’un seul bloc IP de couper GCE d’internet le 11 avril 2016 ?',
		a: 'Le chemin « fail safe » a retiré tous les blocs IP de GCE au lieu de garder la config actuelle, et un second bug n’a jamais transmis au processus de push le verdict « dangereux » du canary.'
	},
	sources: [
		{ title: 'Google Cloud, Google Compute Engine Incident #16007', url: PM },
		{ title: 'Google SRE Workbook, Canarying Releases', url: 'https://sre.google/workbook/canarying-releases/' }
	]
};
