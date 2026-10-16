const DISCOURSE = 'https://github.com/discourse/discourse';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'float-money',
	part: 'Counting',
	title: 'A price of 19.99 that Stripe refused',
	minutes: 10,
	hook: [
		'A Discourse admin sets up a paid subscription plan at **$19.99**. Saving it fails. Stripe, the payment provider, answers **"Invalid integer 1998.9999999999998"**.',
		'Stripe takes prices in cents, as a whole number. The admin types dollars into a form, and a small model class turns them into cents before the plan is sent. The existing test used $22.12 and passed.'
	],
	terms: [
		{ term: 'Cents', def: 'The smallest unit of the price. Stripe wants `unit_amount` as a whole number of cents: $19.99 is 1999.' },
		{ term: 'Floating point', def: 'How JavaScript stores every number: in binary, with about 16 significant digits. Most decimal fractions, like 0.99, have no exact binary value.' },
		{ term: 'Setter', def: 'A `set name(value)` method. It runs when code assigns `plan.amountDollars = ...`.' }
	],
	bug: {
		title: 'FIX: Round dollar-to-cents conversion in subscription plans (#37877)',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/blob/63cfdcb7b7b8ba58d5b599555b6ff412c0535465/plugins/discourse-subscriptions/assets/javascripts/discourse/models/plan.js#L4-L13`,
		fix: `${DISCOURSE}/commit/77cd806b8177f1974ffe5d2230d26bbe9535018e`,
		lang: 'javascript',
		code: `export default class Plan extends EmberObject {
  @computed("unit_amount")
  get amountDollars() {
    return parseFloat(this.get("unit_amount") / 100).toFixed(2);
  }

  set amountDollars(value) {
    const decimal = parseFloat(value) * 100;
    this.set("unit_amount", decimal);
  }`,
		lines: [8],
		diff: `   set amountDollars(value) {
-    const decimal = parseFloat(value) * 100;
+    const decimal = Math.round(parseFloat(value) * 100);
     this.set("unit_amount", decimal);
   }`,
		notes: [
			'**Multiplying by 100 is not exact.** `parseFloat("19.99")` is the closest binary number to 19.99, which is a little below it. Times 100, that gives **1998.9999999999998**, not 1999. The commit says it: "Due to IEEE-754 floating point arithmetic, `parseFloat(\"19.99\") * 100` produces `1998.9999999999998` instead of `1999`."',
			'**Which prices break.** It depends on the value. 22.12 times 100 gives exactly 2212, which is why the old test passed. 19.99 gives 1998.9999999999998, 4.35 gives 434.99999999999994 and 1.15 gives 114.99999999999999.',
			'**The getter hides it.** Reading the price back divides by 100 and calls `toFixed(2)`, which rounds. 1998.9999999999998 / 100 shows as "19.99", so the form looks right. Only Stripe, which checks for a whole number, sees the problem.',
			'**The fix.** `Math.round(parseFloat(value) * 100)` snaps the result to the nearest whole cent. The error is far smaller than half a cent, so rounding always lands on the cent the admin typed. The fix adds a test with "19.99" that expects 1999.',
			'**How it was found.** The commit links a report on Discourse Meta ([topic 393466](https://meta.discourse.org/t/393466)): "Setting a subscription price like $19.99 would fail with \"Invalid integer 1998.9999999999998\" from the Stripe API."'
		]
	},
	quiz: [
		{
			q: 'The admin types "19.99". What does the buggy setter store in `unit_amount`?',
			options: ['1999, the exact price in cents', '1998.9999999999998, just under', '1998, one cent short', '19.99, the dollars left unchanged'],
			answer: 1,
			why: '19.99 has no exact binary value. The stored double is slightly below 19.99, and multiplying by 100 keeps that error: 1998.9999999999998.'
		},
		{
			q: 'Why did the existing test with "22.12" pass?',
			options: [
				'22.12 times 100 happens to give exactly 2212',
				'The test compared the values with a tolerance',
				'The test read the price back through the getter',
				'parseFloat rounds values that have two decimals'
			],
			answer: 0,
			why: 'Some decimal values come out exact after the multiplication and some do not. 22.12 is one of the lucky ones, so the test never hit the case.'
		},
		{
			q: 'You convert a decimal amount typed by a user into integer cents. What should the code do?',
			options: [
				'Multiply by 100 and keep the result as it is',
				'Multiply by 100, then round to the nearest integer',
				'Multiply by 100, then truncate with Math.floor',
				'Compare the result with 1999 using ==='
			],
			answer: 1,
			why: 'Math.floor would turn 1998.9999999999998 into 1998 and lose a cent. Rounding to the nearest integer gives 1999, because the float error is much smaller than 0.5.'
		}
	],
	takeaway: 'When you turn a decimal amount into integer cents, round the product with Math.round, or parse the string into cents without going through a float. Test with values like 19.99, 4.35 and 1.15, not only with ones that come out exact.',
	sources: [
		{ title: 'discourse pull request #37877', url: `${DISCOURSE}/pull/37877` },
		{ title: 'The report on Discourse Meta', url: 'https://meta.discourse.org/t/393466' }
	]
};
