const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5/capabilities/contextual-embeddings';
const LAMBDA = `${CB}/contextual-rag-lambda-function`;
const POST = 'https://www.anthropic.com/news/contextual-retrieval';
const SR = 'https://platform.claude.com/docs/en/build-with-claude/search-results';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'rag',
	part: 'Tools and agents',
	title: 'Retrieval-augmented generation',
	minutes: 10,
	hook: [
		'Your knowledge base holds years of SEC filings, split into chunks of a few hundred tokens. A user asks "What was the revenue growth for ACME Corp in Q2 2023?". The answer sits in one chunk: "The company\'s revenue grew by 3% over the previous quarter."',
		'That chunk never names ACME or Q2 2023, so neither the embedding search nor a keyword search ranks it near the question. **The model answers from other chunks, or says it does not know.**'
	],
	terms: [
		{ term: 'RAG', def: 'Anthropic\'s definition: a method that "retrieves relevant information from a knowledge base and appends it to the user\'s prompt", so the model answers from the text of your own documents.' },
		{ term: 'Chunk', def: 'A piece of a document, usually no more than a few hundred tokens, that is indexed and retrieved on its own.' },
		{ term: 'BM25', def: 'A ranking function based on TF-IDF that scores chunks by exact word matches. It finds a string like "TS-999" that an embedding search can miss.' },
		{ term: 'Contextual Retrieval', def: 'Before indexing, a model writes 50 to 100 tokens that place each chunk in its document, and that text is prepended to the chunk for both the embeddings and the BM25 index.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['docs["Knowledge base: SEC filings"] --> chunks["Chunks of a few hundred tokens"]'],
				highlight: ['docs', 'chunks'],
				note: 'If the whole knowledge base is under 200,000 tokens (about 500 pages), Anthropic\'s post says to put it all in the prompt and skip RAG, with prompt caching to cut the cost (day 34). Above that, you split the documents into chunks.'
			},
			{
				add: ['chunks --> ctx["Claude writes 50 to 100 tokens of context per chunk"]', 'ctx --> idx[("Index: embeddings + BM25")]'],
				highlight: ['ctx', 'idx'],
				note: 'Claude rewrites the chunk about 3% growth as "This chunk is from an SEC filing on ACME corp\'s performance in Q2 2023; the previous quarter\'s revenue was $314 million." followed by the original text, and both the embeddings and the BM25 index are built from that longer text.'
			},
			{
				add: ['query["Question: ACME revenue growth Q2 2023"] --> idx', 'idx -->|"top 150"| rerank["Reranker scores each chunk against the question"]'],
				highlight: ['query', 'rerank'],
				note: 'At query time, the embedding search finds chunks close in meaning (day 4) and BM25 finds exact words, and rank fusion merges the two lists. In Anthropic\'s tests, a reranker then scored the top 150 chunks and kept 20.'
			},
			{
				add: ['rerank -->|"top 20"| prompt["Prompt: question + 20 chunks as search_result blocks"]', 'prompt --> answer["Answer with citations: source, title, cited_text"]'],
				highlight: ['prompt', 'answer'],
				note: 'The 20 chunks go into the prompt with the question. If you send each one as a `search_result` block with a `source`, a `title` and citations enabled, each claim in the answer carries a citation that points back to the chunk it came from.'
			}
		]
	},
	example: {
		title: 'contextual-rag-lambda-function/lambda_function.py: one model call per chunk before indexing',
		repo: 'anthropics/claude-cookbooks',
		url: `${LAMBDA}/lambda_function.py#L10-L83`,
		lang: 'python',
		code: `contextual_retrieval_prompt = """
    <document>
    {doc_content}
    </document>


    Here is the chunk we want to situate within the whole document
    <chunk>
    {chunk_content}
    </chunk>


    Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk.
    Answer only with the succinct context and nothing else.
    """
…
            original_document_content = "".join(
                content.get("contentBody")
                for content in file_content.get("fileContents")
                if content
            )

            # Process one chunk at a time
            chunked_content = {"fileContents": []}
            for content in file_content.get("fileContents"):
                content_body = content.get("contentBody", "")
                content_type = content.get("contentType", "")
                content_metadata = content.get("contentMetadata", {})

                # Update chunk with additional context
                prompt = contextual_retrieval_prompt.format(
                    doc_content=original_document_content, chunk_content=content_body
                )
                response_stream = inference_adapter.invoke_model_with_response_stream(prompt)
                chunk_context = "".join(chunk for chunk in response_stream if chunk)

                # append chunk to output file content
                chunked_content["fileContents"].append(
                    {
                        "contentBody": chunk_context + "\\n\\n" + content_body,
                        "contentType": content_type,
                        "contentMetadata": content_metadata,
                    }
                )`,
		notes: [
			'The prompt is the one from Anthropic\'s post: the whole document in `<document>` tags, the chunk in `<chunk>` tags, and "Answer only with the succinct context and nothing else."',
			'Lines 56 to 60 rebuild the whole document by joining the chunks of the file. The model needs the whole document to say which company and which quarter a chunk is about.',
			'Line 73 makes one model call per chunk. The [adapter](' + LAMBDA + '/inference_adapter.py#L13) sends it to Claude Haiku 4.5 on Bedrock with `temperature` 0.0. The full document goes into every call; the cookbook notebook marks the document block with `"cache_control": {"type": "ephemeral"}` so later calls read it from the cache.',
			'Line 79 writes `chunk_context + "\\n\\n" + content_body`: the context first, then the original chunk. That combined text is what gets embedded and indexed, so the chunk is now found by "ACME" and "Q2 2023".'
		]
	},
	tradeoff: {
		gain: [
			'In Anthropic\'s tests, 5.7% of relevant chunks failed to reach the top 20. Contextual embeddings brought that to 3.7%, adding contextual BM25 to 2.9%, and a reranker on top to 1.9%.',
			'The knowledge base can be far larger than the context window, and each request carries only the 20 chunks that matter.',
			'With `search_result` blocks, each claim comes back with `cited_text`, the exact blocks it cites, so a reader can check the answer against the source. `cited_text` does not count toward output tokens.'
		],
		cost: [
			'Adding context costs one model call per chunk at indexing time. The post puts it at $1.02 per million document tokens, with prompt caching, 800-token chunks and 8k-token documents.',
			'Each context is written from the whole document, so editing a document means generating the context of its chunks again.',
			'A reranker adds a step at query time, and that step adds latency. Passing more chunks is no fix either: the post says "more information can be distracting for models".'
		]
	},
	task: {
		prompt: 'Your support knowledge base is 3 million tokens of product manuals. A chunk from the manual of the Model X200 router reads "Restart the device after changing this value." Users search for things like "X200 error E-4012". Write the context you would prepend to this chunk, and say which part of the retrieval finds "E-4012".',
		hint: 'What does the chunk leave out that the question names? Which search matches exact strings?',
		answer: [
			'3 million tokens is far above the 200,000 token limit for putting everything in the prompt, so RAG is needed.',
			'Context to prepend, written by the model from the whole manual: "This chunk is from the Model X200 router manual, section on the DNS cache timeout setting." It names the product and the setting the chunk is about.',
			'BM25 finds "E-4012", because it matches exact strings; an embedding search may only find chunks about errors in general. Run both and merge the results with rank fusion.',
			'Send the retrieved chunks as `search_result` blocks with the manual\'s URL as `source`, so the answer cites the page a user can open.'
		],
		steps: [
			{
				title: 'Check that you need RAG',
				questions: [
					{ q: 'Under what size does Anthropic\'s post say to put the whole knowledge base in the prompt?', options: ['20,000 tokens', '1 million tokens', '200,000 tokens, about 500 pages', '3 million tokens'], answer: 2, why: 'Below that, you skip RAG and use prompt caching to cut the cost.' },
					{ q: 'Your manuals are 3 million tokens. What follows?', options: ['RAG is needed', 'Put them all in the prompt with caching', 'Fine-tune a model on them', 'Send one manual per request'], answer: 0, why: '3 million tokens is far above the 200,000 token limit.' },
					{ q: 'What is the first step above that limit?', options: ['Write one summary per manual', 'Split the documents into chunks', 'Raise `max_tokens`', 'Drop the older manuals'], answer: 1, why: 'Chunks are what you index and retrieve.' },
					{ q: 'How long is a chunk, usually?', options: ['One whole manual', 'Exactly 20 tokens', 'One page of 2,000 words', 'No more than a few hundred tokens'], answer: 3, why: 'A chunk is a piece of a document, indexed and retrieved on its own.' }
				]
			},
			{
				title: 'Write the context',
				questions: [
					{ q: 'What does "Restart the device after changing this value." leave out?', options: ['The product and the setting it is about', 'The verb', 'The error code only', 'Nothing: it is complete'], answer: 0, why: 'Like the ACME chunk, it never names what the user searches for.' },
					{ q: 'Which context do you prepend?', options: ['"Restart the device."', '"This chunk is important."', '"This chunk is from the Model X200 router manual, section on the DNS cache timeout setting."', '"Answer only with the succinct context and nothing else."'], answer: 2, why: 'It names the product and the setting the chunk is about.' },
					{ q: 'What does the model read to write that context?', options: ['Only the chunk', 'The user\'s question', 'The 20 retrieved chunks', 'The whole manual'], answer: 3, why: 'The model needs the whole document to say which product and setting a chunk is about.' },
					{ q: 'Where does the context go?', options: ['Only into the BM25 index', 'In front of the chunk, for both the embeddings and the BM25 index', 'In the system prompt at query time', 'After the chunk, in the answer'], answer: 1, why: 'The context comes first, then the original chunk, and that combined text is indexed.' }
				]
			},
			{
				title: 'Find "E-4012"',
				questions: [
					{ q: 'Which part of the retrieval finds "E-4012"?', options: ['The embedding search', 'BM25', 'The reranker alone', 'The model writing the answer'], answer: 1, why: 'BM25 matches exact strings, like an error code.' },
					{ q: 'What may the embedding search return for "X200 error E-4012"?', options: ['Chunks about errors in general', 'Nothing at all', 'Only the exact chunk', 'Chunks from the ACME filings'], answer: 0, why: 'Embeddings capture meaning and can miss an exact identifier.' },
					{ q: 'What do you do with the two searches?', options: ['Keep only BM25', 'Keep only the embeddings', 'Run the embeddings only when BM25 finds nothing', 'Run both and merge the lists with rank fusion'], answer: 3, why: 'Each search finds what the other misses.' },
					{ q: 'In Anthropic\'s tests, what came after the fusion?', options: ['A second BM25 pass', 'A summary of each chunk', 'A reranker that scored the top 150 chunks and kept 20', 'A larger embedding model'], answer: 2, why: 'With the reranker on top, missed chunks fell to 1.9%.' }
				]
			},
			{
				title: 'Send the chunks with sources',
				questions: [
					{ q: 'Which block type do you send the chunks in?', options: ['`document`', '`tool_use`', '`thinking`', '`search_result`'], answer: 3, why: 'With citations enabled, each claim then points back to the chunk it came from.' },
					{ q: 'What goes in `source`?', options: ['The chunk number', 'The manual\'s URL', 'The error code', 'The model name'], answer: 1, why: 'The answer then cites a page the user can open.' },
					{ q: 'What does a citation in the answer hold?', options: ['The `source` and `title` you sent, and the `cited_text`', 'A confidence score per sentence', 'Only a chunk number', 'A link the API finds in the chunk'], answer: 0, why: 'A `search_result_location` citation copies `source` and `title` and adds `cited_text`.' },
					{ q: 'Why not send 100 chunks to be safe?', options: ['The API caps a request at 20 blocks', 'Citations stop working past 20', '"More information can be distracting for models"', 'BM25 only ranks 20 chunks'], answer: 2, why: 'The post warns that passing more chunks is no fix.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your knowledge base is 120,000 tokens of internal docs. What does Anthropic\'s post suggest?',
			options: [
				'Put it all in the prompt and use prompt caching, with no retrieval step',
				'Split it into chunks and use embeddings, since BM25 needs millions of tokens',
				'Use Contextual Retrieval, since any knowledge base above 100,000 tokens needs RAG',
				'Fine-tune a model on the docs, because retrieval cannot handle internal docs'
			],
			answer: 0,
			why: 'The post says a knowledge base under 200,000 tokens (about 500 pages) can go into the prompt whole. Prompt caching then cuts latency by more than 2x and cost by up to 90% on repeated requests.'
		},
		{
			q: 'A user searches "Error code TS-999" and the embedding search returns chunks about error codes in general. What finds the right chunk?',
			options: [
				'A larger embedding model with more dimensions per vector',
				'Passing 100 chunks to the model instead of 20',
				'BM25, which scores chunks by exact word and string matches',
				'Lowering the temperature of the model that writes the answer'
			],
			answer: 2,
			why: 'Embeddings capture meaning and can miss an exact identifier. The post uses this example: BM25 looks for the string "TS-999" itself. Combining both searches with rank fusion gets the strengths of each.'
		},
		{
			q: 'You send retrieved chunks as `search_result` blocks with citations enabled. What does a citation in the answer hold?',
			options: [
				'Only a chunk number, which your code must map back to a document',
				'The `source` and `title` you sent, and the `cited_text` of the cited blocks',
				'A confidence score from 0 to 1 for each sentence of the answer',
				'A link that the API builds from the first URL found in the chunk'
			],
			answer: 1,
			why: 'A `search_result_location` citation copies `source` and `title` from your block and adds `cited_text` with the block indices it covers. The model cites whole text blocks, so smaller blocks give finer citations.'
		}
	],
	recall: {
		q: 'What does Contextual Retrieval add to each chunk, and how much did it lower the retrieval failure rate in Anthropic\'s tests?',
		a: '50 to 100 tokens of context written by a model from the whole document, prepended before embedding and BM25 indexing. The top 20 failure rate went from 5.7% to 2.9%, and to 1.9% with a reranker.'
	},
	sources: [
		{ title: 'Anthropic, Introducing Contextual Retrieval (2024-09-19), read 2026-10-17', url: POST },
		{ title: 'anthropics/claude-cookbooks, contextual-rag-lambda-function at b2b0aa1', url: LAMBDA },
		{ title: 'anthropics/claude-cookbooks, contextual-embeddings/guide.ipynb at b2b0aa1', url: `${CB}/guide.ipynb` },
		{ title: 'Claude docs, Search results, read 2026-10-17', url: SR }
	]
};
