const K8S = 'https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'branches-and-merging',
	part: 'Git',
	title: 'Branches, merge and rebase',
	minutes: 10,
	hook: [
		'Two admins edit the same config on the same server on the same day. The second save overwrites the first, and **nobody is told**.',
		'In Git, each of you works on a **branch**. A branch is only a pointer to a commit, so making one copies no files and costs nothing.',
		'When the work comes back together, Git either merges (it joins the two lines with a new commit) or rebases (it replays your commits on top of the other line). If you both changed the same lines, Git stops with a **conflict** and asks you which version to keep.'
	],
	terms: [
		{ term: 'Branch', def: 'A movable pointer to one commit. Each new commit on the branch moves the pointer forward.' },
		{ term: 'Fast-forward', def: 'A merge where the target branch has not moved since the split. Git just moves the pointer, no new commit.' },
		{ term: 'Merge commit', def: 'A commit with two parents, written by a three-way merge: the two branch tips plus their common ancestor.' },
		{ term: 'Rebase', def: 'Replaying your commits on top of another branch. Same changes, new commits with new hashes.' }
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
				note: 'Meanwhile a hotfix C4 lands on `main`, so `main` now points at C4. The history has diverged. C2 is the **common ancestor** of both tips.'
			},
			{
				add: ['c3 --> m["M: merge commit, two parents"]', 'c4 --> m'],
				highlight: ['m'],
				note: '`git merge feature` while on `main`: Git compares C3, C4 and their common ancestor C2 (a **three-way merge**), then writes M with two parents. `main` moves to M. C3 and C4 keep their hashes.'
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
			'Lines 11 and 12: `git fetch upstream` downloads the new commits, and `git rebase upstream/master` replays your work on top. Kubernetes picks **rebase** to keep a branch in sync, so it stays a straight line on top of `master`.',
			'Lines 15 to 18 assume `git pull` is `fetch` plus `merge`: every sync of a diverged branch would add a merge commit with no change of its own. The guide calls that history "messy". Recent Git stops instead and asks you to pick `--rebase` or `--no-rebase`.',
			'Rebase makes new commits, so the copy already on your fork no longer matches. The same guide therefore pushes with [`git push -f`](https://github.com/kubernetes/community/blob/440e496d3a172234d81728df1bfe43849b589adf/contributors/guide/github-workflow.md#L111-L118), and later with the safer `--force-with-lease`.',
			'The force push is safe here because the branch is **yours alone**, on your fork. Pro Git: do not rebase commits that exist outside your repository and that people may have based work on.'
		]
	},
	tradeoff: {
		gain: [
			'Merge rewrites no commit, and the history shows that the work ran in parallel.',
			'Rebase gives a straight line: `git log` shows one change after another, with no merge commits.',
			'Branches are cheap, so you can try an idea, throw the branch away, and lose nothing on `main`.'
		],
		cost: [
			'A log full of "Merge branch main into feature" commits hides the real changes.',
			'Rebase gives every replayed commit a new hash. If the branch was already pushed, you must force push, and anyone who built on the old commits has to repair their branch.',
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
		],
		steps: [
			{
				title: 'Read the markers',
				questions: [
					{ q: 'Why did Git stop instead of merging on its own?', options: ['`main` and `feature` both changed the same line', '`feature` is older than `main`', '`nginx.conf` has no common ancestor', 'Git never merges config files on its own'], answer: 0, why: 'When both sides changed the same lines, Git cannot pick one. It stops with a conflict and asks you.' },
					{ q: 'Whose version is `worker_connections 2048;`, between `<<<<<<< HEAD` and `=======`?', options: ['The version from `feature`', 'The common ancestor\'s version', 'The version on `main`, the branch you are on', 'The version on the remote'], answer: 2, why: 'HEAD is the branch you are on. You ran the merge on `main`, so that side is `main`.' },
					{ q: 'Whose version is `worker_connections 4096;`, before `>>>>>>> feature`?', options: ['The version on `main`', 'The version from `feature`, the branch you merge in', 'A value Git computed from both sides', 'The value from the last commit on `main`'], answer: 1, why: 'The bottom half comes from the branch you are merging in, and the marker names it.' },
					{ q: 'What does the `=======` line do?', options: ['It marks the line Git kept', 'It is part of the nginx syntax', 'It shows where the common ancestor starts', 'It separates the two versions'], answer: 3, why: 'It is a marker, like the other two. Your side is above it, the other side below.' }
				]
			},
			{
				title: 'Choose and clean up',
				questions: [
					{ q: 'You do not know if 2048 or 4096 is right. What do you do?', options: ['Keep both lines, nginx uses the last one', 'Ask the author of the other side', 'Keep `main`, since it is the target branch', 'Keep the bigger number'], answer: 1, why: 'The conflict is a question about intent. The person who wrote the other side knows why.' },
					{ q: 'Which lines do you delete once you pick a value?', options: ['Only `=======`', 'The `<<<<<<<` and `>>>>>>>` lines only', 'All three marker lines and the value you drop', 'None: Git removes them at commit time'], answer: 2, why: 'Git wants the markers gone. The file you save is the file that goes into the merge commit.' },
					{ q: 'Why run `nginx -t` before you go on?', options: ['To check the config you are about to commit is valid', 'To tell Git the conflict is fixed', 'To reload nginx with the new value', 'To find the other conflicts in the repo'], answer: 0, why: 'A merge can produce a file that no side wrote. Check it before it becomes a commit.' },
					{ q: 'You saved the clean file, but Git still lists it as a conflict. Why?', options: ['You must delete the file and recreate it', 'nginx has not reloaded yet', 'The merge needs `git merge --abort` first', 'You have not staged it with `git add` yet'], answer: 3, why: 'Saving only changes the working tree. Git counts the conflict as resolved once the file is staged.' }
				]
			},
			{
				title: 'Finish the merge',
				questions: [
					{ q: 'Which command marks the conflict in `nginx.conf` as resolved?', options: ['`git add nginx.conf`', '`git restore nginx.conf`', '`git merge --continue-all`', '`git rebase main`'], answer: 0, why: 'Staging the cleaned file tells Git this conflict is settled.' },
					{ q: 'To find that both sides changed `worker_connections`, which third commit did Git compare them with?', options: ['The first commit of the repository', 'Their common ancestor, where `feature` split off from `main`', 'The last commit you pushed', 'The previous merge commit on `main`'], answer: 1, why: 'A three-way merge compares the two branch tips with their common ancestor. A line changed on both sides since that ancestor is a conflict.' },
					{ q: 'What happens to the commits that were on `feature`?', options: ['They get new hashes', 'They are deleted from history', 'They keep their hashes', 'They are squashed into the merge commit'], answer: 2, why: 'Merge rewrites no commit. Only rebase replays commits with new hashes.' },
					{ q: 'Where does `main` point once the commit is done?', options: ['At the tip of `feature`', 'At the common ancestor', 'Still at the commit it had before', 'At the new merge commit'], answer: 3, why: 'You were on `main`, so committing moves `main` forward to the merge commit.' }
				]
			},
			{
				title: 'Know the way out',
				questions: [
					{ q: 'You are lost halfway through. Which command tries to bring you back to before the merge?', options: ['`git restore .`', '`git merge --abort`', '`git switch feature`', '`git commit --amend`'], answer: 1, why: '`git merge --abort` tries to put things back as they were before the merge, so you can start again.' },
					{ q: 'Could this merge have been a fast-forward?', options: ['No: `main` moved since `feature` split off', 'Yes, if you used `git merge --abort` first', 'Yes: every merge of two branches is', 'Only if `feature` had one commit'], answer: 0, why: 'A fast-forward needs the target branch unmoved since the split. Here `main` got its own change.' },
					{ q: 'What makes conflicts like this one bigger?', options: ['Using merge instead of rebase', 'Small commits on `feature`', 'Two branches living apart for a long time', 'Running `git fetch` too often'], answer: 2, why: 'The longer two branches live apart, the more they change, and the bigger the conflict when they meet.' },
					{ q: 'Next time, how does the Kubernetes guide keep a working branch close to upstream?', options: ['`git pull` on every branch, every day', '`git merge main` into `feature` each hour', 'A force push of `main` onto the fork', '`git fetch upstream`, then `git rebase upstream/master`'], answer: 3, why: 'Syncing often keeps the branch near the other line. Kubernetes picks fetch plus rebase so the branch stays a straight line.' }
				]
			}
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
				'Git writes a merge commit with two parents, `main` and `feature`',
				'Git fast-forwards: it moves `main` to the tip of `feature`, no new commit',
				'Git rebases `feature` onto `main`, then moves `main` to the result',
				'Git stops with a conflict, since `feature` changed files that `main` also has'
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
	lab: {
		minutes: 15,
		goal: 'Cause the chapter\'s conflict on purpose, resolve it into a merge commit, then see a fast-forward.',
		steps: [
			'Make a repo: `mkdir -p ~/merge-lab && cd ~/merge-lab && git init -b main && printf \'worker_connections 1024;\\n\' > nginx.conf && git add . && git commit -m "C1"`.',
			'Diverge: `git switch -c feature && printf \'worker_connections 4096;\\n\' > nginx.conf && git commit -am "C3: 4096"`, then `git switch main && printf \'worker_connections 2048;\\n\' > nginx.conf && git commit -am "C4: 2048"`.',
			'Merge and read the conflict: `git merge feature`, then `cat nginx.conf` and `git status --short`. Back out once with `git merge --abort` and `cat nginx.conf`.',
			'Merge again and resolve: `git merge feature`, write the value you keep with `printf \'worker_connections 4096;\\n\' > nginx.conf`, then `git add nginx.conf && git commit --no-edit`. Look at `git log --oneline --graph` and `git cat-file -p HEAD`.',
			'See a fast-forward: `git switch -c quick && echo \'# tuned\' >> nginx.conf && git commit -am "C5" && git switch main && git merge quick`.'
		],
		done: [
			'In step 3, `cat nginx.conf` shows `<<<<<<< HEAD`, `worker_connections 2048;`, `=======`, `worker_connections 4096;` and `>>>>>>> feature`, and `git status --short` shows `UU nginx.conf`.',
			'After `git merge --abort`, `cat nginx.conf` shows only `worker_connections 2048;`.',
			'In step 4, `git cat-file -p HEAD` lists two `parent` lines, and the graph shows C3 and C4 joining.',
			'In step 5, `git merge quick` prints `Fast-forward`.'
		],
		solution: [
			'`UU` means both sides changed the file. The top half is HEAD, `main`; the bottom half is `feature`.',
			'Removing the markers and running `git add` resolves the conflict. `git commit --no-edit` keeps Git\'s message, `Merge branch \'feature\'`.',
			'`main` had not moved since `quick` split off, so Git only moved the pointer: no new commit, one parent.'
		]
	},
	recall: {
		q: '`main` got hotfix C4 after you committed C3 on `feature`. What does `git merge feature` write, and what does `git rebase main` do instead?',
		a: 'Merge writes a merge commit with two parents, C3 and C4. Rebase replays C3 on top of C4 as a new commit with a new hash, so you rebase only commits nobody else has built on.'
	},
	sources: [
		{ title: 'Pro Git, Basic Branching and Merging', url: 'https://git-scm.com/book/en/v2/Git-Branching-Basic-Branching-and-Merging' },
		{ title: 'Pro Git, Rebasing', url: 'https://git-scm.com/book/en/v2/Git-Branching-Rebasing' },
		{ title: 'Git docs, git-merge', url: 'https://git-scm.com/docs/git-merge' },
		{ title: 'Kubernetes, GitHub Workflow', url: `${K8S}/contributors/guide/github-workflow.md` }
	]
};
