/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-find',
	part: 'Git',
	title: 'Finding things in git',
	minutes: 10,
	hook: [
		'Since this morning, requests from `notes-api` to the search service time out, and `npm test` fails on `main`. It passed at tag `v2.0`. You want to know where the timeout is set, who wrote the retry code, and which commit broke the tests.',
		'The repo has 8 commits on `main` by Sara Lopez and Tom Weber. `src/config.js` holds one line, `export const TIMEOUT_MS = 2000;`. It was 5000 at tag `v1.0`, 8000 at tag `v2.0`, and Tom lowered it to 2000 in the second to last commit. `src/http.js` reads `TIMEOUT_MS`, and its lines 13 to 19 hold the function `fetchJson`, which retries a GET 3 times. `src/notes.js` used to call `slugify(` until Tom removed the call. You are on `main` with a clean tree.'
	],
	terms: [
		{ term: 'pickaxe', def: 'The `-S` and `-G` options of `git log`. They keep only the commits whose diff touches a given string or regular expression.' },
		{ term: 'bisect', def: 'A binary search over history. You mark one commit bad and one good, and Git checks out the commit halfway between them for you to test.' },
		{ term: '`<rev>:<path>`', def: 'The file at `<path>` as it was stored in commit `<rev>`, for example `HEAD~2:src/config.js`.' }
	],
	reps: [
		{
			prompt: 'Find every line of the tracked files that contains `TIMEOUT_MS`, with its line number.',
			accept: ['git grep -n TIMEOUT_MS', 'git grep -n "TIMEOUT_MS"', "git grep -n 'TIMEOUT_MS'", 'git grep --line-number TIMEOUT_MS'],
			why: '`git grep` searches the tracked files of the working tree, and `-n` puts the line number after the file name, as in `src/http.js:5:`. Options go before the pattern: `git grep TIMEOUT_MS -n` stops with `option \'-n\' must come before non-option arguments`.'
		},
		{
			prompt: 'Search for `TIMEOUT_MS` in the files as they were at tag `v1.0`, without checking out the tag.',
			accept: ['git grep TIMEOUT_MS v1.0', 'git grep "TIMEOUT_MS" v1.0', "git grep 'TIMEOUT_MS' v1.0", 'git grep -e TIMEOUT_MS v1.0'],
			why: 'A tree name after the pattern makes `git grep` search the blobs of that commit instead of the working tree. It prints `v1.0:src/config.js:export const TIMEOUT_MS = 5000;`, with the tag in front of each file name.'
		},
		{
			prompt: 'List, one line each, the commits that added or removed the string `slugify`.',
			accept: [
				'git log -S slugify --oneline',
				'git log -Sslugify --oneline',
				'git log -S "slugify" --oneline',
				'git log --oneline -S slugify',
				'git log --oneline -Sslugify',
				'git log --oneline -S "slugify"',
				"git log --oneline -S 'slugify'"
			],
			why: '`-S slugify` keeps the commits that change the number of times `slugify` appears in a file. Here that is the first commit, which added it, and Tom’s "Use the title as the note id", which removed the call.'
		},
		{
			prompt: '`git log -S TIMEOUT_MS` misses the commits that only changed the value, because the string count stayed the same. List, one line each, the commits whose diff adds or removes a line containing `TIMEOUT_MS`.',
			accept: [
				'git log -G TIMEOUT_MS --oneline',
				'git log -GTIMEOUT_MS --oneline',
				'git log -G "TIMEOUT_MS" --oneline',
				'git log --oneline -G TIMEOUT_MS',
				'git log --oneline -GTIMEOUT_MS',
				'git log --oneline -G "TIMEOUT_MS"',
				"git log --oneline -G 'TIMEOUT_MS'"
			],
			why: '`-G TIMEOUT_MS` keeps the commits whose patch has an added or removed line matching that regular expression. It finds 4 commits, including "Raise timeout to 8000 ms" and "Lower timeout to 2000 ms", which `-S` skips.'
		},
		{
			prompt: 'Show who last changed each of lines 13 to 19 of `src/http.js`.',
			accept: [
				'git blame -L 13,19 src/http.js',
				'git blame -L13,19 src/http.js',
				'git blame -L 13,+7 src/http.js',
				'git blame -L13,+7 src/http.js',
				'git blame src/http.js -L 13,19',
				'git blame -L :fetchJson src/http.js'
			],
			why: '`-L 13,19` limits the output to those lines, each with the short hash, author and date of the commit that last changed it. All 7 lines show `391f28e4 (Tom Weber`. `-L 13,+7` counts 7 lines from line 13 and gives the same range.'
		},
		{
			prompt: 'Begin a bisect session to find the commit that broke `npm test`.',
			accept: ['git bisect start'],
			why: '`git bisect start` opens the session and waits. Git prints `status: waiting for both good and bad commits`.'
		},
		{
			prompt: 'The commit you are on fails `npm test`. Tell bisect.',
			accept: ['git bisect bad', 'git bisect bad HEAD'],
			why: '`git bisect bad` with no commit marks `HEAD`, here the tip of `main`, as bad. Git then waits for at least one good commit.'
		},
		{
			prompt: 'Tests passed at tag `v2.0`. Tell bisect.',
			accept: ['git bisect good v2.0'],
			why: '`git bisect good v2.0` marks the tag as good. Git now has both ends, checks out a commit between them, here "Retry failed GET requests 3 times", and prints `Bisecting: 2 revisions left to test after this (roughly 1 step)`.'
		},
		{
			prompt: 'You ran `npm test` on the commit bisect checked out, and it passed. Tell bisect.',
			accept: ['git bisect good', 'git bisect good HEAD'],
			why: 'With no commit, `git bisect good` marks the checked-out commit. Git checks out the next one, "Lower timeout to 2000 ms", with 0 revisions left to test.'
		},
		{
			prompt: 'Bisect has named the first bad commit. End the session and go back to `main`.',
			accept: ['git bisect reset'],
			why: '`git bisect reset` clears the bisect state and checks out the branch you were on before `git bisect start`, here `main`.'
		},
		{
			prompt: 'Start a new bisect session in one command, with the current `HEAD` as bad and `v2.0` as good.',
			accept: ['git bisect start HEAD v2.0', 'git bisect start main v2.0'],
			why: '`git bisect start` takes the bad commit first and then one or more good ones. `git bisect start HEAD v2.0` does what `start`, `bad` and `good v2.0` did in three commands.'
		},
		{
			prompt: 'Print `src/config.js` as it was 2 commits before `HEAD`, without changing your working tree.',
			accept: [
				'git show HEAD~2:src/config.js',
				'git show HEAD^^:src/config.js',
				'git show HEAD~~:src/config.js',
				'git show main~2:src/config.js',
				'git show HEAD~2:./src/config.js',
				'git cat-file -p HEAD~2:src/config.js'
			],
			why: '`HEAD~2` is the grandparent of `HEAD`, and `:src/config.js` names that file inside it. `git show` prints the file: `export const TIMEOUT_MS = 8000;`, the value before Tom lowered it.'
		}
	],
	quiz: [],
	recall: {
		q: 'A commit changed `TIMEOUT_MS = 8000` to `TIMEOUT_MS = 2000`. Which of `git log -S TIMEOUT_MS` and `git log -G TIMEOUT_MS` lists it, and why?',
		a: '`-G TIMEOUT_MS`. The diff removes one line and adds one line that both match. `-S` counts occurrences, and the count stayed at 1.'
	},
	sources: [
		{ title: 'Git docs, git-grep', url: 'https://git-scm.com/docs/git-grep' },
		{ title: 'Git docs, git-log', url: 'https://git-scm.com/docs/git-log' },
		{ title: 'Git docs, git-blame', url: 'https://git-scm.com/docs/git-blame' },
		{ title: 'Git docs, git-bisect', url: 'https://git-scm.com/docs/git-bisect' },
		{ title: 'Git docs, git-show', url: 'https://git-scm.com/docs/git-show' }
	]
};
