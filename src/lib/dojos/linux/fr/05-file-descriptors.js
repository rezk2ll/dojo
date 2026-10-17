const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/syscall';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'file-descriptors',
	part: 'Les processus',
	title: 'Les descripteurs de fichiers',
	minutes: 10,
	hook: [
		'Un script Python ouvre `/dev/null` en boucle sous `ulimit -Sn 1024`. Lancé pendant cette session, il a obtenu 1021 fichiers, puis le `open()` suivant a échoué avec `OSError: [Errno 24] Too many open files`. Son gestionnaire d’erreur a échoué à son tour : `os.listdir("/proc/self/fd")` a besoin d’un descripteur de plus pour ouvrir le dossier.',
		'Chaque processus a une table de descripteurs numérotés. Les numéros 0, 1 et 2 étaient déjà pris par stdin, stdout et stderr : 1021 fichiers de plus tenaient sous une limite de 1024, et le dernier a reçu le fd 1023. **La limite porte sur les numéros de descripteurs** : tant que la limite souple reste à 1024, le processus ne peut pas obtenir le fd 1024.',
		'systemd lance les services avec une limite souple de 1024 et une limite dure de 524288 par défaut. Un programme peut monter sa propre limite souple jusqu’à la limite dure, et le runtime Go le fait dès son démarrage.'
	],
	terms: [
		{ term: 'Descripteur de fichier', def: 'Un petit entier qui sert d’index dans la table des fichiers, sockets et pipes ouverts du processus. `read()`, `write()` et `close()` le prennent en premier argument.' },
		{ term: 'RLIMIT_NOFILE', def: 'La limite de ressources du processus sur les descripteurs : « one greater than the maximum file descriptor number that can be opened ». `ulimit -n` la lit et la règle dans un shell.' },
		{ term: 'Limite souple et limite dure', def: 'Le noyau applique la limite souple. Un processus sans privilège peut monter sa limite souple jusqu’à la limite dure, que seul un processus avec `CAP_SYS_RESOURCE` peut relever.' },
		{ term: 'EMFILE', def: 'L’erreur 24, « Too many open files » : l’appel avait besoin d’un nouveau descripteur, et le processus utilise déjà tous les numéros sous sa limite souple.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['proc["Le processus démarre : fd 0 stdin, fd 1 stdout, fd 2 stderr"]'],
				highlight: ['proc'],
				note: 'stdin(3) : « On program startup, the integer file descriptors associated with the streams stdin, stdout, and stderr are 0, 1, and 2 ». Ils viennent du parent : au `fork()`, l’enfant reçoit une copie des descripteurs du parent, et ils restent ouverts à travers `execve()`.'
			},
			{
				add: ['proc -->|"open /dev/null"| fd3["open renvoie 3, le plus petit numéro libre"]'],
				highlight: ['fd3'],
				note: 'open(2) : le nouveau descripteur est « the lowest-numbered file descriptor not currently open for the process ». `/proc/<pid>/fd/3` est maintenant un lien symbolique vers `/dev/null`. Une socket y apparaît sous la forme `socket:[2248868]`, avec le numéro d’inode de la socket.'
			},
			{
				add: ['fd3 -->|"1020 open de plus"| top["fd 1023 utilisé : les numéros 0 à 1023 sont tous pris"]'],
				highlight: ['top'],
				note: 'La limite souple vaut 1024, et RLIMIT_NOFILE vaut « one greater than the maximum file descriptor number ». Le plus grand numéro possible est donc 1023. `cat /proc/<pid>/limits` affiche la ligne `Max open files 1024 524288 files` : souple, dure, unité.'
			},
			{
				add: ['top -->|"open, accept, pipe ou socket suivant"| err["EMFILE : Too many open files, errno 24"]'],
				highlight: ['err'],
				note: 'Tout appel qui crée un descripteur échoue maintenant avec `EMFILE` : `open()`, `accept()` sur une socket d’écoute, `pipe()`, `socket()`. Un serveur n’accepte plus de connexions, et même ouvrir `/proc/self/fd` pour regarder le problème échoue depuis le processus.'
			},
			{
				add: ['lim["setrlimit : limite souple montée à la limite dure, 524288"] --> ok["open renvoie 1024"]'],
				highlight: ['lim', 'ok'],
				note: 'Le processus peut monter sa limite souple jusqu’à la limite dure avec `setrlimit()`. La doc de systemd explique pourquoi la limite souple par défaut reste à 1024 : « select(2) cannot function with file descriptors above 1023 on Linux ». Les programmes qui utilisent `poll()` ou `epoll` doivent monter leur limite souple eux-mêmes.'
			}
		]
	},
	example: {
		title: 'src/syscall/rlimit.go : le runtime Go monte sa propre limite souple',
		repo: 'golang/go',
		url: `${GO}/rlimit.go#L13-L47`,
		lang: 'go',
		code: `// origRlimitNofile, if non-nil, is the original soft RLIMIT_NOFILE.
var origRlimitNofile atomic.Pointer[Rlimit]

// Some systems set an artificially low soft limit on open file count, for compatibility
// with code that uses select and its hard-coded maximum file descriptor
// (limited by the size of fd_set).
//
// Go does not use select, so it should not be subject to these limits.
// On some systems the limit is 256, which is very easy to run into,
// even in simple programs like gofmt when they parallelize walking
// a file tree.
//
// After a long discussion on go.dev/issue/46279, we decided the
// best approach was for Go to raise the limit unconditionally for itself,
// and then leave old software to set the limit back as needed.
// Code that really wants Go to leave the limit alone can set the hard limit,
// which Go of course has no choice but to respect.
func init() {
	var lim Rlimit
	if err := Getrlimit(RLIMIT_NOFILE, &lim); err == nil && lim.Max > 0 && lim.Cur < lim.Max-1 {
		origRlimitNofile.Store(&lim)
		nlim := lim

		// We set Cur to Max - 1 so that we are more likely to
		// detect cases where another process uses prlimit
		// to change our resource limits. The theory is that
		// using prlimit to change to Cur == Max is more likely
		// than using prlimit to change to Cur == Max - 1.
		// The place we check for this is in exec_linux.go.
		nlim.Cur = nlim.Max - 1

		adjustFileLimit(&nlim)
		setrlimit(RLIMIT_NOFILE, &nlim)
	}
}`,
		notes: [
			'Les lignes 4 à 8 donnent la raison de la limite basse : `select()` prend un `fd_set` de taille fixe, `FD_SETSIZE` (1024) sous Linux. Le commentaire de la ligne 8 en tire la conséquence : Go n’utilise pas `select`, la limite basse ne fait donc que le gêner.',
			'La ligne 20 lit les limites actuelles avec `getrlimit()`. Avec le défaut de systemd, 1024:524288, `lim.Cur` vaut 1024 et `lim.Max` vaut 524288 : la condition est vraie.',
			'La ligne 30 règle la limite souple à `Max - 1`, ici 524287. Le commentaire des lignes 24 à 29 explique ce moins un : si la valeur change plus tard, c’est qu’un autre processus l’a modifiée avec `prlimit`. La ligne 33 n’a besoin d’aucun privilège, car la nouvelle limite souple reste sous la limite dure.',
			'La ligne 21 garde la limite d’origine. Avant l’`execve()` d’un enfant, [`exec_linux.go`](' + GO + '/exec_linux.go#L670-L686) remet la limite souple d’origine : un vieux programme lancé par un binaire Go reçoit toujours 1024, et son `select()` continue de marcher.'
		]
	},
	tradeoff: {
		gain: [
			'Avec une limite souple de 1024, aucun numéro de descripteur n’atteint 1024 : le vieux code qui passe ses descripteurs à `select()` continue de marcher.',
			'`open()` renvoie toujours le plus petit numéro libre : `ls -l /proc/<pid>/fd` liste chaque fichier et chaque socket ouverts d’un processus, et `ls /proc/<pid>/fd | wc -l` les compte.'
		],
		cost: [
			'Un serveur qui garde plus d’environ 1 020 connexions reçoit `EMFILE` sur `accept()`, sauf s’il monte sa limite souple, comme le fait le runtime Go au démarrage.',
			'Les limites sont propres à chaque processus et héritées au `fork()`. `ulimit -n 65536` dans ton shell ne change rien pour un service que systemd a déjà lancé.'
		]
	},
	task: {
		prompt: 'Un service écrit `Too many open files` dans ses logs. `cat /proc/<pid>/limits` affiche `Max open files 1024 524288 files`, et `ls /proc/<pid>/fd | wc -l` affiche 1024. Que te disent ces nombres, et que vérifies-tu ensuite ?',
		hint: 'Compare le nombre de descripteurs à la limite souple. Regarde ensuite vers quoi ils pointent avec `ls -l /proc/<pid>/fd`.',
		answer: [
			'La limite souple vaut 1024 et la limite dure 524288. 1024 entrées veulent dire que chaque numéro de 0 à 1023 est pris : le prochain `open()` ou `accept()` reçoit `EMFILE`.',
			'`ls -l /proc/<pid>/fd` montre ce qu’est chaque numéro : `socket:[...]` pour une connexion, un chemin pour un fichier, `pipe:[...]` pour un pipe. Des milliers de fois le même chemin, ou un nombre qui grimpe à trafic constant, indiquent une fuite de descripteurs, et une limite plus haute ne ferait que retarder l’erreur.',
			'Si le nombre correspond à la vraie charge, le programme a besoin d’une limite souple plus haute. La doc de systemd conseille au programme de monter lui-même sa limite souple jusqu’à la limite dure, comme Go, tant qu’il n’utilise pas `select()`.',
			'Pour comparer, capturé pendant cette session : sous `ulimit -Sn 1024`, Python a ouvert 1021 fichiers (fds 3 à 1023), et l’ouverture suivante a échoué avec l’errno 24.'
		]
	},
	quiz: [
		{
			q: 'Un processus a les fds 0, 1 et 2 ouverts et une limite souple de 1024. Il ouvre des fichiers en boucle sans jamais les fermer. Quel open échoue en premier ?',
			options: [
				'Le 1024e open, celui qui recevrait le fd 1026',
				'Le 1022e open, quand les fds 0 à 1023 sont tous pris',
				'Le 1025e open, un de plus que la limite de 1024 fichiers',
				'Aucun, jusqu’à ce que la machine manque de mémoire'
			],
			answer: 1,
			why: 'RLIMIT_NOFILE vaut un de plus que le plus grand fd permis : les fds 0 à 1023 sont utilisables. Trois sont pris au départ, donc 1021 ouvertures réussissent (fds 3 à 1023) et la 1022e reçoit `EMFILE`.'
		},
		{
			q: 'Un processus a les fds 0 à 6 ouverts. Il ferme le fd 4, puis appelle `open()`. Quel fd reçoit-il ?',
			options: [
				'7, le numéro qui suit le plus grand déjà utilisé',
				'4, le plus petit numéro qui n’est pas ouvert',
				'Un numéro libre au hasard, pour que les fds soient durs à deviner',
				'1024, le premier numéro au-dessus de la limite souple'
			],
			answer: 1,
			why: 'open(2) : l’appel renvoie « the lowest-numbered file descriptor not currently open for the process ». Le numéro 4 est de nouveau libre, il est donc réutilisé avant le 7.'
		},
		{
			q: 'Pourquoi systemd met-il par défaut une limite souple de 1024 alors que la limite dure vaut 524288 ?',
			options: [
				'Chaque descripteur réserve 1 Mo de mémoire noyau, donc 1024 plafonne le coût à 1 Go',
				'Le noyau ne sait pas suivre plus de 1024 descripteurs par processus sans demande de root',
				'`select()` ne gère pas les fds de 1024 ou plus, et les programmes qui l’utilisent casseraient',
				'Une limite basse empêche une fork bomb de créer trop de processus'
			],
			answer: 2,
			why: 'systemd.exec(5) : « select(2) cannot function with file descriptors above 1023 on Linux ». La limite dure reste haute pour que les programmes qui utilisent `poll()` ou `epoll` puissent monter leur propre limite souple.'
		}
	],
	recall: {
		q: 'Avec une limite souple RLIMIT_NOFILE de 1024, quel est le plus grand fd qu’un processus peut obtenir, et que renvoie le `open()` suivant ?',
		a: 'Le fd 1023, car la limite vaut un de plus que le plus grand numéro de fd. Le `open()` suivant échoue avec `EMFILE`, errno 24, « Too many open files ».'
	},
	sources: [
		{ title: 'open(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/open.2.html' },
		{ title: 'getrlimit(2), RLIMIT_NOFILE', url: 'https://man7.org/linux/man-pages/man2/getrlimit.2.html' },
		{ title: 'proc_pid_fd(5), /proc/pid/fd', url: 'https://man7.org/linux/man-pages/man5/proc_pid_fd.5.html' },
		{ title: 'select(2), FD_SETSIZE', url: 'https://man7.org/linux/man-pages/man2/select.2.html' },
		{ title: 'systemd.exec(5), LimitNOFILE=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html' },
		{ title: 'systemd-system.conf(5), DefaultLimitNOFILE=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html' },
		{ title: 'Source de Go, src/syscall/rlimit.go', url: 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src/syscall/rlimit.go' }
	]
};
