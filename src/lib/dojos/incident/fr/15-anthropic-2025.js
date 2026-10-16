const PM = 'https://www.anthropic.com/engineering/a-postmortem-of-three-recent-issues';
const JAX = 'https://docs.jax.dev/en/latest/_autosummary/jax.lax.approx_max_k.html';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'anthropic-2025',
	part: 'Les données',
	title: 'Anthropic 2025 : trois bugs qui ont dégradé les réponses de Claude',
	minutes: 10,
	hook: [
		'Août 2025. Anthropic sert Claude par sa propre API, par Amazon Bedrock et par Vertex AI de Google Cloud. Le matériel varie, et une partie du trafic tourne sur des TPU Google. L’objectif : la même qualité de réponse quelle que soit la plateforme qui traite la requête.',
		'Début août, des utilisateurs signalent des réponses moins bonnes. Ces retours se distinguent mal des variations habituelles des avis utilisateurs.',
		'Fin août, les signalements arrivent plus souvent et ne s’arrêtent pas. Beaucoup d’utilisateurs voient des problèmes, d’autres reçoivent encore des réponses normales.'
	],
	terms: [
		{ term: 'Routage collant', def: 'Le load balancer envoie les requêtes suivantes d’une conversation au serveur qui a traité la première.' },
		{ term: 'Échantillonnage top-p', def: 'Le modèle tire le token suivant au hasard, seulement parmi les tokens les plus probables dont les probabilités cumulées atteignent un seuil comme 0,99.' },
		{ term: 'Top-k approximatif', def: 'Une opération rapide qui trouve les k plus grandes valeurs d’un tableau et peut se tromper sur les plus basses qu’elle renvoie. Dans JAX, `jax.lax.approx_max_k` a un `recall_target` de 0,95 par défaut.' },
		{ term: 'Précision mixte', def: 'Certaines opérations tournent en flottants 16 bits (bf16), d’autres en 32 bits (fp32) : deux résultats peuvent alors différer sur les derniers chiffres.' }
	],
	incident: {
		org: 'Anthropic',
		title: 'A postmortem of three recent issues',
		date: '2025-08-05',
		url: PM,
		steps: [
			{
				situation: [
					'29 août. Les retours négatifs bondissent. Des déploiements sont partis les 25 et 26 août, et un changement de routine du load balancing le 29 août.',
					'Les benchmarks habituels, les évaluations de sécurité et les déploiements canary ne montrent rien d’anormal.'
				],
				q: 'Que vérifies-tu en premier ?',
				options: [
					'Comparer le début du pic avec chaque changement déployé cette semaine',
					'Relancer les benchmarks standard sur les serveurs de préproduction',
					'Y voir le bruit normal des retours et attendre quelques jours',
					'Annuler tous les déploiements faits depuis le 5 août'
				],
				answer: 0,
				why: 'Le postmortem : "When negative reports spiked on August 29, we didn\'t immediately make the connection to an otherwise standard load balancing change." Ce changement envoyait plus de requêtes Sonnet 4 à contexte court vers les serveurs configurés pour la fenêtre de contexte de 1M tokens. Pendant la pire heure, le 31 août, 16 % des requêtes Sonnet 4 étaient mal routées.'
			},
			{
				situation: [
					'Des utilisateurs qui écrivent en anglais reçoivent des caractères thaïs ou chinois au milieu de la réponse, ou du code avec des erreurs de syntaxe évidentes. Ça touche Opus 4.1, Opus 4 et Sonnet 4 sur l’API Claude. Les requêtes par Bedrock et Vertex AI n’ont rien.',
					'Le 25 août, un changement de configuration a été déployé sur les serveurs TPU de l’API Claude.'
				],
				q: 'Que fais-tu ?',
				options: [
					'Annuler le changement du 25 août sur les serveurs TPU',
					'Filtrer les caractères non latins des réponses en anglais',
					'Basculer tout le trafic de l’API Claude vers Bedrock',
					'Baisser la température d’échantillonnage partout'
				],
				answer: 0,
				why: 'Une optimisation de performance à l’exécution "occasionally assigned a high probability to tokens that should rarely be produced given the context". L’équipe a annulé le changement le 2 septembre et ajouté au déploiement des "detection tests for unexpected character outputs". Un filtre cacherait le symptôme, et les erreurs de syntaxe resteraient.'
			},
			{
				situation: [
					'Un changement dans la façon dont Claude choisit ses tokens, déployé le 25 août, déclenche un bug de compilateur sur TPU. Il est confirmé sur Haiku 3.5 et annulé le 4 septembre. Des retours sur Opus 3 collent au bug : annulation le 12 septembre.',
					'Le bug varie selon la taille du batch, la configuration du modèle, les opérations autour, et selon que les outils de debug sont actifs ou non. Après une longue enquête, l’équipe n’arrive pas à le reproduire sur Sonnet 4.'
				],
				q: 'Que fais-tu pour Sonnet 4 ?',
				options: [
					'Annuler aussi le changement sur Sonnet 4',
					'Le garder : le bug ne se reproduit pas sur Sonnet 4',
					'Le garder et ajouter des logs jusqu’à voir le bug',
					'Déplacer le trafic Sonnet 4 des TPU vers les GPU'
				],
				answer: 0,
				why: 'Un bug qui se cache quand les outils de debug sont actifs peut être là même quand un test passe. L’équipe a "decided to also roll it back out of an abundance of caution."'
			},
			{
				situation: [
					'La cause : en décembre 2024, l’équipe avait ajouté un contournement pour un token le plus probable qui disparaissait. Une réécriture du code d’échantillonnage fin août l’a retiré. Sans lui, l’opération de top-k approximatif "sometimes returned completely wrong results, but only for certain batch sizes and model configurations."',
					'L’équipe découvre aussi que le top-k exact "no longer had the prohibitive performance penalty it once did."'
				],
				q: 'Que livres-tu comme correctif ?',
				options: [
					'Top-k exact avec plus de fp32, et signaler le bug à XLA:TPU',
					'Remettre le contournement de décembre 2024 et garder le top-k approximatif',
					'Garder le top-k approximatif et attendre le correctif du compilateur',
					'Monter le seuil top-p de 0,99 à 0,999 partout'
				],
				answer: 0,
				why: 'L’équipe a "switched from approximate to exact top-k and standardized some additional operations on fp32 precision", en acceptant "the minor efficiency impact". En parallèle, elle a travaillé avec l’équipe XLA:TPU sur un correctif du compilateur.'
			},
			{
				situation: [
					'Les bugs ont vécu des semaines. Les évaluations "simply didn\'t capture the degradation users were reporting", en partie parce que Claude se rattrape souvent bien d’une erreur isolée.',
					'Les contrôles de confidentialité limitent les cas où les ingénieurs peuvent lire des conversations d’utilisateurs, surtout celles qui n’ont pas été envoyées comme retour.'
				],
				q: 'Que changes-tu d’abord dans la détection ?',
				options: [
					'Faire tourner des évaluations de qualité en continu sur la production',
					'Envoyer chaque déploiement à un groupe canary plus large',
					'Donner aux ingénieurs l’accès à toutes les conversations',
					'Ajouter des benchmarks publics aux contrôles avant release'
				],
				answer: 0,
				why: 'Le bug de routage venait d’un changement de load balancing, qui n’existe qu’en production. Anthropic va lancer des évaluations "continuously on true production systems to catch issues such as the context window load balancing error." L’entreprise a aussi construit des évaluations plus sensibles et des outils de debug qui respectent la vie privée des utilisateurs.'
			}
		],
		outcome: [
			'Trois bugs se chevauchaient. À partir du 5 août, des requêtes Sonnet 4 partaient vers des serveurs configurés pour la fenêtre de 1M tokens : 0,8 % au début, 16 % au pire moment, le 31 août. Environ 30 % des utilisateurs de Claude Code ont eu au moins un message routé vers le mauvais type de serveur sur la période. Le routage était collant : les messages suivants d’une conversation mal routée restaient souvent sur le mauvais serveur.',
			'À partir du 25 août, une mauvaise configuration TPU a corrompu la génération de tokens pour Opus 4.1 et Opus 4 jusqu’au 28 août, et pour Sonnet 4 jusqu’au 2 septembre. Le même jour, un changement d’échantillonnage a déclenché un bug latent du compilateur XLA:TPU, confirmé sur Haiku 3.5. Les plateformes tierces n’étaient touchées par aucun de ces deux bugs.',
			'Le contournement de décembre 2024 masquait le bug du top-k. Les modèles calculent les probabilités en bf16, mais XLA peut passer certaines opérations en fp32 car le flag `xla_allow_excess_precision` vaut true par défaut. Des opérations qui devaient s’accorder sur le token le plus probable ne s’accordaient plus, et ce token sortait parfois du lot.',
			'Le correctif de routage a été déployé le 4 septembre, et son déploiement s’est terminé le 16 septembre pour l’API propre et Vertex AI, le 18 septembre pour Bedrock. Anthropic demande maintenant aux utilisateurs de signaler les mauvaises réponses avec `/bug` dans Claude Code ou le pouce vers le bas dans les applis Claude.'
		]
	},
	quiz: [
		{
			q: 'Au pire moment, 16 % des requêtes Sonnet 4 étaient mal routées. Pourquoi environ 30 % des utilisateurs de Claude Code ont-ils été touchés au moins une fois ?',
			options: [
				'Routage collant, et beaucoup de messages sur des jours, donc beaucoup de chances',
				'Claude Code envoie toutes ses requêtes aux serveurs 1M par défaut',
				'Les utilisateurs de Claude Code passaient tous par Bedrock, bien plus touché',
				'Les 16 % ne comptent que le premier message de chaque conversation'
			],
			answer: 0,
			why: 'Les 30 % comptent les utilisateurs avec au moins un message mal routé sur toute la période, depuis le 5 août. Le routage était collant : une fois une conversation sur un mauvais serveur, ses messages suivants "were likely to be served by the same incorrect server."'
		},
		{
			q: 'En décembre 2024, le code TPU perdait parfois le token le plus probable à température zéro. Pourquoi ?',
			options: [
				'Deux opérations tournaient en bf16 et en fp32, et ne s’accordaient pas sur le meilleur token',
				'Le générateur aléatoire renvoyait la même valeur pour toutes les requêtes d’un batch',
				'Le seuil top-p de 0,99 coupait le token le plus probable sur les longs prompts',
				'Le tri distribué entre puces perdait des données quand une puce était plus lente'
			],
			answer: 0,
			why: 'XLA peut faire tourner des opérations bf16 en fp32 car `xla_allow_excess_precision` vaut true par défaut. Deux parties du code comparaient les probabilités à des précisions différentes : elles pouvaient choisir des tokens différents, et le vrai meilleur token disparaissait.'
		},
		{
			q: 'Pourquoi les benchmarks et les déploiements canary d’Anthropic ont-ils raté les trois bugs ?',
			options: [
				'Claude se rattrape souvent d’une erreur, et le bug de routage n’existait qu’en prod',
				'Les benchmarks tournaient sur GPU, et les trois bugs étaient sur TPU',
				'Les groupes canary étaient trop petits pour envoyer des requêtes à Sonnet 4',
				'Les benchmarks ne testaient que l’anglais, et les bugs touchaient d’autres langues'
			],
			answer: 0,
			why: 'Les évaluations ont raté la dégradation "in part because Claude often recovers well from isolated mistakes." Le mauvais routage venait d’un changement de load balancing en production : un contrôle hors production ne pouvait pas le voir.'
		}
	],
	recall: {
		q: 'Quels trois bugs ont dégradé les réponses de Claude entre août et septembre 2025 ?',
		a: 'Des requêtes Sonnet 4 routées vers les serveurs à contexte 1M (16 % au pire moment), une mauvaise configuration TPU qui produisait de faux tokens comme du thaï dans des réponses en anglais, et une mauvaise compilation du top-k approximatif par XLA:TPU.'
	},
	sources: [
		{ title: 'Anthropic : A postmortem of three recent issues (2025)', url: PM },
		{ title: 'Doc JAX : jax.lax.approx_max_k', url: JAX }
	]
};
