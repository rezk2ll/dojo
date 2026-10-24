const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const CLS = `${CB}/capabilities/classification/evaluation`;
const BEST = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'xml-tags',
	part: 'Prompting',
	title: 'Structuring a prompt with XML tags',
	minutes: 10,
	hook: [
		'Your ticket classifier sends one prompt made of four parts pasted one after the other: the rules, ten category descriptions, five past tickets with their labels, and today\'s ticket. Nothing marks where one part ends and the next begins.',
		'The reply labels one of the past tickets, or it writes an answer to the customer. Your code expected one label, like `Billing Disputes`, and gets a paragraph.'
	],
	terms: [
		{ term: 'XML tag', def: 'A name in angle brackets placed around a block of text, like `<ticket>` and `</ticket>`. The model reads the name as a label for the block.' },
		{ term: 'Nesting', def: 'Tags inside tags: each `<example>` inside one `<examples>` block, or each `<document index="n">` inside `<documents>`.' },
		{ term: 'Output tag', def: 'A tag you ask the model to put its answer in, so your code can find the answer by searching for that tag.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['rules["Instruction: classify a support ticket into one of these categories"] --> cats["categories block: 10 category entries, each a label and a description"]'],
				highlight: ['rules', 'cats'],
				note: 'The cookbook classifier opens with one sentence of instruction, then the ten categories inside `<categories>`. Each entry is a `<category>` with a `<label>` and a `<content>`.'
			},
			{
				add: ['cats --> ticket["ticket block: today\'s customer text"]'],
				highlight: ['ticket'],
				note: 'Today\'s text goes inside `<ticket>`. The docs give the reason for one tag per kind of content: wrapping each type "in its own tag (for example, `<instructions>`, `<context>`, `<input>`) reduces misinterpretation."'
			},
			{
				add: ['ticket --> ex["examples block: 5 past tickets from the vector DB, each a query and a label"]'],
				highlight: ['ex'],
				note: 'The five nearest past tickets each sit in an `<example>`, all inside `<examples>`. The docs ask for exactly this, "so Claude can distinguish them from instructions."'
			},
			{
				add: ['ex --> reply["Reply: category tags around Billing Disputes"]', 'reply --> parse["transform.py: split on the category tag"]'],
				highlight: ['reply', 'parse'],
				note: 'The prompt ends with "Respond with just the label of the category between category tags." Then `transform.py` keeps only the text between `<category>` and `</category>` and hands it to the test.'
			}
		]
	},
	example: {
		title: 'capabilities/classification/evaluation/prompts.py: rag_classify, one tag per part',
		repo: 'anthropics/claude-cookbooks',
		url: `${CLS}/prompts.py#L83-L121`,
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
			'Line 3 asks the vector DB for the 5 past tickets closest to this one. The loop on lines 5 to 15 wraps each in `<example>`, with the past text in `<query>` and its known answer in `<label>`.',
			'The three `.replace` calls at the end fill `{{categories}}`, `{{ticket}}` and `{{examples}}`. The instruction text stays fixed, and only the tagged blocks change from one ticket to the next.',
			'The last prompt line names the output tag. [transform.py](' + CLS + '/transform.py#L1-L6) then runs `output.split("<category>")[1].split("</category>")[0].strip()`. If the reply has no `<category>`, the `[1]` raises, and the `except` returns the whole reply.',
			'Nothing in `prompts.py` escapes the ticket text. A ticket that contains the string `</ticket>` puts a second closing tag into the prompt, and the text after it sits outside the block.'
		]
	},
	tradeoff: {
		gain: [
			'The model gets a name for each block, so it can tell the five `<example>` tickets from the `<ticket>` it must label.',
			'One output tag turns parsing into one line of Python in `transform.py`, with a fallback when the tag is missing.',
			'`rag_classify` keeps the instruction of `simple_classify` word for word and adds one `<examples>` block. You can add or drop a block without rewriting the rest.'
		],
		cost: [
			'The ten categories carry 60 tag strings: an opening and a closing `<category>`, `<label>` and `<content>` each. You pay for those tokens on every ticket.',
			'`prompts.py` does not escape the ticket text. A customer who types `</ticket>` or `<category>` into a ticket gets those strings into your prompt unchanged (day 16 covers what an attacker can do with that).'
		]
	},
	task: {
		prompt: 'The same cookbook has a summarizer, `basic_summarize`: "You are a legal analyst known for highly accurate and detailed summaries of legal documents. Summarize the following text in bullet points. Focus on the main ideas and key details:" then `{text}`, then "Here is the summary of the legal document: <summary>". Rewrite it with tags so that the document, the instructions and the answer are each easy to find.',
		hint: 'Three changes: a tag around `{text}`, where the document goes compared to the instructions, and a tag the model puts its answer in.',
		answer: [
			'Wrap the document: `<document><source>sublease.txt</source><document_content>{text}</document_content></document>`. These are the tag names the docs use for documents.',
			'Put the document block first and the instruction after it. The docs ask for long documents "near the top of your prompt, above your query, instructions, and examples."',
			'End with an instruction such as "Write the summary inside <summary> tags.", then read the text between `<summary>` and `</summary>`. The original ends on an open `<summary>` in the user text and never asks for the closing tag your code would search for.',
			'The role sentence about a legal analyst can stay in the system prompt (day 11).'
		],
		steps: [
			{
				title: 'Read the original prompt',
				questions: [
					{ q: 'In `basic_summarize`, what marks where the document starts and ends?', options: ['Nothing: `{text}` sits between plain sentences', 'A `<document>` tag around `{text}`', 'A line of dashes before and after `{text}`', 'A separate user message for `{text}`'], answer: 0, why: 'The instruction, the document and the summary prompt run together with no tag between them.' },
					{ q: 'Where does the original put the instruction compared to the document?', options: ['After the document', 'Before the document', 'In the system prompt only', 'Inside the `<summary>` tag'], answer: 1, why: '"Summarize the following text..." comes first, then `{text}`.' },
					{ q: 'How does the original prompt end?', options: ['With "Write the summary inside <summary> tags."', 'On a closed `<summary></summary>` pair', 'On an open `<summary>`, with no request for the closing tag', 'With no tag at all'], answer: 2, why: 'It ends on "Here is the summary of the legal document: <summary>" and never asks for `</summary>`.' },
					{ q: 'Why do the docs want one tag per kind of content?', options: ['Tags cost fewer tokens than plain text', 'The API rejects text outside tags', 'The model skips any text outside tags', 'Wrapping each type in its own tag "reduces misinterpretation"'], answer: 3, why: 'A name on each block lets the model tell the document from the instructions.' }
				]
			},
			{
				title: 'Wrap the document',
				questions: [
					{ q: 'Which tag goes around the whole document?', options: ['`<summary>`', '`<text>`', '`<document>`', '`<legal>`'], answer: 2, why: '`<document>` is the tag name the docs use for a document.' },
					{ q: 'Where does the file name `sublease.txt` go?', options: ['In `<source>`', 'In `<document_content>`', 'In the `<summary>` tag', 'In the system prompt'], answer: 0, why: 'The docs put the file name in `<source>`, next to the text.' },
					{ q: 'Where does `{text}` go?', options: ['In `<source>`', 'In `<document_content>`', 'Right after the closing `</document>`', 'In the role sentence'], answer: 1, why: 'The document text sits in `<document_content>`, inside `<document>`.' },
					{ q: 'Later you summarize three files at once. What holds the three `<document index="n">` blocks?', options: ['`<examples>`', '`<summary>`', '`<categories>`', '`<documents>`'], answer: 3, why: 'The long context section shows `<documents>` holding one `<document index="n">` per file.' }
				]
			},
			{
				title: 'Put the document first',
				questions: [
					{ q: 'Where does the document block go now?', options: ['Above the instruction', 'Below the instruction', 'In the middle of the instruction', 'In a second request'], answer: 0, why: 'The docs ask for long documents "near the top of your prompt, above your query, instructions, and examples."' },
					{ q: 'After the move, what does the user text start with?', options: ['The instruction "Summarize the following text..."', 'The open `<summary>` tag', 'The legal analyst role', 'The `<document>` block'], answer: 3, why: 'The document comes first, the instruction after it.' },
					{ q: 'From one document to the next, what changes in your new prompt?', options: ['The instruction and the tag names', 'Only the text inside the `<document>` block', 'The output tag name', 'The role sentence'], answer: 1, why: 'Like in the cookbook classifier, the instruction stays fixed and only the tagged block changes.' },
					{ q: 'In the cookbook classifier, where does today\'s text go?', options: ['In `<example>`', 'In `<category>`', 'In `<ticket>`', 'In `<label>`'], answer: 2, why: 'Today\'s ticket sits in `<ticket>`, apart from the past tickets in `<example>`.' }
				]
			},
			{
				title: 'Name the output tag',
				questions: [
					{ q: 'How do you end the new prompt?', options: ['"Here is the summary of the legal document: <summary>"', 'With "Write the summary inside <summary> tags."', 'With "Respond with bullet points only."', 'With an empty `<summary></summary>` pair'], answer: 1, why: 'An instruction that names the tag asks the model for both the opening and the closing tag.' },
					{ q: 'What does your code read from the reply?', options: ['The text between `<summary>` and `</summary>`', 'The last line of the reply', 'Everything after the word "summary"', 'The text inside `<document_content>`'], answer: 0, why: 'One output tag turns parsing into one search for that tag.' },
					{ q: 'You parse like `transform.py`. The reply has no `<summary>`. What happens?', options: ['You get an empty string', 'You get the first bullet point', 'The API asks the model again', 'The `[1]` raises, and the `except` returns the whole reply'], answer: 3, why: '`split` returns a list of one item, so `[1]` raises an `IndexError`, and the `except` returns `output` unchanged.' },
					{ q: 'Where does "You are a legal analyst..." go?', options: ['Inside `<document>`', 'Inside `<summary>`', 'In the system prompt', 'After the instruction, at the end'], answer: 2, why: 'A role holds for the whole session, so it can stay in the system prompt (day 11).' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In `rag_classify`, why does each of the 5 retrieved tickets sit in an `<example>` tag inside `<examples>`?',
			options: [
				'The Messages API rejects a prompt that has more than one untagged block of text',
				'So the model can tell the past tickets apart from the instructions and today\'s ticket',
				'Tags cost fewer tokens than the same text written as plain paragraphs',
				'The model reads only the text inside tags and skips the rest of the prompt'
			],
			answer: 1,
			why: 'The docs ask for examples in `<example>` tags inside `<examples>` "so Claude can distinguish them from instructions". The tags are plain text that names each block. The API accepts any text, and the instruction outside the tags is read too.'
		},
		{
			q: 'The model replies "This is about a refund. Billing Disputes" with no tags. What does `transform.py` return?',
			options: [
				'The string `Billing Disputes`, found by matching each of the ten category names',
				'An empty string, because nothing sits between an opening and a closing tag',
				'The whole reply, after printing "Error in get_transform"',
				'Nothing: the `IndexError` propagates and the eval run stops on that ticket'
			],
			answer: 2,
			why: '`output.split("<category>")` returns a list of one item, so `[1]` raises an `IndexError`. The `except` prints the error and returns `output` unchanged.'
		},
		{
			q: 'You send three reports in one prompt. Which layout matches the structure the docs show?',
			options: [
				'One `<document index="n">` per report, with `<source>` and `<document_content>` inside',
				'The three reports pasted one after the other, each one starting with a line of dashes',
				'One `<documents>` tag holding the three reports joined into a single block of text',
				'Each report sent in its own user message, with no tags and no file names at all'
			],
			answer: 0,
			why: 'The long context section shows `<documents>` holding one `<document index="n">` per file, with the file name in `<source>` and the text in `<document_content>`. Each report then has its own block and its own name.'
		}
	],
	recall: {
		q: 'In the cookbook\'s `rag_classify`, which tags hold the ticket, the past examples and the answer?',
		a: '`<ticket>` holds today\'s text, `<examples>` holds 5 `<example>` blocks with `<query>` and `<label>`, and the model answers inside `<category>`, which `transform.py` cuts out with `split`.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices: Structure prompts with XML tags, read 2026-10-17', url: `${BEST}#structure-prompts-with-xml-tags` },
		{ title: 'Claude docs, Prompting best practices: Long context prompting, read 2026-10-17', url: `${BEST}#long-context-prompting` },
		{ title: 'anthropics/claude-cookbooks, classification prompts.py', url: `${CLS}/prompts.py` },
		{ title: 'anthropics/claude-cookbooks, classification transform.py', url: `${CLS}/transform.py` },
		{ title: 'anthropics/claude-cookbooks, summarization prompts.py', url: `${CB}/capabilities/summarization/evaluation/prompts.py#L1-L11` }
	]
};
