const DISCOURSE = 'https://github.com/discourse/discourse';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'calendar-math',
	part: 'Compter',
	title: 'Le dernier jeudi de février',
	minutes: 10,
	hook: [
		'Un événement Discourse commence le jeudi 26 février 2026 et revient tous les mois. Son e-mail annonce **"The last Thursday of every month"** (le dernier jeudi de chaque mois). Il devrait dire le quatrième jeudi.',
		'En février 2026, les deux tombent le même jour. En avril 2026, non : le quatrième jeudi est le 23 et le dernier le 30. Le code ci-dessous choisit le mot de l’e-mail à partir de la date de début de l’événement.'
	],
	terms: [
		{ term: 'Ordinal', def: 'La position d’un jour de la semaine dans son mois : premier, deuxième, troisième, quatrième ou dernier.' },
		{ term: '`Date.new(year, month, -1)`', def: 'En Ruby, le jour -1 désigne le dernier jour du mois. `.day` donne alors le nombre de jours du mois.' },
		{ term: 'BYDAY', def: 'La partie d’une règle de répétition (RRULE) qui nomme le jour. `BYDAY=4TH` est le quatrième jeudi, `BYDAY=-1TH` le dernier.' }
	],
	bug: {
		title: 'FIX: only treat a fifth weekday as last in monthly recurrences (#42852)',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/blob/50b44d80293d87e635c27b0805b8417faf6a55e5/plugins/discourse-events/lib/discourse_post_event/email_renderer.rb#L3-L210`,
		fix: `${DISCOURSE}/commit/b6e8cdad93506447ff0ef99c1d719c9d6a630231`,
		lang: 'ruby',
		code: `module DiscoursePostEvent
  class EmailRenderer
    RECURRENCE_ORDINALS = %w[first second third fourth]
…
    def recurrence_context
      ref = recurrence_ref
      return {} if ref.nil?

      { weekday: ref.strftime("%A"), ordinal: recurrence_ordinal(ref) }
    end
…
    def recurrence_ordinal(ref)
      day_of_month = ref.mday
      days_in_month = Date.new(ref.year, ref.month, -1).day
      is_last = day_of_month + 7 > days_in_month
      key = is_last ? "last" : RECURRENCE_ORDINALS[(day_of_month / 7.0).ceil - 1]
      card_t("builder_modal.recurrence.ordinals.#{key}")
    end`,
		lines: [15],
		diff: `     def recurrence_ordinal(ref)
-      day_of_month = ref.mday
-      days_in_month = Date.new(ref.year, ref.month, -1).day
-      is_last = day_of_month + 7 > days_in_month
-      key = is_last ? "last" : RECURRENCE_ORDINALS[(day_of_month / 7.0).ceil - 1]
+      # Mirrors RRuleConfigurator: a fifth occurrence is expressed as "last",
+      # since not every month has one.
+      nth = (ref.mday / 7.0).ceil
+      key = nth == 5 ? "last" : RECURRENCE_ORDINALS[nth - 1]
       card_t("builder_modal.recurrence.ordinals.#{key}")`,
		notes: [
			'La ligne 15, `day_of_month + 7 > days_in_month`, vérifie s’il reste un autre jeudi plus loin dans le mois de départ. Pour le 26 février 2026, 26 + 7 = 33 dépasse 28, donc le code écrit "last". L’événement revient pourtant chaque mois, et le mot doit rester vrai dans chacun.',
			'Le 26 est le quatrième jeudi : `(26 / 7.0).ceil` vaut 4. En février 2026, les jeudis tombent les 5, 12, 19 et 26, donc le quatrième est aussi le dernier. En avril 2026, ils tombent les 2, 9, 16, 23 et 30, et « dernier » désigne le 30, une semaine après le quatrième.',
			'Le commit corrige le même test à trois endroits : ce texte d’e-mail, le libellé dans le navigateur, et `RRuleConfigurator`, qui construisait la règle de répétition. La pull request : "a monthly event created on a fourth weekday that was also the last one (ie. short months like February) in its month generated `BYDAY=-1`, moving the series to the fifth weekday in every month that had one."',
			'Le code corrigé tire la position du seul numéro du jour : du 1 au 7 le premier, du 22 au 28 le quatrième, du 29 au 31 le cinquième. Il n’écrit "last" que pour un cinquième, parce que certains mois n’ont pas de cinquième jeudi et que « dernier » trouve un jour dans chaque mois. Un nouveau test lance la règle depuis le 26 février 2026 et attend le 26 février, le 26 mars et le 23 avril.'
		]
	},
	quiz: [
		{
			q: 'Un événement commence le jeudi 26 février 2026. Quel texte le code bogué met-il dans l’e-mail ?',
			options: [
				'The fourth Thursday of every month',
				'The last Thursday of every month',
				'The fifth Thursday of every month',
				'The third Thursday of every month'
			],
			answer: 1,
			why: 'Février 2026 a 28 jours. 26 + 7 = 33 dépasse 28, donc `is_last` est vrai et la clé vaut "last".'
		},
		{
			q: 'La règle `BYDAY=-1TH` part du 26 février 2026. Quel jour tombe l’événement d’avril ?',
			options: ['Le 2 avril', 'Le 23 avril', 'Le 30 avril', 'Le 26 avril'],
			answer: 2,
			why: 'Avril 2026 a des jeudis les 2, 9, 16, 23 et 30. `-1` prend le dernier, le 30, au lieu du quatrième, le 23.'
		},
		{
			q: 'Quelle date de début un test de ce code doit-il essayer en premier ?',
			options: [
				'Un quatrième jour de semaine qui est aussi le dernier du mois',
				'Le premier jour d’un mois qui commence un lundi',
				'Une date d’année bissextile, comme le 29 février 2028',
				'Un événement qui commence à minuit UTC'
			],
			answer: 0,
			why: 'Seule cette date fait tomber « quatrième » et « dernier » le même jour dans le mois de départ, puis sur deux jours différents dans un mois qui compte cinq fois ce jour.'
		}
	],
	recall: {
		q: 'Un événement commence le jeudi 26 février 2026 et revient chaque mois. Pourquoi « dernier jeudi » est-il faux, et quand l’erreur apparaît-elle la première fois ?',
		a: 'Le 26 est le quatrième jeudi, et février 2026 n’en compte que quatre. Avril 2026 en compte cinq, donc « dernier » donne le 30 avril au lieu du 23.'
	},
	sources: [
		{ title: 'discourse, pull request #42852', url: `${DISCOURSE}/pull/42852` },
		{ title: 'Le commit du correctif, avec les trois fichiers modifiés', url: `${DISCOURSE}/commit/b6e8cdad93506447ff0ef99c1d719c9d6a630231` }
	]
};
