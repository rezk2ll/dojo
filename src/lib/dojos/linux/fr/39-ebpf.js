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
		],
		steps: [
			{
				title: 'Dis ce que tu dois voir',
				questions: [
					{ q: 'Le service ignore son fichier de config. Que dois-tu voir ?', options: ['Le temps CPU du service', 'Chaque ouverture de fichier qu’il fait, avec son code d’erreur', 'Les connexions réseau qu’il accepte', 'Les pages mémoire qu’il mappe'], answer: 1, why: 'Un fichier de config au mauvais chemin se voit comme une ouverture ratée. Il te faut le chemin et l’erreur de chaque ouverture.' },
					{ q: 'Quand dois-tu regarder ?', options: ['Pendant le démarrage du service', 'Après une heure de fonctionnement', 'Seulement après un plantage', 'Au prochain redémarrage de la machine'], answer: 0, why: 'Un service lit sa config au démarrage. Le traceur doit tourner avant que tu le lances.' },
					{ q: 'Quels appels système peuvent ouvrir un fichier ?', options: ['`read`, `write` et `close`', '`stat` seulement', '`open`, `openat` et `openat2`', '`mmap` et `brk`'], answer: 2, why: 'opensnoop s’attache aux trois. Avec glibc 2.26 ou plus, l’enveloppe `open` appelle `openat`.' },
					{ q: 'Pourquoi le script de capture du lab sonde-t-il à la fois `sys_enter_openat` et `sys_exit_openat` ?', options: ['Le vérificateur exige une paire', 'L’une sert à root, l’autre aux utilisateurs', 'La sortie ne se déclenche que pour les ouvertures réussies', 'Le chemin est connu à l’entrée, le résultat seulement à la sortie'], answer: 3, why: 'Le script garde le pointeur du chemin par thread à l’entrée, puis l’affiche à la sortie si `args.ret` est négatif.' }
				]
			},
			{
				title: 'Choisis l’outil',
				questions: [
					{ q: 'Quel outil du chapitre liste chaque ouverture avec son erreur ?', options: ['`opensnoop.bt`', 'Le one-liner de comptage sur `raw_syscalls:sys_enter`', '`strace -eaccept`', '`dd`'], answer: 0, why: 'opensnoop affiche une ligne par ouverture : PID, nom du processus, descripteur, erreur et chemin.' },
					{ q: 'Pourquoi pas le one-liner `@[comm] = count()` ?', options: ['Il demande une kprobe', 'Il donne des totaux par processus, pas les chemins', 'Il ne compte que les appels réseau', 'Le vérificateur le refuse'], answer: 1, why: 'Le one-liner de comptage te dit combien d’appels système chaque processus a faits, pas quels fichiers il a essayés.' },
					{ q: 'Peux-tu le lancer dans un conteneur Docker avec le profil seccomp par défaut et sans capability ajoutée ?', options: ['Oui, eBPF ne demande aucun privilège', 'Oui, si l’image contient bpftrace', 'Non : le profil n’autorise `bpf` qu’avec `CAP_SYS_ADMIN` ou `CAP_BPF`', 'Seulement avec `--cpus 1`'], answer: 2, why: 'Le profil seccomp par défaut de Docker n’autorise l’appel `bpf` qu’à un processus qui a l’une de ces deux capabilities.' },
					{ q: 'Pourquoi choisir `opensnoop.bt` plutôt que le script `openat` écrit à la main dans le lab ?', options: ['Le script du lab demande une kprobe', 'Le script du lab ne voit pas les ouvertures ratées', 'opensnoop tourne sans root', 'opensnoop couvre aussi `open` et `openat2`, et sait nommer l’erreur'], answer: 3, why: 'Le script du lab ne sonde que `openat` et affiche l’errno en négatif. opensnoop s’attache aux trois appels, et `--errname` affiche le nom.' }
				]
			},
			{
				title: 'Écris la commande',
				questions: [
					{ q: 'Quelle commande affiche les noms d’erreur au lieu des numéros ?', options: ['`opensnoop.bt -- --errname`', '`opensnoop.bt --errno`', '`opensnoop.bt -e`', '`bpftrace --errname opensnoop`'], answer: 0, why: 'La ligne d’usage est `opensnoop.bt -- [--depth=<N>] [--errname]`. Avec `--errname`, il affiche `strerror($errno)`.' },
					{ q: 'Dans quel ordre lances-tu les choses ?', options: ['Le service, puis opensnoop', 'opensnoop, puis le service dans un autre terminal', 'Un redémarrage, puis les deux', 'Les deux dans la même commande'], answer: 1, why: 'Les ouvertures ont lieu au démarrage : les sondes doivent déjà être attachées quand le service démarre.' },
					{ q: 'Sous quel utilisateur bpftrace tourne-t-il d’habitude ?', options: ['Celui du service', 'N’importe lequel, eBPF ne demande aucun privilège', 'root', '`nobody`'], answer: 2, why: 'bpftrace tourne d’habitude en root. Linux 5.8 a ajouté `CAP_BPF` pour sortir ce pouvoir de `CAP_SYS_ADMIN`.' },
					{ q: 'Tu appuies sur Ctrl-C. Que reste-t-il chargé dans le noyau ?', options: ['Les programmes, jusqu’au prochain redémarrage', 'Les maps, jusqu’à ce que tu les supprimes', 'Le cache du vérificateur', 'Rien : les programmes sont déchargés quand bpftrace s’arrête'], answer: 3, why: 'bpf(2) : les programmes sont « automatically unloaded when the process exits », sauf si un sous-système comme `tc` garde une référence.' }
				]
			},
			{
				title: 'Lis la sortie',
				questions: [
					{ q: 'Quelles colonnes a chaque ligne ?', options: ['`TIME PID SYSCALL ARGS`', '`PID COMM FD ERR PATH`', '`USER PID CPU MEM`', '`PATH SIZE MODE`'], answer: 1, why: 'La ligne 14 affiche le PID, le nom du processus et le descripteur, puis l’erreur et le chemin.' },
					{ q: 'Quelles lignes lis-tu d’abord ?', options: ['Celles dont `COMM` est le service', 'Celles qui ont le plus grand `FD`', 'Celles dont le `PID` vaut 1', 'Toutes, dans l’ordre'], answer: 0, why: 'opensnoop trace chaque ouverture de la machine. `COMM` isole le service.' },
					{ q: 'À quoi ressemble une ouverture ratée ?', options: ['`FD` à 0 et un `PATH` vide', '`FD` à -1 et un `ERR` vide', '`FD` vaut le numéro d’errno', '`FD` à -1 et un `ERR` comme « No such file or directory »'], answer: 3, why: 'Un retour négatif vaut moins l’errno : opensnoop affiche -1 en `FD` et nomme l’erreur.' },
					{ q: 'Une suite d’ouvertures ratées sur des chemins `/etc/<service>/<name>.conf` te dit quoi ?', options: ['Le disque est plein', 'Le service n’a pas `CAP_BPF`', 'Où le service cherche sa config', 'Le noyau a bloqué les ouvertures'], answer: 2, why: 'L’en-tête de l’outil : opensnoop « can be useful for discovering configuration and log files, if used during application startup ».' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Mesurer ce que strace coûte à un processus qui fait beaucoup d’appels système, puis compter et attraper les ouvertures ratées avec bpftrace sur une VM à toi.',
		steps: [
			'Crée un dossier : `mkdir -p ~/ebpf-lab && cd ~/ebpf-lab`. Lance le test de Gregg : `dd if=/dev/zero of=/dev/null bs=1 count=500k` et note le temps sur la dernière ligne.',
			'Lance-le sous strace, en traçant un appel que dd ne fait jamais : `strace -o /dev/null -eaccept dd if=/dev/zero of=/dev/null bs=1 count=500k`.',
			'Compte ses appels avec strace : `strace -c -o dd-count.txt dd if=/dev/zero of=/dev/null bs=1 count=500k; head -5 dd-count.txt`.',
			'Les étapes suivantes demandent root et bpftrace : utilise une VM locale. Compte les appels système par nom de processus : `sudo bpftrace -e \'tracepoint:raw_syscalls:sys_enter { @[comm] = count(); }\'`, lance le `dd` simple de l’étape 1 dans un deuxième terminal, puis appuie sur Ctrl-C.',
			'Attrape les ouvertures ratées avec leur chemin : `sudo bpftrace -e \'tracepoint:syscalls:sys_enter_openat { @f[tid] = args.filename; } tracepoint:syscalls:sys_exit_openat /@f[tid]/ { if (args.ret < 0) { printf("%s %d %s\\n", comm, args.ret, str(@f[tid])); } delete(@f, tid); }\'`, puis lance `cat /etc/nope.conf` dans le deuxième terminal.'
		],
		done: [
			'L’étape 1 copie 512000 octets en une fraction de seconde. L’étape 2 copie les mêmes octets des dizaines à des centaines de fois plus lentement.',
			'`dd-count.txt` montre environ 512 000 appels `read` et 512 000 appels `write`.',
			'Au Ctrl-C, bpftrace affiche une map avec une ligne pour `dd` d’un million d’appels ou plus, et `dd` a tourné à sa vitesse normale pendant ce temps.',
			'L’étape 5 affiche une ligne comme `cat -2 /etc/nope.conf` : le nom du processus, moins l’errno (`ENOENT` vaut 2), et le chemin.'
		],
		solution: [
			'strace a arrêté dd à chacun de son million d’appels système, sans en afficher aucun : le coût « is relative to the system call rate ».',
			'Le `count()` de bpftrace a tourné dans le noyau et ajouté à une map. Seuls les totaux sont passés en espace utilisateur, quand bpftrace s’est arrêté et a déchargé ses programmes.',
			'Le deuxième script est un petit opensnoop : garder le pointeur du chemin par thread à l’entrée, l’afficher à la sortie si `args.ret` est négatif, puis supprimer l’entrée. Lance-le avant le service suspect, et lis les lignes qui portent son nom.'
		]
	},
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
