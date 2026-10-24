const SEMVER = 'https://github.com/npm/node-semver/blob/717534ee353682f3bcf33e60a8af4292626d4441';
const RANGE = `${SEMVER}/classes/range.js`;
const RE = `${SEMVER}/internal/re.js`;
const SATISFIES = `${SEMVER}/functions/satisfies.js`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'security-advisories',
	part: 'Les menaces',
	title: 'Répondre à un avis de sécurité',
	minutes: 10,
	hook: [
		'Le 21 juin 2023, GitHub publie l’avis GHSA-c2qf-rxjj-qqgw (CVE-2022-25883) pour `semver`, le paquet npm qui lit les plages de versions comme `^1.2.3`. Le registre npm lui compte environ 873 millions de téléchargements sur la semaine du 6 au 12 octobre 2026.',
		'Selon l’avis, `new Range` est exposé à un déni de service par expression régulière "when untrusted user data is provided as a range", quand la plage vient d’un utilisateur non fiable. Une plage forgée occupe le moteur de regex très longtemps. Node.js l’exécute sur la boucle d’événements : le processus ne répond à aucune autre requête tant qu’elle tourne. Le score est CVSS 7.5, avec `A:H` : seule la disponibilité est touchée.',
		'Trois branches sont touchées, avec trois correctifs : 7.5.2, 6.3.1 et 5.7.2. Ton lockfile contient sans doute plusieurs copies.'
	],
	terms: [
		{ term: 'Avis de sécurité', def: 'Une notice publiée pour une faille : le paquet, les plages de versions vulnérables, la première version corrigée pour chacune, et une sévérité. GitHub donne à chacun un id `GHSA-`.' },
		{ term: 'Dépendance transitive', def: 'Un paquet absent de ton `package.json`, installé parce qu’une de tes dépendances le demande. `npm explain semver` affiche la chaîne qui a installé chaque copie.' },
		{ term: 'Version corrigée', def: 'La première version qui contient le correctif sur une branche donnée. Pour semver : 7.5.2 pour la 7.x, 6.3.1 pour la 6.x et 5.7.2 pour tout le reste.' },
		{ term: 'ReDoS', def: 'Déni de service par expression régulière : une entrée qui fait revenir en arrière une regex pendant très longtemps, et le processus dépense son CPU sur une seule chaîne.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['alert["GHSA-c2qf-rxjj-qqgw : semver < 7.5.2, < 6.3.1, < 5.7.2"] --> find["1. Trouver : npm explain semver"]'],
				highlight: ['alert', 'find'],
				note: 'L’alerte arrive par `npm audit`, Dependabot ou la page de l’avis. La première étape, c’est la liste de toutes les copies installées. `npm explain semver` affiche "the chain of dependencies causing a given package to be installed", un bloc par version. Note chaque version et le paquet qui l’a amenée.'
			},
			{
				add: ['find --> assess["2. Évaluer : une entrée non fiable arrive-t-elle dans new Range ?"]'],
				highlight: ['assess'],
				note: 'L’avis donne la condition : une donnée non fiable passée comme plage. `semver.satisfies(version, range)` appelle `new Range(range)` sur son deuxième argument. Un outil de build qui lit les plages de ton propre `package.json` ne reçoit rien de l’extérieur. Une API publique qui lit `?range=` dans l’URL, si.'
			},
			{
				add: ['assess --> up["3. Mettre à jour : npm audit fix, ou overrides dans le package.json racine"]'],
				highlight: ['up'],
				note: 'Lance d’abord `npm audit fix`. Si le correctif oblige à changer une plage de dépendance jusqu’à ton projet, la doc précise qu’il "will require the --force option". L’autre voie : une entrée `overrides` dans le `package.json` racine, le seul endroit où npm la lit.'
			},
			{
				add: ['up --> verify["4. Vérifier : npm explain semver encore, npm audit sort avec 0"]', 'verify --> ship["5. Livrer, et noter où une entrée non fiable touche semver"]'],
				highlight: ['verify', 'ship'],
				note: 'Relance `npm explain semver` et compare chaque copie à la version corrigée de sa branche. La doc : `npm audit` "will exit with a 0 exit code if no vulnerabilities were found". Ensuite, déploie, et garde une trace du chemin de code de l’étape 2 pour le prochain avis sur ce paquet.'
			}
		]
	},
	example: {
		title: 'classes/range.js au commit du correctif : réduire les espaces avant toute regex',
		repo: 'npm/node-semver',
		url: `${RANGE}#L25-L49`,
		lang: 'javascript',
		code: `    this.options = options
    this.loose = !!options.loose
    this.includePrerelease = !!options.includePrerelease

    // First reduce all whitespace as much as possible so we do not have to rely
    // on potentially slow regexes like \\s*. This is then stored and used for
    // future error messages as well.
    this.raw = range
      .trim()
      .split(/\\s+/)
      .join(' ')

    // First, split on ||
    this.set = this.raw
      .split('||')
      // map the range to a 2d array of comparators
      .map(r => this.parseRange(r))
      // throw out any comparator lists that are empty
      // this generally means that it was not a valid range, which is allowed
      // in loose mode, but will still throw if the WHOLE range is invalid.
      .filter(c => c.length)

    if (!this.set.length) {
      throw new TypeError(\`Invalid SemVer Range: \${this.raw}\`)
    }`,
		notes: [
			'L’avis cite en référence le commit `717534e`, "fix: better handling of whitespace (#564)". Les lignes 32 à 35 enlèvent les espaces aux bords et réduisent chaque suite d’espaces à un seul, avant qu’aucune regex de plage ne voie l’entrée.',
			'Le même commit ajoute `safeRe` dans [`internal/re.js`](' + RE + '#L12-L28). `createToken` réécrit chaque motif, `\\s*` en `\\s{0,1}` et `\\s+` en `\\s`, et les classes importent `safeRe` à la place de `re`. Le commentaire donne la raison : "Replace all greedy whitespace to prevent regex dos issues."',
			'Les dates de publication sur le registre npm : 7.5.2 le 15 juin 2023, puis 5.7.2 et 6.3.1 le 10 juillet 2023. Pendant 19 jours après l’avis, un projet en 6.x n’avait aucun correctif dans sa version majeure.',
			'[`satisfies`](' + SATISFIES + ') construit un `Range` à partir de son deuxième argument. Cherche `satisfies(`, `validRange(` et `new Range(` dans ton code pour voir quelles entrées arrivent jusqu’à ce constructeur.'
		]
	},
	tradeoff: {
		gain: [
			'L’étape 2 fixe la vitesse. Un endpoint public qui passe `?range=` à `satisfies` demande le correctif aujourd’hui ; un script de build qui lit ton propre `package.json` peut attendre la prochaine mise à jour de routine.',
			'Rester dans la branche (6.3.0 vers 6.3.1) garde la même version majeure : la dépendance qui demandait `^6.0.0` reçoit une version qu’elle accepte.'
		],
		cost: [
			'Une entrée `overrides` survit à l’avis. Si elle force `semver` en `^7.5.2`, un paquet qui demandait `^5.0.0` tourne sur une version majeure jamais testée avec lui.',
			'`npm audit` compare des versions à des plages. Il signale la copie de l’outil de build avec la même sévérité que celle de l’API : l’étape 2 reste manuelle.',
			'Les rétroportages arrivent après le correctif principal : 25 jours entre 7.5.2 et 6.3.1 ici. En attendant, il reste la montée de version majeure, un override, ou une garde dans ton propre code.'
		]
	},
	task: {
		prompt: 'Ton `package-lock.json` contient trois copies : `node_modules/semver` en 7.5.1 (pour ton API), `node_modules/tool-a/node_modules/semver` en 6.3.0, et `node_modules/tool-b/node_modules/semver` en 5.7.1. Seule l’API appelle `semver.satisfies(pkg.version, req.query.range)`. Pour chaque copie : vulnérable ou non, la version cible sans changer de majeure, et l’urgence.',
		hint: 'Compare chaque version aux trois plages de l’avis : `< 7.5.2`, `>= 6.0.0 < 6.3.1`, `< 5.7.2`. Puis demande-toi quelle copie reçoit `req.query.range`.',
		answer: [
			'7.5.1 : vulnérable (`>= 7.0.0, < 7.5.2`). Passe en 7.5.2 ou plus. Urgent : `req.query.range` est une entrée non fiable qui arrive droit dans `new Range` via `satisfies`.',
			'6.3.0 : vulnérable (`>= 6.0.0, < 6.3.1`). Passe en 6.3.1. Moins urgent : `tool-a` lit ses plages dans des fichiers que tu contrôles. Lance `npm explain semver` pour voir si une version plus récente de `tool-a` embarque déjà 6.3.1.',
			'5.7.1 : vulnérable (`>= 2.0.0-alpha, < 5.7.2`). Passe en 5.7.2, même raisonnement que pour `tool-a`.',
			'Vérifie : `npm explain semver` liste 7.5.2, 6.3.1 et 5.7.2 ou plus, et `npm audit` sort avec 0. Corrige la copie de l’API en premier, et déploie-la seule si les deux autres demandent plus de tests.'
		],
		steps: [
			{
				title: 'Liste chaque copie',
				questions: [
					{ q: 'Quelle commande liste chaque copie installée et le paquet qui l’a amenée ?', options: ['`npm ls --depth=0`', '`npm outdated`', '`npm view semver versions`', '`npm explain semver`'], answer: 3, why: 'Elle affiche "the chain of dependencies causing a given package to be installed", un bloc par version.' },
					{ q: 'Combien de copies de semver ce lockfile contient-il ?', options: ['Trois : 7.5.1, 6.3.0 et 5.7.1', 'Une : npm n’en garde qu’une', 'Deux : une par majeure au-dessus de 5', 'Quatre : une par dossier, plus la racine'], answer: 0, why: 'La copie racine pour l’API, une imbriquée sous `tool-a`, et une sous `tool-b`.' },
					{ q: 'Pourquoi `tool-a` a-t-il sa propre copie ?', options: ['npm copie chaque paquet par défaut', '`tool-a` a été installé avec `--force`', 'Il demandait une plage 6.x, que 7.5.1 ne satisfait pas', 'Les copies imbriquées sont toujours plus vieilles'], answer: 2, why: 'La dépendance demandait une plage 6.x, donc elle a reçu sa propre copie 6.x : une dépendance transitive.' },
					{ q: 'Que notes-tu pour chaque copie ?', options: ['Son nombre de téléchargements par semaine', 'Sa version et le paquet qui l’a amenée', 'Sa taille sur le disque', 'Sa licence'], answer: 1, why: 'La version dit si elle est vulnérable. Le parent dit comment elle est utilisée.' }
				]
			},
			{
				title: 'Compare chaque copie à une plage',
				questions: [
					{ q: '7.5.1 est-elle vulnérable ?', options: ['Non : elle est au-dessus de 7.0.0', 'Oui : elle est dans `>= 7.0.0, < 7.5.2`', 'Non : seules les 6.x et 5.x sont touchées', 'Seulement sur les vieilles versions de Node.js'], answer: 1, why: 'Le correctif de la branche 7.x, c’est 7.5.2.' },
					{ q: 'Quelle plage de l’avis contient la copie de `tool-a`, 6.3.0 ?', options: ['`< 5.7.2`', '`>= 7.0.0, < 7.5.2`', '`>= 6.0.0, < 6.3.1`', 'Aucune : 6.3.0 est sûre'], answer: 2, why: '6.3.0 est au moins 6.0.0 et sous 6.3.1, la première version corrigée de sa branche.' },
					{ q: 'Quelle plage de l’avis contient la copie de `tool-b`, 5.7.1 ?', options: ['`>= 2.0.0-alpha, < 5.7.2`', '`>= 6.0.0, < 6.3.1`', '`>= 7.0.0, < 7.5.2`', 'Aucune : la 5.x est antérieure au bug'], answer: 0, why: 'La plage la plus ancienne couvre tout depuis 2.0.0-alpha jusqu’à 5.7.2 exclu. 5.7.1 est la dernière version avant ce correctif.' },
					{ q: 'Pourquoi rester dans la même majeure, comme 6.3.0 vers 6.3.1 ?', options: ['Deux majeures ne peuvent pas coexister', 'npm refuse les montées de majeure dans un lockfile', 'C’est la seule version du registre', 'Le parent qui demandait `^6.0.0` reçoit encore une version qu’il accepte'], answer: 3, why: 'Rester dans la branche respecte la plage du parent. Un override vers la 7.x lui fait tourner une majeure jamais testée avec lui.' }
				]
			},
			{
				title: 'Classe par exposition',
				questions: [
					{ q: 'Quelle copie reçoit `req.query.range` ?', options: ['La 7.5.1 racine, utilisée par l’API', 'La 6.3.0 sous `tool-a`', 'La 5.7.1 sous `tool-b`', 'Les trois, de la même façon'], answer: 0, why: 'Seule l’API appelle `satisfies` avec une plage venue de la query string.' },
					{ q: 'Quelqu’un envoie à l’API une seule valeur `?range=` forgée. Que vivent les autres utilisateurs ?', options: ['Rien : seule cette requête échoue', 'Leurs sessions fuient vers l’attaquant', 'Leurs appels à `satisfies` renvoient de faux résultats', 'Ils n’ont plus de réponse tant que la regex tourne'], answer: 3, why: 'Node.js exécute la regex sur la boucle d’événements, donc le processus ne répond à aucune autre requête pendant qu’elle revient en arrière. Le vecteur CVSS dit `A:H` : la disponibilité seulement.' },
					{ q: 'Pourquoi les copies de `tool-a` et `tool-b` sont-elles moins urgentes ?', options: ['Les vieilles copies tournent plus lentement', 'Elles lisent leurs plages dans des fichiers que tu contrôles', '`npm audit` ignore les copies imbriquées', 'Elles ne tournent que sur les portables des devs'], answer: 1, why: 'Aucune entrée extérieure ne les atteint. Elles seront corrigées quand même, à la prochaine mise à jour de routine.' },
					{ q: 'Que dit `npm audit` de ce classement ?', options: ['Il met la copie de l’API en premier', 'Il cache les copies des outils de build', 'Il donne la même sévérité à chaque copie', 'Il marque les copies imbriquées comme sûres'], answer: 2, why: '`npm audit` compare des versions à des plages. Il ne voit pas quelle copie reçoit une entrée extérieure, donc le classement reste manuel.' }
				]
			},
			{
				title: 'Corrige et vérifie',
				questions: [
					{ q: 'Que lances-tu en premier ?', options: ['`npm install semver@latest --force`', 'Supprimer `package-lock.json` et réinstaller', '`npm audit fix`', 'Une entrée `overrides` pour chaque copie'], answer: 2, why: 'Il met à jour dans les plages que tes dépendances acceptent. `--force` et `overrides` ne viennent que si ça ne suffit pas.' },
					{ q: 'Après `npm audit fix`, `npm explain semver` montre encore 6.3.0 sous `tool-a`. Que vérifies-tu ensuite ?', options: ['Si supprimer `node_modules/tool-a` à la main aide', 'Si une version plus récente de `tool-a` tire déjà 6.3.1', 'Rien : les copies imbriquées ne sont jamais atteintes', 'Si on peut forcer semver 7.5.2 partout'], answer: 1, why: 'Un parent plus récent garde le correctif dans la plage avec laquelle il a été testé. Une entrée `overrides` vient après, et forcer la 7.x fait tourner à `tool-a` une majeure jamais testée.' },
					{ q: 'Où va une entrée `overrides` ?', options: ['Dans n’importe quel `package.json` sous `node_modules`', 'Dans `package-lock.json`', 'Dans `.npmrc`', 'Seulement dans le `package.json` racine'], answer: 3, why: 'npm ne lit `overrides` que dans le `package.json` racine de ton projet.' },
					{ q: 'Quelle sortie prouve que tu as fini ?', options: ['`npm explain semver` montre des versions corrigées, et `npm audit` sort avec 0', '`npm install` n’affiche aucun avertissement', '`npm audit` liste moins de problèmes qu’avant', '`npm outdated` n’affiche rien'], answer: 0, why: 'Compare chaque copie à la version corrigée de sa branche. La doc dit que `npm audit` sort avec 0 quand il ne trouve aucune vulnérabilité.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Le 1er juillet 2023, un projet dépend de `semver@6.3.0` et ne peut pas passer en 7.x. Quelle version corrige la CVE-2022-25883 sur sa branche ?',
			options: [
				'6.3.1, publiée le même jour que 7.5.2',
				'Aucune encore : 6.3.1 sort le 10 juillet 2023',
				'Aucune : la branche 6.x est déclarée en fin de vie',
				'6.3.0 a déjà le correctif, rétroporté en premier'
			],
			answer: 1,
			why: 'Le registre npm date 7.5.2 du 15 juin 2023 et 6.3.1 du 10 juillet 2023. L’avis donne 6.3.1 comme première version corrigée de la 6.x : le 1er juillet, la branche 6.x n’avait aucune version corrigée.'
		},
		{
			q: '`npm audit fix` annonce que la correction demande `--force`. Qu’est-ce que ça t’apprend ?',
			options: [
				'Le registre n’a aucune version corrigée du paquet vulnérable',
				'Le paquet vulnérable est une dépendance de dev, donc ignoré',
				'Le correctif oblige à changer une plage jusqu’à ton projet',
				'Le lockfile est corrompu et doit être supprimé avant'
			],
			answer: 2,
			why: 'La doc npm : quand la chaîne de méta-vulnérabilités remonte jusqu’au projet racine et "cannot be updated without changing its dependency ranges", `npm audit fix` exige `--force`. Ça peut vouloir dire une montée de version majeure : lis d’abord le plan avec `--dry-run`.'
		},
		{
			q: 'Quel chemin de code est exposé au ReDoS de semver ?',
			options: [
				'Un script de CI qui appelle `semver.satisfies` sur les versions du lockfile',
				'Un endpoint web qui appelle `semver.satisfies(v, req.query.range)`',
				'Un build qui lance `npm install` avec un lockfile figé sur 7.5.1',
				'Un script qui appelle `semver.valid` sur la version de l’appli'
			],
			answer: 1,
			why: 'L’avis exige des "untrusted user data" comme plage. `satisfies` passe son deuxième argument à `new Range`, donc la query string atteint les regex lentes. Les autres chemins ne lisent que des chaînes contrôlées par ton propre dépôt.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Installe un `semver` vulnérable, chronomètre toi-même le ReDoS, puis trouve, corrige et vérifie chaque copie.',
		steps: [
			'Crée un projet avec une copie vulnérable et une copie imbriquée : `mkdir -p ~/semver-lab && cd ~/semver-lab && npm init -y`, puis `npm install semver@7.5.1 make-dir@3.1.0`.',
			'Liste chaque copie : `npm explain semver | grep -E "^semver@|node_modules"`. Puis lance `npm audit; echo $?`.',
			'Chronomètre une plage forgée contre 7.5.1 : `node -e "const s=require(\'semver\'); const r=\'1.2.3\'+\' \'.repeat(50000)+\'<1.3.0x\'; const t=Date.now(); try { s.satisfies(\'1.2.3\', r) } catch (e) {} console.log(Date.now()-t, \'ms\')"`.',
			'Corrige avec `npm audit fix`. Puis relance `npm explain semver | grep "^semver@"` et `npm audit; echo $?`.',
			'Relance la commande de chronométrage de l’étape 3.'
		],
		done: [
			'Avant le correctif, `npm audit` signale `semver  7.0.0 - 7.5.1` avec `Severity: high`, et `echo $?` affiche `1`.',
			'`npm explain semver` montre deux copies : `node_modules/semver` en 7.5.1 et `node_modules/make-dir/node_modules/semver` sur la branche 6.x.',
			'Sur 7.5.1, la plage forgée prend des secondes. Après le correctif, quelques millisecondes.',
			'Après `npm audit fix`, la copie racine est en 7.5.2 ou plus et `npm audit` sort avec `0`.'
		],
		solution: [
			'La copie imbriquée est déjà en 6.3.1 : `make-dir` demande `^6.0.0`, et npm a pris la version la plus récente de cette plage. C’est la comparaison de chaque copie à sa propre branche qui te dit qu’elle est sûre.',
			'Les 50 000 espaces font revenir en arrière les anciennes regex de plage. Node.js le fait sur la boucle d’événements, donc un serveur ne répondrait à rien d’autre pendant ce temps. La 7.5.2 réduit les espaces avant toute regex.',
			'`npm audit fix` pouvait rester dans ta plage `^7.5.1`, donc il n’a pas eu besoin de `--force`. Un correctif qui change de majeure l’aurait demandé.'
		]
	},
	recall: {
		q: 'Quelles sont les cinq étapes face à un avis, et quelles versions de semver corrigent la CVE-2022-25883 ?',
		a: 'Trouver chaque copie (`npm explain`), évaluer si une entrée non fiable atteint `new Range`, mettre à jour, vérifier (`npm audit` sort avec 0), livrer. Les correctifs sont 7.5.2, 6.3.1 et 5.7.2.'
	},
	sources: [
		{ title: 'Avis GitHub GHSA-c2qf-rxjj-qqgw, ReDoS dans semver', url: 'https://github.com/advisories/GHSA-c2qf-rxjj-qqgw' },
		{ title: 'NVD, CVE-2022-25883', url: 'https://nvd.nist.gov/vuln/detail/CVE-2022-25883' },
		{ title: 'Commit de correctif node-semver 717534e, better handling of whitespace', url: 'https://github.com/npm/node-semver/commit/717534ee353682f3bcf33e60a8af4292626d4441' },
		{ title: 'Doc npm, npm audit', url: 'https://docs.npmjs.com/cli/v11/commands/npm-audit' },
		{ title: 'Doc npm, npm explain', url: 'https://docs.npmjs.com/cli/v11/commands/npm-explain' },
		{ title: 'Doc npm, overrides dans package.json', url: 'https://docs.npmjs.com/cli/v11/configuring-npm/package-json' },
		{ title: 'API du registre npm, téléchargements hebdomadaires de semver', url: 'https://api.npmjs.org/downloads/point/last-week/semver' },
		{ title: 'Doc Node.js, Don’t Block the Event Loop (REDOS)', url: 'https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop' }
	]
};
