const CPY = 'https://github.com/python/cpython';
const ISSUE = `${CPY}/issues/56075`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'shared-counter',
	part: 'L’état et le temps',
	title: 'Deux threads nommés Thread-35',
	minutes: 10,
	hook: [
		'Un utilisateur de Python écrit un script où chaque thread en lance trois autres, sur cinq niveaux, et affiche son nom. Il le lance une centaine de fois et compte les noms en double. La sortie montre `Thread-35` et `Thread-12`, chacun donné à deux threads.',
		'La docstring de `Thread.__init__` promet un nom unique quand tu n’en passes pas. Ce nom vient d’un compteur global au module `threading.py`, et le constructeur s’exécute dans le thread qui crée le nouveau.'
	],
	terms: [
		{ term: 'GIL', def: 'Le verrou global de l’interpréteur CPython. Un seul thread exécute du bytecode Python à la fois, mais l’interpréteur peut changer de thread entre deux instructions.' },
		{ term: 'Lecture-modification-écriture', def: 'Une mise à jour en trois temps : lire la valeur, calculer la nouvelle, l’écrire. Un autre thread peut passer entre deux étapes.' },
		{ term: 'itertools.count', def: 'Un itérateur qui produit 0, 1, 2, etc. Son `__next__` est écrit en C, donc un appel compte comme une seule étape pour le code Python.' }
	],
	bug: {
		title: '#11866: Eliminate race condition in the computation of names for new threads.',
		repo: 'python/cpython',
		url: `${CPY}/blob/e1618491adc5c0ef214c25d4e3b882e8586a2fee/Lib/threading.py#L728-L789`,
		fix: `${CPY}/commit/b186f1df41da42d774ac9278588acc2bd11a59a8`,
		lang: 'python',
		code: `# Helper to generate new thread names
_counter = 0
def _newname(template="Thread-%d"):
    global _counter
    _counter += 1
    return template % _counter
…
    def __init__(self, group=None, target=None, name=None,
                 args=(), kwargs=None, *, daemon=None):
        …
        *name* is the thread name. By default, a unique name is constructed of
        the form "Thread-N" where N is a small decimal number.
        …
        self._target = target
        self._name = str(name or _newname())`,
		lines: [5],
		diff: ` # Helper to generate new thread names
-_counter = 0
+_counter = _count().__next__
+_counter() # Consume 0 so first non-main thread has id 1.
 def _newname(template="Thread-%d"):
-    global _counter
-    _counter += 1
-    return template % _counter
+    return template % _counter()`,
		notes: [
			'**Une ligne, plusieurs instructions.** `_counter += 1` lit la variable globale, ajoute 1, puis écrit le résultat. Le signalement montre le bytecode : `LOAD_GLOBAL`, `BINARY_ADD`, `STORE_GLOBAL`. L’interpréteur peut changer de thread entre deux de ces instructions, même avec le GIL.',
			'**Comment deux threads obtiennent 35.** Le compteur vaut 34. Le thread A lit 34 et ajoute 1, puis l’interpréteur bascule. Le thread B lit 34, ajoute 1, écrit 35. A reprend et écrit son propre 35. Les deux formatent ensuite `Thread-35`. Un incrément est perdu et un nom sert deux fois.',
			'**Le correctif.** `_count().__next__` est une fonction C. Un appel lit et avance le compteur en une seule étape, donc aucun thread ne peut passer au milieu. L’appel `_counter()` en plus consomme le 0 pour que le premier thread reste `Thread-1`. Antoine Pitrou a noté sur le ticket : "this fix only works on implementations where itertools.count().next is atomic" (le correctif ne vaut que là où cet appel est atomique).',
			'**Comment ça s’est vu.** Peter Saveliev a ouvert le [ticket #11866](' + ISSUE + ') : "The _newname() function has no locking." Il a joint un script et l’a lancé une centaine de fois pour montrer les doublons. Le correctif n’a pas de test, parce que selon le committer un test "would never be a consistent failure" (n’échouerait jamais de façon fiable).'
		]
	},
	quiz: [
		{
			q: 'Le compteur vaut 34 et deux threads appellent `_newname()` en même temps. Quel est le pire résultat ?',
			options: [
				'Les deux threads obtiennent `Thread-35`',
				'L’un obtient `Thread-35`, l’autre `Thread-36`',
				'Un des deux threads lève une erreur',
				'Les deux obtiennent `Thread-36` et 35 est sauté'
			],
			answer: 0,
			why: 'Les deux lisent 34 avant que l’un des deux écrive. Chacun calcule 35 et le formate, donc les deux noms sont identiques.'
		},
		{
			q: 'Pourquoi le GIL ne rend-il pas `_counter += 1` sûr ?',
			options: [
				'Le GIL est relâché à chaque variable globale',
				'Le GIL ne protège que le code C, pas le code Python',
				'L’interpréteur peut changer de thread entre deux instructions',
				'`+=` sur un int crée un nouveau thread'
			],
			answer: 2,
			why: 'Le GIL garde une instruction de bytecode entière, pas une ligne entière. La lecture et l’écriture sont deux instructions séparées.'
		},
		{
			q: 'Il te faut un compteur partagé entre threads dans ton propre code Python. Quel choix tient sur toutes les implémentations de Python ?',
			options: [
				'Un int global mis à jour avec `+=`',
				'Un int global mis à jour sous un `threading.Lock`',
				'Une liste d’un int, mise à jour avec `x[0] += 1`',
				'Un int global que chaque thread copie d’abord'
			],
			answer: 1,
			why: 'Un verrou fait de la lecture et de l’écriture une seule étape pour chaque thread qui le prend. L’astuce `itertools.count` repose sur un appel C atomique, ce que le ticket présente comme un détail d’implémentation.'
		}
	],
	takeaway: 'Cherche les `+=` sur toute variable que plusieurs threads peuvent atteindre. Mets la mise à jour sous un verrou, ou utilise un seul appel qui lit et écrit en une étape.',
	sources: [
		{ title: 'cpython, ticket #56075 (bpo-11866)', url: ISSUE },
		{ title: 'Le commit du correctif', url: `${CPY}/commit/b186f1df41da42d774ac9278588acc2bd11a59a8` }
	]
};
