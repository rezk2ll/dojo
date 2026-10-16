const REPO = 'https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146';
const AS = `${REPO}/activestorage`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ports-and-adapters',
	part: 'Inside a service',
	title: 'Ports and adapters: one core, many backends',
	minutes: 10,
	hook: [
		'A user of your online shop uploads a product photo. On your laptop it lands in a folder. In CI it lands in a temp folder. In production it lands in an S3 bucket. The code that saves the photo is the same in all three. How?',
		'That code never talks to a disk or to S3 directly. It talks to an **interface it owns**, and each technology gets a small piece of code that implements that interface. Alistair Cockburn named this **ports and adapters** (also called hexagonal architecture).',
		'His stated intent: let an application "be developed and tested **in isolation from its eventual run-time devices and databases**." Rails does exactly this for file uploads, in Active Storage. Today you read how.'
	],
	terms: [
		{ term: 'Port', def: 'An interface owned by the core, written in the core\'s words: `upload`, `download`, `delete`. It says nothing about which technology sits behind it.' },
		{ term: 'Adapter', def: 'The code that implements a port for one technology: local disk, S3, Google Cloud Storage.' },
		{ term: 'Dependency inversion', def: 'The adapter depends on the port, not the other way round. The core does not know which adapters exist.' },
		{ term: 'Wiring', def: 'The one place that picks an adapter and hands it to the core. Change the choice there, nowhere else.' },
		{ term: 'Decorator', def: 'A class that implements the port and wraps other implementations of the same port, adding one behavior such as copying every upload to a second store.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['blob["ActiveStorage::Blob"] -->|"service.upload key, io"| port["ActiveStorage::Service (port)"]'],
				highlight: ['blob', 'port'],
				note: 'The core. `Blob` is the model behind every attached file. It calls `service.upload`, `service.download`, `service.delete`. `Service` is an abstract class whose methods mostly `raise NotImplementedError`.'
			},
			{
				add: ['disk["DiskService"] -.->|implements| port', 's3["S3Service"] -.->|implements| port', 'gcs["GCSService"] -.->|implements| port'],
				highlight: ['disk', 's3', 'gcs'],
				note: 'Three **adapters**, each a subclass of `Service`. Only `s3_service.rb` requires the AWS SDK. The Active Storage gemspec does not depend on it, so an app that never uses S3 never loads it. That is the **inversion**.'
			},
			{
				add: ['env["config/environments: active_storage.service"] -->|"picks :test or :local"| yml["config/storage.yml"]', 'yml -->|"service: Disk"| conf["Configurator"]', 'conf -->|builds| disk'],
				highlight: ['env', 'yml', 'conf'],
				note: '**Wiring**. A new app\'s `test.rb` says `:test`, its `development.rb` and `production.rb` say `:local`. `storage.yml` maps each name to an adapter. The `Configurator` turns `Disk` into `DiskService`.'
			},
			{
				add: ['mirror["MirrorService"] -.->|implements| port', 'mirror -->|"wraps: primary"| disk', 'mirror -->|"wraps: mirrors"| s3'],
				highlight: ['mirror'],
				note: 'A **decorator**. `MirrorService` is also a `Service`. It uploads to a primary, then copies to the mirrors in a background job. It works with any adapters, and they never hear about it.'
			},
			{
				add: ['blob -.->|"respond_to?(:mirror_later)"| mirror'],
				highlight: ['blob', 'mirror'],
				note: 'Where the port leaks. `Blob#mirror_later` asks the service if it **responds to** `mirror_later`. The core now knows one implementation exists, outside the interface.'
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
			'Read `resolve` as the whole plugin system: `service: Disk` becomes `DiskService`, loaded from `active_storage/service/disk_service.rb` only when asked for. The error message even calls it an **adapter**.',
			'The core only sees the port. [`Blob#upload_without_unfurling`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/app/models/active_storage/blob.rb#L307-L309) is one line: `service.upload key, io, checksum: checksum, **service_metadata`.',
			'The [engine initializer](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/lib/active_storage/engine.rb#L202-L219) reads `storage.yml`, builds a registry of named services, and sets `Blob.service` from `config.active_storage.service`. That is the single wiring point.',
			'One test contract for every adapter: [`SharedServiceTests`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/test/service/shared_service_tests.rb#L6-L20) uploads, downloads and deletes through the port. The [Disk test](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/test/service/disk_service_test.rb#L5-L9) only builds a `DiskService` and includes it.'
		]
	},
	tradeoff: {
		gain: [
			'Disk in development and tests, S3 in production, and the model code is the same. Switching is a config change.',
			'One shared test suite checks every adapter against the same port. Tests of your own app run on disk, with no cloud account.',
			'A decorator works on every backend at once. The Rails guide says a mirror service "is intended to be used temporarily during a **migration** between services in production".'
		],
		cost: [
			'**Same call, different needs.** `url` on S3 signs a link by itself. [`DiskService`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/lib/active_storage/service/disk_service.rb#L175-L179) builds it from the app\'s routes and raises if `ActiveStorage::Current.url_options` is not set.',
			'**The port leaks.** [`Blob#mirror_later`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/app/models/active_storage/blob.rb#L364-L366) checks `respond_to?(:mirror_later)`. A method outside the interface, known by the core.',
			'**The contract only runs where the backend exists.** Without credentials, the [S3 test file](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/test/service/s3_service_test.rb#L7-L9) prints "Skipping S3 Service tests". The fast disk run proves nothing about S3.'
		]
	},
	task: {
		prompt: 'Ops want to store uploads on a new object store with its own API, not S3 compatible. Call it Acme. Using the diagram, list every place you expect to change, and one place you expect **not** to change.',
		hint: 'Follow the arrows: who implements the port, who picks the adapter, who only wraps or calls it?',
		answer: [
			'A new adapter: `ActiveStorage::Service::AcmeService < Service`, in a file `active_storage/service/acme_service.rb` on the load path, so `resolve` can find it.',
			'Wiring: an `acme:` entry in `storage.yml` with `service: Acme`, and `config.active_storage.service = :acme` in production.',
			'Not changed: `Blob`, your models with `has_one_attached`, and `MirrorService`. They only know `Service`.',
			'Implement the whole port, not only `upload` and `download`: `url_for_direct_upload`, `compose`, `delete_prefixed`, and the `private_url` and `public_url` that `url` calls, all raise `NotImplementedError` by default.',
			'Worth doing: include `SharedServiceTests` in the adapter\'s test, and run it against a real Acme bucket in CI. Then a mirror from the old store to Acme makes the move safe.'
		]
	},
	quiz: [
		{
			q: 'In ports and adapters, which way do the dependencies point?',
			options: ['The core imports each adapter, so it can choose the right one', 'Adapters depend on a port owned by the core, and the core knows no adapter', 'The core and the adapters both depend on the database driver', 'There is no dependency: the core and the adapters talk only over the network'],
			answer: 1,
			why: 'The core owns the interface. Adapters implement it, and one wiring point picks which adapter the core gets. The core never names a technology.'
		},
		{
			q: 'A Rails app stores uploads on disk in tests and on S3 in production, with the same model code. Where is that choice made?',
			options: ['In each model, with an `if Rails.env.production?`', 'In `Blob`, which checks which gems are installed', 'In each environment\'s `config.active_storage.service`, which names an entry in `storage.yml`', 'In the S3 SDK, which falls back to disk when no bucket is set'],
			answer: 2,
			why: 'The environment names a service, `storage.yml` maps the name to an adapter, and the configurator builds it. The models never see the choice.'
		},
		{
			q: '`MirrorService` implements `Service` and wraps a primary and some mirrors. What does that design buy?',
			options: ['Faster downloads, since it reads from every mirror at once', 'Atomic uploads across all stores', 'No more need for a `storage.yml` file', 'Copying uploads to a second store with any adapters, without changing them or their callers'],
			answer: 3,
			why: 'A decorator adds one behavior behind the same interface. Downloads still go to the primary, and the guide warns that mirroring is not atomic.'
		}
	],
	takeaway: 'Let the core own the interface and push each technology into a small adapter. Then configuration, not code, decides the backend, and a decorator adds a feature to every backend at once.',
	sources: [
		{ title: 'Alistair Cockburn, Hexagonal architecture', url: 'https://alistair.cockburn.us/hexagonal-architecture/' },
		{ title: 'Rails, active_storage/service.rb, the port', url: `${AS}/lib/active_storage/service.rb#L43-L74` },
		{ title: 'Rails, active_storage/service/configurator.rb, the wiring', url: `${AS}/lib/active_storage/service/configurator.rb#L15-L43` },
		{ title: 'Rails, active_storage/service/mirror_service.rb, a decorator', url: `${AS}/lib/active_storage/service/mirror_service.rb#L14-L49` },
		{ title: 'Rails Guides, Active Storage Overview', url: 'https://guides.rubyonrails.org/active_storage_overview.html' }
	]
};
