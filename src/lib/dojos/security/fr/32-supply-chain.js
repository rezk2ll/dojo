const XZ = 'https://github.com/tukaani-project/xz';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'supply-chain',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'Les attaques sur la chaîne d’approvisionnement',
	minutes: 10,
	hook: [
		'En mars 2024, Andres Freund remarque que les connexions `ssh` sur ses machines Debian sid consomment beaucoup de CPU. Une connexion refusée vers localhost prend 0,807 s au lieu de 0,299 s. Valgrind signale aussi des erreurs dans liblzma, la bibliothèque de compression de xz-utils.',
		'Le 29 mars 2024, il écrit sur oss-security : « The upstream xz repository and the xz tarballs have been backdoored. » La porte dérobée se trouve dans xz 5.6.0 et 5.6.1. Elle reçoit le numéro CVE-2024-3094, avec un score de 10.0 sur NVD.',
		'Les tarballs de release contenaient une ligne de `m4/build-to-host.m4` absente de git. Lasse Collin, le mainteneur de xz, écrit que ces tarballs « were created and signed by Jia Tan », le co-mainteneur. La signature était valide : l’attaquant était le signataire.',
		'Ensuite : ce que vérifient les niveaux SLSA Build sur la façon dont un paquet a été construit, et quelle partie de l’attaque xz ils auraient arrêtée.'
	],
	terms: [
		{ term: 'Provenance', def: 'Un enregistrement signé de la construction d’un artefact : quelle plateforme de build, depuis quel dépôt et quel commit, avec quels paramètres.' },
		{ term: 'Niveau SLSA Build', def: 'Un échelon de la spec SLSA, de L0 (aucune garantie) à L3 (plateforme de build durcie). Chaque niveau ajoute des exigences sur la provenance et sur la plateforme.' },
		{ term: 'Tarball de release', def: 'Le `.tar.gz` qu’un projet publie pour chaque version. Debian a importé le tarball de xz, et non l’arbre git, pour son paquet. Un tarball peut contenir des fichiers qu’aucun commit ne contient.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['jt["Co-mainteneur Jia Tan"] -->|"commite"| git[("git de xz : tests/files/bad-3-corrupt_lzma2.xz, good-large_compressed.lzma")]'],
				highlight: ['jt', 'git'],
				note: 'L’essentiel de la porte dérobée entre dans git sous forme de deux fichiers binaires de « test », ajoutés d’abord dans le commit `cf44e4b7`. Freund : ces fichiers « were not even used for any \'tests\' in 5.6.0 ». Le code déclencheur, lui, n’a jamais été dans git.'
			},
			{
				add: ['jt -->|"construit sur sa machine, signe"| tar["Tarballs 5.6.0, 5.6.1 : ligne en plus dans m4/build-to-host.m4"]'],
				highlight: ['tar'],
				note: 'Les tarballs de release portaient le déclencheur. Freund : la ligne de `build-to-host.m4` « is *not* in the upstream source », et xz n’utilise pas ce fichier dans git. Freund a constaté que les archives « source code » de GitHub ne l’avaient pas.'
			},
			{
				add: ['tar --> distro["Build de paquet distro : x86-64, gcc, GNU ld, debian/rules ou RPM_ARCH"]', 'distro --> sshd["sshd charge liblzma via libsystemd"]'],
				highlight: ['distro', 'sshd'],
				note: 'Pendant `configure`, le script ne s’active que sur Linux x86-64 avec gcc et GNU ld, dans un build de paquet Debian ou RPM. Il modifie alors liblzma. Debian et d’autres distros patchent openssh pour utiliser libsystemd, qui dépend de liblzma.'
			},
			{
				add: ['ci["Builder hébergé, Build L2 : checkout git, build, provenance signée"] --> prov["Provenance : dépôt source + commit"]', 'prov -.->|"tarball construit ailleurs : aucune provenance qui colle"| tar'],
				highlight: ['ci', 'prov'],
				note: 'La défense. Au niveau Build L2, une plateforme hébergée construit depuis le dépôt et signe elle-même la provenance. Si tu exiges cette provenance, tu rejettes un tarball fabriqué sur un portable avec un fichier qu’aucun commit ne contient.'
			},
			{
				add: ['git -.->|"fichiers présents dans le vrai dépôt"| ci'],
				highlight: ['git'],
				note: 'La limite. Les deux fichiers de test venaient d’un vrai mainteneur, par le vrai dépôt, donc leur provenance est correcte. La page des menaces SLSA dit qu’un producteur malveillant « cannot be directly mitigated through SLSA controls ».'
			}
		]
	},
	example: {
		title: 'CMakeLists.txt : le test Landlock que Jia Tan a cassé avec un point',
		repo: 'tukaani-project/xz',
		url: `${XZ}/blob/af071ef7702debef4f1d324616a0137a5001c14c/CMakeLists.txt#L995-L1020`,
		lang: 'cmake',
		code: `# Sandboxing: Landlock
if(NOT SANDBOX_FOUND AND ENABLE_SANDBOX MATCHES "^ON$|^landlock$")
    # A compile check is done here because some systems have
    # linux/landlock.h, but do not have the syscalls defined
    # in order to actually use Linux Landlock.
    check_c_source_compiles("
        #include <linux/landlock.h>
        #include <sys/syscall.h>
        #include <sys/prctl.h>
.
        void my_sandbox(void)
        {
            (void)prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0);
            (void)SYS_landlock_create_ruleset;
            (void)SYS_landlock_restrict_self;
            (void)LANDLOCK_CREATE_RULESET_VERSION;
            return;
        }

        int main(void) { return 0; }
        "
    HAVE_LINUX_LANDLOCK)

    if(HAVE_LINUX_LANDLOCK)
        set(SANDBOX_COMPILE_DEFINITION "HAVE_LINUX_LANDLOCK")
        set(SANDBOX_FOUND ON)`,
		notes: [
			'La ligne 1000 demande à CMake de compiler un petit programme C. S’il compile, `HAVE_LINUX_LANDLOCK` est vrai et la ligne 1019 active le bac à sable Landlock pour `xz`, `xzdec` et `lzmadec`.',
			'La ligne 1004 contient un `.` tout seul, une erreur de syntaxe C. Le programme de test ne compile jamais, et Landlock reste coupé sur tous les builds CMake. Avec la valeur par défaut `ENABLE_SANDBOX=ON`, CMake ne lève aucune erreur et construit sans bac à sable.',
			'Jia Tan a ajouté ce point dans le commit `328c52da` du 26 février 2024, intitulé « Build: Fix Linux Landlock feature test in Autotools and CMake builds ».',
			'Lasse Collin l’a retiré dans le commit `f9cf4c05` : « CMake: Fix sabotaged Landlock sandbox check. It never enabled it. » Ce changement était public, dans git, et une provenance aurait montré qu’il venait du dépôt officiel.'
		]
	},
	tradeoff: {
		gain: [
			'Au niveau Build L2, une release construite à la main échoue à la vérification. La ligne du tarball xz qu’aucun commit ne contient n’aurait eu aucune provenance correspondante.',
			'Au niveau Build L3, le secret qui signe la provenance reste hors de portée des étapes de build. La spec : cela « greatly reduces the impact of compromised package upload credentials ».'
		],
		cost: [
			'La spec prévient que Build L3 « usually requires significant changes to existing build platforms ».',
			'Les fichiers de test de xz et le point de Landlock sont passés par le dépôt officiel : leur provenance aurait été correcte et la vérification serait passée.',
			'Le consommateur doit comparer la provenance à ses attentes (builder, dépôt source, paramètres). Un fichier de provenance que personne ne vérifie n’arrête rien.'
		]
	},
	task: {
		prompt: 'Tes attentes pour le paquet `my-package` : builder = ta CI hébergée au niveau Build L3, source = `github.com/good/my-package`, `externalParameters` = `{ "workflow": "release.yml", "ref": "refs/tags/v*" }`. Quatre uploads arrivent, chacun avec une signature valide. A : source `github.com/evilfork/my-package`. B : tout est conforme, plus un paramètre en trop `inputs: { "CFLAGS": "-DBACKDOOR" }`. C : aucune provenance, envoyé par un mainteneur depuis son portable. D : tout est conforme. Lesquels acceptes-tu ?',
		hint: 'La page de vérification SLSA liste quatre champs à comparer et dit quoi faire d’un champ inconnu.',
		answer: [
			'A : rejeté. Le dépôt source est un fork. SLSA appelle ça « Build from unofficial fork of code », et le vérificateur rejette parce que l’emplacement de la source ne correspond pas.',
			'B : rejeté. La spec : « Verification tools SHOULD reject unrecognized fields in `externalParameters` ». Un flag de compilation passé ainsi peut changer le binaire sans aucun changement dans git.',
			'C : rejeté. Sans provenance d’un builder de confiance, le paquet est au mieux au niveau Build L0. Les tarballs xz 5.6.0 et 5.6.1 ont suivi ce chemin : construits et signés sur la machine du mainteneur.',
			'D : accepté. Tu sais alors que le paquet vient du dépôt officiel, par le workflow officiel. Tu ne sais pas si le code de ce dépôt est honnête.'
		]
	},
	quiz: [
		{
			q: 'Le tarball de xz 5.6.0 portait une signature valide. Pourquoi la signature n’a-t-elle pas arrêté la porte dérobée ?',
			options: [
				'La signature utilisait un vieil algorithme que les attaquants savent forger',
				'Les distros ne vérifient les signatures que sur les versions majeures',
				'Le co-mainteneur qui a posé la porte dérobée a aussi signé les tarballs',
				'Le tarball a été signé après le retrait de la porte dérobée'
			],
			answer: 2,
			why: 'Une signature prouve qui a signé le fichier et qu’il n’a pas changé depuis. Lasse Collin : les tarballs 5.6.0 et 5.6.1 « were created and signed by Jia Tan », la personne qui a ajouté la porte dérobée.'
		},
		{
			q: 'Quelle partie de l’attaque xz une vérification de provenance Build L2 aurait-elle arrêtée ?',
			options: [
				'Les fichiers de test obscurcis commités dans le dépôt git',
				'La ligne déclencheur de `build-to-host.m4`, présente seulement dans le tarball',
				'Le point égaré qui désactivait le test Landlock dans `CMakeLists.txt`',
				'Les commits de 5.6.1 qui contournaient les erreurs valgrind'
			],
			answer: 1,
			why: 'Au niveau Build L2, une plateforme hébergée construit depuis le dépôt et signe la provenance. Un tarball qui contient un fichier absent de tout commit ne peut pas avoir de provenance correspondante. Les fichiers de test, le point et les contournements de 5.6.1 étaient dans git, donc une provenance correcte les couvrirait.'
		},
		{
			q: 'Qu’ajoute SLSA Build L3 par rapport à Build L2 ?',
			options: [
				'Une revue de chaque commit par deux mainteneurs avant le build',
				'Un build reproductible, où deux builders produisent les mêmes octets',
				'La liste de toutes les dépendances, publiée en SBOM à côté du paquet',
				'Une plateforme durcie : runs isolés, secrets de signature cachés du build'
			],
			answer: 3,
			why: 'La spec exige que la plateforme Build L3 puisse « prevent runs from influencing one another » et tienne le secret de signature de la provenance loin des étapes de build écrites par l’utilisateur. La revue à deux, le build reproductible et le SBOM ne font pas partie des exigences de Build L3.'
		}
	],
	recall: {
		q: 'Dans xz 5.6.0 et 5.6.1, quelle partie de la porte dérobée n’existait que dans les tarballs de release, et qui les a signés ?',
		a: 'La ligne déclencheur de `m4/build-to-host.m4`, absente de git. Les tarballs ont été créés et signés par le co-mainteneur Jia Tan (CVE-2024-3094).'
	},
	sources: [
		{ title: 'Andres Freund, backdoor in upstream xz/liblzma leading to ssh server compromise (oss-security, 29 mars 2024)', url: 'https://www.openwall.com/lists/oss-security/2024/03/29/4' },
		{ title: 'Lasse Collin, XZ Utils backdoor', url: 'https://tukaani.org/xz-backdoor/' },
		{ title: 'NVD, CVE-2024-3094', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-3094' },
		{ title: 'SLSA v1.2, Build: Track Basics', url: 'https://slsa.dev/spec/v1.2/build-track-basics' },
		{ title: 'SLSA v1.2, Threats', url: 'https://slsa.dev/spec/v1.2/threats' },
		{ title: 'SLSA v1.2, Verifying artifacts', url: 'https://slsa.dev/spec/v1.2/verifying-artifacts' },
		{ title: 'Commit xz f9cf4c05, CMake: Fix sabotaged Landlock sandbox check', url: `${XZ}/commit/f9cf4c05edd14dedfe63833f8ccbe41b55823b00` }
	]
};
