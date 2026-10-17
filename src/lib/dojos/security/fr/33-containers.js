const KSM = 'https://github.com/kubernetes/kube-state-metrics/blob/7a6bbc2c40cf4506615cc299880fc1f7e84c6895';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'containers',
	part: 'En production',
	title: 'Durcir un conteneur',
	minutes: 10,
	hook: [
		'Le 11 février 2019, les mainteneurs de runc annoncent CVE-2019-5736. runc est le runtime sous Docker, containerd, cri-o et Kubernetes. Un conteneur malveillant pouvait « overwrite the host runc binary and thus gain root-level code execution on the host » : écraser le binaire runc de l’hôte et y devenir root.',
		'L’attaque avait une seule condition : lancer n’importe quelle commande « as root within a container ». Une image contrôlée par l’attaquant suffisait, tout comme un `docker exec` dans un conteneur où l’attaquant avait pu écrire. La politique AppArmor par défaut ne la bloquait pas.',
		'Docker lance le premier processus en `root` (uid 0) si l’image ne fixe pas `USER`, et garde 14 capabilities Linux par défaut. Ici, tu retires ces réglages un par un : un **utilisateur non root**, un système de fichiers en lecture seule, aucune capability, aucun shell.'
	],
	terms: [
		{ term: 'Capability', def: 'Un morceau du pouvoir de root sous Linux, comme `CAP_NET_RAW` (sockets bruts) ou `CAP_CHOWN` (changer le propriétaire d’un fichier). Docker en garde 14 par défaut pour un conteneur.' },
		{ term: 'Système de fichiers racine en lecture seule', def: 'Avec `--read-only`, les fichiers propres du conteneur sont montés en lecture seule. Les écritures ne vont que vers les volumes et les tmpfs que tu listes.' },
		{ term: 'Image distroless', def: 'Une image de base du projet distroless de Google, avec les dépendances d’exécution de l’appli, sans gestionnaire de paquets ni shell.' },
		{ term: 'no-new-privileges', def: 'Une option de sécurité Docker qui empêche les processus du conteneur d’obtenir de nouveaux privilèges. La doc Docker : des commandes comme `su` ou `sudo` « no longer work ».' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['bug["L’attaquant exécute du code dans l’appli"] --> proc["Processus : uid 0, 14 capabilities par défaut"]'],
				highlight: ['bug', 'proc'],
				note: 'On part des réglages par défaut. Une image sans ligne `USER` lance son processus en uid 0. Docker garde 14 capabilities, dont `CAP_NET_RAW` pour les sockets bruts et `CAP_SETUID` pour changer d’utilisateur.'
			},
			{
				add: ['proc --> sh["Lance /bin/sh, télécharge des outils, écrit dans /usr/bin"]', 'proc --> esc["Remplit la condition de CVE-2019-5736 : une commande en root"]'],
				highlight: ['sh', 'esc'],
				note: 'L’attaquant se sert de ce que l’image lui offre. Un shell exécute ses commandes, un système de fichiers en écriture garde ses outils, et être root dans le conteneur suffisait pour l’évasion runc.'
			},
			{
				add: ['user["USER nobody (uid 65534)"] -.->|"bloque"| esc'],
				highlight: ['user'],
				note: 'Défense 1 : un utilisateur non root. Avec `USER nobody` dans le Dockerfile, le processus tourne en uid 65534. L’annonce runc exigeait une commande « as root within a container », donc la condition n’est plus remplie.'
			},
			{
				add: ['ro["--read-only, --tmpfs /tmp:noexec"] -.->|"bloque les écritures"| sh', 'caps["--cap-drop ALL, no-new-privileges"] -.->|"ni sockets bruts, ni sudo"| proc'],
				highlight: ['ro', 'caps'],
				note: 'Défenses 2 et 3. `--read-only` refuse toute écriture hors des montages listés, et `noexec` sur `/tmp` empêche d’y exécuter un fichier. `--cap-drop ALL` retire les 14 capabilities, et avec `no-new-privileges`, `su` et `sudo` ne marchent plus.'
			},
			{
				add: ['dl["Image de base distroless : ni shell, ni gestionnaire de paquets"] -.->|"sh: not found"| sh'],
				highlight: ['dl'],
				note: 'Défense 4 : rien à lancer. Le README de distroless : les images « do not contain package managers, shells or any other programs ». `docker exec ... sh` échoue, tout comme le `curl | sh` de l’attaquant.'
			}
		]
	},
	example: {
		title: 'Dockerfile : kube-state-metrics sur distroless, en nobody',
		repo: 'kubernetes/kube-state-metrics',
		url: `${KSM}/Dockerfile#L1-L18`,
		lang: 'dockerfile',
		code: `ARG GOVERSION=1.27
ARG GOARCH
FROM golang:\${GOVERSION} AS builder
ARG GOARCH
ENV GOARCH=\${GOARCH}
WORKDIR /go/src/k8s.io/kube-state-metrics/
COPY . /go/src/k8s.io/kube-state-metrics/

RUN make build-local

FROM gcr.io/distroless/static-debian13:latest-\${GOARCH}
COPY --from=builder /go/src/k8s.io/kube-state-metrics/kube-state-metrics /

USER nobody

ENTRYPOINT ["/kube-state-metrics", "--port=8080", "--telemetry-port=8081"]

EXPOSE 8080 8081`,
		notes: [
			'Les lignes 3 à 9 compilent le binaire dans l’image `golang` complète, avec son compilateur et son shell. Rien de tout ça n’arrive dans l’image finale.',
			'La ligne 11 part de `distroless/static`, qui contient les certificats CA, `/etc/passwd`, `/tmp` et tzdata. La ligne 12 y copie un seul fichier : le binaire statique.',
			'La ligne 14 fixe `USER nobody`. Distroless définit `nobody` avec l’uid 65534 et le shell `/sbin/nologin`.',
			'La ligne 16 écrit `ENTRYPOINT` en forme JSON. Le README de distroless l’exige, car il n’y a pas de shell pour lancer une commande en chaîne. Les ports 8080 et 8081 sont au-dessus de 1024, donc le processus n’a pas besoin de `CAP_NET_BIND_SERVICE`.'
		]
	},
	tradeoff: {
		gain: [
			'Un processus en uid 65534 ne remplit pas la condition de CVE-2019-5736, une commande lancée en root dans le conteneur.',
			'Après `--cap-drop ALL`, un processus qui parvient quand même à root ne peut ni ouvrir de socket brut, ni changer le propriétaire d’un fichier, ni créer de fichier de périphérique.',
			'L’image finale de kube-state-metrics contient un binaire et les fichiers distroless : une attaque qui compte sur un shell n’a rien à appeler.'
		],
		cost: [
			'Tu ne peux pas ouvrir de shell dans le conteneur pour déboguer. Distroless propose des tags `:debug` avec un shell busybox, et il faut changer d’image pour s’en servir.',
			'Une appli qui écrit dans son propre dossier plante sous `--read-only` tant que tu n’y montes pas un volume ou un tmpfs.',
			'Une appli qui écoute sur le port 80 ou 443 a de nouveau besoin de `CAP_NET_BIND_SERVICE`, ou d’un port au-dessus de 1024.'
		]
	},
	task: {
		prompt: 'Voici un service. Dockerfile : `FROM python:3.12` / `COPY . /app` / `RUN pip install -r /app/requirements.txt` / `CMD python /app/server.py`. Commande : `docker run -d -p 8080:8080 --cap-add SYS_ADMIN shop-api`. L’appli écoute sur 8080 et écrit des fichiers temporaires dans `/tmp`. Liste ce qu’il faut changer, puis écris la nouvelle ligne `docker run`.',
		hint: 'Passe les quatre défenses en revue : utilisateur, système de fichiers, capabilities, shell. De quelle capability un port au-dessus de 1024 a-t-il besoin ?',
		answer: [
			'Utilisateur : il n’y a pas de `USER`, donc le processus tourne en uid 0. Ajoute `USER nonroot` à l’étape finale : distroless définit `nonroot` avec l’uid 65532.',
			'Shell : `python:3.12` contient `/bin/sh` et `pip`. Installe les dépendances dans un virtualenv lors d’une étape de build, puis copie-le avec `/app` dans `FROM gcr.io/distroless/python3-debian13`, qui n’a ni l’un ni l’autre. Son entrypoint est déjà Python, donc écris `CMD ["/app/server.py"]` en forme JSON.',
			'Capabilities : `SYS_ADMIN` sert à « a range of system administration operations », et rien ici n’en a besoin. Le port 8080 ne demande aucune capability, donc retire-les toutes.',
			'Nouvelle ligne : `docker run -d -p 8080:8080 --read-only --tmpfs /tmp:rw,noexec,nosuid --cap-drop ALL --security-opt no-new-privileges shop-api`.'
		]
	},
	quiz: [
		{
			q: 'À quelle condition un conteneur pouvait-il exploiter CVE-2019-5736 pour écraser le binaire runc de l’hôte ?',
			options: [
				'Seulement si le conteneur était lancé avec `--privileged`',
				'Dès qu’une commande tournait en root dans le conteneur',
				'Seulement si le socket Docker était monté dans le conteneur',
				'Si le conteneur avait un volume en écriture partagé avec l’hôte'
			],
			answer: 1,
			why: 'L’annonce runc : l’attaquant doit lancer n’importe quelle commande « as root within a container », depuis sa propre image ou via un `docker exec` dans un conteneur où il a écrit. Un processus avec un uid non root ne remplit pas cette condition.'
		},
		{
			q: 'Tu ajoutes `--read-only` à `docker run` et l’appli plante en écrivant `/tmp/upload-1.part`. Quelle correction garde la protection ?',
			options: [
				'Retirer `--read-only` et lancer chaque nuit un scan des nouveaux fichiers',
				'Lancer l’appli en root pour qu’elle écrive malgré le montage en lecture seule',
				'Monter un tmpfs sur `/tmp` avec `--tmpfs /tmp:rw,noexec,nosuid`',
				'Ajouter `--cap-add DAC_OVERRIDE` pour contourner les droits des fichiers'
			],
			answer: 2,
			why: '`--read-only` refuse les écritures hors des volumes et des tmpfs listés. Un tmpfs sur `/tmp` donne à l’appli un dossier en mémoire où écrire, et `noexec` empêche d’y exécuter les fichiers. Le reste du système de fichiers reste en lecture seule.'
		},
		{
			q: 'Pendant un incident, une ingénieure lance `docker exec -it app sh` sur un conteneur construit sur distroless. Que se passe-t-il ?',
			options: [
				'Le shell démarre, car Docker injecte busybox dans chaque exec',
				'Le shell démarre en root, car exec ignore le `USER` de l’image',
				'La commande échoue et demande le mot de passe de root',
				'La commande échoue, car l’image n’a aucun binaire `sh` à lancer'
			],
			answer: 3,
			why: 'Les images distroless « do not contain package managers, shells or any other programs ». L’image n’a pas de `/bin/sh`, donc `docker exec` n’a rien à démarrer. Les tags `:debug` ajoutent un shell busybox pour cette raison.'
		}
	],
	recall: {
		q: 'Quels quatre réglages retirent les défauts de Docker pour le processus d’un conteneur, et sous quel uid tourne kube-state-metrics ?',
		a: 'Un `USER` non root, `--read-only` avec un tmpfs, `--cap-drop ALL` avec `no-new-privileges`, et une base distroless sans shell. kube-state-metrics tourne en `nobody`, uid 65534.'
	},
	sources: [
		{ title: 'Aleksa Sarai, CVE-2019-5736: runc container breakout (oss-security, 11 février 2019)', url: 'https://www.openwall.com/lists/oss-security/2019/02/11/2' },
		{ title: 'Doc Docker, Docker Engine security', url: 'https://docs.docker.com/engine/security/' },
		{ title: 'Doc Docker, Running containers', url: 'https://docs.docker.com/engine/containers/run/' },
		{ title: 'Doc Docker, docker container run', url: 'https://docs.docker.com/reference/cli/docker/container/run/' },
		{ title: 'Source moby, capabilities par défaut', url: 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/daemon/pkg/oci/caps/defaults.go#L4-L21' },
		{ title: 'README de distroless', url: 'https://github.com/GoogleContainerTools/distroless/blob/7e55c167b7c993f738e933c3bc0f46190a5b367d/README.md' },
		{ title: 'distroless, entrées utilisateur dans common/BUILD.bazel', url: 'https://github.com/GoogleContainerTools/distroless/blob/7e55c167b7c993f738e933c3bc0f46190a5b367d/common/BUILD.bazel#L134-L164' },
		{ title: 'Page de manuel mount(8), noexec', url: 'https://man7.org/linux/man-pages/man8/mount.8.html' }
	]
};
