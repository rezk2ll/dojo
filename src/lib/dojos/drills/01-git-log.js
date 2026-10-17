/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-log',
	part: 'Git',
	title: 'Reading history',
	minutes: 10,
	hook: [
		'A customer writes that invoice 1042 charges 1 cent more VAT than it should. The VAT code lives in the `invoices` repo, and you have a terminal open in it. Before you touch anything, you want to know who changed `app/tax.py`, when, and what each change did.',
		'The repo has 10 commits from the last 30 days, by Lea Martin and Omar Haddad (email `ohaddad@example.com`). The files are `README.md`, `app/billing.py`, `app/tax.py` and `app/pdf.py`. Omar’s branch `fix-rounding` was merged into `main` 4 days ago, and Lea’s branch `feature/pdf` holds 1 commit that is not merged yet. You are on `main`, and every rep runs in this repo.'
	],
	terms: [
		{ term: 'short hash', def: 'The first few characters of a commit’s 40-character id, enough to name that commit uniquely in this repo.' },
		{ term: 'patch', def: 'The lines a commit added (starting with `+`) and removed (starting with `-`), file by file.' },
		{ term: 'diffstat', def: 'One line per changed file with the number of changed lines, then a summary line such as `1 file changed, 2 insertions(+)`.' },
		{ term: '`--`', def: 'A separator on the command line. Git reads every word after it as a path, never as an option or a branch name.' }
	],
	reps: [
		{
			prompt: 'Show the last 5 commits, one line each.',
			accept: [
				'git log --oneline -5',
				'git log --oneline -n 5',
				'git log --oneline -n5',
				'git log --oneline --max-count=5',
				'git log -5 --oneline',
				'git log -n 5 --oneline',
				'git log -n5 --oneline',
				'git log --max-count=5 --oneline'
			],
			why: '`--oneline` prints each commit as its short hash and its subject line. `-5` stops after 5 commits; `-n 5` and `--max-count=5` are the same option.'
		},
		{
			prompt: 'Show only Omar’s commits, one line each.',
			accept: [
				'git log --oneline --author=Omar',
				'git log --oneline --author Omar',
				'git log --oneline --author="Omar"',
				"git log --oneline --author='Omar'",
				'git log --oneline --author="Omar Haddad"',
				"git log --oneline --author='Omar Haddad'",
				'git log --oneline --author "Omar Haddad"',
				'git log --author=Omar --oneline',
				'git log --author Omar --oneline',
				'git log --author="Omar" --oneline',
				"git log --author='Omar' --oneline",
				'git log --author="Omar Haddad" --oneline',
				"git log --author='Omar Haddad' --oneline",
				'git log --author "Omar Haddad" --oneline'
			],
			why: '`--author=Omar` keeps the commits whose author line matches the regular expression `Omar`. The match is case-sensitive, so `--author=omar` finds nothing here unless you add `-i`.'
		},
		{
			prompt: 'Show the commits made in the last 2 weeks, one line each.',
			accept: [
				'git log --oneline --since="2 weeks ago"',
				"git log --oneline --since='2 weeks ago'",
				'git log --oneline --since "2 weeks ago"',
				'git log --oneline --after="2 weeks ago"',
				"git log --oneline --after='2 weeks ago'",
				'git log --oneline --since=2.weeks',
				'git log --oneline --since=2.weeks.ago',
				'git log --since="2 weeks ago" --oneline',
				"git log --since='2 weeks ago' --oneline",
				'git log --since "2 weeks ago" --oneline',
				'git log --after="2 weeks ago" --oneline',
				"git log --after='2 weeks ago' --oneline",
				'git log --since=2.weeks --oneline',
				'git log --since=2.weeks.ago --oneline'
			],
			why: '`--since="2 weeks ago"` keeps the commits more recent than that date. The quotes keep `2 weeks ago` as one argument, and `--after` is another name for the same option.'
		},
		{
			prompt: 'Show the commits that changed `app/tax.py`, one line each.',
			accept: [
				'git log --oneline -- app/tax.py',
				'git log --oneline app/tax.py'
			],
			why: '`-- app/tax.py` keeps only the commits that changed that file. Git reads every word after `--` as a path. Without it, a branch named `app/tax.py` would stop git with `ambiguous argument \'app/tax.py\': both revision and filename`.'
		},
		{
			prompt: 'With `git log`, show the latest commit that changed `app/tax.py`, with its diff.',
			accept: [
				'git log -p -1 -- app/tax.py',
				'git log -p -1 app/tax.py',
				'git log -p -n 1 -- app/tax.py',
				'git log -p -n 1 app/tax.py',
				'git log -1 -p -- app/tax.py',
				'git log -1 -p app/tax.py',
				'git log -n 1 -p -- app/tax.py',
				'git log -n 1 -p app/tax.py'
			],
			why: '`-p` prints the patch under each commit, and `-1` stops after one commit. Because of `-- app/tax.py`, the patch shows only that file, even when the commit changed other files too.'
		},
		{
			prompt: 'Show the last 3 commits with the number of changed lines per file.',
			accept: [
				'git log --stat -3',
				'git log --stat -n 3',
				'git log --stat -n3',
				'git log -3 --stat',
				'git log -n 3 --stat',
				'git log -n3 --stat'
			],
			why: '`--stat` prints a diffstat under each commit, and `-3` stops after 3 commits. The merge commit gets no diffstat, because `git log` shows no diff for merge commits by default.'
		},
		{
			prompt: 'Draw the history of every branch as a graph, one line per commit.',
			accept: [
				'git log --oneline --graph --all',
				'git log --oneline --all --graph',
				'git log --graph --oneline --all',
				'git log --graph --all --oneline',
				'git log --all --oneline --graph',
				'git log --all --graph --oneline'
			],
			why: '`--graph` draws the branches with `*`, `|` and `/` to the left of each commit. `--all` starts from every ref under `refs/` as well as `HEAD`, so the unmerged commit on `feature/pdf` shows up too.'
		},
		{
			prompt: 'Show Omar’s commits that changed `app/tax.py`, one line each.',
			accept: [
				'git log --oneline --author=Omar -- app/tax.py',
				'git log --oneline --author=Omar app/tax.py',
				'git log --oneline --author Omar -- app/tax.py',
				'git log --oneline --author Omar app/tax.py',
				'git log --oneline --author="Omar" -- app/tax.py',
				'git log --oneline --author="Omar" app/tax.py',
				'git log --oneline --author="Omar Haddad" -- app/tax.py',
				'git log --oneline --author="Omar Haddad" app/tax.py',
				'git log --author=Omar --oneline -- app/tax.py',
				'git log --author=Omar --oneline app/tax.py',
				'git log --author Omar --oneline -- app/tax.py',
				'git log --author Omar --oneline app/tax.py',
				'git log --author="Omar" --oneline -- app/tax.py',
				'git log --author="Omar" --oneline app/tax.py',
				'git log --author="Omar Haddad" --oneline -- app/tax.py',
				'git log --author="Omar Haddad" --oneline app/tax.py'
			],
			why: '`--author=Omar` and `-- app/tax.py` each remove commits, so together they keep the commits that pass both. Here that drops Omar’s commit on `app/billing.py` and Lea’s commit on `app/tax.py`.'
		}
	],
	quiz: [],
	recall: {
		q: 'You want `git log` to list only the commits that changed `app/tax.py`. What do you add, and what does the `--` in it do?',
		a: '`-- app/tax.py`. Git reads every word after `--` as a path, so it never mistakes `app/tax.py` for a branch or an option.'
	},
	sources: [{ title: 'Git docs, git-log', url: 'https://git-scm.com/docs/git-log' }]
};
