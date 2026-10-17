const MOBY = 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'capabilities',
	part: 'Les conteneurs vus du noyau',
	title: 'Les capabilities',
	minutes: 10,
	hook: [
		'La politique Restricted de Kubernetes demande que les conteneurs « must drop ALL capabilities ». Tu essaies avec `docker run --cap-drop=ALL nginx:1.27-alpine`, et le conteneur s’arrête aussitôt. Dernière ligne du log : `chown("/var/cache/nginx/client_temp", 101) failed (1: Operation not permitted)`. Pourtant, `id` dans un conteneur du même genre affiche `uid=0(root)`.',
		'Depuis Linux 2.2, le noyau découpe les pouvoirs de root en capabilities séparées. Chaque action privilégiée vérifie la capability dont elle a besoin : d’après chown(2), seul un processus « with the CAP_CHOWN capability » peut changer le propriétaire d’un fichier. **Docker donne 14 capabilities à un conteneur par défaut**, et `--cap-drop=ALL` les retire toutes.',
		'Si tu remets `--cap-add=CHOWN`, nginx avance d’un pas : ses workers échouent ensuite sur `setgid(101) failed (1: Operation not permitted)`. Avec `CHOWN`, `SETUID` et `SETGID`, il sert sa page d’accueil. Ces sorties viennent de Docker 29.9 sur Linux 6.17, lancé pendant l’écriture de ce chapitre.'
	],
	terms: [
		{ term: 'Capability', def: 'Une part des pouvoirs de root, nommée `CAP_` suivi d’un mot : `CAP_CHOWN` change le propriétaire d’un fichier, `CAP_NET_BIND_SERVICE` ouvre un port sous 1024. Chaque thread a ses propres ensembles de capabilities.' },
		{ term: 'Ensemble effectif', def: 'Les capabilities que le noyau vérifie quand le thread demande une action privilégiée. La ligne `CapEff` de `/proc/<pid>/status` l’affiche en masque hexadécimal.' },
		{ term: 'Ensemble limite', def: 'Le plafond des capabilities qu’un thread peut gagner en lançant un nouveau programme avec execve(2). La ligne `CapBnd` de `/proc/<pid>/status` l’affiche. En anglais : bounding set.' },
		{ term: 'Capability de fichier', def: 'Des capabilities posées sur un exécutable dans l’attribut étendu `security.capability`, avec `setcap`. Un processus non root qui lance ce fichier peut ainsi gagner une capability.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["docker run --cap-drop=ALL --cap-add=CHOWN nginx"] --> pid1["master nginx : uid 0, CapEff 0000000000000001"]'],
				highlight: ['run', 'pid1'],
				note: 'Docker passe la liste des capabilities au runtime, et le premier processus démarre avec celles-là seulement. `capsh --decode=1` affiche `cap_chown` : le bit 0 du masque. Le processus est toujours UID 0, mais l’UID 0 seul ne passe plus les vérifications du noyau.'
			},
			{
				add: ['pid1 -->|"chown(client_temp, 101)"| k1{"CAP_CHOWN dans CapEff ?"}', 'k1 -->|"oui"| ok1["répertoire à l’uid 101"]'],
				highlight: ['k1', 'ok1'],
				note: 'nginx donne `/var/cache/nginx/client_temp` à son utilisateur `nginx`, l’UID 101. Le noyau cherche `CAP_CHOWN` dans l’ensemble effectif, le trouve, et l’appel renvoie 0.'
			},
			{
				add: ['pid1 -->|"fork, le worker appelle setgid(101)"| k2{"CAP_SETGID dans CapEff ?"}', 'k2 -->|"non"| err["EPERM : Operation not permitted"]'],
				highlight: ['k2', 'err'],
				note: 'Un enfant créé par fork(2) reçoit une copie des ensembles de son parent. Chaque worker appelle ensuite `setgid(101)` pour passer au groupe nginx. `CAP_SETGID` manque, l’appel échoue avec `EPERM` (errno 1), et nginx note que le worker « cannot be respawned ».'
			},
			{
				add: ['user["--user 1000 --cap-add=NET_BIND_SERVICE"] -->|"execve(grep)"| calc["nouvel ensemble permis calculé depuis le fichier et l’ensemble ambiant"]', 'calc --> zero["CapEff 0, CapBnd 0000000000000400"]'],
				highlight: ['user', 'calc', 'zero'],
				note: 'À chaque execve(2), le noyau recalcule les ensembles. Pour un processus non root qui lance un fichier sans capabilities de fichier, la formule de capabilities(7) donne un ensemble permis vide. En UID 1000, `grep Cap /proc/self/status` montre `CapEff: 0000000000000000`, alors que `CapBnd` garde le bit 10, `cap_net_bind_service`.'
			},
			{
				add: ['zero -->|"execve d’un fichier setcap ou setuid root"| ceil["gagne au plus ce que CapBnd permet"]'],
				highlight: ['ceil'],
				note: 'Pendant execve, le noyau fait un ET entre l’ensemble limite et les capabilities permises du fichier. Un programme setuid root ou un fichier marqué `cap_sys_admin` ne gagne rien hors de `CapBnd`. Avec `--cap-drop=ALL` sans ajout, `CapBnd` vaut 0 : aucun programme du conteneur ne regagne de capability par ce chemin.'
			}
		]
	},
	example: {
		title: 'daemon/pkg/oci/caps/utils.go : comment Docker construit la liste des capabilities',
		repo: 'moby/moby',
		url: `${MOBY}/daemon/pkg/oci/caps/utils.go#L81-L124`,
		lang: 'go',
		code: `func TweakCapabilities(basics, adds, drops []string, privileged bool) ([]string, error) {
	switch {
	case privileged:
		// Privileged containers get all capabilities
		return GetAllCapabilities(), nil
	case len(adds) == 0 && len(drops) == 0:
		// Nothing to tweak; we're done
		return basics, nil
	}

	capDrop, err := NormalizeLegacyCapabilities(drops)
	if err != nil {
		return nil, err
	}
	capAdd, err := NormalizeLegacyCapabilities(adds)
	if err != nil {
		return nil, err
	}

	var caps []string

	switch {
	case slices.Contains(capAdd, allCapabilities):
		// Add all capabilities except ones on capDrop
		for _, c := range GetAllCapabilities() {
			if !slices.Contains(capDrop, c) {
				caps = append(caps, c)
			}
		}
	case slices.Contains(capDrop, allCapabilities):
		// "Drop" all capabilities; use what's in capAdd instead
		caps = capAdd
	default:
		// First drop some capabilities
		for _, c := range basics {
			if !slices.Contains(capDrop, c) {
				caps = append(caps, c)
			}
		}
		// Then add the list of capabilities from capAdd
		caps = append(caps, capAdd...)
	}
	return caps, nil
}`,
		notes: [
			'Lignes 3 à 5 : `--privileged` renvoie toutes les capabilities que le noyau connaît et ignore `--cap-add` et `--cap-drop`. La doc de Docker précise que ce mode ouvre aussi tous les périphériques de l’hôte et assouplit AppArmor ou SELinux.',
			'Ligne 8 : sans option, le conteneur reçoit `basics`, les 14 noms de [`defaults.go`](' + MOBY + '/daemon/pkg/oci/caps/defaults.go#L4-L21), de `CAP_CHOWN` à `CAP_AUDIT_WRITE`. Dans `alpine:3.20`, `grep CapEff /proc/self/status` affiche cette liste sous la forme `00000000a80425fb`.',
			'Les lignes 11 à 18 appellent `NormalizeLegacyCapabilities`, qui met chaque nom en majuscules et ajoute le préfixe `CAP_`. `--cap-add=net_raw` et `--cap-add=CAP_NET_RAW` donnent le même résultat, et un nom inconnu renvoie l’erreur `unknown capability`.',
			'Lignes 30 à 32 : si les retraits contiennent `ALL`, Docker jette la liste par défaut et garde seulement les ajouts. Les lignes 33 à 41 traitent tous les autres cas : retirer les noms de `--cap-drop` de la liste par défaut, puis ajouter ceux de `--cap-add`.',
			'Dans Docker, `CAP_NET_BIND_SERVICE` compte moins que son nom le laisse croire. Docker règle `net.ipv4.ip_unprivileged_port_start` à 0 dans chaque conteneur qui a son propre namespace réseau ([oci_linux.go](' + MOBY + '/daemon/oci_linux.go#L772-L775)). Pendant l’écriture, `--cap-drop=ALL --user 1000` pouvait encore ouvrir le port 80 ; avec `--sysctl net.ipv4.ip_unprivileged_port_start=1024`, il recevait `Permission denied`.'
		]
	},
	tradeoff: {
		gain: [
			'Avec un ensemble effectif vide, root dans le conteneur reçoit `Operation not permitted` sur `chown`, `setgid` et `setuid` : un processus compromis ne peut pas s’emparer des fichiers ni de l’identité d’autres utilisateurs.',
			'Avec `CapBnd` à 0, aucun binaire setuid root ni fichier passé par `setcap` dans l’image ne rend une capability à un processus.',
			'La politique Restricted de Kubernetes vérifie un seul champ : les conteneurs « must drop ALL capabilities » et ne peuvent rajouter que `NET_BIND_SERVICE`.'
		],
		cost: [
			'Tu trouves la liste de chaque image par essais. nginx 1.27 a besoin de `CHOWN`, `SETUID` et `SETGID`, et il ne signale que le premier manquant à chaque fois.',
			'Une capability ajoutée pour un utilisateur non root n’arrive pas dans l’ensemble effectif du programme : `--user 1000 --cap-add=NET_BIND_SERVICE` montre toujours `CapEff: 0000000000000000`. Il faut un `setcap` sur le binaire dans l’image.',
			'Ajouter `CAP_SYS_ADMIN` ouvre beaucoup d’appels d’un coup. Selon capabilities(7), cette capability « is overloaded » : elle autorise `mount`, `sethostname`, `swapon` et bien d’autres appels.'
		]
	},
	task: {
		prompt: 'Lance `docker run --rm alpine:3.20 grep Cap /proc/self/status`, puis la même chose avec `--cap-drop=ALL --cap-add=NET_BIND_SERVICE`, puis encore avec `--user 1000` en plus. Décode chaque `CapEff` avec `capsh --decode=<mask>`. Explique le troisième résultat.',
		hint: 'Compare `CapEff` et `CapBnd` au troisième essai. Puis regarde la formule d’execve dans capabilities(7) pour un processus non root et un fichier sans capabilities de fichier.',
		answer: [
			'Premier essai : `CapEff: 00000000a80425fb`. `capsh` le décode en 14 noms, de `cap_chown` à `cap_setfcap` : la liste par défaut de Docker.',
			'Deuxième essai : `CapPrm`, `CapEff` et `CapBnd` valent tous `0000000000000400`, soit `cap_net_bind_service`, le bit 10.',
			'Troisième essai : `CapEff: 0000000000000000` et `CapBnd: 0000000000000400`. `grep` tourne en UID 1000 sans capabilities de fichier, donc la formule P\'(permitted) = (P(inheritable) & F(inheritable)) | (F(permitted) & P(bounding)) | P\'(ambient) donne 0. La capability reste dans l’ensemble limite, comme plafond.',
			'Pour la donner à un programme non root, l’image lance `setcap cap_net_bind_service=+ep` sur ce binaire, ce qui écrit l’attribut `security.capability`. Pour un port sous 1024 dans Docker, tu n’en as pas besoin : Docker met `ip_unprivileged_port_start` à 0.'
		]
	},
	quiz: [
		{
			q: 'nginx tourne en root dans un conteneur lancé avec `--cap-drop=ALL` et écrit `chown(...) failed (1: Operation not permitted)`. Pourquoi ?',
			options: [
				'chown(2) cherche `CAP_CHOWN` dans l’ensemble effectif, et cet ensemble est vide',
				'`--cap-drop=ALL` monte aussi le répertoire `/var/cache` de l’image en lecture seule',
				'Docker transforme root en UID 65534 dès qu’on retire des capabilities',
				'Le profil seccomp par défaut de Docker bloque `chown` dans tous les conteneurs'
			],
			answer: 0,
			why: 'Le noyau vérifie une capability par action privilégiée, et changer le propriétaire d’un fichier demande `CAP_CHOWN`. Une fois l’ensemble effectif vide, l’UID 0 seul ne passe aucune vérification. `CapEff` affiche `0000000000000000` dans ce conteneur.'
		},
		{
			q: 'Tu lances un conteneur avec `--user 1000 --cap-add=NET_BIND_SERVICE`. `CapEff` ne contient que des zéros. Pourquoi ?',
			options: [
				'Docker ignore `--cap-add` dès que `--user` est présent aussi',
				'Un execve non root d’un fichier sans capabilities de fichier donne un ensemble permis vide',
				'La capability n’apparaît dans `CapEff` qu’après le premier appel à `bind`',
				'Le noyau retire toutes les capabilities aux processus dont l’UID dépasse 999'
			],
			answer: 1,
			why: 'À l’execve(2), le nouvel ensemble permis vient des capabilities du fichier, de l’ensemble héritable et de l’ensemble ambiant. Pour l’UID 1000 qui lance `grep`, les trois sont vides. `CapBnd` montre toujours le bit 10 : un binaire passé par `setcap cap_net_bind_service=+ep` pourrait la gagner.'
		},
		{
			q: 'Avec le Pod Security Standard Restricted de Kubernetes, quelles capabilities un conteneur peut-il rajouter après avoir retiré ALL ?',
			options: [
				'Les 14 capabilities de la liste par défaut de Docker',
				'`NET_ADMIN` et `SYS_TIME`, pour les outils réseau et horloge',
				'Aucune : la liste `add` doit rester vide',
				'Seulement `NET_BIND_SERVICE`'
			],
			answer: 3,
			why: 'La politique Restricted dit que les conteneurs « must drop ALL capabilities, and are only permitted to add back the NET_BIND_SERVICE capability ». La politique Baseline autorise 13 noms : la liste par défaut de Docker sans `NET_RAW`.'
		}
	],
	recall: {
		q: 'Root, dans un conteneur lancé avec `--cap-drop=ALL`, appelle `chown`. Que se passe-t-il, et que montre `CapEff` ?',
		a: 'L’appel échoue avec `EPERM`, « Operation not permitted », car `CAP_CHOWN` n’est pas dans l’ensemble effectif. `CapEff` vaut `0000000000000000` ; par défaut, Docker donne `00000000a80425fb`, soit 14 capabilities.'
	},
	sources: [
		{ title: 'capabilities(7), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man7/capabilities.7.html' },
		{ title: 'proc_pid_status(5), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man5/proc_pid_status.5.html' },
		{ title: 'chown(2), page de manuel Linux', url: 'https://man7.org/linux/man-pages/man2/chown.2.html' },
		{ title: 'Doc Docker, Running containers : privilèges et capabilities Linux', url: 'https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities' },
		{ title: 'Doc Kubernetes, Configure a Security Context for a Pod or Container', url: 'https://kubernetes.io/docs/tasks/configure-pod-container/security-context/' },
		{ title: 'Doc Kubernetes, Pod Security Standards', url: 'https://kubernetes.io/docs/concepts/security/pod-security-standards/' },
		{ title: 'moby/moby, daemon/pkg/oci/caps/defaults.go', url: `${MOBY}/daemon/pkg/oci/caps/defaults.go` },
		{ title: 'Doc du noyau Linux, IP sysctl : ip_unprivileged_port_start', url: 'https://docs.kernel.org/networking/ip-sysctl.html' }
	]
};
