const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const CG2 = `${K}/Documentation/admin-guide/cgroup-v2.rst`;
const CGROUPS = 'https://github.com/opencontainers/cgroups/blob/30a2293c0b0325280ea70a86fe991ec1e87b5d00';
const ISSUE = 'https://github.com/argoproj/argo-helm/issues/3895';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'memory-cgroups',
	part: 'La mémoire',
	title: 'Les limites mémoire des conteneurs',
	minutes: 10,
	hook: [
		'Le chart Helm d’Argo CD démarre Dex avec un init container qui lance `cp -n /usr/local/bin/argocd /shared/argocd-dex`. Le binaire pèse 219 MB. L’init container a la limite mémoire par défaut du chart : 64Mi.',
		'Dans l’[issue argo-helm 3895](' + ISSUE + '), l’init container se termine avec `exitCode: 137` et `reason: OOMKilled`. Au nouvel essai, `cp -n` trouve le fichier à moitié écrit, ne le copie pas et sort avec 0. Dex lance alors le binaire tronqué et meurt avec le code 139 : **plus de 1100 redémarrages en 4 jours**.',
		'`cp` n’avait pas de buffer de 219 MB. Selon l’auteur, "the page cache of the 219 MB `argocd` binary copy is accounted against the cgroup\'s `memory.max`" : le cache de pages de la copie est compté dans la limite du cgroup. Le correctif fusionné en septembre 2026 remplace `cp -n` par `cp -f`, pour que le nouvel essai réécrive le fichier.'
	],
	terms: [
		{ term: 'memory.max', def: 'La limite dure du cgroup v2, en octets. Quand l’usage du cgroup l’atteint et que la récupération ne le fait pas baisser, le noyau lance l’OOM killer dans ce cgroup.' },
		{ term: 'memory.high', def: 'La limite de freinage du cgroup v2. Au-dessus, les processus du cgroup sont ralentis et doivent récupérer de la mémoire, mais l’OOM killer ne se déclenche jamais à cause d’elle.' },
		{ term: 'memory.current', def: 'Ce que le cgroup utilise en ce moment : mémoire anonyme, cache de pages y compris `tmpfs`, et mémoire noyau comme les dentries, les inodes et les buffers de sockets.' },
		{ term: 'memory.events', def: 'Les compteurs du cgroup : `high` et `max` comptent les passages sur chaque limite, `oom` les allocations sur le point d’échouer, `oom_kill` les processus tués.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['spec["Spec du pod : limits.memory: 64Mi"] --> runc["runc écrit 67108864 dans memory.max"]'],
				highlight: ['spec', 'runc'],
				note: 'Le kubelet transmet la limite mémoire du conteneur au runtime de conteneurs, et runc l’écrit en octets dans le `memory.max` du cgroup du conteneur. 64Mi font 67 108 864 octets. Sans limite, le fichier garde sa valeur par défaut, `max`.'
			},
			{
				add: ['runc --> charge["Chaque page créée par le conteneur lui est comptée : anon, cache de pages, tmpfs"]'],
				highlight: ['charge'],
				note: 'La doc cgroup v2 liste ce qui compte : "page cache and anonymous memory", les structures du noyau "such as dentries and inodes", et les buffers de sockets TCP. Une page de fichier est comptée au cgroup qui l’a lue ou écrite en premier. Les fichiers en `tmpfs`, comme un emptyDir `medium: Memory`, comptent comme cache de pages.'
			},
			{
				add: ['charge --> full["memory.current atteint memory.max"]', 'full --> reclaim["Récupération dans le cgroup : jeter les pages propres, écrire d’abord les sales"]'],
				highlight: ['full', 'reclaim'],
				note: 'Le noyau ne tue encore rien : il récupère des pages dans ce cgroup seulement. Il jette tout de suite les pages de fichiers propres, et écrit les pages sales sur le disque avant de les jeter. Le champ `max` de `memory.events` compte chaque fois que l’usage allait dépasser la limite.'
			},
			{
				add: ['reclaim -->|"plus rien à libérer : anon ou tmpfs, pas de swap"| oom["Memory cgroup out of memory: Killed process"]'],
				highlight: ['oom'],
				note: 'Les pages anonymes et les pages `tmpfs` n’ont aucun fichier sur disque où retourner. Avec `memory.swap.max` à 0, elles ne peuvent pas quitter la RAM. Quand la récupération ne libère rien, l’OOM killer choisit une victime parmi les seuls processus de ce cgroup, et `oom_kill` augmente de 1.'
			},
			{
				add: ['oom --> code["SIGKILL : code de sortie 128 + 9 = 137, raison OOMKilled"]'],
				highlight: ['code'],
				note: 'La victime reçoit SIGKILL, le signal 9. Un shell rapporte un processus tué par le signal N avec 128 + N, donc 137. Le kubelet affiche le conteneur en `Terminated`, `Reason: OOMKilled`, `Exit Code: 137`.'
			}
		]
	},
	example: {
		title: 'opencontainers/cgroups fs2/memory.go : runc écrit les limites',
		repo: 'opencontainers/cgroups',
		url: `${CGROUPS}/fs2/memory.go#L35-L78`,
		lang: 'go',
		code: `func setMemory(dirPath string, r *cgroups.Resources) error {
	if !isMemorySet(r) {
		return nil
	}

	if err := CheckMemoryUsage(dirPath, r); err != nil {
		return err
	}

	swap, err := cgroups.ConvertMemorySwapToCgroupV2Value(r.MemorySwap, r.Memory)
	if err != nil {
		return err
	}
	swapStr := numToStr(swap)
	if swapStr == "" && swap == 0 && r.MemorySwap > 0 {
		// memory and memorySwap set to the same value -- disable swap
		swapStr = "0"
	}
	// never write empty string to \`memory.swap.max\`, it means set to 0.
	if swapStr != "" {
		if err := cgroups.WriteFile(dirPath, "memory.swap.max", swapStr); err != nil {
			// If swap is not enabled, silently ignore setting to max or disabling it.
			if !(errors.Is(err, os.ErrNotExist) && (swapStr == "max" || swapStr == "0")) { //nolint:staticcheck // Ignore "QF1001: could apply De Morgan's law".
				return err
			}
		}
	}

	if val := numToStr(r.Memory); val != "" {
		if err := cgroups.WriteFile(dirPath, "memory.max", val); err != nil {
			return err
		}
	}

	// cgroup.Resources.KernelMemory is ignored

	if val := numToStr(r.MemoryReservation); val != "" {
		if err := cgroups.WriteFile(dirPath, "memory.low", val); err != nil {
			return err
		}
	}

	return nil
}`,
		notes: [
			'runc exécute ce code cgroup v2 : le `go.mod` de runc demande `github.com/opencontainers/cgroups v0.1.0`, le commit lié ici. La ligne 30 écrit la limite mémoire du conteneur, en octets, dans `memory.max`.',
			'La ligne 10 convertit le réglage du swap. La spec OCI reprend cgroup v1, où la valeur de swap veut dire mémoire plus swap. [`ConvertMemorySwapToCgroupV2Value`](' + CGROUPS + '/utils.go#L447-L472) renvoie `memorySwap - memory` : une limite de 512 MB avec 1 GB de mémoire+swap donne 512 MB dans `memory.swap.max`.',
			'Lignes 15 à 17 : quand mémoire et mémoire+swap sont égales, la différence vaut 0 et le code écrit `"0"`, ce qui coupe le swap du conteneur. La ligne 19 dit pourquoi : une chaîne vide écrite dans ce fichier veut aussi dire 0.',
			'La ligne 38 écrit la réservation mémoire dans `memory.low`, une protection douce contre la récupération. Rien dans cette fonction n’écrit `memory.high`.'
		]
	},
	tradeoff: {
		gain: [
			'Un conteneur limité à 64Mi ne peut pas prendre la RAM du nœud. La doc cgroup v2 : si l’OOM killer tourne dans un cgroup, "it\'s not going to kill any tasks outside of this cgroup".',
			'Le cache de pages compte dans la limite du conteneur lui-même : un conteneur qui lit 2 GB de logs garde au plus sa limite en RAM.'
		],
		cost: [
			'`memory.current` inclut le cache de pages : un conteneur qui lit beaucoup de fichiers affiche près de 100 % de sa limite alors qu’il va bien.',
			'Les fichiers d’un emptyDir `medium: Memory` comptent dans la limite du pod. Écrire 100 MB en `tmpfs` sous une limite de 50 MB fait tuer le processus qui écrit.',
			'La victime reçoit SIGKILL en plein travail. Un fichier à moitié écrit reste sur le disque, comme dans l’introduction, où le nouvel essai a gardé le binaire tronqué.'
		]
	},
	task: {
		prompt: 'Sur une machine systemd en cgroup v2, lance deux écritures sous une limite de 50 MB sans swap : `systemd-run --user --scope -p MemoryMax=50M -p MemorySwapMax=0 sh -c \'head -c 200M /dev/zero > ~/big.bin; cat /sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup)/memory.events\'`, puis la même avec `/dev/shm/big.bin` et 100M. Pourquoi l’une passe et pas l’autre ?',
		hint: 'Ton répertoire personnel est sur un disque, `/dev/shm` est un `tmpfs`. Quelles pages la récupération peut-elle libérer ?',
		answer: [
			'Sortie capturée pendant cette session sur un noyau 6.17. L’écriture de 200 MB sur disque sort avec 0, et `memory.events` affiche `max 955` et `oom_kill 0`. La même exécution a aussi lu `memory.stat` : `file 49397760`, et `memory.peak` : `52428800`.',
			'Les pages du fichier ont été comptées au cgroup jusqu’à la limite de 50 MB. À chaque passage sur la limite, la récupération a écrit des pages sur le disque puis les a jetées : 955 fois, et la copie s’est terminée.',
			'L’écriture de 100 MB dans `/dev/shm` affiche `Killed` avec le statut 137, et le fichier s’arrête à 49,2 MB. systemd écrit "A process of this unit has been killed by the OOM killer".',
			'Les pages `tmpfs` n’ont pas de fichier sur disque derrière elles, et `MemorySwapMax=0` interdit le swap. La récupération n’a rien libéré, donc l’OOM killer a tourné dans le cgroup.'
		]
	},
	quiz: [
		{
			q: 'Un conteneur limité à 512Mi a 300 MB de tas et lit 2 GB de fichiers de logs sur disque. `memory.current` reste à 512Mi. Que se passe-t-il ensuite ?',
			options: [
				'L’OOM killer tue le conteneur dès qu’il atteint 512Mi',
				'La récupération jette des pages propres ; le conteneur tourne et `max` monte dans `memory.events`',
				'Le noyau laisse le conteneur dépasser sa limite, car le cache de pages ne compte pas',
				'Le noyau déplace le cache de pages vers l’hôte et ne le compte à aucun cgroup'
			],
			answer: 1,
			why: 'Le cache de pages est compté au cgroup, donc l’usage atteint la limite. La récupération peut jeter les pages de fichiers propres : les 300 MB de tas tiennent et aucun OOM n’a lieu. Chaque passage sur la limite ajoute 1 à `max` dans `memory.events`.'
		},
		{
			q: 'Lequel de ces éléments compte dans le `memory.max` d’un pod ?',
			options: [
				'Les fichiers que le pod écrit dans un emptyDir `medium: Memory`',
				'La place des couches de l’image du pod sur le registre',
				'La mémoire du kubelet lui-même sur ce nœud',
				'Le cache de pages de fichiers que d’autres pods ont lus en premier'
			],
			answer: 0,
			why: 'Un emptyDir `medium: Memory` est un `tmpfs`, et le compteur `file` du cgroup v2 inclut "tmpfs and shared memory". Une page est comptée au cgroup qui l’a créée : les pages qu’un autre pod a lues en premier restent à sa charge.'
		},
		{
			q: 'Tu règles `memory.high` à 400M et `memory.max` à 500M. Le processus monte à 450M. Que se passe-t-il ?',
			options: [
				'L’OOM killer tue le processus tout de suite, puisque 450M dépasse 400M',
				'Rien ne se passe tant que le processus n’atteint pas 500M',
				'Ses nouvelles allocations échouent avec ENOMEM jusqu’à ce que l’usage baisse',
				'Il est ralenti et doit récupérer de la mémoire, sans OOM kill'
			],
			answer: 3,
			why: 'La doc cgroup v2 : au-dessus de la limite haute, "the processes of the cgroup are throttled and put under heavy reclaim pressure", et "Going over the high limit never invokes the OOM killer". Seul `memory.max` mène à un OOM kill.'
		}
	],
	recall: {
		q: 'Que compte le `memory.current` d’un conteneur, et quand l’arrivée à `memory.max` finit-elle en code de sortie 137 ?',
		a: 'La mémoire anonyme, le cache de pages y compris `tmpfs`, et la mémoire noyau. Atteindre `memory.max` lance d’abord la récupération. L’OOM killer n’envoie SIGKILL que si elle ne libère rien (pages anon ou `tmpfs`, pas de swap) : 128 + 9 = 137.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/admin-guide/cgroup-v2.rst (Memory)', url: CG2 },
		{ title: 'opencontainers/cgroups v0.1.0, fs2/memory.go', url: `${CGROUPS}/fs2/memory.go` },
		{ title: 'Issue argo-helm 3895 : l’init container copyutil tué par l’OOM en cgroup v2', url: ISSUE },
		{ title: 'PR argo-helm 4105 : réécrire le binaire argocd-dex partiel', url: 'https://github.com/argoproj/argo-helm/pull/4105' },
		{ title: 'Documentation Kubernetes, Resource Management for Pods and Containers', url: 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/' },
		{ title: 'bash(1), man7.org (EXIT STATUS)', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' }
	]
};
