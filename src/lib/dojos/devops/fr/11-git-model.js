const GI = 'https://github.com/github/gitignore/blob/0e5d690153ca3da8a4a1aef2d053406f408f531c';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'git-model',
	part: 'Git',
	title: 'Git : des snapshots, trois zones et HEAD',
	minutes: 10,
	hook: [
		'Tu as déjà fait ça : `cp nginx.conf nginx.conf.bak-2024-03-02`, tu modifies, tu recharges, tu croises les doigts. Un mois plus tard il y a six fichiers `.bak` et personne ne sait lequel marchait.',
		'Git ne garde pas une liste de modifications. **Chaque commit est un snapshot** du projet entier, avec un auteur, un message et un lien vers le commit d’avant.',
		'Un fichier peut se trouver à trois endroits : le working tree sur le disque, l’index, et le dépôt dans `.git`. Des noms appelés refs pointent vers des commits, et HEAD indique sur quelle ref tu es.'
	],
	terms: [
		{ term: 'Commit', def: 'Un snapshot du projet entier, nommé par son hash (par défaut SHA-1, 40 caractères hexadécimaux), avec auteur, message et un pointeur vers son commit parent.' },
		{ term: 'Index', def: 'Aussi appelé staging area. Un fichier dans `.git` qui contient ce qui ira dans ton prochain commit.' },
		{ term: 'Ref', def: 'Un nom pour un commit. Une branche comme `main` est une ref, `refs/heads/main`, qui contient le hash d’un commit. Souvent c’est un petit fichier de ce nom ; après un `git gc`, elle peut se trouver dans `.git/packed-refs` à la place.' },
		{ term: 'HEAD', def: 'La ref sur laquelle tu es en ce moment. En général il contient un nom de branche comme `refs/heads/main` ; en detached HEAD, il contient un hash de commit.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['wt["Working tree : les fichiers que tu modifies"]'],
				highlight: ['wt'],
				note: 'Tu modifies `nginx.conf` dans le **working tree**, comme n’importe quel fichier. Git voit qu’il a changé, mais rien n’est encore enregistré dans l’historique.'
			},
			{
				add: ['wt -->|"git add"| idx["Index : le prochain commit"]'],
				highlight: ['idx'],
				note: '`git add nginx.conf` copie la version actuelle dans l’**index**. Le fichier est maintenant stagé. Tu choisis ce qui part dans le prochain commit, fichier par fichier.'
			},
			{
				add: [
					'subgraph repo["Dépôt : .git"]',
					'c1["commit 1"]',
					'c2["commit 2"] -->|parent| c1',
					'end',
					'idx -->|"git commit"| c2'
				],
				highlight: ['c2'],
				note: '`git commit` transforme l’index en **snapshot** dans le dépôt. Chaque commit pointe vers son parent. Les fichiers qui n’ont pas changé ne sont pas stockés une deuxième fois, juste reliés à la copie que Git a déjà.'
			},
			{
				add: ['main["main = refs/heads/main"] --> c2', 'head["HEAD"] --> main'],
				highlight: ['main', 'head'],
				note: 'La branche `main` est une ref qui contient le hash du commit 2. **HEAD pointe vers main**, donc le prochain commit fait avancer main, et HEAD suit.'
			},
			{
				add: ['head -.->|"git checkout commit 1"| c1'],
				highlight: ['head', 'c1'],
				note: 'Fais un checkout d’un commit ou d’un tag et HEAD contient un hash au lieu d’un nom de branche : c’est le **detached HEAD**. Tu peux regarder, mais un nouveau commit ici n’appartient à aucune branche.'
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
			'Les lignes 2 à 17 listent des chemins qui **n’arrivent jamais dans l’index**. `git add .` les saute, ils restent seulement dans le working tree.',
			'Il ne protège que les fichiers non suivis. La [doc gitignore](https://git-scm.com/docs/gitignore) : « Files already tracked by Git are not affected ». Pour arrêter de suivre un fichier, `git rm --cached` le retire de l’index.',
			'Les lignes 12 à 17 ignorent les `.tfvars`, qui peuvent contenir des mots de passe. Si un `.tfvars` arrive dans un commit, le supprimer au commit suivant ne l’efface pas. **L’ancien snapshot l’a toujours**, dans chaque clone.',
			'Les fichiers d’ignore ont leur place dans le dépôt. Commite le `.gitignore` pour que toute l’équipe ait les mêmes règles.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque commit est un snapshot complet avec une somme de contrôle : tu peux retrouver n’importe quelle version, et Git détecte un fichier corrompu.',
			'L’index te permet de commiter une partie de ton travail : le correctif part, le changement de debug reste.',
			'Une branche est une toute petite ref qui contient un hash, donc en créer une ne coûte rien.'
		],
		cost: [
			'Un secret commité une fois reste dans les anciens snapshots tant que personne ne réécrit l’historique.',
			'`git diff` montre seulement les changements pas encore stagés, et `git diff --staged` montre ceux qui le sont : tu vérifies à deux endroits.',
			'Personne ne retient un hash de 40 caractères hexadécimaux, donc il te faut des refs : des branches et des tags.'
		]
	},
	task: {
		prompt: 'Ton dépôt de config serveur a deux fichiers modifiés : `nginx.conf` (un vrai correctif) et `debug.conf` (un test que tu vas jeter). Écris les commandes pour commiter seulement le correctif et abandonner le test. Après chaque commande, dis où se trouve la nouvelle version de chaque fichier : working tree, index ou dépôt.',
		hint: '`git add` copie un fichier dans l’index. `git commit` transforme l’index en snapshot. `git restore` remet un fichier depuis l’index.',
		answer: [
			'`git status` : les deux fichiers sont modifiés dans le working tree seulement. L’index correspond toujours au dernier commit.',
			'`git add nginx.conf` : le correctif est maintenant dans le working tree **et** dans l’index. `debug.conf` est toujours seulement dans le working tree.',
			'`git commit -m "Raise worker_connections"` : le correctif est maintenant un snapshot dans le dépôt. `main` avance sur le nouveau commit et HEAD pointe toujours vers `main`.',
			'`git restore debug.conf` : recopie la version de l’index par-dessus ta modif de test. Le test a disparu, rien n’a été commité.'
		],
		steps: [
			{
				title: 'Lis l’état de départ',
				questions: [
					{ q: 'Tu lances `git status`. Où est la nouvelle version de `nginx.conf` ?', options: ['Seulement dans le working tree', 'Dans le working tree et dans l’index', 'Dans le dépôt, sous forme de nouveau commit', 'Seulement dans l’index'], answer: 0, why: 'Tu as modifié le fichier sur le disque, rien de plus. Git voit qu’il est modifié, mais il n’est pas encore stagé.' },
					{ q: 'Que contient l’index en ce moment ?', options: ['Tes deux fichiers modifiés', 'Le même contenu que le dernier commit', 'Seulement `nginx.conf`, puisque c’est le vrai correctif', 'Rien tant que tu n’as pas fait `git add`'], answer: 1, why: 'Tu n’as rien stagé, donc l’index correspond toujours au dernier commit.' },
					{ q: 'Quelle commande montre tes modifs pas encore stagées ?', options: ['`git diff --staged`', '`git log`', '`git diff`', '`git show HEAD`'], answer: 2, why: '`git diff` compare le working tree à l’index. `git diff --staged` montre seulement ce qui est déjà stagé.' },
					{ q: 'Comment `git status --short` affiche-t-il les deux fichiers avant que tu stages quoi que ce soit ?', options: ['`M ` pour les deux : stagés, pas encore commités', '`??` pour les deux : non suivis', '`M ` pour `nginx.conf` et ` M` pour `debug.conf`', '` M` pour les deux : modifiés sur le disque, pas stagés'], answer: 3, why: 'La colonne de gauche est l’index, celle de droite le working tree. Les deux modifs sont seulement sur le disque, donc le M est dans la colonne de droite.' }
				]
			},
			{
				title: 'Stage seulement le correctif',
				questions: [
					{ q: 'Quelle commande met seulement le correctif dans le prochain commit ?', options: ['`git add .`', '`git add nginx.conf`', '`git restore nginx.conf`', '`git commit nginx.conf debug.conf`'], answer: 1, why: '`git add` copie un fichier dans l’index. Tu choisis ce qui entre dans le prochain commit, fichier par fichier.' },
					{ q: 'Après `git add nginx.conf`, quelle commande montre le correctif ?', options: ['`git diff --staged`', '`git diff`', '`git log`', '`git show HEAD`'], answer: 0, why: 'Le correctif est maintenant stagé. `git diff` ne liste plus que `debug.conf`, la modif pas encore stagée, donc tu vérifies le correctif avec `git diff --staged`.' },
					{ q: 'Où est ta modif de test de `debug.conf` maintenant ?', options: ['Dans l’index, à côté du correctif', 'Dans le dépôt, comme brouillon', 'Seulement dans le working tree', 'Nulle part : `git add` l’a annulée'], answer: 2, why: 'Tu ne l’as pas stagée, donc elle reste seulement sur le disque. L’index a toujours l’ancienne version.' },
					{ q: 'Pourquoi ne pas lancer `git add .` ici ?', options: ['Ça ne marche que sur les nouveaux fichiers', 'Ça commiterait aussi le changement tout de suite', 'Ça ignore les fichiers déjà suivis', 'Ça stagerait aussi `debug.conf`'], answer: 3, why: '`git add .` stage tous les fichiers modifiés. L’index te permet de laisser le test de côté, mais seulement si tu ajoutes les fichiers un par un.' }
				]
			},
			{
				title: 'Commite le correctif',
				questions: [
					{ q: 'Que fait `git commit -m "Raise worker_connections"` de l’index ?', options: ['Il le transforme en snapshot dans le dépôt', 'Il l’envoie au serveur distant', 'Il le vide, pour que le prochain commit parte de zéro', 'Il le recopie par-dessus le working tree'], answer: 0, why: 'Un commit est un snapshot du projet entier, fait à partir de l’index, avec un lien vers son parent.' },
					{ q: 'Comment vérifies-tu que `main` a avancé sur le nouveau commit ?', options: ['Lance `cat .git/HEAD` et lis le hash', 'Lance `git diff --staged` et cherche le correctif', 'Compare `git rev-parse HEAD` avec `cat .git/refs/heads/main`', 'Lance `git diff` et cherche le correctif'], answer: 2, why: 'Les deux affichent le hash du nouveau commit. `cat .git/HEAD` n’affiche que `ref: refs/heads/main`, pas un hash.' },
					{ q: 'Juste après le commit, qu’affiche `git diff --staged` ?', options: ['Le correctif de `nginx.conf`', 'Rien : l’index correspond au nouveau commit', 'La modif de test de `debug.conf`', 'Les deux fichiers, tant que tu n’as pas poussé'], answer: 1, why: 'Le commit a été fait à partir de l’index, donc l’index et le dernier commit sont de nouveau identiques. Seul `debug.conf` diffère encore, sur le disque.' },
					{ q: 'Le correctif est-il sur le remote maintenant ?', options: ['Oui : un commit part tout de suite sur le remote', 'Oui, mais seulement sur la branche `main` distante', 'Seulement si le remote lance `git pull`', 'Non : il n’arrive sur le remote qu’avec `git push`'], answer: 3, why: 'Le commit vit dans ton dépôt local, dans `.git`. C’est `git push` qui l’envoie.' }
				]
			},
			{
				title: 'Abandonne le test',
				questions: [
					{ q: 'Quelle commande jette ta modif de test de `debug.conf` ?', options: ['`git commit debug.conf`', '`git rm --cached debug.conf`', '`git add debug.conf`', '`git restore debug.conf`'], answer: 3, why: '`git restore` remet un fichier depuis l’index, par-dessus ta modif sur le disque.' },
					{ q: 'D’où `git restore debug.conf` recopie-t-il le fichier ?', options: ['Depuis l’index', 'Depuis le remote', 'Depuis une copie `.bak` que Git garde', 'Depuis le prochain commit'], answer: 0, why: 'L’index contient toujours la version du dernier commit, donc c’est elle qui revient.' },
					{ q: 'Après `git restore`, la modif de test est-elle dans un commit ?', options: ['Oui, dans le commit que tu viens de faire', 'Non : rien n’en a été commité', 'Oui, dans un commit caché sur `main`', 'Seulement dans l’index'], answer: 1, why: 'Tu ne l’as jamais stagée, donc elle n’est jamais arrivée dans un snapshot. Elle a disparu.' },
					{ q: 'Imagine que tu aies commité un secret dans `debug.conf`, puis supprimé dans le commit suivant. A-t-il disparu ?', options: ['Oui : le commit le plus récent l’emporte', 'Oui, dès que tu lances `git restore`', 'Non : l’ancien snapshot l’a toujours, dans chaque clone', 'Non, mais `.gitignore` le cache désormais'], answer: 2, why: 'Chaque commit est un snapshot complet. Le secret reste dans l’ancien tant que personne ne réécrit l’historique.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Que stocke un commit Git ?',
			options: [
				'Seulement les lignes qui ont changé depuis le commit précédent, avec l’auteur et le message',
				'Un snapshot du projet entier, plus l’auteur, le message et un lien vers son commit parent',
				'Une copie du working tree, fichiers ignorés compris, plus un lien vers le parent',
				'La différence entre l’index et le working tree'
			],
			answer: 1,
			why: 'Chaque commit pointe vers l’ensemble des fichiers. Un fichier inchangé pointe vers la copie déjà stockée, donc un snapshot prend peu de place.'
		},
		{
			q: 'Tu as lancé `git add app.conf` mais pas `git commit`. Où est la nouvelle version de `app.conf` ?',
			options: [
				'Seulement dans le working tree, tant que tu n’as pas fait `git commit`',
				'Dans un nouveau commit sur `main`, pas encore poussé sur le remote',
				'Dans le working tree et dans l’index, pas encore dans un commit',
				'Sur le serveur distant, en attente du prochain `git pull`'
			],
			answer: 2,
			why: '`git add` stage le fichier dans l’index. Il n’arrive dans le dépôt qu’avec `git commit`, et sur le remote qu’avec `git push`.'
		},
		{
			q: 'Qu’est-ce que HEAD, la plupart du temps ?',
			options: [
				'Un pointeur vers la branche sur laquelle tu es, comme `refs/heads/main`',
				'Le commit le plus récent du dépôt, toutes branches confondues',
				'La branche `main` sur le serveur distant',
				'Un autre nom pour l’index'
			],
			answer: 0,
			why: 'HEAD est en général une référence symbolique vers la branche courante. Il ne contient directement un hash de commit qu’en detached HEAD.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir un fichier passer du working tree à l’index puis au dépôt, et lire HEAD et `main` directement dans `.git`.',
		steps: [
			'Crée un dépôt avec un premier commit : `mkdir -p ~/git-lab && cd ~/git-lab && git init -b main && printf \'worker_connections 512;\\n\' > nginx.conf && printf \'log debug;\\n\' > debug.conf && git add . && git commit -m "First config"`. Si Git te demande qui tu es, règle d’abord `git config --global user.name` et `user.email`.',
			'Lis les refs : `cat .git/HEAD`, puis `cat .git/refs/heads/main`.',
			'Modifie les deux fichiers : `printf \'worker_connections 1024;\\n\' > nginx.conf && printf \'log trace;\\n\' >> debug.conf`. Puis stage seulement le correctif et compare : `git add nginx.conf && git status --short && git diff --name-only && git diff --staged --name-only`.',
			'Commite le correctif et abandonne le test : `git commit -m "Raise worker_connections" && git restore debug.conf && git status --short`. Puis compare `git rev-parse HEAD` avec `cat .git/refs/heads/main`.',
			'Détache HEAD et reviens : `git checkout HEAD~1 && cat .git/HEAD && git switch main`.'
		],
		done: [
			'À l’étape 2, `cat .git/HEAD` affiche `ref: refs/heads/main`.',
			'À l’étape 3, `git status --short` montre `M  nginx.conf` (stagé) et ` M debug.conf` (pas stagé).',
			'À l’étape 4, `git status --short` n’affiche rien, et `git rev-parse HEAD` affiche le même hash que `.git/refs/heads/main`.',
			'À l’étape 5, `cat .git/HEAD` affiche un hash nu au lieu d’un nom de branche.'
		],
		solution: [
			'La colonne de gauche de `git status --short` est l’index, celle de droite le working tree. `M ` est stagé, ` M` est modifié sur le disque seulement.',
			'`git diff --name-only` liste seulement `debug.conf` et `git diff --staged --name-only` seulement `nginx.conf` : deux endroits, deux réponses.',
			'Après le commit, `main` contient le nouveau hash et HEAD dit toujours `ref: refs/heads/main`. Après `git checkout HEAD~1`, HEAD contient le hash de l’ancien commit : detached HEAD.'
		]
	},
	recall: {
		q: 'Tu as lancé `git add nginx.conf` mais pas `git commit`. Où est la nouvelle version, et vers quoi pointe HEAD ?',
		a: 'Dans le working tree et dans l’index, dans aucun commit pour l’instant. HEAD pointe vers la branche `main`, qui contient le hash du dernier commit.'
	},
	sources: [
		{ title: 'Pro Git, What is Git?', url: 'https://git-scm.com/book/en/v2/Getting-Started-What-is-Git%3F' },
		{ title: 'Pro Git, Branches in a Nutshell', url: 'https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell' },
		{ title: 'Pro Git, Git References', url: 'https://git-scm.com/book/en/v2/Git-Internals-Git-References' },
		{ title: 'Pro Git, Recording Changes to the Repository', url: 'https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository' },
		{ title: 'Doc Git, gitignore', url: 'https://git-scm.com/docs/gitignore' }
	]
};
