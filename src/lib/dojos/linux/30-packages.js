const APT = 'https://github.com/Debian/apt/blob/6b128124271e94bdb0f4e7850d9286170d712b04';
const UPGRADE_CC = `${APT}/apt-private/private-upgrade.cc`;
const DEBSYSTEM_CC = `${APT}/apt-pkg/deb/debsystem.cc`;
const APT_CC = `${APT}/cmdline/apt.cc`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'packages',
	part: 'The running system',
	title: 'Packages',
	minutes: 10,
	hook: [
		'`sudo apt-get upgrade` on an Ubuntu 24.04 server ends with `The following packages have been kept back:` and `linux-image-generic`. That package depends on a kernel package with the version in its name: `apt-cache depends linux-image-generic` lists `linux-image-6.8.0-147-generic`. The next kernel update ships under a different package name, with a new number in it.',
		'apt-get(8) says that with `upgrade`, "under no circumstances are currently installed packages removed, or packages not already installed retrieved and installed." So `linux-image-generic` stays at its old version. `apt upgrade` installs new packages "if required to satisfy dependencies", and `apt full-upgrade` may also remove packages.',
		'Next week your SSH session drops in the middle of an upgrade. The next apt command stops with `dpkg was interrupted, you must manually run \'sudo dpkg --configure -a\' to correct the problem.` apt prints it when `/var/lib/dpkg/updates/` holds a file whose name is only digits.'
	],
	terms: [
		{ term: 'dpkg', def: 'The low-level tool that unpacks and configures `.deb` files and records each package\'s state in `/var/lib/dpkg/status`. It installs what you give it and does not download dependencies.' },
		{ term: 'apt', def: 'The front end that reads package lists from the sources in `/etc/apt/sources.list.d/`, works out which packages to install, upgrade or remove, downloads them and calls dpkg.' },
		{ term: 'Hold', def: 'A dpkg selection state: the package stays at its version, with "no automatic new installs, upgrades or removals". `apt-mark hold nginx` sets it, and `dpkg -l` then shows `hi`.' },
		{ term: 'Kept back', def: 'An installed package with a newer version that the chosen upgrade command will not install, because it would need a new package, a removal, or the package is on hold.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['update["apt update: download package lists"] --> cand["Candidate version for each package"]'],
				highlight: ['update', 'cand'],
				note: '`apt update` downloads the package lists of every configured source. apt then knows a candidate version for each package. Nothing is installed yet, and `upgrade` without a recent `update` has no new versions to offer.'
			},
			{
				add: ['cand -->|"apt-get upgrade"| safe["No removals, no new packages"]', 'safe -->|"needs linux-image-6.8.0-147-generic"| kept["linux-image-generic kept back"]'],
				highlight: ['safe', 'kept'],
				note: '`apt-get upgrade` runs with `FORBID_REMOVE_PACKAGES` and `FORBID_INSTALL_NEW_PACKAGES`. An upgrade that needs a package not yet installed is skipped, and apt lists it under `The following packages have been kept back:`.'
			},
			{
				add: ['cand -->|"apt upgrade"| newok["New packages allowed, no removals"]', 'cand -->|"apt full-upgrade"| all["New packages and removals allowed"]'],
				highlight: ['newok', 'all'],
				note: '`apt upgrade`, or `apt-get upgrade --with-new-pkgs`, keeps only the ban on removals, so the new kernel package gets installed. `full-upgrade` (`dist-upgrade` in apt-get) allows everything and may remove a package that conflicts with a new version. Read the removal list before you answer `Y`.'
			},
			{
				add: ['newok --> dpkg["dpkg: unpack, then configure each package"]', 'all --> dpkg', 'dpkg -->|"cut in the middle"| dirty["Journal file in /var/lib/dpkg/updates/: run dpkg --configure -a"]'],
				highlight: ['dpkg', 'dirty'],
				note: 'apt hands the `.deb` files to dpkg, which moves each package from `unpacked` to `installed` by running its configure step. If the run is cut, packages stay `unpacked` or `half-configured`. `dpkg --configure -a` configures "all unpacked but unconfigured packages".'
			}
		]
	},
	example: {
		title: 'apt-private/private-upgrade.cc: what each upgrade command is allowed to do',
		repo: 'Debian/apt',
		url: `${UPGRADE_CC}#L49-L81`,
		lang: 'cpp',
		code: `// DoDistUpgrade - Automatic smart upgrader				/*{{{*/
// ---------------------------------------------------------------------
/* Intelligent upgrader that will install and remove packages at will */
bool DoDistUpgrade(CommandLine &CmdL)
{
   return UpgradeHelper(CmdL, APT::Upgrade::ALLOW_EVERYTHING);
}
									/*}}}*/
bool DoUpgrade(CommandLine &CmdL)					/*{{{*/
{
   if (_config->FindB("APT::Get::Upgrade-Allow-New", false) == true)
      return DoUpgradeWithAllowNewPackages(CmdL);
   else
      return DoUpgradeNoNewPackages(CmdL);
}
									/*}}}*/
// DoUpgradeNoNewPackages - Upgrade all packages			/*{{{*/
// ---------------------------------------------------------------------
/* Upgrade all packages without installing new packages or erasing old
   packages */
bool DoUpgradeNoNewPackages(CommandLine &CmdL)
{
   // Do the upgrade
   return UpgradeHelper(CmdL, 
                        APT::Upgrade::FORBID_REMOVE_PACKAGES|
                        APT::Upgrade::FORBID_INSTALL_NEW_PACKAGES);
}
									/*}}}*/
// DoSafeUpgrade - Upgrade all packages with install but not remove	/*{{{*/
bool DoUpgradeWithAllowNewPackages(CommandLine &CmdL)
{
   return UpgradeHelper(CmdL, APT::Upgrade::FORBID_REMOVE_PACKAGES);
}`,
		notes: [
			'Line 6 is `full-upgrade` and `dist-upgrade`: [cmdline/apt.cc](' + APT_CC + '#L92-L93) maps `full-upgrade` to `DoDistUpgrade`, which passes `ALLOW_EVERYTHING`. The comment on line 3 says it "will install and remove packages at will".',
			'Lines 11 to 14 are `upgrade`. The option `APT::Get::Upgrade-Allow-New` picks one of the two functions below it. `apt-get upgrade --with-new-pkgs` sets it, and the `apt` command allows new packages on `upgrade` as apt(8) describes.',
			'Lines 24 to 26 are plain `apt-get upgrade`: both `FORBID_REMOVE_PACKAGES` and `FORBID_INSTALL_NEW_PACKAGES`. A kernel meta-package that needs a newly named kernel package cannot move, so it shows up as kept back.',
			'Line 32 forbids only removals. Every variant ends in `UpgradeHelper`, which computes the changes and calls `InstallPackages` to print the lists and run dpkg.'
		]
	},
	tradeoff: {
		gain: [
			'`apt-get upgrade` never removes a package or installs a new one, so it cannot take away a package your service needs.',
			'`apt-mark hold postgresql-16` keeps a package at its version through `upgrade` and `full-upgrade`, until `apt-mark unhold` or an explicit `--ignore-hold`.',
			'The `unattended-upgrades` package installs security updates every day through `apt-daily-upgrade.timer`, and logs to `/var/log/unattended-upgrades/`.'
		],
		cost: [
			'With only `apt-get upgrade`, new kernels and packages with new dependencies stay kept back, and the machine runs old versions without an error.',
			'`full-upgrade` can remove packages to solve a conflict. A careless `Y` can remove a package your service needs.',
			'An upgrade cut by a dropped SSH session leaves packages half-configured, and every later apt command refuses to run until `dpkg --configure -a`.'
		]
	},
	task: {
		prompt: 'On a Debian server: (1) `apt-get upgrade` keeps back `linux-image-amd64` and `nginx`. Which command upgrades both without removing anything? (2) You must stay on the current `postgresql-16` until next month. Which command, and how do you check it? (3) `dpkg -l nginx` shows `iU`. What does it mean, and what do you run?',
		hint: 'apt-get(8) has an option that allows new packages on `upgrade`. dpkg-query(1) explains the two letters: desired action, then package status.',
		answer: [
			'(1) `apt-get upgrade --with-new-pkgs`, or `apt upgrade`. Both allow new dependencies, such as the new kernel package, and neither removes a package. Use `full-upgrade` only if the output shows a needed removal you have read.',
			'(2) `apt-mark hold postgresql-16`. `apt-mark showhold` lists it, and `dpkg -l postgresql-16` starts with `hi`: desired action Hold, status installed. Later, `apt-mark unhold postgresql-16`.',
			'(3) `i` is the desired action Install, `U` is the status Unpacked: the files are on disk, the configure step never ran. Run `sudo dpkg --configure -a`, then `apt-get -f install` if dependencies are still missing.'
		],
		steps: [
			{
				title: 'Read the kept-back list',
				questions: [
					{ q: 'Why does `apt-get upgrade` keep back `linux-image-amd64`?', options: ['Its new version needs a kernel package that is not installed yet', 'apt never upgrades the running kernel', 'Kernel packages are on hold by default', 'The package lists are too old'], answer: 0, why: 'The meta-package depends on a kernel package with the version in its name, so a new kernel is a new package.' },
					{ q: 'Which flags does plain `apt-get upgrade` pass?', options: ['`ALLOW_EVERYTHING`', '`FORBID_REMOVE_PACKAGES` only', '`FORBID_INSTALL_NEW_PACKAGES` only', '`FORBID_REMOVE_PACKAGES` and `FORBID_INSTALL_NEW_PACKAGES`'], answer: 3, why: '`DoUpgradeNoNewPackages` forbids both, so an upgrade that needs a new package is skipped.' },
					{ q: '`nginx` is kept back too. What is a likely reason?', options: ['nginx is always held', 'Its new version needs a package that is not installed yet', 'nginx is running, so it cannot be upgraded', 'nginx comes from another source'], answer: 1, why: 'Plain `apt-get upgrade` will not install a new package, so an upgrade that needs one is kept back. The task\'s fix, which allows new packages, then upgrades it.' },
					{ q: 'Does a kept-back package print an error?', options: ['Yes, apt exits with an error', 'Yes, at the next boot', 'No: the machine just runs the old version', 'Only in `/var/log/dpkg.log`'], answer: 2, why: 'The chapter warns about this cost: the old versions stay, with no error.' }
				]
			},
			{
				title: 'Upgrade without removing',
				questions: [
					{ q: 'Which command upgrades both and removes nothing?', options: ['`apt-get upgrade --with-new-pkgs`', '`apt-get dist-upgrade`', '`apt full-upgrade`', '`apt-get install --reinstall nginx`'], answer: 0, why: 'It sets `APT::Get::Upgrade-Allow-New`, which keeps only `FORBID_REMOVE_PACKAGES`.' },
					{ q: 'Which other command does the same?', options: ['`apt-get upgrade`', '`apt upgrade`', '`apt full-upgrade`', '`dpkg --configure -a`'], answer: 1, why: 'apt(8): `apt upgrade` installs new packages "if required to satisfy dependencies", and never removes one.' },
					{ q: 'What can `full-upgrade` do that these two never do?', options: ['Install new packages', 'Upgrade held packages', 'Download package lists', 'Remove installed packages to solve a conflict'], answer: 3, why: '`full-upgrade` calls `DoDistUpgrade` with `ALLOW_EVERYTHING`.' },
					{ q: 'When is `full-upgrade` the right choice?', options: ['Always, it is the most complete', 'When the output shows a needed removal you have read', 'Never on a server', 'Only after `apt-mark hold`'], answer: 1, why: 'A careless `Y` can remove a package your service needs, so read the removal list first.' }
				]
			},
			{
				title: 'Hold PostgreSQL',
				questions: [
					{ q: 'Which command keeps `postgresql-16` at its version?', options: ['`apt-get remove --keep postgresql-16`', '`dpkg --pin postgresql-16`', '`apt-mark hold postgresql-16`', '`apt-get upgrade --exclude postgresql-16`'], answer: 2, why: 'A hold means "no automatic new installs, upgrades or removals" for that package.' },
					{ q: 'Does the hold survive `apt full-upgrade`?', options: ['Yes, unless you pass `--ignore-hold`', 'No: `full-upgrade` allows everything', 'Only until the next `apt update`', 'Only with `apt-get`, not with `apt`'], answer: 0, why: 'It holds through `upgrade` and `full-upgrade`, until `apt-mark unhold` or an explicit `--ignore-hold`.' },
					{ q: 'How do you check the hold?', options: ['`apt-cache policy` only', '`systemctl status postgresql`', '`cat /etc/apt/sources.list`', '`apt-mark showhold`, or `dpkg -l` starting with `hi`'], answer: 3, why: '`showhold` lists held packages. In `hi`, `h` is the desired action Hold and `i` the status installed.' },
					{ q: 'Next month, how do you release it?', options: ['`apt-mark auto postgresql-16`', '`apt-mark unhold postgresql-16`', '`dpkg --purge postgresql-16`', '`apt-get autoremove`'], answer: 1, why: '`unhold` clears the selection, and the next upgrade can move the package again.' }
				]
			},
			{
				title: 'Fix the `iU` package',
				questions: [
					{ q: 'In `iU`, what are the two letters?', options: ['Installed and Upgraded', 'Ignored and Unknown', 'The desired action Install, then the status Unpacked', 'The status Installed, then the action Update'], answer: 2, why: 'dpkg-query(1) explains it: the desired action first, then the package status.' },
					{ q: 'What does `Unpacked` mean for nginx?', options: ['The files are on disk, but the configure step never ran', 'The package is removed but its config stays', 'The download is incomplete', 'The package is on hold'], answer: 0, why: 'dpkg moves a package from `unpacked` to `installed` by running its configure step. A cut run leaves it halfway.' },
					{ q: 'Which command finishes the job?', options: ['`apt-get clean`', '`dpkg --remove nginx`', '`apt update`', '`sudo dpkg --configure -a`'], answer: 3, why: 'It configures "all unpacked but unconfigured packages".' },
					{ q: 'Dependencies are still missing afterwards. What next?', options: ['`apt-get -f install`', '`apt-mark hold nginx`', '`dpkg --unpack nginx`', 'A reboot'], answer: 0, why: 'The task\'s answer runs `apt-get -f install` when dependencies are still missing after the configure step.' }
				]
			}
		]
	},
	quiz: [
		{
			q: '`apt-get upgrade` lists `linux-image-generic` as kept back. What is the usual reason?',
			options: [
				'The kernel package is on hold by default on every server',
				'Its new version depends on a package that is not installed yet',
				'apt never upgrades a kernel while that kernel is running',
				'The package list is out of date, so you must run `apt update`'
			],
			answer: 1,
			why: 'The meta-package depends on a kernel package with the version in its name, so each new kernel is a new package. `apt-get upgrade` forbids installing new packages (`FORBID_INSTALL_NEW_PACKAGES`), so the meta-package cannot move.'
		},
		{
			q: 'What can `apt full-upgrade` do that `apt upgrade` never does?',
			options: [
				'Install packages that are not installed yet',
				'Upgrade packages that are on hold',
				'Remove installed packages to resolve a conflict',
				'Download newer package lists from the sources'
			],
			answer: 2,
			why: '`full-upgrade` calls `DoDistUpgrade` with `ALLOW_EVERYTHING`, while `apt upgrade` keeps `FORBID_REMOVE_PACKAGES`. Both may install new packages, neither upgrades a held package, and only `apt update` downloads lists.'
		},
		{
			q: 'Every apt command now prints `dpkg was interrupted, you must manually run \'sudo dpkg --configure -a\'`. What does apt check to print this?',
			options: [
				'A file whose name is only digits in `/var/lib/dpkg/updates/`',
				'The exit code of the last dpkg run in `/var/log/dpkg.log`',
				'A lock file left in `/var/lib/dpkg/lock-frontend`',
				'A package marked `reinstreq` in the apt cache'
			],
			answer: 0,
			why: '`debSystem::CheckUpdates()` opens the `updates/` directory next to `/var/lib/dpkg/status` and reports damage if any entry name is all digits. The code comment calls that state "dirty", and apt refuses to go on until dpkg has finished the job.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Build a tiny `.deb`, leave it half installed, put it on hold, and trigger the `dpkg was interrupted` message, all in a throwaway container with no network.',
		steps: [
			'Start a container: `docker run --rm -it --network none debian:12-slim bash`. Everything below runs inside it.',
			'Build a package: `mkdir -p /tmp/hello/DEBIAN /tmp/hello/usr/local/bin`, then `printf "Package: dojo-hello\\nVersion: 1.0\\nArchitecture: all\\nMaintainer: lab <lab@example.invalid>\\nDescription: lab package\\n" > /tmp/hello/DEBIAN/control`, then `dpkg-deb --build /tmp/hello /tmp/dojo-hello_1.0_all.deb`.',
			'Unpack it without configuring: `dpkg --unpack /tmp/dojo-hello_1.0_all.deb`, then `dpkg -l dojo-hello | tail -1`. Finish with `dpkg --configure -a` and look again.',
			'Hold it: `apt-mark hold dojo-hello`, `apt-mark showhold`, `dpkg -l dojo-hello | tail -1`, then `apt-mark unhold dojo-hello`.',
			'Fake an interrupted run the way apt detects one: `touch /var/lib/dpkg/updates/0001`, then `apt-get check; echo $?`. Repair with `dpkg --configure -a`, run `apt-get check` again, and leave with `exit`.'
		],
		done: [
			'After `--unpack`, `dpkg -l` shows `iU  dojo-hello`. After `--configure -a`, it prints `Setting up dojo-hello (1.0) ...` and shows `ii`.',
			'After the hold, `showhold` lists `dojo-hello` and `dpkg -l` shows `hi`.',
			'With the digits-only file, `apt-get check` prints `E: dpkg was interrupted, you must manually run \'dpkg --configure -a\' to correct the problem.` and exits with 100.',
			'After `dpkg --configure -a`, `/var/lib/dpkg/updates/` is empty and `apt-get check` exits with 0.'
		],
		solution: [
			'`--unpack` is the first half of an install: the files land on disk and the status is Unpacked. A dropped SSH session in the middle of `apt upgrade` leaves packages in the same state.',
			'`hi` reads as desired action Hold, status installed. The hold lives in dpkg\'s selections, so both `apt` and `apt-get` respect it.',
			'apt does not look at the packages to print the message. It only checks for an all-digits name in `/var/lib/dpkg/updates/`, as `debSystem::CheckUpdates()` does, and `dpkg --configure -a` clears that journal.'
		]
	},
	recall: {
		q: 'Which upgrade flags does plain `apt-get upgrade` pass, and what does it do with an upgrade that needs a new package?',
		a: '`FORBID_REMOVE_PACKAGES` and `FORBID_INSTALL_NEW_PACKAGES`. The package is skipped and listed under `The following packages have been kept back:`, for example `linux-image-generic`.'
	},
	sources: [
		{ title: 'apt-get(8)', url: 'https://manpages.debian.org/trixie/apt/apt-get.8.en.html' },
		{ title: 'apt(8)', url: 'https://manpages.debian.org/trixie/apt/apt.8.en.html' },
		{ title: 'apt-mark(8)', url: 'https://manpages.debian.org/trixie/apt/apt-mark.8.en.html' },
		{ title: 'dpkg(1)', url: 'https://manpages.debian.org/trixie/dpkg/dpkg.1.en.html' },
		{ title: 'dpkg-query(1)', url: 'https://manpages.debian.org/trixie/dpkg/dpkg-query.1.en.html' },
		{ title: 'Debian Wiki, UnattendedUpgrades', url: 'https://wiki.debian.org/UnattendedUpgrades' },
		{ title: 'apt source, apt-pkg/deb/debsystem.cc', url: DEBSYSTEM_CC }
	]
};
