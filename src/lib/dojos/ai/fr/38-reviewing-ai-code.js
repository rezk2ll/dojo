const CURL = 'https://github.com/curl/curl/blob/e251e858b941e29bb95a6c0d26bb45981a872585';
const WS = `${CURL}/lib/ws.c`;
const POST = 'https://daniel.haxx.se/blog/2024/01/02/the-i-in-llm-stands-for-intelligence/';
const REPORT = 'https://hackerone.com/reports/2298307';
const BP = 'https://code.claude.com/docs/en/best-practices';
const PROMPTING = 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices';
const REVIEW = 'https://github.com/anthropics/claude-code/blob/c017428c8c27e604840435048d5bce6a9a22c040/plugins/code-review/commands/code-review.md';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'reviewing-ai-code',
	part: 'Construire avec l’API',
	title: 'Relire du code écrit par une IA',
	minutes: 10,
	hook: [
		'Le 28 décembre 2023, le projet curl reçoit un rapport de sécurité intitulé « Buffer Overflow Vulnerability in WebSocket Handling ». Il est écrit dans un anglais soigné, pointe une ligne de `lib/ws.c` et propose un correctif.',
		'Daniel Stenberg, du projet curl, lit le code trois fois et ne trouve aucun débordement. Après d’autres questions et des réponses qui ne collent pas au code, il ferme le rapport l’après-midi même. Il écrit que les réponses avaient « several signs » (plusieurs signes) d’un LLM, sans en être sûr.',
		'Le code sorti de ta propre session d’agent a l’air tout aussi propre.'
	],
	terms: [
		{ term: 'API inventée', def: 'Un appel à une fonction, un paramètre, une option ou un paquet qui n’existe pas dans la version que tu utilises. Le code se lit bien et plante à l’exécution.' },
		{ term: 'Dérive de périmètre', def: 'Des changements que la tâche ne demandait pas dans un diff : fichiers reformatés, nouveaux helpers, configuration en plus.' },
		{ term: 'Test creux', def: 'Un test qui passe encore quand le code qu’il devrait vérifier est cassé ou supprimé.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['diff["Le diff de l’agent"] --> scope{"Chaque fichier modifié se rattache-t-il à la tâche ?"}', 'scope -->|"non"| cut["Demander de le retirer, ou de le mettre dans sa propre PR"]'],
				highlight: ['scope', 'cut'],
				note: 'La doc de prompting de Claude dit que Claude Opus 4.5 et 4.6 « have a tendency to overengineer by creating extra files, adding unnecessary abstractions, or building in flexibility that wasn\'t requested » (ont tendance à en faire trop : fichiers en plus, abstractions inutiles, souplesse non demandée). Lis d’abord la liste des fichiers : un correctif d’une ligne qui touche 9 fichiers doit justifier chacun des 8 autres.'
			},
			{
				add: ['scope -->|"oui"| names{"Chaque nouveau nom existe-t-il ?"}', 'names -->|"build, typecheck, ouvrir la définition"| run["Le lancer sur une vraie entrée"]'],
				highlight: ['names', 'run'],
				note: 'Pour chaque nouvel import, fonction, argument nommé ou paquet, trouve sa définition ou sa page de doc. Dans du code compilé ou typé, un build ou un typecheck échoue sur un nom qui n’existe pas. La commande de revue d’Anthropic elle-même signale le code qui « will fail to compile or parse », par exemple « missing imports, unresolved references ».'
			},
			{
				add: ['run --> claim{"Les lignes autour confirment-elles l’affirmation ?"}'],
				highlight: ['claim'],
				note: 'Une explication comme « ce n’est pas vérifié » ou « ceci ne peut pas être null » est une affirmation sur le code. Lis les lignes au-dessus et en dessous avant de l’accepter. Dans le rapport curl, la vérification de taille se trouvait deux lignes au-dessus de la ligne dite non vérifiée.'
			},
			{
				add: ['claim --> tests{"Annule le correctif : le nouveau test échoue-t-il ?"}', 'tests -->|"passe encore"| hollow["Test creux : le réécrire"]'],
				highlight: ['tests', 'hollow'],
				note: 'La doc prévient que Claude « can sometimes focus too heavily on making tests pass at the expense of more general solutions » (peut viser les tests verts au détriment d’une solution générale). Pour contrôler un test, annule le correctif et lance-le. Un test qui reste vert n’a pas testé le correctif.'
			},
			{
				add: ['tests -->|"échoue comme prévu"| evidence["Demander les preuves : commande, sortie"]', 'evidence --> fresh["Deuxième revue dans une session neuve"]'],
				highlight: ['evidence', 'fresh'],
				note: 'La doc de Claude Code : « Have Claude show evidence rather than asserting success », c’est-à-dire la commande lancée et ce qu’elle a renvoyé. Elle ajoute qu’un contexte neuf aide la revue, « since Claude won\'t be biased toward code it just wrote » (Claude n’est pas biaisé en faveur du code qu’il vient d’écrire).'
			}
		]
	},
	example: {
		title: 'lib/ws.c dans curl : la ligne citée par le rapport, et la vérification juste au-dessus',
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
			'La ligne `strcpy(keyval, randstr);` est la ligne 581, celle que le [rapport](' + REPORT + ') pointait. Le rapport disait que « the `strcpy` function is used without proper bounds checking » et qu’on pouvait le déclencher avec « a base64-encoded nonce value that exceeds the buffer size ».',
			'Les deux lignes au-dessus sont la vérification de taille : `if(randlen >= sizeof(keyval)) return CURLE_FAILED_INIT;`. Si la chaîne encodée ne tient pas dans `keyval`, la fonction sort avant que `strcpy` ne s’exécute.',
			'Les déclarations fixent les tailles : `rand[16]` contient 16 octets aléatoires, et 16 octets en base64 font 24 caractères. `keyval[40]` a la place pour ces 24 plus le zéro final. La requête ne choisit pas le nonce : c’est `Curl_rand` qui le tire.',
			'Le correctif proposé remplaçait `strcpy` par `strncpy(keyval, randstr, sizeof(keyval) - 1)`. Pour une chaîne de 24 caractères dans un buffer de 40 octets, les deux appels laissent la même chaîne dans `keyval`. Un patch qui ne change rien peut quand même ressembler à un correctif de sécurité : c’est pour ça qu’il faut confronter l’affirmation au code.'
		]
	},
	tradeoff: {
		gain: [
			'Un build, un typecheck ou une exécution sur une vraie entrée s’arrête sur un nom inventé dans le code qu’il atteint, avant qu’une personne lise une ligne.',
			'Annuler le correctif et lancer le nouveau test tient en une commande, et ça démasque un test creux à chaque fois.',
			'Un diff limité à la tâche reste assez petit pour être lu ligne par ligne.'
		],
		cost: [
			'Vérifier prend le temps d’une personne : le rapport curl est arrivé un matin et a été fermé l’après-midi. Stenberg écrit qu’un tel rapport « takes away developer time and energy from something productive » (prend aux développeurs du temps et de l’énergie).',
			'Un agent relecteur à qui on demande des failles « will usually report some, even when the work is sound » (en trouvera presque toujours, même quand le travail est bon), prévient la doc de Claude Code. Elle conseille de ne signaler que ce qui touche la justesse ou les exigences de la tâche.',
			'Aucun de ces contrôles ne prouve que le code est juste. Ils attrapent trois erreurs courantes, et il te reste à lire le reste.'
		]
	},
	task: {
		prompt: 'Un agent a ouvert une PR pour ce ticket : `parse_date("2024-02-30")` renvoie une date en mars au lieu de lever une erreur. Le diff remplace le corps de `parse_date(s)` dans `dates.py` par `return date.fromisoformat(s, strict=True)`. Il ajoute un test, `with pytest.raises(Exception): parse_date("2024-02-30")`, et reformate trois autres modules. La CI est verte. Relis-la avec Python 3.12 : que signales-tu, et comment prouves-tu que le test est creux ?',
		hint: 'Essaie la nouvelle ligne dans un shell Python avec une date valide comme "2024-02-01". Puis demande-toi quelles exceptions `pytest.raises(Exception)` accepte.',
		answer: [
			'API inventée : `date.fromisoformat()` n’accepte aucun argument nommé. Sous Python 3.12, l’appel lève `TypeError: date.fromisoformat() takes no keyword arguments` pour toute entrée, dates valides comprises.',
			'Test creux : `pytest.raises(Exception)` accepte ce `TypeError`, donc la CI reste verte alors que chaque date valide échoue aussi. Attends plutôt un `ValueError`, et ajoute un test qui vérifie que `parse_date("2024-02-01")` renvoie `date(2024, 2, 1)`.',
			'Preuve : dans un shell Python, `parse_date("2024-02-01")` lève le même `TypeError`. Le test passe que le code soit juste ou cassé, il ne vérifie donc rien.',
			'Périmètre : les trois modules reformatés ne font pas partie du ticket, demande-les dans une PR à part. Le vrai correctif est plus court : sous Python 3.12, `date.fromisoformat("2024-02-30")` lève déjà `ValueError: day is out of range for month`.'
		],
		steps: [
			{
				title: 'Lis la liste des fichiers',
				questions: [
					{ q: 'Le ticket porte sur `parse_date`. Quels fichiers le diff devrait-il toucher ?', options: ['`dates.py` et son test', '`dates.py`, son test et trois modules reformatés', 'Chaque module qui importe `dates.py`', 'Seulement le fichier de test'], answer: 0, why: 'Le correctif d’une fonction doit justifier chaque autre fichier qu’il touche.' },
					{ q: 'Comment appelles-tu les trois modules reformatés ?', options: ['Un test creux', 'Une API inventée', 'Une dérive de périmètre', 'Un nettoyage obligatoire'], answer: 2, why: 'Des changements que la tâche ne demandait pas, comme des fichiers reformatés, sont une dérive de périmètre.' },
					{ q: 'Que demandes-tu pour ces trois modules ?', options: ['De les retirer et de les envoyer dans une PR à part', 'De les garder, puisque la CI est verte', 'De reformater aussi le reste du dépôt', 'D’ajouter des tests sur le formatage'], answer: 0, why: 'Ils ne font pas partie du ticket, et un diff limité à la tâche reste assez petit pour être lu ligne par ligne.' },
					{ q: 'Pourquoi la doc Claude dit-elle de surveiller les fichiers en trop ?', options: ['Les fichiers en trop ralentissent la CI', 'Git ne sait pas fusionner plus de cinq fichiers', 'Les relecteurs sont payés au fichier', 'Claude Opus 4.5 et 4.6 ont tendance à en faire trop et à créer des fichiers en plus'], answer: 3, why: 'La doc dit que Claude Opus 4.5 et 4.6 « have a tendency to overengineer by creating extra files ».' }
				]
			},
			{
				title: 'Vérifie le nouvel appel',
				questions: [
					{ q: 'Sous Python 3.12, `date.fromisoformat()` accepte-t-il `strict=True` ?', options: ['Oui, depuis Python 3.11', 'Non : il n’accepte aucun argument nommé', 'Oui, mais seulement sur les dates', 'Seulement avec `from __future__ import strict`'], answer: 1, why: 'Ce mot-clé n’existe pas : c’est une API inventée.' },
					{ q: 'Que fait la nouvelle ligne avec une date valide comme `"2024-02-01"` ?', options: ['Elle renvoie `date(2024, 2, 1)`', 'Elle renvoie `None`', 'Elle lève `TypeError`', 'Elle lève `ValueError`'], answer: 2, why: 'L’appel échoue sur l’argument nommé avant même de lire la chaîne, donc chaque entrée lève une erreur.' },
					{ q: 'Comment vérifies-tu un nouvel argument nommé en relecture ?', options: ['Tu lui fais confiance si le code se lit bien', 'Tu cherches sa définition ou sa page de doc', 'Tu demandes à l’agent s’il existe', 'Tu attends que des utilisateurs le signalent'], answer: 1, why: 'Pour chaque nouvel import, fonction, argument nommé ou paquet, trouve sa définition ou sa page de doc.' },
					{ q: 'Que fait déjà `date.fromisoformat("2024-02-30")` sous Python 3.12 ?', options: ['Il renvoie une date en mars', 'Il renvoie `None`', 'Il lève `TypeError`', 'Il lève `ValueError: day is out of range for month`'], answer: 3, why: 'Le vrai correctif est plus court : l’appel standard rejette déjà cette date.' }
				]
			},
			{
				title: 'Teste le test',
				questions: [
					{ q: 'Quelles exceptions `pytest.raises(Exception)` accepte-t-il ?', options: ['Toute sous-classe de `Exception`, `TypeError` compris', 'Seulement `ValueError`', 'Seulement celles levées par `parse_date`', 'Aucune tant que tu n’en nommes pas une'], answer: 0, why: 'Presque toutes les classes d’erreur héritent de `Exception`, donc le test passe aussi sur le `TypeError`.' },
					{ q: 'Pourquoi la CI est-elle verte ?', options: ['Le test vérifie le bon comportement', 'La CI a sauté le nouveau test', 'Le `TypeError` satisfait `pytest.raises(Exception)`', 'Python 3.12 accepte `strict=True`'], answer: 2, why: 'Le test attend n’importe quelle erreur, et l’appel cassé en lève une pour chaque entrée.' },
					{ q: 'Comment prouves-tu que le test est creux ?', options: ['Tu lis le nom du test', 'Tu lances `parse_date("2024-02-01")` et tu vois le même `TypeError`', 'Tu demandes à l’agent de l’expliquer', 'Tu relances la CI'], answer: 1, why: 'Une date valide échoue de la même façon, donc le test passe que le code soit juste ou cassé.' },
					{ q: 'Quelle est la façon générale de vérifier un test qui protège un correctif ?', options: ['Compter ses assertions', 'Le lancer deux fois', 'Le renommer', 'Annuler le correctif et le lancer : il doit échouer'], answer: 3, why: 'Un test qui reste vert sans le correctif n’a pas testé le correctif.' }
				]
			},
			{
				title: 'Écris la relecture',
				questions: [
					{ q: 'Quelle exception le test doit-il attendre ?', options: ['`ValueError`', '`TypeError`', '`Exception`', '`KeyError`'], answer: 0, why: '`ValueError: day is out of range for month` est ce que lève le vrai correctif pour `"2024-02-30"`.' },
					{ q: 'Quel test demandes-tu en plus ?', options: ['Un test où `parse_date` lève une erreur pour toute entrée', 'Un test où `parse_date("2024-02-01")` renvoie `date(2024, 2, 1)`', 'Un test sur le formatage des trois modules', 'Un test qui vérifie que `strict=True` est accepté'], answer: 1, why: 'Un test sur une date valide échoue tant que le mot-clé inventé est là.' },
					{ q: 'L’agent a écrit « tous les tests passent ». Que dit la doc Claude Code de demander ?', options: ['Une explication plus longue', 'Un deuxième agent qui confirme', 'Des preuves : la commande lancée et ce qu’elle a renvoyé', 'Rien de plus : le vert suffit'], answer: 2, why: '« Have Claude show evidence rather than asserting success. »' },
					{ q: 'Tu demandes à un agent relecteur les manques de cette PR. Que dit la doc ?', options: ['Il ne trouve jamais de manque dans du code d’agent', 'Il a besoin de la session qui a écrit le code', 'Il ne lit que les fichiers de test', 'Il en signalera presque toujours, même quand le travail est solide'], answer: 3, why: 'La doc conseille de ne signaler que les manques qui touchent la justesse ou les exigences posées.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un rapport dit qu’un appel `strcpy` de ton code C n’a pas de vérification de taille et propose un patch. Que fais-tu d’abord ?',
			options: [
				'Tu fusionnes le patch, car `strncpy` est toujours plus sûr que `strcpy`',
				'Tu lis les lignes autour de l’appel et la taille des buffers dans les déclarations',
				'Tu lances un fuzzer sur tout le projet pendant une journée avant de répondre',
				'Tu demandes un numéro de CVE au rapporteur avant de lire le code'
			],
			answer: 1,
			why: 'L’affirmation porte sur le code, c’est donc le code qui tranche. Dans le cas curl, `if(randlen >= sizeof(keyval))`, deux lignes au-dessus du `strcpy`, rendait le débordement impossible, et le `strncpy` proposé laissait la même chaîne dans le buffer.'
		},
		{
			q: 'Tu annules le correctif de l’agent, tu lances son nouveau test, et il passe encore. Qu’est-ce que ça t’apprend ?',
			options: [
				'Le correctif est bon, puisque le test passe dans les deux versions',
				'Le lanceur de tests a gardé l’ancien résultat en cache et n’a rien relancé',
				'Le test ne vérifie pas le comportement que le correctif change',
				'Le bug était déjà corrigé ailleurs dans le code'
			],
			answer: 2,
			why: 'Un test qui protège un correctif doit échouer sans lui. S’il passe sans le correctif, il passerait aussi avec le bug encore là : il ne prouve rien sur le changement.'
		},
		{
			q: 'Pourquoi la doc de Claude Code conseille-t-elle de relire un changement dans une session neuve plutôt que dans celle qui l’a écrit ?',
			options: [
				'Une session neuve tourne sur un plus gros modèle, meilleur en revue',
				'La session qui a écrit le code n’a pas le droit de lire son propre diff',
				'Une session neuve coûte moins de tokens, car la revue n’a besoin d’aucun outil',
				'Dans un contexte neuf, Claude n’est pas biaisé envers le code qu’il vient d’écrire'
			],
			answer: 3,
			why: 'La doc dit : « A fresh context improves code review since Claude won\'t be biased toward code it just wrote. » Le relecteur voit le diff et les critères que tu lui donnes, pas le raisonnement qui a produit le changement.'
		}
	],
	recall: {
		q: 'Cite les trois façons dont le code écrit par une IA rate, vues dans ce chapitre, et le contrôle de chacune.',
		a: 'API inventée : build, typecheck et ouvrir la définition. Dérive de périmètre : rattacher chaque fichier modifié à la tâche. Test creux : annuler le correctif et vérifier que le test échoue.'
	},
	sources: [
		{ title: 'Daniel Stenberg, The I in LLM stands for intelligence (2 janvier 2024)', url: POST },
		{ title: 'Rapport HackerOne 2298307 à curl, Buffer Overflow Vulnerability in WebSocket Handling', url: REPORT },
		{ title: 'Source de curl, lib/ws.c au commit cité par le rapport', url: WS },
		{ title: 'Doc Claude Code, Best practices, lue le 2026-10-17', url: BP },
		{ title: 'Doc Claude, Prompting best practices, lue le 2026-10-17', url: PROMPTING },
		{ title: 'claude-code, plugins/code-review/commands/code-review.md', url: REVIEW }
	]
};
