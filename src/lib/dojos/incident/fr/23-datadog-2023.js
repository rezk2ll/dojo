const PM = 'https://www.datadoghq.com/blog/2023-03-08-multiregion-infrastructure-connectivity-issue/';
const IMPACT = 'https://www.datadoghq.com/blog/engineering/2023-03-08-deep-dive-into-platform-level-impact/';
const RESPONSE = 'https://www.datadoghq.com/blog/engineering/2023-03-08-deep-dive-into-incident-response/';
const NETWORKD = 'https://github.com/systemd/systemd/blob/84b71c1525e792c2ba44670d2171386af8605edd/man/networkd.conf.xml#L75-L82';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'datadog-2023',
	part: 'Réseau et DNS',
	title: 'Datadog 2023 : la mise à jour automatique de l’OS qui a coupé le réseau des nœuds',
	minutes: 10,
	hook: [
		'Mercredi 8 mars 2023, 06 h 08 UTC, soit vers 1 h 08 du matin pour les premières équipes appelées. Le monitoring interne de Datadog a levé sa première alerte à 06 h 03.',
		'Deux équipes reçoivent une page. L’automatisation de l’équipe APM voit que ses pods Kubernetes ne redémarrent pas correctement. Une autre équipe est appelée par les sondes hors bande qui surveillent les alertes de Datadog elles-mêmes.',
		'Datadog fait tourner cinq régions (US1, EU1, US3, US4 et US5) chez trois fournisseurs cloud. Les régions ne partagent ni réseau ni plan de contrôle, et chaque changement est déployé une région après l’autre.'
	],
	terms: [
		{ term: 'Monitoring hors bande', def: 'Des sondes qui tournent entièrement hors de ton infrastructure et appellent tes API publiques comme un utilisateur. Elles alertent même quand ton propre monitoring est tombé.' },
		{ term: 'Unattended upgrades', def: 'La fonction d’Ubuntu qui installe les mises à jour de sécurité sur minuterie, sans opérateur. Les hôtes de Datadog gardaient les réglages par défaut : mise à jour à 06 h 00 UTC plus jusqu’à 60 minutes de délai aléatoire.' },
		{ term: 'systemd-networkd', def: 'Le service systemd qui configure les interfaces réseau, les routes et les règles de routage d’un hôte Linux à partir des fichiers `.network`.' },
		{ term: 'Règle IP', def: 'Une règle de routage qui choisit la table de routes d’un paquet, par exemple selon son adresse source. Cilium ajoute des règles IP pour que le trafic des pods sorte par la bonne interface.' }
	],
	incident: {
		org: 'Datadog',
		title: '2023-03-08 Incident: Infrastructure connectivity issue affecting multiple regions',
		date: '2023-03-08',
		url: PM,
		steps: [
			{
				situation: [
					'Tu es dans l’équipe appelée par les sondes hors bande. En quelques minutes, tu vois de gros problèmes sur plusieurs produits de Datadog, pas sur un seul service.',
					'L’équipe APM, appelée au même moment, a conclu que son problème est local à son service. Aucun incident d’ampleur sur l’infrastructure de calcul n’est encore ouvert.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Tu laisses l’affaire à l’équipe APM, appelée en premier',
					'Tu déclares un incident de haute sévérité pour appeler le commandant d’incident',
					'Tu redémarres tes services d’alerte pour voir si les pages cessent',
					'Tu attends 30 minutes pour voir si le problème passe tout seul'
				],
				answer: 1,
				why: 'Des problèmes sur plusieurs produits justifient d’appeler la rotation haute sévérité, dont l’ingénieur prend le rôle de commandant d’incident. L’équipe l’a fait, mais l’outil d’incident lui-même tombait par moments : ouvrir l’incident a pris « about 10 minutes (which was longer than usual) ».'
			},
			{
				situation: [
					'Le commandant d’incident a appelé le cadre d’astreinte et le support client. Les utilisateurs n’accèdent plus à la plateforme, ni par le navigateur ni par les API, et les moniteurs n’alertent plus.',
					'Les régions ne réagissent pas pareil. Certaines n’affichent pas la page web, d’autres si. La plus grande partie du monitoring de Datadog est tombée, donc l’étendue réelle reste floue.'
				],
				q: 'Que mets-tu d’abord sur la page de statut ?',
				options: [
					'Rien tant que l’impact de chaque région n’est pas mesuré',
					'Le pire symptôme vu dans une région, publié tout de suite',
					'Une note détaillée par région, après le retour de chaque équipe',
					'Une note qui dit que seules les régions sans page web sont touchées'
				],
				answer: 1,
				why: 'Les clients doivent savoir vite, et les détails dépendent d’un diagnostic qui n’existe pas encore. Datadog a choisi le message du « worst behavior » (le pire comportement : la page web qui ne charge pas) pour publier au plus tôt. La première mise à jour publique est sortie à 06 h 31 UTC.'
			},
			{
				situation: [
					'Des pods n’arrivent pas à démarrer ou redémarrent en boucle dans plusieurs régions à la fois, chez des fournisseurs cloud différents.',
					'L’équipe de l’interface web a fait le dernier changement sur un utilitaire de configuration partagé. Personne dans le call ne connaît de canal capable de modifier toutes les régions en même temps.'
				],
				q: 'Où cherches-tu le déclencheur ?',
				options: [
					'Tu débogues chaque région seule, puisqu’elles ne partagent rien',
					'Tu annules partout le changement de config de l’équipe web',
					'Sur les hôtes, tu cherches ce qui a tourné sur tous vers 06 h 00',
					'Tu attends le retour du monitoring interne pour lire tes graphes'
				],
				answer: 2,
				why: 'Des pannes qui démarrent ensemble dans des régions isolées demandent une cause commune qui tourne sur chaque hôte. Datadog a appelé les équipes réseau, interface web et calcul ; à partir de 06 h 40 environ, il a fallu « about 30-40 minutes » pour voir que les nœuds Kubernetes tombaient. Le postmortem : « Diagnosing the failure required imagination and suspension of disbelief. »'
			},
			{
				situation: [
					'Des dizaines de milliers de nœuds ont perdu le réseau entre 06 h 00 et 07 h 00. Chez AWS, les status checks les ont marqués en mauvaise santé et l’Auto Scaling les a remplacés : à 08 h 00, environ 60 % des instances de US1 étaient neuves.',
					'Chez Google Cloud, les instances cassées tournent encore, avec leurs disques locaux, car Datadog n’y active pas de health checks HTTP. Beaucoup de services sans état y sont encore tombés, donc Google Cloud a l’air plus touché qu’AWS.',
					'Les bases de données, les systèmes de coordination et les caches de Datadog gardent une grande partie de leurs données sur disque local.'
				],
				q: 'Que fais-tu des instances Google Cloud cassées ?',
				options: [
					'Tu les redémarres par l’API cloud, elles gardent leurs disques',
					'Tu les supprimes pour que des nœuds neufs les remplacent, comme chez AWS',
					'Tu actives les health checks HTTP pour que Google Cloud les remplace',
					'Tu laisses Kubernetes les remplacer quand le plan de contrôle reviendra'
				],
				answer: 0,
				why: 'Un redémarrage garde les disques locaux, donc les bases repartent avec leurs données. Chez AWS, ces données ont disparu avec les instances supprimées. Datadog a compris ensuite qu’AWS était « much harder to recover from », et le postmortem dit : « rebooting the instances was the quickest path to recover the data still present on local disks. »'
			},
			{
				situation: [
					'Le déclencheur est maintenant clair. Un correctif de sécurité de systemd (249.11-0ubuntu3.7) est arrivé dans les dépôts Ubuntu le 7 mars. L’installer redémarre systemd-networkd.',
					'Sur Ubuntu 22.04 (systemd v249), systemd-networkd supprime à son démarrage les règles IP qu’il ne connaît pas. Il a donc effacé les règles posées par Cilium, et les hôtes ont perdu le réseau. Les hôtes en Ubuntu 20.04 n’ont pas été touchés.'
				],
				q: 'Que changes-tu pour que ça ne recommence pas ?',
				options: [
					'Tu remets toute la flotte en Ubuntu 20.04, qui tourne avec systemd v245',
					'Tu fixes systemd sur chaque hôte à la version d’avant le correctif du 7 mars',
					'Tu coupes les unattended upgrades et networkd garde les règles étrangères',
					'Tu désactives les règles IP de Cilium et tu passes à un réseau overlay'
				],
				answer: 2,
				why: 'Datadog a coupé le « legacy security update channel » dans toutes les régions touchées et configuré systemd-networkd « so that it leaves the routing table unchanged upon restart ». Les correctifs de sécurité arrivent toujours par le remplacement des nœuds, déployé région par région. Un systemd figé supprime encore les règles étrangères à son prochain redémarrage.'
			}
		],
		outcome: [
			'Tous les services de US1, EU1, US3, US4 et US5 ont été touchés. L’accès web est revenu à 09 h 13 UTC et le premier grand service a été rétabli à 16 h 44. Tous les services marchaient de nouveau le 9 mars à 08 h 58 UTC, et le rattrapage des données historiques s’est fini le 10 mars à 06 h 25 UTC.',
			'La cause racine remonte à décembre 2020. systemd v248 a fait vider par systemd-networkd, à son démarrage, les règles IP qu’il ne connaît pas, et la v249 a ajouté le réglage `ManageForeignRoutingPolicyRules` pour s’en passer. Ubuntu 22.04 livre la v249 avec ce réglage actif (sa valeur par défaut), et tournait sur plus de 90 % de la flotte de Datadog.',
			'Un nœud neuf ou redémarré ne montre jamais le bug, car systemd-networkd démarre avant que Cilium pose ses règles. Seul un redémarrage du service sur un nœud en marche le déclenche. La minuterie par défaut d’Ubuntu a lancé la mise à jour sur chaque hôte entre 06 h 00 et 07 h 00 UTC, et des régions isolées sont tombées ensemble.',
			'Datadog a coupé ce canal de mises à jour, changé la config de systemd-networkd et passé son infrastructure en revue pour trouver d’autres anciens canaux du même genre. L’équipe prévoit aussi des tests de chaos à cette échelle, un mode dégradé qui sert d’abord les données en direct, des pages de statut par produit et plus de sondes hors bande par produit.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi aucun test n’a repéré le comportement de systemd-networkd avant le 8 mars ?',
			options: [
				'Datadog n’avait jamais testé Ubuntu 22.04 avant la production',
				'Seul un redémarrage de systemd-networkd sur un nœud en marche efface les règles de Cilium',
				'Le bug n’existe que chez AWS, et les clusters de test tournaient sur Google Cloud',
				'Les règles ne sont effacées que si le nœud porte plus de 100 pods'
			],
			answer: 1,
			why: 'Au démarrage, systemd-networkd se lance avant que Cilium pose ses règles IP : il n’y a rien d’étranger à supprimer. Un correctif de sécurité redémarre systemd-networkd après Cilium, et c’est là que les règles disparaissent.'
		},
		{
			q: 'Les régions de Datadog ne partagent aucun réseau et reçoivent les changements une par une. Comment sont-elles tombées dans la même heure ?',
			options: [
				'Un load balancer global a envoyé tout le trafic vers la première région cassée',
				'La même minuterie sur chaque hôte a installé le même correctif entre 06 h 00 et 07 h 00 UTC',
				'Un plan de contrôle Kubernetes partagé a poussé le correctif partout',
				'Les fournisseurs cloud ont tous patché leurs hyperviseurs au même moment'
			],
			answer: 1,
			why: 'Chaque hôte suivait la minuterie `apt-daily-upgrade` par défaut d’Ubuntu : 06 h 00 UTC plus jusqu’à 60 minutes de délai aléatoire. Le changement n’est pas passé par l’outil de déploiement de Datadog, donc rien ne l’a étalé région par région.'
		},
		{
			q: 'Quel réglage de systemd-networkd garde les règles IP posées par un autre logiciel ?',
			options: [
				'`ManageForeignRoutingPolicyRules=no` dans networkd.conf',
				'`KeepConfiguration=static` dans le fichier .network',
				'`IgnoreCarrierLoss=yes` dans le fichier .network',
				'`ManageForeignRoutes=no` dans networkd.conf'
			],
			answer: 0,
			why: 'La doc de systemd : « When false, it will not remove any foreign rules, keeping them even if they are not configured in a .network file. Defaults to yes. » Le réglage existe depuis la v249.'
		}
	],
	recall: {
		q: 'Qu’est-ce qui a redémarré systemd-networkd sur les nœuds de Datadog, et qu’a effacé ce redémarrage ?',
		a: 'Les unattended upgrades d’Ubuntu ont installé le correctif systemd 249.11-0ubuntu3.7 entre 06 h 00 et 07 h 00 UTC. Le redémarrage a effacé les règles IP de Cilium, car `ManageForeignRoutingPolicyRules` vaut yes par défaut.'
	},
	sources: [
		{ title: 'Datadog : 2023-03-08 Incident: Infrastructure connectivity issue affecting multiple regions', url: PM },
		{ title: 'Datadog : 2023-03-08 incident: A deep dive into the platform-level impact', url: IMPACT },
		{ title: 'Datadog : 2023-03-08 incident: A deep dive into our incident response', url: RESPONSE },
		{ title: 'systemd networkd.conf(5) : ManageForeignRoutingPolicyRules', url: NETWORKD }
	]
};
