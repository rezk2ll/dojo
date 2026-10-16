const K8S = 'https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'branches-and-merging',
	part: 'Git',
	title: 'Branches, merge and rebase',
	minutes: 10,
	hook: [
		'Two admins edit the same config on the same server on the same day. The last one to save wins. The other change is **silently lost**.',
		'In Git, each of you works on a **branch**. A branch is only a pointer to a commit, so making one copies no files and costs nothing.',
		'When the work comes back together, Git either **merges** (joins the two lines with a new commit) or **rebases** (replays your commits on top of the other line). If you both changed the same lines, Git stops and asks you. That is a **conflict**, and it is a feature: nothing gets lost quietly.'
	],
	terms: [
		{ term: 'Branch', def: 'A movable pointer to one commit. Each new commit on the branch moves the pointer forward.' },
		{ term: 'Common ancestor', def: 'The last commit two branches share, the point where they split.' },
		{ term: 'Fast-forward', def: 'A merge where the target branch has not moved since the split. Git just moves the pointer, no new commit.' },
		{ term: 'Merge commit', def: 'A commit with two parents, written by a three-way merge: the two branch tips plus their common ancestor.' },
		{ term: 'Rebase', def: 'Replaying your commits on top of another branch. Same changes, new commits with new hashes.' },
		{ term: 'Conflict', def: 'Both sides changed the same lines. Git marks the file and waits for you to choose.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c1["C1"] --> c2["C2"]'],
				highlight: ['c2'],
				note: 'Two commits on `main`. In this diagram, arrows go **forward in time**. The branch `main` is a pointer at C2.'
			},
			{
				add: ['c2 --> c3["C3 on feature"]'],
				highlight: ['c3'],
				note: '`git switch -c feature` creates a new pointer at C2. Your commit C3 moves only `feature`. `main` stays where it was.'
			},
			{
				add: ['c2 --> c4["C4 on main: hotfix"]'],
				highlight: ['c4', 'c2'],
				note: 'Meanwhile a hotfix C4 lands on `main`, so `main` now points at C4. The history has **diverged**. C2 is the **common ancestor** of both tips.'
			},
			{
				add: ['c3 --> m["M: merge commit, two parents"]', 'c4 --> m'],
				highlight: ['m'],
				note: '`git merge feature` while on `main`: Git compares C3, C4 and their common ancestor C2 (a **three-way merge**), then writes M with two parents. `main` moves to M. Nothing is rewritten.'
			},
			{
				add: ['c4 -.->|"or: git rebase main"| c3r["C3 prime: same change, new hash"]'],
				highlight: ['c3r'],
				note: 'The other way: on `feature`, `git rebase main` replays C3 on top of C4 as a new commit. The final snapshot is the same as M, but the history is **one straight line**. Then `main` can fast-forward to it.'
			}
		]
	},
	example: {
		title: 'contributors/guide/github-workflow.md',
		repo: 'kubernetes/community',
		url: `${K8S}/contributors/guide/github-workflow.md#L79-L99`,
		lang: 'markdown',
		code: `## 4. Keep your branch in sync

You will need to periodically fetch changes from the \`upstream\`
repository to keep your working branch in sync. Note that depending on which repository you are working from,
the default branch may be called 'main' instead of 'master'.

Make sure your local repository is on your working branch and run the
following commands to keep it in sync:

\`\`\`sh
git fetch upstream
git rebase upstream/master
\`\`\`

Please don't use \`git pull\` instead of the above \`fetch\` and
\`rebase\`. Since \`git pull\` executes a merge, it creates merge commits. These make the commit history messy
and violate the principle that commits ought to be individually understandable
and useful (see below).

You might also consider changing your \`.git/config\` file via
\`git config branch.autoSetupRebase always\` to change the behavior of \`git pull\`, or another non-merge option such as \`git pull --rebase\`.`,
		notes: [
			'Kubernetes picks **rebase** for keeping a branch in sync: `git fetch` downloads the new commits, `git rebase` replays your work on top. Your branch stays a straight line on top of `master`.',
			'The guide assumes `git pull` is `fetch` plus `merge`: every sync of a diverged branch would add a merge commit that says nothing. That is the "messy" history they refuse. Recent Git stops instead and asks you to pick `--rebase` or `--no-rebase`.',
			'Rebase makes new commits, so the copy already on your fork no longer matches. That is why the same guide pushes with [`git push -f`](https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf/contributors/guide/github-workflow.md#L111-L118), and later with the safer `--force-with-lease`.',
			'It is safe here because the branch is **yours alone**, on your fork. Pro Git\'s one rule: do not rebase commits that exist outside your repository and that people may have based work on.'
		]
	},
	tradeoff: {
		gain: [
			'Merge keeps history true: you see that work ran in parallel, and no commit is rewritten.',
			'Rebase gives a straight line: `git log` reads like a story, one change after another.',
			'Branches are cheap, so you can try an idea, throw the branch away, and lose nothing on `main`.'
		],
		cost: [
			'Merge commits pile up. A log full of "Merge branch main into feature" hides the real changes.',
			'Rebase rewrites hashes. If the branch was already pushed, you must force push, and anyone who built on the old commits gets a mess.',
			'The longer two branches live apart, the bigger the conflict when they meet.'
		]
	},
	task: {
		prompt: 'You run `git merge feature` on `main` and Git stops with `CONFLICT (content): Merge conflict in nginx.conf`. The file now contains `<<<<<<< HEAD`, then `worker_connections 2048;`, then `=======`, then `worker_connections 4096;`, then `>>>>>>> feature`. Explain each part and finish the merge.',
		hint: 'One side is the branch you are on, the other is the branch you are merging in. Git wants the markers gone and the file staged.',
		answer: [
			'Between `<<<<<<< HEAD` and `=======`: the version on the branch you are on, `main`. Between `=======` and `>>>>>>> feature`: the version from `feature`.',
			'Choose the right value (ask the author of the other side if you do not know), delete all three marker lines, save. Run `nginx -t` while you are at it.',
			'`git add nginx.conf` marks the conflict as resolved. Then `git commit` writes the merge commit.',
			'Lost? `git merge --abort` tries to bring you back to the state before the merge, so you can start again.'
		]
	},
	quiz: [
		{
			q: 'What is a Git branch?',
			options: [
				'A movable pointer to one commit',
				'A full copy of the project files in a separate folder',
				'A list of diffs waiting to be merged',
				'A copy of the repository on another server'
			],
			answer: 0,
			why: 'A branch is a small ref that holds one commit hash. Committing on it moves the pointer forward. No files are copied.'
		},
		{
			q: '`main` has not moved since you created `feature`. You run `git merge feature` on `main`. What happens?',
			options: [
				'Git writes a merge commit with two parents',
				'Git fast-forwards: it moves `main` to the tip of `feature`, no new commit',
				'Git rebases `feature` onto `main`',
				'Git reports a conflict'
			],
			answer: 1,
			why: 'When the tip of `feature` is directly ahead of `main`, there is nothing to combine. Git just moves the pointer forward.'
		},
		{
			q: 'Which rebase is the risky one?',
			options: [
				'Rebasing a local branch nobody else has fetched',
				'Rebasing onto the latest `main` before opening a pull request',
				'Rebasing to squash typo commits before anyone has seen them',
				'Rebasing commits that are already pushed and that others have built work on'
			],
			answer: 3,
			why: 'Rebase replaces commits with new ones. If others built on the old ones, their history and yours no longer match.'
		}
	],
	takeaway: 'A branch is a pointer, so branching is free. Merge joins two lines with a new commit, rebase replays yours on top, and you only rebase what nobody else has built on.',
	sources: [
		{ title: 'Pro Git, Basic Branching and Merging', url: 'https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging' },
		{ title: 'Pro Git, Rebasing', url: 'https://git-scm.com/book/en/v2/Git-Branching-Rebasing' },
		{ title: 'Git docs, git-merge', url: 'https://git-scm.com/docs/git-merge' },
		{ title: 'Kubernetes, GitHub Workflow', url: `${K8S}/contributors/guide/github-workflow.md` }
	]
};
