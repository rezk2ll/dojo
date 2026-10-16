const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const PARSER = `${REPO}/app/lib/activitypub/parser/status_parser.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'bounded-contexts',
	part: 'Domains and boundaries',
	title: 'Bounded contexts and context maps',
	minutes: 10,
	hook: [
		'You tap the star on a post from another Mastodon server. To your server, that is a **favourite** on a **status**. On the wire, between servers, it is a **Like** of a **Note**. Same click, two vocabularies.',
		'Even one word can move. In the ActivityStreams vocabulary, `summary` is "a natural language summarization of the object". To Mastodon, it is the **content warning** shown before a post. Both are correct **inside their own boundary**.',
		'DDD calls that boundary a **bounded context**: the area where one model and one vocabulary hold. A **context map** then shows how contexts relate, and who has to adapt to whom. Today we read one in Mastodon.'
	],
	terms: [
		{ term: 'Bounded context', def: 'A boundary inside which every term has exactly one meaning. Often one service or one team.' },
		{ term: 'Upstream / downstream', def: 'Upstream changes affect downstream, not the other way around. The source of the events or the API is upstream.' },
		{ term: 'Published language', def: 'A shared, documented format that several contexts agree to speak at the border, like one message shape every server sends.' },
		{ term: 'Conformist', def: 'Downstream simply adopts the upstream model as it is, because it has no say or translating is not worth it.' },
		{ term: 'Anti-corruption layer', def: 'A translation layer in the downstream that turns the upstream model into its own terms, so foreign words stop at the door.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['remote["Other server: Note, Like, Person"]', 'masto["Mastodon context: Status, Favourite, Account, visibility"]', 'class remote ext'],
				highlight: ['remote', 'masto'],
				note: 'Two contexts, two models. Mastodon stores statuses with a `text`, a `spoiler_text` and a `visibility`. The other server may run any software. It only promises to speak the shared language.'
			},
			{
				add: ['pl["Published language: ActivityPub and ActivityStreams 2.0, W3C"]', 'remote -->|"JSON to the inbox"| pl'],
				highlight: ['pl'],
				note: '**Published language.** ActivityPub and the ActivityStreams vocabulary are W3C Recommendations. They define `Note`, `Like`, `Person`, `summary`, `to` and `cc`. No server owns them, and every server can read them.'
			},
			{
				add: ['aclin["Inbound ACL: Activity.factory, StatusParser"]', 'pl --> aclin', 'aclin -->|"Status, Favourite"| masto'],
				highlight: ['aclin'],
				note: '**Anti-corruption layer, inbound.** A factory picks one class per activity type, and an unknown type is ignored. A `Like` becomes a `Favourite`. The status parser maps `content` to `text`, `summary` to `spoiler_text`, and the `to` and `cc` lists to one of four visibilities. Past this layer, Mastodon code only sees statuses.'
			},
			{
				add: ['aclout["Outbound serializers: Status to Note, Favourite to Like"]', 'masto --> aclout', 'aclout -->|"ActivityPub JSON"| remote'],
				highlight: ['aclout'],
				note: 'The same layer, outbound. `NoteSerializer` writes a status as a `Note`, or a `Question` when it has a poll. `LikeSerializer` writes a favourite as a `Like`. The other server never sees the word "favourite".'
			},
			{
				add: ['toot["toot: extensions, documented by Mastodon"]', 'masto -.->|"focalPoint, blurhash, discoverable"| toot', 'toot -.->|"use as is"| remote'],
				highlight: ['toot'],
				note: '**Conformist, by design.** Some features have no word in ActivityStreams. Mastodon adds its own terms under `http://joinmastodon.org/ns#` and documents them. A server that wants Mastodon\'s focal points has to use `toot:focalPoint` exactly as Mastodon defines it. There is nothing to negotiate.'
			}
		]
	},
	example: {
		title: 'app/lib/activitypub/parser/status_parser.rb: their words in, ours out',
		repo: 'mastodon/mastodon',
		url: `${PARSER}#L40-L111`,
		lang: 'ruby',
		code: `  def text
    if @object['content'].present?
      @object['content']
    elsif content_language_map?
      @object['contentMap'].values.first
    end
  end
  …
  def spoiler_text
    if @object['summary'].present?
      @object['summary']
    elsif summary_language_map?
      @object['summaryMap'].values.first
    end
  end
  …
  def visibility
    if audience_to.any? { |to| ActivityPub::TagManager.instance.public_collection?(to) }
      :public
    elsif audience_cc.any? { |cc| ActivityPub::TagManager.instance.public_collection?(cc) }
      :unlisted
    elsif audience_to.include?(@options[:followers_collection])
      :private
    else
      :direct
    end
  end`,
		notes: [
			'**In:** ActivityStreams fields, `content`, `summary`, `to`, `cc`. **Out:** Mastodon words, `text`, `spoiler_text`, `visibility`. The [`Create` handler](' + REPO + '/app/lib/activitypub/activity/create.rb#L101-L123) builds the status params from the parser, so no model code reads the raw JSON.',
			'`visibility` is the sharpest translation. ActivityPub has no such field, only address lists. The parser reads them in order and picks one of four values. Anything it does not recognize falls into the last branch, `:direct`.',
			'The layer also chooses what to keep. The factory [maps each activity type to a class](' + REPO + '/app/lib/activitypub/activity.rb#L24-L65) and returns `nil` for the rest, so unknown activities do nothing. `Note` and `Question` are [supported, while `Article`, `Page`, `Event` and media are converted](' + REPO + '/app/lib/activitypub/activity.rb#L9-L10): Mastodon\'s [ActivityPub docs](https://docs.joinmastodon.org/spec/activitypub/) say they "are converted as best as possible", with the `url` appended.',
			'Both directions of one word: [`Like` arrives and creates a favourite](' + REPO + '/app/lib/activitypub/activity/like.rb#L3-L13), and [`LikeSerializer` sends a favourite as `Like`](' + REPO + '/app/serializers/activitypub/like_serializer.rb#L3-L22). The `toot:` terms sit in [the JSON-LD context](' + REPO + '/app/helpers/context_helper.rb#L22-L24).'
		]
	},
	tradeoff: {
		gain: [
			'An ACL keeps foreign vocabulary at the edge. Timelines, filters and notifications only know `visibility`, never `to` and `cc`.',
			'A published language lets Mastodon talk to software it has never seen. Any server that speaks ActivityPub can follow, like and reply.',
			'Conformist is the cheapest integration there is: a server that adopts `toot:focalPoint` as is needs no design and no mapping.'
		],
		cost: [
			'An ACL is code to write, test and keep in sync. Mastodon\'s parser has fallbacks for language maps, converted types and address lists, and each one is a rule to maintain.',
			'A published language is slow to change. Mastodon cannot add a field to `Note` for everyone. It can only add an extension and hope others read it.',
			'Translation loses meaning. A long `Article` from a blog engine shows up as a short status with a link, and a post whose author meant `summary` as a summary is shown on Mastodon behind a content warning.'
		]
	},
	task: {
		prompt: 'Some servers start sending posts addressed to a new collection, "only mutual followers". Mastodon has no such visibility. Draw the context map for this change and choose: should Mastodon **conform** (add a new visibility) or **translate** (map the new audience to an existing one in its ACL)? Say where the code would change either way.',
		hint: 'Read the last branch of `visibility` first: what does Mastodon do today with an address it does not recognize? Then ask what every timeline query would need to learn.',
		answer: [
			'**Today:** the new collection is neither public nor the followers collection, so the parser returns `:direct` (the `Create` handler may then relabel it `:limited`). It works by accident, and may be narrower than the author meant.',
			'**Conform:** add a value to the `visibility` column of `Status`, then teach every timeline, permission and serializer what it means. Mastodon takes on a concept it may not need.',
			'**Translate:** keep the existing visibilities and map the new collection on purpose, in `StatusParser#visibility`, probably to `:private`. One place changes, and it is the ACL.',
			'Either way the change is upstream: the other servers decided it. Mastodon is downstream for incoming posts, so Mastodon has to move.',
			'A good answer names the trigger to revisit: if Mastodon users start asking to post to mutuals, conforming becomes worth it.'
		]
	},
	quiz: [
		{
			q: 'A downstream service receives an upstream model and turns it into its own terms before any business code sees it. What is that?',
			options: ['Anti-corruption layer', 'Published language', 'Conformist', 'Shared kernel'],
			answer: 0,
			why: 'An anti-corruption layer is a translation owned by the downstream side. Conformist would use the upstream model as it is. A published language is the shared format at the border, not the translation behind it.'
		},
		{
			q: 'A remote server sends Mastodon an activity type that `ActivityPub::Activity.factory` does not know. What happens?',
			options: [
				'Mastodon stores it as a direct message',
				'Mastodon rejects the whole inbox delivery and the server retries forever',
				'Mastodon converts it into a status with a link',
				'The factory returns `nil`, so nothing is performed'
			],
			answer: 3,
			why: 'The factory maps known types to classes and returns `nil` otherwise. The caller runs `activity&.perform`, so an unknown activity does nothing. The ACL decides what may enter the model.'
		},
		{
			q: 'In ActivityStreams, `summary` is "a natural language summarization of the object". Mastodon shows it as a content warning. What does that show?',
			options: [
				'Mastodon breaks the ActivityPub spec',
				'The same word can mean different things in two bounded contexts, and the translation at the border decides which one applies',
				'ActivityStreams should rename the field',
				'Content warnings are part of the W3C vocabulary'
			],
			answer: 1,
			why: 'Each context gives the word its own meaning. Mastodon\'s parser maps `summary` to `spoiler_text` on purpose, and its docs say so. A context map makes that choice visible.'
		}
	],
	takeaway: 'Every word has a home context. Where a word crosses a boundary, decide on purpose: conform, translate, or agree on a published language.',
	sources: [
		{ title: 'Martin Fowler, BoundedContext', url: 'https://martinfowler.com/bliki/BoundedContext.html' },
		{ title: 'Evans, DDD Reference: Published Language, Conformist, Anticorruption Layer', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'W3C, Activity Vocabulary', url: 'https://www.w3.org/TR/activitystreams-vocabulary/' },
		{ title: 'Mastodon docs, ActivityPub', url: 'https://docs.joinmastodon.org/spec/activitypub/' },
		{ title: 'Mastodon, status_parser.rb', url: `${PARSER}#L40-L111` }
	]
};
