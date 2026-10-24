const PROFILES = 'https://github.com/moby/profiles/blob/4b8214fc4971e06172938a1f1554ccff6647ee80';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'seccomp',
	part: 'Les conteneurs vus du noyau',
	title: 'seccomp',
	minutes: 10,
	hook: [
		'Juillet 2021, un hôte Fedora 34. Quelqu’un lance `docker run -it registry.fedoraproject.org/fedora:rawhide curl google.com` et reçoit `curl: (6) getaddrinfo() thread failed to start`. curl n’arrive pas à créer le thread qui résout le nom d’hôte.',
		'strace montre l’appel en échec : `clone3(...) = -1 EPERM (Operation not permitted)`. Le rapport moby/moby#42680 explique que la nouvelle glibc essaie `clone3` d’abord : « it will look for ENOSYS errno and fallback to "clone". The EPERM errno meanwhile is treated as a fatal error. » Seul `ENOSYS` déclenche le repli sur `clone`.',
		'L’EPERM venait du profil seccomp par défaut de Docker, un filtre qui répond EPERM à tout appel système absent de sa liste. **Le correctif, fusionné le 30 juillet 2021, fait renvoyer `ENOSYS` pour `clone3`** : glibc se rabat sur `clone`, et curl crée son thread.'
	],
	terms: [
		{ term: 'Filtre seccomp', def: 'Un petit programme BPF attaché à un processus. Le noyau l’exécute à chaque appel système, avec le numéro de l’appel et ses arguments, avant que l’appel ne tourne. `Seccomp: 2` dans `/proc/<pid>/status` indique un filtre actif.' },
		{ term: 'Action par défaut', def: 'Ce que fait le profil d’un appel système qu’aucune règle ne nomme. Dans le profil par défaut de Docker, c’est `SCMP_ACT_ERRNO` avec `EPERM` : l’appel échoue avec « Operation not permitted » sans s’exécuter.' },
		{ term: '`errnoRet`', def: 'Le numéro d’erreur qu’une règle renvoie à la place de l’appel. Le profil de Docker le règle à `ENOSYS` (38, « Function not implemented ») pour `clone3`.' },
		{ term: 'RuntimeDefault', def: 'Le nom Kubernetes du profil par défaut du runtime de conteneurs, à mettre dans `securityContext.seccompProfile.type`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["docker run python:3.12-alpine"] --> proc["processus du conteneur : Seccomp 2, Seccomp_filters 1"]'],
				highlight: ['run', 'proc'],
				note: 'Docker transforme son profil par défaut en filtre, et le processus du conteneur démarre avec ce filtre attaché. `grep Seccomp /proc/self/status` affiche `Seccomp: 2` (mode filtre) et `Seccomp_filters: 1`. Avec `--security-opt seccomp=unconfined`, les deux lignes valent 0.'
			},
			{
				add: ['proc -->|"syscall(nr, args)"| filt{"filtre : quelle règle pour nr ?"}'],
				highlight: ['filt'],
				note: 'Chaque appel système entre dans le noyau et passe d’abord par le filtre. Le filtre reçoit le numéro de l’appel pour cette architecture et ses arguments, puis renvoie une action. seccomp(2) les liste, de `SECCOMP_RET_KILL_PROCESS` jusqu’à `SECCOMP_RET_ALLOW`.'
			},
			{
				add: ['filt -->|"read, openat, clone : autorisés"| run2["l’appel s’exécute normalement"]'],
				highlight: ['run2'],
				note: 'La plupart des appels d’un programme sont dans la liste autorisée, et le filtre répond « allow ». Le noyau exécute alors l’appel avec ses vérifications habituelles, dont celles des capabilities du chapitre précédent.'
			},
			{
				add: ['filt -->|"io_uring_setup : aucune règle"| eperm["-1 EPERM, appel non exécuté"]', 'filt -->|"clone3 : errnoRet ENOSYS"| enosys["-1 ENOSYS, glibc se rabat sur clone"]'],
				highlight: ['eperm', 'enosys'],
				note: 'Un appel qu’aucune règle ne nomme reçoit l’action par défaut. Pendant l’écriture, `io_uring_setup` renvoyait -1 avec « Operation not permitted » dans le conteneur, et un descripteur de fichier (3) sur l’hôte. `clone3` renvoyait « Function not implemented », l’`ENOSYS` demandé par sa règle.'
			},
			{
				add: ['proc -->|"fork, execve"| child["processus enfant : même filtre"]'],
				highlight: ['child'],
				note: 'D’après seccomp(2), si fork est autorisé, « any child processes will be constrained to the same system call filters as the parent », et les filtres sont « preserved across a call to execve(2) ». Un processus du conteneur ne peut pas retirer le filtre dont il hérite.'
			}
		]
	},
	example: {
		title: 'seccomp/default_linux.go : des règles du profil par défaut de Docker',
		repo: 'moby/profiles',
		url: `${PROFILES}/seccomp/default_linux.go#L782-L1029`,
		lang: 'go',
		code: `		{
			LinuxSyscall: specs.LinuxSyscall{
				Names: []string{
					"bpf",
					"clone",
					"clone3",
					"fanotify_init",
					"fsconfig",
					"fsmount",
					"fsopen",
					"fspick",
					"lookup_dcookie",
					"lsm_get_self_attr", // kernel v6.8, libseccomp v2.6.0
					"lsm_list_modules",  // kernel v6.8, libseccomp v2.6.0
					"lsm_set_self_attr", // kernel v6.8, libseccomp v2.6.0
					"mount",
					"mount_setattr",
					"move_mount",
					"open_tree",
					"perf_event_open",
					"quotactl",
					"quotactl_fd",
					"setdomainname",
					"sethostname",
					"setns",
					"syslog",
					"umount",
					"umount2",
					"unshare",
				},
				Action: specs.ActAllow,
			},
			Includes: &Filter{
				Caps: []string{"CAP_SYS_ADMIN"},
			},
		},
…
		{
			LinuxSyscall: specs.LinuxSyscall{
				Names: []string{
					"clone3",
				},
				Action:   specs.ActErrno,
				ErrnoRet: &nosys,
			},
			Excludes: &Filter{
				Caps: []string{"CAP_SYS_ADMIN"},
			},
		},
…
	errnoRet := uint(unix.EPERM)
	return &Seccomp{
		LinuxSeccomp: specs.LinuxSeccomp{
			DefaultAction:   specs.ActErrno,
			DefaultErrnoRet: &errnoRet,
		},
		ArchMap:  arches(),
		Syscalls: syscalls,
	}`,
		notes: [
			'Les lignes 4 à 29 nomment 26 appels, dont `mount`, `unshare`, `setns` et `bpf`. Les lignes 33 à 35 n’activent la règle que si le conteneur a `CAP_SYS_ADMIN`. La doc de Docker : « The default seccomp profile will adjust to the selected capabilities ».',
			'Les lignes 38 à 49 sont le correctif de 2021 : `clone3` reçoit `ActErrno` avec `ErrnoRet: &nosys`, donc il échoue avec `ENOSYS` et pas `EPERM`. Les lignes 46 et 47 excluent les conteneurs qui ont `CAP_SYS_ADMIN` : ceux-là obtiennent `clone3` par la règle des lignes 1 à 36 (ligne 6).',
			'Les lignes 54 et 55 fixent l’action par défaut : `ActErrno` avec `EPERM`. Tout appel sans règle dans le fichier finit là. `io_uring_setup` n’a plus de règle depuis [moby/moby#46762](https://github.com/moby/moby/pull/46762) (2023), qui cite containerd : « Security experts generally believe io_uring to be unsafe. »',
			'La doc de Docker décrit le résultat comme une liste autorisée qui « disables around 44 system calls out of 300+ ». Son tableau donne une raison pour chaque appel bloqué, par exemple pour `keyctl` : « Prevent containers from using the kernel keyring, which is not namespaced. »'
		]
	},
	tradeoff: {
		gain: [
			'Le code du noyau derrière les appels bloqués reste hors de portée du conteneur : `io_uring_*`, `keyctl`, `kexec_load`, `open_by_handle_at` (que la doc de Docker appelle « Cause of an old container breakout »).',
			'Docker applique le profil à chaque conteneur, sauf si tu passes `--security-opt seccomp=unconfined`.'
		],
		cost: [
			'Un nouvel appel système dans une nouvelle libc peut casser un ancien profil : la glibc de Fedora rawhide appelait `clone3` en 2021, et curl ne pouvait plus créer de thread.',
			'L’erreur ne nomme aucun filtre. curl affichait `getaddrinfo() thread failed to start`, et seul strace montrait `clone3` qui renvoyait `EPERM`.',
			'Kubernetes lance les pods en `Unconfined`, sauf si le pod demande `RuntimeDefault` ou si le kubelet tourne avec `--seccomp-default`.'
		]
	},
	task: {
		prompt: 'Lance `docker run --rm alpine:3.20 grep Seccomp /proc/self/status`, puis la même chose avec `--security-opt seccomp=unconfined`. Ensuite, dans `python:3.12-alpine` sur x86-64, appelle `io_uring_setup` (appel système 425) avec `ctypes` : `libc.syscall(425, 8, buf)`, où `buf` fait 120 octets à zéro. Fais-le avec le profil par défaut, avec `seccomp=unconfined`, puis avec `--cap-add=SYS_ADMIN`. Explique chaque résultat.',
		hint: 'Cherche `io_uring` dans `default_linux.go`. Puis regarde quelles règles du profil dépendent de `CAP_SYS_ADMIN`.',
		answer: [
			'Profil par défaut : `Seccomp: 2` et `Seccomp_filters: 1`. Unconfined : les deux valent 0, le processus n’a aucun filtre.',
			'Profil par défaut : `io_uring_setup` renvoie -1 avec « Operation not permitted ». Aucune règle ne le nomme, l’action par défaut renvoie `EPERM` et l’appel ne s’exécute jamais.',
			'Unconfined : il renvoie 3, un nouveau descripteur de fichier pour l’anneau. Le noyau a exécuté l’appel.',
			'Avec `--cap-add=SYS_ADMIN`, il renvoie toujours `EPERM`. Cette capability débloque les 26 appels de la règle `CAP_SYS_ADMIN`, et `io_uring_setup` n’en fait pas partie. Seuls un profil sur mesure ou `unconfined` le laissent passer.'
		],
		steps: [
			{
				title: 'Vérifie que le filtre est actif',
				questions: [
					{ q: 'L’essai par défaut affiche `Seccomp: 2`. Que veut dire 2 ?', options: ['Deux profils sont empilés', 'Un filtre seccomp est actif', 'seccomp est en mode strict', 'Le filtre a déjà bloqué 2 appels'], answer: 1, why: 'proc_pid_status(5) : 2, c’est le mode filtre. `Seccomp_filters: 1` dit qu’un filtre est attaché.' },
					{ q: 'Avec `--security-opt seccomp=unconfined`, que montrent les deux lignes ?', options: ['`Seccomp: 2`, `Seccomp_filters: 0`', '`Seccomp: 1`, `Seccomp_filters: 1`', 'Les deux lignes ont disparu', 'Les deux à 0'], answer: 3, why: 'Unconfined veut dire que Docker n’attache aucun filtre : le processus n’en a pas.' },
					{ q: 'Quand Docker attache-t-il le profil par défaut ?', options: ['À chaque conteneur, sauf si tu passes `seccomp=unconfined`', 'Seulement aux conteneurs qui tournent en root', 'Seulement quand l’image le demande', 'Seulement sur les hôtes avec AppArmor'], answer: 0, why: 'Docker applique le profil à chaque conteneur, sauf si tu le refuses avec `--security-opt seccomp=unconfined`.' },
					{ q: 'Un processus du conteneur forke et lance `sh`. `sh` a-t-il le filtre ?', options: ['Non, `execve` l’efface', 'Seulement si `sh` est setuid', 'Oui, les enfants le gardent et il survit à `execve`', 'Seulement jusqu’à ce que `sh` appelle `prctl`'], answer: 2, why: 'seccomp(2) : les enfants sont « constrained to the same system call filters as the parent », et les filtres sont « preserved across a call to execve(2) ».' }
				]
			},
			{
				title: 'Appelle-le sous le profil par défaut',
				questions: [
					{ q: 'Que renvoie `libc.syscall(425, 8, buf)` dans ce cas ?', options: ['-1 avec « Operation not permitted »', '-1 avec « Function not implemented »', '3, un descripteur de fichier', '0, sans rien mettre en place'], answer: 0, why: 'Pendant l’écriture, il renvoyait -1 et errno `EPERM` sous le profil par défaut.' },
					{ q: 'Quelle règle du profil a produit cette erreur ?', options: ['Une règle qui nomme `io_uring_setup` avec `errnoRet` à `EPERM`', 'La règle `CAP_SYS_ADMIN`', 'La règle de `clone3`', 'Aucune : l’action par défaut, `SCMP_ACT_ERRNO` avec `EPERM`'], answer: 3, why: 'Aucune règle ne nomme `io_uring_setup`, donc l’appel tombe sur `DefaultAction: ActErrno` avec `EPERM`.' },
					{ q: 'Le noyau a-t-il exécuté une partie de `io_uring_setup` ?', options: ['Oui, puis il a tout défait', 'Oui, mais sans les vérifications de capabilities', 'Non, le filtre répond avant que l’appel s’exécute', 'Seulement la vérification des arguments'], answer: 2, why: 'Le filtre tourne à l’entrée du noyau, avant l’appel. Une action `ERRNO` renvoie l’erreur et l’appel ne s’exécute jamais.' },
					{ q: 'Pourquoi le profil laisse-t-il `io_uring_setup` de côté ?', options: ['Il n’existe pas sur x86-64', 'Il a été jugé dangereux : moby/moby#46762 cite « io_uring to be unsafe »', 'Il demande `CAP_SYS_ADMIN`', 'Il est trop lent dans les conteneurs'], answer: 1, why: 'Depuis moby/moby#46762 en 2023, les appels `io_uring_*` n’ont plus de règle, en citant containerd : « Security experts generally believe io_uring to be unsafe. »' }
				]
			},
			{
				title: 'Appelle-le en unconfined',
				questions: [
					{ q: 'Avec `seccomp=unconfined`, que renvoie le même appel ?', options: ['-1 avec `EPERM`', '3, un nouveau descripteur de fichier pour l’anneau', '-1 avec `ENOSYS`', 'Le conteneur ne démarre pas'], answer: 1, why: 'Sans filtre, le noyau a exécuté l’appel et renvoyé le descripteur du nouvel anneau.' },
					{ q: 'Que prouve ce résultat ?', options: ['C’est le profil par défaut, pas le noyau, qui refusait l’appel', 'L’appel demande root sur l’hôte', 'Python met en cache les résultats des appels système', 'Le noyau ne gère pas io_uring'], answer: 0, why: 'Même noyau, même image, même code : seul le filtre a changé entre les deux essais.' },
					{ q: 'Qu’ouvre encore `unconfined` ?', options: ['Seulement `io_uring_*`', 'Seulement les appels qui demandent une capability', 'Tous les appels que le profil par défaut bloque, comme `keyctl` et `kexec_load`', 'Rien, les capabilities les bloquent tous'], answer: 2, why: '`unconfined` retire tout le filtre : la quarantaine d’appels que Docker bloque revient. Les vérifications de capabilities restent, mais plus le filtre.' },
					{ q: 'Dans Kubernetes, un pod ne pose aucun `seccompProfile` et le kubelet n’a pas `--seccomp-default`. Qu’obtient-il ?', options: ['Le profil par défaut de Docker', 'Un profil qui bloque tout', '`RuntimeDefault`', '`Unconfined`'], answer: 3, why: 'Kubernetes lance les pods en `Unconfined`, sauf si le pod demande `RuntimeDefault` ou si le kubelet tourne avec `--seccomp-default`.' }
				]
			},
			{
				title: 'Essaie CAP_SYS_ADMIN',
				questions: [
					{ q: 'Avec `--cap-add=SYS_ADMIN`, que renvoie `io_uring_setup` ?', options: ['3, un descripteur de fichier', '-1 avec `ENOSYS`', '-1 avec `EPERM`, comme avant', 'Le conteneur s’arrête sur `SIGSYS`'], answer: 2, why: 'L’appel n’est toujours dans aucune règle, donc l’action par défaut répond toujours `EPERM`.' },
					{ q: 'Que change `CAP_SYS_ADMIN` dans le profil ?', options: ['Il autorise une liste de 26 appels comme `mount`, `unshare` et `setns`', 'Il passe l’action par défaut à autoriser', 'Il retire le filtre', 'Rien, le profil ignore les capabilities'], answer: 0, why: 'La règle avec `Includes: Caps: CAP_SYS_ADMIN` ajoute ces 26 appels. « The default seccomp profile will adjust to the selected capabilities ».' },
					{ q: 'Et `clone3` avec `CAP_SYS_ADMIN` ?', options: ['Toujours `ENOSYS`', 'Autorisé : la règle `CAP_SYS_ADMIN` le nomme, et la règle `ENOSYS` exclut cette capability', 'Bloqué avec `EPERM`', 'Tué avec `SIGSYS`'], answer: 1, why: 'La règle `ENOSYS` a `Excludes: Caps: CAP_SYS_ADMIN`, et la ligne 6 cite `clone3` dans la règle autorisée.' },
					{ q: 'Un service a vraiment besoin d’io_uring. Qu’est-ce qui laisse passer l’appel en gardant le reste du filtre ?', options: ['`--cap-add=ALL`', '`--privileged`, c’est la seule façon', 'Lancer le conteneur en root', 'Un profil sur mesure qui autorise `io_uring_setup`'], answer: 3, why: 'Seuls un profil sur mesure ou `unconfined` le laissent passer, et un profil sur mesure garde toutes les autres règles.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans un conteneur avec le profil par défaut de Docker, un programme fait un appel système que le profil ne nomme pas. Que se passe-t-il ?',
			options: [
				'Le noyau tue le processus avec `SIGSYS` et un core dump',
				'L’appel s’exécute, et le noyau écrit une ligne dans le journal d’audit',
				'L’appel renvoie -1 avec `EPERM` sans s’exécuter',
				'L’appel renvoie -1 avec `ENOSYS`, comme `clone3`'
			],
			answer: 2,
			why: 'L’action par défaut du profil est `SCMP_ACT_ERRNO` avec `DefaultErrnoRet` à `EPERM`. Le filtre renvoie ce code au programme sans exécuter l’appel. `ENOSYS` ne concerne que les appels qui ont leur propre `errnoRet`, comme `clone3`.'
		},
		{
			q: 'Pourquoi le correctif de 2021 fait-il renvoyer `ENOSYS` à `clone3` au lieu de l’autoriser ?',
			options: [
				'Parce qu’`ENOSYS` pousse le noyau à relancer l’appel sous forme de `clone`',
				'Parce que glibc se rabat sur `clone` avec `ENOSYS`, et les règles de `clone` vérifient ses flags',
				'Parce que `clone3` n’existait pas sur les noyaux pris en charge par Docker en 2021',
				'Parce que seccomp ne sait renvoyer que `ENOSYS` ou `EPERM`'
			],
			answer: 1,
			why: 'Les règles de `clone` n’autorisent l’appel que si les flags de namespace de son premier argument sont à zéro. Un filtre voit le numéro de l’appel et six valeurs d’arguments, et `clone3` passe ses flags dans une `struct clone_args` en mémoire. Le profil répond « not implemented », et glibc utilise `clone`, dont il peut vérifier les flags.'
		},
		{
			q: 'Un service en conteneur échoue sur `io_uring_setup` avec `EPERM`. Tu ajoutes `--cap-add=SYS_ADMIN`. Que se passe-t-il ?',
			options: [
				'Ça marche, car le profil s’adapte à `CAP_SYS_ADMIN`',
				'Il échoue avec `ENOSYS` à la place, comme `clone3`',
				'Docker refuse de démarrer le conteneur avec cette capability',
				'Il échoue encore avec `EPERM`, car aucune règle ne nomme `io_uring_setup`'
			],
			answer: 3,
			why: 'La règle `CAP_SYS_ADMIN` autorise 26 appels comme `mount` et `unshare`. `io_uring_setup` n’est dans aucune règle, donc l’action par défaut répond toujours `EPERM`. Pendant l’écriture, il échouait de la même façon avec la capability ajoutée.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Voir le profil par défaut répondre `EPERM` et `ENOSYS`, puis écrire ton propre petit profil et le voir bloquer un appel.',
		steps: [
			'Vérifie le filtre : `docker run --rm alpine:3.20 grep Seccomp /proc/self/status`, puis la même chose avec `--security-opt seccomp=unconfined` avant le nom de l’image.',
			'Garde un test qui appelle `io_uring_setup` (425) et `clone3` (435) sur x86-64 : `PY=\'import ctypes,os; libc=ctypes.CDLL(None,use_errno=True); b=ctypes.create_string_buffer(120); r=libc.syscall(425,8,b); print("io_uring_setup", r, os.strerror(ctypes.get_errno()) if r<0 else "fd"); r=libc.syscall(435,None,0); print("clone3", r, os.strerror(ctypes.get_errno()))\'`.',
			'Lance-le de trois façons : `docker run --rm python:3.12-alpine python -c "$PY"`, puis avec `--security-opt seccomp=unconfined`, puis avec `--cap-add=SYS_ADMIN`.',
			'Écris un profil qui autorise tout sauf `mkdir` : `mkdir -p ~/seccomp-lab && cd ~/seccomp-lab && printf \'{"defaultAction":"SCMP_ACT_ALLOW","syscalls":[{"names":["mkdir","mkdirat"],"action":"SCMP_ACT_ERRNO"}]}\\n\' > no-mkdir.json`.',
			'Utilise-le : `docker run --rm --security-opt seccomp="$PWD/no-mkdir.json" alpine:3.20 sh -c \'mkdir /tmp/x; echo "exit $?"; touch /tmp/y && echo touch ok\'`.'
		],
		done: [
			'L’étape 1 affiche `Seccomp: 2` et `Seccomp_filters: 1`, puis 0 et 0.',
			'Profil par défaut : `io_uring_setup -1 Operation not permitted` et `clone3 -1 Function not implemented`.',
			'Unconfined : `io_uring_setup 3 fd`, et `clone3` échoue avec `Invalid argument`, la réponse du noyau lui-même à un argument NULL.',
			'Avec `SYS_ADMIN` : `io_uring_setup` dit toujours `Operation not permitted`, et `clone3` dit maintenant `Invalid argument`.',
			'Ton profil : `mkdir` échoue avec `Operation not permitted`, et `touch ok` s’affiche.'
		],
		solution: [
			'`EPERM` est l’action par défaut pour les appels sans règle. `ENOSYS` est le `errnoRet` de la règle de `clone3`, pour que glibc se rabatte sur `clone`.',
			'`Invalid argument` vient du noyau lui-même : le filtre a laissé passer `clone3` et le noyau a refusé les arguments vides. Avec `SYS_ADMIN`, le profil autorise `clone3` mais n’a toujours aucune règle pour `io_uring_setup`.',
			'Une règle `SCMP_ACT_ERRNO` sans `errnoRet` renvoie `EPERM`. `mkdir` et `mkdirat` sont nommés tous les deux, car le programme peut utiliser l’un ou l’autre. Les vrais profils font l’inverse : `SCMP_ACT_ERRNO` par défaut et une liste d’autorisations, comme celui de Docker.'
		]
	},
	recall: {
		q: 'Que renvoie le profil seccomp par défaut de Docker pour un appel système qu’il ne nomme pas, et que renvoie-t-il pour `clone3` ?',
		a: '`EPERM` (« Operation not permitted »), l’action par défaut, sans exécuter l’appel. Pour `clone3`, il renvoie `ENOSYS` pour que glibc se rabatte sur `clone` (le correctif de moby/moby#42680, juillet 2021).'
	},
	sources: [
		{ title: 'seccomp(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/seccomp.2.html' },
		{ title: 'proc_pid_status(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/proc_pid_status.5.html' },
		{ title: 'clone(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/clone.2.html' },
		{ title: 'Doc Docker, Seccomp security profiles for Docker', url: 'https://docs.docker.com/engine/security/seccomp/' },
		{ title: 'moby/moby#42680, clone3 bloqué par le profil seccomp par défaut', url: 'https://github.com/moby/moby/issues/42680' },
		{ title: 'moby/moby#42681, seccomp: add support for "clone3" syscall in default policy', url: 'https://github.com/moby/moby/pull/42681' },
		{ title: 'moby/moby#46762, seccomp: block io_uring_* syscalls in default profile', url: 'https://github.com/moby/moby/pull/46762' },
		{ title: 'Doc Kubernetes, Restrict a Container\'s Syscalls with seccomp', url: 'https://kubernetes.io/docs/tutorials/security/seccomp/' }
	]
};
