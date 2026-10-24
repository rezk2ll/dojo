const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'examples',
	part: 'Prompting',
	title: 'Showing examples',
	minutes: 10,
	hook: [
		'A Claude cookbook builds a classifier for insurance support tickets: 10 categories, each with a three-line definition, and Claude Haiku 4.5 at temperature 0. On 68 test tickets it gets 74% right. It puts none of the 7 "General Inquiries" tickets in that category.',
		'The next version adds one thing to the prompt: the 5 labeled tickets most similar to the one being classified. **Accuracy goes from 74% to 94%, and 5 of the 7 "General Inquiries" tickets now land in the right place.**'
	],
	terms: [
		{ term: 'Few-shot prompting', def: 'Putting a few solved examples of the task in the prompt, each an input with its expected output. Anthropic’s docs also call it multishot prompting.' },
		{ term: 'Retrieved examples', def: 'Examples chosen for each input at request time, by searching a labeled set for the entries closest to that input.' },
		{ term: 'Majority label bias', def: 'A model’s tendency to answer with the label that appears most often in the prompt’s examples.' },
		{ term: 'Recency bias', def: 'A model’s tendency to repeat the answers of the examples placed last in the prompt.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['zero["Prompt: 10 category definitions + the ticket"] -->|"Haiku 4.5, 68 tickets"| r1["74% right, General Inquiries 0 of 7"]'],
				highlight: ['zero', 'r1'],
				note: 'With definitions only, the model has to map each ticket onto a written description. "This charge seems wrong" and "I have a question about my bill" fit two definitions about bills. The cookbook says the confusion between similar categories "suggests Claude needs more context".'
			},
			{
				add: ['ex["examples: ticket text + its label, in example tags"] --> zero'],
				highlight: ['ex'],
				note: 'The docs: examples are "one of the most reliable ways to steer Claude\'s output format, tone, and structure". They ask for examples that are relevant, diverse and wrapped in `<example>` tags "so Claude can distinguish them from instructions". They suggest 3 to 5.'
			},
			{
				add: ['train[("68 labeled training tickets, embedded")] -->|"5 nearest by cosine similarity"| ex', 'zero --> r2["94% right, General Inquiries 5 of 7"]'],
				highlight: ['train', 'r2'],
				note: 'The cookbook picks new examples for every ticket. It embeds the 68 training tickets and, for each new ticket, finds "the 5 most similar training examples based on cosine similarity" (day 4). Each prompt shows the labels of tickets that look like the one at hand.'
			},
			{
				add: ['bad["4 examples: Positive, Positive, Positive, Negative"] -->|"GPT-3 2.7B, 2021 study"| r3["nearly 90% of answers Negative"]'],
				highlight: ['bad', 'r3'],
				note: 'Examples can also push the answer toward one label. In the "Calibrate Before Use" study, 3 Positive examples followed by 1 Negative made a 2.7B model answer Negative nearly 90% of the time. The last example outweighed the other three: recency bias beat majority label bias.'
			},
			{
				add: ['r3 --> fix["Balance the labels, vary the order, re-run the eval set"]'],
				highlight: ['fix'],
				note: 'The same study saw accuracy on one sentiment task range from 54% to 93% only by reordering the same examples. The Anthropic docs ask for examples that "vary enough that Claude doesn\'t pick up unintended patterns". Test each example set on your whole eval set (day 7), because one input cannot show a bias.'
			}
		]
	},
	example: {
		title: 'capabilities/classification/evaluation/prompts.py: rag_classify, 5 retrieved examples per ticket',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOK}/capabilities/classification/evaluation/prompts.py#L83-L121`,
		lang: 'python',
		code: `def rag_classify(context: dict):
    X = context["vars"]["text"]
    rag = vectordb.search(X, 5)
    rag_string = ""
    for example in rag:
        rag_string += textwrap.dedent(f"""
        <example>
            <query>
                "{example["metadata"]["text"]}"
            </query>
            <label>
                {example["metadata"]["label"]}
            </label>
        </example>
        """)
    prompt = (
        textwrap.dedent("""
    You will classify a customer support ticket into one of the following categories:
    <categories>
        {{categories}}
    </categories>

    Here is the customer support ticket:
    <ticket>
        {{ticket}}
    </ticket>

    Use the following examples to help you classify the query:
    <examples>
        {{examples}}
    </examples>

    Respond with just the label of the category between category tags.
    """)
        .replace("{{categories}}", categories)
        .replace("{{ticket}}", X)
        .replace("{{examples}}", rag_string)
    )
    return prompt`,
		notes: [
			'Line 3 asks the vector store for the 5 training tickets closest to the new ticket `X`. The examples change with every ticket, so a billing complaint gets billing examples.',
			'Lines 7 to 14 wrap each example in `<example>`, with the ticket text in `<query>` and the answer in `<label>`. The model sees the same shape for every example, and the tags keep example text apart from instructions.',
			'Lines 29 to 31 put all five inside `<examples>`, after the ticket. Line 33 asks for "just the label", and the examples show what a label looks like.',
			'The [guide notebook](' + COOK + '/capabilities/classification/guide.ipynb) runs the same prompts on 68 test tickets with Claude Haiku 4.5: 74% accuracy without examples, 94% with this function.'
		]
	},
	tradeoff: {
		gain: [
			'On the cookbook’s 68 test tickets, 5 retrieved examples raised accuracy from 74% to 94% with no change to the model.',
			'Retrieved examples match each input, so rare categories like "General Inquiries" get examples of their own when a ticket resembles them.',
			'Examples show the output shape, so the model answers with a bare label that your code can parse.'
		],
		cost: [
			'Every call carries 5 full tickets with their tags in its input, on top of the 10 category definitions.',
			'You need a labeled set to retrieve from (68 tickets here) and an embedding service. The cookbook notes VoyageAI’s limit of "3RPM for accounts without an associated credit card".',
			'Unbalanced or badly ordered examples move the answers toward one label: nearly 90% Negative from 3 Positive and 1 Negative example in the 2021 study.'
		]
	},
	task: {
		prompt: 'Your bug triage prompt has 4 fixed examples, in this order: `feature`, `feature`, `feature`, `bug`. On your 100-ticket eval set, 60 tickets are bugs, and the model labels 85 of the 100 as `bug`. Explain what likely happened and write the change you would test, with how you would measure it.',
		hint: 'Look at which label comes last, and how often each label appears in the examples compared with the eval set.',
		answer: [
			'The last example is `bug`, and the model over-predicts it: 85 `bug` answers for 60 real bugs. That fits recency bias, the pattern the 2021 study saw with Positive, Positive, Positive, Negative.',
			'Test a balanced set: 2 `bug` and 2 `feature` examples, then reorder them a few times (for example `bug`, `feature`, `bug`, `feature` and the reverse). Pick examples that differ in length and wording, as the docs ask.',
			'Run each version on the same 100 tickets and record accuracy and the count of `bug` answers. A good version gives close to 60 `bug` answers, and its accuracy changes little when you shuffle the order.',
			'If the fixed set keeps failing, retrieve the 4 labeled tickets nearest to each input, like `rag_classify` does with 5.'
		],
		steps: [
			{
				title: 'Read the numbers',
				questions: [
					{ q: 'How many `bug` answers would a perfect model give on this eval set?', options: ['60', '85', '25', '100'], answer: 0, why: '60 of the 100 tickets are bugs.' },
					{ q: 'By how much does the model over-predict `bug`?', options: ['15 tickets', '25 tickets', '40 tickets', '85 tickets'], answer: 1, why: '85 `bug` answers for 60 real bugs: 25 too many.' },
					{ q: 'How many of the 4 examples are `bug`, and where?', options: ['3, the first three', '2, in the middle', '1, the last one', 'None of them'], answer: 2, why: 'The order is `feature`, `feature`, `feature`, `bug`.' },
					{ q: 'Most examples are `feature`. Which way would majority label bias push the answers?', options: ['Toward `feature`', 'Toward `bug`', 'Toward a balance', 'Toward refusals'], answer: 0, why: 'Majority label bias favours the label seen most in the examples. You see the opposite, so something else is winning.' }
				]
			},
			{
				title: 'Name the bias',
				questions: [
					{ q: 'Which bias fits 85 `bug` answers?', options: ['Majority label bias: most examples are `feature`', 'Context rot from a long prompt', 'A hallucinated label', 'Recency bias: the last example is `bug`'], answer: 3, why: 'The model repeats the answer of the example placed last.' },
					{ q: 'You only swap the last two examples: `feature`, `feature`, `bug`, `feature`. Which way does recency bias now push?', options: ['Toward `feature`', 'Toward `bug`', 'Nowhere: the labels are the same', 'Toward refusals'], answer: 0, why: 'Recency bias repeats the label of the last example, now `feature`. Majority label bias pushes the same way, so the model would likely miss bugs instead.' },
					{ q: 'In that study, which bias won?', options: ['Majority label bias beat recency bias', 'Recency bias beat majority label bias', 'The two cancelled out', 'Neither showed up with only 4 examples'], answer: 1, why: 'The last example outweighed the other three.' },
					{ q: 'In the same study, how far did accuracy move only by reordering the same examples?', options: ['Less than 1 point', 'From 74% to 94%', 'From 54% to 93%', 'From 85% to 90%'], answer: 2, why: 'Order alone can make or break a few-shot prompt. 74% to 94% is the cookbook’s retrieval result, not the order effect.' }
				]
			},
			{
				title: 'Write the change',
				questions: [
					{ q: 'How many of each label go in the new set?', options: ['2 `bug` and 2 `feature`', '3 `bug` and 1 `feature`', '4 `feature`', '1 `bug` first, then 3 `feature`'], answer: 0, why: 'A balanced set takes away the pull of the majority label.' },
					{ q: 'Which order do you test?', options: ['Only `feature`, `feature`, `bug`, `bug`', 'Only the first order you write', '`bug` last, since bugs are the majority', 'Several, such as `bug`, `feature`, `bug`, `feature` and the reverse'], answer: 3, why: 'One order cannot show a recency effect. Comparing a few orders can.' },
					{ q: 'What should the examples look like?', options: ['All the same length and wording', 'Different in length and wording', 'Copied from the eval set', 'As short as possible'], answer: 1, why: 'The docs ask for examples that "vary enough that Claude doesn\'t pick up unintended patterns".' },
					{ q: 'Each example pairs a ticket with its bare label. What does that teach the model besides which label to pick?', options: ['The temperature to use', 'How many tickets the eval set holds', 'The shape of the answer: a bare label your code can parse', 'Nothing: the model ignores the labels of examples'], answer: 2, why: 'The docs call examples "one of the most reliable ways to steer Claude\'s output format, tone, and structure". `rag_classify` asks for "just the label", and its examples show what one looks like.' }
				]
			},
			{
				title: 'Measure it',
				questions: [
					{ q: 'What do you run each version on?', options: ['The same 100 tickets', 'A new random set each time', 'One tricky ticket', 'The 4 examples themselves'], answer: 0, why: 'The same eval set makes the versions comparable. One input cannot show a bias.' },
					{ q: 'Which two numbers do you record for each version?', options: ['Latency and cost', 'Accuracy and the count of `bug` answers', 'Prompt length and output length', 'Number of examples and temperature'], answer: 1, why: 'Accuracy says how good it is. The `bug` count shows whether the bias is gone.' },
					{ q: 'What does a good version show?', options: ['85 `bug` answers, as before', '100 `bug` answers', 'Exactly 50 `bug` answers', 'Close to 60 `bug` answers, and accuracy that barely moves when you shuffle the order'], answer: 3, why: 'The real share of bugs is 60. A stable accuracy across orders means order no longer drives the answer.' },
					{ q: 'The fixed set keeps failing. What do you try next?', options: ['Add 20 more `bug` examples', 'Remove every example', 'Retrieve the 4 labeled tickets nearest to each input', 'Raise the temperature'], answer: 2, why: 'Retrieved examples match each input, as `rag_classify` does with 5. That took the cookbook from 74% to 94%.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In the cookbook classifier, what took Claude Haiku 4.5 from 74% to 94% on 68 tickets?',
			options: [
				'Switching from temperature 0 to temperature 0.8',
				'Adding the 5 most similar labeled tickets as examples',
				'Rewriting the 10 category definitions in more detail',
				'Moving from Haiku 4.5 to a larger model tier'
			],
			answer: 1,
			why: '`rag_classify` searches 68 embedded training tickets for the 5 nearest to each input and puts them in `<examples>` with their labels. The definitions, model and temperature stay as in `simple_classify`.'
		},
		{
			q: 'Four sentiment examples are ordered Positive, Positive, Positive, Negative. What did the "Calibrate Before Use" study find?',
			options: [
				'The model answered Positive about 75% of the time, like the examples',
				'The order had no effect once there were 4 examples',
				'The model answered Negative nearly 90% of the time',
				'The model refused to answer when the examples disagreed'
			],
			answer: 2,
			why: 'The model tends to repeat answers placed near the end of the prompt (recency bias). Here that tendency outweighed the 3 to 1 majority of Positive examples.'
		},
		{
			q: 'How many examples does Anthropic’s prompting guide suggest, and how should they be marked?',
			options: [
				'One example, written inside the system prompt',
				'3 to 5 examples, wrapped in `<example>` tags',
				'At least 20 examples, one per line with no tags',
				'As many as fit, placed after the final question'
			],
			answer: 1,
			why: 'The guide says to include 3 to 5 examples "for best results" and to wrap them in `<example>` tags, with several in `<examples>`, "so Claude can distinguish them from instructions".'
		}
	],
	recall: {
		q: 'What did 5 retrieved examples do to the cookbook ticket classifier, and what can the order of examples do?',
		a: 'Accuracy went from 74% to 94% on 68 tickets with Haiku 4.5. Order matters: Positive, Positive, Positive, Negative made a 2021 model answer Negative nearly 90% of the time.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices (Use examples effectively), read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices' },
		{ title: 'anthropics/claude-cookbooks, Classification guide notebook', url: `${COOK}/capabilities/classification/guide.ipynb` },
		{ title: 'Zhao et al. 2021, Calibrate Before Use: Improving Few-Shot Performance of Language Models, read 2026-10-17', url: 'https://arxiv.org/abs/2102.09690' }
	]
};
