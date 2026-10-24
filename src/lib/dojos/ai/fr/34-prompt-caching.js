const COOKBOOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const NOTEBOOK = `${COOKBOOK}/misc/prompt_caching.ipynb`;
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude/prompt-caching';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'prompt-caching',
	part: 'Construire avec l’API',
	title: 'Le prompt caching',
	minutes: 10,
	hook: [
		'Ton appli envoie le texte complet d’un livre de 187 000 tokens avec chaque question sur ce livre. Chaque appel prend environ 5 secondes, et le modèle relit tout le livre à chaque fois (jour 33 : l’API ne garde rien entre deux appels).',
		'Le prompt caching garde pendant quelques minutes le début déjà traité d’un prompt. Dans l’exécution du cookbook d’Anthropic, la même question sur le livre a pris 4,89 s sans cache et **1,48 s quand le livre venait du cache**.'
	],
	terms: [
		{ term: 'Préfixe', def: 'La partie d’une requête depuis son premier token jusqu’à un point de cache, dans l’ordre `tools`, puis `system`, puis `messages`.' },
		{ term: 'Point de cache', def: 'Un marqueur `cache_control: {"type": "ephemeral"}` posé sur un bloc de contenu, ou une seule fois au niveau de la requête. Le préfixe mis en cache s’arrête à ce bloc, et une requête peut en avoir jusqu’à 4.' },
		{ term: 'Écriture en cache', def: 'La première requête avec un nouveau préfixe le stocke, ce qu’indique `cache_creation_input_tokens`. Les requêtes suivantes avec le même préfixe font une lecture, indiquée par `cache_read_input_tokens`.' },
		{ term: 'TTL', def: 'La durée de vie d’une entrée de cache : 5 minutes par défaut, ou 1 heure avec une écriture plus chère. Chaque lecture renouvelle l’entrée pour 5 minutes de plus, sans surcoût.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req1["Requête 1 : livre (187 361 tokens) + question, cache_control activé"] --> hash["Hash du préfixe jusqu’au point de cache"]'],
				highlight: ['req1', 'hash'],
				note: 'L’API calcule un hash de tout ce qui va du début de `tools` jusqu’au bloc qui porte le point de cache. La doc : « changing any block at or before the breakpoint produces a different hash on the next request » (modifier un bloc avant le point change le hash). Sur Claude Sonnet 4.6, un préfixe de moins de 1 024 tokens n’est jamais mis en cache.'
			},
			{
				add: ['hash -->|"pas encore d’entrée"| write["Écriture : 187 361 tokens à 1,25x le prix d’entrée, 4,28 s"]'],
				highlight: ['write'],
				note: 'Le premier appel ne trouve aucune entrée, traite tout le prompt et stocke le préfixe. Une écriture à 5 minutes coûte 1,25 fois le prix d’entrée de base : ce premier appel coûte un peu plus cher que sans cache. Une deuxième requête ne peut lire l’entrée qu’une fois cette première réponse commencée.'
			},
			{
				add: ['req2["Requête 2 : même préfixe, moins de 5 minutes après"] --> hash', 'hash -->|"entrée trouvée"| read["Lecture : 187 361 tokens à 0,1x, 1,48 s"]'],
				highlight: ['req2', 'read'],
				note: 'Le second appel retrouve le hash stocké et saute le traitement du livre. Une lecture coûte 0,1 fois le prix d’entrée de base sur la plupart des modèles, et 0,05 fois sur Claude Opus 5.5 et Claude Sonnet 5.5. Les 5 minutes partent du début de la requête qui lit : chaque lecture les relance.'
			},
			{
				add: ['req3["Requête 3 : un caractère modifié avant le point de cache"] --> hash', 'hash -->|"hash différent"| miss["Raté : plein tarif, et une nouvelle écriture"]'],
				highlight: ['req3', 'miss'],
				note: 'Un horodatage en haut du prompt système change le hash à chaque requête : chacune paie une écriture et aucune ne lit. Modifier une définition d’outil invalide les caches `tools`, `system` et `messages`. Modifier `tool_choice` n’invalide que la partie `messages`.'
			},
			{
				add: ['read --> usage["usage : cache_read + cache_creation + input_tokens = entrée totale"]'],
				highlight: ['usage'],
				note: '`input_tokens` ne compte que les tokens après le dernier point de cache : 3 dans l’exécution du cookbook, contre 187 361 lus depuis le cache. Si `cache_creation_input_tokens` et `cache_read_input_tokens` valent tous les deux 0, rien n’a été mis en cache, et l’API ne renvoie aucune erreur.'
			}
		]
	},
	example: {
		title: 'misc/prompt_caching.ipynb : la même question sur le livre, avec et sans cache',
		repo: 'anthropics/claude-cookbooks',
		url: NOTEBOOK,
		lang: 'python',
		code: `client = anthropic.Anthropic()
MODEL_NAME = "claude-sonnet-4-6"

# Unique prefix to ensure we don't hit a stale cache from a previous run
TIMESTAMP = int(time.time())
…
start = time.time()
write_response = client.messages.create(
    model=MODEL_NAME,
    max_tokens=300,
    cache_control={"type": "ephemeral"},  # <-- one-line change
    messages=[
        {
            "role": "user",
            "content": str(TIMESTAMP)
            + "<book>"
            + book_content
            + "</book>"
            + "\\n\\nWhat is the title of this book? Only output the title.",
        }
    ],
)
write_time = time.time() - start
…
    response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=300,
        system=[
            {
                "type": "text",
                "text": system_message,
                "cache_control": {"type": "ephemeral"},  # explicit breakpoint on system
            },
        ],
        messages=conv.get_messages(),
    )`,
		notes: [
			'La ligne `cache_control` du premier appel, c’est le caching automatique. Elle se place au niveau de la requête, et l’API pose le point de cache sur le dernier bloc qui peut être mis en cache. Le notebook a lancé cet appel exact deux fois : 4,28 s et 187 361 tokens écrits, puis 1,48 s et 187 361 tokens lus.',
			'Le `TIMESTAMP` au début de `content` est voulu : un nouveau nombre à chaque exécution du notebook donne un nouveau préfixe, et une entrée laissée par une exécution précédente ne peut pas correspondre. Un horodatage dans ton propre prompt fait la même chose à chaque requête.',
			'Le dernier appel pose `cache_control` sur le bloc `system` lui-même : un point de cache explicite. Le livre est dans `system_message`, qui ne change pas, alors que les questions de `messages` changent à chaque tour.',
			'Avec les prix de Claude Sonnet 4.6 du tableau de la doc (3 $, 3,75 $ et 0,30 $ par million de tokens pour l’entrée, l’écriture à 5 minutes et la lecture), 187 361 tokens coûtent environ 0,56 $ sans cache, 0,70 $ pour l’écriture et 0,056 $ par lecture.'
		]
	},
	tradeoff: {
		gain: [
			'Dans l’exécution du cookbook, une lecture en cache a fait passer l’appel de 4,89 s à 1,48 s, soit 3,3 fois plus vite.',
			'Chaque lecture du livre de 187 361 tokens coûte environ 0,056 $ sur Claude Sonnet 4.6, contre 0,56 $ sans cache.',
			'Un point de cache ne coûte rien en lui-même. Tu paies les tokens écrits, lus, et ceux qui restent après le dernier point.'
		],
		cost: [
			'La première requête paie 1,25 fois le prix d’entrée pour une écriture à 5 minutes, et 2 fois pour une écriture à 1 heure.',
			'Une entrée qui n’est pas lue pendant 5 minutes disparaît, et l’appel suivant repaie une écriture complète.',
			'Un octet modifié avant le point de cache, une définition d’outil modifiée ou un prompt sous le minimum du modèle donnent un raté sans aucune erreur. Seuls les champs de `usage` le montrent.',
			'Une requête ne peut lire une entrée qu’une fois commencée la réponse qui l’a écrite : 10 requêtes envoyées au même instant ratent toutes le cache.'
		]
	},
	task: {
		prompt: 'Un bot de support sur Claude Sonnet 4.6 envoie un texte de règles de 20 000 tokens en `system`, avec « Current time: 14:02:31 » en première ligne, et `cache_control` sur le bloc système. Chaque réponse affiche `cache_creation_input_tokens: 20000` et `cache_read_input_tokens: 0`. Explique pourquoi, compare le coût par requête avec l’absence totale de cache, et corrige.',
		hint: 'Quelle est la première chose dans le hash du préfixe, et à quelle fréquence change-t-elle ?',
		answer: [
			'L’heure est dans le préfixe, tout au début. Elle change chaque seconde : chaque requête a un nouveau hash, et la recherche ne trouve jamais d’entrée écrite par une requête précédente.',
			'Chaque requête paie une écriture : 20 000 × 3,75 $ par million = 0,075 $. Sans `cache_control`, elle paierait 0,06 $. Le cache cassé coûte 25 % de plus que pas de cache du tout.',
			'Correction : sors l’heure de `system` et mets-la dans le message user, après le point de cache, en gardant `cache_control` sur le bloc des règles. Le texte des règles est alors identique à chaque requête.',
			'Moins de 5 minutes après une requête précédente, chaque requête lit alors les règles pour 20 000 × 0,30 $ par million = 0,006 $, et `cache_read_input_tokens` affiche 20000.'
		],
		steps: [
			{
				title: 'Lis l’usage',
				questions: [
					{ q: 'Que veut dire `cache_creation_input_tokens: 20000` sur une réponse ?', options: ['La requête a lu 20 000 tokens dans le cache', 'La requête a écrit un préfixe de 20 000 tokens en cache', 'Le cache est plein et a refusé le préfixe', 'Les règles sont sous la longueur minimale'], answer: 1, why: 'Une écriture en cache apparaît dans `cache_creation_input_tokens`. Une lecture apparaît dans `cache_read_input_tokens`.' },
					{ q: 'Chaque réponse affiche `cache_read_input_tokens: 0`. Qu’est-ce que ça te dit ?', options: ['Aucune requête n’a jamais trouvé d’entrée précédente', 'Le cache est désactivé pour le compte', 'Les lectures sont gratuites, donc elles affichent 0', 'Le TTL est réglé sur 1 heure'], answer: 0, why: 'Chaque requête écrit et aucune ne lit : chacune rate l’entrée stockée par la précédente.' },
					{ q: 'Les règles sont-elles assez longues pour être mises en cache sur Claude Sonnet 4.6 ?', options: ['Non, le minimum est de 32 000 tokens', 'Seulement avec le TTL de 1 heure', 'Oui : 20 000 dépasse le minimum de 1 024 tokens', 'Seulement avec un `cache_control` au niveau de la requête'], answer: 2, why: 'Un préfixe sous 1 024 tokens n’est jamais mis en cache sur Claude Sonnet 4.6. Celui-ci est bien au-dessus, et les écritures prouvent qu’il est stocké.' },
					{ q: 'Dans quel ordre l’API construit-elle le préfixe ?', options: ['`messages`, puis `system`, puis `tools`', '`system`, puis `messages`, puis `tools`', '`system`, puis `tools`, puis `messages`', '`tools`, puis `system`, puis `messages`'], answer: 3, why: 'Le préfixe va du début de `tools` jusqu’au bloc qui porte le point de cache.' }
				]
			},
			{
				title: 'Trouve la cause',
				questions: [
					{ q: 'Où se trouve « Current time: 14:02:31 » dans le préfixe ?', options: ['Après le point de cache, hors du cache', 'Tout au début, dans la partie mise en cache', 'Dans le message user', 'Dans les définitions d’outils'], answer: 1, why: 'C’est la première ligne de `system`, avant les règles et avant le point de cache.' },
					{ q: 'Pourquoi l’heure casse-t-elle le cache ?', options: ['Elle change le hash à chaque requête', 'Les heures sont interdites dans `system`', 'Elle rend le prompt trop long', 'Elle désactive `cache_control`'], answer: 0, why: '« Changing any block at or before the breakpoint produces a different hash on the next request. »' },
					{ q: 'À quelle fréquence cette première ligne change-t-elle ?', options: ['Toutes les 5 minutes', 'Une fois par jour', 'Chaque seconde', 'Seulement quand les règles changent'], answer: 2, why: 'Une horloge à la seconde donne un nouveau préfixe à chaque requête, donc aucune recherche ne trouve d’entrée précédente.' },
					{ q: 'L’API renvoie-t-elle une erreur quand aucune lecture n’a lieu ?', options: ['Oui, une 400 à la deuxième requête', 'Oui, un avertissement dans `stop_reason`', 'Seulement après 4 points de cache', 'Non : les champs d’usage sont le seul signe'], answer: 3, why: 'Un raté de cache n’est pas une erreur. Tu le vois dans `cache_creation_input_tokens` et `cache_read_input_tokens`.' }
				]
			},
			{
				title: 'Compare le coût',
				questions: [
					{ q: 'À 3,75 $ par million pour les écritures 5 minutes, combien chaque requête paie-t-elle pour les règles ?', options: ['0,006 $', '0,06 $', '0,075 $', '0,75 $'], answer: 2, why: '20 000 × 3,75 $ par million font 0,075 $.' },
					{ q: 'Au prix d’entrée de base de 3 $ par million, combien paierait-elle sans cache ?', options: ['0,06 $', '0,075 $', '0,006 $', '0,6 $'], answer: 0, why: '20 000 × 3 $ par million font 0,06 $.' },
					{ q: 'Comment le cache cassé se compare-t-il à pas de cache du tout ?', options: ['Il coûte pareil', 'Il coûte 10 % de moins', 'Il coûte 90 % de moins', 'Il coûte 25 % de plus'], answer: 3, why: 'Une écriture coûte 1,25 fois le prix d’entrée de base, et ici chaque requête en paie une.' },
					{ q: 'Combien coûterait une lecture des règles en cache à 0,30 $ par million ?', options: ['0,06 $', '0,006 $', '0,0006 $', '0,03 $'], answer: 1, why: '20 000 × 0,30 $ par million font 0,006 $, un dixième du prix de base.' }
				]
			},
			{
				title: 'Corrige le préfixe',
				questions: [
					{ q: 'Où va l’heure ?', options: ['À la fin de `system`, avant le point de cache', 'Dans la description d’un outil', 'Dans le message user, après le point de cache', 'Nulle part : le bot ne peut pas connaître l’heure'], answer: 2, why: 'Après le point de cache, elle ne change plus le hash, donc le préfixe des règles reste identique.' },
					{ q: 'Où reste `cache_control` ?', options: ['Sur le bloc des règles dans `system`', 'Sur le message user', 'Sur le premier outil', 'Il est supprimé'], answer: 0, why: 'Le point de cache sur le bloc des règles fait des 20 000 tokens le préfixe mis en cache.' },
					{ q: 'Après la correction, une requête arrive 3 minutes après la précédente. Que montre `usage` ?', options: ['`cache_creation_input_tokens: 20000`', 'Les deux champs de cache à 0', '`input_tokens: 20000`', '`cache_read_input_tokens: 20000`'], answer: 3, why: 'Moins de 5 minutes après une requête précédente, les règles viennent du cache.' },
					{ q: 'Une requête arrive chaque minute, toute la journée. L’entrée expire-t-elle toutes les 5 minutes ?', options: ['Oui, 5 minutes après la première écriture', 'Non : chaque lecture la renouvelle sans surcoût', 'Oui, sauf si tu paies le TTL de 1 heure', 'Non : les entrées n’expirent jamais'], answer: 1, why: 'Chaque lecture relance les 5 minutes, donc un flux régulier de requêtes garde l’entrée en vie.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu modifies la description d’un outil dans `tools` et tu gardes tout le reste identique. Quelles parties du cache restent valides ?',
			options: [
				'Les parties `system` et `messages`, car seule la partie `tools` a changé',
				'La partie `messages`, car elle vient en dernier et contient la conversation',
				'Toutes, car les définitions d’outils ne font jamais partie du cache',
				'Aucune : `tools`, `system` et `messages` sont toutes invalidées'
			],
			answer: 3,
			why: 'Le préfixe se construit dans l’ordre `tools`, `system`, `messages`, et un changement à un niveau invalide ce niveau et tous ceux qui suivent. Les outils viennent en premier : une description d’outil modifiée invalide tout le cache.'
		},
		{
			q: 'Sur Claude Sonnet 4.6, tu poses `cache_control` sur un prompt système de 300 tokens. Les deux champs de cache de `usage` valent 0, et aucune erreur n’est revenue. Pourquoi ?',
			options: [
				'Le prompt est sous le minimum de 1 024 tokens, il a été traité sans cache',
				'`cache_control` ne marche qu’au niveau de la requête, pas sur un bloc',
				'Une écriture en cache n’apparaît qu’à la deuxième requête avec le même préfixe',
				'Le prompt caching doit être activé sur le compte avant de fonctionner'
			],
			answer: 0,
			why: 'La longueur minimale à mettre en cache sur Claude Sonnet 4.6 est de 1 024 tokens. Les prompts plus courts « will be processed without caching, and no error is returned » (sont traités sans cache, sans erreur) : les deux champs de usage sont le seul indice.'
		},
		{
			q: 'Une réponse qui a lu un préfixe en cache met 4 minutes à arriver en streaming. Avec le TTL par défaut, quand la requête suivante doit-elle partir pour lire la même entrée ?',
			options: [
				'Dans les 5 minutes qui suivent la fin de la réponse',
				'Dans la minute environ qui suit la fin de la réponse',
				'À tout moment dans l’heure, car chaque lecture la prolonge',
				'Seulement après une requête qui renouvelle l’entrée'
			],
			answer: 1,
			why: 'La durée de vie de 5 minutes part du début de la requête qui a écrit ou lu l’entrée. 4 de ces minutes sont passées en streaming, et la doc dit que la suite « must start within about 1 minute » (doit partir dans la minute environ).'
		}
	],
	recall: {
		q: 'Dans l’exécution du cookbook sur le livre de 187 361 tokens, combien de temps a pris l’appel sans cache, et combien l’appel qui a lu le cache ?',
		a: '4,89 s sans cache et 1,48 s avec une lecture en cache, 3,3 fois plus vite. La lecture apparaît comme `cache_read_input_tokens: 187361`.'
	},
	sources: [
		{ title: 'Doc Claude, Prompt caching (tableau des prix et minimums), lue le 2026-10-17', url: DOCS },
		{ title: 'anthropics/claude-cookbooks, misc/prompt_caching.ipynb', url: NOTEBOOK }
	]
};
