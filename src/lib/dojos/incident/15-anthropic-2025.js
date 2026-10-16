const PM = 'https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues';
const JAX = 'https://docs.jax.dev/en/latest/_autosummary/jax.lax.approx_max_k.html';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'anthropic-2025',
	part: 'Data',
	title: 'Anthropic 2025: three bugs that degraded Claude\'s answers',
	minutes: 10,
	hook: [
		'August 2025. Anthropic serves Claude through its own API and through Amazon Bedrock and Google Cloud\'s Vertex AI. The hardware varies, and part of the traffic runs on Google TPUs. The goal is the same answer quality whichever platform serves a request.',
		'In early August some users report worse answers from Claude. The reports are hard to tell apart from the normal variation in user feedback.',
		'By late August the reports come more often and keep coming. Many users now see problems, while others still get normal answers.'
	],
	terms: [
		{ term: 'Sticky routing', def: 'The load balancer sends the follow-up requests of a conversation to the server that served the first one.' },
		{ term: 'Top-p sampling', def: 'The model picks the next token at random, only among the most probable tokens whose probabilities add up to a threshold such as 0.99.' },
		{ term: 'Approximate top-k', def: 'A fast operation that finds the k highest values in an array and may be wrong on the lowest ones it returns. JAX\'s version, `jax.lax.approx_max_k`, has a default `recall_target` of 0.95.' },
		{ term: 'Mixed precision', def: 'Some operations run in 16-bit floats (bf16) and others in 32-bit floats (fp32), so two results can differ in the last digits.' }
	],
	incident: {
		org: 'Anthropic',
		title: 'A postmortem of three recent issues',
		date: '2025-08-05',
		url: PM,
		steps: [
			{
				situation: [
					'29 August. Negative reports spike. Deployments went out on 25 and 26 August, and a routine load balancing change went out on 29 August.',
					'The usual benchmarks, safety evaluations and canary deployments show nothing wrong.'
				],
				q: 'What do you check first?',
				options: [
					'Line up when the spike started with each change deployed that week',
					'Run the standard benchmarks again on the staging servers',
					'Treat it as normal feedback noise and wait a few more days',
					'Roll back every deployment made since 5 August'
				],
				answer: 0,
				why: 'The postmortem: "When negative reports spiked on August 29, we didn\'t immediately make the connection to an otherwise standard load balancing change." That change sent more short-context Sonnet 4 requests to servers configured for the 1M token context window. At the worst hour, on 31 August, 16% of Sonnet 4 requests were misrouted.'
			},
			{
				situation: [
					'Some users who ask in English get Thai or Chinese characters in the middle of the answer, or code with obvious syntax errors. It hits Opus 4.1, Opus 4 and Sonnet 4 on the Claude API. Requests through Bedrock and Vertex AI are fine.',
					'On 25 August a configuration change was deployed to the Claude API\'s TPU servers.'
				],
				q: 'What do you do?',
				options: [
					'Roll back the 25 August change on the TPU servers',
					'Filter non-Latin characters out of English answers',
					'Move all Claude API traffic to Bedrock for a week',
					'Lower the sampling temperature for every request'
				],
				answer: 0,
				why: 'A runtime performance optimization "occasionally assigned a high probability to tokens that should rarely be produced given the context". The team rolled the change back on 2 September and added "detection tests for unexpected character outputs" to the deployment process. A filter would only hide the symptom, and the syntax errors would remain.'
			},
			{
				situation: [
					'A change to how Claude picks tokens, deployed on 25 August, triggers a compiler bug on TPUs. It is confirmed on Haiku 3.5 and rolled back on 4 September. Reports about Opus 3 match the bug, so it is rolled back there on 12 September.',
					'The bug changes with batch size, model configuration, the operations around it, and whether debugging tools are on. After long work the team cannot reproduce it on Sonnet 4.'
				],
				q: 'What do you do for Sonnet 4?',
				options: [
					'Roll the change back on Sonnet 4 as well',
					'Keep it: the bug does not reproduce on Sonnet 4',
					'Keep it and add logging until the bug shows up',
					'Move Sonnet 4 traffic from TPUs to GPUs only'
				],
				answer: 0,
				why: 'A bug that hides when debugging tools are on can be present even when a test passes. The team "decided to also roll it back out of an abundance of caution."'
			},
			{
				situation: [
					'The root cause: in December 2024 the team had added a workaround for a dropped top token. A rewrite of the sampling code in late August removed it. Without it, the approximate top-k operation "sometimes returned completely wrong results, but only for certain batch sizes and model configurations."',
					'The team also finds that the exact top-k operation "no longer had the prohibitive performance penalty it once did."'
				],
				q: 'What do you ship as the fix?',
				options: [
					'Exact top-k with more fp32, and report the bug to XLA:TPU',
					'Put the December 2024 workaround back and keep approximate top-k',
					'Keep approximate top-k and wait for the compiler fix',
					'Raise the top-p threshold from 0.99 to 0.999 everywhere'
				],
				answer: 0,
				why: 'The team "switched from approximate to exact top-k and standardized some additional operations on fp32 precision", and accepted "the minor efficiency impact". At the same time it worked with the XLA:TPU team on a fix for the compiler bug.'
			},
			{
				situation: [
					'The bugs lived for weeks. The evaluations "simply didn\'t capture the degradation users were reporting", in part because Claude often recovers well from isolated mistakes.',
					'Privacy controls limit when engineers can read user conversations, especially those not sent as feedback.'
				],
				q: 'What do you change in detection first?',
				options: [
					'Run quality evaluations continuously on the production systems',
					'Send each deployment to a larger canary group before release',
					'Give engineers read access to all user conversations',
					'Add more public benchmarks to the pre-release checks'
				],
				answer: 0,
				why: 'The routing bug came from a load balancing change, which only exists in production. Anthropic will run evaluations "continuously on true production systems to catch issues such as the context window load balancing error." It also built more sensitive evaluations and debugging tools that keep user privacy.'
			}
		],
		outcome: [
			'Three bugs overlapped. From 5 August some Sonnet 4 requests went to servers configured for the 1M token context window: 0.8% at first, 16% at the worst hour on 31 August. About 30% of Claude Code users had at least one message routed to the wrong server type in that period. Routing was sticky, so the follow-ups of a misrouted conversation tended to stay on the wrong server.',
			'From 25 August a TPU misconfiguration corrupted token generation for Opus 4.1 and Opus 4 until 28 August, and for Sonnet 4 until 2 September. Also from 25 August, a sampling change triggered a latent bug in the XLA:TPU compiler, confirmed on Haiku 3.5. Third-party platforms were not affected by either of these two bugs.',
			'The December 2024 workaround had hidden the top-k bug. The models compute probabilities in bf16, but XLA can run some operations in fp32 because the `xla_allow_excess_precision` flag defaults to true. Operations that should have agreed on the top token then disagreed, and the top token sometimes dropped out.',
			'The routing fix was deployed on 4 September and finished rolling out on 16 September for the first-party API and Vertex AI, and on 18 September for Bedrock. Anthropic now asks users to report bad answers with `/bug` in Claude Code or the thumbs down button in the Claude apps.'
		]
	},
	quiz: [
		{
			q: 'At the worst hour, 16% of Sonnet 4 requests were misrouted. Why did about 30% of Claude Code users hit it at least once?',
			options: [
				'Routing was sticky, and users who send many messages over days get many chances to be misrouted',
				'Claude Code sends every request to the 1M context servers by default',
				'Claude Code users were all on Bedrock, where misrouting was much more frequent',
				'The 16% only counts the first message of each conversation, not the follow-ups'
			],
			answer: 0,
			why: 'The 30% counts users with at least one bad message over the whole period, from 5 August on. Routing was sticky, so once a conversation landed on a wrong server, its follow-ups "were likely to be served by the same incorrect server."'
		},
		{
			q: 'In December 2024 the TPU code sometimes dropped the most probable token at temperature zero. What caused it?',
			options: [
				'Two operations ran at different precisions, bf16 and fp32, and disagreed on the top token',
				'The random number generator returned the same value for every request in a batch',
				'The top-p threshold of 0.99 cut off the most probable token on long prompts',
				'The distributed sort across chips lost data when one chip was slower'
			],
			answer: 0,
			why: 'XLA may run bf16 operations in fp32 because `xla_allow_excess_precision` defaults to true. Two parts of the code compared probabilities at different precisions, so they could pick different top tokens, and the real top token fell out.'
		},
		{
			q: 'Why did Anthropic\'s benchmarks and canary deployments miss all three bugs?',
			options: [
				'Claude often recovers from one mistake, and the routing bug only existed in production',
				'The benchmarks only ran on GPUs, and all three bugs were on TPUs',
				'The canary groups were too small to send any requests to Sonnet 4',
				'The benchmarks only tested English, and the bugs only hit other languages'
			],
			answer: 0,
			why: 'The evaluations missed the degradation "in part because Claude often recovers well from isolated mistakes." The misrouting came from a load balancing change in production, so a check outside production could not see it.'
		}
	],
	recall: {
		q: 'Which three bugs degraded Claude\'s answers between August and September 2025?',
		a: 'Sonnet 4 requests misrouted to 1M context servers (16% at the worst hour), a TPU misconfiguration that produced wrong tokens such as Thai text in English answers, and an XLA:TPU miscompilation of approximate top-k.'
	},
	sources: [
		{ title: 'Anthropic: A postmortem of three recent issues (2025)', url: PM },
		{ title: 'JAX docs: jax.lax.approx_max_k', url: JAX }
	]
};
