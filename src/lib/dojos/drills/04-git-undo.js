/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-undo',
	part: 'Git',
	title: 'Undoing things',
	minutes: 10,
	hook: [
		'You staged the wrong file, wrote a typo in a commit message, and then a commit you pushed broke the VAT totals. Each mistake has its own undo command in git. Some of them only touch your files, some move the branch, and one of them gets back commits that look lost.',
		'You are on `main` in the `invoices` repo from the previous chapters, with no uncommitted changes. The last 3 commits on `main`, newest first, are `Add the reduced VAT rate` (it adds 2 lines to `app/tax.py`), `Merge branch \'fix-rounding\'` and `Skip empty invoice lines`. Each rep starts from this state, plus what its prompt describes.'
	],
	terms: [
		{ term: 'HEAD', def: 'The commit you are on. On a branch, it is the newest commit of that branch, and `HEAD~2` is its grandparent, following first parents.' },
		{ term: 'index', def: 'The staging area: what the next commit will contain. `git add` copies a file into it.' },
		{ term: 'reflog', def: 'A local log of every commit `HEAD` pointed to, newest first, numbered `HEAD@{0}`, `HEAD@{1}` and so on.' }
	],
	reps: [
		{
			prompt: 'You edited `app/billing.py` and have not staged it. Throw the edit away.',
			accept: [
				'git restore app/billing.py',
				'git restore -- app/billing.py',
				'git checkout app/billing.py',
				'git checkout -- app/billing.py'
			],
			why: 'Without `--staged`, `git restore` copies the file from the index back into the working tree. Your unstaged edit to `app/billing.py` is overwritten.'
		},
		{
			prompt: 'You edited `app/tax.py` and ran `git add app/tax.py` too early. Unstage it and keep the edit.',
			accept: [
				'git restore --staged app/tax.py',
				'git restore --staged -- app/tax.py',
				'git restore -S app/tax.py',
				'git restore -S -- app/tax.py',
				'git reset app/tax.py',
				'git reset -- app/tax.py',
				'git reset HEAD app/tax.py',
				'git reset HEAD -- app/tax.py',
				'git reset -q app/tax.py'
			],
			why: '`--staged` restores only the index, from `HEAD`. The file on disk keeps your edit, and `git status --short` shows ` M app/tax.py`.'
		},
		{
			prompt: 'Put `app/tax.py` back as it was in `HEAD~2`, in the working tree only.',
			accept: [
				'git restore --source=HEAD~2 app/tax.py',
				'git restore --source=HEAD~2 -- app/tax.py',
				'git restore --source HEAD~2 app/tax.py',
				'git restore --source HEAD~2 -- app/tax.py',
				'git restore -s HEAD~2 app/tax.py',
				'git restore -s HEAD~2 -- app/tax.py',
				'git restore -sHEAD~2 app/tax.py'
			],
			why: '`--source=HEAD~2` takes the file from that commit instead of the index. You get the `round(amount * RATE, 2)` version on disk, unstaged, and no commit moves.'
		},
		{
			prompt: 'You forgot `README.md` in the last commit. It is staged now. Add it to the last commit and keep the message.',
			accept: [
				'git commit --amend --no-edit',
				'git commit --no-edit --amend'
			],
			why: '`--amend` replaces the last commit with a new one built from the index, so `README.md` is in it. `--no-edit` keeps the old message and opens no editor. The new commit has a new hash.'
		},
		{
			prompt: 'Change the last commit’s message to `Add the reduced VAT rate of 5.5%`. You have no staged changes.',
			accept: [
				'git commit --amend -m "Add the reduced VAT rate of 5.5%"',
				"git commit --amend -m 'Add the reduced VAT rate of 5.5%'",
				'git commit --amend --message="Add the reduced VAT rate of 5.5%"',
				'git commit -m "Add the reduced VAT rate of 5.5%" --amend',
				"git commit -m 'Add the reduced VAT rate of 5.5%' --amend",
				'git commit --message="Add the reduced VAT rate of 5.5%" --amend'
			],
			why: '`-m` gives the new message, and `--amend` puts it on a new commit that replaces the last one. Nothing is staged, so the files in the commit stay the same.'
		},
		{
			prompt: 'The last commit is already pushed and breaks the totals. Undo it with a new commit, using the default message and no editor.',
			accept: [
				'git revert --no-edit HEAD',
				'git revert HEAD --no-edit'
			],
			why: '`git revert HEAD` records a new commit that removes the 2 lines `HEAD` added to `app/tax.py`. `--no-edit` keeps the default message `Revert "Add the reduced VAT rate"`. The original commit stays in the history.'
		},
		{
			prompt: 'Undo the last commit, but keep its changes staged.',
			accept: [
				'git reset --soft HEAD~1',
				'git reset --soft HEAD~',
				'git reset --soft HEAD^',
				'git reset --soft @~'
			],
			why: '`--soft` moves `main` back one commit and leaves the index and the working tree alone. `git status --short` shows the undone change as staged: `M  app/tax.py`.'
		},
		{
			prompt: 'Undo the last 2 commits and keep their changes on disk, unstaged.',
			accept: [
				'git reset HEAD~2',
				'git reset --mixed HEAD~2',
				'git reset HEAD^^',
				'git reset --mixed HEAD^^',
				'git reset HEAD~~',
				'git reset -q HEAD~2'
			],
			why: '`git reset` with no mode uses `--mixed`. It moves `main` to `HEAD~2` and resets the index to match, but leaves the files on disk, so the changes show as ` M app/tax.py`.'
		},
		{
			prompt: 'You ran `git reset --hard HEAD~3` and the 3 commits are gone from `git log`. List where `HEAD` has been.',
			accept: [
				'git reflog',
				'git reflog show',
				'git reflog show HEAD',
				'git reflog HEAD'
			],
			why: '`git reflog` prints the reflog of `HEAD`, newest first. `HEAD@{0}` is `reset: moving to HEAD~3`, and `HEAD@{1}` is `commit: Add the reduced VAT rate`, where you were before the reset.'
		},
		{
			prompt: 'After that `git reset --hard HEAD~3`, move `main` back to where `HEAD` was one move earlier.',
			accept: [
				'git reset --hard HEAD@{1}',
				"git reset --hard 'HEAD@{1}'",
				'git reset --hard "HEAD@{1}"'
			],
			why: '`HEAD@{1}` names where `HEAD` was one move ago. `--hard` moves `main` there and makes the index and the working tree match, so the 3 commits are back.'
		}
	],
	quiz: [],
	recall: {
		q: 'You undid 3 commits with `git reset --hard HEAD~3`. Which command lists where `HEAD` was before, and which name points at the old tip?',
		a: '`git reflog`. The old tip is `HEAD@{1}`, so `git reset --hard HEAD@{1}` brings the 3 commits back.'
	},
	sources: [
		{ title: 'Git docs, git-restore', url: 'https://git-scm.com/docs/git-restore' },
		{ title: 'Git docs, git-reset', url: 'https://git-scm.com/docs/git-reset' },
		{ title: 'Git docs, git-commit', url: 'https://git-scm.com/docs/git-commit' },
		{ title: 'Git docs, git-revert', url: 'https://git-scm.com/docs/git-revert' },
		{ title: 'Git docs, git-reflog', url: 'https://git-scm.com/docs/git-reflog' },
		{ title: 'Git docs, gitrevisions', url: 'https://git-scm.com/docs/gitrevisions' }
	]
};
