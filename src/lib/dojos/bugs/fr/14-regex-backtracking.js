const RAILS = 'https://github.com/rails/rails';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'regex-backtracking',
	part: 'Les entrées',
	title: 'Un e-mail trop court',
	minutes: 10,
	hook: [
		'`String#truncate_words` est arrivée avec Rails 4.2. Elle garde les N premiers mots d’un texte et ajoute `...`. Un utilisateur l’appelle sur le corps d’un e-mail reçu, avec 30 comme limite, et **la console Rails se fige**. Avec 20, elle répond tout de suite.',
		'L’e-mail faisait 23 mots, donc il n’y avait rien à couper. La méthode trouve le point de coupe avec une seule expression régulière, construite à partir du séparateur et du nombre de mots.'
	],
	terms: [
		{ term: 'Backtracking', def: 'Quand une partie de la regex échoue, le moteur revient en arrière et essaie une autre façon de faire correspondre les parties d’avant.' },
		{ term: 'Quantificateur paresseux `+?`', def: 'Prend d’abord le moins de caractères possible, puis un de plus à chaque fois que le moteur revient sur lui.' },
		{ term: 'Groupe atomique `(?>...)`', def: 'Une fois le groupe trouvé, le moteur ne revient jamais dedans pour essayer autre chose.' }
	],
	bug: {
		title: 'Fix a backtracking problem in String#truncate_words',
		repo: 'rails/rails',
		url: `${RAILS}/blob/5a6868b6175167d91fcfaed82b4d4627281a4878/activesupport/lib/active_support/core_ext/string/filters.rb#L93-L101`,
		fix: `${RAILS}/commit/ece0d25c2b64b1bc1f1b4b6343a7f5b909d75f06`,
		lang: 'ruby',
		code: `def truncate_words(words_count, options = {})
  sep = options[:separator] || /\\s+/
  sep = Regexp.escape(sep.to_s) unless Regexp === sep
  if self =~ /\\A((?:.+?#{sep}){#{words_count - 1}}.+?)#{sep}.*/m
    $1 + (options[:omission] || '...')
  else
    dup
  end
end`,
		lines: [4],
		diff: `     sep = options[:separator] || /\\s+/
     sep = Regexp.escape(sep.to_s) unless Regexp === sep
-    if self =~ /\\A((?:.+?#{sep}){#{words_count - 1}}.+?)#{sep}.*/m
+    if self =~ /\\A((?>.+?#{sep}){#{words_count - 1}}.+?)#{sep}.*/m
       $1 + (options[:omission] || '...')`,
		notes: [
			'**Un morceau peut contenir n’importe quoi.** Pour `truncate_words(30)`, la regex vaut `\\A((?:.+?\\s+){29}.+?)\\s+.*`. Chacun des 29 morceaux, c’est `.+?` puis des blancs. Avec le flag `/m`, `.` accepte n’importe quel caractère, espaces et retours à la ligne compris. Un morceau peut donc être un mot, trois mots, ou un seul espace pris dans une suite comme `"\\n    "`.',
			'**Où ça casse.** Le texte a 23 mots et la regex veut 29 morceaux, puis encore un mot et un séparateur. Aucun découpage ne marche. Le moteur ne le sait qu’après avoir essayé les découpages : chaque `.+?` paresseux grandit d’un caractère à la fois, et chaque suite d’espaces ajoute des endroits où couper. Avec 20 comme limite, le tout premier découpage correspond déjà, donc l’appel répond tout de suite.',
			'**Le correctif.** `(?>.+?#{sep})` rend chaque morceau atomique. Le `.+?` paresseux s’arrête au premier blanc, `\\s+` prend tous les blancs qui suivent, et le moteur ne rouvre plus le morceau. Chaque morceau devient un mot et les espaces qui le suivent, donc un texte trop court échoue en un seul passage.',
			'**Comment ça s’est vu.** Issue [#19070](' + RAILS + '/issues/19070) : "When you cut and paste the following into rails console with Rails 4.2. It hangs..." L’auteur analysait des e-mails entrants : "The hanging is causing 504s to happen eventually". La pull request ajoute un test qui enveloppe l’appel dans `Timeout.timeout(10)`.'
		]
	},
	quiz: [
		{
			q: 'Un texte fait 23 mots. Quel appel est lent avec la regex boguée ?',
			options: ['`truncate_words(5)`', '`truncate_words(20)`', '`truncate_words(30)`', 'Les trois, la regex est lente sur tout texte'],
			answer: 2,
			why: 'Avec 5 ou 20, le premier découpage trouve assez de mots et correspond. Avec 30, il n’y a pas assez de mots, et le moteur essaie les autres découpages avant d’abandonner.'
		},
		{
			q: 'Que change `(?>...)` dans la regex corrigée ?',
			options: [
				'Un morceau trouvé n’est plus jamais réessayé autrement',
				'Il rend `.+?` gourmand, qui prend alors tout le texte',
				'Il empêche `.` d’accepter les retours à la ligne',
				'Il met le résultat en cache pour le prochain appel'
			],
			answer: 0,
			why: 'Un groupe atomique jette ses positions de retour dès qu’il correspond. Le moteur ne peut plus y revenir, donc le nombre d’essais arrête de grimper.'
		},
		{
			q: 'Tu relis une regex avec un groupe répété comme `(?:.+?\\s+){n}`. Quelle entrée tester ?',
			options: [
				'Un texte de moins de n mots, avec des suites d’espaces',
				'Un texte d’exactement n mots, avec des espaces simples',
				'Une chaîne vide',
				'Un texte de beaucoup plus que n mots'
			],
			answer: 0,
			why: 'Une regex qui correspond peut s’arrêter au premier succès. Une regex qui échoue doit d’abord essayer chaque découpage, et les suites d’espaces lui en donnent plus.'
		}
	],
	takeaway: 'Quand un groupe répété peut aussi absorber son propre séparateur, un texte qui ne correspond pas peut prendre un temps énorme. Teste la regex sur une entrée qui échoue, et passe par un groupe atomique ou un simple `split`.',
	sources: [
		{ title: 'rails, issue #19070', url: `${RAILS}/issues/19070` },
		{ title: 'rails, pull request #19076', url: `${RAILS}/pull/19076` }
	]
};
