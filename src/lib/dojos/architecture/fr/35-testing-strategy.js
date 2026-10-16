const REPO = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const CACHE = `${REPO}/activesupport/test/cache`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'testing-strategy',
	part: 'Fait pour durer',
	title: 'Stratégie de test',
	minutes: 10,
	hook: [
		'Le service de commandes de ta boutique publie `order.placed` avec le `firstName` du client. Le service d’e-mails en fait « Hello Ana ». Les deux équipes testent leur côté : le service de commandes vérifie le message qu’il publie, et le service d’e-mails donne à son handler un message écrit à la main. **Les deux suites sont vertes.**',
		'Imagine maintenant un nettoyage dans le service de commandes : `firstName` devient `givenName`, et son test est mis à jour dans le même commit. Toujours vert. Le message écrit à la main du service d’e-mails dit toujours `firstName`, donc ses tests restent verts aussi. En production, chaque e-mail commence par **« Hello , »**. Aucun test n’a échoué, parce qu’aucun test n’a jamais mis les deux côtés ensemble.',
		'Plus de tests du même genre ne l’auraient pas attrapé. Une stratégie de test, ce n’est pas « combien de tests ». C’est **quel test protège quelle décision**. Les tests rapides gardent ce qu’un service décide seul. Les **tests de contrat** gardent ce que deux services ont convenu. Quelques tests de bout en bout vérifient le câblage. Le chapitre de demain (jour 36) applique la même idée à l’architecture elle-même.'
	],
	terms: [
		{ term: 'Pyramide des tests', def: 'Beaucoup de tests rapides et étroits en bas, moins de tests larges en haut. Fowler : « many more low-level UnitTests than high level BroadStackTests running through a GUI » (beaucoup plus de tests unitaires de bas niveau que de tests larges de haut niveau passant par une interface graphique).' },
		{ term: 'Test double (doublure de test)', def: 'Un remplaçant pour quelque chose avec quoi ton code discute : un stockage en mémoire, une fausse API de paiement, un message écrit à la main. Il rend les tests rapides, et il n’est fidèle que jusqu’à la dernière fois où quelqu’un l’a comparé avec le vrai.' },
		{ term: 'Test d’intégration', def: 'Un service avec sa vraie infrastructure (sa propre base) et des doublures pour chaque service qui ne lui appartient pas.' },
		{ term: 'Test de contrat', def: 'Un test qui vérifie une doublure contre la vraie chose qu’elle remplace. Fowler : « These check that all the calls against your test doubles return the same results as a call to the external service would. » (ils vérifient que tous les appels à tes doublures renvoient les mêmes résultats qu’un appel au service externe).' },
		{ term: 'Consumer-driven contract (contrat piloté par le consommateur)', def: 'Chaque consommateur écrit la partie d’un message ou d’une API qu’il lit vraiment, et le producteur fait tourner ces attentes dans sa propre CI. Pact est un outil fait pour ça.' },
		{ term: 'Test de bout en bout', def: 'Le système construit, piloté comme le ferait un utilisateur. Lent et large, donc garde-en quelques-uns qui prouvent que les morceaux sont bien câblés ensemble.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['unit["Unitaire : règles de prix, sans I/O"] -->|"protège"| d1["Une remise ne rend jamais un total négatif"]'],
				highlight: ['unit', 'd1'],
				note: 'Le bas de la pyramide. Les tests de prix du service de commandes appellent des fonctions pures avec des paniers écrits en dur, en quelques millisecondes. Ils gardent une règle qui vit **à un seul endroit**, donc un test rapide suffit.'
			},
			{
				add: ['integ["Intégration : service de commandes sur un vrai Postgres"] -->|"protège"| d2["Une commande rejouée est enregistrée une seule fois"]', 'integ -.->|"simule"| fakes["API de paiement, service d’e-mails"]', 'class fakes ext'],
				highlight: ['integ', 'd2', 'fakes'],
				note: 'Un niveau au-dessus. La règle « enregistrée une seule fois » vit dans un index unique et une transaction, donc le test a besoin de **la vraie base**. **Tout ce qui n’appartient pas au service est une doublure** : l’API de paiement, le service d’e-mails.'
			},
			{
				add: ['beh["CacheStoreBehavior : écrit une seule fois"] --> mem["MemoryStore"]', 'beh --> redis[("RedisCacheStore sur un vrai Redis")]'],
				highlight: ['beh', 'mem', 'redis'],
				note: 'Un test de contrat pour une doublure **qui t’appartient**. Rails écrit ses tests de cache une seule fois, sous forme de module de comportements. Le store en mémoire, le store fichier, Memcached et Redis l’incluent chacun. Tout test qui utilise le store en mémoire, rapide, peut compter sur lui pour **se comporter comme les vrais** sur tout ce que testent ces modules partagés.'
			},
			{
				add: ['producer["Test des commandes : ce qu’il publie"] -.->|"aucun test ne les compare"| consumer["Fixture e-mails : ce qu’il lit"]', 'class producer ext'],
				highlight: ['producer', 'consumer'],
				note: 'Une doublure dont la vérité **appartient à quelqu’un d’autre**. Le message existe en deux copies écrites à la main, chacune vérifiée seulement contre son propre code. C’est sur cette ligne pointillée qu’un **consumer-driven contract** a sa place.'
			},
			{
				add: ['e2e["E2E : passage de commande dans un navigateur, paiement simulé"] -->|"protège"| d5["Un panier payé devient une commande et un e-mail"]'],
				highlight: ['e2e', 'd5'],
				note: 'Le sommet : une poignée de tests navigateur sur le système construit. Même eux utilisent des doublures : un faux fournisseur de paiement, peut-être une fausse boîte mail. **Un test de bout en bout avec des remplaçants teste le câblage, pas le contrat.**'
			}
		]
	},
	example: {
		title: 'activesupport/test/cache/stores/memory_store_test.rb : un contrat, plusieurs stores',
		repo: 'rails/rails',
		url: `${CACHE}/stores/memory_store_test.rb#L7-L26`,
		lang: 'ruby',
		code: `class StoreTest < ActiveSupport::TestCase
  def lookup_store(options = {})
    ActiveSupport::Cache.lookup_store(:memory_store, options)
  end
end

class MemoryStoreTest < StoreTest
  include CacheStoreBehavior
  include CacheStoreVersionBehavior
  include CacheStoreCoderBehavior
  include CacheStoreCompressionBehavior
  include CacheStoreSerializerBehavior
  include CacheDeleteMatchedBehavior
  include CacheIncrementDecrementBehavior
  include CacheInstrumentationBehavior
  include CacheLoggingBehavior

  def setup
    @cache = lookup_store(expires_in: 60)
  end`,
		notes: [
			'**Le contrat est un module.** [`CacheStoreBehavior`](' + CACHE + '/behaviors/cache_store_behavior.rb#L6-L19) commence par « Tests the base functionality that should be identical across all cache stores. » (teste les fonctionnalités de base qui doivent être identiques dans tous les stores de cache). Ses tests ne parlent qu’à `@cache`. La classe de test de chaque store dit comment en construire un, dans `setup`, et inclut les comportements.',
			'**Le vrai store fait tourner les mêmes tests.** [`RedisCacheStoreCommonBehaviorTest`](' + CACHE + '/stores/redis_cache_store_test.rb#L231-L242) inclut aussi `CacheStoreBehavior`, contre un vrai Redis construit dans [son `setup`](' + CACHE + '/stores/redis_cache_store_test.rb#L205-L221). Pareil pour [`MemCacheStoreTest`](' + CACHE + '/stores/mem_cache_store_test.rb#L87-L99), contre un vrai Memcached.',
			'**Chaque store ne signe que ce qu’il peut tenir.** Le store en mémoire inclut `CacheDeleteMatchedBehavior`, Memcached non. Memcached inclut `FailureSafetyBehavior` et `ConnectionPoolBehavior`, le store en mémoire non. Le contrat est découpé en modules pour qu’un store puisse dire exactement quelles parties il promet.',
			'**Le vrai coûte de l’infrastructure.** Le setup Redis dit `skip "Redis server is not up" unless REDIS_UP`, et [celui de Memcached](' + CACHE + '/stores/mem_cache_store_test.rb#L63-L64) fait pareil. Une machine qui ne les a pas fait quand même tourner les tests du store en mémoire, et saute la comparaison sans bruit.',
			'**Entre équipes, la même idée demande un outil.** Dans un seul repo, Rails peut inclure un module dans chaque store. Deux services ne peuvent pas partager un module, donc les consumer-driven contracts écrivent l’attente sous forme de données (un pact). Dans les termes de Pact, pour les files « the consumer is the application that reads the message » (le consommateur est l’application qui lit le message) et le provider est celui qui l’écrit. Pour les messages, chaque interaction contient « the minimal expected message » (le message minimal attendu), les parties que le consommateur veut utiliser. Pour HTTP, lors de la vérification côté provider, la vraie réponse du provider « is compared with the minimal expected response » (est comparée à la réponse minimale attendue).'
		]
	},
	tradeoff: {
		gain: [
			'La plupart des tests tournent en millisecondes ou en secondes, sans qu’aucun service d’une autre équipe soit lancé. Un test rouge pointe vers une fonction ou un handler précis.',
			'Les doublures laissent chaque équipe tester et livrer à son propre rythme.',
			'Un test de contrat attrape le champ renommé dans la CI du producteur, avant le déploiement, plutôt qu’en production.',
			'Garder peu de tests de bout en bout les garde assez rapides pour tourner sur chaque pull request.'
		],
		cost: [
			'**Chaque doublure est une copie** du comportement de quelqu’un d’autre, et les copies dérivent (jour 17). Deux copies d’un même message, c’est deux endroits où oublier.',
			'**Un test de contrat demande les deux équipes.** Le consommateur écrit l’attente, le producteur la fait tourner, et quelqu’un doit prendre en charge un build rouge dans un repo qui n’a pas changé.',
			'Les tests sur un vrai store ont besoin de ce store en CI. Rails saute ses tests Redis et Memcached quand ils ne sont pas lancés, donc un service absent peut se cacher derrière un run vert.',
			'Les tests de bout en bout avec des remplaçants ressemblent à une garantie et n’en sont pas une. Ils prouvent le câblage, contre des copies.'
		]
	},
	task: {
		prompt: 'Pour chaque décision de la boutique, nomme le test le moins cher qui la protège, la CI de quel service le fait tourner, et ce qui est réel ou doublure. (a) Une remise ne rend jamais un total négatif. (b) Une commande rejouée est enregistrée une seule fois. (c) Le repository de commandes en mémoire se comporte comme celui sur Postgres. (d) `order.placed` porte toujours chaque champ que lit le service d’e-mails. (e) Un panier payé dans le navigateur devient une commande et un e-mail.',
		hint: 'Demande-toi à qui appartient la décision. Si un seul service la possède, sa propre CI peut la garder. Si deux services la partagent, le test doit tourner là où le changement serait fait.',
		answer: [
			'(a) Un test **unitaire** de la fonction de prix dans le service de commandes. Rien à simuler : c’est du code pur.',
			'(b) Un test d’**intégration** dans le service de commandes : le handler sur un vrai Postgres, parce que la règle vit dans un index unique et une transaction. L’API de paiement et le service d’e-mails sont des doublures.',
			'(c) Un test de **contrat d’adaptateur** dans le service de commandes : un seul jeu de tests de repository partagé, lancé contre la version en mémoire et contre Postgres dans Docker, comme Rails fait tourner `CacheStoreBehavior` contre ses stores mémoire, fichier, Memcached et Redis.',
			'(d) Un **consumer-driven contract**. Le service d’e-mails publie les champs qu’il lit (un pact ou un schéma). La CI du service de commandes y fait passer son vrai message publié. Une première étape moins chère : le service de commandes écrit son message capturé dans un fichier de fixture, et le service d’e-mails charge ce fichier au lieu d’une copie écrite à la main.',
			'(e) Un test de **bout en bout** sur le système construit, avec un faux fournisseur de paiement. Garde-en peu : c’est le plus lent des cinq.',
			'Si tu as mis (d) dans la suite de bout en bout, regarde à nouveau : une suite qui publie sa propre copie du message reste verte.'
		]
	},
	quiz: [
		{
			q: 'Que vérifie un test de contrat ?',
			options: [
				'Qu’un service répond dans sa latence convenue sous charge',
				'Que chaque ligne d’un service est couverte par au moins un test',
				'Que tout le système marche quand on le pilote par son interface utilisateur',
				'Qu’une doublure de test se comporte comme la vraie chose qu’elle remplace'
			],
			answer: 3,
			why: 'La définition de Fowler : les appels à tes doublures « return the same results as a call to the external service would » (renvoient les mêmes résultats qu’un appel au service externe). C’est ce qui garde honnêtes les tests rapides qui utilisent la doublure.'
		},
		{
			q: 'Le service de commandes renomme `firstName` en `givenName` dans `order.placed` et met à jour son propre test. Le service d’e-mails teste son handler avec un message écrit à la main. Quel test échoue ?',
			options: [
				'Le test du service de commandes, parce qu’il compare tout le message publié',
				'Aucun : chaque côté est testé contre sa propre copie du message',
				'Les tests du service d’e-mails, parce qu’ils parsent avec le vrai schéma',
				'La suite de bout en bout, si elle publie son propre exemple du message'
			],
			answer: 1,
			why: 'Le test du producteur a changé avec son code. La fixture du consommateur dit toujours `firstName`, donc son handler est content. Une suite de bout en bout avec sa propre copie reste verte aussi. Seul un test qui compare un côté avec l’autre échouerait.'
		},
		{
			q: 'Rails inclut `CacheStoreBehavior` dans les tests de ses stores mémoire, fichier, Memcached et Redis. Qu’est-ce que ça protège ?',
			options: [
				'Que les opérations de cache de base se comportent pareil dans chaque store',
				'Que Redis répond plus vite que Memcached sur la même machine',
				'Que chaque test de cache tourne deux fois, pour attraper les échecs aléatoires',
				'Que le cache est vidé entre les requêtes en production'
			],
			answer: 0,
			why: 'Le module « Tests the base functionality that should be identical across all cache stores ». Du code testé contre le store en mémoire peut alors compter sur les mêmes appels avec Redis ou Memcached.'
		}
	],
	takeaway: 'Teste ce qu’un service décide seul avec des tests rapides, teste ce que deux services ont convenu avec un test de contrat, et garde quelques tests de bout en bout pour le câblage.',
	sources: [
		{ title: 'Martin Fowler, TestPyramid', url: 'https://martinfowler.com/bliki/TestPyramid.html' },
		{ title: 'Ham Vocke, The Practical Test Pyramid', url: 'https://martinfowler.com/articles/practical-test-pyramid.html' },
		{ title: 'Martin Fowler, ContractTest', url: 'https://martinfowler.com/bliki/ContractTest.html' },
		{ title: 'Ian Robinson, Consumer-Driven Contracts: A Service Evolution Pattern', url: 'https://martinfowler.com/articles/consumerDrivenContracts.html' },
		{ title: 'Pact docs, How Pact works', url: 'https://docs.pact.io/getting_started/how_pact_works' }
	]
};
