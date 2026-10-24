const REPO = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const CACHE = `${REPO}/activesupport/test/cache`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'testing-strategy',
	part: 'Fait pour durer',
	title: 'Stratégie de test',
	minutes: 10,
	hook: [
		'Le service de commandes de ta boutique publie `order.placed` avec le `firstName` du client. Le service d’e-mails s’en sert pour écrire « Hello Ana ». Les deux équipes testent leur côté, et les deux suites passent : le service de commandes vérifie le message qu’il publie, et le service d’e-mails donne à son handler un message écrit à la main.',
		'Imagine maintenant un nettoyage dans le service de commandes : `firstName` est renommé en `givenName`, et son test est mis à jour dans le même commit, donc il passe. Le message écrit à la main du service d’e-mails dit toujours `firstName`, donc ses tests restent verts aussi. En production, chaque e-mail commence par **« Hello , »**. Aucun test n’a échoué, parce qu’aucun test n’a jamais mis les deux côtés ensemble.',
		'Plus de tests de chaque genre ne l’auraient pas attrapé, parce que chaque nouveau test utiliserait lui aussi la copie du message d’un seul côté. Une stratégie de test dit quel test protège quelle décision. Les tests rapides gardent ce qu’un service décide seul, et les **tests de contrat** gardent ce que deux services ont convenu. Quelques tests de bout en bout vérifient que les services sont bien branchés.'
	],
	terms: [
		{ term: 'Test double (doublure de test)', def: 'Un remplaçant pour quelque chose avec quoi ton code discute : un stockage en mémoire, une fausse API de paiement, un message écrit à la main. Il rend les tests rapides, et il n’est fidèle que jusqu’à la dernière fois où quelqu’un l’a comparé avec le vrai.' },
		{ term: 'Test de contrat', def: 'Un test qui vérifie une doublure contre la vraie chose qu’elle remplace. Fowler : « These check that all the calls against your test doubles return the same results as a call to the external service would. » (ils vérifient que tous les appels à tes doublures renvoient les mêmes résultats qu’un appel au service externe).' },
		{ term: 'Consumer-driven contract (contrat piloté par le consommateur)', def: 'Chaque consommateur écrit la partie d’un message ou d’une API qu’il lit vraiment, et le producteur fait tourner ces attentes dans sa propre CI. L’outil Pact met en œuvre ce pattern.' },
		{ term: 'Test de bout en bout', def: 'Le système construit, piloté comme le ferait un utilisateur. Lent et large, donc garde-en quelques-uns qui prouvent que les morceaux sont bien câblés ensemble.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['unit["Unitaire : règles de prix, sans I/O"] -->|"protège"| d1["Une remise ne rend jamais un total négatif"]'],
				highlight: ['unit', 'd1'],
				note: 'Les tests unitaires sont les nombreux tests rapides du bas de la pyramide des tests. Les tests de prix du service de commandes appellent des fonctions pures avec des paniers écrits en dur, en quelques millisecondes. Ils gardent une règle qui vit **à un seul endroit**, donc un test rapide suffit.'
			},
			{
				add: ['integ["Intégration : service de commandes sur un vrai Postgres"] -->|"protège"| d2["Une commande rejouée est enregistrée une seule fois"]', 'integ -.->|"simule"| fakes["API de paiement, service d’e-mails"]', 'class fakes ext'],
				highlight: ['integ', 'd2', 'fakes'],
				note: 'Un test d’intégration se place un niveau au-dessus. La règle « enregistrée une seule fois » vit dans un index unique et une transaction, donc le test a besoin de **la vraie base**. Tout ce qui n’appartient pas au service est une doublure : l’API de paiement, le service d’e-mails.'
			},
			{
				add: ['beh["CacheStoreBehavior : écrit une seule fois"] --> mem["MemoryStore"]', 'beh --> redis[("RedisCacheStore sur un vrai Redis")]'],
				highlight: ['beh', 'mem', 'redis'],
				note: 'Rails a un test de contrat pour une doublure qui lui appartient : il écrit ses tests de cache une seule fois, sous forme de module de comportements. Le store en mémoire, le store fichier, Memcached et Redis l’incluent chacun. Tout test qui utilise le store en mémoire, rapide, peut compter sur lui pour **se comporter comme les vrais** sur tout ce que testent ces modules partagés.'
			},
			{
				add: ['producer["Test des commandes : ce qu’il publie"] -.->|"aucun test ne les compare"| consumer["Fixture e-mails : ce qu’il lit"]', 'class producer ext'],
				highlight: ['producer', 'consumer'],
				note: 'La fixture e-mails est une doublure d’un message qui appartient au service de commandes. Le message existe en deux copies écrites à la main, chacune vérifiée seulement contre son propre code. C’est sur cette ligne pointillée qu’un **consumer-driven contract** a sa place.'
			},
			{
				add: ['e2e["E2E : passage de commande dans un navigateur, paiement simulé"] -->|"protège"| d5["Un panier payé devient une commande et un e-mail"]'],
				highlight: ['e2e', 'd5'],
				note: 'Au sommet, une poignée de tests navigateur tournent sur le système construit. Même eux utilisent des doublures : un faux fournisseur de paiement, peut-être une fausse boîte mail. Avec ces remplaçants, le test vérifie que les services sont branchés, mais ne compare jamais la vraie API de paiement avec sa doublure.'
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
			'La ligne 8 inclut [`CacheStoreBehavior`](' + CACHE + '/behaviors/cache_store_behavior.rb#L6-L19), qui commence par « Tests the base functionality that should be identical across all cache stores. » (teste les fonctionnalités de base qui doivent être identiques dans tous les stores de cache). Ses tests ne parlent qu’à `@cache`. Les lignes 18 à 20 construisent le store de cette classe dans `setup`, et les lignes 8 à 16 incluent les comportements.',
			'[`RedisCacheStoreCommonBehaviorTest`](' + CACHE + '/stores/redis_cache_store_test.rb#L231-L242) inclut aussi `CacheStoreBehavior`, contre un vrai Redis construit dans son `setup`. `MemCacheStoreTest` fait pareil contre un vrai Memcached.',
			'La ligne 13 inclut `CacheDeleteMatchedBehavior` pour le store en mémoire, et Memcached ne l’inclut pas. Memcached inclut `FailureSafetyBehavior` et `ConnectionPoolBehavior`, et le store en mémoire non. Le contrat est découpé en modules pour qu’un store puisse dire exactement quelles parties il promet.',
			'Les vrais stores ont besoin de Redis et de Memcached lancés. Le setup Redis dit `skip "Redis server is not up" unless REDIS_UP`, et [celui de Memcached](' + CACHE + '/stores/mem_cache_store_test.rb#L63-L64) fait pareil. Une machine qui ne les a pas fait quand même tourner les tests du store en mémoire, et saute la comparaison sans échouer.',
			'Deux services dans deux repos ne peuvent pas partager un module Ruby, donc les consumer-driven contracts écrivent l’attente sous forme de données (un pact). Dans les termes de Pact, pour les files « the consumer is the application that reads the message » (le consommateur est l’application qui lit le message) et le provider est celui qui l’écrit. Pour les messages, chaque interaction contient « the minimal expected message » (le message minimal attendu), les parties que le consommateur veut utiliser. Pour HTTP, lors de la vérification côté provider, la vraie réponse du provider « is compared with the minimal expected response » (est comparée à la réponse minimale attendue).'
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
			'Chaque doublure copie le comportement de quelqu’un d’autre, et la copie dérive quand l’original change (jour 17). Le message `order.placed` existe en deux copies, donc un renommage doit se faire dans les deux.',
			'Un test de contrat demande les deux équipes : le consommateur écrit l’attente, le producteur la fait tourner, et quelqu’un doit prendre en charge un build rouge dans un repo qui n’a pas changé.',
			'Les tests sur un vrai store ont besoin de ce store en CI. Rails saute ses tests Redis et Memcached quand ils ne sont pas lancés, donc un service absent peut se cacher derrière un run vert.',
			'Une suite de bout en bout qui utilise sa propre copie d’un message reste verte quand le vrai message change.'
		]
	},
	task: {
		prompt: 'Pour chaque décision de la boutique, nomme le test le moins cher qui la protège, la CI de quel service le fait tourner, et ce qui est réel ou doublure. (a) Une remise ne rend jamais un total négatif. (b) Une commande rejouée est enregistrée une seule fois. (c) Le repository de commandes en mémoire se comporte comme celui sur Postgres. (d) `order.placed` porte toujours chaque champ que lit le service d’e-mails. (e) Un panier payé dans le navigateur devient une commande et un e-mail.',
		hint: 'Demande-toi à qui appartient la décision. Si un seul service la possède, sa propre CI peut la garder. Si deux services la partagent, le test doit tourner là où le changement serait fait.',
		answer: [
			'(a) Un test **unitaire** de la fonction de prix dans le service de commandes. Il n’a besoin d’aucune doublure, parce que la fonction ne fait aucune I/O.',
			'(b) Un test d’**intégration** dans le service de commandes : le handler sur un vrai Postgres, parce que la règle vit dans un index unique et une transaction. L’API de paiement et le service d’e-mails sont des doublures.',
			'(c) Un test de **contrat d’adaptateur** dans le service de commandes : un seul jeu de tests de repository partagé, lancé contre la version en mémoire et contre Postgres dans Docker, comme Rails fait tourner `CacheStoreBehavior` contre ses stores mémoire, fichier, Memcached et Redis.',
			'(d) Un **consumer-driven contract**. Le service d’e-mails publie les champs qu’il lit (un pact ou un schéma). La CI du service de commandes y fait passer son vrai message publié. Une première étape moins chère : le service de commandes écrit son message capturé dans un fichier de fixture, et le service d’e-mails charge ce fichier au lieu d’une copie écrite à la main.',
			'(e) Un test de **bout en bout** sur le système construit, avec un faux fournisseur de paiement. Garde-en peu : c’est le plus lent des cinq.',
			'Si tu as mis (d) dans la suite de bout en bout, regarde à nouveau : une suite qui publie sa propre copie du message reste verte.'
		],
		steps: [
			{
				title: 'Demande à qui appartient chaque décision',
				questions: [
					{ q: 'À qui appartient (a), la règle qui veut qu’une remise ne rende jamais un total négatif ?', options: ['Au service d’e-mails', 'Aux deux services ensemble', 'Au service de commandes seul', 'Au fournisseur de paiement'], answer: 2, why: 'La règle de prix vit à un seul endroit, dans le service de commandes, donc sa propre CI peut la garder.' },
					{ q: 'À qui appartient (d), les champs de `order.placed` que lit le service d’e-mails ?', options: ['Au service de commandes seul, puisqu’il publie', 'Aux deux : le service de commandes l’écrit et le service d’e-mails le lit', 'Au service d’e-mails seul, puisqu’il lit', 'À personne, puisque c’est juste un message'], answer: 1, why: 'Deux services se sont mis d’accord sur cette forme. Une décision partagée demande un test qui met les deux côtés ensemble.' },
					{ q: 'Si un seul service possède une décision, où tourne son test ?', options: ['Dans la CI de ce service', 'Dans une suite de bout en bout partagée', 'Dans la CI de chaque consommateur', 'Seulement dans la supervision de production'], answer: 0, why: 'Une règle qui vit dans un service est gardée par un test rapide dans ce service.' },
					{ q: 'Si deux services partagent une décision, où doit tourner le test ?', options: ['Seulement dans la CI du consommateur', 'Dans un job nocturne qui n’appartient à personne', 'Seulement dans la suite de bout en bout', 'Là où le changement serait fait'], answer: 3, why: 'Le test doit échouer dans la CI de l’équipe qui s’apprête à casser la décision, avant le déploiement.' }
				]
			},
			{
				title: 'Garde ce qu’un service possède seul',
				questions: [
					{ q: 'Quel test protège (a) ?', options: ['Un test d’intégration sur Postgres', 'Un test unitaire de la fonction de prix', 'Un test de bout en bout du paiement', 'Un test de contrat avec le service d’e-mails'], answer: 1, why: 'La fonction de prix ne fait aucune I/O. Un test unitaire avec des paniers littéraux tourne en quelques millisecondes.' },
					{ q: 'De quelles doublures le test de (a) a-t-il besoin ?', options: ['D’une fausse base de données', 'D’une fausse API de paiement', 'D’aucune : la fonction ne fait aucune I/O', 'D’un message `order.placed` écrit à la main'], answer: 2, why: 'Une fonction pure prend des entrées simples. Il n’y a rien à remplacer.' },
					{ q: 'Quel test protège (b), une commande rejouée enregistrée une seule fois ?', options: ['Un test d’intégration sur un vrai Postgres', 'Un test unitaire avec un stockage en mémoire', 'Un test de bout en bout dans le navigateur', 'Un consumer-driven contract'], answer: 0, why: 'La règle vit dans un index unique et une transaction, donc le test a besoin de la vraie base.' },
					{ q: 'Dans le test de (b), qu’est-ce qui est une doublure ?', options: ['La base Postgres', 'Le handler de commande', 'L’index unique', 'L’API de paiement et le service d’e-mails'], answer: 3, why: 'Tout ce que le service de commandes ne possède pas est une doublure. Sa base est ce dont la règle dépend, donc elle reste réelle.' }
				]
			},
			{
				title: 'Compare la doublure au vrai',
				questions: [
					{ q: 'Quel type de test protège (c), le repository en mémoire qui se comporte comme Postgres ?', options: ['Un test de contrat d’adaptateur', 'Un test unitaire du repository en mémoire seul', 'Un consumer-driven contract', 'Un test de bout en bout'], answer: 0, why: 'Un test de contrat vérifie une doublure contre la vraie chose qu’elle remplace.' },
					{ q: 'Comment ce test est-il construit ?', options: ['Deux fichiers de test séparés, un par repository', 'Un seul jeu de tests partagé, lancé contre la version en mémoire et contre Postgres', 'Une comparaison des deux fichiers source', 'Un test qui tourne seulement contre Postgres'], answer: 1, why: 'Rails écrit `CacheStoreBehavior` une fois et l’inclut dans les tests des stores mémoire, fichier, Memcached et Redis.' },
					{ q: 'D’où vient Postgres dans ce passage de CI ?', options: ['D’un réplica de production', 'D’une base de staging partagée', 'De Docker', 'Du repository en mémoire lui-même'], answer: 2, why: 'Le vrai stockage doit tourner dans la CI. Docker donne à chaque passage son propre Postgres.' },
					{ q: 'Rails saute ses tests Redis quand Redis n’est pas lancé. Quel est le risque ?', options: ['Les tests du store mémoire échouent aussi', 'Redis reçoit de mauvaises données', 'La suite de tests tourne deux fois', 'Un service absent peut se cacher derrière un passage vert'], answer: 3, why: 'Un test sauté n’est pas un échec. Si le vrai stockage ne démarre jamais, la comparaison n’a jamais lieu, sans bruit.' }
				]
			},
			{
				title: 'Garde le message partagé et le câblage',
				questions: [
					{ q: 'Quel test protège (d) ?', options: ['Un consumer-driven contract', 'Un test de bout en bout', 'Un test unitaire dans le service d’e-mails', 'Un test d’intégration dans le service de commandes'], answer: 0, why: 'Le service d’e-mails écrit les champs qu’il lit, et la CI du service de commandes vérifie son vrai message contre eux.' },
					{ q: 'Quelle première étape moins chère pour (d) ?', options: ['Plus de messages écrits à la main dans le service d’e-mails', 'Une règle de revue de code pour les renommages', 'Le service de commandes écrit son message capturé dans un fichier de fixture que le service d’e-mails charge', 'Un canal Slack partagé entre les équipes'], answer: 2, why: 'Le service d’e-mails teste alors contre le vrai message au lieu de sa propre copie.' },
					{ q: 'Quel test protège (e), un panier payé qui devient une commande et un e-mail ?', options: ['Un test unitaire du panier', 'Un test de bout en bout sur le système construit, avec un faux fournisseur de paiement', 'Un test de contrat de l’API de paiement', 'Un test d’intégration du service d’e-mails'], answer: 1, why: 'Seul le système construit, piloté comme par un utilisateur, montre que les services sont câblés ensemble.' },
					{ q: 'Pourquoi ne pas mettre (d) dans la suite de bout en bout ?', options: ['Les tests de bout en bout ne savent pas lire de messages', 'Ça rendrait la suite trop rapide', 'Le service d’e-mails possède cette suite', 'Une suite qui publie sa propre copie du message reste verte'], answer: 3, why: 'Si le test utilise sa propre copie, il ne compare jamais le producteur au consommateur, ce qui est tout l’objet de (d).' }
				]
			}
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
			why: 'La définition de Fowler : les appels à tes doublures « return the same results as a call to the external service would » (renvoient les mêmes résultats qu’un appel au service externe). Sans cette vérification, les tests rapides qui utilisent la doublure peuvent passer alors que le vrai service se comporte autrement.'
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
	recall: {
		q: 'Le service de commandes renomme un champ de `order.placed`. Quel test l’attrape avant la production, et dans la CI de quel service tourne-t-il ?',
		a: 'Un consumer-driven contract. Le service d’e-mails écrit les champs qu’il lit, et la CI du service de commandes fait passer son vrai message publié contre eux.'
	},
	sources: [
		{ title: 'Rails, redis_cache_store_test.rb (setup with a real Redis)', url: `${CACHE}/stores/redis_cache_store_test.rb#L205-L221` },
		{ title: 'Rails, mem_cache_store_test.rb (MemCacheStoreTest)', url: `${CACHE}/stores/mem_cache_store_test.rb#L87-L99` },
		{ title: 'Martin Fowler, TestPyramid', url: 'https://martinfowler.com/bliki/TestPyramid.html' },
		{ title: 'Ham Vocke, The Practical Test Pyramid', url: 'https://martinfowler.com/articles/practical-test-pyramid.html' },
		{ title: 'Martin Fowler, ContractTest', url: 'https://martinfowler.com/bliki/ContractTest.html' },
		{ title: 'Ian Robinson, Consumer-Driven Contracts: A Service Evolution Pattern', url: 'https://martinfowler.com/articles/consumerDrivenContracts.html' },
		{ title: 'Pact docs, How Pact works', url: 'https://docs.pact.io/getting_started/how_pact_works' }
	]
};
