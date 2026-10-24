const REPO = 'https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6';
const OWNER = `${REPO}/src/main/java/org/springframework/samples/petclinic/owner`;
const DATA = 'https://github.com/spring-projects/spring-data-commons/blob/10feb2ab4bb493498ac8843ff6676a035e4f9069';
const JDK = 'https://github.com/openjdk/jdk/blob/d0287a5e875e74cb90713beaa45672326807e2d1/src/java.base/share/classes/java';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ddd-building-blocks',
	part: 'La boîte à patterns',
	title: 'Les briques du DDD : à l’intérieur d’un bounded context',
	minutes: 10,
	hook: [
		'Alice amène son chat Leo chez le vétérinaire. L’accueil retrouve Alice, choisit Leo parmi ses animaux, et réserve une visite pour demain : « vaccin annuel ».',
		'Certaines règles doivent **toujours** tenir pour cette réservation. Une visite appartient à un animal, cet animal appartient à Alice, et une nouvelle visite est dans le futur. Si chaque controller vérifie lui-même ces règles, il suffit d’un controller qui en oublie une pour laisser passer une mauvaise visite.',
		'Les jours 20 et 21 ont tracé les frontières entre les bounded contexts. Pour l’intérieur d’un contexte, Eric Evans a nommé les pièces : value objects, entities, **aggregates**, repositories, et plus tard domain events. Spring PetClinic, l’application d’exemple classique de Spring, en contient la plupart.'
	],
	terms: [
		{ term: 'Value object', def: 'Objet valeur : un objet défini uniquement par sa valeur. Il est immuable, comparé par son contenu, et se vérifie lui-même à sa construction. Deux dates qui disent toutes les deux 2026-03-14 sont la même date.' },
		{ term: 'Entity', def: 'Entité : un objet qui a une identité, et cette identité dure pendant que ses attributs changent. Leo reste le même animal quand on corrige son nom ou sa date de naissance.' },
		{ term: 'Aggregate', def: 'Agrégat : un groupe d’objets modifiés comme une seule unité, à travers une seule **racine**. Ses invariants, les règles qui doivent toujours tenir, sont vérifiés à l’intérieur.' },
		{ term: 'Repository', def: 'Dépôt : une interface qui ressemble à une collection d’aggregates. Tu ajoutes, cherches et retires des aggregates entiers, et le code de la base de données reste derrière.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['date["LocalDate : 2026-03-14"]', 'addr["address, city, telephone : trois Strings"]'],
				highlight: ['date', 'addr'],
				note: 'PetClinic utilise un value object et en rate un autre. Les dates de naissance et de visite sont des `java.time.LocalDate` : immuables, égales par leur contenu. L’adresse, la ville et le téléphone du propriétaire sont trois simples chaînes, et rien ne les regroupe ni ne les vérifie comme une seule valeur.'
			},
			{
				add: ['owner["Owner (racine) : id, name, pets"]', 'pet["Pet : id, name, birthDate, type"]', 'visit["Visit : id, date, description"]', 'owner --> pet', 'pet --> visit', 'pet --> date', 'owner --> addr'],
				highlight: ['owner', 'pet', 'visit'],
				note: '`Owner`, `Pet` et `Visit` sont des entities : les trois étendent `BaseEntity`, qui porte un `id`. Un objet sans id est `isNew`. Leo reste Leo après une modification, parce que son id ne change pas.'
			},
			{
				add: ['add["owner.addVisit(petId, visit)"] -->|"trouve l’animal, vérifie qu’il existe"| owner'],
				highlight: ['add', 'owner'],
				note: '`Owner` est la racine de l’aggregate. Il porte ses animaux, chaque animal porte ses visites, et le mapping propage chaque changement en cascade depuis le propriétaire. Pour ajouter une visite, tu appelles la racine avec un id d’animal, et elle refuse un animal qui n’appartient pas à ce propriétaire.'
			},
			{
				add: ['repo["OwnerRepository"] -->|"findById, save : des owners entiers"| owner', 'ctl["VisitController"] -->|"charge, addVisit, save"| repo'],
				highlight: ['repo', 'ctl'],
				note: 'PetClinic a un `OwnerRepository`, et aucun repository pour les animaux ou les visites. Le controller des visites charge le propriétaire, ajoute la visite à travers lui, et enregistre le propriétaire. Le propriétaire, ses animaux et leurs visites se chargent et s’enregistrent ensemble.'
			},
			{
				add: ['agg["Spring Data AbstractAggregateRoot : registerEvent"]', 'agg -.->|"option : VisitBooked, publié au save"| repo', 'class agg ext'],
				highlight: ['agg'],
				note: 'Un domain event est un fait au passé, comme « une visite a été réservée », et PetClinic n’en publie aucun. Spring Data propose une classe de base pour les racines : `registerEvent` garde un événement dans l’aggregate, et le repository le publie au `save`. Un e-mail de rappel pourrait alors l’écouter sans que `Owner` le sache.'
			}
		]
	},
	example: {
		title: 'owner/Owner.java : la racine et son groupe',
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
			'La ligne 1 trace la frontière de l’aggregate dans JPA : avec `cascade = CascadeType.ALL`, enregistrer ou supprimer le propriétaire enregistre ou supprime aussi ses animaux. [`Pet`](' + OWNER + '/Pet.java#L56-L83) fait de même pour ses visites.',
			'Les lignes 6 à 8 ouvrent une brèche dans la frontière : `getPets()` renvoie la liste vivante, donc n’importe quel appelant peut ajouter un animal sans passer par `addPet`. Le [controller des visites](' + OWNER + '/VisitController.java#L63-L112) appelle aussi `pet.addVisit` directement pendant qu’il construit le formulaire, avant d’appeler `owner.addVisit` à la soumission.',
			'La règle « une nouvelle visite est dans le futur » se trouve dans le controller, `!visit.getDate().isAfter(LocalDate.now())`, et `Visit` ne la vérifie pas. Le [constructeur de `Visit`](' + OWNER + '/Visit.java#L50-L52) met demain par défaut, mais son setter accepte n’importe quelle date. Un autre point d’entrée pourrait réserver une visite l’an dernier.',
			'La doc de [`LocalDate`](' + JDK + '/time/LocalDate.java#L131-L146) la décrit comme « value-based » : les instances égales sont « interchangeable », et la classe est « immutable and thread-safe » (immuable et thread-safe). La classe de base pour les domain events est `AbstractAggregateRoot`, dans Spring Data.'
		]
	},
	tradeoff: {
		gain: [
			'Une `LocalDate` se vérifie elle-même à sa construction, donc le code qui en reçoit une ne la parse ni ne la vérifie à nouveau.',
			'Les appelants chargent et enregistrent un `Owner` entier, donc la règle « cet animal est à toi » vit dans une seule méthode, `Owner.addVisit`.',
			'`OwnerRepository` n’est qu’une interface qui étend `JpaRepository`, et les controllers ne voient jamais de SQL.'
		],
		cost: [
			'Une règle dans la racine ne protège que les chemins qui passent par la racine. Un getter qui renvoie la liste vivante, ou une vérification dans un controller, laisse d’autres chemins contourner la règle.',
			'Une règle qui couvre deux aggregates, comme « un vétérinaire n’a jamais deux rendez-vous en même temps » à travers de nombreux propriétaires, ne peut pas être garantie à l’intérieur d’un seul.',
			'Chaque fois que PetClinic charge un propriétaire, il récupère aussi tous ses animaux et leurs visites, en eager (`FetchType.EAGER` à la ligne 1).'
		]
	},
	task: {
		prompt: 'Le produit veut que chaque visite indique un vétérinaire et une heure, avec une garantie : **un vétérinaire n’a jamais deux visites à la même heure**. Les visites vivent dans chaque aggregate `Owner`. Les vétérinaires sont un aggregate séparé, avec leur propre `VetRepository`. Où ferais-tu respecter cette règle ? Donne deux options et ce que chacune coûte.',
		hint: 'Demande-toi quel aggregate porte les données dont la règle a besoin. Les visites d’un même vétérinaire sont réparties entre de nombreux propriétaires.',
		answer: [
			'Pas dans `Owner` : la règle a besoin de toutes les visites du vétérinaire, et elles sont dans les aggregates d’autres propriétaires. La règle de Vernon : modélise les vrais invariants à l’intérieur d’une seule frontière de cohérence, et utilise la cohérence à terme entre aggregates.',
			'Option 1, un petit aggregate nouveau : une réservation de vétérinaire, avec comme clé le vétérinaire et le créneau, insérée sous un index unique dans la même transaction que la visite. La deuxième réservation sur le même créneau échoue sur l’index. Coût : une nouvelle table, la visite référence maintenant la réservation par id, et une seule transaction écrit désormais deux aggregates. Tu enfreins la règle de Vernon exprès, pour un invariant qui ne doit jamais casser.',
			'Option 2, accepter la course et réparer : détecter les visites qui se chevauchent après coup et appeler le client arrivé en second pour déplacer son rendez-vous. Coût : de temps en temps, un client reçoit un appel pour changer son rendez-vous.',
			'À demander d’abord : à quelle fréquence deux postes d’accueil réservent-ils le même vétérinaire à la même minute ? Si c’est presque jamais, l’option 2 peut suffire.'
		],
		steps: [
			{
				title: 'Trouve où sont les données',
				questions: [
					{ q: 'De quelles données la règle « un vétérinaire n’a jamais deux visites à la même heure » a-t-elle besoin ?', options: ['De toutes les visites de ce vétérinaire', 'Des visites d’un seul propriétaire', 'De la date de naissance de l’animal', 'Seulement du nom du vétérinaire'], answer: 0, why: 'Pour savoir qu’un créneau est libre, tu dois voir toutes les visites du vétérinaire, quel que soit le propriétaire de l’animal.' },
					{ q: 'Où sont les visites d’un même vétérinaire aujourd’hui ?', options: ['Dans l’aggregate du vétérinaire', 'Dans un seul aggregate `Owner`', 'Réparties dans les aggregates de nombreux propriétaires', 'Dans `VetRepository`'], answer: 2, why: 'Les visites vivent dans chaque `Owner` : les visites d’un vétérinaire sont donc chez de nombreux propriétaires.' },
					{ q: 'Quelle règle la racine `Owner` fait-elle respecter aujourd’hui ?', options: ['Que la visite est dans le futur', 'Que l’animal appartient à ce propriétaire', 'Que le vétérinaire est libre', 'Que l’adresse est valide'], answer: 1, why: '`Owner.addVisit` refuse un animal qui n’est pas à ce propriétaire. La règle de la date future est dans le controller.' },
					{ q: 'Qu’est-ce qu’un invariant ?', options: ['Un champ qui ne change jamais', 'Un index de base de données', 'Une règle vérifiée une fois par jour', 'Une règle qui doit toujours tenir, vérifiée à l’intérieur de l’aggregate'], answer: 3, why: 'Un aggregate est l’unité qui garde ses invariants vrais à chaque changement.' }
				]
			},
			{
				title: 'Écarte la place facile',
				questions: [
					{ q: 'Est-ce que `Owner.addVisit` peut faire respecter la règle ?', options: ['Oui : elle vérifie déjà l’animal', 'Non : elle ne voit que les visites de ce propriétaire', 'Oui, parce que les animaux sont chargés en eager', 'Non : `Owner` n’a pas de `addVisit`'], answer: 1, why: 'Les autres visites du vétérinaire sont dans les aggregates d’autres propriétaires, hors de portée.' },
					{ q: 'Que dit la règle de Vernon ?', options: ['Modélise les vrais invariants dans une seule frontière de cohérence, et utilise la cohérence à terme entre aggregates', 'Mets chaque règle dans le controller', 'Fais un aggregate par table', 'Écris toujours tous les aggregates dans une seule transaction'], answer: 0, why: 'Un aggregate, une transaction. Entre aggregates, les choses se rattrapent plus tard.' },
					{ q: 'Pourquoi ne pas mettre la vérification dans le controller des visites ?', options: ['Les controllers ne peuvent pas lire la base', 'Spring interdit les vérifications dans les controllers', 'Une vérification dans un controller ne protège que ce chemin-là', 'Une vérification dans un controller est toujours trop lente'], answer: 2, why: 'Un autre point d’entrée saute la règle, comme le contrôle de date future que PetClinic garde dans son controller.' },
					{ q: 'Le chapitre range ce genre de règle parmi les coûts des aggregates. De quel genre s’agit-il ?', options: ['Une règle sur un seul value object', 'Une règle qui couvre plusieurs aggregates', 'Une règle à l’intérieur d’une seule entité', 'Une règle sur la façon de créer les id'], answer: 1, why: '« Un vétérinaire n’est jamais réservé deux fois » sur de nombreux propriétaires ne peut pas être garanti dans un seul aggregate.' }
				]
			},
			{
				title: 'Conçois l’option 1',
				questions: [
					{ q: 'L’option 1 ajoute un petit aggregate, une réservation de vétérinaire. Quelle est sa clé ?', options: ['Le vétérinaire et le créneau', 'Le propriétaire et l’animal', 'L’animal et la date', 'Seulement l’id de la visite'], answer: 0, why: 'Une ligne par vétérinaire et par créneau, c’est exactement le sujet de la règle.' },
					{ q: 'Qu’est-ce qui bloque une deuxième réservation sur le même créneau ?', options: ['Une vérification dans le controller', 'Un job de nuit', 'Un index unique, dans la même transaction que la visite', 'La racine `Owner`'], answer: 2, why: 'La deuxième insertion pour le même vétérinaire et le même créneau échoue sur l’index.' },
					{ q: 'Comment la visite référence-t-elle la réservation ?', options: ['En contenant tout l’objet réservation', 'Par id', 'Par le nom du vétérinaire', 'Elle ne la référence pas'], answer: 1, why: 'La visite ne garde que l’id de la réservation : la réservation reste un aggregate à part.' },
					{ q: 'Qu’enfreins-tu exprès avec l’option 1 ?', options: ['Les value objects doivent être immuables', 'Les entités ont besoin d’un id', 'Les repositories renvoient des aggregates entiers', 'Une seule transaction écrit désormais deux aggregates'], answer: 3, why: 'Tu vas contre la règle de Vernon, pour un invariant qui ne doit jamais casser. Ça coûte aussi une nouvelle table.' }
				]
			},
			{
				title: 'Pèse l’option 2 et choisis',
				questions: [
					{ q: 'Que fait l’option 2 ?', options: ['Accepter la course, repérer les chevauchements après coup, et appeler le client arrivé en second', 'Verrouiller chaque propriétaire pendant qu’un poste réserve', 'Refuser toute réservation pour un vétérinaire occupé', 'Fusionner tous les propriétaires en un seul aggregate'], answer: 0, why: 'Elle laisse le conflit rare arriver et le répare à la main.' },
					{ q: 'Que coûte l’option 2 ?', options: ['Une nouvelle table et un index unique', 'De temps en temps, un client reçoit un appel pour changer son rendez-vous', 'Une transaction sur tous les propriétaires', 'Rien du tout'], answer: 1, why: 'Pas de nouvelle structure, mais une vraie personne doit parfois déplacer une visite.' },
					{ q: 'Que demandes-tu avant de choisir ?', options: ['Combien d’animaux a chaque propriétaire', 'Quelle base contient les vétérinaires', 'À quelle fréquence deux postes réservent le même vétérinaire à la même minute', 'Si les vétérinaires préfèrent l’e-mail'], answer: 2, why: 'Le coût de l’option 2 grandit avec la fréquence du conflit.' },
					{ q: 'Deux postes ne réservent presque jamais le même vétérinaire à la même minute. Quelle option peut suffire ?', options: ['L’option 1', 'L’option 2', 'Aucune : mets la règle dans `Owner`', 'Les deux à la fois'], answer: 1, why: 'Si le conflit est rare, un appel de temps en temps coûte moins cher qu’un nouvel aggregate.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Deux objets `LocalDate` sont créés séparément, et tous les deux contiennent 2026-03-14. Comment se comparent-ils ?',
			options: [
				'Différents, parce que chacun est un objet distinct en mémoire',
				'Égaux seulement s’ils appartiennent au même animal ou à la même visite',
				'Égaux, parce qu’un value object se compare par son contenu',
				'Différents, sauf s’ils ont été chargés avec le même id en base'
			],
			answer: 2,
			why: 'Un value object n’a pas d’identité : deux objets au contenu identique sont égaux. Le JDK documente `LocalDate` comme value-based : les instances égales sont interchangeables.'
		},
		{
			q: 'Pourquoi l’aggregate `Owner` ne peut-il pas garantir « un vétérinaire n’a jamais deux visites à la même heure » ?',
			options: [
				'Les entités JPA ne portent que des champs mappés, pas de règles métier',
				'La règle a besoin des visites de nombreux propriétaires, hors de cet aggregate',
				'Seuls les value objects peuvent porter des invariants, jamais les entities',
				'La base ne peut pas faire la vérification dans une seule transaction'
			],
			answer: 1,
			why: 'Un aggregate ne peut garantir que des règles sur les données qu’il porte. Les visites d’un vétérinaire sont réparties entre de nombreux propriétaires, donc une vérification à l’intérieur d’un seul propriétaire n’en voit que quelques-unes.'
		},
		{
			q: 'PetClinic a un `OwnerRepository` mais aucun repository pour les animaux ou les visites. Qu’est-ce que ça dit ?',
			options: [
				'Owner est la racine de l’aggregate, les animaux et visites passent par lui',
				'Les animaux et les visites sont des value objects, sans besoin de repository',
				'Le projet a oublié deux repositories qu’il faudrait encore ajouter',
				'Les animaux et les visites sont stockés dans une autre base que les propriétaires'
			],
			answer: 0,
			why: 'Chaque aggregate a un seul repository, même quand il couvre plusieurs tables. Les animaux et les visites sont des entities à l’intérieur du groupe du propriétaire, donc ils s’enregistrent avec lui.'
		}
	],
	recall: {
		q: 'Dans PetClinic, quelle classe est la racine de l’aggregate, et comment une nouvelle visite y entre-t-elle ?',
		a: '`Owner` est la racine. Le controller charge le propriétaire depuis `OwnerRepository`, appelle `owner.addVisit(petId, visit)`, qui refuse un animal qui n’est pas à ce propriétaire, puis enregistre le propriétaire. Les animaux et les visites n’ont pas de repository à eux.'
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
