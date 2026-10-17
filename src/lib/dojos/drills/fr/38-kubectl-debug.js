const SEP = '--';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'kubectl-debug',
	part: 'Outils d’exploitation',
	title: 'kubectl pour déboguer',
	minutes: 10,
	hook: [
		'Deux choses sont cassées dans le namespace `shop`. Les pods du Deployment `api` redémarrent toutes les quelques secondes. Le dernier déploiement du Deployment `web` est bloqué, et ce sont toujours les 3 anciens pods qui servent le trafic.',
		'Le pod `api-8b74f5cbb-4zbdm` a deux conteneurs : `api` affiche `api started`, puis `db unreachable`, et sort avec le code 1 ; `log-shipper` affiche `shipped` toutes les 10 secondes. Le Deployment `web` a 3 révisions : la 1 tourne avec `nginx:1.27`, la 2 avec `nginx:1.28`, et la 3 demande `nginx:1.288`, un tag qui n’existe pas, donc son nouveau pod reste en `ImagePullBackOff`. Le pod `cache-0` fait tourner Redis. Chaque commande a besoin de `-n shop`.'
	],
	terms: [
		{ term: 'conteneur', def: 'Un processus avec sa propre image, dans un pod. Dans un pod à deux conteneurs, `-c` dit lequel tu vises.' },
		{ term: 'CrashLoopBackOff', def: 'Le statut que kubectl affiche pour un conteneur qui plante sans cesse. Le kubelet attend 10 s, 20 s, 40 s et ainsi de suite entre deux redémarrages, jusqu’à 5 minutes.' },
		{ term: 'révision', def: 'Une version numérotée du modèle de pod d’un Deployment. Un changement du modèle, comme une nouvelle image, en crée une ; un changement d’échelle, non.' }
	],
	reps: [
		{
			prompt: 'Affiche les logs du conteneur `api` dans le pod `api-8b74f5cbb-4zbdm`.',
			accept: [
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -c api -n shop',
				'kubectl -n shop logs api-8b74f5cbb-4zbdm -c api',
				'kubectl logs -n shop api-8b74f5cbb-4zbdm -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --container api',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --container=api',
				'kubectl logs pod/api-8b74f5cbb-4zbdm -n shop -c api'
			],
			why: '`-c api` choisit le conteneur. Sans lui, kubectl affiche `Defaulted container "api" out of: api, log-shipper` et prend le premier.'
		},
		{
			prompt: 'Le conteneur `api` vient de redémarrer. Affiche les logs de l’exécution qui a planté avant l’actuelle.',
			accept: [
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c api --previous',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c api -p',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --previous -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -p -c api',
				'kubectl logs -p api-8b74f5cbb-4zbdm -n shop -c api',
				'kubectl logs --previous api-8b74f5cbb-4zbdm -n shop -c api',
				'kubectl logs api-8b74f5cbb-4zbdm -c api --previous -n shop',
				'kubectl -n shop logs api-8b74f5cbb-4zbdm -c api --previous',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop --container=api --previous'
			],
			why: '`--previous` (en court `-p`) affiche les logs de l’instance précédente du conteneur. Cette exécution s’est terminée sur `db unreachable`, la ligne qui explique le plantage.'
		},
		{
			prompt: 'Suis les logs du conteneur `log-shipper` du même pod, en continuant d’afficher les nouvelles lignes à mesure qu’elles arrivent.',
			accept: [
				'kubectl logs -f api-8b74f5cbb-4zbdm -n shop -c log-shipper',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c log-shipper -f',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -f -c log-shipper',
				'kubectl logs --follow api-8b74f5cbb-4zbdm -n shop -c log-shipper',
				'kubectl logs api-8b74f5cbb-4zbdm -n shop -c log-shipper --follow',
				'kubectl -n shop logs -f api-8b74f5cbb-4zbdm -c log-shipper',
				'kubectl logs -f api-8b74f5cbb-4zbdm -c log-shipper -n shop'
			],
			why: '`-f` est la forme courte de `--follow`. kubectl affiche les lignes déjà écrites, puis une nouvelle ligne `shipped` toutes les 10 secondes jusqu’à ce que tu l’arrêtes.'
		},
		{
			prompt: 'Ouvre un shell interactif `sh` dans le pod `cache-0`.',
			accept: [
				`kubectl exec -it cache-0 -n shop ${SEP} sh`,
				`kubectl exec -ti cache-0 -n shop ${SEP} sh`,
				`kubectl exec -i -t cache-0 -n shop ${SEP} sh`,
				`kubectl exec --stdin --tty cache-0 -n shop ${SEP} sh`,
				`kubectl exec cache-0 -n shop -it ${SEP} sh`,
				`kubectl -n shop exec -it cache-0 ${SEP} sh`,
				`kubectl exec -n shop -it cache-0 ${SEP} sh`,
				`kubectl exec -it cache-0 -n shop ${SEP} /bin/sh`,
				`kubectl exec -it pod/cache-0 -n shop ${SEP} sh`
			],
			why: '`-i` transmet ton entrée au conteneur et `-t` lui indique que cette entrée est un terminal. Tout ce qui suit `--` est la commande à lancer dans le conteneur : ses options n’arrivent jamais à kubectl.'
		},
		{
			prompt: 'Redirige le port local 8080 vers le port 80 d’un pod du Deployment `web`, pour que `curl localhost:8080` atteigne nginx.',
			accept: [
				'kubectl port-forward deploy/web 8080:80 -n shop',
				'kubectl port-forward deployment/web 8080:80 -n shop',
				'kubectl port-forward deployments/web 8080:80 -n shop',
				'kubectl port-forward deploy/web -n shop 8080:80',
				'kubectl -n shop port-forward deploy/web 8080:80',
				'kubectl port-forward -n shop deploy/web 8080:80',
				'kubectl port-forward -n shop deployment/web 8080:80'
			],
			why: 'Dans `8080:80`, le port local vient d’abord, le port du pod ensuite. Avec `deploy/web`, kubectl choisit un pod du Deployment, et la redirection s’arrête quand ce pod s’arrête.'
		},
		{
			prompt: 'Suis le déploiement du Deployment `web` jusqu’à ce qu’il se termine ou que tu l’arrêtes.',
			accept: [
				'kubectl rollout status deployment/web -n shop',
				'kubectl rollout status deploy/web -n shop',
				'kubectl rollout status deployment web -n shop',
				'kubectl rollout status deployments/web -n shop',
				'kubectl -n shop rollout status deployment/web',
				'kubectl rollout status -n shop deployment/web'
			],
			why: '`rollout status` attend la fin du dernier déploiement. Ici il reste sur `1 out of 3 new replicas have been updated...`, car le nouveau pod ne peut pas télécharger `nginx:1.288`.'
		},
		{
			prompt: 'Liste les révisions du Deployment `web`.',
			accept: [
				'kubectl rollout history deployment/web -n shop',
				'kubectl rollout history deploy/web -n shop',
				'kubectl rollout history deployment web -n shop',
				'kubectl rollout history deployments/web -n shop',
				'kubectl -n shop rollout history deployment/web',
				'kubectl rollout history -n shop deployment/web'
			],
			why: '`rollout history` affiche une ligne par révision, la plus récente en bas. La colonne `CHANGE-CAUSE` vaut `<none>` tant que personne n’a posé l’annotation `kubernetes.io/change-cause`.'
		},
		{
			prompt: 'Affiche seulement le modèle de pod de la révision 2, pour voir quelle image elle utilisait.',
			accept: [
				'kubectl rollout history deployment/web -n shop --revision=2',
				'kubectl rollout history deployment/web -n shop --revision 2',
				'kubectl rollout history deploy/web -n shop --revision=2',
				'kubectl rollout history deployment web -n shop --revision=2',
				'kubectl rollout history deployment/web --revision=2 -n shop',
				'kubectl -n shop rollout history deployment/web --revision=2',
				'kubectl rollout history deployments/web -n shop --revision=2'
			],
			why: '`--revision=2` affiche le modèle de cette seule révision, avec la ligne `Image: nginx:1.28`.'
		},
		{
			prompt: 'Ramène le Deployment `web` à la révision qui précède l’actuelle.',
			accept: [
				'kubectl rollout undo deployment/web -n shop',
				'kubectl rollout undo deploy/web -n shop',
				'kubectl rollout undo deployment web -n shop',
				'kubectl rollout undo deployments/web -n shop',
				'kubectl -n shop rollout undo deployment/web',
				'kubectl rollout undo -n shop deployment/web'
			],
			why: 'Sans numéro, `rollout undo` recule d’une révision, de `nginx:1.288` à `nginx:1.28`. kubectl affiche `deployment.apps/web rolled back`.'
		},
		{
			prompt: 'Repars de l’état bloqué, et cette fois ramène `web` à la révision 1.',
			accept: [
				'kubectl rollout undo deployment/web -n shop --to-revision=1',
				'kubectl rollout undo deployment/web -n shop --to-revision 1',
				'kubectl rollout undo deploy/web -n shop --to-revision=1',
				'kubectl rollout undo deployment web -n shop --to-revision=1',
				'kubectl rollout undo deployment/web --to-revision=1 -n shop',
				'kubectl -n shop rollout undo deployment/web --to-revision=1',
				'kubectl rollout undo deployments/web -n shop --to-revision=1'
			],
			why: '`--to-revision=1` remet le modèle de la révision 1, `nginx:1.27`. Kubernetes range ce modèle sous le nouveau numéro 4, et la révision 1 disparaît de la liste de `rollout history`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Un conteneur a redémarré après un plantage. Quelle option de `kubectl logs` montre la sortie de l’exécution qui a planté ?',
		a: '`--previous` (ou `-p`). Elle affiche les logs de l’instance précédente du conteneur.'
	},
	sources: [
		{ title: 'Référence de kubectl logs (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/' },
		{ title: 'Référence de kubectl exec (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_exec/' },
		{ title: 'Référence de kubectl port-forward (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/' },
		{ title: 'Référence de kubectl rollout undo (en anglais)', url: 'https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_undo/' },
		{ title: 'Kubernetes : Deployments, revenir en arrière (en anglais)', url: 'https://kubernetes.io/docs/concepts/workloads/controllers/deployment/' },
		{ title: 'Kubernetes : déboguer des pods en marche (en anglais)', url: 'https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/' }
	]
};
