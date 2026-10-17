/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-rebase',
	part: 'Git',
	title: 'Rebase and cherry-pick',
	minutes: 10,
	hook: [
		'You work in the `shop-api` repo. Your branch `feature/coupons` left `main` at commit `a9e72ef` and holds 3 commits: `45b9cd6` "Add coupon codes", `25c65af` "Apply coupon in cart total" and `ae6dc34` "Test coupons". Since then, `main` got 2 commits: `2951c52` "Fix rounding in cart total" and `1c9f830` "Bump version to 1.5.0". Both the rounding fix and `25c65af` change the same line of `src/cart.js`.',
		'Two more branches exist. `release/1.4` still points at `a9e72ef`, and the 1.4 release needs the rounding fix. `feature/export` was started from the tip of `feature/coupons` and adds 1 commit, `5051dd9` "Add CSV export", which only creates `src/export.js`. You are on `feature/coupons` with a clean working tree. Reps 2 and 3 continue from rep 1; every other rep starts again from this state.'
	],
	terms: [
		{ term: 'rebase', def: 'Git takes the commits of a branch, applies them one by one on top of another commit, and moves the branch to the last new commit.' },
		{ term: 'cherry-pick', def: 'Git applies the change of one existing commit on top of the current branch and records it as a new commit with a new hash.' },
		{ term: '`A..B`', def: 'The commits reachable from `B` that are not reachable from `A`. `A` itself is left out.' }
	],
	reps: [
		{
			prompt: 'Replay the 3 commits of `feature/coupons` on top of the current `main`.',
			accept: ['git rebase main', 'git rebase main feature/coupons'],
			why: '`git rebase main` applies every commit of the current branch that `main` does not have on top of `main`. Here it stops at `25c65af` with `CONFLICT (content): Merge conflict in src/cart.js`, because the rounding fix changed the same line.'
		},
		{
			prompt: 'The rebase stopped on the conflict. You edited `src/cart.js` to keep both changes. Mark the file as resolved.',
			accept: ['git add src/cart.js', 'git add ./src/cart.js', 'git stage src/cart.js', 'git add .', 'git add -A'],
			why: '`git add src/cart.js` stages the edited file, and staging is how you tell Git the conflict in that file is resolved. `git status` then shows `M  src/cart.js` instead of `UU src/cart.js`.'
		},
		{
			prompt: 'Now that `src/cart.js` is staged, let the rebase apply the remaining commits.',
			accept: ['git rebase --continue'],
			why: '`--continue` records the resolved commit and applies the next one, `Test coupons`. Git then prints `Successfully rebased and updated refs/heads/feature/coupons.`'
		},
		{
			prompt: 'Start over: the rebase stopped on the same conflict, and this time you want `feature/coupons` back exactly as it was before the rebase.',
			accept: ['git rebase --abort'],
			why: '`--abort` stops the rebase and puts the branch back on its old tip, `ae6dc34`. `git status` then shows a clean tree on `feature/coupons`.'
		},
		{
			prompt: 'You are on `release/1.4`. Copy the rounding fix `2951c52` onto it.',
			accept: ['git cherry-pick 2951c52', 'git cherry-pick main~1', 'git cherry-pick main^', 'git cherry-pick main~'],
			why: '`git cherry-pick 2951c52` applies the change of that commit to `release/1.4` and records a new commit with the same message and a new hash. `main~1` names the same commit, the parent of the tip of `main`.'
		},
		{
			prompt: 'On `release/1.4` again, copy `2951c52`, and make the new commit message say which commit it came from.',
			accept: ['git cherry-pick -x 2951c52', 'git cherry-pick 2951c52 -x', 'git cherry-pick -x main~1', 'git cherry-pick -x main^'],
			why: '`-x` appends the line `(cherry picked from commit 2951c529b056bd8c38be55a17e98cfda4433de01)` to the message. The docs add that this is "done only for cherry picks without conflicts".'
		},
		{
			prompt: 'On `main`, you ran `git cherry-pick 25c65af` and it stopped on a conflict in `src/cart.js`. Cancel it and go back to where `main` was.',
			accept: ['git cherry-pick --abort'],
			why: '`git cherry-pick --abort` cancels the operation and returns to the state before it started. `main` stays on `1c9f830` and the working tree is clean again.'
		},
		{
			prompt: 'On `release/1.4`, copy every commit that `feature/coupons` has and `main` does not, in one command.',
			accept: [
				'git cherry-pick main..feature/coupons',
				'git cherry-pick ^main feature/coupons',
				'git cherry-pick feature/coupons ^main',
				'git cherry-pick HEAD..feature/coupons',
				'git cherry-pick ..feature/coupons',
				'git cherry-pick release/1.4..feature/coupons'
			],
			why: '`main..feature/coupons` is the commits reachable from `feature/coupons` minus those reachable from `main`: `45b9cd6`, `25c65af` and `ae6dc34`. Git applies them oldest first and makes 3 new commits on `release/1.4`.'
		},
		{
			prompt: 'On `release/1.4`, copy only `45b9cd6` and `25c65af`, written as one range that includes `45b9cd6`.',
			accept: [
				'git cherry-pick 45b9cd6^..25c65af',
				'git cherry-pick 45b9cd6~..25c65af',
				'git cherry-pick 45b9cd6~1..25c65af',
				'git cherry-pick a9e72ef..25c65af'
			],
			why: '`A..B` leaves `A` out, so `45b9cd6..25c65af` would copy only `25c65af`. `45b9cd6^` is the parent of `45b9cd6`, so `45b9cd6^..25c65af` starts the range one commit earlier and includes it.'
		},
		{
			prompt: 'You are on `feature/export`. Move only its own commit, `5051dd9`, onto `main`, and leave the 3 coupon commits behind.',
			accept: [
				'git rebase --onto main feature/coupons',
				'git rebase --onto main feature/coupons feature/export',
				'git rebase --onto=main feature/coupons',
				'git rebase --onto=main feature/coupons feature/export',
				'git rebase feature/coupons --onto main'
			],
			why: '`feature/coupons` is the upstream: Git takes only the commits of `feature/export` that `feature/coupons` does not have, here `5051dd9`. `--onto main` applies them on top of `main` instead of on top of the upstream. A plain `git rebase main` would replay the 3 coupon commits too and stop on the `src/cart.js` conflict.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which range copies commits `45b9cd6` and `25c65af` with one `git cherry-pick`, and why does `45b9cd6..25c65af` not work?',
		a: '`45b9cd6^..25c65af`. In `A..B` Git leaves out `A` and everything before it, so the range has to start at the parent, `45b9cd6^`.'
	},
	sources: [
		{ title: 'Git docs, git-rebase', url: 'https://git-scm.com/docs/git-rebase' },
		{ title: 'Git docs, git-cherry-pick', url: 'https://git-scm.com/docs/git-cherry-pick' },
		{ title: 'Git docs, gitrevisions', url: 'https://git-scm.com/docs/gitrevisions' }
	]
};
