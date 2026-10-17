const XZ = 'https://github.com/tukaani-project/xz';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'supply-chain',
	part: 'Secrets and supply chain',
	title: 'Supply chain attacks',
	minutes: 10,
	hook: [
		'In March 2024, Andres Freund noticed that `ssh` logins on his Debian sid machines used a lot of CPU. A failed login to localhost took 0.807 s instead of 0.299 s. Valgrind also reported errors inside liblzma, the compression library from xz-utils.',
		'On 29 March 2024 he posted to oss-security: "The upstream xz repository and the xz tarballs have been backdoored." The backdoor was in xz 5.6.0 and 5.6.1. It became CVE-2024-3094, scored 10.0 on NVD.',
		'The release tarballs held a line in `m4/build-to-host.m4` that was not in git. The xz maintainer Lasse Collin wrote that these tarballs "were created and signed by Jia Tan", the co-maintainer. The signature was valid, because the attacker was the signer.',
		'Below: what SLSA Build levels check about how a package was built, and which part of the xz attack they would have caught.'
	],
	terms: [
		{ term: 'Provenance', def: 'A signed record of how an artifact was built: which build platform, from which source repository and commit, with which parameters.' },
		{ term: 'SLSA Build level', def: 'A rung from L0 (no guarantee) to L3 (hardened build platform) in the SLSA spec. Each level adds requirements on the provenance and the build platform.' },
		{ term: 'Release tarball', def: 'The `.tar.gz` a project publishes for each version. Debian imported the xz tarball, not the git tree, for its package. A tarball can contain files that are in no commit.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['jt["Co-maintainer Jia Tan"] -->|"commits"| git[("xz git: tests/files/bad-3-corrupt_lzma2.xz, good-large_compressed.lzma")]'],
				highlight: ['jt', 'git'],
				note: 'The bulk of the backdoor went into git as two binary "test" files, first added in commit `cf44e4b7`. Freund: the files "were not even used for any \'tests\' in 5.6.0". The trigger code was never in git.'
			},
			{
				add: ['jt -->|"builds on own machine, signs"| tar["Tarballs 5.6.0, 5.6.1: extra line in m4/build-to-host.m4"]'],
				highlight: ['tar'],
				note: 'The release tarballs carried the trigger. Freund: the line in `build-to-host.m4` "is *not* in the upstream source", and xz in git does not use that file. Freund found that the GitHub "source code" archives did not have it.'
			},
			{
				add: ['tar --> distro["Distro package build: x86-64, gcc, GNU ld, debian/rules or RPM_ARCH"]', 'distro --> sshd["sshd links liblzma through libsystemd"]'],
				highlight: ['distro', 'sshd'],
				note: 'During `configure`, the script ran only for x86-64 Linux builds with gcc and GNU ld, inside a Debian or RPM package build. It modified liblzma. Debian and other distros patch openssh to use libsystemd, which depends on liblzma.'
			},
			{
				add: ['ci["Hosted builder, Build L2: checks out git, builds, signs provenance"] --> prov["Provenance: source repo + commit"]', 'prov -.->|"tarball built elsewhere: no matching provenance"| tar'],
				highlight: ['ci', 'prov'],
				note: 'The defence. At Build L2 a hosted platform builds from the repository and signs the provenance itself. A consumer who requires that provenance rejects a tarball made on a laptop, with a file no commit contains.'
			},
			{
				add: ['git -.->|"files are in the real repo"| ci'],
				highlight: ['git'],
				note: 'The limit. The two test files came from a real maintainer through the real repository, so provenance for them is correct. The SLSA threats page says a malicious producer "cannot be directly mitigated through SLSA controls".'
			}
		]
	},
	example: {
		title: 'CMakeLists.txt: the Landlock check Jia Tan broke with one dot',
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
			'Line 1000 asks CMake to compile a small C program. If it compiles, `HAVE_LINUX_LANDLOCK` is true and line 1019 enables the Landlock sandbox for `xz`, `xzdec` and `lzmadec`.',
			'Line 1004 is a lone `.`, a C syntax error. The test program never compiles, so Landlock stays off on every CMake build. With the default `ENABLE_SANDBOX=ON`, CMake raises no error and builds without a sandbox.',
			'Jia Tan added the dot in commit `328c52da` on 26 February 2024, titled "Build: Fix Linux Landlock feature test in Autotools and CMake builds".',
			'Lasse Collin removed it in commit `f9cf4c05`: "CMake: Fix sabotaged Landlock sandbox check. It never enabled it." This change was in git and public, and provenance would show it came from the official repository.'
		]
	},
	tradeoff: {
		gain: [
			'Build L2 makes a hand-built release fail verification. The xz tarball line that no commit contains would have had no matching provenance.',
			'Build L3 keeps the provenance signing secret out of reach of the build steps. The spec: it "greatly reduces the impact of compromised package upload credentials".'
		],
		cost: [
			'The spec says Build L3 "usually requires significant changes to existing build platforms".',
			'The xz test files and the Landlock dot came through the official repository, so their provenance would be correct and verification would pass.',
			'The consumer has to check the provenance against expectations (builder, source repository, parameters). A provenance file nobody verifies stops nothing.'
		]
	},
	task: {
		prompt: 'Your expectations for package `my-package`: builder = your hosted CI at Build L3, source = `github.com/good/my-package`, `externalParameters` = `{ "workflow": "release.yml", "ref": "refs/tags/v*" }`. Four uploads arrive, each with a valid signature. A: source `github.com/evilfork/my-package`. B: everything as expected, plus an extra parameter `inputs: { "CFLAGS": "-DBACKDOOR" }`. C: no provenance, uploaded by a maintainer from a laptop. D: everything as expected. Which do you accept?',
		hint: 'The SLSA verification page lists four fields to compare and says what to do with fields you do not recognize.',
		answer: [
			'A: reject. The source repository is a fork. SLSA calls this "Build from unofficial fork of code", and the verifier rejects because the source location does not match.',
			'B: reject. The spec: "Verification tools SHOULD reject unrecognized fields in `externalParameters`". A compiler flag passed this way can change the binary without any change in git.',
			'C: reject. Without provenance from a trusted builder, the package is at Build L0 at best. The xz 5.6.0 and 5.6.1 tarballs took this path: built and signed on the maintainer’s own machine.',
			'D: accept. Accepting D tells you the package came from the official repository through the official workflow. It does not tell you the code in that repository is honest.'
		]
	},
	quiz: [
		{
			q: 'The xz 5.6.0 tarball carried a valid signature. Why did the signature not stop the backdoor?',
			options: [
				'The signature used an old algorithm that attackers can forge',
				'Distros check signatures only on major releases, not on 5.6.x',
				'The co-maintainer who planted the backdoor also signed the tarballs',
				'The tarball was signed after the backdoor was removed from it'
			],
			answer: 2,
			why: 'A signature proves who signed the file and that it did not change after signing. Lasse Collin: the 5.6.0 and 5.6.1 tarballs "were created and signed by Jia Tan", the person who added the backdoor.'
		},
		{
			q: 'Which part of the xz attack would a Build L2 provenance check have caught?',
			options: [
				'The obfuscated test files committed to the git repository',
				'The trigger line in `build-to-host.m4` that existed only in the tarball',
				'The stray dot that disabled the Landlock check in `CMakeLists.txt`',
				'The 5.6.1 commits that worked around the valgrind errors'
			],
			answer: 1,
			why: 'At Build L2 a hosted platform builds from the repository and signs the provenance. A tarball containing a file that is in no commit cannot come with matching provenance. The test files, the dot and the 5.6.1 workarounds were all in git, so a correct provenance would cover them.'
		},
		{
			q: 'What does SLSA Build L3 add on top of Build L2?',
			options: [
				'Code review of every commit by two maintainers before the build starts',
				'A reproducible build, so two builders produce identical bytes',
				'A list of all dependencies, published as an SBOM next to the package',
				'A hardened platform: runs isolated, signing secrets hidden from build steps'
			],
			answer: 3,
			why: 'The spec requires the Build L3 platform to "prevent runs from influencing one another" and to keep the provenance signing secret away from user-defined build steps. Two-person review, reproducible builds and SBOMs are not in the Build L3 requirements.'
		}
	],
	recall: {
		q: 'In xz 5.6.0 and 5.6.1, which part of the backdoor lived only in the release tarballs, and who signed them?',
		a: 'The trigger line in `m4/build-to-host.m4`, absent from git. The tarballs were created and signed by co-maintainer Jia Tan (CVE-2024-3094).'
	},
	sources: [
		{ title: 'Andres Freund, backdoor in upstream xz/liblzma leading to ssh server compromise (oss-security, 29 March 2024)', url: 'https://www.openwall.com/lists/oss-security/2024/03/29/4' },
		{ title: 'Lasse Collin, XZ Utils backdoor', url: 'https://tukaani.org/xz-backdoor/' },
		{ title: 'NVD, CVE-2024-3094', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-3094' },
		{ title: 'SLSA v1.2, Build: Track Basics', url: 'https://slsa.dev/spec/v1.2/build-track-basics' },
		{ title: 'SLSA v1.2, Threats', url: 'https://slsa.dev/spec/v1.2/threats' },
		{ title: 'SLSA v1.2, Verifying artifacts', url: 'https://slsa.dev/spec/v1.2/verifying-artifacts' },
		{ title: 'xz commit f9cf4c05, CMake: Fix sabotaged Landlock sandbox check', url: `${XZ}/commit/f9cf4c05edd14dedfe63833f8ccbe41b55823b00` }
	]
};
