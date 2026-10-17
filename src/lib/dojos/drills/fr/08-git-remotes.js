/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-remotes',
	part: 'Git',
	title: 'Les remotes',
	minutes: 10,
	hook: [
		'Tu as cloné le dépôt d’équipe `shop-api` depuis `https://git.example.com/shop/shop-api.git` : c’est ton remote `origin`. Omar garde son travail dans son propre fork, à `https://git.example.com/omar/shop-api.git`, et tu veux récupérer ses branches dans ton clone. Hier, Omar a aussi supprimé la branche `spike-graphql` sur `origin`, mais ton clone affiche encore `origin/spike-graphql`.',
		'Tu as deux branches locales à publier. `feature/coupons` est nouvelle et n’a jamais été poussée. `feature/search` a été poussée la semaine dernière et suit `origin/feature/search`, mais tu l’as rebasée depuis : un simple `git push` est refusé avec `(non-fast-forward)`. Sur `origin`, la branche `fix/typo` est fusionnée et peut partir. Chaque exercice part de cet état.'
	],
	terms: [
		{ term: 'remote', def: 'Un nom enregistré dans ton clone pour une autre copie du dépôt, avec son URL. `origin` est le remote que `git clone` crée.' },
		{ term: 'branche de suivi distante', def: 'Une copie locale d’une branche d’un remote, comme `origin/main`. `git fetch` la met à jour ; tu ne commites pas dessus.' },
		{ term: 'branche amont', def: 'La branche distante à laquelle une branche locale est liée. Un simple `git push` ou `git pull` sur cette branche l’utilise.' }
	],
	reps: [
		{
			prompt: 'Ajoute le fork d’Omar comme remote nommé `omar`.',
			accept: [
				'git remote add omar https://git.example.com/omar/shop-api.git',
				'git remote add omar "https://git.example.com/omar/shop-api.git"',
				"git remote add omar 'https://git.example.com/omar/shop-api.git'"
			],
			why: '`git remote add omar <URL>` enregistre le nom `omar` avec cette URL. Rien n’est téléchargé : c’est le rôle de `git fetch omar`.'
		},
		{
			prompt: 'Liste les remotes avec leurs URL.',
			accept: ['git remote -v', 'git remote --verbose'],
			why: '`-v` affiche chaque remote deux fois, une fois avec `(fetch)` et une fois avec `(push)`, suivi de son URL. `git remote` seul n’affiche que les noms.'
		},
		{
			prompt: 'Le remote `omar` est ajouté. Télécharge ses branches.',
			accept: ['git fetch omar'],
			why: '`git fetch omar` télécharge les commits du fork d’Omar et crée une branche de suivi distante pour chacune de ses branches, comme `omar/main`. Tes propres branches ne bougent pas.'
		},
		{
			prompt: 'L’équipe pousse désormais en SSH. Remplace l’URL de `origin` par `git@git.example.com:shop/shop-api.git`.',
			accept: ['git remote set-url origin git@git.example.com:shop/shop-api.git', 'git remote set-url origin "git@git.example.com:shop/shop-api.git"'],
			why: '`git remote set-url origin <URL>` remplace l’URL enregistrée pour `origin`. `git remote -v` montre ensuite l’URL SSH sur la ligne `(fetch)` comme sur la ligne `(push)`.'
		},
		{
			prompt: 'Récupère `origin` et, dans la même commande, supprime `origin/spike-graphql` et toute autre branche de suivi distante dont la branche n’existe plus sur le serveur.',
			accept: ['git fetch --prune', 'git fetch -p', 'git fetch origin --prune', 'git fetch --prune origin', 'git fetch -p origin', 'git fetch origin -p'],
			why: '`--prune` supprime, avant de récupérer, les branches de suivi distantes qui n’existent plus sur le remote. Git affiche `- [deleted] (none) -> origin/spike-graphql`.'
		},
		{
			prompt: 'Tu es sur `feature/coupons`. Pousse-la sur `origin` et fais de `origin/feature/coupons` sa branche amont.',
			accept: [
				'git push -u origin feature/coupons',
				'git push --set-upstream origin feature/coupons',
				'git push origin -u feature/coupons',
				'git push origin --set-upstream feature/coupons',
				'git push -u origin HEAD',
				'git push --set-upstream origin HEAD'
			],
			why: '`git push origin feature/coupons` crée la branche sur `origin`, et `-u` l’enregistre comme branche amont. Git affiche `branch \'feature/coupons\' set up to track \'origin/feature/coupons\'.` ; ensuite, un simple `git push` suffit.'
		},
		{
			prompt: 'Supprime la branche `fix/typo` sur `origin`.',
			accept: [
				'git push origin --delete fix/typo',
				'git push origin -d fix/typo',
				'git push --delete origin fix/typo',
				'git push -d origin fix/typo',
				'git push origin :fix/typo'
			],
			why: '`--delete` demande à `origin` de supprimer la branche indiquée, et Git affiche `- [deleted] fix/typo`. La doc le décrit comme "the same as prefixing all refs with a colon" : voilà pourquoi `git push origin :fix/typo` marche aussi.'
		},
		{
			prompt: 'Tu es sur `feature/search` rebasée. Écrase `origin/feature/search` avec elle, mais seulement si personne n’a poussé sur cette branche depuis ton dernier fetch.',
			accept: [
				'git push --force-with-lease',
				'git push --force-with-lease origin feature/search',
				'git push origin --force-with-lease',
				'git push origin feature/search --force-with-lease',
				'git push --force-with-lease origin HEAD'
			],
			why: '`--force-with-lease` ne remplace la branche distante que si elle pointe encore là où pointe ton `origin/feature/search`. Si Omar a poussé un commit entre-temps, le push s’arrête sur `! [rejected] feature/search -> feature/search (stale info)` et son commit reste.'
		}
	],
	quiz: [],
	recall: {
		q: 'Après un rebase, que vérifie `git push --force-with-lease` avant d’écraser `origin/feature/search` ?',
		a: 'Que la branche sur `origin` pointe toujours sur le même commit que ta branche de suivi distante `origin/feature/search`. Si quelqu’un a poussé depuis ton dernier fetch, Git refuse le push avec `(stale info)`.'
	},
	sources: [
		{ title: 'Documentation Git, git-remote', url: 'https://git-scm.com/docs/git-remote' },
		{ title: 'Documentation Git, git-fetch', url: 'https://git-scm.com/docs/git-fetch' },
		{ title: 'Documentation Git, git-push', url: 'https://git-scm.com/docs/git-push' }
	]
};
