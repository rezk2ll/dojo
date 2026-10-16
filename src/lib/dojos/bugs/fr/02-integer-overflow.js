const NUMPY = 'https://github.com/numpy/numpy';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'integer-overflow',
	part: 'Compter',
	title: 'Deux milliards d’octets, signe moins compris',
	minutes: 10,
	hook: [
		'Un utilisateur enregistre un tableau NumPy de forme `(2**30, 2)` dans un fichier `.npz` avec `np.savez`. L’enregistrement passe. Le rechargement échoue avec **"ValueError: negative dimensions are not allowed"**.',
		'Le tableau a 2 147 483 648 éléments d’un octet chacun. Sur la machine 64 bits de l’utilisateur, `np.int_`, le type entier que NumPy utilise par défaut, faisait 32 bits. Le chargeur calcule le nombre d’éléments à partir de la forme avant d’allouer le tableau.'
	],
	terms: [
		{ term: 'int32', def: 'Un entier signé sur 32 bits. Sa plus grande valeur est 2 147 483 647, soit 2**31 moins 1.' },
		{ term: 'Débordement circulaire', def: 'Quand un entier de taille fixe dépasse sa plus grande valeur, il repart de la plus petite au lieu de lever une erreur.' },
		{ term: 'multiply.reduce', def: 'Le produit de tous les éléments dans NumPy. Il convertit d’abord l’entrée en tableau, donc les int Python deviennent des entiers NumPy de taille fixe.' }
	],
	bug: {
		title: 'BUG: Cast size to int64 when loading from archive',
		repo: 'numpy/numpy',
		url: `${NUMPY}/blob/1fc180b4c683e79649e5699303722995ca3e8ef9/numpy/lib/format.py#L620-L660`,
		fix: `${NUMPY}/commit/da668fc74653e5caae9f741461c4d20f9df6e5c1`,
		lang: 'python',
		code: `version = read_magic(fp)
_check_version(version)
shape, fortran_order, dtype = _read_array_header(fp, version)
if len(shape) == 0:
    count = 1
else:
    count = numpy.multiply.reduce(shape)

# Now read the actual data.
if dtype.hasobject:
    …
else:
    if isfileobj(fp):
        # We can use the fast fromfile() function.
        array = numpy.fromfile(fp, dtype=dtype, count=count)
    else:
        # This is not a real file. We have to read it the
        # memory-intensive way.
        …
        array = numpy.empty(count, dtype=dtype)`,
		lines: [7],
		diff: `     else:
-        count = numpy.multiply.reduce(shape)
+        count = numpy.multiply.reduce(shape, dtype=numpy.int64)

     # Now read the actual data.`,
		notes: [
			'**Le produit prend la taille par défaut.** `shape` est un tuple d’int Python, qui ne débordent jamais. `numpy.multiply.reduce` convertit d’abord le tuple en tableau de `np.int_` et multiplie dans ce type. Là où `np.int_` fait 32 bits, tout produit au-dessus de 2 147 483 647 déborde.',
			'**Les chiffres du signalement.** 2**30 fois 2 donne 2**31, soit 2 147 483 648. C’est un de plus que le maximum d’un int32, donc le résultat repart à **-2 147 483 648**. La pull request l’affiche : `np.multiply.reduce(a.shape)` donne `-2147483648`. Un fichier `.npz` est une archive zip, pas un vrai fichier, donc le code passe par `numpy.empty(count, ...)`, qui lève une erreur sur la taille négative.',
			'**Le correctif.** `dtype=numpy.int64` fait multiplier la réduction sur 64 bits, quelle que soit la plateforme. 2**31 y tient sans problème, comme tout nombre d’éléments qu’une machine peut garder en mémoire.',
			'**Comment ça s’est vu.** L’auteur a ouvert la [pull request #7598](' + NUMPY + '/pull/7598) avec un court script qui enregistre puis recharge le tableau. Elle dit que le compte "defaults to `int32` on some systems, including 64bit systems where it is possible to create arrays large enough to cause that value to overflow" (passe en int32 sur certains systèmes, y compris en 64 bits).'
		]
	},
	quiz: [
		{
			q: 'La forme vaut `(2**30, 2)` et le produit se fait en int32. Que vaut `count` ?',
			options: ['2 147 483 648, le bon compte', '2 147 483 647, bloqué au maximum', '-2 147 483 648, repassé sous zéro', 'Une OverflowError levée par NumPy'],
			answer: 2,
			why: '2**31 dépasse d’un le maximum d’un int32. Les entiers de taille fixe débordent sans prévenir, donc on obtient la plus petite valeur d’un int32.'
		},
		{
			q: 'Pourquoi le même fichier se chargeait-il sans souci sur la plupart des machines Linux 64 bits ?',
			options: [
				'Leur `np.int_` faisait 64 bits, donc le produit tenait',
				'Linux enregistre les `.npz` sans compression',
				'Leur NumPy lisait le compte dans l’en-tête du zip',
				'Le calcul y utilisait des int Python, pas NumPy'
			],
			answer: 0,
			why: 'La réduction se fait en `np.int_`. Là où il fait 64 bits, 2**31 est un petit nombre. Le bug n’apparaît que là où l’entier par défaut fait 32 bits.'
		},
		{
			q: 'Tu multiplies des tailles avec une réduction NumPy. Quel test attrape ce bug ?',
			options: [
				'Un tableau dont la forme est le tuple vide `()`',
				'Un produit juste au-dessus de 2**31, en int32',
				'Un petit tableau avec beaucoup de dimensions',
				'Une forme qui contient un zéro quelque part'
			],
			answer: 1,
			why: 'Le bug demande un produit au-delà de la limite des 32 bits et un type sur 32 bits. Forcer int32 dans le test le reproduit sur n’importe quelle machine, sans tableau de 2 Go.'
		}
	],
	takeaway: 'Quand tu multiplies des tailles ou des comptes avec NumPy, regarde dans quel type entier se fait le produit. Passe `dtype=numpy.int64` ou reste en int Python, et teste avec un produit juste au-dessus de 2**31.',
	sources: [
		{ title: 'numpy, pull request #7598', url: `${NUMPY}/pull/7598` },
		{ title: 'Le commit du correctif', url: `${NUMPY}/commit/da668fc74653e5caae9f741461c4d20f9df6e5c1` }
	]
};
