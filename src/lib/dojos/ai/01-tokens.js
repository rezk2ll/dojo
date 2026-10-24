const MINBPE = 'https://github.com/karpathy/minbpe/blob/1acefe89412b20245db5a22d2a02001e547dc602';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tokens',
	part: 'How models work',
	title: 'Tokens',
	minutes: 10,
	hook: [
		'You ask a chat model how many times the letter r appears in "strawberry". It answers 2. The same model writes a working SQL migration a minute later.',
		'The model never saw the ten letters of the word. GPT-4’s tokenizer (`cl100k_base` in tiktoken) turns " strawberry" into **one integer, 73700**. Counting letters inside that number means recalling a spelling the model was never shown directly.'
	],
	terms: [
		{ term: 'Token', def: 'One unit of text the model reads or writes, stored as an integer id. A token can be one byte, a few letters, or a whole word with its leading space.' },
		{ term: 'Tokenizer', def: 'The program that turns text into a list of token ids before the model sees it, and turns ids back into text after.' },
		{ term: 'BPE', def: 'Byte pair encoding: start from the 256 byte values, then repeatedly give the most frequent pair of neighbouring ids a new id.' },
		{ term: 'Vocabulary', def: 'The full table of token ids a tokenizer knows. In minbpe its size is 256 plus the number of merges.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['text["Training text: aaabdaaabac"] --> bytes["UTF-8 bytes: 97 97 97 98 100 97 97 97 98 97 99"]'],
				highlight: ['text', 'bytes'],
				note: 'The tokenizer starts from raw bytes. Each of the 11 characters is one byte here, so the text is 11 ids between 0 and 255. Ids 0 to 255 are always in the vocabulary, so any text can be encoded.'
			},
			{
				add: ['bytes --> m1["Merge 1: pair 97 97 seen 4 times, new id 256 = aa"]'],
				highlight: ['m1'],
				note: 'Training counts every pair of neighbouring ids and picks the most frequent. The pair (97, 97), "aa", appears 4 times. It gets id 256, and every "aa" in the list is replaced: 11 ids drop to 9.'
			},
			{
				add: ['m1 --> m2["Merge 2: 256 97 = aaa, id 257"]', 'm2 --> m3["Merge 3: 257 98 = aaab, id 258"]'],
				highlight: ['m2', 'm3'],
				note: 'The same step runs again on the new list. Merge 2 joins "aa" and "a" into id 257, merge 3 joins "aaa" and "b" into id 258. We asked for a vocabulary of 259, so training stops after 3 merges.'
			},
			{
				add: ['m3 --> enc["encode aaabdaaabac: 258 100 258 97 99"]'],
				highlight: ['enc'],
				note: 'Encoding replays the merges in the order they were learned. The training text now takes 5 ids instead of 11. Text with no learned pair stays as bytes: `encode("abac")` returns 4 ids, `[97, 98, 97, 99]`.'
			},
			{
				add: ['enc --> model["The model reads ids only, never letters"]'],
				highlight: ['model'],
				note: 'Real tokenizers do the same with about 100,000 merges learned from a large corpus. In `cl100k_base`, " strawberry" with its leading space is id 73700. "strawberry" at the start of a line is 3 ids: "str", "aw", "berry".'
			}
		]
	},
	example: {
		title: 'minbpe/basic.py: train and encode a byte-level BPE tokenizer',
		repo: 'karpathy/minbpe',
		url: `${MINBPE}/minbpe/basic.py#L20-L74`,
		lang: 'python',
		code: `    def train(self, text, vocab_size, verbose=False):
        assert vocab_size >= 256
        num_merges = vocab_size - 256

        # input text preprocessing
        text_bytes = text.encode("utf-8") # raw bytes
        ids = list(text_bytes) # list of integers in range 0..255

        # iteratively merge the most common pairs to create new tokens
        merges = {} # (int, int) -> int
        vocab = {idx: bytes([idx]) for idx in range(256)} # int -> bytes
        for i in range(num_merges):
            # count up the number of times every consecutive pair appears
            stats = get_stats(ids)
            # find the pair with the highest count
            pair = max(stats, key=stats.get)
            # mint a new token: assign it the next available id
            idx = 256 + i
            # replace all occurrences of pair in ids with idx
            ids = merge(ids, pair, idx)
            # save the merge
            merges[pair] = idx
            vocab[idx] = vocab[pair[0]] + vocab[pair[1]]
…
    def encode(self, text):
        # given a string text, return the token ids
        text_bytes = text.encode("utf-8") # raw bytes
        ids = list(text_bytes) # list of integers in range 0..255
        while len(ids) >= 2:
            # find the pair with the lowest merge index
            stats = get_stats(ids)
            pair = min(stats, key=lambda p: self.merges.get(p, float("inf")))
            # subtle: if there are no more merges available, the key will
            # result in an inf for every single pair, and the min will be
            # just the first pair in the list, arbitrarily
            # we can detect this terminating case by a membership check
            if pair not in self.merges:
                break # nothing else can be merged anymore
            # otherwise let's merge the best pair (lowest merge index)
            idx = self.merges[pair]
            ids = merge(ids, pair, idx)
        return ids`,
		notes: [
			'`num_merges = vocab_size - 256` sets the vocabulary size. Calling `train(text, 259)` runs exactly 3 merges, the 3 boxes in the diagram.',
			'`pair = max(stats, key=stats.get)` picks the most frequent neighbouring pair, and the next line gives it id `256 + i`. [`get_stats`](' + MINBPE + '/minbpe/base.py#L13-L22) counts the pairs with `zip(ids, ids[1:])`.',
			'In `encode`, `min(... self.merges.get(p, float("inf")))` picks the pair that was learned first. Merges run in training order, so "aa" (256) is always built before "aaa" (257).',
			'`if pair not in self.merges: break` stops when no learned pair is left. On "aaaab" this returns `[256, 256, 98]`: two "aa" tokens and a "b", because no merge joins two 256 ids.'
		]
	},
	tradeoff: {
		gain: [
			'Any input can be encoded: the 256 byte ids cover every UTF-8 string, including emoji and code.',
			'Common text gets short: in `cl100k_base`, the 44 characters of "The quick brown fox jumps over the lazy dog." are 10 tokens.'
		],
		cost: [
			'The model sees ids, so letter-level tasks (counting, reversing, spelling) depend on what it memorised about each token.',
			'Text unlike the training corpus costs more: the French version of the fox sentence is 58 characters and 18 tokens in `cl100k_base`.',
			'The same text gets a different count under another tokenizer. Anthropic’s docs say Claude 4.7 and later models produce "approximately 30 percent more tokens" for the same text than earlier models.'
		]
	},
	task: {
		prompt: 'Clone `karpathy/minbpe` and run `BasicTokenizer().train("aaabdaaabac", 259)`. Before running them, predict the output of `encode("aaab")`, `encode("aaaab")` and `encode("abac")`. Then run them and explain each result.',
		hint: 'The learned merges are, in order: (97, 97) to 256, (256, 97) to 257, (257, 98) to 258. Encoding applies them in that order, and merges never overlap.',
		answer: [
			'`encode("aaab")` returns `[258]`: 97 97 97 98, then 256 97 98, then 257 98, then 258. One token for 4 characters.',
			'`encode("aaaab")` returns `[256, 256, 98]`. The first merge turns the four 97s into two 256s. No merge was learned for (256, 256) or (256, 98), so encoding stops at 3 tokens.',
			'`encode("abac")` returns `[97, 98, 97, 99]`. The text appears inside the training string, but no merge covers "ab" or "ac", so each byte stays its own token.',
			'Adding one "a" changed 1 token into 3. Real tokenizers show the same effect: "strawberry" is 3 tokens at the start of a line and 1 token after a space in `cl100k_base`.'
		],
		steps: [
			{
				title: 'Find the learned merges',
				questions: [
					{ q: 'How many ids does the list hold before the first merge of "aaabdaaabac"?', options: ['11', '259', '3', '256'], answer: 0, why: 'Each of the 11 characters is one UTF-8 byte, so `list(text_bytes)` gives 11 ids between 0 and 255.' },
					{ q: 'Which pair becomes id 256?', options: ['(97, 98), "ab"', '(97, 97), "aa"', '(98, 100), "bd"', '(97, 99), "ac"'], answer: 1, why: '"aa" appears 4 times in the training text, more than any other pair, so it gets the first new id.' },
					{ q: 'What does merge 2 build?', options: ['257 = (256, 97), "aaa"', '257 = (100, 256), "daa"', '257 = (256, 256), "aaaa"', '257 = (256, 98), "aab"'], answer: 0, why: 'Training counts pairs again on the new list, 256 97 98 100 256 97 98 97 99. "aa" followed by "a" appears twice and becomes 257, as in the diagram.' },
					{ q: 'What does merge 3 build?', options: ['258 = (98, 100), "bd"', '258 = (97, 99), "ac"', '258 = (257, 98), "aaab"', '258 = (256, 97), "aaa"'], answer: 2, why: '"aaa" followed by "b" comes next. After it, training stops: 3 merges were asked for.' }
				]
			},
			{
				title: 'Predict `encode("aaab")`',
				questions: [
					{ q: 'What list of ids does `encode("aaab")` start from?', options: ['[256, 97, 98]', '[97, 97, 97, 98]', '[258]', '[97, 98]'], answer: 1, why: 'Encoding starts from the raw UTF-8 bytes, like training. Each of the 4 characters is one byte.' },
					{ q: 'In which order does `encode` apply the merges?', options: ['Most frequent pair in the input first', 'Learned first, applied first: 256, then 257, then 258', 'Longest token first: 258, then 257, then 256', 'Left to right, whatever pair comes first'], answer: 1, why: '`min(... self.merges.get(p, float("inf")))` picks the pair with the lowest merge index, so merges replay in training order.' },
					{ q: 'What is the list after merge 1?', options: ['[256, 97, 98]', '[97, 256, 98]', '[257, 98]', '[256, 256]'], answer: 0, why: 'The first two 97s become 256. The third "a" and the "b" stay as bytes for now.' },
					{ q: 'What does `encode("aaab")` return?', options: ['[257, 98]', '[256, 97, 98]', '[258]', '[97, 97, 97, 98]'], answer: 2, why: '256 97 98 becomes 257 98, then 258. One token for 4 characters.' }
				]
			},
			{
				title: 'Predict `encode("aaaab")`',
				questions: [
					{ q: 'What does merge 1 do to `[97, 97, 97, 97, 98]`?', options: ['[256, 97, 97, 98]', '[256, 256, 98]', '[257, 97, 98]', '[97, 97, 256, 98]'], answer: 1, why: 'Every "aa" in the list is replaced, and merges never overlap. Four 97s become two 256s.' },
					{ q: 'Why can merge 2 not apply next?', options: ['It needs (256, 97), and no 97 follows a 256 any more', 'It only runs during training, never in `encode`', 'It needs the text to start with a "b"', 'Encoding always stops after the first merge'], answer: 0, why: 'Merge 2 joins a 256 with a 97. Both 97s were used up by merge 1.' },
					{ q: 'What does `encode("aaaab")` return?', options: ['[97, 258]', '[256, 256, 98]', '[257, 97, 98]', '[256, 258]'], answer: 1, why: 'No merge was learned for (256, 256) or (256, 98), so encoding stops at 3 tokens.' },
					{ q: 'What makes `encode` stop?', options: ['The list is shorter than 4 ids', 'Every merge has been tried once', 'The list holds only ids above 255', 'No pair in the list matches a learned merge'], answer: 3, why: '`if pair not in self.merges: break` ends the loop when no learned pair is left.' }
				]
			},
			{
				title: 'Explain the results',
				questions: [
					{ q: 'What does `encode("abac")` return?', options: ['[257, 99]', '[256, 97, 99]', '[97, 98, 97, 99]', '[258]'], answer: 2, why: 'Each byte stays its own token: none of the learned pairs appears in "abac".' },
					{ q: '"abac" appears inside the training text. Why are its bytes not merged?', options: ['No learned merge covers "ab" or "ac"', 'The tokenizer only merges text at the start of a string', 'Encoding skips text it already saw in training', 'Only pairs of the same letter can merge'], answer: 0, why: 'Only 3 merges were learned, and none of them is "ab" or "ac". Seeing the text in training is not enough.' },
					{ q: 'One extra "a" took "aaab" from 1 token to 3. What does this show?', options: ['Longer text always takes fewer tokens', 'Repeated letters always form one token', 'The tokenizer counts characters, not pairs', 'A small change in the text can change the tokens a lot'], answer: 3, why: 'Tokens follow the learned merges, not the letters. One character can break a merge chain.' },
					{ q: 'How does `cl100k_base` tokenize "strawberry"?', options: ['1 token everywhere it appears', '10 tokens, one per letter', '3 tokens after a space, 1 at the start of a line', '1 token after a space, 3 at the start of a line'], answer: 3, why: '" strawberry" with its leading space is id 73700. At the start of a line it is "str", "aw", "berry".' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In `cl100k_base`, " strawberry" is the single token 73700. Why does a model often miscount its r letters?',
			options: [
				'The tokenizer drops repeated letters before the text reaches the model',
				'The model receives one id and has to recall the spelling behind it',
				'The model sees the letters but only counts each distinct letter once',
				'The model reads text backwards, so double letters are merged'
			],
			answer: 1,
			why: 'The model only receives integer ids. The letters of a token are not in its input; any spelling knowledge comes from training text where the word was spelled out.'
		},
		{
			q: 'A minbpe tokenizer is trained with `vocab_size=259`. How many merges does it learn?',
			options: ['259', '3', '256', 'As many as the text needs'],
			answer: 1,
			why: '`num_merges = vocab_size - 256`. The 256 byte values are always in the vocabulary, and each merge adds one id on top.'
		},
		{
			q: 'You move a prompt from an older Claude model to Claude 4.7. What do Anthropic’s token counting docs tell you to do?',
			options: [
				'Keep the old token counts, since the same text costs the same tokens',
				'Recount the prompt against the model you plan to use',
				'Divide the old count by 1.3 to get the new count',
				'Count characters instead, since tokens no longer apply'
			],
			answer: 1,
			why: 'Claude 4.7 and later use a newer tokenizer that produces about 30 percent more tokens for the same text, depending on content. The docs say to recount against the target model instead of reusing old counts.'
		}
	],
	recall: {
		q: 'What does BPE training do at each step, and how many ids does minbpe start with?',
		a: 'It starts with 256 ids, one per byte. At each step it finds the most frequent pair of neighbouring ids and gives it the next id (256, 257, ...).'
	},
	sources: [
		{ title: 'karpathy/minbpe README', url: `${MINBPE}/README.md` },
		{ title: 'karpathy/minbpe, minbpe/basic.py', url: `${MINBPE}/minbpe/basic.py` },
		{ title: 'openai/tiktoken README (outputs above from tiktoken 0.14.0, cl100k_base)', url: 'https://github.com/openai/tiktoken/blob/4e71bbe0c078468e00fefbf94b39849389f346e5/README.md' },
		{ title: 'Claude docs, Token counting, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/token-counting' }
	]
};
