const VUE = 'https://github.com/vuejs/core';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'falsy-zero',
	part: 'Les entrées',
	title: 'Une durée de 0 qui animait quand même',
	minutes: 10,
	hook: [
		'Une app Vue entoure un élément de `<Transition :duration="0">`. La pull request du correctif décrit ce qui était attendu : "when the `duration` is set to `0`, no animations should be executed" (avec 0, aucune animation ne doit tourner). L’animation tournait quand même.',
		'`duration` est optionnel. Sans lui, Vue lit la durée de la transition CSS de l’élément et attend la fin de la transition. Avec lui, Vue lance plutôt un minuteur de ce nombre de millisecondes. La fonction ci-dessous choisit entre les deux.'
	],
	terms: [
		{ term: 'Falsy', def: 'Une valeur que `if` traite comme fausse : `0`, `""`, `NaN`, `null`, `undefined` et `false`.' },
		{ term: 'explicitTimeout', def: 'La prop `duration` sous forme de nombre, ou `null` quand le composant n’a pas de `duration`.' },
		{ term: 'getTransitionInfo', def: 'Lit la transition ou l’animation CSS de l’élément et renvoie son type et sa durée totale.' }
	],
	bug: {
		title: 'fix(transition): respect `duration` setting even when it is `0` (#11967)',
		repo: 'vuejs/core',
		url: `${VUE}/blob/a2f6edeb02faedbb673c4bc5c6a59d9a79a37d07/packages/runtime-dom/src/components/Transition.ts#L334-L354`,
		fix: `${VUE}/commit/f927a4ae6f7c453f70ba89498ee0c737dc9866fd`,
		lang: 'typescript',
		code: `function whenTransitionEnds(
  el: Element & { _endId?: number },
  expectedType: TransitionProps['type'] | undefined,
  explicitTimeout: number | null,
  resolve: () => void,
) {
  const id = (el._endId = ++endId)
  const resolveIfNotStale = () => {
    if (id === el._endId) {
      resolve()
    }
  }

  if (explicitTimeout) {
    return setTimeout(resolveIfNotStale, explicitTimeout)
  }

  const { type, timeout, propCount } = getTransitionInfo(el, expectedType)
  if (!type) {
    return resolve()
  }`,
		lines: [14],
		diff: `   }

-  if (explicitTimeout) {
+  if (explicitTimeout != null) {
     return setTimeout(resolveIfNotStale, explicitTimeout)
   }`,
		notes: [
			'**`if` pose la mauvaise question.** Le type dit `number | null`. `null` veut dire « pas de durée donnée ». Le test devrait demander « est-ce null ? », mais `if (explicitTimeout)` demande « est-ce truthy ? ». 0 est falsy, donc une durée de 0 est traitée comme une absence de durée.',
			'**Ce qui se passe avec 0.** `normalizeDuration(0)` renvoie `[0, 0]`, donc `explicitTimeout` vaut 0. Le `if` est sauté, et le code passe à `getTransitionInfo`. Si l’élément a une transition CSS de 300 ms, Vue l’attend, et l’animation joue comme si `duration` n’avait jamais été donné.',
			'**Le correctif.** `explicitTimeout != null` n’est faux que pour `null` et `undefined`. Une durée de 0 prend maintenant la branche du minuteur : `setTimeout(resolveIfNotStale, 0)` se résout presque tout de suite, et la durée CSS n’est jamais lue.',
			'**Les autres valeurs marchaient.** `:duration="500"` ou `{ enter: 200, leave: 400 }` donnaient des nombres non nuls, donc truthy. Seul 0 tombait dans la mauvaise branche.'
		]
	},
	quiz: [
		{
			q: 'Le composant est `<Transition :duration="0">` et l’élément a une transition CSS de 300 ms. Combien de temps le code bogué attend-il ?',
			options: ['0 ms, le minuteur part tout de suite', 'Environ 300 ms, la durée CSS', '1 ms, le délai minimal d’un minuteur', 'Toujours, resolve n’est jamais appelé'],
			answer: 1,
			why: 'explicitTimeout vaut 0, qui est falsy, donc la branche du minuteur est sautée. getTransitionInfo lit ensuite la transition CSS de 300 ms et Vue l’attend.'
		},
		{
			q: 'Quelles valeurs de `explicitTimeout` prenaient la mauvaise branche ?',
			options: ['Seulement 0', 'Toute valeur sous 100', 'Seulement null', 'Tout objet passé en durée'],
			answer: 0,
			why: 'La valeur est un nombre ou null. 0 est la seule durée utilisable qui soit falsy. null prenait la branche CSS, ce qui est le bon comportement.'
		},
		{
			q: 'Un réglage est `number | null`, où null veut dire « pas réglé ». Quel test garde 0 comme une vraie valeur ?',
			options: ['if (value)', 'if (value != null)', 'if (value > 0)', 'if (!!value === true)'],
			answer: 1,
			why: '`!= null` n’est faux que pour null et undefined. Les trois autres traitent tous 0 comme une absence de valeur.'
		}
	],
	takeaway: 'Quand 0 est une valeur valable pour un réglage, teste « pas réglé » avec `!= null` ou `??`, pas avec `if (x)` ou `x || défaut`. Ajoute un test qui passe 0 exprès.',
	sources: [
		{ title: 'vue, pull request #11967', url: `${VUE}/pull/11967` }
	]
};
