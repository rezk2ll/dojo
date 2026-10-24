const LINUX = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a';
const MAIN = `${LINUX}/init/main.c`;
const MAN = 'https://www.freedesktop.org/software/systemd/man/latest';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'boot',
	part: 'The running system',
	title: 'How Linux boots',
	minutes: 10,
	hook: [
		'On the laptop used to test this chapter, `systemd-analyze` prints: `Startup finished in 9.346s (firmware) + 3.185s (loader) + 3.721s (kernel) + 19.993s (userspace) = 36.246s`. More than half of the 36 seconds goes to userspace, after the kernel has started PID 1.',
		'`systemd-analyze blame` puts `NetworkManager-wait-online.service` first, at 10.778s. `systemd-analyze critical-chain` shows why it matters: `docker.service` starts at 13.897s, right after `network-online.target`, and `graphical.target` is reached at 19.880s, once docker is up.',
		'Each number belongs to one stage: the firmware, the boot loader, the kernel with its initramfs, then systemd. **Every stage loads the next one and hands over control.**'
	],
	terms: [
		{ term: 'Boot loader', def: 'The program the firmware starts, such as GRUB or systemd-boot. It loads the kernel and the initramfs into memory and passes the kernel command line.' },
		{ term: 'initramfs', def: 'A compressed cpio archive that the kernel unpacks into memory at boot. Its `/init` runs first, finds the real root filesystem and mounts it.' },
		{ term: 'PID 1', def: 'The first user-space process, started by the kernel. On the test laptop it is systemd, which then starts every service.' },
		{ term: 'Target', def: 'A systemd unit that groups other units and marks a point in the boot, such as `multi-user.target` or `network-online.target`. `default.target` is the one systemd boots to.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['fw["Firmware (UEFI): 9.346s"] --> loader["Boot loader from /boot/efi: 3.185s"]'],
				highlight: ['fw', 'loader'],
				note: 'bootup(7): "Immediately after power-up, the system firmware will do minimal hardware initialization, and hand control over to a boot loader". On the test laptop the boot loader lives on the 263 MB vfat partition mounted at `/boot/efi`. The firmware stage is the second longest on this machine.'
			},
			{
				add: ['loader -->|"loads kernel + initramfs, passes the command line"| kern["Kernel: 3.721s"]'],
				highlight: ['kern'],
				note: 'bootup(7): "It\'s the boot loader or the firmware that loads both the kernel and initrd/initramfs images into memory". `/proc/cmdline` on the test laptop starts with `BOOT_IMAGE=/boot/vmlinuz-6.17.0-1033-oem root=... ro quiet splash`. The kernel reads `root=`, `init=` and `rdinit=` from that line.'
			},
			{
				add: ['kern --> initrd["initramfs unpacked into rootfs, /init runs as PID 1"]', 'initrd -->|"activates LVM, mounts root=, switch_root"| real["Real root filesystem mounted on /"]'],
				highlight: ['initrd', 'real'],
				note: 'The kernel docs: after unpacking the archive, the kernel looks for a file named `init` in rootfs, "and if so it executes it as PID 1". The test laptop\'s 82.4 MB initramfs contains `init` and `usr/sbin/lvm`, the LVM tool that can activate the `data-root` volume holding `/`. The `systemd-analyze` line has no `(initrd)` part, unlike the docs\' example `19.176s (initrd)`.'
			},
			{
				add: ['real -->|"exec /sbin/init"| sysd["systemd as PID 1"]', 'sysd --> tgt["Units pulled in by default.target, started in parallel"]'],
				highlight: ['sysd', 'tgt'],
				note: 'On the test laptop `/sbin/init` resolves to `/usr/lib/systemd/systemd`, and `ps -p 1` shows `/sbin/init splash`. bootup(7): systemd "will activate all units that are dependencies of default.target". The docs add that the order "is not deterministic, but still adheres to a limited amount of ordering structure".'
			},
			{
				add: ['tgt --> wait["NetworkManager-wait-online: +10.778s"]', 'wait --> online["network-online.target @13.892s"]', 'online --> docker["docker.service @13.897s +5.983s"]', 'docker --> gfx["graphical.target @19.880s"]'],
				highlight: ['wait', 'docker', 'gfx'],
				note: 'These four lines come from the `critical-chain` output. `docker.service` from moby has `Wants=network-online.target` and `After=network-online.target`, so it waits for the network to be up. The systemd.io page on network targets says server software "should generally not pull this in", because it can accept local connections before any routable interface is up.'
			}
		]
	},
	example: {
		title: 'init/main.c: kernel_init picks the program to run as PID 1',
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
			'Lines 1 to 7 try the initramfs first. `ramdisk_execute_command` is set to `"/init"` near the top of the file and can be changed with `rdinit=` on the command line. If it fails, the kernel only logs an error and goes on.',
			'Lines 15 to 21 handle `init=`. When you ask for a program, the kernel panics if it fails: `Requested init %s failed`. The kernel docs suggest `init=/bin/sh`, or `rdinit=/bin/sh` for the initramfs, to get a shell on a broken machine.',
			'Lines 32 to 36 try four fixed paths in order: `/sbin/init`, `/etc/init`, `/bin/init`, `/bin/sh`. The comment on lines 9 to 14 says the Bourne shell can be used instead of init "if we are trying to recover a really broken machine".',
			'Line 38 is the panic you see when all of them fail. The kernel guide it names, [init.rst](' + LINUX + '/Documentation/admin-guide/init.rst), lists causes such as "Unable to mount root FS" and "init binary doesn\'t exist on rootfs".'
		]
	},
	tradeoff: {
		gain: [
			'The initramfs can carry what the kernel needs to reach root (LVM, disk encryption, storage drivers), so the kernel image itself stays generic.',
			'systemd starts units in parallel and only orders the ones with `After=`: on the test laptop, `graphical.target` is reached 19.880 s into userspace, and `blame` lists 146 units started.',
			'`systemd-analyze time`, `blame` and `critical-chain` show each stage and each slow unit without any extra tooling.'
		],
		cost: [
			'One unit that waits for the network can hold up the boot: here `NetworkManager-wait-online.service` took 10.778 s and `docker.service` waited for it.',
			'systemd-analyze(1) warns that `blame` "might be misleading as the initialization of one service might be slow simply because it waits for the initialization of another service to complete".',
			'The firmware stage (9.346 s on the test laptop) runs before the kernel, so no kernel parameter or unit file changes it.'
		]
	},
	task: {
		prompt: 'Run `systemd-analyze`, `systemd-analyze blame | head` and `systemd-analyze critical-chain` on a Linux machine. Say which stage takes the most time, which unit is at the top of `blame`, and whether that unit is on the critical chain. Then compare with the test laptop: blame top `NetworkManager-wait-online.service` at 10.778s, chain `NetworkManager-wait-online.service @3.112s +10.778s`, then `network-online.target @13.892s`, then `docker.service @13.897s +5.983s`.',
		hint: 'In `critical-chain`, `@` is when the unit became active, `+` is how long it took to start. A unit in `blame` that is not in the chain ran in parallel with something slower.',
		answer: [
			'On the test laptop, userspace is the longest stage: 19.993 s of 36.246 s. The firmware comes second at 9.346 s.',
			'`NetworkManager-wait-online.service` started at 3.112 s and took 10.778 s, so `network-online.target` was reached at 3.112 + 10.778 = 13.890 s (printed as 13.892 s). docker started 5 ms later and took 5.983 s, which brings the chain to 19.880 s.',
			'Both units are on the chain, so they set the boot time. If docker did not wait for `network-online.target`, the 10.778 s wait would leave this chain. A new `critical-chain` after a reboot would show which path is then the slowest.',
			'A unit at the top of `blame` that is not on the chain, such as `snapd.seeded.service` at 916 ms here, ran in parallel. Making it faster would not change when `graphical.target` is reached.'
		],
		steps: [
			{
				title: 'Read the stages',
				questions: [
					{ q: 'Which stage is the longest on the test laptop?', options: ['Firmware, 9.346 s', 'Kernel, 3.721 s', 'Userspace, 19.993 s', 'Loader, 3.185 s'], answer: 2, why: '`Startup finished in 9.346s (firmware) + 3.185s (loader) + 3.721s (kernel) + 19.993s (userspace)`: more than half of 36.246 s.' },
					{ q: 'Userspace starts at which moment?', options: ['When the kernel starts PID 1', 'When the firmware hands over to the loader', 'When `graphical.target` is reached', 'When the first service unit starts'], answer: 0, why: 'The userspace stage is what systemd does after the kernel has started it as PID 1.' },
					{ q: 'Can a unit file or kernel parameter shorten the firmware\'s 9.346 s?', options: ['Yes, with `quiet` on the command line', 'Yes, by masking slow units', 'Only with a smaller initramfs', 'No: the firmware runs before the kernel'], answer: 3, why: 'The firmware stage comes first. Nothing the kernel or systemd reads can change it.' },
					{ q: 'How long did the boot loader take on the test laptop?', options: ['3.185 s', '3.721 s', '9.346 s', '19.993 s'], answer: 0, why: 'The `(loader)` field reads 3.185s. 3.721 s is the kernel, 9.346 s the firmware, 19.993 s userspace.' }
				]
			},
			{
				title: 'Read blame',
				questions: [
					{ q: 'What is at the top of `blame` on the test laptop?', options: ['`docker.service` at 5.983 s', '`NetworkManager-wait-online.service` at 10.778 s', '`snapd.seeded.service` at 916 ms', '`graphical.target` at 19.880 s'], answer: 1, why: '`blame` sorts units by how long they took to start, and this one took 10.778 s.' },
					{ q: 'What does a unit\'s time in `blame` measure?', options: ['The moment it became active', 'The time other units waited for it', 'How long the unit took to start', 'Its share of the whole boot'], answer: 2, why: '`blame` lists start-up time per unit. It says nothing about who waited.' },
					{ q: 'Why does systemd-analyze(1) call `blame` "misleading"?', options: ['A unit can be slow only because it waits for another one', 'It rounds times to the nearest second', 'It leaves out the firmware stage', 'It only lists the ten slowest units'], answer: 0, why: 'systemd-analyze(1): "the initialization of one service might be slow simply because it waits for the initialization of another service to complete".' },
					{ q: 'Does being first in `blame` prove a unit sets the boot time?', options: ['Yes: the slowest unit always does', 'Yes, if it took over 5 s', 'No: only if it is a target', 'No: you must check it is on the critical chain'], answer: 3, why: 'systemd starts units in parallel. A slow unit off the chain ran next to something slower.' }
				]
			},
			{
				title: 'Read the critical chain',
				questions: [
					{ q: 'In `critical-chain`, what do `@` and `+` mean?', options: ['`@` is the start time, `+` the time since boot', '`@` is when the unit became active, `+` how long it took to start', '`@` is the CPU time, `+` the wall time', '`@` is the PID, `+` the exit code'], answer: 1, why: 'systemd-analyze prints it at the top of the output: the time after `@` is when the unit became active, after `+` how long it took to start.' },
					{ q: 'Wait-online starts at 3.112 s and takes 10.778 s. When is `network-online.target` reached?', options: ['At about 13.89 s', 'At 10.778 s', 'At 3.112 s', 'At 19.880 s'], answer: 0, why: '3.112 + 10.778 = 13.890 s, printed as 13.892 s.' },
					{ q: 'Why does `docker.service` start right after `network-online.target`?', options: ['docker is the slowest unit', 'systemd starts units in alphabetical order', 'Its unit has `Wants=` and `After=network-online.target`', 'NetworkManager starts docker itself'], answer: 2, why: 'The moby unit file orders docker after the network is up, so it waits.' },
					{ q: 'docker takes 5.983 s from 13.897 s. Where does the chain end?', options: ['At 13.897 s', 'At 36.246 s', 'At 5.983 s', 'At `graphical.target` @19.880 s'], answer: 3, why: '13.897 + 5.983 = 19.880 s, when `graphical.target` is reached.' }
				]
			},
			{
				title: 'Compare and decide',
				questions: [
					{ q: 'Is the top unit of `blame` on the test laptop\'s critical chain?', options: ['No, it ran in parallel', 'Yes, together with docker', 'Only in the first second', 'Only on reboot'], answer: 1, why: 'Both `NetworkManager-wait-online.service` and `docker.service` are on the chain, so they set the boot time.' },
					{ q: 'If docker started in 1 s and the chain stayed the same, about when would `graphical.target` be reached?', options: ['Still at about 19.88 s', 'At about 9 s', 'At about 14.9 s', 'At about 13.9 s'], answer: 2, why: 'docker starts at 13.897 s, so 13.897 + 1 is about 14.9 s, almost 5 s earlier.' },
					{ q: 'What would take the 10.778 s wait off this chain?', options: ['docker not waiting for `network-online.target`', 'Moving docker to the top of `blame`', 'A faster firmware', 'Removing `quiet` from the command line'], answer: 0, why: 'docker is the only link from the wait to `graphical.target` here. systemd.io notes server software "should generally not pull this in".' },
					{ q: 'After such a change, how do you see the new slowest path?', options: ['Run `blame` again and take the top line', 'Read `/proc/cmdline`', 'Count the units in `blame`', 'Reboot and run `critical-chain` again'], answer: 3, why: 'Removing one wait exposes the next slowest path, and only a fresh `critical-chain` shows which one it is.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Who loads the initramfs image into memory?',
			options: [
				'The kernel, which reads it from /boot after mounting root',
				'The boot loader or the firmware, along with the kernel image',
				'systemd, as its first unit before local-fs.target',
				'The /init program, which unpacks itself from the disk'
			],
			answer: 1,
			why: 'bootup(7): "It\'s the boot loader or the firmware that loads both the kernel and initrd/initramfs images into memory, but the kernel which interprets it as a file system." The kernel cannot mount root yet, which is why the initramfs exists.'
		},
		{
			q: 'A server stops at `Kernel panic: No working init found`. With no `init=` on the command line, what did the kernel try before this panic?',
			options: [
				'Only /sbin/init on the root filesystem',
				'/init, then /sbin/init, /etc/init, /bin/init, /bin/sh',
				'systemd from the initramfs, then a rescue shell from GRUB',
				'/bin/sh first, then /sbin/init as a fallback'
			],
			answer: 1,
			why: '`kernel_init` runs `ramdisk_execute_command` (`/init`) first, then tries the four fixed paths in order, and panics only when all of them fail.'
		},
		{
			q: '`systemd-analyze blame` shows `snapd.seeded.service` at 916 ms, but it is not in `critical-chain`. What happens to the boot time if you make it start in 100 ms?',
			options: [
				'It drops by about 816 ms, the time saved',
				'It drops by 916 ms, because the unit no longer counts',
				'It barely changes, because the unit ran in parallel',
				'It grows, because other units start earlier and compete'
			],
			answer: 2,
			why: 'systemd starts units in parallel. Only the units on the critical chain decide when the default target is reached, and this unit is not on it.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Follow your own machine\'s boot hand-offs, from the kernel command line to the unit that holds up the chain, as a normal user.',
		steps: [
			'Read what the boot loader passed to the kernel: `cat /proc/cmdline`. Find `root=`.',
			'Look inside the initramfs for its `/init` and the tools it needs to reach root. On Debian or Ubuntu: `lsinitramfs /boot/initrd.img-$(uname -r) | grep -E "^init$|sbin/lvm$"`. On Fedora, `lsinitrd` does the same job.',
			'See what became PID 1 after the switch to the real root: `ps -p 1 -o args=` and `readlink -f /sbin/init`.',
			'Find the chain: `systemd-analyze critical-chain --no-pager | head -8`.',
			'Pick the slowest unit on that chain and ask systemd why it waits: `systemctl show -p Wants -p After <unit>`, then `systemd-analyze critical-chain --no-pager <unit>`.'
		],
		done: [
			'You can point at the `root=` value the kernel used.',
			'The initramfs listing shows `init` (and `usr/sbin/lvm` if your root is on LVM).',
			'`readlink -f /sbin/init` prints the systemd binary, such as `/usr/lib/systemd/systemd`.',
			'You can name the unit that the slowest unit on the chain waits for, from its `After=` line.'
		],
		solution: [
			'On the test laptop, `/proc/cmdline` starts with `BOOT_IMAGE=/boot/vmlinuz-6.17.0-1033-oem root=/dev/mapper/data-root ro`, and the initramfs lists `init` and `usr/sbin/lvm`: LVM has to run before the root volume exists.',
			'`ps -p 1 -o args=` prints `/sbin/init splash` and `readlink -f /sbin/init` prints `/usr/lib/systemd/systemd`.',
			'The chain runs `NetworkManager-wait-online.service` then `network-online.target` then `docker.service` then `multi-user.target`. `systemctl show -p Wants -p After docker.service` lists `network-online.target` in both lines, which is why docker waits. Your numbers will differ from the chapter\'s from one boot to the next.'
		]
	},
	recall: {
		q: 'Name the stages of a Linux boot in order, and the first program the kernel runs as PID 1.',
		a: 'Firmware, boot loader, kernel, initramfs, then systemd from the real root. The first PID 1 is `/init` from the initramfs, which mounts root and then executes `/sbin/init` (systemd).'
	},
	sources: [
		{ title: 'bootup(7), systemd manual', url: `${MAN}/bootup.html` },
		{ title: 'systemd-analyze(1), systemd manual', url: `${MAN}/systemd-analyze.html` },
		{ title: 'Linux v6.12, Documentation/filesystems/ramfs-rootfs-initramfs.rst', url: `${LINUX}/Documentation/filesystems/ramfs-rootfs-initramfs.rst` },
		{ title: 'Linux v6.12, Documentation/admin-guide/init.rst', url: `${LINUX}/Documentation/admin-guide/init.rst` },
		{ title: 'systemd.io, Running Services After the Network Is Up', url: 'https://systemd.io/NETWORK_ONLINE/' },
		{ title: 'moby, contrib/init/systemd/docker.service', url: 'https://github.com/moby/moby/blob/3f38b15147b14ce0ce7b11558a1aa9e9f14db103/contrib/init/systemd/docker.service' }
	]
};
