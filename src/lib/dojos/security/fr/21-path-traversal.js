const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2/src';
const HTTPD_FIX = 'https://github.com/apache/httpd/commit/98246aa96079dad5f7b20521bbc0142a04f1c5e7';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'path-traversal',
	part: 'Les entrées et les sorties',
	title: 'La traversée de chemin',
	minutes: 10,
	hook: [
		'Le 16 septembre 2021, l’équipe d’Apache HTTP Server publie la version 2.4.49. Elle modifie le code qui résout les segments `..` dans le chemin d’une requête. Le 29 septembre, l’équipe sécurité reçoit un signalement : une requête peut atteindre des fichiers hors des dossiers déclarés par les directives de type `Alias`.',
		'L’avis CVE-2021-41773 précise : "This issue is known to be exploited in the wild" (la faille est déjà exploitée). NVD lui donne 9,8 sur 10. Le [commit de correction](' + HTTPD_FIX + ') montre le trou : le normaliseur décodait `%2e` en point pour le premier point d’un segment seulement, donc `/.%2e/` n’était jamais retiré comme un `/../`.',
		'La 2.4.50 sort le 4 octobre. Sa correction est incomplète (CVE-2021-42013), et la 2.4.51 suit le 7 octobre.',
		'Ton code rencontre le même problème chaque fois qu’il colle un nom de fichier reçu dans une requête à un dossier de base.'
	],
	terms: [
		{ term: 'Traversée de chemin', def: 'Une attaque où un nom de fichier venu de l’extérieur, comme `../../etc/passwd`, fait ouvrir au programme un fichier hors du dossier prévu.' },
		{ term: 'Chemin canonique', def: 'La forme absolue unique d’un chemin, avec `.` et `..` résolus. `os.path.realpath` en Python suit aussi les liens symboliques pour l’obtenir.' },
		{ term: 'Contrôle lexical', def: 'Un contrôle qui ne regarde que la chaîne du chemin, comme `filepath.IsLocal` en Go. Il ne lit jamais le disque, donc il ne sait pas où pointe un lien symbolique.' },
		{ term: 'os.Root', def: 'Un type de Go 1.24 qui garde un dossier ouvert. Ses méthodes refusent tout nom de fichier qui sortirait de ce dossier par `..` ou par un lien symbolique.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["GET /download?name=../../etc/passwd"] --> join["path = /srv/files/../../etc/passwd"]'],
				highlight: ['req', 'join'],
				note: 'L’appli range ses fichiers dans `/srv/files` et y colle le paramètre `name`. L’attaquant envoie `../../etc/passwd`. La chaîne obtenue vaut `/srv/files/../../etc/passwd`.'
			},
			{
				add: ['join --> naive["Contrôle : le chemin commence par /srv/files ? oui"]', 'naive --> open["open() : le noyau résout chaque .."]', 'open --> leak["/etc/passwd part dans la réponse"]'],
				highlight: ['naive', 'leak'],
				note: 'Un contrôle de préfixe sur la chaîne passe, car elle commence bien par `/srv/files`. La fiche CWE-22 montre la même erreur en Java avec `startsWith("/safe_dir/")`. Le noyau résout ensuite les deux `..` et ouvre `/etc/passwd`.'
			},
			{
				add: ['join --> canon["realpath() : /etc/passwd"]', 'canon --> inside["Contrôle : commonpath de /srv/files et du résultat vaut /srv/files ? non"]', 'inside --> deny["403, rien n’est ouvert"]'],
				highlight: ['canon', 'inside', 'deny'],
				note: 'La correction résout d’abord le chemin : `os.path.realpath` transforme la chaîne en `/etc/passwd`. Ensuite `os.path.commonpath([BASE, real])` renvoie `/`, qui n’est pas `/srv/files`. L’appli refuse avant tout `open()`.'
			},
			{
				add: ['link["Un lien /srv/files/link pointe vers /etc"] --> race["Posé entre le contrôle et open()"]', 'root["os.OpenInRoot(/srv/files, name)"] -->|"openat sur le descripteur du dossier"| refuse["path escapes from parent"]'],
				highlight: ['race', 'root', 'refuse'],
				note: 'Contrôler puis ouvrir laisse une fenêtre. Si l’attaquant peut créer des fichiers dans le dossier, il pose un lien symbolique juste après le contrôle. Le blog de Go appelle ça une course time-of-check/time-of-use. `os.OpenInRoot` vérifie chaque étape pendant l’ouverture et renvoie "path escapes from parent" pour `link/passwd`.'
			}
		]
	},
	example: {
		title: 'src/internal/filepathlite/path.go : unixIsLocal, le corps de filepath.IsLocal sous Unix',
		repo: 'golang/go',
		url: `${GO}/internal/filepathlite/path.go#L145-L165`,
		lang: 'go',
		code: `func unixIsLocal(path string) bool {
	if IsAbs(path) || path == "" {
		return false
	}
	hasDots := false
	for p := path; p != ""; {
		var part string
		part, p, _ = stringslite.Cut(p, "/")
		if part == "." || part == ".." {
			hasDots = true
			break
		}
	}
	if hasDots {
		path = Clean(path)
	}
	if path == ".." || stringslite.HasPrefix(path, "../") {
		return false
	}
	return true
}`,
		notes: [
			'La ligne 2 refuse un chemin absolu et la chaîne vide. `/etc/passwd` n’est jamais local : un nom qui remplacerait le dossier de base lors du collage est donc rejeté.',
			'Les lignes 6 à 13 cherchent une partie `.` ou `..`. Seulement dans ce cas, la ligne 15 appelle `Clean`, qui réduit `a/../b.txt` à `b.txt` et garde un `..` de tête : `a/../../etc` donne `../etc`.',
			'La ligne 17 fait le contrôle d’inclusion : un chemin nettoyé qui vaut `..` ou commence par `../` remonte au-dessus de la base, et la fonction renvoie false. Avec Go 1.24.4, `IsLocal("a/../../etc")` vaut false et `IsLocal("a/../b.txt")` vaut true.',
			'Le [commentaire de doc](' + GO + '/path/filepath/path.go#L59-L75) prévient : "IsLocal is a purely lexical operation. In particular, it does not account for the effect of any symbolic links". Si `/srv/files/link` pointe vers `/etc`, `IsLocal("link/passwd")` vaut true, et `os.Open` sur le chemin collé lit `/etc/passwd`.',
			'Python a le même piège avec les préfixes. Sa doc indique que `os.path.commonprefix` "works a character at a time" (compare caractère par caractère) : `/usr/lib` et `/usr/local/lib` partagent `/usr/l`. Elle conseille `commonpath()` à la place.'
		]
	},
	tradeoff: {
		gain: [
			'`filepath.IsLocal` contrôle la chaîne sans accès disque. Il refuse `../../etc/passwd`, `/etc/passwd` et le nom vide.',
			'`os.Root` refuse en plus un lien symbolique du dossier qui pointe dehors. Sous Unix, il parcourt le chemin avec les appels système `openat`, donc un lien posé après un contrôle ne sert à rien à l’attaquant.'
		],
		cost: [
			'`realpath` puis `open()` font deux étapes. Un attaquant qui peut écrire dans le dossier peut remplacer un élément du chemin par un lien symbolique entre les deux.',
			'Le blog de Go : "Root operations on filenames containing many directory components can be much more expensive than the equivalent non-Root operation." Un chemin long coûte donc plus cher.',
			'`os.Root` n’arrête pas les bind mounts de Linux. L’équipe Go le limite à ce qu’un utilisateur ordinaire peut créer, comme les liens symboliques.'
		]
	},
	task: {
		prompt: 'Un handler de téléchargement en Python : `BASE = "/srv/files"`, puis `path = os.path.join(BASE, name)`, puis `if not path.startswith(BASE): abort(403)`, puis `return open(path, "rb").read()`. Trouve deux valeurs de `name` qui lisent un fichier hors de `/srv/files`, puis réécris le contrôle.',
		hint: 'Essaie un nom avec `..` qui laisse la chaîne commencer par `/srv/files`. Pense ensuite à un dossier voisin de `/srv/files` dont le nom commence par `files`.',
		answer: [
			'`../../etc/passwd` : la chaîne collée vaut `/srv/files/../../etc/passwd`. Elle commence par `/srv/files`, le contrôle passe, et `open()` lit `/etc/passwd`.',
			'`../files_old/key` : la chaîne vaut `/srv/files/../files_old/key` et passe aussi. Une fois résolue, elle donne `/srv/files_old/key`, qui commence encore par `/srv/files`. Le contrôle de préfixe échoue même sur un chemin résolu.',
			'`/etc/passwd` est bloqué par chance. `os.path.join` jette `BASE` quand la seconde partie est absolue, le résultat vaut `/etc/passwd` et le contrôle de préfixe le refuse.',
			'La réécriture : `real = os.path.realpath(os.path.join(BASE, name))`, puis `if os.path.commonpath([BASE, real]) != BASE: abort(403)`. En Python 3, `commonpath` renvoie `/` pour le premier nom et `/srv` pour le second : les deux sont refusés. `a/../b.txt` donne `/srv/files/b.txt` et part normalement.'
		]
	},
	quiz: [
		{
			q: 'Le handler teste `path.startswith("/srv/files")` sur le chemin collé. Pourquoi `../../etc/passwd` passe-t-il ?',
			options: [
				'Le test porte sur la chaîne brute, et le noyau ne résout les `..` qu’au `open()`',
				'`os.path.join` retire les segments `..` avant le test, qui voit donc un chemin propre',
				'`startswith` ignore les points et les barres et ne compare que les lettres des noms',
				'Le navigateur résout les `..` avant l’envoi, donc le serveur ne les voit jamais'
			],
			answer: 0,
			why: 'La chaîne `/srv/files/../../etc/passwd` commence par `/srv/files`, donc le test passe. Les `..` ne sont résolus que quand le noyau parcourt le chemin pendant `open()`, qui arrive sur `/etc/passwd`.'
		},
		{
			q: '`filepath.IsLocal("link/passwd")` vaut true, et `/srv/files/link` est un lien symbolique vers `/etc`. Qu’ouvre `os.Open(filepath.Join("/srv/files", "link/passwd"))` ?',
			options: [
				'Rien : `os.Open` renvoie une erreur car le chemin sort du dossier de base',
				'`/etc/passwd`, car `IsLocal` regarde la chaîne et ne suit jamais le lien',
				'`/srv/files/link/passwd`, un fichier normal que Go crée à la place du lien',
				'Rien : Go refuse de suivre un lien symbolique sans une option dédiée'
			],
			answer: 1,
			why: 'La doc de Go qualifie `IsLocal` de "a purely lexical operation" qui "does not account for the effect of any symbolic links". `os.Open` suit le lien comme n’importe quel chemin. `os.OpenInRoot` renverrait "path escapes from parent".'
		},
		{
			q: 'Après `realpath`, une requête donne `/srv/files_old/key`. Quel contrôle l’accepte à tort comme étant dans `/srv/files` ?',
			options: [
				'`os.path.commonpath(["/srv/files", real]) == "/srv/files"`',
				'`real.startswith("/srv/files/")`, avec la barre finale',
				'`real.startswith("/srv/files")`, sans la barre finale',
				'`not os.path.relpath(real, "/srv/files").startswith("..")`'
			],
			answer: 2,
			why: '`startswith` compare des caractères, et `/srv/files_old` commence par les 10 caractères de `/srv/files`. `commonpath` compare des éléments de chemin entiers et renvoie `/srv`. La barre finale et `relpath` (qui donne `../files_old/key`) le refusent aussi.'
		}
	],
	recall: {
		q: 'Dans quel ordre traites-tu un nom de fichier reçu dans une requête, et quel appel Python vérifie que le résultat est dans la base ?',
		a: 'D’abord résoudre avec `os.path.realpath(os.path.join(BASE, name))`, puis exiger `os.path.commonpath([BASE, real]) == BASE`. En Go, `os.OpenInRoot(BASE, name)` fait les deux pendant l’ouverture et refuse aussi les liens symboliques qui sortent du dossier.'
	},
	sources: [
		{ title: 'Apache HTTP Server 2.4, vulnérabilités, CVE-2021-41773 et CVE-2021-42013', url: 'https://httpd.apache.org/security/vulnerabilities_24.html' },
		{ title: 'NVD, CVE-2021-41773', url: 'https://nvd.nist.gov/vuln/detail/CVE-2021-41773' },
		{ title: 'apache/httpd, correction de CVE-2021-41773 dans ap_normalize_path', url: HTTPD_FIX },
		{ title: 'The Go Blog, Traversal-resistant file APIs (12 mars 2025)', url: 'https://go.dev/blog/osroot' },
		{ title: 'CWE-22 : Improper Limitation of a Pathname to a Restricted Directory', url: 'https://cwe.mitre.org/data/definitions/22.html' },
		{ title: 'Documentation Python, os.path', url: 'https://docs.python.org/3/library/os.path.html' }
	]
};
