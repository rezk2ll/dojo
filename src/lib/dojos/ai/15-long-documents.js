const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const GUIDE = `${CB}/capabilities/summarization/guide.ipynb`;
const BEST = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';
const CW = 'https://platform.claude.com/docs/en/build-with-claude/context-windows';
const CIT = 'https://platform.claude.com/docs/en/build-with-claude/citations';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'long-documents',
	part: 'Prompting',
	title: 'Working with long documents',
	minutes: 10,
	hook: [
		'You paste three sublease agreements into one prompt. Your question comes first, "What is the monthly rent in each lease?", then the three documents. The answer gives two rents and says the third lease does not state one. It does, in a clause halfway through the second document.',
		'The context windows docs name the effect: "As token count grows, accuracy and recall degrade, a phenomenon known as *context rot*." The three leases fit in the window, and the model can still miss a clause in the middle of them.'
	],
	terms: [
		{ term: 'Context rot', def: 'The drop in accuracy and recall as the number of tokens in the context grows, named in the context windows docs.' },
		{ term: 'Quote extraction', def: 'Asking the model to copy the passages that matter into `<quotes>` tags first, then to answer from those quotes.' },
		{ term: 'Chunking', def: 'Cutting a long text into pieces and sending each piece in its own request. The cookbook cuts every 2,000 characters.' },
		{ term: 'Citations', def: 'An API feature turned on with `citations.enabled=true` on each document block. Each claim in the answer comes back with the passage it rests on.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['docs["Top of the user turn: documents, each with source and document_content"] --> ask["Bottom: the question and the instructions"]'],
				highlight: ['docs', 'ask'],
				note: 'For inputs of 20k tokens and more, the docs say to put long documents "near the top of your prompt, above your query, instructions, and examples." They add: "Queries at the end can improve response quality by up to 30 percent in tests".'
			},
			{
				add: ['ask --> quotes["Step 1: copy the relevant passages into quotes tags"]'],
				highlight: ['quotes'],
				note: 'The docs\' example asks: "Find quotes from the patient records and appointment history that are relevant to diagnosing the patient\'s reported symptoms. Place these in <quotes> tags." Per the docs, this "helps Claude focus on the relevant content and ignore the rest of the document."'
			},
			{
				add: ['quotes --> answer["Step 2: answer from the quotes, in info tags"]'],
				highlight: ['answer'],
				note: 'The second half of the same instruction: "Then, based on these quotes, list all information that would help the doctor diagnose". You can check each line of the answer against a quote above it.'
			},
			{
				add: ['count{"Token count under the context window?"} -->|"yes"| docs', 'count -->|"no"| chunk["Chunk: summarize each piece, then combine the summaries"]'],
				highlight: ['count', 'chunk'],
				note: 'Opus 5.5, Sonnet 5.5 and Haiku 5.5 have a 1M-token window. On Haiku 5.5, prompts over 100,000 tokens cost more. An input over the window gets a 400 "prompt is too long". The token counting API tells you before you send.'
			}
		]
	},
	example: {
		title: 'capabilities/summarization/guide.ipynb: chunk, summarize each chunk, combine',
		repo: 'anthropics/claude-cookbooks',
		url: `${GUIDE}?plain=1#L777-L831`,
		lang: 'python',
		code: `def chunk_text(text, chunk_size=2000):
    return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]


def summarize_long_document(text, max_tokens=2000):
    chunks = chunk_text(text)

    # Iterate over chunks and summarize each one
    # We use guided_legal_summary here, but you can use basic_summarize or any other summarization function
    # Note that we'll also use haiku for the interim summaries, and the 3.5 sonnet for the final summary
    chunk_summaries = [
        guided_sublease_summary(chunk, model="claude-haiku-4-5", max_tokens=max_tokens)
        for chunk in chunks
    ]

    final_summary_prompt = f"""

    You are looking at the chunked summaries of multiple documents that are all related. Combine the following summaries of the document from different truthful sources into a coherent overall summary:

    {"".join(chunk_summaries)}
…
    Summary:
    """

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=max_tokens,
        system="You are a legal expert that summarizes notes on one document.",
        messages=[
            {"role": "user", "content": final_summary_prompt},
            {
                "role": "assistant",
                "content": "Here is the summary of the legal document: <summary>",
            },
        ],
        stop_sequences=["</summary>"],
    )

    return response.content[0].text`,
		notes: [
			'Line 2 slices the text every 2,000 characters with `text[i : i + chunk_size]`. The cut ignores sentences, so a rent clause can land half in one chunk and half in the next.',
			'Lines 11 to 14 summarize each chunk with `claude-haiku-4-5`. The final call only sees `"".join(chunk_summaries)`. A rent figure that a chunk summary left out cannot come back in the final summary.',
			'The `messages` list ends with an assistant turn, "Here is the summary of the legal document: <summary>", and `stop_sequences=["</summary>"]` ends the reply at the closing tag. The model is meant to continue that partial assistant text, a prefill. The best practices page: starting with Claude 4.6 models, "Requests with prefilled assistant messages to these models return a 400 error", and `claude-sonnet-4-6` is one of them.',
			'Without prefill, put "Write the summary inside <summary> tags" in the user turn and read the text between the tags (day 12), or use structured outputs (day 14).'
		]
	},
	tradeoff: {
		gain: [
			'One request with every document at the top and the question at the end lets the model compare the three leases directly. The docs measured "up to 30 percent" better answers with the query last.',
			'Quotes first give you a check: each claim in the answer should match a passage in `<quotes>`. With the citations feature, the API returns the passage and its location for you.',
			'Chunking handles input over the window, such as a pile of leases larger than 1M tokens.'
		],
		cost: [
			'A long prompt costs input tokens on every request. On Haiku 5.5, prompts over 100,000 tokens are billed at a higher rate.',
			'More tokens in context means more context rot: the docs say "more context isn\'t automatically better".',
			'Chunking with fixed 2,000-character cuts splits clauses, and a summary of summaries keeps only what each first summary kept.',
			'Citations add a little input: "system prompt additions and document chunking". The `cited_text` field does not count toward output tokens.'
		]
	},
	task: {
		prompt: 'Rewrite the hook\'s request for Sonnet 5.5: three leases, `lease_a.txt`, `lease_b.txt` and `lease_c.txt`, and the question "What is the monthly rent in each lease?". Give the layout of the user turn, the instruction, and say how you would check that the answer for lease B is not invented.',
		hint: 'Use the tag names the docs use for several documents, move the question, and ask for quotes before the answer.',
		answer: [
			'Top of the user turn: `<documents>` with three `<document index="n">` blocks, each with `<source>lease_a.txt</source>` and the text in `<document_content>`.',
			'After the documents: "Find the clauses that state the monthly rent in each lease and copy them into <quotes> tags, with the source file. Then give the rent per lease in <answer> tags. If a lease states no rent, say so."',
			'To check lease B: search the copied quote in `lease_b.txt`. If it is not there word for word, the answer is not grounded. With `citations.enabled=true` on plain text documents, the API returns character indices into the document, so your code can check the span itself.',
			'Before sending, run the token counting API on the request. If the count is under the 1M-token window of Sonnet 5.5, send one request and skip chunking.'
		],
		steps: [
			{
				title: 'Lay out the leases',
				questions: [
					{ q: 'Which tag holds the three leases together?', options: ['`<quotes>`', '`<documents>`', '`<answer>`', '`<leases>`'], answer: 1, why: 'The docs show `<documents>` holding one `<document index="n">` per file.' },
					{ q: 'What goes in `<source>` for the second lease?', options: ['The rent you expect', 'The index `2`', '`lease_b.txt`', 'The whole lease text'], answer: 2, why: '`<source>` holds the file name, so the model and you can tell the leases apart.' },
					{ q: 'The three leases fit in the window. Can the model still miss the rent clause halfway through lease B?', options: ['Yes: accuracy and recall drop as the token count grows', 'No: everything inside the window is read equally well', 'Only if the leases are PDFs', 'Only on Haiku 5.5'], answer: 0, why: 'The context windows docs call it context rot: "As token count grows, accuracy and recall degrade". That is why the layout and the quotes matter.' },
					{ q: 'From what input size do the docs give this long document layout advice?', options: ['Only past the 1M-token window', 'From 100,000 tokens', 'For any prompt, even one line', 'From 20k tokens and more'], answer: 3, why: 'The long context tips are for inputs of 20k tokens and more, which three full leases can reach.' }
				]
			},
			{
				title: 'Ask for quotes, then the rent',
				questions: [
					{ q: 'After the quotes, which tag does the instruction ask the rents to go in?', options: ['`<answer>`, one rent per lease', '`<quotes>`, next to the clauses', '`<document_content>`', '`<source>`'], answer: 0, why: 'The instruction asks for quotes first, then "the rent per lease in <answer> tags", so your code can tell the evidence from the result.' },
					{ q: 'What does the instruction ask for first?', options: ['A summary of each lease', 'The rent per lease in `<answer>` tags', 'The rent clauses copied into `<quotes>` tags, with the source file', 'A count of the clauses in each lease'], answer: 2, why: 'Quotes first, then the answer from those quotes.' },
					{ q: 'Why ask for the source file next to each copied clause?', options: ['The API rejects quotes without a file name', 'So you know which file to search each quote in', 'It lowers the input tokens of the request', 'It turns on the citations feature'], answer: 1, why: 'Three leases can hold similar clauses. With `lease_b.txt` next to the quote, you search the right file when you check lease B.' },
					{ q: 'A lease might state no rent. What does the instruction say?', options: ['Give the rent of the closest lease', 'Leave that lease out of the answer', 'Write 0 for that lease', 'If a lease states no rent, say so'], answer: 3, why: 'An explicit way out keeps the model from filling the gap with a made-up figure.' }
				]
			},
			{
				title: 'Check lease B',
				questions: [
					{ q: 'How do you check the rent the model gives for lease B?', options: ['Search the copied quote in `lease_b.txt`', 'Ask the model if it is sure', 'Compare it with the rents of A and C', 'Send the same request again'], answer: 0, why: 'The quote is a claim about the file. The file can confirm it.' },
					{ q: 'The quote is not in `lease_b.txt` word for word. What does that tell you?', options: ['The file has an encoding problem', 'The answer for lease B is not grounded', 'The rent is right, only the wording changed', 'Lease B states no rent'], answer: 1, why: 'A quote that the source does not contain does not support the answer.' },
					{ q: 'With `citations.enabled=true` on plain text documents, what does the API return?', options: ['A score for each claim', 'Only the file name of each source', 'Character indices into the document', 'A copy of the whole document'], answer: 2, why: 'Your code can then check the cited span itself.' },
					{ q: 'Does the `cited_text` field add to your output tokens?', options: ['Yes, it doubles them', 'Yes, at the input rate', 'Only on Haiku 5.5', 'No, it does not count toward output tokens'], answer: 3, why: 'Citations add a little input, but `cited_text` does not count toward output tokens.' }
				]
			},
			{
				title: 'Decide on chunking',
				questions: [
					{ q: 'What do you run before sending?', options: ['A first request with one lease', 'The token counting API on the request', 'A word count of the three files', 'The cookbook\'s `chunk_text`'], answer: 1, why: 'The token counting API tells you the size before you send.' },
					{ q: 'How large is the Sonnet 5.5 context window?', options: ['1M tokens', '100,000 tokens', '200,000 characters', '2,000 characters'], answer: 0, why: 'Opus 5.5, Sonnet 5.5 and Haiku 5.5 have a 1M-token window.' },
					{ q: 'The count is under the window. What do you do?', options: ['Chunk anyway, to be safe', 'Send one lease per request', 'Summarize each lease first', 'Send one request, with no chunking'], answer: 3, why: 'One request lets the model compare the three leases directly.' },
					{ q: 'Why avoid the cookbook\'s 2,000-character chunking here?', options: ['Chunking costs more output tokens', 'The cuts ignore sentences, and a summary of summaries keeps only what each first summary kept', 'Chunks must be sent to `claude-haiku-4-5`', 'Chunking only works on PDFs'], answer: 1, why: 'A rent clause can be split in two, and a figure a chunk summary left out cannot come back.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You send 40k tokens of reports and one question. Where do the docs say the question should go?',
			options: [
				'At the top, before the reports, so the model knows what to look for',
				'At the end, after the reports, below the documents and examples',
				'In the system prompt, while the reports go in the user turn',
				'Repeated before and after each report, to keep it in view'
			],
			answer: 1,
			why: 'For 20k tokens and more, the docs put long documents "near the top of your prompt, above your query, instructions, and examples." Queries at the end improved response quality "by up to 30 percent in tests".'
		},
		{
			q: 'The cookbook\'s `summarize_long_document` sends an assistant message that ends with `<summary>` to `claude-sonnet-4-6`. What happens?',
			options: [
				'The model continues after `<summary>` and stops at `</summary>`',
				'The API drops the assistant message and answers the user turn only',
				'The model repeats the prefill text, then writes the summary',
				'The API returns a 400 error, because 4.6 models reject prefill'
			],
			answer: 3,
			why: 'The best practices page: starting with Claude 4.6 models, prefilled responses on the last assistant turn "are no longer supported" and return a 400 error. The notebook comment still says "the 3.5 sonnet for the final summary", while the call names `claude-sonnet-4-6`.'
		},
		{
			q: 'Why ask the model to copy quotes into `<quotes>` tags before it answers a question about a long document?',
			options: [
				'The quotes take the place of the document, so the request costs fewer input tokens',
				'Prompt caching only works on text that sits inside `<quotes>` tags',
				'The model focuses on the relevant passages, and you can check the answer against them',
				'The API returns a 400 error for long documents sent without any quotes'
			],
			answer: 2,
			why: 'The docs say quoting first "helps Claude focus on the relevant content and ignore the rest of the document". The document is still sent in full, so the input cost does not drop. The quotes also give you text to search for in the source.'
		}
	],
	recall: {
		q: 'For a 40k-token prompt with three documents, where do the documents go, where does the question go, and what does the model write first?',
		a: 'Documents at the top, each in `<document>` with `<source>` and `<document_content>`. The question at the end, where the docs measured up to 30 percent better answers. The model first copies the relevant passages into `<quotes>`.'
	},
	sources: [
		{ title: 'Claude docs, Prompting best practices: Long context prompting, read 2026-10-17', url: `${BEST}#long-context-prompting` },
		{ title: 'Claude docs, Prompting best practices: Migrating away from prefilled responses, read 2026-10-17', url: `${BEST}#migrating-away-from-prefilled-responses` },
		{ title: 'Claude docs, Context windows, read 2026-10-17', url: CW },
		{ title: 'Claude docs, Citations, read 2026-10-17', url: CIT },
		{ title: 'anthropics/claude-cookbooks, capabilities/summarization/guide.ipynb', url: GUIDE }
	]
};
