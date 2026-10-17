const DC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const POST_GUARDIAN = `${DC}/lib/guardian/post_guardian.rb`;
const GUARDIAN = `${DC}/lib/guardian.rb`;
const ENSURE = `${DC}/lib/guardian/ensure_magic.rb`;
const POSTS = `${DC}/app/controllers/posts_controller.rb`;
const ADVISORY = 'https://github.com/discourse/discourse/security/advisories/GHSA-crxf-p6jm-vpgw';
const FIX = 'https://github.com/discourse/discourse/commit/2b38af5b2241fb9c7578967cb30607d3382d7e1e';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'authorization',
	part: 'Identity',
	title: 'Authorization: who may do what',
	minutes: 10,
	hook: [
		'On 26 February 2026, Discourse published advisory GHSA-crxf-p6jm-vpgw, rated high (CVSS 7.5). Its user directory answered `GET /directory_items.json?period=all&user_field_ids=<id>` for anyone, including anonymous visitors.',
		'The `user_field_ids` parameter accepted any field id. A field an admin had marked private, such as a phone number or an address, came back for every user in the directory. The advisory: "This enables bulk exfiltration of private user data".',
		'Nothing was wrong with the login. The server knew who was asking. It never checked whether that person was allowed to read field 7.'
	],
	terms: [
		{ term: 'Authentication', def: 'Checking who the caller is: a password, a session cookie, a token. The answer is a user id, or "anonymous".' },
		{ term: 'Authorization', def: 'Checking whether that caller may perform this action on this resource. It runs after authentication, on every request.' },
		{ term: 'RBAC', def: 'Role-based access control: permissions are attached to roles such as `admin` or `moderator`, and a user gets the permissions of their roles.' },
		{ term: 'IDOR', def: 'Insecure direct object reference: the request carries an id (`/invoices/1042`, `user_field_ids=7`) and the server returns that object without checking that the caller may access it.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["GET /directory_items.json?user_field_ids=7, no login"] --> ctl["DirectoryItemsController#index"]'],
				highlight: ['req'],
				note: 'The request needs no session. The visitor puts the id of a private user field in the query string, here 7. The controller reads the ids as integers with `map(&:to_i)`, so the visitor can try each number in turn.'
			},
			{
				add: ['ctl -->|"before the fix: every id is used"| leak["Field 7 of every user in the response"]'],
				highlight: ['leak'],
				note: 'Before the fix, the controller split the parameter on `|` and passed each id to the serializer. No line asked whether the caller may see field 7. The JSON listed that field for every user in the directory.'
			},
			{
				add: ['ctl -->|"after the fix"| filter["ids & allowed ids: all fields for staff, public fields for others"]', 'filter --> ok["Only public fields in the response"]'],
				highlight: ['filter', 'ok'],
				note: 'The fix commit builds `allowed_field_ids`: every field for staff, `UserField.public_fields` for everyone else. It intersects the requested ids with that list using Ruby `&`. Field 7 drops out for an anonymous visitor.'
			},
			{
				add: ['edit["PUT /posts/42 by user 9"] --> guard["guardian.ensure_can_edit!(post)"]', 'guard -->|"can_edit_post? is false"| deny["Discourse::InvalidAccess: HTTP 403"]'],
				highlight: ['guard', 'deny'],
				note: 'The same rule for writes. `PostsController#update` loads post 42 and calls `guardian.ensure_can_edit!(post)` before any change. If `can_edit_post?` returns false, the call raises `Discourse::InvalidAccess`, and the application controller answers with a 403.'
			}
		]
	},
	example: {
		title: 'lib/guardian/post_guardian.rb: can_edit_post?, one object at a time',
		repo: 'discourse/discourse',
		url: `${POST_GUARDIAN}#L156-L206`,
		lang: 'ruby',
		code: `  def can_edit_post?(post)
    return false if Discourse.static_doc_topic_ids.include?(post.topic_id) && !is_admin?

    return true if is_admin?

    # Must be staff to edit a locked post
    return false if post.locked? && !is_staff?

    # Staff in edit groups skip visibility (e.g. deleted topics); non-staff must pass it
    if is_in_edit_post_groups?
      return can_create_post?(post.topic) if is_staff?
      return can_create_post?(post.topic) if can_see_post_topic?(post)
      return false
    end
    return false if !can_see_post_topic?(post)
    return can_create_post?(post.topic) if is_category_group_moderator?(post.topic&.category)

    return false if post.topic&.archived? || post.user_deleted || post.deleted_at
…
    return false if !trusted_with_post_edits?

    if is_my_own?(post)
      return false if !is_staff? && !visible_post_types.include?(post.post_type)
      return false if @user.silenced?

      return can_edit_hidden_post?(post) if post.hidden?

      if post.is_first_post? && post.topic.category_allows_unlimited_owner_edits_on_first_post?
        return true
      end

      return !post.edit_time_limit_expired?(@user)
    end

    if post.is_category_description?
      return true if can_edit_category_description?(post.topic.category)
    end

    false
  end`,
		notes: [
			'Lines 4 and 7 are role checks: `is_admin?` returns true at once, and a locked post needs `is_staff?`. In Discourse, staff means admins and moderators. These two lines are RBAC.',
			'Line 15 is the object-level check: `can_see_post_topic?(post)` asks whether this user may read the topic of this post. A user who cannot read a private category cannot edit a post in it, even with its id.',
			'Line 22 compares the post\'s owner with the caller. [`is_my_own?`](' + GUARDIAN + '#L690-L696) returns `obj.user_id == @user.id`, and false for an anonymous user. This check stops an IDOR on `/posts/42`.',
			'The last line returns `false`. A post that matched no rule above cannot be edited. The OWASP Authorization Cheat Sheet calls this "deny-by-default".',
			'The controller calls this through [`ensure_can_edit!`](' + ENSURE + '#L5-L18): `EnsureMagic` maps `ensure_X!` to `X?` and raises `Discourse::InvalidAccess` when it returns false. `PostsController#update` makes that call at line 214, before it reads `params[:post][:raw]`.'
		]
	},
	tradeoff: {
		gain: [
			'The rules for posts sit in one module, `PostGuardian`. A reviewer reads `can_edit_post?` once instead of hunting for checks in every controller action.',
			'Rules can mix roles and objects: `is_admin?`, `is_my_own?(post)` and `can_see_post_topic?(post)` sit in the same method.',
			'A controller needs one line, `guardian.ensure_can_edit!(post)`, and a failed check always gives the same 403.'
		],
		cost: [
			'A central class does not help an action that never calls it. The directory endpoint built its own field list and skipped the visibility rule used by `Guardian#allowed_user_field_ids`.',
			'In `Guardian#can_do?`, a logged-in user passes when no `can_edit_<class>?` method exists for the object\'s class. A new model is editable by any logged-in user until someone writes its rule.',
			'Each object check can cost a query, such as `can_see_topic?` for every post. Discourse memoizes it per topic in `@can_see_post_topic`.'
		]
	},
	task: {
		prompt: 'Find the hole and write the fix. A Node API serves invoices: `app.get(\'/invoices/:id\', requireLogin, async (req, res) => { const rows = await db.query(\'SELECT * FROM invoices WHERE id = $1\', [req.params.id]); if (!rows.length) return res.sendStatus(404); res.json(rows[0]); })`. `requireLogin` rejects requests without a valid session and sets `req.user`. Alice owns invoice 1041. Bob owns 1042.',
		hint: 'Log in as Alice and request `/invoices/1042`. Which line knows who Alice is, and which line uses it?',
		answer: [
			'The hole: `requireLogin` checks authentication only. The query never uses `req.user`, so Alice gets Bob\'s invoice 1042 by changing one digit: an IDOR.',
			'The fix: scope the lookup to the caller. `SELECT * FROM invoices WHERE id = $1 AND owner_id = $2` with `[req.params.id, req.user.id]`. The OWASP IDOR Cheat Sheet calls it "use datasets that users have access to" and shows `@current_user.projects.find(params[:id])` in Rails.',
			'Keep the 404 for both "no such invoice" and "not yours". The cheat sheet says a scoped lookup can "map both cases to the same public response", so Alice cannot tell that 1042 exists.',
			'Test it the way the cheat sheet describes: create users A and B, each with an invoice, log in as A and request B\'s id for read, update and delete. Switching to UUIDs makes guessing harder, but the check is still needed when a link leaks.'
		]
	},
	quiz: [
		{
			q: 'A logged-in user changes `/invoices/1041` to `/invoices/1042` and sees someone else\'s invoice. What is missing?',
			options: [
				'Authentication: the session cookie is not verified on this route',
				'An object-level check that invoice 1042 belongs to the caller',
				'A role check: only the `billing` role should list invoices',
				'Rate limiting: the user should not be able to try many ids'
			],
			answer: 1,
			why: 'The user is logged in, so authentication worked. The server returned the object named by the id without comparing its owner with the caller. A role check would still let every billing user read every invoice, and a rate limit only slows the guessing.'
		},
		{
			q: 'How does the Discourse fix for GHSA-crxf-p6jm-vpgw decide which `user_field_ids` to keep?',
			options: [
				'It rejects the whole request with 403 when any id is private',
				'It keeps only ids that are in the requested page of users',
				'It intersects them with all fields for staff, public fields for others',
				'It requires a login before the directory endpoint can be called'
			],
			answer: 2,
			why: 'The commit builds `allowed_field_ids` from `UserField.pluck(:id)` for staff and `UserField.public_fields.pluck(:id)` for everyone else, then applies `& allowed_field_ids`. Anonymous visitors can still use the directory, they just get public fields only.'
		},
		{
			q: 'A team replaces numeric invoice ids with random UUIDs and removes the owner check "since nobody can guess them". What does the OWASP IDOR Cheat Sheet say?',
			options: [
				'Nothing more is needed, because random ids cannot be guessed',
				'Nothing more is needed if the UUIDs are also encrypted',
				'Nothing more is needed if the ids never appear in a URL',
				'Keep the check: an obtained URL must still be blocked'
			],
			answer: 3,
			why: 'The cheat sheet: "If attackers obtain URLs for unauthorized objects, the application should still block their access attempts." It lists random ids as a defence-in-depth measure only. It also says "Avoid encrypting identifiers".'
		}
	],
	recall: {
		q: 'In Discourse\'s `can_edit_post?`, which call stops user 9 from editing a post written by user 12?',
		a: '`is_my_own?(post)`, which compares `post.user_id` with the caller\'s id. If it is false and no other rule matches, the method ends with `false` and `ensure_can_edit!` raises a 403.'
	},
	sources: [
		{ title: 'Discourse advisory GHSA-crxf-p6jm-vpgw (CVE-2026-26265), IDOR in the directory items endpoint', url: ADVISORY },
		{ title: 'Discourse fix commit 2b38af5, filter private user fields in directory items endpoint', url: FIX },
		{ title: 'Discourse source, PostsController#update calling ensure_can_edit!', url: `${POSTS}#L198-L214` },
		{ title: 'OWASP Top 10 2021, A01 Broken Access Control', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/' },
		{ title: 'OWASP Authorization Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html' },
		{ title: 'OWASP Insecure Direct Object Reference Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html' }
	]
};
