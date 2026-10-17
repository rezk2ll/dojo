const APT = 'https://github.com/Debian/apt/blob/6b128124271e94bdb0f4e7850d9286170d712b04';
const UPGRADE_CC = `${APT}/apt-private/private-upgrade.cc`;
const DEBSYSTEM_CC = `${APT}/apt-pkg/deb/debsystem.cc`;
const APT_CC = `${APT}/cmdline/apt.cc`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'packages',
	part: 'Le système en marche',
	title: 'Les paquets',
	minutes: 10,
	hook: [
		'Sur un serveur Ubuntu 24.04, `sudo apt-get upgrade` se termine par `The following packages have been kept back:` et `linux-image-generic`. Ce paquet dépend d’un paquet de noyau qui porte sa version dans son nom : `apt-cache depends linux-image-generic` affiche `linux-image-6.8.0-147-generic`. La mise à jour suivante du noyau arrive sous un autre nom de paquet, avec un nouveau numéro dedans.',
		'apt-get(8) précise qu’avec `upgrade`, « under no circumstances are currently installed packages removed, or packages not already installed retrieved and installed » : aucun paquet n’est retiré, aucun nouveau n’est installé. `linux-image-generic` reste donc à l’ancienne version. `apt upgrade` installe de nouveaux paquets « if required to satisfy dependencies », et `apt full-upgrade` peut aussi en retirer.',
		'La semaine suivante, ta session SSH coupe en pleine mise à jour. La commande apt suivante s’arrête sur `dpkg was interrupted, you must manually run \'sudo dpkg --configure -a\' to correct the problem.` apt l’affiche quand `/var/lib/dpkg/updates/` contient un fichier dont le nom n’est fait que de chiffres.'
	],
	terms: [
		{ term: 'dpkg', def: 'L’outil de bas niveau qui dépaquette et configure les fichiers `.deb` et note l’état de chaque paquet dans `/var/lib/dpkg/status`. Il installe ce que tu lui donnes et ne télécharge aucune dépendance.' },
		{ term: 'apt', def: 'L’outil qui lit les listes de paquets des sources de `/etc/apt/sources.list.d/`, calcule quoi installer, mettre à jour ou retirer, télécharge les paquets et appelle dpkg.' },
		{ term: 'Hold', def: 'Un état de sélection de dpkg : le paquet reste à sa version, avec « no automatic new installs, upgrades or removals » (rien d’installé, mis à jour ou retiré automatiquement). `apt-mark hold nginx` le pose, et `dpkg -l` affiche alors `hi`.' },
		{ term: 'Kept back', def: 'Un paquet installé dont une version plus récente existe, mais que la commande de mise à jour choisie n’installera pas : il faudrait un nouveau paquet, un retrait, ou le paquet est en hold.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['update["apt update : télécharge les listes de paquets"] --> cand["Version candidate pour chaque paquet"]'],
				highlight: ['update', 'cand'],
				note: '`apt update` télécharge les listes de paquets de chaque source configurée. apt connaît alors une version candidate pour chaque paquet. Rien n’est encore installé, et un `upgrade` sans `update` récent n’a aucune nouvelle version à proposer.'
			},
			{
				add: ['cand -->|"apt-get upgrade"| safe["Ni retrait, ni nouveau paquet"]', 'safe -->|"a besoin de linux-image-6.8.0-147-generic"| kept["linux-image-generic kept back"]'],
				highlight: ['safe', 'kept'],
				note: '`apt-get upgrade` tourne avec `FORBID_REMOVE_PACKAGES` et `FORBID_INSTALL_NEW_PACKAGES`. Une mise à jour qui demande un paquet pas encore installé est sautée, et apt la liste sous `The following packages have been kept back:`.'
			},
			{
				add: ['cand -->|"apt upgrade"| newok["Nouveaux paquets permis, aucun retrait"]', 'cand -->|"apt full-upgrade"| all["Nouveaux paquets et retraits permis"]'],
				highlight: ['newok', 'all'],
				note: '`apt upgrade`, ou `apt-get upgrade --with-new-pkgs`, ne garde que l’interdiction de retirer : le nouveau paquet de noyau s’installe. `full-upgrade` (`dist-upgrade` dans apt-get) permet tout et peut retirer un paquet en conflit avec une nouvelle version. Lis la liste des retraits avant de répondre `Y`.'
			},
			{
				add: ['newok --> dpkg["dpkg : dépaquette, puis configure chaque paquet"]', 'all --> dpkg', 'dpkg -->|"coupé au milieu"| dirty["Fichier dans /var/lib/dpkg/updates/ : lancer dpkg --configure -a"]'],
				highlight: ['dpkg', 'dirty'],
				note: 'apt passe les fichiers `.deb` à dpkg, qui fait passer chaque paquet de `unpacked` à `installed` en lançant son étape de configuration. Si le passage est coupé, des paquets restent `unpacked` ou `half-configured`. `dpkg --configure -a` configure « all unpacked but unconfigured packages ».'
			}
		]
	},
	example: {
		title: 'apt-private/private-upgrade.cc : ce que chaque commande de mise à jour a le droit de faire',
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
			'La ligne 6 correspond à `full-upgrade` et `dist-upgrade` : [cmdline/apt.cc](' + APT_CC + '#L92-L93) relie `full-upgrade` à `DoDistUpgrade`, qui passe `ALLOW_EVERYTHING`. Le commentaire de la ligne 3 dit qu’il « will install and remove packages at will ».',
			'Les lignes 11 à 14 correspondent à `upgrade`. L’option `APT::Get::Upgrade-Allow-New` choisit l’une des deux fonctions plus bas. `apt-get upgrade --with-new-pkgs` l’active, et la commande `apt` permet les nouveaux paquets sur `upgrade`, comme le décrit apt(8).',
			'Les lignes 24 à 26 sont le `apt-get upgrade` simple : `FORBID_REMOVE_PACKAGES` et `FORBID_INSTALL_NEW_PACKAGES` à la fois. Un méta-paquet de noyau qui demande un paquet au nom nouveau ne peut pas bouger, il apparaît donc comme kept back.',
			'La ligne 32 n’interdit que les retraits. Toutes les variantes finissent dans `UpgradeHelper`, qui calcule les changements et appelle `InstallPackages` pour afficher les listes et lancer dpkg.'
		]
	},
	tradeoff: {
		gain: [
			'`apt-get upgrade` ne retire jamais de paquet et n’en installe aucun nouveau : il ne peut pas enlever un paquet dont ton service a besoin.',
			'`apt-mark hold postgresql-16` garde un paquet à sa version à travers `upgrade` et `full-upgrade`, jusqu’à `apt-mark unhold` ou un `--ignore-hold` explicite.',
			'Le paquet `unattended-upgrades` installe les mises à jour de sécurité chaque jour via `apt-daily-upgrade.timer`, et écrit ses logs dans `/var/log/unattended-upgrades/`.'
		],
		cost: [
			'Avec seulement `apt-get upgrade`, les nouveaux noyaux et les paquets aux nouvelles dépendances restent kept back, et la machine garde de vieilles versions sans la moindre erreur.',
			'`full-upgrade` peut retirer des paquets pour résoudre un conflit. Un `Y` donné trop vite peut retirer un paquet dont ton service a besoin.',
			'Une mise à jour coupée par une session SSH perdue laisse des paquets à moitié configurés, et chaque commande apt suivante refuse de tourner avant `dpkg --configure -a`.'
		]
	},
	task: {
		prompt: 'Sur un serveur Debian : (1) `apt-get upgrade` garde en arrière `linux-image-amd64` et `nginx`. Quelle commande met les deux à jour sans rien retirer ? (2) Tu dois rester sur le `postgresql-16` actuel jusqu’au mois prochain. Quelle commande, et comment le vérifier ? (3) `dpkg -l nginx` affiche `iU`. Qu’est-ce que ça veut dire, et que lances-tu ?',
		hint: 'apt-get(8) a une option qui permet les nouveaux paquets sur `upgrade`. dpkg-query(1) explique les deux lettres : action voulue, puis état du paquet.',
		answer: [
			'(1) `apt-get upgrade --with-new-pkgs`, ou `apt upgrade`. Les deux acceptent de nouvelles dépendances, comme le nouveau paquet de noyau, et aucun ne retire de paquet. Garde `full-upgrade` pour le cas où la sortie montre un retrait nécessaire que tu as lu.',
			'(2) `apt-mark hold postgresql-16`. `apt-mark showhold` le liste, et `dpkg -l postgresql-16` commence par `hi` : action voulue Hold, état installé. Plus tard, `apt-mark unhold postgresql-16`.',
			'(3) `i` est l’action voulue Install, `U` l’état Unpacked : les fichiers sont sur le disque, l’étape de configuration n’a jamais tourné. Lance `sudo dpkg --configure -a`, puis `apt-get -f install` s’il manque encore des dépendances.'
		]
	},
	quiz: [
		{
			q: '`apt-get upgrade` liste `linux-image-generic` comme kept back. Quelle est la raison habituelle ?',
			options: [
				'Le paquet du noyau est en hold par défaut sur tous les serveurs',
				'Sa nouvelle version dépend d’un paquet qui n’est pas encore installé',
				'apt ne met jamais à jour un noyau pendant qu’il tourne',
				'La liste des paquets est périmée, il faut lancer `apt update`'
			],
			answer: 1,
			why: 'Le méta-paquet dépend d’un paquet de noyau qui porte la version dans son nom : chaque nouveau noyau est un nouveau paquet. `apt-get upgrade` interdit d’installer de nouveaux paquets (`FORBID_INSTALL_NEW_PACKAGES`), donc le méta-paquet ne peut pas bouger.'
		},
		{
			q: 'Que peut faire `apt full-upgrade` que `apt upgrade` ne fait jamais ?',
			options: [
				'Installer des paquets qui ne sont pas encore installés',
				'Mettre à jour des paquets en hold',
				'Retirer des paquets installés pour résoudre un conflit',
				'Télécharger des listes de paquets plus récentes'
			],
			answer: 2,
			why: '`full-upgrade` appelle `DoDistUpgrade` avec `ALLOW_EVERYTHING`, alors que `apt upgrade` garde `FORBID_REMOVE_PACKAGES`. Les deux peuvent installer de nouveaux paquets, aucun ne touche un paquet en hold, et seul `apt update` télécharge les listes.'
		},
		{
			q: 'Chaque commande apt affiche maintenant `dpkg was interrupted, you must manually run \'sudo dpkg --configure -a\'`. Que vérifie apt pour l’afficher ?',
			options: [
				'Un fichier au nom fait de chiffres dans `/var/lib/dpkg/updates/`',
				'Le code de sortie du dernier dpkg dans `/var/log/dpkg.log`',
				'Un fichier de verrou resté dans `/var/lib/dpkg/lock-frontend`',
				'Un paquet marqué `reinstreq` dans le cache d’apt'
			],
			answer: 0,
			why: '`debSystem::CheckUpdates()` ouvre le dossier `updates/` à côté de `/var/lib/dpkg/status` et signale un problème si un nom d’entrée n’est fait que de chiffres. Le commentaire du code appelle cet état « dirty », et apt refuse de continuer tant que dpkg n’a pas fini le travail.'
		}
	],
	recall: {
		q: 'Quelles options de mise à jour passe le `apt-get upgrade` simple, et que fait-il d’une mise à jour qui demande un nouveau paquet ?',
		a: '`FORBID_REMOVE_PACKAGES` et `FORBID_INSTALL_NEW_PACKAGES`. Le paquet est sauté et listé sous `The following packages have been kept back:`, par exemple `linux-image-generic`.'
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
