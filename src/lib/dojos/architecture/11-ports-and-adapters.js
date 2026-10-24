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
		'That code never talks to a disk or to S3 directly. It talks to an interface it owns, and each technology gets a small piece of code that implements that interface. Alistair Cockburn named this **ports and adapters** (also called hexagonal architecture).',
		'His stated intent: let an application "be developed and tested **in isolation from its eventual run-time devices and databases**." Rails does this for file uploads, in Active Storage.'
	],
	terms: [
		{ term: 'Port', def: 'An interface owned by the core, written in the core\'s words: `upload`, `download`, `delete`. It says nothing about which technology sits behind it.' },
		{ term: 'Adapter', def: 'The code that implements a port for one technology: local disk, S3, Google Cloud Storage. The adapter depends on the port, and the core does not know which adapters exist.' },
		{ term: 'Wiring', def: 'The one place that picks an adapter and hands it to the core. To change the backend, you change the choice there.' },
		{ term: 'Decorator', def: 'A class that implements the port and wraps other implementations of the same port, adding one behavior such as copying every upload to a second store.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['blob["ActiveStorage::Blob"] -->|"service.upload key, io"| port["ActiveStorage::Service (port)"]'],
				highlight: ['blob', 'port'],
				note: '`Blob` is the core model behind every attached file. It calls `service.upload`, `service.download`, `service.delete`. `Service` is an abstract class whose methods mostly `raise NotImplementedError`.'
			},
			{
				add: ['disk["DiskService"] -.->|implements| port', 's3["S3Service"] -.->|implements| port', 'gcs["GCSService"] -.->|implements| port'],
				highlight: ['disk', 's3', 'gcs'],
				note: 'Three adapters, each a subclass of `Service`. Only `s3_service.rb` requires the AWS SDK. The Active Storage gemspec does not depend on it, so an app that never uses S3 **never loads the AWS SDK**.'
			},
			{
				add: ['env["config/environments: active_storage.service"] -->|"picks :test or :local"| yml["config/storage.yml"]', 'yml -->|"service: Disk"| conf["Configurator"]', 'conf -->|builds| disk'],
				highlight: ['env', 'yml', 'conf'],
				note: 'The wiring starts in each environment file. A new app\'s `test.rb` says `:test`, its `development.rb` and `production.rb` say `:local`. `storage.yml` maps each name to an adapter. The `Configurator` turns `Disk` into `DiskService`.'
			},
			{
				add: ['mirror["MirrorService"] -.->|implements| port', 'mirror -->|"wraps: primary"| disk', 'mirror -->|"wraps: mirrors"| s3'],
				highlight: ['mirror'],
				note: '`MirrorService` is a decorator: it is also a `Service`. It uploads to a primary, then copies to the mirrors in a background job. It works with any adapters, and they never hear about it.'
			},
			{
				add: ['blob -.->|"respond_to?(:mirror_later)"| mirror'],
				highlight: ['blob', 'mirror'],
				note: '`Blob#mirror_later` asks the service if it **responds to** `mirror_later`, a method that is not in the port. The core now knows that one implementation exists.'
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
			'Lines 8 to 16, `resolve`, find the adapter class for a name in `storage.yml`. `service: Disk` names the class `DiskService`, and line 11 loads `active_storage/service/disk_service.rb` only when asked for. The error on line 15 calls it an **adapter**.',
			'The core calls only the port. [`Blob#upload_without_unfurling`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/app/models/active_storage/blob.rb#L307-L309) is one line: `service.upload key, io, checksum: checksum, **service_metadata`.',
			'The [engine initializer](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/lib/active_storage/engine.rb#L202-L219) reads `storage.yml`, builds a registry of named services, and sets `Blob.service` from `config.active_storage.service`. No other code picks the service.',
			'One test contract covers every adapter: [`SharedServiceTests`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/test/service/shared_service_tests.rb#L6-L20) uploads, downloads and deletes through the port. The Disk test (in the sources) only builds a `DiskService` and includes it.'
		]
	},
	tradeoff: {
		gain: [
			'Disk in development and tests, S3 in production, and the model code is the same. To switch, you change `config.active_storage.service`.',
			'One shared test suite checks every adapter against the same port. Tests of your own app run on disk, with no cloud account.',
			'A decorator works on every backend at once. The Rails guide says a mirror service "is intended to be used temporarily during a **migration** between services in production".'
		],
		cost: [
			'The same call needs different setup per adapter. `url` on S3 signs a link by itself. [`DiskService`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/lib/active_storage/service/disk_service.rb#L175-L179) builds it from the app\'s routes and raises if `ActiveStorage::Current.url_options` is not set.',
			'[`Blob#mirror_later`](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/app/models/active_storage/blob.rb#L364-L366) checks `respond_to?(:mirror_later)`. The core knows a method that is outside the interface.',
			'The shared tests run only where the backend exists. Without credentials, the [S3 test file](https://github.com/rails/rails/blob/8b25b80042db6c5498976ed0f5fd01b6764c0146/activestorage/test/service/s3_service_test.rb#L7-L9) prints "Skipping S3 Service tests", and a green disk run says nothing about S3.'
		]
	},
	task: {
		prompt: 'Ops want to store uploads on a new object store with its own API, not S3 compatible. Call it Acme. Using the diagram, list every place you expect to change, and one place you expect **not** to change.',
		hint: 'Follow the arrows: who implements the port, who picks the adapter, who only wraps or calls it?',
		answer: [
			'A new adapter: `ActiveStorage::Service::AcmeService < Service`, in a file `active_storage/service/acme_service.rb` on the load path, so `resolve` can find it.',
			'Wiring: an `acme:` entry in `storage.yml` with `service: Acme`, and `config.active_storage.service = :acme` in production.',
			'Not changed: `Blob`, your models with `has_one_attached`, and `MirrorService`. They only know `Service`.',
			'Implement the whole port, beyond `upload` and `download`: `url_for_direct_upload`, `compose`, `delete_prefixed`, and the `private_url` and `public_url` that `url` calls, all raise `NotImplementedError` by default.',
			'Worth doing: include `SharedServiceTests` in the adapter\'s test, and run it against a real Acme bucket in CI. Then a mirror from the old store to Acme copies each new upload to both stores during the move.'
		],
		steps: [
			{
				title: 'Read the diagram',
				questions: [
					{ q: 'Where does Acme show up on the diagram?', options: ['As an arrow from `Blob` straight to Acme', 'As a new box next to `DiskService`, `S3Service` and `GCSService`, implementing the port', 'Inside `MirrorService`, as a new mirror type', 'As a new branch inside the `Configurator`'], answer: 1, why: 'Acme is one more adapter. It joins the other three on the right of the port, and `Blob` keeps calling the port.' },
					{ q: 'Acme has its own API, not S3 compatible. Can you reuse `S3Service`?', options: ['Yes, point it at the Acme endpoint', 'Yes, if you wrap it in `MirrorService`', 'No, Acme needs its own adapter, a subclass of `Service`', 'No, you must first teach `Blob` about Acme'], answer: 2, why: 'An adapter implements the port for one technology. A new API means a new adapter.' },
					{ q: '`Blob#mirror_later` checks `respond_to?(:mirror_later)`. What does that say about the core?', options: ['Nothing: it still calls only the port', 'It knows about one implementation, through a method outside the port', 'It picks the adapter itself', 'It loads every adapter at boot'], answer: 1, why: '`mirror_later` is not part of `Service`. The core now knows that `MirrorService` exists, a small leak in the port.' },
					{ q: 'What does `Blob` call when it saves a file?', options: ['`service.upload key, io`', 'The S3 SDK, directly', '`DiskService#upload`, then the cloud', '`Configurator#build`'], answer: 0, why: 'The core calls only the port. `upload_without_unfurling` is that one line.' }
				]
			},
			{
				title: 'Write the adapter',
				questions: [
					{ q: 'Where does the new class go, so that `resolve` finds it?', options: ['In `app/models`, next to `Blob`', 'In `active_storage/service/acme_service.rb`, on the load path', 'Inside `storage.yml`, as Ruby code', 'In `configurator.rb`, as a new branch'], answer: 1, why: '`resolve` requires `active_storage/service/acme_service` when it is asked for `Acme`.' },
					{ q: '`storage.yml` says `service: Acme`. Which class does `resolve` look for?', options: ['`Acme`', '`AcmeAdapter`', '`AcmeService`', '`ActiveStorage::Acme`'], answer: 2, why: 'It camelizes the name and adds `Service`, then looks it up under `ActiveStorage::Service`.' },
					{ q: 'You implement only `upload` and `download`. What does a call to `compose` do?', options: ['It falls back to the disk adapter', 'It raises `NotImplementedError`, the default in `Service`', 'It does nothing and returns', 'It is handled by `MirrorService`'], answer: 1, why: 'The port\'s methods mostly `raise NotImplementedError`. Each adapter must fill them in.' },
					{ q: 'Which methods also belong to the port?', options: ['`url_for_direct_upload`, `compose`, `delete_prefixed`, `private_url` and `public_url`', 'None: only `upload`, `download` and `delete`', '`has_one_attached` and `mirror_later`', '`build` and `resolve`'], answer: 0, why: 'They all raise `NotImplementedError` by default, and `url` calls `private_url` or `public_url`.' }
				]
			},
			{
				title: 'Wire it',
				questions: [
					{ q: 'What do you add to `storage.yml`?', options: ['A `require` line for the Acme SDK', 'A list of models that should use Acme', 'A new `Blob` subclass for Acme', 'An `acme:` entry with `service: Acme`'], answer: 3, why: '`storage.yml` maps each name to an adapter. That entry is the only new line there.' },
					{ q: 'How does production start using Acme?', options: ['Set `config.active_storage.service = :acme` in production', 'Add `if Rails.env.production?` in each model', 'Rename `S3Service` to `AcmeService`', 'Delete the `local:` entry from `storage.yml`'], answer: 0, why: 'The environment file names the service. To switch, you change that choice.' },
					{ q: 'After the switch, why do your tests still run on disk?', options: ['Because Acme has no test mode', 'Because `Blob` detects CI and picks the disk', 'Because `test.rb` still says `:test`, which maps to `Disk`', 'Because the AWS SDK is not loaded in tests'], answer: 2, why: 'Each environment picks its own service. Only production changed.' },
					{ q: 'An app never uses S3. Does it load the AWS SDK?', options: ['Yes, the Active Storage gemspec depends on it', 'Yes, the `Configurator` loads every adapter at boot', 'No, only `s3_service.rb` requires it, and only when asked for', 'No, but only because Acme replaces it'], answer: 2, why: '`resolve` loads an adapter file only when a service names it, and the gemspec does not depend on the AWS SDK.' }
				]
			},
			{
				title: 'Name what stays',
				questions: [
					{ q: 'Which code do you expect **not** to change?', options: ['`storage.yml`', '`Blob` and your models with `has_one_attached`', 'The production environment file', 'The adapter\'s test file'], answer: 1, why: 'They only know `Service`. The new backend lives behind the port.' },
					{ q: 'The move to Acme is done, and every file is in Acme. What do you do with the mirror?', options: ['Keep it for good, as a backup', 'Make the old store its primary again', 'Add S3 as a third mirror', 'Remove it: the Rails guide calls a mirror temporary, for a migration'], answer: 3, why: 'A mirror doubles every upload. Once the move is over, production can name `:acme` alone.' },
					{ q: 'How do you check that `AcmeService` keeps the port\'s contract?', options: ['Include `SharedServiceTests` and run it against a real Acme bucket in CI', 'Run the disk tests, since they use the same port', 'Read the Acme API docs carefully', 'Deploy and watch for errors in production'], answer: 0, why: 'One shared test suite checks every adapter against the same port. It needs the real backend to mean anything.' },
					{ q: 'Without credentials, the Acme test skips, like the S3 one. CI is green on disk. What does it tell you about Acme?', options: ['That Acme works, since the port is shared', 'Nothing: the shared tests never ran against Acme', 'That Acme passed the mirror tests', 'That Acme has no `NotImplementedError` left'], answer: 1, why: 'The shared tests run only where the backend exists. A green disk run says nothing about another store.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'In ports and adapters, which way do the dependencies point?',
			options: ['The core imports each adapter, so it can choose the right one', 'Adapters depend on a port owned by the core, and the core knows no adapter', 'The core and the adapters both depend on the database driver', 'There is no dependency: the core and the adapters talk only over the network'],
			answer: 1,
			why: 'The core owns the interface. Adapters implement it, and one wiring point picks which adapter the core gets. The core code never names S3, GCS or the disk.'
		},
		{
			q: 'A Rails app stores uploads on disk in tests and on S3 in production, with the same model code. Where is that choice made?',
			options: ['In each model, with an `if Rails.env.production?` around every `has_one_attached`', 'In `Blob`, which checks which storage gems are installed and picks the first one', 'In each environment\'s `config.active_storage.service`, which names an entry in `storage.yml`', 'In the S3 SDK, which falls back to the local disk when no bucket is set in the env'],
			answer: 2,
			why: 'The environment names a service, `storage.yml` maps the name to an adapter, and the configurator builds it. The models only call `service`.'
		},
		{
			q: '`MirrorService` implements `Service` and wraps a primary and some mirrors. What does that design buy?',
			options: ['Faster downloads, since it reads each file from every mirror at once and keeps the first', 'Atomic uploads, so a file lands in every store or in none of them', 'No more need for a `storage.yml` file, since the mirrors are set in code', 'Copying uploads to a second store with any adapters, without changing them or their callers'],
			answer: 3,
			why: 'A decorator adds one behavior behind the same interface. Downloads still go to the primary, and the guide warns that mirroring is not atomic.'
		}
	],
	recall: {
		q: 'In Active Storage, what is the port, and which line of config picks the adapter behind it?',
		a: 'The port is the abstract class `ActiveStorage::Service`. Each environment sets `config.active_storage.service`, which names an entry in `storage.yml`, such as `service: Disk`.'
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
