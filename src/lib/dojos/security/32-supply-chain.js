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
		],
		steps: [
			{
				title: 'Know what you compare',
				questions: [
					{ q: 'What does a provenance record tell you about a package?', options: ['How it was built: platform, source repo and commit, parameters', 'Who reviewed each commit before the build', 'Every dependency it uses, with versions', 'The known CVEs in the package'], answer: 0, why: 'Provenance is a signed record of how an artifact was built. Reviews, dependency lists and CVEs are other tools.' },
					{ q: 'All four uploads have a valid signature. Why is that not enough to accept them?', options: ['Signatures expire after one release', 'A signature shows who signed, not how or from what it was built', 'Only Build L3 builders can make valid signatures', 'Distros check signatures on major releases only'], answer: 1, why: 'The xz 5.6.0 tarballs had a valid signature too. The person who planted the backdoor was the one who signed them.' },
					{ q: 'You expect a builder at Build L3. What does L3 add on top of L2?', options: ['Two maintainers review every commit', 'Two builders produce identical bytes', 'Runs are isolated and signing secrets are hidden from build steps', 'An SBOM is published next to the package'], answer: 2, why: 'The spec asks the L3 platform to keep runs from influencing one another and to keep the provenance signing secret away from user-defined build steps.' },
					{ q: 'What are the expected `externalParameters` for `my-package`?', options: ['Anything, as long as the builder is right', '`{ "workflow": "release.yml" }`, plus any extra inputs', '`{ "ref": "refs/heads/main" }`', '`{ "workflow": "release.yml", "ref": "refs/tags/v*" }`'], answer: 3, why: 'Your expectations name the workflow and the tag pattern, and nothing else. Anything more is a field you do not recognize.' }
				]
			},
			{
				title: 'Check where each one came from',
				questions: [
					{ q: 'A says source `github.com/evilfork/my-package`. What do you do?', options: ['Accept: the builder and signature are fine', 'Reject: the source does not match, a build from an unofficial fork', 'Accept, if the fork holds the same commits', 'Reject only if the fork is private'], answer: 1, why: 'SLSA calls this "Build from unofficial fork of code". The source location does not match your expectation, so the verifier rejects it.' },
					{ q: 'C has no provenance and was uploaded from a maintainer’s laptop. Which Build level is it at, at best?', options: ['L0', 'L1', 'L2', 'L3'], answer: 0, why: 'Without provenance from a trusted builder, there is no build guarantee at all. L0 is the bottom rung.' },
					{ q: 'Which part of the xz story took the same path as C?', options: ['The two binary test files in git', 'The GitHub "source code" archives', 'The 5.6.0 and 5.6.1 tarballs, built and signed on the maintainer’s own machine', 'The commit that removed the Landlock dot'], answer: 2, why: 'Lasse Collin wrote that those tarballs "were created and signed by Jia Tan". The GitHub archives, built from git, did not have the trigger line.' },
					{ q: 'Why would requiring Build L2 provenance have caught the `build-to-host.m4` line?', options: ['A hosted builder builds from the repo, and that line was in no commit', 'L2 scans tarballs for hidden code', 'L2 needs two maintainers to sign', 'L2 refuses m4 files in a release'], answer: 0, why: 'At L2 the hosted platform checks out the repository and signs the provenance itself. A file that no commit contains cannot come with matching provenance.' }
				]
			},
			{
				title: 'Check the parameters',
				questions: [
					{ q: 'B matches everything, plus `inputs: { "CFLAGS": "-DBACKDOOR" }`. What does the spec say about such a field?', options: ['Verifiers MAY ignore it', 'Verifiers SHOULD reject unrecognized fields in `externalParameters`', 'Verifiers MUST log it, then accept', 'It is only allowed at Build L3'], answer: 1, why: 'The SLSA verification page says exactly that. An unknown parameter is a reason to reject, not to wave through.' },
					{ q: 'Why is an extra compiler flag dangerous?', options: ['It slows the build down', 'It breaks the signature', 'It can change the binary without any change in git', 'It only works on x86-64'], answer: 2, why: 'The code in the repository stays clean, and the flag alone changes what gets compiled.' },
					{ q: 'B’s source and builder both match. Does that make B safe?', options: ['Yes: source and builder are what count', 'Yes, if the flag is in the README', 'No: B has no valid signature', 'No: the parameters also shape what gets built'], answer: 3, why: 'Builder, source and parameters all decide the result. One wrong field is enough to reject.' },
					{ q: 'After A, B and C, how many uploads have you accepted?', options: ['None', 'Only B', 'B and C', 'Only A'], answer: 0, why: 'A fails on the source, B on the parameters, C on the missing provenance.' }
				]
			},
			{
				title: 'Decide and say what it proves',
				questions: [
					{ q: 'D matches the builder, the source and the parameters. What do you do?', options: ['Reject: nothing proves the code is honest', 'Accept it', 'Accept only after a reproducible build', 'Ask for an SBOM first'], answer: 1, why: 'D meets every expectation you set. Rejecting everything that passes would make the check pointless.' },
					{ q: 'What does accepting D tell you?', options: ['The code in the repo is honest', 'No dependency has a known CVE', 'It came from the official repo through the official workflow', 'Two maintainers reviewed every commit'], answer: 2, why: 'Provenance is about how and from where the package was built. It says nothing about the intent of the code.' },
					{ q: 'Would provenance have stopped the xz test files and the Landlock dot?', options: ['No: they came through the real repo, so their provenance is correct', 'Yes: they are binary files', 'Yes: Build L3 would hide them', 'No: provenance only covers Debian builds'], answer: 0, why: 'The SLSA threats page says a malicious producer "cannot be directly mitigated through SLSA controls".' },
					{ q: 'Your CI stores provenance next to each package, and no step ever reads it. What does it stop?', options: ['Forks, since the source is recorded', 'Laptop builds, since they lack provenance', 'Extra parameters, since they are logged', 'Nothing: a provenance file nobody verifies stops nothing'], answer: 3, why: 'The consumer has to compare the provenance with expectations. Without that check, A, B and C go through.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Build a release by hand that carries a file no commit contains, sign it, and see that the signature passes while a comparison with git catches it.',
		steps: [
			'Make a tiny project with one commit: `mkdir -p ~/slsa-lab && cd ~/slsa-lab && git init -q proj && cd proj && printf "int main(void){return 0;}\\n" > main.c && git add main.c && git -c user.name=me -c user.email=me@example.com commit -qm v1`.',
			'Make the archive straight from git: `git archive --format=tar.gz --prefix=proj/ -o ../from-git.tar.gz HEAD`.',
			'Play the maintainer building on a laptop, with one extra file: `mkdir -p ../laptop/proj/m4 && cp main.c ../laptop/proj/ && echo "# extra line, in no commit" > ../laptop/proj/m4/build-to-host.m4 && tar -czf ../release.tar.gz -C ../laptop proj`.',
			'Sign the laptop release with your own key, then verify it: `cd .. && openssl genpkey -algorithm ed25519 -out key.pem && openssl pkey -in key.pem -pubout -out pub.pem && openssl pkeyutl -sign -inkey key.pem -rawin -in release.tar.gz -out release.sig`, then `openssl pkeyutl -verify -pubin -inkey pub.pem -rawin -in release.tar.gz -sigfile release.sig`. On macOS this needs OpenSSL 3, not the LibreSSL that ships with the system.',
			'Compare the two archives: `mkdir a b && tar -xzf from-git.tar.gz -C a && tar -xzf release.tar.gz -C b && diff -r a/proj b/proj`.'
		],
		done: [
			'`openssl pkeyutl -verify` prints `Signature Verified Successfully` for `release.tar.gz`.',
			'`diff -r a/proj b/proj` prints `Only in b/proj: m4`.'
		],
		solution: [
			'The signature is valid because the signer is the person who added the file. That is the xz 5.6.0 situation in miniature.',
			'The archive built from git has no `m4` folder. A hosted builder that checks out the repository and signs provenance would produce that archive, never the laptop one.',
			'As a consumer, require provenance naming your builder and source repo. A release built anywhere else fails, whoever signed it.'
		]
	},
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
