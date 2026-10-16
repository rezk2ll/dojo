const REPO = 'https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb';
const P = 'src/main/kotlin/com/google/samples/apps/nowinandroid';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'layers',
	part: 'À l’intérieur d’un service',
	title: 'Les couches : les imports ne vont que dans un sens',
	minutes: 10,
	hook: [
		'Ouvre l’écran Interests dans Now in Android, l’appli de référence de l’équipe Android construite avec Kotlin et Jetpack Compose : la liste des sujets traverse trois couches, **UI**, **domaine**, **données**. Chaque couche est son propre module Gradle : `feature/interests/impl`, `core/domain`, `core/data`. C’est une architecture en couches.',
		'Les modules posent une règle : **une couche ne peut utiliser que la couche du dessous**. L’UI utilise le domaine, le domaine utilise la couche de données, jamais l’inverse. Et ici, contrairement à une simple convention de dossiers, **c’est le build qui le vérifie**. Un module ne peut pas importer une classe d’un module dont il ne dépend pas.',
		'Les couches t’offrent surtout une chose : **tu peux changer un côté sans lire l’autre**. Aujourd’hui, tu suis un écran à travers les trois, puis tu regardes l’endroit où l’appli saute une couche exprès.'
	],
	terms: [
		{ term: 'Couche', def: 'Un ensemble de code avec un seul type de travail : dessiner l’écran, appliquer les règles de l’appli, stocker et récupérer les données.' },
		{ term: 'Règle de dépendance', def: 'Ici : l’UI dépend du domaine, le domaine dépend des données. Rien ne pointe vers le haut. La couche la plus basse est celle qui en sait le moins sur les autres.' },
		{ term: 'Couche ouverte', def: 'Une couche que celle du dessus peut sauter, pour appeler directement la couche en dessous. Une couche fermée ne peut pas être sautée.' },
		{ term: 'Pass-through', def: 'Une fonction dans une couche intermédiaire qui ne fait que transmettre l’appel. Quelques-unes, c’est normal. Beaucoup, ça veut dire que la couche ne fait aucun travail.' },
		{ term: 'Composition root (racine de composition)', def: 'Le seul endroit autorisé à connaître à la fois une interface et son implémentation, pour les brancher ensemble. Ici, le `DataModule` Hilt.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user(["L’utilisateur ouvre Interests"]) --> vm["UI : InterestsViewModel"]', 'vm -->|"invoke"| uc["domaine : GetFollowableTopicsUseCase"]'],
				highlight: ['user', 'vm', 'uc'],
				note: 'La couche **UI** demande les sujets via un use case. Le use case du **domaine** combine deux flux, tous les sujets et les ids suivis par l’utilisateur, en une seule liste de `FollowableTopic`. Il ne connaît aucun écran.'
			},
			{
				add: ['uc --> trepo["données : TopicsRepository, interface"]', 'uc --> urepo["données : UserDataRepository, interface"]'],
				highlight: ['trepo', 'urepo'],
				note: 'Le use case ne connaît que des **interfaces**, publiées par la couche de **données**. Dans cette appli, le domaine est posé sur les données, comme le décrit le guide d’architecture Android. Ce n’est pas de la Clean Architecture, où le domaine posséderait les interfaces.'
			},
			{
				add: ['impl["données : OfflineFirstTopicsRepository, internal"] -.->|"implémente"| trepo', 'impl -->|"lit"| db[("Base Room")]', 'impl -.->|"synchro seulement"| net["core/network : source de données"]'],
				highlight: ['impl', 'db', 'net'],
				note: 'L’implémentation lit **uniquement la base locale**, donc l’écran marche hors ligne. Le réseau sert à synchroniser, pas à répondre à l’écran. La classe est `internal` : en dehors de `core/data`, personne ne peut même la nommer.'
			},
			{
				add: ['bind["données : DataModule, Hilt"] -.->|"TopicsRepository, c’est OfflineFirstTopicsRepository"| impl'],
				highlight: ['bind'],
				note: 'Quelqu’un doit choisir l’implémentation. `DataModule` le fait avec un `@Binds` par interface. C’est la **composition root**. Comme elle vit dans `core/data`, elle a le droit de voir les classes `internal`.'
			},
			{
				add: ['vm -->|"setTopicIdFollowed, saute le domaine"| urepo'],
				highlight: ['vm', 'urepo'],
				note: 'La règle, pliée exprès. Quand tu touches « suivre », le ViewModel appelle le repository **directement**. La doc le dit : les événements sont « gérés par la couche UI qui appelle directement des méthodes sur les repositories ». Le domaine est ici une **couche ouverte**.'
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
			'Deux imports, deux couches. Les lectures passent **par le domaine** (`GetFollowableTopicsUseCase`). Les écritures vont **droit aux données** (`UserDataRepository`). Le [guide d’architecture du dépôt](' + REPO + '/docs/ArchitectureLearningJourney.md?plain=1#L254-L261) dit que c’est la conception actuelle, pas un accident.',
			'Pourquoi ça compile ? Le [module feature](' + REPO + '/feature/interests/impl/build.gradle.kts#L27-L30) déclare `core.domain`, pas `core.data`. Mais [`core/domain`](' + REPO + '/core/domain/build.gradle.kts#L26-L28) déclare `api(projects.core.data)`, et le `api` de Gradle transmet une dépendance à chaque consommateur. Un seul mot dans un fichier de build fait du domaine une couche ouverte.',
			'Avec `implementation(projects.core.data)`, cet import **ne compilerait pas**. La règle des couches est écrite dans le build, donc changer la règle, c’est un diff d’une ligne, facile à relire.',
			'La couche de données cache son intérieur avec le `internal` de Kotlin : [OfflineFirstTopicsRepository](' + REPO + '/core/data/' + P + '/core/data/repository/OfflineFirstTopicsRepository.kt#L37-L47) est invisible en dehors de `core/data`. Seuls l’interface et les [bindings du DataModule](' + REPO + '/core/data/' + P + '/core/data/di/DataModule.kt#L38-L55) passent la frontière.'
		]
	},
	tradeoff: {
		gain: [
			'Tu changes la façon dont les sujets sont stockés ou synchronisés sans ouvrir un ViewModel ni un écran.',
			'Un use case dépend d’interfaces de repository, donc un test peut lui passer des fakes. Pas de base, pas de réseau.',
			'Le build fait respecter la règle : un import interdit est une erreur de compilation, pas un commentaire de code review.'
		],
		cost: [
			'Du code pass-through : `setNewsResourceViewed` dans `OfflineFirstUserDataRepository` ne fait que transmettre à la source de données.',
			'Un nouveau champ touche toutes les couches : le modèle réseau, l’entité en base, le repository, le use case, l’état de l’UI.',
			'Les couches découpent le code par travail technique, pas par fonctionnalité. Une fonctionnalité est éparpillée sur plusieurs modules.'
		]
	},
	task: {
		prompt: 'Ton équipe veut que le domaine soit **fermé** : aucun ViewModel ne doit appeler un repository directement. À partir des fichiers du jour, dis ce que tu changerais dans le build, ce qui casserait, et comment tu réparerais le bouton « suivre ».',
		hint: 'Pars du seul mot dans `core/domain/build.gradle.kts` qui laisse fuiter la couche de données. Puis demande-toi ce dont le ViewModel a besoin à la place.',
		answer: [
			'Dans `core/domain/build.gradle.kts`, remplace `api(projects.core.data)` par `implementation(projects.core.data)`. Les modules feature qui n’atteignent `core.data` qu’à travers le domaine ne le voient plus.',
			'Certaines features (`bookmarks`, `settings`, `topic`) déclarent elles-mêmes `projects.core.data`. Retire aussi ces lignes, sinon le domaine reste ouvert pour elles.',
			'Ce qui casse : chaque feature qui importe un repository, à commencer par `InterestsViewModel` et son `followTopic`. Le compilateur te donne la liste complète gratuitement.',
			'La correction : ajoute un use case dans le domaine, par exemple `FollowTopicUseCase`, qui appelle `setTopicIdFollowed`. Le ViewModel appelle le use case.',
			'Le coût : une classe de plus, presque un pass-through. Fermer une couche est un **compromis**, et c’est pour ça que l’appli a choisi de la laisser ouverte. Dans les deux cas, écris ce choix quelque part.',
			'Une vérification comme celle-ci, lancée par le build, est une **fitness function**, qu’on verra plus loin dans le cours.'
		]
	},
	quiz: [
		{
			q: 'Dans une appli en couches où l’UI dépend du domaine et le domaine dépend des données, quel import **viole** la règle des couches ?',
			options: ['Un ViewModel importe un use case', 'Un use case importe une interface de repository', 'Une implémentation de repository importe un ViewModel pour lire l’onglet sélectionné', 'Un module d’injection de dépendances importe une implémentation de repository'],
			answer: 2,
			why: 'Les dépendances ne pointent que vers le bas. Une classe de données qui connaît un ViewModel pointe vers le haut, et attache la couche du bas à un seul écran. Le module d’injection qui voit une implémentation, c’est la composition root qui fait son travail.'
		},
		{
			q: 'Qu’est-ce qu’une couche **ouverte** ?',
			options: ['Une couche que la couche du dessus peut sauter, pour appeler directement celle du dessous', 'Une couche dont le code est open source, donc que toute équipe peut modifier', 'Une couche qui n’a pas d’interfaces, donc qu’on appelle par ses classes directement', 'Une couche que n’importe quelle autre couche, au-dessus ou en dessous, peut importer'],
			answer: 0,
			why: 'Une couche ouverte peut être contournée. Dans Now in Android, le domaine est ouvert : les lectures passent par des use cases, les écritures appellent directement les repositories. Une couche fermée forcerait chaque appel à passer par elle.'
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
			why: 'Avec `api`, une dépendance est transmise aux consommateurs. C’est pour ça qu’un module feature qui ne déclare que `core.domain` peut importer `UserDataRepository`. Avec `implementation`, cet import ne compilerait pas.'
		}
	],
	takeaway: 'Les couches marchent quand les imports ne vont que dans un sens, et ils ne vont dans un seul sens que si quelque chose le vérifie. Mets la règle là où le build peut la faire respecter.',
	sources: [
		{ title: 'Now in Android, Architecture learning journey', url: `${REPO}/docs/ArchitectureLearningJourney.md` },
		{ title: 'Now in Android, core/domain/build.gradle.kts', url: `${REPO}/core/domain/build.gradle.kts` },
		{ title: 'Android developers, The domain layer', url: 'https://developer.android.com/topic/architecture/domain-layer' },
		{ title: 'Gradle docs, The Java Library plugin (api and implementation)', url: 'https://docs.gradle.org/current/userguide/java_library_plugin.html' },
		{ title: 'Martin Fowler, Presentation Domain Data Layering', url: 'https://martinfowler.com/bliki/PresentationDomainDataLayering.html' }
	]
};
