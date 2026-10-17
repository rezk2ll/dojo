const RUNC = 'https://github.com/opencontainers/runc/blob/d2691cb3cb12a0d830d8bb65c3156e2c966d6f99';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'namespaces',
	part: 'Les conteneurs vus du noyau',
	title: 'Les namespaces',
	minutes: 10,
	hook: [
		'Tu lances un conteneur avec `docker run -d --name nsdemo busybox sleep 300`. `docker exec nsdemo ps` montre `sleep 300` en PID 1. Sur l’hôte, `ps` montre le même processus en PID 4145502, et `grep NSpid /proc/4145502/status` affiche `NSpid: 4145502 1`. (Sortie relevée sur la machine où ce chapitre a été écrit, Docker 29.9 avec runc 1.5.2.)',
		'Un seul processus a deux PID parce qu’il vit dans deux namespaces PID, celui de l’hôte et celui du conteneur. Dedans, `hostname` affiche `90f67579c52c` alors que l’hôte s’appelle `thinkPad`, et `ip link` ne liste que `lo` et `eth0`.',
		'Dans le conteneur, `readlink /proc/1/ns/user` a affiché `user:[4026531837]`, la même valeur que sur l’hôte. **Ce conteneur partage le namespace user de l’hôte** : son root est aussi l’UID 0 sur l’hôte.'
	],
	terms: [
		{ term: 'Namespace', def: 'Un objet du noyau qui donne aux processus qu’il contient leur propre copie d’une ressource globale : numéros de processus, montages, pile réseau, nom d’hôte, UID, IPC, racine des cgroups ou horloges. namespaces(7) en liste 8 types.' },
		{ term: '`/proc/<pid>/ns`', def: 'Un dossier avec un lien symbolique par namespace d’un processus, comme `net -> net:[4026531833]`. Deux processus sont dans le même namespace quand les numéros sont égaux.' },
		{ term: 'unshare', def: 'L’appel système `unshare(2)` fait entrer l’appelant dans de nouveaux namespaces, choisis par des drapeaux `CLONE_NEW*`. La commande `unshare` de util-linux lance un programme de cette façon.' },
		{ term: 'nsenter', def: 'La commande de util-linux qui lance un programme dans les namespaces d’un autre processus, `-t <pid>`, en appelant `setns(2)` sur ses fichiers `/proc/<pid>/ns/*`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['runc["runc init, étape 1"] -->|"unshare(CLONE_NEWNS | NEWUTS | NEWIPC | NEWNET | NEWPID | NEWCGROUP)"| ns["6 nouveaux namespaces, chacun avec un numéro d’inode"]'],
				highlight: ['runc', 'ns'],
				note: 'Le runtime appelle `unshare(2)` avec un drapeau `CLONE_NEW*` par namespace voulu. Dans la sortie plus haut, le conteneur avait de nouveaux namespaces pid, net, mnt, uts, ipc et cgroup, par exemple `net:[4026534677]` contre `net:[4026531833]` pour l’hôte. Aucun drapeau pour le namespace user : il est resté celui de l’hôte.'
			},
			{
				add: ['ns -->|"fork : premier enfant"| init["sleep 300 : PID 1 dedans, 4145502 sur l’hôte"]'],
				highlight: ['init'],
				note: 'Un nouveau namespace PID ne s’applique qu’aux enfants. pid_namespaces(7) : "the first child created by a process after a call to unshare(2) using the CLONE_NEWPID flag has the PID 1". Le noyau donne à cet enfant un PID dans chaque namespace jusqu’à la racine, ce que montrent les deux nombres de `NSpid`.'
			},
			{
				add: ['init --> uts["UTS : nom d’hôte 90f67579c52c"]', 'init --> mnt["Mount : sa propre table de montage et un /proc pour le nouveau namespace PID"]'],
				highlight: ['uts', 'mnt'],
				note: 'Dans le namespace UTS, `sethostname(2)` ne change le nom que pour ce namespace, et l’hôte garde `thinkPad`. Le namespace mount a sa propre table de montage, avec un `proc` monté pour le nouveau namespace PID. Du coup, `ps` dedans n’a listé que le PID 1 et la commande `ps` elle-même.'
			},
			{
				add: ['init --> net["Réseau : lo, plus eth0, un bout d’une paire veth"]'],
				highlight: ['net'],
				note: 'Un nouveau namespace réseau a ses propres interfaces, routes, règles de pare-feu, ports et valeurs de `/proc/sys/net`. Dedans, `ip link` montre `eth0@if530`. Sur l’hôte, l’interface 530 est `veth6abf4fb`, rattachée à `docker0` : les deux bouts d’une même paire veth. Ici `net.core.somaxconn` valait 4096, la valeur du noyau pour un nouveau namespace (chapitre 31).'
			},
			{
				add: ['admin["nsenter -t 4145502 -n ss -lnt"] -->|"setns(/proc/4145502/ns/net)"| net'],
				highlight: ['admin'],
				note: '`nsenter -t 4145502 -n` ouvre `/proc/4145502/ns/net`, appelle `setns(2)` et y lance le programme. Seul le namespace réseau change : `ss` vient du système de fichiers de l’hôte et liste les sockets du conteneur. Un namespace disparaît quand son dernier processus se termine, sauf si un descripteur de fichier ou un bind mount tient encore un de ces fichiers.'
			}
		]
	},
	example: {
		title: 'libcontainer/nsenter/nsexec.c : runc rejoint, puis unshare, puis forke',
		repo: 'opencontainers/runc',
		url: `${RUNC}/libcontainer/nsenter/nsexec.c#L1032-L1132`,
		lang: 'c',
		code: `			if (config.namespaces)
				join_namespaces(config.namespaces);
…
			if (config.cloneflags & CLONE_NEWUSER) {
				try_unshare(CLONE_NEWUSER, "user namespace");
				config.cloneflags &= ~CLONE_NEWUSER;
…
				/* Become root in the namespace proper. */
				if (setresuid(0, 0, 0) < 0)
					bail("failed to become root in user namespace");
			}
…
			try_unshare(config.cloneflags, "remaining namespaces");
…
			/*
			 * TODO: What about non-namespace clone flags that we're dropping here?
			 *
			 * We fork again because of PID namespace, setns(2) or unshare(2) don't
			 * change the PID namespace of the calling process, because doing so
			 * would change the caller's idea of its own PID (as reported by getpid()),
			 * which would break many applications and libraries, so we must fork
			 * to actually enter the new PID namespace.
			 */
			write_log(DEBUG, "spawn stage-2");
			stage2_pid = clone_parent(&env, STAGE_INIT);`,
		notes: [
			'Les lignes 1 et 2 rejoignent d’abord des namespaces existants, avec `setns(2)`. Dans la config de runc, un namespace qui a un `path` est rejoint, et [`CloneFlags`](' + RUNC + '/libcontainer/configs/namespaces_syscall.go#L22-L33) le saute quand il calcule les drapeaux des nouveaux. Deux conteneurs peuvent partager ainsi un même namespace réseau.',
			'Les lignes 4 à 6 créent le namespace user seul, avant les autres. Le commentaire juste au-dessus, dans le fichier, dit que les namespaces user "affect our ability to unshare other namespaces and are used as context for privilege checks". La ligne 9 passe ensuite à l’UID 0 à l’intérieur, une fois que le processus parent a écrit la table des UID.',
			'La ligne 13 crée tous les namespaces restants en un seul appel `unshare(2)`. `try_unshare` réessaie jusqu’à 5 fois sur `EINVAL`, un contournement pour les noyaux antérieurs à 4.3 décrit dans le même fichier.',
			'Les lignes 15 à 23 expliquent le deuxième fork : `unshare(2)` ne fait pas entrer l’appelant dans le nouveau namespace PID. L’enfant créé par `clone_parent` à la ligne 25 est le premier processus du namespace : il reçoit le PID 1 et lance plus tard la commande du conteneur.'
		]
	},
	tradeoff: {
		gain: [
			'runc monte un conteneur avec `unshare(2)` et deux appels `clone`, sur le même noyau que l’hôte. Aucun second noyau ne démarre, et le processus apparaît dans le `ps` de l’hôte avec un PID normal.',
			'Chaque namespace réseau a ses propres ports et valeurs de `/proc/sys/net` : deux conteneurs peuvent écouter tous les deux sur le port 80 et régler chacun son `net.core.somaxconn`.'
		],
		cost: [
			'Tous les conteneurs d’un hôte tournent sur le noyau de l’hôte, et le namespace time ne couvre que les horloges boot et monotone. Un processus privilégié qui règle `CLOCK_REALTIME` change donc aussi la date de l’hôte.',
			'Sans nouveau namespace user, root dans le conteneur est l’UID 0 sur l’hôte. Docker ne le mappe vers une plage sans privilèges que si `userns-remap` est activé sur le démon.',
			'`unshare --pid` sans `--fork` laisse la commande hors du nouveau namespace PID. runc a besoin d’un deuxième fork pour la même raison.'
		]
	},
	task: {
		prompt: 'Sur un hôte Docker, lance `docker run -d --name ns1 busybox sleep 600` et `P=$(docker inspect -f \'{{.State.Pid}}\' ns1)`. Ensuite : (1) `grep NSpid /proc/$P/status` ; (2) pour chaque type parmi `pid net mnt uts ipc user cgroup`, compare `readlink /proc/self/ns/<type>` sur l’hôte avec `docker exec ns1 readlink /proc/1/ns/<type>` ; (3) `sudo nsenter -t $P -n ip -brief link`. Dis ce que montre chacun des trois résultats.',
		hint: 'Le `/proc/1` du conteneur, c’est le `/proc/$P` de l’hôte vu depuis son namespace PID. `nsenter -n` ne change que le namespace réseau.',
		answer: [
			'(1) Sur la machine où ce chapitre a été écrit : `NSpid: 4145502 1`. Le processus est le PID 4145502 dans le namespace PID de l’hôte et le PID 1 dans celui du conteneur.',
			'(2) Six types diffèrent, par exemple `net:[4026531833]` sur l’hôte contre `net:[4026534677]` dans le conteneur. `user` est identique, `user:[4026531837]`, car Docker n’a pas créé de namespace user : root dedans est l’UID 0 sur l’hôte.',
			'(3) `nsenter` lance le `ip` de l’hôte dans le namespace réseau du conteneur. Il liste le `lo` et le `eth0` du conteneur, les deux mêmes interfaces que `docker exec ns1 ip -o link`, et aucune interface de l’hôte.',
			'L’image busybox contient `ip`, mais beaucoup d’images n’ont aucun outil. `nsenter -t $P -n` te laisse déboguer leur réseau avec les binaires de l’hôte.'
		]
	},
	quiz: [
		{
			q: 'Un shell lancé en root appelle `unshare(CLONE_NEWPID)`, puis affiche son propre PID avec `echo $$`. Qu’affiche-t-il ?',
			options: [
				'1, car l’appelant est maintenant le processus init du nouveau namespace',
				'0, car l’appelant n’a plus de PID tant qu’il n’a pas forké',
				'Son ancien PID, car le namespace ne vaut que pour son prochain enfant',
				'Une erreur, car un processus ne peut pas quitter son namespace PID'
			],
			answer: 2,
			why: '`unshare(2)` avec `CLONE_NEWPID` ne déplace pas l’appelant, sinon son PID changerait sous ses pieds. Le premier enfant qu’il forke reçoit le PID 1 dans le nouveau namespace. Pour la même raison, `unshare --pid` a besoin de `--fork` et runc forke une deuxième fois.'
		},
		{
			q: 'Un conteneur Docker tourne en root, et le démon n’a pas `userns-remap`. Quel UID a ce processus sur l’hôte ?',
			options: [
				'0, car le conteneur utilise le namespace user de l’hôte',
				'100000, le premier UID de la plage subordonnée de `/etc/subuid`',
				'65534, car Docker mappe root vers `nobody` sur l’hôte',
				'L’UID de l’utilisateur qui a tapé `docker run`'
			],
			answer: 0,
			why: 'Sans `CLONE_NEWUSER`, le conteneur reste dans le namespace user de l’hôte : `/proc/<pid>/ns/user` affiche le même numéro dedans et dehors. Les UID ne sont pas traduits, donc root dedans est root dehors. Une plage comme 100000 ne sert qu’avec `userns-remap` ou le mode rootless.'
		},
		{
			q: 'Tu veux lister les sockets en écoute d’un conteneur dont l’image n’a pas `ss`. Quelle commande le fait ?',
			options: [
				'`docker exec web ss -lnt`, qui lance le `ss` de l’hôte dans le conteneur',
				'`sudo nsenter -t <pid> -n ss -lnt`, avec le PID du processus du conteneur',
				'`sudo unshare -n ss -lnt`, qui ouvre le namespace réseau du conteneur',
				'`ss -lnt` sur l’hôte, qui liste les sockets de tous les namespaces'
			],
			answer: 1,
			why: '`nsenter -n` appelle `setns(2)` sur `/proc/<pid>/ns/net` et garde le namespace mount de l’hôte : le `ss` de l’hôte tourne sur les sockets du conteneur. `docker exec` cherche `ss` dans l’image. `unshare -n` crée un nouveau namespace réseau, vide.'
		}
	],
	recall: {
		q: 'Quel fichier montre si deux processus partagent un namespace réseau, et pourquoi `unshare --pid` a-t-il besoin de `--fork` pour donner le PID 1 à une commande ?',
		a: '`/proc/<pid>/ns/net` : le même numéro, comme `net:[4026531833]`, veut dire le même namespace. `CLONE_NEWPID` ne s’applique qu’aux enfants de l’appelant, donc la commande doit être un enfant forké pour avoir le PID 1.'
	},
	sources: [
		{ title: 'namespaces(7), man7.org', url: 'https://man7.org/linux/man-pages/man7/namespaces.7.html' },
		{ title: 'pid_namespaces(7), man7.org', url: 'https://man7.org/linux/man-pages/man7/pid_namespaces.7.html' },
		{ title: 'network_namespaces(7), man7.org', url: 'https://man7.org/linux/man-pages/man7/network_namespaces.7.html' },
		{ title: 'unshare(1), man7.org', url: 'https://man7.org/linux/man-pages/man1/unshare.1.html' },
		{ title: 'nsenter(1), man7.org', url: 'https://man7.org/linux/man-pages/man1/nsenter.1.html' },
		{ title: 'Doc Docker, Isolate containers with a user namespace', url: 'https://docs.docker.com/engine/security/userns-remap/' },
		{ title: 'Source de runc, libcontainer/configs/namespaces_syscall.go', url: `${RUNC}/libcontainer/configs/namespaces_syscall.go` }
	]
};
