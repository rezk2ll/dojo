const NPM = 'https://github.com/npm/cli/blob/ae98c62586b6fea44114f72e249e246a2981de70';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'lockfiles',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'Figer ce que tu installes',
	minutes: 10,
	hook: [
		'Le 9 février 2021, Alex Birsan publie "Dependency Confusion". Il avait trouvé des noms de paquets internes utilisés chez PayPal, Apple, Yelp, Tesla et d’autres, souvent dans des fichiers `package.json` embarqués dans du JavaScript public. Il a publié des paquets sous ces noms sur npm, PyPI et RubyGems. Chacun lui renvoyait par DNS le nom d’utilisateur, le nom d’hôte et le chemin courant de la machine qui l’installait.',
		'Il a détecté le problème "inside more than 35 organizations" (dans plus de 35 organisations), qui avaient toutes un programme de bug bounty ou un accord privé autorisant le test. Le système de build de Shopify a installé une gem nommée `shopify-cloud` "only a few hours" (quelques heures seulement) après la publication, et a exécuté son code. Shopify, Apple et PayPal ont chacun payé 30 000 $.',
		'Pour Python, il désigne la cause principale : `pip install --extra-index-url`. La doc de pip install : "There is no priority in the locations that are searched", aucun emplacement n’a la priorité.'
	],
	terms: [
		{ term: 'Lockfile', def: 'Un fichier qui enregistre l’arbre exact produit par une installation : chaque paquet, sa version, sa provenance et un hash. npm écrit `package-lock.json`, "intended to be committed into source repositories" : il est fait pour être commité.' },
		{ term: 'Integrity', def: 'Le champ `integrity` d’une entrée du lockfile : une chaîne Subresource Integrity `sha512` ou `sha1` de l’archive qui a été décompressée.' },
		{ term: 'Typosquatting', def: 'Publier un paquet sous un nom proche d’un paquet populaire, comme `crossenv` pour `cross-env`, pour qu’une faute de frappe l’installe.' },
		{ term: 'Confusion de dépendances', def: 'Publier un paquet public sous le nom d’un paquet interne d’une entreprise, avec une version plus haute, pour qu’un build qui interroge les deux registres installe le public.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['leak["bundle.js public contenant un package.json interne"] --> name["Nom trouvé : acme-billing, 1.4.2 en interne"]'],
				highlight: ['leak', 'name'],
				note: 'Birsan écrit que le meilleur endroit pour trouver des noms privés "turned out to be… inside javascript files" (se trouvait dans les fichiers JavaScript) : des étapes de build embarquent des `package.json` internes dans des scripts publics. Un nom n’est pas un secret, ne compte donc pas sur le fait de le cacher.'
			},
			{
				add: ['name --> pub["L’attaquant publie acme-billing 9000.0.0 sur l’index public"]', 'pub --> build["CI : pip install --extra-index-url interne acme-billing"]'],
				highlight: ['pub', 'build'],
				note: 'Le build demande `acme-billing` sans version exacte. Avec `--extra-index-url`, pip cherche à la fois dans PyPI et dans l’index interne. L’attaquant choisit la version `9000.0.0` pour qu’elle gagne toute comparaison de versions.'
			},
			{
				add: ['build -->|"les deux index ont le nom, la plus haute version gagne"| run["9000.0.0 est installé et son code d’installation tourne sur le runner de CI"]'],
				highlight: ['run'],
				note: 'pip consulte chaque emplacement et prend la "best" match, la meilleure correspondance par numéro de version. Les paquets de Birsan s’exécutaient à l’installation : sur npm via un script `preinstall`, qui tourne avant même que ton code ne soit importé.'
			},
			{
				add: ['run -.->|"défense 1 : une seule source par nom"| src["pip --index-url interne seulement, npm @acme:registry"]'],
				highlight: ['src'],
				note: 'Donne à chaque nom une seule source. Pour pip, `--index-url` remplace PyPI au lieu de s’y ajouter. Pour npm, range les paquets internes sous un scope : une fois `@acme:registry` défini, "any `npm install` for a package with that scope will request packages from that registry instead", tout paquet de ce scope vient de ce registre.'
			},
			{
				add: ['src -.->|"défense 2 : versions exactes et hashes"| lock["requirements.txt avec == et --hash, ou package-lock.json avec npm ci"]'],
				highlight: ['lock'],
				note: 'Enregistre la version exacte et le hash de chaque paquet, transitifs compris, et n’installe que ça. Une `9000.0.0` qui apparaît sur un registre ne change rien pour un build qui demande `==1.4.2` avec le `sha256` du fichier que tu as relu.'
			}
		]
	},
	example: {
		title: 'lib/commands/ci.js : npm ci refuse un lockfile en désaccord avec package.json',
		repo: 'npm/cli',
		url: `${NPM}/lib/commands/ci.js#L74-L114`,
		lang: 'js',
		code: `    // generate an inventory from the virtual tree in the lockfile
    const virtualArb = new Arborist(opts)
    try {
      await virtualArb.loadVirtual()
    } catch (err) {
      log.verbose('loadVirtual', err.stack)
      const msg =
        'The \`npm ci\` command can only install with an existing\\n' +
        'package-lock.json with lockfileVersion >= 1. Run an install with npm@5\\n' +
        'or later to generate a package-lock.json file, then try again.'
      throw this.usageError(msg)
    }
    const virtualInventory = new Map(virtualArb.virtualTree.inventory)

    // Now we make our real Arborist.
    // We need a new one because the virtual tree from the lockfile can have extraneous dependencies in it that won't install on this platform
    const arb = new Arborist(opts)
    await arb.buildIdealTree()
    await strictAllowScriptsPreflight({ arb, npm: this.npm, idealTreeOpts: opts })

    // Verifies that the packages from the ideal tree will match the same versions that are present in the virtual tree (lock file).
    const errors = validateLockfile(virtualInventory, arb.idealTree.inventory)
    // Verifies that the root packageExtensions state matches the lockfile and is still consistent with the locked tree.
    errors.push(...validatePackageExtensions(virtualArb.virtualTree, arb.idealTree))
    // Verifies that the root .npm-extension file matches the lockfile hash.
    // The hash comes from discovering the file (no import or execution), so this holds even under ignore-extension/ignore-scripts.
    const { NpmExtension } = require('@npmcli/arborist')
    let fileHash = null
    try {
      fileHash = new NpmExtension({ root: where, extensionFile: opts.extensionFile }).hash
    } catch (err) {
      errors.push(\`Invalid: \${err.message}\`)
    }
    errors.push(...validateNpmExtension(virtualArb.virtualTree, fileHash))
    if (errors.length) {
      throw this.usageError(
        '\`npm ci\` can only install packages when your package.json and package-lock.json are in sync. ' +
        'Please update your lock file with \`npm install\` before continuing.\\n\\n' +
        errors.join('\\n')
      )
    }`,
		notes: [
			'`loadVirtual()` ne lit que `package-lock.json`. Sans lockfile, `npm ci` s’arrête sur une erreur d’usage. Plus haut dans la même fonction, `opts` fixe `packageLock: true` et `save: false` : `npm ci` n’écrit jamais `package.json` ni le lockfile.',
			'`buildIdealTree()` calcule l’arbre que demande `package.json`. `validateLockfile` compare ensuite les deux inventaires entrée par entrée et note `Missing: ... from lock file` ou `Invalid: lock file\'s ...` pour chaque écart.',
			'La moindre erreur arrête l’installation avant de toucher à `node_modules` : sa suppression vient après ce bloc. Dans la même situation, `npm install` mettrait le lockfile à jour à la place.',
			'Chaque entrée verrouillée porte un hash `integrity`. pacote, le module de téléchargement de npm, le passe à `cacache` et `ssri`, qui lèvent `EINTEGRITY` quand l’archive téléchargée ne correspond pas.'
		]
	},
	tradeoff: {
		gain: [
			'La CI installe l’arbre que tu as relu : mêmes versions, mêmes archives, quoi qu’on ait publié sur le registre depuis.',
			'Une nouvelle `9000.0.0` sur un index public ne peut pas entrer dans un build qui exige `==1.4.2` avec un hash.',
			'Les changements de dépendances apparaissent comme un diff du lockfile dans une pull request, où un relecteur voit un nouveau paquet ou une URL `resolved` modifiée.'
		],
		cost: [
			'Les versions figées restent vulnérables tant que personne ne les met à jour : un lockfile fige les vieux bugs autant que le bon code, il faut donc le scan du chapitre précédent.',
			'Le contrôle des hashes de pip est "all-or-nothing", tout ou rien : un seul `--hash` l’active, et alors chaque exigence, transitive comprise, doit être figée avec `==` et hachée.',
			'Un paquet qui publie des wheels pour plusieurs plateformes demande un hash par fichier que tu pourrais installer, d’où plusieurs lignes `--hash` par paquet.',
			'Un lockfile fige ce qui était installé quand il a été écrit. Si quelqu’un a tapé `crossenv` au lieu de `cross-env`, le lock enregistre la faute avec un hash valide.'
		]
	},
	task: {
		prompt: 'Ta CI lance `pip install --extra-index-url https://pypi.internal.example/simple acme-billing`. L’index interne a `acme-billing` 1.4.2. Quelqu’un publie `acme-billing` 9000.0.0 sur PyPI. Quelle version installe le build suivant, et pourquoi ? Écris ensuite les deux changements qui l’en empêchent, et dis lequel arrête aussi un attaquant qui publie une 1.4.2 sur PyPI. 10 minutes, sur papier.',
		hint: 'La doc de pip install : "There is no priority in the locations that are searched. Rather they are all checked, and the \'best\' match for the requirements (in terms of version number...) is selected." Tout est consulté, et la meilleure version gagne.',
		answer: [
			'Le build installe 9000.0.0. pip cherche dans PyPI et dans l’index supplémentaire sans priorité, et prend la plus haute version qui satisfait `acme-billing`, qui n’a aucune contrainte de version.',
			'Changement 1 : remplacer `--extra-index-url` par `--index-url https://pypi.internal.example/simple`, pour que pip n’interroge que l’index interne. Changement 2 : mettre `acme-billing==1.4.2 --hash=sha256:...` dans `requirements.txt`, avec chaque dépendance figée et hachée, et installer avec `--require-hashes`.',
			'Face à une fausse 1.4.2, l’épinglage `==` seul ne suffit pas, puisque les deux index ont maintenant une 1.4.2. C’est le hash qui l’arrête : le fichier de PyPI a un autre `sha256`, donc pip le refuse. Le changement 1 l’arrête aussi, car PyPI n’est plus consulté.',
			'Fais les deux. Le hash attrape aussi un fichier altéré sur l’index interne, et l’index unique couvre aussi un nouveau paquet que tu aurais oublié de hacher.'
		]
	},
	quiz: [
		{
			q: 'Un `requirements.txt` a un `--hash` sur une ligne sur dix. Que fait pip ?',
			options: [
				'Il vérifie ce hash-là et installe les neuf autres paquets comme d’habitude',
				'Il active le contrôle des hashes pour tout et échoue sur les neuf lignes sans hash',
				'Il ignore le hash sauf si la ligne de commande passe aussi `--require-hashes`',
				'Il télécharge les neuf autres depuis PyPI et écrit leurs hashes dans le fichier'
			],
			answer: 1,
			why: 'La doc de pip : "Specifying `--hash` against any requirement will activate this mode globally", le mode s’active pour tout, et alors "Hashes are required for all requirements", ainsi que pour toutes les dépendances. pip 26.2 ajoute `--no-require-hashes` pour s’en dispenser.'
		},
		{
			q: 'La CI lance `npm ci` et `package.json` demande une version que `package-lock.json` n’a pas. Que se passe-t-il ?',
			options: [
				'npm installe la version de `package.json` et réécrit `package-lock.json`',
				'npm installe la version verrouillée et affiche un avertissement sur l’écart',
				'npm sort en erreur et te demande de mettre le lockfile à jour avec `npm install`',
				'npm supprime d’abord `node_modules`, puis résout l’arbre à nouveau depuis le registre'
			],
			answer: 2,
			why: '`validateLockfile` collecte chaque écart, et `npm ci` lève "can only install packages when your package.json and package-lock.json are in sync" avant de supprimer `node_modules`. Il n’écrit jamais aucun des deux fichiers.'
		},
		{
			q: 'Tes paquets npm internes ont des noms simples comme `billing-client`. Quel changement empêche un `billing-client` public d’être installé à leur place ?',
			options: [
				'Lancer `npm audit` en CI pour que les paquets inconnus remontent en avertissement',
				'Monter la version interne à 9999.0.0 pour qu’elle gagne toujours les comparaisons',
				'Les renommer en `@acme/billing-client` et pointer `@acme:registry` vers le registre interne',
				'Ajouter `--ignore-scripts` pour que les paquets publics ne puissent rien exécuter'
			],
			answer: 2,
			why: 'Un scope pointe vers un seul registre : "any `npm install` for a package with that scope will request packages from that registry instead". `--ignore-scripts` bloque le hook d’installation, mais le code se charge quand même quand ton appli l’importe.'
		}
	],
	recall: {
		q: 'Pourquoi `pip install --extra-index-url` permet-il la confusion de dépendances ?',
		a: 'pip cherche dans l’index principal et dans l’index supplémentaire sans priorité, et installe la meilleure correspondance par numéro de version. Un paquet public au nom interne et à la version plus haute gagne.'
	},
	sources: [
		{ title: 'Alex Birsan, Dependency Confusion (9 février 2021)', url: 'https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610' },
		{ title: 'Doc pip, Secure installs', url: 'https://pip.pypa.io/en/stable/topics/secure-installs/' },
		{ title: 'Doc pip, pip install', url: 'https://pip.pypa.io/en/stable/cli/pip_install/' },
		{ title: 'Doc npm, npm-ci', url: 'https://docs.npmjs.com/cli/v12/commands/npm-ci/' },
		{ title: 'Doc npm, package-lock.json', url: 'https://docs.npmjs.com/cli/v12/configuring-npm/package-lock-json/' },
		{ title: 'Doc npm, scope', url: 'https://docs.npmjs.com/cli/v12/using-npm/scope/' },
		{ title: 'Blog npm, crossenv malware on the npm registry (2 août 2017)', url: 'https://blog.npmjs.org/post/163723642530/crossenv-malware-on-the-npm-registry' }
	]
};
