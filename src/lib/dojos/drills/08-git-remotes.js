/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'git-remotes',
	part: 'Git',
	title: 'Remotes',
	minutes: 10,
	hook: [
		'You cloned the team repo `shop-api` from `https://git.example.com/shop/shop-api.git`, so it is your remote `origin`. Omar keeps his work in his own fork at `https://git.example.com/omar/shop-api.git`, and you want to pull his branches into your clone. Yesterday Omar also deleted the branch `spike-graphql` on `origin`, but your clone still lists `origin/spike-graphql`.',
		'You have two local branches to publish. `feature/coupons` is new and has never been pushed. `feature/search` was pushed last week and tracks `origin/feature/search`, but you have since rebased it, so a plain `git push` is rejected with `(non-fast-forward)`. On `origin`, the branch `fix/typo` is merged and can go. Every rep starts from this state.'
	],
	terms: [
		{ term: 'remote', def: 'A name stored in your clone for another copy of the repo, with its URL. `origin` is the remote that `git clone` creates.' },
		{ term: 'remote-tracking branch', def: 'A local copy of a branch on a remote, such as `origin/main`. `git fetch` updates it; you do not commit on it.' },
		{ term: 'upstream branch', def: 'The remote branch a local branch is linked to. A plain `git push` or `git pull` on that branch uses it.' }
	],
	reps: [
		{
			prompt: 'Add Omar’s fork as a remote named `omar`.',
			accept: [
				'git remote add omar https://git.example.com/omar/shop-api.git',
				'git remote add omar "https://git.example.com/omar/shop-api.git"',
				"git remote add omar 'https://git.example.com/omar/shop-api.git'"
			],
			why: '`git remote add omar <URL>` saves the name `omar` with that URL. It downloads nothing: `git fetch omar` does that.'
		},
		{
			prompt: 'List the remotes with their URLs.',
			accept: ['git remote -v', 'git remote --verbose'],
			why: '`-v` prints each remote twice, once with `(fetch)` and once with `(push)`, followed by its URL. Plain `git remote` prints only the names.'
		},
		{
			prompt: 'The `omar` remote is added. Download its branches.',
			accept: ['git fetch omar'],
			why: '`git fetch omar` downloads the commits of Omar’s fork and creates a remote-tracking branch for each of his branches, such as `omar/main`. Your own branches do not move.'
		},
		{
			prompt: 'The team now pushes over SSH. Change the URL of `origin` to `git@git.example.com:shop/shop-api.git`.',
			accept: ['git remote set-url origin git@git.example.com:shop/shop-api.git', 'git remote set-url origin "git@git.example.com:shop/shop-api.git"'],
			why: '`git remote set-url origin <URL>` replaces the URL stored for `origin`. `git remote -v` then shows the SSH URL on both the `(fetch)` and the `(push)` line.'
		},
		{
			prompt: 'Fetch from `origin` and, in the same command, drop `origin/spike-graphql` and any other remote-tracking branch whose branch is gone on the server.',
			accept: ['git fetch --prune', 'git fetch -p', 'git fetch origin --prune', 'git fetch --prune origin', 'git fetch -p origin', 'git fetch origin -p'],
			why: '`--prune` removes, before fetching, the remote-tracking branches that no longer exist on the remote. Git prints `- [deleted] (none) -> origin/spike-graphql`.'
		},
		{
			prompt: 'You are on `feature/coupons`. Push it to `origin` and make `origin/feature/coupons` its upstream branch.',
			accept: [
				'git push -u origin feature/coupons',
				'git push --set-upstream origin feature/coupons',
				'git push origin -u feature/coupons',
				'git push origin --set-upstream feature/coupons',
				'git push -u origin HEAD',
				'git push --set-upstream origin HEAD'
			],
			why: '`git push origin feature/coupons` creates the branch on `origin`, and `-u` records it as the upstream branch. Git prints `branch \'feature/coupons\' set up to track \'origin/feature/coupons\'.`, and later a plain `git push` is enough.'
		},
		{
			prompt: 'Delete the branch `fix/typo` on `origin`.',
			accept: [
				'git push origin --delete fix/typo',
				'git push origin -d fix/typo',
				'git push --delete origin fix/typo',
				'git push -d origin fix/typo',
				'git push origin :fix/typo'
			],
			why: '`--delete` asks `origin` to delete the listed branch, and Git prints `- [deleted] fix/typo`. The docs call it "the same as prefixing all refs with a colon", which is why `git push origin :fix/typo` works too.'
		},
		{
			prompt: 'You are on the rebased `feature/search`. Overwrite `origin/feature/search` with it, but only if nobody pushed to that branch since your last fetch.',
			accept: [
				'git push --force-with-lease',
				'git push --force-with-lease origin feature/search',
				'git push origin --force-with-lease',
				'git push origin feature/search --force-with-lease',
				'git push --force-with-lease origin HEAD'
			],
			why: '`--force-with-lease` replaces the remote branch only if it still points where your `origin/feature/search` points. If Omar pushed a commit in between, the push stops with `! [rejected] feature/search -> feature/search (stale info)` and his commit stays.'
		}
	],
	quiz: [],
	recall: {
		q: 'After a rebase, what does `git push --force-with-lease` check before it overwrites `origin/feature/search`?',
		a: 'That the branch on `origin` still points at the same commit as your remote-tracking branch `origin/feature/search`. If someone pushed since your last fetch, Git rejects the push with `(stale info)`.'
	},
	sources: [
		{ title: 'Git docs, git-remote', url: 'https://git-scm.com/docs/git-remote' },
		{ title: 'Git docs, git-fetch', url: 'https://git-scm.com/docs/git-fetch' },
		{ title: 'Git docs, git-push', url: 'https://git-scm.com/docs/git-push' }
	]
};
