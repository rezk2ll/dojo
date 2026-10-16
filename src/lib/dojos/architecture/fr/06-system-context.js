const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'system-context',
	part: 'Voir le système',
	title: 'Le diagramme de contexte : ton système en une seule boîte',
	minutes: 10,
	hook: [
		'Avant de juger un système, cartographie-le. La plupart des erreurs d’architecture viennent du fait qu’on ne sait pas à qui le système parle, pas d’un mauvais choix de pattern.',
		'Le **modèle C4** de Simon Brown te donne quatre niveaux de zoom, comme une appli de cartes : **Contexte** (le pays entier), **Conteneurs** (les villes), **Composants** (les rues), **Code** (les maisons). Aujourd’hui : le niveau le plus dézoomé.',
		'La règle du diagramme de contexte : **ton système est une seule boîte**. Autour, seulement les personnes qui l’utilisent et les autres systèmes avec lesquels il parle. Le système du jour est un serveur Mastodon. Tout son travail consiste à parler à d’autres serveurs qu’il ne possède pas, c’est donc un bon terrain pour apprendre ce diagramme. Les trois chapitres suivants zooment dans ce même serveur.'
	],
	terms: [
		{ term: 'C4', def: 'Quatre niveaux de zoom pour les diagrammes : Contexte, Conteneurs, Composants, Code. Tu as rarement besoin du quatrième.' },
		{ term: 'Contexte du système', def: 'Niveau 1. Ton système en une seule boîte, plus les personnes et les systèmes externes autour.' },
		{ term: 'Système externe', def: 'Un système avec lequel tu parles mais que tu ne possèdes pas et ne fais pas tourner : un fournisseur SSO, un serveur mail, le serveur d’une autre organisation.' },
		{ term: 'Frontière', def: 'La ligne entre « chez nous » et « chez eux ». Tout ce qui est dedans, tu peux le changer. Tout ce qui est dehors, tu dois le négocier.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user(["Personne, dans un navigateur ou une appli mobile"]) -->|"publie, lit les fils"| masto["Serveur Mastodon (le système qu’on fait tourner)"]', 'mod(["Modérateur"]) -->|"traite les signalements"| masto'],
				highlight: ['user', 'masto', 'mod'],
				note: 'Commence par **une boîte** pour le système et les personnes qui l’utilisent. C’est déjà un diagramme : pour qui est-il ? Ici, les personnes qui ont un compte sur ce serveur, et les modérateurs qui le gardent propre.'
			},
			{
				add: ['masto -->|"livre les posts, ActivityPub"| fedi["Autres serveurs du fédivers"]', 'fedi -->|"livre les posts dans l’inbox"| masto', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'Le voisin qui compte le plus : des serveurs gérés par **d’autres gens**. Ton serveur leur envoie les posts de tes utilisateurs, et ils envoient les leurs dans ton inbox. Deux flèches, dans les deux sens. Les boîtes en pointillés sont des systèmes qu’on ne possède pas.'
			},
			{
				add: ['masto -->|"envoie des e-mails"| smtp["Serveur SMTP"]', 'masto -->|"notifications web push"| push["Services push des navigateurs"]', 'class smtp,push ext'],
				highlight: ['smtp', 'push'],
				note: 'De qui **dépend**-il pour joindre ses propres utilisateurs ? D’un serveur mail pour les e-mails de compte et de notification. Du service push de chaque navigateur pour les notifications, qui a besoin des clés VAPID du serveur.'
			},
			{
				add: ['masto -.->|"connexion optionnelle"| sso["Fournisseur SSO : OIDC, SAML, CAS ou LDAP"]', 'masto -.->|"traduction optionnelle"| tr["DeepL ou LibreTranslate"]', 'class sso,tr ext'],
				highlight: ['sso', 'tr'],
				note: 'Les voisins optionnels ont des **flèches en pointillés**. La doc les liste comme des réglages : connexion externe, et moteur de traduction. Un serveur qui n’active ni l’un ni l’autre a un contexte plus petit.'
			},
			{
				add: [],
				highlight: ['masto'],
				note: 'Remarque ce qui **manque** : PostgreSQL, Redis, le bucket S3 pour les médias. Ce serveur les fait tourner ou les loue, et possède les données qu’ils contiennent. Ils sont dans la boîte, un niveau de zoom plus bas : les conteneurs.'
			}
		]
	},
	example: {
		title: 'app/controllers/activitypub/inboxes_controller.rb, la porte qu’utilisent les autres serveurs',
		repo: 'mastodon/mastodon',
		url: `${REPO}/app/controllers/activitypub/inboxes_controller.rb#L3-L95`,
		lang: 'ruby',
		code: `class ActivityPub::InboxesController < ActivityPub::BaseController
  include JsonLdHelper

  before_action :skip_large_payload
  before_action :decorate_trace
  before_action :skip_unknown_actor_activity
  before_action :require_actor_signature!
  skip_before_action :authenticate_user!

  def create
    upgrade_account
    process_collection_synchronization
    process_payload
    head 202
  end
…
  def process_payload
    ActivityPub::ProcessingWorker.perform_async(signed_request_actor.id, body, @account&.id, signed_request_actor.class.name)
  end
end`,
		notes: [
			'C’est la flèche qui **part** de la boîte externe. Personne ne se connecte ici : `skip_before_action :authenticate_user!`. L’appelant est un autre serveur, et la confiance vient de sa signature sur la requête (`require_actor_signature!`).',
			'`head 202` veut dire « accepté, pas encore fait ». Le travail part dans un job en arrière-plan. Tu ne peux pas faire attendre le serveur d’une autre organisation, donc cette flèche se termine dans une file.',
			'La flèche dans l’autre sens, c’est [`ActivityPub::DeliveryWorker`](' + REPO + '/app/workers/activitypub/delivery_worker.rb#L8-L11) : un job par inbox distante, retenté jusqu’à 16 fois. Chaque boîte externe est un contrat **et** une panne possible, et le code le prévoit.',
			'Une astuce à piquer : **la config est une carte du contexte**. La [doc de configuration](https://docs.joinmastodon.org/admin/config/) de Mastodon regroupe les réglages en PostgreSQL, Redis, Elasticsearch, SMTP, stockage de fichiers, authentification externe et traduction. Chaque réglage qui nomme quelque chose que tu ne fais pas tourner est une boîte externe.'
		]
	},
	tradeoff: {
		gain: [
			'N’importe qui, technique ou pas, le comprend en 30 secondes. C’est la slide pour ton manager.',
			'Il montre chaque dépendance externe : chacune est un risque, un contrat et une panne possible.',
			'Le dessiner révèle ce que tu ne sais pas : « attends, ce sont les autres serveurs qui nous appellent, ou c’est nous qui allons chercher chez eux ? » (Ici : les deux.)'
		],
		cost: [
			'Il cache tout ce qui est dedans. Seul, il ne peut pas répondre à « où est le goulot d’étranglement ? ».',
			'Il écrase des flèches de natures différentes en une seule ligne. « Livraison ActivityPub signée, retentée pendant des jours » et « envoyer un e-mail » sont des contrats très différents.',
			'Il vieillit. Dessine-le depuis la config et la doc, pas de mémoire, et redessine-le quand une nouvelle intégration arrive.'
		]
	},
	task: {
		prompt: 'Sur papier : dessine le diagramme de contexte d’une petite appli SaaS de facturation. Ses réglages sont `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`, `STRIPE_SECRET_KEY`, `SMTP_URL`, `OIDC_ISSUER`, `EXCHANGE_RATES_API_URL` et `SENTRY_DSN`. Les clients paient les factures, les comptables les créent. Une boîte pour l’appli, puis les personnes, puis chaque système externe. Note une question à laquelle tu n’as pas pu répondre.',
		hint: 'Pour chaque réglage, demande-toi : est-ce qu’on possède les données derrière ? Si oui, c’est dans la boîte. Si une autre organisation le fait tourner et le possède, c’est une boîte externe.',
		answer: [
			'La boîte : l’appli de facturation. Les personnes : les comptables (créent les factures) et les clients (les reçoivent et les paient).',
			'Systèmes externes : **Stripe** (paiements), le fournisseur **SMTP** (e-mails de facture), le fournisseur **OIDC** (connexion), l’**API de taux de change**, et **Sentry** (rapports d’erreurs, en général dessiné plus petit ou omis sur un diagramme orienté métier).',
			'Pas dessus : PostgreSQL, Redis et le bucket S3. Tu possèdes les données qu’ils contiennent, même si un cloud les fait tourner. Ce sont des conteneurs, un niveau plus bas.',
			'Une bonne question ouverte : est-ce que Stripe **nous** rappelle (webhooks) ? Si oui, c’est une deuxième flèche, entrante, avec son propre contrat.'
		]
	},
	quiz: [
		{
			q: 'Sur un diagramme de **contexte du système**, où va la base PostgreSQL de ton propre système ?',
			options: ['À côté du système, comme boîte externe', 'À côté du reste de l’infrastructure, dans une colonne séparée', 'Nulle part : elle est dans la boîte du système', 'Seulement si d’autres systèmes la lisent aussi'],
			answer: 2,
			why: 'Le niveau 1 traite ton système comme une seule boîte. Ce qui tourne dedans (ses bases, ses files, ses propres processus) relève du niveau 2.'
		},
		{
			q: 'Quels sont les quatre niveaux C4, du plus dézoomé au plus zoomé ?',
			options: ['Contexte, Conteneurs, Composants, Code', 'Code, Composants, Conteneurs, Contexte', 'Cloud, Cluster, Conteneur, Code', 'Contexte, Clusters, Classes, Code'],
			answer: 0,
			why: 'Contexte, Conteneurs, Composants, Code. Comme une carte : le pays, les villes, les rues, les maisons.'
		},
		{
			q: 'Lequel de ces éléments est un **système externe** sur le diagramme de contexte d’un serveur Mastodon ?',
			options: [
				'Sidekiq, qui fait tourner ses jobs en arrière-plan',
				'Le bucket S3 qui stocke ses médias',
				'Redis, qui garde ses fils d’accueil',
				'Les autres serveurs du fédivers auxquels il envoie des posts'
			],
			answer: 3,
			why: 'Les autres serveurs sont gérés par d’autres gens, et tu ne peux que négocier avec eux. Sidekiq et Redis tournent dans ton système. Le modèle C4 traite aussi un bucket cloud comme un conteneur : quelqu’un d’autre l’héberge, mais tu possèdes les données qu’il contient.'
		}
	],
	takeaway: 'Dessine d’abord ton système en une seule boîte. Chaque flèche qui en sort est une dépendance, un contrat et un risque, et son sens est une décision de conception.',
	sources: [
		{ title: 'C4 model (Simon Brown)', url: 'https://c4model.com/' },
		{ title: 'C4 model, System context diagram', url: 'https://c4model.com/diagrams/system-context' },
		{ title: 'Mastodon docs, Configuring your environment', url: 'https://docs.joinmastodon.org/admin/config/' },
		{ title: 'mastodon, ActivityPub::InboxesController', url: `${REPO}/app/controllers/activitypub/inboxes_controller.rb` },
		{ title: 'mastodon, ActivityPub::DeliveryWorker', url: `${REPO}/app/workers/activitypub/delivery_worker.rb` }
	]
};
