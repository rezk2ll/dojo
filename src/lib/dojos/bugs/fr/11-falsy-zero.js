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
			'La ligne 14 teste `if (explicitTimeout)`. Le type est `number | null`, et `null` veut dire « pas de durée donnée ». Ce `if` vérifie que la valeur est truthy, au lieu de vérifier qu’elle n’est pas `null`. 0 est falsy, donc Vue traite une durée de 0 comme une durée absente.',
			'`normalizeDuration(0)` renvoie `[0, 0]`, donc `explicitTimeout` vaut 0. La ligne 14 saute le minuteur, et la ligne 18 appelle `getTransitionInfo`. Si l’élément a une transition CSS de 300 ms, Vue l’attend, et l’animation joue comme sans `duration`.',
			'La ligne 14 teste maintenant `explicitTimeout != null`, qui n’est faux que pour `null` et `undefined`. Avec 0, Vue prend le minuteur de la ligne 15 : `setTimeout(resolveIfNotStale, 0)` se résout presque aussitôt, et Vue ne lit jamais la durée CSS.',
			'`:duration="500"` ou `{ enter: 200, leave: 400 }` donnaient des nombres non nuls, donc truthy, et passaient toujours par le minuteur. Seul 0 partait dans la branche CSS.'
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
	recall: {
		q: 'Pourquoi `<Transition :duration="0">` attendait-il quand même la transition CSS ?',
		a: '`if (explicitTimeout)` traite 0 comme falsy : Vue sautait le minuteur et lisait la durée CSS avec `getTransitionInfo`. Le correctif teste `explicitTimeout != null`, qui laisse passer 0.'
	},
	sources: [
		{ title: 'vue, pull request #11967', url: `${VUE}/pull/11967` }
	]
};
