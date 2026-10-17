const E2FS = 'https://github.com/tytso/e2fsprogs/blob/8fd79523d051d5ea881237f27eb1c664486e0078';
const ONLINE = `${E2FS}/resize/online.c`;
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'block-devices',
	part: 'Fichiers et disques',
	title: 'Disques, partitions et LVM',
	minutes: 10,
	hook: [
		'Sur le portable qui a servi à tester ce chapitre, `df -h /` montre un système de fichiers de 934G sur `/dev/mapper/data-root`. `lsblk` montre ce qu’il y a dessous : le disque `nvme0n1` (953.9G), sa partition `nvme0n1p2` (953.6G, type `LVM2_member`), et le volume logique `data-root` (949.8G, `ext4`, monté sur `/`).',
		'Chaque couche a sa propre taille. Pour donner plus de place à `/`, tu les agrandis de bas en haut : la partition, puis le volume physique LVM, puis le volume logique, puis le système de fichiers. resize2fs(8) précise qu’il « does not manipulate the size of partitions » (il ne touche pas aux partitions).',
		'Si tu agrandis un disque cloud et que tu t’arrêtes là, `lsblk` montre le disque plus grand et **`df` montre toujours l’ancienne taille**, parce que la partition, le PV, le LV et le système de fichiers ont gardé la leur.'
	],
	terms: [
		{ term: 'Partition', def: 'Une plage de secteurs d’un disque, inscrite dans la table de partitions. Le noyau montre chacune comme un périphérique bloc à part, comme `nvme0n1p2`.' },
		{ term: 'Volume physique (PV)', def: 'Un disque ou une partition géré par LVM, préparé avec `pvcreate`. `lsblk` affiche son type comme `LVM2_member`.' },
		{ term: 'Groupe de volumes (VG)', def: 'lvm(8) : « a collection of one or more physical devices, each called a Physical Volume (PV) ». Sa place sert de réserve pour les volumes logiques.' },
		{ term: 'Volume logique (LV)', def: 'Un périphérique bloc découpé dans un groupe de volumes, comme `/dev/mapper/data-root`. Device Mapper, dans le noyau, place chacun de ses blocs sur un PV. Un système de fichiers s’y installe comme sur une partition.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['disk["nvme0n1 : disque, 953.9G"] --> p1["nvme0n1p1 : 263.1M vfat, /boot/efi"]', 'disk --> p2["nvme0n1p2 : 953.6G, LVM2_member"]'],
				highlight: ['disk', 'p1', 'p2'],
				note: 'Sur le portable de test, `lsblk -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS` affiche cet arbre. D’après lsblk(8), la commande « reads the sysfs filesystem and udev db to gather information », donc elle se passe de root. La table de partitions découpe le disque en une petite partition EFI et une grande partition pour LVM.'
			},
			{
				add: ['p2 --> vg["VG data : un seul PV"]', 'vg --> root["LV data-root : 949.8G"]', 'vg --> swap["LV data-swap : 3.8G"]'],
				highlight: ['vg', 'root', 'swap'],
				note: 'La partition est le seul PV d’un groupe de volumes nommé `data`, découpé en deux LV. lvm(8) : « Each block of data in an LV is stored on one or more PV in the VG, according to algorithms implemented by Device Mapper (DM) in the kernel. » lvm(8) demande aux scripts d’utiliser `/dev/data/root` plutôt que le nom sous `/dev/mapper`, dont le format « might change between releases ».'
			},
			{
				add: ['root --> fs["ext4 sur data-root : df affiche 934G"]'],
				highlight: ['fs'],
				note: '`lsblk -b` donne au LV 1 019 828 240 384 octets, et `df -B1` en donne 1 002 666 958 848 : 16 GB de moins. ext4 retire ses métadonnées de la taille que voit `df`. Avec la taille d’inode par défaut de 256 octets dans `/etc/mke2fs.conf`, les 62 251 008 inodes occupent 15,9 GB de tables d’inodes. `ext4_calculate_overhead` y ajoute le journal, les bitmaps et les descripteurs de groupe.'
			},
			{
				add: ['grow1["growpart /dev/nvme0n1 2"] --> grow2["pvresize /dev/nvme0n1p2"]', 'grow2 --> grow3["lvextend -r -l +100%FREE data/root"]'],
				highlight: ['grow1', 'grow2', 'grow3'],
				note: 'Après un agrandissement du disque, trois commandes font grandir la pile, une couche chacune. `growpart`, de cloud-utils, réécrit la table de partitions « so that the given partition takes up as much space as it can ». `pvresize` « resizes a PV », même avec des LV actifs dessus. `lvextend -l +100%FREE` donne au LV toute la place libre du VG, et `-r` agrandit le système de fichiers « together with the LV using fsadm(8) ».'
			},
			{
				add: ['grow3 --> online["resize2fs sur un ext4 monté : ioctl EXT4_IOC_RESIZE_FS"]', 'online --> done["df montre la nouvelle taille, sans démontage"]'],
				highlight: ['online', 'done'],
				note: 'resize2fs(8) : « If the file system is mounted, it can be used to expand the size of the mounted file system ». L’agrandissement marche pendant que `/` sert. La réduction non : resize2fs refuse avec « On-line shrinking not supported ». Pour XFS, xfs_growfs(8) dit « The filesystem must be mounted to be grown ».'
			}
		]
	},
	example: {
		title: 'e2fsprogs resize/online.c : resize2fs demande au noyau d’agrandir un ext4 monté',
		repo: 'tytso/e2fsprogs',
		url: `${ONLINE}#L86-L171`,
		lang: 'c',
		code: `	printf(_("Filesystem at %s is mounted on %s; "
		 "on-line resizing required\n"), fs->device_name, mtpt);

	if (*new_size < ext2fs_blocks_count(sb)) {
		com_err(program_name, 0, _("On-line shrinking not supported"));
		exit(1);
	}
…
	fd = open(mtpt, O_RDONLY);
	if (fd < 0) {
		com_err(program_name, errno,
			_("while trying to open mountpoint %s"), mtpt);
		exit(1);
	}

	if (no_resize_ioctl) {
		printf(_("Old resize interface requested.\n"));
	} else if (ioctl(fd, EXT4_IOC_RESIZE_FS, new_size)) {
		/*
		 * If kernel does not support EXT4_IOC_RESIZE_FS, use the
		 * old online resize. Note that the old approach does not
		 * handle >32 bit file systems
		 *
…
		 */
		if ((errno != ENOTTY) && (errno != EINVAL)) {
			if (errno == EPERM)
				com_err(program_name, 0,
				_("Permission denied to resize filesystem"));
			else
				com_err(program_name, errno,
				_("While checking for on-line resizing "
				  "support"));
			exit(1);
		}
	} else {
		close(fd);
		return 0;
	}`,
		notes: [
			'resize2fs appelle `online_resize_fs` quand il trouve le système de fichiers monté. Les lignes 1 et 2 affichent le message que tu vois dans le terminal : `Filesystem at /dev/mapper/data-root is mounted on /; on-line resizing required`.',
			'Les lignes 4 à 7 bloquent toute réduction d’un système de fichiers monté. Pour réduire un ext4, tu le démontes, tu lances resize2fs, et seulement ensuite tu réduis le LV ou la partition dessous. resize2fs(8) prévient de ne pas rendre la partition « smaller than the new size of the ext2 file system ».',
			'La ligne 9 ouvre le point de montage, et la ligne 18 passe la nouvelle taille en blocs au noyau avec l’ioctl `EXT4_IOC_RESIZE_FS`. Le noyau agrandit le système de fichiers sans le démonter. En cas de succès, les lignes 36 à 38 ferment le descripteur et rendent la main.',
			'Lignes 26 à 34 : `ENOTTY` ou `EINVAL` veut dire que le noyau n’a pas cet ioctl, et le code se rabat sur l’ancienne interface que décrit le commentaire des lignes 20 à 22. `EPERM` affiche `Permission denied to resize filesystem` : lance-le en root.'
		]
	},
	tradeoff: {
		gain: [
			'Avec LVM, `/` peut grandir avec `pvresize` et `lvextend -r` pendant qu’il est monté, sans redémarrage et sans recopier les données.',
			'Un VG peut couvrir plusieurs disques : `vgextend` ajoute un nouveau PV, et ses extents libres servent à n’importe quel LV du groupe.',
			'`lsblk` montre toute la chaîne, du disque à la partition, au LV et au point de montage, dans un seul arbre et sans être root.'
		],
		cost: [
			'Disque, partition, PV, LV et système de fichiers ont chacun une taille à suivre. Un disque cloud agrandi laisse la partition, le PV, le LV et le système de fichiers tels quels tant que tu ne lances pas une commande pour chacun.',
			'Réduire un ext4 demande de le démonter, et xfs_growfs(8) note : « Only shrinking the last AG without removing it is implemented ». Réduire le LV avant le système de fichiers détruit les données de la fin.',
			'Les métadonnées d’ext4 prennent une place que `df` ne montre jamais : sur le portable de test, 16 GB d’un LV de 1 TB.'
		]
	},
	task: {
		prompt: 'Le disque d’une VM a été agrandi de 50 GB à 100 GB dans la console du cloud. `lsblk` montre `sda` à 100G, `sda1` à 50G avec le type `LVM2_member`, et `vg0-data` à 50G, en ext4, monté sur `/data`. Donne les commandes, dans l’ordre, pour donner les 50 GB de plus à `/data` sans le démonter, et dis ce que change chacune.',
		hint: 'Pars du bas de l’arbre : quel périphérique est encore à 50G juste au-dessus du disque de 100G ?',
		answer: [
			'`growpart /dev/sda 1` : réécrit la table de partitions pour que `sda1` finisse au bout du disque. `lsblk` doit maintenant montrer `sda1` à 100G.',
			'`pvresize /dev/sda1` : dit à LVM que le PV fait maintenant 100G. `vgs` montre environ 50G libres dans `vg0`.',
			'`lvextend -r -l +100%FREE vg0/data` : donne au LV tous les extents libres du VG, puis `-r` lance fsadm, qui appelle resize2fs sur l’ext4 monté.',
			'`df -h /data` doit montrer environ 100G, moins les métadonnées d’ext4. Sans `-r`, le LV grandit et `df` reste à 50G jusqu’à ce que tu lances `resize2fs /dev/vg0/data`.'
		]
	},
	quiz: [
		{
			q: 'Tu as lancé `lvextend -L +20G vg0/data` sans `-r`. `lvs` montre le LV 20G plus grand, `df` montre l’ancienne taille. Que manque-t-il ?',
			options: [
				'Un redémarrage, pour que le noyau relise la table de partitions',
				'`pvresize`, pour que LVM voie la nouvelle place sur le PV',
				'`resize2fs`, pour que l’ext4 occupe tout le LV',
				'Un remontage de `/data`, pour que df lise la nouvelle taille'
			],
			answer: 2,
			why: 'Le LV a grandi, mais l’ext4 dessus garde son ancien nombre de blocs, et `df` affiche la taille du système de fichiers. `resize2fs /dev/vg0/data` l’agrandit à chaud avec `EXT4_IOC_RESIZE_FS`.'
		},
		{
			q: 'Tu veux réduire un ext4 monté sur un LV de 200G à 150G. Que se passe-t-il si tu lances `resize2fs /dev/vg0/data 150G` maintenant ?',
			options: [
				'Il réduit le système de fichiers à chaud en déplaçant les données',
				'Il refuse : « On-line shrinking not supported »',
				'Il réduit le LV et le système de fichiers ensemble',
				'Il programme la réduction pour le prochain démontage'
			],
			answer: 1,
			why: '`online_resize_fs` compare la nouvelle taille au nombre de blocs actuel et s’arrête quand elle est plus petite. Réduire un ext4 demande de le démonter.'
		},
		{
			q: '`lsblk` montre un disque de 100G, une partition de 100G de type `LVM2_member`, et un LV de 60G. `vgs` montre 40G libres. Quelle commande seule donne les 40G au système de fichiers ?',
			options: [
				'`growpart /dev/sda 1`, puis un redémarrage',
				'`pvresize /dev/sda1` sur la partition',
				'`lvextend -r -l +100%FREE vg0/data`',
				'`resize2fs /dev/sda1` sur la partition'
			],
			answer: 2,
			why: 'La partition et le PV ont déjà la place : le VG montre 40G libres. Seuls le LV et son système de fichiers sont trop petits, et `lvextend -r` agrandit les deux.'
		}
	],
	recall: {
		q: 'Un disque cloud passe de 50 à 100 GB sous un montage LVM. Quelles couches faut-il encore agrandir avant que `df` le voie, et avec quelles commandes ?',
		a: 'La partition (`growpart`), le volume physique (`pvresize`), le volume logique et son système de fichiers (`lvextend -r`, qui lance resize2fs). Chaque couche garde son ancienne taille tant que tu ne l’agrandis pas.'
	},
	sources: [
		{ title: 'lsblk(8), page de manuel Linux', url: `${MAN}/man8/lsblk.8.html` },
		{ title: 'lvm(8), page de manuel Linux', url: `${MAN}/man8/lvm.8.html` },
		{ title: 'lvextend(8), page de manuel Linux', url: `${MAN}/man8/lvextend.8.html` },
		{ title: 'pvresize(8), page de manuel Linux', url: `${MAN}/man8/pvresize.8.html` },
		{ title: 'resize2fs(8), page de manuel Linux', url: `${MAN}/man8/resize2fs.8.html` },
		{ title: 'xfs_growfs(8), page de manuel Linux', url: `${MAN}/man8/xfs_growfs.8.html` },
		{ title: 'cloud-utils, growpart(1)', url: 'https://github.com/canonical/cloud-utils/blob/33b6072e0cb17cbcae6b96d6a9e33a9797b78c60/man/growpart.1' }
	]
};
