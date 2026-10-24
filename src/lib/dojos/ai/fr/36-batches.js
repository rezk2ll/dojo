const SDK = 'https://github.com/anthropics/anthropic-sdk-python/blob/bcd55fe1d3f0f1240765f8cef04295b67337f55a';
const BATCHES = `${SDK}/src/anthropic/resources/messages/batches.py`;
const DOCS = 'https://platform.claude.com/docs/en/build-with-claude/batch-processing';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'batches',
	part: 'Construire avec l’API',
	title: 'Le traitement par lots',
	minutes: 10,
	hook: [
		'Ton équipe veut 10 000 vieux tickets de support classés par domaine produit avant lundi. Le premier script appelle `messages.create` dans une boucle `for`. Il enchaîne 10 000 appels, chacun compte dans ta limite de débit et chacun est facturé plein tarif.',
		'Personne ne lira ces étiquettes avant lundi : les réponses peuvent attendre quelques heures. L’API Message Batches sert à ce cas. Tu envoies les 10 000 requêtes en un seul appel, l’API les traite à son rythme, et la doc annonce : « All usage is charged at 50% of the standard API prices » (tout est facturé à 50 % du prix normal).'
	],
	terms: [
		{ term: 'Message Batch', def: 'Un objet qui contient jusqu’à 100 000 requêtes Messages (ou 256 MB), traitées en asynchrone. Chaque requête est traitée sans dépendre des autres.' },
		{ term: 'custom_id', def: 'Le nom que tu donnes à chaque requête du lot : 1 à 64 lettres, chiffres, tirets ou underscores. C’est le seul moyen de relier un résultat à sa requête.' },
		{ term: 'processing_status', def: 'Le champ du lot que tu interroges : `in_progress` pendant le traitement, `canceling` après une annulation, `ended` quand chaque requête a un résultat.' },
		{ term: 'Type de résultat', def: 'Chaque requête finit dans l’un de quatre états : `succeeded`, `errored`, `canceled` ou `expired`. Seul `succeeded` est facturé.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['reqs["10 000 requêtes : { custom_id, params }"] -->|"POST /v1/messages/batches"| batch["Lot : in_progress, results_url null"]'],
				highlight: ['reqs', 'batch'],
				note: 'Chaque requête est un `custom_id` comme `ticket-0042`, plus les `params` habituels d’un appel Messages : modèle, `max_tokens`, messages. L’appel de création répond tout de suite avec `processing_status: "in_progress"` et `results_url: null`. La réponse donne aussi `expires_at`, 24 heures après `created_at`.'
			},
			{
				add: ['batch -->|"retrieve toutes les 60 s"| poll{"processing_status ?"}', 'poll -->|"in_progress"| batch'],
				highlight: ['poll'],
				note: 'Tu interroges le lot avec `retrieve` ; l’exemple de la doc attend 60 secondes entre deux appels. Selon la doc, la plupart des lots se terminent en moins d’une heure (« most batches completing within 1 hour »). Pendant le traitement, `request_counts.processing` baisse, et les quatre autres compteurs restent à zéro jusqu’à la fin du lot entier.'
			},
			{
				add: ['poll -->|"ended"| file[("results_url : un fichier .jsonl")]'],
				highlight: ['file'],
				note: 'À `ended`, `results_url` est rempli. Le fichier contient une ligne JSON par requête, dans n’importe quel ordre : dans l’exemple de la doc, le résultat de `my-second-request` arrive avant celui de `my-first-request`. Tu lis le fichier en streaming, ligne par ligne, et tu retrouves chaque `custom_id` dans ta propre table.'
			},
			{
				add: ['file --> ok["succeeded : facturé à 50 %"]', 'file --> err["errored : corriger si invalid_request_error, sinon relancer"]', 'file --> exp["expired ou canceled : renvoyer"]'],
				highlight: ['ok', 'err', 'exp'],
				note: 'Chaque ligne a un `result.type`. Un résultat `errored` avec `invalid_request_error` demande de corriger le corps de la requête ; les autres erreurs se relancent telles quelles. Une requête qui attend encore au bout des 24 heures finit en `expired`. La doc : « You will not be billed for these requests » (ces requêtes ne sont pas facturées).'
			}
		]
	},
	example: {
		title: 'src/anthropic/resources/messages/batches.py : results() vérifie results_url, puis lit le JSONL en streaming',
		repo: 'anthropics/anthropic-sdk-python',
		url: `${BATCHES}#L366-L430`,
		lang: 'python',
		code: `    def results(
        self,
        message_batch_id: str,
        *,
…
    ) -> JSONLDecoder[MessageBatchIndividualResponse]:
        """
        Streams the results of a Message Batch as a \`.jsonl\` file.

        Each line in the file is a JSON object containing the result of a single request
        in the Message Batch. Results are not guaranteed to be in the same order as
        requests. Use the \`custom_id\` field to match results to requests.
…
        """
…
        batch = self.retrieve(message_batch_id=message_batch_id, workspace_id=workspace_id)
        if not batch.results_url:
            raise AnthropicError(
                f"No \`results_url\` for the given batch; Has it finished processing? {batch.processing_status}"
            )

        extra_headers = {"Accept": "application/binary", **(extra_headers or {})}
…
        return self._get(
            path_template(batch.results_url, message_batch_id=message_batch_id),
…
            cast_to=JSONLDecoder[MessageBatchIndividualResponse],
            stream=True,
        )`,
		notes: [
			'La ligne `batch = self.retrieve(...)` récupère le lot avant tout le reste. Si `results_url` est encore vide, la ligne suivante lève `AnthropicError` avec le `processing_status` courant dans le message. Appeler `results()` sur un lot `in_progress` échoue : tu attends donc `ended` avant.',
			'L’appel `return self._get(...)` télécharge depuis `batch.results_url` avec `stream=True`, et `JSONLDecoder` analyse une ligne à la fois pendant ta boucle. La [doc](' + DOCS + '#retrieving-batch-results) conseille le streaming « because of the potentially large size of the results » (les résultats peuvent être très gros).',
			'La docstring rappelle la règle la plus importante : « Results are not guaranteed to be in the same order as requests ». La 42e ligne du fichier peut contenir le résultat de n’importe quelle requête. Range tes entrées dans un dict indexé par `custom_id` avant d’envoyer le lot.',
			'La collecte tient dans une boucle `for` : l’exemple du SDK lui-même, [examples/batch_results.py](' + SDK + '/examples/batch_results.py#L17-L19), appelle `client.messages.batches.results(batch_id)` et affiche chaque résultat. Un vrai job remplace l’affichage par un `match` sur `result.result.type`, comme l’exemple de la doc.'
		]
	},
	tradeoff: {
		gain: [
			'Moitié prix sur les tokens d’entrée et de sortie. Sur la page des prix lue le 2026-10-17, Claude Sonnet 5.5 coûte 2 $ et 10 $ par million de tokens en entrée et en sortie, et 1 $ et 5 $ en lot.',
			'Un appel envoie jusqu’à 100 000 requêtes, et la doc précise que les lots « does not affect rate limits in the Messages API » : ton trafic en direct garde toute sa limite de débit.',
			'Les requêtes en erreur, annulées ou expirées ne coûtent rien, et l’échec d’une requête n’arrête pas les autres.'
		],
		cost: [
			'Tu attends : la plupart des lots finissent en moins d’une heure, mais une requête qui attend encore après 24 heures expire et doit être renvoyée.',
			'Un lot ne fait pas de streaming (`stream: true` donne une erreur de validation), et une faute dans `params` n’apparaît qu’à la fin du lot entier. La doc conseille d’envoyer d’abord une requête par l’API Messages.',
			'Le cache de prompt marche au mieux : la doc annonce des taux de hit « ranging from 30% to 98% », parce que les requêtes tournent en parallèle et dans n’importe quel ordre (jour 34).',
			'Les résultats sont gardés 29 jours après la création. Un script qui les cherche plus tard ne trouve rien.'
		]
	},
	task: {
		prompt: 'Tu dois classer 250 000 avis produits en positif, négatif ou neutre avec Claude Sonnet 5.5. Chaque requête fait environ 400 tokens en entrée et 10 en sortie. Personne n’a besoin des étiquettes avant demain. Prévois les lots, le schéma de `custom_id` et le script de collecte, et estime le coût avec et sans l’API Batches, avec les prix du compromis ci-dessus.',
		hint: 'Pars de la limite de 100 000 requêtes par lot. Ensuite, multiplie les tokens par le prix : une ligne pour l’entrée, une pour la sortie.',
		answer: [
			'Lots : 250 000 dépasse la limite de 100 000, il faut donc au moins trois lots, par exemple 100 000, 100 000 et 50 000. Chacun doit aussi rester sous 256 MB.',
			'`custom_id` : l’identifiant de l’avis, comme `review-000123`. Il respecte `^[a-zA-Z0-9_-]{1,64}$` et permet de réécrire chaque étiquette sur la bonne ligne, quel que soit l’ordre des résultats.',
			'Coût : l’entrée fait 250 000 × 400 = 100 millions de tokens, soit 200 $ à 2 $ ou 100 $ à 1 $. La sortie fait 250 000 × 10 = 2,5 millions de tokens, soit 25 $ à 10 $ ou 12,50 $ à 5 $. Total : 225 $ sans lots, 112,50 $ avec.',
			'Collecte : interroge chaque lot jusqu’à `ended`, lis ses résultats en streaming et enregistre chaque étiquette `succeeded` par `custom_id`. Corrige et renvoie les résultats `invalid_request_error`. Mets les autres erreurs et chaque requête `expired` dans un nouveau lot.'
		],
		steps: [
			{
				title: 'Découpe en lots',
				questions: [
					{ q: 'Combien de requêtes un Message Batch peut-il contenir au plus ?', options: ['10 000', '100 000', '250 000', '1 000 000'], answer: 1, why: 'Un lot contient jusqu’à 100 000 requêtes, ou 256 MB.' },
					{ q: 'Combien de lots faut-il au moins pour 250 000 avis ?', options: ['Un', 'Deux', 'Trois', 'Cinq'], answer: 2, why: '250 000 dépasse deux fois la limite, donc trois lots, par exemple 100 000, 100 000 et 50 000.' },
					{ q: 'En plus du nombre de requêtes, quelle limite chaque lot doit-il respecter ?', options: ['256 MB', '64 requêtes par seconde', '1 heure de traitement', '10 tokens de sortie par requête'], answer: 0, why: 'La limite d’un lot est de 100 000 requêtes ou 256 MB, selon ce qui arrive en premier.' },
					{ q: 'Pourquoi un lot convient-il à ce travail ?', options: ['Il envoie chaque étiquette en streaming', 'Il répond plus vite que les appels directs', 'Il n’a pas besoin de `params` par requête', 'Personne n’a besoin des étiquettes avant demain'], answer: 3, why: 'La plupart des lots finissent en moins d’une heure, et une requête peut prendre jusqu’à 24 heures. Le travail peut attendre.' }
				]
			},
			{
				title: 'Nomme chaque requête',
				questions: [
					{ q: 'Quel `custom_id` convient à chaque requête ?', options: ['La position de l’avis dans le fichier', '`review-000123`, l’identifiant de l’avis', 'Un UUID aléatoire créé à l’envoi', 'Le texte de l’avis lui-même'], answer: 1, why: 'L’identifiant de l’avis désigne déjà la ligne, donc chaque étiquette y retourne directement. Un UUID aléatoire demanderait une seconde table pour retrouver l’avis.' },
					{ q: 'Quel motif un `custom_id` doit-il respecter ?', options: ['`^[a-zA-Z0-9_-]{1,64}$`', '`^[0-9]+$`', 'N’importe quelle chaîne jusqu’à 256 caractères', '`^[a-z]{1,16}$`'], answer: 0, why: 'De 1 à 64 lettres, chiffres, tirets ou underscores.' },
					{ q: 'Pourquoi ne pas associer les résultats par numéro de ligne ?', options: ['Le fichier n’a pas de numéros de ligne', 'Les lignes sont triées par type de résultat', 'Les résultats peuvent revenir dans n’importe quel ordre', 'Chaque fichier de lot est inversé'], answer: 2, why: '« Results are not guaranteed to be in the same order as requests. » Le `custom_id` est le seul lien.' },
					{ q: 'Que stockes-tu avant l’envoi ?', options: ['Rien : les résultats portent l’entrée', 'L’`id` de message de chaque requête', 'Le numéro de ligne de chaque requête', 'Tes entrées dans un dict indexé par `custom_id`'], answer: 3, why: 'Chaque ligne de résultat contient le `custom_id`, et tu le cherches dans ta propre table.' }
				]
			},
			{
				title: 'Estime le coût',
				questions: [
					{ q: 'Combien de tokens d’entrée fait tout le travail ?', options: ['100 millions', '10 millions', '2,5 millions', '1 milliard'], answer: 0, why: '250 000 × 400 font 100 millions de tokens d’entrée.' },
					{ q: 'À 2 $ par million en entrée et 10 $ par million en sortie, combien coûte le travail sans lots ?', options: ['200 $', '112,50 $', '250 $', '225 $'], answer: 3, why: '200 $ pour 100 millions de tokens d’entrée, plus 25 $ pour 2,5 millions de tokens de sortie.' },
					{ q: 'Aux prix des lots, 1 $ et 5 $ par million, combien coûte-t-il ?', options: ['100 $', '112,50 $', '125 $', '225 $'], answer: 1, why: '100 $ pour l’entrée plus 12,50 $ pour la sortie. Tout l’usage en lot est facturé à 50 % des prix standard.' },
					{ q: 'Chaque avis ne reçoit que 10 tokens de sortie. Quelle part des 112,50 $ du lot vient de la sortie ?', options: ['12,50 $', '25 $', '100 $', '56,25 $'], answer: 0, why: '2,5 millions de tokens de sortie à 5 $ le million font 12,50 $. Les 100 $ restants viennent des 100 millions de tokens d’entrée.' }
				]
			},
			{
				title: 'Collecte les résultats',
				questions: [
					{ q: 'Quand peux-tu appeler `results()` sur un lot ?', options: ['Quand `processing_status` vaut `ended`', 'Dès que `create` répond', 'Quand `request_counts.processing` a baissé de moitié', 'Seulement après 24 heures'], answer: 0, why: 'Avant `ended`, `results_url` est vide et le SDK lève `AnthropicError`.' },
					{ q: 'Comment lis-tu le fichier de résultats ?', options: ['Tu le télécharges en entier, puis tu l’analyses', 'En streaming, ligne par ligne', 'Tu demandes à l’API un résultat à la fois', 'Tu l’ouvres dans la console'], answer: 1, why: 'La doc conseille le streaming « because of the potentially large size of the results ».' },
					{ q: 'Un résultat est `errored`, mais pas avec `invalid_request_error`. Que fais-tu ?', options: ['Tu réécris d’abord son prompt', 'Tu l’abandonnes, puisqu’il n’est pas facturé', 'Tu attends qu’il passe en `succeeded`', 'Tu le relances tel quel, dans un nouveau lot'], answer: 3, why: 'Seule une `invalid_request_error` demande un corps corrigé. Les autres erreurs peuvent être relancées telles quelles.' },
					{ q: 'Ton script récupère le troisième lot 30 jours après sa création. Qu’obtient-il ?', options: ['Tous les résultats, au plein tarif', 'Seulement les résultats `succeeded`', 'Rien : les résultats sont gardés 29 jours', 'Les résultats des deux premiers lots'], answer: 2, why: 'Les résultats sont stockés 29 jours après la création, alors récupère chaque lot peu après sa fin.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu as envoyé les requêtes `a`, `b` et `c` dans cet ordre. Comment sais-tu quelle ligne de résultat appartient à `b` ?',
			options: [
				'C’est la deuxième ligne du fichier, car les lignes suivent l’ordre d’envoi',
				'Chaque ligne porte le `custom_id` que tu as donné à `b` dans la requête',
				'L’`id` du message dans chaque résultat est dérivé de la position de la requête',
				'Impossible à savoir, donc chaque lot ne doit contenir qu’une requête'
			],
			answer: 1,
			why: 'La doc et la docstring du SDK disent toutes deux que les résultats peuvent revenir dans n’importe quel ordre. Chaque ligne JSONL contient le `custom_id` de sa requête, et ce champ est le seul lien entre les deux.'
		},
		{
			q: 'Un lot de 5 000 requêtes finit avec 4 980 `succeeded`, 15 `errored` (toutes `invalid_request_error`) et 5 `expired`. Que paies-tu, et que fais-tu ensuite ?',
			options: [
				'Les 5 000 au prix des lots, puis tu renvoies les 20 échecs tels quels',
				'Les 4 980 réussites et les 15 erreurs, puis tu renvoies seulement les 5 expirées',
				'Les 4 980 réussites ; tu corriges les 15 corps de requête, puis tu les renvoies avec les 5 expirées',
				'Rien avant le téléchargement du fichier, puis les 4 980 au plein tarif'
			],
			answer: 2,
			why: 'Les requêtes en erreur, annulées ou expirées ne sont pas facturées. Une `invalid_request_error` veut dire que le corps de la requête est faux : le renvoyer tel quel échoue encore. Les requêtes expirées n’ont jamais atteint le modèle et peuvent partir telles quelles dans un nouveau lot.'
		},
		{
			q: 'Chaque requête de ton lot de 50 000 a une faute dans ses `params`. Quand le découvres-tu ?',
			options: [
				'Tout de suite : l’appel de création rejette le lot avec une erreur 400',
				'Après le premier échec, car le lot s’arrête alors et le signale',
				'Jamais : l’API corrige les petites fautes de `params` avant de lancer le lot',
				'Quand le traitement du lot entier est fini, sous forme de résultats `errored`'
			],
			answer: 3,
			why: 'La doc dit que la validation de chaque objet `params` « is performed asynchronously » (se fait en asynchrone), et que les erreurs arrivent quand le lot entier est fini. C’est pour ça qu’elle conseille d’envoyer une requête par l’API Messages avant de lancer le lot.'
		}
	],
	recall: {
		q: 'Combien coûte l’API Message Batches par rapport aux appels normaux, et combien de temps une requête peut-elle attendre avant d’expirer ?',
		a: '50 % du prix normal sur les tokens d’entrée et de sortie. La plupart des lots finissent en moins d’une heure, et une requête qui attend encore après 24 heures expire, sans être facturée.'
	},
	sources: [
		{ title: 'Doc Claude, Batch processing, lue le 2026-10-17', url: DOCS },
		{ title: 'Doc Claude, Pricing, lue le 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
		{ title: 'anthropic-sdk-python, src/anthropic/resources/messages/batches.py', url: BATCHES },
		{ title: 'anthropic-sdk-python, examples/batch_results.py', url: `${SDK}/examples/batch_results.py` }
	]
};
