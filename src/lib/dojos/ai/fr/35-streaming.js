const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const EXAMPLE = `${SDK}/examples/tools_stream.py`;
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude/streaming';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'streaming',
	part: 'Construire avec l’API',
	title: 'Le streaming',
	minutes: 10,
	hook: [
		'Ta page de chat appelle `client.messages.create()` et affiche un spinner jusqu’au retour de la réponse complète. Pour une longue réponse, l’utilisateur fixe le spinner pendant toute la génération, et avec un grand `max_tokens` le SDK Python lève une `ValueError` : « Streaming is required for operations that may take longer than 10 minutes. » (le streaming est obligatoire au-delà de 10 minutes).',
		'Avec `"stream": true`, l’API envoie la réponse en server-sent events pendant que le modèle l’écrit. Dans l’exemple de la doc, le texte « Hello! » arrive en deux événements, l’un avec « Hello » et l’autre avec « ! ».'
	],
	terms: [
		{ term: 'Server-sent events (SSE)', def: 'Une réponse HTTP qui reste ouverte et transporte une suite d’événements. Chaque événement a une ligne `event: <name>` et une ligne `data: <json>`, et le JSON répète le nom dans son champ `type`.' },
		{ term: 'Delta', def: 'Le contenu d’un événement `content_block_delta` : un `text_delta` avec quelques caractères de texte, ou un `input_json_delta` avec un morceau d’entrée d’outil sous forme de chaîne.' },
		{ term: 'Index de bloc', def: 'Le champ `index` de chaque événement de bloc. C’est la position qu’aura le bloc dans le tableau `content` du message final : l’index 1 est le deuxième bloc.' },
		{ term: 'Snapshot', def: 'Dans les helpers de stream du SDK Python, le texte ou l’entrée d’outil accumulés jusqu’ici, renvoyés avec chaque événement `text` ou `input_json` à côté du nouveau delta.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['start["message_start : Message au content vide, usage input_tokens 472"]'],
				highlight: ['start'],
				note: 'Chaque stream s’ouvre sur `message_start`, qui porte un objet `Message` dont le `content` est vide et le `stop_reason` vaut `null`. Dans l’exemple de la doc avec l’outil `get_weather`, il annonce 472 tokens en entrée.'
			},
			{
				add: ['start --> text["Bloc 0, texte : content_block_start, text_delta Okay, text_delta \' let\', ..., content_block_stop"]'],
				highlight: ['text'],
				note: 'Chaque bloc de contenu s’ouvre par `content_block_start`, reçoit un ou plusieurs événements `content_block_delta` et se ferme par `content_block_stop`. Dans l’exemple, la phrase « Okay, let\'s check the weather for San Francisco, CA: » arrive en 13 deltas de texte, un mot ou un signe de ponctuation à chaque fois.'
			},
			{
				add: ['text --> tool["Bloc 1, tool_use get_weather : morceaux input_json_delta, puis content_block_stop"]'],
				highlight: ['tool'],
				note: 'Le `content_block_start` du bloc 1 nomme déjà l’outil, `get_weather`, avec `input: {}`. Ses deltas sont des chaînes comme `{"location":` et ` "San`, et la doc dit que le `tool_use.input` final « is always an *object* » (est toujours un objet). L’entrée n’est du JSON valide qu’à l’arrivée de `content_block_stop`.'
			},
			{
				add: ['tool --> delta["message_delta : stop_reason tool_use, usage output_tokens 89"]', 'delta --> stop["message_stop"]'],
				highlight: ['delta', 'stop'],
				note: 'Le `stop_reason` arrive vers la fin, dans `message_delta`, et le stream se ferme sur `message_stop`. La doc prévient que les compteurs de `usage` dans `message_delta` sont cumulés : 89 est la sortie totale de la réponse jusqu’à cet événement.'
			},
			{
				add: ['ping["événements ping, événements error comme overloaded_error, nouveaux types d’événements"] -.-> text'],
				highlight: ['ping'],
				note: 'Un nombre quelconque d’événements `ping` peut s’intercaler entre les autres. L’API peut aussi envoyer un événement `error` au milieu d’un stream, par exemple un `overloaded_error`, qui « would normally correspond to an HTTP 529 » (correspondrait à un HTTP 529 sans streaming). La doc demande à ton code d’ignorer les types d’événements inconnus, car de nouveaux types peuvent apparaître.'
			}
		]
	},
	example: {
		title: 'examples/tools_stream.py : afficher une entrée d’outil pendant le streaming',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${EXAMPLE}#L1-L40`,
		lang: 'python',
		code: `import asyncio

from anthropic import AsyncAnthropic

client = AsyncAnthropic()


async def main() -> None:
    async with client.messages.stream(
        max_tokens=1024,
        model="claude-sonnet-5-5",
        tools=[
            {
                "name": "get_weather",
                "description": "Get the weather at a specific location",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "The city and state, e.g. San Francisco, CA"},
                        "unit": {
                            "type": "string",
                            "enum": ["celsius", "fahrenheit"],
                            "description": "Unit for the output",
                        },
                    },
                    "required": ["location"],
                },
            }
        ],
        messages=[{"role": "user", "content": "What is the weather in SF?"}],
    ) as stream:
        async for event in stream:
            if event.type == "input_json":
                print(f"delta: {repr(event.partial_json)}")
                print(f"snapshot: {event.snapshot}")

    print()


asyncio.run(main())`,
		notes: [
			'La ligne 9 utilise `client.messages.stream()`, le helper du SDK. Il renvoie un context manager, et le stream est annulé à la sortie du bloc `async with`.',
			'Les lignes 33 à 35 traitent l’événement `input_json`, que le SDK ajoute par-dessus le `input_json_delta` brut. `event.partial_json` est le nouveau morceau de chaîne, et `event.snapshot` est l’entrée analysée jusqu’ici, sous forme d’objet Python.',
			'Le SDK construit ce snapshot en ajoutant chaque morceau à un buffer puis en lançant [`from_json(json_buf, partial_mode=True)`](' + SDK + '/src/anthropic/lib/streaming/_messages.py#L501-L514) de la bibliothèque `jiter`, à chaque delta. Une erreur d’analyse à cet endroit lève une `ValueError` qui cite le JSON du paramètre d’outil.',
			'La boucle affiche l’entrée de l’outil mais ne lance jamais l’outil. Pour lancer `get_weather`, le code attend la fin du stream et lit le bloc `tool_use` complet dans `await stream.get_final_message()`, puis envoie un `tool_result` comme au jour 17.'
		]
	},
	tradeoff: {
		gain: [
			'Les premiers mots de la réponse s’affichent dès le premier `text_delta`, au lieu d’attendre le dernier token.',
			'Les requêtes avec un grand `max_tokens` passent : le SDK exige le streaming pour éviter les timeouts HTTP, et `get_final_message()` renvoie quand même un `Message` complet.',
			'Ton interface peut afficher « appel de get_weather » dès que `content_block_start` nomme l’outil, avant que son entrée soit complète.'
		],
		cost: [
			'Une entrée d’outil est une chaîne qui n’est pas du JSON valide avant `content_block_stop`. Appeler `json.loads` sur chaque delta échoue.',
			'Ton code gère plus de cas qu’avec `create()` : les événements `ping`, un événement `error` arrivé après une partie de la réponse, et les types d’événements ajoutés plus tard.',
			'Les modèles actuels émettent une clé et sa valeur complètes à la fois dans une entrée d’outil : un stream peut donc marquer une pause pendant un appel d’outil.',
			'Quand un stream casse, seul le texte peut reprendre : la doc dit que les blocs tool use et thinking « cannot be partially recovered » (ne se récupèrent pas en partie).'
		]
	},
	task: {
		prompt: 'Un client HTTP brut lit le stream d’un appel `get_weather` et fait `args = json.loads(event["delta"]["partial_json"])` sur chaque `input_json_delta`. Il plante sur le deuxième delta, qui vaut `{"location":`. Explique le plantage et réécris le traitement pour que `args` contienne l’entrée complète au moment de lancer l’outil.',
		hint: 'Chaque delta est un morceau d’une seule chaîne JSON. Quel événement te dit que le dernier morceau est arrivé ?',
		answer: [
			'Chaque `partial_json` est un fragment de l’entrée : `{"location":` seul n’est pas du JSON valide, et `json.loads` lève une erreur. La doc dit que les deltas sont des « partial JSON strings » (chaînes JSON partielles).',
			'Garde un buffer par bloc : sur `content_block_delta` avec `input_json_delta`, fais `bufs[event["index"]] += event["delta"]["partial_json"]`.',
			'Sur `content_block_stop` pour cet index, analyse une seule fois : `args = json.loads(bufs[event["index"]] or "{}")`. Le premier delta de l’exemple de la doc est une chaîne vide, le buffer peut donc démarrer vide.',
			'Avec le SDK Python, tu obtiens le même résultat avec `block.input` sur le bloc `tool_use` de `await stream.get_final_message()`, déjà analysé.'
		],
		steps: [
			{
				title: 'Explique le plantage',
				questions: [
					{ q: 'Qu’est-ce que `partial_json` dans un `input_json_delta` ?', options: ['L’entrée complète de l’outil, renvoyée à chaque fois', 'Un fragment de l’entrée de l’outil, sous forme de chaîne', 'Un dict Python déjà analysé des nouvelles clés', 'Le nom de l’outil et son schéma'], answer: 1, why: 'La doc appelle les deltas des « partial JSON strings » : des morceaux d’un seul texte JSON.' },
					{ q: 'Pourquoi `json.loads(\'{"location":\')` lève-t-il une erreur ?', options: ['`location` n’est pas un paramètre connu', 'Le SDK attend des octets, pas une chaîne', '`{"location":` seul n’est pas du JSON valide', 'Le nom de l’outil manque'], answer: 2, why: 'Le morceau s’arrête après la clé. La valeur et l’accolade fermante arrivent dans des deltas suivants.' },
					{ q: 'Quand l’entrée de l’outil est-elle du JSON valide ?', options: ['Une fois que `content_block_stop` arrive pour son bloc', 'À `content_block_start`, qui porte `input: {}`', 'Après le premier delta non vide', 'À `message_start`'], answer: 0, why: 'L’entrée n’est complète que quand son bloc se ferme.' },
					{ q: 'Quel type a le `tool_use.input` final ?', options: ['Une chaîne', 'Une liste de deltas', 'Un nombre', 'Toujours un objet'], answer: 3, why: 'La doc dit que le `tool_use.input` final « is always an *object* », même si les deltas sont des chaînes.' }
				]
			},
			{
				title: 'Accumule les morceaux',
				questions: [
					{ q: 'Combien de buffers gardes-tu ?', options: ['Un pour tout le stream', 'Un par bloc de contenu, indexé par `index`', 'Un par type d’événement', 'Aucun : tu analyses chaque delta seul'], answer: 1, why: 'Une réponse peut contenir plusieurs blocs, et `index` te dit à quel bloc appartient chaque delta.' },
					{ q: 'Que veut dire l’index de bloc ?', options: ['La position du bloc dans le tableau `content` final', 'Le nombre de deltas reçus jusqu’ici', 'L’ordre de l’événement dans le stream', 'L’identifiant de l’outil'], answer: 0, why: 'L’index 1 est le deuxième bloc du message final, ici le bloc `tool_use` après le texte.' },
					{ q: 'Quelle ligne remplit le buffer à chaque `input_json_delta` ?', options: ['`bufs[event["index"]] = event["delta"]["partial_json"]`', '`bufs.append(json.loads(event["delta"]["partial_json"]))`', '`bufs[event["index"]] += event["delta"]["partial_json"]`', '`bufs[event["type"]] += event["delta"]`'], answer: 2, why: 'Ajouter chaque morceau de chaîne reconstruit le texte JSON complet de ce bloc.' },
					{ q: 'Un événement `ping` arrive entre deux deltas. Qu’en fais-tu ?', options: ['Tu vides les buffers', 'Tu le traites comme la fin du bloc', 'Tu l’ajoutes au buffer', 'Tu l’ignores'], answer: 3, why: 'Un nombre quelconque d’événements `ping` peut s’intercaler entre les autres. Seuls les deltas d’un bloc vont dans son buffer.' }
				]
			},
			{
				title: 'Analyse à la fin',
				questions: [
					{ q: 'Sur quel événement appelles-tu `json.loads` ?', options: ['`content_block_stop` pour cet index', '`message_delta`', 'Chaque `content_block_delta`', '`content_block_start`'], answer: 0, why: 'C’est l’événement qui dit que le dernier morceau de ce bloc est arrivé.' },
					{ q: 'Pourquoi écrire `json.loads(bufs[event["index"]] or "{}")` ?', options: ['Pour fusionner l’entrée avec des valeurs par défaut', 'Pour sauter les outils sans schéma', 'Parce que `json.loads` ne lit pas les objets', 'Parce qu’un buffer peut rester vide, et `""` n’est pas du JSON valide'], answer: 3, why: 'Le premier delta de l’exemple de la doc est une chaîne vide, donc un buffer peut démarrer vide, et `json.loads("")` lève une erreur.' },
					{ q: 'Combien de fois analyses-tu chaque entrée d’outil ?', options: ['Une fois par delta', 'Une fois, quand le bloc se ferme', 'Deux fois : au début et à la fin', 'Une fois par `ping`'], answer: 1, why: 'Analyser une seule fois le buffer complet évite le plantage sur les fragments.' },
					{ q: 'Un `content_block_stop` arrive. Comment sais-tu quel buffer analyser ?', options: ['Tu prends le dernier buffer rempli', 'Tu lis le nom de l’outil dans l’événement', 'Tu prends son champ `index`', 'Tu prends son champ `type`'], answer: 2, why: 'Chaque événement de bloc porte l’`index` de son bloc, la même clé que celle qui a servi à remplir le buffer.' }
				]
			},
			{
				title: 'Passe par le SDK',
				questions: [
					{ q: 'Avec le SDK Python, où est l’entrée analysée une fois le stream fini ?', options: ['Dans le dernier événement `input_json`', '`block.input` sur le bloc `tool_use` de `await stream.get_final_message()`', '`event.partial_json` du dernier delta', 'Dans `message_delta.usage`'], answer: 1, why: 'Le message final contient le bloc `tool_use` complet, déjà analysé.' },
					{ q: 'Que contient `event.snapshot` sur un événement `input_json` du SDK ?', options: ['L’entrée analysée jusqu’ici, en objet Python', 'Seulement le nouveau morceau de chaîne', 'La ligne SSE brute', 'Le résultat de l’outil'], answer: 0, why: '`event.partial_json` est le nouveau morceau, et `event.snapshot` l’entrée accumulée et analysée jusqu’ici.' },
					{ q: 'Quand le code doit-il vraiment lancer `get_weather` ?', options: ['Au premier événement `input_json`', 'Dès que `content_block_start` nomme l’outil', 'À chaque snapshot, pour montrer des résultats en direct', 'Après la fin du stream, à partir du bloc `tool_use` complet'], answer: 3, why: 'La boucle de l’exemple affiche l’entrée mais ne lance l’outil qu’à partir du message final, puis envoie un `tool_result`.' },
					{ q: 'Un événement `error` comme `overloaded_error` arrive en plein stream. À quoi correspond-il en général ?', options: ['À un HTTP 400', 'À une réponse terminée', 'À un HTTP 529', 'À un arrêt `max_tokens`'], answer: 2, why: 'La doc dit qu’il « would normally correspond to an HTTP 529 ».' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'L’événement `message_delta` en fin de stream porte `"usage": {"output_tokens": 89}`. Que vaut 89 ?',
			options: [
				'Les tokens de sortie générés depuis le `message_delta` précédent',
				'La sortie totale de la réponse jusqu’ici, car les compteurs sont cumulés',
				'Les tokens du dernier bloc de contenu, ici le bloc `tool_use`',
				'Les tokens de sortie que le stream n’a pas encore envoyés'
			],
			answer: 1,
			why: 'La doc prévient que les compteurs de tokens du champ `usage` de `message_delta` sont cumulés. Additionner les valeurs de plusieurs `message_delta` compterait deux fois les mêmes tokens.'
		},
		{
			q: 'À quel moment du stream apprends-tu que la réponse se termine par `stop_reason: "tool_use"` ?',
			options: [
				'Dans `message_start`, car il porte l’objet `Message` complet',
				'Dans l’événement `content_block_start` du bloc `tool_use`',
				'Dans un événement `ping` envoyé juste avant l’ouverture du bloc d’outil',
				'Dans l’événement `message_delta`, après la fermeture du dernier bloc'
			],
			answer: 3,
			why: '`message_start` porte un `Message` au `content` vide avec `stop_reason: null`. La stop reason est un changement au niveau du message, et ces changements arrivent dans `message_delta`, après le dernier `content_block_stop`.'
		},
		{
			q: 'Un stream de Claude Sonnet 4.6 casse après un bloc de texte complet et la moitié d’un bloc `tool_use`. Que peux-tu reprendre ?',
			options: [
				'Le texte, en l’envoyant dans un message user qui demande de continuer',
				'L’entrée d’outil, en renvoyant le JSON partiel dans un message `assistant`',
				'Les deux blocs, en rouvrant le même stream avec l’`id` du message',
				'Rien, car un stream cassé doit être renvoyé depuis le début'
			],
			answer: 0,
			why: 'Les blocs tool use et thinking ne se récupèrent pas en partie, et tu reprends depuis le dernier bloc de texte. Pour Claude 4.6 et après, la doc place la réponse partielle dans un message user avec une consigne de continuer.'
		}
	],
	recall: {
		q: 'Dans quel ordre arrivent les événements d’un stream, et quand une entrée d’outil streamée est-elle du JSON valide ?',
		a: '`message_start`, puis pour chaque bloc `content_block_start`, les deltas et `content_block_stop`, puis `message_delta` et `message_stop`. Une entrée d’outil n’est du JSON valide qu’à son `content_block_stop`.'
	},
	sources: [
		{ title: 'Doc Claude, Streaming messages, lue le 2026-10-17', url: DOCS },
		{ title: 'anthropics/anthropic-sdk-python, helpers.md (helpers de stream)', url: `${SDK}/helpers.md` },
		{ title: 'anthropics/anthropic-sdk-python, examples/tools_stream.py', url: EXAMPLE },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/_base_client.py (le contrôle des 10 minutes)', url: `${SDK}/src/anthropic/_base_client.py#L858-L863` }
	]
};
