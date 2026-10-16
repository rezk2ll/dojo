const DJANGO = 'https://github.com/django/django';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'path-traversal',
	part: 'Les entrées',
	title: 'Un dossier voisin au nom plus long',
	minutes: 10,
	hook: [
		'`django-admin startproject --template` accepte un fichier `.zip` ou `.tar` et l’extrait dans le dossier du nouveau projet. L’archive peut venir d’une URL : ses noms de fichiers sont donc des entrées fournies par quelqu’un d’autre.',
		'En 2021, Django a ajouté un test qui refuse les entrées d’archive qui atterrissent hors du dossier cible (CVE-2021-3281). En 2025, un second signalement (CVE-2025-59682) a montré que **certaines entrées étaient quand même écrites hors de ce dossier**, dans un dossier à côté.'
	],
	terms: [
		{ term: 'Path traversal', def: 'Un nom de fichier avec des segments `..`, ou un chemin absolu, qui fait sortir une écriture ou une lecture du dossier prévu.' },
		{ term: 'os.path.abspath', def: 'Rend un chemin absolu et résout les segments `..` comme du texte. `/tmp/proj/../x` devient `/tmp/x`.' },
		{ term: 'SuspiciousOperation', def: 'L’exception Django pour une entrée qui ressemble à une attaque. Ici, elle arrête l’extraction.' }
	],
	bug: {
		title: 'Fixed potential partial directory-traversal via archive.extract().',
		repo: 'django/django',
		url: `${DJANGO}/blob/41b43c74bda19753c757036673ea9db74acf494a/django/utils/archive.py#L145-L223`,
		fix: `${DJANGO}/commit/924a0c092e65fa2d0953fd1855d2dc8786d94de2`,
		lang: 'python',
		code: `def target_filename(self, to_path, name):
    target_path = os.path.abspath(to_path)
    filename = os.path.abspath(os.path.join(target_path, name))
    if not filename.startswith(target_path):
        raise SuspiciousOperation("Archive contains invalid path: '%s'" % name)
    return filename
…
def extract(self, to_path):
    namelist = self._archive.namelist()
    leading = self.has_leading_dir(namelist)
    for name in namelist:
        data = self._archive.read(name)
        info = self._archive.getinfo(name)
        if leading:
            name = self.split_leading_dir(name)[1]
        if not name:
            continue
        filename = self.target_filename(to_path, name)`,
		lines: [4],
		diff: `         filename = os.path.abspath(os.path.join(target_path, name))
-        if not filename.startswith(target_path):
+        try:
+            if os.path.commonpath([target_path, filename]) != target_path:
+                raise SuspiciousOperation("Archive contains invalid path: '%s'" % name)
+        except ValueError:
+            # Different drives on Windows raises ValueError.
             raise SuspiciousOperation("Archive contains invalid path: '%s'" % name)`,
		notes: [
			'**Un préfixe de texte n’est pas un dossier.** `startswith` compare des caractères. `/tmp/proj` est un préfixe de `/tmp/proj2/run.py`, mais `/tmp/proj2` est un autre dossier, à côté de la cible.',
			'**Une entrée qui passe.** Extrais dans `/tmp/proj` un zip qui contient `README` et `../proj2/run.py`. Les deux entrées n’ont pas de dossier racine commun, donc `leading` est faux et le nom reste tel quel. `abspath` le transforme en `/tmp/proj2/run.py`, qui commence par `/tmp/proj`, et le fichier est écrit là. Une entrée comme `../etc/x` reste refusée, d’où le terme "partial directory-traversal" de la note de version.',
			'**Le correctif.** `os.path.commonpath` compare des morceaux de chemin entiers. Pour `/tmp/proj` et `/tmp/proj2/run.py`, il renvoie `/tmp`, qui n’est pas la cible, donc Django lève `SuspiciousOperation`. `commonpath` lève `ValueError` quand les deux chemins sont sur des lecteurs différents, et ce cas est refusé lui aussi.',
			'**Comment ça s’est vu.** Le commit dit "Thanks stackered for the report." et "Follow up to 05413afa8c18cdb978fcdf470e09f7a12b234a23", le commit de 2021 qui avait ajouté `target_filename`. La [note de version](' + DJANGO + '/blob/main/docs/releases/5.2.7.txt) dit que la fonction "allowed partial directory-traversal via an archive with file paths sharing a common prefix with the target directory" (des chemins qui partagent un préfixe avec le dossier cible).'
		]
	},
	quiz: [
		{
			q: 'La cible est `/tmp/proj`. Quel chemin résolu passe le test `startswith` tout en étant hors de la cible ?',
			options: ['/tmp/proj/app/models.py', '/tmp/proj2/run.py', '/tmp/other/run.py', '/etc/passwd'],
			answer: 1,
			why: '`/tmp/proj2/run.py` commence par les caractères `/tmp/proj`, donc le test passe. Son dossier est `/tmp/proj2`, un voisin de la cible.'
		},
		{
			q: 'Quel test dit si `filename` est dans `target_path` (tous deux déjà absolus) ?',
			options: [
				'os.path.commonpath([target_path, filename]) == target_path',
				"'..' not in name, vérifié avant d’appeler os.path.join",
				'len(filename) > len(target_path) après abspath',
				'filename.startswith(target_path) après abspath'
			],
			answer: 0,
			why: '`commonpath` travaille sur des morceaux de chemin entiers. Chercher `..` rate un nom absolu comme `/etc/x`, que `os.path.join` garde tel quel. Le test de longueur accepte n’importe quel chemin plus long.'
		},
		{
			q: 'Tu écris un test pour une fonction qui garde les fichiers dans un dossier. Quelle entrée doit-il contenir ?',
			options: [
				'Une entrée avec un nom de fichier très long et plein de points',
				'Une entrée dans un dossier voisin dont le nom prolonge la cible',
				'Une entrée avec des espaces et des accents dans ses noms',
				'Une entrée de dossier vide à la racine de l’archive'
			],
			answer: 1,
			why: 'Un voisin comme `../proj2/x` quand la cible est `proj`, c’est l’entrée qui distingue un test de préfixe d’un vrai test de dossier. Les autres entrées restent dans la cible avec les deux tests.'
		}
	],
	takeaway: 'Pour vérifier qu’un chemin reste dans un dossier, compare des morceaux de chemin avec `os.path.commonpath` ou `Path.is_relative_to`, pas des chaînes. Un test de préfixe accepte aussi chaque dossier voisin dont le nom commence par les mêmes lettres.',
	sources: [
		{ title: 'Notes de version de Django 5.2.7 (CVE-2025-59682)', url: `${DJANGO}/blob/main/docs/releases/5.2.7.txt` },
		{ title: 'Le commit du correctif', url: `${DJANGO}/commit/924a0c092e65fa2d0953fd1855d2dc8786d94de2` },
		{ title: 'Le correctif de 2021 qui avait ajouté le test', url: `${DJANGO}/commit/05413afa8c18cdb978fcdf470e09f7a12b234a23` }
	]
};
