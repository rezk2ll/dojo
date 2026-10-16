const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5/capabilities/classification/evaluation';
const DOCS = 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'evals',
	part: 'Tools and agents',
	title: 'Testing a prompt',
	minutes: 10,
	hook: [
		'Your prompt sorts insurance support tickets into 10 categories. One ticket about a disputed charge lands in Billing Inquiries instead of Billing Disputes, so you add a sentence to the prompt, paste in that ticket and two others, and all three come back right.',
		'You ship the new prompt. Nobody checks the other categories, and a week later Claims Disputes tickets are going to Claims Assistance. Three tickets pasted by hand cannot show you that a change fixed one category and broke another.',
		'An **eval** runs the same fixed set of tickets through every version of the prompt and gives each version a score.'
	],
	terms: [
		{ term: 'Eval', def: 'A fixed set of test inputs, the expected answer for each, and a grader that turns the model\'s answers into a score you can compare between prompt versions.' },
		{ term: 'Golden answer', def: 'The expected output for one test input, written by a person before the run, such as the label `Billing Disputes` for one ticket.' },
		{ term: 'Code-based grading', def: 'A program checks each answer, for example `output == golden_answer` or `key_phrase in output`, and returns the same verdict for the same answer every time.' },
		{ term: 'LLM-based grading', def: 'A second model call reads the answer and a rubric and returns a verdict such as "correct" or "incorrect". It handles free text that code cannot check.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['goal["Success criterion: a number you can check"]'],
				highlight: ['goal'],
				note: 'The docs start by writing down success as a number. They replace "The model should classify sentiments well" with "an F1 score of at least 0.85" on "a held-out test set of 10,000 diverse Twitter posts". For the ticket router, a criterion could be a minimum count of correct labels out of the test set.'
			},
			{
				add: ['goal --> set[("dataset.csv: 68 tickets, each with its expected label")]'],
				highlight: ['set'],
				note: 'The cookbook test set has 68 tickets spread over the 10 categories, from 5 to 9 per category. Each row holds the ticket text, its label and an assertion such as `contains:Billing Inquiries`. The docs ask you to add edge cases too, such as "Irrelevant or nonexistent input data" and "Overly long input data".'
			},
			{
				add: ['set --> run["Run: 3 prompts x 5 temperatures x 68 tickets = 1,020 calls"]'],
				highlight: ['run'],
				note: 'The eval tool sends every ticket through every prompt and model setting. The cookbook config lists 3 prompt versions and 5 temperatures of the same model, so one run makes 1,020 API calls.'
			},
			{
				add: ['run --> grade{"Grade each answer"}', 'grade -->|"label in tags"| code["Code: does the text contain the expected label?"]', 'grade -.->|"free-text reply"| llm["Model grader with a rubric"]'],
				highlight: ['code', 'llm'],
				note: 'A category label can be checked by code, which the docs rank first: "Fastest and most reliable, extremely scalable". A free-text answer, such as a drafted reply to the customer, needs a model grader with a rubric. The docs: "Test to ensure reliability first then scale."'
			},
			{
				add: ['code --> score["Score per prompt version, saved to results.csv"]', 'llm --> score', 'score -->|"next prompt change"| run'],
				highlight: ['score'],
				note: 'Each prompt version gets a score, and the run writes every row to `results.csv`. After the next prompt change you run the same 68 tickets again. If the Claims Disputes rows that passed last time now fail, the eval shows the regression before your users do.'
			}
		]
	},
	example: {
		title: 'claude-cookbooks: the promptfoo config for the ticket classifier eval',
		repo: 'anthropics/claude-cookbooks',
		url: `${COOK}/promptfooconfig.yaml#L1-L57`,
		lang: 'yaml',
		code: `description: 'Classification'

# Prompts defined in the prompts.py file
prompts: 
  - prompts.py:simple_classify
  - prompts.py:rag_classify
  - prompts.py:rag_chain_of_thought_classify

providers:
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.0"
    config:
      max_tokens: 4096
      temperature: 0
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.2"
    config:
      max_tokens: 4096
      temperature: 0.2
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.4"
    config:
      max_tokens: 4096
      temperature: 0.4
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.6"
    config:
      max_tokens: 4096
      temperature: 0.6
  - id: anthropic:messages:claude-haiku-4-5
    label: "Haiku: T-0.8"
    config:
      max_tokens: 4096
      temperature: 0.8
      

# Read more about why we use defaultTest here: https://www.promptfoo.dev/docs/configuration/guide/#tools-and-functions:~:text=Use-,defaultTest,-apply%20a%20transform
defaultTest:
  options:
    transform: file://transform.py
  assert:
  - type: icontains-any
    value:
      - 'Billing Inquiries'
      - 'Policy Administration'
      - 'Claims Assistance'
      - 'Coverage Explanations'
      - 'Quotes and Proposals'
      - 'Account Management'
      - 'Billing Disputes'
      - 'Claims Disputes'
      - 'Policy Comparisons'
      - 'General Inquiries'

tests: dataset.csv

outputPath: ../data/results.csv`,
		notes: [
			'Lines 4 to 7 load 3 versions of the prompt from `prompts.py`: a plain one, one with 5 similar tickets retrieved as examples, and one that also asks for reasoning first. The first two end with "Respond with just the label of the category between category tags." The third asks for reasoning in `<scratchpad>` tags before the `<category>` tag.',
			'Lines 9 to 34 run the same model at temperatures 0, 0.2, 0.4, 0.6 and 0.8. The eval then shows whether temperature changes the score, instead of you guessing.',
			'Line 40 runs `transform.py` on every answer before grading: it keeps only the text between `<category>` and `</category>`. Lines 42 to 53 then check that this text is one of the 10 valid labels. The [promptfoo docs](https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/) define `icontains-any` as "output contains any of the listed substrings, case insensitive".',
			'Line 55 loads the 68 test rows. Each row has an `__expected` column, such as `contains:Billing Inquiries`, so a row passes only when the extracted label is the right one. All of this grading is code, with no second model call.'
		]
	},
	tradeoff: {
		gain: [
			'After each prompt change, `npx promptfoo@latest eval` reruns all 1,020 checks with one command and prints the result for every row.',
			'Code grading costs no extra API call and gives the same verdict every run, so a change in score comes from the model\'s answers and never from the grader.',
			'The docs prefer volume: "More questions with slightly lower signal automated grading is better than fewer questions with high-quality human hand-graded evals."'
		],
		cost: [
			'Each run pays for every call: 1,020 calls here, and a model grader adds one more call per graded answer.',
			'The eval only covers the tickets in the file. With 5 Quotes and Proposals tickets, one wrong answer moves that category by 20 points.',
			'A model grader can return a wrong verdict, so you check its verdicts against a sample graded by hand before you trust its score.'
		]
	},
	task: {
		prompt: 'A teammate adds a 4th prompt version to `prompts.py` and lists it under `prompts:`. How many API calls does one run make now? Then write 2 new test rows for edge cases from the docs list, with the `__expected` value of each, and say which grader you would use if the eval also had to check a drafted reply to the customer.',
		hint: 'One run makes one call per prompt, per provider, per row. For the rows, look at the docs list of edge cases: irrelevant input and ambiguous input.',
		answer: [
			'4 prompts x 5 temperatures x 68 tickets = 1,360 calls, up from 1,020. Each new prompt version adds 340 calls to every run.',
			'Irrelevant input: a ticket that says "What time does your office open on Saturday?", with `__expected` set to `contains:General Inquiries`, the category for "Questions about company contact information or hours of operation".',
			'Ambiguous input: "You charged me twice and I want the second charge removed", with `contains:Billing Disputes`. Write the label before the run, and if two people on the team disagree on it, record that: the docs list cases "where even humans would find it hard to reach an assessment consensus" as edge cases.',
			'A drafted reply has no single right string, so code cannot grade it. Use a model grader with a rubric that returns "correct" or "incorrect", for example promptfoo\'s `llm-rubric` assertion, and check its verdicts on 20 replies you graded by hand first.'
		]
	},
	quiz: [
		{
			q: 'Your eval checks that the model returned one of 10 category labels. Which way of grading do the docs tell you to pick?',
			options: [
				'Human grading, because people catch the labels a program would miss',
				'A model grader, because it understands what the ticket is about',
				'Code that checks the label, because it is the fastest and most reliable',
				'No grading, because temperature 0 always gives the same label'
			],
			answer: 2,
			why: 'The docs rank code-based grading first for answers with a fixed form, such as an exact or string match. A model grader is for answers that need judgment, such as a free-text reply. Human grading is the slowest and the docs say "Avoid if possible."'
		},
		{
			q: 'You can afford either 50 tickets graded by a domain expert or 1,000 tickets graded by a string match. What do the eval design principles say?',
			options: [
				'Take the 50 expert-graded tickets, since one wrong grade spoils the score',
				'Take the 1,000 tickets with automated grading, since volume comes first',
				'Take neither, since an eval needs at least 10,000 cases to mean anything',
				'Take the 50 and copy each one 20 times to reach the same volume'
			],
			answer: 1,
			why: 'The third principle is "Prioritize volume over quality": more questions with automated grading beat fewer hand-graded ones. Copies of the same ticket add calls but no new cases.'
		},
		{
			q: 'In the cookbook config, a row\'s `__expected` is `contains:Billing Disputes`. What does the `icontains-any` check in `defaultTest` add on top of it?',
			options: [
				'It checks every answer is one of the 10 valid labels, ignoring case',
				'It retries each failed row with a higher temperature',
				'It asks a second model whether the label matches the ticket',
				'It replaces the row check for rows that have no `__expected`'
			],
			answer: 0,
			why: '`defaultTest` applies to every row. Its `icontains-any` assertion passes when the extracted text contains any of the listed labels, case insensitive, so an invented label fails. The row\'s own `__expected` then checks it is the right label.'
		}
	],
	recall: {
		q: 'In the cookbook ticket classifier eval, how many test tickets are there, and how is each answer graded?',
		a: '68 tickets in `dataset.csv`. Code extracts the text between `<category>` tags and checks it against the row\'s expected label, such as `contains:Billing Inquiries`, with no model grader.'
	},
	sources: [
		{ title: 'Claude API docs, Define success criteria and build evaluations, read 2026-10-17', url: DOCS },
		{ title: 'claude-cookbooks, classification evaluation: promptfooconfig.yaml', url: `${COOK}/promptfooconfig.yaml` },
		{ title: 'claude-cookbooks, classification evaluation: dataset.csv', url: `${COOK}/dataset.csv` },
		{ title: 'promptfoo docs, Deterministic assertions, read 2026-10-17', url: 'https://www.promptfoo.dev/docs/configuration/expected-outputs/deterministic/' },
		{ title: 'promptfoo docs, Test cases, read 2026-10-17', url: 'https://www.promptfoo.dev/docs/configuration/test-cases/' }
	]
};
