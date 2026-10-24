const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const E2E = `${CB}/capabilities/retrieval_augmented_generation/evaluation/eval_end_to_end.py`;
const EVALS = 'https://platform.claude.com/docs/en/test-and-evaluate/develop-tests';
const PAPER = 'https://arxiv.org/abs/2306.05685';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'grading-outputs',
	part: 'Building with the API',
	title: 'Grading with a model',
	minutes: 10,
	hook: [
		'You rewrote the prompt of a support bot and want to know if its answers improved. You have 200 test questions from day 23, but the answers are free text, so `output == expected` fails on almost every line.',
		'So you ask a model to grade them. In a 2023 study of this method, two near-identical answers were shown to a judge model, then shown again in swapped order. The judge Claude-v1 kept the same verdict after the swap in only 23.8% of cases, and it picked the first answer 75.0% of the time.'
	],
	terms: [
		{ term: 'LLM-as-a-judge', def: 'A model call whose only job is to grade another model\'s output: pick the better of two answers, give a score, or say correct or incorrect.' },
		{ term: 'Rubric', def: 'The written rules the judge applies, such as: an answer that misses a critical fact of the reference answer is incorrect. The judge sees it in every grading call.' },
		{ term: 'Position bias', def: 'A judge that prefers an answer because of where it sits in the prompt (first or second), whatever its content.' },
		{ term: 'Agreement rate', def: 'The share of cases where two graders give the same verdict. You compute it between the judge and humans, and between two humans.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['case["Test case: question, reference answer"] --> sut["System under test writes an answer"]'],
				highlight: ['case', 'sut'],
				note: 'Each test case holds a question and, when you have one, a reference answer written by a person. The prompt you are testing produces the answer to grade. The reference matters: in the study, giving the judge a reference answer cut its failure rate on 10 math questions from 70% to 15%.'
			},
			{
				add: ['sut --> judge["Judge prompt: rubric, reference, answer in XML tags"]', 'judge --> out["explanation, then verdict: correct or incorrect"]'],
				highlight: ['judge', 'out'],
				note: 'The Claude docs give three tips: a detailed rubric, an output that is "only \'correct\' or \'incorrect\'" or a 1 to 5 score, and reasoning before the score. The judge writes its explanation first and the verdict last, inside tags your code can find.'
			},
			{
				add: ['out --> parse{"Verdict tag found?"}', 'parse -->|"yes"| score["Count correct / total"]', 'parse -->|"no"| errs["Grader errors: count apart"]'],
				highlight: ['parse', 'errs'],
				note: 'Your code reads only the verdict tag and keeps the explanation for people. A reply with no verdict tag, or an API error, is a grader failure. Keep those in their own count: folded into "incorrect", they lower the score of the prompt you are testing.'
			},
			{
				add: ['score --> swap["Pairwise: grade A,B and B,A"]', 'swap -->|"same winner both times"| win["Win"]', 'swap -->|"winner changes"| tie["Tie"]'],
				highlight: ['swap', 'tie'],
				note: 'To compare two prompts, show both answers in one call. The study\'s fix for position bias: "call a judge twice by swapping the order of two answers and only declare a win when an answer is preferred in both orders". An answer that wins in one order only counts as a tie.'
			},
			{
				add: ['win --> human["Check: people grade 50 cases too"]', 'tie --> human', 'human --> agree["Judge vs human agreement, next to human vs human"]'],
				highlight: ['human', 'agree'],
				note: 'Before you trust the judge, people grade a sample by hand. In the study, the strongest judge (GPT-4) agreed with human experts on 85% of non-tie votes, and the experts agreed with each other on 81%. A judge close to the human figure can stand in for them; a judge far below it cannot.'
			}
		]
	},
	example: {
		title: 'capabilities/retrieval_augmented_generation/evaluation/eval_end_to_end.py: a reference-guided grader',
		repo: 'anthropics/claude-cookbooks',
		url: `${E2E}#L8-L79`,
		lang: 'python',
		code: `def evaluate_end_to_end(query, generated_answer, correct_answer):
    prompt = f"""
…
    Is the Generated Answer correct based on the Correct Answer? You should pay attention to the substance of the answer, and ignore minute details that may differ.
…
    However, if there is any critical piece of information which is missing from the generated answer in comparison to the correct answer, then we should mark this as incorrect.

    Finally, if there are any direct contradictions between the correct answer and generated answer, we should deem the generated answer to be incorrect.

    Respond in the following XML format:
    <evaluation>
    <content>
    <explanation>Your explanation here</explanation>
    <is_correct>true/false</is_correct>
    </content>
    </evaluation>
    """

    client = Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))
    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "<evaluation>"},
            ],
            temperature=0,
            stop_sequences=["</evaluation>"],
        )
…
        is_correct_match = re.search(r"<is_correct>(.*?)</is_correct>", response_text, re.DOTALL)
…
    except Exception as e:
        print(f"Unexpected error: {e}")
        result = {
            "question": query,
            "correct_answer": correct_answer,
            "generated_answer": generated_answer,
            "is_correct": False,
            "explanation": f"Unexpected error: {str(e)}",
        }`,
		notes: [
			'The rubric lines say when an answer fails: a "critical piece of information" missing, or a "direct contradiction" with the correct answer. An answer with other wording passes. The judge gets the correct answer in the prompt, which the study calls reference-guided grading.',
			'The XML format puts `<explanation>` before `<is_correct>`, so the model writes its reasons before its verdict. The `re.search` on `<is_correct>` pulls out the verdict, and the explanation goes into the result for a person to read later.',
			'The `{"role": "assistant", "content": "<evaluation>"}` line prefills the reply. The [Messages docs](https://platform.claude.com/docs/en/build-with-claude/working-with-messages#prefilling-claudes-response) say prefill "is not supported on Claude 4.6 and later models" and returns a 400 error. With `claude-sonnet-4-6`, the `except Exception` block would then store `is_correct: False` for every answer, and the run would end with every answer failed and no crash.',
			'Every LLM-graded example in the [evals docs](' + EVALS + '#example-evals) carries the comment "Generally best practice to use a different model to evaluate than the model used to generate the evaluated output". The study saw Claude-v1 rate its own answers with a 25% higher win rate than humans did, though it says its data cannot settle whether that is a real bias.'
		]
	},
	tradeoff: {
		gain: [
			'A judge grades free-text answers that `==`, string match and ROUGE scores cannot. The docs call it "Fast and flexible, scalable and suitable for complex judgment".',
			'Each verdict comes with an explanation, so you can read why answer 137 failed instead of only seeing the total drop.',
			'Once a judge matches a hand-graded sample, it can grade the rest. In the study, the best judge agreed with experts on 85% of non-tie votes, against 81% between experts.'
		],
		cost: [
			'In the study\'s "repetitive list" test on 23 answers, padding an answer with a reworded copy of its list fooled Claude-v1 and GPT-3.5 in 91.3% of cases.',
			'A judge can be misled on questions it can solve. In the study, GPT-4 solved an elementary math question when asked alone, then graded a wrong answer to it as correct.',
			'Every grade is an API call that costs tokens, and grading pairs in both orders doubles the calls. Three examples in the judge prompt made calls 4× more expensive in the study.',
			'You still need people: a sample graded by hand, again each time you change the rubric or the judge model.'
		]
	},
	task: {
		prompt: 'Prompt A and prompt B both answered the same 300 test questions. You have no reference answers. Design the comparison with a judge model: how many grading calls, what counts as a win, how you handle a reply with no verdict, and how you check the judge before you report "B wins".',
		hint: 'Use pairwise grading, and remember the order effect. For the check, you need a number to compare the judge with.',
		answer: [
			'Pairwise grading, each pair twice (A then B, B then A): 300 × 2 = 600 grading calls.',
			'A prompt wins a question only if the judge prefers its answer in both orders. If the verdict flips with the order, the question is a tie. Report wins, losses and ties.',
			'A reply with no verdict tag, or an API error, goes into a separate "grader error" count and is retried. It never counts as a loss for A or for B.',
			'Before reporting, two people grade the same random 50 pairs by hand. Compute the judge\'s agreement with each person and the agreement between the two people. If the judge is close to the human figure (the study saw 85% against 81%), report the result; if it is far below, fix the rubric first.'
		],
		steps: [
			{
				title: 'Count the calls',
				questions: [
					{ q: 'With no reference answers, which grading style fits a comparison of A and B?', options: ['A 1 to 5 score for each answer alone', 'Pairwise: both answers in one call', 'Exact match against A', 'ROUGE between A and B'], answer: 1, why: 'To compare two prompts, the chapter shows both answers in one call and asks which is better.' },
					{ q: 'You also add three examples to the judge prompt. In the study, what did that do to the cost of each call?', options: ['Nothing', 'It halved it', 'It made it about 4 times higher', 'It made it about 10 times higher'], answer: 2, why: 'The study saw three examples in the judge prompt make calls 4× more expensive, on top of the doubling from grading both orders.' },
					{ q: 'How many grading calls do 300 questions need?', options: ['600', '300', '900', '1,200'], answer: 0, why: '300 pairs, each graded in both orders: 300 × 2 = 600 calls.' },
					{ q: 'What does the judge write before its verdict?', options: ['Nothing: only the verdict', 'A copy of both answers', 'A 1 to 5 confidence score', 'Its explanation'], answer: 3, why: 'The docs advise reasoning before the score, so the explanation comes first and the verdict last.' }
				]
			},
			{
				title: 'Define a win',
				questions: [
					{ q: 'The judge prefers B in both orders on 120 questions, A in both orders on 60, and the verdict flips on the other 120. What is the tally?', options: ['B 240, A 60', 'B 120, A 60, 120 ties', 'B 180, A 120', 'B 120, A 180'], answer: 1, why: 'Only a preference that holds in both orders is a win, so the 120 flipped questions are ties.' },
					{ q: 'Most of the 300 questions end as ties. What does that tell you?', options: ['B is much better than A', 'The judge had too few calls', 'A and B gave identical answers', 'On those questions, the judge followed the order, not the content'], answer: 3, why: 'A verdict that flips with the swap says nothing about which answer is better. Many ties mean the judge mostly followed the position.' },
					{ q: 'What do you report at the end?', options: ['Wins, losses and ties', 'Only the win rate of B', 'The average score of A and B', 'Only the questions B won'], answer: 0, why: 'Ties are real results here: they mark the questions where the judge only followed the order.' },
					{ q: 'B pads its answers with a reworded copy of its list. What is the risk?', options: ['None: the judge sees the same facts', 'The judge refuses to grade it', 'The judge may be fooled into preferring it', 'The answer fails to parse'], answer: 2, why: 'In the study\'s "repetitive list" test, padding fooled Claude-v1 and GPT-3.5 in 91.3% of cases.' }
				]
			},
			{
				title: 'Handle missing verdicts',
				questions: [
					{ q: 'A judge reply has no verdict tag. What is it?', options: ['A tie', 'A grader failure', 'A loss for the second answer', 'A win for the first answer'], answer: 1, why: 'The code reads only the verdict tag, so a reply without one is a failure of the grader, not of A or B.' },
					{ q: 'Where does an API error during grading go?', options: ['Into a separate "grader error" count, then a retry', 'Into the losses of A', 'Into the ties', 'Nowhere: it is dropped silently'], answer: 0, why: 'Folded into a verdict, grader failures would change the score of the prompts you test.' },
					{ q: 'How does your code find the verdict in a judge reply?', options: ['It reads the first word of the reply', 'It asks a second model to read the reply', 'It reads the explanation and guesses', 'It searches for the verdict tag, as `re.search` does for `<is_correct>`'], answer: 3, why: 'The code reads only the verdict tag and keeps the explanation for people. No tag found means a grader failure.' },
					{ q: 'Why not count a missing verdict as a loss?', options: ['It would lower the score for a reason that has nothing to do with the answer', 'Losses are not reported', 'The rubric forbids it', 'It would double the calls'], answer: 0, why: 'A grader error says something about the grader, not about the prompt under test.' }
				]
			},
			{
				title: 'Check the judge',
				questions: [
					{ q: 'Which pairs do the two people grade by hand?', options: ['All 300 pairs', 'Only the ties', 'The same random 50 pairs', 'Only the pairs B won'], answer: 2, why: 'Both people grade the same random sample, so you can compare each of them with the judge and with each other.' },
					{ q: 'Which two agreement rates do you compute?', options: ['Judge with each person, and person with person', 'Judge with itself, and A with B', 'Judge with A, and judge with B', 'Person with A, and person with B'], answer: 0, why: 'The human to human figure is the bar the judge is compared with.' },
					{ q: 'In the study, how did the best judge compare with experts?', options: ['50% against 81%', '23.8% against 75%', '91.3% against 85%', '85% against 81% between experts'], answer: 3, why: 'GPT-4 agreed with experts on 85% of non-tie votes, and the experts agreed with each other on 81%.' },
					{ q: 'The judge agrees with people far less than they agree with each other. What do you do?', options: ['Report the result with a warning', 'Fix the rubric first', 'Grade more questions with the same judge', 'Drop the human sample'], answer: 1, why: 'A judge far below the human figure cannot stand in for people, so you fix it before you trust its score.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your pairwise judge prefers answer A when A is shown first, and prefers B when B is shown first. What does the study\'s method record?',
			options: [
				'A win for A, because the first call is the one that counts',
				'A tie, because neither answer won in both orders',
				'A win for B, because the second call has seen both orders',
				'A grader error, so the pair is dropped from the eval'
			],
			answer: 1,
			why: 'The conservative method calls the judge in both orders and declares a win only when the same answer is preferred both times. A verdict that follows the position says nothing about the content, so it counts as a tie.'
		},
		{
			q: 'After you switch your grader to a newer model, every prompt you test scores 0%. The grader wraps the API call in `except Exception` and returns `is_correct: False`. What do you check first?',
			options: [
				'Whether the new model is stricter, by lowering the bar in the rubric',
				'Whether the test set lost its reference answers during the switch',
				'The explanations, to see if they all read "Unexpected error"',
				'Whether `temperature=0` makes the new model refuse to grade'
			],
			answer: 2,
			why: 'The `except` branch turns any API error into a failed grade with the error text as the explanation. A request the new model rejects, such as a prefill on Claude 4.6 and later, makes every answer "incorrect" without a crash.'
		},
		{
			q: 'How do you decide whether you can trust the judge\'s score?',
			options: [
				'Ask the judge to rate its own confidence from 1 to 5 for each grade',
				'Run it twice on the same answers and check that the scores match',
				'Use the largest model available, since bigger judges have no bias',
				'Have people grade a sample, then compare their verdicts with the judge\'s'
			],
			answer: 3,
			why: 'Only human labels tell you if the judge measures what people mean by a good answer. The study used exactly that comparison: 85% judge to expert agreement against 81% between experts. A judge can be consistent with itself and still wrong.'
		}
	],
	recall: {
		q: 'In the "Judging LLM-as-a-Judge" study, how do you cancel position bias in a pairwise judge?',
		a: 'Call the judge twice with the two answers swapped. Count a win only when the same answer is preferred both times; any other result is a tie.'
	},
	sources: [
		{ title: 'Claude docs, Define success criteria and build evaluations, read 2026-10-17', url: EVALS },
		{ title: 'Zheng et al., Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (arXiv 2306.05685)', url: PAPER },
		{ title: 'claude-cookbooks, eval_end_to_end.py', url: E2E },
		{ title: 'Claude docs, Working with the Messages API (prefill), read 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/working-with-messages' }
	]
};
