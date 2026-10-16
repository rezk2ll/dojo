const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'subdomains',
	part: 'Domains and boundaries',
	title: 'Core, supporting, generic',
	minutes: 10,
	hook: [
		'A social network server needs a lot: logins with two-factor, an OAuth server for apps, background jobs, a database, search, media storage, and the timelines people actually came for. Mastodon has to offer all of it. Who builds what?',
		'Left alone, good engineers drift to the fun technical problems. Eric Evans said it bluntly: **"scarce, highly skilled developers tend to gravitate to technical infrastructure"**. So the best people end up writing a job queue while the part that makes the product special gets whoever is free.',
		'Domain-driven design gives you a tool against that drift: sort every part of the business into **core, supporting or generic**. Mastodon\'s sort is visible in two files: the `Gemfile` lists what it adopted, and `app/` holds what it built.'
	],
	terms: [
		{ term: 'Subdomain', def: 'One area of what the business does: delivering posts to followers, logging users in, letting admins tune settings.' },
		{ term: 'Core', def: 'What makes you different from competitors. Complex, changes often. Build it in-house with your best people.' },
		{ term: 'Supporting', def: 'Needed by the business but gives no edge. Usually simple. Build it cheaply, or outsource it.' },
		{ term: 'Generic', def: 'A problem everyone has and someone already solved well. Buy it or adopt open source.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['core["Core: federated social network"]', 'core --> fan["Timelines: fan-out on write"]', 'core --> ap["Federation: ActivityPub"]'],
				highlight: ['core', 'fan', 'ap'],
				note: '**Core.** The README: a "social network server based on ActivityPub", where users "can seamlessly communicate with users from another" server, with "real-time, chronological timeline updates". My reading: timelines and federation are what make it Mastodon. It is a judgment, and the team could argue it.'
			},
			{
				add: ['supp["Supporting: admin settings, data export, rate limit rules"]'],
				highlight: ['supp'],
				note: '**Supporting.** Users and admins need them, but nobody picks a social network for its export page. Built in-house and kept plain.'
			},
			{
				add: ['gems["Devise, Doorkeeper, Sidekiq, Chewy, Paperclip"]', 'infra[("Postgres, Redis, Elasticsearch, S3")]', 'fan -->|"home feeds are Redis sorted sets"| infra', 'gems --> infra', 'class gems,infra ext'],
				highlight: ['gems', 'infra'],
				note: '**Generic, adopted.** Login, OAuth, jobs, search, file attachments, databases. Each is years of work someone else did. Notice the arrow from timelines: the core is **built on top of** Redis, not on a storage engine of its own.'
			},
			{
				add: ['held["lib/chewy, lib/paperclip: Mastodon extensions in library namespaces"] --> gems'],
				highlight: ['held'],
				note: '**The messy case.** Mastodon adopts Chewy and Paperclip, then extends them in its own `lib/` folder, under the libraries\' own module names. Adopted, yet held very close. And ActivityPub is an open standard, yet Mastodon implements it in-house, because federation is the product.'
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
			'This is **core** logic: who gets a new post, by visibility, mentions, lists and hashtags. No library knows these rules. They are Mastodon\'s product.',
			'It is built on adopted parts. Each home feed delivery ends in [`FeedManager`](' + MASTODON + '/app/lib/feed_manager.rb#L74-L84), which writes to a Redis sorted set and keeps at most [800 items per feed](' + MASTODON + '/app/lib/feed_manager.rb#L7-L8). It also skips users who have not signed in recently: another product rule, not a storage one.',
			'The generic parts are in the [`Gemfile`](' + MASTODON + '/Gemfile#L8-L49): `rails`, `pg`, `kt-paperclip`, `chewy`, `devise`, `devise-two-factor`, `omniauth`, `doorkeeper`. Further down, `sidekiq` for jobs and `json-ld` for parsing ActivityPub documents.',
			'Adopted models leak into the core. A post [`belongs_to :application, class_name: \'Doorkeeper::Application\'`](' + MASTODON + '/app/models/status.rb#L75): the posts table points at the OAuth library\'s table. Replacing Doorkeeper would touch every post.'
		]
	},
	tradeoff: {
		gain: [
			'A rule for staffing: best people on timelines and federation, nobody rewriting a login system or a job queue.',
			'A rule for buying: if it is generic, the default answer is "adopt", and building needs a reason.',
			'Adopted parts improve without you: each gem update brings fixes and features the team did not have to write.'
		],
		cost: [
			'Every adopted system is a dependency you do not control. Its model becomes your limit, like the Doorkeeper table every post points to.',
			'Holding the generic part close blurs the line: Mastodon\'s [Chewy strategy](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L3-L5) is declared as `module Chewy` inside Mastodon\'s own tree, so the module name no longer tells you who owns the code.',
			'The labels are judgment, not facts. Two architects can sort the same system differently, and the sort changes when the business changes.'
		]
	},
	task: {
		prompt: 'A SaaS invoicing app adds "pay this invoice online". It needs: card payments, a payment page with the customer\'s branding, automatic reminders on a schedule each customer can tune, and a PDF receipt. Sort each part: core, supporting or generic. Then say what you would build and what you would adopt.',
		hint: 'Ask of each part: would a customer pick this product over a competitor because of it? And has someone already solved it well?',
		answer: [
			'**Card payments: generic.** Adopt a payment provider. Building card processing buys you compliance work and no edge.',
			'**PDF receipts: generic.** Adopt a PDF library or service. Nobody switches invoicing tools for a PDF renderer.',
			'**Reminder rules: core**, if getting paid faster is why customers choose you. Build them in-house with your best people, on an adopted job scheduler.',
			'**Branded payment page: supporting.** Customers expect it, but a simple template is enough. Build it cheaply.',
			'Lesson: one feature can contain several subdomains. Sort the parts, not the feature.'
		]
	},
	quiz: [
		{
			q: 'Your team has one senior engineer free this quarter. Following the subdomain classification, where should they work?',
			options: ['On the generic parts, since they are the hardest to integrate well', 'On supporting subdomains, since they are simple and quick wins', 'Wherever the backlog is longest, so the team catches up fastest', 'On the core subdomain, the part that makes the product different'],
			answer: 3,
			why: 'Evans: "Apply top talent to the core domain." Generic parts should be adopted, supporting parts kept simple. The classification is a staffing tool.'
		},
		{
			q: 'In Mastodon, where do password login and two-factor authentication come from?',
			options: ['Adopted gems, Devise and devise-two-factor', 'Code written in-house under `app/services`', 'The ActivityPub standard', 'Elasticsearch'],
			answer: 0,
			why: 'Login is generic, so it is adopted and listed in the Gemfile. Mastodon\'s own effort goes into timelines and federation.'
		},
		{
			q: 'ActivityPub is an open standard, yet Mastodon implements it in its own code. What does that show?',
			options: ['Standards are always core, because every product depends on them', 'Mastodon could not find a library that was mature enough to reuse', 'Something generic for most companies can be core for one, when it is the product', 'ActivityPub is a supporting subdomain, so it is fine to build in-house'],
			answer: 2,
			why: 'For most apps, a protocol is something to adopt. For a federated network, federation is the reason it exists, so it gets the in-house effort. The sort depends on your business, not on the technology.'
		}
	],
	takeaway: 'Build the core with your best people, keep supporting parts simple, adopt the generic ones, and write down every exception.',
	sources: [
		{ title: 'Evans, DDD Reference: Core Domain and Generic Subdomains (pp. 40-41)', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'Mastodon, README', url: `${MASTODON}/README.md?plain=1#L21-L38` },
		{ title: 'Mastodon, Gemfile', url: `${MASTODON}/Gemfile` },
		{ title: 'Mastodon, fan_out_on_write_service.rb', url: `${MASTODON}/app/services/fan_out_on_write_service.rb#L12-L47` }
	]
};
