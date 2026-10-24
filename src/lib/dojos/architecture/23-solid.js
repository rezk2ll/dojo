const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const JDK = 'https://github.com/openjdk/jdk/blob/d0287a5e875e74cb90713beaa45672326807e2d1/src/java.base/share/classes/java';
const IMMUTABLE = `${JDK}/util/ImmutableCollections.java`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'solid',
	part: 'The pattern toolbox',
	title: 'SOLID: five principles, read on real code',
	minutes: 10,
	hook: [
		'Mastodon\'s `Account` model is **607 lines** long. It also includes 16 modules named `Account::Something`, another 1,130 lines: avatars, counters, search, merging, suspensions, silences and more.',
		'A moderation rule, a new image setting, a search tweak: each one edits a file that is part of `Account`. Two teams working on two features meet in the same class.',
		'Robert C. Martin popularized five principles, known as **SOLID**, for this kind of problem. Three of them show up here on real code: one class with too many jobs, one interface too wide, and implementations that do less than their interface promises.'
	],
	terms: [
		{ term: 'Single responsibility (S)', def: 'A module has one reason to change: one group of people or one feature that asks for changes. The test is the number of sources of change, and a class can do several things for one source.' },
		{ term: 'Open/closed (O)', def: 'You add behavior by adding code, and you leave working code unedited. Java\'s `BufferedInputStream` adds buffering to any `InputStream` by wrapping it, without touching the file or socket streams.' },
		{ term: 'Liskov substitution (L)', def: 'Any implementation of an interface must work wherever the interface is expected. If one implementation throws where others work, callers have to know which one they got.' },
		{ term: 'Interface segregation (I)', def: 'A caller should not depend on methods it does not use. A wide interface forces every implementation to fill in methods nobody calls.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['acct["Account model: 607 lines, 16 concerns"]', 'acct --- rsus["suspensions"]', 'acct --- ravatar["avatar and header"]', 'acct --- rcount["counters"]', 'acct --- rsearch["search"]', 'acct --- rmerge["merging"]'],
				highlight: ['acct'],
				note: '`Account` breaks single responsibility. Each box is a concern module with its own reason to change, and they all run on the same object and the same `accounts` row: `suspend!` writes `suspended_at` on the account itself. The concerns split the file into 16, and the class still holds **one shared state**.'
			},
			{
				add: ['block["BlockService: one call method"]', 'block -->|"account.block!"| acct'],
				highlight: ['block'],
				note: 'One level up, each service follows single responsibility: it is one use case. `BlockService#call` ends follows both ways, removes the accounts from each other\'s collections, records the block and tells the remote server. It changes only when the meaning of "block" changes. Mastodon has about 80 such services at the top of `app/services`.'
			},
			{
				add: ['list["java.util.List: reads plus optional mutators"]', 'reader["Caller that only reads"] -->|"get, size, iterator"| list', 'imm["List.of: every mutator throws"] -.->|implements| list'],
				highlight: ['list', 'reader', 'imm'],
				note: 'Java bends interface segregation on purpose. `List` has read methods and "optional operations" like `add` and `remove`, so a caller that only reads still depends on all of them. An unmodifiable list must still have `add`, so it throws `UnsupportedOperationException`.'
			},
			{
				add: ['caller["addDefaults(list): list.add(x)"] -->|"ArrayList: works"| list', 'caller -.->|"List.of: throws at run time"| imm'],
				highlight: ['caller'],
				note: 'The same design bends Liskov substitution. Pass an `ArrayList` and the call works, pass `List.of(...)` and the same call throws, and both compile as a `List`. The contract allows the throw, but the caller still has to know which list it got.'
			}
		]
	},
	example: {
		title: 'java/util/ImmutableCollections.java: every mutator throws',
		repo: 'openjdk/jdk',
		url: `${IMMUTABLE}#L156-L168`,
		lang: 'java',
		code: `    static UnsupportedOperationException uoe() { return new UnsupportedOperationException(); }

    @jdk.internal.ValueBased
    abstract static class AbstractImmutableCollection<E> extends AbstractCollection<E> {
        // all mutating methods throw UnsupportedOperationException
        @Override public boolean add(E e) { throw uoe(); }
        @Override public boolean addAll(Collection<? extends E> c) { throw uoe(); }
        @Override public void    clear() { throw uoe(); }
        @Override public boolean remove(Object o) { throw uoe(); }
        @Override public boolean removeAll(Collection<?> c) { throw uoe(); }
        @Override public boolean removeIf(Predicate<? super E> filter) { throw uoe(); }
        @Override public boolean retainAll(Collection<?> c) { throw uoe(); }
    }`,
		notes: [
			'Lines 6 to 12 are seven methods that exist only to throw. `List.of(a, b)` [returns an `ImmutableCollections.List12`](' + JDK + '/util/List.java#L956-L958), whose parent `AbstractImmutableList` extends the class on line 4.',
			'[`List.add`](' + JDK + '/util/List.java#L251-L273) is documented as an "optional operation" that throws "if the `add` operation is not supported by this list". `Collection` says the same of every "destructive" method. Nothing in the **type** tells you which kind of list you hold.',
			'The Java designers chose this and explain why. The [Collections design FAQ](https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html) calls it "the most controversial design decision in the whole API". Splitting by modifiable, fixed-size, append-only and immutable would mean "twenty or so interfaces and five iterators", and the runtime exceptions would remain.',
			'On the Mastodon side, `account.rb` includes the `Account::` modules, [`suspend!`](' + MASTODON + '/app/models/concerns/account/suspensions.rb#L36-L46) updates the account row, and `BlockService#call` holds one use case.'
		]
	},
	tradeoff: {
		gain: [
			'Small classes with one reason to change, like each Mastodon service, let two features move in parallel without meeting in one file.',
			'With a narrow interface, an implementation has no methods that exist only to throw, like the seven in `AbstractImmutableCollection`.',
			'Substitutable implementations let you swap one for another, a test fake for a real store, without the callers checking which one they got.'
		],
		cost: [
			'Each principle adds pieces: more classes, more interfaces, more wiring. The Java designers judged four wide interfaces cheaper than twenty narrow ones.',
			'You cannot split an interface you do not own, like `java.util.List`. You can only wrap it in a narrower type of your own, and maintain that adapter.',
			'Splitting a large class only helps if you split the **state** too. Moving methods into concern modules makes the file shorter and changes nothing else.'
		]
	},
	task: {
		prompt: 'In your codebase, `OrderService.addDiscounts(List<Discount> discounts)` appends a loyalty discount to the list it receives. A teammate now calls it with `List.of(promo)`. Say what happens, then propose a design change so this mistake cannot reach production.',
		hint: 'Which methods does `addDiscounts` really need from its argument? What would a type that only offers those change?',
		answer: [
			'It compiles. At run time `add` throws `UnsupportedOperationException`, because `List.of` returns an unmodifiable list.',
			'A test that passes an `ArrayList` would pass. The bug shows up only on the path that passes `List.of`.',
			'One fix is to leave the input alone: take a read-only input and **return** a new list, `List<Discount> withLoyalty(List<Discount> in)`. The caller\'s list is never touched, so any `List` works.',
			'Another fix narrows the type: accept an interface of your own with only the method you need, like `DiscountSink.add`, so nobody can pass an unmodifiable list by mistake.',
			'Either fix costs one more type or one more copy. Today the limit is written only in the Javadoc.'
		],
		steps: [
			{
				title: 'Say what happens',
				questions: [
					{ q: 'Does `addDiscounts(List.of(promo))` compile?', options: ['No: `List.of` does not return a `List`', 'Yes: `List.of` returns a `List`', 'Only with an explicit cast', 'Only on old Java versions'], answer: 1, why: 'The type is `List`, so the compiler is happy. The problem waits for run time.' },
					{ q: 'What happens when `addDiscounts` appends the loyalty discount?', options: ['The discount is added as usual', 'The call silently does nothing', '`add` throws `UnsupportedOperationException`', 'Java makes a copy and adds to it'], answer: 2, why: 'Every mutator of an immutable collection throws `UnsupportedOperationException`.' },
					{ q: 'Why does `add` throw here?', options: ['`List.of` returns an unmodifiable list', 'The list is already full', '`Discount` is an immutable class', 'The teammate forgot to call `new`'], answer: 0, why: '`List.of` returns a class from `ImmutableCollections`, where `add` exists only to throw.' },
					{ q: 'Your test passes an `ArrayList`. Does it catch the bug?', options: ['Yes: every list behaves the same', 'No: only the path that passes `List.of` fails', 'Yes, as long as it runs in CI', 'No: tests cannot call `add`'], answer: 1, why: 'An `ArrayList` supports `add`, so the test passes. The bug shows up only with `List.of`.' }
				]
			},
			{
				title: 'Name the broken principle',
				questions: [
					{ q: 'Two lists both compile as `List`. One works, one throws. Which principle bends?', options: ['Single responsibility', 'Open/closed', 'Liskov substitution', 'Interface segregation'], answer: 2, why: 'An implementation that throws where others work cannot stand in for them. The caller has to know which one it got.' },
					{ q: 'How many of `List`\'s methods does `addDiscounts` actually call?', options: ['All of them', 'About half', 'None: it only reads', 'One: `add`'], answer: 3, why: 'It takes the whole `List` and uses one method. That gap is what fix two closes.' },
					{ q: 'Where is the rule "this list may not support `add`" written today?', options: ['In the type', 'Only in the Javadoc', 'In a compiler warning', 'In the `Discount` class'], answer: 1, why: '`List.add` is documented as an "optional operation". Nothing in the type says which kind of list you hold.' },
					{ q: 'Why did the Java designers keep optional operations in `List`?', options: ['Splitting would need about twenty interfaces and five iterators', 'They did not think of immutable lists', 'Exceptions run faster than extra types', 'Liskov substitution was not known yet'], answer: 0, why: 'The design FAQ explains it: four wide interfaces were judged cheaper than twenty narrow ones.' }
				]
			},
			{
				title: 'Pick a design fix',
				questions: [
					{ q: 'Fix one is `List<Discount> withLoyalty(List<Discount> in)`. What does it do?', options: ['Appends to `in` and returns it', 'Takes a read-only input and returns a new list', 'Casts `in` to `ArrayList` first', 'Catches the exception and retries'], answer: 1, why: 'It never touches the input. It builds and returns a new list.' },
					{ q: 'After fix one, which lists can a caller pass?', options: ['Only `ArrayList`', 'Only `List.of`', 'Any `List`', 'Only a `LinkedList`'], answer: 2, why: 'The method only reads its input, and every `List` supports reading.' },
					{ q: 'Fix two narrows the type. What does `addDiscounts` accept then?', options: ['A `Collection<Discount>`', 'An `Object`', 'An array of discounts', 'An interface of your own with only `add`, like `DiscountSink`'], answer: 3, why: 'An interface with only the method you need is the narrow type, and you own it.' },
					{ q: 'Why does fix two stop the mistake before production?', options: ['Nobody can pass an unmodifiable list where a `DiscountSink` is expected', 'It logs a warning when the list is unmodifiable', 'It adds a test for `List.of`', 'It copies the list before adding'], answer: 0, why: 'The limit moves from the Javadoc into the type, so the wrong call no longer fits.' }
				]
			},
			{
				title: 'Weigh the cost',
				questions: [
					{ q: 'What does each fix cost?', options: ['Nothing at all', 'One more type or one more copy', 'A rewrite of `OrderService`', 'A newer JDK'], answer: 1, why: 'A returned list is a copy. A narrow interface is a type to write and keep.' },
					{ q: 'You do not own `java.util.List`. How do you get a narrow type?', options: ['Edit `List` in the JDK', 'Remove `add` with reflection', 'Wrap it in a narrower type of your own and keep that adapter', 'Ask every caller to read the Javadoc'], answer: 2, why: 'You cannot split an interface you do not own. You can only wrap it, and maintain the wrapper.' },
					{ q: 'Which fix lets the teammate keep calling with `List.of(promo)`?', options: ['Returning a new list', 'Narrowing to `DiscountSink`', 'Casting the input to `ArrayList`', 'Removing the loyalty discount'], answer: 0, why: 'Fix one only reads its input, so an unmodifiable list works fine.' },
					{ q: '`AbstractImmutableCollection` overrides seven mutators. What does a narrow interface spare an implementation like it?', options: ['All exceptions in the code', 'The need for any tests', 'Filling in methods it cannot support', 'Generic types'], answer: 2, why: 'With a narrow interface, an implementation never has to fill in methods it cannot support.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Which SOLID principle says a caller should not be forced to depend on methods it does not use?',
			options: ['Single responsibility', 'Open/closed', 'Liskov substitution', 'Interface segregation'],
			answer: 3,
			why: 'Interface segregation is about the width of an interface as seen by its callers. Liskov is about implementations keeping the promise of an interface. Single responsibility counts the groups of people who ask a class to change.'
		},
		{
			q: 'Which change really lowers the number of reasons Mastodon\'s `Account` has to change?',
			options: ['Move more of its methods into new `Account::` concern modules, one per feature', 'Give suspensions their own model and table, so `Account` no longer holds that state', 'Rename it to `UserAccount` so the name says what the class is really for', 'Add comments that group its methods by feature, so each team finds its part'],
			answer: 1,
			why: 'Concerns are mixed into the same class and share its columns, so a suspension change still touches `Account`. Moving the state and the behavior out removes that reason to change.'
		},
		{
			q: 'Which of these is the open/closed principle at work?',
			options: ['A list implementation whose mutators all throw, so callers can never change it', 'A 607-line model split into 16 mixed-in modules, so each feature has its own file', '`BufferedInputStream` adds buffering by wrapping any `InputStream`, without editing it', 'A constructor with 28 parameters, so every behavior can be set from outside'],
			answer: 2,
			why: 'The wrapper adds behavior with new code and leaves the file and socket streams unedited. The other three options show other principles bent or broken.'
		}
	],
	recall: {
		q: 'Why does splitting Mastodon\'s `Account` into 16 concern modules not give it a single responsibility?',
		a: 'The modules are mixed into the same class and write the same `accounts` row, like `suspend!` setting `suspended_at`. A suspension change still touches `Account`. Moving suspensions to their own model and table would remove that reason to change.'
	},
	sources: [
		{ title: 'Robert C. Martin, The Single Responsibility Principle', url: 'https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html' },
		{ title: 'Robert C. Martin, Clean Architecture, part III: design principles', url: 'https://www.oreilly.com/library/view/clean-architecture-a/9780134494272/' },
		{ title: 'Barbara Liskov and Jeannette Wing, A behavioral notion of subtyping', url: 'https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf' },
		{ title: 'Java Collections API Design FAQ', url: 'https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html' },
		{ title: 'OpenJDK, ImmutableCollections.java', url: `${IMMUTABLE}#L156-L168` },
		{ title: 'OpenJDK, ImmutableCollections.java: AbstractImmutableList', url: `${IMMUTABLE}#L268-L269` },
		{ title: 'OpenJDK, Collection.java: optional operations', url: `${JDK}/util/Collection.java#L141-L146` },
		{ title: 'Mastodon, account.rb: the Account:: includes', url: `${MASTODON}/app/models/account.rb#L90-L112` },
		{ title: 'Mastodon, block_service.rb', url: `${MASTODON}/app/services/block_service.rb#L3-L22` }
	]
};
