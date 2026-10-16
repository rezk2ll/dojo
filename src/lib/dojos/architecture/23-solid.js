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
		'Five principles popularized by Robert C. Martin, known as **SOLID**, are aimed at this kind of pain. Today you read three of them on real code: one class with too many jobs, one interface too wide, and implementations that do less than their interface promises.'
	],
	terms: [
		{ term: 'Single responsibility (S)', def: 'A module has one reason to change: one group of people or one feature that asks for changes. Not "it does one thing", but "one source of change".' },
		{ term: 'Open/closed (O)', def: 'Add behavior by adding code, not by editing code that works. Java\'s `BufferedInputStream` adds buffering to any `InputStream` by wrapping it, without touching the file or socket streams.' },
		{ term: 'Liskov substitution (L)', def: 'Any implementation of an interface must work wherever the interface is expected. If one implementation throws where others work, callers have to know which one they got.' },
		{ term: 'Interface segregation (I)', def: 'A caller should not depend on methods it does not use. A wide interface forces every implementation to fill in methods nobody calls.' },
		{ term: 'Dependency inversion (D)', def: 'High-level code depends on an interface it owns, and the low-level code implements it. Day 11 is this principle at full size.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['acct["Account model: 607 lines, 16 concerns"]', 'acct --- rsus["suspensions"]', 'acct --- ravatar["avatar and header"]', 'acct --- rcount["counters"]', 'acct --- rsearch["search"]', 'acct --- rmerge["merging"]'],
				highlight: ['acct'],
				note: '**S, broken.** Each box is a concern module, and a different reason to change. They all run on the same object and the same `accounts` row: `suspend!` writes `suspended_at` on the account itself. The concerns split the **file**, not the **responsibility**.'
			},
			{
				add: ['block["BlockService: one call method"]', 'block -->|"account.block!"| acct'],
				highlight: ['block'],
				note: '**S, followed.** One level up, each service is one use case. `BlockService#call` blocks an account: it ends follows both ways, removes the accounts from each other\'s collections, records the block and tells the remote server. One reason to change: what blocking means. Mastodon has about 80 such services at the top of `app/services`.'
			},
			{
				add: ['list["java.util.List: reads plus optional mutators"]', 'reader["Caller that only reads"] -->|"get, size, iterator"| list', 'imm["List.of: every mutator throws"] -.->|implements| list'],
				highlight: ['list', 'reader', 'imm'],
				note: '**I, bent on purpose.** `List` has read methods and "optional operations" like `add` and `remove`. A caller that only reads still depends on all of them. An unmodifiable list must still have `add`, so it throws `UnsupportedOperationException`.'
			},
			{
				add: ['caller["addDefaults(list): list.add(x)"] -->|"ArrayList: works"| list', 'caller -.->|"List.of: throws at run time"| imm'],
				highlight: ['caller'],
				note: '**L, bent.** Pass an `ArrayList` and the call works. Pass `List.of(...)` and the same call throws. Both compile, both are a `List`. The contract allows the throw, so it is legal, but the caller still has to know which list it got.'
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
			'`List.of(a, b)` [returns an `ImmutableCollections.List12`](' + JDK + '/util/List.java#L956-L958), whose parent [`AbstractImmutableList` extends this class](' + IMMUTABLE + '#L268-L269). Seven methods that exist only to throw.',
			'The interface warns you. [`List.add`](' + JDK + '/util/List.java#L251-L273) is documented as an "optional operation" that throws "if the `add` operation is not supported by this list". [`Collection`](' + JDK + '/util/Collection.java#L141-L146) says the same of every "destructive" method. Nothing in the **type** says which kind you hold.',
			'It was a choice, and the designers say why. The [Collections design FAQ](https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html) calls it "the most controversial design decision in the whole API". Splitting by modifiable, fixed-size, append-only and immutable would mean "twenty or so interfaces and five iterators", and still not remove the runtime exceptions.',
			'The SRP case side by side: [the `Account::` includes](' + MASTODON + '/app/models/account.rb#L90-L112), [`suspend!`](' + MASTODON + '/app/models/concerns/account/suspensions.rb#L36-L46) updating the account row, and [`BlockService#call`](' + MASTODON + '/app/services/block_service.rb#L3-L22).'
		]
	},
	tradeoff: {
		gain: [
			'Small classes with one reason to change, like each Mastodon service, let two features move in parallel without meeting in one file.',
			'Narrow interfaces make an implementation cheap to write honestly: no methods that exist only to throw.',
			'Substitutable implementations let you swap one for another, a test fake for a real store, without the callers checking which one they got.'
		],
		cost: [
			'Each principle adds pieces: more classes, more interfaces, more wiring. The Java designers judged four wide interfaces cheaper than twenty narrow ones.',
			'Some interfaces are not yours. You cannot split `java.util.List`. You can only wrap it in a narrower type of your own, and own that adapter.',
			'Splitting a large class only helps if you split the **state** too. Moving methods into concern modules makes the file shorter and changes nothing else.'
		]
	},
	task: {
		prompt: 'In your codebase, `OrderService.addDiscounts(List<Discount> discounts)` appends a loyalty discount to the list it receives. A teammate now calls it with `List.of(promo)`. Say what happens, then propose a design change so this mistake cannot reach production.',
		hint: 'Which methods does `addDiscounts` really need from its argument? What would a type that only offers those change?',
		answer: [
			'It compiles. At run time `add` throws `UnsupportedOperationException`, because `List.of` returns an unmodifiable list.',
			'A test that passes an `ArrayList` would pass. The bug shows up only on the path that passes `List.of`.',
			'Fix by not mutating what you did not create: take a read-only input and **return** a new list, `List<Discount> withLoyalty(List<Discount> in)`. The caller\'s list is never touched, so any `List` works.',
			'Or narrow the type: accept an interface of your own with only the method you need, like `DiscountSink.add`, so an unmodifiable list cannot be passed by mistake.',
			'The cost to name: one more type or one more copy, for a limit that today is only written in Javadoc.'
		]
	},
	quiz: [
		{
			q: 'Which SOLID principle says a caller should not be forced to depend on methods it does not use?',
			options: ['Single responsibility', 'Open/closed', 'Liskov substitution', 'Interface segregation'],
			answer: 3,
			why: 'Interface segregation is about the width of an interface as seen by its callers. Liskov is about implementations keeping the promise of an interface. Single responsibility is about reasons to change.'
		},
		{
			q: 'Which change really lowers the number of reasons Mastodon\'s `Account` has to change?',
			options: ['Move more of its methods into new `Account::` concern modules', 'Give suspensions their own model and table, used by a service, so `Account` no longer holds that state', 'Rename it to `UserAccount`', 'Add comments that group its methods by feature'],
			answer: 1,
			why: 'Concerns are mixed into the same class and share its columns, so a suspension change still touches `Account`. Moving the state and the behavior out removes that reason to change.'
		},
		{
			q: 'Which of these is the open/closed principle at work?',
			options: ['A list implementation whose mutators all throw', 'A 607-line model with 16 mixed-in modules', '`BufferedInputStream` adds buffering by wrapping any `InputStream`, without editing the file or socket streams', 'A constructor with 28 parameters'],
			answer: 2,
			why: 'The wrapper adds behavior with new code and leaves the working streams closed to change. The other three are symptoms of the other principles being bent or broken.'
		}
	],
	takeaway: 'Use SOLID as a set of questions about change: who asks for changes to this class, which methods does this caller really use, and does every implementation keep the promise of its interface?',
	sources: [
		{ title: 'Robert C. Martin, The Single Responsibility Principle', url: 'https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html' },
		{ title: 'Robert C. Martin, Clean Architecture, part III: design principles', url: 'https://www.oreilly.com/library/view/clean-architecture-a/9780134494272/' },
		{ title: 'Barbara Liskov and Jeannette Wing, A behavioral notion of subtyping', url: 'https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf' },
		{ title: 'Java Collections API Design FAQ', url: 'https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html' },
		{ title: 'OpenJDK, ImmutableCollections.java', url: `${IMMUTABLE}#L156-L168` }
	]
};
