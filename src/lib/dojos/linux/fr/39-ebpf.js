const BPFTRACE = 'https://github.com/bpftrace/bpftrace/blob/62d1ff612c2c91fea4771357a34b9bd7411687e5';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ebpf',
	part: 'Les conteneurs vus du noyau',
	title: 'eBPF en pratique',
	minutes: 10,
	hook: [
		'Brendan Gregg a lancé `dd if=/dev/zero of=/dev/null bs=1 count=500k` : 512 000 lectures d’un octet et autant d’écritures. La commande a fini en 0,103851 seconde. Sous `strace -eaccept`, qui trace un appel que dd ne fait jamais, elle a pris 45,9599 secondes. Son billet : « That\'s 442x slower. »',
		'Il explique ce coût : « The performance overhead of strace is relative to the system call rate it is instrumenting. » strace fait tourner le processus sous ptrace(2), qui l’arrête à l’entrée et à la sortie des appels système. En production, prévient-il, cela pourrait « cause the target to fail-over due to exceeding latency thresholds ».',
		'Avec eBPF, **un petit programme tourne dans le noyau, au moment de l’événement**, et ajoute 1 à un compteur dans une map. `bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'` compte chaque appel système par nom de processus, et bpftrace n’affiche que les totaux quand tu fais Ctrl-C.'
	],
	terms: [
		{ term: 'Programme eBPF', def: 'Du bytecode chargé dans le noyau par l’appel système bpf(2) et attaché à un événement, comme un tracepoint ou l’arrivée d’un paquet réseau. Il s’exécute à chaque déclenchement de l’événement.' },
		{ term: 'Sonde', def: 'L’événement auquel un programme bpftrace s’attache. `tracepoint:syscalls:sys_enter_openat` est un tracepoint, un point fixe du noyau. `kprobe:vfs_read` est une kprobe, posée sur n’importe quelle fonction du noyau. En anglais : probe.' },
		{ term: 'Map', def: 'Un stockage clé-valeur dans le noyau, partagé entre les programmes eBPF et le processus qui les a chargés. Dans bpftrace, un nom qui commence par `@` est une map.' },
		{ term: 'Vérificateur', def: 'La partie du noyau qui contrôle un programme eBPF au chargement et le refuse s’il pourrait lire un registre jamais écrit, un pointeur non vérifié ou de la mémoire hors limites. En anglais : verifier.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['script["opensnoop.bt"] -->|"bpftrace compile avec LLVM"| bc["bytecode BPF"]'],
				highlight: ['script', 'bc'],
				note: 'bpftrace « uses LLVM as a compiler backend, and libbpf for interacting with the Linux BPF subsystem ». LLVM traduit le script en bytecode pour la machine virtuelle BPF. bpftrace tourne en général en root.'
			},
			{
				add: ['bc -->|"bpf(BPF_PROG_LOAD)"| ver{"vérificateur : simule chaque instruction"}', 'ver -->|"dangereux"| rej["chargement refusé, ex. R0 invalid mem access"]'],
				highlight: ['ver', 'rej'],
				note: 'Le vérificateur « descends all possible paths » et « simulates execution of every insn ». Un programme qui écrit via le résultat de `map_lookup_elem()` sans tester NULL est refusé avec `R0 invalid mem access \'map_value_or_null\'`. Un programme refusé ne tourne jamais.'
			},
			{
				add: ['ver -->|"sûr"| attach["attaché à sys_enter_openat et sys_exit_openat"]'],
				highlight: ['attach'],
				note: 'D’après bpf(2), le vérificateur « statically determines that the eBPF program terminates and is safe to execute ». Le programme est ensuite attaché à ses tracepoints. À partir de là, il tourne dans le noyau chaque fois qu’un thread de la machine entre dans `openat` ou en sort.'
			},
			{
				add: ['attach -->|"chaque openat : exécution dans le noyau"| map[("map @filename indexée par tid")]', 'map -->|"à la sortie : une ligne par ouverture"| user["bpftrace affiche PID COMM FD ERR PATH"]'],
				highlight: ['map', 'user'],
				note: 'À l’entrée, le programme range le pointeur du chemin dans une map, sous l’identifiant du thread. À la sortie, il le relit, affiche le descripteur de fichier ou l’errno, puis supprime l’entrée. Seuls les lignes affichées et le contenu des maps arrivent en espace utilisateur.'
			},
			{
				add: ['user -->|"Ctrl-C, bpftrace s’arrête"| gone["maps affichées, programmes déchargés"]'],
				highlight: ['gone'],
				note: 'Le tutoriel : « Maps are automatically printed when bpftrace ends ». bpf(2) : les programmes sont « automatically unloaded when the process exits », sauf si un sous-système comme `tc` garde une référence. Après une session bpftrace, rien ne reste dans le noyau.'
			}
		]
	},
	example: {
		title: 'tools/opensnoop.bt : tracer chaque ouverture de fichier de la machine',
		repo: 'bpftrace/bpftrace',
		url: `${BPFTRACE}/tools/opensnoop.bt#L66-L103`,
		lang: 'c',
		code: `tracepoint:syscalls:sys_enter_open,
tracepoint:syscalls:sys_enter_openat,
tracepoint:syscalls:sys_enter_openat2
{
  @filename[tid] = args.filename;
}

macro sys_exit(ret, $file)
{
  $ret = ret;
  $fd = ($ret >= 0) ? $ret : (-1);
  $errno = ($ret >= 0) ? 0 : (-$ret);

  printf("%-6d %-16s %4d", pid, comm, $fd);

  if errname {
    printf(" %16s ", strerror($errno));
  } else {
    printf(" %3d ", $errno);
  }

  // Skip display cwd if path start with '/'.
  if ($file[0] != "/"[0]) {
    printf("%s\n", abs_path($file, max_path_depth));
  } else {
    printf("%s\n", $file);
  }
}

tracepoint:syscalls:sys_exit_open,
tracepoint:syscalls:sys_exit_openat,
tracepoint:syscalls:sys_exit_openat2
/@filename[tid]/
{
  $file = str(@filename[tid]);
  sys_exit(args.ret, $file);
  delete(@filename, tid);
}`,
		notes: [
			'Les lignes 1 à 3 attachent une seule action à trois tracepoints : `open`, `openat` et `openat2`. Le tutoriel note qu’avec glibc 2.26 ou plus « the `open` wrapper always calls the `openat` syscall ».',
			'La ligne 5 range le pointeur du chemin dans la map `@filename`, avec `tid` pour clé. Le tutoriel justifie la clé : un thread n’exécute qu’un appel système à la fois, donc son identifiant est unique tant que l’appel dure.',
			'Lignes 10 à 12 : une valeur de retour positive ou nulle est le nouveau descripteur ; une valeur négative vaut moins l’errno. La ligne 14 affiche le PID, le nom du processus et le descripteur. L’en-tête du fichier montre une vraie ligne : `1400 systemd-oomd 13 0 /sys/fs/cgroup/.../memory.pressure`.',
			'La ligne 33 est un filtre : l’action de sortie ne tourne que si l’entrée a été vue. Sans lui, un appel déjà en cours au lancement de bpftrace arriverait à la sortie sans chemin rangé. La ligne 37 supprime l’entrée pour que la map ne grossisse pas.',
			'La ligne d’usage du fichier est `opensnoop.bt -- [--depth=<N>] [--errname]`. Avec `--errname`, la ligne 17 affiche `strerror($errno)`, par exemple « No such file or directory », à la place du nombre.'
		]
	},
	tradeoff: {
		gain: [
			'Le comptage se fait dans le noyau, et une map bpftrace n’envoie que des totaux en espace utilisateur. strace arrête le processus tracé aux appels système via ptrace, ce qui coûtait 442x dans le pire cas de Gregg.',
			'Le vérificateur refuse le code dangereux avant qu’il tourne : un registre jamais écrit, une recherche dans une map non vérifiée, un accès à la pile hors limites.',
			'Un script sur `tracepoint:syscalls:sys_enter_openat` continue de marcher sur les nouveaux noyaux : le tutoriel dit que les tracepoints « are preferred over kprobes », car leur API est stable.'
		],
		cost: [
			'La page de man de bpftrace dit qu’une commande qu’il lance « runs with the same privileges as bpftrace itself (usually root) ». Linux 5.8 a ajouté `CAP_BPF` « to separate out BPF functionality from the overloaded CAP_SYS_ADMIN capability », et le profil seccomp par défaut de Docker n’autorise `bpf` qu’avec l’une de ces deux capabilities.',
			'Un script kprobe peut casser sur un nouveau noyau : le tutoriel ne donne « no guarantee that your kprobe/kretprobe will work between kernel versions ».',
			'Une sonde sur un événement très fréquent tourne à chaque événement. Le tutoriel échantillonne les piles à 99 Hz, « not too frequent as to perturb performance ».'
		]
	},
	task: {
		prompt: 'Un service démarre sur un hôte mais ignore son fichier de config, et tu soupçonnes qu’il le cherche à un chemin qui n’existe pas. Choisis l’outil ou le one-liner bpftrace de ce chapitre qui répond à la question, écris la commande exacte, et dis quelles colonnes de la sortie tu lis.',
		hint: 'Tu veux chaque ouverture avec son code d’erreur, pour un nom de processus, pendant le démarrage du service. Regarde la ligne d’usage d’`opensnoop.bt`.',
		answer: [
			'Lance `opensnoop.bt -- --errname` dans un terminal, puis démarre le service dans un autre. Chaque `open`, `openat` ou `openat2` de la machine affiche une ligne : `PID COMM FD ERR PATH`.',
			'Lis les lignes dont `COMM` est le service. `FD` vaut -1 pour une ouverture ratée, et `ERR` nomme l’erreur, comme « No such file or directory », à côté du `PATH` essayé.',
			'Une suite d’ouvertures ratées sur des chemins comme `/etc/<service>/<name>.conf` montre où il cherche. Le commentaire d’en-tête de l’outil va dans ce sens : opensnoop « can be useful for discovering configuration and log files, if used during application startup ».',
			'Pour compter au lieu de lister, `bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'` donne le nombre d’appels système par nom de processus au Ctrl-C.'
		]
	},
	quiz: [
		{
			q: 'Pourquoi `bpftrace` peut-il compter tous les appels système d’un hôte chargé en ralentissant bien moins que `strace -c` ?',
			options: [
				'bpftrace échantillonne un appel système sur cent et multiplie les comptes',
				'Un programme dans le noyau met à jour une map, et bpftrace ne lit que les totaux',
				'bpftrace s’attache au processus par ptrace comme strace, mais sur un seul CPU',
				'Le noyau garde déjà un compte d’appels par processus dans `/proc`, que bpftrace lit'
			],
			answer: 1,
			why: 'Le `count()` tourne dans le noyau, au tracepoint, et ajoute 1 à une entrée de map. Le processus tracé n’est pas arrêté pour un traceur en espace utilisateur, comme il l’est sous le ptrace de strace. Le coût de strace « is relative to the system call rate » : 442x pour le test dd de Gregg.'
		},
		{
			q: 'Ton programme eBPF écrit via le pointeur renvoyé par `map_lookup_elem()` sans tester NULL. Que se passe-t-il ?',
			options: [
				'Le noyau l’exécute, et un pointeur NULL fait planter la machine',
				'Le noyau l’exécute, et l’écriture est ignorée en silence si le pointeur est NULL',
				'Le vérificateur refuse le programme au chargement avec `R0 invalid mem access`',
				'bpftrace ajoute le test NULL pour toi, donc le programme se charge quand même'
			],
			answer: 2,
			why: 'Le vérificateur simule chaque chemin, et après la recherche R0 a le type `map_value_or_null`. Écrire via ce registre sur le chemin NULL est dangereux, donc le chargement échoue avec `R0 invalid mem access \'map_value_or_null\'`. Le programme ne tourne jamais.'
		},
		{
			q: 'Un script bpftrace sur `kprobe:vfs_read` marche sur un serveur et échoue sur un autre au noyau plus récent. Quelle est la cause probable ?',
			options: [
				'Les kprobes dépendent des noms et arguments des fonctions du noyau, qui changent',
				'Le noyau plus récent a coupé eBPF pour tous les programmes qui lisent des fichiers',
				'Le vérificateur des noyaux récents refuse tout programme attaché à une kprobe',
				'Le script doit être recompilé avec la version récente de bpftrace'
			],
			answer: 0,
			why: 'Une kprobe s’attache à une fonction interne du noyau. Le tutoriel : « the function names, arguments, return values, and roles may change ». Un tracepoint a une interface stable, et c’est pour cela que le tutoriel le préfère.'
		}
	],
	recall: {
		q: 'Que vérifie le noyau avant qu’un programme eBPF tourne, et où un `count()` de bpftrace garde-t-il ses nombres ?',
		a: 'Le vérificateur simule chaque instruction sur chaque chemin et refuse les programmes dangereux, par exemple avec `R0 invalid mem access \'map_value_or_null\'`. `count()` incrémente une map dans le noyau, et bpftrace l’affiche en s’arrêtant.'
	},
	sources: [
		{ title: 'Brendan Gregg, strace Wow Much Syscall (2014)', url: 'https://www.brendangregg.com/blog/2014-05-11/strace-wow-much-syscall.html' },
		{ title: 'bpftrace, The bpftrace One-Liner Tutorial', url: `${BPFTRACE}/docs/tutorial_one_liners.md` },
		{ title: 'bpftrace, README', url: `${BPFTRACE}/README.md` },
		{ title: 'bpftrace, page de man bpftrace(8)', url: `${BPFTRACE}/man/adoc/bpftrace.adoc` },
		{ title: 'Doc du noyau Linux, eBPF verifier', url: 'https://docs.kernel.org/bpf/verifier.html' },
		{ title: 'bpf(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/bpf.2.html' },
		{ title: 'ptrace(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/ptrace.2.html' },
		{ title: 'capabilities(7), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man7/capabilities.7.html' }
	]
};
