const REPO = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const AS = `${REPO}/activestorage`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'ports-and-adapters',
	part: 'À l’intérieur d’un service',
	title: 'Ports et adaptateurs : un seul cœur, plusieurs backends',
	minutes: 10,
	hook: [
		'Un client de ta boutique en ligne envoie la photo d’un produit. Sur ton portable, elle atterrit dans un dossier. En CI, dans un dossier temporaire. En production, dans un bucket S3. Le code qui enregistre la photo est le même dans les trois cas. Comment ?',
		'Ce code ne parle jamais directement à un disque ou à S3. Il parle à une interface qui lui appartient, et chaque technologie a un petit bout de code qui implémente cette interface. Alistair Cockburn a appelé ça **ports et adaptateurs** (on dit aussi architecture hexagonale).',
		'Son intention, dans ses mots : permettre à une application d’être « développée et testée **isolément des périphériques et des bases de données qu’elle utilisera au final** ». Rails applique ce principe à l’envoi de fichiers, dans Active Storage.'
	],
	terms: [
		{ term: 'Port', def: 'Une interface qui appartient au cœur, écrite avec les mots du cœur : `upload`, `download`, `delete`. Elle ne dit rien de la technologie qui se trouve derrière.' },
		{ term: 'Adaptateur', def: 'Le code qui implémente un port pour une technologie donnée : disque local, S3, Google Cloud Storage. L’adaptateur dépend du port, et le cœur ne sait pas quels adaptateurs existent.' },
		{ term: 'Câblage', def: 'L’unique endroit qui choisit un adaptateur et le donne au cœur. Pour changer de backend, tu changes le choix à cet endroit.' },
		{ term: 'Décorateur', def: 'Une classe qui implémente le port et enveloppe d’autres implémentations du même port, pour ajouter un seul comportement, par exemple copier chaque envoi vers un second stockage.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['blob["ActiveStorage::Blob"] -->|"service.upload key, io"| port["ActiveStorage::Service (port)"]'],
				highlight: ['blob', 'port'],
				note: '`Blob` est le modèle du cœur, derrière chaque fichier attaché. Il appelle `service.upload`, `service.download`, `service.delete`. `Service` est une classe abstraite dont les méthodes font surtout `raise NotImplementedError`.'
			},
			{
				add: ['disk["DiskService"] -.->|implémente| port', 's3["S3Service"] -.->|implémente| port', 'gcs["GCSService"] -.->|implémente| port'],
				highlight: ['disk', 's3', 'gcs'],
				note: 'Trois adaptateurs, chacun une sous-classe de `Service`. Seul `s3_service.rb` charge le SDK AWS. Le gemspec d’Active Storage n’en dépend pas : une appli qui n’utilise jamais S3 **ne charge jamais le SDK AWS**.'
			},
			{
				add: ['env["config/environments : active_storage.service"] -->|"choisit :test ou :local"| yml["config/storage.yml"]', 'yml -->|"service: Disk"| conf["Configurator"]', 'conf -->|construit| disk'],
				highlight: ['env', 'yml', 'conf'],
				note: 'Le câblage commence dans chaque fichier d’environnement. Dans une nouvelle appli, `test.rb` dit `:test`, `development.rb` et `production.rb` disent `:local`. `storage.yml` associe chaque nom à un adaptateur. Le `Configurator` construit un `DiskService` à partir de `Disk`.'
			},
			{
				add: ['mirror["MirrorService"] -.->|implémente| port', 'mirror -->|"enveloppe : primary"| disk', 'mirror -->|"enveloppe : mirrors"| s3'],
				highlight: ['mirror'],
				note: '`MirrorService` est un décorateur : lui aussi est un `Service`. Il envoie vers un stockage principal, puis copie vers les miroirs dans un job en arrière-plan. Il marche avec n’importe quels adaptateurs, et eux n’en savent rien.'
			},
			{
				add: ['blob -.->|"respond_to?(:mirror_later)"| mirror'],
				highlight: ['blob', 'mirror'],
				note: '`Blob#mirror_later` demande au service s’il **répond à** `mirror_later`, une méthode qui n’est pas dans le port. Le cœur sait maintenant que cette implémentation précise existe.'
			}
		]
	},
	example: {
		title: 'activestorage/lib/active_storage/service/configurator.rb',
		repo: 'rails/rails',
		url: `${AS}/lib/active_storage/service/configurator.rb#L15-L43`,
		lang: 'ruby',
		code: `    def build(service_name)
      config = config_for(service_name.to_sym)
      resolve(config.fetch(:service)).build(
        **config, configurator: self, name: service_name
      )
    end
…
      def resolve(class_name)
        service_name = :"#{class_name.camelize}Service"
        unless ActiveStorage::Service.const_defined?(service_name)
          require "active_storage/service/#{class_name.to_s.underscore}_service"
        end
        ActiveStorage::Service.const_get(service_name)
      rescue LoadError
        raise "Missing service adapter for #{class_name.inspect}"
      end`,
		notes: [
			'Les lignes 8 à 16, `resolve`, trouvent la classe d’adaptateur pour un nom de `storage.yml`. `service: Disk` désigne la classe `DiskService`, et la ligne 11 ne charge `active_storage/service/disk_service.rb` que quand on le demande. Le message d’erreur de la ligne 15 l’appelle un **adapter**.',
			'Le cœur n’appelle que le port. [`Blob#upload_without_unfurling`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/app/models/active_storage/blob.rb#L307-L309) tient en une ligne : `service.upload key, io, checksum: checksum, **service_metadata`.',
			'L’[initializer du moteur](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/lib/active_storage/engine.rb#L202-L219) lit `storage.yml`, construit un registre de services nommés, et règle `Blob.service` à partir de `config.active_storage.service`. Aucun autre code ne choisit le service.',
			'Un seul contrat de test couvre tous les adaptateurs : [`SharedServiceTests`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/test/service/shared_service_tests.rb#L6-L20) envoie, télécharge et supprime à travers le port. Le test Disk (dans les sources) se contente de construire un `DiskService` et de l’inclure.'
		]
	},
	tradeoff: {
		gain: [
			'Le disque en développement et en tests, S3 en production, et le code des modèles ne change pas. Pour changer de backend, tu modifies `config.active_storage.service`.',
			'Une seule suite de tests partagée vérifie chaque adaptateur contre le même port. Les tests de ton appli tournent sur disque, sans compte cloud.',
			'Un décorateur marche sur tous les backends à la fois. Le guide Rails dit qu’un service miroir « est prévu pour être utilisé temporairement pendant une **migration** entre services en production ».'
		],
		cost: [
			'Le même appel demande une préparation différente selon l’adaptateur. Sur S3, `url` signe un lien tout seul. [`DiskService`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/lib/active_storage/service/disk_service.rb#L175-L179) le construit à partir des routes de l’appli et lève une erreur si `ActiveStorage::Current.url_options` n’est pas défini.',
			'[`Blob#mirror_later`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/app/models/active_storage/blob.rb#L364-L366) vérifie `respond_to?(:mirror_later)`. Le cœur connaît une méthode qui est hors de l’interface.',
			'Les tests partagés ne tournent que là où le backend existe. Sans identifiants, le [fichier de test S3](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/test/service/s3_service_test.rb#L7-L9) affiche « Skipping S3 Service tests », et un run vert sur disque ne dit rien de S3.'
		]
	},
	task: {
		prompt: 'L’équipe ops veut stocker les envois sur un nouveau stockage objet avec sa propre API, non compatible S3. Appelons-le Acme. En t’aidant du diagramme, liste chaque endroit que tu t’attends à modifier, et un endroit que tu t’attends à **ne pas** modifier.',
		hint: 'Suis les flèches : qui implémente le port, qui choisit l’adaptateur, qui se contente de l’envelopper ou de l’appeler ?',
		answer: [
			'Un nouvel adaptateur : `ActiveStorage::Service::AcmeService < Service`, dans un fichier `active_storage/service/acme_service.rb` présent dans le load path, pour que `resolve` le trouve.',
			'Le câblage : une entrée `acme:` dans `storage.yml` avec `service: Acme`, et `config.active_storage.service = :acme` en production.',
			'Pas modifiés : `Blob`, tes modèles avec `has_one_attached`, et `MirrorService`. Ils ne connaissent que `Service`.',
			'Implémente le port en entier, au delà de `upload` et `download` : `url_for_direct_upload`, `compose`, `delete_prefixed`, ainsi que `private_url` et `public_url` qu’appelle `url`, lèvent tous `NotImplementedError` par défaut.',
			'Ça vaut le coup : inclus `SharedServiceTests` dans le test de l’adaptateur, et fais-le tourner contre un vrai bucket Acme en CI. Ensuite, un miroir de l’ancien stockage vers Acme copie chaque nouvel envoi dans les deux stockages pendant la migration.'
		],
		steps: [
			{
				title: 'Lis le diagramme',
				questions: [
					{ q: 'Où Acme apparaît-il sur le diagramme ?', options: ['En flèche directe de `Blob` vers Acme', 'En nouvelle boîte à côté de `DiskService`, `S3Service` et `GCSService`, qui implémente le port', 'Dans `MirrorService`, comme nouveau type de miroir', 'En nouvelle branche dans le `Configurator`'], answer: 1, why: 'Acme est un adaptateur de plus. Il rejoint les trois autres à droite du port, et `Blob` continue d’appeler le port.' },
					{ q: 'Acme a sa propre API, non compatible S3. Peux-tu réutiliser `S3Service` ?', options: ['Oui, en le faisant pointer vers l’endpoint Acme', 'Oui, si tu l’enveloppes dans `MirrorService`', 'Non, Acme a besoin de son propre adaptateur, une sous-classe de `Service`', 'Non, il faut d’abord apprendre Acme à `Blob`'], answer: 2, why: 'Un adaptateur implémente le port pour une technologie. Une nouvelle API veut dire un nouvel adaptateur.' },
					{ q: '`Blob#mirror_later` vérifie `respond_to?(:mirror_later)`. Qu’est-ce que ça dit du cœur ?', options: ['Rien : il n’appelle toujours que le port', 'Il connaît une implémentation, par une méthode hors du port', 'Il choisit l’adaptateur lui-même', 'Il charge tous les adaptateurs au démarrage'], answer: 1, why: '`mirror_later` ne fait pas partie de `Service`. Le cœur sait maintenant que `MirrorService` existe, une petite fuite dans le port.' },
					{ q: 'Qu’appelle `Blob` quand il enregistre un fichier ?', options: ['`service.upload key, io`', 'Le SDK S3, directement', '`DiskService#upload`, puis le cloud', '`Configurator#build`'], answer: 0, why: 'Le cœur n’appelle que le port. `upload_without_unfurling` tient en cette seule ligne.' }
				]
			},
			{
				title: 'Écris l’adaptateur',
				questions: [
					{ q: 'Où va la nouvelle classe, pour que `resolve` la trouve ?', options: ['Dans `app/models`, à côté de `Blob`', 'Dans `active_storage/service/acme_service.rb`, dans le load path', 'Dans `storage.yml`, en code Ruby', 'Dans `configurator.rb`, comme nouvelle branche'], answer: 1, why: '`resolve` charge `active_storage/service/acme_service` quand on lui demande `Acme`.' },
					{ q: '`storage.yml` dit `service: Acme`. Quelle classe `resolve` cherche-t-il ?', options: ['`Acme`', '`AcmeAdapter`', '`AcmeService`', '`ActiveStorage::Acme`'], answer: 2, why: 'Il met le nom en camel case et ajoute `Service`, puis le cherche sous `ActiveStorage::Service`.' },
					{ q: 'Tu n’implémentes que `upload` et `download`. Que fait un appel à `compose` ?', options: ['Il se rabat sur l’adaptateur disque', 'Il lève `NotImplementedError`, le défaut dans `Service`', 'Il ne fait rien et rend la main', 'Il est pris en charge par `MirrorService`'], answer: 1, why: 'Les méthodes du port font surtout `raise NotImplementedError`. Chaque adaptateur doit les remplir.' },
					{ q: 'Quelles méthodes font aussi partie du port ?', options: ['`url_for_direct_upload`, `compose`, `delete_prefixed`, `private_url` et `public_url`', 'Aucune : seulement `upload`, `download` et `delete`', '`has_one_attached` et `mirror_later`', '`build` et `resolve`'], answer: 0, why: 'Elles lèvent toutes `NotImplementedError` par défaut, et `url` appelle `private_url` ou `public_url`.' }
				]
			},
			{
				title: 'Câble-le',
				questions: [
					{ q: 'Qu’ajoutes-tu à `storage.yml` ?', options: ['Une ligne `require` pour le SDK Acme', 'La liste des modèles qui doivent utiliser Acme', 'Une nouvelle sous-classe de `Blob` pour Acme', 'Une entrée `acme:` avec `service: Acme`'], answer: 3, why: '`storage.yml` associe chaque nom à un adaptateur. Cette entrée est la seule nouvelle ligne.' },
					{ q: 'Comment la production se met-elle à utiliser Acme ?', options: ['Règle `config.active_storage.service = :acme` en production', 'Ajoute `if Rails.env.production?` dans chaque modèle', 'Renomme `S3Service` en `AcmeService`', 'Supprime l’entrée `local:` de `storage.yml`'], answer: 0, why: 'Le fichier d’environnement nomme le service. Pour changer, tu changes ce choix.' },
					{ q: 'Après le changement, pourquoi tes tests tournent-ils toujours sur disque ?', options: ['Parce qu’Acme n’a pas de mode test', 'Parce que `Blob` détecte la CI et choisit le disque', 'Parce que `test.rb` dit toujours `:test`, associé à `Disk`', 'Parce que le SDK AWS n’est pas chargé en tests'], answer: 2, why: 'Chaque environnement choisit son propre service. Seule la production a changé.' },
					{ q: 'Une appli n’utilise jamais S3. Charge-t-elle le SDK AWS ?', options: ['Oui, le gemspec d’Active Storage en dépend', 'Oui, le `Configurator` charge tous les adaptateurs au démarrage', 'Non, seul `s3_service.rb` le charge, et seulement quand on le demande', 'Non, mais seulement parce qu’Acme le remplace'], answer: 2, why: '`resolve` ne charge un fichier d’adaptateur que quand un service le nomme, et le gemspec ne dépend pas du SDK AWS.' }
				]
			},
			{
				title: 'Nomme ce qui reste',
				questions: [
					{ q: 'Quel code t’attends-tu à **ne pas** modifier ?', options: ['`storage.yml`', '`Blob` et tes modèles avec `has_one_attached`', 'Le fichier d’environnement de production', 'Le fichier de test de l’adaptateur'], answer: 1, why: 'Ils ne connaissent que `Service`. Le nouveau backend vit derrière le port.' },
					{ q: 'La migration vers Acme est finie, et chaque fichier est dans Acme. Que fais-tu du miroir ?', options: ['Tu le gardes pour de bon, comme sauvegarde', 'Tu remets l’ancien stockage en primaire', 'Tu ajoutes S3 comme troisième miroir', 'Tu le retires : le guide Rails dit qu’un miroir est temporaire, pour une migration'], answer: 3, why: 'Un miroir double chaque envoi. Une fois la migration finie, la production peut nommer `:acme` seul.' },
					{ q: 'Comment vérifies-tu que `AcmeService` respecte le contrat du port ?', options: ['Inclus `SharedServiceTests` et fais-le tourner contre un vrai bucket Acme en CI', 'Lance les tests disque, puisqu’ils utilisent le même port', 'Lis attentivement la doc de l’API Acme', 'Déploie et surveille les erreurs en production'], answer: 0, why: 'Une seule suite de tests partagée vérifie chaque adaptateur contre le même port. Elle a besoin du vrai backend pour valoir quelque chose.' },
					{ q: 'Sans identifiants, le test Acme est sauté, comme celui de S3. La CI est verte sur disque. Qu’est-ce que ça te dit d’Acme ?', options: ['Qu’Acme marche, puisque le port est partagé', 'Rien : les tests partagés n’ont jamais tourné contre Acme', 'Qu’Acme a passé les tests du miroir', 'Qu’Acme n’a plus de `NotImplementedError`'], answer: 1, why: 'Les tests partagés ne tournent que là où le backend existe. Un run vert sur disque ne dit rien d’un autre stockage.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Avec ports et adaptateurs, dans quel sens vont les dépendances ?',
			options: ['Le cœur importe chaque adaptateur, pour pouvoir choisir le bon', 'Les adaptateurs dépendent d’un port qui appartient au cœur, et le cœur ne connaît aucun adaptateur', 'Le cœur et les adaptateurs dépendent tous les deux du driver de base de données', 'Il n’y a aucune dépendance : le cœur et les adaptateurs ne se parlent que par le réseau'],
			answer: 1,
			why: 'Le cœur possède l’interface. Les adaptateurs l’implémentent, et un point de câblage unique choisit quel adaptateur le cœur reçoit. Le code du cœur ne nomme jamais S3, GCS ou le disque.'
		},
		{
			q: 'Une appli Rails stocke les envois sur disque en tests et sur S3 en production, avec le même code de modèle. Où ce choix est-il fait ?',
			options: ['Dans chaque modèle, avec un `if Rails.env.production?` autour de chaque `has_one_attached`', 'Dans `Blob`, qui regarde quelles gems de stockage sont installées et prend la première', 'Dans le `config.active_storage.service` de chaque environnement, qui nomme une entrée de `storage.yml`', 'Dans le SDK S3, qui se rabat sur le disque local quand aucun bucket n’est défini dans l’env'],
			answer: 2,
			why: 'L’environnement nomme un service, `storage.yml` associe ce nom à un adaptateur, et le configurator le construit. Les modèles se contentent d’appeler `service`.'
		},
		{
			q: '`MirrorService` implémente `Service` et enveloppe un stockage principal et des miroirs. Qu’est-ce que ce design apporte ?',
			options: ['Des téléchargements plus rapides, puisqu’il lit chaque fichier sur tous les miroirs à la fois et garde le premier', 'Des envois atomiques, donc un fichier arrive dans tous les stockages ou dans aucun', 'Plus besoin de fichier `storage.yml`, puisque les miroirs sont définis dans le code', 'La copie des envois vers un second stockage avec n’importe quels adaptateurs, sans toucher à eux ni à leurs appelants'],
			answer: 3,
			why: 'Un décorateur ajoute un comportement derrière la même interface. Les téléchargements vont toujours vers le stockage principal, et le guide prévient que le miroir n’est pas atomique.'
		}
	],
	recall: {
		q: 'Dans Active Storage, quel est le port, et quelle ligne de config choisit l’adaptateur derrière lui ?',
		a: 'Le port est la classe abstraite `ActiveStorage::Service`. Chaque environnement règle `config.active_storage.service`, qui nomme une entrée de `storage.yml`, par exemple `service: Disk`.'
	},
	sources: [
		{ title: 'Alistair Cockburn, Hexagonal architecture', url: 'https://alistair.cockburn.us/hexagonal-architecture/' },
		{ title: 'Rails, active_storage/service.rb, the port', url: `${AS}/lib/active_storage/service.rb#L43-L74` },
		{ title: 'Rails, active_storage/service/configurator.rb, the wiring', url: `${AS}/lib/active_storage/service/configurator.rb#L15-L43` },
		{ title: 'Rails, active_storage/service/mirror_service.rb, a decorator', url: `${AS}/lib/active_storage/service/mirror_service.rb#L14-L49` },
		{ title: 'Rails, test/service/disk_service_test.rb', url: `${AS}/test/service/disk_service_test.rb#L5-L9` },
		{ title: 'Rails Guides, Active Storage Overview', url: 'https://guides.rubyonrails.org/active_storage_overview.html' }
	]
};
