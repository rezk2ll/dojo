const PRETTIER = 'https://github.com/prettier/prettier';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'text-encoding',
	part: 'Les entrées',
	title: 'Le premier caractère invisible',
	minutes: 10,
	hook: [
		'Prettier sait formater une partie d’un fichier : tu passes `rangeStart` et `rangeEnd`, et il laisse le reste tranquille. Sur les fichiers qui commencent par un byte order mark, il formatait du code **hors de la plage**.',
		'Le changelog donne le cas. Le texte est un BOM, puis `foo = 1.0000;bar = 1.0000;`, avec `rangeStart: 1` et `rangeEnd: 13`. Seul `foo` devrait changer. Le résultat était `foo = 1.0;`, un retour à la ligne, puis **`bar = 1.0;`**.',
		'Avant de formater, Prettier retire le BOM et décale chaque offset reçu pour qu’il pointe toujours sur les mêmes caractères.'
	],
	terms: [
		{ term: 'BOM', def: 'Byte order mark : le caractère U+FEFF que certains éditeurs écrivent tout au début d’un fichier UTF-8. Il est invisible, mais compte pour un caractère dans une chaîne JavaScript.' },
		{ term: 'Offset', def: 'Une position dans le texte, comptée en caractères à partir de 0.' },
		{ term: 'Formatage de plage', def: 'Formater seulement le code entre `rangeStart` et `rangeEnd`, ce que les éditeurs utilisent pour « formater la sélection ».' }
	],
	bug: {
		title: 'Fix wrong range format on files with BOM (#8936)',
		repo: 'prettier/prettier',
		url: `${PRETTIER}/blob/69d26582e7be8177f754ed6a52170c9d9772a2bd/src/main/core.js#L283-L323`,
		fix: `${PRETTIER}/commit/6833310f87c597f0a204b06f2e84cb1b3b33ff54`,
		lang: 'javascript',
		code: `const hasUnicodeBOM = text.charAt(0) === BOM;
if (hasUnicodeBOM) {
  text = text.slice(1);
  if (hasCursor) {
    opts.cursorOffset++;
  }
  if (hasRangeStart) {
    opts.rangeStart++;
  }
  if (hasRangeEnd) {
    opts.rangeEnd++;
  }
}

if (!hasCursor) {
  opts.cursorOffset = -1;
}
if (opts.rangeStart < 0) {
  opts.rangeStart = 0;
}
if (opts.rangeEnd > text.length) {
  opts.rangeEnd = text.length;
}
…
if (hasUnicodeBOM) {
  result.formatted = BOM + result.formatted;

  if (hasCursor) {
    result.cursorOffset++;
  }
}`,
		lines: [5, 8, 11],
		diff: `     text = text.slice(1);
     if (hasCursor) {
-      opts.cursorOffset++;
+      opts.cursorOffset--;
     }
     if (hasRangeStart) {
-      opts.rangeStart++;
+      opts.rangeStart--;
     }
     if (hasRangeEnd) {
-      opts.rangeEnd++;
+      opts.rangeEnd--;
     }`,
		notes: [
			'**Les offsets bougent dans le mauvais sens.** `text.slice(1)` retire le premier caractère, donc tous les caractères suivants reculent d’une place. Un offset qui pointait sur `f` (indice 1) doit maintenant valoir 0. Le code ajoute 1 à la place, et la plage finit deux caractères trop à droite.',
			'**L’exemple du changelog, calculé.** Avec le BOM, `rangeStart: 1` et `rangeEnd: 13` couvrent `foo = 1.0000`. Après le slice, la bonne plage va de 0 à 12. Le code bogué donne 2 à 14, ce qui englobe le `;` et le `b` de `bar`. La plage touche alors la seconde instruction, et Prettier formate les deux : "the real range is wrongly calculated."',
			'**L’autre `++` est juste.** À la fin, le code remet le BOM avec `BOM + result.formatted`. Le texte grandit d’un caractère, donc `result.cursorOffset++` est correct à cet endroit. Retirer le BOM demande l’opération inverse, et le correctif passe les trois offsets en `--`.',
			'**Comment ça s’est vu.** La pull request dit : "Found this in #8811, turns out this is simple to fix." La pull request #8811 portait sur la couverture de tests. Le correctif ajoute des tests avec un BOM pour le curseur et pour une plage.'
		]
	},
	quiz: [
		{
			q: 'Le texte commence par un BOM et `rangeStart` vaut 1, sur le `f`. Après `text.slice(1)`, que doit valoir `rangeStart` ?',
			options: ['0, un de moins, car tout a reculé d’une place', '1, inchangé, car le BOM est invisible', '2, un de plus, pour sauter le BOM', '-1, pour que le BOM entre dans la plage'],
			answer: 0,
			why: 'Retirer le premier caractère fait passer `f` de l’indice 1 à l’indice 0. L’offset doit le suivre, donc il baisse de un.'
		},
		{
			q: 'Pourquoi le formatage normal d’un fichier entier avec un BOM restait-il correct ?',
			options: [
				'Le BOM était retiré avant la lecture de tout offset',
				'Sans plage ni curseur, aucun offset n’était décalé',
				'Prettier refuse de formater les fichiers qui commencent par un BOM',
				'Le parseur ignore le premier caractère de chaque fichier'
			],
			answer: 1,
			why: 'Les trois lignes `++` ne s’exécutent que si un curseur ou une plage a été passé. Un formatage simple du fichier entier n’utilise jamais ces offsets.'
		},
		{
			q: 'Tu retires un préfixe d’un texte avant de le traiter, et tu gardes des offsets dans ce texte. Que doit vérifier un test ?',
			options: [
				'Que le préfixe est bien remis à la fin de la sortie',
				'Qu’un fichier sans préfixe donne la même sortie qu’avant',
				'Qu’une plage sur le premier mot après le préfixe ne couvre que ce mot',
				'Qu’un très gros fichier avec préfixe reste assez rapide'
			],
			answer: 2,
			why: 'Un offset décalé dans le mauvais sens se voit comme une plage qui déborde sur le mot ou l’instruction suivante. Une plage sur le premier mot le montre tout de suite.'
		}
	],
	takeaway: 'Quand tu retires des caractères au début d’un texte, chaque offset dans ce texte doit baisser d’autant. Teste les options de plage ou de curseur sur un fichier qui commence par un BOM.',
	sources: [
		{ title: 'prettier, pull request #8936', url: `${PRETTIER}/pull/8936` },
		{ title: 'L’entrée du changelog pour #8936', url: `${PRETTIER}/blob/6833310f87c597f0a204b06f2e84cb1b3b33ff54/changelog_unreleased/api/pr-8936.md` }
	]
};
