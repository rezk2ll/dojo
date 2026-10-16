const GODOT = 'https://github.com/godotengine/godot';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'missing-null',
	part: 'Les entrées',
	title: 'La vérification une ligne trop tard',
	minutes: 10,
	hook: [
		'Sur Godot 4.7 beta 3, un utilisateur crée une `DrawableTexture2D` et appelle tout de suite `blit_rect` dessus, sans passer par `setup`. Le jeu **plante**. Appeler d’abord `setup(-1, -1, ...)`, avec une taille invalide, le fait planter aussi.',
		'Une texture jamais initialisée a un handle vide : le serveur de rendu ne la trouve pas et renvoie un pointeur nul. La fonction ci-dessous prévoit déjà ce cas, avec un message d’erreur. Le plantage arrive quand même.'
	],
	terms: [
		{ term: 'RID', def: 'Un handle que Godot utilise pour désigner un objet détenu par un serveur, ici une texture. Un RID vide ne désigne rien.' },
		{ term: 'ERR_FAIL_NULL_MSG', def: 'Une macro de Godot. Si le pointeur est nul, elle affiche le message et sort de la fonction.' },
		{ term: 'Déréférencement nul', def: 'Lire un champ à travers un pointeur nul. En C++, ça fait en général planter le processus.' }
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
			'**La lecture passe avant la garde.** `get_texture` renvoie `texture_owner.get_or_null(p_rid)`, donc peut renvoyer nul. La ligne `srgb_mask` lit `->drawable_type` sur ce résultat. Le test de nullité est à la ligne suivante : il ne s’exécute que si le pointeur était bon.',
			'**Ce que l’appelant envoie.** Avant `setup`, le champ `texture` d’une `DrawableTexture2D` est un RID vide, et `blit_rect` le met tel quel dans le tableau. `get_texture` ne trouve rien et renvoie nul, puis `->drawable_type` lit à travers. Le processus plante au lieu d’afficher "Drawable Texture target cannot be null."',
			'**Deux recherches pour une valeur.** La ligne boguée rappelle aussi `get_texture(p_textures[i])` au lieu d’utiliser `tex`. Le correctif descend la ligne sous toutes les vérifications et lit `tex->drawable_type`, le pointeur que la garde a déjà testé.',
			'**Comment ça a été trouvé.** [L’issue #119927](' + GODOT + '/issues/119927), "Calling `blit_rect` on `DrawableTexture2D` before calling `setup` causes crash", fournissait un script qui plante au clic sur un bouton. Le correctif est [la pull request #119930](' + GODOT + '/pull/119930).'
		]
	},
	quiz: [
		{
			q: 'Une `DrawableTexture2D` n’a jamais été initialisée et tu appelles `blit_rect`. Que fait le code bogué ?',
			options: [
				'La garde affiche son message d’erreur et sort',
				'La ligne `srgb_mask` lit à travers un pointeur nul et plante',
				'Le test des mipmaps échoue et affiche une autre erreur',
				'La boucle saute la texture parce que sa taille vaut 0'
			],
			answer: 1,
			why: '`get_texture` renvoie nul pour le RID vide. La ligne `srgb_mask` utilise ce nul avant que `ERR_FAIL_NULL_MSG` ait pu s’exécuter.'
		},
		{
			q: 'En revue de code, quel motif signale ce genre de bug ?',
			options: [
				'Un pointeur testé deux fois contre nul dans la même fonction',
				'Un champ lu à travers un pointeur au-dessus de la ligne qui le teste',
				'Une boucle qui s’arrête à un compte fixe de 4',
				'Une macro d’erreur qui sort sans renvoyer de valeur'
			],
			answer: 1,
			why: 'Un test de nullité ne protège que les lignes qui le suivent. Tout usage du pointeur au-dessus s’exécute sans protection.'
		},
		{
			q: 'Quel test aurait attrapé ce bug ?',
			options: [
				'Un blit dans une texture 32 par 32 après un `setup` valide',
				'Un blit dans une texture jamais initialisée, en attendant une erreur',
				'Un blit de la même source dans quatre cibles',
				'Un blit avec un matériau texture_blit personnalisé'
			],
			answer: 1,
			why: 'La garde existe pour une cible invalide. Un test qui en envoie une tombe sur la ligne au-dessus de la garde et plante, ce qui montre que la garde est mal placée.'
		}
	],
	takeaway: 'Quand une fonction récupère un pointeur puis le teste contre nul, regarde chaque ligne entre la récupération et le test. Place le test juste après la récupération, et réutilise le pointeur testé au lieu de le chercher à nouveau.',
	sources: [
		{ title: 'godot, issue #119927', url: `${GODOT}/issues/119927` },
		{ title: 'godot, pull request #119930', url: `${GODOT}/pull/119930` }
	]
};
