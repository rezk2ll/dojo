const FFMPEG = 'https://github.com/FFmpeg/FFmpeg';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'negative-modulo',
	part: 'Compter',
	title: 'Un reste de zéro',
	minutes: 10,
	hook: [
		'Le filtre `xfade` de FFmpeg enchaîne deux vidéos avec une transition. Avec les transitions de type slide, la toute première image de la transition **lisait au-delà de la fin des données de l’image**. Le commit le dit : "reading past the plane" (lecture hors du plan).',
		'Le glissement décale chaque position de `z`. Sur la première image, `z` vaut moins la largeur de l’image, puis remonte vers 0 au fil de la transition. Les positions qui deviennent négatives sont ramenées dans la ligne avec `%`. En C, `%` sur un nombre négatif donne un résultat négatif ou 0.'
	],
	terms: [
		{ term: '`%` en C', def: 'Le reste d’une division entière. Son signe suit l’opérande de gauche : -7 % 3 vaut -1, et -6 % 3 vaut 0.' },
		{ term: 'Plan', def: 'Un bloc de pixels d’une image, par exemple la luminance ou une composante de couleur. Une ligne contient `width` valeurs.' },
		{ term: 'Progress', def: 'Un flottant qui vaut 1 sur la première image de la transition et 0 sur la dernière.' }
	],
	bug: {
		title: 'vf_xfade: fix the wrap-around of the slide transitions',
		repo: 'FFmpeg/FFmpeg',
		url: `${FFMPEG}/blob/c9a6817e3d265c27810e9d8f42da42f6b3196365/libavfilter/vf_xfade.c#L453-L481`,
		fix: `${FFMPEG}/commit/16a4ce48c7ca4cd0b97a7753029c7f92a0379fc8`,
		lang: 'c',
		code: `#define SLIDELEFT_TRANSITION(name, type, div) \\
static void slideleft##name##_transition(AVFilterContext *ctx, \\
                                 const AVFrame *a, const AVFrame *b, AVFrame *out, \\
                                 float progress, \\
                                 int slice_start, int slice_end, int jobnr) \\
{ \\
    XFadeContext *s = ctx->priv; \\
    const int height = slice_end - slice_start; \\
    const int width = out->width; \\
    const int z = -progress * width; \\
 \\
    for (int p = 0; p < s->nb_planes; p++) { \\
        const type *xf0 = (const type *)(a->data[p] + slice_start * a->linesize[p]); \\
        const type *xf1 = (const type *)(b->data[p] + slice_start * b->linesize[p]); \\
        type *dst = (type *)(out->data[p] + slice_start * out->linesize[p]); \\
 \\
        for (int y = 0; y < height; y++) { \\
            for (int x = 0; x < width; x++) { \\
                const int zx = z + x; \\
                const int zz = zx % width + width * (zx < 0); \\
                dst[x] = (zx >= 0) && (zx < width) ? xf1[zz] : xf0[zz]; \\
            } \\
 \\
            dst += out->linesize[p] / div; \\
            xf0 += a->linesize[p] / div; \\
            xf1 += b->linesize[p] / div; \\
        } \\
    } \\
}`,
		lines: [20],
		diff: `                 const int zx = z + x; \\
-                const int zz = zx % width + width * (zx < 0); \\
+                const int zz = zx % width + width * (zx % width < 0); \\
                 dst[x] = (zx >= 0) && (zx < width) ? xf1[zz] : xf0[zz]; \\`,
		notes: [
			'**Le test porte sur la mauvaise valeur.** Le code ajoute `width` quand `zx` est négatif. Il devrait ajouter `width` quand le reste `zx % width` est négatif. Les deux ne diffèrent que dans un cas : `zx` est négatif et multiple exact de la largeur, donc le reste vaut 0.',
			'**Où ça casse.** Prends une image de 1920 pixels de large. Sur la première image, `progress` vaut 1, donc `z` vaut -1920. Pour `x = 0`, `zx` vaut -1920 et `-1920 % 1920` vaut 0. `zx < 0` est vrai, donc `zz` devient 0 + 1920 = **1920**. Une ligne va de l’indice 0 à 1919, donc `xf0[1920]` est un cran après la ligne. Pour `x = 1`, `zx` vaut -1919, le reste vaut -1919 et `zz` vaut 1, ce qui est juste.',
			'**Le correctif.** `(zx % width < 0)` n’ajoute `width` que si le reste est sous 0. Pour -1920 le reste vaut 0, rien n’est ajouté et `zz` vaut 0. La même ligne a été corrigée dans `slideleft`, `slideright`, `slideup` et `slidedown`. Dans les versions haut et bas, l’indice choisit une ligne, donc la même erreur pointe une ligne entière après la fin du plan.',
			'**Ce que dit le commit.** "At the first transition frame the offset equals the frame size, so the first row or column had a remainder of zero and was still pushed up by one size, reading past the plane." Sur la première image, le décalage vaut la taille de l’image, le reste vaut zéro et l’indice est quand même poussé d’une taille.'
		]
	},
	quiz: [
		{
			q: 'L’image fait 1920 de large, `progress` vaut 1 et `x` vaut 0. Quel indice la ligne boguée calcule-t-elle pour `zz` ?',
			options: ['0, le premier pixel de la ligne', '1919, le dernier pixel de la ligne', '1920, un cran après la fin de la ligne', '-1920, avant le début de la ligne'],
			answer: 2,
			why: '`zx` vaut -1920. `-1920 % 1920` vaut 0, et `zx < 0` ajoute 1920, donc `zz` vaut 1920.'
		},
		{
			q: 'En C, que vaut `-7 % 3` ?',
			options: ['2', '-1', '1', '-2'],
			answer: 1,
			why: 'C arrondit la division vers zéro : -7 / 3 vaut -2. Le reste est -7 moins -6, soit -1. Python donnerait 2.'
		},
		{
			q: 'Tu ramènes un indice peut-être négatif avec `i % n`, puis tu ajoutes `n` si besoin. Quelle entrée tester en premier ?',
			options: [
				'Un grand indice positif, par exemple 10 fois n',
				'Un indice d’exactement -n, ou -2n',
				'Un indice de n - 1, la dernière case valide',
				'Un indice de -1, juste avant le début'
			],
			answer: 1,
			why: 'À -n le reste vaut 0, donc un test sur le signe de `i` au lieu du reste ajoute `n` une fois de trop. -1 donne un reste de -1 et marche dans les deux cas.'
		}
	],
	takeaway: 'Quand tu ramènes un indice avec `%` en C, teste le signe du reste, pas celui de l’indice, ou écris `((i % n) + n) % n`. Teste avec un indice qui est un multiple négatif exact de `n`.',
	sources: [{ title: 'FFmpeg, commit 16a4ce48c7', url: `${FFMPEG}/commit/16a4ce48c7ca4cd0b97a7753029c7f92a0379fc8` }]
};
