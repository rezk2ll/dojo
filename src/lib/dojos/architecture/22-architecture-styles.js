const REPO = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const TREE = 'https://github.com/discourse/discourse/tree/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';
const BOUTIQUE = 'https://github.com/GoogleCloudPlatform/microservices-demo/blob/38e7348eb289eb5b87c0c6e8cb19ced0449dc389';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'architecture-styles',
	part: 'Domains and boundaries',
	title: 'Architecture styles',
	minutes: 10,
	hook: [
		'Someone in a meeting says "we should move to microservices". Someone else says "we already have a modular monolith". Nobody checks what the code actually is. The argument is about labels.',
		'An **architecture style** is a named shape for a whole system: how it is split, how the parts talk, how it is deployed. Richards & Ford catalogue them: layered, modular monolith, pipeline, microkernel, service-based, event-driven, space-based, orchestration-driven SOA, microservices. Each comes with **known strengths and known weaknesses**.',
		'The useful skill is not knowing the list. It is **looking at real code, naming its style honestly, and checking that style against the characteristics you said matter** (day 2). Most real systems are a mix. Today: Discourse, the forum software, and one microservices demo for contrast.'
	],
	terms: [
		{ term: 'Style', def: 'The overall shape of a system: its split, its communication and its deployment units. A style has typical trade-offs you can look up.' },
		{ term: 'Technical vs domain partitioning', def: 'Split the code by layer (controllers, models, jobs) or by business area (topics, polls, chat). It is how you tell a layered monolith from a modular one.' },
		{ term: 'Microkernel', def: 'A small core plus plug-ins that add features. Also called plug-in architecture.' },
		{ term: 'Event-driven', def: 'Parts react to events instead of calling each other directly. Good for decoupling, harder to trace and test.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["Discourse: one Rails app"]', 'app --> ctrl["app/controllers"]', 'app --> models["app/models"]', 'app --> jobs["app/jobs"]'],
				highlight: ['app', 'ctrl', 'models', 'jobs'],
				note: '**A monolith, split by layer.** One Rails back end, with Postgres and Redis. The folders under `app/` are technical layers: controllers, models, serializers, services, jobs. Topics, posts and users each live in several of them. That is a layered monolith, not a modular one.'
			},
			{
				add: ['pc["PostCreator: save in one transaction"]', 'evt["DiscourseEvent.trigger :post_created"]', 'models --> pc', 'pc -->|"after commit, in process"| evt'],
				highlight: ['pc', 'evt'],
				note: '**Event-driven, inside the monolith.** After the transaction, `PostCreator` triggers `:post_created`. `DiscourseEvent` is a hash of blocks in memory. It calls each one in turn, in the same process, before `create` returns.'
			},
			{
				add: ['sq["Sidekiq workers"]', 'pc -->|"enqueue_jobs"| sq', 'class sq ext'],
				highlight: ['sq'],
				note: '**Background jobs.** Slow work goes to Sidekiq through Redis: `enqueue_jobs` runs right after the events. Same code base, a second kind of process. `app/jobs` holds over a hundred regular jobs and over a hundred scheduled ones.'
			},
			{
				add: ['poll["plugins/poll"]', 'chat["plugins/chat"]', 'poll -->|"on(:post_created)"| evt', 'poll -->|"prepend into Post, User"| models', 'chat -->|"plugin API"| app'],
				highlight: ['poll', 'chat'],
				note: '**Microkernel, with open doors.** The repo ships 46 plugins, from `poll` to `chat`. Each has a `plugin.rb` that calls the plugin API: `on(event)`, `add_to_serializer`, `add_to_class`. The poll plugin also prepends its own modules into the core `Post` and `User` classes.'
			},
			{
				add: ['boutique["Online Boutique: 11 services, many languages, gRPC"]', 'class boutique ext'],
				highlight: ['boutique'],
				note: '**For contrast, microservices.** Google\'s Online Boutique demo is "11 microservices written in different languages that talk to each other over gRPC". Each one is built and deployed on its own. Compare: in Discourse, a new feature is a plugin folder and a new release of one app.'
			}
		]
	},
	example: {
		title: 'plugins/poll/plugin.rb: a plug-in reaching into the core',
		repo: 'discourse/discourse',
		url: `${REPO}/plugins/poll/plugin.rb#L16-L208`,
		lang: 'ruby',
		code: `enabled_site_setting :poll_enabled
…
after_initialize do
  …
  reloadable_patch do
    Post.prepend(DiscoursePoll::PostExtension)
    User.prepend(DiscoursePoll::UserExtension)
  end
  …
  on(:post_created) do |post, _opts, user|
    guardian = Guardian.new(user)
    DiscoursePoll::Poll.schedule_jobs(post)
    …
  end
  …
  add_to_serializer(:current_user, :can_create_poll) do
    scope.user&.staff? || scope.user&.in_any_groups?(SiteSetting.poll_create_allowed_groups_map)
  end`,
		notes: [
			'Three ways in. A **setting** that switches the plug-in on and off. A **hook** on a core event. An **extension** of a core class or serializer. Together they are the contract between core and plug-in.',
			'The core wraps each hook in the on/off switch: [`on`](' + REPO + '/lib/plugin/instance.rb#L691-L694) registers a block with `DiscourseEvent` that runs only `if enabled?`. [`add_to_class`](' + REPO + '/lib/plugin/instance.rb#L474-L491) defines a method on any core class, guarded the same way.',
			'`prepend` has no such guard and no fixed contract. The plug-in can change any method of `Post`. That is the microkernel cost in full: plug-ins are independent until a core class changes under them.',
			'The events run inline. [`DiscourseEvent.trigger`](' + REPO + '/lib/discourse_event.rb#L11-L18) calls each block in turn and re-raises unless `continue_on_error`. [`PostCreator`](' + REPO + '/lib/post_creator.rb#L203-L280) passes `continue_on_error: true` for `:post_created`, so a broken plug-in is a warning, not a failed post.'
		]
	},
	tradeoff: {
		gain: [
			'Discourse (monolith): **simple** to run. One app, one database, one thing to deploy and debug, and one transaction around a new post.',
			'Plug-ins (microkernel): each site switches features on with a setting. Customization without forking.',
			'In-process events: a new reaction to "post created" is a hook, not an edit to `PostCreator`.'
		],
		cost: [
			'Every change ships the whole app, and a bug in one area can take down all of them.',
			'Plug-ins share the core\'s process and can patch its classes. A slow or broken plug-in slows or breaks everyone, and a core refactor can break plug-ins it never mentions.',
			'In-memory events are lost if the process dies mid-request, and they run inside `create`, so a slow handler slows every post. They are also harder to follow than a direct call.'
		]
	},
	task: {
		prompt: 'Pick one component you work on. In 3 minutes: name its style (one of the Richards & Ford names, or "X with Y inside"). Then rate it against your top 3 characteristics from day 2 with a +, = or -.',
		hint: 'Look at the top-level folders (layer names or business names?), the number of deployables, and how parts talk (calls, events, plug-in hooks).',
		answer: [
			'Check: did you name it from the **code**, not from the wiki or the team\'s wish?',
			'Check: top folders named `controllers/services/repositories` mean technical partitioning. Folders named after business areas mean domain partitioning.',
			'Check: at least one characteristic got a **minus**. Every style has one, and pretending otherwise fails the first law (day 1: everything is a trade-off).',
			'Bonus: write one sentence on what would have to change to move it to the next style. That sentence is an ADR waiting to happen.'
		]
	},
	quiz: [
		{
			q: 'A system is one deployable whose top folders are `controllers/`, `models/` and `jobs/`, with business areas spread inside each. Which label is most honest?',
			options: ['Microservices, one per top-level folder', 'A pure modular monolith, partitioned by business domain first', 'Space-based architecture', 'A layered monolith: technical partitioning first'],
			answer: 3,
			why: 'The first split is technical (layers), so it is not a modular monolith. It is one deployable, so it is not microservices. Name what the code shows.'
		},
		{
			q: 'What makes Discourse\'s plug-in system a microkernel?',
			options: ['It stores every plug-in in its own database', 'A core app loads plug-ins that add hooks, settings and extensions', 'Each plug-in runs as its own service and talks over gRPC', 'It sends every event to Sidekiq'],
			answer: 1,
			why: 'Microkernel means core plus plug-ins. Each `plugin.rb` registers what it adds through the plug-in API. The plug-ins run inside the same Rails process.'
		},
		{
			q: '`DiscourseEvent` keeps its handlers in memory and calls them inline, after the post is saved. What is the trade-off?',
			options: ['Cheap and simple, but a slow handler delays the caller and nothing replays it after a crash', 'It needs a separate broker to run, which adds a deployable', 'Handlers run before the transaction, so they can roll back the post', 'There is no downside, since every process registers the same handlers'],
			answer: 0,
			why: 'In-process events cost nothing to set up. They also give no durability and no isolation: the handler runs inside the caller, and a crash loses it. Work that must survive goes to a Sidekiq job.'
		}
	],
	takeaway: 'Name the style from the code, expect a mix, and rate it against your own characteristics, minuses included.',
	sources: [
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed., table of contents', url: 'https://nealford.com/books/SAF2e.html' },
		{ title: 'Richards & Ford, Fundamentals of Software Architecture, 2nd ed. (O\'Reilly)', url: 'https://www.oreilly.com/library/view/fundamentals-of-software/9781098175504/' },
		{ title: 'Discourse, lib/plugin/instance.rb: the plug-in API', url: `${REPO}/lib/plugin/instance.rb#L691-L694` },
		{ title: 'Discourse, plugins/: the bundled plug-ins', url: `${TREE}/plugins` },
		{ title: 'Online Boutique, README: architecture', url: `${BOUTIQUE}/README.md#architecture` }
	]
};
