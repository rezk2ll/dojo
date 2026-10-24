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
		],
		steps: [
			{
				title: 'Trace the request',
				questions: [
					{ q: 'Alice is logged in and requests `/invoices/1042`. Does `requireLogin` let her through?', options: ['No: 1042 is not her invoice', 'Yes: she has a valid session', 'Only if she has the `billing` role', 'No: ids must match the session id'], answer: 1, why: '`requireLogin` only rejects requests without a valid session. Alice has one.' },
					{ q: 'Which value does the SQL query filter on?', options: ['Only `req.params.id`', '`req.params.id` and `req.user.id`', 'Only `req.user.id`', 'The session cookie'], answer: 0, why: 'The query is `WHERE id = $1` with `[req.params.id]`. The caller never appears in it.' },
					{ q: 'Which line knows who Alice is?', options: ['The `SELECT`', 'The `404` branch', '`requireLogin`, which sets `req.user`', '`res.json`'], answer: 2, why: 'Authentication happened in `requireLogin`. Nothing after it uses `req.user`.' },
					{ q: 'What does Alice get back?', options: ['A 404', 'A 403', 'Her own invoice 1041', 'Bob’s invoice 1042'], answer: 3, why: 'The row with id 1042 exists, so the handler returns it as JSON.' }
				]
			},
			{
				title: 'Name the hole',
				questions: [
					{ q: 'What kind of check is `requireLogin`?', options: ['Authentication', 'Authorization', 'RBAC', 'Rate limiting'], answer: 0, why: 'It checks who the caller is. It says nothing about what they may access.' },
					{ q: 'What is this bug called?', options: ['CSRF', 'An IDOR', 'SQL injection', 'A broken session'], answer: 1, why: 'The request carries an id and the server returns that object without checking the caller may access it: an insecure direct object reference.' },
					{ q: 'Would a role check such as "must have `billing`" close it?', options: ['Yes: only billing users would see invoices', 'Yes, if combined with a rate limit', 'No: every billing user could still read every invoice', 'No: roles only apply to admins'], answer: 2, why: 'RBAC works on roles. The missing check is at the object level: does this invoice belong to this caller?' },
					{ q: 'Which line in Discourse’s `can_edit_post?` is the same kind of check that is missing here?', options: ['`return true if is_admin?`', 'The locked-post `is_staff?` check', 'The final `false`', '`is_my_own?(post)`, which compares the owner with the caller'], answer: 3, why: '`is_my_own?` returns `obj.user_id == @user.id`. That is the owner check that stops an IDOR.' }
				]
			},
			{
				title: 'Scope the query',
				questions: [
					{ q: 'Which query fixes the handler?', options: ['`WHERE id = $1 AND owner_id = $2` with `[req.params.id, req.user.id]`', '`WHERE id = $1` and then compare `owner_id` in a log line', '`WHERE owner_id = $1` with `[req.params.id]`', '`WHERE id = $1 LIMIT 1`'], answer: 0, why: 'The lookup only searches the caller’s own invoices, what the OWASP IDOR Cheat Sheet calls "use datasets that users have access to".' },
					{ q: 'What is the Rails form of the same idea in the cheat sheet?', options: ['`Project.find(params[:id])`', '`@current_user.projects.find(params[:id])`', '`Project.where(id: params[:id]).first`', '`authorize! :read, Project`'], answer: 1, why: 'Going through `@current_user.projects` scopes the lookup to the caller.' },
					{ q: 'Alice now asks for 1042. What should she get?', options: ['403 Forbidden', '200 with an empty body', '404, the same as for an invoice that does not exist', '401 Unauthorized'], answer: 2, why: 'The cheat sheet says a scoped lookup can "map both cases to the same public response", so she cannot tell 1042 exists.' },
					{ q: 'What should happen to a request that matches no rule?', options: ['Allow it, and log it', 'Allow it for admins only', 'Ask the user to log in again', 'Deny it'], answer: 3, why: 'OWASP calls it deny-by-default. Discourse’s `can_edit_post?` ends with `false` for the same reason.' }
				]
			},
			{
				title: 'Test it',
				questions: [
					{ q: 'How does the cheat sheet say to test this?', options: ['Create users A and B, log in as A, and request B’s id', 'Scan the API with a fuzzer', 'Check that every route calls `requireLogin`', 'Log in as an admin and list all invoices'], answer: 0, why: 'Two users, each with their own object, and a cross request is the direct way to see the hole.' },
					{ q: 'Which actions should the test cover?', options: ['Only read', 'Read, update and delete', 'Only delete', 'Only the list endpoint'], answer: 1, why: 'Each route that takes an id needs its own owner check, so each one needs its own cross test.' },
					{ q: 'The team switches to UUIDs. Can the owner check go?', options: ['Yes: UUIDs cannot be guessed', 'Yes, if the UUIDs are encrypted', 'No: an obtained URL must still be blocked', 'Only for read routes'], answer: 2, why: 'The cheat sheet: "If attackers obtain URLs for unauthorized objects, the application should still block their access attempts." Random ids are defence in depth only.' },
					{ q: 'What did the Discourse directory bug have in common with this one?', options: ['A broken login', 'A missing CSRF token', 'A SQL injection', 'The server knew the caller but never checked access to the requested ids'], answer: 3, why: 'Discourse returned any `user_field_ids` asked for. The fix kept only fields the caller may see.' }
				]
			}
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
	lab: {
		minutes: 10,
		goal: 'See an unscoped lookup hand Alice Bob’s invoice, then scope it so read, update and delete all treat "not yours" like "not found".',
		steps: [
			'Make a database with two invoices: `mkdir -p ~/authz-lab && cd ~/authz-lab && sqlite3 shop.db "CREATE TABLE invoices (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, total INTEGER); INSERT INTO invoices VALUES (1041, 1, 120), (1042, 2, 990);"`. Alice is user 1, Bob is user 2.',
			'Run the task’s query as Alice asking for 1042: `sqlite3 shop.db "SELECT * FROM invoices WHERE id = 1042;"`.',
			'Scope it to Alice: `sqlite3 shop.db "SELECT count(*) FROM invoices WHERE id = 1042 AND owner_id = 1;"`, then the same for an id that does not exist, `9999`.',
			'Scope the writes the same way: `sqlite3 shop.db "UPDATE invoices SET total = 0 WHERE id = 1042 AND owner_id = 1; SELECT changes();"`, then `sqlite3 shop.db "DELETE FROM invoices WHERE id = 1042 AND owner_id = 1; SELECT changes();"`.',
			'Check that Bob’s row is untouched: `sqlite3 shop.db "SELECT * FROM invoices;"`.'
		],
		done: [
			'Step 2 prints `1042|2|990`: Bob’s invoice.',
			'Both scoped counts in step 3 print `0`, so the API answers 404 in both cases.',
			'Both writes print `0` changes, and the last query still shows `1042|2|990`.'
		],
		solution: [
			'The unscoped query never names the caller, so any logged-in user reads any id.',
			'Adding `AND owner_id = ?` with the session user’s id makes the database search only the caller’s rows. No row means 404, whether the invoice is someone else’s or does not exist.',
			'The same clause goes on every `UPDATE` and `DELETE`. Clean up with `rm -rf ~/authz-lab`.'
		]
	},
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
