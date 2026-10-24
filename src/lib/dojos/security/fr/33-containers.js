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
		],
		steps: [
			{
				title: 'Vérifie l’utilisateur',
				questions: [
					{ q: 'Le Dockerfile n’a pas de ligne `USER`. Sous quel uid tourne `server.py` ?', options: ['0, root', '65532, nonroot', '65534, nobody', '1000, le premier utilisateur'], answer: 0, why: 'Docker lance le premier processus en `root` tant que l’image ne fixe pas `USER`.' },
					{ q: 'Sur l’image actuelle, quelqu’un lance `docker exec shop-api ls` dans un conteneur où un attaquant a écrit. Sous quel uid tourne `ls` ?', options: ['L’uid de cette personne sur l’hôte', '0 : exec prend l’utilisateur de l’image, et l’annonce de runc comptait aussi ce cas', '65534 : exec passe toujours en `nobody`', 'Aucun : Docker refuse l’exec dans un service lancé'], answer: 1, why: 'Sans `USER`, chaque processus du conteneur, exec compris, démarre en root. Un `docker exec` dans un conteneur écrit par l’attaquant était l’une des façons de remplir la condition de CVE-2019-5736.' },
					{ q: 'Quelle ligne `USER` mets-tu dans l’étape finale distroless ?', options: ['`USER root`', '`USER 0`', '`USER nonroot`', '`USER app`, créé avec `useradd`'], answer: 2, why: 'Distroless définit déjà `nonroot`. L’image n’a ni `useradd` ni shell pour créer un nouvel utilisateur.' },
					{ q: 'Quel uid distroless donne-t-il à `nonroot` ?', options: ['0', '65534', '1000', '65532'], answer: 3, why: 'Distroless définit `nonroot` avec l’uid 65532, et `nobody` avec l’uid 65534.' }
				]
			},
			{
				title: 'Retire le shell',
				questions: [
					{ q: 'Que contient `python:3.12` qu’un attaquant peut utiliser après un bug dans l’appli ?', options: ['`/bin/sh` et `pip`', 'Seulement l’interpréteur Python', 'Rien de plus que l’appli', 'Un shell busybox de debug'], answer: 0, why: 'L’image complète a un shell pour lancer des commandes et un gestionnaire de paquets pour récupérer des outils.' },
					{ q: 'Comment garder `pip install` sans livrer de shell ?', options: ['Lancer `pip install` au démarrage du conteneur', 'Installer dans un virtualenv lors d’une étape de build, puis le copier dans distroless', 'Supprimer `/bin/sh` avec un dernier `RUN rm`', 'Passer sur `python:3.12-slim`'], answer: 1, why: 'L’étape de build a `pip` et un shell. Seuls le virtualenv et `/app` arrivent dans `gcr.io/distroless/python3-debian13`.' },
					{ q: 'Pourquoi écrire `CMD ["/app/server.py"]` en forme JSON ?', options: ['La forme JSON démarre plus vite', 'Docker refuse la forme texte sur les images Python', 'Il n’y a pas de shell pour lancer une commande texte, et l’entrypoint est déjà Python', 'Elle rend `/app` en lecture seule'], answer: 2, why: 'Le README distroless demande la forme JSON, car une commande texte a besoin de `/bin/sh`.' },
					{ q: 'Pendant un incident, tu as besoin d’un shell pour déboguer la nouvelle image. Que fais-tu ?', options: ['Lancer `docker exec` avec `--shell`', 'Ajouter `--cap-add SYS_ADMIN`', 'Installer bash avec `pip` au démarrage', 'Passer l’image sur un tag distroless `:debug`, qui a un shell busybox'], answer: 3, why: 'L’image de prod n’a pas de shell, exprès. Distroless publie des tags `:debug` avec busybox, et il faut changer d’image pour en utiliser un.' }
				]
			},
			{
				title: 'Corrige les capabilities',
				questions: [
					{ q: 'À quoi sert `SYS_ADMIN` ?', options: ['À ouvrir des ports sous 1024', 'À « a range of system administration operations »', 'À écrire dans `/tmp`', 'À lancer l’interpréteur Python'], answer: 1, why: 'C’est une des capabilities les plus larges, et rien dans ce service n’en a besoin.' },
					{ q: 'De quelle capability l’écoute sur le port 8080 a-t-elle besoin ?', options: ['Aucune : 8080 est au-dessus de 1024', '`CAP_NET_BIND_SERVICE`', '`CAP_NET_RAW`', '`SYS_ADMIN`'], answer: 0, why: 'Seuls les ports sous 1024 demandent `CAP_NET_BIND_SERVICE`. Un port au-dessus de 1024 ne demande aucune capability.' },
					{ q: 'Combien de capabilities Docker garde-t-il par défaut, avant `--cap-add SYS_ADMIN` ?', options: ['Aucune', '4', '14', 'Toutes'], answer: 2, why: 'Docker en garde 14 par défaut, dont `CAP_NET_RAW` et `CAP_SETUID`.' },
					{ q: 'Quels flags retirent toutes les capabilities et empêchent `su` et `sudo` de marcher ?', options: ['`--user nobody`', '`--read-only`', '`--cap-add NET_BIND_SERVICE`', '`--cap-drop ALL --security-opt no-new-privileges`'], answer: 3, why: '`--cap-drop ALL` retire les 14 par défaut, et `no-new-privileges` empêche les processus de gagner de nouveaux privilèges.' }
				]
			},
			{
				title: 'Écris la nouvelle ligne',
				questions: [
					{ q: 'Avec `--read-only`, un attaquant dans `server.py` essaie d’enregistrer un outil dans `/usr/bin`. Que se passe-t-il ?', options: ['Ça marche jusqu’au redémarrage du conteneur', 'L’écriture échoue : le système de fichiers racine est en lecture seule', 'Le fichier atterrit dans le tmpfs', 'Ça marche, car l’image fixe `USER nonroot`'], answer: 1, why: 'Les écritures ne vont que vers les montages listés, ici le tmpfs de `/tmp`. Tout le reste, `/usr/bin` compris, les refuse.' },
					{ q: 'Qu’empêche `noexec` sur ce tmpfs ?', options: ['D’écrire dans `/tmp`', 'De lire dans `/tmp`', 'De lancer un fichier que l’attaquant dépose dans `/tmp`', 'De supprimer des fichiers dans `/tmp`'], answer: 2, why: 'L’appli peut toujours écrire ses fichiers temporaires. Un binaire écrit là ne peut pas s’exécuter.' },
					{ q: 'Quelle est la nouvelle ligne `docker run` ?', options: ['`docker run -d -p 8080:8080 --read-only --tmpfs /tmp:rw,noexec,nosuid --cap-drop ALL --security-opt no-new-privileges shop-api`', '`docker run -d -p 8080:8080 --read-only --tmpfs /tmp:rw,noexec,nosuid --cap-drop ALL --cap-add SYS_ADMIN shop-api`', '`docker run -d -p 8080:8080 --tmpfs /tmp:rw,noexec,nosuid --cap-drop ALL shop-api`', '`docker run -d -p 8080:8080 --read-only --tmpfs /tmp:rw,noexec,nosuid --privileged shop-api`'], answer: 0, why: 'Elle a tout : racine en lecture seule, un tmpfs `noexec` pour `/tmp`, aucune capability et aucun nouveau privilège. L’utilisateur et le shell se règlent dans l’image.' },
					{ q: 'Qu’apporte `no-new-privileges` en plus de `--cap-drop ALL` ?', options: ['Le système de fichiers passe en lecture seule', 'Le processus tourne avec l’uid 65532', 'Le port 8080 est bloqué depuis l’extérieur', 'Des commandes comme `su` ou `sudo` ne marchent plus'], answer: 3, why: 'La doc Docker : avec cette option, `su` ou `sudo` « no longer work ». Le processus ne peut pas regagner de privilèges.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Retirer un à un les réglages par défaut de Docker et voir chaque défense marcher : utilisateur non root, système de fichiers en lecture seule, aucune capability, aucun shell.',
		steps: [
			'Regarde l’utilisateur par défaut : `docker run --rm python:3.12-alpine id`, puis `docker run --rm --user 65534 python:3.12-alpine id`.',
			'Essaie une racine en lecture seule : `docker run --rm --read-only python:3.12-alpine touch /usr/bin/x`. Puis donne-lui un tmpfs `noexec` et essaie d’y lancer un binaire copié : `docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid python:3.12-alpine sh -c "cp /bin/busybox /tmp/bb && /tmp/bb true"`.',
			'Compare les masques de capabilities : `docker run --rm python:3.12-alpine grep CapEff /proc/self/status`, puis la même chose avec `--cap-drop ALL`.',
			'Lance un petit serveur web avec toutes les défenses : `docker run -d --name shop-lab -p 8088:8080 --user 65534 --read-only --tmpfs /tmp:rw,noexec,nosuid --cap-drop ALL --security-opt no-new-privileges python:3.12-alpine python -m http.server 8080 -d /tmp`, puis `curl -I localhost:8088` et `docker exec shop-lab id`.',
			'Essaie d’obtenir un shell dans une image distroless : `docker run --rm --entrypoint sh gcr.io/distroless/static-debian13`.',
			'Nettoie : `docker stop shop-lab && docker rm shop-lab`.'
		],
		done: [
			'Le premier `id` affiche `uid=0(root)`, le second `uid=65534(nobody)`.',
			'`touch` échoue avec `Read-only file system`, et `/tmp/bb` échoue avec `Permission denied` alors que la copie a marché.',
			'`CapEff` est un masque non nul par défaut, et `0000000000000000` avec `--cap-drop ALL`.',
			'`curl -I localhost:8088` renvoie `HTTP/1.0 200 OK`, et `docker exec shop-lab id` montre l’uid 65534.',
			'Le lancement distroless échoue avec `exec: "sh": executable file not found in $PATH`.'
		],
		solution: [
			'Le port 8080 dans le conteneur est au-dessus de 1024, donc le serveur n’a besoin d’aucune capability.',
			'`noexec` laisse l’appli écrire dans `/tmp` mais empêche tout ce qui y est écrit de s’exécuter.',
			'Pour un vrai service, fixe `USER` dans l’image plutôt que `--user`, pour que chaque lancement l’ait.'
		]
	},
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
