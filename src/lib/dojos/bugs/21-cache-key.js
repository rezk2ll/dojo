const RAILS = 'https://github.com/rails/rails';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'cache-key',
	part: 'State and time',
	title: 'Two controllers, one counter',
	minutes: 10,
	hook: [
		'Rails controllers can limit how often a client calls them: `rate_limit to: 10, within: 5.minutes`. The counts live in the Rails cache. A controller with several limits gives each one a `name:`, a feature added a few days before this fix.',
		'Take two controllers that each declare `rate_limit to: 10, within: 5.minutes, name: "long-term"`. A client sends 6 requests to the first one, then 5 to the second. **Its 11th request gets `429 Too Many Requests`**, although neither controller has seen more than 6.'
	],
	terms: [
		{ term: 'Rate limit', def: 'A cap on how many requests one client can make in a time window. Over the cap, the server answers 429.' },
		{ term: 'store.increment', def: 'Adds 1 to the counter saved under a key in the cache, creates it if missing, and returns the new value.' },
		{ term: 'controller_path', def: 'The path name of a controller: `"sessions"` for `SessionsController`, `"admin/users"` for `Admin::UsersController`.' },
		{ term: 'Cache key', def: 'The string a value is stored under. Two pieces of code that build the same key read and write the same value.' }
	],
	bug: {
		title: 'Include controller path into cache keys for rate limiters (#52961)',
		repo: 'rails/rails',
		url: `${RAILS}/blob/cde7ffee3067820ddc67d5150b8bfad4183ec226/actionpack/lib/action_controller/metal/rate_limiting.rb#L51-L68`,
		fix: `${RAILS}/commit/9c41f5828cd4134469ee57a2a3b523a27f93a630`,
		lang: 'ruby',
		code: `  #     class SessionsController < ApplicationController
  #       rate_limit to: 3, within: 2.seconds, name: "short-term"
  #       rate_limit to: 10, within: 5.minutes, name: "long-term"
  #     end
  def rate_limit(to:, within:, by: -> { request.remote_ip }, with: -> { head :too_many_requests }, store: cache_store, name: controller_path, **options)
    before_action -> { rate_limiting(to: to, within: within, by: by, with: with, store: store, name: name) }, **options
  end
end

private
  def rate_limiting(to:, within:, by:, with:, store:, name:)
    count = store.increment("rate-limit:#{name}:#{instance_exec(&by)}", 1, expires_in: within)
    if count && count > to
      ActiveSupport::Notifications.instrument("rate_limit.action_controller", request: request) do
        instance_exec(&with)
      end
    end
  end`,
		lines: [5, 12],
		diff: `-      def rate_limit(to:, within:, by: -> { request.remote_ip }, with: -> { head :too_many_requests }, store: cache_store, name: controller_path, **options)
+      def rate_limit(to:, within:, by: -> { request.remote_ip }, with: -> { head :too_many_requests }, store: cache_store, name: nil, **options)
         before_action -> { rate_limiting(to: to, within: within, by: by, with: with, store: store, name: name) }, **options
 …
       def rate_limiting(to:, within:, by:, with:, store:, name:)
-        count = store.increment("rate-limit:#{name}:#{instance_exec(&by)}", 1, expires_in: within)
+        cache_key = ["rate-limit", controller_path, name, instance_exec(&by)].compact.join(":")
+        count = store.increment(cache_key, 1, expires_in: within)
         if count && count > to`,
		notes: [
			'**The key only holds the name.** The counter is stored under `"rate-limit:#{name}:#{ip}"`. With the default name, `controller_path`, the key differs per controller. With `name: "long-term"`, the key is `rate-limit:long-term:203.0.113.5` in every controller that picks that name.',
			'**The numbers.** Both controllers use `to: 10` and the same name. From 203.0.113.5, 6 requests to the first and 5 to the second all call `store.increment` on one key, which returns 1 up to 11. On the 11th, `count > to` is `11 > 10`, and the client gets 429 from a controller that counted 5 of its own.',
			'**The fix.** The key is built from its parts: `["rate-limit", controller_path, name, ...].compact.join(":")`. `controller_path` is now read in the controller that handles the request, so two controllers never share a key. The default name becomes `nil`, and `compact` drops it: `rate-limit:sessions:203.0.113.5`.',
			'**How it was found.** The author of the `name:` option noticed it after the merge. The [pull request](' + RAILS + '/pull/52961) says: "So if someone uses `name: "long-term"` rate limiter in `FooController` and `name: "long-term"` in `BarController`, they both will share the same key."'
		]
	},
	quiz: [
		{
			q: '`PostsController` and `CommentsController` both declare `rate_limit to: 10, within: 1.minute, name: "burst"`. What key does a request from 198.51.100.7 use in each?',
			options: [
				'rate-limit:posts:198.51.100.7 and rate-limit:comments:198.51.100.7',
				'rate-limit:burst:198.51.100.7 in both controllers',
				'rate-limit:posts:burst and rate-limit:comments:burst',
				'A random key per request, so nothing is shared'
			],
			answer: 1,
			why: 'The buggy key is `"rate-limit:#{name}:#{ip}"`. The name and the IP are the same in both controllers, so both build `rate-limit:burst:198.51.100.7`.'
		},
		{
			q: 'Both controllers use `to: 10` and the shared name. A client sends 4 requests to Posts, then 7 to Comments. Which request is refused first?',
			options: ['None, each controller stays under 10', 'The 7th request to Comments', 'The 10th request to Posts', 'The 1st request to Comments'],
			answer: 1,
			why: 'The shared counter reaches 11 on the 11th request overall, which is the 7th to Comments. `11 > 10`, so it gets 429.'
		},
		{
			q: 'You review code that stores values in a shared cache. What do you check about the key?',
			options: [
				'That it is shorter than the maximum key size of the store',
				'That it holds every input that changes the stored value',
				'That it uses only lowercase letters and colons as separators',
				'That it is built once at boot and reused for every request'
			],
			answer: 1,
			why: 'If two callers that should have separate values build the same key, they read and change each other’s value. Here the controller was missing from the key.'
		}
	],
	takeaway: 'List what makes a cached value different, here the controller, the limit name and the client, and put each of them in the key. A name the caller picks is not unique unless the code makes it so.',
	sources: [
		{ title: 'rails pull request #52961', url: `${RAILS}/pull/52961` },
		{ title: 'rails pull request #52960, which added name:', url: `${RAILS}/pull/52960` }
	]
};
