const VITE = 'https://github.com/vitejs/vite';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'negative-slice',
	part: 'Compter',
	title: 'Une colonne de trop',
	minutes: 10,
	hook: [
		'Une bêta de Vite sort, et certains projets ne buildent plus. Le plugin HTML plante avec **"end must be greater than start"**. Rien n’a changé dans ces projets.',
		'Le nouveau code retirait les espaces autour des balises de `index.html`. Pour ça, il remontait de chaque balise jusqu’au début de sa ligne. Dans certains fichiers, ce début tombait **un caractère avant le début du fichier**.'
	],
	terms: [
		{ term: 'Offset', def: 'Une position dans tout le fichier, comptée en caractères à partir de 0.' },
		{ term: 'Colonne', def: 'Une position dans une ligne. Le parseur HTML qu’utilise Vite compte les colonnes à partir de 1.' },
		{ term: 'Off-by-one', def: 'Un compte faux d’exactement un, souvent parce qu’une valeur part de 0 et l’autre de 1.' }
	],
	bug: {
		title: 'fix: off-by-one bug in HTML whitespace removal',
		repo: 'vitejs/vite',
		url: `${VITE}/blob/0a38e3b395d1e705321f6f18690acde5f0fc378c/packages/vite/src/node/plugins/html.ts#L326-L342`,
		fix: `${VITE}/commit/f54e6d8dad6daeaede55d6363ed7f1cf6899f914`,
		lang: 'typescript',
		code: `// Determines true start position for the node, either the < character
// position, or the newline at the end of the previous line's node.
const nodeStartWithLeadingWhitespace = (
  node: DefaultTreeAdapterMap['node'],
) => {
  if (node.sourceCodeLocation!.startOffset === 0)
    return node.sourceCodeLocation!.startOffset

  // Gets the offset for the start of the line including the
  // newline trailing the previous node
  const lineStartOffset =
    node.sourceCodeLocation!.startOffset -
    node.sourceCodeLocation!.startCol
  const line = s.slice(
    lineStartOffset,
    node.sourceCodeLocation!.startOffset,
  )`,
		lines: [15],
		diff: `           const line = s.slice(
-            lineStartOffset,
+            Math.max(0, lineStartOffset),
             node.sourceCodeLocation!.startOffset,
           )`,
		notes: [
			'**Deux comptes qui ne partent pas du même endroit.** `startOffset` compte à partir de 0, `startCol` à partir de 1. La pull request le dit : "`startCol` is 1-indexed, while `startOffset` is 0 indexed."',
			'**Où ça casse.** Prends une balise sur la première ligne du fichier, en colonne 3. Son offset vaut 2. Le code calcule 2 moins 3, soit **-1**, et le passe à `s.slice`. Sur les lignes suivantes, le résultat tombe sur le retour à la ligne d’avant, ce que veut le commentaire. Seule la première ligne n’a pas de retour à la ligne avant elle.',
			'**Le correctif.** `Math.max(0, lineStartOffset)` ne descend jamais sous le début du fichier. Le `return` du dessus gérait déjà une balise à l’offset 0, mais pas une balise plus loin sur la première ligne.',
			'**Comment ça s’est vu.** Un utilisateur a signalé le plantage sur la pull request qui avait ajouté ce code ([commentaire](' + VITE + '/pull/14274#issuecomment-1758742149)) : "[vite:build-html] end must be greater than start".'
		]
	},
	quiz: [
		{
			q: 'Une balise est sur la première ligne du fichier, en colonne 3. Que vaut `lineStartOffset` dans le code bogué ?',
			options: ['0, le début du fichier', '-1, un avant le début du fichier', '2, l’offset de la balise elle-même', '3, la colonne de la balise'],
			answer: 1,
			why: 'Son offset vaut 2 (compté à partir de 0) et sa colonne 3 (comptée à partir de 1). 2 moins 3 donne -1.'
		},
		{
			q: 'Pourquoi le `return` pour `startOffset === 0` n’a-t-il pas empêché le plantage ?',
			options: [
				'Il ne couvre qu’une balise sur le tout premier caractère',
				'Il s’exécute après le slice, donc il arrive trop tard',
				'Il compare la colonne de la balise, pas son offset',
				'Il est sauté quand le fichier commence par un doctype'
			],
			answer: 0,
			why: 'L’offset 0, c’est le premier caractère. Une balise plus loin sur la première ligne a un offset au-dessus de 0 : elle passe le test et obtient quand même -1.'
		},
		{
			q: 'Tu mélanges une valeur comptée à partir de 0 et une autre à partir de 1. Quelle entrée tester en premier ?',
			options: [
				'Un très long fichier, pour voir la vitesse du plugin',
				'Quelque chose sur la première ligne, après son premier caractère',
				'Un fichier enregistré avec des fins de ligne Windows (CRLF)',
				'Quelque chose sur la dernière ligne, sans retour à la ligne après'
			],
			answer: 1,
			why: 'La première ligne n’a rien avant elle, donc un résultat trop petit d’un sort du fichier. Sur les lignes suivantes, l’erreur passe inaperçue parce que le caractère d’avant existe.'
		}
	],
	takeaway: 'Quand tu soustrais une colonne comptée à partir de 1 d’un offset compté à partir de 0, la première ligne du fichier donne -1. Borne le résultat, ou ramène les deux valeurs à la même base d’abord.',
	sources: [
		{ title: 'vite, pull request #14589', url: `${VITE}/pull/14589` },
		{ title: 'Le signalement sur la pull request #14274', url: `${VITE}/pull/14274#issuecomment-1758742149` }
	]
};
