const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src';
const HTTPD_FIX = 'https://github.com/apache/httpd/commit/98246aa96079dad5f7b20521bbc0142a04f1c5e7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'path-traversal',
	part: 'Input and output',
	title: 'Path traversal',
	minutes: 10,
	hook: [
		'On 16 September 2021 the Apache HTTP Server team released version 2.4.49. It changed the code that resolves `..` segments in a request path. On 29 September a report reached the security team: a request could reach files outside the directories set by `Alias`-like directives.',
		'The advisory, CVE-2021-41773, says: "This issue is known to be exploited in the wild." NVD scores it 9.8 out of 10. The [fix commit](' + HTTPD_FIX + ') shows the hole: the normalizer decoded `%2e` to a dot for the first dot of a segment only, so `/.%2e/` was never removed as `/../`.',
		'Version 2.4.50 shipped on 4 October. Its fix was incomplete (CVE-2021-42013), and 2.4.51 followed on 7 October.',
		'Your own code meets the same problem each time it joins a file name from a request to a base directory. Below: how `../` climbs out of the directory, the check that holds (resolve the path, then check it is inside), and Go’s `os.Root`, which refuses to leave the directory.'
	],
	terms: [
		{ term: 'Path traversal', def: 'An attack where a file name from outside, like `../../etc/passwd`, makes a program open a file outside the directory it meant to use.' },
		{ term: 'Canonical path', def: 'The single absolute form of a path, with `.` and `..` resolved. Python’s `os.path.realpath` also follows symbolic links to build it.' },
		{ term: 'Lexical check', def: 'A check on the path string only, like Go’s `filepath.IsLocal`. It never reads the disk, so it cannot see where a symbolic link points.' },
		{ term: 'os.Root', def: 'A Go 1.24 type that holds an open directory. Its methods refuse any file name that would leave that directory through `..` or a symbolic link.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["GET /download?name=../../etc/passwd"] --> join["path = /srv/files/../../etc/passwd"]'],
				highlight: ['req', 'join'],
				note: 'The app keeps its files in `/srv/files` and joins the `name` parameter to it. The attacker sends `../../etc/passwd`. The joined string is `/srv/files/../../etc/passwd`.'
			},
			{
				add: ['join --> naive["Check: path starts with /srv/files ? yes"]', 'naive --> open["open(): the kernel resolves each .."]', 'open --> leak["/etc/passwd is sent back"]'],
				highlight: ['naive', 'leak'],
				note: 'A prefix check on the joined string passes, because the string does begin with `/srv/files`. CWE-22 shows the same mistake in Java with `startsWith("/safe_dir/")`. The kernel then resolves the two `..` and opens `/etc/passwd`.'
			},
			{
				add: ['join --> canon["realpath(): /etc/passwd"]', 'canon --> inside["Check: commonpath of /srv/files and the result is /srv/files ? no"]', 'inside --> deny["403, nothing opened"]'],
				highlight: ['canon', 'inside', 'deny'],
				note: 'The fix resolves the path first: `os.path.realpath` turns the string into `/etc/passwd`. Then `os.path.commonpath([BASE, real])` returns `/`, which is not `/srv/files`. The app refuses before any `open()`.'
			},
			{
				add: ['link["A symlink /srv/files/link points to /etc"] --> race["Swapped in between the check and open()"]', 'root["os.OpenInRoot(/srv/files, name)"] -->|"openat on the directory descriptor"| refuse["path escapes from parent"]'],
				highlight: ['race', 'root', 'refuse'],
				note: 'Check then open leaves a window. If an attacker can create files in the directory, they can swap a symbolic link in after the check. Go’s blog calls this a time-of-check/time-of-use race. `os.OpenInRoot` checks each step while it opens, and returns "path escapes from parent" for `link/passwd`.'
			}
		]
	},
	example: {
		title: 'src/internal/filepathlite/path.go: unixIsLocal, the body of filepath.IsLocal on Unix',
		repo: 'golang/go',
		url: `${GO}/internal/filepathlite/path.go#L145-L165`,
		lang: 'go',
		code: `func unixIsLocal(path string) bool {
	if IsAbs(path) || path == "" {
		return false
	}
	hasDots := false
	for p := path; p != ""; {
		var part string
		part, p, _ = stringslite.Cut(p, "/")
		if part == "." || part == ".." {
			hasDots = true
			break
		}
	}
	if hasDots {
		path = Clean(path)
	}
	if path == ".." || stringslite.HasPrefix(path, "../") {
		return false
	}
	return true
}`,
		notes: [
			'Line 2 rejects an absolute path and the empty string. `/etc/passwd` is never local, so a name that would replace the base directory in a join is refused.',
			'Lines 6 to 13 look for a `.` or `..` part. Only then does line 15 call `Clean`, which resolves `a/../b.txt` to `b.txt` and leaves a leading `..` in place: `a/../../etc` cleans to `../etc`.',
			'Line 17 is the inside check: a cleaned path that is `..` or starts with `../` climbs above the base, and the function returns false. On Go 1.24.4, `IsLocal("a/../../etc")` is false and `IsLocal("a/../b.txt")` is true.',
			'The [doc comment](' + GO + '/path/filepath/path.go#L59-L75) warns: "IsLocal is a purely lexical operation. In particular, it does not account for the effect of any symbolic links". With `/srv/files/link` pointing to `/etc`, `IsLocal("link/passwd")` is true, and `os.Open` on the joined path reads `/etc/passwd`.',
			'Python has the same trap for prefixes. Its docs say `os.path.commonprefix` "works a character at a time", so `/usr/lib` and `/usr/local/lib` share `/usr/l`. They tell you to use `commonpath()` instead.'
		]
	},
	tradeoff: {
		gain: [
			'`filepath.IsLocal` is a string check with no disk access. It refuses `../../etc/passwd`, `/etc/passwd` and the empty name.',
			'`os.Root` also refuses a symbolic link inside the directory that points out of it. On Unix it walks the path with the `openat` system calls, so a link swapped in after a check does not help the attacker.'
		],
		cost: [
			'`realpath` then `open()` is two steps. An attacker who can write to the directory can replace a component with a symbolic link between them.',
			'Go’s blog: "Root operations on filenames containing many directory components can be much more expensive than the equivalent non-Root operation."',
			'`os.Root` does not stop Linux bind mounts. The Go team limits it to constructs an ordinary user can create, such as symbolic links.'
		]
	},
	task: {
		prompt: 'A Python download handler: `BASE = "/srv/files"`, then `path = os.path.join(BASE, name)`, then `if not path.startswith(BASE): abort(403)`, then `return open(path, "rb").read()`. Find two values of `name` that read a file outside `/srv/files`, then rewrite the check.',
		hint: 'Try a name with `..` that still leaves the string starting with `/srv/files`. Then think of a directory next to `/srv/files` whose name begins with `files`.',
		answer: [
			'`../../etc/passwd`: the joined string is `/srv/files/../../etc/passwd`. It starts with `/srv/files`, the check passes, and `open()` reads `/etc/passwd`.',
			'`../files_old/key`: the joined string is `/srv/files/../files_old/key`, which also passes. Resolving it gives `/srv/files_old/key`, and that string still starts with `/srv/files`. A prefix check fails here even after you resolve the path.',
			'`/etc/passwd` is caught by accident. `os.path.join` drops `BASE` when the second part is absolute, so the result is `/etc/passwd` and the prefix check refuses it.',
			'The rewrite: `real = os.path.realpath(os.path.join(BASE, name))`, then `if os.path.commonpath([BASE, real]) != BASE: abort(403)`. In Python 3, `commonpath` gives `/` for the first name and `/srv` for the second, so both are refused. `a/../b.txt` resolves to `/srv/files/b.txt` and is served.'
		],
		steps: [
			{
				title: 'Read the handler',
				questions: [
					{ q: 'What does the `startswith(BASE)` check look at?', options: ['The file the kernel will open in the end', 'The joined string, `..` and all', 'The canonical path that `realpath` returns', 'The raw name as the browser typed it'], answer: 1, why: 'Nothing resolves the path before the check. It compares characters of the raw joined string.' },
					{ q: 'When are the `..` segments in the joined path resolved?', options: ['When `os.path.join` builds the string', 'When `startswith` runs', 'When the kernel walks the path during `open()`', 'Never: `open()` refuses `..`'], answer: 2, why: '`os.path.join` only glues strings. The kernel resolves each `..` as it walks the path at `open()`.' },
					{ q: 'What does `os.path.join(BASE, "/etc/passwd")` return?', options: ['`/etc/passwd`, because the second part is absolute', '`/srv/files/etc/passwd`', '`/srv/files//etc/passwd`', 'An error, because the name starts with a slash'], answer: 0, why: '`os.path.join` drops `BASE` when the second part is absolute, so the result is `/etc/passwd`.' },
					{ q: 'So does `name = "/etc/passwd"` get through this handler?', options: ['Yes: `open()` reads `/etc/passwd` and returns it', 'Yes, but only when the app runs on Windows', 'No: `os.path.join` raises an error before the check', 'No: the joined string fails the prefix check'], answer: 3, why: 'It is caught by accident. The join gives `/etc/passwd`, and that string fails the prefix check.' }
				]
			},
			{
				title: 'Climb out with ..',
				questions: [
					{ q: 'Which `name` reads `/etc/passwd`?', options: ['`/etc/passwd`', '`etc/passwd`', '`../../etc/passwd`', '`./etc/passwd`'], answer: 2, why: 'The joined string `/srv/files/../../etc/passwd` starts with `/srv/files`, so the check passes, and `open()` climbs two levels.' },
					{ q: 'Why are there two `..` and not one?', options: ['Each one climbs one level: `/srv`, then `/`', 'Python needs an even number of `..` segments', 'The first one is removed by `os.path.join`', 'One is enough, the second is only padding'], answer: 0, why: 'The base sits two levels below `/`. Each `..` removes one level.' },
					{ q: 'The CWE-22 page shows this same mistake in Java. With which call?', options: ['`getCanonicalPath()`', '`startsWith("/safe_dir/")`', '`Files.newInputStream()`', '`File.separator`'], answer: 1, why: 'CWE-22 shows a prefix check with `startsWith("/safe_dir/")` on a path that still holds `..`.' },
					{ q: 'What would make this first name fail?', options: ['Checking for `etc` in the name', 'Lowercasing the name before the check', 'Resolving the path before the prefix check', 'Using `open(path, "r")` instead of `"rb"`'], answer: 2, why: 'Once resolved, the path is `/etc/passwd`, which does not start with `/srv/files`.' }
				]
			},
			{
				title: 'Find the neighbor',
				questions: [
					{ q: 'Which second `name` reads a file outside `/srv/files`?', options: ['`./key`', '`files_old/key`', '`../files/key`', '`../files_old/key`'], answer: 3, why: 'It joins to `/srv/files/../files_old/key`, which starts with `/srv/files` and opens `/srv/files_old/key`.' },
					{ q: 'After `realpath`, that name becomes `/srv/files_old/key`. Does `startswith("/srv/files")` refuse it now?', options: ['Yes: `realpath` removed every `..`', 'Yes: `files_old` is a different folder', 'No: it still starts with `/srv/files`', 'No: `realpath` leaves `..` in place'], answer: 2, why: '`startswith` compares characters, not path components. Resolving the path does not save a prefix check.' },
					{ q: 'Python’s docs warn about `os.path.commonprefix` for the same reason. What do they say?', options: ['It works a character at a time', 'It follows symbolic links', 'It is slow on long paths', 'It only works on Windows'], answer: 0, why: 'The docs say it "works a character at a time", so `/usr/lib` and `/usr/local/lib` share `/usr/l`.' },
					{ q: 'Which check compares whole path components?', options: ['`real.startswith(BASE)`', '`BASE in real`', '`os.path.commonprefix([BASE, real])`', '`os.path.commonpath([BASE, real])`'], answer: 3, why: '`commonpath` returns `/srv` for `/srv/files` and `/srv/files_old/key`, not a cut-off name.' }
				]
			},
			{
				title: 'Rewrite the check',
				questions: [
					{ q: 'What comes first in the rewrite?', options: ['`real = os.path.realpath(os.path.join(BASE, name))`', '`data = open(os.path.join(BASE, name), "rb").read()`', '`name = name.replace("..", "")`', '`if "/" in name: abort(403)`'], answer: 0, why: 'Resolve first, check second. The check must look at the path `open()` will really use.' },
					{ q: 'Which test refuses both escapes?', options: ['`if not real.startswith(BASE): abort(403)`', '`if os.path.commonpath([BASE, real]) != BASE: abort(403)`', '`if ".." in real: abort(403)`', '`if not os.path.exists(real): abort(403)`'], answer: 1, why: '`commonpath` gives `/` for the first name and `/srv` for the second. Neither equals `BASE`.' },
					{ q: 'With the rewrite, what happens to `a/../b.txt`?', options: ['Refused, because it holds `..`', 'Refused, because `a` does not exist', 'Served: it resolves to `/srv/files/b.txt`', 'It raises an error in `commonpath`'], answer: 2, why: 'It resolves inside the base, so it is a fair request. The check refuses escapes, not dots.' },
					{ q: 'What gap remains with `realpath` then `open()`?', options: ['None: `realpath` makes it fully safe', 'It refuses every symbolic link in the base', 'It cannot handle absolute names', 'A symlink swapped in after the check'], answer: 3, why: 'Check then open is two steps. Go’s `os.OpenInRoot` checks each step while it opens, which closes that window.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'The handler checks `path.startswith("/srv/files")` on the joined path. Why does `../../etc/passwd` get through?',
			options: [
				'The check runs on the raw string, and the kernel resolves the `..` later at `open()`',
				'`os.path.join` removes the `..` segments before the check, so it sees a clean path',
				'`startswith` ignores the dots and slashes and compares only the letters of each name',
				'The browser resolves the `..` segments before sending, so the server never sees them'
			],
			answer: 0,
			why: 'The string `/srv/files/../../etc/passwd` begins with `/srv/files`, so the check passes. The `..` segments are resolved only when the kernel walks the path during `open()`, which lands on `/etc/passwd`.'
		},
		{
			q: '`filepath.IsLocal("link/passwd")` returns true, and `/srv/files/link` is a symbolic link to `/etc`. What does `os.Open(filepath.Join("/srv/files", "link/passwd"))` open?',
			options: [
				'Nothing: `os.Open` returns an error because the path escapes the base directory',
				'`/etc/passwd`, because `IsLocal` checks the string and never follows the link',
				'`/srv/files/link/passwd`, a regular file that Go creates in place of the link',
				'Nothing: Go refuses to follow any symbolic link unless a flag allows it'
			],
			answer: 1,
			why: 'The Go docs call `IsLocal` "a purely lexical operation" that "does not account for the effect of any symbolic links". `os.Open` follows the link like any other path. `os.OpenInRoot` would return "path escapes from parent" instead.'
		},
		{
			q: 'After `realpath`, a request resolves to `/srv/files_old/key`. Which check wrongly accepts it as inside `/srv/files`?',
			options: [
				'`os.path.commonpath(["/srv/files", real]) == "/srv/files"`',
				'`real.startswith("/srv/files/")`, with the trailing slash',
				'`real.startswith("/srv/files")`, without the trailing slash',
				'`not os.path.relpath(real, "/srv/files").startswith("..")`'
			],
			answer: 2,
			why: '`startswith` compares characters, and `/srv/files_old` begins with the 10 characters of `/srv/files`. `commonpath` compares whole path components and returns `/srv`. The trailing slash and `relpath` (which gives `../files_old/key`) also refuse it.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Break a prefix check with `..` and a neighbor folder, then fix it with `realpath` and `commonpath`.',
		steps: [
			'Make a scratch tree: `mkdir -p ~/trav-lab/files ~/trav-lab/files_old && cd ~/trav-lab && echo hello > files/a.txt && echo secret > files_old/key && echo topsecret > secret.txt`.',
			'Save the naive handler: `printf \'%s\\n\' \'import os, sys\' \'BASE = os.path.realpath("files")\' \'path = os.path.join(BASE, sys.argv[1])\' \'print(open(path).read() if path.startswith(BASE) else "403")\' > naive.py`.',
			'Attack it: `python3 naive.py a.txt`, then `python3 naive.py ../secret.txt`, then `python3 naive.py ../files_old/key`, then `python3 naive.py /etc/hostname`.',
			'Write `safe.py`: the same script, but resolve the joined path with `os.path.realpath` and serve only when `os.path.commonpath([BASE, real]) == BASE`.',
			'Add a symbolic link that points out, `ln -s .. files/link`, and try `link/secret.txt` against both scripts.'
		],
		done: [
			'`python3 naive.py ../secret.txt` prints `topsecret` and `python3 naive.py ../files_old/key` prints `secret`.',
			'`python3 safe.py` prints `403` for `../secret.txt`, `../files_old/key`, `/etc/hostname` and `link/secret.txt`.',
			'`python3 safe.py x/../a.txt` still prints `hello`.'
		],
		solution: [
			'`printf \'%s\\n\' \'import os, sys\' \'BASE = os.path.realpath("files")\' \'real = os.path.realpath(os.path.join(BASE, sys.argv[1]))\' \'print(open(real).read() if os.path.commonpath([BASE, real]) == BASE else "403")\' > safe.py`',
			'`naive.py` refuses `/etc/hostname` only by accident: `os.path.join` drops `BASE` for an absolute name.',
			'`realpath` follows `files/link`, so `safe.py` sees the real target and refuses it. A link swapped in after the check is still possible: that is the race Go’s `os.OpenInRoot` closes.'
		]
	},
	recall: {
		q: 'In which order do you handle a file name from a request, and which Python call checks that the result is inside the base?',
		a: 'Resolve first with `os.path.realpath(os.path.join(BASE, name))`, then require `os.path.commonpath([BASE, real]) == BASE`. In Go, `os.OpenInRoot(BASE, name)` does both while it opens, and also refuses symbolic links that leave the directory.'
	},
	sources: [
		{ title: 'Apache HTTP Server 2.4 vulnerabilities, CVE-2021-41773 and CVE-2021-42013', url: 'https://httpd.apache.org/security/vulnerabilities_24.html' },
		{ title: 'NVD, CVE-2021-41773', url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-41773' },
		{ title: 'apache/httpd, fix for CVE-2021-41773 in ap_normalize_path', url: HTTPD_FIX },
		{ title: 'The Go Blog, Traversal-resistant file APIs (12 March 2025)', url: 'https://go.dev/blog/osroot' },
		{ title: 'CWE-22: Improper Limitation of a Pathname to a Restricted Directory', url: 'https://cwe.mitre.org/data/definitions/22.html' },
		{ title: 'Python docs, os.path', url: 'https://docs.python.org/3/library/os.path.html' }
	]
};
