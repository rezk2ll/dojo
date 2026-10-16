const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const CB = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'thinking',
	part: 'Écrire un prompt',
	title: 'Laisser le modèle réfléchir',
	minutes: 10,
	hook: [
		'Ton appli de support affiche une réponse d’une ligne à un client. Le bloc `usage` de cette même réponse indique `output_tokens: 348` et, sous `output_tokens_details`, `thinking_tokens: 312`. La ligne visible a coûté 36 tokens. Les 312 autres sont partis dans un raisonnement que tu n’as pas vu.',
		'Les modèles Claude actuels peuvent travailler un problème dans des blocs `thinking` avant d’écrire la réponse. Tu paies ces tokens comme des tokens de sortie, que l’API renvoie leur texte ou non.'
	],
	terms: [
		{ term: 'Bloc thinking', def: 'Un bloc de contenu `thinking` qui arrive avant les blocs `text`. Il contient un résumé du raisonnement, ou une chaîne vide, plus une `signature` chiffrée.' },
		{ term: 'Réflexion adaptative', def: 'Le mode activé par `thinking: {"type": "adaptive"}` : à chaque requête, le modèle décide s’il réfléchit et combien.' },
		{ term: 'Effort', def: 'Le réglage `output_config.effort`, de `low` à `max`. Il indique au modèle combien de tokens dépenser sur toute la réponse, réflexion comprise.' },
		{ term: 'budget_tokens', def: 'L’ancien budget fixe de réflexion, `thinking: {"type": "enabled", "budget_tokens": N}`, au moins 1 024. Les modèles Claude 4.7 et suivants le refusent avec une erreur 400.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["Requête : thinking adaptive, effort high, max_tokens 16000"] --> decide{"Réfléchir d’abord ou répondre tout de suite ?"}'],
				highlight: ['req', 'decide'],
				note: 'Le modèle fait ce choix à chaque requête. La doc : "A simple factual question may get a direct response with no thinking block at all; a multistep math problem or a tricky debugging task triggers deeper reasoning."'
			},
			{
				add: ['decide -->|"requête difficile"| think["bloc thinking : résumé ou texte vide, plus signature"]'],
				highlight: ['think'],
				note: 'Le texte du bloc est un résumé écrit par un autre modèle, jamais le raisonnement brut. Sur Opus 5.5, Sonnet 5.5 et Haiku 5.5, `display` vaut `"omitted"` par défaut : le champ `thinking` revient vide tant que tu ne demandes pas `"summarized"`.'
			},
			{
				add: ['think --> text["bloc text : la réponse"]', 'decide -->|"requête simple"| text'],
				highlight: ['text'],
				note: 'En effort `medium`, le modèle "may skip thinking for simple queries", et en `low` il saute la réflexion sur les tâches simples. Un tour sans réflexion n’a pas de bloc thinking : ton code ne doit pas en attendre un dans chaque réponse.'
			},
			{
				add: ['text --> usage["usage : output_tokens 348, dont thinking_tokens 312"]'],
				highlight: ['usage'],
				note: '`output_tokens` est le total facturé, réflexion comprise. `thinking_tokens` compte le raisonnement brut et non le résumé affiché : `output_tokens - thinking_tokens` donne à peu près le texte de la réponse.'
			},
			{
				add: ['usage -.->|"réflexion plus texte atteignent le plafond"| cap["stop_reason: max_tokens"]'],
				highlight: ['cap'],
				note: '`max_tokens` plafonne strictement réflexion et texte ensemble. Un `max_tokens` prévu pour une réponse sans réflexion est souvent trop petit. La doc propose deux remèdes : monter `max_tokens`, ou baisser `effort` pour que la réflexion en prenne moins.'
			}
		]
	},
	example: {
		title: 'examples/thinking.py : réflexion adaptative avec un résumé visible',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${SDK}/examples/thinking.py#L1-L22`,
		lang: 'python',
		code: `import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},
    output_config={"effort": "high"},
    messages=[
        {
            "role": "user",
            "content": "Create a haiku about Anthropic. Think carefully about syllable counts before answering.",
        }
    ],
)

for block in response.content:
    if block.type == "thinking":
        print(f"Thinking: {block.thinking}")
    elif block.type == "text":
        print(f"Text: {block.text}")`,
		notes: [
			'La ligne 8 demande la réflexion adaptative avec `display: "summarized"`. Sans `display`, Sonnet 5.5 renvoie le bloc thinking avec un champ `thinking` vide et facture les mêmes tokens.',
			'La ligne 9 règle `effort` sur `high`, qui est déjà la valeur par défaut de Sonnet 5.5 sur l’API Claude. La doc précise que fixer la valeur par défaut "produces exactly the same behavior as omitting the `effort` parameter entirely."',
			'La ligne 7 laisse 16 000 tokens pour la réflexion et le haïku réunis. Au-delà de 21 333, le SDK impose le streaming. [thinking_stream.py](' + SDK + '/examples/thinking_stream.py#L5-L9) envoie la même requête via `client.messages.stream`.',
			'La ligne 13 oriente le modèle en langage courant : "Think carefully about syllable counts before answering." Cette phrase demande plus de réflexion dans le bloc thinking. Un prompt qui réclame le raisonnement dans le texte de la réponse, comme une section `<scratchpad>`, peut être refusé sur Sonnet 5.5 avec `stop_details.category: "reasoning_extraction"`.'
		]
	},
	tradeoff: {
		gain: [
			'La doc cite les tâches qui en profitent : "math, coding, analysis, and long-running agentic work", là où la réponse dépend d’étapes intermédiaires.',
			'La réflexion adaptative ne dépense rien sur les requêtes qu’elle juge simples : en effort `low` ou `medium`, la réponse peut n’avoir aucun bloc thinking.',
			'Avec `display: "omitted"`, le streaming saute le texte de réflexion, et le premier token de texte arrive plus tôt.'
		],
		cost: [
			'La réflexion est facturée en tokens de sortie même cachée : 312 des 348 tokens de sortie dans l’exemple `usage` de la doc.',
			'La réflexion compte dans `max_tokens`. Un plafond qui suffisait à la réponse seule peut couper la réponse avec `stop_reason: "max_tokens"`.',
			'La configuration de réflexion et le niveau d’effort font partie du prompt. Changer l’un ou l’autre entre deux requêtes fait repartir le cache de prompt de zéro.',
			'Un code qui fixe `budget_tokens` reçoit une erreur 400 sur Claude 4.7 et suivants. Sur ces modèles, tu règles avec `effort` et tu plafonnes avec `max_tokens`.'
		]
	},
	task: {
		prompt: 'Le classeur du cookbook `rag_chain_of_thought_classify` (jour 12) tourne sur `claude-haiku-4-5` à des températures de 0 à 0.8. Son prompt dit "First you will think step-by-step about the problem in scratchpad tags" et demande `<scratchpad>` puis `<category>` dans `<response>`. Tu le passes sur Sonnet 5.5. Liste ce que tu modifies, et comment tu vérifies le coût.',
		hint: 'Regarde trois choses : le scratchpad, les valeurs de `temperature` dans `promptfooconfig.yaml`, et le niveau d’effort qu’il faut pour répondre par une seule étiquette.',
		answer: [
			'Retire la consigne `<scratchpad>` et garde `<category>`. La doc des refus cite "A `<thinking>`, `<reasoning>`, or scratchpad section that the model fills in before it answers" parmi les causes courantes de `reasoning_extraction`. Sonnet 5.5 réfléchit déjà dans des blocs thinking par défaut.',
			'Retire les réglages `temperature`. Sur Sonnet 5.5, toute `temperature` différente de la valeur par défaut renvoie une erreur 400, et cette valeur est `1.0` : 0, 0.2, 0.4, 0.6 et 0.8 échouent tous.',
			'Fais tourner le jeu de test en effort `low` et `medium` en plus du `high` par défaut. La doc de l’effort réserve `low` aux "Simpler tasks that need the best speed and lowest costs", et une étiquette de ticket tient en une courte chaîne. Pour supprimer toute réflexion préalable, Sonnet 5.5 accepte `thinking: {"type": "between_tools"}` jusqu’à `high`.',
			'Note `usage.output_tokens` et `usage.output_tokens_details.thinking_tokens` à chaque passage, à côté de la part d’étiquettes correctes. Garde l’effort le plus bas qui conserve le score.'
		]
	},
	quiz: [
		{
			q: 'Une réponse a `display: "omitted"`, un champ `thinking` vide, `output_tokens: 348` et `thinking_tokens: 312`. Combien de tokens de sortie sont facturés ?',
			options: [
				'36, car seul le texte visible est facturé quand la réflexion est omise',
				'348, car la réflexion cachée est facturée en entier comme toute sortie',
				'312, car l’API facture la réflexion et offre le texte de la réponse',
				'Aucun token de réflexion, car une réflexion omise n’est jamais générée'
			],
			answer: 1,
			why: '`output_tokens` est le total facturé et inclut la réflexion. `display` ne change que ce que tu vois : "You\'re still charged for the full thinking tokens. Omitting reduces latency, not cost."'
		},
		{
			q: 'Un vieux script envoie `thinking: {"type": "enabled", "budget_tokens": 4000}` à Opus 5.5. Que se passe-t-il ?',
			options: [
				'Le modèle réfléchit 4 000 tokens au plus, puis écrit sa réponse',
				'L’API ignore le budget et passe en réflexion adaptative',
				'L’API rejette la requête avec une erreur 400',
				'Le budget est converti au niveau d’effort le plus proche, ici `medium`'
			],
			answer: 2,
			why: 'La doc de la réflexion étendue : les modèles Claude 4.7 et suivants "do not support it and reject requests that use it, returning a 400 error." Sur Opus 5.5, la réflexion est toujours adaptative et `effort` est le réglage.'
		},
		{
			q: 'Haiku 5.5 réfléchit avant des réponses de FAQ simples et ton chat paraît lent. Que conseille la doc en premier ?',
			options: [
				'Ajouter "Answer directly without thinking" au prompt système',
				'Baisser `output_config.effort`, par exemple à `low`',
				'Fixer `budget_tokens` au minimum de 1 024 tokens',
				'Monter `max_tokens` pour que la réflexion finisse plus vite'
			],
			answer: 1,
			why: 'L’effort est le réglage principal de la fréquence de réflexion. Dans les tests d’Anthropic, dire à Haiku 5.5 dans le prompt de répondre directement "didn\'t stop it from thinking", et `budget_tokens` est refusé sur Claude 4.7 et suivants.'
		}
	],
	recall: {
		q: 'Sur un modèle Claude actuel, quels deux réglages bornent le coût de la réflexion, et lequel est une limite stricte ?',
		a: '`output_config.effort`, une indication souple de `low` à `max`, et `max_tokens`, le plafond strict de réflexion plus texte. `thinking_tokens` dans `usage` montre ce qui a été dépensé.'
	},
	sources: [
		{ title: 'Claude docs, Thinking, lu le 2026-10-17', url: `${DOCS}/thinking` },
		{ title: 'Claude docs, Steering thinking and cost, lu le 2026-10-17', url: `${DOCS}/thinking-steering-and-cost` },
		{ title: 'Claude docs, Effort, lu le 2026-10-17', url: `${DOCS}/effort` },
		{ title: 'Claude docs, Extended thinking, lu le 2026-10-17', url: `${DOCS}/extended-thinking` },
		{ title: 'Claude docs, Refusals and fallback : Keep reasoning in thinking blocks, lu le 2026-10-17', url: `${DOCS}/refusals-and-fallback#keep-reasoning-in-thinking-blocks` },
		{ title: 'Référence de l’API Claude, Create a Message (temperature, usage), lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/api/messages/create' },
		{ title: 'anthropics/anthropic-sdk-python, examples/thinking.py', url: `${SDK}/examples/thinking.py` },
		{ title: 'anthropics/claude-cookbooks, prompts.py de la classification', url: `${CB}/capabilities/classification/evaluation/prompts.py#L124-L169` }
	]
};
