const AIDER = 'https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'choosing-a-model',
	part: 'Comment marchent les modèles',
	title: 'Choisir un modèle',
	minutes: 10,
	hook: [
		'Ton équipe trie 200 000 tickets de support par mois dans 5 files. Chaque appel envoie environ 500 tokens d’entrée et reçoit une étiquette de 10 tokens. Le prototype tournait sur le modèle le plus fort que l’équipe connaissait, et la finance demande le coût en production.',
		'Aux prix de la page tarifs d’Anthropic du 2026-10-17, Claude Opus 5.5 coûte 4 $ par million de tokens d’entrée et 20 $ par million de tokens de sortie. Un mois de tickets envoie 100 millions de tokens et en reçoit 2 millions : 440 $. **Claude Haiku 5.5 coûte 0,10 $ et 0,50 $ pour les prompts jusqu’à 100 000 tokens, soit 11 $ pour le même trafic.**',
		'La grille de prix ne dit pas si Haiku 5.5 met les tickets dans la bonne file.'
	],
	terms: [
		{ term: 'Gamme de modèle', def: 'Un modèle de l’offre d’un fournisseur, rangé par capacité et par prix. Chez Anthropic aujourd’hui, du moins cher au plus cher : Haiku 5.5, Sonnet 5.5, Opus 5.5 et Fable 5.1.' },
		{ term: 'Effort', def: 'Un paramètre de l’API qui règle combien un modèle réfléchit, appelle d’outils et vérifie sur une requête. Un effort plus bas coûte moins cher sur le même modèle.' },
		{ term: 'Jeu d’évaluation', def: 'Une liste d’entrées réelles de ta tâche, chacune avec la sortie attendue, pour noter un modèle avant de le mettre en production.' },
		{ term: 'Coût par tâche réussie', def: 'Ce que tu as payé en tokens, divisé par le nombre de tâches que le modèle a réussies, réessais compris.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['task["Ta tâche : 200 000 tickets, 5 files"] --> eval["Jeu d’évaluation : 200 vrais tickets avec la bonne file"]'],
				highlight: ['task', 'eval'],
				note: 'Première étape de la doc pour décider : "Create benchmark tests specific to your use case". Elle appelle un bon jeu d’évaluation "the most important step in the process". Sans lui, tu compares les modèles sur les benchmarks du fournisseur, qui ne contiennent pas tes tickets.'
			},
			{
				add: ['eval --> small["Efficacité d’abord : commencer par Haiku 5.5"]', 'small -->|"rate certains tickets"| up["Monter d’une gamme seulement pour ce manque"]'],
				highlight: ['small', 'up'],
				note: 'La doc donne deux façons de commencer les tests. Efficacité d’abord : construire avec Claude Haiku 5.5, tester, et "Upgrade only if necessary for specific capability gaps". Elle la conseille pour les prototypes, la latence serrée, les petits budgets et les "High-volume, straightforward tasks", ce qui décrit bien le tri de tickets.'
			},
			{
				add: ['eval --> big["Capacité d’abord : commencer par Opus 5.5 en effort medium"]', 'big -->|"réussit"| down["Baisser l’effort ou descendre d’une gamme"]'],
				highlight: ['big', 'down'],
				note: 'Capacité d’abord : construire avec Claude Opus 5.5, puis baisser l’effort ou descendre d’une gamme une fois les tests réussis. La matrice de choix dit "Most workloads start with Claude Opus 5.5". Claude Fable 5.1 vient ensuite si tes évaluations en effort `xhigh` ou `max` restent insuffisantes.'
			},
			{
				add: ['small --> cmp["Comparer le coût par tâche réussie"]', 'down --> cmp'],
				highlight: ['cmp'],
				note: 'Un modèle aux tokens deux fois plus chers peut coûter presque autant par tâche. Sur un sous-ensemble de SWE-bench Pro, Sonnet 5.5 en `high` a résolu 87,6 % des tâches pour 0,11 $ par tâche résolue. Opus 5.5 en `low` en a résolu 87,4 % pour 0,12 $, avec des prix par token deux fois ceux de Sonnet.'
			},
			{
				add: ['cmp --> mix["Combiner : un modèle fort pour les étapes dures, un modèle bon marché pour le reste"]'],
				highlight: ['mix'],
				note: 'Aider, un agent de code open source, confie ses messages de commit et ses résumés de conversation à un "weak model", et les modifications de code au modèle principal. La doc décrit le même schéma : "an orchestrator that delegates bulk work to lower-cost workers".'
			}
		]
	},
	example: {
		title: 'aider/resources/model-settings.yml : trois modèles pour une session de code',
		repo: 'Aider-AI/aider',
		url: `${AIDER}/aider/resources/model-settings.yml#L1788-L1800`,
		lang: 'yaml',
		code: `- name: claude-opus-4-20250514
  edit_format: diff
  weak_model_name: claude-3-5-haiku-20241022
  use_repo_map: true
  examples_as_sys_msg: false
  extra_params:
    extra_headers:
      anthropic-beta: prompt-caching-2024-07-31,pdfs-2024-09-25,output-128k-2025-02-19
    max_tokens: 32000
  cache_control: true
  editor_model_name: claude-sonnet-4-20250514
  editor_edit_format: editor-diff
  accepts_settings: ["thinking_tokens"]`,
		notes: [
			'La ligne 1 nomme le modèle principal, Claude Opus 4. Quand tu lances aider avec lui, ce bloc choisit deux modèles d’appoint à ta place.',
			'La ligne 3 fixe le weak model à Claude Haiku 3.5. La [page des options d’aider](' + AIDER + '/aider/website/docs/config/options.md) dit que `--weak-model` est "the model to use for commit messages and chat history summarization". Ces tâches sont courtes et faciles à vérifier : la gamme la moins chère s’en charge.',
			'La ligne 11 fixe l’editor model à Claude Sonnet 4. En mode `architect` d’aider, "An architect model will propose changes and an editor model will translate that proposal into specific file edits". Le modèle cher planifie, le moins cher écrit le diff.',
			'Les trois noms sont des versions datées de 2024 et 2025. Le 2026-10-17, la page tarifs d’Anthropic marque Claude Opus 4 et Claude Haiku 3.5 comme "retired, except on Google Cloud". Un nom de modèle écrit dans une config demande un nouveau test et un nouveau choix quand ce modèle est retiré.'
		]
	},
	tradeoff: {
		gain: [
			'Sur GPQA Diamond, Claude Haiku 5.5 a obtenu 85 % pour environ un vingtième du coût par bonne réponse d’Opus 5.5, selon les mesures d’Anthropic.',
			'La vue d’ensemble des modèles classe la latence de Haiku 5.5 en "Fastest", contre "Moderate" pour Opus 5.5 : ça compte quand une personne attend chaque réponse.',
			'Un jeu d’évaluation tiré de tes tâches te permet de refaire la comparaison en quelques minutes quand un nouveau modèle sort ou qu’un ancien est retiré.'
		],
		cost: [
			'Le même test GPQA donne 91 % à Opus 5.5 et à Sonnet 5.5 : Haiku 5.5 rate 6 questions de plus sur 100.',
			'Ce que dit la doc sur les échecs du modèle moins cher : "a failed task still bills its tokens, then the retry, then whatever the failure costs downstream".',
			'Haiku 5.5 coûte 5 fois plus par token pour un prompt de plus de 100 000 tokens : 0,50 $ en entrée et 2,50 $ en sortie par million.'
		]
	},
	task: {
		prompt: 'Ton jeu d’évaluation contient 200 tickets étiquetés, chacun d’environ 500 tokens d’entrée avec une réponse de 10 tokens. Haiku 5.5 en classe 184 dans la bonne file, Opus 5.5 en classe 196. Avec les prix du 2026-10-17 (Haiku 5.5 : 0,10 $ en entrée, 0,50 $ en sortie par million ; Opus 5.5 : 4 $ et 20 $), donne la précision de chaque modèle et son coût pour 1 000 tickets bien classés. Puis dis ce que tu vérifies avant de choisir.',
		hint: 'Un ticket coûte 500 × prix d’entrée + 10 × prix de sortie, divisé par 1 000 000. Divise ensuite par la part de tickets bien classés.',
		answer: [
			'Haiku 5.5 : 184/200 = 92 %. Un ticket coûte (500 × 0,10 + 10 × 0,50) / 1 000 000 = 0,000055 $. Pour 1 000 tickets bien classés : 0,000055 × 1000 / 0,92 ≈ 0,06 $.',
			'Opus 5.5 : 196/200 = 98 %. Un ticket coûte (500 × 4 + 10 × 20) / 1 000 000 = 0,0022 $. Pour 1 000 tickets bien classés : 0,0022 × 1000 / 0,98 ≈ 2,24 $, environ 37 fois plus.',
			'Avant de choisir, lis les 16 tickets que Haiku 5.5 a mal classés. S’ils tombent dans une file où quelqu’un les reclasse en une minute, Haiku 5.5 gagne. Si une mauvaise file fait rater un signalement de panne, Opus 5.5 fait 12 erreurs de moins sur 200 tickets pour environ 2,18 $ de plus par 1 000 tickets bien classés.',
			'Ces calculs ne comptent que les 10 tokens de sortie visibles. Opus 5.5 a la réflexion adaptative toujours active : mesure le vrai `usage` de quelques appels avant de te fier à l’estimation.'
		],
		steps: [
			{
				title: 'Calcule la précision',
				questions: [
					{ q: 'Quelle est la précision de Haiku 5.5 ?', options: ['92 %', '84 %', '98 %', '96 %'], answer: 0, why: '184 / 200 = 0,92.' },
					{ q: 'Quelle est la précision d’Opus 5.5 ?', options: ['96 %', '92 %', '98 %', '94 %'], answer: 2, why: '196 / 200 = 0,98.' },
					{ q: 'Combien de tickets Haiku 5.5 a-t-il mis dans la mauvaise file ?', options: ['4', '16', '12', '8'], answer: 1, why: '200 - 184 = 16. Ce sont ces 16 tickets que tu lis avant de choisir.' },
					{ q: 'Combien d’erreurs de plus sur 200 tickets Haiku 5.5 fait-il par rapport à Opus 5.5 ?', options: ['16', '4', '6', '12'], answer: 3, why: 'Haiku 5.5 en rate 16 et Opus 5.5 en rate 4.' }
				]
			},
			{
				title: 'Calcule le prix d’un ticket',
				questions: [
					{ q: 'Comment calcules-tu le prix d’un ticket ?', options: ['(500 × prix d’entrée + 10 × prix de sortie) / 1 000 000', '(500 + 10) × prix d’entrée / 1 000 000', '500 × prix d’entrée / 1 000', '(prix d’entrée + prix de sortie) × 510'], answer: 0, why: 'Les prix sont par million de tokens, et l’entrée et la sortie n’ont pas le même prix.' },
					{ q: 'Combien coûte un ticket sur Haiku 5.5 ?', options: ['0,00005 $', '0,000055 $', '0,055 $', '0,0022 $'], answer: 1, why: '(500 × 0,10 + 10 × 0,50) / 1 000 000 = 55 / 1 000 000.' },
					{ q: 'Combien coûte un ticket sur Opus 5.5 ?', options: ['0,002 $', '2,20 $', '0,0022 $', '0,000055 $'], answer: 2, why: '(500 × 4 + 10 × 20) / 1 000 000 = 2 200 / 1 000 000.' },
					{ q: 'Quelle part du prix les 500 tokens d’entrée font-ils ?', options: ['L’essentiel : 10 tokens de sortie ajoutent peu', 'Aucune : seule la sortie est facturée', 'La moitié, sur tous les modèles', 'Tout : la sortie est gratuite'], answer: 0, why: 'Sur Haiku 5.5, l’entrée fait 50 des 55 millionièmes de dollar. Un token de sortie coûte plus cher, mais il n’y en a que 10.' }
				]
			},
			{
				title: 'Calcule le prix de 1 000 tickets bien classés',
				questions: [
					{ q: 'Comment passes-tu du prix par ticket au prix par ticket bien classé ?', options: ['Le multiplier par la précision', 'Retirer le coût des tickets mal classés', 'Le diviser par la précision', 'Diviser la précision par ce prix'], answer: 2, why: 'Tu paies chaque ticket, bien ou mal classé. Diviser par la part de réussites répartit le coût des ratés sur les réussites.' },
					{ q: 'Combien coûtent 1 000 tickets bien classés sur Haiku 5.5 ?', options: ['Environ 0,06 $', 'Environ 0,055 $', 'Environ 0,05 $', 'Environ 2,24 $'], answer: 0, why: '0,000055 × 1000 / 0,92 ≈ 0,06 $.' },
					{ q: 'Combien coûtent 1 000 tickets bien classés sur Opus 5.5 ?', options: ['Environ 2,20 $', 'Environ 2,24 $', 'Environ 0,06 $', 'Environ 22,40 $'], answer: 1, why: '0,0022 × 1000 / 0,98 ≈ 2,24 $.' },
					{ q: 'Combien de fois plus cher Opus 5.5 coûte-t-il par ticket bien classé ?', options: ['Environ 40 fois', 'Environ 2 fois', 'Environ 20 fois', 'Environ 37 fois'], answer: 3, why: '2,24 $ contre 0,06 $. Les prix des tokens ont un facteur 40, et la meilleure précision réduit un peu cet écart.' }
				]
			},
			{
				title: 'Vérifie avant de choisir',
				questions: [
					{ q: 'Que lis-tu avant de choisir un modèle ?', options: ['Les 16 tickets que Haiku 5.5 a mal classés', 'Les scores de benchmark du fournisseur', 'Les 196 tickets qu’Opus 5.5 a bien classés', 'La page des prix encore une fois'], answer: 0, why: 'Le coût d’une erreur dépend de la file où tombe le ticket. Seules les erreurs te le disent.' },
					{ q: 'Les erreurs tombent dans une file où quelqu’un les reclasse en une minute. Quel modèle choisis-tu ?', options: ['Opus 5.5', 'Haiku 5.5', 'Fable 5.1', 'Sonnet 5.5, pour couper la poire en deux'], answer: 1, why: 'Si chaque erreur se corrige pour pas cher, le prix 37 fois plus bas l’emporte.' },
					{ q: 'Une mauvaise file fait rater un signalement de panne. Qu’est-ce qu’Opus 5.5 t’apporte ?', options: ['16 erreurs de moins pour 2,24 $ de plus', 'Aucune erreur du tout', '12 erreurs de moins sur 200 tickets, pour environ 2,18 $ de plus par 1 000 tickets bien classés', 'Une latence plus basse sur chaque ticket'], answer: 2, why: '16 - 4 = 12 erreurs de moins, et 2,24 $ - 0,06 $ = 2,18 $. Que ça vaille le coup dépend de ce que coûte une erreur.' },
					{ q: 'Pourquoi mesurer le vrai `usage` de quelques appels avant de te fier à ces chiffres ?', options: ['Opus 5.5 a la réflexion adaptative toujours active : il facture plus que les 10 tokens de sortie visibles', 'Les prix de la page changent tous les jours', '`usage` te dit dans quelle file le modèle a classé', 'Le jeu d’évaluation est trop petit pour s’y fier'], answer: 0, why: 'L’estimation ne compte que les 10 tokens de sortie visibles. Les tokens de réflexion sont facturés aussi.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Deux modèles réussissent presque la même part de tes tâches. Que compares-tu pour choisir ?',
			options: [
				'Le prix par million de tokens d’entrée sur la page tarifs',
				'Leur score au classement public d’un benchmark de code',
				'Les tokens facturés divisés par les tâches que chacun a réussies',
				'La taille de la fenêtre de contexte de chaque modèle'
			],
			answer: 2,
			why: 'Tu paies chaque tentative, y compris les échecs et leurs réessais. Un modèle aux tokens plus chers peut en consommer moins par tâche : Opus 5.5 en `low` coûte 0,12 $ par tâche résolue contre 0,11 $ pour Sonnet 5.5, avec des prix par token deux fois plus hauts.'
		},
		{
			q: 'Tu envoies à Claude Haiku 5.5 un prompt de 150 000 tokens. Quel prix d’entrée s’applique, selon la page tarifs lue le 2026-10-17 ?',
			options: [
				'0,10 $ par million, le prix affiché dans la vue d’ensemble',
				'0,50 $ par million, parce que le prompt dépasse 100 000 tokens',
				'0,10 $ pour les 100 000 premiers tokens, 0,50 $ pour le reste',
				'4 $ par million, parce que les longs prompts partent vers Opus'
			],
			answer: 1,
			why: 'Haiku 5.5 est facturé selon la longueur du prompt, et la doc dit "a request over the threshold pays the higher prices". Les 150 000 tokens sont facturés à 0,50 $ par million, et la sortie à 2,50 $ par million.'
		},
		{
			q: 'Dans les réglages d’aider pour Claude Opus 4, quel travail revient au modèle de `weak_model_name` ?',
			options: [
				'Écrire les messages de commit et résumer l’historique de conversation',
				'Planifier le changement en mode `architect`',
				'Transformer le plan en modifications de fichiers en mode `architect`',
				'Relancer une requête quand le modèle principal renvoie une erreur'
			],
			answer: 0,
			why: 'La page des options d’aider dit que `--weak-model` est "the model to use for commit messages and chat history summarization". L’editor model, réglé par `editor_model_name`, écrit les modifications de fichiers, et le modèle principal les planifie.'
		}
	],
	recall: {
		q: 'Quelles deux façons de démarrer donne la page « Choosing the right model » d’Anthropic, et quel nombre départage les modèles ?',
		a: 'Efficacité d’abord (Haiku 5.5, puis monter seulement pour un manque) ou capacité d’abord (Opus 5.5, puis baisser l’effort ou la gamme). On compare le coût par tâche réussie sur son propre jeu d’évaluation.'
	},
	sources: [
		{ title: 'Doc Claude, Models overview, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/models/overview' },
		{ title: 'Doc Claude, Choosing the right model, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/models/choosing-a-model' },
		{ title: 'Doc Claude, Pricing, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
		{ title: 'Doc Claude, Optimizing for cost and intelligence, lu le 2026-10-17', url: 'https://platform.claude.com/docs/en/about-claude/models/optimizing-for-cost-and-intelligence' },
		{ title: 'Doc d’aider, Chat modes', url: `${AIDER}/aider/website/docs/usage/modes.md` }
	]
};
