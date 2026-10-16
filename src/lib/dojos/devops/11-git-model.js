const GI = 'https://github.com/github/gitignore/blob/0e5d690153ca3da8a4a1aef2d053406f408f531c';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-model',
	part: 'Git',
	title: 'Git: snapshots, three areas and HEAD',
	minutes: 10,
	hook: [
		'You have done this: `cp nginx.conf nginx.conf.bak-2024-03-02`, edit, reload, hope. A month later there are six `.bak` files and nobody knows which one worked.',
		'Git does not keep a list of edits. **Every commit is a snapshot** of the whole project, with an author, a message and a link to the commit before it.',
		'A file can sit in three places: the working tree on disk, the index, and the repository in `.git`. Names called refs point at commits, and HEAD says which ref you are on.'
	],
	terms: [
		{ term: 'Commit', def: 'A snapshot of the whole project, named by its hash (by default SHA-1, 40 hex characters), with author, message and a pointer to its parent commit.' },
		{ term: 'Index', def: 'Also called the staging area. A file inside `.git` that holds what will go into your next commit.' },
		{ term: 'Ref', def: 'A name for a commit. A branch like `main` is a ref, `refs/heads/main`, that holds one commit hash. Often it is a small file of that name; after `git gc` it can sit in `.git/packed-refs` instead.' },
		{ term: 'HEAD', def: 'Which ref you are on right now. Usually it holds a branch name like `refs/heads/main`; in detached HEAD it holds a commit hash.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['wt["Working tree: files you edit"]'],
				highlight: ['wt'],
				note: 'You edit `nginx.conf` in the **working tree**, like any file. Git notices it is modified, but nothing is saved in history yet.'
			},
			{
				add: ['wt -->|"git add"| idx["Index: the next commit"]'],
				highlight: ['idx'],
				note: '`git add nginx.conf` copies the current version into the **index**. The file is now staged. You choose what goes into the next commit, file by file.'
			},
			{
				add: [
					'subgraph repo["Repository: .git"]',
					'c1["commit 1"]',
					'c2["commit 2"] -->|parent| c1',
					'end',
					'idx -->|"git commit"| c2'
				],
				highlight: ['c2'],
				note: '`git commit` turns the index into a **snapshot** in the repository. Each commit points to its parent. Files that did not change are not stored again, only linked to the copy Git already has.'
			},
			{
				add: ['main["main = refs/heads/main"] --> c2', 'head["HEAD"] --> main'],
				highlight: ['main', 'head'],
				note: 'The branch `main` is a ref that holds the hash of commit 2. **HEAD points at main**, so the next commit moves main forward, and HEAD follows.'
			},
			{
				add: ['head -.->|"git checkout commit 1"| c1'],
				highlight: ['head', 'c1'],
				note: 'Check out a commit or a tag and HEAD holds a hash instead of a branch name: **detached HEAD**. You can look around, but a new commit here belongs to no branch.'
			}
		]
	},
	example: {
		title: 'Terraform.gitignore',
		repo: 'github/gitignore',
		url: `${GI}/Terraform.gitignore#L1-L17`,
		lang: 'ini',
		code: `# Local .terraform directories
.terraform/

# .tfstate files
*.tfstate
*.tfstate.*

# Crash log files
crash.log
crash.*.log

# Exclude all .tfvars files, which are likely to contain sensitive data, such as
# password, private keys, and other secrets. These should not be part of version
# control as they are data points which are potentially sensitive and subject
# to change depending on the environment.
*.tfvars
*.tfvars.json`,
		notes: [
			'Lines 2 to 17 list paths that **never reach the index**. `git add .` skips them, so they stay in the working tree only.',
			'It only protects untracked files. The [gitignore docs](https://git-scm.com/docs/gitignore): "Files already tracked by Git are not affected". To stop tracking one, `git rm --cached` removes it from the index.',
			'Lines 12 to 17 ignore `.tfvars` files because they may hold passwords. If a `.tfvars` lands in one commit, deleting it in the next commit does not remove it. **The old snapshot still has it**, in every clone.',
			'Ignore files belong in the repository. Commit `.gitignore` so everyone on the team gets the same rules.'
		]
	},
	tradeoff: {
		gain: [
			'Every commit is a full snapshot with a checksum: you can get back any version, and Git detects a corrupted file.',
			'The index lets you commit part of your work: the fix goes in, the debug change stays out.',
			'A branch is a tiny ref holding one hash, so making one costs nothing.'
		],
		cost: [
			'A secret committed once stays in the old snapshots until someone rewrites history.',
			'`git diff` shows only the changes not staged yet, and `git diff --staged` shows the staged ones, so you check two places.',
			'A hash is 40 hex characters nobody remembers, so you need refs: branches and tags.'
		]
	},
	task: {
		prompt: 'Your server config repo has two modified files: `nginx.conf` (a real fix) and `debug.conf` (a test you will throw away). Write the commands to commit only the fix and drop the test. After each command, say where each file\'s new version is: working tree, index or repository.',
		hint: '`git add` copies a file into the index. `git commit` turns the index into a snapshot. `git restore` puts a file back from the index.',
		answer: [
			'`git status`: both files are modified in the working tree only. The index still matches the last commit.',
			'`git add nginx.conf`: the fix is now in the working tree **and** the index. `debug.conf` is still only in the working tree.',
			'`git commit -m "Raise worker_connections"`: the fix is now a snapshot in the repository. `main` moves to the new commit and HEAD still points at `main`.',
			'`git restore debug.conf`: copies the version from the index back over your test edit. The test is gone, nothing was committed.'
		]
	},
	quiz: [
		{
			q: 'What does a Git commit store?',
			options: [
				'Only the lines that changed since the previous commit, plus the author and message',
				'A snapshot of the whole project, plus author, message and a link to its parent commit',
				'A copy of the working tree, including ignored files, plus a link to the parent',
				'The difference between the index and the working tree'
			],
			answer: 1,
			why: 'Each commit points to the full set of files. Files that did not change point to the copy already stored, so a snapshot takes little space.'
		},
		{
			q: 'You ran `git add app.conf` but not `git commit`. Where is the new version of `app.conf`?',
			options: [
				'Only in the working tree, until you run `git commit`',
				'In a new commit on `main`, not yet pushed to the remote',
				'In the working tree and the index, not yet in any commit',
				'On the remote server, waiting for the next `git pull`'
			],
			answer: 2,
			why: '`git add` stages the file in the index. It reaches the repository only with `git commit`, and the remote only with `git push`.'
		},
		{
			q: 'What is HEAD, most of the time?',
			options: [
				'A pointer to the branch you are on, like `refs/heads/main`',
				'The newest commit in the repository, on any branch',
				'The `main` branch on the remote server',
				'Another name for the index'
			],
			answer: 0,
			why: 'HEAD is usually a symbolic reference to the current branch. It holds a commit hash directly only in the detached HEAD state.'
		}
	],
	recall: {
		q: 'You ran `git add nginx.conf` but not `git commit`. Where is the new version, and what does HEAD point at?',
		a: 'In the working tree and the index, in no commit yet. HEAD points at the branch `main`, which holds the hash of the last commit.'
	},
	sources: [
		{ title: 'Pro Git, What is Git?', url: 'https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F' },
		{ title: 'Pro Git, Branches in a Nutshell', url: 'https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell' },
		{ title: 'Pro Git, Git References', url: 'https://git-scm.com/book/en/v2/Git-Internals-Git-References' },
		{ title: 'Pro Git, Recording Changes to the Repository', url: 'https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository' },
		{ title: 'Git docs, gitignore', url: 'https://git-scm.com/docs/gitignore' }
	]
};
