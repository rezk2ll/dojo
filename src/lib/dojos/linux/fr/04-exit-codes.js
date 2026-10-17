const RUNC = 'https://github.com/opencontainers/runc/blob/d2691cb3cb12a0d830d8bb65c3156e2c966d6f99';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'exit-codes',
	part: 'Les processus',
	title: 'Les codes de sortie',
	minutes: 10,
	hook: [
		'La doc de Kubernetes propose un exercice : un conteneur avec `limits: memory: "100Mi"` lance `stress --vm-bytes 250M`. `kubectl get pod` affiche `OOMKilled`, et le YAML du Pod montre `exitCode: 137` et `reason: OOMKilled`.',
		'Le programme `stress` n’a jamais renvoyé 137. L’OOM killer du noyau lui a envoyé SIGKILL, le signal 9, et le processus s’est terminé sans appeler `exit()`. **Le runtime a traduit « tué par le signal 9 » en 128 + 9 = 137.** Un processus terminé par SIGTERM affiche 143 pour la même raison : 128 + 15.'
	],
	terms: [
		{ term: 'Code de sortie', def: 'Le nombre qu’un processus passe à `exit()` en se terminant. Seuls les 8 bits de poids faible arrivent au parent : il vaut donc entre 0 et 255. 0 veut dire succès.' },
		{ term: 'Statut de wait', def: 'L’entier que le noyau remet au parent par `wait()`. Il dit soit « sorti avec le code n », soit « tué par le signal N », et se lit avec `WIFEXITED`, `WEXITSTATUS`, `WIFSIGNALED` et `WTERMSIG`.' },
		{ term: '128 + N', def: 'La règle de bash, runc et tini pour faire tenir une mort par le signal N dans un seul code : SIGKILL (9) donne 137, SIGTERM (15) donne 143.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['p["Processus dans un conteneur"] -->|"exit(300)"| st1["Statut : sorti, 8 bits de poids faible = 44"]'],
				highlight: ['p', 'st1'],
				note: 'wait(2) : `WEXITSTATUS` renvoie « the least significant 8 bits of the status argument that the child specified ». 300 vaut 256 + 44, le parent lit donc 44. Capturé pendant cette session avec bash : `exit 300` donne 44 et `exit 256` donne 0.'
			},
			{
				add: ['p -->|"SIGKILL de l’OOM killer"| st2["Statut : tué par le signal 9, pas de code de sortie"]'],
				highlight: ['st2'],
				note: 'L’OOM killer appelle `do_send_sig_info(SIGKILL, ...)` sur sa victime (`mm/oom_kill.c`, ligne 947 en v6.12). Le processus n’appelle jamais `exit()`. `WIFSIGNALED` est vrai, `WTERMSIG` renvoie 9, et il ne faut pas utiliser `WEXITSTATUS`.'
			},
			{
				add: ['st2 --> rt["runc : 128 + 9 = 137"]', 'st1 --> rt2["runc : 44"]'],
				highlight: ['rt', 'rt2'],
				note: 'Le runtime a besoin d’un seul entier pour les deux cas. La fonction `ExitStatus()` de runc renvoie 128 plus le numéro du signal pour une mort par signal, et les 8 bits de poids faible sinon. bash(1) suit la même règle : « When a command terminates on a fatal signal N, bash uses the value of 128+N as the exit status. »'
			},
			{
				add: ['rt --> k8s["kubectl : exitCode 137, reason OOMKilled"]'],
				highlight: ['k8s'],
				note: 'Pour un conteneur dans l’état `Terminated`, Kubernetes affiche « a reason, an exit code, and the start and finish time ». 137 seul dit signal 9. La raison `OOMKilled` dit que c’est la limite mémoire qui l’a envoyé.'
			},
			{
				add: ['sh["Le shell ne peut pas lancer la commande"] -->|"introuvable"| c127["127"]', 'sh -->|"trouvée, pas exécutable"| c126["126"]'],
				highlight: ['sh', 'c127', 'c126'],
				note: 'bash(1) : « If a command is not found, the child process created to execute it returns a status of 127. If a command is found but is not executable, the return status is 126. » `docker run` emploie 127 et 126 de la même façon pour la commande du conteneur, et 125 pour une erreur du daemon Docker lui-même.'
			}
		]
	},
	example: {
		title: 'libcontainer/utils/utils.go : comment runc transforme un statut de wait en code de sortie',
		repo: 'opencontainers/runc',
		url: `${RUNC}/libcontainer/utils/utils.go#L12-L23`,
		lang: 'go',
		code: `const (
	exitSignalOffset = 128
)

// ExitStatus returns the correct exit status for a process based on if it
// was signaled or exited cleanly
func ExitStatus(status unix.WaitStatus) int {
	if status.Signaled() {
		return exitSignalOffset + int(status.Signal())
	}
	return status.ExitStatus()
}`,
		notes: [
			'La ligne 2 est le 128 de la règle « 128 + N ». runc prend le même décalage que bash : un conteneur tué par SIGKILL affiche le 137 que tu verrais dans un terminal.',
			'Lignes 8 et 9 : `Signaled()` est le nom Go de `WIFSIGNALED`. Quand il est vrai, le code ajoute le numéro du signal : 9 donne 137, 15 donne 143, 11 (SIGSEGV) donne 139.',
			'Ligne 11 : `ExitStatus()` correspond à `WEXITSTATUS`, les 8 bits de poids faible passés à `exit()`. Rien n’empêche un programme d’appeler `exit(137)` lui-même, et l’entier ressemble alors à un SIGKILL.',
			'runc appelle cette fonction depuis [`reap()`](' + RUNC + '/signals.go#L104-L127), qui boucle sur `unix.Wait4(-1, &ws, unix.WNOHANG, &rus)` et garde `utils.ExitStatus(ws)` pour chaque enfant terminé.'
		]
	},
	tradeoff: {
		gain: [
			'Un seul entier entre 0 et 255 porte les deux issues : `$?`, `docker inspect` et le `exitCode` du Pod affichent tous 137 pour SIGKILL et 143 pour SIGTERM.',
			'Les codes 126 et 127 disent que la commande n’a jamais démarré, avant même de lire les logs du programme.'
		],
		cost: [
			'Un programme peut appeler `exit(137)` ou `exit(127)` lui-même, et l’entier ne permet pas de le distinguer d’un signal ou d’une commande introuvable. Kubernetes ajoute le champ `reason` pour ça.',
			'Seuls 8 bits arrivent : `exit 256` annonce un succès (0), et `exit 300` annonce 44.'
		]
	},
	task: {
		prompt: 'Les Pods d’un CronJob se sont terminés avec ces codes : 0, 1, 127, 126, 137 avec la raison `OOMKilled`, 143, 139. Dis ce qui s’est passé dans chaque cas, avec bash(1), signal(7) et la règle 128 + N.',
		hint: 'Au-dessus de 128, retire 128 et cherche le nombre dans signal(7). Pour 1, lis la page de man du programme.',
		answer: [
			'0 : succès. 1 : le programme signale un échec selon ses propres règles. Pour `grep`, grep(1) dit que 1 veut dire « no lines were selected » et 2 « an error occurred ». Capturé pendant cette session : `grep -q nothing /etc/hostname` donne 1, `grep -q x /nonexistent` donne 2.',
			'127 : commande introuvable, par exemple une faute de frappe dans `command:` ou un binaire absent de l’image. 126 : le fichier existe mais ne peut pas être lancé. Capturé pendant cette session avec bash : un script en mode 664 donne `Permission denied` et 126, `./nope` donne 127.',
			'137 = 128 + 9 : SIGKILL. Avec la raison `OOMKilled`, le conteneur a dépassé sa limite mémoire et l’OOM killer a envoyé le signal.',
			'143 = 128 + 15 : SIGTERM, le signal d’arrêt par défaut de containerd et de CRI-O quand Kubernetes arrête un Pod. 139 = 128 + 11 : SIGSEGV, un accès mémoire invalide dans le programme.'
		]
	},
	quiz: [
		{
			q: 'Pendant un rolling update, les anciens Pods se terminent avec le code 143. Qu’est-ce que ça veut dire ?',
			options: [
				'Le conteneur a dépassé sa limite mémoire et le noyau l’a arrêté',
				'Le processus a été terminé par SIGTERM, le signal 15, comme lors d’un arrêt normal',
				'Le fichier d’entrée de l’image existe mais n’a pas le droit d’exécution',
				'Le conteneur a dépassé sa limite CPU pendant plus de 15 secondes'
			],
			answer: 1,
			why: '143 dépasse 128, il code donc un signal : 143 moins 128 donne 15, SIGTERM. Un processus sans handler pour SIGTERM subit l’action par défaut, terminer, et le runtime annonce 128 + 15.'
		},
		{
			q: '`docker run myimg` sort tout de suite avec le code 127. Quelle est la cause probable ?',
			options: [
				'Le daemon Docker lui-même a échoué, par exemple sur une option inconnue',
				'La commande a été trouvée, mais le fichier ne peut pas être exécuté',
				'La commande du `CMD` ou de l’`ENTRYPOINT` de l’image est introuvable',
				'Le processus principal du conteneur a été tué par SIGKILL'
			],
			answer: 2,
			why: 'La doc Docker : « Exit code 127 indicates that the contained command can\'t be found. » 125 est réservé aux erreurs du daemon, 126 à une commande qui « can\'t be invoked », et SIGKILL donnerait 137.'
		},
		{
			q: 'Un programme se termine par `exit(256)`. Quel code de sortie voit le shell parent ?',
			options: [
				'256, la valeur passée à `exit()`',
				'255, car les valeurs plus grandes sont plafonnées au maximum',
				'0, car seuls les 8 bits de poids faible arrivent au parent',
				'128, car les valeurs au-dessus de 255 sont traitées comme un signal'
			],
			answer: 2,
			why: 'wait(2) : `WEXITSTATUS` garde « the least significant 8 bits » de la valeur. 256 s’écrit 1 0000 0000 en binaire : les 8 bits de poids faible sont tous à 0, et le shell annonce un succès.'
		}
	],
	recall: {
		q: 'Un conteneur affiche le code de sortie 137. Qu’est-il arrivé au processus, et comment calcule-t-on 137 ?',
		a: 'Il a été tué par le signal 9, SIGKILL, sans jamais appeler `exit()`. runc et bash annoncent une mort par le signal N comme 128 + N, donc 128 + 9 = 137. SIGTERM donne 143.'
	},
	sources: [
		{ title: 'bash(1), EXIT STATUS', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'wait(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/wait.2.html' },
		{ title: 'signal(7), Signal numbering for standard signals', url: 'https://man7.org/linux/man-pages/man7/signal.7.html' },
		{ title: 'grep(1), EXIT STATUS', url: 'https://man7.org/linux/man-pages/man1/grep.1.html' },
		{ title: 'Doc Kubernetes, Assign Memory Resources to Containers and Pods', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/' },
		{ title: 'Doc Kubernetes, Pod Lifecycle, Container states', url: 'https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/' },
		{ title: 'Doc Docker, Running containers, Exit status', url: 'https://docs.docker.com/engine/containers/run/' },
		{ title: 'Linux v6.12, mm/oom_kill.c', url: 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/mm/oom_kill.c#L947' }
	]
};
