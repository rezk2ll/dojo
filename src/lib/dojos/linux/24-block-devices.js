const E2FS = 'https://github.com/tytso/e2fsprogs/blob/8fd79523d051d5ea881237f27eb1c664486e0078';
const ONLINE = `${E2FS}/resize/online.c`;
const MAN = 'https://man7.org/linux/man-pages';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'block-devices',
	part: 'Files and disks',
	title: 'Disks, partitions and LVM',
	minutes: 10,
	hook: [
		'On the laptop used to test this chapter, `df -h /` shows a 934G filesystem on `/dev/mapper/data-root`. `lsblk` shows what sits under it: the disk `nvme0n1` (953.9G), its partition `nvme0n1p2` (953.6G, type `LVM2_member`), and the logical volume `data-root` (949.8G, `ext4`, mounted on `/`).',
		'Each layer has its own size. To give `/` more room you grow them from the bottom up: the partition, then the LVM physical volume, then the logical volume, then the filesystem. resize2fs(8) states that it "does not manipulate the size of partitions".',
		'If you grow a cloud disk and stop there, `lsblk` shows the bigger disk and **`df` still shows the old size**, because the partition, the PV, the LV and the filesystem kept theirs.'
	],
	terms: [
		{ term: 'Partition', def: 'A range of sectors on a disk, listed in the partition table. The kernel shows each one as its own block device, like `nvme0n1p2`.' },
		{ term: 'Physical volume (PV)', def: 'A disk or partition that LVM manages, prepared with `pvcreate`. `lsblk` shows its type as `LVM2_member`.' },
		{ term: 'Volume group (VG)', def: 'lvm(8): "a collection of one or more physical devices, each called a Physical Volume (PV)". Its space is a pool for logical volumes.' },
		{ term: 'Logical volume (LV)', def: 'A block device cut from a volume group, such as `/dev/mapper/data-root`. Device Mapper in the kernel maps each of its blocks to a PV. A filesystem lives on it like on a partition.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['disk["nvme0n1: disk, 953.9G"] --> p1["nvme0n1p1: 263.1M vfat, /boot/efi"]', 'disk --> p2["nvme0n1p2: 953.6G, LVM2_member"]'],
				highlight: ['disk', 'p1', 'p2'],
				note: '`lsblk -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS` on the test laptop prints this tree. lsblk(8): it "reads the sysfs filesystem and udev db to gather information", so it needs no root. The partition table splits the disk into a small EFI partition and one big partition for LVM.'
			},
			{
				add: ['p2 --> vg["VG data: one PV"]', 'vg --> root["LV data-root: 949.8G"]', 'vg --> swap["LV data-swap: 3.8G"]'],
				highlight: ['vg', 'root', 'swap'],
				note: 'The partition is the only PV of a volume group named `data`, split into two LVs. lvm(8): "Each block of data in an LV is stored on one or more PV in the VG, according to algorithms implemented by Device Mapper (DM) in the kernel." lvm(8) asks scripts to use `/dev/data/root` rather than the `/dev/mapper` name, whose format "might change between releases".'
			},
			{
				add: ['root --> fs["ext4 on data-root: df shows 934G"]'],
				highlight: ['fs'],
				note: '`lsblk -b` gives the LV as 1,019,828,240,384 bytes and `df -B1` gives 1,002,666,958,848: 16 GB less. ext4 leaves its metadata out of `df`\'s size. With the default inode size of 256 bytes from `/etc/mke2fs.conf`, the 62,251,008 inodes take 15.9 GB of inode tables. `ext4_calculate_overhead` adds the journal, the bitmaps and the group descriptors on top.'
			},
			{
				add: ['grow1["growpart /dev/nvme0n1 2"] --> grow2["pvresize /dev/nvme0n1p2"]', 'grow2 --> grow3["lvextend -r -l +100%FREE data/root"]'],
				highlight: ['grow1', 'grow2', 'grow3'],
				note: 'After a bigger disk, three commands grow the stack, each one layer. `growpart` from cloud-utils rewrites the partition table "so that the given partition takes up as much space as it can". `pvresize` "resizes a PV", even with active LVs on it. `lvextend -l +100%FREE` gives the LV all free space in the VG, and `-r` resizes the filesystem "together with the LV using fsadm(8)".'
			},
			{
				add: ['grow3 --> online["resize2fs on a mounted ext4: ioctl EXT4_IOC_RESIZE_FS"]', 'online --> done["df shows the new size, no unmount"]'],
				highlight: ['online', 'done'],
				note: 'resize2fs(8): "If the file system is mounted, it can be used to expand the size of the mounted file system". Growing works while `/` is in use. Shrinking does not: resize2fs refuses "On-line shrinking not supported". For XFS, xfs_growfs(8) says "The filesystem must be mounted to be grown".'
			}
		]
	},
	example: {
		title: 'e2fsprogs resize/online.c: resize2fs asks the kernel to grow a mounted ext4',
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
			'resize2fs calls `online_resize_fs` when it finds the filesystem mounted. Lines 1 and 2 print the message you see on the terminal: `Filesystem at /dev/mapper/data-root is mounted on /; on-line resizing required`.',
			'Lines 4 to 7 stop any shrink of a mounted filesystem. To shrink ext4 you unmount it, run resize2fs, and only then shrink the LV or partition under it. resize2fs(8) warns not to make the partition "smaller than the new size of the ext2 file system".',
			'Line 9 opens the mount point, and line 18 hands the new size in blocks to the kernel with the `EXT4_IOC_RESIZE_FS` ioctl. The kernel grows the filesystem while it stays mounted. On success, lines 36 to 38 close the descriptor and return.',
			'Lines 26 to 34: `ENOTTY` or `EINVAL` means the kernel lacks that ioctl, and the code falls back to the old interface that the comment on lines 20 to 22 describes. `EPERM` prints `Permission denied to resize filesystem`, so run it as root.'
		]
	},
	tradeoff: {
		gain: [
			'With LVM, `/` can grow with `pvresize` and `lvextend -r` while it is mounted, with no reboot and no copy of the data.',
			'One VG can span several disks: `vgextend` adds a new PV, and its free extents are open to any LV in the group.',
			'`lsblk` shows the whole chain, disk to partition to LV to mount point, in one tree, as a normal user.'
		],
		cost: [
			'Disk, partition, PV, LV and filesystem each have a size to track. A grown cloud disk leaves the partition, the PV, the LV and the filesystem unchanged until you run a command for each.',
			'Shrinking ext4 needs it unmounted, and xfs_growfs(8) notes: "Only shrinking the last AG without removing it is implemented". Cutting the LV before the filesystem destroys the data at its end.',
			'ext4 metadata takes space you never see in `df`: on the test laptop, 16 GB of a 1 TB LV.'
		]
	},
	task: {
		prompt: 'A VM\'s disk was grown in the cloud console from 50 GB to 100 GB. `lsblk` shows `sda` at 100G, `sda1` at 50G with type `LVM2_member`, and `vg0-data` at 50G, ext4, mounted on `/data`. Give the commands, in order, to give `/data` the new 50 GB without unmounting it, and say what each one changes.',
		hint: 'Start from the bottom of the tree: which device is still 50G right above the 100G disk?',
		answer: [
			'`growpart /dev/sda 1`: rewrites the partition table so `sda1` ends at the end of the disk. `lsblk` should now show `sda1` at 100G.',
			'`pvresize /dev/sda1`: tells LVM the PV is now 100G. `vgs` shows about 50G of free space in `vg0`.',
			'`lvextend -r -l +100%FREE vg0/data`: gives the LV all free extents of the VG, then `-r` runs fsadm, which calls resize2fs on the mounted ext4.',
			'`df -h /data` should show about 100G, minus ext4 metadata. If you leave out `-r`, the LV grows and `df` stays at 50G until you run `resize2fs /dev/vg0/data`.'
		],
		steps: [
			{
				title: 'Read the tree',
				questions: [
					{ q: 'The disk `sda` shows 100G. Why does `df -h /data` still show 50G?', options: ['The cloud console has not finished the resize', 'The kernel needs a reboot to see the disk', 'The partition, PV, LV and filesystem kept their old sizes', '`df` caches sizes until the next mount'], answer: 2, why: 'Each layer has its own size. Growing the disk changes only the bottom one.' },
					{ q: 'Which device is still 50G right above the 100G disk?', options: ['`vg0-data`', '`sda1`', '`/data`', '`sda`'], answer: 1, why: 'The hint says to start from the bottom. `sda1` sits directly on `sda` and still ends where the old disk ended.' },
					{ q: 'What does type `LVM2_member` on `sda1` tell you?', options: ['The partition is an LVM physical volume', 'The partition holds an ext4 filesystem', 'The partition is a swap area', 'The partition is a logical volume'], answer: 0, why: '`lsblk` shows a PV prepared with `pvcreate` as `LVM2_member`.' },
					{ q: 'Which layer is `vg0-data` in this tree?', options: ['The disk', 'The partition', 'The physical volume', 'The logical volume that holds the ext4'], answer: 3, why: 'It sits above `sda1` and carries the filesystem mounted on `/data`. Its name is the VG and the LV joined by a dash.' }
				]
			},
			{
				title: 'Grow the partition',
				questions: [
					{ q: 'Which command grows `sda1` to the end of the disk?', options: ['`resize2fs /dev/sda1`', '`growpart /dev/sda 1`', '`pvresize /dev/sda`', '`lvextend /dev/sda1`'], answer: 1, why: '`growpart` from cloud-utils rewrites the partition table "so that the given partition takes up as much space as it can".' },
					{ q: 'Why not run `resize2fs` first?', options: ['resize2fs "does not manipulate the size of partitions"', 'resize2fs only works on XFS', 'resize2fs needs the disk unmounted', 'resize2fs deletes the LVM metadata'], answer: 0, why: 'resize2fs(8) says so. It can only grow a filesystem into a device that is already bigger.' },
					{ q: 'Note the space between `/dev/sda` and `1`. What are the two arguments?', options: ['The partition and its new size in GB', 'The volume group and the LV number', 'The disk and the partition number', 'The source and the target disk'], answer: 2, why: '`growpart` takes the disk and the number of the partition on it to grow.' },
					{ q: 'How do you check this step worked?', options: ['`df -h /data` shows 100G', '`vgs` shows 50G free', '`lvs` shows the LV at 100G', '`lsblk` shows `sda1` at 100G'], answer: 3, why: 'Only the partition changed. `df`, `vgs` and `lvs` still show the old sizes until the next steps.' }
				]
			},
			{
				title: 'Grow the PV',
				questions: [
					{ q: 'Which command tells LVM that the PV is now bigger?', options: ['`pvresize /dev/sda1`', '`vgextend vg0 /dev/sda1`', '`pvcreate /dev/sda1`', '`lvextend vg0/data`'], answer: 0, why: '`pvresize` "resizes a PV", even with active LVs on it.' },
					{ q: 'Why not `pvcreate /dev/sda1` again?', options: ['It needs a reboot afterwards', 'It prepares a new PV, and `sda1` is already one that holds `vg0`', 'It only works on whole disks', 'It is the same command under another name'], answer: 1, why: '`pvcreate` prepares a fresh PV. `sda1` is already one and holds `vg0`.' },
					{ q: 'After `pvresize`, what does `vgs` show?', options: ['No free space: the LV took it', 'The VG at 50G, unchanged', 'About 50G of free space in `vg0`', 'A second VG of 50G'], answer: 2, why: 'The new PV space joins the VG as free extents. No LV owns it yet.' },
					{ q: 'Is `/data` bigger yet?', options: ['Yes, `df` now shows 100G', 'Only after a remount', 'Yes, but only for root', 'No: the LV and the filesystem are still 50G'], answer: 3, why: 'The space is in the VG pool. Two layers are left.' }
				]
			},
			{
				title: 'Grow the LV and the filesystem',
				questions: [
					{ q: 'After `lvextend -r -l +100%FREE vg0/data`, how much free space does `vgs` show?', options: ['About 50G', 'None: the LV took it all', 'About 100G', 'About 25G'], answer: 1, why: '`-l +100%FREE` hands every free extent of `vg0` to the LV, so the VG has nothing left.' },
					{ q: 'Does `/data` need to be unmounted?', options: ['No: resize2fs grows a mounted ext4 through `EXT4_IOC_RESIZE_FS`', 'Yes: resize2fs refuses on a mounted filesystem', 'Yes, unless you add `--force`', 'Only on the first resize'], answer: 0, why: 'resize2fs(8): "If the file system is mounted, it can be used to expand the size of the mounted file system". Only shrinking needs an unmount.' },
					{ q: 'Which command shows the size of the LV itself, apart from its filesystem?', options: ['`pvs`', '`growpart`', '`lvs`', '`df -h /data`'], answer: 2, why: '`lvs` lists each logical volume with its size. `df` reports the filesystem, which can lag behind the LV.' },
					{ q: '`df -h /data` shows a bit less than 100G. Why?', options: ['LVM keeps 5% for snapshots', 'growpart leaves a gap at the end of the disk', 'The resize is still running in the background', 'ext4 metadata is left out of `df`\'s size'], answer: 3, why: 'Inode tables, the journal and bitmaps take space `df` never shows: 16 GB of a 1 TB LV on the test laptop.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You ran `lvextend -L +20G vg0/data` without `-r`. `lvs` shows the LV 20G bigger, `df` shows the old size. What is missing?',
			options: [
				'A reboot, so the kernel rereads the partition table',
				'`pvresize`, so LVM sees the new space on the PV',
				'`resize2fs`, so the ext4 filesystem grows into the LV',
				'A remount of `/data`, so df reads the new size'
			],
			answer: 2,
			why: 'The LV grew, but the ext4 filesystem on it still has its old block count, and `df` reports the filesystem. `resize2fs /dev/vg0/data` grows it online through `EXT4_IOC_RESIZE_FS`.'
		},
		{
			q: 'You want to shrink a mounted ext4 on an LV from 200G to 150G. What happens if you run `resize2fs /dev/vg0/data 150G` now?',
			options: [
				'It shrinks the filesystem online, moving data as needed',
				'It refuses: "On-line shrinking not supported"',
				'It shrinks the LV and the filesystem together',
				'It schedules the shrink for the next unmount'
			],
			answer: 1,
			why: '`online_resize_fs` compares the new size with the current block count and exits when it is smaller. Shrinking ext4 needs the filesystem unmounted.'
		},
		{
			q: '`lsblk` shows a 100G disk, a 100G partition of type `LVM2_member`, and an LV of 60G. `vgs` shows 40G free. Which one command gives the filesystem the 40G?',
			options: [
				'`growpart /dev/sda 1`, then a reboot',
				'`pvresize /dev/sda1` on the partition',
				'`lvextend -r -l +100%FREE vg0/data`',
				'`resize2fs /dev/sda1` on the partition'
			],
			answer: 2,
			why: 'The partition and the PV already have the space: the VG shows 40G free. Only the LV and the filesystem on it are short, and `lvextend -r` grows both.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Watch a bigger disk leave the partition and the filesystem at their old size, then grow each layer yourself, on image files with no root.',
		steps: [
			'In a scratch folder, make a 50 MB "disk" with one partition: `truncate -s 50M disk.img && parted -s disk.img mklabel msdos mkpart primary ext4 1MiB 100%`, then `parted -s disk.img unit MiB print`. If a tool is not found, it lives in `/usr/sbin`: run `export PATH=$PATH:/usr/sbin`.',
			'Grow the disk like the cloud console does: `truncate -s 100M disk.img`, and print the table again.',
			'Grow the partition, the job `growpart` does on a VM: `parted -s disk.img resizepart 1 100%`, and print again.',
			'Now the filesystem layer, in its own file: `truncate -s 50M fs.img && mkfs.ext4 -q -F fs.img && truncate -s 100M fs.img`, then `dumpe2fs -h fs.img | grep "^Block count"`.',
			'Grow it: `resize2fs fs.img`, and read the block count again. Clean up with `rm disk.img fs.img`.'
		],
		done: [
			'After `truncate -s 100M`, `parted` prints `Disk ... 100MiB` and the partition still ends at `50.0MiB`.',
			'After `resizepart`, the partition ends at `100MiB`.',
			'`dumpe2fs` shows `Block count: 12800` on the 100 MB file before `resize2fs`, and `25600` after.'
		],
		solution: [
			'A bigger device changes nothing above it. The partition table still says where the partition ends, and the superblock still says how many blocks the filesystem has.',
			'12800 blocks of 4 KiB is 50 MiB. resize2fs prints `The filesystem on fs.img is now 25600 (4k) blocks long`.',
			'On a real VM with LVM, `pvresize` and `lvextend` sit between these two steps. The rule is the same: grow each layer from the bottom up.'
		]
	},
	recall: {
		q: 'A cloud disk grew from 50 to 100 GB under an LVM setup. Which layers still need to grow before `df` shows it, and with which commands?',
		a: 'The partition (`growpart`), the physical volume (`pvresize`), the logical volume and its filesystem (`lvextend -r`, which runs resize2fs). Each layer keeps its old size until you grow it.'
	},
	sources: [
		{ title: 'lsblk(8), Linux manual page', url: `${MAN}/man8/lsblk.8.html` },
		{ title: 'lvm(8), Linux manual page', url: `${MAN}/man8/lvm.8.html` },
		{ title: 'lvextend(8), Linux manual page', url: `${MAN}/man8/lvextend.8.html` },
		{ title: 'pvresize(8), Linux manual page', url: `${MAN}/man8/pvresize.8.html` },
		{ title: 'resize2fs(8), Linux manual page', url: `${MAN}/man8/resize2fs.8.html` },
		{ title: 'xfs_growfs(8), Linux manual page', url: `${MAN}/man8/xfs_growfs.8.html` },
		{ title: 'cloud-utils, growpart(1)', url: 'https://github.com/canonical/cloud-utils/blob/33b6072e0cb17cbcae6b96d6a9e33a9797b78c60/man/growpart.1' }
	]
};
