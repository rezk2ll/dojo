const VUE = 'https://github.com/vuejs/core';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'falsy-zero',
	part: 'Inputs',
	title: 'A duration of 0 that still animated',
	minutes: 10,
	hook: [
		'A Vue app wraps an element in `<Transition :duration="0">`. The pull request that fixed it describes what was expected: "when the `duration` is set to `0`, no animations should be executed". The animation still ran.',
		'`duration` is optional. Without it, Vue reads the CSS transition time of the element and waits for the transition to end. With it, Vue sets a timer for that many milliseconds instead. The function below picks between the two.'
	],
	terms: [
		{ term: 'Falsy', def: 'A value that `if` treats as false: `0`, `""`, `NaN`, `null`, `undefined` and `false`.' },
		{ term: 'explicitTimeout', def: 'The `duration` prop as a number, or `null` when the component has no `duration`.' },
		{ term: 'getTransitionInfo', def: 'Reads the CSS transition or animation of the element and returns its type and its total time.' }
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
			'**`if` asks the wrong question.** The type says `number | null`. `null` means "no duration given". The check should ask "is it null?", but `if (explicitTimeout)` asks "is it truthy?". 0 is falsy, so a duration of 0 is treated like no duration at all.',
			'**What happens with 0.** `normalizeDuration(0)` returns `[0, 0]`, so `explicitTimeout` is 0. The `if` is skipped, and the code goes on to `getTransitionInfo`. If the element has a CSS transition of 300ms, Vue waits for it, and the animation plays as if `duration` was never set.',
			'**The fix.** `explicitTimeout != null` is false only for `null` and `undefined`. A duration of 0 now takes the timer branch: `setTimeout(resolveIfNotStale, 0)` resolves almost at once, and the CSS timing is never read.',
			'**Other values were fine.** `:duration="500"` or `{ enter: 200, leave: 400 }` gave non-zero numbers, which are truthy. Only 0 hit the wrong branch.'
		]
	},
	quiz: [
		{
			q: 'The component is `<Transition :duration="0">` and the element has a 300ms CSS transition. How long does the buggy code wait?',
			options: ['0ms, the timer fires at once', 'About 300ms, the CSS time', '1ms, the minimum timer delay', 'Forever, resolve is never called'],
			answer: 1,
			why: 'explicitTimeout is 0, which is falsy, so the timer branch is skipped. getTransitionInfo then reads the 300ms CSS transition and Vue waits for it.'
		},
		{
			q: 'Which values of `explicitTimeout` took the wrong branch?',
			options: ['Only 0', 'Every value under 100', 'Only null', 'Any object passed as duration'],
			answer: 0,
			why: 'The value is a number or null. 0 is the only usable duration that is falsy. null took the CSS branch, which is what it should do.'
		},
		{
			q: 'A setting is `number | null`, where null means "not set". Which check keeps 0 as a real value?',
			options: ['if (value)', 'if (value != null)', 'if (value > 0)', 'if (!!value === true)'],
			answer: 1,
			why: '`!= null` is false for null and undefined only. The other three all treat 0 as missing.'
		}
	],
	takeaway: 'When 0 is a valid value for a setting, test for "not set" with `!= null` or `??`, not with `if (x)` or `x || default`. Add a test that passes 0 on purpose.',
	sources: [
		{ title: 'vue pull request #11967', url: `${VUE}/pull/11967` }
	]
};
