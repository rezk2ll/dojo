const EXAMPLES = 'https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'config-and-health',
	part: 'Kubernetes',
	title: 'Config, health checks et ressources',
	minutes: 10,
	hook: [
		'Sur une VM, tu avais `/etc/myapp/app.conf`, un mot de passe dans `/etc/myapp/secret`, et un check Nagios qui te réveillait quand `/health` ne répondait plus. Le noyau décidait qui avait de la RAM quand la machine était pleine.',
		'Kubernetes a une place pour chacun. La config va dans une ConfigMap, et les mots de passe dans un Secret. Tu écris tes health checks sous forme de **probes**, et le kubelet agit dessus tout seul.',
		'Chaque conteneur déclare aussi le CPU et la RAM dont il a **besoin** (requests) et le maximum qu’il peut prendre (limits). Avec de mauvaises valeurs, ton Pod ne démarre jamais, ou se fait tuer à l’heure de pointe.'
	],
	terms: [
		{ term: 'ConfigMap', def: 'Un objet qui contient des réglages en clair, sous forme de clés et de valeurs. Monté en fichiers ou passé en variables d’environnement. Pas pour les secrets, et 1 MiB au plus.' },
		{ term: 'Secret', def: 'Comme une ConfigMap, pour les valeurs sensibles. Par défaut stocké **non chiffré** dans etcd. Les valeurs de `data` sont en base64, ce qui ne cache rien.' },
		{ term: 'Probe', def: 'Un test que le kubelet lance sur un conteneur : un HTTP GET, une connexion TCP, un appel gRPC ou une commande.' },
		{ term: 'Request et limit', def: 'La request est le CPU et la mémoire que le scheduler réserve pour un conteneur. La limit est le maximum qu’il peut utiliser : au-delà de la limite CPU il est bridé (throttling), au-delà de la limite mémoire l’OOM killer peut le tuer.' }
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
				note: 'La même image tourne dans chaque environnement, avec une ConfigMap et un Secret propres à chacun. Montée en fichiers (sans `subPath`), une mise à jour de ConfigMap arrive dans le Pod après un court délai. En variables d’environnement, il faut redémarrer le Pod.'
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
				note: 'La **liveness probe** vérifie si le conteneur est bloqué. Après `failureThreshold` échecs de suite (3 par défaut), le kubelet redémarre le conteneur. Elle attrape les deadlocks. Si le test dépend d’une base de données, une base lente fait redémarrer tous les Pods.'
			},
			{
				add: [
					'kl -.->|"readiness probe"| c',
					'svc["Endpoints du Service"]',
					'c -.->|"prêt ou pas"| svc'
				],
				highlight: ['svc'],
				note: 'La **readiness probe** vérifie si le conteneur peut recevoir du trafic maintenant. Quand elle échoue, le conteneur continue de tourner, mais le Pod est marqué pas prêt et le Service ne lui envoie plus de trafic. Le kubelet ne redémarre rien, et le trafic revient quand la probe repasse.'
			},
			{
				add: [
					'sch["scheduler"]',
					'sch -->|"le node tient les requests ?"| c'
				],
				highlight: ['sch'],
				note: 'Le scheduler ne place un Pod que là où la **somme des requests** tient encore sur le node, quelle que soit la consommation réelle. Les requests décident sur quel node atterrit le Pod. Les limits décident quand le noyau bride le conteneur ou le tue.'
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
			'La ligne 3, `100m`, vaut 100 millicpu, un dixième de cœur, et le scheduler réserve cette quantité. La ligne 6 laisse le conteneur monter jusqu’à `200m`, puis le noyau le bride.',
			'Les lignes 4 et 7 fixent la request et la limit mémoire à la même valeur, `100Mi`. Le conteneur ne peut pas emprunter de RAM au-delà de sa réservation, donc une fuite fait tuer **ce** conteneur au lieu de manger la mémoire de ses voisins.',
			'La readiness (lignes 11 à 16) démarre après 5 secondes et teste toutes les 10. La liveness (lignes 17 à 22) attend 15 secondes et teste toutes les 20. Ce délai plus long laisse l’appli démarrer avant qu’un échec puisse la redémarrer.',
			'Les Secrets arrivent dans un conteneur de la même façon que les valeurs en clair. L’[exemple vLLM](https://github.com/kubernetes/examples/blob/d6b8cd27eacb51e651a1aa6f7c190a28713eff6e/AI/vllm-deployment/vllm-deployment.yaml#L50-L54) lit un token avec `secretKeyRef`, donc la valeur n’est jamais dans le fichier du Deployment.'
		]
	},
	tradeoff: {
		gain: [
			'La même image tourne dans chaque environnement, et chaque environnement a sa ConfigMap et son Secret.',
			'Le kubelet redémarre les conteneurs bloqués et sort du Service ceux qui ne sont pas prêts, tout seul, sans astreinte.',
			'Le scheduler place les Pods selon leurs requests, donc les requests d’un node ne dépassent jamais ce qu’il a. Les limits empêchent un conteneur de prendre le CPU et la mémoire de ses voisins.'
		],
		cost: [
			'etcd stocke les Secrets non chiffrés par défaut. Il te faut quand même le chiffrement au repos pour etcd et des droits d’accès serrés, ou un coffre à secrets externe.',
			'Une liveness probe qui dépend de la base fait redémarrer tous les Pods quand la base ralentit, et ces redémarrages ajoutent de la charge.',
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
		],
		steps: [
			{
				title: 'Compte jusqu’au premier redémarrage',
				questions: [
					{ q: 'Quand le kubelet lance-t-il le premier test de liveness ?', options: ['À 0 s, dès que le conteneur démarre', 'À 90 s, quand l’appli est prête', 'À 10 s, après `initialDelaySeconds`', 'À 30 s, après trois périodes'], answer: 2, why: '`initialDelaySeconds: 10` retarde le premier test de 10 secondes.' },
					{ q: 'Quelle est la valeur par défaut de `failureThreshold` ?', options: ['1', '3', '5', '10'], answer: 1, why: 'Par défaut, après 3 échecs de suite, le kubelet agit sur la probe.' },
					{ q: 'Vers quand le kubelet redémarre-t-il le conteneur ?', options: ['Vers 10 s', 'Vers 120 s', 'Vers 90 s', 'Vers 30 s'], answer: 3, why: 'Les tests à 10, 20 et 30 s échouent tous pendant le démarrage. Trois échecs de suite, et le conteneur redémarre.' },
					{ q: 'Que fait le kubelet quand la liveness probe échoue ?', options: ['Il redémarre le conteneur', 'Il coupe seulement le trafic du Service', 'Il déplace le Pod sur un autre node', 'Il supprime le Deployment'], answer: 0, why: 'La liveness vérifie si le conteneur est bloqué. Un échec veut dire un redémarrage. C’est la readiness qui coupe seulement le trafic.' }
				]
			},
			{
				title: 'Comprends la boucle',
				questions: [
					{ q: 'L’appli a besoin de 90 s et redémarre vers 30 s. Que se passe-t-il après le redémarrage ?', options: ['L’appli reprend là où elle s’était arrêtée', 'Elle repart de zéro et est tuée à nouveau vers 30 s', 'Le kubelet attend 90 s cette fois', 'La probe est désactivée'], answer: 1, why: 'Chaque redémarrage relance le démarrage, et la même probe le tue encore. Elle ne finit jamais de démarrer.' },
					{ q: 'Pourquoi ne pas simplement mettre `initialDelaySeconds: 90` sur la liveness ?', options: ['Kubernetes le limite à 60 s', 'Ça ralentirait aussi la readiness', 'Ça n’a plus d’effet après le premier redémarrage', 'Le temps de démarrage varie, et tu devines un délai fixe au lieu d’attendre l’appli'], answer: 3, why: 'Un délai fixe est une supposition. Une startup probe attend que l’appli réponde vraiment, jusqu’à une limite.' },
					{ q: 'Pourquoi ne pas monter `periodSeconds` de la liveness à 60 ?', options: ['Ça rend la liveness plus lente pour l’appli une fois lancée', 'periodSeconds ne peut pas dépasser 30', 'Ça transformerait la liveness en readiness', 'La startup probe a besoin qu’il reste à 10'], answer: 0, why: 'La tâche demande de garder une liveness rapide pour l’appli lancée. Une période lente retarderait le redémarrage d’un conteneur bloqué.' },
					{ q: 'Est-ce un bug de l’appli ?', options: ['Oui : une appli saine répond en moins de 10 s', 'Oui : `/health` ne devrait jamais échouer', 'Non : les réglages de la probe ne collent pas au temps de démarrage de l’appli', 'Non : c’est un bug du scheduler'], answer: 2, why: 'L’appli fonctionnerait. Le kubelet la tue avant qu’elle soit prête, parce que la probe attend un démarrage rapide.' }
				]
			},
			{
				title: 'Ajoute une startup probe',
				questions: [
					{ q: 'Quelle probe retient les autres tant qu’elle n’a pas réussi ?', options: ['La readiness probe', 'La liveness probe', 'La startup probe', 'Aucune : les trois tournent ensemble'], answer: 2, why: 'Tant que la startup probe n’a pas réussi, liveness et readiness attendent.' },
					{ q: 'Avec `periodSeconds: 10` et `failureThreshold: 12`, combien de temps l’appli peut-elle mettre à démarrer ?', options: ['Jusqu’à 120 s', 'Jusqu’à 12 s', 'Jusqu’à 22 s', 'Jusqu’à 90 s'], answer: 0, why: '12 tests espacés de 10 s donnent jusqu’à 120 s. Ça couvre les 90 s de démarrage avec de la marge.' },
					{ q: 'Quel endpoint teste la startup probe ?', options: ['Un nouvel endpoint `/startup` que l’équipe doit écrire', 'Le même endpoint `/health`', 'Le port de la base de données', 'Le port du kubelet du node'], answer: 1, why: 'Le même endpoint suffit : la startup probe change seulement combien de temps le kubelet attend avant que la liveness prenne le relais.' },
					{ q: 'Une fois la startup probe réussie, à quelle fréquence teste la liveness ?', options: ['Toutes les 120 s', 'Plus jamais', 'Toutes les 90 s', 'Toutes les 10 s, comme avant'], answer: 3, why: 'La liveness garde son propre `periodSeconds: 10`. Un conteneur bloqué est toujours repéré vite.' }
				]
			},
			{
				title: 'Contrôle l’arrivée du trafic',
				questions: [
					{ q: 'Pourquoi ajouter aussi une readiness probe ?', options: ['Pour que le Pod ne reçoive du trafic que quand il peut répondre', 'Pour que le kubelet redémarre l’appli plus vite', 'Pour que le scheduler choisisse un plus gros node', 'Pour pouvoir retirer la liveness'], answer: 0, why: 'La readiness décide quand le Service envoie du trafic, et elle continue de tester après le démarrage : une appli qui ne peut pas répondre un moment ne reçoit plus de trafic, sans redémarrage.' },
					{ q: 'La readiness probe échoue pendant que l’appli est occupée. Qu’arrive-t-il au conteneur ?', options: ['Il est redémarré', 'Il continue de tourner, et le Service ne lui envoie plus de trafic', 'Il est déplacé sur un autre node', 'Il est tué par l’OOM killer'], answer: 1, why: 'La readiness ne redémarre jamais rien. Le trafic revient quand la probe repasse.' },
					{ q: 'Quelqu’un propose que `/health` teste aussi la base. Quel est le risque pour la liveness ?', options: ['Aucun : un test plus profond est toujours mieux', 'La probe ne marche plus en HTTP', 'Une base lente fait redémarrer tous les Pods', 'La startup probe ne tourne plus'], answer: 2, why: 'Si la liveness dépend de la base, une base lente la fait échouer partout, et les redémarrages ajoutent de la charge.' },
					{ q: 'Quel ensemble de probes convient à ce service ?', options: ['Liveness seule, avec un délai de 90 s', 'Readiness seule', 'Startup seule, avec un seuil long', 'Startup, puis liveness et readiness'], answer: 3, why: 'La startup couvre le démarrage lent, la liveness attrape une appli bloquée, la readiness contrôle le trafic.' }
				]
			}
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
			why: 'Tant que la readiness probe échoue, le Service n’envoie aucun trafic au Pod, et le conteneur continue de tourner. C’est une liveness probe en échec qui fait redémarrer un conteneur par le kubelet.'
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
			why: 'Le noyau fait respecter une limite mémoire par un OOM kill. Le bridage concerne les limites CPU. Le scheduler ne regarde que les requests.'
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
	lab: {
		minutes: 15,
		goal: 'Regarder une liveness probe tuer en boucle un conteneur lent à démarrer, puis corriger avec une startup probe en gardant une liveness rapide.',
		steps: [
			'Démarre un cluster local avec `minikube start`, puis crée un dossier : `mkdir -p ~/probe-lab && cd ~/probe-lab`.',
			'Écris un Pod qui met 40 secondes à démarrer, avec un test de liveness toutes les 5 secondes : `printf \'kind: Pod\\napiVersion: v1\\nmetadata: {name: slow}\\nspec:\\n  terminationGracePeriodSeconds: 2\\n  containers:\\n  - name: app\\n    image: busybox:1.36\\n    command: [sh, -c, "sleep 40; touch /tmp/started; sleep 3600"]\\n    livenessProbe: {exec: {command: [cat, /tmp/started]}, initialDelaySeconds: 5, periodSeconds: 5}\\n\' > slow.yaml`.',
			'Applique-le, attends environ 50 secondes, et regarde : `kubectl apply -f slow.yaml`, puis `kubectl get pod slow` et `kubectl describe pod slow`.',
			'Ajoute une startup probe qui laisse jusqu’à 60 secondes : `printf \'    startupProbe: {exec: {command: [cat, /tmp/started]}, periodSeconds: 5, failureThreshold: 12}\\n\' >> slow.yaml`. Les probes ne changent pas sur un Pod qui tourne, donc lance `kubectl delete pod slow && kubectl apply -f slow.yaml`.',
			'Attends environ 70 secondes, vérifie `kubectl get pod slow`, puis simule une appli bloquée avec `kubectl exec slow -- rm /tmp/started` et revérifie 25 secondes plus tard. Nettoie avec `kubectl delete pod slow`.'
		],
		done: [
			'Sans startup probe, RESTARTS grimpe (2 après environ 50 secondes) et `describe` montre `Container app failed liveness probe, will be restarted`.',
			'Avec la startup probe, le Pod arrive à `1/1 Running` avec `0` redémarrage, et `describe` liste des events `Startup probe failed` à la place.',
			'Après `rm /tmp/started`, RESTARTS passe à `1` en une vingtaine de secondes : la liveness réagit toujours vite.'
		],
		solution: [
			'Les tests de liveness à 5, 10 et 15 secondes échouent tous pendant que l’appli dort, et 3 échecs de suite la redémarrent. Chaque redémarrage relance les 40 secondes depuis zéro.',
			'`startupProbe` avec `periodSeconds: 5` et `failureThreshold: 12` laisse jusqu’à 60 secondes. La liveness ne tourne pas tant qu’elle n’a pas réussi.',
			'La liveness garde son propre `periodSeconds: 5`, donc un conteneur qui se bloque plus tard redémarre vite. `terminationGracePeriodSeconds: 2` sert seulement à accélérer le lab, parce que `sh` ignore le signal d’arrêt.'
		]
	},
	recall: {
		q: 'Une readiness probe échoue. Une liveness probe échoue. Que fait Kubernetes dans chaque cas ?',
		a: 'Readiness : le Pod est marqué pas prêt et le Service ne lui envoie plus de trafic, sans redémarrage. Liveness : après 3 échecs de suite par défaut, le kubelet redémarre le conteneur.'
	},
	sources: [
		{ title: 'Doc Kubernetes, ConfigMaps', url: 'https://kubernetes.io/docs/concepts/configuration/configmap/' },
		{ title: 'Doc Kubernetes, Secrets', url: 'https://kubernetes.io/docs/concepts/configuration/secret/' },
		{ title: 'Doc Kubernetes, Liveness, Readiness, and Startup Probes', url: 'https://kubernetes.io/docs/concepts/workloads/pods/probes/' },
		{ title: 'Doc Kubernetes, Configure Liveness, Readiness and Startup Probes', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/' },
		{ title: 'Doc Kubernetes, Resource Management for Pods and Containers', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' }
	]
};
