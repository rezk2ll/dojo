const DJANGO = 'https://github.com/django/django';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'empty-input',
	part: 'Les entrées',
	title: 'Un sitemap sans rien dedans',
	minutes: 10,
	hook: [
		'Sous Django 4.1, l’index du sitemap d’un site plante. `/sitemap.xml` renvoie une erreur serveur, et le log dit **"ValueError: max() arg is an empty sequence"**.',
		'Django 4.1 a ajouté une date `<lastmod>` à chaque section de l’index du sitemap. Pour l’obtenir, la vue d’index demande à chaque section sa dernière date de modification. Le site avait une section dont `items()` ne renvoyait aucun objet à ce moment-là.'
	],
	terms: [
		{ term: 'Sitemap', def: 'Une classe Django qui liste les URL d’une section du site. `items()` renvoie les objets, et `lastmod(item)` la date de dernière modification d’un objet.' },
		{ term: 'Index du sitemap', def: 'Le fichier `/sitemap.xml` de tête. Il pointe vers chaque section et, depuis Django 4.1, donne à chacune une date de dernière modification.' },
		{ term: 'max()', def: 'La fonction intégrée de Python qui renvoie le plus grand élément. Sur une séquence vide, elle lève ValueError, sauf si tu passes `default=`.' }
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
			'Quand `items()` ne renvoie rien, la compréhension de liste de la ligne 6 construit `[]`, et `max([])` lève ValueError. La ligne 7 n’attrape que TypeError : l’erreur sort de la méthode et la vue d’index renvoie une 500.',
			'Le plantage ne demande aucune modification du code, seulement des données : une section avec `lastmod` défini comme méthode et zéro objet, par exemple une section de blog sans article publié pour l’instant. Le même sitemap remarche dès qu’un objet existe.',
			'Le correctif passe `default=None` à la ligne 6 : `max()` renvoie alors `None` pour une liste vide. La méthode renvoie déjà `None` quand elle ne peut pas calculer de date, et la vue d’index le traite comme « pas de date pour cette section ».',
			'Michal Čihař l’a signalé dans le [ticket #34088](https://code.djangoproject.com/ticket/34088) : "When sitemap contains not items, but supports returning lastmod for an item, it fails with a `ValueError`". Le commit indique un "Bug in 480191244d12fefbf95854b2b117c71ffe44749a", le changement qui a ajouté `lastmod` à l’index du sitemap.'
		]
	},
	quiz: [
		{
			q: 'Une section définit `lastmod` comme méthode et `items()` renvoie un queryset vide. Que se passe-t-il dans le code bogué ?',
			options: [
				'La méthode renvoie `None`',
				'`max()` lève ValueError et la vue plante',
				'`max()` lève TypeError, qui est attrapée',
				'`self.lastmod` est renvoyé tel quel'
			],
			answer: 1,
			why: 'La liste est vide, donc `max()` lève ValueError. Seule TypeError est attrapée, donc l’exception remonte jusqu’à la vue.'
		},
		{
			q: 'Quel changement aurait aussi corrigé le plantage ?',
			options: [
				'Attraper `(TypeError, ValueError)` au lieu de TypeError',
				'Remplacer la liste par une expression génératrice',
				'Appeler `sorted()` et prendre le dernier élément',
				'Vérifier `hasattr(self, "items")` d’abord'
			],
			answer: 0,
			why: 'Le ticket #34088 proposait ce changement. Un générateur ne donne toujours rien à comparer à `max()`, et `sorted([])[-1]` lève IndexError à la place.'
		},
		{
			q: 'Tu appelles `max()`, `min()` ou `[0]` sur le résultat d’une requête. Quel test ajoutes-tu en premier ?',
			options: [
				'Un test avec une seule ligne',
				'Un test avec des milliers de lignes',
				'Un test où la requête ne renvoie rien',
				'Un test avec des lignes en double'
			],
			answer: 2,
			why: 'Un résultat vide est l’entrée où ces appels n’ont pas de réponse. Avec une ligne ou avec beaucoup, `max()` a toujours quelque chose à renvoyer.'
		}
	],
	recall: {
		q: 'Pourquoi le `/sitemap.xml` de Django 4.1 renvoyait-il une 500 pour une section sans objet, et quel argument a suffi à corriger ?',
		a: '`max([])` levait ValueError, et le `except` n’attrapait que TypeError. Le correctif passe `default=None` à `max()`.'
	},
	sources: [
		{ title: 'Django, ticket #34088', url: 'https://code.djangoproject.com/ticket/34088' },
		{ title: 'Le commit du correctif', url: `${DJANGO}/commit/5eab4d1924613a5506e517f157054b4852ae7dc2` }
	]
};
