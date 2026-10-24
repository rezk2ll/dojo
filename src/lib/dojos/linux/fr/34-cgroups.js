const CG = 'https://github.com/opencontainers/cgroups/blob/19a241326c83a5100dff94732733791a0c9e4720';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cgroups',
	part: 'Les conteneurs vus du noyau',
	title: 'Les cgroups v2',
	minutes: 10,
	hook: [
		'Tu lances `docker run -d --cpus 0.5 --memory 256m busybox sleep 300`. Sur l’hôte, `cat /proc/1786/cgroup` affiche `0::/system.slice/docker-<id>.scope`, où `<id>` est l’identifiant du conteneur, 64 caractères. (Sortie relevée sur la machine où ce chapitre a été écrit, Docker 29.9 sur systemd 255.)',
		'Dans ce dossier sous `/sys/fs/cgroup`, `cpu.max` contient `50000 100000` et `memory.max` contient `268435456`. Docker a traduit `--cpus 0.5` en 50 ms de CPU par période de 100 ms, et `--memory 256m` en 256 Mio exprimés en octets.',
		'Aucun démon ne surveille le conteneur pour appliquer ces limites. **C’est le noyau qui lit les deux fichiers** : l’ordonnanceur arrête le groupe dès qu’il a consommé 50 ms dans une période, et l’OOM killer se déclenche dans le groupe quand celui-ci ne tient plus sous 256 Mio.'
	],
	terms: [
		{ term: 'cgroup', def: 'Un dossier sous `/sys/fs/cgroup` qui contient un groupe de processus, listés dans son fichier `cgroup.procs`. cgroup v2 n’a qu’un seul arbre, et chaque processus est dans exactement un cgroup de cet arbre.' },
		{ term: 'Contrôleur', def: 'La partie du noyau qui limite une ressource pour un cgroup : `cpu`, `memory`, `io`, `pids` et d’autres. Ses réglages sont des fichiers à son préfixe, comme `cpu.max` ou `memory.max`.' },
		{ term: '`cgroup.subtree_control`', def: 'Le fichier où un cgroup active des contrôleurs pour ses enfants : `echo "+cpu +memory" > cgroup.subtree_control`. Ça crée les fichiers `cpu.*` et `memory.*` dans chaque enfant.' },
		{ term: 'Slice et scope', def: 'Les noms que systemd donne aux cgroups qu’il crée : une slice regroupe d’autres unités (`system.slice`, `user.slice`), et un scope contient des processus lancés hors de systemd, comme un conteneur Docker.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['root["/sys/fs/cgroup : le cgroup racine"] -->|"subtree_control : +cpu +io +memory +pids ..."| sys["system.slice"]'],
				highlight: ['root', 'sys'],
				note: 'cgroup v2 est un seul système de fichiers, monté ici sur `/sys/fs/cgroup` avec le type `cgroup2`. Le `cgroup.controllers` de la racine liste ce que le noyau propose : `cpuset cpu io memory hugetlb pids rdma misc dmem` sur cette machine. La doc : "No controller is enabled by default." Écrire `+cpu` dans `cgroup.subtree_control` l’active pour les enfants.'
			},
			{
				add: ['sys -->|"subtree_control"| scope["docker-id.scope"]', 'sys --> svc["containerd.service, cron.service, ..."]'],
				highlight: ['scope'],
				note: 'Un enfant ne peut activer un contrôleur que si son parent l’a dans `cgroup.subtree_control` : la doc appelle ça la contrainte du haut vers le bas. Un cgroup qui active des contrôleurs de domaine pour ses enfants ne peut contenir aucun processus lui-même. Les processus se trouvent donc dans les feuilles, comme le scope du conteneur.'
			},
			{
				add: ['scope --> files["cpu.max = 50000 100000, memory.max = 268435456, io.max = (vide)"]'],
				highlight: ['files'],
				note: 'Le runtime écrit les limites dans les fichiers du scope. `cpu.max` vaut `$MAX $PERIOD` en microsecondes, `max 100000` par défaut. `memory.max` est un nombre d’octets, `max` par défaut. `io.max` prend une ligne par disque, par exemple `8:16 rbps=2097152 wiops=120`, et il est vide ici puisqu’aucune limite d’I/O n’a été demandée.'
			},
			{
				add: ['scope --> procs["cgroup.procs : 1786"]', 'procs -->|"fork"| child["Processus enfant : même cgroup"]'],
				highlight: ['procs', 'child'],
				note: 'Écrire un PID dans `cgroup.procs` déplace ce processus, avec tous ses threads, dans le cgroup. "When a process forks a child process, the new process is born into the cgroup that the forking process belongs to" : l’enfant naît dans le cgroup de son parent. Tout ce que lance le PID 1 du conteneur reste sous les mêmes limites.'
			},
			{
				add: ['files --> kern["Noyau : CPU arrêté après 50 ms par 100 ms, OOM killer à 256 Mio"]'],
				highlight: ['kern'],
				note: 'L’ordonnanceur compte le temps CPU de chaque processus du groupe contre `cpu.max` (chapitre 35). Le contrôleur mémoire compte la mémoire du groupe, cache de pages compris, contre `memory.max` : "If a cgroup\'s memory usage reaches this limit and can\'t be reduced, the OOM killer is invoked in the cgroup" (chapitre 13).'
			}
		]
	},
	example: {
		title: 'fs2/create.go : créer le chemin du cgroup et activer les contrôleurs en descendant',
		repo: 'opencontainers/cgroups',
		url: `${CG}/fs2/create.go#L85-L147`,
		lang: 'go',
		code: `	ctrs := strings.Fields(content)
	res := "+" + strings.Join(ctrs, " +")

	elements := strings.Split(path, "/")
	elements = elements[3:]
	current := "/sys/fs"
	for i, e := range elements {
		current = filepath.Join(current, e)
		if i > 0 {
			if err := os.Mkdir(current, 0o755); err != nil {
				if !os.IsExist(err) {
					return err
				}
			} else {
…
		}
		// enable all supported controllers
		if i < len(elements)-1 {
			if err := cgroups.WriteFile(current, cgStCtlFile, res); err != nil {
				// try write one by one
				for ctr := range strings.SplitSeq(res, " ") {
					_ = cgroups.WriteFile(current, cgStCtlFile, ctr)
				}
			}
			// Some controllers might not be enabled when rootless or containerized,
			// but we don't catch the error here. (Caught in setXXX() functions.)
		}
	}`,
		notes: [
			'`content` est le `cgroup.controllers` de la racine, lu à la [ligne 13](' + CG + '/fs2/create.go#L12-L14). Les lignes 1 et 2 transforment `cpuset cpu io memory` en `+cpuset +cpu +io +memory`, le format qu’attend `cgroup.subtree_control`.',
			'Pour `/sys/fs/cgroup/system.slice/docker-<id>.scope`, la ligne 5 garde `cgroup`, `system.slice` et le nom du scope. La ligne 10 crée chaque niveau manquant avec `mkdir`, le seul appel qu’il faut pour créer un cgroup, et un niveau qui existe déjà ne gêne pas (ligne 11).',
			'La ligne 18 écrit `cgroup.subtree_control` à chaque niveau sauf le dernier. La contrainte du haut vers le bas impose que chaque parent active un contrôleur avant que son enfant puisse s’en servir. Le dernier niveau est la feuille qui recevra les processus : il n’a pas d’écriture dans `subtree_control`.',
			'Les lignes 19 à 23 réessaient contrôleur par contrôleur. D’après la doc, une écriture de plusieurs contrôleurs passe en entier ou pas du tout : "either they all succeed or fail". Sans ça, un seul contrôleur absent bloquerait tous les autres.',
			'Les limites arrivent ensuite, dans [`setCPU`](' + CG + '/fs2/cpu.go#L54-L74) : la fonction écrit `cpu.max` sous la forme quota et période, avec une période de 100000 si aucune n’est donnée.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque limite est un fichier texte que tu peux lire : `cat /sys/fs/cgroup/<path>/cpu.max` montre ce que le noyau applique, que ce soit Docker, Kubernetes ou systemd qui l’ait écrit.',
			'Chaque processus que forke un conteneur arrive dans le même cgroup : la limite couvre tout l’arbre de processus sans travail en plus pour le runtime.',
			'Les unités systemd passent par les mêmes fichiers : `CPUQuota=20%` dans un service écrit `cpu.max`, et `MemoryMax=` écrit `memory.max`.'
		],
		cost: [
			'Un cgroup qui active des contrôleurs de domaine pour ses enfants ne peut pas contenir de processus. Un outil qui met un processus dans un cgroup intermédiaire reçoit des erreurs ou un état `domain invalid`, que l’exemple doit gérer.',
			'`memory.max` compte aussi le cache de pages : un conteneur qui lit de gros fichiers peut atteindre sa limite avec un petit tas.',
			'Si un contrôleur manque dans le `cgroup.subtree_control` du parent, l’enfant n’a pas du tout de fichier `cpu.max`, et un runtime rootless n’a pas toujours le droit de l’activer.'
		]
	},
	task: {
		prompt: 'Lance `docker run -d --name cg1 --cpus 1.5 --memory 512m busybox sleep 600`. Avant de regarder, note ce que contiendront `cpu.max` et `memory.max`. Trouve ensuite le cgroup avec `cat /proc/$(docker inspect -f \'{{.State.Pid}}\' cg1)/cgroup` et lis les deux fichiers sous `/sys/fs/cgroup`. Pour finir, écris le drop-in systemd qui donne les deux mêmes limites au service `myapp.service`.',
		hint: 'Doc de Docker : `--cpus="1.5"` "is the equivalent of setting --cpu-period="100000" and --cpu-quota="150000"". Le suffixe `m` veut dire Mio : multiplie deux fois par 1024.',
		answer: [
			'`cpu.max` contient `150000 100000` : 150 ms de CPU par période de 100 ms, un CPU et demi. `memory.max` contient `536870912`, soit 512 × 1024 × 1024 octets.',
			'Pour comparer, le conteneur `--cpus 0.5 --memory 256m` de la machine où ce chapitre a été écrit affichait `50000 100000` et `268435456`, dans `/sys/fs/cgroup/system.slice/docker-<id>.scope`. `systemctl show` sur ce scope donnait `CPUQuotaPerSecUSec=500ms` et `MemoryMax=268435456`.',
			'Le drop-in, dans `/etc/systemd/system/myapp.service.d/limits.conf` : `[Service]`, puis `CPUQuota=150%` et `MemoryMax=512M`. Lance `systemctl daemon-reload`, redémarre le service, puis vérifie `cpu.max` sous `/sys/fs/cgroup/system.slice/myapp.service`.',
			'`systemd-cgls /system.slice/myapp.service` liste les processus de ce cgroup, comme il listait `1786 sleep 300` pour le scope du conteneur.'
		],
		steps: [
			{
				title: 'Prédis les valeurs',
				questions: [
					{ q: 'Quel est le format de `cpu.max` ?', options: ['Un pourcentage d’un CPU', 'Le quota puis la période, en microsecondes', 'La période puis le quota, en millisecondes', 'Un nombre de CPU, comme `1.5`'], answer: 1, why: '`cpu.max` vaut `$MAX $PERIOD` en microsecondes, avec `max 100000` par défaut.' },
					{ q: 'Que contiendra donc `cpu.max` pour `--cpus 1.5` ?', options: ['`1.5 100000`', '`100000 150000`', '`150000 100000`', '`max 150000`'], answer: 2, why: 'La doc de Docker dit que `--cpus="1.5"` équivaut à une période de 100000 et un quota de 150000 : 150 ms de CPU par période de 100 ms.' },
					{ q: 'Que contiendra `memory.max` pour `--memory 512m` ?', options: ['`536870912`', '`512000000`', '`512m`', '`524288`'], answer: 0, why: '`m` veut dire Mio, et `memory.max` compte des octets : 512 × 1024 × 1024 = 536870912.' },
					{ q: 'Quelle partie du système applique ces nombres une fois écrits ?', options: ['Le démon Docker, qui surveille le conteneur', 'containerd, avec un thread de surveillance', 'systemd, qui redémarre le scope quand il dépasse', 'Le noyau, qui lit les fichiers du cgroup'], answer: 3, why: 'Aucun démon ne surveille le conteneur. L’ordonnanceur arrête le groupe à son quota, et l’OOM killer se lance dans le groupe à sa limite mémoire.' }
				]
			},
			{
				title: 'Trouve le cgroup',
				questions: [
					{ q: '`cat /proc/<pid>/cgroup` affiche `0::/system.slice/docker-<id>.scope`. Où est le dossier ?', options: ['`/proc/<pid>/system.slice/docker-<id>.scope`', '`/sys/fs/cgroup/system.slice/docker-<id>.scope`', '`/var/lib/docker/cgroups/<id>`', '`/etc/systemd/system/docker-<id>.scope`'], answer: 1, why: 'cgroup v2 est un seul système de fichiers monté sur `/sys/fs/cgroup`, et le chemin de `/proc/<pid>/cgroup` part de là.' },
					{ q: 'Pourquoi le cgroup du conteneur est-il un « scope » systemd ?', options: ['Un scope contient des processus lancés hors de systemd', 'Les scopes sont les seuls cgroups qui acceptent des limites', 'Docker lance le conteneur comme un service systemd', 'Les scopes sont plus rapides que les slices'], answer: 0, why: 'Une slice regroupe d’autres unités, et un scope contient des processus que systemd n’a pas lancés lui-même, comme un conteneur Docker.' },
					{ q: 'Pourquoi le processus du conteneur est-il dans une feuille de l’arbre, et pas dans `system.slice` ?', options: ['Les feuilles reçoivent plus de CPU que les cgroups intermédiaires', 'Le noyau ne lit les limites que dans les feuilles', 'Docker ne peut pas écrire dans `system.slice`', 'Un cgroup qui active des contrôleurs de domaine pour ses enfants ne peut pas contenir de processus'], answer: 3, why: 'C’est une règle de cgroup v2. Les processus vivent donc dans les feuilles, comme le scope du conteneur.' },
					{ q: 'Combien de lignes `/proc/<pid>/cgroup` affiche-t-il sur cet hôte en cgroup v2 ?', options: ['Une par contrôleur', 'Une par namespace', 'Une : la place du processus dans l’arbre unique', 'Aucune pour un processus de conteneur'], answer: 2, why: 'cgroup v2 n’a qu’un arbre, et chaque processus est dans exactement un de ses cgroups. La ligne commence par `0::`.' }
				]
			},
			{
				title: 'Lis les fichiers',
				questions: [
					{ q: '`cpu.max` affiche `150000 100000`. Que fait l’ordonnanceur ?', options: ['Il fixe le conteneur sur un cœur et demi', 'Il arrête le groupe dès qu’il a pris 150 ms de CPU dans une période de 100 ms', 'Il donne au groupe 150 % de priorité sur les autres', 'Il laisse le groupe tourner 100 ms puis le met en pause 150 ms'], answer: 1, why: 'Le quota est du temps CPU, tous CPU confondus, par période. 150 ms par 100 ms, c’est un CPU et demi occupés toute la période.' },
					{ q: 'Que compte `memory.max` dans la limite ?', options: ['Seulement le tas du processus principal', 'Seulement la mémoire anonyme, pas les fichiers', 'La mémoire du groupe, cache de pages compris', 'La mémoire des processus du conteneur et celle de dockerd'], answer: 2, why: 'Le contrôleur mémoire compte aussi le cache de pages : un conteneur qui lit de gros fichiers peut atteindre sa limite avec un petit tas.' },
					{ q: 'Que se passe-t-il quand le groupe atteint `memory.max` et que le noyau ne peut pas récupérer assez ?', options: ['L’OOM killer se lance dans le cgroup', 'Le noyau monte la limite de 10 %', 'Le conteneur est mis en pause jusqu’à ce que de la mémoire se libère', 'Docker redémarre le conteneur avec plus de mémoire'], answer: 0, why: 'La doc : "the OOM killer is invoked in the cgroup". Il choisit un processus de ce groupe, pas de toute la machine.' },
					{ q: 'Tu montes la limite avec `docker update --memory 1g cg1`. Que contient alors `memory.max` ?', options: ['`536870912`', '`1000000000`', '`max`', '`1073741824`'], answer: 3, why: 'Docker écrit la nouvelle limite en octets dans le même fichier : 1g, c’est 1024 × 1024 × 1024.' }
				]
			},
			{
				title: 'Écris le drop-in',
				questions: [
					{ q: 'Où va le drop-in de `myapp.service` ?', options: ['`/etc/systemd/system/myapp.service.d/limits.conf`', '`/sys/fs/cgroup/system.slice/myapp.service/limits.conf`', '`/usr/lib/systemd/limits.d/myapp.conf`', '`/etc/sysctl.d/myapp.conf`'], answer: 0, why: 'Un dossier `.d` au nom de l’unité contient les drop-ins qui la complètent. systemd écrit ensuite les fichiers du cgroup pour toi.' },
					{ q: 'Quelle ligne donne au service un CPU et demi ?', options: ['`CPUQuota=1.5`', '`CPUQuota=150000`', '`CPUQuota=150%`', '`CPUMax=150000 100000`'], answer: 2, why: '`CPUQuota=` prend un pourcentage d’un CPU. systemd en tire `cpu.max`, comme `CPUQuota=20%` dans les compromis.' },
					{ q: 'Quelle ligne lui donne 512 Mio ?', options: ['`MemoryLimit=512`', '`MemoryMax=512M`', '`memory.max=536870912`', '`MemoryHigh=512%`'], answer: 1, why: '`MemoryMax=` écrit `memory.max`. systemd lit le suffixe `M` comme des Mio, donc le fichier contient 536870912.' },
					{ q: 'Tu as enregistré le fichier. Que lances-tu avant de vérifier `cpu.max` ?', options: ['`sysctl --system`', '`systemctl restart systemd-cgls`', 'Rien, systemd relit les drop-ins à chaque accès', '`systemctl daemon-reload`, puis un redémarrage du service'], answer: 3, why: 'systemd ne relit les fichiers d’unité qu’au `daemon-reload`. Vérifie ensuite `cpu.max` sous `/sys/fs/cgroup/system.slice/myapp.service`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un service forke 20 processus workers. Son cgroup a `memory.max` à 1 Gio. Que couvre la limite ?',
			options: [
				'Seulement le processus principal, celui dont le PID a été écrit dans `cgroup.procs`',
				'Les 21 processus ensemble, car les enfants forkés naissent dans le même cgroup',
				'Chaque processus séparément, donc le service peut utiliser 21 Gio en tout',
				'Seulement les workers lancés après l’écriture de la limite'
			],
			answer: 1,
			why: 'Doc cgroup-v2 : un enfant forké "is born into the cgroup that the forking process belongs to". `memory.max` limite le groupe entier : les 21 processus se partagent 1 Gio.'
		},
		{
			q: 'Tu crées `/sys/fs/cgroup/app/web` et tu ne trouves pas de fichier `cpu.max` dans `web`. La racine a `cpu` dans `cgroup.controllers`. Que manque-t-il ?',
			options: [
				'`cpu` dans `/sys/fs/cgroup/app/cgroup.subtree_control`, et dans celui de la racine',
				'Un processus dans `web/cgroup.procs`, car les fichiers apparaissent avec le premier PID',
				'Un redémarrage, car les contrôleurs sont liés aux cgroups au boot',
				'`cpu.max` doit être créé à la main avec `touch` avant d’être écrit'
			],
			answer: 0,
			why: 'Activer un contrôleur dans le `cgroup.subtree_control` d’un cgroup crée ses fichiers dans les enfants. `app` doit activer `cpu` pour `web`, et la racine doit d’abord l’activer pour `app` : c’est la contrainte du haut vers le bas.'
		},
		{
			q: 'Docker lance un conteneur avec `--cpus 2`. Que contient son `cpu.max` ?',
			options: [
				'`2 100000`',
				'`max 100000`',
				'`100000 200000`',
				'`200000 100000`'
			],
			answer: 3,
			why: '`cpu.max` donne le quota puis la période, en microsecondes. `--cpus 2` avec la période par défaut de 100000 µs donne un quota de 200000 µs : 200 ms de CPU par 100 ms, ce qui demande deux CPU occupés pendant toute la période.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Lire les limites que Docker écrit dans le cgroup d’un conteneur, voir la limite mémoire tuer un processus, et obtenir les mêmes fichiers avec systemd sans root.',
		steps: [
			'Note ce que tu attends dans `cpu.max` et `memory.max`, puis lance le conteneur : `docker run -d --name cg-lab --cpus 1.5 --memory 512m busybox sleep 600`.',
			'Trouve son cgroup et lis-le : `P=$(docker inspect -f \'{{.State.Pid}}\' cg-lab); cat /proc/$P/cgroup; CG=/sys/fs/cgroup$(cut -d: -f3 /proc/$P/cgroup); cat $CG/cpu.max $CG/memory.max $CG/cgroup.procs`.',
			'Lance un deuxième processus dans le conteneur et relis `cgroup.procs` : `docker exec -d cg-lab sleep 500; cat $CG/cgroup.procs`.',
			'Dépasse une limite mémoire : `docker run --name cg-oom --memory 64m python:3.12-alpine python -c \'x = bytearray(200 * 1024 * 1024)\'; echo "exit $?"`, puis `docker inspect -f \'{{.State.OOMKilled}}\' cg-oom`.',
			'Demande les mêmes limites à systemd dans ta session : `systemd-run --user --scope -p MemoryMax=64M -p CPUQuota=50% sh -c \'CG=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup); echo $CG; cat $CG/cpu.max $CG/memory.max\'`.',
			'Fais le ménage : `docker rm -f cg-lab cg-oom`.'
		],
		done: [
			'L’étape 2 affiche `0::/system.slice/docker-<id>.scope`, puis `150000 100000`, `536870912` et un PID.',
			'L’étape 3 liste deux PID dans `cgroup.procs`.',
			'L’étape 4 affiche `exit 137`, et `docker inspect` affiche `true`.',
			'L’étape 5 affiche un chemin qui finit par `run-<aléatoire>.scope`, puis `50000 100000` et `67108864`.'
		],
		solution: [
			'`--cpus 1.5` donne un quota de 150000 µs par période de 100000 µs, et `512m` fait 512 × 1024 × 1024 octets. Le noyau applique les deux à partir de ces fichiers.',
			'`docker exec` met le nouveau processus dans le cgroup du conteneur : les limites le couvrent aussi, comme tout enfant que forke le conteneur.',
			'Python a demandé 200 Mio dans un groupe de 64 Mio. L’OOM killer s’est lancé dans le cgroup et l’a tué : code de sortie 137.',
			'`CPUQuota=50%` est devenu `50000 100000` et `MemoryMax=64M` est devenu `67108864`. Un drop-in de `myapp.service` avec `CPUQuota=150%` et `MemoryMax=512M` écrit les mêmes fichiers sous `system.slice`.'
		]
	},
	recall: {
		q: 'Où `docker run --cpus 0.5 --memory 256m` range-t-il ses limites, et quelles valeurs contiennent les fichiers ?',
		a: 'Dans le dossier du cgroup du conteneur, ici `/sys/fs/cgroup/system.slice/docker-<id>.scope` : `cpu.max` contient `50000 100000` et `memory.max` contient `268435456`. Le noyau applique les deux à chaque processus du cgroup.'
	},
	sources: [
		{ title: 'Doc du noyau Linux, Control Group v2', url: 'https://docs.kernel.org/admin-guide/cgroup-v2.html' },
		{ title: 'systemd.resource-control(5)', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html' },
		{ title: 'systemd-cgls(1)', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd-cgls.html' },
		{ title: 'Doc Docker, Resource constraints', url: 'https://docs.docker.com/engine/containers/resource_constraints/' },
		{ title: 'Source de opencontainers/cgroups, fs2/cpu.go', url: `${CG}/fs2/cpu.go` }
	]
};
