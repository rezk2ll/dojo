/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-branches',
	part: 'Git',
	title: 'Branches',
	minutes: 10,
	hook: [
		'Ticket 1042 says invoice 1042 charges 1 cent too much VAT, and you need a branch for the fix. Lea wants you to read her branch `feature/pdf`, and Omar pushed a branch with tests that you want on your machine. Meanwhile `git branch` lists old branches that nobody has touched since they were merged.',
		'You are on `main` in the `invoices` repo, with no uncommitted changes, and `main` tracks `origin/main`. The other local branches are `fix-rounding` (merged into `main`), `feature/pdf` (1 commit not in `main`, pushed to `origin` but with no upstream set) and `spike/xml` (1 commit not in `main`, never pushed). On `origin`, Omar’s branch `fix/tax-tests` exists, and you have fetched it. Every rep starts from this state.'
	],
	terms: [
		{ term: 'branch', def: 'A name that points to one commit. Each new commit on the branch moves the name forward to it.' },
		{ term: 'remote-tracking branch', def: 'Your local copy of a branch on a remote, such as `origin/fix/tax-tests`. `git fetch` updates it.' },
		{ term: 'upstream', def: 'The remote-tracking branch a local branch is linked to. On that branch, `git status` compares with it and a plain `git pull` pulls from it.' },
		{ term: 'merged', def: 'A branch is merged into `main` when its newest commit is reachable from `main`, so deleting the branch loses no commit.' }
	],
	reps: [
		{
			prompt: 'Create a branch named `fix/vat-1042` from where you are, and switch to it.',
			accept: [
				'git switch -c fix/vat-1042',
				'git switch --create fix/vat-1042',
				'git switch -c fix/vat-1042 main',
				'git switch -c fix/vat-1042 HEAD',
				'git checkout -b fix/vat-1042',
				'git checkout -b fix/vat-1042 main',
				'git checkout -b fix/vat-1042 HEAD'
			],
			why: '`git switch -c fix/vat-1042` creates the branch at the current commit, then switches to it. `git checkout -b` is the older spelling of the same thing.'
		},
		{
			prompt: 'Create a branch named `release/2.4` at the current commit, and stay on `main`.',
			accept: [
				'git branch release/2.4',
				'git branch release/2.4 main',
				'git branch release/2.4 HEAD'
			],
			why: '`git branch release/2.4` creates the name at `HEAD` and does not switch. `git branch` with no argument would now list it without the `*` that marks the current branch.'
		},
		{
			prompt: 'You ran `git switch feature/pdf` to read Lea’s code. Go back to the branch you were on before, without typing its name.',
			accept: [
				'git switch -',
				'git switch @{-1}',
				'git checkout -',
				'git checkout @{-1}'
			],
			why: '`-` names the branch you were on before the last switch. The docs: "You may also specify - which is synonymous to @{-1}." Here it takes you back to `main`.'
		},
		{
			prompt: 'List the local branches, each with the short hash and subject of its last commit.',
			accept: [
				'git branch -v',
				'git branch --verbose',
				'git branch -v --list',
				'git branch --list -v',
				'git branch -l -v',
				'git branch -v -l'
			],
			why: '`-v` adds the short hash and the subject line of each branch’s newest commit. Here it prints 4 lines, with `*` in front of `main`.'
		},
		{
			prompt: 'List only the branches that are merged into `main`.',
			accept: [
				'git branch --merged main',
				'git branch --merged',
				'git branch --merged HEAD',
				'git branch --merged=main'
			],
			why: '`--merged main` keeps the branches whose newest commit is reachable from `main`. Here it prints `fix-rounding` and `main` itself. Without a commit, `--merged` uses `HEAD`, which is `main` here.'
		},
		{
			prompt: 'Delete `fix-rounding`, in the form where git refuses if the branch holds commits that are not merged.',
			accept: [
				'git branch -d fix-rounding',
				'git branch --delete fix-rounding'
			],
			why: '`-d` deletes the branch only if it is merged into its upstream, or into `HEAD` when it has no upstream. `fix-rounding` is merged into `main`, so git prints `Deleted branch fix-rounding`.'
		},
		{
			prompt: 'Delete `spike/xml` even though its commit is not merged anywhere.',
			accept: [
				'git branch -D spike/xml',
				'git branch -d -f spike/xml',
				'git branch -df spike/xml',
				'git branch -d --force spike/xml',
				'git branch --delete --force spike/xml',
				'git branch --delete -f spike/xml'
			],
			why: '`-D` is short for `--delete --force`. A plain `-d` here stops with `error: the branch \'spike/xml\' is not fully merged.` and keeps the branch.'
		},
		{
			prompt: 'Rename `feature/pdf` to `feature/pdf-export` without switching to it.',
			accept: [
				'git branch -m feature/pdf feature/pdf-export',
				'git branch --move feature/pdf feature/pdf-export',
				'git branch -M feature/pdf feature/pdf-export',
				'git branch -m -f feature/pdf feature/pdf-export',
				'git branch --move --force feature/pdf feature/pdf-export'
			],
			why: '`-m` takes the old name, then the new one. Git moves the branch’s config and reflog to the new name too. With only one name, `-m` renames the branch you are on.'
		},
		{
			prompt: 'List the remote-tracking branches.',
			accept: [
				'git branch -r',
				'git branch --remotes',
				'git branch -r --list',
				'git branch --list -r',
				'git branch -l -r',
				'git branch -r -l'
			],
			why: '`-r` lists the remote-tracking branches instead of the local ones. Here it prints one line per branch on `origin`, `origin/fix/tax-tests` among them.'
		},
		{
			prompt: 'Create a local branch `fix/tax-tests` that tracks `origin/fix/tax-tests`, and switch to it.',
			accept: [
				'git switch fix/tax-tests',
				'git switch -c fix/tax-tests origin/fix/tax-tests',
				'git switch -c fix/tax-tests --track origin/fix/tax-tests',
				'git switch --track origin/fix/tax-tests',
				'git switch -t origin/fix/tax-tests',
				'git checkout fix/tax-tests',
				'git checkout -b fix/tax-tests origin/fix/tax-tests',
				'git checkout -b fix/tax-tests --track origin/fix/tax-tests',
				'git checkout --track origin/fix/tax-tests',
				'git checkout -t origin/fix/tax-tests'
			],
			why: '`git switch fix/tax-tests` finds no local branch with that name, but finds `origin/fix/tax-tests` on exactly one remote. Git then runs the same as `git switch -c fix/tax-tests --track origin/fix/tax-tests`: it creates the branch there and sets its upstream.'
		},
		{
			prompt: 'Without leaving `main`, set the upstream of `feature/pdf` to `origin/feature/pdf`.',
			accept: [
				'git branch -u origin/feature/pdf feature/pdf',
				'git branch --set-upstream-to=origin/feature/pdf feature/pdf',
				'git branch --set-upstream-to origin/feature/pdf feature/pdf'
			],
			why: '`-u origin/feature/pdf` sets the upstream, and the last argument names the branch to change. Without that argument, git changes the current branch, which here is `main`.'
		},
		{
			prompt: 'List the local branches with their last commit and the upstream each one tracks.',
			accept: [
				'git branch -vv',
				'git branch -v -v',
				'git branch --verbose --verbose',
				'git branch -vv --list',
				'git branch --list -vv'
			],
			why: 'Given twice, `-v` also prints the upstream in brackets, such as `[origin/main]`. Here only `main` shows one, because `feature/pdf` has no upstream yet.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which flag of `git branch` deletes a branch only when it is merged, and which one deletes it anyway?',
		a: '`-d` deletes only a merged branch and refuses otherwise. `-D`, short for `--delete --force`, deletes it anyway.'
	},
	sources: [
		{ title: 'Git docs, git-branch', url: 'https://git-scm.com/docs/git-branch' },
		{ title: 'Git docs, git-switch', url: 'https://git-scm.com/docs/git-switch' },
		{ title: 'Git docs, git-checkout', url: 'https://git-scm.com/docs/git-checkout' }
	]
};
