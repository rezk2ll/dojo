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
		],
		steps: [
			{
				title: 'Compute `cos_sim(a, b)`',
				questions: [
					{ q: 'What is the dot product a · b, with a = (3, 4) and b = (4, 3)?', options: ['24', '25', '7', '0'], answer: 0, why: '3 × 4 + 4 × 3 = 12 + 12 = 24.' },
					{ q: 'What is the length of a = (3, 4)?', options: ['7', '5', '25', '12'], answer: 1, why: 'The square root of 3 × 3 + 4 × 4 = 25 is 5. b has the same length.' },
					{ q: 'What is `cos_sim(a, b)`?', options: ['24', '1', '0.5', '0.96'], answer: 3, why: 'The dot product divided by both lengths: 24 / (5 × 5) = 0.96.' },
					{ q: 'What is `cos_sim(b, a)`, with the two arguments swapped?', options: ['0.96', '-0.96', '1', '24'], answer: 0, why: 'b · a = 4 × 3 + 3 × 4 = 24 and both lengths are still 5, so the score is 0.96 again. The order of the arguments does not change a cosine.' }
				]
			},
			{
				title: 'Compute `cos_sim(a, c)`',
				questions: [
					{ q: 'What is a · c, with c = (-3, -4)?', options: ['25', '-25', '-7', '0'], answer: 1, why: '3 × -3 + 4 × -4 = -9 - 16 = -25.' },
					{ q: 'What is the length of c?', options: ['5', '-5', '-25', '7'], answer: 0, why: 'A length is never negative: (-3)² + (-4)² = 25, and its square root is 5.' },
					{ q: 'What is `cos_sim(a, c)`?', options: ['0', '1', '-1', '-0.96'], answer: 2, why: '-25 / (5 × 5) = -1, the lowest value a cosine can take.' },
					{ q: 'c gave -1. What does d = (-4, 3), at right angles to a, give for `cos_sim(a, d)`?', options: ['-1', '0.96', '1', '0'], answer: 3, why: 'a · d = 3 × -4 + 4 × 3 = -12 + 12 = 0, so the cosine is 0. Right angles sit halfway between the same direction (1) and the opposite one (-1).' }
				]
			},
			{
				title: 'Scale a by 10',
				questions: [
					{ q: 'What is 10a, and what is its length?', options: ['(30, 40), length 50', '(30, 40), length 5', '(13, 14), length 19', '(30, 40), length 70'], answer: 0, why: 'Each coordinate is multiplied by 10, and so is the length: 5 × 10.' },
					{ q: 'What is a · 10a?', options: ['25', '2500', '250', '50'], answer: 2, why: '3 × 30 + 4 × 40 = 90 + 160 = 250.' },
					{ q: 'What is `cos_sim(a, 10a)`?', options: ['1', '10', '0.1', '0.5'], answer: 0, why: '250 / (5 × 50) = 1. The two vectors point the same way.' },
					{ q: 'What does making a vector 10 times longer do to its cosine with another vector?', options: ['It multiplies it by 10', 'Nothing: the cosine stays the same', 'It divides it by 10', 'It flips its sign'], answer: 1, why: 'The length appears on both sides of the division and cancels out.' }
				]
			},
			{
				title: 'Explain what it means for search',
				questions: [
					{ q: 'After `normalize_embeddings`, what does `cos_sim` compare?', options: ['Direction only', 'Length only', 'Length and direction', 'The number of words'], answer: 0, why: 'Normalizing gives every vector length 1, so only the direction is left to compare.' },
					{ q: 'A short note and a long page cover the same topic. Does the long page score higher because it is longer?', options: ['Yes: its vector is longer', 'No: length plays no part, so a short note can score as high as a long page', 'No: the short note always scores higher', 'Yes: a long page always scores 1'], answer: 1, why: 'A vector’s length plays no part in `cos_sim`, as `cos_sim(a, 10a)` = 1 shows.' },
					{ q: 'What do a = (3, 4) and 10a = (30, 40) both become after `normalize_embeddings`?', options: ['(0.3, 0.4) and (3, 4)', '(3, 4) and (30, 40)', '(0.6, 0.8) and (0.6, 0.8)', '(0.75, 1) and (7.5, 10)'], answer: 2, why: 'Dividing by the lengths 5 and 50 gives (0.6, 0.8) both times, of length 1. Once normalized, the two vectors are identical, so the long one has nothing left to score with.' },
					{ q: 'The long page runs past 256 word pieces. What does `all-MiniLM-L6-v2` do with its end?', options: ['It encodes the end into a second vector', 'It makes the vector longer to fit it', 'It averages the end into the first vector', 'It truncates it, so the end is never seen'], answer: 3, why: 'Input longer than 256 word pieces is truncated by default. Split long pages into chunks before encoding.' }
				]
			}
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
