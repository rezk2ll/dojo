const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'system-context',
	part: 'Seeing the system',
	title: 'The context diagram: your system as one box',
	minutes: 10,
	hook: [
		'Before you judge a system, map it. Most architecture mistakes come from not knowing what the system talks to, not from picking the wrong pattern.',
		'Simon Brown\'s **C4 model** gives you four zoom levels, like a map app: **Context** (the whole country), **Containers** (cities), **Components** (streets), **Code** (houses). Today: the most zoomed-out one.',
		'The rule of the context diagram: **your system is one single box**. Around it, only the people who use it and the other systems it talks to. Today\'s system is a Mastodon server. Its whole job is to talk to other servers it does not own, so it is a good place to learn this diagram. The next three chapters zoom into the same server.'
	],
	terms: [
		{ term: 'C4', def: 'Four zoom levels for diagrams: Context, Containers, Components, Code. You rarely need the fourth.' },
		{ term: 'System context', def: 'Level 1. Your system as one box, plus the people and external systems around it.' },
		{ term: 'External system', def: 'A system you talk to but don\'t own or run: an SSO provider, a mail server, another organization\'s server.' },
		{ term: 'Boundary', def: 'The line between "ours" and "theirs". Everything inside it, you can change. Everything outside, you have to negotiate with.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user(["Person, in a browser or a mobile app"]) -->|"posts, reads timelines"| masto["Mastodon server (the system we run)"]', 'mod(["Moderator"]) -->|"handles reports"| masto'],
				highlight: ['user', 'masto', 'mod'],
				note: 'Start with **one box** for the system and the people using it. That is already a diagram: who is it for? Here, the people with an account on this server, and the moderators who keep it clean.'
			},
			{
				add: ['masto -->|"delivers posts, ActivityPub"| fedi["Other fediverse servers"]', 'fedi -->|"delivers posts to the inbox"| masto', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'The neighbor that matters most: servers run by **other people**. Your server sends them your users\' posts, and they send theirs to your inbox. Two arrows, both ways. Dashed boxes are systems we do not own.'
			},
			{
				add: ['masto -->|"sends emails"| smtp["SMTP server"]', 'masto -->|"web push notifications"| push["Browser push services"]', 'class smtp,push ext'],
				highlight: ['smtp', 'push'],
				note: 'Who does it **depend on** to reach its own users? A mail server for account and notification emails. The push service of each browser for notifications, which needs the server\'s VAPID keys.'
			},
			{
				add: ['masto -.->|"optional sign-in"| sso["SSO provider: OIDC, SAML, CAS or LDAP"]', 'masto -.->|"optional translation"| tr["DeepL or LibreTranslate"]', 'class sso,tr ext'],
				highlight: ['sso', 'tr'],
				note: 'Optional neighbors get **dashed arrows**. The docs list them as settings: external sign-in, and a translation engine. A server that sets neither has a smaller context.'
			},
			{
				add: [],
				highlight: ['masto'],
				note: 'Notice what is **missing**: PostgreSQL, Redis, the S3 bucket for media. This server runs or rents them, and owns the data in them. They are inside the box, one zoom level down: containers.'
			}
		]
	},
	example: {
		title: 'app/controllers/activitypub/inboxes_controller.rb, the door other servers use',
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
			'This is the arrow **from** the external box. No person signs in here: `skip_before_action :authenticate_user!`. The caller is another server, and trust comes from its signature on the request (`require_actor_signature!`).',
			'`head 202` means "accepted, not done yet". The work goes to a background job. You cannot make another organization\'s server wait for you, so this arrow ends in a queue.',
			'The arrow the other way is [`ActivityPub::DeliveryWorker`](' + REPO + '/app/workers/activitypub/delivery_worker.rb#L8-L11): one job per remote inbox, retried up to 16 times. Each external box is a contract **and** a possible outage, and the code plans for it.',
			'Trick worth stealing: **the config is a map of the context**. Mastodon\'s [configuration docs](https://docs.joinmastodon.org/admin/config/) group the settings into PostgreSQL, Redis, Elasticsearch, SMTP, file storage, external authentication and translation. Each one that names something you do not run is an external box.'
		]
	},
	tradeoff: {
		gain: [
			'Anyone, technical or not, understands it in 30 seconds. It is the slide for your manager.',
			'It shows every external dependency: each one is a risk, a contract and a possible outage.',
			'Drawing it exposes what you don\'t know: "wait, do other servers call us, or do we fetch from them?" (Here: both.)'
		],
		cost: [
			'It hides everything inside. It cannot answer "where is the bottleneck?" on its own.',
			'It flattens different kinds of arrow into one line. "Signed ActivityPub delivery, retried for days" and "send one email" are very different contracts.',
			'It goes stale. Draw it from the config and the docs, not from memory, and redraw when a new integration lands.'
		]
	},
	task: {
		prompt: 'On paper: draw the context diagram of a small SaaS invoicing app. Its settings are `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`, `STRIPE_SECRET_KEY`, `SMTP_URL`, `OIDC_ISSUER`, `EXCHANGE_RATES_API_URL` and `SENTRY_DSN`. Customers pay invoices, accountants create them. One box for the app, then people, then every external system. Write down one question you could not answer.',
		hint: 'For each setting, ask: do we own the data behind it? If yes, it is inside the box. If another organization runs it and owns it, it is an external box.',
		answer: [
			'The box: the invoicing app. People: accountants (create invoices) and customers (receive and pay them).',
			'External systems: **Stripe** (payments), the **SMTP** provider (invoice emails), the **OIDC** provider (sign-in), the **exchange rates API**, and **Sentry** (error reports, usually drawn smaller or left off a business-level diagram).',
			'Not on it: PostgreSQL, Redis and the S3 bucket. You own the data in them, even if a cloud runs them. They are containers, one level down.',
			'A good open question: does Stripe call **us** back (webhooks)? If yes, that is a second arrow, pointing in, with its own contract.'
		]
	},
	quiz: [
		{
			q: 'On a **system context** diagram, where does your system\'s own PostgreSQL database go?',
			options: ['Next to the system, as an external box', 'Next to the other infrastructure, in a separate column', 'Nowhere: it is inside the system box, shown at the container level', 'Only if other systems also read it'],
			answer: 2,
			why: 'Level 1 treats your system as a single box. What runs inside it (its databases, its queues, its own processes) is level 2.'
		},
		{
			q: 'What are the four C4 levels, from most zoomed-out to most zoomed-in?',
			options: ['Context, Containers, Components, Code', 'Code, Components, Containers, Context', 'Cloud, Cluster, Container, Code', 'Context, Clusters, Classes, Code'],
			answer: 0,
			why: 'Context, Containers, Components, Code. Like a map: country, cities, streets, houses.'
		},
		{
			q: 'Which of these is an **external system** on a Mastodon server\'s context diagram?',
			options: [
				'Sidekiq, which runs its background jobs',
				'The S3 bucket that stores its media',
				'Redis, which holds its home feeds',
				'The other fediverse servers it sends posts to'
			],
			answer: 3,
			why: 'Other servers are run by other people, and you can only negotiate with them. Sidekiq and Redis run inside your system. The C4 model also treats a cloud bucket as a container: someone else hosts it, but you own the data in it.'
		}
	],
	takeaway: 'Draw your system as one box first. Every arrow leaving it is a dependency, a contract and a risk, and its direction is a design decision.',
	sources: [
		{ title: 'C4 model (Simon Brown)', url: 'https://c4model.com/' },
		{ title: 'C4 model, System context diagram', url: 'https://c4model.com/diagrams/system-context' },
		{ title: 'Mastodon docs, Configuring your environment', url: 'https://docs.joinmastodon.org/admin/config/' },
		{ title: 'mastodon, ActivityPub::InboxesController', url: `${REPO}/app/controllers/activitypub/inboxes_controller.rb` },
		{ title: 'mastodon, ActivityPub::DeliveryWorker', url: `${REPO}/app/workers/activitypub/delivery_worker.rb` }
	]
};
