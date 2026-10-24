const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'system-context',
	part: 'Seeing the system',
	title: 'The context diagram: your system as one box',
	minutes: 10,
	hook: [
		'Before you judge a system, list what it talks to. Most architecture mistakes come from not knowing what the system talks to.',
		'Simon Brown\'s C4 model gives you four zoom levels, like a map app: Context (the whole country), Containers (cities), Components (streets), Code (houses). The context diagram is the Context level, the most zoomed-out one.',
		'On a context diagram, **your system is one single box**. Around it you draw only the people who use it and the other systems it talks to. The system here is a Mastodon server, which spends its day talking to servers it does not own. The next three chapters zoom into the same server.'
	],
	terms: [
		{ term: 'C4', def: 'Four zoom levels for diagrams: Context, Containers, Components, Code. You rarely need to draw the fourth.' },
		{ term: 'System context', def: 'Level 1. Your system as one box, plus the people and external systems around it.' },
		{ term: 'External system', def: 'A system you talk to but don\'t own or run: an SSO provider, a mail server, another organization\'s server.' },
		{ term: 'Boundary', def: 'The line between what your team owns and what others own. You can change what is inside it, and you have to agree with another team or company to change what is outside.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user(["Person, in a browser or a mobile app"]) -->|"posts, reads timelines"| masto["Mastodon server (the system we run)"]', 'mod(["Moderator"]) -->|"handles reports"| masto'],
				highlight: ['user', 'masto', 'mod'],
				note: 'Start with one box for the system and the people who use it. These are the people with an account on this server, and the moderators who handle reports.'
			},
			{
				add: ['masto -->|"delivers posts, ActivityPub"| fedi["Other fediverse servers"]', 'fedi -->|"delivers posts to the inbox"| masto', 'class fedi ext'],
				highlight: ['fedi'],
				note: 'The most important neighbors are servers run by **other people**. Your server sends them your users\' posts, and they send theirs to your inbox, so the diagram has an arrow in each direction. A dashed box marks a system we do not own.'
			},
			{
				add: ['masto -->|"sends emails"| smtp["SMTP server"]', 'masto -->|"web push notifications"| push["Browser push services"]', 'class smtp,push ext'],
				highlight: ['smtp', 'push'],
				note: 'To reach its own users, the server **depends** on two more systems. A mail server sends account and notification emails. The push service of each browser delivers notifications, using the server\'s VAPID keys.'
			},
			{
				add: ['masto -.->|"optional sign-in"| sso["SSO provider: OIDC, SAML, CAS or LDAP"]', 'masto -.->|"optional translation"| tr["DeepL or LibreTranslate"]', 'class sso,tr ext'],
				highlight: ['sso', 'tr'],
				note: 'Optional neighbors get **dashed arrows**. The docs list them as settings: external sign-in, and a translation engine. A server that sets neither has two fewer boxes on its diagram.'
			},
			{
				add: [],
				highlight: ['masto'],
				note: 'PostgreSQL, Redis and the S3 bucket for media are **not** on the diagram. This server runs or rents them, and owns the data in them. They sit inside the box, one zoom level down, as containers.'
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
			'This controller receives the arrow that comes **from** the other servers. Line 8, `skip_before_action :authenticate_user!`, means no person signs in here. Line 7 checks the calling server\'s signature on the request instead.',
			'Line 14, `head 202`, answers "accepted, not done yet". Line 18 hands the work to a background job. Another organization\'s server will not wait for you, so this arrow ends in a queue.',
			'The arrow the other way is [`ActivityPub::DeliveryWorker`](' + REPO + '/app/workers/activitypub/delivery_worker.rb#L8-L11): one job per remote inbox, retried up to 16 times. The code expects the remote server to be down sometimes.',
			'You can read the context from the config. Mastodon\'s [configuration docs](https://docs.joinmastodon.org/admin/config/) group the settings into PostgreSQL, Redis, Elasticsearch, SMTP, file storage, external authentication and translation. Each setting that names something you do not run is an external box.'
		]
	},
	tradeoff: {
		gain: [
			'Anyone, technical or not, understands it in 30 seconds, so you can show it to a manager.',
			'It shows every external dependency, and each one is a contract and a possible outage.',
			'Drawing it shows what you don\'t know, like "do other servers call us, or do we fetch from them?" For Mastodon the answer is both.'
		],
		cost: [
			'It shows nothing inside the box, so it cannot answer "where is the bottleneck?" on its own.',
			'It draws every kind of arrow as the same line. "Signed ActivityPub delivery, retried for days" and "send one email" are very different contracts.',
			'It is out of date as soon as someone adds an integration. Draw it from the config and the docs, and redraw it when a new integration lands.'
		]
	},
	task: {
		prompt: 'On paper: draw the context diagram of a small SaaS invoicing app. Its settings are `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`, `STRIPE_SECRET_KEY`, `SMTP_URL`, `OIDC_ISSUER`, `EXCHANGE_RATES_API_URL` and `SENTRY_DSN`. Accountants create invoices, and customers pay them. Draw one box for the app, then the people, then every external system. Write down one question you could not answer.',
		hint: 'For each setting, ask: do we own the data behind it? Then it goes inside the box. If another organization runs it and owns the data, it is an external box.',
		answer: [
			'The box: the invoicing app. People: accountants (create invoices) and customers (receive and pay them).',
			'External systems: Stripe (payments), the SMTP provider (invoice emails), the OIDC provider (sign-in), the exchange rates API, and Sentry (error reports, usually drawn smaller or left off a business-level diagram).',
			'Not on it: PostgreSQL, Redis and the S3 bucket. You own the data in them, even if a cloud runs them. They are containers, one level down.',
			'A good open question: does Stripe call **us** back with webhooks? Then the diagram needs a second arrow, pointing in, with its own contract.'
		],
		steps: [
			{
				title: 'Draw the box and the people',
				questions: [
					{ q: 'How many boxes does the invoicing app itself get?', options: ['One per setting', 'One', 'Three: app, database, cache', 'One per server it runs on'], answer: 1, why: 'On a context diagram, your system is one single box.' },
					{ q: 'Who are the people around the box?', options: ['Accountants and Stripe', 'Developers and the cloud provider', 'Accountants and customers', 'Customers and the SMTP server'], answer: 2, why: 'People use the system. Stripe and the SMTP server are systems, not people.' },
					{ q: 'What arrow goes from the accountants to the app?', options: ['Create invoices', 'Pay invoices', 'Send emails', 'Run the database'], answer: 0, why: 'Accountants create invoices. Customers receive and pay them.' },
					{ q: 'Which C4 level are you drawing?', options: ['Containers', 'Components', 'Code', 'Context'], answer: 3, why: 'The context diagram is level 1, the most zoomed-out one.' }
				]
			},
			{
				title: 'Sort each setting',
				questions: [
					{ q: 'AWS runs the bucket behind `S3_BUCKET`. Does that make it an external system?', options: ['Yes: another company runs it', 'No: you own the files in it, so it stays inside the app box', 'Yes, but only on the container diagram', 'Only if the bucket is public'], answer: 1, why: 'Who runs it does not decide. Who owns the data does, and the invoice files are yours.' },
					{ q: 'What does `STRIPE_SECRET_KEY` put on the diagram?', options: ['A container inside the box', 'A person who pays', 'Stripe, an external system for payments', 'Nothing: it is only a key'], answer: 2, why: 'Another organization runs Stripe and owns the data behind it.' },
					{ q: 'Which settings name external systems?', options: ['`DATABASE_URL`, `REDIS_URL`, `S3_BUCKET`', 'All eight of them', 'Only `STRIPE_SECRET_KEY` and `SMTP_URL`', '`STRIPE_SECRET_KEY`, `SMTP_URL`, `OIDC_ISSUER`, `EXCHANGE_RATES_API_URL`, `SENTRY_DSN`'], answer: 3, why: 'Payments, email, sign-in, exchange rates and error reports are all run by someone else.' },
					{ q: 'How do you usually draw Sentry, the error reports?', options: ['Smaller, or left off a business-level diagram', 'As the biggest box, since errors matter most', 'Inside the app box, next to the logs', 'As a person who reads errors'], answer: 0, why: 'It is external, but it matters to the team more than to the business.' }
				]
			},
			{
				title: 'Check the lines',
				questions: [
					{ q: 'Which test sorts a setting into the box or out of it?', options: ['Does it cost money each month?', 'Do we own the data behind it?', 'Is it written in our language?', 'Does it run in our cloud account?'], answer: 1, why: 'The C4 model treats a cloud bucket as a container: someone else hosts it, but you own the data in it.' },
					{ q: 'On Mastodon\'s diagram, what does a dashed arrow mean?', options: ['A slow connection', 'A system we own', 'An optional neighbor, turned on by a setting', 'A broken link'], answer: 2, why: 'External sign-in and translation are settings. A server that sets neither has two fewer boxes.' },
					{ q: 'The arrows to Stripe and to the SMTP server look the same. What does the drawing hide?', options: ['That Stripe is in another country', 'Nothing: an arrow is an arrow', 'Which one costs more per month', 'That each arrow is its own contract, and they differ a lot'], answer: 3, why: 'A context diagram draws every arrow as the same line, even when the contracts are very different.' },
					{ q: 'Why does a Mastodon server have arrows both ways to the fediverse?', options: ['It delivers posts to other servers, and they deliver posts to its inbox', 'Every arrow on a context diagram goes both ways', 'The fediverse servers run inside its box', 'Its moderators work on the other servers'], answer: 0, why: 'Calls go out and come in. Each direction is its own arrow.' }
				]
			},
			{
				title: 'Write the open question',
				questions: [
					{ q: 'Which open question could change the diagram itself?', options: ['Does Stripe call us back with webhooks?', 'Which PostgreSQL version do we run?', 'How many accountants use the app?', 'Which font do the invoices use?'], answer: 0, why: 'It changes the diagram: an arrow pointing in has its own contract.' },
					{ q: 'If Stripe does call back, what changes on the diagram?', options: ['Stripe moves inside the box', 'Nothing changes', 'A second arrow, pointing in, with its own contract', 'Stripe becomes a person'], answer: 2, why: 'Like the fediverse arrow into Mastodon, a callback is a second arrow.' },
					{ q: 'In Mastodon, what code receives the arrow coming in from other servers?', options: ['`ActivityPub::DeliveryWorker`', 'The SMTP server', 'Redis', '`ActivityPub::InboxesController`, which answers `202`'], answer: 3, why: 'The inbox checks the calling server\'s signature and hands the work to a background job.' },
					{ q: 'Why write down a question you could not answer?', options: ['C4 asks for a question box', 'Drawing shows what you do not know, and each external arrow is a contract and a possible outage', 'To make the diagram look complete', 'So a manager can answer it'], answer: 1, why: 'The open question is often the most useful thing the diagram finds.' }
				]
			}
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
			why: 'C4 goes Context, Containers, Components, Code, like a map that goes from a country to its cities, streets and houses.'
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
			why: 'Other people run the other servers, and you cannot change them. Sidekiq and Redis run inside your system. The C4 model also treats a cloud bucket as a container: someone else hosts it, but you own the data in it.'
		}
	],
	recall: {
		q: 'On a Mastodon server\'s context diagram, which boxes sit outside the system, and where do PostgreSQL and Redis go?',
		a: 'Outside: the other fediverse servers, the SMTP server, the browser push services, and optionally an SSO provider and a translation engine. PostgreSQL and Redis go inside the one system box, and show up at the container level.'
	},
	sources: [
		{ title: 'C4 model (Simon Brown)', url: 'https://c4model.com/' },
		{ title: 'C4 model, System context diagram', url: 'https://c4model.com/diagrams/system-context' },
		{ title: 'Mastodon docs, Configuring your environment', url: 'https://docs.joinmastodon.org/admin/config/' },
		{ title: 'mastodon, ActivityPub::InboxesController', url: `${REPO}/app/controllers/activitypub/inboxes_controller.rb` },
		{ title: 'mastodon, ActivityPub::DeliveryWorker', url: `${REPO}/app/workers/activitypub/delivery_worker.rb` }
	]
};
