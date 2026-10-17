const VULN = 'https://github.com/golang/vuln/blob/e672cbe8fbc8c76e28fcb6db0efd9ce354e0dac5';
const INSIGHTS = 'https://security.googleblog.com/2021/12/understanding-impact-of-apache-log4j.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dependency-vulns',
	part: 'Les secrets et la chaîne d’approvisionnement',
	title: 'Les dépendances vulnérables',
	minutes: 10,
	hook: [
		'Le 10 décembre 2021, GitHub publie GHSA-jfh8-c2jp-5v3q (CVE-2021-44228, Log4Shell), avec un score CVSS de 10.0. Via les lookups JNDI de Log4j, "An attacker who can control log messages or log message parameters can execute arbitrary code loaded from LDAP servers" : qui contrôle un message de log peut faire exécuter du code chargé depuis un serveur LDAP.',
		'Le 16 décembre, l’équipe Open Source Insights de Google [compte](' + INSIGHTS + ') 35 863 artefacts de Maven Central qui dépendent du code log4j touché, plus de 8 % du dépôt. Les dépendances directes n’en représentent qu’environ 7 000 : "The majority of affected artifacts come from indirect dependencies". Une note ultérieure ramène le total à plus de 17 000 paquets pour le seul `log4j-core`.',
		'Pour la plupart de ces artefacts, log4j n’était "not explicitly defined as a dependency", pas déclaré explicitement comme dépendance.'
	],
	terms: [
		{ term: 'Dépendance transitive', def: 'Un paquet que tu n’as pas déclaré toi-même mais qu’une de tes dépendances (ou une des leurs) tire. Il apparaît dans ton lockfile, pas dans les lignes de `package.json` ou de `go.mod` `require` que tu as écrites.' },
		{ term: 'Enregistrement OSV', def: 'Une vulnérabilité au format JSON Open Source Vulnerability : un `id`, des `aliases` comme la CVE, et des entrées `affected` qui nomment un paquet et les plages de versions vulnérables.' },
		{ term: 'Atteignabilité', def: 'Le fait que ton programme puisse réellement appeler la fonction vulnérable. govulncheck la vérifie sur le graphe d’appels construit à partir de ton code source.' },
		{ term: 'Override', def: 'Une entrée du `package.json` racine qui impose une version d’un paquet partout dans l’arbre, quelle que soit la version que demandent tes dépendances.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["ton appli : package.json déclare bar"] --> bar["bar 1.3.0 : dépend de foo@^1.1.0"]', 'bar --> foo["foo 1.4.0 : seulement dans le lockfile"]'],
				highlight: ['app', 'bar', 'foo'],
				note: 'Cet arbre prolonge l’exemple de la doc npm. Tu as choisi `bar`. `bar` demande `foo@^1.1.0`, et npm a installé `foo` 1.4.0. Rien dans ton `package.json` ne nomme `foo`, et pourtant son code tourne dans ton processus.'
			},
			{
				add: ['foo --> osv["Enregistrement OSV : foo, événements introduced 1.0.2, fixed 2.0.0"]'],
				highlight: ['osv'],
				note: 'Un scanner envoie à une base la liste complète tirée de ton lockfile et compare chaque version aux plages. En OSV, une plage est une liste d’`events` : la version 1.4.0 est touchée car elle est supérieure ou égale à `introduced` (1.0.2) et inférieure à `fixed` (2.0.0). Par défaut, `npm audit` a besoin d’un `package-lock.json` pour cette étape.'
			},
			{
				add: ['osv -->|"bar ne peut installer qu’un foo vulnérable"| meta["npm audit : bar est une méta-vulnérabilité"]', 'meta -->|"la correction exige de changer une plage à la racine"| force["npm audit fix --force : mise à jour SemVer-major"]'],
				highlight: ['meta', 'force'],
				note: 'Comme `^1.1.0` n’autorise jamais `foo` 2.0.0, npm signale aussi `bar` : "a dependency that is vulnerable by virtue of dependence on vulnerable versions of a vulnerable package". Quand la correction demande une nouvelle plage dans ton propre `package.json`, `npm audit fix` exige `--force`, qui peut installer une mise à jour SemVer-major.'
			},
			{
				add: ['scan["govulncheck ./..."] --> mod["niveau module : une version vulnérable est requise"]', 'mod --> pkg["niveau paquet : tu importes le paquet vulnérable"]', 'pkg --> sym["niveau symbole : main appelle la fonction vulnérable"]'],
				highlight: ['scan', 'sym'],
				note: 'Pour du code Go, govulncheck va plus loin. Il signale sur trois niveaux, et seul le dernier dit que ton code atteint le bug. Un résultat ressemble à "main.go:[line]:[column]: mypackage.main calls golang.org/x/text/language.Parse". Un module requis mais jamais importé reste au premier niveau, un paquet importé mais jamais appelé reste au deuxième.'
			},
			{
				add: ['sym --> fix["Monter bar vers une version qui demande foo 2.x, ou forcer foo dans le package.json racine"]', 'fix -->|"relancer le scan, lancer les tests"| done["Le lockfile montre foo 2.0.0"]'],
				highlight: ['fix', 'done'],
				note: 'Deux sorties. Monter `bar` vers une version dont la plage accepte `foo` 2.0.0. Ou, tant que `bar` n’en publie pas, ajouter `"overrides": { "foo": "2.0.0" }` dans ton `package.json` racine. Les mainteneurs de `bar` ne l’ont jamais testé avec `foo` 2.0.0 : ce sont tes tests qui doivent le faire.'
			}
		]
	},
	example: {
		title: 'internal/vulncheck/source.go : des modules aux paquets puis aux fonctions appelées',
		repo: 'golang/vuln',
		url: `${VULN}/internal/vulncheck/source.go#L68-L110`,
		lang: 'go',
		code: `	mv, err := FetchVulnerabilities(ctx, client, graph.Modules())
	if err != nil {
		return nil, err
	}

	// Emit OSV entries immediately in their raw unfiltered form.
	if err := emitOSVs(handler, mv); err != nil {
		return nil, err
	}

	if err := handler.Progress(&govulncheck.Progress{Message: checkingSrcVulnsMessage}); err != nil {
		return nil, err
	}

	affVulns := affectingVulnerabilities(mv, "", "")
	if err := emitModuleFindings(handler, affVulns); err != nil {
		return nil, err
	}

	if !cfg.ScanLevel.WantPackages() || len(affVulns) == 0 {
		return &Result{}, nil
	}

	impVulns := importedVulnPackages(affVulns, graph)
	// Emit information on imported vulnerable packages now as
	// call graph computation might take a while.
	if err := emitPackageFindings(handler, impVulns); err != nil {
		return nil, err
	}

	// Return result immediately if not in symbol mode or
	// if there are no vulnerabilities imported.
	if !cfg.ScanLevel.WantSymbols() || len(impVulns) == 0 {
		return &Result{Vulns: impVulns}, nil
	}

	wg.Wait() // wait for build to finish
	if buildErr != nil {
		return nil, err
	}

	entryFuncs, callVulns := calledVulnSymbols(entries, affVulns, cg, graph)
	return &Result{EntryFunctions: entryFuncs, Vulns: callVulns}, nil`,
		notes: [
			'`FetchVulnerabilities(ctx, client, graph.Modules())` n’envoie à `vuln.go.dev` que des chemins de modules. La doc de la commande : les requêtes "contain only module paths with vulnerabilities already known to the database, not code or other properties of your program".',
			'`affectingVulnerabilities` écarte les enregistrements retirés et garde ceux dont les plages contiennent la version de module que tu requiers. `emitModuleFindings` les signale. `npm audit` s’arrête à ce niveau : une version qui correspond dans l’arbre.',
			'`importedVulnPackages` parcourt `pkg.Imports` depuis tes paquets de tête et garde les enregistrements dont tu importes vraiment le paquet vulnérable. Un module peut contenir le bug dans un paquet que tu ne charges jamais.',
			'`calledVulnSymbols` croise le graphe d’appels remonté depuis les fonctions vulnérables avec le graphe descendu depuis tes points d’entrée. Ce qui reste, c’est la pile d’appels que govulncheck affiche. La doc prévient que les appels via `reflect` "are not visible to static analysis" : un oubli là est un faux négatif.'
		]
	},
	tradeoff: {
		gain: [
			'Un scanner nourri par le lockfile trouve `foo` 1.4.0 même si aucun fichier que tu as écrit ne le cite : c’est ainsi que Log4Shell se cachait dans la plupart des artefacts touchés.',
			'Le format OSV donne à chaque écosystème les mêmes événements `introduced` et `fixed` : la même requête à `api.osv.dev` marche pour des paquets npm, PyPI, Maven et Go.',
			'Les résultats au niveau symbole de govulncheck te permettent de corriger d’abord les services dont le code appelle la fonction vulnérable.'
		],
		cost: [
			'Une version qui correspond ne dit rien de l’usage : `npm audit` signale `foo` même si ton code n’atteint jamais la fonction vulnérable.',
			'Un enregistrement n’est corrigé que pour son propre id. log4j-core 2.15.0 sort de la plage de CVE-2021-44228 et correspond encore à CVE-2021-45046.',
			'`npm audit fix --force` peut installer une nouvelle version majeure d’un paquet de tête, avec des changements cassants que tes tests doivent attraper.',
			'Un override fixe `foo` sous `bar` sans que les mainteneurs de `bar` aient testé ce couple.'
		]
	},
	task: {
		prompt: 'L’enregistrement OSV GHSA-jfh8-c2jp-5v3q donne trois plages pour `org.apache.logging.log4j:log4j-core` : introduced `2.13.0` fixed `2.15.0`, introduced `2.0-beta9` fixed `2.3.1`, introduced `2.4` fixed `2.12.2`. Quatre services embarquent `log4j-core` en 2.14.1, 2.12.2, 2.3 et 2.15.0. Lesquels cet enregistrement touche-t-il ? Dis ensuite ce que tu vérifierais avant de déclarer les autres sûrs. 10 minutes, sur papier ou avec `curl`.',
		hint: 'Une version est touchée quand elle est supérieure ou égale à `introduced` et inférieure à `fixed` dans une plage. Pour voir tous les enregistrements : `curl -d \'{"package":{"name":"org.apache.logging.log4j:log4j-core","ecosystem":"Maven"},"version":"2.15.0"}\' https://api.osv.dev/v1/query`.',
		answer: [
			'2.14.1 : touchée, dans `[2.13.0, 2.15.0)`. 2.3 : touchée, dans `[2.0-beta9, 2.3.1)`. 2.12.2 : pas touchée, car `fixed` est exclusif et 2.12.2 est la correction de la troisième plage. 2.15.0 : pas touchée par cet enregistrement.',
			'La requête OSV du 17 octobre 2026 pour 2.15.0 renvoie GHSA-7rjr-3q55-vv33 (CVE-2021-45046). L’avis GitHub dit pourquoi : "Log4j version 2.15.0 contained an earlier fix for the vulnerability, but that patch did not disable attacker-controlled JNDI lookups in all situations."',
			'La même requête pour 2.12.2 renvoie encore CVE-2021-44832 et CVE-2021-45105, entre autres. Une version hors d’un enregistrement n’est pas une version sans enregistrement.',
			'Donc : interroge chaque version que tu livres contre tous les enregistrements, choisis une version cible, interroge-la aussi (2.17.1 affiche encore CVE-2025-68161 parmi trois), et vérifie dans l’arbre de dépendances qu’aucune autre copie de `log4j-core` ne traîne.'
		]
	},
	quiz: [
		{
			q: 'Une plage OSV contient `{"introduced": "2.13.0"}, {"fixed": "2.15.0"}`. Quelle version marque-t-elle comme touchée ?',
			options: [
				'2.15.0, car l’événement `fixed` nomme la dernière version vulnérable',
				'2.12.0, car toute version sous `introduced` est touchée aussi',
				'2.14.1, car elle est supérieure ou égale à 2.13.0 et inférieure à 2.15.0',
				'2.16.0, car aucun événement `limit` ne ferme la plage'
			],
			answer: 2,
			why: 'Dans l’évaluation OSV, `IsVulnerable` passe `vulnerable = true` à `introduced` et le remet à `false` à `fixed`. La plage vaut `[2.13.0, 2.15.0)`. C’est `last_affected` qui nomme une dernière version incluse.'
		},
		{
			q: 'govulncheck liste une vulnérabilité pour un module que tu requiers, sans pile d’appels. Qu’est-ce que ça t’apprend ?',
			options: [
				'Ton code n’appelle pas la fonction vulnérable, autant que l’analyse statique puisse le voir',
				'La vulnérabilité est dans un fichier de test, que govulncheck ne lit jamais',
				'La base n’a pas encore de version corrigée, donc elle cache la pile d’appels',
				'govulncheck n’a pas réussi à construire le graphe d’appels et a sauté le module'
			],
			answer: 0,
			why: 'govulncheck signale au niveau module, paquet et symbole. Une pile d’appels ne vient que du niveau symbole, quand un chemin existe entre tes points d’entrée et la fonction vulnérable. Les appels via `reflect` restent invisibles : traite-le comme probablement sûr, pas comme prouvé sûr.'
		},
		{
			q: '`npm audit fix` annonce qu’une correction demande `--force`. Que fera `--force` que la commande simple ne fait pas ?',
			options: [
				'Supprimer `package-lock.json` et résoudre tout l’arbre à nouveau depuis zéro',
				'Installer une mise à jour SemVer-major d’une dépendance de tête si la correction l’exige',
				'Corriger le fichier vulnérable dans `node_modules` sans changer aucune version',
				'Marquer l’avis comme accepté pour que `npm audit` sorte avec le code 0'
			],
			answer: 1,
			why: 'Le simple `npm audit fix` met à jour à l’intérieur des plages que tu as déclarées. Quand la chaîne de méta-vulnérabilités remonte jusqu’à ta racine et demande une nouvelle plage, seul `--force` la change, ce qui peut vouloir dire une nouvelle version majeure.'
		}
	],
	recall: {
		q: 'Comment un enregistrement OSV dit-il quelles versions d’un paquet sont touchées ?',
		a: 'Avec `affected[].ranges[].events` : une version est touchée à partir de `introduced` et jusqu’à `fixed` exclu. Pour CVE-2021-44228, log4j-core a introduced 2.13.0 et fixed 2.15.0, parmi d’autres plages.'
	},
	sources: [
		{ title: 'GHSA-jfh8-c2jp-5v3q, Remote code injection in Log4j (CVE-2021-44228)', url: 'https://github.com/advisories/GHSA-jfh8-c2jp-5v3q' },
		{ title: 'Google Security Blog, Understanding the Impact of Apache Log4j Vulnerability', url: 'https://security.googleblog.com/2021/12/understanding-impact-of-apache-log4j.html' },
		{ title: 'Schéma OSV', url: 'https://ossf.github.io/osv-schema/' },
		{ title: 'API OSV, Query affected', url: 'https://google.github.io/osv.dev/post-v1-query/' },
		{ title: 'Doc de la commande govulncheck', url: 'https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck' },
		{ title: 'Doc npm, npm-audit', url: 'https://docs.npmjs.com/cli/commands/npm-audit' },
		{ title: 'Doc npm, overrides dans package.json', url: 'https://docs.npmjs.com/cli/configuring-npm/package-json#overrides' }
	]
};
