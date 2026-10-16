const GODOT = 'https://github.com/godotengine/godot';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'missing-null',
	part: 'Inputs',
	title: 'The check one line too late',
	minutes: 10,
	hook: [
		'On Godot 4.7 beta 3, a user created a `DrawableTexture2D` and called `blit_rect` on it right away, before calling `setup`. The game **crashed**. Calling `setup(-1, -1, ...)` first, with an invalid size, crashed it too.',
		'A texture that was never set up has an empty handle, so the rendering server cannot find it and gets back a null pointer. The function below already guards against that case with an error message. The crash happened anyway.'
	],
	terms: [
		{ term: 'RID', def: 'A handle Godot uses to refer to an object owned by a server, here a texture. An empty RID points to nothing.' },
		{ term: 'ERR_FAIL_NULL_MSG', def: 'A Godot macro. If the pointer is null, it prints the message and returns from the function.' },
		{ term: 'Null dereference', def: 'Reading a field through a pointer that is null. In C++ this usually crashes the process.' }
	],
	bug: {
		title: 'Fix drawable texture access before null check.',
		repo: 'godotengine/godot',
		url: `${GODOT}/blob/dff2b9bb66a01d8c1a207531b0752405c7399124/servers/rendering/renderer_rd/storage_rd/texture_storage.cpp#L1701-L1741`,
		fix: `${GODOT}/commit/586d613f43db5b186f6bca6c865cb5a383217b3b`,
		lang: 'cpp',
		code: `void TextureStorage::texture_drawable_blit_rect(const TypedArray<RID> &p_textures, const Rect2i &p_rect, RID p_material, const Color &p_modulate, const TypedArray<RID> &p_source_textures, int p_to_mipmap) {
…
int srgb_mask = 0;
const int srgbMaskArray[4] = { 1, 2, 4, 8 };
LocalVector<RD::Uniform> texture_uniforms;

int i = 0;
while (i < 4) {
    // Load Target Textures
    if (i < p_textures.size()) {
        Texture *tex = get_texture(p_textures[i]);
        srgb_mask += get_texture(p_textures[i])->drawable_type == RSE::TEXTURE_DRAWABLE_FORMAT_RGBA8_SRGB ? srgbMaskArray[i] : 0;
        ERR_FAIL_NULL_MSG(tex, "Drawable Texture target cannot be null.");
        ERR_FAIL_COND_MSG(p_to_mipmap >= tex->mipmaps || p_to_mipmap >= tex->cached_rd_slices.size(), vformat("Drawable Texture Target does not have mipmap level %d.", p_to_mipmap));
        if (i > 0) {
            ERR_FAIL_COND_MSG(texture_2d_get_size(p_textures[i - 1]) != texture_2d_get_size(p_textures[i]), "All Blit_Rect output textures must be same size.");
        }
        tar_textures[i] = tex->cached_rd_slices[p_to_mipmap];
    }`,
		lines: [12],
		diff: `             Texture *tex = get_texture(p_textures[i]);
-            srgb_mask += get_texture(p_textures[i])->drawable_type == RSE::TEXTURE_DRAWABLE_FORMAT_RGBA8_SRGB ? srgbMaskArray[i] : 0;
             ERR_FAIL_NULL_MSG(tex, "Drawable Texture target cannot be null.");
             ERR_FAIL_COND_MSG(p_to_mipmap >= tex->mipmaps || p_to_mipmap >= tex->cached_rd_slices.size(), vformat("Drawable Texture Target does not have mipmap level %d.", p_to_mipmap));
             if (i > 0) {
                 ERR_FAIL_COND_MSG(texture_2d_get_size(p_textures[i - 1]) != texture_2d_get_size(p_textures[i]), "All Blit_Rect output textures must be same size.");
             }
+            srgb_mask += tex->drawable_type == RSE::TEXTURE_DRAWABLE_FORMAT_RGBA8_SRGB ? srgbMaskArray[i] : 0;
             tar_textures[i] = tex->cached_rd_slices[p_to_mipmap];`,
		notes: [
			'**The read comes before the guard.** `get_texture` returns `texture_owner.get_or_null(p_rid)`, so it can return null. The `srgb_mask` line reads `->drawable_type` on that result. The null check is on the next line, so it only runs when the pointer was fine.',
			'**What the caller passes.** Before `setup`, the `texture` field of a `DrawableTexture2D` is an empty RID, and `blit_rect` puts it in the array as is. `get_texture` finds nothing and returns null, and `->drawable_type` reads through it. The process crashes instead of printing "Drawable Texture target cannot be null."',
			'**Two lookups for one value.** The buggy line also calls `get_texture(p_textures[i])` a second time instead of using `tex`. The fix moves the line below all the checks and reads `tex->drawable_type`, the pointer the guard already tested.',
			'**How it was found.** [Issue #119927](' + GODOT + '/issues/119927), "Calling `blit_rect` on `DrawableTexture2D` before calling `setup` causes crash", came with a script that crashes on a button press. The fix is [pull request #119930](' + GODOT + '/pull/119930).'
		]
	},
	quiz: [
		{
			q: 'A `DrawableTexture2D` was never set up and you call `blit_rect`. What happens in the buggy code?',
			options: [
				'The guard prints its error message and returns',
				'The `srgb_mask` line reads through a null pointer and crashes',
				'The mipmap check fails and prints a different error',
				'The loop skips the texture because its size is 0'
			],
			answer: 1,
			why: '`get_texture` returns null for the empty RID. The `srgb_mask` line uses that null before `ERR_FAIL_NULL_MSG` gets a chance to run.'
		},
		{
			q: 'In a code review, which pattern points to this kind of bug?',
			options: [
				'A pointer checked for null twice in the same function',
				'A field read through a pointer above the line that checks it',
				'A loop that stops at a fixed count of 4',
				'An error macro that returns without a value'
			],
			answer: 1,
			why: 'A null check only protects the lines after it. Any use of the pointer above the check runs unprotected.'
		},
		{
			q: 'Which test would have caught this bug?',
			options: [
				'Blit into a 32 by 32 texture after a valid `setup`',
				'Blit into a texture that was never set up, and expect an error',
				'Blit the same source texture into four targets',
				'Blit with a custom texture_blit shader material'
			],
			answer: 1,
			why: 'The guard exists for an invalid target. A test that sends one hits the line above the guard and crashes, which shows the guard is in the wrong place.'
		}
	],
	takeaway: 'When a function looks up a pointer and checks it for null, look at every line between the lookup and the check. Move the check right after the lookup, and reuse the checked pointer instead of looking it up again.',
	sources: [
		{ title: 'godot issue #119927', url: `${GODOT}/issues/119927` },
		{ title: 'godot pull request #119930', url: `${GODOT}/pull/119930` }
	]
};
