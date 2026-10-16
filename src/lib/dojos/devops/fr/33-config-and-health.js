const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'config-and-health',
	part: 'Kubernetes',
	title: 'Config, health checks et ressources',
	minutes: 10,
	hook: [
		'Sur une VM, tu avais `/etc/myapp/app.conf`, un mot de passe dans `/etc/myapp/secret`, et un check Nagios qui te réveillait quand `/health` ne répondait plus. Le noyau décidait qui avait de la RAM quand la machine était pleine.',
		'Kubernetes a une place pour chacun. La config va dans une **ConfigMap**. Les mots de passe dans un **Secret**. Les health checks deviennent des **probes**, et le kubelet agit dessus tout seul.',
		'Et la RAM et le CPU ne sont plus au premier arrivé. Chaque conteneur dit ce dont il a **besoin** (requests) et le maximum qu’il peut **prendre** (limits). Mal réglés, ton Pod ne démarre jamais, ou se fait tuer à l’heure de pointe.'
	],
	terms: [
		{ term: 'ConfigMap', def: 'Un objet qui contient des réglages en clair, en clés et valeurs. Monté en fichiers ou passé en variables d’environnement. Pas pour les secrets, et 1 MiB au plus.' },
		{ term: 'Secret', def: 'Comme une ConfigMap, pour les valeurs sensibles. Par défaut stocké **non chiffré** dans etcd. Les valeurs de `data` sont en base64, ce qui ne cache rien.' },
		{ term: 'Probe', def: 'Un test que le kubelet lance sur un conteneur : un HTTP GET, une connexion TCP, un appel gRPC ou une commande.' },
		{ term: 'Request', def: 'Le CPU et la mémoire que le scheduler réserve pour un conteneur quand il choisit un node.' },
		{ term: 'Limit', def: 'Le maximum qu’un conteneur peut utiliser. Au-delà de la limite CPU, il est bridé (throttling). Au-delà de la limite mémoire, il peut être tué par l’OOM killer.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: [
					'cm["ConfigMap app-config"]',
					'sec["Secret db-password"]',
					'subgraph pod["Pod"]',
					'c["conteneur"]',
					'end',
					'cm -->|"fichiers dans /etc/app"| c',
					'sec -->|"env DB_PASSWORD"| c'
				],
				highlight: ['cm', 'sec'],
				note: 'Même image dans chaque environnement, **ConfigMap** et **Secret** différents. Montée en fichiers (sans `subPath`), une mise à jour de ConfigMap arrive dans le Pod après un court délai. En variables d’environnement, il faut redémarrer le Pod.'
			},
			{
				add: [
					'kl["kubelet"]',
					'kl -.->|"startup probe"| c'
				],
				highlight: ['kl'],
				note: 'La **startup probe** passe en premier. Tant qu’elle n’a pas réussi, les autres probes attendent. Utilise-la pour les applis longues à démarrer, pour qu’elles ne soient pas tuées en plein démarrage.'
			},
			{
				add: [
					'kl -.->|"liveness probe"| c',
					'rst["redémarrer le conteneur"]',
					'kl --> rst'
				],
				highlight: ['rst'],
				note: 'La **liveness** répond à « est-il bloqué ? ». Échoue `failureThreshold` fois de suite (3 par défaut) et le kubelet **redémarre** le conteneur. Bien pour les deadlocks. Dangereux si le test dépend d’une base de données : une base lente, et tous les Pods redémarrent.'
			},
			{
				add: [
					'kl -.->|"readiness probe"| c',
					'svc["Endpoints du Service"]',
					'c -.->|"prêt ou pas"| svc'
				],
				highlight: ['svc'],
				note: 'La **readiness** répond à « peut-il recevoir du trafic maintenant ? ». Quand elle échoue, le conteneur continue de tourner, mais le Pod est marqué pas prêt et le Service ne lui envoie plus de trafic. Pas de redémarrage. Il revient quand la probe repasse.'
			},
			{
				add: [
					'sch["scheduler"]',
					'sch -->|"le node tient les requests ?"| c'
				],
				highlight: ['sch'],
				note: 'Le scheduler ne place un Pod que là où la **somme des requests** tient encore sur le node, quelle que soit la consommation réelle. Les requests décident où tu tournes. Les limits décident quand tu es bridé ou tué.'
			}
		]
	},
	example: {
		title: 'web/guestbook/frontend-deployment.yaml',
		repo: 'kubernetes/examples',
		url: `${EXAMPLES}/web/guestbook/frontend-deployment.yaml#L20-L49`,
		lang: 'yaml',
		code: `        resources:
          requests:
            cpu: 100m
            memory: 100Mi
          limits:
            cpu: 200m
            memory: 100Mi
…
        ports:
        - containerPort: 80
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 15
          periodSeconds: 20`,
		notes: [
			'`100m`, c’est 100 millicpu, un dixième de cœur. Le scheduler réserve ça. Le conteneur peut monter jusqu’à `200m`, puis le noyau le bride.',
			'Request et limit mémoire sont **identiques** : `100Mi`. Le conteneur ne peut pas emprunter de RAM au-delà de sa réservation, donc une fuite fait tuer **ce** conteneur au lieu de manger la mémoire de ses voisins.',
			'La readiness démarre après 5 secondes et teste toutes les 10. La liveness attend 15 secondes et teste toutes les 20. Ce délai plus long laisse l’appli démarrer avant qu’un échec puisse la redémarrer.',
			'Les Secrets arrivent dans un conteneur de la même façon que les valeurs en clair. L’[exemple vLLM](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/AI/vllm-deployment/vllm-deployment.yaml#L50-L54) lit un token avec `secretKeyRef`, donc la valeur n’est jamais dans le fichier du Deployment.'
		]
	},
	tradeoff: {
		gain: [
			'La config est séparée de l’image : une image, plusieurs environnements.',
			'Le kubelet redémarre les conteneurs bloqués et sort du Service ceux qui ne sont pas prêts, tout seul, sans astreinte.',
			'Les requests permettent au scheduler de remplir les nodes sans risque. Les limits empêchent un conteneur bruyant d’affamer ses voisins.'
		],
		cost: [
			'Les Secrets ne sont pas secrets par défaut. Il te faut quand même le chiffrement au repos pour etcd et des droits d’accès serrés, ou un coffre à secrets externe.',
			'Une mauvaise liveness probe provoque les pannes qu’elle devait éviter : des redémarrages sous charge aggravent la situation.',
			'Des limits trop basses donnent du throttling et des OOM kills. Des requests trop hautes gaspillent des nodes. Tu dois mesurer la consommation réelle.'
		]
	},
	task: {
		prompt: 'Un service Java met jusqu’à 90 secondes à démarrer. Sa liveness probe est `httpGet /health` avec `initialDelaySeconds: 10`, `periodSeconds: 10` et le `failureThreshold` par défaut. Le Pod est en boucle de redémarrage et ne sert jamais. Explique pourquoi, et corrige **sans** rendre la liveness plus lente pour l’appli une fois lancée.',
		hint: 'Compte combien de temps le kubelet attend avant le premier redémarrage. Puis cherche la probe qui retient les autres.',
		answer: [
			'Premier test à 10 s, puis toutes les 10 s. Après 3 échecs de suite (vers 30 s), le kubelet redémarre le conteneur. L’appli a besoin de 90 s, donc elle ne finit jamais de démarrer.',
			'Ajoute une **startup probe** sur le même endpoint, par exemple `periodSeconds: 10` et `failureThreshold: 12` : jusqu’à 120 s pour démarrer.',
			'Tant que la startup probe n’a pas réussi, liveness et readiness ne tournent pas. Une fois réussie, la liveness garde sa période rapide de 10 s.',
			'Ajoute aussi une readiness probe, pour que le Pod ne reçoive du trafic qu’une fois capable de répondre.'
		]
	},
	quiz: [
		{
			q: 'Un conteneur échoue à sa readiness probe. Que fait Kubernetes ?',
			options: [
				'Il redémarre le conteneur et continue de lui envoyer du trafic pendant le démarrage',
				'Il arrête d’envoyer le trafic du Service au Pod et laisse tourner le conteneur',
				'Il supprime le Pod et le ReplicaSet en crée un nouveau à sa place',
				'Il déplace le Pod sur un node en meilleure santé et relance la probe là-bas'
			],
			answer: 1,
			why: 'La readiness contrôle le trafic, pas la vie. Tant que la readiness probe échoue, le Service n’envoie aucun trafic au Pod, jusqu’à ce qu’elle repasse. Redémarrer, c’est ce que fait une liveness probe en échec.'
		},
		{
			q: 'Un conteneur essaie d’utiliser plus de mémoire que sa limite mémoire. Que peut-il se passer ?',
			options: [
				'Il est bridé jusqu’à ce que sa consommation baisse',
				'Sa limite est remontée au niveau de la request',
				'Le noyau peut le tuer (OOM kill)',
				'Rien, les limits ne servent qu’au scheduling'
			],
			answer: 2,
			why: 'Les limites mémoire sont appliquées par des OOM kills. Le bridage, c’est pour les limites CPU. Le scheduling utilise les requests, pas les limits.'
		},
		{
			q: 'Pourquoi un Secret Kubernetes n’est-il pas sûr juste parce que ses valeurs sont en base64 ?',
			options: [
				'base64 est un encodage, pas un chiffrement, et les Secrets sont stockés non chiffrés dans etcd par défaut',
				'Parce que les Secrets sont affichés en clair dans les logs du Pod à chaque démarrage',
				'Parce que les chaînes base64 sont limitées à 1 MiB, donc les longues clés sont coupées et stockées en clair',
				'Il est sûr : le base64 de Kubernetes utilise une clé du cluster, que seule l’API peut lire'
			],
			answer: 0,
			why: 'Quiconque peut lire le Secret, ou lire etcd, obtient la valeur. Ce qui le protège, c’est le chiffrement au repos et les droits d’accès (RBAC).'
		}
	],
	takeaway: 'Config et secrets vivent hors de l’image. Les probes disent au kubelet quand redémarrer et quand arrêter d’envoyer du trafic. Les requests disent où un Pod tient, les limits quand il est bridé ou tué.',
	sources: [
		{ title: 'Doc Kubernetes, ConfigMaps', url: 'https://kubernetes.io/docs/concepts/configuration/configmap/' },
		{ title: 'Doc Kubernetes, Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
		{ title: 'Doc Kubernetes, Liveness, Readiness, and Startup Probes', url: 'https://kubernetes.io/docs/concepts/workloads/pods/probes/' },
		{ title: 'Doc Kubernetes, Configure Liveness, Readiness and Startup Probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
		{ title: 'Doc Kubernetes, Resource Management for Pods and Containers', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' }
	]
};
