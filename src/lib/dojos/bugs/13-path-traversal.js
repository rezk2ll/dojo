const DJANGO = 'https://github.com/django/django';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'path-traversal',
	part: 'Inputs',
	title: 'A sibling folder with a longer name',
	minutes: 10,
	hook: [
		'`django-admin startproject --template` accepts a `.zip` or `.tar` file and extracts it into the new project folder. The archive can come from a URL, so its file names are input from someone else.',
		'In 2021 Django added a check that refuses archive entries that land outside the target folder (CVE-2021-3281). In 2025 a second report (CVE-2025-59682) showed that **some entries still got written outside it**, into a folder next to the target.'
	],
	terms: [
		{ term: 'Path traversal', def: 'A file name with `..` segments, or an absolute path, that makes a write or a read leave the directory it was meant for.' },
		{ term: 'os.path.abspath', def: 'Turns a path into an absolute one and resolves `..` segments as text. It returns `/tmp/x` for `/tmp/proj/../x`.' },
		{ term: 'SuspiciousOperation', def: 'The Django exception for input that looks like an attack. Here it stops the extraction.' }
	],
	bug: {
		title: 'Fixed potential partial directory-traversal via archive.extract().',
		repo: 'django/django',
		url: `${DJANGO}/blob/41b43c74bda19753c757036673ea9db74acf494a/django/utils/archive.py#L145-L223`,
		fix: `${DJANGO}/commit/924a0c092e65fa2d0953fd1855d2dc8786d94de2`,
		lang: 'python',
		code: `def target_filename(self, to_path, name):
    target_path = os.path.abspath(to_path)
    filename = os.path.abspath(os.path.join(target_path, name))
    if not filename.startswith(target_path):
        raise SuspiciousOperation("Archive contains invalid path: '%s'" % name)
    return filename
…
def extract(self, to_path):
    namelist = self._archive.namelist()
    leading = self.has_leading_dir(namelist)
    for name in namelist:
        data = self._archive.read(name)
        info = self._archive.getinfo(name)
        if leading:
            name = self.split_leading_dir(name)[1]
        if not name:
            continue
        filename = self.target_filename(to_path, name)`,
		lines: [4],
		diff: `         filename = os.path.abspath(os.path.join(target_path, name))
-        if not filename.startswith(target_path):
+        try:
+            if os.path.commonpath([target_path, filename]) != target_path:
+                raise SuspiciousOperation("Archive contains invalid path: '%s'" % name)
+        except ValueError:
+            # Different drives on Windows raises ValueError.
             raise SuspiciousOperation("Archive contains invalid path: '%s'" % name)`,
		notes: [
			'Line 4 tests `filename.startswith(target_path)`, which compares characters. `/tmp/proj` is a prefix of `/tmp/proj2/run.py`, but `/tmp/proj2` is a different folder next to the target.',
			'Extract into `/tmp/proj` a zip that holds `README` and `../proj2/run.py`. The two entries have no common top folder, so `leading` is false on line 14 and the name stays as is. Line 3 resolves it to `/tmp/proj2/run.py`, which starts with `/tmp/proj`, so Django writes the file there. Line 4 still refuses `../etc/x`, which is why the release note calls it "partial directory-traversal".',
			'The fix replaces line 4 with `os.path.commonpath`, which compares whole path parts. For `/tmp/proj` and `/tmp/proj2/run.py` it returns `/tmp`, which is not the target, so Django raises `SuspiciousOperation`. `commonpath` raises `ValueError` when the two paths are on different drives, and Django refuses that case too.',
			'The commit says "Thanks stackered for the report." and "Follow up to 05413afa8c18cdb978fcdf470e09f7a12b234a23", the 2021 commit that added `target_filename`. The [release note](' + DJANGO + '/blob/main/docs/releases/5.2.7.txt) says the code "allowed partial directory-traversal via an archive with file paths sharing a common prefix with the target directory".'
		]
	},
	quiz: [
		{
			q: 'The target is `/tmp/proj`. Which resolved path passes the `startswith` check but is outside the target?',
			options: ['/tmp/proj/app/models.py', '/tmp/proj2/run.py', '/tmp/other/run.py', '/etc/passwd'],
			answer: 1,
			why: '`/tmp/proj2/run.py` starts with the characters `/tmp/proj`, so the check passes. Its folder is `/tmp/proj2`, a sibling of the target.'
		},
		{
			q: 'Which test tells whether `filename` is inside `target_path` (both already absolute)?',
			options: [
				'os.path.commonpath([target_path, filename]) == target_path',
				"'..' not in name, checked before calling os.path.join",
				'len(filename) > len(target_path) after abspath',
				'filename.startswith(target_path) after abspath'
			],
			answer: 0,
			why: '`commonpath` works on whole path parts. Checking for `..` misses an absolute name such as `/etc/x`, which `os.path.join` keeps as is. The length test accepts any longer path.'
		},
		{
			q: 'You write a test for a function that keeps files inside a folder. Which entry should it include?',
			options: [
				'An entry with a very long file name and many dots in it',
				'A sibling folder entry whose name extends the target name',
				'An entry with spaces and accents in its file and folder names',
				'An empty folder entry at the root of the archive'
			],
			answer: 1,
			why: 'A sibling such as `../proj2/x` when the target is `proj` is the input that separates a prefix test from a real folder test. The other entries stay inside the target with either check.'
		}
	],
	recall: {
		q: 'The target is `/tmp/proj`. Why did `../proj2/run.py` pass the 2021 check?',
		a: 'It resolves to `/tmp/proj2/run.py`, and `startswith` only compares characters, so `/tmp/proj` matched. `os.path.commonpath` returns `/tmp` for these two paths, and the fixed check refuses the entry.'
	},
	sources: [
		{ title: 'Django 5.2.7 release notes (CVE-2025-59682)', url: `${DJANGO}/blob/main/docs/releases/5.2.7.txt` },
		{ title: 'The fix commit', url: `${DJANGO}/commit/924a0c092e65fa2d0953fd1855d2dc8786d94de2` },
		{ title: 'The 2021 fix that added the check', url: `${DJANGO}/commit/05413afa8c18cdb978fcdf470e09f7a12b234a23` }
	]
};
