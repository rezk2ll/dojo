const DISCOURSE = 'https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'reversibility',
	part: 'Thinking like an architect',
	title: 'One-way doors, two-way doors, and the options in between',
	minutes: 10,
	hook: [
		'You cannot spend a week on every decision. You also cannot afford to rush the few that lock you in. The skill is telling them apart.',
		'In his letter to Amazon shareholders filed in 2016, Jeff Bezos put it as doors. **One-way doors**: "If you walk through and don\'t like what you see on the other side, you can\'t get back to where you were before." Decide slowly. **Two-way doors**: "You can reopen the door and go back through." Decide fast.',
		'Second trap: thinking every decision is yes or no. Most are a **spectrum**. Deleting a post in Discourse, the forum software, shows both ideas at once. A deleted post can almost always be brought back. Outside private messages and server-side bulk tasks, removing one for good takes an admin, on a site that turned it on.'
	],
	terms: [
		{ term: 'One-way door', def: 'Hard or impossible to undo: deleted data, a public contract, data you never recorded. Slow down, write an ADR.' },
		{ term: 'Two-way door', def: 'Cheap to undo: a config flag, a state column, a library behind an interface. Decide and move on.' },
		{ term: 'Spectrum', def: 'Lay out the options from one extreme to the other instead of "do it or not". The right answer is usually in the middle.' },
		{ term: 'Soft delete', def: 'Mark a row as deleted (a timestamp column) instead of removing it. Hidden from users, still there to restore.' },
		{ term: 'Feature flag', def: 'A switch that turns behavior on per deployment or per tenant. It turns a one-way rollout into a two-way door, as long as turning it off leaves nothing behind.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['active["Post visible"]', 'gone["Permanently deleted"]'],
				highlight: ['active', 'gone'],
				note: 'The two extremes. A **visible** post is in the topic. A **permanently deleted** post is, in Discourse\'s own words, "completely removed from the database and cannot be recovered". If delete were one button, one misclick would be a one-way door.'
			},
			{
				add: ['active -->|"author deletes"| stub["Deleted by author: text replaced"]', 'stub -.->|"author recovers"| active', 'stub -->|"after 24 h, scheduled job"| trashed["Soft-deleted: deleted_at set"]', 'active -->|"staff deletes"| trashed', 'trashed -.->|"staff recovers"| active'],
				highlight: ['stub', 'trashed'],
				note: 'The middle of the spectrum. An author\'s delete only replaces the text, and the author can take it back. A day later, by default, a job soft-deletes it. A **soft-deleted** post is one timestamp on the row. Staff can recover it: two-way doors.'
			},
			{
				add: ['trashed -->|"admin, setting on, wait 5 min or a second admin"| gone'],
				highlight: ['gone'],
				note: 'The one-way door, guarded several times. Only an admin. Only a post that is **already soft-deleted**. And an admin who just soft-deleted it must wait 5 minutes, or let a different admin do it. The irreversible step is never the first step.'
			},
			{
				add: ['flag["Site setting: can_permanently_delete, off by default"] -->|"unlocks"| gone'],
				highlight: ['flag'],
				note: 'The whole door is behind a flag that is **off by default** and asks for confirmation when you turn it on. Turning it off again is easy. Bringing back what was destroyed while it was on is not. The flag is reversible. What it did is not.'
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
			'Every line is a guard in front of the one-way door. The site setting comes first, and it [defaults to `false`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/config/site_settings.yml#L3271-L3274).',
			'`return false if !post.deleted_at`: you can only destroy what is already soft-deleted. The cheap, undoable step must come first.',
			'`PERMANENT_DELETE_TIMER` is [5 minutes](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/models/post.rb#L26-L27). The refusal message says "You must wait … or a different administrator must do it." In effect: a pause, or a second person.',
			'The two-way door is tiny. [`trash!` and `recover!`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/app/models/concerns/trashable.rb#L18-L36) only set or clear `deleted_at` and `deleted_by_id`. The one-way door is one ternary away, in [`PostDestroyer`](https://github.com/discourse/discourse/blob/9252651c5c25df36cb0a3cf3f06e0c9c30974d5a/lib/post_destroyer.rb#L198-L199): `permanent? ? @post.destroy! : @post.trash!(@user)`. The guards are what keep them apart.'
		]
	},
	tradeoff: {
		gain: [
			'You spend design time only where it matters: the one-way doors.',
			'Small decisions go fast, the team keeps moving.',
			'Seeing a spectrum gives you middle options, like a soft delete or a 5 minute wait, that make the risky step rare and late.'
		],
		cost: [
			'Every middle state is code to own: soft-deleted rows must be hidden from every query, and a scheduled job has to clean up author deletes.',
			'Soft-deleted data still exists. It still takes space, and it is still there when someone expects it gone.',
			'Misjudging a door is expensive: a field name in a public API looks like a detail until another team depends on it.'
		]
	},
	task: {
		prompt: 'You run a SaaS invoicing app. Classify each decision as one-way or two-way, and say what makes it so: (a) a feature flag that shows the new dashboard to some customers, (b) a nightly job that hard-deletes invoices older than 10 years, (c) renaming a field in the webhook payload customers receive, (d) changing the font of invoice PDFs.',
		hint: 'Ask: if we change our mind in a month, who else has to change, and what data stays behind?',
		answer: [
			'(a) **Two-way**, if the new dashboard writes nothing the old one cannot read. If it stores new data, turning the flag off leaves that data behind.',
			'(b) **One-way.** Deleted invoices do not come back. A middle option: soft-delete first, purge for real after a delay, so a wrong date in the job is caught before the data is gone.',
			'(c) **One-way-ish.** Customer code you cannot see depends on the old name. The middle option: send both fields for a while, announce the old one is going away, remove it later.',
			'(d) **Two-way** for new PDFs. Change it back any time. Invoices already sent keep the font they were made with, and nobody needs them changed.'
		]
	},
	quiz: [
		{
			q: 'Why does Discourse only allow permanently deleting a post that is already soft-deleted?',
			options: [
				'The database cannot delete a visible row',
				'Soft-deleted posts take more space, so they are cleaned first',
				'Visible posts are read only for admins',
				'So no post is lost in one step: a cheap, undoable step must come before the irreversible one'
			],
			answer: 3,
			why: 'The guard `return false if !post.deleted_at` puts a two-way door (soft delete) in front of the one-way door (destroy). A mistake at the first step can still be recovered.'
		},
		{
			q: 'A Discourse admin soft-deleted a post 2 minutes ago and now tries to delete it permanently. What happens?',
			options: [
				'It is refused: they must wait until 5 minutes have passed, or a different admin must do it',
				'It works, admins can always destroy posts',
				'The post is restored instead',
				'Discourse queues the destroy for 30 days'
			],
			answer: 0,
			why: '`PERMANENT_DELETE_TIMER` is 5 minutes and applies when the same admin deleted the post. The rule buys a pause, or a second pair of eyes, before the one-way door.'
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
			why: 'The setting\'s own description says permanently deleted data "cannot be recovered". Turning a flag off stops new effects. It does not undo old ones.'
		}
	],
	takeaway: 'Slow down on one-way doors, speed up on two-way doors, and put a cheap, undoable step in front of every irreversible one.',
	sources: [
		{ title: 'Jeff Bezos, letter to Amazon shareholders (Type 1 and Type 2 decisions)', url: 'https://www.sec.gov/Archives/edgar/data/1018724/000119312516530910/d168744dex991.htm' },
		{ title: 'Discourse, post_guardian.rb: can_permanently_delete_post?', url: `${DISCOURSE}/lib/guardian/post_guardian.rb#L250-L260` },
		{ title: 'Discourse, post_destroyer.rb: destroy_stubs, the job behind author deletes', url: `${DISCOURSE}/lib/post_destroyer.rb#L21-L47` },
		{ title: 'Discourse, server.en.yml: what can_permanently_delete does', url: `${DISCOURSE}/config/locales/server.en.yml#L2326` },
		{ title: 'Discourse, site_settings.yml: delete_removed_posts_after defaults to 24 hours', url: `${DISCOURSE}/config/site_settings.yml#L1512-L1516` }
	]
};
