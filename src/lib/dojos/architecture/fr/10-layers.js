const REPO = 'https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb';
const P = 'src/main/kotlin/com/google/samples/apps/nowinandroid';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'layers',
	part: 'À l’intérieur d’un service',
	title: 'Les couches : les imports ne vont que dans un sens',
	minutes: 10,
	hook: [
		'Ouvre l’écran Interests dans Now in Android, l’appli de référence de l’équipe Android construite avec Kotlin et Jetpack Compose. La liste des sujets traverse trois **couches** : UI, domaine et données. Chaque couche a son propre module Gradle : `feature/interests/impl`, `core/domain`, `core/data`.',
		'Les modules suivent une règle : **une couche ne peut utiliser que la couche du dessous**. L’UI utilise le domaine, le domaine utilise la couche de données, jamais l’inverse. Le build vérifie cette règle, car un module ne peut pas importer une classe d’un module dont il ne dépend pas.',
		'Grâce à cette règle, tu peux changer la façon dont la couche de données stocke les sujets sans lire le code de l’UI. Plus bas, tu suis un écran à travers les trois couches, puis tu trouves l’endroit où l’appli saute le domaine exprès.'
	],
	terms: [
		{ term: 'Couche', def: 'Un ensemble de code avec un seul type de travail : dessiner l’écran, appliquer les règles de l’appli, stocker et récupérer les données.' },
		{ term: 'Règle de dépendance', def: 'Ici : l’UI dépend du domaine, et le domaine dépend des données. Aucun import ne remonte, donc la couche la plus basse en sait le moins sur les autres.' },
		{ term: 'Couche ouverte', def: 'Une couche que celle du dessus peut sauter, pour appeler directement la couche en dessous. Avec une couche fermée, chaque appel doit passer par elle.' },
		{ term: 'Composition root (racine de composition)', def: 'Le seul endroit autorisé à connaître à la fois une interface et son implémentation, pour les brancher ensemble. Ici, le `DataModule` Hilt.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user(["L’utilisateur ouvre Interests"]) --> vm["UI : InterestsViewModel"]', 'vm -->|"invoke"| uc["domaine : GetFollowableTopicsUseCase"]'],
				highlight: ['user', 'vm', 'uc'],
				note: 'La couche UI demande les sujets via un use case. Le use case du **domaine** combine deux flux, tous les sujets et les ids suivis par l’utilisateur, en une seule liste de `FollowableTopic`. Il ne fait référence à aucun écran.'
			},
			{
				add: ['uc --> trepo["données : TopicsRepository, interface"]', 'uc --> urepo["données : UserDataRepository, interface"]'],
				highlight: ['trepo', 'urepo'],
				note: 'Le use case ne connaît que des **interfaces**, publiées par la couche de données. Dans cette appli, le domaine s’appuie sur les données, comme le décrit le guide d’architecture Android. En Clean Architecture, c’est le domaine qui posséderait les interfaces.'
			},
			{
				add: ['impl["données : OfflineFirstTopicsRepository, internal"] -.->|"implémente"| trepo', 'impl -->|"lit"| db[("Base Room")]', 'impl -.->|"synchro seulement"| net["core/network : source de données"]'],
				highlight: ['impl', 'db', 'net'],
				note: 'L’implémentation lit **uniquement la base locale**, donc l’écran marche hors ligne. La source de données réseau se contente de synchroniser cette base. La classe est `internal` : le code hors de `core/data` ne peut même pas la nommer.'
			},
			{
				add: ['bind["données : DataModule, Hilt"] -.->|"TopicsRepository, c’est OfflineFirstTopicsRepository"| impl'],
				highlight: ['bind'],
				note: '`DataModule` choisit l’implémentation, avec un `@Binds` par interface. Il joue le rôle de **composition root**. Il se trouve dans `core/data`, donc il a le droit de voir les classes `internal`.'
			},
			{
				add: ['vm -->|"setTopicIdFollowed, saute le domaine"| urepo'],
				highlight: ['vm', 'urepo'],
				note: 'Quand tu touches « suivre », le ViewModel appelle le repository **directement** et saute le domaine. La doc : les événements sont « gérés par la couche UI qui appelle directement des méthodes sur les repositories ». Dans cette appli, le domaine est donc une couche ouverte.'
			}
		]
	},
	example: {
		title: 'feature/interests/impl/.../InterestsViewModel.kt, deux chemins vers le bas',
		repo: 'android/nowinandroid',
		url: `${REPO}/feature/interests/impl/${P}/feature/interests/impl/InterestsViewModel.kt#L22-L70`,
		lang: 'kotlin',
		code: `import com.google.samples.apps.nowinandroid.core.data.repository.UserDataRepository
import com.google.samples.apps.nowinandroid.core.domain.GetFollowableTopicsUseCase
…
class InterestsViewModel @AssistedInject constructor(
    private val savedStateHandle: SavedStateHandle,
    val userDataRepository: UserDataRepository,
    getFollowableTopics: GetFollowableTopicsUseCase,
…
    val uiState: StateFlow<InterestsUiState> = combine(
        selectedTopicId,
        getFollowableTopics(sortBy = TopicSortField.NAME),
        InterestsUiState::Interests,
    ).stateIn(
…
    fun followTopic(followedTopicId: String, followed: Boolean) {
        viewModelScope.launch {
            userDataRepository.setTopicIdFollowed(followedTopicId, followed)
        }
    }`,
		notes: [
			'Les lignes 1 et 2 importent depuis deux couches. Les lectures passent **par le domaine** (ligne 11, `GetFollowableTopicsUseCase`), et les écritures vont directement aux données (ligne 17, `UserDataRepository`). Le [guide d’architecture du dépôt](' + REPO + '/docs/ArchitectureLearningJourney.md?plain=1#L254-L261) présente ce choix comme la conception actuelle.',
			'La ligne 1 compile alors que le module feature ne déclare que `core.domain`. [`core/domain`](' + REPO + '/core/domain/build.gradle.kts#L26-L28) déclare `api(projects.core.data)`, et le `api` de Gradle transmet une dépendance à chaque consommateur. Ce seul mot dans un fichier de build ouvre la couche domaine.',
			'Avec `implementation(projects.core.data)` à la place, l’import de la ligne 1 **ne compilerait pas**. La règle des couches est écrite dans le build : la changer tient en un diff d’une ligne, visible en relecture.',
			'La couche de données cache ses classes avec le `internal` de Kotlin : [OfflineFirstTopicsRepository](' + REPO + '/core/data/' + P + '/core/data/repository/OfflineFirstTopicsRepository.kt#L37-L47) est invisible hors de `core/data`. Les autres modules ne voient que l’interface et les bindings du `DataModule`.'
		]
	},
	tradeoff: {
		gain: [
			'Tu changes la façon dont les sujets sont stockés ou synchronisés sans ouvrir un ViewModel ni un écran.',
			'Un use case dépend d’interfaces de repository, donc un test peut lui passer des fakes, sans base ni réseau.',
			'Le build fait respecter la règle : un import interdit ne compile pas, avant même la relecture du code.'
		],
		cost: [
			'Certaines fonctions ne font que transmettre l’appel : `setNewsResourceViewed` dans `OfflineFirstUserDataRepository` appelle juste la source de données.',
			'Un nouveau champ touche toutes les couches : le modèle réseau, l’entité en base, le repository, le use case, l’état de l’UI.',
			'Les couches découpent le code par travail technique, alors le code d’une fonctionnalité se retrouve réparti sur plusieurs modules.'
		]
	},
	task: {
		prompt: 'Ton équipe veut que le domaine soit **fermé** : aucun ViewModel ne doit appeler un repository directement. À partir des fichiers ci-dessus, dis ce que tu changerais dans le build, ce qui casserait, et comment tu réparerais le bouton « suivre ».',
		hint: 'Pars du seul mot dans `core/domain/build.gradle.kts` qui laisse fuiter la couche de données. Puis demande-toi ce dont le ViewModel a besoin à la place.',
		answer: [
			'Dans `core/domain/build.gradle.kts`, remplace `api(projects.core.data)` par `implementation(projects.core.data)`. Les modules feature qui n’atteignent `core.data` qu’à travers le domaine ne le voient plus.',
			'Certaines features (`bookmarks`, `settings`, `topic`) déclarent elles-mêmes `projects.core.data`. Retire aussi ces lignes, sinon le domaine reste ouvert pour elles.',
			'Ce qui casse : chaque feature qui importe un repository, à commencer par `InterestsViewModel` et son `followTopic`. Le compilateur te les liste toutes.',
			'La correction : ajoute un use case dans le domaine, par exemple `FollowTopicUseCase`, qui appelle `setTopicIdFollowed`. Le ViewModel appelle le use case.',
			'Le coût : une classe de plus, qui ne fait guère que transmettre l’appel. L’appli garde le domaine ouvert, donc elle n’a pas besoin de ces classes. Dans les deux cas, note ce choix par écrit.',
			'Une vérification comme celle-ci, lancée par le build, s’appelle une **fitness function** ; tu la retrouveras plus loin dans le cours.'
		],
		steps: [
			{
				title: 'Trouve la fuite',
				questions: [
					{ q: 'Pourquoi `InterestsViewModel` peut-il importer `UserDataRepository` aujourd’hui ?', options: ['Kotlin autorise n’importe quel import dans la même appli', 'La classe du repository est `internal`', '`core/domain` déclare `api(projects.core.data)`', 'Hilt l’injecte, donc aucun import n’est vérifié'], answer: 2, why: 'Le module feature ne déclare que `core.domain`. Le `api` lui transmet `core.data`.' },
					{ q: 'Que fait le `api` de Gradle ?', options: ['Il cache la dépendance aux consommateurs', 'Il transmet la dépendance à chaque consommateur', 'Il publie le module en ligne', 'Il transforme le module en serveur d’API'], answer: 1, why: 'Avec `implementation`, la dépendance reste privée au module qui la déclare.' },
					{ q: 'Quel appel saute le domaine aujourd’hui ?', options: ['`getFollowableTopics(...)` dans `uiState`', 'Le `@Binds` dans `DataModule`', '`OfflineFirstTopicsRepository` qui lit Room', '`userDataRepository.setTopicIdFollowed` dans `followTopic`'], answer: 3, why: 'Les lectures passent par le use case, les écritures vont directement au repository.' },
					{ q: 'Que veut dire un domaine **fermé** ?', options: ['Chaque appel de l’UI doit passer par lui', 'Personne n’a le droit de modifier son code', 'Il n’a pas d’interfaces', 'Les tests ne le voient pas'], answer: 0, why: 'Une couche ouverte peut être sautée. Une couche fermée, non.' }
				]
			},
			{
				title: 'Change le build',
				questions: [
					{ q: 'Que changes-tu dans `core/domain/build.gradle.kts` ?', options: ['Tu retires `projects.core.data`', '`api(projects.core.data)` devient `implementation(projects.core.data)`', 'Tu ajoutes `api(projects.feature.interests)`', 'Tu marques les interfaces de repository `internal`'], answer: 1, why: 'Le domaine utilise toujours la couche de données, et ne la transmet plus.' },
					{ q: '`bookmarks`, `settings` et `topic` déclarent eux-mêmes `projects.core.data`. Que fais-tu ?', options: ['Rien : le changement du domaine les couvre', 'Tu passes aussi leurs lignes en `api`', 'Tu retires aussi ces lignes, sinon le domaine reste ouvert pour elles', 'Tu déplaces ces features dans `core/domain`'], answer: 2, why: 'Une dépendance directe n’a pas besoin du `api` pour fuiter. Elle est déjà là.' },
					{ q: 'Pourquoi mettre la règle dans le build plutôt que dans un wiki d’équipe ?', options: ['Les builds vont plus vite sans `api`', 'Gradle envoie un e-mail à l’équipe à chaque changement', 'Une page de wiki ne peut pas être versionnée', 'Un import interdit ne compile pas, avant même la relecture'], answer: 3, why: 'Changer la règle tient en un diff d’une ligne, visible en relecture.' },
					{ q: 'Comment s’appelle une vérification comme celle-ci, lancée par le build ?', options: ['Une fitness function', 'Une composition root', 'Une couche ouverte', 'Un use case'], answer: 0, why: 'Tu retrouveras les fitness functions plus loin dans le cours.' }
				]
			},
			{
				title: 'Regarde ce qui casse',
				questions: [
					{ q: 'Qu’est-ce qui casse ?', options: ['La base Room', 'Les bindings du `DataModule`', 'Chaque feature qui importe un repository, à commencer par `InterestsViewModel`', 'La synchro réseau'], answer: 2, why: 'Ces imports n’atteignent plus `core.data`, donc ils ne compilent plus.' },
					{ q: 'Comment trouves-tu tous les endroits cassés ?', options: ['Un grep sur « Repository » dans le dépôt', 'Le compilateur te les liste tous', 'Tu lances l’appli et tu touches chaque bouton', 'Tu demandes à chaque équipe feature'], answer: 1, why: 'Le build vérifie la règle, donc il signale aussi chaque casse.' },
					{ q: 'Est-ce que `DataModule` compile encore ?', options: ['Oui : il est dans `core/data`, donc il a le droit de voir les classes `internal`', 'Non : il branche des classes que le domaine ne voit pas', 'Non : Hilt a besoin de `api` pour marcher', 'Seulement si tu le déplaces dans le domaine'], answer: 0, why: 'Le changement ne touche que les modules qui consomment le domaine.' },
					{ q: 'Quel appel de `InterestsViewModel` respecte déjà un domaine fermé ?', options: ['`userDataRepository.setTopicIdFollowed(...)`', 'Le paramètre de constructeur `UserDataRepository`', 'L’import de `core.data.repository.UserDataRepository`', '`getFollowableTopics(sortBy = TopicSortField.NAME)`'], answer: 3, why: 'Le chemin de lecture passe déjà par un use case du domaine.' }
				]
			},
			{
				title: 'Répare le bouton « suivre »',
				questions: [
					{ q: 'Qu’ajoutes-tu ?', options: ['Un deuxième ViewModel pour le suivi', 'Une copie publique de `OfflineFirstTopicsRepository`', 'Un use case dans le domaine, par exemple `FollowTopicUseCase`, qui appelle `setTopicIdFollowed`', 'Un `@Binds` dans `DataModule` pour le ViewModel'], answer: 2, why: 'L’écriture passe maintenant par le domaine, comme la lecture.' },
					{ q: 'Qu’appelle alors `followTopic` ?', options: ['Le repository, injecté par Hilt', 'Le nouveau use case', 'Room directement', 'La source de données réseau'], answer: 1, why: 'Le ViewModel ne connaît plus que le domaine.' },
					{ q: 'Que coûte le domaine fermé ?', options: ['Des lectures plus lentes sur chaque écran', 'La fin du mode hors ligne', 'Une deuxième base de données', 'Une classe de plus, qui ne fait guère que transmettre l’appel'], answer: 3, why: 'L’appli garde le domaine ouvert et laisse les écritures le sauter, donc elle n’a pas besoin de ces classes.' },
					{ q: 'Fermé ou ouvert, que doit faire l’équipe de ce choix ?', options: ['Le noter par écrit', 'Le garder hors de la doc', 'L’annuler après un sprint', 'Le laisser à chaque équipe feature'], answer: 0, why: 'La prochaine personne qui verra un ViewModel appeler un repository doit pouvoir trouver pourquoi.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans une appli en couches où l’UI dépend du domaine et le domaine dépend des données, quel import **viole** la règle des couches ?',
			options: ['Un ViewModel importe un use case', 'Un use case importe une interface de repository', 'Une implémentation de repository importe un ViewModel pour lire l’onglet sélectionné', 'Un module d’injection de dépendances importe une implémentation de repository'],
			answer: 2,
			why: 'Les dépendances ne pointent que vers le bas. Une classe de données qui connaît un ViewModel pointe vers le haut, et attache la couche du bas à un seul écran. Quand le module d’injection voit une implémentation, la composition root fait son travail.'
		},
		{
			q: 'Qu’est-ce qu’une couche **ouverte** ?',
			options: ['Une couche que la couche du dessus peut sauter, pour appeler directement celle du dessous', 'Une couche dont le code est open source, donc que toute équipe peut modifier', 'Une couche qui n’a pas d’interfaces, donc qu’on appelle par ses classes directement', 'Une couche que n’importe quelle autre couche, au-dessus ou en dessous, peut importer'],
			answer: 0,
			why: 'Les appelants peuvent contourner une couche ouverte. Dans Now in Android, le domaine est ouvert : les lectures passent par des use cases, les écritures appellent directement les repositories. Une couche fermée forcerait chaque appel à passer par elle.'
		},
		{
			q: 'Le `core/domain` de Now in Android déclare `api(projects.core.data)`. Qu’est-ce que ça provoque ?',
			options: [
				'Le module de données peut maintenant importer directement les use cases du module domaine',
				'Les modules qui dépendent du domaine peuvent aussi importer des classes de données, comme les repositories',
				'Le module domaine est compilé dans le module de données et livré avec lui',
				'Rien de visible : `api` et `implementation` se comportent pareil à la compilation'
			],
			answer: 1,
			why: 'Avec `api`, une dépendance est transmise aux consommateurs. Un module feature qui ne déclare que `core.domain` peut donc importer `UserDataRepository`. Avec `implementation`, cet import ne compilerait pas.'
		}
	],
	recall: {
		q: 'Dans Now in Android, pourquoi `InterestsViewModel` peut-il importer `UserDataRepository` alors que son module ne dépend que de `core.domain` ?',
		a: '`core/domain/build.gradle.kts` déclare `api(projects.core.data)`, et `api` transmet le module de données à chaque consommateur. Avec `implementation`, l’import ne compilerait pas et le domaine serait une couche fermée.'
	},
	sources: [
		{ title: 'Now in Android, Architecture learning journey', url: `${REPO}/docs/ArchitectureLearningJourney.md` },
		{ title: 'Now in Android, core/domain/build.gradle.kts', url: `${REPO}/core/domain/build.gradle.kts` },
		{ title: 'Now in Android, feature/interests/impl/build.gradle.kts', url: `${REPO}/feature/interests/impl/build.gradle.kts#L27-L30` },
		{ title: 'Now in Android, DataModule', url: `${REPO}/core/data/${P}/core/data/di/DataModule.kt#L38-L55` },
		{ title: 'Android developers, The domain layer', url: 'https://developer.android.com/topic/architecture/domain-layer' },
		{ title: 'Gradle docs, The Java Library plugin (api and implementation)', url: 'https://docs.gradle.org/current/userguide/java_library_plugin.html' },
		{ title: 'Martin Fowler, Presentation Domain Data Layering', url: 'https://martinfowler.com/bliki/PresentationDomainDataLayering.html' }
	]
};
