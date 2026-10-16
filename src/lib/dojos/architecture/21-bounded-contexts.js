const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const PARSER = `${REPO}/app/lib/activitypub/parser/status_parser.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'bounded-contexts',
	part: 'Domains and boundaries',
	title: 'Bounded contexts and context maps',
	minutes: 10,
	hook: [
		'You tap the star on a post from another Mastodon server. Your server stores a favourite on a status. Between servers, the same click travels as a **Like of a Note**.',
		'One word can also mean two things. In the ActivityStreams vocabulary, `summary` is "a natural language summarization of the object". Mastodon shows `summary` as the content warning before a post, and each side is correct inside its own boundary.',
		'DDD calls that boundary a **bounded context**: the area where one model and one vocabulary hold. A context map shows how contexts relate, and which one has to adapt to the other. Mastodon has one you can read in its code.'
	],
	terms: [
		{ term: 'Bounded context', def: 'A boundary inside which every term has exactly one meaning. Often one service or one team.' },
		{ term: 'Published language', def: 'A shared, documented format that several contexts agree to speak at the border, like one message shape every server sends.' },
		{ term: 'Conformist', def: 'The downstream context (the one that receives) adopts the upstream model as it is, because it has no say or translating costs too much.' },
		{ term: 'Anti-corruption layer', def: 'A translation layer in the downstream context that rewrites the upstream model in its own terms, so the rest of its code never sees the foreign words.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['remote["Other server: Note, Like, Person"]', 'masto["Mastodon context: Status, Favourite, Account, visibility"]', 'class remote ext'],
				highlight: ['remote', 'masto'],
				note: 'Mastodon\'s model stores statuses with a `text`, a `spoiler_text` and a `visibility`. The other server may run any software, and it only promises to speak the shared language.'
			},
			{
				add: ['pl["Published language: ActivityPub and ActivityStreams 2.0, W3C"]', 'remote -->|"JSON to the inbox"| pl'],
				highlight: ['pl'],
				note: 'ActivityPub and the ActivityStreams vocabulary are the published language here, and both are W3C Recommendations. They define `Note`, `Like`, `Person`, `summary`, `to` and `cc`. No server owns them, and every server can read them.'
			},
			{
				add: ['aclin["Inbound ACL: Activity.factory, StatusParser"]', 'pl --> aclin', 'aclin -->|"Status, Favourite"| masto'],
				highlight: ['aclin'],
				note: 'The inbound anti-corruption layer starts with a factory that picks one class per activity type and ignores unknown types. An incoming `Like` creates a `Favourite`. The status parser maps `content` to `text`, `summary` to `spoiler_text`, and the `to` and `cc` lists to one of four visibilities. Mastodon code behind this layer only sees statuses.'
			},
			{
				add: ['aclout["Outbound serializers: Status to Note, Favourite to Like"]', 'masto --> aclout', 'aclout -->|"ActivityPub JSON"| remote'],
				highlight: ['aclout'],
				note: 'Serializers translate in the other direction. `NoteSerializer` writes a status as a `Note`, or a `Question` when it has a poll. `LikeSerializer` writes a favourite as a `Like`, so the other server never sees the word "favourite".'
			},
			{
				add: ['toot["toot: extensions, documented by Mastodon"]', 'masto -.->|"focalPoint, blurhash, discoverable"| toot', 'toot -.->|"use as is"| remote'],
				highlight: ['toot'],
				note: 'Some features have no word in ActivityStreams, so Mastodon adds its own terms under `http://joinmastodon.org/ns#` and documents them. A server that wants Mastodon\'s focal points has to use `toot:focalPoint` exactly as Mastodon defines it. That server is a conformist: it cannot change the term.'
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
			'Lines 1 to 15 read the ActivityStreams fields `content` and `summary` and return the Mastodon words `text` and `spoiler_text`. The [`Create` handler](' + REPO + '/app/lib/activitypub/activity/create.rb#L101-L123) builds the status params from the parser, so no model code reads the raw JSON.',
			'Lines 17 to 27 compute `visibility`, a field ActivityPub does not have. ActivityPub only has address lists, and the parser reads them in order to pick one of four values. Any address it does not recognize falls into the last branch, `:direct`.',
			'The factory [maps each activity type to a class](' + REPO + '/app/lib/activitypub/activity.rb#L24-L65) and returns `nil` for the rest, so unknown activities do nothing. `Note` and `Question` are supported, and `Article`, `Page`, `Event` and media are converted. Mastodon\'s ActivityPub docs say they "are converted as best as possible", with the `url` appended.',
			'The word "like" crosses the boundary in both directions: `Like` arrives and creates a favourite, and [`LikeSerializer` sends a favourite as `Like`](' + REPO + '/app/serializers/activitypub/like_serializer.rb#L3-L22). The `toot:` terms sit in the JSON-LD context in `context_helper.rb`.'
		]
	},
	tradeoff: {
		gain: [
			'The ACL keeps the ActivityStreams vocabulary at the edge. Timelines, filters and notifications only know `visibility`, never `to` and `cc`.',
			'The published language lets Mastodon talk to software it has never seen. Any server that speaks ActivityPub can follow, like and reply.',
			'A server that adopts `toot:focalPoint` as is needs no design and no mapping code.'
		],
		cost: [
			'The ACL is code to write, test and keep in sync. Mastodon\'s parser has fallbacks for language maps, converted types and address lists, and each one is a rule to maintain.',
			'Mastodon cannot add a field to `Note` for every server. It can only add a `toot:` extension and hope other servers read it.',
			'The translation drops some meaning. A long `Article` from a blog engine shows up as a short status with a link, and a real summary in `summary` appears on Mastodon as a content warning.'
		]
	},
	task: {
		prompt: 'Some servers start sending posts addressed to a new collection, "only mutual followers". Mastodon has no such visibility. Draw the context map for this change and choose: should Mastodon **conform** (add a new visibility) or translate (map the new audience to an existing one in its ACL)? Say where the code would change either way.',
		hint: 'Read the last branch of `visibility` first: what does Mastodon do today with an address it does not recognize? Then ask what every timeline query would need to learn.',
		answer: [
			'Today: the new collection is neither public nor the followers collection, so the parser returns `:direct` (the `Create` handler may then relabel it `:limited`). The post still reaches someone, but maybe fewer people than the author meant.',
			'Conform: add a value to the `visibility` column of `Status`, then teach every timeline, permission check and serializer what it means. Mastodon takes on a concept its own users may not need.',
			'Translate: keep the existing visibilities and map the new collection on purpose in `StatusParser#visibility`, probably to `:private`. Only the ACL changes.',
			'Either way, the other servers decided the change. They are upstream and Mastodon is downstream for incoming posts, so Mastodon has to adapt.',
			'A good answer names when to revisit the choice: if Mastodon users start asking to post to mutuals, adding the visibility is worth the cost.'
		]
	},
	quiz: [
		{
			q: 'A downstream service receives an upstream model and turns it into its own terms before any business code sees it. What is that?',
			options: ['Anti-corruption layer', 'Published language', 'Conformist', 'Shared kernel'],
			answer: 0,
			why: 'An anti-corruption layer is a translation owned by the downstream side. A conformist would use the upstream model as it is. A published language is the shared format at the border, and the translation sits behind it.'
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
			why: 'The factory maps known types to classes and returns `nil` otherwise. The caller runs `activity&.perform`, so an unknown activity does nothing and never reaches the model.'
		},
		{
			q: 'In ActivityStreams, `summary` is "a natural language summarization of the object". Mastodon shows it as a content warning. What does that show?',
			options: [
				'Mastodon breaks the ActivityPub spec and should store the warning in a field of its own',
				'One word can mean different things in two contexts, and the translation at the border picks the meaning',
				'ActivityStreams should rename the field, because one name for two meanings is a bug in the spec',
				'Content warnings are part of the W3C vocabulary, and `summary` is the field the spec defines for them'
			],
			answer: 1,
			why: 'Each context gives the word its own meaning. Mastodon\'s parser maps `summary` to `spoiler_text` on purpose, and its docs say so. A context map shows that choice to the whole team.'
		}
	],
	recall: {
		q: 'Where does Mastodon translate an incoming ActivityPub post into its own words, and what does `to` and `cc` turn into?',
		a: 'In its anti-corruption layer: `Activity.factory` and `StatusParser`. The `to` and `cc` address lists turn into one `visibility` value: `:public`, `:unlisted`, `:private` or `:direct`.'
	},
	sources: [
		{ title: 'Martin Fowler, BoundedContext', url: 'https://martinfowler.com/bliki/BoundedContext.html' },
		{ title: 'Evans, DDD Reference: Published Language, Conformist, Anticorruption Layer', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'W3C, Activity Vocabulary', url: 'https://www.w3.org/TR/activitystreams-vocabulary/' },
		{ title: 'Mastodon docs, ActivityPub', url: 'https://docs.joinmastodon.org/spec/activitypub/' },
		{ title: 'Mastodon, status_parser.rb', url: `${PARSER}#L40-L111` },
		{ title: 'Mastodon, activity.rb: supported and converted types', url: `${REPO}/app/lib/activitypub/activity.rb#L9-L10` },
		{ title: 'Mastodon, activity/like.rb', url: `${REPO}/app/lib/activitypub/activity/like.rb#L3-L13` },
		{ title: 'Mastodon, context_helper.rb: toot terms', url: `${REPO}/app/helpers/context_helper.rb#L22-L24` }
	]
};
