const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const MAIN = `${LINUX}/init/main.c`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'boot',
	part: 'Le système en marche',
	title: 'Le démarrage de Linux',
	minutes: 10,
	hook: [
		'Sur le portable qui a servi à tester ce chapitre, `systemd-analyze` affiche : `Startup finished in 9.346s (firmware) + 3.185s (loader) + 3.721s (kernel) + 19.993s (userspace) = 36.246s`. Plus de la moitié des 36 secondes part dans l’espace utilisateur, après que le noyau a lancé le PID 1.',
		'`systemd-analyze blame` met `NetworkManager-wait-online.service` en tête, à 10.778s. `systemd-analyze critical-chain` montre pourquoi ça compte : `docker.service` démarre à 13.897s, juste après `network-online.target`, et `graphical.target` est atteint à 19.880s, une fois docker prêt.',
		'Chaque chiffre correspond à une étape : le firmware, le chargeur de démarrage, le noyau avec son initramfs, puis systemd. **Chaque étape charge la suivante et lui passe la main.**'
	],
	terms: [
		{ term: 'Chargeur de démarrage', def: 'Le programme que lance le firmware, comme GRUB ou systemd-boot. Il charge le noyau et l’initramfs en mémoire et transmet la ligne de commande du noyau.' },
		{ term: 'initramfs', def: 'Une archive cpio compressée que le noyau décompresse en mémoire au démarrage. Son `/init` tourne en premier, trouve le vrai système de fichiers racine et le monte.' },
		{ term: 'PID 1', def: 'Le premier processus de l’espace utilisateur, lancé par le noyau. Sur le portable de test, c’est systemd, qui démarre ensuite chaque service.' },
		{ term: 'Target', def: 'Une unité systemd qui regroupe d’autres unités et marque une étape du démarrage, comme `multi-user.target` ou `network-online.target`. systemd démarre jusqu’à `default.target`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['fw["Firmware (UEFI) : 9.346s"] --> loader["Chargeur depuis /boot/efi : 3.185s"]'],
				highlight: ['fw', 'loader'],
				note: 'bootup(7) : « Immediately after power-up, the system firmware will do minimal hardware initialization, and hand control over to a boot loader » (le firmware initialise le minimum puis passe la main au chargeur). Sur le portable de test, le chargeur vit sur la partition vfat de 263 MB montée sur `/boot/efi`. Le firmware est la deuxième étape la plus longue sur cette machine.'
			},
			{
				add: ['loader -->|"charge noyau + initramfs, passe la ligne de commande"| kern["Noyau : 3.721s"]'],
				highlight: ['kern'],
				note: 'bootup(7) : « It\'s the boot loader or the firmware that loads both the kernel and initrd/initramfs images into memory ». Sur le portable de test, `/proc/cmdline` commence par `BOOT_IMAGE=/boot/vmlinuz-6.17.0-1033-oem root=... ro quiet splash`. Le noyau lit `root=`, `init=` et `rdinit=` sur cette ligne.'
			},
			{
				add: ['kern --> initrd["initramfs décompressé dans rootfs, /init tourne en PID 1"]', 'initrd -->|"active LVM, monte root=, switch_root"| real["Vraie racine montée sur /"]'],
				highlight: ['initrd', 'real'],
				note: 'La doc du noyau : une fois l’archive décompressée, le noyau cherche un fichier nommé `init` dans rootfs, « and if so it executes it as PID 1 ». L’initramfs de 82,4 MB du portable de test contient `init` et `usr/sbin/lvm`, l’outil LVM qui peut activer le volume `data-root` qui porte `/`. La ligne de `systemd-analyze` n’a pas de partie `(initrd)`, contrairement à l’exemple de la doc, `19.176s (initrd)`.'
			},
			{
				add: ['real -->|"exec /sbin/init"| sysd["systemd en PID 1"]', 'sysd --> tgt["Unités tirées par default.target, lancées en parallèle"]'],
				highlight: ['sysd', 'tgt'],
				note: 'Sur le portable de test, `/sbin/init` mène à `/usr/lib/systemd/systemd`, et `ps -p 1` affiche `/sbin/init splash`. bootup(7) : systemd « will activate all units that are dependencies of default.target ». La doc ajoute que l’ordre « is not deterministic, but still adheres to a limited amount of ordering structure » (il n’est pas fixe, mais suit quelques règles d’ordre).'
			},
			{
				add: ['tgt --> wait["NetworkManager-wait-online : +10.778s"]', 'wait --> online["network-online.target @13.892s"]', 'online --> docker["docker.service @13.897s +5.983s"]', 'docker --> gfx["graphical.target @19.880s"]'],
				highlight: ['wait', 'docker', 'gfx'],
				note: 'Ces quatre lignes viennent de la sortie de `critical-chain`. Le `docker.service` de moby a `Wants=network-online.target` et `After=network-online.target`, donc il attend que le réseau soit prêt. La page systemd.io sur les targets réseau dit qu’un logiciel serveur « should generally not pull this in », parce qu’il peut accepter des connexions locales avant qu’une interface routable soit prête.'
			}
		]
	},
	example: {
		title: 'init/main.c : kernel_init choisit le programme à lancer en PID 1',
		repo: 'torvalds/linux',
		url: `${MAIN}#L1494-L1533`,
		lang: 'c',
		code: `	if (ramdisk_execute_command) {
		ret = run_init_process(ramdisk_execute_command);
		if (!ret)
			return 0;
		pr_err("Failed to execute %s (error %d)\n",
		       ramdisk_execute_command, ret);
	}

	/*
	 * We try each of these until one succeeds.
	 *
	 * The Bourne shell can be used instead of init if we are
	 * trying to recover a really broken machine.
	 */
	if (execute_command) {
		ret = run_init_process(execute_command);
		if (!ret)
			return 0;
		panic("Requested init %s failed (error %d).",
		      execute_command, ret);
	}

	if (CONFIG_DEFAULT_INIT[0] != '\0') {
		ret = run_init_process(CONFIG_DEFAULT_INIT);
		if (ret)
			pr_err("Default init %s failed (error %d)\n",
			       CONFIG_DEFAULT_INIT, ret);
		else
			return 0;
	}

	if (!try_to_run_init_process("/sbin/init") ||
	    !try_to_run_init_process("/etc/init") ||
	    !try_to_run_init_process("/bin/init") ||
	    !try_to_run_init_process("/bin/sh"))
		return 0;

	panic("No working init found.  Try passing init= option to kernel. "
	      "See Linux Documentation/admin-guide/init.rst for guidance.");
}`,
		notes: [
			'Les lignes 1 à 7 essaient d’abord l’initramfs. `ramdisk_execute_command` vaut `"/init"` en haut du fichier, et `rdinit=` sur la ligne de commande peut le changer. En cas d’échec, le noyau écrit juste une erreur et continue.',
			'Les lignes 15 à 21 traitent `init=`. Quand tu demandes un programme précis, le noyau panique s’il échoue : `Requested init %s failed`. La doc du noyau propose `init=/bin/sh`, ou `rdinit=/bin/sh` pour l’initramfs, pour obtenir un shell sur une machine cassée.',
			'Les lignes 32 à 36 essaient quatre chemins fixes dans l’ordre : `/sbin/init`, `/etc/init`, `/bin/init`, `/bin/sh`. Le commentaire des lignes 9 à 14 explique que le shell Bourne peut remplacer init « if we are trying to recover a really broken machine ».',
			'La ligne 38 est la panique que tu vois quand tout a échoué. Le guide du noyau qu’elle cite, [init.rst](' + LINUX + '/Documentation/admin-guide/init.rst), liste des causes comme « Unable to mount root FS » et « init binary doesn\'t exist on rootfs ».'
		]
	},
	tradeoff: {
		gain: [
			'L’initramfs peut apporter ce dont le noyau a besoin pour atteindre la racine (LVM, chiffrement de disque, pilotes de stockage), et l’image du noyau reste générique.',
			'systemd lance les unités en parallèle et n’ordonne que celles qui ont un `After=` : sur le portable de test, `graphical.target` est atteint 19,880 s après le début de l’espace utilisateur, et `blame` liste 146 unités démarrées.',
			'`systemd-analyze time`, `blame` et `critical-chain` montrent chaque étape et chaque unité lente, sans outil en plus.'
		],
		cost: [
			'Une seule unité qui attend le réseau peut retenir tout le démarrage : ici, `NetworkManager-wait-online.service` a pris 10,778 s et `docker.service` l’a attendue.',
			'systemd-analyze(1) prévient que `blame` « might be misleading as the initialization of one service might be slow simply because it waits for the initialization of another service to complete ».',
			'L’étape du firmware (9,346 s sur le portable de test) tourne avant le noyau, donc aucun paramètre du noyau ni fichier d’unité ne la change.'
		]
	},
	task: {
		prompt: 'Lance `systemd-analyze`, `systemd-analyze blame | head` et `systemd-analyze critical-chain` sur une machine Linux. Dis quelle étape prend le plus de temps, quelle unité est en tête de `blame`, et si cette unité est sur la chaîne critique. Compare ensuite avec le portable de test : en tête de blame `NetworkManager-wait-online.service` à 10.778s, chaîne `NetworkManager-wait-online.service @3.112s +10.778s`, puis `network-online.target @13.892s`, puis `docker.service @13.897s +5.983s`.',
		hint: 'Dans `critical-chain`, `@` donne le moment où l’unité est devenue active, `+` le temps qu’elle a mis à démarrer. Une unité de `blame` absente de la chaîne a tourné en parallèle de quelque chose de plus lent.',
		answer: [
			'Sur le portable de test, l’espace utilisateur est l’étape la plus longue : 19,993 s sur 36,246 s. Le firmware suit avec 9,346 s.',
			'`NetworkManager-wait-online.service` a démarré à 3,112 s et a pris 10,778 s, donc `network-online.target` est atteint à 3,112 + 10,778 = 13,890 s (affiché 13,892 s). docker démarre 5 ms plus tard et prend 5,983 s, ce qui mène la chaîne à 19,880 s.',
			'Les deux unités sont sur la chaîne, donc elles fixent la durée du démarrage. Si docker n’attendait pas `network-online.target`, les 10,778 s d’attente sortiraient de cette chaîne. Un nouveau `critical-chain` après redémarrage montrerait quel chemin est alors le plus lent.',
			'Une unité en tête de `blame` mais absente de la chaîne, comme `snapd.seeded.service` à 916 ms ici, a tourné en parallèle. L’accélérer ne changerait pas le moment où `graphical.target` est atteint.'
		]
	},
	quiz: [
		{
			q: 'Qui charge l’image initramfs en mémoire ?',
			options: [
				'Le noyau, qui la lit dans /boot après avoir monté la racine',
				'Le chargeur de démarrage ou le firmware, avec l’image du noyau',
				'systemd, comme première unité avant local-fs.target',
				'Le programme /init, qui se décompresse lui-même depuis le disque'
			],
			answer: 1,
			why: 'bootup(7) : « It\'s the boot loader or the firmware that loads both the kernel and initrd/initramfs images into memory, but the kernel which interprets it as a file system. » Le noyau ne peut pas encore monter la racine, et c’est pour ça que l’initramfs existe.'
		},
		{
			q: 'Un serveur s’arrête sur `Kernel panic: No working init found`. Sans `init=` sur la ligne de commande, qu’a essayé le noyau avant cette panique ?',
			options: [
				'Seulement /sbin/init sur la racine',
				'/init, puis /sbin/init, /etc/init, /bin/init, /bin/sh',
				'systemd depuis l’initramfs, puis un shell de secours de GRUB',
				'/bin/sh d’abord, puis /sbin/init en secours'
			],
			answer: 1,
			why: '`kernel_init` lance d’abord `ramdisk_execute_command` (`/init`), puis essaie les quatre chemins fixes dans l’ordre, et ne panique que quand tous ont échoué.'
		},
		{
			q: '`systemd-analyze blame` montre `snapd.seeded.service` à 916 ms, mais il n’apparaît pas dans `critical-chain`. Quel effet sur la durée du démarrage si tu le fais démarrer en 100 ms ?',
			options: [
				'Elle baisse d’environ 816 ms, le temps gagné',
				'Elle baisse de 916 ms, car l’unité ne compte plus',
				'Elle change à peine, car l’unité tournait en parallèle',
				'Elle augmente, car d’autres unités démarrent plus tôt et se gênent'
			],
			answer: 2,
			why: 'systemd lance les unités en parallèle. Seules les unités de la chaîne critique décident du moment où la target par défaut est atteinte, et celle-ci n’en fait pas partie.'
		}
	],
	recall: {
		q: 'Cite les étapes d’un démarrage Linux dans l’ordre, et le premier programme que le noyau lance en PID 1.',
		a: 'Firmware, chargeur de démarrage, noyau, initramfs, puis systemd depuis la vraie racine. Le premier PID 1 est `/init` dans l’initramfs, qui monte la racine puis exécute `/sbin/init` (systemd).'
	},
	sources: [
		{ title: 'bootup(7), manuel systemd', url: `${MAN}/bootup.html` },
		{ title: 'systemd-analyze(1), manuel systemd', url: `${MAN}/systemd-analyze.html` },
		{ title: 'Linux v6.12, Documentation/filesystems/ramfs-rootfs-initramfs.rst', url: `${LINUX}/Documentation/filesystems/ramfs-rootfs-initramfs.rst` },
		{ title: 'Linux v6.12, Documentation/admin-guide/init.rst', url: `${LINUX}/Documentation/admin-guide/init.rst` },
		{ title: 'systemd.io, Running Services After the Network Is Up', url: 'https://systemd.io/NETWORK_ONLINE/' },
		{ title: 'moby, contrib/init/systemd/docker.service', url: 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/contrib/init/systemd/docker.service' }
	]
};
