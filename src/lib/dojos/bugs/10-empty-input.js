const DJANGO = 'https://github.com/django/django';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'empty-input',
	part: 'Inputs',
	title: 'A sitemap with nothing in it',
	minutes: 10,
	hook: [
		'On Django 4.1, a site’s sitemap index failed. `/sitemap.xml` returned a server error, and the log said **"ValueError: max() arg is an empty sequence"**.',
		'Django 4.1 added a `<lastmod>` date to each section of the sitemap index. To get it, the index view asks every section for its latest modification date. The site had one section whose `items()` returned no objects at the time.'
	],
	terms: [
		{ term: 'Sitemap', def: 'A Django class that lists the URLs of a site section. `items()` returns the objects, and `lastmod(item)` returns when one object last changed.' },
		{ term: 'Sitemap index', def: 'The top `/sitemap.xml` file. It links to each section and, since Django 4.1, gives each section a last modification date.' },
		{ term: 'max()', def: 'Python’s built-in that returns the largest item. On an empty sequence it raises ValueError, unless you pass `default=`.' }
	],
	bug: {
		title: 'Fixed #34088 \u002d\u002d Fixed Sitemap.get_latest_lastmod() crash with empty items.',
		repo: 'django/django',
		url: `${DJANGO}/blob/444b6da7cc229a58a2c476a52e45233001dc7073/django/contrib/sitemaps/__init__.py#L165-L174`,
		fix: `${DJANGO}/commit/5eab4d1924613a5506e517f157054b4852ae7dc2`,
		lang: 'python',
		code: `def get_latest_lastmod(self):
    if not hasattr(self, "lastmod"):
        return None
    if callable(self.lastmod):
        try:
            return max([self.lastmod(item) for item in self.items()])
        except TypeError:
            return None
    else:
        return self.lastmod`,
		lines: [6],
		diff: `         if callable(self.lastmod):
             try:
-                return max([self.lastmod(item) for item in self.items()])
+                return max([self.lastmod(item) for item in self.items()], default=None)
             except TypeError:
                 return None`,
		notes: [
			'When `items()` returns nothing, the list comprehension on line 6 builds `[]`, and `max([])` raises ValueError. Line 7 only catches TypeError, so the error leaves the method and the index view returns a 500.',
			'The crash needs no code change, only data: a section with `lastmod` defined as a method and zero items, for example a blog section with no published posts yet. The same sitemap works again as soon as one item exists.',
			'The fix passes `default=None` on line 6, so `max()` returns `None` for an empty list. The method already returns `None` when it cannot compute a date, and the index view treats it as "no date for this section".',
			'Michal Čihař reported it in [ticket #34088](https://code.djangoproject.com/ticket/34088): "When sitemap contains not items, but supports returning lastmod for an item, it fails with a `ValueError`". The commit says it is a "Bug in 480191244d12fefbf95854b2b117c71ffe44749a", the change that added `lastmod` to the sitemap index.'
		]
	},
	quiz: [
		{
			q: 'A section defines `lastmod` as a method and `items()` returns an empty queryset. What happens in the buggy code?',
			options: [
				'The method returns `None`',
				'`max()` raises ValueError and the view fails',
				'`max()` raises TypeError, which is caught',
				'`self.lastmod` is returned as is'
			],
			answer: 1,
			why: 'The list is empty, so `max()` raises ValueError. Only TypeError is caught, so the exception reaches the view.'
		},
		{
			q: 'Which change would also have fixed the crash?',
			options: [
				'Catching `(TypeError, ValueError)` instead of TypeError',
				'Replacing the list with a generator expression',
				'Calling `sorted()` and taking the last item',
				'Checking `hasattr(self, "items")` first'
			],
			answer: 0,
			why: 'Ticket #34088 proposed this change. A generator still gives `max()` nothing to compare, and `sorted([])[-1]` raises IndexError instead.'
		},
		{
			q: 'You call `max()`, `min()` or `[0]` on data from a query. Which test do you add first?',
			options: [
				'One with exactly one matching row',
				'One with several thousand rows',
				'One where the query returns no rows',
				'One where two rows are duplicates'
			],
			answer: 2,
			why: 'An empty result is the input where these calls have no answer. One row and many rows both give `max()` something to return.'
		}
	],
	recall: {
		q: 'Why did Django 4.1\'s `/sitemap.xml` return a 500 for a section with no items, and what one argument fixed it?',
		a: '`max([])` raised ValueError, and the `except` only caught TypeError. The fix passes `default=None` to `max()`.'
	},
	sources: [
		{ title: 'Django ticket #34088', url: 'https://code.djangoproject.com/ticket/34088' },
		{ title: 'The fix commit', url: `${DJANGO}/commit/5eab4d1924613a5506e517f157054b4852ae7dc2` }
	]
};
