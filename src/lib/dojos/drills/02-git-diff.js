/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-diff',
	part: 'Git',
	title: 'Seeing changes',
	minutes: 10,
	hook: [
		'You are about to commit in the `invoices` repo, on `main`. You edited 3 files this morning and ran `git add` on one of them. Before you commit, you want to see exactly which lines will go in and which will stay behind. After that, Lea asks what her branch `feature/pdf` would bring into `main`.',
		'`git status --short` prints `M  app/billing.py` (staged), ` M app/tax.py` and ` M README.md` (not staged). In `app/tax.py` you changed `REDUCED = Decimal("0.055")` to `Decimal("0.10")`. In `README.md` you changed `python -m app` to `python3 -m app`. Lea’s branch `feature/pdf` adds `app/pdf.py`. Since she started it, `main` got one more commit, `Add the reduced VAT rate`, which adds 2 lines to `app/tax.py`.'
	],
	terms: [
		{ term: 'working tree', def: 'The files on your disk, as you edit them.' },
		{ term: 'index', def: 'The staging area: the snapshot of files that `git commit` will record. `git add` copies a file from the working tree into it.' },
		{ term: 'merge base', def: 'The newest commit that two branches share: the point where `feature/pdf` left `main`.' }
	],
	reps: [
		{
			prompt: 'Show the changes you have not staged yet.',
			accept: [
				'git diff'
			],
			why: 'With no argument, `git diff` compares the working tree with the index. Here it shows `README.md` and `app/tax.py`, but not `app/billing.py`, which is already staged.'
		},
		{
			prompt: 'Show the changes you have staged, the ones the next commit will record.',
			accept: [
				'git diff --staged',
				'git diff --cached',
				'git diff --staged HEAD',
				'git diff --cached HEAD'
			],
			why: '`--staged` compares the index with the last commit, `HEAD`. The docs: "--staged is a synonym of --cached." Here it shows only `app/billing.py`.'
		},
		{
			prompt: 'Show every change since the last commit, staged or not, in one diff.',
			accept: [
				'git diff HEAD',
				'git diff @'
			],
			why: '`git diff HEAD` compares the working tree with the commit `HEAD` points to, so the index does not matter. Here it shows all 3 files. `@` is a short name for `HEAD`.'
		},
		{
			prompt: 'List only the names of the files with unstaged changes.',
			accept: [
				'git diff --name-only'
			],
			why: '`--name-only` prints one file name per line instead of the patch. Here it prints `README.md` and `app/tax.py`.'
		},
		{
			prompt: 'Show the unstaged changes in `app/tax.py` only.',
			accept: [
				'git diff -- app/tax.py',
				'git diff app/tax.py'
			],
			why: 'A path after `--` limits the diff to that file. `README.md` changed too, but it does not appear.'
		},
		{
			prompt: 'Show the unstaged change in `README.md` word by word instead of line by line.',
			accept: [
				'git diff --word-diff -- README.md',
				'git diff --word-diff README.md',
				'git diff --word-diff=plain -- README.md',
				'git diff --word-diff=plain README.md'
			],
			why: '`--word-diff` marks the changed words inside the line: `Run with: [-python-]{+python3+} -m app`. Words are split on whitespace, and `plain` is the default mode.'
		},
		{
			prompt: 'Show the difference between the tips of `main` and `feature/pdf`, in that order.',
			accept: [
				'git diff main feature/pdf',
				'git diff main..feature/pdf'
			],
			why: '`git diff main feature/pdf` compares the two commits the branch names point to. It shows `app/pdf.py` added, and also the `REDUCED` line removed, because that line is on `main` and not on the branch. `main..feature/pdf` means the same thing here.'
		},
		{
			prompt: 'Show the same comparison as a diffstat: one line per file with its count of changed lines.',
			accept: [
				'git diff --stat main feature/pdf',
				'git diff --stat main..feature/pdf',
				'git diff main feature/pdf --stat',
				'git diff main..feature/pdf --stat'
			],
			why: '`--stat` replaces the patch with a diffstat. It prints `app/pdf.py | 2 ++` and `app/tax.py | 2 --`, then `2 files changed, 2 insertions(+), 2 deletions(-)`.'
		},
		{
			prompt: 'Show only what `feature/pdf` changed since it left `main`, without the commits `main` got since then.',
			accept: [
				'git diff main...feature/pdf',
				'git diff $(git merge-base main feature/pdf) feature/pdf',
				'git diff --merge-base main feature/pdf'
			],
			why: 'With three dots, git compares the merge base of the two branches with `feature/pdf`. The docs: "git diff A...B is equivalent to git diff $(git merge-base A B) B." Only `app/pdf.py` is left.'
		},
		{
			prompt: 'List only the names of the files `feature/pdf` changed since it left `main`.',
			accept: [
				'git diff --name-only main...feature/pdf',
				'git diff --name-only --merge-base main feature/pdf',
				'git diff main...feature/pdf --name-only',
				'git diff --merge-base main feature/pdf --name-only'
			],
			why: '`--name-only` prints file names instead of the patch, and `main...feature/pdf` starts from the merge base. The output is one line: `app/pdf.py`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Lea’s branch left `main`, and `main` got new commits since. Which spelling of `git diff` shows only her changes?',
		a: '`git diff main...feature/pdf`, with three dots. It compares the merge base with `feature/pdf`, so the commits added to `main` later do not show up.'
	},
	sources: [
		{ title: 'Git docs, git-diff', url: 'https://git-scm.com/docs/git-diff' },
		{ title: 'Git docs, gitrevisions', url: 'https://git-scm.com/docs/gitrevisions' }
	]
};
