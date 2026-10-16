const FFMPEG = 'https://github.com/FFmpeg/FFmpeg';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'negative-modulo',
	part: 'Counting',
	title: 'A remainder of zero',
	minutes: 10,
	hook: [
		'FFmpeg’s `xfade` filter blends two videos with a transition. With the slide transitions, the very first frame of the transition **read past the end of the picture data**. The commit says it was "reading past the plane".',
		'The slide works by shifting each position by `z`. On the first frame `z` is minus the width of the frame, and it moves toward 0 as the transition goes on. Positions that go negative are wrapped back into the row with `%`. In C, `%` on a negative number gives a negative result or 0.'
	],
	terms: [
		{ term: '`%` in C', def: 'The remainder of an integer division. Its sign follows the left operand: -7 % 3 is -1, and -6 % 3 is 0.' },
		{ term: 'Plane', def: 'One block of pixel data in a frame, for example the luma or one color channel. A row of it holds `width` values.' },
		{ term: 'Progress', def: 'A float that goes from 1 at the first frame of the transition to 0 at the last one.' }
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
			'Line 20 adds `width` when `zx` is negative. It should add `width` when the remainder `zx % width` is negative. The two differ in one case: `zx` is a negative whole multiple of the width, so the remainder is 0.',
			'Take a frame 1920 pixels wide. On the first frame `progress` is 1, so line 10 sets `z` to -1920. For `x = 0`, `zx` is -1920 and `-1920 % 1920` is 0, but `zx < 0` is true, so `zz` is 0 + 1920 = **1920**. A row holds indexes 0 to 1919, so line 21 reads `xf0[1920]`, one past the row. For `x = 1`, the remainder is -1919 and `zz` is 1, which is right.',
			'The fixed line tests `(zx % width < 0)`, so it adds `width` only when the remainder is below 0. For -1920 the remainder is 0, nothing is added and `zz` is 0. The commit changed the same line in `slideleft`, `slideright`, `slideup` and `slidedown`. In the up and down versions the index picks a row, so the extra 1920 there points a whole row past the plane.',
			'The commit message: "At the first transition frame the offset equals the frame size, so the first row or column had a remainder of zero and was still pushed up by one size, reading past the plane."'
		]
	},
	quiz: [
		{
			q: 'The frame is 1920 wide, `progress` is 1 and `x` is 0. What index does the buggy line compute for `zz`?',
			options: ['0, the first pixel of the row', '1919, the last pixel of the row', '1920, one past the end of the row', '-1920, before the start of the row'],
			answer: 2,
			why: '`zx` is -1920. `-1920 % 1920` is 0, and `zx < 0` adds 1920, so `zz` is 1920.'
		},
		{
			q: 'In C, what is `-7 % 3`?',
			options: ['2', '-1', '1', '-2'],
			answer: 1,
			why: 'C rounds the division toward zero: -7 / 3 is -2. The remainder is -7 minus -6, which is -1. Python would give 2.'
		},
		{
			q: 'You wrap a possibly negative index with `i % n` and then add `n` when needed. Which input should a test try first?',
			options: [
				'A large positive index, such as 10 times n',
				'An index of exactly -n, or -2n',
				'An index of n - 1, the last valid slot',
				'An index of -1, just before the start'
			],
			answer: 1,
			why: 'At -n the remainder is 0, so any test on the sign of `i` instead of the remainder adds `n` once too many. -1 gives a remainder of -1 and works either way.'
		}
	],
	recall: {
		q: 'You wrap an index with `i % n` in C and add `n` when needed. Which sign do you test, and which input catches the mistake?',
		a: 'Test the sign of the remainder `i % n`, or write `((i % n) + n) % n`. An index of exactly -n catches it: its remainder is 0, and a test on `i < 0` adds `n` and gives index n.'
	},
	sources: [{ title: 'FFmpeg commit 16a4ce48c7', url: `${FFMPEG}/commit/16a4ce48c7ca4cd0b97a7753029c7f92a0379fc8` }]
};
