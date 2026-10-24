const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'subdomains',
	part: 'Domains and boundaries',
	title: 'Core, supporting and generic subdomains',
	minutes: 10,
	hook: [
		'A social network server needs a lot: logins with two-factor, an OAuth server for apps, background jobs, a database, search, media storage, and the timelines people came for. Mastodon has to offer all of it. Who builds what?',
		'Without a plan, good engineers pick the interesting technical problems. Eric Evans: **"scarce, highly skilled developers tend to gravitate to technical infrastructure"**. The best people then write a job queue, and the part that makes the product special gets whoever is free.',
		'Domain-driven design sorts every part of the business into core, supporting or generic, and staffs each group differently. Mastodon\'s sort shows in two places: the `Gemfile` lists what it adopted, and `app/` holds what it built.'
	],
	terms: [
		{ term: 'Subdomain', def: 'One area of what the business does: delivering posts to followers, logging users in, letting admins tune settings.' },
		{ term: 'Core', def: 'What makes you different from competitors. It is complex and changes often, so you build it in-house with your best people.' },
		{ term: 'Supporting', def: 'Needed by the business but gives no edge over competitors. It is usually simple, so you build it cheaply or outsource it.' },
		{ term: 'Generic', def: 'A problem everyone has and someone already solved well. You buy it or adopt open source.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['core["Core: federated social network"]', 'core --> fan["Timelines: fan-out on write"]', 'core --> ap["Federation: ActivityPub"]'],
				highlight: ['core', 'fan', 'ap'],
				note: 'The README describes a "social network server based on ActivityPub", where users "can seamlessly communicate with users from another" server, with "real-time, chronological timeline updates". My reading is that timelines and federation are the core. The Mastodon team could sort it differently.'
			},
			{
				add: ['supp["Supporting: admin settings, data export, rate limit rules"]'],
				highlight: ['supp'],
				note: 'Admin settings, data export and rate limit rules are supporting. Users and admins need them, but nobody picks a social network for its export page. Mastodon builds them in-house and keeps them plain.'
			},
			{
				add: ['gems["Devise, Doorkeeper, Sidekiq, Chewy, Paperclip"]', 'infra[("Postgres, Redis, Elasticsearch, S3")]', 'fan -->|"home feeds are Redis sorted sets"| infra', 'gems --> infra', 'class gems,infra ext'],
				highlight: ['gems', 'infra'],
				note: 'Login, OAuth, jobs, search, file attachments and databases are generic, and Mastodon adopts them. Each one is years of work that someone else did. The arrow from timelines shows that **the core stores home feeds in Redis**, with no storage engine of its own.'
			},
			{
				add: ['held["lib/chewy, lib/paperclip: Mastodon extensions in library namespaces"] --> gems'],
				highlight: ['held'],
				note: 'Mastodon adopts Chewy and Paperclip, then extends them in its own `lib/` folder, under the libraries\' own module names. ActivityPub is an open standard, yet Mastodon implements it in-house, because federation is what the product does.'
			}
		]
	},
	example: {
		title: 'app/services/fan_out_on_write_service.rb: the core, on adopted bricks',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/app/services/fan_out_on_write_service.rb#L12-L47`,
		lang: 'ruby',
		code: `  def call(status, options = {})
    @status    = status
    @account   = status.account
    @options   = options

    return if @status.proper.account.suspended?

    warm_payload_cache!

    fan_out_to_local_recipients!
    fan_out_to_public_recipients! if broadcastable?
    fan_out_to_public_streams! if broadcastable?
  end

  private

  def fan_out_to_local_recipients!
    deliver_to_self!

    unless @options[:skip_notifications]
      notify_quoted_account!
      notify_mentioned_accounts!
      notify_about_update! if update?
    end

    case @status.visibility.to_sym
    when :public, :unlisted, :private
      deliver_to_all_followers!
      deliver_to_lists!
    when :limited
      deliver_to_mentioned_followers!
    else
      deliver_to_mentioned_followers!
      deliver_to_conversation!
    end
  end`,
		notes: [
			'Lines 10 to 12 and 26 to 35 are **core** logic: they decide who gets a new post, by visibility, mentions, lists and hashtags. No library knows these rules, because Mastodon wrote them.',
			'Each home feed delivery ends in [`FeedManager`](' + MASTODON + '/app/lib/feed_manager.rb#L74-L84), which writes to a Redis sorted set and keeps at most 800 items per feed (that limit is linked in the sources). It also skips users who have not signed in recently, which is a product rule written in Mastodon\'s code.',
			'The generic parts are in the [`Gemfile`](' + MASTODON + '/Gemfile#L8-L49): `rails`, `pg`, `kt-paperclip`, `chewy`, `devise`, `devise-two-factor`, `omniauth`, `doorkeeper`. Further down, `sidekiq` runs jobs and `json-ld` parses ActivityPub documents.',
			'Adopted models reach into the core. A post [`belongs_to :application, class_name: \'Doorkeeper::Application\'`](' + MASTODON + '/app/models/status.rb#L75), so the posts table points at the OAuth library\'s table. Replacing Doorkeeper would touch every post.'
		]
	},
	tradeoff: {
		gain: [
			'The sort tells you where to staff: the best people on timelines and federation, and nobody rewriting a login system or a job queue.',
			'For a generic part, the default answer is "adopt", and building it needs a stated reason.',
			'Each gem update brings fixes and features that the Mastodon team did not have to write.'
		],
		cost: [
			'Every adopted system is a dependency you do not control, and its data model limits yours, like the Doorkeeper table every post points to.',
			'Extending a generic part in your own tree blurs who owns the code: Mastodon\'s [Chewy strategy](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L3-L5) is declared as `module Chewy`, so the module name points to the library.',
			'Two architects can sort the same system differently, because each label is a judgment call. The sort also changes when the business changes.'
		]
	},
	task: {
		prompt: 'A SaaS invoicing app adds "pay this invoice online". It needs: card payments, a payment page with the customer\'s branding, automatic reminders on a schedule each customer can tune, and a PDF receipt. Sort each part: core, supporting or generic. Then say what you would build and what you would adopt.',
		hint: 'Ask of each part: would a customer pick this product over a competitor because of it? And has someone already solved it well?',
		answer: [
			'Card payments: generic. Adopt a payment provider. Building card processing brings compliance work and gives customers no reason to choose you.',
			'PDF receipts: generic. Adopt a PDF library or service. Nobody switches invoicing tools for a PDF renderer.',
			'Reminder rules: **core**, if getting paid faster is why customers choose you. Build them in-house with your best people, on an adopted job scheduler.',
			'Branded payment page: supporting. Customers expect it, but a simple template is enough, so build it cheaply.',
			'One feature here holds three kinds of subdomain, so you sort each part on its own.'
		],
		steps: [
			{
				title: 'Ask the two questions',
				questions: [
					{ q: 'Which question tells you a part is core?', options: ['Is it the hardest part to build?', 'Would a customer pick this product over a competitor because of it?', 'Is it the newest code in the repo?', 'Does it need a database?'], answer: 1, why: 'Core is what makes you different. Hard or new is not the test.' },
					{ q: 'Which question tells you a part is generic?', options: ['Does it change often?', 'Can the customer see it?', 'Has someone already solved it well?', 'Is it fun to build?'], answer: 2, why: 'Generic means everyone has the problem and a good answer exists to buy or adopt.' },
					{ q: 'What makes a part supporting?', options: ['It is what makes you different', 'It is a problem everyone already solved', 'Nobody uses it', 'The business needs it, but it gives no edge, and it is usually simple'], answer: 3, why: 'Needed, but no customer picks you for it, so you keep it plain.' },
					{ q: 'Why sort the parts at all?', options: ['Without it, the best people tend to drift to technical infrastructure', 'To pick a cloud provider', 'To cut the number of lines of code', 'To choose one language for all of it'], answer: 0, why: 'Evans warns that skilled developers gravitate to infrastructure, and the core gets whoever is free.' }
				]
			},
			{
				title: 'Sort each part',
				questions: [
					{ q: 'Card payments: core, supporting or generic?', options: ['Core', 'Supporting', 'Generic', 'None of the three'], answer: 2, why: 'Everyone needs it, and payment providers already solve it well.' },
					{ q: 'A payment page with the customer\'s branding?', options: ['Core', 'Supporting', 'Generic', 'None of the three'], answer: 1, why: 'Customers expect it, but nobody picks an invoicing tool for its payment page.' },
					{ q: 'Reminders on a schedule each customer can tune, when getting paid faster is why customers choose you?', options: ['Core', 'Supporting', 'Generic', 'None of the three'], answer: 0, why: 'It is the reason customers pick you over a competitor. That is core.' },
					{ q: 'A PDF receipt?', options: ['Core', 'Supporting', 'Generic', 'None of the three'], answer: 2, why: 'Nobody switches invoicing tools for a PDF renderer, and good ones exist.' }
				]
			},
			{
				title: 'Build or adopt',
				questions: [
					{ q: 'Card payments: build or adopt?', options: ['Build card processing in-house', 'Adopt a payment provider', 'Give it to your best engineer', 'Leave it out of the feature'], answer: 1, why: 'Building it brings compliance work and gives customers no reason to choose you.' },
					{ q: 'Reminder rules: build or adopt?', options: ['Adopt a reminder product as it is', 'Build them in-house, including your own job queue', 'Build them in-house with your best people, on an adopted job scheduler', 'Let support send them by hand'], answer: 2, why: 'Build the core, but not the generic bricks under it. Mastodon writes its own timeline rules and stores the home feeds in Redis.' },
					{ q: 'The branded payment page: how do you build it?', options: ['Put your best engineer on it', 'Write a full theme engine first', 'Adopt the payment provider\'s page and drop the branding', 'Build it cheaply, with a simple template'], answer: 3, why: 'Supporting parts are built cheaply and kept simple.' },
					{ q: 'PDF receipts: build or adopt?', options: ['Adopt a PDF library or service', 'Write your own PDF renderer', 'Treat it as core, since every invoice has one', 'Give it to the senior engineer'], answer: 0, why: 'For a generic part, the default answer is "adopt".' }
				]
			},
			{
				title: 'Check it against Mastodon',
				questions: [
					{ q: 'Mastodon\'s timelines are core. Where does it store home feeds?', options: ['In a storage engine of its own', 'In Redis sorted sets', 'In Elasticsearch', 'In S3'], answer: 1, why: 'The core rules are in-house, and the storage under them is adopted.' },
					{ q: 'Mastodon needs more from Chewy and Paperclip than they offer. Where does it put that code?', options: ['In a fork of each gem', 'In `app/services`, next to the core', 'In patches sent to the gems\' authors', 'In its own `lib/` folder, under the libraries\' module names'], answer: 3, why: 'It adopts the library and keeps its extensions apart. You can do the same with your PDF library.' },
					{ q: 'What does an adopted payment provider cost you, like Doorkeeper in Mastodon?', options: ['Nothing: adopted parts are free', 'It makes the core slower', 'A dependency you do not control, whose data model limits yours', 'A rewrite every year'], answer: 2, why: 'Every Mastodon post points at a Doorkeeper table, so replacing it would touch every post.' },
					{ q: 'One feature holds three kinds of subdomain. What follows?', options: ['You sort each part on its own', 'You label the whole feature core', 'You label it generic and adopt it all', 'You let the team vote once for the feature'], answer: 0, why: 'The labels belong to parts, not features. Each part gets its own answer.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Your team has one senior engineer free this quarter. Following the subdomain classification, where should they work?',
			options: ['On the generic parts, since they are the hardest to integrate well', 'On supporting subdomains, since they are simple and quick wins', 'Wherever the backlog is longest, so the team catches up fastest', 'On the core subdomain, the part that makes the product different'],
			answer: 3,
			why: 'Evans: "Apply top talent to the core domain." Generic parts should be adopted, and supporting parts kept simple, so neither needs the senior engineer.'
		},
		{
			q: 'In Mastodon, where do password login and two-factor authentication come from?',
			options: ['Adopted gems, Devise and devise-two-factor', 'Code written in-house under `app/services`', 'The ActivityPub standard', 'Elasticsearch'],
			answer: 0,
			why: 'Login is generic, so Mastodon adopts `devise` and `devise-two-factor`, both listed in the Gemfile. Its own code goes into timelines and federation.'
		},
		{
			q: 'ActivityPub is an open standard, yet Mastodon implements it in its own code. What does that show?',
			options: ['Standards are always core, because every product depends on them', 'Mastodon could not find a library that was mature enough to reuse', 'Something generic for most companies can be core for one, when it is the product', 'ActivityPub is a supporting subdomain, so it is fine to build in-house'],
			answer: 2,
			why: 'Most apps adopt a protocol library. Mastodon is a federated network, so federation is the product and gets in-house code. The same technology can be generic for one business and core for another.'
		}
	],
	recall: {
		q: 'Which parts of Mastodon are core, and where do you see what it adopted instead of building?',
		a: 'Timelines (fan-out on write) and ActivityPub federation are core. The generic parts it adopted, like Devise, Doorkeeper, Sidekiq and Chewy, are listed in the `Gemfile`.'
	},
	sources: [
		{ title: 'Evans, DDD Reference: Core Domain and Generic Subdomains (pp. 40-41)', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'Mastodon, README', url: `${MASTODON}/README.md?plain=1#L21-L38` },
		{ title: 'Mastodon, Gemfile', url: `${MASTODON}/Gemfile` },
		{ title: 'Mastodon, fan_out_on_write_service.rb', url: `${MASTODON}/app/services/fan_out_on_write_service.rb#L12-L47` },
		{ title: 'Mastodon, feed_manager.rb, items per feed', url: `${MASTODON}/app/lib/feed_manager.rb#L7-L8` }
	]
};
