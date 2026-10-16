const ST = 'https://github.com/huggingface/sentence-transformers/blob/1fa45b4212a53e7d6c8d3c2682f88743338179fb';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'embeddings',
	part: 'How models work',
	title: 'Embeddings',
	minutes: 10,
	hook: [
		'You build a search box over your team’s CI notes with `all-MiniLM-L6-v2`. The query "How do I reset my password?" finds the right page with a score of 0.727. Then someone types "The tests pass."',
		'The top result is "The tests do not pass." with **0.780**. "All checks are green.", which means the same thing as the query, scores 0.267. The opposite sentence contains every word of the query, plus "do not".'
	],
	terms: [
		{ term: 'Embedding', def: 'A fixed-length list of numbers (a vector) that a model computes from a text. `all-MiniLM-L6-v2` returns 384 numbers per text.' },
		{ term: 'Cosine similarity', def: 'The cosine of the angle between two vectors: 1 when they point the same way, 0 when they are at right angles, -1 when they are opposite.' },
		{ term: 'Normalize', def: 'Divide a vector by its length so its new length is 1. After that, the dot product of two vectors equals their cosine similarity.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['txt["The weather is lovely today."] --> enc["model.encode()"]', 'enc --> vec["Vector of 384 floats"]'],
				highlight: ['enc', 'vec'],
				note: 'The model card says `all-MiniLM-L6-v2` "maps sentences & paragraphs to a 384 dimensional dense vector space". Input "longer than 256 word pieces is truncated" by default, so the end of a long page is never seen.'
			},
			{
				add: ['vec --> norm["Normalize: divide by the length"]'],
				highlight: ['norm'],
				note: '`normalize_embeddings` calls `torch.nn.functional.normalize(embeddings, p=2, dim=-1)`. Each vector is divided by its length, so a long text and a short text compare on direction only.'
			},
			{
				add: ['norm --> dot["Dot product of two unit vectors = cosine"]'],
				highlight: ['dot'],
				note: 'For two unit vectors, multiplying them term by term and summing gives the cosine. The README example scores "The weather is lovely today." against "It’s so sunny outside!" at 0.6660 and against "He drove to the stadium." at 0.1046.'
			},
			{
				add: ['dot --> rank["Sort documents by score, keep the top k"]'],
				highlight: ['rank'],
				note: 'A search encodes the query once, scores it against every stored vector, and returns the highest. For "timeout when connecting to postgres", "psycopg2.OperationalError: connection timed out" scores 0.640, above "Redis connection refused" at 0.376.'
			},
			{
				add: ['rank --> warn["High score: similar words and topic. It does not check meaning or truth"]'],
				highlight: ['warn'],
				note: 'A high score means the two texts look alike to this model. "The tests pass." and "The tests do not pass." differ by two words and score 0.780. Code that acts on the top hit has to check the text itself.'
			}
		]
	},
	example: {
		title: 'sentence_transformers/util/similarity.py: cos_sim',
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
			'Lines 73 and 74 normalize both inputs. [`normalize_embeddings`](' + ST + '/sentence_transformers/util/tensor.py#L120-L131) uses `torch.nn.functional.normalize(embeddings, p=2, dim=-1)` for dense vectors.',
			'Line 75, `torch.mm(a_norm, b_norm.transpose(0, 1))`, multiplies a matrix of queries by a matrix of documents. With 3 queries and 1,000 documents you get a 3 by 1,000 table of cosines in one call.',
			'The docstring promises `res[i][j] = cos_sim(a[i], b[j])`. The README’s 3 sentences give a 3 by 3 table with 1.0000 on the diagonal: each sentence against itself.',
			'`dot_score` in the same file skips the normalize step. Anthropic’s embeddings page says Voyage AI vectors "are normalized to length 1", so for them dot product and cosine give the same number.'
		]
	},
	tradeoff: {
		gain: [
			'A search finds "psycopg2.OperationalError: connection timed out" for "timeout when connecting to postgres" (0.640), although the error message never says "postgres".',
			'One matrix product scores a query against thousands of stored vectors, computed once when the documents are added.'
		],
		cost: [
			'A negation barely moves the vector: "The tests pass." and "The tests do not pass." score 0.780.',
			'`all-MiniLM-L6-v2` truncates input after 256 word pieces, so a long document has to be split into chunks before encoding.',
			'`all-MiniLM-L6-v2` vectors have 384 numbers and `voyage-4` vectors 1024 by default. To switch model, you encode every stored document again.'
		]
	},
	task: {
		prompt: 'Take three 2-dimensional vectors: a = (3, 4), b = (4, 3), c = (-3, -4). Compute `cos_sim(a, b)` and `cos_sim(a, c)` by hand. Then compute `cos_sim(a, 10a)`. What does the last result tell you about a short note and a long page on the same topic?',
		hint: 'Cosine = (x1 × x2 + y1 × y2) / (length 1 × length 2). The length of (3, 4) is 5.',
		answer: [
			'a · b = 3 × 4 + 4 × 3 = 24, and both lengths are 5, so `cos_sim(a, b)` = 24 / 25 = 0.96. The two vectors point almost the same way.',
			'a · c = -9 - 16 = -25, so `cos_sim(a, c)` = -25 / 25 = -1. The two vectors point in opposite directions.',
			'10a = (30, 40), length 50. a · 10a = 90 + 160 = 250, and 250 / (5 × 50) = 1. Scaling a vector does not change its cosine.',
			'`cos_sim` compares direction after `normalize_embeddings`. A vector’s length plays no part, so a short note can score as high as a long page.'
		]
	},
	quiz: [
		{
			q: 'With `all-MiniLM-L6-v2`, "The tests pass." scores 0.780 against "The tests do not pass." What does that score tell you?',
			options: [
				'The two vectors point in almost the same direction',
				'The two sentences mean the same thing 78% of the time',
				'The second sentence is 78% likely to be true',
				'The model rejected the negation as a typo'
			],
			answer: 0,
			why: 'Cosine similarity measures the angle between the two vectors. Adding "do not" moved the vector only a little, and the score has no step that checks meaning or truth.'
		},
		{
			q: 'In `cos_sim`, why are both inputs passed through `normalize_embeddings` before `torch.mm`?',
			options: [
				'To round each value to 8 bits so the product runs faster',
				'To turn the dot product of the two matrices into cosines',
				'To sort the vectors by length before comparing them',
				'To remove the vectors of texts longer than 256 tokens'
			],
			answer: 1,
			why: 'Dividing each vector by its length gives unit vectors. The dot product of two unit vectors is the cosine of the angle between them, so one matrix product returns every cosine.'
		},
		{
			q: 'Your search index uses `all-MiniLM-L6-v2`. You want to switch to a Voyage AI model. What do you have to do with the stored vectors?',
			options: [
				'Keep them, since all vectors of length 1 are comparable',
				'Normalize them again so they match the new model',
				'Re-encode every document with the new model',
				'Multiply them by 1024 / 384 to match the new size'
			],
			answer: 2,
			why: '`all-MiniLM-L6-v2` returns 384 numbers per text and `voyage-4` returns 1024 by default. A query encoded by the new model cannot be compared with documents encoded by the old one, so every document is encoded again.'
		}
	],
	recall: {
		q: 'How does `cos_sim` in sentence-transformers compute similarity, and what range can it return?',
		a: 'It normalizes both vectors to length 1, then takes their dot product with `torch.mm`. The result runs from -1 (opposite) to 1 (same direction).'
	},
	sources: [
		{ title: 'huggingface/sentence-transformers README', url: `${ST}/README.md` },
		{ title: 'huggingface/sentence-transformers, util/similarity.py', url: `${ST}/sentence_transformers/util/similarity.py` },
		{ title: 'Hugging Face, sentence-transformers/all-MiniLM-L6-v2 model card (scores above from sentence-transformers 6.1.0)', url: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2' },
		{ title: 'Claude docs, Embeddings, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/embeddings' }
	]
};
