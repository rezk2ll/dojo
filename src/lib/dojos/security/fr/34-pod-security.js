const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'pod-security',
	part: 'En production',
	title: 'Les Pod Security Standards',
	minutes: 10,
	hook: [
		'Le 13 septembre 2021, Kubernetes publie CVE-2021-25741 dans le kubelet, notée High. Un utilisateur pouvait « create a container with subpath volume mounts to access files & directories outside of the volume, including on the host filesystem ». Les correctifs sortent en 1.22.2, 1.21.5, 1.20.11 et 1.19.15.',
		'L’avis désigne les clusters les plus touchés : ceux où les admins avaient « restricted the ability to create hostPath mounts ». Le bug donnait un accès « hostPath-like » sans champ `hostPath`. Une des parades proposées : « use admission control to prevent less-trusted users from running containers as root ».',
		'Ce contrôle d’admission est livré avec Kubernetes. Pod Security Admission vérifie chaque nouveau Pod par rapport à l’un des trois niveaux des **Pod Security Standards**, choisi par un label sur le namespace.'
	],
	terms: [
		{ term: 'Pod Security Standards', def: 'Trois niveaux de politique définis par Kubernetes : `privileged` (aucune restriction), `baseline` (bloque les escalades de privilèges connues) et `restricted` (les pratiques de durcissement actuelles).' },
		{ term: 'Pod Security Admission', def: 'Le contrôleur d’admission intégré à l’API server, stable depuis la 1.25. Il compare chaque Pod à un niveau au moment de sa création.' },
		{ term: 'Mode', def: 'Ce que fait le contrôleur face à une violation : `enforce` rejette le Pod, `audit` ajoute une annotation dans le journal d’audit, `warn` renvoie un avertissement à l’utilisateur.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['dev["kubectl apply : Pod avec hostPath / et privileged: true"] --> ns["Namespace shop, sans label pod-security"]', 'ns -->|"niveau par défaut : privileged"| node["Le Pod tourne en privileged, avec le / du nœud monté"]'],
				highlight: ['dev', 'node'],
				note: 'Le chemin de l’attaque. Sans label, la configuration par défaut applique `enforce: "privileged"`, qui ne restreint rien. Toute personne qui peut créer des Pods dans `shop` peut monter le `/` du nœud et lancer un conteneur privileged. La page des Standards : les Pods privileged « disable most security mechanisms ».'
			},
			{
				add: ['lbl["Label : pod-security.kubernetes.io/enforce=baseline"] --> ns', 'ns -->|"contrôles : hostPath, privileged, namespaces de l’hôte, capabilities ajoutées"| deny["Rejeté : violates PodSecurity baseline:latest, hostPath volumes"]'],
				highlight: ['lbl', 'deny'],
				note: 'La défense. Avec `enforce=baseline`, l’API server lance tous les contrôles baseline sur la spec du Pod. Le volume `hostPath` échoue à `CheckHostPathVolumes`, `privileged: true` échoue au contrôle privileged, et la requête renvoie une erreur avant toute planification.'
			},
			{
				add: ['rst["restricted ajoute : runAsNonRoot, allowPrivilegeEscalation=false, drop ALL, seccomp RuntimeDefault"] --> lbl'],
				highlight: ['rst'],
				note: '`restricted` reprend tous les contrôles baseline et en ajoute. Le Pod doit fixer `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, retirer `ALL` des capabilities et choisir un profil seccomp. Seuls 8 types de volumes passent, dont `secret` et `emptyDir`.'
			},
			{
				add: ['warn["warn=restricted, audit=restricted"] -.->|"avertissements et annotations d’audit, Pod admis quand même"| ns'],
				highlight: ['warn'],
				note: 'Pour monter d’un niveau sans casse, passe `warn` et `audit` à `restricted` et laisse `enforce` à `baseline`. kubectl affiche `Warning: would violate PodSecurity "restricted:latest"`, et le Pod est quand même créé.'
			},
			{
				add: ['dep["Deployment créé sans erreur"] --> rs["Le ReplicaSet ne peut créer aucun Pod : forbidden"]'],
				highlight: ['dep', 'rs'],
				note: 'Le piège. La doc : « enforce mode is **not** applied to workload resources, only to the resulting pod objects ». Le `kubectl apply` d’un Deployment réussit, puis son ReplicaSet n’arrive pas à créer de Pods. Seuls `warn` et `audit` regardent le Deployment lui-même.'
			}
		]
	},
	example: {
		title: 'pod-security-admission/policy/check_hostPathVolumes.go : le contrôle hostPath de baseline',
		repo: 'kubernetes/kubernetes',
		url: `${K8S}/staging/src/k8s.io/pod-security-admission/policy/check_hostPathVolumes.go#L37-L76`,
		lang: 'go',
		code: `func init() {
	addCheck(CheckHostPathVolumes)
}

const checkHostPathVolumesID CheckID = "hostPathVolumes"

// CheckHostPathVolumes returns a baseline level check
// that requires hostPath=undefined/null in 1.0+
func CheckHostPathVolumes() Check {
	return Check{
		ID:    checkHostPathVolumesID,
		Level: api.LevelBaseline,
		Versions: []VersionedCheck{
			{
				MinimumVersion: api.MajorMinorVersion(1, 0),
				CheckPod:       hostPathVolumes_1_0,
			},
		},
	}
}

func hostPathVolumes_1_0(podMetadata *metav1.ObjectMeta, podSpec *corev1.PodSpec) CheckResult {
	var hostVolumes []string

	for _, volume := range podSpec.Volumes {
		if volume.HostPath != nil {
			hostVolumes = append(hostVolumes, volume.Name)
		}
	}

	if len(hostVolumes) > 0 {
		return CheckResult{
			Allowed:         false,
			ForbiddenReason: "hostPath volumes",
			ForbiddenDetail: fmt.Sprintf("%s %s", pluralize("volume", "volumes", len(hostVolumes)), joinQuote(hostVolumes)),
		}
	}

	return CheckResult{Allowed: true}
}`,
		notes: [
			'La ligne 38 enregistre le contrôle via `init` au chargement du package. Les lignes 27 à 35 du fichier, au-dessus de l’extrait, recopient le contrôle de la page des Standards : « HostPath volumes must be forbidden. »',
			'La ligne 48 fixe `Level: api.LevelBaseline`. Un namespace en `baseline` ou en `restricted` l’exécute, et `privileged` n’exécute aucun contrôle.',
			'Les lignes 51 et 52 disent que la règle s’applique depuis la version 1.0 de la politique. Le label `enforce-version` peut figer un namespace sur les contrôles d’une ancienne version mineure de Kubernetes.',
			'Les lignes 61 à 72 rejettent tout volume qui a un champ `hostPath`. Pour un volume nommé `host`, l’utilisateur voit `violates PodSecurity "baseline:latest": hostPath volumes (volume "host")`.'
		]
	},
	tradeoff: {
		gain: [
			'Rien à installer en plus : le contrôleur est dans l’API server, et un label par namespace suffit à l’activer.',
			'`warn` et `audit` te montrent quels Pods échoueraient à `restricted` avant que tu l’imposes.'
		],
		cost: [
			'Sans labels ni valeur par défaut dans la configuration d’admission, chaque namespace est en `privileged`.',
			'Chaque niveau est un ensemble figé de contrôles. Autoriser une liste connue de ports de l’hôte, par exemple, est « not supported by the built-in Pod Security Admission controller ».',
			'Un Deployment qui viole le niveau imposé est quand même créé au `kubectl apply`. Seuls les Pods que son ReplicaSet tente de créer sont rejetés.'
		]
	},
	task: {
		prompt: 'Le namespace `shop` tourne avec `enforce=baseline`. Tu ajoutes `warn=restricted`, tu appliques le Pod `nginx` (image `nginx`, sans `securityContext`) et tu obtiens : `Warning: would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "nginx" must set securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "nginx" must set securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or container "nginx" must set securityContext.runAsNonRoot=true), seccompProfile (pod or container "nginx" must set securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")`. Écris le `securityContext` qui fait disparaître l’avertissement, et dis ce qui peut encore échouer au démarrage.',
		hint: 'Chaque élément de l’avertissement nomme un champ. Le champ `runAsNonRoot` est aussi contrôlé une seconde fois, par le kubelet, contre l’image.',
		answer: [
			'Au niveau du conteneur : `allowPrivilegeEscalation: false` et `capabilities: { drop: ["ALL"] }`.',
			'Au niveau du Pod ou du conteneur : `runAsNonRoot: true` et `seccompProfile: { type: RuntimeDefault }`. Le contrôle restricted accepte l’un ou l’autre niveau pour ces deux champs.',
			'Au démarrage : la doc de l’API pour `runAsNonRoot` dit que le kubelet va « validate the image at runtime » et refuser de lancer le conteneur s’il tourne en UID 0. Si l’utilisateur de l’image est root, fixe aussi `runAsUser` à un uid non nul, ou prends une image avec un `USER` non root.',
			'Passe ensuite le label à `pod-security.kubernetes.io/enforce=restricted`. Les Pods qui le violent encore sont rejetés à partir de là.'
		],
		steps: [
			{
				title: 'Lis l’avertissement',
				questions: [
					{ q: 'Le Pod a été créé alors que kubectl a affiché un avertissement. Pourquoi ?', options: ['`warn` ne fait que renvoyer un avertissement, et `enforce` est toujours à `baseline`', 'Les avertissements ne bloquent que les Deployments, pas les Pods', 'Le Pod passe finalement `restricted`', 'Le contrôleur ignore les images de Docker Hub'], answer: 0, why: '`warn` renvoie un avertissement à l’utilisateur et admet le Pod. Seul `enforce` rejette.' },
					{ q: 'Combien d’éléments l’avertissement liste-t-il ?', options: ['Un', 'Quatre', 'Deux', 'Huit'], answer: 1, why: 'Quatre : `allowPrivilegeEscalation`, les capabilities non restreintes, `runAsNonRoot` et `seccompProfile`. Chacun nomme un champ.' },
					{ q: 'Quel élément demande `capabilities.drop=["ALL"]` ?', options: ['`allowPrivilegeEscalation != false`', '`runAsNonRoot != true`', '`unrestricted capabilities`', '`seccompProfile`'], answer: 2, why: 'L’avertissement le dit entre parenthèses : container "nginx" must set `securityContext.capabilities.drop=["ALL"]`.' },
					{ q: 'Quels types de profil seccomp `restricted` accepte-t-il ?', options: ['`Unconfined` ou `RuntimeDefault`', 'Seulement `Localhost`', 'N’importe lequel, tant qu’il y en a un', '`RuntimeDefault` ou `Localhost`'], answer: 3, why: 'L’avertissement nomme les deux : le type doit être "RuntimeDefault" ou "Localhost".' }
				]
			},
			{
				title: 'Écris le securityContext',
				questions: [
					{ q: 'Où va `allowPrivilegeEscalation: false` ?', options: ['Au niveau du Pod seulement', 'Au niveau du conteneur', 'Sur le namespace', 'Sur le Deployment'], answer: 1, why: 'L’avertissement dit que le conteneur `nginx` doit le fixer. C’est un champ de conteneur.' },
					{ q: 'Où peut aller `runAsNonRoot: true` pour `restricted` ?', options: ['Au niveau du Pod ou du conteneur', 'Au niveau du conteneur seulement', 'Au niveau du Pod seulement', 'Dans un label du namespace'], answer: 0, why: 'L’avertissement dit « pod or container », et le contrôle restricted accepte l’un ou l’autre niveau.' },
					{ q: 'Quel bloc retire les capabilities ?', options: ['`capabilities: { add: [] }`', '`capabilities: { drop: ["NET_RAW"] }`', '`capabilities: { drop: ["ALL"] }`', '`privileged: false`'], answer: 2, why: '`restricted` veut que toutes les capabilities soient retirées. En retirer une, ou n’en ajouter aucune, laisse celles par défaut.' },
					{ q: 'Quel réglage seccomp fait disparaître cet élément ?', options: ['`seccompProfile: { type: Unconfined }`', '`seccomp: true`', '`seccompProfile: RuntimeDefault`', '`seccompProfile: { type: RuntimeDefault }`'], answer: 3, why: '`seccompProfile` est un objet avec un `type`, et `RuntimeDefault` est une des deux valeurs acceptées.' }
				]
			},
			{
				title: 'Vérifie ce qui peut échouer au démarrage',
				questions: [
					{ q: 'Le Pod avec le nouveau `securityContext` est admis. Que vérifie encore le kubelet ?', options: ['Que l’image est signée', 'Que nginx écoute sur le port 80', 'Que l’image ne tourne pas en UID 0', 'Que seccomp est installé sur le nœud'], answer: 2, why: 'La doc de l’API pour `runAsNonRoot` : le kubelet va « validate the image at runtime » et refuser un conteneur qui tourne en UID 0.' },
					{ q: 'Imagine que l’utilisateur de l’image soit root. Que se passe-t-il avec `runAsNonRoot: true` ?', options: ['L’admission rejette le Pod', 'Le conteneur ne démarre pas', 'Le kubelet le passe en uid 65534', 'Rien : ça écrit seulement un avertissement'], answer: 1, why: 'L’admission ne lit que la spec du Pod, qui est correcte. Le kubelet voit ensuite que l’image tournerait en UID 0 et ne la lance pas.' },
					{ q: 'Quelle est une correction possible ?', options: ['Retirer à nouveau `runAsNonRoot`', 'Ajouter `privileged: true`', 'Fixer `runAsUser` à un uid non nul, ou prendre une image avec un `USER` non root', 'Fixer `allowPrivilegeEscalation: true`'], answer: 2, why: 'Soit le Pod nomme un uid non nul, soit l’image tourne déjà avec un tel uid. Les autres options défont le durcissement.' },
					{ q: 'Pourquoi l’admission n’attrape-t-elle pas une image root ?', options: ['Le mode `warn` ignore ce champ', 'L’admission ne vérifie que les Deployments', 'Le champ n’est vérifié qu’en mode `audit`', 'L’admission voit la spec du Pod, pas l’utilisateur dans l’image'], answer: 3, why: 'Pod Security Admission vérifie les champs que tu as écrits. L’utilisateur de l’image n’est connu qu’au moment où le kubelet la lance.' }
				]
			},
			{
				title: 'Active enforce',
				questions: [
					{ q: 'L’avertissement a disparu. Quel label poses-tu ensuite ?', options: ['`pod-security.kubernetes.io/warn=restricted`', '`pod-security.kubernetes.io/enforce=restricted`', '`pod-security.kubernetes.io/audit=baseline`', '`pod-security.kubernetes.io/enforce=privileged`'], answer: 1, why: '`warn` t’a permis de trouver les problèmes. C’est en montant `enforce` que tu les bloques.' },
					{ q: 'Après le changement, quelqu’un applique un Pod qui viole encore `restricted`. Que se passe-t-il ?', options: ['Il est rejeté', 'Il est créé avec un avertissement', 'Il tourne et il est tué une minute plus tard', 'Il part dans un autre namespace'], answer: 0, why: '`enforce` rejette un Pod qui viole le niveau, avant que quoi que ce soit ne soit planifié.' },
					{ q: 'Avant de changer le label, quelle commande liste les Pods déjà lancés dans `shop` qui violeraient `restricted` ?', options: ['`kubectl get pods -n shop -o yaml`', '`kubectl auth can-i create pods -n shop`', '`kubectl label --dry-run=server --overwrite namespace shop pod-security.kubernetes.io/enforce=restricted`', '`kubectl apply --dry-run=client -f nginx.yaml`'], answer: 2, why: 'Un dry run côté serveur du changement de label demande à l’API server de comparer les Pods lancés au nouveau niveau, sans rien modifier.' },
					{ q: 'Que fait le mode `audit` en cas de violation ?', options: ['Il rejette le Pod', 'Il renvoie un avertissement à l’utilisateur', 'Il supprime le Pod', 'Il ajoute une annotation dans le journal d’audit'], answer: 3, why: 'Chaque mode fait une chose : `enforce` rejette, `warn` avertit, `audit` annote le journal d’audit.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un namespace n’a aucun label `pod-security.kubernetes.io` et le cluster garde la configuration d’admission par défaut. Quel niveau est imposé ?',
			options: [
				'`restricted`, car Kubernetes 1.25 en a fait le défaut',
				'`baseline`, car il accepte la configuration de Pod par défaut',
				'`privileged`, donc le contrôleur ne rejette rien dans ce namespace',
				'Aucun, tant que le webhook PodSecurity n’est pas installé à la main'
			],
			answer: 2,
			why: 'La `PodSecurityConfiguration` par défaut fixe `enforce: "privileged"` quand aucun label de mode n’est posé. Le niveau privileged est « defined by an absence of restrictions », donc tout Pod est admis.'
		},
		{
			q: 'Le namespace impose `restricted`. Tu appliques un Deployment dont le template de Pod tourne en root. Que vois-tu ?',
			options: [
				'`kubectl apply` échoue avec une erreur PodSecurity sur le Deployment',
				'Le Deployment est créé, et son ReplicaSet ne peut créer aucun Pod',
				'Les Pods démarrent, puis le contrôleur d’admission les tue une minute après',
				'Les Pods démarrent, car restricted ne vise que les Pods créés à la main'
			],
			answer: 1,
			why: 'Le mode enforce ne contrôle que les objets Pod : la doc dit qu’il n’est « **not** applied to workload resources ». Le Deployment passe, et chaque Pod que son ReplicaSet tente de créer est rejeté. `warn` et `audit`, eux, contrôlent le template de Pod.'
		},
		{
			q: 'Lequel de ces cas `baseline` accepte-t-il alors que `restricted` le rejette ?',
			options: [
				'Un conteneur qui tourne en root avec les capabilities par défaut',
				'Un Pod avec un volume `hostPath` qui monte `/var/log`',
				'Un conteneur avec `privileged: true`',
				'Un Pod avec `hostNetwork: true`'
			],
			answer: 0,
			why: 'Baseline « allows the default (minimally specified) Pod configuration », qui tourne avec l’utilisateur de l’image et les capabilities par défaut. Restricted ajoute `runAsNonRoot: true` et le retrait de `ALL`. hostPath, privileged et hostNetwork sont déjà rejetés par baseline.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Poser des labels sur un namespace d’un cluster kind local, voir baseline rejeter un Pod hostPath, et faire passer un Pod en restricted.',
		steps: [
			'Lance un cluster local et pose les labels sur un namespace : `kind create cluster --name psa-lab && kubectl create namespace shop && kubectl label namespace shop pod-security.kubernetes.io/enforce=baseline pod-security.kubernetes.io/warn=restricted`.',
			'Lance le Pod nu de l’exercice et lis l’avertissement : `kubectl -n shop run nginx --image=nginx`.',
			'Essaie un Pod qui monte le `/` du nœud : `echo \'{"apiVersion":"v1","kind":"Pod","metadata":{"name":"bad"},"spec":{"containers":[{"name":"bad","image":"busybox:1.37","command":["sleep","3600"],"volumeMounts":[{"name":"host","mountPath":"/host"}]}],"volumes":[{"name":"host","hostPath":{"path":"/"}}]}}\' | kubectl -n shop apply -f -`.',
			'Applique un Pod conforme à `restricted`, avec une image dont l’utilisateur n’est pas root : `echo \'{"apiVersion":"v1","kind":"Pod","metadata":{"name":"web"},"spec":{"securityContext":{"runAsNonRoot":true,"seccompProfile":{"type":"RuntimeDefault"}},"containers":[{"name":"web","image":"nginxinc/nginx-unprivileged:1.31-alpine","securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}}}]}}\' | kubectl -n shop apply -f -`.',
			'Applique le même Pod avec `"name":"web-root"` et `"image":"nginx"`, puis lance `kubectl -n shop get pods`.',
			'Supprime les Pods en infraction, monte enforce et essaie un Deployment : `kubectl -n shop delete pod nginx web-root && kubectl label --overwrite namespace shop pod-security.kubernetes.io/enforce=restricted && kubectl -n shop create deployment root-web --image=nginx`, puis `kubectl -n shop describe replicaset`.',
			'Nettoie : `kind delete cluster --name psa-lab`.'
		],
		done: [
			'L’étape 2 affiche `Warning: would violate PodSecurity "restricted:latest"`, et `kubectl -n shop get pod nginx` montre le Pod.',
			'L’étape 3 échoue avec `violates PodSecurity "baseline:latest": hostPath volumes (volume "host")`.',
			'`web` est admis sans avertissement et passe en `Running`. `web-root` est admis aussi, et son statut est `CreateContainerConfigError`.',
			'`kubectl create deployment` réussit, et les événements du ReplicaSet montrent `FailedCreate` avec une erreur PodSecurity `forbidden`.'
		],
		solution: [
			'`nginxinc/nginx-unprivileged` fixe un `USER` numérique non root, donc le contrôle `runAsNonRoot` du kubelet au démarrage passe. L’image `nginx` simple tourne en root, donc elle échoue à ce moment-là, pas à l’admission.',
			'Le Deployment montre le piège de la leçon : enforce vérifie les Pods, pas l’objet workload. `warn` et `audit` auraient signalé le template.',
			'Avant de monter enforce sur un vrai namespace, lance `kubectl label --dry-run=server --overwrite namespace shop pod-security.kubernetes.io/enforce=restricted` pour lister les Pods en cours qui le violeraient.'
		]
	},
	recall: {
		q: 'Quel label fait rejeter par l’API server les Pods qui montent un volume hostPath, et par quoi commence l’erreur ?',
		a: '`pod-security.kubernetes.io/enforce=baseline` (ou `restricted`). L’erreur commence par `violates PodSecurity "baseline:latest": hostPath volumes`.'
	},
	sources: [
		{ title: 'Issue Kubernetes 104980, CVE-2021-25741: Symlink Exchange Can Allow Host Filesystem Access', url: 'https://github.com/kubernetes/kubernetes/issues/104980' },
		{ title: 'Doc Kubernetes, Pod Security Standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/' },
		{ title: 'Doc Kubernetes, Pod Security Admission', url: 'https://kubernetes.io/docs/concepts/security/pod-security-admission/' },
		{ title: 'Doc Kubernetes, Enforce Pod Security Standards by configuring the built-in admission controller', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/enforce-standards-admission-controller/' },
		{ title: 'Tutoriel Kubernetes, Apply Pod Security Standards at the namespace level', url: 'https://kubernetes.io/docs/tutorials/security/ns-level-pss/' },
		{ title: 'Source Kubernetes, admission.go de pod-security-admission', url: `${K8S}/staging/src/k8s.io/pod-security-admission/admission/admission.go#L475-L484` },
		{ title: 'Source Kubernetes, runAsNonRoot dans core/v1 types.go', url: `${K8S}/staging/src/k8s.io/api/core/v1/types.go#L5276-L5283` }
	]
};
