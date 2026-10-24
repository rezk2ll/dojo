const REPO = 'https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb';
const P = 'src/main/kotlin/com/google/samples/apps/nowinandroid';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'layers',
	part: 'Inside a service',
	title: 'Layers: imports only go one way',
	minutes: 10,
	hook: [
		'Open the Interests screen in Now in Android, the Android team\'s reference app built with Kotlin and Jetpack Compose. The list of topics crosses three **layers**: UI, domain and data. Each layer is its own Gradle module: `feature/interests/impl`, `core/domain`, `core/data`.',
		'The modules follow one rule: **a layer may only use the layer below it**. The UI uses the domain, the domain uses the data layer, and never the other way. The build checks this rule, because a module cannot import a class from a module it does not depend on.',
		'With this rule, you can change how the data layer stores topics without reading the UI code. Below, you follow one screen through the three layers, then find the place where the app skips the domain layer on purpose.'
	],
	terms: [
		{ term: 'Layer', def: 'A group of code with one kind of job: draw the screen, apply the rules of the app, store and fetch the data.' },
		{ term: 'Dependency rule', def: 'Here: UI depends on domain, and domain depends on data. No import points up, so the lowest layer knows least about the others.' },
		{ term: 'Open layer', def: 'A layer the one above may skip, to call the layer under it directly. Every call has to go through a closed layer.' },
		{ term: 'Composition root', def: 'The one place allowed to know both an interface and its implementation, to wire them together. Here, the Hilt `DataModule`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['user(["User opens Interests"]) --> vm["UI: InterestsViewModel"]', 'vm -->|"invoke"| uc["domain: GetFollowableTopicsUseCase"]'],
				highlight: ['user', 'vm', 'uc'],
				note: 'The UI layer asks for topics through a use case. The **domain** use case combines two streams, all topics and the user\'s followed ids, into one list of `FollowableTopic`. It has no reference to any screen.'
			},
			{
				add: ['uc --> trepo["data: TopicsRepository, interface"]', 'uc --> urepo["data: UserDataRepository, interface"]'],
				highlight: ['trepo', 'urepo'],
				note: 'The use case only knows **interfaces**, published by the data layer. In this app the domain sits on top of data, as Android\'s architecture guide describes it. In Clean Architecture, the domain would own the interfaces instead.'
			},
			{
				add: ['impl["data: OfflineFirstTopicsRepository, internal"] -.->|"implements"| trepo', 'impl -->|"reads"| db[("Room database")]', 'impl -.->|"sync only"| net["core/network: data source"]'],
				highlight: ['impl', 'db', 'net'],
				note: 'The implementation reads **only from the local database**, so the screen works offline. The network data source only syncs that database. The class is `internal`, so code outside `core/data` cannot even name it.'
			},
			{
				add: ['bind["data: DataModule, Hilt"] -.->|"TopicsRepository is OfflineFirstTopicsRepository"| impl'],
				highlight: ['bind'],
				note: '`DataModule` picks the implementation, with one `@Binds` per interface. It is the **composition root**. It lives inside `core/data`, so it may see the `internal` classes.'
			},
			{
				add: ['vm -->|"setTopicIdFollowed, skips the domain"| urepo'],
				highlight: ['vm', 'urepo'],
				note: 'When you tap "follow", the ViewModel calls the repository **directly** and skips the domain. The docs: events are "handled by the UI layer calling methods on repositories directly". So the domain is an open layer in this app.'
			}
		]
	},
	example: {
		title: 'feature/interests/impl/.../InterestsViewModel.kt, two paths down',
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
			'Lines 1 and 2 import from two layers. Reads go **through the domain** (line 11, `GetFollowableTopicsUseCase`), and writes go straight to data (line 17, `UserDataRepository`). The [architecture guide of the repo](' + REPO + '/docs/ArchitectureLearningJourney.md?plain=1#L254-L261) describes this as the current design.',
			'Line 1 compiles even though the feature module declares only `core.domain`. [`core/domain`](' + REPO + '/core/domain/build.gradle.kts#L26-L28) declares `api(projects.core.data)`, and Gradle\'s `api` passes a dependency on to every consumer. That one word in a build file makes the domain an open layer.',
			'With `implementation(projects.core.data)` instead, the import on line 1 would **fail to compile**. The layer rule is written in the build, so changing it is a one-line diff that a reviewer can see.',
			'The data layer hides its classes with Kotlin\'s `internal`: [OfflineFirstTopicsRepository](' + REPO + '/core/data/' + P + '/core/data/repository/OfflineFirstTopicsRepository.kt#L37-L47) is invisible outside `core/data`. Only the interface and the `DataModule` bindings are visible to other modules.'
		]
	},
	tradeoff: {
		gain: [
			'You can change how topics are stored or synced without opening a ViewModel or a screen.',
			'A use case depends on repository interfaces, so a test can hand it fakes and needs no database or network.',
			'The build enforces the rule: a forbidden import fails to compile, before anyone reviews the code.'
		],
		cost: [
			'Some functions only forward the call: `setNewsResourceViewed` in `OfflineFirstUserDataRepository` just calls the data source.',
			'A new field touches every layer: the network model, the database entity, the repository, the use case, the UI state.',
			'Layers split code by technical job, so the code of one feature is spread over several modules.'
		]
	},
	task: {
		prompt: 'Your team wants the domain to be **closed**: no ViewModel may call a repository directly. Using the files above, say what you would change in the build, what would break, and how you would fix the follow button.',
		hint: 'Start from the one word in `core/domain/build.gradle.kts` that lets the data layer leak through. Then ask what the ViewModel needs instead.',
		answer: [
			'In `core/domain/build.gradle.kts`, change `api(projects.core.data)` to `implementation(projects.core.data)`. Feature modules that only reach `core.data` through the domain no longer see it.',
			'Some features (`bookmarks`, `settings`, `topic`) declare `projects.core.data` themselves. Remove those lines too, or the domain stays open for them.',
			'What breaks: every feature that imports a repository, starting with `InterestsViewModel` and its `followTopic`. The compiler lists every one of them.',
			'The fix: add a use case in the domain, for example `FollowTopicUseCase`, that calls `setTopicIdFollowed`. The ViewModel calls the use case.',
			'The cost: one more class that does little more than forward the call. The app keeps the domain open, so it does not need such classes. Write down the choice either way.',
			'A check like this, run by the build, is a **fitness function**, coming later in the course.'
		],
		steps: [
			{
				title: 'Find the leak',
				questions: [
					{ q: 'Which line of `InterestsViewModel.kt` shows the leak?', options: ['The import of `core.domain.GetFollowableTopicsUseCase`', 'The `SavedStateHandle` constructor parameter', 'The import of `core.data.repository.UserDataRepository`', 'The call to `getFollowableTopics(sortBy = TopicSortField.NAME)`'], answer: 2, why: 'A UI file importing from `core.data` is the sign. Imports from `core.domain` are what the rule expects.' },
					{ q: 'Which classes stay hidden from the ViewModel even with the leak?', options: ['Interfaces like `TopicsRepository`', '`internal` classes like `OfflineFirstTopicsRepository`', 'Use cases like `GetFollowableTopicsUseCase`', 'Every class in `core/data`'], answer: 1, why: 'Kotlin\'s `internal` keeps the implementation inside `core/data`. What leaks is the public interface, `UserDataRepository`.' },
					{ q: 'Which call skips the domain today?', options: ['`getFollowableTopics(...)` in `uiState`', 'The `@Binds` in `DataModule`', '`OfflineFirstTopicsRepository` reading Room', '`userDataRepository.setTopicIdFollowed` in `followTopic`'], answer: 3, why: 'Reads go through the use case, writes go straight to the repository.' },
					{ q: 'Is the open domain a bug someone forgot to fix?', options: ['Yes: nobody noticed the `api`', 'No: the repo\'s docs describe the UI calling repositories directly for events', 'Yes: Hilt opened it by mistake', 'No: the domain has no use cases yet'], answer: 1, why: 'The architecture guide calls it the current design. Closing the domain is a choice with a cost, not a bug fix.' }
				]
			},
			{
				title: 'Change the build',
				questions: [
					{ q: 'What do you change in `core/domain/build.gradle.kts`?', options: ['Remove `projects.core.data` from it', '`api(projects.core.data)` to `implementation(projects.core.data)`', 'Add `api(projects.feature.interests)`', 'Mark the repository interfaces `internal`'], answer: 1, why: 'The domain still uses the data layer, and no longer passes it on.' },
					{ q: '`bookmarks`, `settings` and `topic` declare `projects.core.data` themselves. What do you do?', options: ['Nothing: the domain change covers them', 'Turn their lines into `api` too', 'Remove those lines too, or the domain stays open for them', 'Move those features into `core/domain`'], answer: 2, why: 'A direct dependency does not need the `api` to leak. It is already there.' },
					{ q: 'Why put the rule in the build instead of a team wiki?', options: ['Builds run faster without `api`', 'Gradle emails the team on each change', 'A wiki page cannot be versioned', 'A forbidden import fails to compile, before anyone reviews it'], answer: 3, why: 'Changing the rule is a one-line diff a reviewer can see.' },
					{ q: 'What is a check like this, run by the build, called?', options: ['A fitness function', 'A composition root', 'An open layer', 'A use case'], answer: 0, why: 'The course comes back to fitness functions later.' }
				]
			},
			{
				title: 'See what breaks',
				questions: [
					{ q: 'What breaks?', options: ['The Room database', 'The `DataModule` bindings', 'Every feature that imports a repository, starting with `InterestsViewModel`', 'The network sync'], answer: 2, why: 'Those imports no longer reach `core.data`, so they stop compiling.' },
					{ q: 'How do you find every place that broke?', options: ['Grep the repo for "Repository"', 'The compiler lists every one', 'Run the app and tap every button', 'Ask each feature team'], answer: 1, why: 'The build checks the rule, so it also reports each break.' },
					{ q: 'Does `DataModule` still compile?', options: ['Yes: it lives in `core/data`, so it may see the `internal` classes', 'No: it binds classes the domain cannot see', 'No: Hilt needs `api` to work', 'Only if you move it into the domain'], answer: 0, why: 'The change only affects modules that consume the domain.' },
					{ q: 'Which call in `InterestsViewModel` already fits a closed domain?', options: ['`userDataRepository.setTopicIdFollowed(...)`', 'The `UserDataRepository` constructor parameter', 'The import of `core.data.repository.UserDataRepository`', '`getFollowableTopics(sortBy = TopicSortField.NAME)`'], answer: 3, why: 'The read path already goes through a use case in the domain.' }
				]
			},
			{
				title: 'Fix the follow button',
				questions: [
					{ q: 'What do you add?', options: ['A second ViewModel for following', 'A public copy of `OfflineFirstTopicsRepository`', 'A use case in the domain, like `FollowTopicUseCase`, that calls `setTopicIdFollowed`', 'A `@Binds` in `DataModule` for the ViewModel'], answer: 2, why: 'The write now goes through the domain, like the read.' },
					{ q: 'What does `followTopic` call then?', options: ['The repository, injected by Hilt', 'The new use case', 'Room directly', 'The network data source'], answer: 1, why: 'The ViewModel only knows the domain.' },
					{ q: 'What does the closed domain cost?', options: ['Slower reads on every screen', 'No more offline mode', 'A second database', 'One more class that does little more than forward the call'], answer: 3, why: 'The app keeps the domain open and lets writes skip it, so it does not need such classes.' },
					{ q: 'Closed or open, what should the team do with the choice?', options: ['Write it down', 'Keep it out of the docs', 'Revert it after a sprint', 'Leave it to each feature team'], answer: 0, why: 'The next person to see a ViewModel call a repository should find out why.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In a layered app where UI depends on domain and domain depends on data, which import **breaks** the layer rule?',
			options: ['A ViewModel imports a use case', 'A use case imports a repository interface', 'A repository implementation imports a ViewModel to read the selected tab', 'A dependency injection module imports a repository implementation'],
			answer: 2,
			why: 'Dependencies only point down. A data class that knows a ViewModel points up, and ties the bottom layer to one screen. The injection module seeing an implementation is the composition root doing its job.'
		},
		{
			q: 'What is an **open** layer?',
			options: ['A layer that the layer above it may skip, calling the layer below directly', 'A layer whose code is open source, so any team may change it', 'A layer that has no interfaces, so callers use its classes directly', 'A layer that any other layer, above or below it, may import freely'],
			answer: 0,
			why: 'Callers may go around an open layer. In Now in Android, the domain is open: reads go through use cases, writes call repositories directly. A closed layer would force every call through it.'
		},
		{
			q: 'Now in Android\'s `core/domain` declares `api(projects.core.data)`. What does that cause?',
			options: [
				'The data module can now import the domain module\'s use cases directly',
				'Modules that depend on the domain can also import data classes, such as repositories',
				'The domain module is compiled into the data module and shipped with it',
				'Nothing visible: `api` and `implementation` behave the same at build time'
			],
			answer: 1,
			why: 'With `api`, a dependency is passed on to consumers. So a feature module that only declares `core.domain` can import `UserDataRepository`. With `implementation`, that import would not compile.'
		}
	],
	recall: {
		q: 'In Now in Android, why can `InterestsViewModel` import `UserDataRepository` when its module only depends on `core.domain`?',
		a: '`core/domain/build.gradle.kts` declares `api(projects.core.data)`, and `api` passes the data module on to every consumer. With `implementation`, the import would not compile and the domain would be a closed layer.'
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
