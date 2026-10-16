const PM = 'https://about.roblox.com/newsroom/2022/01/roblox-return-to-service-10-28-10-31-2021';
const BBOLT = 'https://github.com/etcd-io/bbolt/blob/a4ef19710eb7ddc41fd1155336baf331b5c57ba8/README.md#L885-L890';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'roblox-2021',
	part: 'Les données',
	title: 'Roblox 2021 : la panne Consul de 73 heures',
	minutes: 10,
	hook: [
		'Jeudi 28 octobre 2021, 13:37. Roblox fait tourner plus de 18 000 serveurs et 170 000 conteneurs dans ses propres datacenters. Vault est lent, et un serveur Consul a une forte charge CPU. Les joueurs ne voient encore rien.',
		'Consul sert de registre de services : chaque service Roblox lui demande où tournent les services qu’il appelle. Nomad en a besoin pour placer les conteneurs, et Vault pour distribuer les secrets de production.',
		'Les métriques de Consul montrent une latence médiane d’écriture de 2 secondes dans son stockage clé/valeur. D’habitude, elle reste sous 300 ms.'
	],
	terms: [
		{ term: 'Consul', def: 'Le registre de services et stockage clé/valeur de HashiCorp. Chez Roblox, 5 serveurs votants portent l’état et 5 non-votants servent des lectures en plus.' },
		{ term: 'Leader Raft', def: 'Le votant qui réplique chaque écriture vers les autres votants et décide quand elle est validée. Consul l’élit avec l’algorithme Raft.' },
		{ term: 'Streaming', def: 'Une fonction de Consul 1.10 pour diffuser les mises à jour dans le cluster, conçue pour consommer moins de CPU et de bande passante que le long polling.' },
		{ term: 'Freelist', def: 'La liste des pages du fichier BoltDB qui contenaient des données effacées et peuvent resservir. Le fichier lui-même ne rétrécit jamais.' }
	],
	incident: {
		org: 'Roblox',
		title: 'Roblox Return to Service 10/28-10/31 2021',
		date: '2021-10-28',
		url: PM,
		steps: [
			{
				situation: [
					'De 13:37 à 16:00 le 28 octobre. Un serveur Consul a une forte charge CPU, et la latence médiane d’écriture clé/valeur est de 2 secondes au lieu de moins de 300 ms.',
					'À l’échelle de Roblox, le matériel tombe souvent en panne, et Consul survit à un serveur mort. Un serveur lent mais encore en ligne peut en revanche ralentir tout le cluster.'
				],
				q: 'Que tentes-tu en premier ?',
				options: [
					'Remplacer le serveur Consul à forte charge CPU',
					'Redémarrer tous les serveurs Consul d’un coup',
					'Restaurer Consul depuis le snapshot d’hier',
					'Ajouter 5 serveurs non-votants pour les lectures'
				],
				answer: 0,
				why: 'Les indices désignaient un serveur, et l’équipe "began the process of replacing one of the Consul cluster nodes." Ça n’a pas suffi : "At 16:35, the number of online players dropped to 50% of normal." À 19:00, l’essentiel du cluster tournait sur de nouvelles machines à 128 cœurs, et les écritures prenaient toujours environ 2 secondes.'
			},
			{
				situation: [
					'02:00 le 29 octobre. Roblox est entièrement à l’arrêt. Le leader Consul se désynchronise souvent des autres votants. L’équipe va arrêter Consul et le remettre dans l’état d’un snapshot pris quelques heures plus tôt, au début de la panne.',
					'Aucun joueur n’est connecté, mais les services internes de Roblox continuent d’envoyer lectures et écritures à Consul pour la découverte de services et les health checks.'
				],
				q: 'Comment remets-tu en route le cluster restauré ?',
				options: [
					'Bloquer les clients avec iptables, puis rouvrir le trafic de façon contrôlée',
					'Tout démarrer d’un coup et laisser les services internes se reconnecter',
					'Démarrer d’abord les votants, puis les non-votants une heure après',
					'Restaurer le snapshot sur les anciens serveurs à 64 cœurs'
				],
				answer: 0,
				why: 'L’équipe craignait que la charge interne "might immediately push the cluster back into an unhealthy state", et a donc "configured iptables on the cluster to block access." La restauration s’est bien passée, mais une fois le blocage levé, la latence médiane d’écriture est remontée à 2 secondes.'
			},
			{
				situation: [
					'04:00 le 29 octobre, plus de 14 heures de panne. Le matériel plus rapide n’a rien changé, la restauration non plus. Toujours aucun trafic utilisateur, et Consul reste lent.',
					'Des milliers de conteneurs essaient de se reconnecter à Consul. Beaucoup de services tournent avec des centaines d’instances, et les health checks partent toutes les 60 secondes.'
				],
				q: 'Que fais-tu ensuite ?',
				options: [
					'Réduire l’usage de Consul au strict nécessaire, puis remonter les services peu à peu',
					'Restaurer Consul depuis un snapshot plus ancien, de la veille',
					'Monter un second cluster Consul et y répartir la moitié des services',
					'Augmenter les timeouts Raft pour que le leader reste synchronisé'
				],
				answer: 0,
				why: 'L’équipe a coupé "all non-essential usage", ramené des services "to single digits" et espacé les health checks "from 60 seconds to 10 minutes". Elle a relancé à 16:00. À 02:00 le 30 octobre, Consul allait de nouveau mal, avec bien moins de charge. La charge des services Roblox n’était pas la seule cause.'
			},
			{
				situation: [
					'02:00 le 30 octobre, 36 heures de panne. Le matériel, l’état du cluster et la charge des services Roblox ont chacun été écartés comme cause unique.'
				],
				q: 'Où cherches-tu maintenant ?',
				options: [
					'Dans Consul : logs de debug, métriques système, rapports perf, flame graphs',
					'Dans le réseau : pertes de paquets entre les serveurs Consul',
					'Côté services : quel client envoie le plus de requêtes à Consul',
					'Dans les logs d’audit de Vault, puisque Vault a ralenti en premier'
				],
				answer: 0,
				why: 'L’équipe "started looking at Consul internals for clues." Les données montraient des écritures clé/valeur "getting blocked for long periods of time". Elle a d’abord essayé de revenir à des serveurs à 64 cœurs, sans effet. Puis les rapports perf ont montré l’essentiel du temps "in kernel spin locks via the Streaming subscription code path."'
			},
			{
				situation: [
					'Vers midi le 30 octobre. Roblox a activé le streaming de Consul sur quelques services il y a des mois, puis sur d’autres au fil du temps. Le 27 octobre à 14:00, la veille de la panne, il a été activé sur le service de routage du trafic, avec 50 % de nœuds de routage en plus.'
				],
				q: 'Que changes-tu ?',
				options: [
					'Couper le streaming sur tous les systèmes Consul',
					'Couper le streaming sur le service de routage seulement',
					'Retirer les 50 % de nœuds de routage ajoutés',
					'Passer Consul au dernier correctif de la 1.10'
				],
				answer: 0,
				why: 'L’équipe a "disabled the streaming feature for all Consul systems, including the traffic routing nodes." Le changement était déployé à 15:51, et la latence médiane d’écriture est tombée à 300 ms. Certains leaders restaient lents : l’équipe a empêché ces serveurs de rester élus et est passée au retour des services.'
			}
		],
		outcome: [
			'Deux problèmes dans Consul ont causé la panne. Sous une très forte charge en lecture et en écriture, le streaming concentrait la contention sur un seul canal Go, ce qui bloquait les écritures. Les serveurs à 128 cœurs étaient des bi-sockets à mémoire NUMA, et la contention y était pire.',
			'Les leaders lents venaient de BoltDB, la bibliothèque où Consul garde son journal Raft. Un log store de 4,2 Go examiné par l’équipe contenait 489 Mo de données, et sa freelist comptait près d’un million de pages libres. À chaque ajout au journal, de 16 ko ou moins, BoltDB réécrivait une freelist de 7,8 Mo. L’équipe a compacté la base avec les outils de BoltDB et prévu de passer à son successeur, bbolt.',
			'Le retour a pris encore un jour. Le système de cache, qui traite 1 milliard de requêtes par seconde, a dû être redéployé de zéro. Les joueurs sont revenus par pilotage DNS, par paliers d’environ 10 %, en surveillant la charge des bases et des caches. Le dimanche 31 octobre à 16:45, 73 heures après le début, tous les joueurs avaient accès au jeu.',
			'Le monitoring qui aurait aidé dépendait lui aussi de Consul. Roblox a supprimé cette dépendance : la télémétrie ne repose plus sur les systèmes qu’elle surveille. L’entreprise a aussi mis les services critiques sur leurs propres clusters Consul, effacé des données clé/valeur obsolètes et équipé un second datacenter pour les services backend.'
		]
	},
	quiz: [
		{
			q: 'L’équipe a passé Consul sur des serveurs à 128 cœurs pour tenir la charge. Pourquoi ça n’a pas aidé ?',
			options: [
				'Le streaming se bloquait sur un seul canal Go, et les bi-sockets NUMA aggravaient la contention',
				'Les nouveaux serveurs avaient des disques plus lents, donc chaque écriture Raft traînait',
				'Consul n’utilise qu’un seul cœur, donc les autres restaient inactifs pendant la panne',
				'Les nouveaux serveurs demandaient un snapshot neuf, qui a effacé la config du cluster'
			],
			answer: 0,
			why: 'Sous une très forte charge en lecture et en écriture, le streaming bloquait les écritures sur un seul canal Go. Les serveurs à 128 cœurs étaient des bi-sockets à mémoire NUMA : "The additional contention on shared resources thus got worse under this architecture." Les nouvelles machines avaient en plus des disques NVMe plus rapides.'
		},
		{
			q: 'Pourquoi un journal BoltDB de 489 Mo de données rendait-il lente chaque écriture Raft de 16 ko ?',
			options: [
				'Chaque ajout réécrivait aussi une freelist de 7,8 Mo, avec près d’un million de pages',
				'Le fichier de 4,2 Go ne tenait plus en mémoire, donc chaque écriture le relisait',
				'BoltDB réécrit tout le fichier à chaque commit pour le garder compact',
				'Le snapshot qui coupe le journal verrouillait le fichier à chaque écriture'
			],
			answer: 0,
			why: 'Consul efface les vieilles entrées du journal après chaque snapshot, mais un fichier BoltDB ne rétrécit jamais : les pages libérées vont dans la freelist. Le README de bbolt : "deleting large chunks of data will not allow you to reclaim that space on disk." Avec une freelist énorme, chaque petite écriture traînait 7,8 Mo de comptabilité.'
		},
		{
			q: 'Qu’est-ce qui a gêné le diagnostic le premier jour, et qu’a changé Roblox ensuite ?',
			options: [
				'La télémétrie dépendait de Consul, Roblox l’a rendue indépendante des systèmes surveillés',
				'Les logs étaient sur les serveurs Consul, Roblox les copie maintenant toutes les heures',
				'HashiCorp n’avait pas d’accès, Roblox lui a ouvert un accès permanent à la prod',
				'Les dashboards montraient des moyennes, Roblox est passé aux percentiles partout'
			],
			answer: 0,
			why: 'Avec Consul en panne, le monitoring qui en dépendait était dégradé lui aussi. Le postmortem : "Our telemetry systems no longer depend on the systems that they are configured to monitor."'
		}
	],
	recall: {
		q: 'Quels deux problèmes dans Consul ont causé la panne de 73 heures de Roblox ?',
		a: 'La contention de la nouvelle fonction de streaming sous une très forte charge en lecture et en écriture, et BoltDB qui réécrivait une freelist de 7,8 Mo à chaque ajout au journal Raft.'
	},
	sources: [
		{ title: 'Roblox : Roblox Return to Service 10/28-10/31 2021', url: PM },
		{ title: 'README de etcd-io/bbolt : Caveats and limitations', url: BBOLT }
	]
};
