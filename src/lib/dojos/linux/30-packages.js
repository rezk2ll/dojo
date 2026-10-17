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
