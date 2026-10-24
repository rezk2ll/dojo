const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const SO = 'https://platform.claude.com/docs/en/build-with-claude/structured-outputs';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'structured-output',
	part: 'Écrire un prompt',
	title: 'Obtenir du JSON en retour',
	minutes: 10,
	hook: [
		'Ton script demande du JSON au modèle et appelle `json.loads()` sur la réponse. Au ticket 812, la réponse commence par "Here is the JSON:" et `json.loads` lève `JSONDecodeError`. Au ticket 813, le JSON passe, mais `quantity` vaut `"2"`, une chaîne.',
		'La doc liste ces échecs quand on se contente du prompt : "Parsing errors from invalid JSON syntax", "Missing required fields", "Inconsistent data types".'
	],
	terms: [
		{ term: 'Schéma JSON', def: 'Un document JSON qui décrit la forme attendue : le type de chaque champ, les champs obligatoires, les valeurs permises.' },
		{ term: 'Sorties structurées', def: 'Une requête avec `output_config.format` à `{"type": "json_schema", "schema": ...}`. Le texte de la réponse est un JSON conforme à ce schéma.' },
		{ term: 'Décodage contraint', def: 'L’API compile le schéma en grammaire et, à chaque pas, ne laisse le modèle choisir que des tokens qui gardent la sortie valide pour cette grammaire.' },
		{ term: 'Strict tool use', def: '`strict: true` sur une définition d’outil. La même contrainte, appliquée au nom de l’outil et à ses entrées.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['model["Order : product_name str, price float, quantity int avec ge 1"] --> schema["transform_schema : additionalProperties false, minimum déplacé dans la description"]'],
				highlight: ['model', 'schema'],
				note: 'Tu écris la classe `Order` avec pydantic. Le SDK en tire un schéma JSON et le réécrit pour l’API : chaque objet reçoit `additionalProperties: false`, et les clés que l’API ne gère pas, comme `minimum`, passent dans la description du champ.'
			},
			{
				add: ['schema --> api["POST /v1/messages avec output_config.format json_schema"]'],
				highlight: ['api'],
				note: 'La première requête avec un nouveau schéma attend la compilation de la grammaire. La grammaire compilée est "cached for 24 hours from last use". L’API ajoute aussi un prompt système qui explique le format, et tu paies ses tokens d’entrée.'
			},
			{
				add: ['api --> text["bloc text : JSON conforme au schéma envoyé"]'],
				highlight: ['text'],
				note: 'La réponse arrive dans le bloc `text` habituel. Avec le décodage contraint, un schéma d’objet donne une réponse qui commence par `{`, contient chaque champ obligatoire, et porte `2` là où le schéma demande un entier.'
			},
			{
				add: ['text --> check["SDK : validate_json avec la classe Order d’origine"]'],
				highlight: ['check'],
				note: 'Le SDK analyse le texte avec ta classe d’origine, contraintes comprises. Une `quantity` à `0` respecte le schéma envoyé, un simple entier, mais échoue ici sur `ge=1` avec une `ValidationError` pydantic.'
			},
			{
				add: ['check -->|"ValidationError, refusal ou max_tokens"| retry["Ton code : nouvelle tentative, ou signaler l’échec"]'],
				highlight: ['retry'],
				note: 'Deux valeurs de `stop_reason` cassent la garantie. Avec `"refusal"`, tu reçois un 200, une facture, et une sortie qui "may not match your schema". Avec `"max_tokens"`, le JSON peut être tronqué, et la doc dit de relancer avec un `max_tokens` plus grand.'
			}
		]
	},
	example: {
		title: 'examples/structured_outputs.py : une classe pydantic comme format de sortie',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${SDK}/examples/structured_outputs.py#L1-L26`,
		lang: 'python',
		code: `import pydantic

import anthropic


class Order(pydantic.BaseModel):
    product_name: str
    price: float
    quantity: int


client = anthropic.Anthropic()

prompt = """
Extract the product name, price, and quantity from this customer message:
"Hi, I’d like to order 2 packs of Green Tea for 5.50 dollars each."
"""

parsed_message = client.messages.parse(
    model="claude-sonnet-5-5",
    messages=[{"role": "user", "content": prompt}],
    max_tokens=1024,
    output_format=Order,
)

print(parsed_message.parsed_output)  # Order(product_name='Green Tea', price=5.5, quantity=2)`,
		notes: [
			'La ligne 23 passe la classe elle-même. Dans [`messages.parse`](' + SDK + '/src/anthropic/resources/messages/messages.py#L1289-L1293), le SDK appelle `TypeAdapter(output_format).json_schema()`, passe le résultat dans `transform_schema` et l’envoie comme `output_config.format`.',
			'Avec `quantity: int = pydantic.Field(ge=1)`, `transform_schema` envoie `{"type": "integer", "title": "Quantity", "description": "{minimum: 1}"}`. Le commentaire de [_transform.py](' + SDK + '/src/anthropic/lib/_parse/_transform.py#L163-L172) explique que les clés restantes vont dans la description "so that the model *might* follow them" (pour que le modèle les suive peut-être).',
			'Pour chaque bloc `text` de la réponse, `parse_text` dans `_response.py` exécute `adapted_type.validate_json(text)` avec la classe d’origine. Une `quantity` à `0` lève une `ValidationError` avec "Input should be greater than or equal to 1".',
			'La ligne 26 lit `parsed_output`, déjà un `Order`. Ton code reçoit des champs typés, ou une exception qu’il peut attraper pour relancer.'
		]
	},
	tradeoff: {
		gain: [
			'Plus de `JSONDecodeError` : hors refus et coupure à `max_tokens`, le texte de la réponse se parse et contient chaque champ obligatoire.',
			'Un champ `integer` revient sous forme de nombre JSON. La doc du strict tool use donne l’exemple : sans lui, Claude "might provide `passengers: "two"` or `passengers: "2"`", avec lui l’entrée "always contains `passengers: 2`".',
			'Les contraintes que l’API ne sait pas imposer, comme `minimum` ou `maxLength`, sont quand même vérifiées par le SDK avant que ton code lise la valeur.'
		],
		cost: [
			'La première requête avec un nouveau schéma est plus lente, le temps de compiler la grammaire. Changer la structure du schéma en compile une nouvelle.',
			'Le prompt de format injecté ajoute des tokens d’entrée, et changer `output_config.format` invalide le cache de prompt de la conversation.',
			'Les schémas ont des limites : 20 outils stricts, 24 paramètres optionnels et 16 paramètres à type union par requête. Au-delà, ou au-delà des limites internes, tu reçois un 400 "Schema is too complex for compilation."',
			'L’API ne garantit pas la casse des valeurs `enum`. La doc montre `"Conversation Topic 3"` renvoyé pour une valeur écrite `"Conversation topic 3"`, sans erreur.'
		]
	},
	task: {
		prompt: 'Un extracteur de factures écrit pour un ancien modèle envoie un outil `record_invoice` et `tool_choice: {"type": "tool", "name": "record_invoice"}` pour forcer l’appel, puis lit l’entrée de l’outil comme son JSON. Champs : `vendor` (chaîne), `total` (nombre, au moins 0), `currency` (`"EUR"` ou `"USD"`), `notes` (facultatif). Tu le passes sur Opus 5.5. Qu’est-ce qui casse, comment le réécris-tu, et quand ton code relance-t-il ?',
		hint: 'Vérifie ce qu’Opus 5.5 fait d’un `tool_choice` forcé, puis suis `total >= 0` à travers `transform_schema` et `validate_json`.',
		answer: [
			'Le `tool_choice` forcé casse : Opus 5.5 rejette `{"type": "any"}` et `{"type": "tool", ...}` avec une erreur 400 à chaque requête. Passe par `messages.parse` avec une classe pydantic `Invoice`, ou garde l’outil avec `strict: true` et `tool_choice: {"type": "auto"}`.',
			'Écris `total: float = Field(ge=0)` et `currency: Literal["EUR", "USD"]`. L’API reçoit `total` comme simple nombre avec `{minimum: 0}` dans sa description, et le SDK vérifie `ge=0` sur la réponse. `notes` est facultatif, donc il sort après les champs obligatoires.',
			'Relance sur `ValidationError`, une fois, en ajoutant le texte de l’erreur au tour user. Relance sur `stop_reason: "max_tokens"` avec un `max_tokens` plus grand, comme le dit la doc.',
			'Ne renvoie pas la même requête sur `stop_reason: "refusal"` : journalise-la et regarde le prompt. Compare `currency` sans tenir compte de la casse, comme la doc le conseille pour les enums.'
		],
		steps: [
			{
				title: 'Trouve ce qui casse',
				questions: [
					{ q: 'Tu prévois de basculer sur Sonnet 5.5 quand Opus 5.5 est saturé. Le `tool_choice` forcé y fonctionne-t-il ?', options: ['Oui : seul Opus 5.5 rejette l’usage forcé d’outil', 'Oui, tant que l’outil a `strict: true`', 'Non : Sonnet 5.5 rejette aussi l’usage forcé d’outil avec une erreur 400', 'Seulement quand la réflexion est désactivée'], answer: 2, why: 'La doc cite Opus 5.5, Sonnet 5.5, Fable 5.1 et Mythos 5.1 parmi les modèles qui "reject forced tool use on every request with a 400 error".' },
					{ q: 'Passer à `tool_choice: {"type": "any"}` aiderait-il ?', options: ['Non : Opus 5.5 le rejette aussi avec une erreur 400', 'Oui : il force un outil, sans le nommer', 'Oui, mais seulement avec `strict: true`', 'Oui : l’API le transforme en `auto`'], answer: 0, why: '`{"type": "any"}` et `{"type": "tool", ...}` forcent tous les deux un outil, et les deux sont rejetés.' },
					{ q: 'Si tu gardes l’outil, quel `tool_choice` envoies-tu ?', options: ['`{"type": "none"}`', '`{"type": "auto"}`, avec `strict: true` sur l’outil', '`{"type": "any"}`, avec `strict: true` sur l’outil', 'Pas de champ `tools` du tout'], answer: 1, why: 'La doc indique `auto` avec strict tool use pour garder un outil sur ces modèles.' },
					{ q: 'Quel est l’autre chemin vers le même JSON ?', options: ['Demander du JSON dans le prompt et appeler `json.loads`', 'Mettre le schéma dans le prompt système', 'Baisser `temperature` à 0', '`messages.parse` avec une classe pydantic `Invoice`'], answer: 3, why: 'Les sorties structurées placent le schéma dans `output_config.format`, et le SDK analyse la réponse dans ta classe.' }
				]
			},
			{
				title: 'Écris le schéma',
				questions: [
					{ q: 'Comment écris-tu `currency` ?', options: ['`currency: str`', '`currency: Literal["EUR", "USD"]`', '`currency: str = Field(max_length=3)`', '`currency: Optional[str]`'], answer: 1, why: 'Un `Literal` donne les deux valeurs permises, que le schéma envoie sous forme d’`enum`.' },
					{ q: 'Comment écris-tu `total` ?', options: ['`total: float = Field(ge=0)`', '`total: str`', '`total: int`', '`total: float = Field(gt=100)`'], answer: 0, why: 'Un nombre, au moins 0, comme le demande l’exercice.' },
					{ q: '`notes` est facultatif. Où arrive-t-il dans la sortie ?', options: ['En premier, avant `vendor`', 'Nulle part : les champs facultatifs disparaissent', 'Dans un second bloc de texte', 'Après les champs obligatoires'], answer: 3, why: 'Les champs facultatifs sortent après les champs obligatoires.' },
					{ q: 'Qu’ajoute le SDK à chaque objet avant d’envoyer le schéma ?', options: ['`required: []`', '`strict: true`', '`additionalProperties: false`', 'Un `title` par valeur d’enum'], answer: 2, why: 'Le SDK réécrit le schéma pour l’API et donne à chaque objet `additionalProperties: false`.' }
				]
			},
			{
				title: 'Suis `total >= 0`',
				questions: [
					{ q: 'Une facture d’essai gratuit revient avec `"total": 0`. Que fait `Field(ge=0)` de cette valeur ?', options: ['Il lève `ValidationError` : le total doit dépasser 0', 'Il l’accepte : `ge` veut dire supérieur ou égal', 'Il remplace la valeur par `null`', 'Il renvoie la valeur à l’API'], answer: 1, why: '`ge=0` accepte 0 lui-même. Seul un total négatif échoue. C’est `gt=0` qui rejetterait 0.' },
					{ q: 'Le décodage contraint empêche-t-il un `total` négatif ?', options: ['Oui : la grammaire contient le minimum', 'Oui, mais seulement avec `strict: true`', 'Seulement sur Opus 5.5', 'Non : le modèle *pourrait* seulement suivre la description'], answer: 3, why: 'L’API ne voit jamais `minimum` comme une contrainte. Le commentaire de `_transform.py` dit que le modèle "*might* follow them."' },
					{ q: 'Une réponse avec un `total` négatif échoue sur `ge=0`. Paies-tu cette requête ?', options: ['Oui : l’API a répondu normalement, et la vérification tourne ensuite dans le SDK', 'Non : l’API rembourse les réponses qui échouent à la validation', 'Non : la requête n’a jamais quitté ta machine', 'Seulement les tokens d’entrée'], answer: 0, why: 'Le JSON respecte le schéma reçu par l’API, qui renvoie donc une réponse normale et facturée. La vérification `ge=0` vient après, de ton côté.' },
					{ q: 'La réponse contient `"total": -5`. Que reçoit ton code ?', options: ['Un `Invoice` avec `total` mis à 0', 'Une erreur 400 de l’API', 'Une `ValidationError` pydantic', 'Une `JSONDecodeError`'], answer: 2, why: 'Le JSON est valide pour le schéma envoyé, mais échoue sur `ge=0` quand le SDK le valide.' }
				]
			},
			{
				title: 'Décide quand relancer',
				questions: [
					{ q: 'Le SDK lève `ValidationError`. Que fais-tu ?', options: ['Relancer jusqu’à ce que ça passe', 'Relancer une fois, avec le texte de l’erreur ajouté au tour user', 'Borner la valeur et continuer', 'Revenir au `tool_choice` forcé'], answer: 1, why: 'Une relance avec l’erreur dit au modèle ce qu’il a raté. Relancer sans fin ne fait que repayer.' },
					{ q: 'La relance avec le texte de l’erreur lève encore `ValidationError`. Que fais-tu ?', options: ['Relancer encore avec le même texte d’erreur', 'Borner `total` à 0 et enregistrer la facture', 'Revenir au `tool_choice` forcé', 'Arrêter les relances et signaler l’échec, par exemple en confiant la facture à une personne'], answer: 3, why: 'Tu relances une fois, puis tu signales l’échec. Chaque relance de plus paie une nouvelle réponse, et une valeur bornée enregistrerait un nombre que personne n’a lu.' },
					{ q: 'La réponse a `stop_reason: "refusal"`. Que fais-tu ?', options: ['La journaliser et regarder le prompt, sans renvoyer la même requête', 'Renvoyer la même requête tout de suite', 'Analyser le texte comme un `Invoice`', 'Augmenter `max_tokens`'], answer: 0, why: 'Un refus renvoie un 200 et une sortie qui peut ne pas suivre ton schéma. Regarde le prompt avant d’en payer un autre.' },
					{ q: 'Comment compares-tu la valeur de `currency` dans ton code ?', options: ['Octet pour octet avec `"EUR"`', 'Sur sa première lettre seulement', 'Sans tenir compte de la casse', 'Pas du tout : les enums sont garanties'], answer: 2, why: 'L’API ne garantit pas la casse des valeurs d’`enum`, comme la doc le signale.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Ta classe a `quantity: int = pydantic.Field(ge=1)`. Que reçoit l’API pour `quantity` ?',
			options: [
				'`{"type": "integer", "minimum": 1}`, la contrainte telle qu’écrite',
				'`{"type": "integer", "title": "Quantity", "description": "{minimum: 1}"}`',
				'Rien : le SDK lève une erreur avant l’envoi car `minimum` n’est pas géré',
				'`{"type": "string", "format": "text"}`, car chaque champ part en texte'
			],
			answer: 1,
			why: '`transform_schema` ne recopie que les clés que l’API gère et ajoute les autres à la description. L’API ne voit jamais `minimum`, donc le SDK vérifie `ge=1` lui-même en validant la réponse.'
		},
		{
			q: 'Une réponse en sortie structurée revient avec `stop_reason: "max_tokens"`. Que fais-tu de son texte ?',
			options: [
				'Tu le parses : le décodage contraint rend le JSON valide à toute longueur',
				'Rien : l’API renvoie une erreur 400 au lieu d’une réponse partielle',
				'Tu le passes au SDK, qui referme les accolades ouvertes pour toi',
				'Tu le considères comme tronqué, et tu relances avec un `max_tokens` plus grand'
			],
			answer: 3,
			why: 'Le décodage contraint garde chaque token valide, mais la génération s’est arrêtée au plafond. La doc : "The output may be incomplete and not match your schema", et "Retry with a higher `max_tokens` value".'
		},
		{
			q: 'Un code envoie `tool_choice: {"type": "tool", "name": "record_invoice"}` à Opus 5.5 pour forcer du JSON. Que se passe-t-il ?',
			options: [
				'L’appel d’outil arrive, mais son entrée n’est pas vérifiée contre le schéma',
				'Le modèle ignore `tool_choice` et répond en texte simple',
				'L’API rejette la requête avec une erreur 400',
				'L’appel d’outil arrive après un bloc thinking, comme sur les anciens modèles'
			],
			answer: 2,
			why: 'Opus 5.5, Sonnet 5.5, Fable 5.1 et Mythos 5.1 "reject forced tool use on every request with a 400 error". La doc renvoie vers `tool_choice: {"type": "auto"}` avec strict tool use, ou vers les sorties structurées.'
		}
	],
	recall: {
		q: 'Avec `client.messages.parse(output_format=Order)`, par quelles deux vérifications passe le JSON, et où ?',
		a: 'L’API contraint le décodage au schéma transformé envoyé dans `output_config.format`. Puis le SDK exécute `validate_json` avec l’`Order` d’origine, qui vérifie aussi des contraintes comme `ge=1`.'
	},
	sources: [
		{ title: 'Claude docs, Structured outputs, lu le 2026-10-17', url: SO },
		{ title: 'Claude docs, Strict tool use, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use' },
		{ title: 'Claude docs, Thinking : Response prefill and forced tool use, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/build-with-claude/thinking#limits-and-feature-compatibility' },
		{ title: 'anthropics/anthropic-sdk-python, examples/structured_outputs.py', url: `${SDK}/examples/structured_outputs.py` },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/lib/_parse/_transform.py', url: `${SDK}/src/anthropic/lib/_parse/_transform.py` },
		{ title: 'anthropics/anthropic-sdk-python, src/anthropic/lib/_parse/_response.py', url: `${SDK}/src/anthropic/lib/_parse/_response.py#L16-L20` }
	]
};
