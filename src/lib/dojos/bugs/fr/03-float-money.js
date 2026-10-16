const DISCOURSE = 'https://github.com/discourse/discourse';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'float-money',
	part: 'Compter',
	title: 'Un prix de 19,99 refusé par Stripe',
	minutes: 10,
	hook: [
		'Un admin Discourse crée un abonnement payant à **19,99 $**. L’enregistrement échoue. Stripe, le prestataire de paiement, répond **"Invalid integer 1998.9999999999998"**.',
		'Stripe prend les prix en centimes, sous forme de nombre entier. L’admin saisit des dollars dans un formulaire, et une petite classe modèle les convertit en centimes avant l’envoi. Le test existant utilisait 22,12 $ et passait.'
	],
	terms: [
		{ term: 'Centimes', def: 'La plus petite unité du prix. Stripe veut `unit_amount` en nombre entier de centimes : 19,99 $ donne 1999.' },
		{ term: 'Virgule flottante', def: 'La façon dont JavaScript stocke tous les nombres : en binaire, avec environ 16 chiffres significatifs. La plupart des fractions décimales, comme 0,99, n’ont pas de valeur binaire exacte.' },
		{ term: 'Setter', def: 'Une méthode `set nom(valeur)`. Elle s’exécute quand le code écrit `plan.amountDollars = ...`.' }
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
			'**Multiplier par 100 n’est pas exact.** `parseFloat("19.99")` donne le nombre binaire le plus proche de 19,99, qui est un peu en dessous. Multiplié par 100, ça donne **1998.9999999999998**, pas 1999. Le commit le dit : "Due to IEEE-754 floating point arithmetic, `parseFloat(\"19.99\") * 100` produces `1998.9999999999998` instead of `1999`."',
			'**Quels prix cassent.** Ça dépend de la valeur. 22,12 fois 100 donne exactement 2212, c’est pour ça que l’ancien test passait. 19,99 donne 1998.9999999999998, 4,35 donne 434.99999999999994 et 1,15 donne 114.99999999999999.',
			'**Le getter masque le problème.** Relire le prix divise par 100 et appelle `toFixed(2)`, qui arrondit. 1998.9999999999998 / 100 s’affiche "19.99", donc le formulaire a l’air juste. Seul Stripe, qui vérifie qu’il reçoit un entier, voit l’erreur.',
			'**Le correctif.** `Math.round(parseFloat(value) * 100)` ramène le résultat au centime entier le plus proche. L’erreur est bien plus petite qu’un demi-centime, donc l’arrondi tombe toujours sur le centime saisi. Le correctif ajoute un test avec "19.99" qui attend 1999.',
			'**Comment ça s’est vu.** Le commit renvoie à un signalement sur Discourse Meta ([sujet 393466](https://meta.discourse.org/t/393466)) : "Setting a subscription price like $19.99 would fail with \"Invalid integer 1998.9999999999998\" from the Stripe API."'
		]
	},
	quiz: [
		{
			q: 'L’admin saisit "19.99". Que stocke le setter bogué dans `unit_amount` ?',
			options: ['1999, le prix exact en centimes', '1998.9999999999998, juste en dessous', '1998, un centime de moins', '19.99, les dollars tels quels'],
			answer: 1,
			why: '19,99 n’a pas de valeur binaire exacte. Le double stocké est un peu sous 19,99, et la multiplication par 100 garde cette erreur : 1998.9999999999998.'
		},
		{
			q: 'Pourquoi le test existant avec "22.12" passait-il ?',
			options: [
				'22,12 fois 100 donne par chance exactement 2212',
				'Le test comparait les valeurs avec une tolérance',
				'Le test relisait le prix à travers le getter',
				'parseFloat arrondit les valeurs à deux décimales'
			],
			answer: 0,
			why: 'Certaines valeurs décimales tombent juste après la multiplication, d’autres non. 22,12 fait partie des chanceuses, donc le test ne touchait jamais le cas.'
		},
		{
			q: 'Tu convertis un montant décimal saisi par un utilisateur en centimes entiers. Que doit faire le code ?',
			options: [
				'Multiplier par 100 et garder le résultat tel quel',
				'Multiplier par 100, puis arrondir à l’entier le plus proche',
				'Multiplier par 100, puis tronquer avec Math.floor',
				'Comparer le résultat à 1999 avec ==='
			],
			answer: 1,
			why: 'Math.floor transformerait 1998.9999999999998 en 1998 et perdrait un centime. Arrondir à l’entier le plus proche donne 1999, parce que l’erreur du flottant est bien plus petite que 0,5.'
		}
	],
	takeaway: 'Quand tu convertis un montant décimal en centimes entiers, arrondis le produit avec Math.round, ou parse la chaîne directement en centimes sans passer par un flottant. Teste avec des valeurs comme 19,99, 4,35 et 1,15, pas seulement avec celles qui tombent juste.',
	sources: [
		{ title: 'discourse, pull request #37877', url: `${DISCOURSE}/pull/37877` },
		{ title: 'Le signalement sur Discourse Meta', url: 'https://meta.discourse.org/t/393466' }
	]
};
