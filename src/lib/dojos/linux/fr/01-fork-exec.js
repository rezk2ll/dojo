const BB = 'https://github.com/mirror/busybox/blob/371fe9f71d445d18be28c82a2a6d82115c8af19d';
const ASH = `${BB}/shell/ash.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'fork-exec',
	part: 'Les processus',
	title: 'Comment démarre un processus',
	minutes: 10,
	hook: [
		'Tu lances `./setenv.sh`, un script de deux lignes : `cd /tmp` et `export DB_URL=postgres://db/app`. Il affiche `in script: /tmp postgres://db/app`. De retour au prompt, `pwd` affiche toujours ton dossier personnel et `echo $DB_URL` sort une ligne vide.',
		'Le script a tourné dans un deuxième processus. Bash a appelé `fork()` pour se copier, et la copie a appelé `execve()` pour charger `/bin/bash` sur le script. Pendant le test, le script a affiché `pid=4044147 ppid=4044145` : son parent était le shell, PID 4044145.',
		'Le `cd` et le `export` ont modifié le dossier courant et les variables du processus 4044147, et de lui seul. **À la fin de ce processus, son dossier et ses variables ont disparu avec lui.** `. ./setenv.sh` exécute les deux mêmes lignes dans le shell lui-même, et là elles restent.'
	],
	terms: [
		{ term: 'PID', def: 'Process ID : le numéro que le noyau donne à chaque processus. Le PPID est le PID de son parent, le processus qui l’a créé.' },
		{ term: 'fork()', def: 'L’appel système qui copie le processus appelant. Il renvoie 0 dans le nouvel enfant et le PID de l’enfant dans le parent.' },
		{ term: 'execve()', def: 'L’appel système qui remplace le programme du processus appelant par un autre. Le PID ne change pas.' },
		{ term: 'wait', def: 'La famille d’appels (`wait`, `waitpid`, `wait4`) avec laquelle un parent attend la fin d’un enfant et lit son code de sortie.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['sh["bash, PID 4044145, lit ./setenv.sh"] --> fk["fork : la glibc appelle clone avec SIGCHLD"]'],
				highlight: ['sh', 'fk'],
				note: 'Bash cherche une fonction, puis un builtin, puis un fichier dans `PATH`. `./setenv.sh` contient un slash, donc bash saute la recherche. Ce n’est pas un builtin : bash le lance « in a separate execution environment », c’est-à-dire dans un nouveau processus. Depuis la glibc 2.3.3, l’enveloppe `fork()` appelle `clone` avec des drapeaux qui donnent le même effet.'
			},
			{
				add: ['fk -->|"renvoie 4044147"| par["Parent : bash, PID 4044145"]', 'fk -->|"renvoie 0"| chi["Enfant : copie de bash, PID 4044147, PPID 4044145"]'],
				highlight: ['par', 'chi'],
				note: '`fork()` revient deux fois : avec le PID de l’enfant dans le parent, avec 0 dans l’enfant. Les deux reprennent le même code au même endroit, et chacun lit la valeur de retour pour savoir de quel côté il est. L’enfant reçoit une copie de la mémoire et des descripteurs de fichiers ouverts du parent. Linux ne copie une page que quand l’un des deux écrit dedans.'
			},
			{
				add: ['chi --> ex["execve ./setenv.sh : le noyau lit #!/bin/bash et charge bash sur le script"]'],
				highlight: ['ex'],
				note: 'L’enfant appelle `execve()`. Le noyau voit la ligne `#!` et lance `/bin/bash ./setenv.sh` à la place. La pile, le tas et les mappings mémoire de l’ancien programme sont remplacés. Le PID reste 4044147, et les descripteurs ouverts le restent aussi, sauf ceux marqués close-on-exec.'
			},
			{
				add: ['ex --> run["cd /tmp et export DB_URL ne touchent que le processus 4044147"]', 'run --> ext["exit_group 0 : l’enfant se termine et attend en zombie"]'],
				highlight: ['run', 'ext'],
				note: '`chdir()`, l’appel derrière `cd`, « changes the current working directory of the calling process » : il change le dossier du processus appelant. Le processus 4044147 est maintenant dans `/tmp` avec `DB_URL`. À la fin du script, l’enfant sort avec le code 0. Tant que le parent n’a pas lu ce code, le noyau garde une petite fiche de l’enfant : un zombie.'
			},
			{
				add: ['par --> wt["wait4 : bloque, lit le code 0 et libère le zombie"]', 'ext -.->|"SIGCHLD"| wt'],
				highlight: ['wt'],
				note: 'Pendant que l’enfant tournait, le parent était bloqué dans `wait4()`. La sortie de l’enfant le réveille, et le noyau lui envoie `SIGCHLD`. `wait4()` renvoie le PID et le code de l’enfant, le zombie disparaît, et bash range le code dans `$?`. Le shell est toujours dans ton dossier personnel : personne n’a changé son dossier à lui.'
			}
		]
	},
	example: {
		title: 'shell/ash.c : comment le ash de BusyBox lance une commande externe',
		repo: 'mirror/busybox',
		url: `${ASH}#L10598-L10633`,
		lang: 'c',
		code: `		/* Can we avoid forking? For example, very last command
		 * in a script or a subshell does not need forking,
		 * we can just exec it.
		 */
		if (!(flags & EV_EXIT) || may_have_traps) {
			/* No, forking off a child is necessary */
			INT_OFF;
			get_tty_state();
			jp = makejob(/*cmd,*/ 1);
			if (forkshell(jp, cmd, FORK_FG) != 0) {
				/* parent */
				break;
			}
			/* child */
			FORCE_INT_ON;
			/* fall through to exec'ing external program */
		}
		shellexec(argv[0], argv, path, cmdentry.u.index);
		/* NOTREACHED */
	} /* default */
	case CMDBUILTIN:
		if (evalbltin(cmdentry.u.cmd, argc, argv, flags)
		 && !(exception_type == EXERROR && spclbltin <= 0)
		) {
 raise:
			longjmp(exception_handler->loc, 1);
		}
		break;

	case CMDFUNCTION:
		if (evalfun(cmdentry.u.func, argc, argv, flags))
			goto raise;
		break;
	} /* switch */

	status = waitforjob(jp);`,
		notes: [
			'La ligne 10 appelle [`forkshell()`](' + ASH + '#L5330-L5350), qui appelle `fork()` et renvoie son résultat. Dans le parent, c’est le PID de l’enfant, un nombre positif, et la ligne 12 sort du `switch`. Dans l’enfant, c’est 0, et le code continue jusqu’à la ligne 18.',
			'La ligne 18 ne tourne que dans l’enfant. `shellexec()` construit l’environnement avec les seules variables exportées et essaie `execve()` dans chaque dossier de `PATH` jusqu’à ce qu’un appel marche. En cas de succès, `execve()` ne revient jamais : c’est le sens du `NOTREACHED` de la ligne 19. Si tous les essais échouent, le code vaut 127 ou 126 (chapitre 4).',
			'Les lignes 21 à 28 exécutent un builtin comme `cd` avec `evalbltin()`, dans le processus du shell, sans fork. Un programme `cd` lancé dans un enfant changerait le dossier de l’enfant, puis sortirait.',
			'Ligne 36 : le parent appelle `waitforjob()` et attend la fin de l’enfant. `waitforjob()` renvoie le code de sortie de l’enfant, que le shell expose ensuite dans `$?`.',
			'Lignes 1 à 5 : avec `EV_EXIT` (le shell sort après cette commande, comme pour la dernière commande d’une chaîne `-c`), ash saute le fork et fait l’exec dans son propre processus. Bash fait pareil. Capturé pendant cette session : `strace -f bash -c \'ls /nonexistent-dir\'` montre deux appels `execve` dans le PID 4044141 et aucun `clone`.'
		]
	},
	tradeoff: {
		gain: [
			'Entre `fork()` et `execve()`, l’enfant exécute encore du code du shell. Les descripteurs restent ouverts à travers `execve()` : le shell peut brancher le fd 1 sur `out.log`, et `ls` écrit dedans sans le savoir.',
			'`fork()` coûte peu sous Linux : les pages sont copiées à l’écriture, et la page de man limite le coût à la copie de « the parent\'s page tables » et à la création d’« a unique task structure for the child ».'
		],
		cost: [
			'Un programme lancé par le shell ne peut pas changer le dossier ni les variables du shell. `cd` et `export` sont des builtins, et un script qui les règle doit être lancé avec `.` ou `source`.',
			'Après `fork()` dans un programme multithread, l’enfant n’a qu’un thread et « can safely call only async-signal-safe functions » jusqu’à son `execve()`.'
		]
	},
	task: {
		prompt: 'Lance `strace -f -e trace=clone,execve,wait4,exit_group bash -c \'ls /nonexistent-dir; echo done\'`. Quel PID exécute `ls`, quelle ligne est le fork, et quel code de sortie le shell lit-il ?',
		hint: 'Chaque ligne commence par un PID. Cherche la première ligne avec un nouveau PID, et la ligne `wait4` qui reprend.',
		answer: [
			'Capturé pendant cette session sous Linux 6.17 avec bash 5.2.21 : `4040495 execve("/usr/bin/bash", ...)` est le shell. `4040495 clone(child_stack=NULL, flags=CLONE_CHILD_CLEARTID|CLONE_CHILD_SETTID|SIGCHLD, ...) = 4040496` est le fork : le `fork()` de la glibc passe par `clone`, qui renvoie au parent le PID de l’enfant.',
			'`4040496 execve("/usr/bin/ls", ["ls", "/nonexistent-dir"], ...) = 0` : l’enfant charge `ls`. Le PID n’a pas changé entre le fork et l’exec.',
			'`4040496 exit_group(2)` : `ls` échoue sur le dossier absent avec le code 2. Le `wait4(-1, ...)` du parent reprend avec `WEXITSTATUS(s) == 2` et renvoie 4040496, puis `SIGCHLD` arrive.',
			'`echo done` ne produit aucune ligne `clone` : `echo` est un builtin, et bash l’exécute dans le PID 4040495. Avec seulement `ls` dans la chaîne `-c`, bash ferait l’exec sans fork.'
		],
		steps: [
			{
				title: 'Lis la trace',
				questions: [
					{ q: 'Qu’ajoute `-f` à la commande `strace` ?', options: ['Il n’affiche que les appels en échec', 'Il suit les processus enfants, et leurs appels apparaissent aussi', 'Il affiche le chemin complet de chaque fichier', 'Il force la trace à démarrer avant le chargement de bash'], answer: 1, why: 'Sans `-f`, strace ne trace que le premier processus. Le fork et `ls` se passent dans un enfant : il te le faut pour les voir.' },
					{ q: 'Une fois l’enfant créé, les lignes portent une étiquette comme `[pid 4040496]`. Que représente ce nombre ?', options: ['Le numéro de la commande dans la chaîne `-c`, ligne par ligne', 'Le code de sortie de l’appel', 'Le PID du processus qui a fait l’appel', 'La durée de l’appel'], answer: 2, why: 'Avec `-f`, strace marque chaque ligne du PID qui a fait l’appel : tu distingues ainsi le parent et l’enfant.' },
					{ q: 'La première ligne, `execve("/usr/bin/bash", ...)`, vient du PID 4040495. Quel est ce processus ?', options: ['Le shell qui va exécuter la chaîne `-c`', 'Le processus `ls`', 'Le processus `strace` lui-même', 'Un zombie laissé par une commande précédente'], answer: 0, why: 'strace lance bash avec `execve()`. Toutes les lignes avec ce PID sont le shell.' },
					{ q: 'Pourquoi `-e trace=` ne garde-t-il que `clone,execve,wait4,exit_group` ?', options: ['strace refuse de tracer les autres appels sans les droits root', 'Bash ne fait aucun autre appel système', 'Ce sont les seuls appels qui changent le PID', 'Ils couvrent la vie d’un processus : fork, exec, wait, exit'], answer: 3, why: 'Le filtre cache le bruit (`read`, `mmap`, ...) et garde les appels qui créent, chargent, terminent et récupèrent un processus.' }
				]
			},
			{
				title: 'Trouve le fork',
				questions: [
					{ q: 'Bash appelle `fork()`, mais la trace n’a aucune ligne `fork`. Quelle ligne est le fork ?', options: ['La deuxième ligne `execve`, celle qui charge `ls`', 'La ligne `clone(...) = 4040496`', 'La ligne `wait4`, où le shell se bloque', 'La ligne `exit_group` à la fin de la trace'], answer: 1, why: 'Depuis la glibc 2.3.3, le wrapper `fork()` appelle `clone` avec des flags qui ont le même effet.' },
					{ q: 'La ligne `clone` finit par `= 4040496`. Que veut dire ce nombre ?', options: ['Le PID du nouvel enfant, renvoyé au parent', 'Le PID du parent, pour que l’enfant le retrouve', 'Le nombre de pages mémoire copiées dans l’enfant', 'Le code de sortie que l’enfant rendra plus tard'], answer: 0, why: '`fork()` renvoie le PID de l’enfant dans le parent. L’enfant, lui, voit 0.' },
					{ q: 'Quel PID a fait l’appel `clone` ?', options: ['4040496, l’enfant', 'Le noyau, PID 0', '4040495, le shell', 'Le PID 1, init'], answer: 2, why: 'Le shell se copie lui-même. Seul le parent fait l’appel, et les deux processus en reviennent.' },
					{ q: 'Juste après le fork, qu’exécute l’enfant ?', options: ['`ls`, déjà chargé', 'Rien, tant que le noyau n’a pas choisi de programme', 'Un processus neuf et vide', 'Une copie de bash, au même endroit que le parent'], answer: 3, why: '`fork()` copie l’appelant. L’enfant exécute du code de bash jusqu’à son `execve()`.' }
				]
			},
			{
				title: 'Suis l’enfant',
				questions: [
					{ q: 'Quel PID exécute `ls` ?', options: ['4040495', '4040496', 'Un troisième PID créé par `execve`', 'Ça dépend de l’ordonnanceur'], answer: 1, why: 'La ligne `4040496 execve("/usr/bin/ls", ...) = 0` montre l’enfant qui charge `ls`.' },
					{ q: 'Le PID change-t-il entre le `clone` et l’`execve` de `ls` ?', options: ['Oui, `execve` donne toujours un nouveau PID au programme', 'Oui, mais seulement pour les programmes rangés dans `/usr/bin`', 'Non : le programme change dans le même processus', 'Non, parce que strace cache le nouveau PID'], answer: 2, why: 'execve(2) : « there is no new process ». Le programme change, le PID reste.' },
					{ q: '`echo done` ne produit aucune ligne `clone`. Pourquoi ?', options: ['`echo` est un builtin : bash l’exécute lui-même', 'strace n’affiche plus les appels après la première erreur', '`echo` réutilise le processus enfant qui a lancé `ls`', 'Le `;` fait partager un seul fork aux deux commandes'], answer: 0, why: 'Les builtins tournent dans le shell, sans fork. C’est aussi pour ça que `cd` doit être un builtin.' },
					{ q: 'Avec seulement `ls /nonexistent-dir` dans la chaîne `-c`, qu’est-ce qui change ?', options: ['Bash fait deux forks, un pour chaque partie de la chaîne', 'Bash refuse une chaîne `-c` qui n’a qu’une commande', 'La trace montre deux lignes `clone`', 'Bash fait l’exec de `ls` lui-même, sans `clone`'], answer: 3, why: 'Pour la dernière commande d’une chaîne `-c`, bash saute le fork et fait l’exec directement, comme ash avec `EV_EXIT`.' }
				]
			},
			{
				title: 'Lis le code de sortie',
				questions: [
					{ q: 'L’enfant finit par `exit_group(2)`. D’où vient le 2 ?', options: ['`ls` échoue sur le dossier absent', 'L’enfant est le deuxième processus', 'Bash ajoute 1 à chaque erreur', 'strace compte deux appels système'], answer: 0, why: '`ls` sort avec le code 2 quand il ne peut pas accéder à un chemin que tu lui as donné.' },
					{ q: 'Quel appel permet au shell de lire ce code ?', options: ['`execve`, qui renvoie le code de sortie de l’ancien programme', '`clone`', '`wait4(-1, ...)` qui reprend avec `WEXITSTATUS(s) == 2`', '`exit_group` dans le PID 4040495'], answer: 2, why: 'Le parent bloque dans `wait4()` jusqu’à la fin de l’enfant, puis lit son code et libère le zombie.' },
					{ q: 'Entre la sortie de l’enfant et le retour du `wait4` du parent, qu’est l’enfant ?', options: ['Disparu sans laisser de trace', 'Un zombie, gardé jusqu’à ce que le parent lise son code', 'Un orphelin, adopté par le PID 1 jusqu’à ce qu’on le récupère', 'Encore en train d’exécuter `ls`'], answer: 1, why: 'Le noyau garde une petite fiche jusqu’à ce que le parent lise le code. La lecture retire le zombie.' },
					{ q: 'Que fait bash du code qu’il a lu ?', options: ['Il l’affiche sur stderr', 'Il le renvoie à `ls`', 'Il l’ignore sauf avec `set -e`', 'Il le range dans `$?`'], answer: 3, why: 'Le code lu par `wait4()` devient `$?` pour la commande suivante.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`./deploy.sh` fait `export RELEASE=42` puis sort. Dans ton shell, `echo $RELEASE` affiche une ligne vide. Pourquoi ?',
			options: [
				'Le script a tourné dans un processus enfant, et ses variables sont parties avec lui',
				'`export` écrit la variable dans `~/.bashrc`, que seuls les nouveaux shells de login lisent',
				'Bash efface toutes les variables exportées quand un script sort avec le code 0',
				'La variable est arrivée chez le parent, mais `echo` lit un environnement en cache'
			],
			answer: 0,
			why: 'Le shell a lancé le script dans un processus séparé, créé par `fork()` et chargé par `execve()`. Les variables exportées descendent du parent vers ses enfants au moment de `execve()`, jamais dans l’autre sens. `. ./deploy.sh` exécute les lignes dans le shell lui-même.'
		},
		{
			q: 'Que renvoie `fork()` quand l’appel réussit ?',
			options: [
				'Le PID de l’enfant dans les deux processus, pour que chacun trouve l’autre',
				'0 dans l’enfant et le PID de l’enfant dans le parent',
				'Le PID du parent dans l’enfant et 0 dans le parent',
				'0 dans les deux, et chacun appelle `getpid()` pour savoir qui il est'
			],
			answer: 1,
			why: 'fork(2) : « the PID of the child process is returned in the parent, and 0 is returned in the child ». Les deux reprennent le même code au même endroit, et la valeur de retour dit à chacun quelle branche prendre.'
		},
		{
			q: 'Un processus de PID 812 appelle `execve("/usr/bin/ls", ...)` et l’appel réussit. Qu’est-ce qui est vrai ensuite ?',
			options: [
				'Le noyau donne un nouveau PID à `ls`, et le PID 812 est son parent',
				'Les gestionnaires de signaux de l’ancien programme tournent quand `ls` reçoit un signal',
				'`execve()` renvoie 0 à l’ancien programme, qui attend ensuite `ls`',
				'`ls` tourne avec le PID 812 et les descripteurs non marqués close-on-exec'
			],
			answer: 3,
			why: 'execve(2) : « there is no new process ». Le programme est remplacé dans le même processus, donc le PID reste 812. Les signaux interceptés reprennent leur action par défaut, et les descripteurs restent ouverts sauf ceux marqués close-on-exec. En cas de succès, l’appel ne revient pas.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir un script perdre son `cd` et son `export` dans un processus enfant, puis observer le fork et l’exec avec strace.',
		steps: [
			'Crée un dossier de travail : `mkdir -p ~/fork-lab && cd ~/fork-lab`.',
			'Écris le script : `printf \'#!/bin/bash\\ncd /tmp\\nexport DB_URL=postgres://db/app\\necho "in script: $PWD $DB_URL pid=$$ ppid=$PPID"\\n\' > setenv.sh && chmod +x setenv.sh`.',
			'Affiche le PID de ton shell avec `echo $$`, puis lance `./setenv.sh`, `pwd` et `echo "[$DB_URL]"`.',
			'Lance-le maintenant dans le shell lui-même : `. ./setenv.sh`, puis `pwd` et `echo "[$DB_URL]"` encore. Reviens avec `cd ~/fork-lab`.',
			'Sous Linux, trace-le : `strace -f -e trace=clone,execve,wait4,exit_group bash -c \'ls /nonexistent-dir; echo done\'`. Puis relance avec seulement `ls /nonexistent-dir` dans la chaîne.'
		],
		done: [
			'`./setenv.sh` affiche un `ppid` égal à ton `echo $$`, et `pwd` ensuite montre toujours `~/fork-lab`.',
			'Après `. ./setenv.sh`, le script affiche le PID de ton shell et `echo "[$DB_URL]"` affiche `[postgres://db/app]`.',
			'La première trace a une ligne `clone`, un `execve("/usr/bin/ls", ...)` dans le PID de l’enfant, `exit_group(2)` et un `wait4` qui reprend avec `WEXITSTATUS(s) == 2`.',
			'La trace avec seulement `ls` n’a aucune ligne `clone`.'
		],
		solution: [
			'`./setenv.sh` tourne dans un enfant créé par `fork()` et chargé par `execve()`. Son `cd` et son `export` ne changent que cet enfant, et disparaissent quand il sort.',
			'`.` exécute les lignes dans le shell lui-même : `$$` est le PID de ton shell, et les changements restent.',
			'Dans la trace, `clone(...) = <pid>` est le fork. Le même `<pid>` appelle ensuite `execve` sur `ls` : le programme change, pas le PID. `echo done` est un builtin et ne fait aucun fork.',
			'Avec `ls` en dernière commande de la chaîne `-c`, bash en fait l’exec dans son propre processus : aucun `clone` n’apparaît. Sous macOS il n’y a pas de strace : les quatre premières étapes marchent quand même.'
		]
	},
	recall: {
		q: 'Quand bash lance `ls`, quels sont les deux appels système qui le démarrent, et que renvoie le premier dans chaque processus ?',
		a: '`fork()` copie le shell et renvoie 0 dans l’enfant, le PID de l’enfant dans le parent. L’enfant appelle ensuite `execve("/usr/bin/ls", ...)`, qui garde le PID et ne revient pas en cas de succès. Le parent attend avec `wait4()`.'
	},
	sources: [
		{ title: 'fork(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/fork.2.html' },
		{ title: 'execve(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/execve.2.html' },
		{ title: 'wait(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/wait.2.html' },
		{ title: 'bash(1), COMMAND EXECUTION et COMMAND EXECUTION ENVIRONMENT', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'Source de BusyBox, shell/ash.c', url: 'https://github.com/mirror/busybox/blob/371fe9f71d445d18be28c82a2a6d82115c8af19d/shell/ash.c' }
	]
};
