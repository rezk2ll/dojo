const PM = 'https://www.reddit.com/r/RedditEng/comments/11xx5o0/you_broke_reddit_the_piday_outage/';
const K8S_124 = 'https://github.com/kubernetes/kubernetes/blob/53fa80f55b15df3612f84b4ca8add27af9361379/CHANGELOG/CHANGELOG-1.24.md#L2484';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'reddit-2023',
	part: 'Réseau et DNS',
	title: 'Reddit 2023 : la mise à jour Kubernetes qui a retiré un label de nœud',
	minutes: 10,
	hook: [
		'Mardi 14 mars 2023, peu après 19 h 00 UTC. Tu fais partie de l’équipe Compute de Reddit. Un ingénieur lance la mise à jour d’un cluster Kubernetes de la version 1.23 vers la 1.24.',
		'Ce cluster fait tourner la partie historique de Reddit, le code d’Old Reddit. L’équipe l’a monté il y a des années avec l’outil `kubeadm`. Chaque mise à jour passe d’abord sur des clusters de test dédiés, puis sur la production, du cluster le moins critique au plus critique.',
		'Environ 2 minutes après le lancement, les requêtes au bord du CDN n’aboutissent plus. Les utilisateurs voient une page d’erreur avec la mascotte de Reddit, ou une page d’accueil sans aucun post.'
	],
	terms: [
		{ term: 'Plan de contrôle', def: 'Les nœuds qui font tourner l’API server de Kubernetes et sa base etcd. Ce cluster en a trois.' },
		{ term: 'Label de nœud', def: 'Une clé et une valeur posées sur un nœud Kubernetes, comme `node-role.kubernetes.io/master`. D’autres ressources choisissent leurs nœuds en comparant ces labels.' },
		{ term: 'Webhook d’admission', def: 'Un appel HTTP que l’API server fait vers un autre service avant d’accepter une écriture. Si ce service ne répond pas, l’écriture part en timeout.' },
		{ term: 'Route reflector', def: 'Un nœud Calico qui échange les routes des pods (en BGP) avec tous les autres nœuds. Les autres nœuds n’ont alors besoin de parler qu’aux reflectors.' }
	],
	incident: {
		org: 'Reddit',
		title: 'You Broke Reddit: The Pi-Day Outage',
		date: '2023-03-14',
		url: PM,
		steps: [
			{
				situation: [
					'L’incident est ouvert et l’équipe est en call à T+3 minutes. Le graphe du bord du CDN, qui compte les requêtes par code de statut, montre que le site est à l’arrêt.',
					'Le cluster mis à jour a perdu toutes ses métriques. Ses tableaux de bord sont vides : tu ne vois pas quels Pods ou quels nœuds tombent.'
				],
				q: 'Où regardes-tu en premier ?',
				options: [
					'Tu attends le retour des métriques du cluster avant de toucher à quoi que ce soit',
					'Les graphes du CDN et les logs, qui ne tournent pas sur le cluster en panne',
					'Tu lances une deuxième mise à jour sur un cluster de test pour reproduire',
					'Tu redémarres la stack de métriques du cluster et tu attends les graphes'
				],
				answer: 1,
				why: 'Les stats du CDN étaient « intentionally separated » (séparées exprès) du cluster, et l’agent de logs a continué de tourner, car les logs de Reddit sont « very low-level ». Le postmortem : « Our metrics are entirely k8s native ». Elles sont tombées avec le cluster.'
			},
			{
				situation: [
					'Le DNS ne marche plus. Le cluster ne résout ni les entrées Consul (le DNS dynamique de Reddit entre environnements), ni les entrées internes au cluster. Les noms publics, eux, se résolvent. Aucune mise à jour ni aucun test n’a montré ça avant.',
					'Pour un déploiement raté, le premier plan de Reddit est de revenir en arrière. Mais Kubernetes migre son schéma et ses données pendant une mise à jour, et ne propose aucun downgrade. Revenir veut dire restaurer le plan de contrôle depuis la sauvegarde prise avant la mise à jour.',
					'Cette procédure de restauration a plusieurs années. Elle a été testée sur des clusters pilotes, jamais sur un cluster de production. Les premières estimations parlent de plusieurs heures de coupure garantie.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Tu lances la restauration tout de suite et tu arrêtes le débogage',
					'Tu continues le débogage et un petit groupe prépare la restauration',
					'Tu relances `kubeadm upgrade apply` avec la version 1.23',
					'Tu continues le débogage et tu verras la restauration demain'
				],
				answer: 1,
				why: 'L’équipe a d’abord choisi de « attempt to fix forward » (réparer sans revenir en arrière). Vers 60 minutes, avec des pistes mais sans solution, elle a envoyé « a subset of the Compute team » dans un autre call pour préparer toutes les étapes de la restauration. Relancer la mise à jour en 1.23 n’est pas un chemin de retour.'
			},
			{
				situation: [
					'Les Pods mettent très longtemps à démarrer et à s’arrêter. Télécharger une image de moins de 100 Mo prend plusieurs minutes sur un lien de plusieurs gigabits. Les Pods de Calico, qui gèrent le réseau des pods, sont en mauvaise santé.',
					'Tu as supprimé les Pods `calico-typha` et aucun nouveau Pod n’est apparu. Un redémarrage progressif du plan de contrôle n’a rien changé. L’éteindre entièrement puis le rallumer non plus.',
					'Les logs de l’API server montrent maintenant des timeouts sur les écritures. Ils arrivent quand l’API server appelle les webhooks d’admission. Le seul webhook qui surveille toutes les ressources est Open Policy Agent (OPA), et OPA est tombé.'
				],
				q: 'Que fais-tu des timeouts ?',
				options: [
					'Tu montes le timeout des webhooks de l’API server à 5 minutes',
					'Tu supprimes les configurations de webhook d’OPA',
					'Tu ajoutes deux nœuds au plan de contrôle pour tenir la charge',
					'Tu redémarres encore l’API server et tu surveilles les logs'
				],
				answer: 1,
				why: 'OPA étant tombé, chaque écriture attend un appel qui ne peut pas réussir. L’équipe a supprimé ses configurations de webhook. Le postmortem : « The timeouts disappeared instantly… But the cluster didn’t recover. » Le webhook était un second problème, pas la cause.'
			},
			{
				situation: [
					'Après plus de deux heures, l’équipe restaure la sauvegarde. Elle supprime d’abord tous les nœuds workers (environ 20 minutes d’appels API), puis restaure la sauvegarde sur le premier nœud du plan de contrôle.',
					'Le premier nœud repart. Des nœuds rejoignent le cluster quand l’autoscaler redémarre, donc le réseau marche de nouveau. L’équipe coupe l’autoscaler jusqu’à avoir trois nœuds de plan de contrôle.',
					'Deux nouveaux nœuds de plan de contrôle démarrent, mais ne rejoignent jamais le cluster. Ils restent bloqués, sans erreur, incapables de se connecter à etcd sur le premier nœud. Le script de sauvegarde tourne sur n’importe quel nœud du plan de contrôle. La restauration doit se faire sur le nœud d’où vient la sauvegarde. Les nœuds gardent les noms d’hôte AWS par défaut, comme `ip-10-1-0-42.ec2.internal`.'
				],
				q: 'Que vérifies-tu ?',
				options: [
					'Le certificat TLS d’etcd sur le premier nœud et son nom d’hôte',
					'Le quota AWS pour le type d’instance du plan de contrôle dans la région',
					'Les tables de routage et les sessions BGP de Calico sur les deux nœuds',
					'La version de CRI-O sur les deux nouveaux nœuds'
				],
				answer: 0,
				why: 'La sauvegarde venait d’un autre nœud que celui restauré. Le postmortem : « the TLS certificates being presented by the working node weren’t valid for anything else to talk to it, because of the hostname mismatch. » L’équipe a généré de nouveaux certificats et les nœuds ont rejoint le cluster.'
			},
			{
				situation: [
					'Le plan de contrôle a de nouveau trois nœuds. Le site de Reddit repose sur beaucoup de caches, et les services restés inactifs pendant la panne ont réduit leur nombre d’instances.',
					'Quelques services historiques fragiles ont été arrêtés à la main avant le retour du trafic.'
				],
				q: 'Comment fais-tu revenir les utilisateurs ?',
				options: [
					'Tu ouvres 100 % du trafic d’un coup pour remplir vite les caches',
					'Tu ouvres 50 % maintenant et les 50 % restants 10 minutes après',
					'Tu commences vers 1 % et tu montes par petits paliers jusqu’à 100 %',
					'Tu attends que l’autoscaler ait ajouté tous les nœuds avant tout trafic'
				],
				answer: 2,
				why: 'Passer d’un coup à 100 % peut créer un « thundering herd » : les caches vides envoient chaque requête aux services en aval, qui ont réduit leurs instances. L’équipe a commencé « at about 1% », puis 5 %, 10 %, 20 %, 35 %, 55 %, 80 % et 100 %.'
			}
		],
		outcome: [
			'La panne a duré 314 minutes. Les couches d’API récentes de Reddit sont restées debout, mais ce cluster portait « the most critical legacy node in our dependency graph ». La plupart des parcours utilisateur ont donc échoué.',
			'La cause a été trouvée après la restauration. Les logs de Calico montrent que 2 secondes avant la panne, `calico-node` a commencé à retirer, sur chaque nœud, les routes vers tous les nœuds, pas seulement vers le nœud du plan de contrôle en cours de mise à jour.',
			'Les grands clusters de Reddit utilisent des route reflectors Calico à la place d’un maillage complet, et les reflectors étaient les nœuds du plan de contrôle. Les sélecteurs du BGPPeer les choisissaient avec le label `node-role.kubernetes.io/master`. Pendant une mise à jour vers 1.24, `kubeadm upgrade apply` retire ce label des nœuds du plan de contrôle. Plus aucun nœud ne correspondait aux sélecteurs : les sessions avec les reflectors ont disparu et toutes les routes sont tombées.',
			'La configuration des route reflectors n’était « committed nowhere » (versionnée nulle part), et tous ceux qui l’avaient posée avaient quitté l’équipe. Un ingénieur s’est souvenu de cette fonction pendant le postmortem. Les correctifs de Reddit : versionner la config des clusters, documenter ce qui ne peut pas l’être, ajouter des clusters de préproduction, outiller la gestion de clusters entiers et sécuriser les mises à jour de cluster.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi le retrait d’un label sur trois nœuds du plan de contrôle a-t-il cassé le réseau des pods sur tous les nœuds ?',
			options: [
				'Le label fixait aussi l’adresse IP de chaque nœud, qui a perdu son adresse',
				'kube-proxy se sert du label pour choisir le nœud de chaque Service',
				'Les sélecteurs du BGPPeer ne trouvaient plus aucun nœud avec qui échanger',
				'Calico redémarre tous ses agents dès qu’un label de nœud change'
			],
			answer: 2,
			why: 'Avec des route reflectors, les nœuds ne s’échangent pas les routes entre eux. Ils parlent aux nœuds qu’un sélecteur du BGPPeer désigne, et ce sélecteur utilisait le label retiré. Sans correspondance, les sessions ont pris fin et `calico-node` a retiré ses routes.'
		},
		{
			q: 'Pourquoi Reddit ne pouvait-il pas simplement revenir en 1.23 ?',
			options: [
				'AWS n’autorise pas les anciennes versions de Kubernetes sur ses instances',
				'Kubernetes migre ses données pendant la mise à jour, sans chemin retour',
				'Les images de conteneur de la 1.23 avaient été supprimées du registre',
				'La mise à jour avait déjà passé tous les nœuds workers en 1.24'
			],
			answer: 1,
			why: 'Le postmortem : « Because a number of schema and data migrations are performed automatically by Kubernetes during an upgrade, there’s no reverse path defined. » Revenir en arrière voulait dire restaurer etcd depuis la sauvegarde.'
		},
		{
			q: 'Le changelog de la 1.24 annonçait le retrait du label. Quelle vérification avant la mise à jour l’aurait repéré sur le cluster de Reddit ?',
			options: [
				'Lire les notes de version de Calico pour la version installée',
				'Passer d’abord la mise à jour sur un petit cluster de test en maillage complet',
				'Chercher `node-role.kubernetes.io/master` dans toutes les ressources du cluster',
				'Vérifier que les trois nœuds du plan de contrôle sont Ready avant de lancer'
			],
			answer: 2,
			why: 'Le BGPPeer n’existait que dans le cluster, modifié avec la CLI de Calico et absent de tout dépôt. Une recherche dans les ressources du cluster trouve chaque sélecteur qui utilise le label retiré. Selon le postmortem, seuls les clusters les plus grands et les plus anciens utilisaient encore des route reflectors.'
		}
	],
	recall: {
		q: 'Quel label de nœud la config des route reflectors Calico de Reddit sélectionnait-elle, et qu’est-ce qui l’a retiré ?',
		a: '`node-role.kubernetes.io/master`. `kubeadm upgrade apply` vers Kubernetes 1.24 le retire des nœuds du plan de contrôle, donc le BGPPeer ne trouvait plus aucun reflector.'
	},
	sources: [
		{ title: 'Reddit Engineering : You Broke Reddit: The Pi-Day Outage', url: PM },
		{ title: 'CHANGELOG-1.24 de Kubernetes : kubeadm retire le label master', url: K8S_124 },
		{ title: 'Doc Calico : configurer le peering BGP (maillage complet et route reflectors)', url: 'https://docs.tigera.io/calico/latest/networking/configuring/bgp' }
	]
};
