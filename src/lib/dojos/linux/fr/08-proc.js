const PROCPS = 'https://gitlab.com/procps-ng/procps/-/blob/66b48a3720d46f304f0fa76f720ca925fa48d97e';
const READPROC = `${PROCPS}/library/readproc.c`;
const OUTPUT = `${PROCPS}/src/ps/output.c`;
const PIDS = `${PROCPS}/library/pids.c`;
const MAN = 'https://man7.org/linux/man-pages/man5';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'proc',
	part: 'Les processus',
	title: 'Lire /proc',
	minutes: 10,
	hook: [
		'`ps -o pid,stat,rss,args -p 4124475` affiche une ligne : `4124475 SN 2320 sleep 300`. Lance-le sous `strace -e trace=openat` (chapitre 07) : il ne fait aucun appel spécial au noyau. Il ouvre des fichiers texte.',
		'Sur la machine de ce chapitre, ce seul `ps` a ouvert `/proc/<pid>/stat` 749 fois, une fois par processus, plus `status` et `cmdline` pour chacun. Ses essais sur `/proc/1/environ` et les autres processus de root ont échoué avec `EACCES`.',
		'Tu peux lire les mêmes fichiers avec `cat`. **`RSS` est la ligne `VmRSS:  2320 kB` de `/proc/4124475/status`**, et `COMMAND` est `/proc/4124475/cmdline` avec ses octets nuls remplacés par des espaces.'
	],
	terms: [
		{ term: '/proc', def: 'Un pseudo-système de fichiers : proc(5) le décrit comme « an interface to kernel data structures ». Ses fichiers ne sont stockés sur aucun disque. Le noyau écrit le texte d’un fichier au moment où tu le lis.' },
		{ term: '/proc/<pid>', def: 'Un répertoire par processus, nommé par son PID, avec des fichiers comme `stat`, `status`, `cmdline`, `environ`, `limits` et le répertoire `fd/` (chapitre 05). `/proc/self` pointe vers le répertoire du lecteur lui-même.' },
		{ term: 'RSS', def: 'Resident set size : la mémoire d’un processus présente en RAM à cet instant, en kB sur la ligne `VmRSS` de `status`. Le chapitre 09 la compare à la taille virtuelle.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ps["ps -o pid,stat,rss,args -p 4124475"] -->|"openat /proc, O_DIRECTORY"| dir["/proc : 1, 2, 3 ... 4124475"]'],
				highlight: ['ps', 'dir'],
				note: '`ps` ouvre `/proc` comme un répertoire et lit ses entrées. Chaque nom numérique est un processus en vie. Même avec `-p 4124475`, procps-ng 4.0.4 les a tous parcourus sur cette machine, les 749.'
			},
			{
				add: ['dir --> stat["/proc/4124475/stat : une ligne, champ 3 = S"]'],
				highlight: ['stat'],
				note: 'Pour chaque PID, `ps` lit d’abord `stat`, toujours : le commentaire de procps dit que c’est « to ensure a \'cmd\' name as a minimum ». `stat` tient sur une ligne de champs séparés par des espaces. Le champ 3 est l’état, `S` pour endormi, que `ps` affiche dans la colonne `STAT`.'
			},
			{
				add: ['dir --> status["/proc/4124475/status : VmRSS: 2320 kB, PPid, Uid, Threads"]'],
				highlight: ['status'],
				note: 'Il lit ensuite `status`, qui reprend une bonne partie de `stat` et `statm` avec un nom sur chaque ligne. La colonne `RSS` est le `VmRSS` de ce fichier : 2320 kB. La page de manuel prévient que `VmRSS` « is inaccurate » à cause d’une optimisation interne du noyau, et renvoie vers `smaps_rollup` pour des chiffres exacts.'
			},
			{
				add: ['dir --> cmd["/proc/4124475/cmdline : sleep\\0300\\0"]', 'cmd --> out["COMMAND : sleep 300"]'],
				highlight: ['cmd', 'out'],
				note: '`cmdline` contient les arguments séparés par des octets nuls : `od -c` montre `s l e e p \\0 3 0 0 \\0`. `ps` les recolle avec des espaces. Les threads du noyau ont un `cmdline` vide, alors `ps` affiche leur nom entre crochets, comme `[kthreadd]` pour le PID 2.'
			},
			{
				add: ['out --> line["4124475 SN 2320 sleep 300"]'],
				highlight: ['line'],
				note: '`ps` construit une ligne à partir des trois fichiers. Le processus peut réécrire ses propres chaînes `argv`, et `cmdline` montre le nouveau texte : la page de manuel parle de « the command line that the process wants you to see ».'
			}
		]
	},
	example: {
		title: 'library/readproc.c (procps-ng v4.0.7) : simple_readproc, les fichiers qu’ouvre ps',
		repo: 'procps-ng/procps',
		url: `${READPROC}#L1240-1321`,
		lang: 'c',
		code: `static proc_t *simple_readproc(PROCTAB *restrict const PT, proc_t *restrict const p) {
    static __thread struct utlbuf_s ub = { NULL, 0 };    // buf for stat,statm,status,cgroup
    static __thread struct stat sb;     // stat() buffer
    unsigned flags = PT->flags;
    int rc = 0;

    if (fstat(PT->pidfd, &sb) == -1)              /* no such dirent (anymore) */
        goto next_proc;

    if ((flags & PROC_UID) && !XinLN(uid_t, sb.st_uid, PT->uids, PT->nuid))
        goto next_proc;                      /* not one of the requested uids */

    p->euid = sb.st_uid;                        /* need a way to get real uid */
    p->egid = sb.st_gid;                        /* need a way to get real gid */

    /* this attempted read of 'stat' is now unconditional to ensure a 'cmd' name
       as a minimum. this prevents a NULL 'cmdline' pointer for kernel threads
       in case the 'status' file is missing or not otherwise read ... */
    if (file2str(PT->pidfd, "stat", &ub) == -1)
        goto next_proc;
    rc += stat2proc(ub.buf, p);
…
    if (flags & PROC_FILLMEM) {                 // read /proc/#/statm
        if (file2str(PT->pidfd, "statm", &ub) != -1)
            statm2proc(ub.buf, p);
    }

    if (flags & PROC_FILLSTATUS) {              // read /proc/#/status
        if (file2str(PT->pidfd, "status", &ub) != -1){
            rc += status2proc(ub.buf, p, 1);
…
        }
    }

    if (flags & PROC_FILLENV)                   // read /proc/#/environ
        if (!(p->environ_v = file2strvec(PT->pidfd, "environ")))
            rc += vectorize_dash_rc(&p->environ_v);
    if (flags & PROC_EDITENVRCVT)
        rc += fill_environ_cvt(PT->pidfd, p);

    if (flags & PROC_FILLARG)                   // read /proc/#/cmdline
        if (!(p->cmdline_v = file2strvec(PT->pidfd, "cmdline")))
            rc += vectorize_dash_rc(&p->cmdline_v);
    if (flags & PROC_EDITCMDLCVT)
        rc += fill_cmdline_cvt(PT->pidfd, p);`,
		notes: [
			'La ligne 7 appelle `fstat` sur le répertoire `/proc/<pid>`. Les lignes 13 et 14 prennent le propriétaire de ce répertoire comme UID et GID effectifs. Le commentaire « need a way to get real uid » indique que l’UID réel arrive plus tard, par `status`.',
			'Les lignes 19 à 21 lisent `stat` pour chaque processus, sans test de drapeau. Si un processus se termine entre la lecture du répertoire et celle-ci, `file2str` échoue et la ligne 20 le saute.',
			'Les lignes 28 à 30 ne lisent `status` que si une colonne en a besoin. Dans [`pids.c`](' + PIDS + '#L625), `VM_RSS` est marqué `f_status` : demander `rss` lève ce drapeau. [`pr_rss()`](' + OUTPUT + '#L1036-1039) affiche ce nombre dans la colonne `RSS`.',
			'Les lignes 35 et 41 lisent `environ` et `cmdline` avec `file2strvec`, qui découpe le fichier aux octets nuls. Quand `environ` est refusé, comme pour le PID 1 ici, la ligne 37 met un `-` au lieu d’échouer.'
		]
	},
	tradeoff: {
		gain: [
			'`grep -E \'State|PPid|VmRSS|Threads\' /proc/<pid>/status` marche dans une image de conteneur minimale où `ps` n’est pas installé.',
			'`/proc/<pid>/limits` montre les limites du processus en marche, qui peuvent différer de ce que `ulimit -n` affiche dans ton shell.'
		],
		cost: [
			'Chaque `ps` lit au moins un fichier par processus : 749 fichiers `stat` ici, même pour `-p` avec un seul PID. Un agent de supervision qui lance `ps` chaque seconde refait ce travail chaque seconde.',
			'Un processus peut changer ce que montre `cmdline` : la colonne `COMMAND` ne prouve pas quel binaire tourne. `ls -l /proc/<pid>/exe` montre le vrai fichier.',
			'`environ` ne montre que l’environnement reçu à l’`execve`. Les appels à `putenv()` faits ensuite n’y apparaissent pas.'
		]
	},
	task: {
		prompt: 'Lance `sleep 300 &` et note son PID. Lis `/proc/<pid>/status`, `/proc/<pid>/cmdline` (passé dans `tr \'\\0\' \' \'`) et la ligne `Max open files` de `/proc/<pid>/limits`. Lance ensuite `ps -o pid,stat,rss,args -p <pid>`. Relie chaque colonne de `ps` à une ligne que tu as lue.',
		hint: '`grep -E \'State|PPid|VmRSS|Threads\' /proc/<pid>/status` garde les lignes utiles.',
		answer: [
			'Exécuté pour ce chapitre : `State: S (sleeping)`, `PPid: 4124473` (le shell), `Threads: 1`, `VmRSS: 2320 kB`. `cmdline` donne `sleep 300`.',
			'`limits` affiche `Max open files 1048576 1048576 files` : la limite souple, la limite dure et l’unité.',
			'`ps` a affiché `4124475 SN 2320 sleep 300`. `S` est l’état tiré de `stat`, `2320` est le `VmRSS` de `status`, et `sleep 300` est `cmdline` recollé avec des espaces.',
			'Le `N` après `S` signifie « low-priority » dans ps(1). `ps -o ni` a affiché `5` pour un `sleep` en arrière-plan sur cette machine : le shell l’a lancé avec une valeur nice de 5.'
		],
		steps: [
			{
				title: 'Lance le processus',
				questions: [
					{ q: 'Après `sleep 300 &`, où trouves-tu son PID ?', options: ['Dans `$?`', 'Dans `$$`', 'Dans `$!`', 'Dans `/proc/self`'], answer: 2, why: '`$!` contient le PID du dernier job en arrière-plan. `$$` est le shell lui-même.' },
					{ q: 'Quel dossier contient tout ce que le noyau montre de ce processus ?', options: ['`/proc/<pid>`', '`/var/run/<pid>`', '`/sys/<pid>`', '`/tmp/<pid>`'], answer: 0, why: '/proc a un dossier par processus, nommé d’après son PID.' },
					{ q: 'Les fichiers de `/proc/<pid>` sont-ils stockés sur un disque ?', options: ['Oui, dans une partition cachée', 'Oui, en RAM comme cache du disque', 'Seulement `status`, les autres sont générés', 'Non : le noyau les écrit quand tu lis'], answer: 3, why: 'proc(5) appelle /proc « an interface to kernel data structures ». Rien n’est stocké.' },
					{ q: 'Vers quoi pointe `/proc/self` ?', options: ['Le PID 1', 'Le dossier du processus qui le lit', 'Le shell qui a lancé ta session', 'Le noyau lui-même'], answer: 1, why: '`/proc/self` mène au dossier `/proc/<pid>` du lecteur lui-même.' }
				]
			},
			{
				title: 'Lis status et cmdline',
				questions: [
					{ q: '`State: S (sleeping)`. Pourquoi `sleep` est-il en S ?', options: ['Il attend son minuteur, sans CPU', 'Un signal l’a stoppé', 'Il attend que le disque réponde', 'Il est terminé et attend d’être récolté'], answer: 0, why: '`sleep` attend que son temps passe. S est un sommeil normal, interruptible.' },
					{ q: '`PPid: 4124473`. Quel processus est-ce ?', options: ['Le PID 1', 'Le thread noyau `kthreadd`', 'La commande `ps`', 'Le shell qui a lancé `sleep`'], answer: 3, why: 'Le shell a fait le fork de `sleep` : c’est le parent.' },
					{ q: 'Pourquoi passer `cmdline` dans `tr \'\\0\' \' \'` ?', options: ['Le fichier est compressé par le noyau', 'Les arguments sont coupés par des octets nuls', 'Le fichier est en UTF-16', 'Pour retirer le PID du début'], answer: 1, why: '`od -c` montre `s l e e p \\0 3 0 0 \\0`. `tr` change les octets nuls en espaces.' },
					{ q: 'Que te donne `Max open files 1048576 1048576 files` ?', options: ['Les fichiers ouverts maintenant, et le pic', 'La limite de toute la machine', 'La limite souple, la limite dure et l’unité', 'Les fds du shell'], answer: 2, why: 'Chaque ligne de `limits` donne souple, dure, unité, pour le processus en marche.' }
				]
			},
			{
				title: 'Lance ps',
				questions: [
					{ q: '`ps -o pid,stat,rss,args -p <pid>` affiche `4124475 SN 2320 sleep 300`. Comment `ps` l’a-t-il obtenu ?', options: ['Par un appel système spécial pour la liste', 'En lisant des fichiers texte sous `/proc`', 'Par la table des jobs du shell', 'Dans `/var/log`'], answer: 1, why: 'Sous strace, `ps` ne fait aucun appel spécial. Il ouvre `stat`, `status` et `cmdline`.' },
					{ q: 'Avec `-p` et un seul PID, combien de fichiers `stat` `ps` a-t-il ouverts sur la machine du chapitre ?', options: ['Un, pour toute la liste', 'Trois', '749, un par processus', 'Aucun, il lit un cache'], answer: 2, why: 'procps-ng 4.0.4 a parcouru les 749 processus, même pour un seul PID.' },
					{ q: 'Que veut dire le `N` de `SN` ?', options: ['Basse priorité : une valeur nice de 5', 'Nouveau processus, lancé il y a moins d’une seconde', 'Pas de terminal attaché', 'Ne répond pas aux signaux'], answer: 0, why: 'ps(1) appelle `N` « low-priority ». `ps -o ni` a affiché `5`.' },
					{ q: 'Pourquoi `ps` a-t-il échoué sur `/proc/1/environ` alors qu’il a lu `/proc/1/status` ?', options: ['Le PID 1 n’a aucun environnement', '`environ` est sur le disque en mode 600', 'Le fichier est trop gros à lire', 'Le lire demande un contrôle d’accès ptrace'], answer: 3, why: 'proc_pid_environ(5) : l’accès est « governed by a ptrace access mode PTRACE_MODE_READ_FSCREDS check ».' }
				]
			},
			{
				title: 'Relie les colonnes',
				questions: [
					{ q: 'Le `S` de la colonne `STAT` vient de quel fichier ?', options: ['`status`, la ligne `Threads`', '`stat`, champ 3', '`cmdline`', '`limits`'], answer: 1, why: '`ps` lit `stat` pour chaque processus, et le champ 3 est l’état.' },
					{ q: 'Le `2320` de la colonne `RSS` vient de quelle ligne ?', options: ['`VmRSS: 2320 kB` dans `status`', 'Le champ 3 de `stat`', '`Max open files` dans `limits`', 'La taille de `cmdline`'], answer: 0, why: 'La colonne `rss` est `PIDS_VM_RSS`, remplie depuis `status`.' },
					{ q: 'Le `sleep 300` de la colonne `COMMAND` vient de quel fichier ?', options: ['`exe`', '`environ`', '`status`, la ligne `Name` du haut', '`cmdline`, recollé'], answer: 3, why: '`ps` recolle avec des espaces les arguments séparés par des octets nuls.' },
					{ q: 'Quel fichier te donne le vrai binaire, quoi que dise `cmdline` ?', options: ['`/proc/<pid>/environ`', '`/proc/<pid>/stat`', '`ls -l /proc/<pid>/exe`', '`/proc/<pid>/limits`'], answer: 2, why: 'Un processus contrôle son argv. `exe` est un lien vers le binaire qui tourne vraiment.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'D’où `ps` tire-t-il le nombre de sa colonne `RSS` sous Linux ?',
			options: [
				'De la ligne `VmRSS` de `/proc/<pid>/status`',
				'D’un appel système qui demande au noyau la mémoire d’un processus',
				'De `/proc/meminfo`, réparti entre les processus en marche',
				'De la taille de `/proc/<pid>/mem` sur le disque'
			],
			answer: 0,
			why: 'Dans procps-ng, la colonne `rss` est `PIDS_VM_RSS`, que la bibliothèque remplit depuis `status`. `ps` n’a aucun appel noyau spécial : il ouvre et analyse des fichiers texte sous `/proc`.'
		},
		{
			q: '`cat /proc/1234/cmdline` affiche `nginx: worker process`. Qu’est-ce que cela prouve sur le binaire ?',
			options: [
				'Le fichier binaire s’appelle `nginx: worker process`',
				'Le noyau a comparé le binaire à son argv au démarrage',
				'Rien : le processus peut réécrire argv, et `cmdline` le montre',
				'Un shell a lancé le processus avec exactement cette commande'
			],
			answer: 2,
			why: '`cmdline` montre la mémoire argv du processus. Si le processus modifie ces chaînes après `execve`, le fichier montre le changement. `/proc/1234/exe` est un lien vers le binaire qui tourne vraiment.'
		},
		{
			q: 'En utilisateur normal, `cat /proc/1/environ` échoue avec `Permission denied` alors que `cat /proc/1/status` marche. Pourquoi ?',
			options: [
				'`environ` est stocké sur le disque en mode 600, lisible par root seul',
				'`environ` passe d’abord un contrôle d’accès ptrace, que tu rates pour root',
				'Le PID 1 n’a pas d’environnement, alors le noyau renvoie une erreur',
				'Seuls `cmdline` et `environ` sont protégés, pour économiser la mémoire'
			],
			answer: 1,
			why: 'proc_pid_environ(5) : l’accès est « governed by a ptrace access mode PTRACE_MODE_READ_FSCREDS check ». Ton utilisateur ne passe pas ce contrôle pour un processus de root. `status` n’a pas ce contrôle.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Reconstruire une ligne de `ps` à partir des fichiers de `/proc`, puis attraper un processus qui ment sur son nom.',
		steps: [
			'Lance un processus : `sleep 300 & p=$!`. Ce lab demande Linux.',
			'Lis-le : `grep -E \'State|PPid|VmRSS|Threads\' /proc/$p/status`, `tr \'\\0\' \' \' < /proc/$p/cmdline; echo`, `od -c /proc/$p/cmdline` et `grep \'Max open files\' /proc/$p/limits`.',
			'Compare avec `ps -o pid,stat,rss,args -p $p`, puis essaie `cat /proc/1/environ`.',
			'Lance un processus avec un faux nom : `bash -c \'exec -a "nginx: worker process" sleep 300\' & q=$!; sleep 1`. Lis `tr \'\\0\' \' \' < /proc/$q/cmdline; echo` et `ls -l /proc/$q/exe`.',
			'Si tu as strace, compte les fichiers que `ps` ouvre : `strace -e trace=openat ps -o pid -p $p 2>&1 | grep -c \'/stat"\'`. Nettoie avec `kill $p $q`.'
		],
		done: [
			'`status` montre `State: S (sleeping)`, un `PPid` égal au `echo $$` de ton shell, `Threads: 1` et une ligne `VmRSS` en kB.',
			'`od -c` montre `s l e e p \\0 3 0 0 \\0`.',
			'`ps` affiche le même état, le même nombre RSS et `sleep 300`. `cat /proc/1/environ` donne `Permission denied`.',
			'Le faux processus montre `nginx: worker process 300` dans `cmdline`, alors que `exe` pointe vers le binaire `sleep`.',
			'Le compte de strace est proche du nombre de processus de ta machine, pas de 1.'
		],
		solution: [
			'`STAT` est le champ 3 de `stat`, `RSS` est le `VmRSS` de `status`, et `COMMAND` est `cmdline` avec ses octets nuls changés en espaces.',
			'`environ` passe d’abord un contrôle d’accès ptrace, qu’un utilisateur normal rate pour un processus de root.',
			'`exec -a` fixe argv[0], et `cmdline` montre ce que le processus y a mis. `exe` est le vrai binaire.',
			'`ps` lit `stat` pour chaque processus, même avec `-p` et un seul PID.'
		]
	},
	recall: {
		q: 'Quels trois fichiers sous `/proc/<pid>` donnent ses trois colonnes à `ps -o stat,rss,args` ?',
		a: '`stat` (champ 3, l’état), `status` (la ligne `VmRSS`, en kB) et `cmdline` (les arguments séparés par des octets nuls).'
	},
	sources: [
		{ title: 'proc(5), page de manuel Linux', url: `${MAN}/proc.5.html` },
		{ title: 'proc_pid_status(5), page de manuel Linux', url: `${MAN}/proc_pid_status.5.html` },
		{ title: 'proc_pid_cmdline(5), page de manuel Linux', url: `${MAN}/proc_pid_cmdline.5.html` },
		{ title: 'proc_pid_environ(5), page de manuel Linux', url: `${MAN}/proc_pid_environ.5.html` },
		{ title: 'proc_pid_limits(5), page de manuel Linux', url: `${MAN}/proc_pid_limits.5.html` },
		{ title: 'procps-ng v4.0.7, library/readproc.c', url: READPROC }
	]
};
