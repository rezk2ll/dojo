/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-stash',
	part: 'Git',
	title: 'Stash',
	minutes: 10,
	hook: [
		'You are halfway through a discount feature in the `invoices` repo when a bug report comes in that needs a fix on a clean `main`. Your work is not ready to commit. `git stash` saves it aside, cleans the working tree, and gives it back when you are done.',
		'You are on `main`. `app/billing.py` is modified (a new `discount` argument), and `app/discount.py` is a new file that git does not track yet. From rep 3 on, you have 2 stash entries: `discount wip` holds that discount work, and the newer `pdf wip` holds 1 line added to `README.md`.'
	],
	terms: [
		{ term: 'stash entry', def: 'A saved set of uncommitted changes, with a message. `git stash push` adds one and resets the working tree and the index to `HEAD`.' },
		{ term: 'untracked file', def: 'A file in the working tree that was never added with `git add`. `git status --short` marks it `??`.' },
		{ term: '`stash@{n}`', def: 'The name of an entry: `stash@{0}` is the newest, `stash@{1}` the one before. You can also write the plain number `n`.' }
	],
	reps: [
		{
			prompt: 'Stash your changes with the message `discount wip`.',
			accept: [
				'git stash push -m "discount wip"',
				"git stash push -m 'discount wip'",
				'git stash push --message "discount wip"',
				'git stash push --message="discount wip"',
				'git stash -m "discount wip"',
				"git stash -m 'discount wip'",
				'git stash --message "discount wip"',
				'git stash --message="discount wip"'
			],
			why: '`git stash push` saves the changes to tracked files and resets them to `HEAD`, and `-m` sets the message. The untracked `app/discount.py` is not stashed: `git status --short` still shows `?? app/discount.py`.'
		},
		{
			prompt: 'Stash your changes with the message `discount wip`, including the untracked `app/discount.py`.',
			accept: [
				'git stash push -u -m "discount wip"',
				"git stash push -u -m 'discount wip'",
				'git stash push --include-untracked -m "discount wip"',
				"git stash push --include-untracked -m 'discount wip'",
				'git stash push -m "discount wip" -u',
				'git stash push -m "discount wip" --include-untracked',
				"git stash push -m 'discount wip' -u",
				"git stash push -m 'discount wip' --include-untracked",
				'git stash -u -m "discount wip"',
				"git stash -u -m 'discount wip'",
				'git stash --include-untracked -m "discount wip"',
				"git stash --include-untracked -m 'discount wip'",
				'git stash -m "discount wip" -u',
				'git stash -m "discount wip" --include-untracked',
				"git stash -m 'discount wip' -u",
				"git stash -m 'discount wip' --include-untracked"
			],
			why: '`-u` (`--include-untracked`) also stashes untracked files and then removes them from the working tree. After it, `git status --short` prints nothing.'
		},
		{
			prompt: 'List your stash entries.',
			accept: [
				'git stash list'
			],
			why: '`git stash list` prints one line per entry, newest first: `stash@{0}: On main: pdf wip`, then `stash@{1}: On main: discount wip`.'
		},
		{
			prompt: 'Show which files the entry `discount wip` changed, as a diffstat.',
			accept: [
				'git stash show stash@{1}',
				"git stash show 'stash@{1}'",
				'git stash show "stash@{1}"',
				'git stash show 1',
				'git stash show --stat stash@{1}',
				'git stash show --stat 1'
			],
			why: '`git stash show` prints a diffstat by default, and `stash@{1}` picks the older entry. It lists only `app/billing.py`, because untracked files are left out by default.'
		},
		{
			prompt: 'Show the same diffstat for `discount wip`, with its untracked files too.',
			accept: [
				'git stash show -u stash@{1}',
				'git stash show --include-untracked stash@{1}',
				'git stash show -u 1',
				'git stash show --include-untracked 1'
			],
			why: 'With `-u`, `git stash show` adds the untracked files of the entry to the diff. The output now lists `app/billing.py` and `app/discount.py`.'
		},
		{
			prompt: 'Show the full diff of `discount wip`.',
			accept: [
				'git stash show -p stash@{1}',
				"git stash show -p 'stash@{1}'",
				'git stash show -p "stash@{1}"',
				'git stash show -p 1',
				'git stash show --patch stash@{1}',
				'git stash show --patch 1'
			],
			why: '`-p` asks for the patch instead of the diffstat. You see the 2 lines of `total()` removed and the 2 new lines with `discount` added.'
		},
		{
			prompt: 'Apply `discount wip` to your working tree and keep it in the stash list.',
			accept: [
				'git stash apply stash@{1}',
				"git stash apply 'stash@{1}'",
				'git stash apply "stash@{1}"',
				'git stash apply 1'
			],
			why: '`git stash apply` restores the entry and leaves it in the list. After it, `git stash list` still shows 2 entries, and `app/discount.py` is back as untracked.'
		},
		{
			prompt: 'Delete `pdf wip` from the stash list without applying it.',
			accept: [
				'git stash drop stash@{0}',
				'git stash drop',
				"git stash drop 'stash@{0}'",
				'git stash drop "stash@{0}"',
				'git stash drop 0'
			],
			why: '`git stash drop` removes one entry, and `stash@{0}` is the newest one, `pdf wip`. With no name, `drop` also takes `stash@{0}`. After it, `discount wip` is listed as `stash@{0}`.'
		},
		{
			prompt: 'Apply the newest entry and remove it from the list in one command.',
			accept: [
				'git stash pop',
				'git stash pop stash@{0}',
				'git stash pop 0'
			],
			why: '`git stash pop` applies `stash@{0}` and then drops it. If applying it hits a conflict, the entry stays in the list until you drop it yourself.'
		}
	],
	quiz: [],
	recall: {
		q: 'You stash with `git stash push -m "discount wip"`, and `app/discount.py` is still in `git status`. Which flag would have stashed it?',
		a: '`-u`, the short form of `--include-untracked`. Without it, git stashes only changes to tracked files.'
	},
	sources: [{ title: 'Git docs, git-stash', url: 'https://git-scm.com/docs/git-stash' }]
};
