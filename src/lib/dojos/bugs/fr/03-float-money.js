const DISCOURSE = 'https://github.com/discourse/discourse';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'float-money',
	part: 'Compter',
	title: 'Erreur de virgule flottante dans la conversion des dollars en centimes',
	minutes: 10,
	hook: [
		'Un admin Discourse crée un abonnement payant à 19,99 $. L’enregistrement échoue. Stripe, le prestataire de paiement, répond **"Invalid integer 1998.9999999999998"**.',
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
			'À la ligne 8, `parseFloat("19.99")` renvoie le nombre binaire le plus proche de 19,99, un peu en dessous. Multiplié par 100, il donne **1998.9999999999998** au lieu de 1999. Le commit : "Due to IEEE-754 floating point arithmetic, `parseFloat(\"19.99\") * 100` produces `1998.9999999999998` instead of `1999`."',
			'22,12 fois 100 donne exactement 2212 : voilà pourquoi l’ancien test passait. 19,99 donne 1998.9999999999998, 4,35 donne 434.99999999999994 et 1,15 donne 114.99999999999999.',
			'Le getter de la ligne 4 divise par 100 et appelle `toFixed(2)`, qui arrondit. 1998.9999999999998 / 100 s’affiche "19.99", donc le formulaire montre le prix saisi. Seul Stripe vérifie qu’il reçoit un entier, donc seul Stripe refuse le montant.',
			'La ligne 8 appelle maintenant `Math.round(parseFloat(value) * 100)`, qui donne le centime entier le plus proche. L’erreur du flottant reste bien sous le demi-centime, donc l’arrondi tombe toujours sur le centime saisi. Le correctif ajoute un test avec "19.99" qui attend 1999.',
			'Le commit renvoie à un signalement sur Discourse Meta ([sujet 393466](https://meta.discourse.org/t/393466)) : "Setting a subscription price like $19.99 would fail with \"Invalid integer 1998.9999999999998\" from the Stripe API."'
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
	recall: {
		q: 'Que donne `parseFloat("19.99") * 100`, et qu’est-ce qui ramène le résultat à 1999 ?',
		a: '1998.9999999999998, car 19,99 n’a pas de valeur binaire exacte. `Math.round` donne 1999, puisque l’erreur reste bien sous le demi-centime.'
	},
	sources: [
		{ title: 'discourse, pull request #37877', url: `${DISCOURSE}/pull/37877` },
		{ title: 'Le signalement sur Discourse Meta', url: 'https://meta.discourse.org/t/393466' }
	]
};
