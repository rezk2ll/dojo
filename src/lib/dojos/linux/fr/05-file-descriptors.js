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
		],
		steps: [
			{
				title: 'Lis la ligne des limites',
				questions: [
					{ q: 'Dans `Max open files 1024 524288 files`, quel nombre le noyau applique-t-il ?', options: ['524288, la limite dure', '1024, la limite souple', 'Les deux additionnés', 'Aucun, c’est une simple indication'], answer: 1, why: 'Le noyau applique la limite souple. La limite dure est le plafond jusqu’où on peut la monter.' },
					{ q: 'Un shell lancé avec les mêmes limites exécute `ulimit -n`. Qu’affiche-t-il ?', options: ['1024, la limite souple', '524288, la limite dure', '1023, le plus grand numéro de fd', '`unlimited`'], answer: 0, why: '`ulimit -n` lit la limite souple, celle que le noyau applique. `ulimit -Hn` afficherait 524288.' },
					{ q: 'Le service peut-il monter sa propre limite souple sans privilège ?', options: ['Non, seul root peut changer les limites', 'Oui, à n’importe quelle valeur', 'Seulement avec `ulimit -n` dans le shell qui l’a lancé', 'Oui, jusqu’à la limite dure de 524288'], answer: 3, why: 'Un processus non privilégié peut monter sa limite souple jusqu’à la limite dure. Monter la limite dure demande `CAP_SYS_RESOURCE`.' },
					{ q: 'D’où viennent 1024 et 524288 pour un service ?', options: ['Du maximum intégré au noyau, fixé à la compilation', 'Du `ulimit -n` de ton shell de login', 'Des valeurs par défaut de systemd pour les services qu’il lance', 'De la taille de la mémoire du processus'], answer: 2, why: 'systemd lance les services avec une limite souple de 1024 et une limite dure de 524288 par défaut.' }
				]
			},
			{
				title: 'Compare le nombre',
				questions: [
					{ q: '`ls /proc/<pid>/fd | wc -l` affiche 1024. Qu’est-ce que ça veut dire ?', options: ['Chaque numéro de 0 à 1023 est pris', 'Le processus a encore de la place pour un fd', 'La moitié de la limite dure est utilisée', 'Le compte inclut le processus `ls`'], answer: 0, why: 'Une entrée par descripteur ouvert, et 1024 entrées remplissent chaque numéro sous la limite souple.' },
					{ q: 'En plus de ses connexions, le service tient les fds 0, 1, 2 et sa socket d’écoute. Combien de clients étaient connectés quand `accept()` a commencé à échouer ?', options: ['1024', '1023', '524288', '1020'], answer: 3, why: 'Les numéros 0 à 1023 font 1024 fds. Quatre vont à stdin, stdout, stderr et à la socket d’écoute : il en reste 1020 pour les connexions.' },
					{ q: 'En plus d’`accept()`, quels appels échouent maintenant avec `EMFILE` ?', options: ['Seulement `open()`', '`read()` et `write()` sur les fds existants', '`open()`, `pipe()` et `socket()`', 'Aucun : seules les sockets sont limitées'], answer: 2, why: 'Tout appel qui crée un descripteur a besoin d’un numéro libre. Les appels sur les fds existants marchent encore.' },
					{ q: 'Pourquoi le gestionnaire d’erreur du service peut-il échouer en voulant décrire le problème ?', options: ['Les logs sont coupés à la limite', 'Lister `/proc/self/fd` demande un fd de plus', 'Le noyau tue le processus dès qu’il atteint la limite', 'stderr est fermé à la limite'], answer: 1, why: 'Dans le test du chapitre, `os.listdir("/proc/self/fd")` a échoué aussi : lister un dossier commence par l’ouvrir.' }
				]
			},
			{
				title: 'Regarde ce que sont les fds',
				questions: [
					{ q: 'Quelle commande montre vers quoi pointe chaque fd ?', options: ['`ls -l /proc/<pid>/fd`', '`cat /proc/<pid>/limits`', '`ulimit -n`', '`ps -o nlwp <pid>`'], answer: 0, why: 'Chaque entrée est un lien symbolique vers un chemin, `socket:[...]` ou `pipe:[...]`.' },
					{ q: 'Comment une connexion réseau apparaît-elle là ?', options: ['Sous la forme de l’IP distante', 'Sous la forme de `/dev/tcp`', 'Comme un chemin sous `/proc/net`', 'Sous la forme `socket:[<inode>]`'], answer: 3, why: 'Une socket apparaît comme `socket:[2248868]`, avec le numéro d’inode de la socket.' },
					{ q: 'Des milliers d’entrées pointent vers le même chemin. Qu’est-ce que ça suggère ?', options: ['Une charge normale pour un serveur actif', 'Une fuite : il ouvre le fichier sans jamais le fermer', 'Un bug du noyau', 'Une limite souple réglée trop haut pour ce service'], answer: 1, why: 'Un même fichier ouvert des milliers de fois, c’est rarement du vrai travail. Quelque chose oublie de le fermer.' },
					{ q: 'Le trafic est constant mais le nombre grimpe sans cesse. Qu’est-ce que c’est ?', options: ['Un disque lent', 'La croissance normale d’un cache', 'Une fuite de descripteurs', 'Une tempête de signaux'], answer: 2, why: 'À trafic constant, le nombre devrait rester plat. Une hausse continue veut dire des fds ouverts et jamais fermés.' }
				]
			},
			{
				title: 'Choisis la correction',
				questions: [
					{ q: 'Tu trouves une fuite. Monter la limite, est-ce la correction ?', options: ['Non : une limite plus haute ne fait que retarder l’erreur', 'Oui : 524288 ne sera jamais atteint', 'Oui, à condition de redémarrer chaque nuit', 'Non : on ne peut pas monter la limite d’un service'], answer: 0, why: 'Une fuite continue de grandir quelle que soit la limite. Corrige le code qui oublie de fermer.' },
					{ q: 'Le nombre correspond à la vraie charge, sans fuite. Que fais-tu ?', options: ['Baisser la limite dure', 'Fermer stdin, stdout et stderr pour libérer 3 fds', 'Lancer `ulimit -n 65536` dans ton propre shell', 'Laisser le programme monter sa limite souple'], answer: 3, why: 'La doc de systemd conseille au programme de monter lui-même sa limite souple, comme le runtime Go au démarrage.' },
					{ q: 'Pourquoi `ulimit -n 65536` dans ton shell n’aide-t-il pas le service qui tourne ?', options: ['`ulimit` ne marche que pour root', 'Les limites s’héritent au `fork()`, et il tourne déjà', 'Le noyau ignore les limites posées depuis un shell interactif', 'Il ne change que la limite dure'], answer: 1, why: 'La limite de ton shell n’atteint que les enfants de ton shell.' },
					{ q: 'Après la correction, comment vérifies-tu que le service en cours a sa nouvelle limite souple ?', options: ['`ulimit -n` dans ton propre shell', '`cat /proc/sys/fs/file-max`', '`grep "Max open files" /proc/<pid>/limits`', '`ls /proc/<pid>/fd | wc -l`'], answer: 2, why: 'Le fichier `limits` montre la limite souple et la limite dure de ce processus. `ulimit -n` dans ton shell ne montre que la limite de ton shell.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Épuiser les descripteurs d’un programme, lire les nombres dans `/proc`, puis lui donner une limite souple plus haute.',
		steps: [
			'Crée un dossier de travail : `mkdir -p ~/fd-lab && cd ~/fd-lab`.',
			'Écris un programme qui fuit : `printf \'import time\\nfiles = []\\ntry:\\n    while True: files.append(open("/dev/null"))\\nexcept OSError as e:\\n    print(len(files), "opened, last fd", files[-1].fileno(), "then:", e, flush=True)\\ntime.sleep(60)\\n\' > leak.py`.',
			'Lance-le sous une limite souple de 64, sans toucher à ton propre shell : `bash -c \'ulimit -Sn 64; exec python3 leak.py\' & p=$!; sleep 1`.',
			'Inspecte-le (Linux) : `grep "Max open files" /proc/$p/limits`, `ls /proc/$p/fd | wc -l`, `ls -l /proc/$p/fd | tail -3`. Puis `kill $p`.',
			'Relance-le avec une limite souple de 128 : `bash -c \'ulimit -Sn 128; exec python3 leak.py\' & p=$!; sleep 1; kill $p`.'
		],
		done: [
			'La première exécution affiche `61 opened, last fd 63 then: [Errno 24] Too many open files`.',
			'`/proc/$p/limits` montre une limite souple de 64, et `ls /proc/$p/fd | wc -l` affiche 64.',
			'Les entrées de `ls -l` sont des liens vers `/dev/null`.',
			'La deuxième exécution affiche `125 opened, last fd 127`.'
		],
		solution: [
			'Les fds 0, 1 et 2 sont pris au départ, et une limite souple de 64 autorise les numéros 0 à 63 : 61 ouvertures passent, et la suivante reçoit `EMFILE`.',
			'Le nombre égale la limite souple : chaque numéro est pris. Les liens pointent tous vers le même chemin, c’est à ça que ressemble une fuite.',
			'Une limite souple plus haute ne fait que déplacer l’échec du fd 63 au fd 127. La vraie correction d’une fuite, c’est de fermer les fichiers.',
			'Sous macOS il n’y a pas de `/proc` : la sortie de Python et la partie `ulimit` marchent pareil.'
		]
	},
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
