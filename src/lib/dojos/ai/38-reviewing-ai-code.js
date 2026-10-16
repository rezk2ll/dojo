const CURL = 'https://github.com/curl/curl/blob/e251e858b941e29bb95a6c0d26bb45981a872585';
const WS = `${CURL}/lib/ws.c`;
const POST = 'https://daniel.haxx.se/blog/2024/01/02/the-i-in-llm-stands-for-intelligence/';
const REPORT = 'https://hackerone.com/reports/2298307';
const BP = 'https://code.claude.com/docs/en/best-practices';
const PROMPTING = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';
const REVIEW = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040/plugins/code-review/commands/code-review.md';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'reviewing-ai-code',
	part: 'Building with the API',
	title: 'Reviewing code an AI wrote',
	minutes: 10,
	hook: [
		'On 28 December 2023, the curl project received a security report titled "Buffer Overflow Vulnerability in WebSocket Handling". It was written in clean English, linked one line of `lib/ws.c`, and came with a proposed fix.',
		'Daniel Stenberg of the curl project read the code three times and found no overflow. After more questions and answers that did not match the code, he closed it the same afternoon. He wrote that the replies had "several signs" of an LLM, without being sure.',
		'Code from your own agent session looks just as neat.'
	],
	terms: [
		{ term: 'Invented API', def: 'A call to a function, parameter, flag or package that does not exist in the version you use. The code reads well and fails when it runs.' },
		{ term: 'Scope creep', def: 'Changes in a diff that the task did not ask for: reformatted files, new helpers, extra configuration.' },
		{ term: 'Hollow test', def: 'A test that still passes when the code it should check is broken or removed.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['diff["The diff from the agent"] --> scope{"Does each changed file trace back to the task?"}', 'scope -->|"no"| cut["Ask to drop it, or move it to its own PR"]'],
				highlight: ['scope', 'cut'],
				note: 'The Claude prompting docs say Claude Opus 4.5 and 4.6 "have a tendency to overengineer by creating extra files, adding unnecessary abstractions, or building in flexibility that wasn\'t requested". Read the file list first: a one-line bug fix that touches 9 files needs a reason for each of the other 8.'
			},
			{
				add: ['scope -->|"yes"| names{"Does every new name exist?"}', 'names -->|"build, typecheck, open the definition"| run["Run it on one real input"]'],
				highlight: ['names', 'run'],
				note: 'For each new import, function, keyword argument or package, find its definition or its docs page. In compiled or typed code, a build or a typecheck fails on a name that does not exist. Anthropic\'s own review command flags code that "will fail to compile or parse", such as "missing imports, unresolved references".'
			},
			{
				add: ['run --> claim{"Do the lines around it agree with the claim?"}'],
				highlight: ['claim'],
				note: 'An explanation such as "this is unchecked" or "this cannot be null" is a claim about code. Read the lines above and below before you accept it. In the curl report, the bounds check sat two lines above the line it called unchecked.'
			},
			{
				add: ['claim --> tests{"Revert the fix: does the new test fail?"}', 'tests -->|"still passes"| hollow["Hollow test: rewrite it"]'],
				highlight: ['tests', 'hollow'],
				note: 'The docs warn that Claude "can sometimes focus too heavily on making tests pass at the expense of more general solutions". To check a test, undo the fix and run it. A test that stays green has not tested the fix.'
			},
			{
				add: ['tests -->|"fails as expected"| evidence["Ask for the evidence: command, output"]', 'evidence --> fresh["Second review in a fresh session"]'],
				highlight: ['evidence', 'fresh'],
				note: 'The Claude Code docs: "Have Claude show evidence rather than asserting success", meaning the command it ran and what it returned. They also say a fresh context helps, "since Claude won\'t be biased toward code it just wrote".'
			}
		]
	},
	example: {
		title: 'lib/ws.c in curl: the line the report linked, and the check above it',
		repo: 'curl/curl',
		url: `${WS}#L534-L582`,
		lang: 'c',
		code: `CURLcode Curl_ws_request(struct Curl_easy *data, REQTYPE *req)
{
  unsigned int i;
  CURLcode result = CURLE_OK;
  unsigned char rand[16];
  char *randstr;
  size_t randlen;
  char keyval[40];
…
  heads[3].val = &keyval[0];

  /* 16 bytes random */
  result = Curl_rand(data, (unsigned char *)rand, sizeof(rand));
  if(result)
    return result;
  result = Curl_base64_encode((char *)rand, sizeof(rand), &randstr, &randlen);
  if(result)
    return result;
  DEBUGASSERT(randlen < sizeof(keyval));
  if(randlen >= sizeof(keyval))
    return CURLE_FAILED_INIT;
  strcpy(keyval, randstr);
  free(randstr);`,
		notes: [
			'The `strcpy(keyval, randstr);` line is line 581, the one the [report](' + REPORT + ') linked. The report said "the `strcpy` function is used without proper bounds checking" and could be triggered with "a base64-encoded nonce value that exceeds the buffer size".',
			'The two lines above it are the bounds check: `if(randlen >= sizeof(keyval)) return CURLE_FAILED_INIT;`. If the encoded string does not fit in `keyval`, the function returns before `strcpy` runs.',
			'The declarations fix the sizes: `rand[16]` holds 16 random bytes, and 16 bytes in base64 are 24 characters. `keyval[40]` has room for those 24 plus the terminating zero. The request does not choose the nonce: `Curl_rand` does.',
			'The proposed fix replaced `strcpy` with `strncpy(keyval, randstr, sizeof(keyval) - 1)`. For a 24-character string in a 40-byte buffer, both calls leave the same string in `keyval`. A patch that changes nothing can still look like a security fix, which is why the claim has to be checked against the code.'
		]
	},
	tradeoff: {
		gain: [
			'A build, a typecheck or one run on a real input stops on an invented name in the code it reaches, before a person reads a line.',
			'Reverting the fix and running the new test takes one command, and it exposes a hollow test every time.',
			'A diff limited to the task stays small enough to read line by line.'
		],
		cost: [
			'Checking costs a person\'s time: the curl report arrived one morning and was closed that afternoon. Stenberg writes that such a report "takes away developer time and energy from something productive".',
			'A reviewer agent asked to find gaps "will usually report some, even when the work is sound", the Claude Code docs warn. They suggest flagging only gaps that affect correctness or the stated requirements.',
			'None of these checks proves the code is right. They catch three common mistakes, and you still have to read what remains.'
		]
	},
	task: {
		prompt: 'An agent opened a PR for this issue: `parse_date("2024-02-30")` returns a date in March instead of raising an error. The diff changes the body of `parse_date(s)` in `dates.py` to `return date.fromisoformat(s, strict=True)`. It adds a test, `with pytest.raises(Exception): parse_date("2024-02-30")`, and reformats three other modules. CI is green. Review it on Python 3.12: what do you flag, and how do you prove the test is hollow?',
		hint: 'Try the new line in a Python shell with a valid date such as "2024-02-01". Then ask which exceptions `pytest.raises(Exception)` accepts.',
		answer: [
			'Invented API: `date.fromisoformat()` takes no keyword arguments. On Python 3.12 the call raises `TypeError: date.fromisoformat() takes no keyword arguments` for every input, valid dates included.',
			'Hollow test: `pytest.raises(Exception)` accepts that `TypeError`, so CI stays green while every valid date also fails. Expect `ValueError` instead, and add a test that `parse_date("2024-02-01")` returns `date(2024, 2, 1)`.',
			'Proof: in a Python shell, `parse_date("2024-02-01")` raises the same `TypeError`. The test passes whether the code is right or broken, so it checks nothing.',
			'Scope: the three reformatted modules are not part of the issue, so ask for them in a separate PR. The real fix is shorter: on Python 3.12, `date.fromisoformat("2024-02-30")` already raises `ValueError: day is out of range for month`.'
		]
	},
	quiz: [
		{
			q: 'A report says a `strcpy` call in your C code has no bounds check and proposes a patch. What do you do first?',
			options: [
				'Merge the patch, because `strncpy` is always safer than `strcpy`',
				'Read the lines around the call and the buffer sizes in the declarations',
				'Run a fuzzer on the whole project for a day before you answer',
				'Ask the reporter for a CVE number before you read any code'
			],
			answer: 1,
			why: 'The claim is about the code, so the code settles it. In the curl case, `if(randlen >= sizeof(keyval))` two lines above the `strcpy` made the overflow impossible, and the proposed `strncpy` left the same string in the buffer.'
		},
		{
			q: 'You undo the agent\'s fix, run its new test, and the test still passes. What does that tell you?',
			options: [
				'The fix is correct, because the test passes in both versions',
				'The test runner cached the earlier result and skipped the run',
				'The test does not check the behavior the fix changed',
				'The bug was already fixed somewhere else in the codebase'
			],
			answer: 2,
			why: 'A test that guards a fix must fail without it. If it passes with the fix removed, it would also pass with the bug still there, so it proves nothing about the change.'
		},
		{
			q: 'Why do the Claude Code docs suggest reviewing a change in a fresh session instead of the one that wrote it?',
			options: [
				'A fresh session runs on a larger model that is better at review',
				'The writing session has no permission to read its own diff',
				'A fresh session costs fewer tokens because review needs no tools',
				'Claude in a fresh context is not biased toward code it just wrote'
			],
			answer: 3,
			why: 'The docs say "A fresh context improves code review since Claude won\'t be biased toward code it just wrote." The reviewer sees the diff and the criteria you give it, not the reasoning that produced the change.'
		}
	],
	recall: {
		q: 'Name the three failure patterns of AI-written code from this chapter and the check for each.',
		a: 'Invented API: build, typecheck and open the definition. Scope creep: trace every changed file to the task. Hollow test: revert the fix and confirm the test fails.'
	},
	sources: [
		{ title: 'Daniel Stenberg, The I in LLM stands for intelligence (2 January 2024)', url: POST },
		{ title: 'HackerOne report 2298307 to curl, Buffer Overflow Vulnerability in WebSocket Handling', url: REPORT },
		{ title: 'curl source, lib/ws.c at the commit the report linked', url: WS },
		{ title: 'Claude Code docs, Best practices, read 2026-10-17', url: BP },
		{ title: 'Claude docs, Prompting best practices, read 2026-10-17', url: PROMPTING },
		{ title: 'claude-code, plugins/code-review/commands/code-review.md', url: REVIEW }
	]
};
