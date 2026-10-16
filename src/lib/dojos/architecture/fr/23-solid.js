const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const JDK = 'https://github.com/openjdk/jdk/blob/d0287a5e875e74cb90713beaa45672326807e2d1/src/java.base/share/classes/java';
const IMMUTABLE = `${JDK}/util/ImmutableCollections.java`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'solid',
	part: 'La boîte à patterns',
	title: 'SOLID : cinq principes, lus sur du vrai code',
	minutes: 10,
	hook: [
		'Le modèle `Account` de Mastodon fait **607 lignes**. Il inclut aussi 16 modules nommés `Account::Something`, soit 1 130 lignes de plus : avatars, compteurs, recherche, fusion, suspensions, mises en sourdine, et d’autres encore.',
		'Une règle de modération, un nouveau réglage d’image, un ajustement de la recherche : chacun modifie un fichier qui fait partie d’`Account`. Deux équipes qui travaillent sur deux fonctionnalités se retrouvent dans la même classe.',
		'Cinq principes popularisés par Robert C. Martin, connus sous le nom de **SOLID**, visent ce genre de douleur. Aujourd’hui, tu en lis trois sur du vrai code : une classe qui a trop de rôles, une interface trop large, et des implémentations qui font moins que ce que leur interface promet.'
	],
	terms: [
		{ term: 'Single responsibility (S)', def: 'Responsabilité unique : un module a une seule raison de changer, un seul groupe de personnes ou une seule fonctionnalité qui demande des changements. Pas « il fait une seule chose », mais « une seule source de changement ».' },
		{ term: 'Open/closed (O)', def: 'Ouvert/fermé : tu ajoutes du comportement en ajoutant du code, pas en modifiant du code qui marche. `BufferedInputStream` en Java ajoute un buffer à n’importe quel `InputStream` en l’enveloppant, sans toucher aux streams de fichier ou de socket.' },
		{ term: 'Liskov substitution (L)', def: 'Substitution de Liskov : toute implémentation d’une interface doit marcher partout où l’interface est attendue. Si une implémentation lève une exception là où les autres marchent, les appelants doivent savoir laquelle ils ont reçue.' },
		{ term: 'Interface segregation (I)', def: 'Ségrégation des interfaces : un appelant ne devrait pas dépendre de méthodes qu’il n’utilise pas. Une interface large force chaque implémentation à remplir des méthodes que personne n’appelle.' },
		{ term: 'Dependency inversion (D)', def: 'Inversion des dépendances : le code de haut niveau dépend d’une interface qui lui appartient, et le code de bas niveau l’implémente. Le jour 11, c’est ce principe en grandeur nature.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['acct["Modèle Account : 607 lignes, 16 concerns"]', 'acct --- rsus["suspensions"]', 'acct --- ravatar["avatar et bannière"]', 'acct --- rcount["compteurs"]', 'acct --- rsearch["recherche"]', 'acct --- rmerge["fusion"]'],
				highlight: ['acct'],
				note: '**S, cassé.** Chaque boîte est un module concern, et une raison de changer différente. Tous tournent sur le même objet et la même ligne de `accounts` : `suspend!` écrit `suspended_at` sur le compte lui-même. Les concerns découpent le **fichier**, pas la **responsabilité**.'
			},
			{
				add: ['block["BlockService : une seule méthode call"]', 'block -->|"account.block!"| acct'],
				highlight: ['block'],
				note: '**S, respecté.** Un niveau au-dessus, chaque service est un cas d’usage. `BlockService#call` bloque un compte : il met fin aux abonnements dans les deux sens, retire chaque compte des collections de l’autre, enregistre le blocage et prévient le serveur distant. Une seule raison de changer : ce que bloquer veut dire. Mastodon a environ 80 services de ce genre à la racine de `app/services`.'
			},
			{
				add: ['list["java.util.List : lectures plus mutateurs optionnels"]', 'reader["Appelant qui ne fait que lire"] -->|"get, size, iterator"| list', 'imm["List.of : chaque mutateur lève une exception"] -.->|implémente| list'],
				highlight: ['list', 'reader', 'imm'],
				note: '**I, tordu exprès.** `List` a des méthodes de lecture et des « optional operations » (opérations optionnelles) comme `add` et `remove`. Un appelant qui ne fait que lire dépend quand même de toutes. Une liste non modifiable doit quand même avoir `add`, donc elle lève `UnsupportedOperationException`.'
			},
			{
				add: ['caller["addDefaults(list) : list.add(x)"] -->|"ArrayList : marche"| list', 'caller -.->|"List.of : exception à l’exécution"| imm'],
				highlight: ['caller'],
				note: '**L, tordu.** Passe une `ArrayList` et l’appel marche. Passe `List.of(...)` et le même appel lève une exception. Les deux compilent, les deux sont une `List`. Le contrat autorise l’exception, donc c’est légal, mais l’appelant doit quand même savoir quelle liste il a reçue.'
			}
		]
	},
	example: {
		title: 'java/util/ImmutableCollections.java : chaque mutateur lève une exception',
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
			'`List.of(a, b)` [renvoie un `ImmutableCollections.List12`](' + JDK + '/util/List.java#L956-L958), dont le parent [`AbstractImmutableList` étend cette classe](' + IMMUTABLE + '#L268-L269). Sept méthodes qui n’existent que pour lever une exception.',
			'L’interface te prévient. [`List.add`](' + JDK + '/util/List.java#L251-L273) est documentée comme une « optional operation » qui lève une exception « if the `add` operation is not supported by this list » (si l’opération `add` n’est pas prise en charge par cette liste). [`Collection`](' + JDK + '/util/Collection.java#L141-L146) dit la même chose de chaque méthode « destructive ». Rien dans le **type** ne dit laquelle tu tiens.',
			'C’était un choix, et les concepteurs expliquent pourquoi. La [FAQ de conception des Collections](https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html) l’appelle « the most controversial design decision in the whole API » (la décision de conception la plus controversée de toute l’API). Découper en modifiable, taille fixe, ajout seul et immuable donnerait « twenty or so interfaces and five iterators » (une vingtaine d’interfaces et cinq itérateurs), sans même supprimer les exceptions à l’exécution.',
			'Le cas SRP côte à côte : [les includes `Account::`](' + MASTODON + '/app/models/account.rb#L90-L112), [`suspend!`](' + MASTODON + '/app/models/concerns/account/suspensions.rb#L36-L46) qui met à jour la ligne du compte, et [`BlockService#call`](' + MASTODON + '/app/services/block_service.rb#L3-L22).'
		]
	},
	tradeoff: {
		gain: [
			'De petites classes avec une seule raison de changer, comme chaque service de Mastodon, permettent à deux fonctionnalités d’avancer en parallèle sans se croiser dans un même fichier.',
			'Des interfaces étroites rendent une implémentation honnête peu coûteuse à écrire : pas de méthodes qui n’existent que pour lever une exception.',
			'Des implémentations substituables te permettent d’en échanger une contre une autre, un faux pour les tests à la place d’un vrai stockage, sans que les appelants vérifient laquelle ils ont reçue.'
		],
		cost: [
			'Chaque principe ajoute des pièces : plus de classes, plus d’interfaces, plus de câblage. Les concepteurs de Java ont jugé quatre interfaces larges moins coûteuses que vingt étroites.',
			'Certaines interfaces ne t’appartiennent pas. Tu ne peux pas découper `java.util.List`. Tu peux seulement l’envelopper dans un type plus étroit à toi, et maintenir cet adaptateur.',
			'Découper une grosse classe n’aide que si tu découpes aussi l’**état**. Déplacer des méthodes dans des modules concern raccourcit le fichier et ne change rien d’autre.'
		]
	},
	task: {
		prompt: 'Dans ta base de code, `OrderService.addDiscounts(List<Discount> discounts)` ajoute une remise fidélité à la liste qu’elle reçoit. Un collègue l’appelle maintenant avec `List.of(promo)`. Dis ce qui se passe, puis propose un changement de conception pour que cette erreur ne puisse pas atteindre la prod.',
		hint: 'De quelles méthodes `addDiscounts` a-t-elle vraiment besoin sur son argument ? Qu’est-ce que changerait un type qui n’offre que celles-là ?',
		answer: [
			'Ça compile. À l’exécution, `add` lève `UnsupportedOperationException`, parce que `List.of` renvoie une liste non modifiable.',
			'Un test qui passe une `ArrayList` passerait. Le bug n’apparaît que sur le chemin qui passe `List.of`.',
			'Corrige en ne modifiant pas ce que tu n’as pas créé : prends une entrée en lecture seule et **renvoie** une nouvelle liste, `List<Discount> withLoyalty(List<Discount> in)`. La liste de l’appelant n’est jamais touchée, donc n’importe quelle `List` marche.',
			'Ou rétrécis le type : accepte une interface à toi qui n’a que la méthode dont tu as besoin, comme `DiscountSink.add`, pour qu’une liste non modifiable ne puisse pas être passée par erreur.',
			'Le coût à nommer : un type de plus ou une copie de plus, pour une limite qui n’est aujourd’hui écrite que dans la Javadoc.'
		]
	},
	quiz: [
		{
			q: 'Quel principe SOLID dit qu’un appelant ne devrait pas être forcé de dépendre de méthodes qu’il n’utilise pas ?',
			options: ['Single responsibility', 'Open/closed', 'Liskov substitution', 'Interface segregation'],
			answer: 3,
			why: 'L’interface segregation porte sur la largeur d’une interface telle que ses appelants la voient. Liskov porte sur les implémentations qui tiennent la promesse d’une interface. La single responsibility porte sur les raisons de changer.'
		},
		{
			q: 'Quel changement réduit vraiment le nombre de raisons qu’a l’`Account` de Mastodon de changer ?',
			options: ['Déplacer encore plus de ses méthodes dans de nouveaux modules concern `Account::`, un par fonctionnalité', 'Donner aux suspensions leur propre modèle et leur propre table, pour qu’`Account` ne porte plus cet état', 'Le renommer en `UserAccount` pour que le nom dise à quoi la classe sert vraiment', 'Ajouter des commentaires qui regroupent ses méthodes par fonctionnalité, pour que chaque équipe trouve sa partie'],
			answer: 1,
			why: 'Les concerns sont mélangés dans la même classe et partagent ses colonnes, donc un changement sur les suspensions touche encore `Account`. Sortir l’état et le comportement supprime cette raison de changer.'
		},
		{
			q: 'Lequel de ces exemples montre le principe ouvert/fermé à l’œuvre ?',
			options: ['Une implémentation de liste dont tous les mutateurs lèvent une exception, pour que personne ne la modifie', 'Un modèle de 607 lignes découpé en 16 modules mélangés dedans, un fichier par fonctionnalité', '`BufferedInputStream` ajoute un buffer en enveloppant n’importe quel `InputStream`, sans le modifier', 'Un constructeur à 28 paramètres, pour que chaque comportement se règle de l’extérieur'],
			answer: 2,
			why: 'L’enveloppe ajoute du comportement avec du nouveau code et laisse les streams qui marchent fermés au changement. Les trois autres sont des symptômes d’autres principes tordus ou cassés.'
		}
	],
	takeaway: 'Utilise SOLID comme une série de questions sur le changement : qui demande des changements à cette classe, quelles méthodes cet appelant utilise-t-il vraiment, et chaque implémentation tient-elle la promesse de son interface ?',
	sources: [
		{ title: 'Robert C. Martin, The Single Responsibility Principle', url: 'https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html' },
		{ title: 'Robert C. Martin, Clean Architecture, part III: design principles', url: 'https://www.oreilly.com/library/view/clean-architecture-a/9780134494272/' },
		{ title: 'Barbara Liskov and Jeannette Wing, A behavioral notion of subtyping', url: 'https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf' },
		{ title: 'Java Collections API Design FAQ', url: 'https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html' },
		{ title: 'OpenJDK, ImmutableCollections.java', url: `${IMMUTABLE}#L156-L168` }
	]
};
