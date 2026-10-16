const NANOGPT = 'https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'next-token',
	part: 'How models work',
	title: 'Predicting the next token',
	minutes: 10,
	hook: [
		'You paste the same function into a chat twice and ask for a name. The first answer is `parse_header`, the second is `read_header_line`. Nothing changed on your side.',
		'A language model writes one token at a time. For each position it computes **a probability for every token in its vocabulary**, then the program picks one by drawing from those probabilities. Two draws can land on different tokens.'
	],
	terms: [
		{ term: 'Logits', def: 'The raw scores the model outputs for the next position, one number per token in the vocabulary. A higher score gives that token a higher probability.' },
		{ term: 'Softmax', def: 'The function that turns logits into probabilities between 0 and 1 that add up to 1.' },
		{ term: 'Temperature', def: 'A number the logits are divided by before softmax. Below 1 it sharpens the probabilities toward the top token, above 1 it flattens them.' },
		{ term: 'Sampling', def: 'Picking the next token at random, with each token’s chance equal to its probability.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['ids["Context: token ids so far, cropped to block_size 1024"] --> fwd["Forward pass through the model"]'],
				highlight: ['ids', 'fwd'],
				note: 'nanoGPT feeds the tokens so far into the model. If there are more than `block_size` tokens (1024 by default), it keeps only the last 1024. The model can only use what is in that window.'
			},
			{
				add: ['fwd --> logits["Logits: 50304 scores for the next token"]'],
				highlight: ['logits'],
				note: 'The model returns one score per vocabulary entry for the last position. nanoGPT’s default vocabulary is 50304: GPT-2’s 50257 tokens padded to a multiple of 64.'
			},
			{
				add: ['logits -->|"divide by temperature, keep top_k"| probs["Softmax: probabilities that sum to 1"]'],
				highlight: ['probs'],
				note: 'Take three tokens with logits 2.0, 1.0 and 0.1. At temperature 1, softmax gives 0.659, 0.242 and 0.099. At temperature 0.5 the top token rises to 0.864. With `top_k=2`, the third token is removed and the first two get 0.731 and 0.269.'
			},
			{
				add: ['probs -->|"torch.multinomial"| pick["One token drawn at random"]', 'pick -->|"append, repeat"| ids'],
				highlight: ['pick'],
				note: 'The program draws one token from the probabilities and appends it to the context. Then the loop runs again with one more token. A reply of 300 tokens is 300 trips round this loop.'
			},
			{
				add: ['pick --> stop["Stop: max_new_tokens in nanoGPT; end_turn or max_tokens in the API"]'],
				highlight: ['stop'],
				note: 'nanoGPT stops after `max_new_tokens`. The Messages API reports why it stopped in `stop_reason`: `"end_turn"` when the model reached "a natural stopping point", `"max_tokens"` when it hit your limit.'
			}
		]
	},
	example: {
		title: 'model.py: GPT.generate, the next-token loop',
		repo: 'karpathy/nanoGPT',
		url: `${NANOGPT}/model.py#L306-L330`,
		lang: 'python',
		code: `    def generate(self, idx, max_new_tokens, temperature=1.0, top_k=None):
        """
        Take a conditioning sequence of indices idx (LongTensor of shape (b,t)) and complete
        the sequence max_new_tokens times, feeding the predictions back into the model each time.
        Most likely you'll want to make sure to be in model.eval() mode of operation for this.
        """
        for _ in range(max_new_tokens):
            # if the sequence context is growing too long we must crop it at block_size
            idx_cond = idx if idx.size(1) <= self.config.block_size else idx[:, -self.config.block_size:]
            # forward the model to get the logits for the index in the sequence
            logits, _ = self(idx_cond)
            # pluck the logits at the final step and scale by desired temperature
            logits = logits[:, -1, :] / temperature
            # optionally crop the logits to only the top k options
            if top_k is not None:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float('Inf')
            # apply softmax to convert logits to (normalized) probabilities
            probs = F.softmax(logits, dim=-1)
            # sample from the distribution
            idx_next = torch.multinomial(probs, num_samples=1)
            # append sampled index to the running sequence and continue
            idx = torch.cat((idx, idx_next), dim=1)

        return idx`,
		notes: [
			'Line 318, `logits[:, -1, :] / temperature`, keeps only the scores for the last position and divides them. Dividing by 0.5 doubles the gaps between scores, so softmax puts more weight on the top token.',
			'Lines 320 to 322 set every logit below the k-th best to minus infinity. After softmax those tokens have probability 0 and can never be drawn.',
			'Line 326, `torch.multinomial(probs, num_samples=1)`, is the random draw. [`sample.py`](' + NANOGPT + '/sample.py#L17-L19) runs it with `temperature = 0.8`, `top_k = 200` and `seed = 1337`, which it passes to `torch.manual_seed` so the random draws start from the same state each run.',
			'Line 328 appends the new token to `idx`. The next pass sees it as part of the context, which is how each token depends on the ones before it.'
		]
	},
	tradeoff: {
		gain: [
			'One loop produces any length of text: each pass adds one token, up to `max_new_tokens` or the API’s `max_tokens`.',
			'Sampling gives varied answers, so asking twice for names or test inputs returns different candidates.'
		],
		cost: [
			'Two calls with the same prompt can return different text. The Messages API reference says that "even with `temperature` of `0.0`, the results will not be fully deterministic."',
			'The model commits to each token as it goes. A wrong token at position 5 stays in the context for every later pass.',
			'On models released after Claude Opus 4.6, the API rejects `temperature` values other than 1.0, `top_p` below 0.99 and any `top_k`, with a 400 error.'
		]
	},
	task: {
		prompt: 'Three candidate tokens have logits 2.0 (" Paris"), 1.0 (" Lyon") and 0.1 (" the"). Compute their probabilities at temperature 1 and at temperature 2. Then say which ones `generate(..., top_k=1)` can return, and why that setting repeats itself.',
		hint: 'Softmax: divide each logit by the temperature, take `exp` of each, then divide each by their sum.',
		answer: [
			'Temperature 1: exp gives 7.39, 2.72 and 1.11, sum 11.21, so 0.659, 0.242 and 0.099.',
			'Temperature 2: dividing gives 1.0, 0.5 and 0.05, and softmax gives 0.502, 0.304 and 0.194. " the" goes from about 1 draw in 10 to about 1 in 5.',
			'With `top_k=1`, every logit below the best is set to minus infinity. " Paris" gets probability 1, so `torch.multinomial` always returns it.',
			'With `top_k=1` the loop takes the top token at every step, and the draw has no randomness left. On Claude models released after Opus 4.6 you cannot ask for this: the API rejects any `top_k`.'
		]
	},
	quiz: [
		{
			q: 'In nanoGPT’s `generate`, what does dividing the logits by `temperature = 0.5` do?',
			options: [
				'It halves the number of tokens the model can choose from',
				'It makes the most likely tokens even more likely after softmax',
				'It halves the number of new tokens the loop generates',
				'It makes every token equally likely after softmax'
			],
			answer: 1,
			why: 'Dividing by 0.5 doubles every logit, which doubles the gaps between them. Softmax is exponential in the logits, so the top token’s share grows: 0.659 to 0.864 in this chapter’s example.'
		},
		{
			q: 'You call a Claude model released after Opus 4.6 with `temperature: 0`. What happens?',
			options: [
				'The model answers greedily, picking the top token every time',
				'The API rejects the request with a 400 error',
				'The value is ignored and 1.0 is used silently',
				'The model answers with fully deterministic output'
			],
			answer: 1,
			why: 'The Messages API reference marks `temperature` as deprecated: for models released after Claude Opus 4.6, "A value of 1.0 will be accepted for backwards compatibility, all other values will be rejected with a 400 error."'
		},
		{
			q: 'Why can a reply that started with a wrong token keep going in the wrong direction?',
			options: [
				'Each sampled token is appended to the context the next pass reads',
				'The model reruns the whole reply at the end and keeps the worst version',
				'Temperature rises as the reply gets longer',
				'Top-k removes the right tokens after the first mistake'
			],
			answer: 0,
			why: '`idx = torch.cat((idx, idx_next), dim=1)` adds the drawn token to the input. Every later prediction is computed from a context that includes it.'
		}
	],
	recall: {
		q: 'What does the model output at each step, and which nanoGPT line picks the next token?',
		a: 'A score (logit) for every token in the vocabulary, 50304 in nanoGPT. Softmax turns them into probabilities, and `torch.multinomial(probs, num_samples=1)` draws one.'
	},
	sources: [
		{ title: 'karpathy/nanoGPT, model.py', url: `${NANOGPT}/model.py` },
		{ title: 'karpathy/nanoGPT, sample.py', url: `${NANOGPT}/sample.py` },
		{ title: 'Claude API reference, Create a Message (temperature, top_k, top_p, stop_reason), read 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages/create' }
	]
};
