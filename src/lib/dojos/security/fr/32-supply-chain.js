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
		],
		steps: [
			{
				title: 'Sache ce que tu compares',
				questions: [
					{ q: 'Que te dit une provenance sur un paquet ?', options: ['Comment il a été construit : plateforme, dépôt et commit source, paramètres', 'Qui a relu chaque commit avant le build', 'Toutes ses dépendances, avec leurs versions', 'Les CVE connues du paquet'], answer: 0, why: 'La provenance est un enregistrement signé de la construction d’un artefact. Les relectures, les listes de dépendances et les CVE relèvent d’autres outils.' },
					{ q: 'Les quatre uploads ont une signature valide. Pourquoi ça ne suffit pas pour les accepter ?', options: ['Les signatures expirent après une release', 'Une signature montre qui a signé, pas comment ni à partir de quoi le paquet a été construit', 'Seuls les builders Build L3 font des signatures valides', 'Les distributions ne vérifient que les versions majeures'], answer: 1, why: 'Les tarballs xz 5.6.0 avaient eux aussi une signature valide. La personne qui a posé la backdoor est celle qui les a signés.' },
					{ q: 'Tu attends un builder au niveau Build L3. Qu’ajoute L3 par rapport à L2 ?', options: ['Deux mainteneurs relisent chaque commit', 'Deux builders produisent les mêmes octets', 'Les exécutions sont isolées et les secrets de signature cachés aux étapes de build', 'Un SBOM est publié à côté du paquet'], answer: 2, why: 'La spec demande à la plateforme L3 d’empêcher les exécutions de s’influencer et de tenir le secret qui signe la provenance hors de portée des étapes de build.' },
					{ q: 'Quels sont les `externalParameters` attendus pour `my-package` ?', options: ['N’importe lesquels, tant que le builder est le bon', '`{ "workflow": "release.yml" }`, plus des entrées en option', '`{ "ref": "refs/heads/main" }`', '`{ "workflow": "release.yml", "ref": "refs/tags/v*" }`'], answer: 3, why: 'Tes attentes nomment le workflow et le motif de tag, rien d’autre. Tout le reste est un champ que tu ne reconnais pas.' }
				]
			},
			{
				title: 'Vérifie d’où vient chacun',
				questions: [
					{ q: 'A indique la source `github.com/evilfork/my-package`. Que fais-tu ?', options: ['J’accepte : le builder et la signature sont bons', 'Je rejette : la source ne correspond pas, c’est un build depuis un fork non officiel', 'J’accepte si le fork contient les mêmes commits', 'Je rejette seulement si le fork est privé'], answer: 1, why: 'SLSA appelle ça « Build from unofficial fork of code ». L’emplacement de la source ne correspond pas à ton attente, donc le vérificateur rejette.' },
					{ q: 'C n’a aucune provenance et a été envoyé depuis le portable d’un mainteneur. À quel niveau Build est-il, au mieux ?', options: ['L0', 'L1', 'L2', 'L3'], answer: 0, why: 'Sans provenance d’un builder de confiance, il n’y a aucune garantie sur le build. L0 est l’échelon du bas.' },
					{ q: 'Quelle partie de l’histoire xz a suivi le même chemin que C ?', options: ['Les deux fichiers de test binaires dans git', 'Les archives « source code » de GitHub', 'Les tarballs 5.6.0 et 5.6.1, construits et signés sur la machine du mainteneur', 'Le commit qui a retiré le point de Landlock'], answer: 2, why: 'Lasse Collin a écrit que ces tarballs « were created and signed by Jia Tan ». Les archives GitHub, construites depuis git, n’avaient pas la ligne de déclenchement.' },
					{ q: 'Pourquoi exiger une provenance Build L2 aurait-il attrapé la ligne de `build-to-host.m4` ?', options: ['Un builder hébergé construit depuis le dépôt, et cette ligne n’était dans aucun commit', 'L2 analyse les tarballs à la recherche de code caché', 'L2 demande la signature de deux mainteneurs', 'L2 refuse les fichiers m4 dans une release'], answer: 0, why: 'Au niveau L2, la plateforme hébergée fait le checkout du dépôt et signe elle-même la provenance. Un fichier qu’aucun commit ne contient ne peut pas avoir de provenance correspondante.' }
				]
			},
			{
				title: 'Vérifie les paramètres',
				questions: [
					{ q: 'B est conforme, avec en plus `inputs: { "CFLAGS": "-DBACKDOOR" }`. Que dit la spec d’un tel champ ?', options: ['Les vérificateurs MAY l’ignorer', 'Les vérificateurs SHOULD rejeter les champs inconnus de `externalParameters`', 'Les vérificateurs MUST le journaliser, puis accepter', 'Il n’est permis qu’au niveau Build L3'], answer: 1, why: 'La page de vérification SLSA le dit mot pour mot. Un paramètre inconnu est une raison de rejeter, pas de laisser passer.' },
					{ q: 'Pourquoi un flag de compilation en trop est-il dangereux ?', options: ['Il ralentit le build', 'Il casse la signature', 'Il peut changer le binaire sans aucun changement dans git', 'Il ne marche que sur x86-64'], answer: 2, why: 'Le code du dépôt reste propre, et le flag seul change ce qui est compilé.' },
					{ q: 'La source et le builder de B correspondent. Est-ce que B est sûr pour autant ?', options: ['Oui : la source et le builder sont ce qui compte', 'Oui, si le flag figure dans le README', 'Non : B n’a pas de signature valide', 'Non : les paramètres décident aussi de ce qui est construit'], answer: 3, why: 'Le builder, la source et les paramètres décident tous du résultat. Un seul champ faux suffit pour rejeter.' },
					{ q: 'Après A, B et C, combien d’uploads as-tu acceptés ?', options: ['Aucun', 'Seulement B', 'B et C', 'Seulement A'], answer: 0, why: 'A échoue sur la source, B sur les paramètres, C sur l’absence de provenance.' }
				]
			},
			{
				title: 'Décide et dis ce que ça prouve',
				questions: [
					{ q: 'D correspond pour le builder, la source et les paramètres. Que fais-tu ?', options: ['Je rejette : rien ne prouve que le code est honnête', 'Je l’accepte', 'J’accepte seulement après un build reproductible', 'Je demande d’abord un SBOM'], answer: 1, why: 'D remplit toutes les attentes que tu as fixées. Tout rejeter, même ce qui passe, rendrait le contrôle inutile.' },
					{ q: 'Que t’apprend le fait d’accepter D ?', options: ['Le code du dépôt est honnête', 'Aucune dépendance n’a de CVE connue', 'Il vient du dépôt officiel, par le workflow officiel', 'Deux mainteneurs ont relu chaque commit'], answer: 2, why: 'La provenance dit comment et d’où le paquet a été construit. Elle ne dit rien de l’intention du code.' },
					{ q: 'La provenance aurait-elle arrêté les fichiers de test xz et le point de Landlock ?', options: ['Non : ils sont passés par le vrai dépôt, donc leur provenance est correcte', 'Oui : ce sont des fichiers binaires', 'Oui : Build L3 les aurait cachés', 'Non : la provenance ne couvre que les builds Debian'], answer: 0, why: 'La page des menaces SLSA dit qu’un producteur malveillant « cannot be directly mitigated through SLSA controls ».' },
					{ q: 'Ta CI range une provenance à côté de chaque paquet, et aucune étape ne la lit jamais. Qu’est-ce que ça arrête ?', options: ['Les forks, puisque la source est enregistrée', 'Les builds sur portable, puisqu’ils n’ont pas de provenance', 'Les paramètres en trop, puisqu’ils sont journalisés', 'Rien : une provenance que personne ne vérifie n’arrête rien'], answer: 3, why: 'Le consommateur doit comparer la provenance à ses attentes. Sans ce contrôle, A, B et C passent.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Construire une release à la main avec un fichier qu’aucun commit ne contient, la signer, et voir la signature passer alors qu’une comparaison avec git l’attrape.',
		steps: [
			'Crée un petit projet avec un commit : `mkdir -p ~/slsa-lab && cd ~/slsa-lab && git init -q proj && cd proj && printf "int main(void){return 0;}\\n" > main.c && git add main.c && git -c user.name=me -c user.email=me@example.com commit -qm v1`.',
			'Fabrique l’archive directement depuis git : `git archive --format=tar.gz --prefix=proj/ -o ../from-git.tar.gz HEAD`.',
			'Joue le mainteneur qui construit sur son portable, avec un fichier en plus : `mkdir -p ../laptop/proj/m4 && cp main.c ../laptop/proj/ && echo "# extra line, in no commit" > ../laptop/proj/m4/build-to-host.m4 && tar -czf ../release.tar.gz -C ../laptop proj`.',
			'Signe la release du portable avec ta propre clé, puis vérifie-la : `cd .. && openssl genpkey -algorithm ed25519 -out key.pem && openssl pkey -in key.pem -pubout -out pub.pem && openssl pkeyutl -sign -inkey key.pem -rawin -in release.tar.gz -out release.sig`, puis `openssl pkeyutl -verify -pubin -inkey pub.pem -rawin -in release.tar.gz -sigfile release.sig`. Sur macOS, il faut OpenSSL 3, pas le LibreSSL livré avec le système.',
			'Compare les deux archives : `mkdir a b && tar -xzf from-git.tar.gz -C a && tar -xzf release.tar.gz -C b && diff -r a/proj b/proj`.'
		],
		done: [
			'`openssl pkeyutl -verify` affiche `Signature Verified Successfully` pour `release.tar.gz`.',
			'`diff -r a/proj b/proj` affiche `Only in b/proj: m4`.'
		],
		solution: [
			'La signature est valide, car le signataire est celui qui a ajouté le fichier. C’est la situation de xz 5.6.0 en miniature.',
			'L’archive construite depuis git n’a pas de dossier `m4`. Un builder hébergé qui fait le checkout du dépôt et signe la provenance produirait cette archive, jamais celle du portable.',
			'Côté consommateur, exige une provenance qui nomme ton builder et ton dépôt source. Une release construite ailleurs échoue, peu importe qui l’a signée.'
		]
	},
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
