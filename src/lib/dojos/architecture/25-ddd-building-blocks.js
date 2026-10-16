const REPO = 'https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6';
const OWNER = `${REPO}/src/main/java/org/springframework/samples/petclinic/owner`;
const DATA = 'https://github.com/spring-projects/spring-data-commons/blob/10feb2ab4bb493498ac8843ff6676a035e4f9069';
const JDK = 'https://github.com/openjdk/jdk/blob/d0287a5e875e74cb90713beaa45672326807e2d1/src/java.base/share/classes/java';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ddd-building-blocks',
	part: 'The pattern toolbox',
	title: 'DDD building blocks: inside one context',
	minutes: 10,
	hook: [
		'Alice brings her cat Leo to a vet clinic. The front desk finds Alice, picks Leo from her pets, and books a visit for tomorrow: "yearly vaccine".',
		'A small feature, yet some things must **always** be true. A visit belongs to a pet. That pet belongs to Alice. A new visit is in the future. Where do those rules live? Spread across controllers, one gets forgotten on the path nobody tested.',
		'Days 20 and 21 drew the borders between contexts. Today is the inside of one. Eric Evans named the parts: **value objects**, **entities**, **aggregates**, **repositories**, and later **domain events**. We read them in Spring PetClinic, the classic Spring sample app.'
	],
	terms: [
		{ term: 'Value object', def: 'Defined only by its value. Immutable, compared by content, checks itself when built. Two dates that both say 2026-03-14 are the same date.' },
		{ term: 'Entity', def: 'Has an identity that lasts while its attributes change. Leo stays the same pet when his name is corrected or his birth date fixed.' },
		{ term: 'Aggregate', def: 'A cluster of objects changed as one unit, through one **root**. Its **invariants**, the rules that must always hold, are checked inside it.' },
		{ term: 'Repository', def: 'Looks like a collection of aggregates: add, find, remove whole ones. The database stays behind it.' },
		{ term: 'Domain event', def: 'A fact the domain cares about, in the past tense: "a visit was booked". Others react to it without the aggregate knowing them.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['date["LocalDate: 2026-03-14"]', 'addr["address, city, telephone: three Strings"]'],
				highlight: ['date', 'addr'],
				note: '**Value objects, one used and one missing.** Birth dates and visit dates are `java.time.LocalDate`: immutable, equal by content. The owner\'s address, city and telephone are three plain strings. Nothing groups them or checks them as one value.'
			},
			{
				add: ['owner["Owner (root): id, name, pets"]', 'pet["Pet: id, name, birthDate, type"]', 'visit["Visit: id, date, description"]', 'owner --> pet', 'pet --> visit', 'pet --> date', 'owner --> addr'],
				highlight: ['owner', 'pet', 'visit'],
				note: '**Entities.** All three extend `BaseEntity`, which holds an `id`. An object without an id `isNew`. Leo is still Leo after an edit, because his id stays.'
			},
			{
				add: ['add["owner.addVisit(petId, visit)"] -->|"finds the pet, asserts it exists"| owner'],
				highlight: ['add', 'owner'],
				note: '**Aggregate root.** `Owner` holds its pets, each pet holds its visits, and the mapping cascades every change down from the owner. To add a visit you call the root with a pet id. It refuses a pet that is not one of this owner\'s.'
			},
			{
				add: ['repo["OwnerRepository"] -->|"findById, save: whole owners"| owner', 'ctl["VisitController"] -->|"load, addVisit, save"| repo'],
				highlight: ['repo', 'ctl'],
				note: '**Repository.** There is an `OwnerRepository`, and no repository for pets or visits. The visit controller loads the owner, adds the visit through it, and saves the owner. The whole cluster goes in and out together.'
			},
			{
				add: ['agg["Spring Data AbstractAggregateRoot: registerEvent"]', 'agg -.->|"option: VisitBooked, published on save"| repo', 'class agg ext'],
				highlight: ['agg'],
				note: '**Domain event, not used here.** PetClinic publishes no events. Spring Data offers a base class for roots: `registerEvent` keeps an event inside the aggregate, and the repository publishes it on `save`. A reminder email could listen without `Owner` knowing.'
			}
		]
	},
	example: {
		title: 'owner/Owner.java: the root and its cluster',
		repo: 'spring-projects/spring-petclinic',
		url: `${OWNER}/Owner.java#L67-L186`,
		lang: 'java',
		code: `	@OneToMany(cascade = CascadeType.ALL, fetch = FetchType.EAGER)
	@JoinColumn(name = "owner_id")
	@OrderBy("name")
	private final List<Pet> pets = new ArrayList<>();
	…
	public List<Pet> getPets() {
		return this.pets;
	}
	…
	public void addVisit(Integer petId, Visit visit) {

		Assert.notNull(petId, "Pet identifier must not be null!");
		Assert.notNull(visit, "Visit must not be null!");

		Pet pet = getPet(petId);

		Assert.notNull(pet, "Invalid Pet identifier!");

		pet.addVisit(visit);
	}`,
		notes: [
			'`cascade = CascadeType.ALL` is the aggregate boundary in JPA terms: save or delete the owner, and its pets go with it. [`Pet`](' + OWNER + '/Pet.java#L56-L83) does the same for its visits.',
			'Where the boundary leaks: `getPets()` returns the live list, so any caller can add a pet without `addPet`. And the [visit controller](' + OWNER + '/VisitController.java#L63-L112) calls `pet.addVisit` directly while it builds the form, before it calls `owner.addVisit` on submit.',
			'Where an invariant leaks: "a new visit is in the future" is checked in the controller, `!visit.getDate().isAfter(LocalDate.now())`, not in `Visit`. The [`Visit` constructor](' + OWNER + '/Visit.java#L50-L52) defaults to tomorrow, but its setter takes any date. Another entry point could book a visit last year.',
			'A value object up close: [`LocalDate`](' + JDK + '/time/LocalDate.java#L131-L146) is documented as "value-based", equal instances are "interchangeable", and the class is "immutable and thread-safe". The domain event base class is [`AbstractAggregateRoot`](' + DATA + '/src/main/java/org/springframework/data/domain/AbstractAggregateRoot.java#L37-L71).'
		]
	},
	tradeoff: {
		gain: [
			'Values check themselves once. A `LocalDate` you receive is a real date, so the code that uses it does not parse or check it again.',
			'One root per cluster. Callers load and save a whole `Owner`, so the rule "this pet is yours" has one place to live.',
			'The repository hides storage. `OwnerRepository` is only an interface that extends `JpaRepository`, and the controllers never see SQL.'
		],
		cost: [
			'A rule in the root only guards the paths that go through the root. A getter that returns the live list, or a controller check, lets the rule leak.',
			'A rule that spans two aggregates, like "a vet is never double-booked" across many owners, cannot be enforced inside one.',
			'Loading the whole cluster has a price: PetClinic fetches pets and visits eagerly with every owner.'
		]
	},
	task: {
		prompt: 'Product wants each visit to name a vet and a time, with a guarantee: **a vet never has two visits at the same time**. Visits live inside each `Owner` aggregate. Vets are a separate aggregate with their own `VetRepository`. Where would you enforce the rule? Give two options and what each costs.',
		hint: 'Ask which aggregate holds the data the rule needs. One vet\'s visits are spread over many owners.',
		answer: [
			'Not in `Owner`: the rule needs every visit of the vet, and those sit in other owners\' aggregates. Vernon\'s rule: model true invariants inside one consistency boundary, and use eventual consistency between aggregates.',
			'Option 1, a small new aggregate: a vet booking keyed by vet and time slot, inserted under a unique index in the same transaction as the visit. The second booking fails. Cost: a new table, the visit now references the booking by id, and one transaction now writes two aggregates. That bends the rule above, on purpose, for an invariant that must never break.',
			'Option 2, accept the race and repair: detect overlapping visits afterwards and call the later client to move. Cost: a rare but visible bad experience.',
			'Worth asking first: how often do two desks book the same vet at the same minute? If almost never, option 2 may be enough.'
		]
	},
	quiz: [
		{
			q: 'Two `LocalDate` objects are created separately, and both hold 2026-03-14. How do they compare?',
			options: [
				'Different, because each was created separately',
				'Equal only if they belong to the same pet',
				'Equal: a value object is defined by its content, and `equals` compares the date',
				'Different, unless they share a database id'
			],
			answer: 2,
			why: 'Value objects have no identity. Same content, same value. The JDK documents `LocalDate` as value-based: equal instances are interchangeable.'
		},
		{
			q: 'Why can the `Owner` aggregate not enforce "a vet never has two visits at the same time"?',
			options: [
				'JPA entities cannot hold rules',
				'The rule needs visits from many owners, which live outside this aggregate',
				'Only value objects can hold invariants',
				'The database has no transactions'
			],
			answer: 1,
			why: 'An aggregate can only guarantee rules over the data it holds. One vet\'s visits are spread across many owners, so a check inside one owner sees only a few of them.'
		},
		{
			q: 'PetClinic has an `OwnerRepository` but no repository for pets or visits. What does that say?',
			options: [
				'Owner is the aggregate root: pets and visits are loaded and saved through it',
				'Pets and visits are value objects',
				'The project forgot two repositories',
				'Pets are stored in a different database'
			],
			answer: 0,
			why: 'Repositories exist per aggregate, not per table. Pets and visits are entities inside the owner\'s cluster, so they travel with it.'
		}
	],
	takeaway: 'Name the values, give what lasts an identity, and draw a boundary around what must be true together. Inside it, enforce. Across it, check and repair.',
	sources: [
		{ title: 'Evans, DDD Reference: Entities, Value Objects, Aggregates, Repositories, Domain Events', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'Vaughn Vernon, Effective Aggregate Design', url: 'https://www.dddcommunity.org/library/vernon_2011/' },
		{ title: 'Martin Fowler, ValueObject', url: 'https://martinfowler.com/bliki/ValueObject.html' },
		{ title: 'Martin Fowler, DDD_Aggregate', url: 'https://martinfowler.com/bliki/DDD_Aggregate.html' },
		{ title: 'Spring PetClinic, Owner.java', url: `${OWNER}/Owner.java#L67-L186` }
	]
};
