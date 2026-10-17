const K = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const KUBE = 'https://github.com/kubernetes/kubernetes/blob/f28b4c9efbca5c5c0af716d9f2d5702667ee8a45';
const KRCL = `${KUBE}/pkg/kubelet/kuberuntime/kuberuntime_container_linux.go`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'swap',
	part: 'La mémoire',
	title: 'Le swap',
	minutes: 10,
	hook: [
		'Tu ajoutes un nœud à un cluster Kubernetes. Le kubelet s’arrête aussitôt avec `running with swap on is not supported, please disable swap or set --fail-swap-on flag to false`. Au démarrage, il a lu `/proc/swaps` et y a trouvé une partition de swap.',
		'Le kubelet refuse le swap par défaut depuis un [commit de juillet 2017](https://github.com/kubernetes/kubernetes/commit/71e8c8eba43a0fade6e4edfc739b331ba3cc658a) qui a ajouté `--fail-swap-on=true`. L’issue « Kubelet/Kubernetes should work with Swap Enabled » a reçu 238 pouces levés et 122 commentaires entre octobre 2017 et juillet 2021.',
		'Le document de conception du swap donne la raison : "it is difficult to provide guarantees and account for pod memory utilization when swap is involved" (difficile de garantir et de compter la mémoire des pods avec du swap). La fonctionnalité `NodeSwap` est arrivée en alpha en 1.22 et en GA en **1.34, où le kubelet refuse toujours le swap sans `failSwapOn: false`**.'
	],
	terms: [
		{ term: 'Page anonyme', def: 'Une page de mémoire sans fichier derrière elle : le tas, la pile, ou un `mmap` avec `MAP_ANONYMOUS`. Le noyau ne peut la libérer qu’en l’écrivant dans le swap.' },
		{ term: 'Swap', def: 'Une partition ou un fichier où le noyau écrit des pages anonymes pour libérer de la RAM. `swapon --show` les liste, et `/proc/meminfo` affiche `SwapTotal` et `SwapFree`.' },
		{ term: 'vm.swappiness', def: 'Un sysctl de 0 à 200, 60 par défaut, qui indique à la récupération de mémoire le coût des E/S de swap par rapport à la relecture des pages de fichiers.' },
		{ term: 'memory.swap.max', def: 'Le fichier cgroup v2 qui plafonne le swap d’un cgroup. À 0, les pages anonymes du cgroup ne partent jamais dans le swap.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['write["Un processus écrit dans son tas"] --> anon["Le noyau lui donne une nouvelle page anonyme, marquée sale"]'],
				highlight: ['write', 'anon'],
				note: 'La doc du noyau : "When the program performs a write, a regular physical page will be allocated to hold the written data." Aucun fichier ne garde de copie de cette page. Si le noyau veut récupérer cette RAM, la page doit partir dans le swap.'
			},
			{
				add: ['anon --> low["Les pages libres passent sous le low watermark"]', 'low --> kswapd["kswapd parcourt les pages à récupérer"]'],
				highlight: ['low', 'kswapd'],
				note: 'Quand la mémoire libre passe sous le low watermark, une allocation réveille le thread noyau `kswapd`. Il libère des pages en arrière-plan. Sous le min watermark, le processus qui alloue fait lui-même la récupération et attend : on parle de direct reclaim.'
			},
			{
				add: ['kswapd -->|"page de fichier"| drop["Cache de pages propre : jeté, relu depuis le fichier plus tard"]', 'kswapd -->|"page anonyme"| swapout["Écrite dans le swap, so monte dans vmstat"]'],
				highlight: ['drop', 'swapout'],
				note: 'La récupération a deux sortes de pages à prendre. `vm.swappiness` règle l’équilibre : à 100, le noyau traite les E/S de swap et de fichiers à égalité, sous 100 il préfère jeter du cache de pages. La valeur par défaut est 60.'
			},
			{
				add: ['swapout --> touch["Le processus relit cette adresse"]', 'touch --> swapin["Défaut majeur : page relue depuis le swap, si monte dans vmstat"]'],
				highlight: ['touch', 'swapin'],
				note: 'La page n’est plus en RAM, l’accès provoque donc un défaut de page. Le noyau recharge la page depuis le périphérique de swap pendant que le processus attend. `/proc/<pid>/stat` le compte dans `majflt`, "major faults ... which have required loading a memory page from disk".'
			},
			{
				add: ['swapin --> kube["Kubernetes LimitedSwap : le kubelet écrit memory.swap.max par conteneur"]'],
				highlight: ['kube'],
				note: 'Avec `failSwapOn: false` et `swapBehavior: LimitedSwap`, le kubelet ne donne du swap qu’aux conteneurs des pods Burstable. Il écrit la part du conteneur dans `memory.swap.max`. Tous les autres conteneurs reçoivent 0. Le comportement par défaut, `NoSwap`, donne 0 à tous.'
			}
		]
	},
	example: {
		title: 'kubelet kuberuntime_container_linux.go : la limite de swap d’un conteneur',
		repo: 'kubernetes/kubernetes',
		url: `${KRCL}#L499-L527`,
		lang: 'go',
		code: `func (m swapConfigurationHelper) configureSwap(ctx context.Context, lcr *runtimeapi.LinuxContainerResources, swapMemory int64) {
	logger := klog.FromContext(ctx)
	if !isCgroup2UnifiedMode() {
		logger.Error(fmt.Errorf("swap configuration is not supported with cgroup v1"), "Swap configuration under cgroup v1 is unexpected")
		return
	}

	if lcr.Unified == nil {
		lcr.Unified = map[string]string{}
	}

	lcr.Unified[cm.Cgroup2MaxSwapFilename] = fmt.Sprintf("%d", swapMemory)
}

// The swap limit is calculated as (<containerMemoryRequest>/<nodeTotalMemory>)*<totalPodsSwapAvailable>.
// For more info, please look at the following KEP: https://kep.k8s.io/2400
func calcSwapForBurstablePods(containerMemoryRequest, nodeTotalMemory, totalPodsSwapAvailable int64) (int64, error) {
	if nodeTotalMemory <= 0 {
		return 0, fmt.Errorf("total node memory is 0")
	}
	if containerMemoryRequest > nodeTotalMemory {
		return 0, fmt.Errorf("container request %d is larger than total node memory %d", containerMemoryRequest, nodeTotalMemory)
	}

	containerMemoryProportion := float64(containerMemoryRequest) / float64(nodeTotalMemory)
	swapAllocation := containerMemoryProportion * float64(totalPodsSwapAvailable)

	return int64(swapAllocation), nil
}`,
		notes: [
			'La ligne 12 range la limite dans la map `Unified` sous la clé `Cgroup2MaxSwapFilename`, qui vaut `"memory.swap.max"`. Le runtime de conteneurs écrit cette valeur dans le cgroup du conteneur. Les lignes 3 à 5 journalisent une erreur et s’arrêtent en cgroup v1.',
			'Les lignes 25 et 26 calculent la part : la requête mémoire divisée par la RAM du nœud, fois le swap. Sur un nœud avec 40 GB de RAM et 40 GB de swap, un conteneur qui demande 10 GB reçoit 10 GB de swap.',
			'L’appelant, [`ConfigureLimitedSwap`](' + KRCL + '#L472-L483), passe tout le `SwapCapacity` de la machine comme `totalPodsSwapAvailable`. Quand le calcul renvoie une erreur, il appelle `ConfigureNoSwap`, qui écrit 0.',
			'Le choix des conteneurs se fait dans [`GetContainerSwapBehavior`](' + KRCL + '#L223-L248) : seulement les pods Burstable, jamais les pods critiques, jamais un conteneur dont la requête mémoire égale la limite. Ceux-là reçoivent `NoSwap`, et la ligne 12 écrit 0.'
		]
	},
	tradeoff: {
		gain: [
			'Les pages anonymes qu’un programme a écrites au démarrage et ne relit jamais peuvent quitter la RAM. Cette RAM revient au cache de pages ou aux autres processus.',
			'Un pic court au-dessus de la RAM peut tenir dans le swap au lieu de finir chez l’OOM killer. La doc Kubernetes le cite : le swap "helps prevent Pods from being terminated during memory pressure spikes".'
		],
		cost: [
			'Une page relue depuis le swap coûte une lecture disque au milieu d’une requête. La doc Kubernetes : la relecture est "sometimes slower by many orders of magnitude".',
			'Le scheduler Kubernetes place les pods selon leurs requêtes mémoire et ne compte pas le swap : deux pods qui swappent beaucoup peuvent tomber sur le même nœud.',
			'Des secrets dans des volumes `tmpfs` pourraient finir sur le disque. Le kubelet les monte avec l’option `noswap` quand le noyau la connaît, à partir de 6.3.'
		]
	},
	task: {
		prompt: 'Sur une machine Linux, lance `swapon --show`, `cat /proc/sys/vm/swappiness` puis `vmstat 1 3`. La machine manque-t-elle de mémoire ? Appuie-toi sur les colonnes `swpd`, `si` et `so`.',
		hint: '`swpd` est la quantité stockée dans le swap en ce moment. `si` et `so` sont les quantités qui entrent et sortent chaque seconde. Ignore la première ligne de `vmstat` : c’est une moyenne depuis le démarrage.',
		answer: [
			'Sortie capturée pendant cette session sur un portable de 27 GiB : `swapon` affiche `/dev/dm-2 partition 3.8G 2.3G`, la swappiness vaut `60`, et `vmstat` montre `swpd` vers 2 452 988 kB avec `free` vers 3,3 GB et `cache` vers 15 GB.',
			'Les deux lignes après la première montrent `si` à 4 puis 0, et `so` à 0 et 0. Les 2,3 GB du swap restent sur place et personne ne les relit.',
			'La machine ne manque pas de mémoire. Le noyau a mis dans le swap des pages que personne n’utilisait et a gardé 15 GB de cache de pages en RAM. Un vrai problème, c’est `si` et `so` à plusieurs milliers sur chaque ligne, avec des processus bloqués sur des défauts majeurs.'
		]
	},
	quiz: [
		{
			q: '`vm.swappiness` vaut 0 sur un serveur. Que fait le noyau ?',
			options: [
				'Il ne swappe jamais, comme si tous les swaps étaient désactivés',
				'Il swappe quand pages libres et de fichiers passent sous le high watermark',
				'Il envoie chaque page anonyme dans le swap dès son écriture',
				'Il ne swappe que les processus dont `oom_score_adj` dépasse 0'
			],
			answer: 1,
			why: 'La doc des sysctls vm : "At 0, the kernel will not initiate swap until the amount of free and file-backed pages is less than the high watermark in a zone." Le swap reste utilisable. Seul `swapoff`, ou l’absence de swap, le coupe.'
		},
		{
			q: '`vmstat 1` affiche `swpd` à 3 GB, et `si` et `so` restent à 0 pendant une minute. Qu’est-ce que ça veut dire ?',
			options: [
				'La machine s’écroule sous le swap et il faut plus de RAM tout de suite',
				'Le périphérique de swap est en panne, les compteurs ne bougent plus',
				'3 GB de pages dorment dans le swap et personne ne les lit ni ne les écrit',
				'Le noyau va lancer l’OOM killer dans quelques secondes'
			],
			answer: 2,
			why: '`swpd` est la quantité stockée dans le swap. `si` et `so` sont les quantités déplacées chaque seconde. Des pages qui dorment dans le swap ne coûtent aucune E/S. La lenteur vient de pages qui entrent et sortent sans arrêt.'
		},
		{
			q: 'Un nœud tourne avec `swapBehavior: LimitedSwap`. Le conteneur d’un pod a une requête et une limite mémoire de 4Gi. Combien de swap peut-il utiliser ?',
			options: [
				'4Gi, autant que sa limite mémoire',
				'Sa requête divisée par la RAM du nœud, fois le swap du nœud',
				'Tout le swap libre du nœud',
				'Aucun : le kubelet écrit 0 dans son `memory.swap.max`'
			],
			answer: 3,
			why: '`GetContainerSwapBehavior` renvoie `NoSwap` quand la requête mémoire égale la limite. `configureSwap` écrit alors 0 comme `memory.swap.max`, et le noyau ne sort jamais les pages anonymes de ce conteneur vers le swap.'
		}
	],
	recall: {
		q: 'Quelles pages ont besoin du swap pour être libérées, et quels compteurs de `vmstat` montrent que le swap fait mal ?',
		a: 'Les pages anonymes : tas, pile, `mmap` anonyme. Le cache de pages se jette sans swap. `si` et `so` qui bougent à chaque ligne font mal ; un gros `swpd` avec `si` et `so` à 0, ce sont des pages rangées dans le swap.'
	},
	sources: [
		{ title: 'Linux v6.12, Documentation/admin-guide/sysctl/vm.rst (swappiness)', url: `${K}/Documentation/admin-guide/sysctl/vm.rst` },
		{ title: 'Linux v6.12, Documentation/admin-guide/mm/concepts.rst (mémoire anonyme, récupération)', url: `${K}/Documentation/admin-guide/mm/concepts.rst` },
		{ title: 'Documentation Kubernetes, Swap memory management', url: 'https://kubernetes.io/docs/concepts/cluster-administration/swap-memory-management/' },
		{ title: 'KEP-2400, Node system swap support', url: 'https://github.com/kubernetes/enhancements/blob/6ebe0a94771723b3f27cb4a757f0cc22f29e38a2/keps/sig-node/2400-node-swap/README.md' },
		{ title: 'Issue kubernetes/kubernetes 53533 : Kubelet/Kubernetes should work with Swap Enabled', url: 'https://github.com/kubernetes/kubernetes/issues/53533' },
		{ title: 'Kubernetes v1.34.0, historique du feature gate NodeSwap', url: `${KUBE}/pkg/features/kube_features.go#L1511-L1516` },
		{ title: 'vmstat(8), man7.org', url: 'https://man7.org/linux/man-pages/man8/vmstat.8.html' }
	]
};
