const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04';
const SP = RAILS + '/actionpack/lib/action_controller/metal/strong_parameters.rb';
const GH_POST = 'https://github.blog/news-insights/the-library/public-key-security-vulnerability-and-mitigation/';
const ZOD = 'https://github.com/colinhacks/zod/blob/680d19f7d1e042e55934209caeb79bc843b94f44/packages/docs/content/api.mdx';
const OWASP = 'https://github.com/OWASP/CheatSheetSeries/blob/1a78ae3e443cef156e947f87e892efbcc62876ee/cheatsheets';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'input-validation',
	part: 'Input and output',
	title: 'Validating input at the boundary',
	minutes: 10,
	hook: [
		'On 4 March 2012 at 8:49 a.m. Pacific Time, a GitHub user added his own public key to the `rails` organization through GitHub’s public key update form. He then pushed a new file to the Rails project to show the hole. GitHub rolled out a fix at 9:53 a.m. and found three compromised accounts.',
		'Tom Preston-Werner wrote [the post](' + GH_POST + ') that evening: "The root cause of the vulnerability was a failure to properly check incoming form parameters, a problem known as the mass-assignment vulnerability."',
		'On 21 March 2012 DHH announced strong parameters on the Rails blog, to "move mass-assignment protection out of the model and into the controller where it belongs". On 30 March, Rails 3.2.3 set `config.active_record.whitelist_attributes` to true in new apps. Rails 4.0 shipped strong parameters by default on 25 June 2013.',
		'The fix works the same in any stack. The handler lists the fields it accepts, parses the body against that list once, and passes only the parsed result to the model.'
	],
	terms: [
		{ term: 'Mass assignment', def: 'Passing a whole request hash to a model in one call, as in `Person.create(params[:person])`. Every key in the request sets the attribute of the same name.' },
		{ term: 'Allow-list', def: 'The list of fields and values the code accepts. The code drops or rejects every other field. The Rails security guide calls it a "permitted list".' },
		{ term: 'Deny-list', def: 'A list of known bad fields or values to block, such as `admin`. Everything not on it gets through. The Rails guide calls it a "restricted list".' },
		{ term: 'Schema', def: 'A declaration of the fields, types and length limits a request may carry, such as a zod `z.strictObject({ ... })`. Parsing the body against it returns a typed value or an error.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['form["Form shows name and email"] --> req["POST /people"]', 'req --> create["Person.create(params[:person])"]', 'create --> row["people row: name, email, admin"]'],
				highlight: ['form', 'create'],
				note: 'The Rails Action Controller guide uses this example. The form has two fields, and the `people` table also has a boolean `admin` column. The handler passes the whole `params[:person]` hash to the model.'
			},
			{
				add: ['extra["Request adds person[admin]=1"] --> req', 'row --> admin["admin = true"]'],
				highlight: ['extra', 'admin'],
				note: 'The client controls every field in the body, including fields the form never showed. The guide: "A malicious user could modify the HTML form to send this value and make themselves an admin without permission." Without a list, `create` sets `admin` too.'
			},
			{
				add: ['req --> deny["Deny-list: drop admin, keep the rest"]', 'deny --> role["Next migration adds role: not on the list, gets through"]'],
				highlight: ['deny', 'role'],
				note: 'A deny-list must name every sensitive column, including the ones added next year. The Rails security guide: "Permitted lists are also a good approach against the human factor of forgetting something in the restricted list."'
			},
			{
				add: ['req --> expect["params.expect(person: [:name, :email])"]', 'expect --> clean["New Parameters: name, email only, permitted: true"]', 'clean --> ok["Person.create(clean)"]'],
				highlight: ['expect', 'clean', 'ok'],
				note: 'The allow-list version names the two form fields. `expect` builds a new object with only those keys, so `admin` and `role` never reach the model. If `person` is missing, Rails answers `400 Bad Request`.'
			},
			{
				add: ['create --> err["ActiveModel::ForbiddenAttributesError"]'],
				highlight: ['err'],
				note: 'Since Rails 4.0, the line from step 1 raises an error instead of saving. Active Model checks `permitted?` on the hash and raises `ForbiddenAttributesError` when it returns false.'
			}
		]
	},
	example: {
		title: 'strong_parameters.rb: permit_filters, the method behind permit and expect',
		repo: 'rails/rails',
		url: `${SP}#L1189-L1206`,
		lang: 'ruby',
		code: `      def permit_filters(filters, on_unpermitted: nil, explicit_arrays: true)
        params = self.class.new

        filters.flatten.each do |filter|
          case filter
          when Symbol, String
            # Declaration [:name, "age"]
            permitted_scalar_filter(params, filter)
          when Hash
            # Declaration [{ person: ... }]
            hash_filter(params, filter, on_unpermitted:, explicit_arrays:)
          end
        end

        unpermitted_parameters!(params, on_unpermitted:)

        params.permit!
      end`,
		notes: [
			'Line 2 creates a new, empty `Parameters`. Lines 4 to 13 copy into it only the keys that a filter names, so a key like `admin` that no filter names cannot appear in the result.',
			'Line 8 handles a plain key such as `:email`. It copies the value only when its type is in [`PERMITTED_SCALAR_TYPES`](' + SP + '#L1391-L1405), such as String, Numeric, Date or an uploaded file. A hash sent as `email` is dropped.',
			'Line 15 handles the keys that were left out. `permit` passes the class setting `action_on_unpermitted_parameters`, and with `:raise` this line raises "found unpermitted parameters: :a, :b". `expect` calls `permit_filters(filters)` with the default `nil`, so it drops them with no log.',
			'Line 17 marks the new object as permitted. [Active Model](' + RAILS + '/activemodel/lib/active_model/forbidden_attributes_protection.rb#L27-L34) raises `ForbiddenAttributesError` only for objects that answer `permitted?` with false. A plain Ruby `Hash`, such as the result of `JSON.parse`, passes through unchecked.'
		]
	},
	tradeoff: {
		gain: [
			'A new column like `role` stays out of every form until someone adds it to the `expect` list in the controller.',
			'`z.strictObject` reports an `unrecognized_keys` issue for an unknown field, and Rails `permit` with `:raise` throws `UnpermittedParameters`. A client that sends a wrong field name fails in tests.',
			'After parsing, the handler holds one typed value. Zod’s `result.data` has only the declared keys, each within its `.max()` limit, and later code does not check the strings again.'
		],
		cost: [
			'Each new form field needs a second edit, in the controller list or the schema. In production, Rails drops a field missing from the list with no log: the source gives the default as "`:log` in test and development environments, `false` otherwise".',
			'Strict rejection breaks old clients that still send a field you removed. `z.object` strips unknown keys instead of rejecting them, so you choose the mode per endpoint.',
			'The schema checks shape, and the handler still has to check rights. The OWASP Input Validation Cheat Sheet: "a valid account identifier does not mean the caller may access that account."'
		]
	},
	task: {
		prompt: 'A SvelteKit endpoint `PATCH /api/profile` does `const body = await request.json()`, loads the current user, runs `Object.assign(user, body)` and saves. The `users` table has `name`, `email`, `bio`, `role` and `email_verified`. The form shows `name`, `email` and `bio`. Write the allow-list version with zod: name 1 to 100 characters, bio at most 2000, a valid email, unknown fields rejected with a 400.',
		hint: 'Write one `z.strictObject` with the three form fields, then call `safeParse` on the body at the top of the handler. Pass only `result.data` to the model.',
		answer: [
			'The schema: `const ProfileUpdate = z.strictObject({ name: z.string().min(1).max(100), email: z.email().max(254), bio: z.string().max(2000).optional() })`. The 254 limit on email is a choice of this answer.',
			'In the handler: `const result = ProfileUpdate.safeParse(await request.json())`, then `if (!result.success) return json({ issues: result.error.issues }, { status: 400 })`, then `Object.assign(user, result.data)` and save.',
			'The old line copied every key, so a body with `"role": "admin"` or `"email_verified": true` set those columns. With the strict schema the same body returns 400 with an `unrecognized_keys` issue, and nothing is saved.',
			'The body size has a limit before `request.json()` runs: `adapter-node` reads `BODY_SIZE_LIMIT`, which "Defaults to 512kb". In Rails the same list is `params.expect(user: [:name, :email, :bio])`.'
		],
		steps: [
			{
				title: 'Spot the hole',
				questions: [
					{ q: 'What does `Object.assign(user, body)` copy?', options: ['Only the keys the form shows', 'Only keys `user` already has', 'Every own key of `body`', 'Only string values'], answer: 2, why: '`Object.assign` copies every own key of the source, whether or not the target had it.' },
					{ q: 'A client sends `{ "role": "admin" }`. What happens?', options: ['The `role` column is set to `admin`', 'SvelteKit drops it, since the form lacks it', 'The save fails with a type error', 'Nothing: `role` is read only'], answer: 0, why: 'The client controls every field in the body, including fields the form never showed.' },
					{ q: 'What is this kind of hole called?', options: ['Path traversal', 'Mass assignment', 'Unsafe deserialization', 'Cross-site request forgery'], answer: 1, why: 'Passing a whole request hash to a model in one call is mass assignment. GitHub’s 2012 incident came from it.' },
					{ q: 'Why not just delete `role` and `email_verified` from `body`?', options: ['It is slower than a schema', 'JavaScript cannot delete keys from parsed JSON', 'Zod forbids it', 'A deny-list misses the next column a migration adds'], answer: 3, why: 'A deny-list must name every sensitive column, including next year’s. An allow-list keeps them all out by default.' }
				]
			},
			{
				title: 'List the fields',
				questions: [
					{ q: 'Which fields go in the allow-list?', options: ['`name`, `email`, `bio`', '`name`, `email`, `bio`, `role`', 'Every column of `users`', '`role` and `email_verified`'], answer: 0, why: 'The list is the fields the form shows. Everything else stays out.' },
					{ q: 'What limit goes on `name`?', options: ['At most 2000 characters', '1 to 100 characters', 'At most 254 characters', 'No limit, the database checks it'], answer: 1, why: 'The prompt asks for a name of 1 to 100 characters: `z.string().min(1).max(100)`.' },
					{ q: 'Which zod 4 schema checks the email format?', options: ['`z.string().includes("@")`', '`z.string().max(254)`', '`z.email()`', '`z.url()`'], answer: 2, why: '`z.email()` validates the format. The answer adds `.max(254)`, which is its own choice.' },
					{ q: 'Where does `bio` stand?', options: ['Required, 1 to 2000 characters', 'Required, any length', 'Removed, since it is free text', 'Optional, at most 2000 characters'], answer: 3, why: '`z.string().max(2000).optional()` lets the form leave it out and caps its size.' }
				]
			},
			{
				title: 'Pick the object mode',
				questions: [
					{ q: 'Unknown fields must be rejected with a 400. Which zod builder?', options: ['`z.object`', '`z.strictObject`', '`z.looseObject`', '`z.record`'], answer: 1, why: '`z.strictObject` reports an `unrecognized_keys` issue for any field it does not declare.' },
					{ q: 'What would plain `z.object` do with `"role": "admin"`?', options: ['Strip it from the result', 'Throw an `unrecognized_keys` error', 'Keep it in the result', 'Throw because `role` has no type'], answer: 0, why: 'The zod docs: "By default, unrecognized keys are *stripped* from the parsed result".' },
					{ q: 'And `z.looseObject`?', options: ['Strips it', 'Throws on it', 'Converts it to a string', 'Keeps it in the result'], answer: 3, why: '`z.looseObject` passes unknown keys through, so `role` would reach the model.' },
					{ q: 'Why might another endpoint pick `z.object` over strict?', options: ['It runs faster', 'It checks types more strictly', 'Old clients still send a removed field, and strict mode would break them', 'It also checks the user’s rights'], answer: 2, why: 'Strict rejection breaks old clients. You choose the mode per endpoint.' }
				]
			},
			{
				title: 'Wire it into the handler',
				questions: [
					{ q: 'Which call parses the body without throwing?', options: ['`ProfileUpdate.safeParse(await request.json())`', '`ProfileUpdate.parse(request)`', '`JSON.parse(ProfileUpdate)`', '`ProfileUpdate.check(body)`'], answer: 0, why: '`safeParse` returns `{ success, data }` or `{ success: false, error }`, so the handler can answer 400.' },
					{ q: 'What do you pass to `Object.assign`?', options: ['`body`', '`result.data`', '`result`', '`{ ...body, ...result.data }`'], answer: 1, why: '`result.data` holds only the declared keys, each within its limit.' },
					{ q: 'A body with `"email_verified": true` arrives. What does the client get?', options: ['200, and the flag is saved', '200, and the flag is ignored', '500, since the schema throws', '400 with an `unrecognized_keys` issue, nothing saved'], answer: 3, why: 'The strict schema rejects the unknown key, and the handler returns before saving.' },
					{ q: 'What does the schema still not check?', options: ['The length of `bio`', 'The format of `email`', 'Whether the caller may change this account', 'Unknown fields'], answer: 2, why: 'OWASP: "a valid account identifier does not mean the caller may access that account." The handler checks rights separately.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A Rails 4.0 or later controller runs `User.create(params[:user])` with no `permit` or `expect`. What happens?',
			options: [
				'It raises `ActiveModel::ForbiddenAttributesError`',
				'It creates the user and sets every attribute in the request',
				'It creates the user with only the attributes the form showed',
				'It drops unknown keys and logs them at DEBUG level'
			],
			answer: 0,
			why: '`params[:user]` is an `ActionController::Parameters` object that answers `permitted?` with false. Active Model checks that before assigning and raises `ForbiddenAttributesError`. Rails does not know which fields the form showed.'
		},
		{
			q: 'A Node handler does `const { admin, ...rest } = body; Object.assign(user, rest)`. A month later a migration adds a `role` column. What does a body with `"role": "owner"` do?',
			options: [
				'It is rejected, because `rest` only keeps keys from the form',
				'It throws, because `role` did not exist when the code was written',
				'It sets `role` to `"owner"`, because the code only drops `admin`',
				'It is ignored, because `Object.assign` skips keys the object lacks'
			],
			answer: 2,
			why: 'The destructuring is a deny-list: it removes the one key it names and keeps the rest. `Object.assign` copies every own key of `rest` onto `user`, whether or not `user` had it. Only an allow-list of the form fields keeps `role` out.'
		},
		{
			q: 'With zod 4, what does `z.object({ name: z.string() }).parse({ name: "Ada", role: "admin" })` return?',
			options: [
				'It throws a `ZodError` with an `unrecognized_keys` issue',
				'`{ name: "Ada", role: "admin" }`, with both keys kept',
				'It throws because `role` has no declared type',
				'`{ name: "Ada" }`, with `role` stripped'
			],
			answer: 3,
			why: 'The zod docs: "By default, unrecognized keys are *stripped* from the parsed result". `z.strictObject` throws on unknown keys, and `z.looseObject` keeps them.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'See `Object.assign` set a column the form never showed, then block it with a strict zod schema.',
		steps: [
			'Set up: `mkdir -p ~/zod-lab && cd ~/zod-lab && npm init -y && npm install zod@4`.',
			'Mass-assign a body: `node -e \'const user = { name: "Ada", role: "user", email_verified: false }; Object.assign(user, JSON.parse(process.argv[1])); console.log(user)\' \'{"name":"Eve","role":"admin","email_verified":true}\'`.',
			'Write `profile.mjs`: import `z` from `zod`, declare `ProfileUpdate` with `z.strictObject` (name 1 to 100, email, bio at most 2000 and optional), run `safeParse` on `JSON.parse(process.argv[2])`, and print `result.data` or the issue codes.',
			'Try three bodies: `node profile.mjs \'{"name":"Eve","email":"eve@example.com"}\'`, then the same with `"role":"admin"` added, then `\'{"name":"","email":"nope"}\'`.',
			'Swap `z.strictObject` for `z.object` and run the `role` body again.'
		],
		done: [
			'Step 2 prints `role: \'admin\'` and `email_verified: true`.',
			'The first body prints `{ name: \'Eve\', email: \'eve@example.com\' }`.',
			'The `role` body prints `[ \'unrecognized_keys\' ]`, and the third prints `[ \'too_small\', \'invalid_format\' ]`.',
			'With `z.object`, the `role` body passes and `role` is gone from the result.'
		],
		solution: [
			'`import { z } from \'zod\';`',
			'`const ProfileUpdate = z.strictObject({ name: z.string().min(1).max(100), email: z.email().max(254), bio: z.string().max(2000).optional() });`',
			'`const result = ProfileUpdate.safeParse(JSON.parse(process.argv[2]));`',
			'`console.log(result.success ? result.data : result.error.issues.map((i) => i.code));`'
		]
	},
	recall: {
		q: 'In Rails, which call turns `params` into something a model accepts, and what does Active Model raise without it?',
		a: '`params.expect(user: [:name, :email])` (or `permit`) builds a new `Parameters` with only the listed keys and marks it permitted. Without it, `User.create(params[:user])` raises `ActiveModel::ForbiddenAttributesError`.'
	},
	sources: [
		{ title: 'GitHub Blog, Public Key Security Vulnerability and Mitigation (4 March 2012)', url: GH_POST },
		{ title: 'Rails blog, Strong parameters: Dealing with mass assignment in the controller instead of the model (21 March 2012)', url: 'https://rubyonrails.org/2012/3/21/strong-parameters' },
		{ title: 'Rails blog, Rails 3.2.3 has been released (30 March 2012)', url: 'https://rubyonrails.org/2012/3/30/ann-rails-3-2-3-has-been-released' },
		{ title: 'Rails blog, Rails 4.0: Final version released (25 June 2013)', url: 'https://rubyonrails.org/2013/6/25/Rails-4-0-final' },
		{ title: 'Rails guides, Action Controller Overview: Securing Submitted Parameters', url: RAILS + '/guides/source/action_controller_overview.md#L796-L823' },
		{ title: 'Rails guides, Securing Rails Applications: Permitted Lists Versus Restricted Lists', url: RAILS + '/guides/source/security.md#L888-L900' },
		{ title: 'rails/rails, actionpack strong_parameters.rb', url: SP },
		{ title: 'Zod docs, z.object, z.strictObject and z.looseObject', url: ZOD + '#L1224-L1255' },
		{ title: 'SvelteKit docs, adapter-node BODY_SIZE_LIMIT', url: 'https://github.com/sveltejs/kit/blob/dd2d9754840d013b882aa45c2019e68b84e6b1af/documentation/docs/25-build-and-deploy/40-adapter-node.md#L140-L142' },
		{ title: 'OWASP Input Validation Cheat Sheet', url: OWASP + '/Input_Validation_Cheat_Sheet.md' },
		{ title: 'OWASP Mass Assignment Cheat Sheet', url: OWASP + '/Mass_Assignment_Cheat_Sheet.md' }
	]
};
