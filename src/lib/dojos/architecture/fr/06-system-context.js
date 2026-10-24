const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'system-context',
	part: 'Voir le système',
	title: 'Le diagramme de contexte : ton système en une seule boîte',
	minutes: 10,
	hook: [
		'Avant de juger un système, liste tout ce avec quoi il communique. La plupart des erreurs d’architecture viennent d’un système externe que personne n’avait noté.',
		'Le modèle C4 de Simon Brown propose quatre niveaux de zoom, comme une appli de cartes : Contexte (le pays entier), Conteneurs (les villes), Composants (les rues), Code (les maisons). Le diagramme de contexte correspond au niveau Contexte, le plus dézoomé.',
		'Sur un diagramme de contexte, **ton système tient dans une seule boîte**. Autour, tu dessines seulement les personnes qui l’utilisent et les autres systèmes avec lesquels il communique. Ici, le système est un serveur Mastodon, qui passe son temps à échanger avec des serveurs qu’il ne possède pas. Les trois chapitres suivants zooment dans ce même serveur.'
	],
	terms: [
		{ term: 'C4', def: 'Quatre niveaux de zoom pour les diagrammes : Contexte, Conteneurs, Composants, Code. Tu dessines rarement le quatrième.' },
		{ term: 'Contexte du système', def: 'Niveau 1. Ton système en une seule boîte, plus les personnes et les systèmes externes autour.' },
		{ term: 'Système externe', def: 'Un système avec lequel tu communiques sans le posséder ni le faire tourner : un fournisseur SSO, un serveur mail, le serveur d’une autre organisation.' },
		{ term: 'Frontière', def: 'La ligne entre ce que ton équipe possède et ce que d’autres possèdent. Tu modifies librement ce qui est dedans. Pour changer ce qui est dehors, tu dois te mettre d’accord avec une autre équipe ou une autre entreprise.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user(["Personne, dans un navigateur ou une appli mobile"]) -->|"publie, lit les fils"| masto["Serveur Mastodon (le système qu’on fait tourner)"]', 'mod(["Modérateur"]) -->|"traite les signalements"| masto'],
				highlight: ['user', 'masto', 'mod'],
				note: 'Commence par une boîte pour le système et les personnes qui l’utilisent. Ici, ce sont les personnes qui ont un compte sur ce serveur, et les modérateurs qui traitent les signalements.'
			},
			{
				add: ['masto -->|"livre les posts, ActivityPub"| fedi["Autres serveurs du fédivers"]', 'fedi -->|"livre les posts dans l’inbox"| masto', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'Les voisins les plus importants sont des serveurs gérés par **d’autres gens**. Ton serveur leur envoie les posts de tes utilisateurs, et ils déposent les leurs dans ton inbox : tu traces donc une flèche dans chaque sens. Une boîte en pointillés indique un système qu’on ne possède pas.'
			},
			{
				add: ['masto -->|"envoie des e-mails"| smtp["Serveur SMTP"]', 'masto -->|"notifications web push"| push["Services push des navigateurs"]', 'class smtp,push ext'],
				highlight: ['smtp', 'push'],
				note: 'Pour joindre ses propres utilisateurs, le serveur **dépend** de deux autres systèmes. Un serveur mail envoie les e-mails de compte et de notification. Le service push de chaque navigateur livre les notifications, avec les clés VAPID du serveur.'
			},
			{
				add: ['masto -.->|"connexion optionnelle"| sso["Fournisseur SSO : OIDC, SAML, CAS ou LDAP"]', 'masto -.->|"traduction optionnelle"| tr["DeepL ou LibreTranslate"]', 'class sso,tr ext'],
				highlight: ['sso', 'tr'],
				note: 'Tu dessines les voisins optionnels avec des **flèches en pointillés**. La doc les liste comme des réglages : connexion externe et moteur de traduction. Un serveur qui n’active aucun des deux a deux boîtes de moins sur son diagramme.'
			},
			{
				add: [],
				highlight: ['masto'],
				note: 'PostgreSQL, Redis et le bucket S3 des médias n’apparaissent **pas** sur le diagramme. Ce serveur les fait tourner ou les loue, et il possède leurs données. Ils restent dans la boîte, un niveau de zoom plus bas, comme conteneurs.'
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
			'Ce contrôleur reçoit la flèche qui **vient** des autres serveurs. Ligne 8, `skip_before_action :authenticate_user!` : aucune personne ne se connecte ici. À la place, la ligne 7 vérifie la signature du serveur appelant sur la requête.',
			'Ligne 14, `head 202` répond « accepté, pas encore traité ». La ligne 18 confie le travail à un job en arrière-plan. Le serveur d’une autre organisation ne va pas t’attendre, alors cette flèche aboutit dans une file.',
			'Dans l’autre sens, la flèche passe par [`ActivityPub::DeliveryWorker`](' + REPO + '/app/workers/activitypub/delivery_worker.rb#L8-L11) : un job par inbox distante, retenté jusqu’à 16 fois. Le code part du principe que le serveur distant tombe parfois en panne.',
			'Tu peux lire le contexte dans la config. La [doc de configuration](https://docs.joinmastodon.org/admin/config/) de Mastodon range les réglages en PostgreSQL, Redis, Elasticsearch, SMTP, stockage de fichiers, authentification externe et traduction. Chaque réglage qui désigne un service que tu ne fais pas tourner correspond à une boîte externe.'
		]
	},
	tradeoff: {
		gain: [
			'N’importe qui, technique ou pas, le comprend en 30 secondes : tu peux le montrer à ton manager.',
			'Il montre chaque dépendance externe, et chacune représente un contrat et une panne possible.',
			'En le dessinant, tu découvres ce que tu ignores, par exemple « les autres serveurs nous appellent, ou on va chercher chez eux ? ». Mastodon fait les deux.'
		],
		cost: [
			'Il ne montre rien de l’intérieur de la boîte, donc il ne dit pas à lui seul où se trouve le goulot d’étranglement.',
			'Il dessine toutes les flèches avec le même trait. « Livraison ActivityPub signée, retentée pendant des jours » et « envoyer un e-mail » sont pourtant deux contrats très différents.',
			'Dès qu’on ajoute une intégration, il n’est plus à jour. Dessine-le à partir de la config et de la doc, et redessine-le à chaque nouvelle intégration.'
		]
	},
	task: {
		prompt: 'Sur papier : dessine le diagramme de contexte d’une petite appli SaaS de facturation. Ses réglages sont `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`, `STRIPE_SECRET_KEY`, `SMTP_URL`, `OIDC_ISSUER`, `EXCHANGE_RATES_API_URL` et `SENTRY_DSN`. Les comptables créent les factures, et les clients les paient. Dessine une boîte pour l’appli, puis les personnes, puis chaque système externe. Note une question à laquelle tu n’as pas pu répondre.',
		hint: 'Pour chaque réglage, demande-toi : est-ce qu’on possède les données derrière ? Dans ce cas, il va dans la boîte. Si une autre organisation le fait tourner et possède les données, dessine une boîte externe.',
		answer: [
			'La boîte : l’appli de facturation. Les personnes : les comptables (créent les factures) et les clients (les reçoivent et les paient).',
			'Systèmes externes : Stripe (paiements), le fournisseur SMTP (e-mails de facture), le fournisseur OIDC (connexion), l’API de taux de change, et Sentry (rapports d’erreurs, en général dessiné plus petit ou omis sur un diagramme orienté métier).',
			'Pas dessus : PostgreSQL, Redis et le bucket S3. Tu possèdes leurs données, même si un cloud les fait tourner. Ce sont des conteneurs, un niveau plus bas.',
			'Une bonne question ouverte : est-ce que Stripe **nous** rappelle avec des webhooks ? Dans ce cas, il faut une deuxième flèche, entrante, avec son propre contrat.'
		],
		steps: [
			{
				title: 'Dessine la boîte et les personnes',
				questions: [
					{ q: 'Combien de boîtes l’appli de facturation elle-même reçoit-elle ?', options: ['Une par réglage', 'Une', 'Trois : appli, base, cache', 'Une par serveur sur lequel elle tourne'], answer: 1, why: 'Sur un diagramme de contexte, ton système tient dans une seule boîte.' },
					{ q: 'Qui sont les personnes autour de la boîte ?', options: ['Les comptables et Stripe', 'Les développeurs et le fournisseur cloud', 'Les comptables et les clients', 'Les clients et le serveur SMTP'], answer: 2, why: 'Les personnes utilisent le système. Stripe et le serveur SMTP sont des systèmes, pas des personnes.' },
					{ q: 'Quelle flèche va des comptables vers l’appli ?', options: ['Créent les factures', 'Paient les factures', 'Envoient les e-mails', 'Font tourner la base'], answer: 0, why: 'Les comptables créent les factures. Les clients les reçoivent et les paient.' },
					{ q: 'Quel niveau C4 es-tu en train de dessiner ?', options: ['Conteneurs', 'Composants', 'Code', 'Contexte'], answer: 3, why: 'Le diagramme de contexte est le niveau 1, le plus dézoomé.' }
				]
			},
			{
				title: 'Range chaque réglage',
				questions: [
					{ q: 'AWS fait tourner le bucket derrière `S3_BUCKET`. Est-ce que ça en fait un système externe ?', options: ['Oui : une autre entreprise le fait tourner', 'Non : tu possèdes les fichiers qu’il contient, donc il reste dans la boîte de l’appli', 'Oui, mais seulement sur le diagramme de conteneurs', 'Seulement si le bucket est public'], answer: 1, why: 'Ce n’est pas qui le fait tourner qui décide, c’est qui possède les données, et les fichiers de factures sont à toi.' },
					{ q: 'Que met `STRIPE_SECRET_KEY` sur le diagramme ?', options: ['Un conteneur dans la boîte', 'Une personne qui paie', 'Stripe, un système externe pour les paiements', 'Rien : ce n’est qu’une clé'], answer: 2, why: 'Une autre organisation fait tourner Stripe et possède les données derrière.' },
					{ q: 'Quels réglages désignent des systèmes externes ?', options: ['`DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`', 'Les huit', 'Seulement `STRIPE_SECRET_KEY` et `SMTP_URL`', '`STRIPE_SECRET_KEY`, `SMTP_URL`, `OIDC_ISSUER`, `EXCHANGE_RATES_API_URL`, `SENTRY_DSN`'], answer: 3, why: 'Paiements, e-mails, connexion, taux de change et rapports d’erreurs : quelqu’un d’autre fait tourner tout ça.' },
					{ q: 'Comment dessines-tu en général Sentry, les rapports d’erreurs ?', options: ['Plus petit, ou omis sur un diagramme orienté métier', 'Comme la plus grosse boîte, car les erreurs comptent le plus', 'Dans la boîte de l’appli, à côté des logs', 'Comme une personne qui lit les erreurs'], answer: 0, why: 'Il est externe, mais il compte plus pour l’équipe que pour le métier.' }
				]
			},
			{
				title: 'Vérifie les traits',
				questions: [
					{ q: 'Quel critère range un réglage dans la boîte ou dehors ?', options: ['Est-ce qu’il coûte de l’argent chaque mois ?', 'Est-ce qu’on possède les données derrière ?', 'Est-ce qu’il est écrit dans notre langage ?', 'Est-ce qu’il tourne dans notre compte cloud ?'], answer: 1, why: 'Le modèle C4 range un bucket cloud parmi les conteneurs : quelqu’un d’autre l’héberge, mais tu possèdes ses données.' },
					{ q: 'Sur le diagramme de Mastodon, que veut dire une flèche en pointillés ?', options: ['Une connexion lente', 'Un système qu’on possède', 'Un voisin optionnel, activé par un réglage', 'Un lien cassé'], answer: 2, why: 'La connexion externe et la traduction sont des réglages. Un serveur qui n’active aucun des deux a deux boîtes de moins.' },
					{ q: 'Les flèches vers Stripe et vers le serveur SMTP se ressemblent. Que cache le dessin ?', options: ['Que Stripe est dans un autre pays', 'Rien : une flèche est une flèche', 'Laquelle coûte le plus par mois', 'Que chaque flèche est un contrat à part, et qu’ils diffèrent beaucoup'], answer: 3, why: 'Un diagramme de contexte dessine toutes les flèches avec le même trait, même quand les contrats sont très différents.' },
					{ q: 'Pourquoi un serveur Mastodon a-t-il des flèches dans les deux sens vers le fédivers ?', options: ['Il livre des posts aux autres serveurs, et ils livrent des posts dans son inbox', 'Toutes les flèches d’un diagramme de contexte vont dans les deux sens', 'Les serveurs du fédivers tournent dans sa boîte', 'Ses modérateurs travaillent sur les autres serveurs'], answer: 0, why: 'Des appels sortent et d’autres entrent. Chaque sens est sa propre flèche.' }
				]
			},
			{
				title: 'Note la question ouverte',
				questions: [
					{ q: 'Quelle question ouverte peut changer le diagramme lui-même ?', options: ['Est-ce que Stripe nous rappelle avec des webhooks ?', 'Quelle version de PostgreSQL fait-on tourner ?', 'Combien de comptables utilisent l’appli ?', 'Quelle police utilisent les factures ?'], answer: 0, why: 'Elle change le diagramme : une flèche entrante a son propre contrat.' },
					{ q: 'Si Stripe rappelle bien, qu’est-ce qui change sur le diagramme ?', options: ['Stripe passe dans la boîte', 'Rien ne change', 'Une deuxième flèche, entrante, avec son propre contrat', 'Stripe devient une personne'], answer: 2, why: 'Comme la flèche du fédivers vers Mastodon, un rappel est une deuxième flèche.' },
					{ q: 'Dans Mastodon, quel code reçoit la flèche qui arrive des autres serveurs ?', options: ['`ActivityPub::DeliveryWorker`', 'Le serveur SMTP', 'Redis', '`ActivityPub::InboxesController`, qui répond `202`'], answer: 3, why: 'L’inbox vérifie la signature du serveur appelant et confie le travail à un job en arrière-plan.' },
					{ q: 'Pourquoi noter une question à laquelle tu n’as pas pu répondre ?', options: ['C4 demande une boîte de questions', 'Dessiner montre ce que tu ignores, et chaque flèche externe est un contrat et une panne possible', 'Pour que le diagramme ait l’air complet', 'Pour que ton manager y réponde'], answer: 1, why: 'La question ouverte est souvent ce que le diagramme trouve de plus utile.' }
				]
			}
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
			why: 'C4 va du Contexte aux Conteneurs, puis aux Composants et au Code, comme une carte qui passe du pays aux villes, aux rues et aux maisons.'
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
			why: 'D’autres gens gèrent les autres serveurs, et tu ne peux pas les modifier. Sidekiq et Redis tournent dans ton système. Le modèle C4 range aussi un bucket cloud parmi les conteneurs : quelqu’un d’autre l’héberge, mais tu possèdes ses données.'
		}
	],
	recall: {
		q: 'Sur le diagramme de contexte d’un serveur Mastodon, quelles boîtes sont hors du système, et où vont PostgreSQL et Redis ?',
		a: 'Dehors : les autres serveurs du fédivers, le serveur SMTP, les services push des navigateurs, et en option un fournisseur SSO et un moteur de traduction. PostgreSQL et Redis restent dans l’unique boîte du système, et apparaissent au niveau des conteneurs.'
	},
	sources: [
		{ title: 'C4 model (Simon Brown)', url: 'https://c4model.com/' },
		{ title: 'C4 model, System context diagram', url: 'https://c4model.com/diagrams/system-context' },
		{ title: 'Mastodon docs, Configuring your environment', url: 'https://docs.joinmastodon.org/admin/config/' },
		{ title: 'mastodon, ActivityPub::InboxesController', url: `${REPO}/app/controllers/activitypub/inboxes_controller.rb` },
		{ title: 'mastodon, ActivityPub::DeliveryWorker', url: `${REPO}/app/workers/activitypub/delivery_worker.rb` }
	]
};
