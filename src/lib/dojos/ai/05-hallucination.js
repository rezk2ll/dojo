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
		],
		steps: [
			{
				title: 'Check the registry',
				questions: [
					{ q: 'What do you run first?', options: ['`pip install yamlkeeper`, to see if it works', '`pip index versions yamlkeeper`', 'A second prompt asking the model if the package is real', 'A search of the answer for a version number'], answer: 1, why: 'Check the registry before installing anything. Installing an unchecked name is what the attack waits for.' },
					{ q: 'It prints "No matching distribution found for yamlkeeper". What does that tell you?', options: ['The model invented the import', 'The package is private, so you need a token', 'PyPI is down, so try again later', 'The package was renamed to `yaml`'], answer: 0, why: 'No package with that name exists on PyPI. The model wrote a probable-looking name, and nothing in its loop looked it up.' },
					{ q: 'What does `https://pypi.org/pypi/yamlkeeper/json` return?', options: ['200, with an empty list of versions', 'A redirect to a similar package', '404', '403, because you are not logged in'], answer: 2, why: 'A 404 from the PyPI JSON API confirms there is no such project (checked 2026-10-17).' },
					{ q: 'Say a package named `yamlkeeper` did exist. What do you check before installing it?', options: ['Only that the name matches the import', 'That it has a README', 'Nothing: if it exists, it is safe', 'Its age, author and download count'], answer: 3, why: 'An attacker can register a name models repeat. 43% of fake names came back in all 10 runs of the same prompt.' }
				]
			},
			{
				title: 'Look at what you already have',
				questions: [
					{ q: 'What is the second check?', options: ['Whether a library you already depend on does the job', 'Whether the model gives the same name on a second run', 'Whether the function name sounds right', 'Whether another model suggests the same package'], answer: 0, why: 'Code you already have is real and installed. Start from it before looking for a new package.' },
					{ q: 'How do you find that library?', options: ['Ask the model to list your dependencies', 'Grep your lockfile for a YAML library', 'Search PyPI for "yaml" and take the first hit', 'Read the model’s explanation again'], answer: 1, why: 'The lockfile lists what is really installed. The model’s word about your dependencies is not a check.' },
					{ q: 'You find a YAML library in the lockfile. What do you read next?', options: ['Its changelog', 'Its license', 'Its docs on comment handling', 'Its star count'], answer: 2, why: 'The task is to keep comments, so the docs on comment handling tell you if this library does it.' },
					{ q: 'Why does getting the same name on a second run prove nothing?', options: ['43% of fake names came back in all 10 runs', 'The model only checks PyPI on the first run', 'The second run uses a smaller model', 'Repeated names are always real packages'], answer: 0, why: 'Fake names often repeat. That is what makes them predictable for an attacker.' }
				]
			},
			{
				title: 'Ground the prompt',
				questions: [
					{ q: 'What goes into the new prompt?', options: ['A longer description of what you want', 'The fake import, marked as wrong', 'A request to try harder', 'The library’s real docs, in `<docs>` tags'], answer: 3, why: 'Grounding needs the source in the context. The model can then answer from text you trust.' },
					{ q: 'Which instruction keeps the model inside those docs?', options: ['Be creative with the API', 'Use no package outside the docs', 'Use your general knowledge as well', 'Prefer the newest package you know'], answer: 1, why: 'Anthropic’s advanced list says to use only the provided documents and "not its general knowledge".' },
					{ q: 'What do you ask the model to quote?', options: ['The functions it uses, from the docs', 'The whole docs, back to you', 'Its reasoning, step by step', 'The PyPI page of the library'], answer: 0, why: 'A quote ties each function to a passage of the docs, so you can check it.' },
					{ q: 'What should the model do if the docs do not cover keeping comments?', options: ['Give its best guess at a function', 'Name a package that might do it', 'Say "I don’t know"', 'Return empty code with no message'], answer: 2, why: 'Anthropic’s first fix is to give the model "permission to admit uncertainty".' }
				]
			},
			{
				title: 'Check the new answer',
				questions: [
					{ q: 'What do you check when you run the new answer?', options: ['That every function it calls exists in the quoted docs', 'That it runs without a warning', 'That it is shorter than the first answer', 'That it uses the same names as before'], answer: 0, why: 'Running is not enough. Each call has to match a passage the model quoted.' },
					{ q: 'A function is in the code but not in the quotes. What is it?', options: ['Fine: the model saw it in training', 'Unverified: it came from the model', 'A private helper of the library', 'Proof that the docs are out of date'], answer: 1, why: 'Nothing in the context backs it, so it is the model’s own words until you check it.' },
					{ q: 'Do these techniques remove hallucinations?', options: ['Yes, once the model quotes first', 'Yes, at temperature 0', 'Only with citations enabled', 'No: Anthropic’s guide says they "don’t eliminate them entirely"'], answer: 3, why: 'The guide asks you to validate critical information anyway.' },
					{ q: 'With the Citations feature on, which sentences have no passage of your documents behind them?', options: ['The ones that carry no citation', 'Every cited sentence', 'Only the first sentence', 'None: every sentence gets a citation'], answer: 0, why: 'Citations are guaranteed to point into your documents. Uncited sentences are the model’s own words, and you check those by hand.' }
				]
			}
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
