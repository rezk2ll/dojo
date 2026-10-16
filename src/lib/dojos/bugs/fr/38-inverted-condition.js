const RUBY = 'https://github.com/ruby/ruby';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'inverted-condition',
	part: 'La logique',
	title: 'Des hashs jamais libérés',
	minutes: 10,
	hook: [
		'Un petit script sur la branche master de Ruby crée 100 000 hashs de 9 entrées, les abandonne, puis appelle `GC.start`. Il le fait 10 fois et affiche la mémoire du processus à chaque tour. Les nombres montent : **58816, 97056, 135296, ... 403088 Ko**. Les hashs ont disparu, pas leur mémoire.',
		'Le ramasse-miettes a un chemin rapide pour les objets morts qui ne possèdent aucune mémoire en plus : il libère la case et saute le nettoyage complet. La fonction ci-dessous décide quels objets peuvent le prendre.'
	],
	terms: [
		{ term: 'Sweep', def: 'La phase du ramasse-miettes qui parcourt les objets morts et les libère.' },
		{ term: 'Bit de flag', def: 'Un bit de l’en-tête de l’objet qui note un fait sur lui, testé avec `flags & SOME_FLAG`.' },
		{ term: 'st_table', def: 'La table de hachage que Ruby utilise pour les gros hashs. Ses entrées vivent dans de la mémoire allouée avec malloc, hors de l’objet.' },
		{ term: 'Embarqué', def: 'Un objet dont les données tiennent dans sa propre case, donc il n’y a rien d’autre à libérer.' }
	],
	bug: {
		title: 'Fix memory leak when sweeping hashes with st_table',
		repo: 'ruby/ruby',
		url: `${RUBY}/blob/7a4de4748a11c380323d9c5f52b7f9d44b5d2f6b/gc.c#L1396-L1466`,
		fix: `${RUBY}/commit/120c8fa88c222636f5e292224d3c8fba0ef254a8`,
		lang: 'c',
		code: `/*
 * Returns true if the object requires a full rb_gc_obj_free() call during sweep,
 * false if it can be freed quickly without calling destructors or cleanup.
…
 */
bool
rb_gc_obj_needs_cleanup_p(VALUE obj)
{
    VALUE flags = RBASIC(obj)->flags;

    if (flags & FL_FINALIZE) return true;
…
    switch (flags & RUBY_T_MASK) {
…
      case T_STRING:
        return (flags & (RSTRING_NOEMBED | RSTRING_FSTR));

      case T_ARRAY:
        return !(flags & RARRAY_EMBED_FLAG);

      case T_HASH:
        return !(flags & RHASH_ST_TABLE_FLAG);
…
      case T_BIGNUM:
        return !(flags & BIGNUM_EMBED_FLAG);
…
    }`,
		lines: [22],
		diff: `       case T_HASH:
-        return !(flags & RHASH_ST_TABLE_FLAG);
+        return (flags & RHASH_ST_TABLE_FLAG);`,
		notes: [
			'**Le `!` va avec la ligne du dessus, pas avec celle-ci.** Pour les tableaux, le flag veut dire « embarqué », donc un tableau a besoin de nettoyage quand le flag n’est **pas** posé : `!(flags & RARRAY_EMBED_FLAG)`. Pour les hashs, le flag dit l’inverse : `RHASH_ST_TABLE_FLAG` est posé quand le hash a une st_table hors de l’objet. Ce hash a besoin de nettoyage quand le flag **est** posé.',
			'**Où ça casse.** Le script de la pull request le dit : "Hashes with more than 8 elements use st_table with a malloc\'d entries array" (au-delà de 8 éléments, le hash passe sur une st_table). Un hash de 9 entrées a le flag posé, donc `!(flags & ...)` est faux. Le sweep prend le chemin rapide, n’appelle jamais `rb_gc_obj_free()`, et le tableau d’entrées n’est jamais libéré. Chaque tour de 100 000 hashs ajoutait environ 38 Mo.',
			'**Le correctif.** Sans le `!`, les hashs avec une st_table passent par le nettoyage complet. Les petits hashs, qui gardent leurs entrées dans l’objet, prennent maintenant le chemin rapide, que le commentaire au-dessus de la fonction réserve aux objets libérés "without calling destructors or cleanup".',
			'**Comment ça s’est vu.** La pull request [#18096](' + RUBY + '/pull/18096) donne le script et les chiffres. Après le correctif, les mêmes 10 tours affichent 27696 Ko à chaque fois.'
		]
	},
	quiz: [
		{
			q: 'Un hash de 9 entrées meurt. Que renvoie la fonction boguée pour lui ?',
			options: [
				'true, donc la libération complète a lieu',
				'false, donc sa st_table n’est jamais libérée',
				'true, parce que FL_FINALIZE est posé',
				'false, parce que les hashs sont toujours embarqués'
			],
			answer: 1,
			why: 'Avec 9 entrées, le hash utilise une st_table, donc le flag est posé. `!(flags & RHASH_ST_TABLE_FLAG)` est alors faux, et le sweep saute le nettoyage.'
		},
		{
			q: 'Pourquoi le `!` est-il juste pour `T_ARRAY` et faux pour `T_HASH` ?',
			options: [
				'Le flag du tableau dit embarqué, celui du hash dit externe',
				'Les tableaux passent par un finaliseur, jamais les hashs',
				'Les objets `T_HASH` sont balayés avant les `T_ARRAY`',
				'`RHASH_ST_TABLE_FLAG` vaut zéro sur la plupart des plateformes'
			],
			answer: 0,
			why: 'Les deux lignes demandent « cet objet possède-t-il de la mémoire hors de sa case ? ». Pour les tableaux, c’est l’absence d’un flag, pour les hashs, sa présence.'
		},
		{
			q: 'Quelle vérification aurait attrapé le bug avant la fusion ?',
			options: [
				'Suivre la mémoire en créant et jetant de gros hashs en boucle',
				'Lancer tous les tests avec un tas mémoire plus petit',
				'Compter les appels à rb_gc_obj_free pour les petites chaînes',
				'Vérifier que GC.start rend la main sans erreur'
			],
			answer: 0,
			why: 'La fuite ne lève aucune erreur et ne fausse aucun résultat. Seule la mémoire du processus la montre, comme le fait le script de la pull request.'
		}
	],
	takeaway: 'Quand tu recopies le test de flag de la ligne du dessus, vérifie ce que le flag veut dire ici : « est embarqué » et « a des données externes » demandent des signes opposés. Un test de fuite suit la mémoire sur beaucoup de tours, puisque rien n’échoue.',
	sources: [
		{ title: 'ruby, pull request #18096', url: `${RUBY}/pull/18096` }
	]
};
