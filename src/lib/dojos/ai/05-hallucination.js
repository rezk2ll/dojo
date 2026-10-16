const COOKBOOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const PAPER = 'https://arxiv.org/abs/2406.10279';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'hallucination',
	part: 'How models work',
	title: 'Confident and wrong',
	minutes: 10,
	hook: [
		'You ask a model for a script that edits a YAML file and keeps its comments. The answer imports a package with a sensible name, calls three of its functions, and explains each one. `pip install` finds no package with that name.',
		'Spracklen et al. generated 576,000 code samples with 16 models and found **205,474 unique package names that do not exist**. The rate was at least 5.2% for commercial models and 21.7% for open-source ones.'
	],
	terms: [
		{ term: 'Hallucination', def: 'Text that is "factually incorrect or inconsistent with the given context", in the words of Anthropic’s guide.' },
		{ term: 'Package hallucination', def: 'Generated code that imports or recommends a package that does not exist in the registry.' },
		{ term: 'Grounding', def: 'Putting the source text in the context and asking the model to answer only from it, with quotes.' },
		{ term: 'Citation', def: 'A pointer from a sentence of the answer to the passage of a provided document that supports it. The Claude API returns it as `cited_text` plus a location.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['q["Prompt: parse YAML and keep comments"] --> gen["Model predicts likely next tokens"]'],
				highlight: ['q', 'gen'],
				note: 'The model writes tokens that are probable after the prompt, one at a time (day 2). No step in that loop looks a package name up on PyPI, so a name that does not exist can come out like any other.'
			},
			{
				add: ['gen --> fake["import of a package that does not exist"]'],
				highlight: ['fake'],
				note: 'The paper defines it: package hallucination "occurs when an LLM generates code that recommends or contains a reference to a package that does not actually exist."'
			},
			{
				add: ['fake -->|"same prompt, 10 runs"| rep["43% of fake names came back in all 10 runs"]', 'rep --> atk["An attacker publishes that name with malicious code"]'],
				highlight: ['rep', 'atk'],
				note: 'The authors took 500 prompts that had produced a fake package and ran each one 10 more times. 43% of the fake packages appeared in all 10 runs, and 39% never came back. A name that repeats is one an attacker can predict, register on the registry, and wait for.'
			},
			{
				add: ['docs["Docs or code put in the context"] --> ground["Answer only from them, quote first"]', 'ground --> idk["Allowed: I don’t know"]'],
				highlight: ['docs', 'ground', 'idk'],
				note: 'Anthropic’s guide starts with three fixes. Give Claude "permission to admit uncertainty" in the prompt. For documents over 20k tokens, ask it "to extract word-for-word quotes first". The advanced list adds an instruction to use only the provided documents and "not its general knowledge".'
			},
			{
				add: ['ground --> cite["Citations: each claim points at a passage"]', 'cite --> check["You check the cited passages and the uncited sentences"]'],
				highlight: ['cite', 'check'],
				note: 'With citations enabled, the API extracts `cited_text` itself, so citations "are guaranteed to contain valid pointers to the provided documents". Sentences that carry no citation are the model’s own words, and you check those by hand.'
			}
		]
	},
	example: {
		title: 'misc/using_citations.ipynb: help-center answers with citations enabled',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOKBOOK}/misc/using_citations.ipynb?plain=1#L132-L168`,
		lang: 'python',
		code: `articles_dir = "./data/help_center_articles"
documents = []

for filename in sorted(os.listdir(articles_dir)):
    if filename.endswith(".txt"):
        with open(os.path.join(articles_dir, filename)) as f:
            content = f.read()
            # Split into title and body
            title_line, body = content.split("\\n", 1)
            title = title_line.replace("title: ", "")
            documents.append(
                {
                    "type": "document",
                    "source": {"type": "text", "media_type": "text/plain", "data": body},
                    "title": title,
                    "citations": {"enabled": True},
                }
            )

QUESTION = "I just checked out, where is my order tracking number? Track package is not available on the website yet for my order."

# Add the question to the content
content = documents

response = client.messages.create(
    model="claude-sonnet-4-6",
    temperature=0.0,
    max_tokens=1024,
    system="You are a customer support bot working for PetWorld. Your task is to provide short, helpful answers to user questions. Since you are in a chat interface avoid providing extra details. You will be given access to PetWorld's help center articles to help you answer questions.",
    messages=[
        {"role": "user", "content": documents},
        {
            "role": "user",
            "content": [{"type": "text", "text": f"Here is the user's question: {QUESTION}"}],
        },
    ],
)`,
		notes: [
			'The loop turns each help-center article into a `document` block, and `"citations": {"enabled": True}` asks the API to attach pointers into it. The notebook says plain text "will get automatically chunked into sentences".',
			'The documents go in the first user turn and the question in the second. Each cited sentence of the answer can then be traced back to one of those articles.',
			'The saved output has 3 text blocks. The middle one carries two citations from "Order Tracking Information", including "If you haven\'t received a tracking number within 48 hours of your order confirmation, please contact our customer support team."',
			'The last block, "your order likely hasn\'t shipped yet", has no citation. It is the model’s inference, and your UI can show it differently from the cited sentences.'
		]
	},
	tradeoff: {
		gain: [
			'Every cited sentence links to a passage the reader can open, and the API guarantees the pointer is into a document you sent.',
			'The docs say `cited_text` "does not count toward your output tokens", so citations can cost less than a prompt that asks Claude to write out the quotes.'
		],
		cost: [
			'Grounding needs the source in the context: for a package question, you fetch the real docs or the installed code before asking.',
			'Citations cover only the sentences that carry one. Uncited blocks, like the cookbook’s "likely hasn\'t shipped yet", still need a human or a check.',
			'Anthropic’s guide warns that these techniques "don\'t eliminate them entirely" and asks you to validate critical information.'
		]
	},
	task: {
		prompt: 'A model wrote `import yamlkeeper` and `yamlkeeper.load_with_comments(path)` for you. Write down, in order, the checks you run before `pip install`, then rewrite your prompt so the next answer is grounded.',
		hint: 'One check is about the registry, one about the code you already have. For the prompt, use the three basic strategies from Anthropic’s guide.',
		answer: [
			'Check the registry first: `pip index versions yamlkeeper` prints "No matching distribution found for yamlkeeper", and `https://pypi.org/pypi/yamlkeeper/json` returns 404 (checked 2026-10-17). The model invented the import. If a package with that name did exist, check its age, author and download count before installing, since an attacker can register a name models repeat.',
			'Then check whether a library you already depend on does the job. Grep your lockfile for a YAML library and read its docs for comment handling.',
			'Rewrite the prompt with the library’s real docs pasted in `<docs>` tags. Ask the model to quote the functions it uses from those docs, to use no package outside them, and to say "I don’t know" if the docs do not cover keeping comments.',
			'Run the new answer and check every function it calls exists in the quoted docs. A function that appears in the code but not in the quotes came from the model, so treat it as unverified.'
		]
	},
	quiz: [
		{
			q: 'Why does it matter that 43% of hallucinated package names came back in all 10 runs of the same prompt?',
			options: [
				'An attacker can predict the name and publish a malicious package under it',
				'It proves the packages exist on a private registry the model saw',
				'It means that temperature has no effect on hallucinations',
				'It shows the model checks PyPI and caches the answer'
			],
			answer: 0,
			why: 'A name that repeats will be suggested to many users. The paper describes the attack: publish a package "with the same name as the hallucinated or fictitious package" containing malicious code, and wait for users to install it.'
		},
		{
			q: 'With the Citations feature enabled, what does the Claude API guarantee?',
			options: [
				'Every sentence of the answer is supported by a provided document',
				'Each citation points to a real location in a document you provided',
				'The model will refuse to answer if no document is relevant',
				'Cited text is checked against the web for accuracy'
			],
			answer: 1,
			why: 'The API parses citations and extracts `cited_text` itself, so citations "are guaranteed to contain valid pointers to the provided documents". Text blocks with no citation, like the cookbook’s last block, carry no such guarantee.'
		},
		{
			q: 'You ask Claude about a 60k-token contract. Which step does Anthropic’s guide recommend before the analysis?',
			options: [
				'Ask it to summarise the contract in 500 words first',
				'Raise the temperature so it explores more clauses',
				'Ask it to extract word-for-word quotes first',
				'Split the contract and ask each part separately'
			],
			answer: 2,
			why: 'For documents over 20k tokens, the guide says to "extract word-for-word quotes first before performing its task", so the analysis rests on text that is in the document.'
		}
	],
	recall: {
		q: 'What share of generated packages did the Spracklen et al. study find were hallucinated, and what are Anthropic’s three basic fixes?',
		a: 'At least 5.2% for commercial models and 21.7% for open-source ones. The fixes: allow "I don’t know", extract direct quotes first, and verify claims with citations.'
	},
	sources: [
		{ title: 'Claude docs, Reduce hallucinations, read 2026-10-17', url: 'https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations' },
		{ title: 'Claude docs, Citations, read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/citations' },
		{ title: 'Spracklen et al. 2024, We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs (arXiv 2406.10279)', url: PAPER },
		{ title: 'anthropics/claude-cookbooks, misc/using_citations.ipynb', url: `${COOKBOOK}/misc/using_citations.ipynb` }
	]
};
