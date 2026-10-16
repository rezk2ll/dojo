const NUMPY = 'https://github.com/numpy/numpy';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'integer-overflow',
	part: 'Counting',
	title: 'Integer overflow in a NumPy element count',
	minutes: 10,
	hook: [
		'A user saved a NumPy array of shape `(2**30, 2)` to an `.npz` file with `np.savez`. Saving worked. Loading it back failed with "ValueError: negative dimensions are not allowed".',
		'The array has 2,147,483,648 elements of one byte each. On the user’s 64-bit machine, `np.int_`, the integer type NumPy uses by default, was 32 bits wide. The loader computes the element count from the shape before it allocates the array.'
	],
	terms: [
		{ term: 'int32', def: 'A signed 32-bit integer. Its largest value is 2,147,483,647, which is 2**31 minus 1.' },
		{ term: 'Wraparound', def: 'When a fixed-width integer goes past its largest value, it continues from its smallest one instead of raising an error.' },
		{ term: 'multiply.reduce', def: 'NumPy’s product of all items. It first converts the input to an array, which stores Python ints as NumPy integers of a fixed width.' }
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
			'On line 7, `shape` is a tuple of Python ints, which never overflow. `numpy.multiply.reduce` converts the tuple to an array of `np.int_` first and multiplies in that type. Where `np.int_` is 32 bits, any product above 2,147,483,647 wraps.',
			'2**30 times 2 is 2,147,483,648, one more than the int32 maximum, so line 7 wraps it to -2,147,483,648. The pull request prints it: `np.multiply.reduce(a.shape)` gives `-2147483648`. A `.npz` file is a zip archive, so `isfileobj(fp)` on line 13 is false. Line 20 then calls `numpy.empty(count, ...)`, which raises on the negative size.',
			'Line 7 now passes `dtype=numpy.int64`, so the reduction multiplies in 64 bits on every platform. 2**31 fits in 64 bits, and so does any element count a machine can hold in memory.',
			'The author opened [pull request #7598](' + NUMPY + '/pull/7598) with a short script that saves and reloads the array. It says the count "defaults to `int32` on some systems, including 64bit systems where it is possible to create arrays large enough to cause that value to overflow."'
		]
	},
	quiz: [
		{
			q: 'The shape is `(2**30, 2)` and the product is computed in int32. Which value ends up in `count`?',
			options: ['2,147,483,648, the right count', '2,147,483,647, clamped to the maximum', '-2,147,483,648, wrapped below zero', 'An OverflowError raised by NumPy'],
			answer: 2,
			why: '2**31 is one past the int32 maximum. Fixed-width integers wrap silently, so the result is the smallest int32 value.'
		},
		{
			q: 'Why did the same file load fine for users on most 64-bit Linux machines?',
			options: [
				'Their `np.int_` was 64 bits, so the product fit',
				'Linux stores `.npz` files without compression',
				'Their NumPy read the count from the zip header',
				'Python ints were used there instead of NumPy ints'
			],
			answer: 0,
			why: 'The reduction runs in `np.int_`. Where it is 64 bits, 2**31 is a small number. The bug only shows where the default integer is 32 bits.'
		},
		{
			q: 'You multiply sizes with a NumPy reduction. Which test catches this bug?',
			options: [
				'An array whose shape is the empty tuple `()`',
				'A product just above 2**31, in int32',
				'A small array with many tiny dimensions',
				'A shape that contains a zero somewhere'
			],
			answer: 1,
			why: 'The bug needs a product past the 32-bit limit and a 32-bit type. Forcing int32 in the test reproduces it on any machine, without needing a 2 GB array.'
		}
	],
	recall: {
		q: 'Why did loading a `(2**30, 2)` array give a negative size, and which argument fixed it?',
		a: '`numpy.multiply.reduce` multiplied the shape in `np.int_`, which was 32 bits there, so 2,147,483,648 wrapped to -2,147,483,648. Passing `dtype=numpy.int64` makes the product 64 bits.'
	},
	sources: [
		{ title: 'numpy pull request #7598', url: `${NUMPY}/pull/7598` },
		{ title: 'The fix commit', url: `${NUMPY}/commit/da668fc74653e5caae9f741461c4d20f9df6e5c1` }
	]
};
