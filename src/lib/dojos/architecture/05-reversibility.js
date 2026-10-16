const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'reversibility',
	part: 'Thinking like an architect',
	title: 'Reversible decisions: one-way and two-way doors',
	minutes: 10,
	hook: [
		'You cannot spend a week on every decision. You also cannot afford to rush the few that lock you in. So you need a way to tell the two kinds apart.',
		'In his letter to Amazon shareholders filed in 2016, Jeff Bezos described them as doors. **One-way doors**: "If you walk through and don\'t like what you see on the other side, you can\'t get back to where you were before." Decide slowly. Two-way doors: "You can reopen the door and go back through." Decide fast.',
		'Most decisions also have options between yes and no, from one extreme to the other. Deleting a post in Discourse, the forum software, shows both ideas. A deleted post can almost always be brought back. Outside private messages and server-side bulk tasks, removing one for good takes an admin, on a site that turned it on.'
	],
	terms: [
		{ term: 'One-way door', def: 'A decision that is hard or impossible to undo: deleted data, a public contract, data you never recorded. Slow down and write an ADR.' },
		{ term: 'Two-way door', def: 'A decision that is cheap to undo: a config flag, a state column, a library behind an interface. Decide and move on.' },
		{ term: 'Soft delete', def: 'Marking a row as deleted (a timestamp column) instead of removing it. Users no longer see it, and staff can still restore it.' },
		{ term: 'Feature flag', def: 'A switch that turns behavior on per deployment or per tenant. It lets you undo a rollout, as long as turning it off leaves no new data behind.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['active["Post visible"]', 'gone["Permanently deleted"]'],
				highlight: ['active', 'gone'],
				note: 'At one extreme, a visible post is in the topic. At the other, a **permanently deleted** post is, in Discourse\'s own words, "completely removed from the database and cannot be recovered". If delete were one button, one misclick would destroy a post for good.'
			},
			{
				add: ['active -->|"author deletes"| stub["Deleted by author: text replaced"]', 'stub -.->|"author recovers"| active', 'stub -->|"after 24 h, scheduled job"| trashed["Soft-deleted: deleted_at set"]', 'active -->|"staff deletes"| trashed', 'trashed -.->|"staff recovers"| active'],
				highlight: ['stub', 'trashed'],
				note: 'Discourse has two states in between. An author\'s delete only replaces the text, and the author can take it back. A day later, by default, a job soft-deletes the post: it sets one timestamp on the row, and staff can recover it. Someone can undo each of these two steps, so each is a two-way door.'
			},
			{
				add: ['trashed -->|"admin, setting on, wait 5 min or a second admin"| gone'],
				highlight: ['gone'],
				note: 'Three rules guard the one-way door. Only an admin can use it, and only on a post that is **already soft-deleted**. An admin who just soft-deleted the post must wait 5 minutes, or let a different admin do it.'
			},
			{
				add: ['flag["Site setting: can_permanently_delete, off by default"] -->|"unlocks"| gone'],
				highlight: ['flag'],
				note: 'The whole door sits behind a site setting that is **off by default** and asks for confirmation when you turn it on. You can turn the setting off again at any time. The posts destroyed while it was on stay destroyed.'
			}
		]
	},
	example: {
		title: 'lib/guardian/post_guardian.rb',
		repo: 'discourse/discourse',
		url: `${DISCOURSE}/lib/guardian/post_guardian.rb#L250-L260`,
		lang: 'ruby',
		code: `  def can_permanently_delete_post?(post)
    return false if !SiteSetting.can_permanently_delete
    return false if !post
    return false if post.is_first_post?
    return false if !is_admin? || !can_edit_post?(post)
    return false if !post.deleted_at
    if post.deleted_by_id == @user.id && post.deleted_at >= Post::PERMANENT_DELETE_TIMER.ago
      return false
    end
    true
  end`,
		notes: [
			'Lines 2 to 9 each guard the one-way door. Line 2 checks the site setting first, and it [defaults to `false`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/config/site_settings.yml#L3271-L3274).',
			'Line 6, `return false if !post.deleted_at`, allows destroying only a post that is already soft-deleted. The undoable step always runs first.',
			'Line 7 uses `PERMANENT_DELETE_TIMER`, which is [5 minutes](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/models/post.rb#L26-L27). The refusal message says "You must wait … or a different administrator must do it." So the admin either waits or asks a second person.',
			'The two-way door is two short methods: `trash!` and `recover!` only set or clear `deleted_at` and `deleted_by_id`. One ternary in [`PostDestroyer`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/lib/post_destroyer.rb#L198-L199) picks between the two doors: `permanent? ? @post.destroy! : @post.trash!(@user)`. Only the guards above stop `permanent?` from being true.'
		]
	},
	tradeoff: {
		gain: [
			'You spend design time on the one-way doors, and small decisions like a config flag go fast.',
			'The middle options, a soft delete and a 5 minute wait, mean a post is destroyed only after an undoable step and a pause.'
		],
		cost: [
			'Every middle state is code to own: soft-deleted rows must be hidden from every query, and a scheduled job has to clean up author deletes.',
			'Soft-deleted rows still take space, and they are still in the database when someone expects them gone.',
			'Misjudging a door is expensive: a field name in a public API looks like a detail until another team depends on it.'
		]
	},
	task: {
		prompt: 'You run a SaaS invoicing app. Classify each decision as one-way or two-way, and say what makes it so: (a) a feature flag that shows the new dashboard to some customers, (b) a nightly job that hard-deletes invoices older than 10 years, (c) renaming a field in the webhook payload customers receive, (d) changing the font of invoice PDFs.',
		hint: 'Ask: if we change our mind in a month, who else has to change, and what data stays behind?',
		answer: [
			'(a) Two-way: if the new dashboard writes nothing the old one cannot read. If it stores new data, turning the flag off leaves that data behind.',
			'(b) One-way: deleted invoices do not come back. A middle option: soft-delete first, purge for real after a delay, so a wrong date in the job is caught before the data is gone.',
			'(c) Close to one-way: customer code you cannot see depends on the old name. The middle option: send both fields for a while, announce the old one is going away, remove it later.',
			'(d) Two-way for new PDFs: you can change the font back any time. Invoices already sent keep the font they were made with, and nobody needs them changed.'
		]
	},
	quiz: [
		{
			q: 'Why does Discourse only allow permanently deleting a post that is already soft-deleted?',
			options: [
				'The database cannot delete a row that is still visible, so the soft delete hides it first',
				'Soft-deleted posts take more disk space, so Discourse cleans them up before anything else',
				'Visible posts are read only for admins, so only a hidden post can be changed or removed',
				'So no post is lost in one step: an undoable step comes before the irreversible one'
			],
			answer: 3,
			why: 'The guard `return false if !post.deleted_at` puts a two-way door (soft delete) in front of the one-way door (destroy). A mistake at the first step can still be recovered.'
		},
		{
			q: 'A Discourse admin soft-deleted a post 2 minutes ago and now tries to delete it permanently. What happens?',
			options: [
				'Refused: they must wait until 5 minutes have passed, or another admin must do it',
				'It works, admins can always destroy a post once it has been soft-deleted',
				'The post is restored instead, since a soft delete under 5 minutes is undone',
				'Discourse queues the destroy and only runs it for real after 30 days'
			],
			answer: 0,
			why: '`PERMANENT_DELETE_TIMER` is 5 minutes and applies when the same admin deleted the post. The rule forces a pause, or a check by a second admin, before the one-way door.'
		},
		{
			q: 'A site turns `can_permanently_delete` on for a month, then off again. What happens to the posts destroyed during that month?',
			options: [
				'They come back as soft-deleted posts',
				'They are restored from the next backup automatically',
				'They stay gone: the flag is reversible, what it did is not',
				'They move to the admin\'s private messages'
			],
			answer: 2,
			why: 'The setting\'s own description says permanently deleted data "cannot be recovered". Turning the setting off only blocks new permanent deletes.'
		}
	],
	recall: {
		q: 'Which steps must a Discourse post go through before an admin can delete it permanently?',
		a: 'The `can_permanently_delete` setting must be on (it is off by default), the post must already be soft-deleted, and if the same admin soft-deleted it, 5 minutes must have passed. Otherwise a different admin has to do it.'
	},
	sources: [
		{ title: 'Jeff Bezos, letter to Amazon shareholders (Type 1 and Type 2 decisions)', url: 'https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm' },
		{ title: 'Discourse, post_guardian.rb: can_permanently_delete_post?', url: `${DISCOURSE}/lib/guardian/post_guardian.rb#L250-L260` },
		{ title: 'Discourse, post_destroyer.rb: destroy_stubs, the job behind author deletes', url: `${DISCOURSE}/lib/post_destroyer.rb#L21-L47` },
		{ title: 'Discourse, trashable.rb: trash! and recover!', url: `${DISCOURSE}/app/models/concerns/trashable.rb#L18-L36` },
		{ title: 'Discourse, server.en.yml: what can_permanently_delete does', url: `${DISCOURSE}/config/locales/server.en.yml#L2326` },
		{ title: 'Discourse, site_settings.yml: delete_removed_posts_after defaults to 24 hours', url: `${DISCOURSE}/config/site_settings.yml#L1512-L1516` }
	]
};
