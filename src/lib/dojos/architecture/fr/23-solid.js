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
		'Robert C. Martin a popularisé cinq principes pour ce genre de problème, sous le nom de **SOLID**. Tu en vois trois ici sur du vrai code : une classe qui a trop de rôles, une interface trop large, et des implémentations qui font moins que ce que leur interface promet.'
	],
	terms: [
		{ term: 'Single responsibility (S)', def: 'Responsabilité unique : un module a une seule raison de changer, un seul groupe de personnes ou une seule fonctionnalité qui demande des changements. Tu comptes les sources de changement : une classe peut faire plusieurs choses pour une seule source.' },
		{ term: 'Open/closed (O)', def: 'Ouvert/fermé : tu ajoutes du comportement en ajoutant du code, et tu laisses intact le code qui marche. `BufferedInputStream` en Java ajoute un buffer à n’importe quel `InputStream` en l’enveloppant, sans toucher aux streams de fichier ou de socket.' },
		{ term: 'Liskov substitution (L)', def: 'Substitution de Liskov : toute implémentation d’une interface doit marcher partout où l’interface est attendue. Si une implémentation lève une exception là où les autres marchent, les appelants doivent savoir laquelle ils ont reçue.' },
		{ term: 'Interface segregation (I)', def: 'Ségrégation des interfaces : un appelant ne devrait pas dépendre de méthodes qu’il n’utilise pas. Une interface large force chaque implémentation à remplir des méthodes que personne n’appelle.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['acct["Modèle Account : 607 lignes, 16 concerns"]', 'acct --- rsus["suspensions"]', 'acct --- ravatar["avatar et bannière"]', 'acct --- rcount["compteurs"]', 'acct --- rsearch["recherche"]', 'acct --- rmerge["fusion"]'],
				highlight: ['acct'],
				note: '`Account` enfreint la responsabilité unique. Chaque boîte est un module concern avec sa propre raison de changer, et tous tournent sur le même objet et la même ligne de `accounts` : `suspend!` écrit `suspended_at` sur le compte lui-même. Les concerns coupent le fichier en 16, et la classe garde **un seul état partagé**.'
			},
			{
				add: ['block["BlockService : une seule méthode call"]', 'block -->|"account.block!"| acct'],
				highlight: ['block'],
				note: 'Un niveau au-dessus, chaque service respecte la responsabilité unique : il porte un seul cas d’usage. `BlockService#call` met fin aux abonnements dans les deux sens, retire chaque compte des collections de l’autre, enregistre le blocage et prévient le serveur distant. Il ne change que si le sens de « bloquer » change. Mastodon a environ 80 services de ce genre à la racine de `app/services`.'
			},
			{
				add: ['list["java.util.List : lectures plus mutateurs optionnels"]', 'reader["Appelant qui ne fait que lire"] -->|"get, size, iterator"| list', 'imm["List.of : chaque mutateur lève une exception"] -.->|implémente| list'],
				highlight: ['list', 'reader', 'imm'],
				note: 'Java tord exprès la ségrégation des interfaces. `List` a des méthodes de lecture et des « optional operations » (opérations optionnelles) comme `add` et `remove` : un appelant qui ne fait que lire dépend quand même de toutes. Une liste non modifiable doit quand même avoir `add`, alors elle lève `UnsupportedOperationException`.'
			},
			{
				add: ['caller["addDefaults(list) : list.add(x)"] -->|"ArrayList : marche"| list', 'caller -.->|"List.of : exception à l’exécution"| imm'],
				highlight: ['caller'],
				note: 'Le même choix tord la substitution de Liskov. Passe une `ArrayList` et l’appel marche, passe `List.of(...)` et le même appel lève une exception, alors que les deux compilent comme une `List`. Le contrat autorise l’exception, mais l’appelant doit quand même savoir quelle liste il a reçue.'
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
			'Les lignes 6 à 12 sont sept méthodes qui n’existent que pour lever une exception. `List.of(a, b)` [renvoie un `ImmutableCollections.List12`](' + JDK + '/util/List.java#L956-L958), dont le parent `AbstractImmutableList` étend la classe de la ligne 4.',
			'La doc de [`List.add`](' + JDK + '/util/List.java#L251-L273) la décrit comme une « optional operation » qui lève une exception « if the `add` operation is not supported by this list » (si l’opération `add` n’est pas prise en charge par cette liste). `Collection` dit la même chose de chaque méthode « destructive ». Rien dans le **type** ne te dit quel genre de liste tu tiens.',
			'Les concepteurs de Java ont fait ce choix et expliquent pourquoi. La [FAQ de conception des Collections](https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html) l’appelle « the most controversial design decision in the whole API » (la décision de conception la plus controversée de toute l’API). Découper en modifiable, taille fixe, ajout seul et immuable donnerait « twenty or so interfaces and five iterators » (une vingtaine d’interfaces et cinq itérateurs), et les exceptions à l’exécution resteraient.',
			'Côté Mastodon, `account.rb` inclut les modules `Account::`, [`suspend!`](' + MASTODON + '/app/models/concerns/account/suspensions.rb#L36-L46) met à jour la ligne du compte, et `BlockService#call` porte un seul cas d’usage.'
		]
	},
	tradeoff: {
		gain: [
			'De petites classes avec une seule raison de changer, comme chaque service de Mastodon, permettent à deux fonctionnalités d’avancer en parallèle sans se croiser dans un même fichier.',
			'Avec une interface étroite, une implémentation n’a pas de méthodes qui servent seulement à lever une exception, comme les sept d’`AbstractImmutableCollection`.',
			'Des implémentations substituables te permettent d’en échanger une contre une autre, un faux pour les tests à la place d’un vrai stockage, sans que les appelants vérifient laquelle ils ont reçue.'
		],
		cost: [
			'Chaque principe ajoute des pièces : plus de classes, plus d’interfaces, plus de câblage. Les concepteurs de Java ont jugé quatre interfaces larges moins coûteuses que vingt étroites.',
			'Tu ne peux pas découper une interface qui ne t’appartient pas, comme `java.util.List`. Tu peux seulement l’envelopper dans un type plus étroit à toi, et maintenir cet adaptateur.',
			'Découper une grosse classe n’aide que si tu découpes aussi l’**état**. Déplacer des méthodes dans des modules concern raccourcit le fichier et ne change rien d’autre.'
		]
	},
	task: {
		prompt: 'Dans ta base de code, `OrderService.addDiscounts(List<Discount> discounts)` ajoute une remise fidélité à la liste qu’elle reçoit. Un collègue l’appelle maintenant avec `List.of(promo)`. Dis ce qui se passe, puis propose un changement de conception pour que cette erreur ne puisse pas atteindre la prod.',
		hint: 'De quelles méthodes `addDiscounts` a-t-elle vraiment besoin sur son argument ? Qu’est-ce que changerait un type qui n’offre que celles-là ?',
		answer: [
			'Ça compile. À l’exécution, `add` lève `UnsupportedOperationException`, parce que `List.of` renvoie une liste non modifiable.',
			'Un test qui passe une `ArrayList` passerait. Le bug n’apparaît que sur le chemin qui passe `List.of`.',
			'Première correction, tu laisses l’entrée intacte : tu prends une entrée en lecture seule et tu **renvoies** une nouvelle liste, `List<Discount> withLoyalty(List<Discount> in)`. La liste de l’appelant n’est jamais touchée, donc n’importe quelle `List` marche.',
			'Deuxième correction, tu rétrécis le type : tu acceptes une interface à toi qui n’a que la méthode dont tu as besoin, comme `DiscountSink.add`. Personne ne peut alors passer une liste non modifiable par erreur.',
			'Chaque correction coûte un type de plus ou une copie de plus. Aujourd’hui, la limite n’est écrite que dans la Javadoc.'
		],
		steps: [
			{
				title: 'Dis ce qui se passe',
				questions: [
					{ q: 'Est-ce que `addDiscounts(List.of(promo))` compile ?', options: ['Non : `List.of` ne renvoie pas une `List`', 'Oui : `List.of` renvoie une `List`', 'Seulement avec un cast explicite', 'Seulement sur de vieilles versions de Java'], answer: 1, why: 'Le type est `List`, le compilateur est content. Le problème attend l’exécution.' },
					{ q: 'Que se passe-t-il quand `addDiscounts` ajoute la remise fidélité ?', options: ['La remise est ajoutée comme d’habitude', 'L’appel ne fait rien, sans bruit', '`add` lève `UnsupportedOperationException`', 'Java fait une copie et l’ajoute dedans'], answer: 2, why: 'Chaque méthode qui modifie une collection immuable lève `UnsupportedOperationException`.' },
					{ q: 'Pourquoi `add` lève-t-elle une exception ici ?', options: ['`List.of` renvoie une liste non modifiable', 'La liste est déjà pleine', '`Discount` est une classe immuable', 'Le collègue a oublié d’appeler `new`'], answer: 0, why: '`List.of` renvoie une classe de `ImmutableCollections`, où `add` n’existe que pour lever une exception.' },
					{ q: 'Ton test passe une `ArrayList`. Est-ce qu’il attrape le bug ?', options: ['Oui : toutes les listes se comportent pareil', 'Non : seul le chemin qui passe `List.of` échoue', 'Oui, tant qu’il tourne en CI', 'Non : les tests ne peuvent pas appeler `add`'], answer: 1, why: 'Une `ArrayList` accepte `add`, donc le test passe. Le bug n’apparaît qu’avec `List.of`.' }
				]
			},
			{
				title: 'Nomme le principe enfreint',
				questions: [
					{ q: 'Deux listes compilent toutes les deux comme `List`. L’une marche, l’autre lève une exception. Quel principe plie ?', options: ['Single responsibility', 'Open/closed', 'Liskov substitution', 'Interface segregation'], answer: 2, why: 'Une implémentation qui lève une exception là où les autres marchent ne peut pas les remplacer. L’appelant doit savoir laquelle il a reçue.' },
					{ q: 'Combien de méthodes de `List` `addDiscounts` appelle-t-elle vraiment ?', options: ['Toutes', 'À peu près la moitié', 'Aucune : elle ne fait que lire', 'Une seule : `add`'], answer: 3, why: 'Elle prend toute la `List` et n’utilise qu’une méthode. C’est cet écart que le correctif deux referme.' },
					{ q: 'Où la règle « cette liste peut refuser `add` » est-elle écrite aujourd’hui ?', options: ['Dans le type', 'Seulement dans la Javadoc', 'Dans un avertissement du compilateur', 'Dans la classe `Discount`'], answer: 1, why: '`List.add` est documentée comme une « optional operation ». Rien dans le type ne dit quel genre de liste tu tiens.' },
					{ q: 'Pourquoi les concepteurs de Java ont-ils gardé les opérations optionnelles dans `List` ?', options: ['Découper demanderait une vingtaine d’interfaces et cinq itérateurs', 'Ils n’avaient pas pensé aux listes immuables', 'Les exceptions sont plus rapides que des types en plus', 'La substitution de Liskov n’était pas encore connue'], answer: 0, why: 'La FAQ de conception l’explique : quatre interfaces larges ont été jugées moins chères que vingt étroites.' }
				]
			},
			{
				title: 'Choisis une correction de conception',
				questions: [
					{ q: 'La première correction est `List<Discount> withLoyalty(List<Discount> in)`. Que fait-elle ?', options: ['Elle ajoute à `in` et la renvoie', 'Elle prend une entrée en lecture seule et renvoie une nouvelle liste', 'Elle caste d’abord `in` en `ArrayList`', 'Elle attrape l’exception et réessaie'], answer: 1, why: 'Elle ne touche jamais l’entrée. Elle construit et renvoie une nouvelle liste.' },
					{ q: 'Après la première correction, quelles listes un appelant peut-il passer ?', options: ['Seulement une `ArrayList`', 'Seulement `List.of`', 'N’importe quelle `List`', 'Seulement une `LinkedList`'], answer: 2, why: 'La méthode ne fait que lire son entrée, et toutes les `List` savent être lues.' },
					{ q: 'La deuxième correction rétrécit le type. Qu’accepte alors `addDiscounts` ?', options: ['Une `Collection<Discount>`', 'Un `Object`', 'Un tableau de remises', 'Une interface à toi qui n’a que `add`, comme `DiscountSink`'], answer: 3, why: 'Une interface qui n’a que la méthode dont tu as besoin, c’est le type étroit, et il t’appartient.' },
					{ q: 'Pourquoi la deuxième correction arrête-t-elle l’erreur avant la prod ?', options: ['Personne ne peut passer une liste non modifiable là où un `DiscountSink` est attendu', 'Elle logue un avertissement quand la liste est non modifiable', 'Elle ajoute un test pour `List.of`', 'Elle copie la liste avant d’ajouter'], answer: 0, why: 'La limite passe de la Javadoc au type : le mauvais appel ne rentre plus.' }
				]
			},
			{
				title: 'Pèse le coût',
				questions: [
					{ q: 'Que coûte chaque correction ?', options: ['Rien du tout', 'Un type de plus ou une copie de plus', 'Une réécriture de `OrderService`', 'Un JDK plus récent'], answer: 1, why: 'Une liste renvoyée est une copie. Une interface étroite est un type à écrire et à maintenir.' },
					{ q: '`java.util.List` ne t’appartient pas. Comment obtiens-tu un type étroit ?', options: ['Tu modifies `List` dans le JDK', 'Tu retires `add` par réflexion', 'Tu l’enveloppes dans un type plus étroit à toi et tu maintiens cet adaptateur', 'Tu demandes à chaque appelant de lire la Javadoc'], answer: 2, why: 'Tu ne peux pas découper une interface qui n’est pas à toi. Tu peux seulement l’envelopper, et maintenir l’enveloppe.' },
					{ q: 'Quelle correction laisse ton collègue appeler avec `List.of(promo)` ?', options: ['Renvoyer une nouvelle liste', 'Rétrécir vers `DiscountSink`', 'Caster l’entrée en `ArrayList`', 'Supprimer la remise fidélité'], answer: 0, why: 'La première correction ne fait que lire son entrée, donc une liste non modifiable marche très bien.' },
					{ q: '`AbstractImmutableCollection` redéfinit sept méthodes qui modifient la collection. Qu’est-ce qu’une interface étroite épargne à une implémentation comme elle ?', options: ['Toutes les exceptions du code', 'Le besoin de tests', 'Remplir des méthodes qu’elle ne sait pas faire', 'Les types génériques'], answer: 2, why: 'Avec une interface étroite, une implémentation n’a jamais à remplir des méthodes qu’elle ne sait pas faire.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Quel principe SOLID dit qu’un appelant ne devrait pas être forcé de dépendre de méthodes qu’il n’utilise pas ?',
			options: ['Single responsibility', 'Open/closed', 'Liskov substitution', 'Interface segregation'],
			answer: 3,
			why: 'L’interface segregation porte sur la largeur d’une interface telle que ses appelants la voient. Liskov porte sur les implémentations qui tiennent la promesse d’une interface. La single responsibility compte les groupes de personnes qui demandent à une classe de changer.'
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
			why: 'L’enveloppe ajoute du comportement avec du nouveau code et ne modifie pas les streams de fichier et de socket. Les trois autres options montrent d’autres principes tordus ou cassés.'
		}
	],
	recall: {
		q: 'Pourquoi découper l’`Account` de Mastodon en 16 modules concern ne lui donne-t-il pas une responsabilité unique ?',
		a: 'Les modules sont mélangés dans la même classe et écrivent la même ligne de `accounts`, comme `suspend!` qui remplit `suspended_at`. Un changement sur les suspensions touche encore `Account`. Donner aux suspensions leur propre modèle et leur propre table supprimerait cette raison de changer.'
	},
	sources: [
		{ title: 'Robert C. Martin, The Single Responsibility Principle', url: 'https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html' },
		{ title: 'Robert C. Martin, Clean Architecture, part III: design principles', url: 'https://www.oreilly.com/library/view/clean-architecture-a/9780134494272/' },
		{ title: 'Barbara Liskov and Jeannette Wing, A behavioral notion of subtyping', url: 'https://www.cs.cmu.edu/~wing/publications/LiskovWing94.pdf' },
		{ title: 'Java Collections API Design FAQ', url: 'https://docs.oracle.com/javase/8/docs/technotes/guides/collections/designfaq.html' },
		{ title: 'OpenJDK, ImmutableCollections.java', url: `${IMMUTABLE}#L156-L168` },
		{ title: 'OpenJDK, ImmutableCollections.java : AbstractImmutableList', url: `${IMMUTABLE}#L268-L269` },
		{ title: 'OpenJDK, Collection.java : opérations optionnelles', url: `${JDK}/util/Collection.java#L141-L146` },
		{ title: 'Mastodon, account.rb : les includes Account::', url: `${MASTODON}/app/models/account.rb#L90-L112` },
		{ title: 'Mastodon, block_service.rb', url: `${MASTODON}/app/services/block_service.rb#L3-L22` }
	]
};
