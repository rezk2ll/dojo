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
		],
		steps: [
			{
				title: 'Lis le handler',
				questions: [
					{ q: 'Quelle ligne du handler est la première à toucher le disque ?', options: ['`path = os.path.join(BASE, name)`', '`return open(path, "rb").read()`', '`if not path.startswith(BASE)`', '`BASE = "/srv/files"`'], answer: 1, why: '`os.path.join` et `startswith` ne travaillent que sur des chaînes. Rien ne regarde la vraie arborescence avant `open()`.' },
					{ q: 'Qui choisit la valeur de `name` ?', options: ['La config du serveur', 'La constante `BASE`', 'Celui qui envoie la requête de téléchargement', 'Le noyau'], answer: 2, why: '`name` vient de la requête : chacun de ses caractères, `/` et `..` compris, est choisi par l’expéditeur.' },
					{ q: 'Que renvoie `os.path.join(BASE, "/etc/passwd")` ?', options: ['`/etc/passwd`, car la seconde partie est absolue', '`/srv/files/etc/passwd`', '`/srv/files//etc/passwd`', 'Une erreur, car le nom commence par une barre'], answer: 0, why: '`os.path.join` jette `BASE` quand la seconde partie est absolue, le résultat vaut donc `/etc/passwd`.' },
					{ q: 'Alors, `name = "/etc/passwd"` passe-t-il ce handler ?', options: ['Oui : `open()` lit `/etc/passwd` et le renvoie', 'Oui, mais seulement si l’appli tourne sous Windows', 'Non : `os.path.join` lève une erreur avant le contrôle', 'Non : la chaîne collée échoue au contrôle de préfixe'], answer: 3, why: 'Il est bloqué par chance. Le collage donne `/etc/passwd`, et cette chaîne échoue au contrôle de préfixe.' }
				]
			},
			{
				title: 'Remonte avec ..',
				questions: [
					{ q: 'Pour `name = "../../etc/passwd"`, quelle chaîne `startswith` voit-il ?', options: ['`/etc/passwd`', '`/srv/files/etc/passwd`', '`/srv/files/../../etc/passwd`', '`/srv/../etc/passwd`'], answer: 2, why: '`os.path.join` ne fait que coller les deux chaînes. Les `..` restent en place : la chaîne commence par `/srv/files` et le contrôle passe.' },
					{ q: 'Pourquoi deux `..` et pas un seul ?', options: ['Chacun remonte d’un niveau : `/srv`, puis `/`', 'Python exige un nombre pair de segments `..`', 'Le premier est retiré par `os.path.join`', 'Un seul suffit, le second sert de remplissage'], answer: 0, why: 'La base est deux niveaux sous `/`. Chaque `..` retire un niveau.' },
					{ q: 'La page CWE-22 montre la même erreur en Java. Avec quel appel ?', options: ['`getCanonicalPath()`', '`startsWith("/safe_dir/")`', '`Files.newInputStream()`', '`File.separator`'], answer: 1, why: 'CWE-22 montre un contrôle de préfixe avec `startsWith("/safe_dir/")` sur un chemin qui contient encore des `..`.' },
					{ q: 'Qu’est-ce qui ferait échouer ce premier nom ?', options: ['Chercher `etc` dans le nom', 'Passer le nom en minuscules avant le contrôle', 'Résoudre le chemin avant le contrôle de préfixe', 'Utiliser `open(path, "r")` au lieu de `"rb"`'], answer: 2, why: 'Une fois résolu, le chemin vaut `/etc/passwd`, qui ne commence pas par `/srv/files`.' }
				]
			},
			{
				title: 'Trouve le voisin',
				questions: [
					{ q: 'Quel second `name` lit un fichier hors de `/srv/files` ?', options: ['`./key`', '`files_old/key`', '`../files/key`', '`../files_old/key`'], answer: 3, why: 'Il donne `/srv/files/../files_old/key`, qui commence par `/srv/files` et ouvre `/srv/files_old/key`.' },
					{ q: 'Quel autre dossier de ce serveur la même astuce pourrait-elle atteindre ?', options: ['`/srv/data`', '`/srv/www`', '`/srv/files-backup`', '`/srv/backup-files`'], answer: 2, why: 'Tout voisin dont le nom commence par `files` garde une chaîne qui commence par `/srv/files`. `/srv/backup-files` finit par ce mot, ce qui n’aide pas.' },
					{ q: 'La doc Python met en garde contre `os.path.commonprefix` pour la même raison. Que dit-elle ?', options: ['Elle travaille caractère par caractère', 'Elle suit les liens symboliques', 'Elle est lente sur les longs chemins', 'Elle ne marche que sous Windows'], answer: 0, why: 'La doc dit qu’elle "works a character at a time" : `/usr/lib` et `/usr/local/lib` partagent `/usr/l`.' },
					{ q: 'Que renvoie `os.path.commonprefix(["/srv/files", "/srv/files_old/key"])` ?', options: ['`/srv`', '`/`', '`/srv/files_old`', '`/srv/files`, donc un contrôle bâti dessus accepterait le nom'], answer: 3, why: 'Elle compare des caractères, et `/srv/files_old/key` commence par les dix caractères de `/srv/files`. Elle a le même défaut que `startswith`.' }
				]
			},
			{
				title: 'Réécris le contrôle',
				questions: [
					{ q: 'Dans la réécriture, que vaut `real` pour `name = "/etc/passwd"` ?', options: ['`/etc/passwd`', '`/srv/files/etc/passwd`', '`/srv/files/passwd`', 'Une erreur, levée par `realpath`'], answer: 0, why: 'Le collage jette toujours `BASE` pour un nom absolu, et `realpath` garde `/etc/passwd`. C’est au contrôle suivant de le refuser.' },
					{ q: 'Avec la réécriture, `name = "../files_old/key"` arrive. Que renvoie `commonpath([BASE, real])`, et que fait le handler ?', options: ['`/srv/files`, donc il sert le fichier', '`/srv`, donc il répond 403', '`/srv/files_old`, donc il sert le fichier', 'Rien : `commonpath` lève une erreur sur des chemins différents'], answer: 1, why: '`commonpath` compare des éléments entiers : `files` et `files_old` diffèrent, seul `/srv` est commun, et `/srv` n’est pas `BASE`.' },
					{ q: 'Avec la réécriture, que devient `a/../b.txt` ?', options: ['Refusé, car il contient `..`', 'Refusé, car `a` n’existe pas', 'Servi : il donne `/srv/files/b.txt`', 'Il lève une erreur dans `commonpath`'], answer: 2, why: 'Il se résout dans la base, c’est donc une requête légitime. Le contrôle refuse les évasions, pas les points.' },
					{ q: 'Quelle faille reste avec `realpath` puis `open()` ?', options: ['Aucune : `realpath` rend tout sûr', 'Il refuse tous les liens symboliques de la base', 'Il ne gère pas les noms absolus', 'Un lien glissé après le contrôle'], answer: 3, why: 'Contrôler puis ouvrir, c’est deux étapes. `os.OpenInRoot` de Go vérifie chaque étape pendant l’ouverture, ce qui ferme cette fenêtre.' }
				]
			}
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
	lab: {
		minutes: 15,
		goal: 'Casser un contrôle de préfixe avec `..` et un dossier voisin, puis le corriger avec `realpath` et `commonpath`.',
		steps: [
			'Crée une arborescence de test : `mkdir -p ~/trav-lab/files ~/trav-lab/files_old && cd ~/trav-lab && echo hello > files/a.txt && echo secret > files_old/key && echo topsecret > secret.txt`.',
			'Enregistre le handler naïf : `printf \'%s\\n\' \'import os, sys\' \'BASE = os.path.realpath("files")\' \'path = os.path.join(BASE, sys.argv[1])\' \'print(open(path).read() if path.startswith(BASE) else "403")\' > naive.py`.',
			'Attaque-le : `python3 naive.py a.txt`, puis `python3 naive.py ../secret.txt`, puis `python3 naive.py ../files_old/key`, puis `python3 naive.py /etc/hostname`.',
			'Écris `safe.py` : le même script, mais qui résout le chemin collé avec `os.path.realpath` et ne sert le fichier que si `os.path.commonpath([BASE, real]) == BASE`.',
			'Ajoute un lien symbolique qui pointe dehors, `ln -s .. files/link`, et essaie `link/secret.txt` sur les deux scripts.'
		],
		done: [
			'`python3 naive.py ../secret.txt` affiche `topsecret` et `python3 naive.py ../files_old/key` affiche `secret`.',
			'`python3 safe.py` affiche `403` pour `../secret.txt`, `../files_old/key`, `/etc/hostname` et `link/secret.txt`.',
			'`python3 safe.py x/../a.txt` affiche toujours `hello`.'
		],
		solution: [
			'`printf \'%s\\n\' \'import os, sys\' \'BASE = os.path.realpath("files")\' \'real = os.path.realpath(os.path.join(BASE, sys.argv[1]))\' \'print(open(real).read() if os.path.commonpath([BASE, real]) == BASE else "403")\' > safe.py`',
			'`naive.py` ne refuse `/etc/hostname` que par chance : `os.path.join` jette `BASE` pour un nom absolu.',
			'`realpath` suit `files/link`, donc `safe.py` voit la vraie cible et la refuse. Un lien glissé après le contrôle reste possible : c’est la course que ferme `os.OpenInRoot` de Go.'
		]
	},
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
