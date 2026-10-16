const ST = 'https://github.com/huggingface/sentence-transformers/blob/1fa45b4212a53e7d6c8d3c2682f88743338179fb';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'embeddings',
	part: 'Comment marchent les modèles',
	title: 'Les embeddings',
	minutes: 10,
	hook: [
		'Tu montes une recherche sur les notes CI de ton équipe avec `all-MiniLM-L6-v2`. La requête "How do I reset my password?" trouve la bonne page avec un score de 0.727. Puis quelqu’un tape "The tests pass."',
		'Le premier résultat est "The tests do not pass.", avec **0.780**. "All checks are green.", qui dit la même chose que la requête, obtient 0.267. La phrase contraire contient tous les mots de la requête, plus "do not".'
	],
	terms: [
		{ term: 'Embedding', def: 'Une liste de nombres de longueur fixe (un vecteur) qu’un modèle calcule à partir d’un texte. `all-MiniLM-L6-v2` renvoie 384 nombres par texte.' },
		{ term: 'Similarité cosinus', def: 'Le cosinus de l’angle entre deux vecteurs : 1 s’ils vont dans le même sens, 0 s’ils sont à angle droit, -1 s’ils sont opposés.' },
		{ term: 'Normaliser', def: 'Diviser un vecteur par sa longueur pour qu’il mesure 1. Ensuite, le produit scalaire de deux vecteurs vaut leur similarité cosinus.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['txt["The weather is lovely today."] --> enc["model.encode()"]', 'enc --> vec["Vecteur de 384 flottants"]'],
				highlight: ['enc', 'vec'],
				note: 'La fiche du modèle dit que `all-MiniLM-L6-v2` "maps sentences & paragraphs to a 384 dimensional dense vector space". Par défaut, un texte "longer than 256 word pieces is truncated" : la fin d’une longue page n’est jamais lue.'
			},
			{
				add: ['vec --> norm["Normaliser : diviser par la longueur"]'],
				highlight: ['norm'],
				note: '`normalize_embeddings` appelle `torch.nn.functional.normalize(embeddings, p=2, dim=-1)`. Chaque vecteur est divisé par sa longueur : un texte long et un texte court se comparent sur la direction seule.'
			},
			{
				add: ['norm --> dot["Produit scalaire de deux vecteurs unitaires = cosinus"]'],
				highlight: ['dot'],
				note: 'Pour deux vecteurs de longueur 1, multiplier terme à terme puis additionner donne le cosinus. L’exemple du README note "The weather is lovely today." à 0.6660 face à "It’s so sunny outside!" et à 0.1046 face à "He drove to the stadium."'
			},
			{
				add: ['dot --> rank["Trier les documents par score, garder les k premiers"]'],
				highlight: ['rank'],
				note: 'Une recherche encode la requête une fois, la note contre chaque vecteur stocké et renvoie les meilleurs. Pour "timeout when connecting to postgres", "psycopg2.OperationalError: connection timed out" obtient 0.640, devant "Redis connection refused" à 0.376.'
			},
			{
				add: ['rank --> warn["Score élevé : mots et sujet proches. Ni le sens ni la vérité ne sont vérifiés"]'],
				highlight: ['warn'],
				note: 'Un score élevé veut dire que les deux textes se ressemblent pour ce modèle. "The tests pass." et "The tests do not pass." ne diffèrent que de deux mots et obtiennent 0.780. Le code qui agit sur le premier résultat doit vérifier le texte lui-même.'
			}
		]
	},
	example: {
		title: 'sentence_transformers/util/similarity.py : cos_sim',
		repo: 'huggingface/sentence-transformers',
		url: `${ST}/sentence_transformers/util/similarity.py#L59-L75`,
		lang: 'python',
		code: `def cos_sim(a: list | np.ndarray | Tensor, b: list | np.ndarray | Tensor) -> Tensor:
    """
    Computes the cosine similarity between two tensors.

    Args:
        a (Union[list, np.ndarray, Tensor]): The first tensor.
        b (Union[list, np.ndarray, Tensor]): The second tensor.

    Returns:
        Tensor: Matrix with res[i][j] = cos_sim(a[i], b[j])
    """
    a = _convert_to_batch_tensor(a)
    b = _convert_to_batch_tensor(b)

    a_norm = normalize_embeddings(a)
    b_norm = normalize_embeddings(b)
    return torch.mm(a_norm, b_norm.transpose(0, 1)).to_dense()`,
		notes: [
			'Les lignes 73 et 74 normalisent les deux entrées. [`normalize_embeddings`](' + ST + '/sentence_transformers/util/tensor.py#L120-L131) utilise `torch.nn.functional.normalize(embeddings, p=2, dim=-1)` pour les vecteurs denses.',
			'Ligne 75, `torch.mm(a_norm, b_norm.transpose(0, 1))` multiplie une matrice de requêtes par une matrice de documents. Avec 3 requêtes et 1 000 documents, tu obtiens d’un coup un tableau de 3 sur 1 000 cosinus.',
			'La docstring promet `res[i][j] = cos_sim(a[i], b[j])`. Les 3 phrases du README donnent un tableau de 3 sur 3 avec 1.0000 sur la diagonale : chaque phrase face à elle-même.',
			'`dot_score`, dans le même fichier, saute la normalisation. La page embeddings d’Anthropic indique que les vecteurs de Voyage AI "are normalized to length 1" : pour eux, produit scalaire et cosinus donnent le même nombre.'
		]
	},
	tradeoff: {
		gain: [
			'Une recherche trouve "psycopg2.OperationalError: connection timed out" pour "timeout when connecting to postgres" (0.640), alors que le message d’erreur ne contient pas "postgres".',
			'Un seul produit de matrices note une requête contre des milliers de vecteurs stockés, calculés une fois à l’ajout des documents.'
		],
		cost: [
			'Une négation déplace à peine le vecteur : "The tests pass." et "The tests do not pass." obtiennent 0.780.',
			'`all-MiniLM-L6-v2` coupe l’entrée après 256 word pieces : un long document doit être découpé en morceaux avant l’encodage.',
			'Les vecteurs de `all-MiniLM-L6-v2` ont 384 nombres, ceux de `voyage-4` 1024 par défaut. Pour changer de modèle, tu réencodes chaque document stocké.'
		]
	},
	task: {
		prompt: 'Prends trois vecteurs à 2 dimensions : a = (3, 4), b = (4, 3), c = (-3, -4). Calcule à la main `cos_sim(a, b)` et `cos_sim(a, c)`. Calcule ensuite `cos_sim(a, 10a)`. Que t’apprend ce dernier résultat sur une note courte et une longue page qui parlent du même sujet ?',
		hint: 'Cosinus = (x1 × x2 + y1 × y2) / (longueur 1 × longueur 2). La longueur de (3, 4) vaut 5.',
		answer: [
			'a · b = 3 × 4 + 4 × 3 = 24, et les deux longueurs valent 5, donc `cos_sim(a, b)` = 24 / 25 = 0.96. Les deux vecteurs vont presque dans le même sens.',
			'a · c = -9 - 16 = -25, donc `cos_sim(a, c)` = -25 / 25 = -1. Les deux vecteurs vont en sens opposé.',
			'10a = (30, 40), de longueur 50. a · 10a = 90 + 160 = 250, et 250 / (5 × 50) = 1. Multiplier un vecteur ne change pas son cosinus.',
			'`cos_sim` compare des directions après `normalize_embeddings`. La longueur du vecteur ne compte pas : une note courte peut obtenir un score aussi haut qu’une longue page.'
		]
	},
	quiz: [
		{
			q: 'Avec `all-MiniLM-L6-v2`, "The tests pass." obtient 0.780 face à "The tests do not pass." Que t’apprend ce score ?',
			options: [
				'Les deux vecteurs pointent presque dans la même direction',
				'Les deux phrases veulent dire la même chose 78 % du temps',
				'La seconde phrase a 78 % de chances d’être vraie',
				'Le modèle a pris la négation pour une faute de frappe'
			],
			answer: 0,
			why: 'La similarité cosinus mesure l’angle entre les deux vecteurs. Ajouter "do not" a peu déplacé le vecteur, et aucun calcul du score ne vérifie le sens ou la vérité.'
		},
		{
			q: 'Dans `cos_sim`, pourquoi les deux entrées passent-elles par `normalize_embeddings` avant `torch.mm` ?',
			options: [
				'Pour arrondir chaque valeur sur 8 bits et accélérer le produit',
				'Pour que le produit des deux matrices donne des cosinus',
				'Pour trier les vecteurs par longueur avant de les comparer',
				'Pour retirer les vecteurs des textes de plus de 256 tokens'
			],
			answer: 1,
			why: 'Diviser chaque vecteur par sa longueur donne des vecteurs unitaires. Le produit scalaire de deux vecteurs unitaires est le cosinus de leur angle : un seul produit de matrices renvoie tous les cosinus.'
		},
		{
			q: 'Ton index de recherche utilise `all-MiniLM-L6-v2`. Tu veux passer à un modèle Voyage AI. Que dois-tu faire des vecteurs stockés ?',
			options: [
				'Les garder, tous les vecteurs de longueur 1 étant comparables',
				'Les normaliser à nouveau pour coller au nouveau modèle',
				'Réencoder chaque document avec le nouveau modèle',
				'Les multiplier par 1024 / 384 pour atteindre la nouvelle taille'
			],
			answer: 2,
			why: '`all-MiniLM-L6-v2` renvoie 384 nombres par texte et `voyage-4` 1024 par défaut. Une requête encodée par le nouveau modèle ne se compare pas à des documents encodés par l’ancien : il faut tout réencoder.'
		}
	],
	recall: {
		q: 'Comment `cos_sim` de sentence-transformers calcule-t-il la similarité, et entre quelles valeurs ?',
		a: 'Il normalise les deux vecteurs à une longueur de 1, puis fait leur produit scalaire avec `torch.mm`. Le résultat va de -1 (opposés) à 1 (même direction).'
	},
	sources: [
		{ title: 'huggingface/sentence-transformers, README', url: `${ST}/README.md` },
		{ title: 'huggingface/sentence-transformers, util/similarity.py', url: `${ST}/sentence_transformers/util/similarity.py` },
		{ title: 'Hugging Face, fiche du modèle sentence-transformers/all-MiniLM-L6-v2 (scores ci-dessus avec sentence-transformers 6.1.0)', url: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2' },
		{ title: 'Doc Claude, Embeddings, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/embeddings' }
	]
};
