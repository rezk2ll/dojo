const STRACE = 'https://github.com/strace/strace/blob/195ac8ddbf6fad16ff1ff125b0feb725b6c46dcf';
const STRACE_C = `${STRACE}/src/strace.c`;
const FILTER_C = `${STRACE}/src/filter_seccomp.c`;
const GREGG = 'https://www.brendangregg.com/blog/2014-05-11/strace-wow-much-syscall.html';
const YAMA = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/Documentation/admin-guide/LSM/Yama.rst';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'strace',
	part: 'Les processus',
	title: 'Observer les appels système avec strace',
	minutes: 10,
	hook: [
		'Un script lance `sh -c \'cat /etc/shadow\'` et affiche `Permission denied`. Tu veux l’appel exact qui a échoué. `strace -f -e trace=execve,openat` te le montre : `openat(AT_FDCWD, "/etc/shadow", O_RDONLY) = -1 EACCES (Permission denied)`, venu du processus enfant qui exécute `cat`.',
		'Brendan Gregg a mesuré le prix en 2014. `dd if=/dev/zero of=/dev/null bs=1 count=500k` prenait 0,103851 s. Sous `strace -eaccept`, qui ne correspond à aucun appel de `dd`, il prenait 45,9599 s : **442 fois plus lent**.',
		'Le même `dd`, lancé pour ce chapitre avec strace 6.8 sous Linux 6.17 : 0,092 s seul, 6,90 s sous `strace -e trace=accept`, et 0,088 s en ajoutant `--seccomp-bpf`.'
	],
	terms: [
		{ term: 'Appel système', def: 'Une demande d’un processus au noyau, comme `openat` pour ouvrir un fichier ou `connect` pour ouvrir une socket. Chacun renvoie une valeur, et -1 avec un code `errno` en cas d’échec.' },
		{ term: 'ptrace', def: 'L’interface du noyau qu’utilise strace : un processus traceur peut arrêter un autre processus, le tracé, et lire ses registres et sa mémoire pendant l’arrêt.' },
		{ term: 'errno', def: 'Le code d’erreur que laisse un appel système raté, comme `ENOENT` (fichier absent) ou `EACCES` (permission refusée). strace l’affiche après `= -1`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['st["strace -f -e trace=openat sh -c \'cat /etc/shadow\'"] -->|"lance et trace"| tee["Tracé : sh, puis cat"]'],
				highlight: ['st', 'tee'],
				note: 'strace lance la commande et en fait son tracé. Avec `-f`, il trace aussi chaque enfant créé par `fork`, `vfork` ou `clone` : il suit `sh` jusque dans le `cat` qu’il démarre. Sans `-f`, cette commande n’affiche aucune ligne `openat` pour `cat`, qui est un enfant de `sh`.'
			},
			{
				add: ['tee -->|"appelle openat"| entry["syscall-entry-stop : le noyau arrête cat"]', 'entry --> pr1["strace affiche openat(AT_FDCWD, /etc/shadow, O_RDONLY"]'],
				highlight: ['entry', 'pr1'],
				note: 'Quand `cat` entre dans `openat`, le noyau l’arrête avant d’exécuter l’appel et réveille strace. strace lit les arguments dans le processus arrêté et affiche la première moitié de la ligne.'
			},
			{
				add: ['pr1 -->|"PTRACE_SYSCALL"| run["Le noyau exécute openat : le contrôle des droits échoue"]', 'run --> exit["syscall-exit-stop : cat s’arrête encore"]'],
				highlight: ['run', 'exit'],
				note: 'strace relance `cat` avec `PTRACE_SYSCALL`. La page ptrace(2) dit que le tracé est alors « stopped at the next entry to or exit from a system call ». Le noyau exécute `openat`, le contrôle des droits échoue, et `cat` s’arrête une deuxième fois à la sortie.'
			},
			{
				add: ['exit --> pr2["strace affiche = -1 EACCES (Permission denied)"]', 'pr2 -->|"PTRACE_SYSCALL"| tee'],
				highlight: ['pr2'],
				note: 'strace lit la valeur de retour, affiche `= -1 EACCES (Permission denied)` et relance `cat`. Chaque appel système coûte deux arrêts et deux réveils de strace. Le filtre `-e trace=openat` choisit seulement ce que strace affiche : il arrête quand même `cat` à tous les autres appels.'
			},
			{
				add: ['bpf["--seccomp-bpf : un filtre dans le noyau"] -.->|"arrêt seulement sur les appels tracés"| tee'],
				highlight: ['bpf'],
				note: 'Avec `--seccomp-bpf` (qui demande `-f`), strace installe un filtre seccomp dans le tracé. Le filtre laisse passer sans arrêt les appels non tracés, et n’arrête le tracé que pour ceux que tu as demandés. Avec ce filtre, `dd` est repassé de 6,90 s à 0,088 s.'
			}
		]
	},
	example: {
		title: 'src/strace.c (strace v7.2) : deux arrêts par appel, puis la relance',
		repo: 'strace/strace',
		url: `${STRACE_C}#L4048-L4088`,
		lang: 'c',
		code: `static int
trace_syscall(struct tcb *tcp, unsigned int *sig)
{
	if (entering(tcp)) {
		int res = syscall_entering_decode(tcp);
		switch (res) {
		case 0:
			return 0;
		case 1:
			res = syscall_entering_trace(tcp, sig);
		}
		syscall_entering_finish(tcp, res);
		return res;
	} else {
		struct timespec ts = {};
		int res = syscall_exiting_decode(tcp, &ts);
		if (res != 0) {
			res = syscall_exiting_trace(tcp, &ts, res);
		}
		syscall_exiting_finish(tcp);
		return res;
	}
}

/* Returns true iff the main trace loop has to continue. */
static bool
dispatch_event(const struct tcb_wait_data *wd)
{
	unsigned int restart_op;
	unsigned int restart_sig = 0;
	enum trace_event te = wd ? wd->te : TE_BREAK;
	/*
	 * Copy wd->status to a non-const variable to workaround glibc bugs
	 * around union wait fixed by glibc commit glibc-2.24~391
	 */
	int status = wd ? wd->status : 0;

	if (current_tcp && has_seccomp_filter(current_tcp))
		restart_op = seccomp_filter_restart_operator(current_tcp);
	else
		restart_op = PTRACE_SYSCALL;`,
		notes: [
			'La ligne 4 choisit la moitié de l’appel : `entering()` est vrai tant que le drapeau `TCB_INSYSCALL` de ce processus est à zéro. Les lignes 5 et 10 tournent à l’arrêt d’entrée, décodent les arguments et affichent `openat(...`. Les lignes 16 et 18 tournent à l’arrêt de sortie et affichent `= -1 EACCES`.',
			'La ligne 41 donne la relance par défaut : `PTRACE_SYSCALL`, donc le tracé s’arrête de nouveau à la prochaine entrée ou sortie. Il s’arrête deux fois par appel système, quoi que dise `-e trace=`.',
			'Les lignes 38 et 39 servent quand `--seccomp-bpf` a installé un filtre. Dans [`seccomp_filter_restart_operator()`](' + FILTER_C + '#L698-L705), strace renvoie `PTRACE_CONT` sauf si l’appel qui vient de finir est tracé. Avec `PTRACE_CONT`, le tracé tourne jusqu’à ce que le filtre renvoie `SECCOMP_RET_TRACE` pour un appel tracé.',
			'La page strace(1) range le coût dans BUGS : « A traced process runs more slowly than a non-traced one. The performance impact can be mitigated by using the --seccomp-bpf option. »'
		]
	},
	tradeoff: {
		gain: [
			'`strace -p PID` s’attache à un processus en marche et montre chaque appel avec ses arguments et son `errno`. Tu n’as besoin ni du code source ni d’un redémarrage.',
			'`-e status=failed` (ou `-Z`) n’affiche que les appels qui ont échoué. Avec `LANG=C`, une exécution de `sh -c \'cat /etc/myapp.conf\'` se réduit au seul `openat` qui a renvoyé `ENOENT`.'
		],
		cost: [
			'Un processus actif ralentit : `dd` avec des écritures d’1 octet a tourné 75 fois plus lentement ici, et 442 fois dans le test de Gregg. Un serveur surveillé sur sa latence peut basculer sur son secours pendant que tu le traces.',
			'`--seccomp-bpf` retire l’essentiel du coût, mais il demande `-f` et ne marche pas avec `-p` : il n’aide pas sur un processus déjà lancé.',
			'Avec `kernel.yama.ptrace_scope = 1`, comme sur la machine de ce chapitre, `strace -p` sur un processus qui n’est pas ton enfant échoue avec `Operation not permitted`. La doc Yama précise que `strace -p PID` marche encore en root.'
		]
	},
	task: {
		prompt: 'Lance `strace -e trace=execve,openat sh -c \'cat /etc/shadow\'` en utilisateur normal, puis la même chose avec `-f`. Quelle ligne n’apparaît qu’avec `-f` ? Quel processus a fait l’appel raté, et que t’apprend `EACCES` que `ENOENT` ne dirait pas ?',
		hint: 'Cherche les lignes qui commencent par `[pid N]`. `sh` exécute `cat` dans un processus enfant.',
		answer: [
			'Sans `-f` (exécuté pour ce chapitre) : l’`execve` de `sh` et ses `openat` de `/etc/ld.so.cache` et `libc.so.6`, puis le message `Permission denied` et une ligne `SIGCHLD`. strace n’a jamais vu l’appel raté.',
			'Avec `-f` : `strace: Process 4084412 attached`, puis `[pid 4084412] execve("/usr/bin/cat", ["cat", "/etc/shadow"], ...)`, les ouvertures de bibliothèques, et `[pid 4084412] openat(AT_FDCWD, "/etc/shadow", O_RDONLY) = -1 EACCES (Permission denied)`.',
			'L’enfant `cat`, PID 4084412 ici, a fait l’`openat` raté. `EACCES` veut dire que le fichier existe et que le contrôle des droits l’a refusé. `ENOENT` voudrait dire que le chemin n’existe pas, comme pour `/etc/myapp.conf`.',
			'`stat -c \'%a %U %G\' /etc/shadow` a affiché `640 root shadow` sur la machine de ce chapitre : seuls root et le groupe `shadow` peuvent le lire.'
		],
		steps: [
			{
				title: 'Lance-le sans -f',
				questions: [
					{ q: 'Sans `-f`, quel processus strace trace-t-il ?', options: ['Seulement `sh`, le processus qu’il a lancé', '`sh` et `cat`', 'Seulement `cat`', 'Tous les processus de ton utilisateur'], answer: 0, why: 'Sans `-f`, strace trace la commande qu’il lance et aucun de ses enfants.' },
					{ q: 'Quelles lignes `openat` vois-tu sans `-f` ?', options: ['Celle sur `/etc/shadow`', '`sh` qui ouvre `/etc/ld.so.cache` et `libc.so.6`', 'Aucune', 'Seulement `cat` qui charge `libc.so.6` et ses autres bibliothèques'], answer: 1, why: 'Ce sont les appels de `sh` lui-même. `cat` tourne dans un enfant que strace n’arrête pas.' },
					{ q: 'Le message `Permission denied` s’affiche quand même. Qui l’a écrit ?', options: ['strace', 'Le noyau', '`cat`, dans l’enfant que strace n’a pas tracé', '`sh`, après avoir essayé de lire `/etc/shadow` lui-même'], answer: 2, why: 'L’enfant a tourné normalement, sans trace, et a affiché son erreur. strace n’a vu que le `SIGCHLD` à sa fin.' },
					{ q: 'Qu’est-ce qui te dit qu’un enfant a existé ?', options: ['Un préfixe `[pid N]`', 'L’`execve` de `/usr/bin/cat`', 'Une ligne `EACCES`', 'La ligne `SIGCHLD`'], answer: 3, why: '`sh` reçoit `SIGCHLD` quand son enfant se termine, et strace affiche ce signal.' }
				]
			},
			{
				title: 'Ajoute -f',
				questions: [
					{ q: 'Quelle nouvelle ligne montre que strace suit l’enfant ?', options: ['`strace: Process 4084412 attached`', '`+++ exited with 1 +++`', '`--- SIGCHLD ...`', '`execve("/usr/bin/sh", ...)`'], answer: 0, why: 'Avec `-f`, strace s’attache à chaque enfant créé par `fork`, `vfork` ou `clone`.' },
					{ q: 'Quelle ligne n’apparaît qu’avec `-f` et montre le changement de programme ?', options: ['`execve("/usr/bin/sh", ["sh", "-c", "cat /etc/shadow"], ...)`', '`openat(... "/etc/ld.so.cache" ...)`', '`[pid 4084412] execve("/usr/bin/cat", ...)`', '`cat: /etc/shadow: Permission denied`'], answer: 2, why: 'L’enfant charge `cat` avec `execve`, et strace le voit maintenant.' },
					{ q: 'Que veut dire `[pid 4084412]` en début de ligne ?', options: ['L’appel a pris 4084412 ns pour se terminer', 'L’appel vient du processus 4084412', 'C’est le 4084412e appel', 'Le PID de strace'], answer: 1, why: 'Avec `-f`, strace marque les lignes des autres processus avec leur PID.' },
					{ q: 'Même avec `-f`, aucune ligne `clone` ne montre comment `sh` a créé l’enfant. Pourquoi ?', options: ['`sh` lance `cat` sans fork', '`-f` cache le fork qu’il suit', '`clone` n’est pas un appel système', '`-e trace=execve,openat` n’affiche que ces deux appels'], answer: 3, why: 'Le filtre limite ce que strace affiche. `sh` fait bien un fork, et la ligne `Process 4084412 attached` montre le nouvel enfant.' }
				]
			},
			{
				title: 'Trouve l’appel raté',
				questions: [
					{ q: 'Quelle ligne est l’échec ?', options: ['`openat(... "/etc/shadow" ...) = -1 EACCES`', '`execve("/usr/bin/cat", ["cat", "/etc/shadow"], ...) = 0`', '`openat(... "libc.so.6" ...) = 3`', '`+++ exited with 1 +++`'], answer: 0, why: '`= -1` veut dire que l’appel a échoué, et strace ajoute l’`errno`.' },
					{ q: 'Quel processus l’a fait ?', options: ['strace', '`sh`, le parent', 'Le noyau', 'L’enfant `cat`, PID 4084412 ici'], answer: 3, why: 'La ligne porte le préfixe `[pid 4084412]` de l’enfant.' },
					{ q: 'Pourquoi `openat` renvoie-t-il 3 pour `libc.so.6` ?', options: ['3 est un code d’erreur', 'La bibliothèque a 3 parties', 'Il a réussi et renvoie le descripteur 3', 'C’était le troisième essai'], answer: 2, why: 'Un `openat` réussi renvoie le nouveau descripteur, le plus petit numéro libre après 0, 1 et 2.' },
					{ q: 'Quelle partie de l’`openat` raté montre que `cat` demandait seulement à lire ?', options: ['`AT_FDCWD`', '`O_RDONLY`', '`= -1`', '`EACCES`'], answer: 1, why: '`O_RDONLY` ne demande que la lecture, et même ça a été refusé.' }
				]
			},
			{
				title: 'Lis l’errno',
				questions: [
					{ q: 'Que t’apprend `EACCES` ?', options: ['Le fichier existe, mais l’accès est refusé', 'Le chemin n’existe pas', 'Le disque qui porte le fichier est plein ou en lecture seule', 'strace a bloqué l’appel'], answer: 0, why: '`EACCES`, c’est permission refusée : le chemin a été trouvé, l’accès n’a pas été permis.' },
					{ q: 'Ici, `EACCES` veut-il dire qu’il manquait un droit à strace ?', options: ['Oui : strace a besoin de root pour tracer `cat`', 'Oui : c’est `-f` qui provoque l’erreur', 'Seulement quand `-e trace=` est fixé', 'Non : le noyau a refusé `cat`, et strace affiche seulement le résultat'], answer: 3, why: 'strace affiche la valeur de retour de l’appel fait par `cat`. Sans strace, `cat` reçoit la même erreur et affiche `Permission denied`.' },
					{ q: '`stat -c \'%a %U %G\' /etc/shadow` affiche `640 root shadow`. Qui peut le lire ?', options: ['Tout le monde', 'Seulement root', 'Root et le groupe `shadow`', 'Tout utilisateur de `sudo`'], answer: 2, why: 'Mode 640 : lecture et écriture pour le propriétaire, lecture pour le groupe, rien pour les autres.' },
					{ q: 'Quelle option n’affiche que les appels ratés ?', options: ['`-c`', '`-e status=failed` ou `-Z`', '`-T`', '`-p`'], answer: 1, why: 'Elle réduit la trace aux appels qui ont renvoyé une erreur.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu traces un service chargé avec `strace -e trace=connect -p PID`. Seules 2 lignes `connect` sortent par minute. Pourquoi le service ralentit-il quand même ?',
			options: [
				'strace arrête quand même le processus à l’entrée et à la sortie de chaque appel système',
				'strace copie toute la mémoire du processus à chaque `connect` qu’il affiche',
				'strace baisse la priorité du processus tant qu’il y est attaché',
				'strace exécute `connect` une deuxième fois pour lire la valeur de retour'
			],
			answer: 0,
			why: 'strace relance le tracé avec `PTRACE_SYSCALL` : le noyau l’arrête à chaque entrée et sortie d’appel système. `-e trace=` filtre seulement l’affichage. `--seccomp-bpf` sauterait les appels non tracés, mais il ne marche pas avec `-p`.'
		},
		{
			q: '`strace -e trace=openat sh -c \'./app\'` ne montre aucun `openat` venant de `app`. Que manque-t-il ?',
			options: ['`-c`, pour compter les appels', '`-f`, pour suivre les processus enfants', '`-Z`, pour montrer les appels ratés', '`-T`, pour montrer la durée des appels'],
			answer: 1,
			why: '`sh` lance `./app` dans un processus enfant. Sans `-f`, strace ne trace que `sh` et n’arrête jamais l’enfant : ses appels ne sont pas affichés.'
		},
		{
			q: 'strace affiche `openat(AT_FDCWD, "/etc/app/config.yml", O_RDONLY) = -1 ENOENT (No such file or directory)`. Que s’est-il passé ?',
			options: [
				'Le fichier existe, mais l’utilisateur du processus n’a pas le droit de le lire',
				'Le fichier a été ouvert, et le descripteur -1 lui a été attribué',
				'Aucun fichier n’existe à ce chemin au moment où le processus l’ouvre',
				'strace a bloqué l’appel, car tracer une ouverture de fichier demande root'
			],
			answer: 2,
			why: '`-1` signale un échec, et strace ajoute l’`errno`. `ENOENT` veut dire « No such file or directory » : rien n’existe à ce chemin. Un problème de droits afficherait `EACCES`.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Trouver un appel système raté dans un processus enfant, puis mesurer ce que coûte strace et ce que `--seccomp-bpf` fait gagner.',
		steps: [
			'Crée un dossier de travail : `mkdir -p ~/strace-lab && cd ~/strace-lab`. Ce lab demande Linux et `strace`.',
			'Trace sans `-f` : `strace -e trace=execve,openat sh -c \'cat /etc/shadow\'`. Ajoute ensuite `-f` : `strace -f -e trace=execve,openat sh -c \'cat /etc/shadow\'`.',
			'N’affiche que les échecs pour un fichier absent : `LANG=C strace -f -Z -e trace=openat sh -c \'cat ./myapp.conf\'`.',
			'Mesure `dd` seul : `time dd if=/dev/zero of=/dev/null bs=1 count=200k`.',
			'Mesure-le sous strace, avec et sans le filtre : `time strace -f -e trace=accept dd if=/dev/zero of=/dev/null bs=1 count=200k`, puis la même chose avec `--seccomp-bpf` après `-f`.'
		],
		done: [
			'Sans `-f`, aucune ligne sur `/etc/shadow`. Avec `-f`, tu vois `Process N attached` et `[pid N] openat(AT_FDCWD, "/etc/shadow", O_RDONLY) = -1 EACCES (Permission denied)`.',
			'Le passage avec `-Z` affiche `openat(AT_FDCWD, "./myapp.conf", O_RDONLY) = -1 ENOENT (No such file or directory)` et aucune ouverture réussie.',
			'`dd` sous strace prend bien plus de temps que seul, alors qu’il ne fait aucun appel `accept`.',
			'Avec `--seccomp-bpf`, le temps redescend près de celui sans strace.'
		],
		solution: [
			'`sh` exécute `cat` dans un enfant : seul `-f` trace l’`openat` qui échoue. `EACCES` dit que le fichier existe et que le contrôle des droits l’a refusé. `ENOENT` dit qu’il n’y a rien.',
			'`-e trace=accept` ne filtre que l’affichage. strace arrête quand même `dd` deux fois à chacun de ses appels système, et avec `bs=1` cela fait des centaines de milliers d’appels.',
			'`--seccomp-bpf` place un filtre dans le noyau : `dd` ne s’arrête que sur les appels tracés. Il demande `-f` et ne marche pas avec `-p`.'
		]
	},
	recall: {
		q: 'Combien de fois strace arrête-t-il un processus pour un appel système, et quelle option fait sauter au noyau les appels que tu n’as pas demandés ?',
		a: 'Deux fois : à l’entrée et à la sortie de l’appel, avec une relance par `PTRACE_SYSCALL` à chaque fois. `--seccomp-bpf` (avec `-f`) installe un filtre qui n’arrête que les appels tracés : `dd` est passé de 6,90 s à 0,088 s.'
	},
	sources: [
		{ title: 'strace(1), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man1/strace.1.html' },
		{ title: 'ptrace(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/ptrace.2.html' },
		{ title: 'Brendan Gregg, strace Wow Much Syscall (2014)', url: GREGG },
		{ title: 'strace v7.2, src/strace.c', url: STRACE_C },
		{ title: 'Linux v6.12, Documentation/admin-guide/LSM/Yama.rst', url: YAMA }
	]
};
