const PM = 'https://web.archive.org/web/20141003124426/http://www.joyent.com/blog/postmortem-for-outage-of-us-east-1-may-27-2014';
const BOOTER = 'https://github.com/TritonDataCenter/sdc-booter/blob/acf1a7e692fa9c0e719aff1f621f5e069c2b0dd9/README.md';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'joyent-2014',
	part: 'Capacité et effets en cascade',
	title: 'Joyent 2014 : tous les serveurs de us-east-1 redémarrent d’un coup',
	minutes: 10,
	hook: [
		'Mardi 27 mai 2014, 20:13 UTC (13:13 heure du Pacifique). Tu es à l’exploitation du cloud public de Joyent. Son datacenter us-east-1 tourne sous SmartDataCenter, le logiciel de Joyent qui gère chaque serveur et les instances (VM) des clients.',
		'À 20:13, tous les serveurs de us-east-1 redémarrent au même instant. Ça comprend les serveurs du control plane, qui porte l’API de us-east-1, et toutes les instances des clients.',
		'Le control plane est conçu pour survivre à deux pannes quelconques dans le datacenter. Là, tous ses serveurs sont tombés en même temps.'
	],
	terms: [
		{ term: 'Démarrage PXE', def: 'Un serveur démarre par le réseau : il demande une adresse à un serveur DHCP et télécharge son image de démarrage en TFTP. Les nœuds de calcul de Joyent démarrent ainsi.' },
		{ term: 'Throttle', def: 'Une limite sur la quantité de travail qu’un service accepte à la fois. L’infrastructure de Joyent en a « to ensure that it cannot run away with a machine » (pour qu’elle ne monopolise pas une machine).' },
		{ term: 'Control plane', def: 'Les services de SmartDataCenter qui font tourner l’API et les séquences de démarrage. Certains de ses composants sont stateful : ils gardent des données qu’ils doivent retrouver après un redémarrage.' },
		{ term: 'Split brain', def: 'Deux parties d’un cluster se prennent chacune pour le seul leader et acceptent des écritures. Leurs données divergent, et une partie se perd.' }
	],
	incident: {
		org: 'Joyent',
		title: 'Postmortem for outage of us-east-1',
		date: '2014-05-27',
		url: PM,
		steps: [
			{
				situation: [
					'Juste après le redémarrage, tous les nœuds de calcul envoient leur requête de démarrage PXE en même temps. Le système DHCP et TFTP garde en cache ce qu’il lui faut, donc il répond même sans control plane.',
					'La contention sur l’infrastructure de démarrage TFTP est très forte. Ses throttles sont actifs, et les nœuds démarrent lentement.'
				],
				q: 'Que fais-tu contre la lenteur des démarrages ?',
				options: [
					'Tu retires les throttles de l’infrastructure de démarrage TFTP',
					'Tu gardes les throttles et tu démarres les nœuds à la main, baie par baie',
					'Tu bloques tous les nœuds clients jusqu’au retour du control plane',
					'Tu montes d’abord un second serveur TFTP et tu répartis les nœuds'
				],
				answer: 0,
				why: 'Le postmortem : « We removed the throttles when we identified this was causing the compute nodes to boot more slowly. » La plupart des instances clients sont ensuite revenues dans les 20 à 30 minutes.'
			},
			{
				situation: [
					'20:45. Environ 80 % des instances clients sont revenues. Quelques nœuds sur du matériel ancien restent en panne : ils n’ont pas obtenu de bail DHCP au démarrage.',
					'La cause est un bug connu et passager du pilote de la carte réseau de ces machines. Il touche environ 10 % de leurs démarrages.'
				],
				q: 'Que fais-tu de ces nœuds ?',
				options: [
					'Tu les laisses, puisque le client DHCP réessaie tout seul',
					'Tu redémarres encore une fois chaque nœud touché',
					'Tu déplaces tout de suite leurs instances sur du matériel récent',
					'Tu compiles et déploies d’abord un pilote réseau corrigé'
				],
				answer: 1,
				why: 'Le postmortem : « The mitigation for this is for an operator to simply initiate another reboot ». Joyent a redémarré les nœuds touchés « as soon as we identified them ». Les serveurs récents ont d’autres cartes réseau, donc seule une petite partie des nœuds avait le problème.'
			},
			{
				situation: [
					'Les instances clients reviennent, mais l’API de us-east-1 est toujours en panne. Tous ses composants stateful sont tombés au même instant.',
					'Ils n’ont pas gardé assez d’historique pour se remettre en ligne seuls.'
				],
				q: 'Comment remets-tu en route les composants stateful ?',
				options: [
					'Tu démarres chaque copie sur son état local et elles se rattraperont plus tard',
					'Tu restaures chaque composant depuis la dernière sauvegarde de la nuit',
					'Tu les rétablis à la main, pour que les copies soient d’accord avant de servir',
					'Tu les laisses éteints et tu fais tourner l’API sans eux pour l’instant'
				],
				answer: 2,
				why: 'Le postmortem : « we would rather systems be unavailable than come up "split brain" and suffer data loss as a result. » Cette reprise à la main a laissé l’API en panne jusqu’à 21:30 UTC, soit 1 heure et 17 minutes au total.'
			},
			{
				situation: [
					'L’analyse trouve ce qui s’est passé à 20:13. Un opérateur mettait à jour quelques nouveaux serveurs avec l’outil qui lance des commandes à distance sur les nœuds de calcul.',
					'La commande de redémarrage des nouveaux serveurs a été mal tapée et visait tous les serveurs du datacenter. L’outil n’a demandé aucune confirmation et les a tous redémarrés sans attendre.'
				],
				q: 'Que changes-tu en premier ?',
				options: [
					'Tu organises une formation sur l’outil pour chaque opérateur',
					'Tu fais refuser par l’outil un redémarrage de tous les serveurs d’un coup',
					'Tu retires l’outil de commandes à distance à tous les opérateurs',
					'Tu journalises chaque commande de l’outil, pour un audit plus tard'
				],
				answer: 1,
				why: 'Joyent écrit que l’outil « does not have enough input validation to prevent this from happening without extra steps/confirmation ». Premier correctif : une validation des entrées qui « will not allow for all servers, and control plane servers to be rebooted simultaneously ». Joyent prévoit aussi de revoir « what tools are necessary », pour que les outils « full power » ne soient plus le seul moyen de faire les tâches courantes.'
			}
		],
		outcome: [
			'Cause : un opérateur qui mettait à jour de nouvelles machines a mal tapé une commande de redémarrage dans l’outil de mise à jour à distance. La commande visait tous les serveurs de us-east-1, et l’outil les a tous redémarrés à 20:13 UTC.',
			'Impact : les instances clients ont été coupées au moins 20 minutes et au plus 149 minutes. 80 % sont revenues en 32 minutes, et plus de 90 % en 59 minutes. L’API est revenue à 21:30 UTC, après 1 heure et 17 minutes.',
			'Trois choses ont ralenti la reprise : les throttles TFTP, le bug de carte réseau sur le matériel ancien, et la reprise à la main des composants stateful du control plane.',
			'Les correctifs annoncés par Joyent : une validation stricte des entrées dans les outils utilisés par les humains et les systèmes, un control plane qui enregistre assez d’état sur chaque nœud pour repartir seul après un redémarrage complet, et une migration plus rapide des instances clients hors du matériel ancien.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi les throttles de démarrage ont-ils ralenti la reprise du 27 mai ?',
			options: [
				'Ils limitaient chaque nœud à un seul essai, donc un démarrage raté restait en panne',
				'Tous les serveurs demandaient à démarrer d’un coup, et les throttles en retenaient la plupart',
				'Ils bloquaient les démarrages jusqu’au retour du control plane',
				'Ils envoyaient toutes les requêtes vers un serveur TFTP d’un autre datacenter'
			],
			answer: 1,
			why: 'Les throttles servent à ce que l’infrastructure de démarrage « cannot run away with a machine ». Avec tous les serveurs du datacenter qui démarraient ensemble, Joyent a vu qu’ils ralentissaient les nœuds : « this was causing the compute nodes to boot more slowly ».'
		},
		{
			q: 'Le control plane survit à deux pannes quelconques. Pourquoi son API est-elle restée en panne plus d’une heure ?',
			options: [
				'Ses serveurs ont été les derniers du datacenter à obtenir un bail DHCP',
				'Ses composants stateful sont tous tombés ensemble, sans l’historique pour repartir',
				'L’opérateur avait effacé ses données avec la même commande mal tapée',
				'Ses serveurs tournaient sur le matériel ancien avec le bug de carte réseau'
			],
			answer: 1,
			why: 'Survivre à deux pannes suppose que les autres copies continuent de tourner. Ici, toutes les copies ont redémarré ensemble, et aucune n’avait assez d’historique pour repartir seule, donc les opérateurs les ont rétablies à la main.'
		},
		{
			q: 'Trois nœuds de base de données redémarrent ensemble après une coupure de courant. Pourquoi ne pas laisser chacun démarrer et accepter des écritures depuis ses données locales ?',
			options: [
				'Chaque nœud doit recevoir une nouvelle adresse IP avant d’accepter des écritures',
				'Plusieurs nœuds pourraient se prendre pour le leader et écrire, et leurs données divergeraient',
				'Les nœuds démarreraient trop vite et satureraient le serveur TFTP',
				'Les données locales sont toujours effacées au redémarrage, il n’y a rien à reprendre'
			],
			answer: 1,
			why: 'Le livre SRE de Google décrit ce cas : « each side (incorrectly) elects a master and accepts writes and deletions, leading to a split-brain scenario and data corruption. » Joyent a préféré une panne d’API plus longue à ce risque.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a redémarré tous les serveurs de Joyent us-east-1 le 27 mai 2014 ?',
		a: 'Un opérateur a mal tapé une commande de redémarrage dans l’outil de mise à jour à distance. Prévue pour quelques nouveaux serveurs, elle visait tous ceux du datacenter, et l’outil n’avait ni validation des entrées ni confirmation pour l’arrêter.'
	},
	sources: [
		{ title: 'Blog Joyent, Postmortem for outage of us-east-1 (28 mai 2014, copie de l’Internet Archive)', url: PM },
		{ title: 'Google SRE book, chapitre 23 : Managing Critical State (split brain)', url: 'https://sre.google/sre-book/managing-critical-state/' },
		{ title: 'README de TritonDataCenter/sdc-booter : le serveur DHCP qui démarre les nœuds de calcul', url: BOOTER }
	]
};
