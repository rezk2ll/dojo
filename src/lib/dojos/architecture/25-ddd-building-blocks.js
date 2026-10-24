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
		'Some rules must **always** hold for this booking. A visit belongs to a pet, that pet belongs to Alice, and a new visit is in the future. If each controller checks these rules itself, one controller that forgets a check lets a bad visit in.',
		'Days 20 and 21 drew the borders between contexts. For the inside of one context, Eric Evans named the parts: value objects, entities, **aggregates**, repositories, and later domain events. Spring PetClinic, the classic Spring sample app, has most of them.'
	],
	terms: [
		{ term: 'Value object', def: 'An object defined only by its value. It is immutable, compared by content, and checks itself when built. Two dates that both say 2026-03-14 are the same date.' },
		{ term: 'Entity', def: 'An object with an identity that lasts while its attributes change. Leo stays the same pet when his name is corrected or his birth date fixed.' },
		{ term: 'Aggregate', def: 'A cluster of objects changed as one unit, through one **root**. Its invariants, the rules that must always hold, are checked inside it.' },
		{ term: 'Repository', def: 'An interface that looks like a collection of aggregates: add, find, remove whole ones. The database code sits behind it.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['date["LocalDate: 2026-03-14"]', 'addr["address, city, telephone: three Strings"]'],
				highlight: ['date', 'addr'],
				note: 'PetClinic uses one value object and misses another. Birth dates and visit dates are `java.time.LocalDate`: immutable, equal by content. The owner\'s address, city and telephone are three plain strings, and nothing groups them or checks them as one value.'
			},
			{
				add: ['owner["Owner (root): id, name, pets"]', 'pet["Pet: id, name, birthDate, type"]', 'visit["Visit: id, date, description"]', 'owner --> pet', 'pet --> visit', 'pet --> date', 'owner --> addr'],
				highlight: ['owner', 'pet', 'visit'],
				note: '`Owner`, `Pet` and `Visit` are entities: all three extend `BaseEntity`, which holds an `id`. An object without an id `isNew`. Leo is still Leo after an edit, because his id stays.'
			},
			{
				add: ['add["owner.addVisit(petId, visit)"] -->|"finds the pet, asserts it exists"| owner'],
				highlight: ['add', 'owner'],
				note: '`Owner` is the aggregate root. It holds its pets, each pet holds its visits, and the mapping cascades every change down from the owner. To add a visit you call the root with a pet id, and it refuses a pet that is not one of this owner\'s.'
			},
			{
				add: ['repo["OwnerRepository"] -->|"findById, save: whole owners"| owner', 'ctl["VisitController"] -->|"load, addVisit, save"| repo'],
				highlight: ['repo', 'ctl'],
				note: 'PetClinic has an `OwnerRepository`, and no repository for pets or visits. The visit controller loads the owner, adds the visit through it, and saves the owner. The owner, its pets and their visits are loaded and saved together.'
			},
			{
				add: ['agg["Spring Data AbstractAggregateRoot: registerEvent"]', 'agg -.->|"option: VisitBooked, published on save"| repo', 'class agg ext'],
				highlight: ['agg'],
				note: 'A domain event is a past-tense fact like "a visit was booked", and PetClinic publishes none. Spring Data offers a base class for roots: `registerEvent` keeps an event inside the aggregate, and the repository publishes it on `save`. A reminder email could then listen without `Owner` knowing.'
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
			'Line 1 draws the aggregate boundary in JPA: with `cascade = CascadeType.ALL`, saving or deleting the owner saves or deletes its pets too. [`Pet`](' + OWNER + '/Pet.java#L56-L83) does the same for its visits.',
			'Lines 6 to 8 leak the boundary: `getPets()` returns the live list, so any caller can add a pet without `addPet`. The [visit controller](' + OWNER + '/VisitController.java#L63-L112) also calls `pet.addVisit` directly while it builds the form, before it calls `owner.addVisit` on submit.',
			'The rule "a new visit is in the future" lives in the controller, `!visit.getDate().isAfter(LocalDate.now())`, and `Visit` does not check it. The [`Visit` constructor](' + OWNER + '/Visit.java#L50-L52) defaults to tomorrow, but its setter takes any date. Another entry point could book a visit last year.',
			'[`LocalDate`](' + JDK + '/time/LocalDate.java#L131-L146) is documented as "value-based": equal instances are "interchangeable", and the class is "immutable and thread-safe". The domain event base class is Spring Data\'s `AbstractAggregateRoot`.'
		]
	},
	tradeoff: {
		gain: [
			'A `LocalDate` checks itself when it is built, so the code that receives one does not parse or check it again.',
			'Callers load and save a whole `Owner`, so the rule "this pet is yours" lives in one method, `Owner.addVisit`.',
			'`OwnerRepository` is only an interface that extends `JpaRepository`, and the controllers never see SQL.'
		],
		cost: [
			'A rule in the root only guards the paths that go through the root. A getter that returns the live list, or a check in a controller, lets other paths skip the rule.',
			'A rule that spans two aggregates, like "a vet is never double-booked" across many owners, cannot be enforced inside one.',
			'Each time PetClinic loads an owner, it also fetches all its pets and their visits, eagerly (`FetchType.EAGER` on line 1).'
		]
	},
	task: {
		prompt: 'Product wants each visit to name a vet and a time, with a guarantee: **a vet never has two visits at the same time**. Visits live inside each `Owner` aggregate. Vets are a separate aggregate with their own `VetRepository`. Where would you enforce the rule? Give two options and what each costs.',
		hint: 'Ask which aggregate holds the data the rule needs. One vet\'s visits are spread over many owners.',
		answer: [
			'Not in `Owner`: the rule needs every visit of the vet, and those sit in other owners\' aggregates. Vernon\'s rule: model true invariants inside one consistency boundary, and use eventual consistency between aggregates.',
			'Option 1, a small new aggregate: a vet booking keyed by vet and time slot, inserted under a unique index in the same transaction as the visit. The second booking for the same slot fails on the index. Cost: a new table, the visit now references the booking by id, and one transaction now writes two aggregates. You break Vernon\'s rule on purpose, for an invariant that must never break.',
			'Option 2, accept the race and repair: detect overlapping visits afterwards and call the later client to move. Cost: now and then, a client gets a call to change an appointment.',
			'Worth asking first: how often do two desks book the same vet at the same minute? If almost never, option 2 may be enough.'
		],
		steps: [
			{
				title: 'Find where the data lives',
				questions: [
					{ q: 'What data does the rule "a vet never has two visits at the same time" need?', options: ['Every visit of that vet', 'The visits of one owner', 'The birth date of the pet', 'Only the vet\'s name'], answer: 0, why: 'To know a slot is free, you must see all the vet\'s visits, whoever owns the pet.' },
					{ q: 'Where do one vet\'s visits sit today?', options: ['In the vet aggregate', 'In one `Owner` aggregate', 'Spread over many owners\' aggregates', 'Inside `VetRepository`'], answer: 2, why: 'Visits live inside each `Owner`, so one vet\'s visits are in many owners.' },
					{ q: 'Which rule does the `Owner` root enforce today?', options: ['That the visit is in the future', 'That the pet belongs to this owner', 'That the vet is free', 'That the address is valid'], answer: 1, why: '`Owner.addVisit` refuses a pet that is not one of this owner\'s. The future-date rule sits in the controller.' },
					{ q: 'What is an invariant?', options: ['A field that never changes', 'A database index', 'A rule checked once a day', 'A rule that must always hold, checked inside the aggregate'], answer: 3, why: 'An aggregate is the unit that keeps its invariants true on every change.' }
				]
			},
			{
				title: 'Rule out the easy place',
				questions: [
					{ q: 'Can `Owner.addVisit` enforce the rule?', options: ['Yes: it already checks the pet', 'No: it only sees this owner\'s visits', 'Yes, because pets load eagerly', 'No: `Owner` has no `addVisit`'], answer: 1, why: 'The other visits of the vet sit in other owners\' aggregates, out of reach.' },
					{ q: 'What does Vernon\'s rule say?', options: ['Model true invariants inside one consistency boundary, and use eventual consistency between aggregates', 'Put every rule in the controller', 'Make one aggregate per table', 'Always write all aggregates in one transaction'], answer: 0, why: 'One aggregate, one transaction. Between aggregates, things catch up later.' },
					{ q: 'Why not put the check in the visit controller?', options: ['Controllers cannot read the database', 'Spring forbids checks in controllers', 'A check in a controller only guards that one path', 'A controller check is always too slow'], answer: 2, why: 'Another entry point skips the rule, like the future-date check PetClinic keeps in its controller.' },
					{ q: 'The chapter lists this kind of rule as a cost of aggregates. Which kind is it?', options: ['A rule about one value object', 'A rule that spans many aggregates', 'A rule inside one entity', 'A rule about how ids are made'], answer: 1, why: '"A vet is never double-booked" across many owners cannot be enforced inside one aggregate.' }
				]
			},
			{
				title: 'Design option 1',
				questions: [
					{ q: 'Option 1 adds a small aggregate, a vet booking. What is its key?', options: ['The vet and the time slot', 'The owner and the pet', 'The pet and the date', 'Only the visit id'], answer: 0, why: 'One row per vet and slot is exactly what the rule is about.' },
					{ q: 'What stops a second booking for the same slot?', options: ['A check in the controller', 'A nightly job', 'A unique index, in the same transaction as the visit', 'The `Owner` root'], answer: 2, why: 'The second insert for the same vet and slot fails on the index.' },
					{ q: 'How does the visit refer to the booking?', options: ['By holding the whole booking object', 'By id', 'By the vet\'s name', 'It does not refer to it'], answer: 1, why: 'The visit keeps only the booking\'s id, so the booking stays its own aggregate.' },
					{ q: 'What do you break on purpose with option 1?', options: ['Value objects must be immutable', 'Entities need an id', 'Repositories return whole aggregates', 'One transaction now writes two aggregates'], answer: 3, why: 'You go against Vernon\'s rule, for an invariant that must never break. It also costs a new table.' }
				]
			},
			{
				title: 'Weigh option 2 and choose',
				questions: [
					{ q: 'What does option 2 do?', options: ['Accept the race, find overlaps afterwards, and call the later client to move', 'Lock every owner while one desk books', 'Refuse every booking for a busy vet', 'Merge all owners into one aggregate'], answer: 0, why: 'It lets the rare clash happen and repairs it by hand.' },
					{ q: 'What does option 2 cost?', options: ['A new table and a unique index', 'Now and then, a client gets a call to change an appointment', 'A transaction across every owner', 'Nothing at all'], answer: 1, why: 'No new structure, but a real person sometimes has to move a visit.' },
					{ q: 'What do you ask before you choose?', options: ['How many pets each owner has', 'Which database holds the vets', 'How often two desks book the same vet at the same minute', 'Whether the vets prefer email'], answer: 2, why: 'The cost of option 2 grows with how often the clash happens.' },
					{ q: 'Two desks almost never book the same vet at the same minute. Which option may be enough?', options: ['Option 1', 'Option 2', 'Neither: put the rule in `Owner`', 'Both at once'], answer: 1, why: 'If the clash is rare, an occasional phone call is cheaper than a new aggregate.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Two `LocalDate` objects are created separately, and both hold 2026-03-14. How do they compare?',
			options: [
				'Different, because each one is a separate object in memory',
				'Equal only if both belong to the same pet or the same visit',
				'Equal, because a value object is compared by its content',
				'Different, unless both were loaded with the same database id'
			],
			answer: 2,
			why: 'A value object has no identity, so two objects with the same content are equal. The JDK documents `LocalDate` as value-based: equal instances are interchangeable.'
		},
		{
			q: 'Why can the `Owner` aggregate not enforce "a vet never has two visits at the same time"?',
			options: [
				'JPA entities cannot hold business rules, only mapped fields',
				'The rule needs visits from many owners, which live outside this aggregate',
				'Only value objects can hold invariants, never entities or roots',
				'The database cannot run the check inside a single transaction'
			],
			answer: 1,
			why: 'An aggregate can only guarantee rules over the data it holds. One vet\'s visits are spread across many owners, so a check inside one owner sees only a few of them.'
		},
		{
			q: 'PetClinic has an `OwnerRepository` but no repository for pets or visits. What does that say?',
			options: [
				'Owner is the aggregate root, so pets and visits are saved through it',
				'Pets and visits are value objects, so they need no repository',
				'The project forgot two repositories that it should still add',
				'Pets and visits are stored in a different database than owners'
			],
			answer: 0,
			why: 'Each aggregate gets one repository, even when it spans several tables. Pets and visits are entities inside the owner\'s cluster, so they are saved with the owner.'
		}
	],
	recall: {
		q: 'In PetClinic, which class is the aggregate root, and how does a new visit get in?',
		a: '`Owner` is the root. The controller loads the owner from `OwnerRepository`, calls `owner.addVisit(petId, visit)`, which refuses a pet that is not this owner\'s, and saves the owner. Pets and visits have no repository of their own.'
	},
	sources: [
		{ title: 'Evans, DDD Reference: Entities, Value Objects, Aggregates, Repositories, Domain Events', url: 'https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf' },
		{ title: 'Vaughn Vernon, Effective Aggregate Design', url: 'https://www.dddcommunity.org/library/vernon_2011/' },
		{ title: 'Martin Fowler, ValueObject', url: 'https://martinfowler.com/bliki/ValueObject.html' },
		{ title: 'Martin Fowler, DDD_Aggregate', url: 'https://martinfowler.com/bliki/DDD_Aggregate.html' },
		{ title: 'Spring PetClinic, Owner.java', url: `${OWNER}/Owner.java#L67-L186` },
		{ title: 'Spring Data, AbstractAggregateRoot.java', url: `${DATA}/src/main/java/org/springframework/data/domain/AbstractAggregateRoot.java#L37-L71` }
	]
};
