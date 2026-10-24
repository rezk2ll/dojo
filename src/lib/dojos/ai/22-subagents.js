const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const LEAD = `${COOK}/patterns/agents/prompts/research_lead_agent.md`;
const POST = 'https://www.anthropic.com/engineering/multi-agent-research-system';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'subagents',
	part: 'Tools and agents',
	title: 'Splitting work across agents',
	minutes: 10,
	hook: [
		'You ask an agent for the board members of every Information Technology company in the S&P 500. It searches for one company, reads the results, then searches for the next one, one search after another.',
		'Anthropic\'s post on its Research feature uses this exact query. The post: the single agent "failed to find the answer with slow, sequential searches", while a lead agent that split the list across subagents "found the correct answers".',
		'The same post says multi-agent systems use about 15 times the tokens of a chat.'
	],
	terms: [
		{ term: 'Orchestrator', def: 'The lead agent: it plans the task, starts subagents with a written task description each, and writes the final answer from what they return.' },
		{ term: 'Subagent', def: 'A worker agent started by the orchestrator for one subtask. It runs its own tool loop and returns a short result.' },
		{ term: 'Context isolation', def: 'Each subagent has its own context window. Its searches and page reads stay there; only its final result enters the orchestrator\'s context.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['q["User query: board members of S&P 500 IT companies"] --> lead["Lead agent: thinks, writes a plan"]', 'lead --> mem[("Memory: the plan")]'],
				highlight: ['lead', 'mem'],
				note: 'The lead agent plans first and saves the plan to an external memory. The post gives the reason: "if the context window exceeds 200,000 tokens it will be truncated and it is important to retain the plan." The plan names the subtasks and how many subagents to start.'
			},
			{
				add: ['lead -->|"task 1 of 3"| s1["Subagent 1"]', 'lead -->|"task 2 of 3"| s2["Subagent 2"]', 'lead -->|"task 3 of 3"| s3["Subagent 3"]'],
				highlight: ['s1', 's2', 's3'],
				note: 'The lead starts the subagents in parallel, 3 to 5 at once in the Research system. Each one gets "an objective, an output format, guidance on the tools and sources to use, and clear task boundaries". Here each one could take one third of the company list.'
			},
			{
				add: ['s1 --> w1["Own context: its searches and the pages it read"]', 'w1 -->|"a list of names"| lead'],
				highlight: ['w1'],
				note: 'Each subagent searches, reads pages and thinks between tool results, all inside its own context window. It sends back the list of names, without the pages it read. The post calls this compression: subagents explore "before condensing the most important tokens for the lead research agent".'
			},
			{
				add: ['lead -->|"gaps found"| s4["Subagent 4: the missing companies"]', 'lead -->|"enough"| cite["CitationAgent: adds sources"]', 'cite --> out["Answer with citations"]'],
				highlight: ['s4', 'cite'],
				note: 'The lead reads the results. If companies are missing from the list, it starts more subagents. When it has enough, a separate CitationAgent matches each claim in the report to a location in the sources.'
			}
		]
	},
	example: {
		title: 'claude-cookbooks: the lead agent prompt from the Research system',
		repo: 'anthropics/claude-cookbooks',
		url: `${LEAD}#L71-L115`,
		lang: 'markdown',
		code: `<subagent_count_guidelines>
When determining how many subagents to create, follow these guidelines: 
1. **Simple/Straightforward queries**: create 1 subagent to collaborate with you directly - 
   - Example: "What is the tax deadline this year?" or “Research bananas” → 1 subagent
   - Even for simple queries, always create at least 1 subagent to ensure proper source gathering
2. **Standard complexity queries**: 2-3 subagents
   - For queries requiring multiple perspectives or research approaches
   - Example: "Compare the top 3 cloud providers" → 3 subagents (one per provider)
3. **Medium complexity queries**: 3-5 subagents
   - For multi-faceted questions requiring different methodological approaches
   - Example: "Analyze the impact of AI on healthcare" → 4 subagents (regulatory, clinical, economic, technological aspects)
4. **High complexity queries**: 5-10 subagents (maximum 20)
   - For very broad, multi-part queries with many distinct components 
   - Identify the most effective algorithms to efficiently answer these high-complexity queries with around 20 subagents. 
   - Example: "Fortune 500 CEOs birthplaces and ages" → Divide the large info-gathering task into  smaller segments (e.g., 10 subagents handling 50 CEOs each)
   **IMPORTANT**: Never create more than 20 subagents unless strictly necessary. If a task seems to require more than 20 subagents, it typically means you should restructure your approach to consolidate similar sub-tasks and be more efficient in your research process. Prefer fewer, more capable subagents over many overly narrow ones. More subagents = more overhead. Only add subagents when they provide distinct value.
</subagent_count_guidelines>
…
3. **Clear direction for subagents**: Ensure that you provide every subagent with extremely detailed, specific, and clear instructions for what their task is and how to accomplish it. Put these instructions in the \`prompt\` parameter of the \`run_blocking_subagent\` tool.
* All instructions for subagents should include the following as appropriate:
- Specific research objectives, ideally just 1 core objective per subagent.
- Expected output format - e.g. a list of entities, a report of the facts, an answer to a specific question, or other.
- Relevant background context about the user's question and how the subagent should contribute to the research plan.
- Key questions to answer as part of the research.
- Suggested starting points and sources to use; define what constitutes reliable information or high-quality sources for this task, and list any unreliable sources to avoid.
- Specific tools that the subagent should use - i.e. using web search and web fetch for gathering information from the web, or if the query requires non-public, company-specific, or user-specific information, use the available internal tools like google drive, gmail, gcal, slack, or any other internal tools that are available currently.
- If needed, precise scope boundaries to prevent research drift.
* Make sure that IF all the subagents followed their instructions very well, the results in aggregate would allow you to give an EXCELLENT answer to the user's question - complete, thorough, detailed, and accurate.`,
		notes: [
			'Lines 1 to 17 set the number of subagents by query type, from 1 for a simple fact up to a cap of 20. The [post](' + POST + ') explains why the prompt spells this out: early agents made errors "like spawning 50 subagents for simple queries".',
			'Line 16 tells the lead to "consolidate similar sub-tasks" when a plan needs more than 20 subagents. Each subagent is a full tool loop that spends its own tokens.',
			'Lines 21 to 27 list what every task description contains: one objective, an output format, background, sources, tools and scope boundaries. The post shows the failure they prevent: with "research the semiconductor shortage", 2 subagents duplicated the same 2025 supply chain research.',
			'Line 19 names the tool the lead calls, `run_blocking_subagent`. Blocking means the lead waits for the subagent to finish. The post lists the price: "the lead agent can\'t steer subagents, subagents can\'t coordinate", and one slow subagent can hold up the whole run.'
		]
	},
	tradeoff: {
		gain: [
			'On Anthropic\'s internal research eval, a Claude Opus 4 lead with Claude Sonnet 4 subagents outperformed Claude Opus 4 working alone by 90.2%.',
			'Starting 3 to 5 subagents in parallel, each running 3 or more tools in parallel, "cut research time by up to 90% for complex queries".',
			'The lead\'s context holds plans and short results. The search pages each subagent read stay in that subagent\'s own context window.'
		],
		cost: [
			'In Anthropic\'s data, agents used about 4 times the tokens of a chat, and multi-agent systems about 15 times.',
			'Each subtask has to run without the results of the others. The post: "most coding tasks involve fewer truly parallelizable tasks than research", and tasks where all agents need the same context are "not a good fit".',
			'A vague task description makes subagents repeat each other\'s searches, so you pay twice for the same pages.',
			'With blocking subagents, the lead waits for the slowest one and cannot redirect a subagent that is searching in the wrong place.'
		]
	},
	task: {
		prompt: 'Two requests reach your agent. A: "For each of these 12 open-source databases, give the license, the latest release and whether it has a JSON column type." B: "Why does our checkout service time out every Friday at 18:00?" For each one, decide between one agent and an orchestrator with subagents. For the split one, write the task description of one subagent.',
		hint: 'Ask whether the subtasks can run without seeing each other\'s results, then use the count guidelines and the list of what a task description contains.',
		answer: [
			'A splits well: each database can be looked up without knowing anything about the others. The prompt\'s "Standard complexity" row gives 2 to 3 subagents, so 3 subagents with 4 databases each.',
			'One task description: "Objective: for PostgreSQL, SQLite, DuckDB and ClickHouse, find the license, the latest release number and date, and whether a JSON column type exists. Output: one row per database with those 4 fields and a source URL each. Sources: the project\'s own site and release notes only. Scope: only these 4 databases."',
			'B stays with one agent, because every step depends on the last one: the logs point to a query, the query points to a lock, the lock points to a Friday job. The post says tasks "that require all agents to share the same context or involve many dependencies between agents" are a poor fit.',
			'Cost check for A: about 15 times the tokens of a chat, for a table you would otherwise fill by hand from 12 websites. For B, three subagents would each rebuild the same picture of the service from scratch.'
		],
		steps: [
			{
				title: 'Test A for independence',
				questions: [
					{ q: 'Which question decides whether a request splits well across subagents?', options: ['Is the request longer than one paragraph?', 'Does it mention more than 10 items?', 'Can the subtasks run without seeing each other\'s results?', 'Will the answer need citations?'], answer: 2, why: 'Each subagent works in its own context, so a subtask that needs another one\'s result cannot run in parallel.' },
					{ q: 'In A, does looking up one database need the results for another?', options: ['No, each one can be looked up alone', 'Yes, the licenses depend on each other', 'Yes, the releases must be compared first', 'Only for databases with a JSON type'], answer: 0, why: 'A license or a release date for DuckDB tells you nothing about SQLite. The 12 lookups are independent.' },
					{ q: 'You add "then rank the 12 by how recent their latest release is". Which part can a subagent no longer do alone?', options: ['Finding one database\'s license', 'The ranking: it needs all 12 release dates', 'Checking one database for a JSON type', 'Finding one database\'s latest release'], answer: 1, why: 'A subagent with 4 databases cannot place them among the other 8. The ranking needs every result, so the lead does it after the subagents return.' },
					{ q: 'The 3 subagents for A are ready. Do they start at once or one after another?', options: ['One after another, each reading the last one\'s table', 'At once, in parallel', 'One after another, to save tokens', 'Only one runs; the others wait in case it fails'], answer: 1, why: 'No subtask needs another one\'s result, so the lead can start them in parallel. That is where the time saving comes from.' }
				]
			},
			{
				title: 'Test B for dependencies',
				questions: [
					{ q: 'In B, how do the steps of the investigation relate?', options: ['Each step can run alone', 'Only the first step matters', 'They can run in any order', 'Each step depends on the last one'], answer: 3, why: 'The logs point to a query, the query to a lock, the lock to a Friday job. Each clue comes from the one before.' },
					{ q: 'Which kind of task does the post call a poor fit for multi-agent systems?', options: ['Tasks where all agents need the same context', 'Tasks with more than 5 items', 'Tasks that need web search', 'Tasks that need an output format'], answer: 0, why: 'The post names tasks "that require all agents to share the same context or involve many dependencies between agents".' },
					{ q: 'What happens if you split B across three subagents?', options: ['Each finds a third of the cause', 'Each rebuilds the same picture of the service from scratch', 'The lead gets the answer 90% faster', 'They share their findings as they go'], answer: 1, why: 'Each subagent starts with an empty context, so all three redo the same groundwork and pay for it.' },
					{ q: 'With blocking subagents, can the lead redirect one that searches in the wrong place?', options: ['Yes, it sends it a new message mid-run', 'Only the slowest one', 'No, it waits for it to finish', 'Yes, through `run_blocking_subagent`'], answer: 2, why: 'The post: "the lead agent can\'t steer subagents". Blocking means it waits.' }
				]
			},
			{
				title: 'Size the split for A',
				questions: [
					{ q: 'Which row of the count guidelines does the answer use for A?', options: ['Simple: 1 subagent', 'Standard complexity: 2 to 3', 'Medium complexity: 3 to 5', 'High complexity: 5 to 10'], answer: 1, why: 'The answer reads A as a "Standard complexity" query, which gives 2 to 3 subagents.' },
					{ q: 'With 3 subagents for 12 databases, how many does each one take?', options: ['3', '12', '6', '4'], answer: 3, why: '12 databases over 3 subagents is 4 each.' },
					{ q: 'What does the lead prompt say to do when a plan seems to need more than 20 subagents?', options: ['Start them in batches of 20', 'Consolidate similar sub-tasks', 'Use a bigger model for the lead', 'Ask the user to split the query'], answer: 1, why: 'More subagents means more overhead. The prompt prefers "fewer, more capable subagents".' },
					{ q: 'One subagent returns its rows without ClickHouse. What does the lead do?', options: ['Start another subagent for the missing database', 'Restart all 3 subagents from scratch', 'Leave ClickHouse out of the answer', 'Write the ClickHouse row from memory'], answer: 0, why: 'The lead reads the results, and when something is missing it starts more subagents for the gaps.' }
				]
			},
			{
				title: 'Write one task description',
				questions: [
					{ q: 'How many core objectives should one subagent get?', options: ['One per database it covers', 'As many as fit in the prompt', 'Ideally just 1', 'None: it reads the user query'], answer: 2, why: 'The lead prompt asks for "ideally just 1 core objective per subagent".' },
					{ q: 'Which line of the sample description sets the output format?', options: ['"Sources: the project\'s own site and release notes only"', '"Output: one row per database with those 4 fields and a source URL each"', '"Scope: only these 4 databases"', '"Objective: for PostgreSQL, SQLite, DuckDB and ClickHouse, find the license..."'], answer: 1, why: 'The output line tells the subagent exactly what shape to send back, so the lead can merge three results.' },
					{ q: 'Why add "Scope: only these 4 databases"?', options: ['To stop it drifting into the other 8 and repeating work', 'To make it use fewer tools', 'To let it skip the release date', 'Because a subagent can read only 4 pages'], answer: 0, why: 'Scope boundaries prevent research drift, so two subagents do not pay for the same pages.' },
					{ q: 'Which item of the lead prompt\'s list does "Sources: the project\'s own site and release notes only" fill?', options: ['The core objective', 'The expected output format', 'Starting points and what counts as a reliable source', 'The tools the subagent should use'], answer: 2, why: 'The prompt asks for suggested sources and a definition of reliable information. Release notes from the project itself are the reliable source for a release number.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In Anthropic\'s analysis of the BrowseComp eval, which factor by itself explained 80% of the variance in performance?',
			options: [
				'The number of tokens the system used',
				'The number of subagents the lead started',
				'The length of the lead agent\'s prompt',
				'Which model ran the subagents'
			],
			answer: 0,
			why: 'The post: "token usage by itself explains 80% of the variance", with the number of tool calls and the model choice as the two other factors. Subagents help mainly because their separate context windows let the system spend more tokens on one question.'
		},
		{
			q: 'The lead agent sends "research the semiconductor shortage" to three subagents. What did Anthropic see happen with instructions like this?',
			options: [
				'The subagents refused the task and asked the lead for a narrower one',
				'The lead ran out of context reading three full reports at once',
				'Subagents misread the task, and two ran the same searches on 2025 supply chains',
				'Each subagent chose one region of the world without being asked to'
			],
			answer: 2,
			why: 'A short instruction gives no objective, output format or boundary, so each subagent picks its own reading of the task. In the post, one studied the 2021 automotive chip crisis while two others duplicated work on 2025 supply chains.'
		},
		{
			q: 'Which task is the poorest fit for an orchestrator with parallel subagents?',
			options: [
				'Listing the release date of 30 separate libraries',
				'Comparing the pricing pages of 5 cloud vendors',
				'A refactor where each change depends on the previous one',
				'Collecting the CVEs filed this year for 10 packages'
			],
			answer: 2,
			why: 'Parallel subagents each work in their own context and cannot see each other\'s changes. A chain of dependent edits needs one shared context, which is the case the post calls "not a good fit for multi-agent systems today".'
		}
	],
	recall: {
		q: 'About how many times the tokens of a chat did Anthropic\'s multi-agent Research system use, and what does a subagent send back to the lead?',
		a: 'About 15 times. Each subagent searches in its own context window and sends back only its condensed result, such as a list of names, while the pages it read stay in its own context.'
	},
	sources: [
		{ title: 'Anthropic Engineering, How we built our multi-agent research system, read 2026-10-17', url: POST },
		{ title: 'claude-cookbooks, patterns/agents/prompts/research_lead_agent.md', url: LEAD }
	]
};
