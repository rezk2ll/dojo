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
		'The orders page loads at once on your laptop, with five test orders. In production, with fifty orders on the page, it takes two seconds. The log shows **the same `SELECT` fifty times**, each with a different id.',
		'The queries come from one line in the template: `order.customer.name`. It looks like reading a field. With a lazy ORM, it runs a query the first time each order reads its customer.',
		'One query for the list plus one per row is called **N+1**. Each query is fast, but the page waits for fifty of them in a row. The fix is to tell the ORM before the query which associations you will read, so it loads them in one join or one extra query. Rails and Django offer both, and each has its own cost.'
	],
	terms: [
		{ term: 'N+1 queries', def: 'One query loads N parent rows, then the code runs one more query per row to load a related object. N+1 queries where 1 or 2 would do.' },
		{ term: 'Lazy loading', def: 'The ORM loads an association only when the code first reads it. Rails and Django do this by default. In a loop over N rows, it runs N queries.' },
		{ term: 'Preload (separate query)', def: 'A second query, `WHERE id IN (...)` with the ids from the first one, then matching in memory. Rails `preload`, Django `prefetch_related`.' },
		{ term: 'Join-based eager load', def: 'One query with a `LEFT OUTER JOIN` that brings the related columns along. Rails `eager_load`, Django `select_related`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['list["Book.limit(10)"] -->|"1 query"| db[("PostgreSQL")]'],
				highlight: ['list', 'db'],
				note: 'The Rails guide\'s example loads 10 books in one query: one round trip, ten rows.'
			},
			{
				add: ['loop["Loop: book.author.last_name"] -->|"10 queries, WHERE id = ?"| db'],
				highlight: ['loop'],
				note: 'Each `book.author` is a lazy load, so each one runs its own query. The guide counts **1 + 10 = 11 queries**. With 1,000 books it is 1,001, and nothing in the code looks wrong.'
			},
			{
				add: ['pre["Book.includes(:author)"] -->|"2 queries, WHERE id IN (...)"| db'],
				highlight: ['pre'],
				note: 'With `includes` and no condition on authors, Rails preloads. It runs the books query, then one `SELECT authors.* ... WHERE authors.id IN (1,2,...,10)`, so 2 queries whatever N is. Django\'s `prefetch_related` does the same.'
			},
			{
				add: ['ej["includes + where(authors: ...)"] -->|"1 query, LEFT OUTER JOIN"| db'],
				highlight: ['ej'],
				note: 'Add a condition on the authors table and `includes` switches to one `LEFT OUTER JOIN`, because the filter needs both tables in one query. Django\'s `select_related` always joins, and only follows foreign keys and one-to-one relations.'
			},
			{
				add: ['strict["strict_loading"] -.->|"lazy load raises"| loop'],
				highlight: ['strict'],
				note: 'In strict loading mode, a lazy load raises an error instead of running a query. The loop raises `ActiveRecord::StrictLoadingViolationError`, so a test that renders the page fails before the N+1 reaches production.'
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
			'Lines 2 to 6: `eager_loading?` is true if you called `eager_load`, or if you called `includes` and the query also joins that association or references a table it does not join. Lines 29 to 37 then build one joined query, logged as `"Book Eager Load"`. Otherwise line 43 runs the plain query, and the associations wait for `preload_associations`.',
			'Line 10 adds `includes_values` to the preload list unless the relation eager loads. The preloader then runs [`scope.where(destination_key_name => keys)`](' + RAILS + '/activerecord/lib/active_record/associations/preloader/association.rb#L42-L58): one query for all the ids it collected, sent as `WHERE ... IN (...)`.',
			'The [doc comment on `includes`](' + QM + '#L190-L209) says why Rails does not always join: "a join can result in many rows that contain redundant data and it performs poorly at scale". Join books to authors and each author\'s columns repeat on every book row. Join a `has_many` and the parent rows multiply (day 4).',
			'Django splits the two methods the same way. Its [docs](' + QS + '#L1189-L1205) say `select_related` "is limited to single-valued relationships", while `prefetch_related` "does a separate lookup for each relationship, and does the \'joining\' in Python". They also warn that a large queryset can make "a large \'IN\' clause".',
			'Rails [`strict_loading`](' + QM + '#L1392-L1400) makes a relation "raise an error if the record tries to lazily load an association". Django 6.1 adds fetch modes. `FETCH_PEERS` loads a missing field for the whole batch, so most N+1 cases take "two queries without much effort". `FETCH_RAISE` raises an error instead.'
		]
	},
	tradeoff: {
		gain: [
			'The page runs 2 or 3 queries whatever the number of rows, instead of one per row.',
			'You choose the shape: a join when you filter on the related table, a separate `IN` query when a join would repeat or multiply rows.',
			'With strict loading, a lazy load raises an error in a test instead of slowing a page in production.'
		],
		cost: [
			'The controller must list what the template will read. When the template changes, the list can miss a new association or still load one the template no longer reads.',
			'Eager loading an association you never read still runs the query and builds the objects.',
			'A join over a "many" relation repeats the parent columns on every child row. A condition on that relation also filters the loaded children: Rails warns that `includes(:posts).where(posts: { name: ... })` loads only the matching posts.',
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
		],
		steps: [
			{
				title: 'Count the queries as written',
				questions: [
					{ q: 'The view loads 20 orders. How many queries does the list itself take?', options: ['One', 'Twenty', 'Two', 'Forty-one'], answer: 0, why: 'One `SELECT` brings back the 20 order rows. The extra queries come later, from the template.' },
					{ q: 'The template reads `order.customer.name` for each order. How many queries does that add?', options: ['None: the customer comes with the order', 'One for all the customers', '20, one lazy load per order', '40, two per order'], answer: 2, why: 'Django loads a foreign key lazily by default. Each order reads its customer once, so each one runs its own query.' },
					{ q: 'The template loops over `order.items.all()`. How many queries does that add?', options: ['One for all the items', '20, one per order', 'One per item', 'None: the items are columns of orders'], answer: 1, why: 'Each `order.items.all()` runs one `SELECT ... WHERE order_id = ?`, so one query per order, whatever the number of items.' },
					{ q: 'What is the total as written?', options: ['21', '40', '41', '2'], answer: 2, why: '1 for the list, 20 for the customers, 20 for the items: 41 queries, each fast, the page waiting for all of them in a row.' }
				]
			},
			{
				title: 'Pick a method per relation',
				questions: [
					{ q: 'What kind of relation is `customer` on an order?', options: ['Many: several customers per order', 'Single-valued: one customer per order', 'Many-to-many', 'Reverse foreign key'], answer: 1, why: 'A foreign key points at one row. That makes it single-valued, the kind `select_related` can follow.' },
					{ q: 'Which call loads the customers with no extra query at all?', options: ['`prefetch_related("customer")`', '`only("customer")`', '`defer("customer")`', '`select_related("customer")`'], answer: 3, why: '`select_related` joins the related table into the first query. `prefetch_related` would work too, but with a second query.' },
					{ q: 'Why can `select_related` not follow `items`?', options: ['It is limited to single-valued relationships', 'It only works on the first 10 rows', 'The items table has no primary key', 'It needs strict loading turned on first'], answer: 0, why: 'The Django docs say `select_related` "is limited to single-valued relationships". `items` is a reverse foreign key, many rows per order.' },
					{ q: 'Next month the template stops printing the items, but `prefetch_related("items")` stays in the view. What does it cost?', options: ['Nothing: Django skips a prefetch the template never reads', 'The `IN` query still runs and builds item objects nobody reads', 'Django falls back to one lazy query per order', 'The orders query fails on an unused relation'], answer: 1, why: 'Eager loading runs when the queryset is evaluated, not when the template reads. The list in the view must follow the template, or it loads what nobody uses.' }
				]
			},
			{
				title: 'Write the SQL',
				questions: [
					{ q: 'What does `select_related("customer")` change in the SQL?', options: ['It adds a second `SELECT * FROM customers WHERE id IN (...)`', 'It runs one `SELECT` per customer, but in parallel', 'It adds a subquery to each order row', 'It adds `JOIN customers ON ...` to the orders query'], answer: 3, why: 'The first query becomes `SELECT orders.*, customers.* FROM orders JOIN customers ON ...`, so the customer columns come along.' },
					{ q: 'What SQL does `prefetch_related("items")` send?', options: ['`SELECT * FROM items WHERE order_id IN (...)` with the 20 order ids', '`SELECT * FROM items WHERE order_id = ?` once per order', '`SELECT * FROM orders JOIN items ON ...`', '`SELECT * FROM items` with no filter'], answer: 0, why: 'It collects the order ids from the first query and sends them all in one `IN` list.' },
					{ q: 'Where are the items matched to their orders?', options: ['In the database, with a join', 'In the template, with a filter', 'In Python, after the second query', 'In a view the ORM creates'], answer: 2, why: 'The second query returns a flat list of items. Django groups them by `order_id` in memory.' },
					{ q: 'Why not join the items into the first query too?', options: ['PostgreSQL cannot join more than two tables', 'A join over a "many" relation repeats the order columns on every item row', 'A join cannot be combined with `[:20]`', 'Django runs one query per table anyway'], answer: 1, why: 'Rails says it too: a join "can result in many rows that contain redundant data". The parent rows multiply with their children.' }
				]
			},
			{
				title: 'Count again and lock it in',
				questions: [
					{ q: 'How many queries does `Order.objects.select_related("customer").prefetch_related("items")[:20]` run?', options: ['1', '3', '21', '2'], answer: 3, why: 'One joined query for orders and customers, one `IN` query for the items. 2 instead of 41.' },
					{ q: 'The page grows to 200 orders. How many queries now?', options: ['Still 2', '201', '401', '3'], answer: 0, why: 'The count no longer depends on the number of rows. Only the `IN` list gets longer.' },
					{ q: 'How do you stop the N+1 from coming back?', options: ['A timer that fails the test above 2 seconds', 'A test that counts rows in the result', '`assertNumQueries(2)` in a test that renders the page', 'Printing `queryset.query` in the view'], answer: 2, why: 'A query count fails the test as soon as someone adds a lazy read to the template. A timer would pass on a laptop with five orders.' },
					{ q: 'What cost is left with the prefetch on a page of thousands of orders?', options: ['One query per order comes back', 'The customer columns repeat on every item', 'Nothing: the cost stays flat', 'Thousands of ids in one large `IN` list'], answer: 3, why: 'The Django docs warn that a large queryset can make "a large \'IN\' clause", which has a cost of its own.' }
				]
			}
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
			why: 'A hash condition on the included table references it, so `eager_loading?` returns true and `includes` builds one joined query. Without the condition, the same `includes` would preload in two queries.'
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
	lab: {
		minutes: 20,
		goal: 'Count the queries of an N+1 loop, then bring them down to 2 with a join and an `IN` query.',
		steps: [
			'Make a folder and a SQLite database with 50 customers, 200 orders and 3 items per order: `mkdir -p ~/n1-lab && cd ~/n1-lab && sqlite3 shop.db "CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INT REFERENCES customers); CREATE TABLE items(id INTEGER PRIMARY KEY, order_id INT REFERENCES orders, sku TEXT); WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<200) INSERT INTO customers SELECT i, \'customer \'||i FROM n WHERE i<=50; WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<200) INSERT INTO orders SELECT i, 1+i%50 FROM n; INSERT INTO items(order_id, sku) SELECT id, \'sku-\'||k FROM orders, (SELECT 1 AS k UNION ALL SELECT 2 UNION ALL SELECT 3);"`.',
			'Write `page.py`, the lazy version: open `shop.db` with `sqlite3.connect`, set `log = []` and `con.set_trace_callback(log.append)` so every statement is recorded, load `SELECT id, customer_id FROM orders LIMIT ?` with the limit from `sys.argv[1]`, then for each order run `SELECT name FROM customers WHERE id = ?` and `SELECT sku FROM items WHERE order_id = ?`. Print `len(log)`.',
			'Run `python3 page.py 20`, then `python3 page.py 200`, and write down both counts.',
			'Write `fixed.py`: one query that joins customers into the orders query, then one `SELECT order_id, sku FROM items WHERE order_id IN (?,?,...)` with all the order ids, grouped by `order_id` in a dict. Print `len(log)` and `log[-1]`.',
			'Run `python3 fixed.py 20` and `python3 fixed.py 200`.'
		],
		done: [
			'`python3 page.py 20` prints 41, and `python3 page.py 200` prints 401.',
			'`python3 fixed.py 20` and `python3 fixed.py 200` both print 2.',
			'The last statement `fixed.py` prints starts with `SELECT order_id, sku FROM items WHERE order_id IN (1,2,3,`.'
		],
		solution: [
			'`page.py`: `import sqlite3, sys`, `con = sqlite3.connect("shop.db")`, `log = []`, `con.set_trace_callback(log.append)`, `orders = con.execute("SELECT id, customer_id FROM orders LIMIT ?", (int(sys.argv[1]),)).fetchall()`, then a `for order_id, customer_id in orders:` loop with the two per-row queries, then `print(len(log))`.',
			'`fixed.py`, first query: `SELECT orders.id, customers.name FROM orders JOIN customers ON customers.id = orders.customer_id LIMIT ?`. This is what `select_related` does.',
			'Second query: `ids = [o[0] for o in orders]`, `marks = ",".join("?" * len(ids))`, then `con.execute(f"SELECT order_id, sku FROM items WHERE order_id IN ({marks})", ids)` and `items.setdefault(order_id, []).append(sku)` for each row. This is what `prefetch_related` does.',
			'Look at `log[-1]` at 200: the count stays 2, but the `IN` list now holds 200 ids. That is the cost the Django docs warn about.'
		]
	},
	recall: {
		q: 'A loop over 50 orders reads `order.customer.name`. How many queries run, and which Rails and Django calls bring it down?',
		a: '51: one for the list, then one lazy load per order. A join (`eager_load`, `select_related`) runs 1 query, and a preload (`preload`, `prefetch_related`) runs 2, with the customer ids in one `IN` list.'
	},
	sources: [
		{ title: 'Rails Guides, Active Record Query Interface: Eager Loading Associations', url: 'https://guides.rubyonrails.org/active_record_querying.html#eager-loading-associations' },
		{ title: 'Django docs, QuerySet API reference: prefetch_related()', url: 'https://docs.djangoproject.com/en/stable/ref/models/querysets/#prefetch-related' },
		{ title: 'Django docs, Fetch modes', url: 'https://docs.djangoproject.com/en/dev/topics/db/fetch-modes/' },
		{ title: 'Django source, querysets.txt: large IN clauses from prefetch_related', url: `${QS}#L1367-L1371` },
		{ title: 'Django source, fetch-modes.txt', url: `${DJANGO}/docs/topics/db/fetch-modes.txt#L84-L119` },
		{ title: 'Rails source, ActiveRecord::Relation', url: `${RAILS}/activerecord/lib/active_record/relation.rb` }
	]
};
