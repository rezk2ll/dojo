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
		],
		steps: [
			{
				title: 'Prédis l’installation',
				questions: [
					{ q: 'Quelle version installe le build suivant ?', options: ['1.4.2, depuis l’index interne', '9000.0.0, depuis PyPI', 'Aucune : pip s’arrête sur le conflit de noms', 'Celle de l’index qui répond le premier'], answer: 1, why: 'pip regarde aux deux endroits et prend la plus haute version qui convient.' },
					{ q: 'Un collègue place l’URL interne en premier dans `pip.conf`, avant PyPI. Qu’installe le build suivant ?', options: ['1.4.2, car le premier index gagne', '1.4.2, mais seulement avec un cache vide', 'Rien : pip s’arrête sur le conflit', 'Toujours 9000.0.0 : l’ordre des index ne change rien'], answer: 3, why: 'pip consulte tous les emplacements et choisit la "meilleure" version par numéro, quelle que soit la place de l’index dans la liste.' },
					{ q: 'Qu’est-ce qui fait gagner 9000.0.0 ici ?', options: ['La dépendance `acme-billing` n’a aucune contrainte de version', 'PyPI a une priorité plus haute', 'L’index interne est plus lent', 'pip garde les résultats de PyPI en cache'], answer: 0, why: 'Sans `==`, toute version satisfait la dépendance, donc la plus haute gagne.' },
					{ q: 'Dans les tests de Birsan, quand les paquets publiés exécutaient-ils leur code ?', options: ['Seulement quand une appli les importait', 'Jamais : les registres ne faisaient que les stocker', 'Pendant l’installation, sur la machine qui les installait', 'Seulement sur les serveurs de production'], answer: 2, why: 'Les paquets de Birsan s’exécutaient pendant l’installation (sur npm via un script `preinstall`), avant que le code de qui que ce soit soit importé.' }
				]
			},
			{
				title: 'Donne une seule source au nom',
				questions: [
					{ q: 'Quelle option fait interroger à pip le seul index interne ?', options: ['`--extra-index-url` deux fois', '`--index-url https://pypi.internal.example/simple`', '`--no-deps`', '`--pre`'], answer: 1, why: '`--index-url` remplace PyPI au lieu de s’y ajouter.' },
					{ q: 'Avec le seul index interne, qu’installe le build ?', options: ['1.4.2', '9000.0.0', 'Rien, le nom est bloqué', 'Les deux versions'], answer: 0, why: 'PyPI n’est plus consulté, donc la 9000.0.0 publique n’est jamais vue.' },
					{ q: 'Avec `--index-url` sur le seul index interne, qui décide du `acme-billing` que reçoit le build ?', options: ['Toute personne avec un compte PyPI', 'L’index qui répond le premier', 'Personne : pip en prend un au hasard', 'Quiconque peut publier sur l’index interne'], answer: 3, why: 'L’index interne est maintenant la seule source, donc la confiance s’y déplace. Un fichier modifié dessus serait encore installé, sauf si quelque chose vérifie son contenu.' },
					{ q: 'Pourquoi ne pas simplement garder les noms internes secrets ?', options: ['Les noms ne tiennent pas compte de la casse', 'Ils fuient, par exemple dans des bundles JavaScript publics', 'PyPI publie tous les noms privés', 'pip les journalise publiquement'], answer: 1, why: 'Birsan a trouvé beaucoup de noms dans des fichiers JavaScript publics. Un nom seul n’est pas un secret.' }
				]
			},
			{
				title: 'Fige et hache',
				questions: [
					{ q: 'Que mets-tu dans `requirements.txt` ?', options: ['`acme-billing>=1.4.2`', '`acme-billing==1.4.2 --hash=sha256:...`', '`acme-billing`', '`acme-billing~=1.4`'], answer: 1, why: 'La version exacte et le hash du fichier que tu as relu.' },
					{ q: '`acme-billing` 1.4.2 fournit une wheel pour Linux et une pour macOS, et la CI tourne sur les deux. Combien de valeurs `--hash` faut-il sur sa ligne ?', options: ['Une, pour le paquet entier', 'Aucune : les wheels portent leur propre signature', 'Deux : une par fichier que pip peut installer', 'Une par index'], answer: 2, why: 'Un hash désigne un seul fichier. Chaque plateforme télécharge une wheel différente, donc la ligne liste un `--hash` par fichier que tu peux installer.' },
					{ q: 'Quelle option d’installation va avec ?', options: ['`--require-hashes`', '`--force-reinstall`', '`--user`', '`--upgrade`'], answer: 0, why: '`--require-hashes` fait refuser à pip tout paquet sans hash correspondant.' },
					{ q: 'Que fait l’épinglage `==1.4.2` seul contre 9000.0.0 ?', options: ['Rien, la version plus haute gagne toujours', 'Il la bloque : 9000.0.0 ne satisfait pas `==1.4.2`', 'Il installe les deux', 'Il fait interroger PyPI en premier'], answer: 1, why: 'Une `9000.0.0` ne change rien pour un build qui demande `==1.4.2`.' }
				]
			},
			{
				title: 'Teste contre une fausse 1.4.2',
				questions: [
					{ q: 'L’attaquant publie maintenant `acme-billing` 1.4.2 sur PyPI. L’épinglage `==` seul l’arrête-t-il ?', options: ['Oui, la version est la même', 'Oui, pip préfère les fichiers internes', 'Seulement sous Linux', 'Non : les deux index ont maintenant une 1.4.2'], answer: 3, why: 'L’épinglage nomme une version, et les deux fichiers prétendent l’avoir.' },
					{ q: 'Quelle partie du changement 2 arrête la fausse ?', options: ['Le hash : le fichier de PyPI a un autre `sha256`', 'L’épinglage de version', 'Le nom du fichier', 'L’ordre des lignes'], answer: 0, why: 'pip compare le hash du fichier à celui que tu as noté et refuse un écart.' },
					{ q: 'Le changement 1 arrête-t-il aussi la fausse ?', options: ['Non, la version correspond', 'Seulement avec `--require-hashes`', 'Oui, car PyPI n’est plus consulté', 'Seulement pour les wheels'], answer: 2, why: 'Avec un seul index interne, le fichier de PyPI n’est jamais candidat.' },
					{ q: 'Pourquoi faire les deux changements ?', options: ['pip refuse `--require-hashes` avec un seul index', 'Chacun couvre une faille : fichier interne altéré, paquet sans hash', 'Ensemble, ils accélèrent les installations en CI', 'Le hash ne marche que si PyPI est aussi consulté'], answer: 1, why: 'Chacun ferme une faille que l’autre laisse ouverte.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Rejouer la confusion de dépendances de l’exercice entre deux index de paquets sur localhost, puis l’arrêter avec un seul index et avec un hash.',
		steps: [
			'Prépare : `mkdir ~/confusion-lab && cd ~/confusion-lab && python3 -m venv .venv`.',
			'Construis la 1.4.2 interne : `mkdir -p src-internal/acme_billing && echo "print(\'acme-billing 1.4.2 from internal\')" > src-internal/acme_billing/__init__.py && printf \'%s\\n\' \'[project]\' \'name = "acme-billing"\' \'version = "1.4.2"\' > src-internal/pyproject.toml && .venv/bin/pip wheel --no-deps -w internal/simple/acme-billing ./src-internal`.',
			'Construis la 9000.0.0 de l’attaquant de la même façon, avec `src-public`, le message `acme-billing 9000.0.0 from public`, `version = "9000.0.0"` et `-w public/simple/acme-billing`.',
			'Sers les deux index, chacun dans son terminal : `python3 -m http.server 8001 -d internal` et `python3 -m http.server 8002 -d public`.',
			'Installe comme la CI : `.venv/bin/pip install --no-cache-dir --index-url http://localhost:8001/simple --extra-index-url http://localhost:8002/simple acme-billing && .venv/bin/python -c \'import acme_billing\'`.',
			'Changement 1 : `.venv/bin/pip uninstall -y acme-billing`, puis réinstalle avec seulement `--index-url http://localhost:8001/simple`.',
			'Changement 2 : `echo "acme-billing==1.4.2 $(.venv/bin/pip hash internal/simple/acme-billing/*.whl | tail -1)" > requirements.txt`. Construis une fausse 1.4.2 dans `public/simple/acme-billing` depuis un dossier `src-fake`, désinstalle, et lance `.venv/bin/pip install --no-cache-dir --index-url http://localhost:8002/simple -r requirements.txt`.'
		],
		done: [
			'L’étape 5 affiche `acme-billing 9000.0.0 from public`.',
			'L’étape 6 affiche `acme-billing 1.4.2 from internal`.',
			'L’étape 7 échoue avec `THESE PACKAGES DO NOT MATCH THE HASHES FROM THE REQUIREMENTS FILE`, un `Expected sha256` et un `Got` différent.'
		],
		solution: [
			'pip consulte les deux index sans priorité et prend la version la plus haute : la 9000.0.0 publique gagne, et son code tourne dès qu’on l’importe.',
			'Avec `--index-url` seul, l’index public n’est jamais interrogé.',
			'La fausse a le bon nom et la bonne version, mais pas les bons octets : le `sha256` noté la refuse. Le même `requirements.txt` contre le port 8001 installe la 1.4.2 interne.'
		]
	},
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
