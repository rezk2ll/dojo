const NANO = 'https://github.com/karpathy/nanoGPT/blob/3adf61e154c3fe3fca428ad6bc3818b27a3b8291';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'training',
	part: 'How models work',
	title: 'How a model is trained',
	minutes: 10,
	hook: [
		'In the InstructGPT paper (2022), the authors gave GPT-3 175B a short Python function and asked: "What is the purpose of the list C in the code below?" The model did not answer. It wrote four options, "A. to store the value of C[0]" to "D. to store the value of C[i - 1]", like a page of a quiz book.',
		'The same model after three more training steps, called InstructGPT, answered the question in plain sentences. Same architecture, same 175B parameters. **The difference is the training done after pretraining, on prompts and answers from people.**'
	],
	terms: [
		{ term: 'Pretraining', def: 'Training a model to predict the next token on a large amount of raw text. The result is a base model that continues text.' },
		{ term: 'SFT', def: 'Supervised fine-tuning: more training of the base model on prompts paired with answers that people wrote.' },
		{ term: 'RLHF', def: 'Reinforcement learning from human feedback: people rank model answers, a reward model learns to predict those rankings, and the model is trained to get a high reward.' },
		{ term: 'Constitutional AI', def: 'Anthropic’s method where a model critiques and revises its own answers, and labels which answer is less harmful, using a written list of principles.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['web[("Raw text: web pages, books, code")] -->|"predict the next token"| base["Base model"]'],
				highlight: ['web', 'base'],
				note: 'Pretraining shows the model a window of tokens and scores its guess for each next token. nanoGPT’s README says it reproduces GPT-2 (124M) on OpenWebText in "about 4 days" on one node of 8 A100 GPUs. Nobody writes answers for this step: the next token in the text is the target.'
			},
			{
				add: ['base -->|"continues the text"| quiz["Prompt: What is the purpose of the list C? Output: A. B. C. D."]'],
				highlight: ['quiz'],
				note: 'A base model writes what is likely to come next in its training text. After a question about code, a quiz page with four options is likely text. The InstructGPT paper notes that GPT-3 answers this code question "about 50% of the time".'
			},
			{
				add: ['demo["13k prompts with answers written by labelers"] -->|"same next-token loss"| sft["SFT model"]', 'base --> sft'],
				highlight: ['demo', 'sft'],
				note: 'Step 1 of InstructGPT is SFT. A team of 40 contractors wrote the wanted answer for about 13k training prompts. The model trains on these pairs with the same loss as pretraining, so it learns the shape of a question followed by an answer.'
			},
			{
				add: ['rank["33k prompts: labelers rank 4 to 9 answers"] --> rm["Reward model: prompt + answer in, one number out"]', 'sft --> rank'],
				highlight: ['rank', 'rm'],
				note: 'Step 2 trains a reward model. Labelers rank between 4 and 9 answers from the SFT model for each prompt. A 6B model learns to output a higher score for the answer people preferred.'
			},
			{
				add: ['rm -->|"reward"| ppo["PPO on 31k prompts, KL penalty to the SFT model"]', 'sft --> ppo', 'ppo --> inst["InstructGPT"]'],
				highlight: ['ppo', 'inst'],
				note: 'Step 3 is RLHF with the PPO algorithm. The model writes answers to 31k prompts and is pushed toward a higher reward. A per-token KL penalty keeps it close to the SFT model, so it cannot drift into text that only fools the reward model.'
			},
			{
				add: ['rules["16 written principles"] --> fb["Feedback model picks the less harmful of 2 answers"]', 'fb -->|"AI labels replace human harm labels"| rm'],
				highlight: ['rules', 'fb'],
				note: 'Constitutional AI changes where the harmlessness labels come from. A feedback model reads two answers and a principle drawn at random from 16, then picks one. People still write the helpfulness labels, as in RLHF. Anthropic calls this "RL from AI Feedback" (RLAIF).'
			}
		]
	},
	example: {
		title: 'train.py: get_batch, where the target is the next token',
		repo: 'karpathy/nanoGPT',
		url: `${NANO}/train.py#L116-L131`,
		lang: 'python',
		code: `def get_batch(split):
    # We recreate np.memmap every batch to avoid a memory leak, as per
    # https://stackoverflow.com/questions/45132940/numpy-memmap-memory-usage-want-to-iterate-once/61472122#61472122
    if split == 'train':
        data = np.memmap(os.path.join(data_dir, 'train.bin'), dtype=np.uint16, mode='r')
    else:
        data = np.memmap(os.path.join(data_dir, 'val.bin'), dtype=np.uint16, mode='r')
    ix = torch.randint(len(data) - block_size, (batch_size,))
    x = torch.stack([torch.from_numpy((data[i:i+block_size]).astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy((data[i+1:i+1+block_size]).astype(np.int64)) for i in ix])
    if device_type == 'cuda':
        # pin arrays x,y, which allows us to move them to GPU asynchronously (non_blocking=True)
        x, y = x.pin_memory().to(device, non_blocking=True), y.pin_memory().to(device, non_blocking=True)
    else:
        x, y = x.to(device), y.to(device)
    return x, y`,
		notes: [
			'Line 5 opens `train.bin`: the whole dataset as one long row of GPT-2 token ids, stored as `uint16`. The GPT-2 vocabulary has 50,257 tokens, so each id fits in 16 bits.',
			'Line 8 picks `batch_size` random start points, 12 by default, and line 9 cuts `block_size` tokens from each: 1024 by default. The windows cross document boundaries, and nobody has labeled them.',
			'Line 10 builds the targets `y` from the same data, shifted one token to the right. Position 0 of `y` is the token after position 0 of `x`, so every position in the window is one training example.',
			'The model compares its predictions with `y` using [`F.cross_entropy`](' + NANO + '/model.py#L184-L187), in `model.py`. SFT reuses this loop: the README says "Finetuning is no different than training", with a pretrained start and a smaller learning rate (`3e-5` in `config/finetune_shakespeare.py` against `6e-4` in `train.py`).'
		]
	},
	tradeoff: {
		gain: [
			'Labelers preferred answers from the 1.3B InstructGPT over the 175B GPT-3, a model with over 100 times more parameters.',
			'On tasks where the answer must come from the input, like summaries, InstructGPT made up information 21% of the time against 41% for GPT-3.',
			'Constitutional AI trained a harmless assistant with no human labels for harmfulness. The paper: "The only human oversight is provided through a list of rules or principles".'
		],
		cost: [
			'RLHF lowered scores on public benchmarks such as SQuAD, DROP, HellaSwag and WMT 2015 French to English translation. The paper calls this an "alignment tax" and reduces it by mixing pretraining updates into PPO.',
			'The model learns the preferences of "a specific group of people (mostly our labelers and researchers)", in the paper’s words, and not some general idea of human values.',
			'The reward model is a learned guess of human preference. Without the KL penalty, PPO can find answers that score high and that people would not prefer.'
		]
	},
	task: {
		prompt: 'Your `train.bin` holds the token ids `[10, 20, 30, 40, 50, 60]` and `block_size` is 4. `get_batch` draws the start point `i = 1`. Write the `x` and `y` it returns for that row, and say how many next-token predictions the loss scores for it. Then say which training step from the diagram would stop the model from answering a question with a list of quiz options.',
		hint: 'Line 9 slices `data[i:i+block_size]`, line 10 slices `data[i+1:i+1+block_size]`.',
		answer: [
			'`x = [20, 30, 40, 50]` and `y = [30, 40, 50, 60]`. Each position of `y` is the token that follows the same position in `x`.',
			'The loss scores 4 predictions for this row: after `20` predict `30`, after `20 30` predict `40`, and so on up to `60`.',
			'SFT is the first step that helps: the model trains on about 13k prompts paired with written answers, so after a question, an answer is the likely next text. RLHF then trains on rankings of those answers.'
		],
		steps: [
			{
				title: 'Slice `x`',
				questions: [
					{ q: 'Which slice builds `x`?', options: ['`data[i:i+block_size]`', '`data[i+1:i+1+block_size]`', '`data[0:block_size]`', '`data[i:i+block_size+1]`'], answer: 0, why: 'Line 9 cuts `block_size` tokens starting at the random start point `i`.' },
					{ q: 'With `i = 1`, where does `x` start?', options: ['At index 0, token 10', 'At index 1, token 10', 'At index 1, token 20', 'At index 2, token 30'], answer: 2, why: 'Python indexes from 0, so index 1 of `[10, 20, 30, 40, 50, 60]` is 20.' },
					{ q: 'What is `x`?', options: ['`[10, 20, 30, 40]`', '`[20, 30, 40, 50]`', '`[30, 40, 50, 60]`', '`[20, 30, 40, 50, 60]`'], answer: 1, why: '`data[1:5]` takes indices 1 to 4: four tokens, one `block_size`.' },
					{ q: 'Why could `get_batch` never draw `i = 3` for this data?', options: ['Start points must be odd numbers', 'Index 3 marks the end of a document', '`block_size` has to divide `i`', '`torch.randint(len(data) - block_size, ...)` only draws 0 or 1'], answer: 3, why: '6 - 4 is 2, so the start is below 2. That leaves room for `y`, one token further right.' }
				]
			},
			{
				title: 'Slice `y`',
				questions: [
					{ q: 'Which slice builds `y`?', options: ['`data[i:i+block_size]`', '`data[i+1:i+1+block_size]`', '`data[i-1:i-1+block_size]`', '`data[i+block_size]`'], answer: 1, why: 'Line 10 takes the same window shifted one token to the right.' },
					{ q: 'What is `y`?', options: ['`[30, 40, 50, 60]`', '`[20, 30, 40, 50]`', '`[60]`', '`[40, 50, 60, 10]`'], answer: 0, why: '`data[2:6]` takes indices 2 to 5.' },
					{ q: 'What is at position 0 of `y`?', options: ['The same token as position 0 of `x`: 20', 'The last token of the window: 60', 'The token after position 0 of `x`: 30', 'A label a person wrote for the window'], answer: 2, why: 'Each position of `y` is the token that follows the same position in `x`.' },
					{ q: 'If `get_batch` had drawn `i = 0` instead, what would `y` be?', options: ['`[10, 20, 30, 40]`', '`[30, 40, 50, 60]`', '`[20, 30, 40, 50, 60]`', '`[20, 30, 40, 50]`'], answer: 3, why: '`data[1:5]` takes indices 1 to 4. It is the `x` of the row that starts at `i = 1`: the same tokens serve as input in one row and as targets in another.' }
				]
			},
			{
				title: 'Count the predictions',
				questions: [
					{ q: 'How many next-token predictions does the loss score for this row?', options: ['1', '4', '6', '5'], answer: 1, why: 'Every position in the window is one training example, and the window holds 4 tokens.' },
					{ q: 'Which is the first prediction?', options: ['After `20`, predict `30`', 'After `10`, predict `20`', 'After `20 30 40 50`, predict `60`', 'After `30`, predict `40`'], answer: 0, why: 'Position 0 of `x` is 20, and position 0 of `y` is 30.' },
					{ q: 'What does the model see for the last prediction?', options: ['Only `50`, to predict `60`', '`20 30 40 50`, to predict `60`', '`10 20 30 40 50`, to predict `60`', '`60`, to predict the next row'], answer: 1, why: 'Each prediction uses the tokens of the window up to that position: after `20 30` predict `40`, and so on up to `60`.' },
					{ q: 'Which function scores the predictions against `y`?', options: ['`torch.randint`', '`np.memmap`', '`F.cross_entropy`', '`torch.stack`'], answer: 2, why: 'The model compares its predictions with `y` using `F.cross_entropy` in `model.py`.' }
				]
			},
			{
				title: 'Pick the training step',
				questions: [
					{ q: 'Why does a base model answer a code question with "A. B. C. D."?', options: ['After a question, a quiz page is likely text', 'It was trained on purpose to write quiz options', 'It cannot read code', 'Its `block_size` is too small for the question'], answer: 0, why: 'A base model writes what is likely to come next in its training text.' },
					{ q: 'Which step from the diagram is the first to stop this?', options: ['More pretraining on web text', 'SFT', 'The reward model', 'Constitutional AI'], answer: 1, why: 'SFT is the first step that shows the model a question followed by a written answer.' },
					{ q: 'nanoGPT fine-tunes from a pretrained model. Which learning rate does `config/finetune_shakespeare.py` set?', options: ['`6e-4`, the same as `train.py`', '`3e-3`, 5 times the one in `train.py`', 'None: fine-tuning copies the answers without training', '`3e-5`, smaller than the `6e-4` in `train.py`'], answer: 3, why: 'The model already knows the language, so fine-tuning takes smaller steps: `3e-5` in `config/finetune_shakespeare.py` against `6e-4` in `train.py`.' },
					{ q: 'Which loss does SFT use?', options: ['A ranking loss over pairs of answers', 'A reward from PPO', 'The same next-token loss as pretraining', 'A KL penalty only'], answer: 2, why: 'The nanoGPT README says "Finetuning is no different than training": same loop, a pretrained start and a smaller learning rate.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In nanoGPT’s pretraining loop, what does the loss compare the model’s output with?',
			options: [
				'Answers that labelers wrote for each prompt in the dataset',
				'A score from a reward model trained on human rankings',
				'The next token in the same text, taken from `y` shifted by one',
				'The output of a larger teacher model on the same window'
			],
			answer: 2,
			why: '`get_batch` builds `y` from `data[i+1:i+1+block_size]`, the same tokens moved one step right. `F.cross_entropy` scores the model’s probability for each of those next tokens. Written answers only arrive at the SFT step.'
		},
		{
			q: 'What do InstructGPT’s labelers produce to train the reward model?',
			options: [
				'One written answer per prompt, used as the target text',
				'A ranking of 4 to 9 model answers for the same prompt',
				'A score from 1 to 10 typed for each single answer',
				'A list of principles the model must follow'
			],
			answer: 1,
			why: 'Labelers rank between K = 4 and K = 9 answers, which gives every pair of answers as a comparison. The reward model learns to give the preferred answer of each pair a higher number. Written answers are the SFT data, and principles belong to Constitutional AI.'
		},
		{
			q: 'In Constitutional AI’s RL phase, where do the harmlessness labels come from?',
			options: [
				'Crowdworkers who compare two answers and pick the safer one',
				'A keyword filter that flags answers with banned words',
				'The labelers who wrote the SFT answers, rating a second time',
				'A feedback model that picks between two answers using a principle'
			],
			answer: 3,
			why: 'The feedback model sees the conversation, two answers and one principle sampled from 16, and its probabilities for (A) and (B) give the label. Humans still provide the helpfulness labels, as in RLHF. A preference model trained on these labels then gives the reward for RL.'
		}
	],
	recall: {
		q: 'Which three steps did InstructGPT add after pretraining, and how many prompts did each use?',
		a: 'SFT on about 13k prompts with written answers, a reward model trained on rankings for 33k prompts, then PPO against that reward on 31k prompts.'
	},
	sources: [
		{ title: 'Ouyang et al. 2022, Training language models to follow instructions with human feedback (InstructGPT), read 2026-10-17', url: 'https://arxiv.org/abs/2203.02155' },
		{ title: 'Bai et al. 2022, Constitutional AI: Harmlessness from AI Feedback, read 2026-10-17', url: 'https://arxiv.org/abs/2212.08073' },
		{ title: 'Anthropic, Claude’s Constitution, read 2026-10-17', url: 'https://www.anthropic.com/news/claudes-constitution' },
		{ title: 'karpathy/nanoGPT README (finetuning section)', url: `${NANO}/README.md` },
		{ title: 'karpathy/nanoGPT config/finetune_shakespeare.py', url: `${NANO}/config/finetune_shakespeare.py` }
	]
};
