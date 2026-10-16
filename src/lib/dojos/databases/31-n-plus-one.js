const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04';
const DJANGO = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const QM = `${RAILS}/activerecord/lib/active_record/relation/query_methods.rb`;
const QS = `${DJANGO}/docs/ref/models/querysets.txt`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'n-plus-one',
	part: 'Keeping it running',
	title: 'N+1 and the ORM',
	minutes: 10,
	hook: [
		'The orders page is instant on your laptop, with five test orders. In production, with fifty orders on the page, it takes two seconds. The log shows **the same `SELECT` fifty times**, each with a different id.',
		'The culprit is one innocent line in the template: `order.customer.name`. It looks like reading a field. With a lazy ORM, **it is a query**, run the first time each order touches its customer.',
		'One query for the list, plus one per row: **N+1**. Each query is fast. Fifty round trips are not. The fix is to tell the ORM up front what you will touch, so it loads it in **one join or one extra query**. Rails and Django both give you both ways, and each has its own cost.'
	],
	terms: [
		{ term: 'N+1 queries', def: 'One query loads N parent rows, then the code runs one more query per row to load a related object. N+1 queries where 1 or 2 would do.' },
		{ term: 'Lazy loading', def: 'The ORM loads an association only when the code first reads it. The default in Rails and Django. Fine for one record, a trap in a loop.' },
		{ term: 'Eager loading', def: 'Telling the ORM, before the query runs, which associations you will need, so it loads them for every row at once.' },
		{ term: 'Preload (separate query)', def: 'A second query, `WHERE id IN (...)` with the ids from the first one, then matching in memory. Rails `preload`, Django `prefetch_related`.' },
		{ term: 'Join-based eager load', def: 'One query with a `LEFT OUTER JOIN` that brings the related columns along. Rails `eager_load`, Django `select_related`.' },
		{ term: 'Strict loading', def: 'A mode where a lazy load raises an error instead of running a query. Rails `strict_loading`, Django `FETCH_RAISE`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['list["Book.limit(10)"] -->|"1 query"| db[("PostgreSQL")]'],
				highlight: ['list', 'db'],
				note: '**The list.** The Rails guide\'s example loads 10 books in one query. So far, so good: one round trip, ten rows.'
			},
			{
				add: ['loop["Loop: book.author.last_name"] -->|"10 queries, WHERE id = ?"| db'],
				highlight: ['loop'],
				note: '**The N.** Each `book.author` is a lazy load, so each one is its own query. The guide counts it: 1 + 10 = **11 queries**. With 1,000 books it is 1,001, and nothing in the code looks wrong.'
			},
			{
				add: ['pre["Book.includes(:author)"] -->|"2 queries, WHERE id IN (...)"| db'],
				highlight: ['pre'],
				note: '**Preload.** With `includes` and no condition on authors, Rails runs the books query, then one `SELECT authors.* ... WHERE authors.id IN (1,2,...,10)`. Two queries, whatever N is. This is what Django\'s `prefetch_related` does too.'
			},
			{
				add: ['ej["includes + where(authors: ...)"] -->|"1 query, LEFT OUTER JOIN"| db'],
				highlight: ['ej'],
				note: '**Join.** Add a condition on the authors table and `includes` switches to one `LEFT OUTER JOIN`, because the filter needs both tables in one query. Django\'s `select_related` always joins, and only follows foreign keys and one-to-one relations.'
			},
			{
				add: ['strict["strict_loading"] -.->|"lazy load raises"| loop'],
				highlight: ['strict'],
				note: '**Make it loud.** In strict loading mode, the lazy load in the loop raises `ActiveRecord::StrictLoadingViolationError` instead of running a query. The N+1 shows up in a test, not in production.'
			}
		]
	},
	example: {
		title: 'activerecord/lib/active_record/relation.rb: how includes picks a join or a second query',
		repo: 'rails/rails',
		url: `${RAILS}/activerecord/lib/active_record/relation.rb#L1296-L1527`,
		lang: 'ruby',
		code: `    # Returns true if relation needs eager loading.
    def eager_loading?
      @should_eager_load ||=
        eager_load_values.any? ||
        includes_values.any? && (joined_includes_values.any? || references_eager_loaded_tables?)
    end
…
    def preload_associations(records) # :nodoc:
      preload = preload_values
      preload += includes_values unless eager_loading?
      scope = strict_loading_value ? StrictLoadingScope : nil
      preload.each do |associations|
        ActiveRecord::Associations::Preloader.new(records: records, associations: associations, scope: scope).call
      end
    end
…
      def exec_main_query(async: false)
        if @none
          if async
            return FutureResult.wrap([])
          else
            return []
          end
        end

        skip_query_cache_if_necessary do
          if where_clause.contradiction?
            [].freeze
          elsif eager_loading?
            model.with_connection do |c|
              apply_join_dependency do |relation, join_dependency|
                if relation.null_relation?
                  [].freeze
                else
                  relation = join_dependency.apply_column_aliases(relation)
                  @_join_dependency = join_dependency
                  c.select_all(relation.arel, "#{model.name} Eager Load", async: async)
                end
              end
            end
          else
            model.with_connection do |c|
              model._query_by_sql(c, arel, async: async)
            end
          end
        end
      end`,
		notes: [
			'**One switch decides.** `eager_loading?` is true if you called `eager_load`, or if you called `includes` and the query also joins that association or references a table it does not join. Then `exec_main_query` builds one joined query, logged as `"Book Eager Load"`. Otherwise it runs the plain query and the associations wait for `preload_associations`.',
			'**The second query is an IN list.** `preload_associations` adds `includes_values` to the preload list unless the relation eager loads. The preloader then runs [`scope.where(destination_key_name => keys)`](' + RAILS + '/activerecord/lib/active_record/associations/preloader/association.rb#L42-L58): one query for all the ids it collected, which Rails turns into `WHERE ... IN (...)`.',
			'**Why not always join.** The [doc comment on `includes`](' + QM + '#L190-L209) says it: "a join can result in many rows that contain redundant data and it performs poorly at scale". Join books to authors and each author\'s columns repeat on every book row. Join a `has_many` and the parent rows multiply (day 4).',
			'**Django draws the same line.** Its [docs](' + QS + '#L1189-L1205) say `select_related` "is limited to single-valued relationships", while `prefetch_related` "does a separate lookup for each relationship, and does the \'joining\' in Python". They also [warn](' + QS + '#L1367-L1371) that a large queryset can make "a large \'IN\' clause".',
			'**Catch it, do not hunt it.** Rails [`strict_loading`](' + QM + '#L1392-L1400) makes a relation "raise an error if the record tries to lazily load an association". Django 6.1 adds [fetch modes](' + DJANGO + '/docs/topics/db/fetch-modes.txt#L84-L119): `FETCH_PEERS` loads a missing field for the whole batch, so most N+1 cases become "two queries without much effort", and `FETCH_RAISE` raises instead.'
		]
	},
	tradeoff: {
		gain: [
			'The page runs 2 or 3 queries whatever the number of rows, instead of one per row. The cost stops growing with N.',
			'You choose the shape: a join when you filter on the related table, a separate `IN` query when a join would repeat or multiply rows.',
			'Strict loading turns a slow page you find in production into an error you find in a test.'
		],
		cost: [
			'You must know, in the controller, what the template will touch. Change the template, and the eager load list goes stale in either direction.',
			'Eager loading something you never read still runs the query and builds the objects. Over-eager is waste too.',
			'A join over a "many" relation repeats the parent columns on every child row, and conditions on it filter the loaded children too: Rails warns that `includes(:posts).where(posts: { name: ... })` loads only the matching posts.',
			'A preload over thousands of parents sends thousands of ids in one `IN` list, which has a cost of its own.'
		]
	},
	task: {
		prompt: 'A Django view lists 20 orders. The template prints each order\'s `customer.name` (a foreign key) and loops over `order.items.all()` (a reverse foreign key, many items per order). Count the queries as written. Then fix the queryset, count again, and write the SQL of each query you expect.',
		hint: 'Count one query for the list, then one per order for each relation the template reads lazily. Then pick, per relation, the method that can follow it.',
		answer: [
			'As written: 1 query for the orders, 20 for the customers, 20 for the items. 41 queries.',
			'`customer` is single-valued, so `select_related("customer")` joins it into the first query: `SELECT orders.*, customers.* FROM orders JOIN customers ON ...`. No extra query for customers.',
			'`items` is a "many" relation, which `select_related` cannot follow. `prefetch_related("items")` runs one more query: `SELECT * FROM items WHERE order_id IN (...)` with the 20 order ids, and matches the items to orders in Python.',
			'Result: `Order.objects.select_related("customer").prefetch_related("items")[:20]` runs 2 queries instead of 41. Check it in a test with `assertNumQueries(2)`, or with the query count in your logs (day 30).'
		]
	},
	quiz: [
		{
			q: 'In Rails, how many queries does `Book.includes(:author).where(authors: { country: "FR" }).to_a` run?',
			options: [
				'One, with a LEFT OUTER JOIN, because the condition names the authors table',
				'Two: the books first, then the authors in one query with an IN list',
				'One per book, because a condition turns the eager load back into lazy loads',
				'Two: the authors matching the condition first, then their books with IN'
			],
			answer: 0,
			why: 'A hash condition on the included table references it, so `eager_loading?` becomes true and `includes` builds one joined query. Without the condition, the same `includes` would preload in two queries.'
		},
		{
			q: 'In Django, a page shows each pizza with its list of toppings (a many-to-many). Which call removes the N+1?',
			options: [
				'`select_related("toppings")`, which joins the toppings into the pizzas query',
				'`prefetch_related("toppings")`, which loads them in one more query with IN',
				'`only("toppings")`, which tells the query to fetch just the toppings column',
				'`defer("toppings")`, which delays every topping until the template has run'
			],
			answer: 1,
			why: 'The docs limit `select_related` to single-valued relationships: foreign key and one-to-one. A many-to-many needs `prefetch_related`, which does a separate lookup and joins in Python.'
		},
		{
			q: 'A record runs `user.strict_loading!(mode: :n_plus_one_only)`. Which line raises?',
			options: [
				'`user.address.city`, because any lazy load on a strict record raises',
				'`user.comments.to_a`, because a has_many is always an N+1 in this mode',
				'`user.comments.first.likes.to_a`, a lazy load across a loaded collection',
				'None of them: the mode only logs the N+1 queries it finds in the code'
			],
			answer: 2,
			why: 'In `:n_plus_one_only` mode, loading one association from one record is allowed. The Rails guide shows the error on `user.comments.first.likes.to_a`, the access that would repeat for every comment in a loop.'
		}
	],
	takeaway: 'A lazy association read in a loop is a query per row: say up front what you will touch, join single-valued relations, preload "many" ones, and turn on strict loading so the next N+1 fails a test.',
	sources: [
		{ title: 'Rails Guides, Active Record Query Interface: Eager Loading Associations', url: 'https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations' },
		{ title: 'Django docs, QuerySet API reference: prefetch_related()', url: 'https://docs.djangoproject.com/en/stable/ref/models/querysets/#prefetch-related' },
		{ title: 'Django docs, Fetch modes', url: 'https://docs.djangoproject.com/en/dev/topics/db/fetch-modes/' },
		{ title: 'Rails source, ActiveRecord::Relation', url: `${RAILS}/activerecord/lib/active_record/relation.rb` }
	]
};
