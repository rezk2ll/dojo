const DJ = 'https://github.com/django/django/blob/d430084791a61b31cecec132bce3dca19194f7f2';
const BASE = `${DJ}/django/core/checks/security/base.py`;
const STARTPROJECT = `${DJ}/django/core/management/commands/startproject.py`;
const REDIS_CONF = 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d/redis.conf';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'secure-defaults',
	part: 'Threats',
	title: 'Secure defaults',
	minutes: 10,
	hook: [
		'In November 2015, Redis author Salvatore Sanfilippo attacked a Redis server on his own laptop from another host. The server had no password. With Redis\'s own `CONFIG SET` and `SAVE` commands, he wrote his SSH key into the laptop\'s `.ssh` folder. He then logged in over SSH "in like five seconds".',
		'He wrote that once this attack was published, "several Redis instances were compromised around the globe." He described instances exposed "unintentionally", with no firewall, no password and no bind to 127.0.0.1. Started without a config file, `redis-server` listened on every interface and asked for no password.',
		'Redis 3.2 added **protected mode**: with no password set, the server only accepts connections from the same machine.'
	],
	terms: [
		{ term: 'Secure default', def: 'A setting whose value out of the box is the safe one, so a person who never changes it stays protected. Redis\'s `protected-mode yes` is one.' },
		{ term: 'Protected mode', def: 'A Redis setting, on by default since 3.2. When the default user has no password, Redis only accepts connections from 127.0.0.1, ::1 or a Unix socket.' },
		{ term: 'check --deploy', def: 'The Django command `manage.py check --deploy`. It runs the extra checks registered with `deploy=True`, which test settings such as `DEBUG`, `ALLOWED_HOSTS` and `SECRET_KEY`.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['new["django-admin startproject shop"] --> tpl["settings.py: DEBUG = True, ALLOWED_HOSTS = [], SECRET_KEY = django-insecure-..."]'],
				highlight: ['new', 'tpl'],
				note: 'The project template writes `DEBUG = True` and `ALLOWED_HOSTS = []`. `startproject` generates a 50 character key and prefixes it with `django-insecure-`. The template comment says these settings are "unsuitable for production".'
			},
			{
				add: ['tpl -->|"copied to the server unchanged"| prod["Production: DEBUG still True"]'],
				highlight: ['prod'],
				note: 'The team copies the file to the server. Requests for `shop.example.com` fail, because with an empty list Django only accepts `.localhost`, `127.0.0.1` and `[::1]`. Someone adds `ALLOWED_HOSTS = ["shop.example.com"]`, the site answers, and `DEBUG = True` stays.'
			},
			{
				add: ['prod -->|"request that raises an exception"| page["Error page: traceback, local variables, settings"]'],
				highlight: ['page'],
				note: 'Any request that raises an exception gets the debug page. The docs say it leaks "excerpts of your source code, local variables, settings, libraries used". Django hides settings whose names contain `KEY`, `SECRET`, `PASS`, `TOKEN`, `API` or `SIGNATURE`, and file paths still show.'
			},
			{
				add: ['ci["CI: manage.py check --deploy --fail-level WARNING"] -.->|"W018, W020, W009: build fails"| prod'],
				highlight: ['ci'],
				note: 'The deploy checks report `security.W018` for `DEBUG`, `security.W020` for the empty host list and `security.W009` for the `django-insecure-` key. These are warnings, and the default fail level is `ERROR`. With `--fail-level WARNING`, the command exits non-zero and the pipeline stops.'
			}
		]
	},
	example: {
		title: 'django/core/checks/security/base.py: three deploy checks',
		repo: 'django/django',
		url: `${BASE}#L255-L304`,
		lang: 'python',
		code: `def _check_secret_key(secret_key):
    return (
        len(set(secret_key)) >= SECRET_KEY_MIN_UNIQUE_CHARACTERS
        and len(secret_key) >= SECRET_KEY_MIN_LENGTH
        and not secret_key.startswith(SECRET_KEY_INSECURE_PREFIX)
    )


@register(Tags.security, deploy=True)
def check_secret_key(app_configs, **kwargs):
    try:
        secret_key = settings.SECRET_KEY
    except (ImproperlyConfigured, AttributeError):
        passed_check = False
    else:
        passed_check = _check_secret_key(secret_key)
    return [] if passed_check else [W009]

…
@register(Tags.security, deploy=True)
def check_debug(app_configs, **kwargs):
    passed_check = not settings.DEBUG
    return [] if passed_check else [W018]

…
@register(Tags.security, deploy=True)
def check_allowed_hosts(app_configs, **kwargs):
    return [] if settings.ALLOWED_HOSTS else [W020]`,
		notes: [
			'`_check_secret_key` wants at least 50 characters, at least 5 different ones, and no `django-insecure-` prefix. [`startproject.py`](' + STARTPROJECT + '#L18-L19) adds that prefix to every key it generates, so a new project fails W009 until someone replaces the key.',
			'`check_debug` passes only when `not settings.DEBUG` is true. The W018 message is "You should not have DEBUG set to True in deployment."',
			'`check_allowed_hosts` only tests that the list is not empty. `ALLOWED_HOSTS = [\'*\']` passes W020, and the docs then make you "responsible to provide your own validation of the Host header".',
			'`deploy=True` on `@register` keeps these checks out of a plain `manage.py check`. You get them only with `--deploy`, which the docs suggest running against the production settings module.',
			'Redis has the same idea in its config. [`redis.conf`](' + REDIS_CONF + '#L102-L112) ships `protected-mode yes`, so with no password "the server only accepts local connections", even if someone deletes the `bind 127.0.0.1 -::1` line.'
		]
	},
	tradeoff: {
		gain: [
			'Protected mode covers the person who deletes the `bind` line. Sanfilippo wrote that users who cannot connect "just drop the bind line and restart".',
			'`check --deploy` turns the deployment checklist into one command that a CI job runs on every build.'
		],
		cost: [
			'In 2015 Sanfilippo kept `redis-server` with no arguments on all interfaces. Making developers reconfigure a server to accept other hosts "is kinda a big price to pay", he wrote.',
			'A safe value can break the first deploy: with `DEBUG = False` and an empty `ALLOWED_HOSTS`, Django answers every request with "Bad Request (400)".',
			'`check --deploy` reads Django settings and nothing else, so `ALLOWED_HOSTS = [\'*\']` and a weak database password both pass.'
		]
	},
	task: {
		prompt: 'A production settings file has `SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]` (a 64 character random value), `DEBUG = os.environ.get("DJANGO_DEBUG", "False")` and `ALLOWED_HOSTS = ["*"]`. `DJANGO_DEBUG` is not set on the server. Which of W009, W018 and W020 does `check --deploy` print? Is debug mode on?',
		hint: 'Read `check_debug`: what is `not "False"` in Python? Then read `check_allowed_hosts`: what does it test?',
		answer: [
			'W009: no. The key is 64 random characters with no `django-insecure-` prefix, so `_check_secret_key` passes.',
			'W018: yes, and debug mode is on. `os.environ.get` returns the string `"False"`, a non-empty string is truthy, so `not settings.DEBUG` is false. Fix: `DEBUG = os.environ.get("DJANGO_DEBUG") == "1"`, which is `False` when the variable is missing.',
			'W020: no. `["*"]` is a non-empty list, so the check passes. The wildcard accepts any `Host` header, which the check cannot see. Fix: list the real names, such as `ALLOWED_HOSTS = ["shop.example.com"]`.',
			'Run it as `python manage.py check --deploy --fail-level WARNING` in CI, so W018 stops the deploy.'
		],
		steps: [
			{
				title: 'Check the secret key',
				questions: [
					{ q: 'What does `_check_secret_key` require?', options: ['At least 32 characters and one digit', 'A key read from an environment variable', 'At least 50 characters, 5 different ones, no `django-insecure-` prefix', 'A key that changes on every deploy'], answer: 2, why: 'Those are the three tests in the code: length, unique characters, and the prefix.' },
					{ q: 'The key is 64 random characters from the environment. Does W009 appear?', options: ['No: it passes all three tests', 'Yes: keys from the environment fail', 'Yes: 64 is below the minimum', 'Only when `DEBUG` is on'], answer: 0, why: '64 random characters with no `django-insecure-` prefix pass `_check_secret_key`.' },
					{ q: 'A key fresh from `startproject` fails W009. Why?', options: ['It is only 20 characters long', 'It starts with `django-insecure-`', 'It is written in `settings.py`', 'It has no digits in it'], answer: 1, why: '`startproject` adds that prefix to every key it makes, so a new project fails until someone replaces the key.' },
					{ q: 'Does `check_secret_key` run in a plain `manage.py check`?', options: ['Yes, on every check', 'Only in debug mode', 'Only when a key is set', 'No: it is registered with `deploy=True`'], answer: 3, why: '`deploy=True` keeps it out of a plain `check`. You only get it with `--deploy`.' }
				]
			},
			{
				title: 'Check DEBUG',
				questions: [
					{ q: '`DJANGO_DEBUG` is not set. What does `os.environ.get("DJANGO_DEBUG", "False")` return?', options: ['The boolean `False`', 'The string `"False"`', '`None`', 'An error'], answer: 1, why: 'It returns the default you wrote, and you wrote a string.' },
					{ q: 'What is `not "False"` in Python?', options: ['`True`', 'An error', '`None`', '`False`'], answer: 3, why: 'A non-empty string is truthy, so `not "False"` is `False`.' },
					{ q: 'So what does `check_debug` report, and is debug mode on?', options: ['W018, and debug mode is on', 'Nothing, and debug mode is off', 'W018, but debug mode is off', 'Nothing, but debug mode is on'], answer: 0, why: '`not settings.DEBUG` is false, so W018 fires. Django treats the truthy string as debug on.' },
					{ q: 'Which line is `False` when the variable is missing, and `True` only for `"1"`?', options: ['`DEBUG = os.environ.get("DJANGO_DEBUG", False)`', '`DEBUG = bool(os.environ.get("DJANGO_DEBUG", "False"))`', '`DEBUG = os.environ.get("DJANGO_DEBUG") == "1"`', '`DEBUG = not os.environ.get("DJANGO_DEBUG")`'], answer: 2, why: 'A comparison gives a real boolean: a missing variable, or any value but `"1"`, gives `False`.' }
				]
			},
			{
				title: 'Check ALLOWED_HOSTS',
				questions: [
					{ q: 'What does `check_allowed_hosts` test?', options: ['That every name is a real domain', 'That `*` is not in the list', 'That the list matches the `Host` header', 'Only that the list is not empty'], answer: 3, why: 'The code is `return [] if settings.ALLOWED_HOSTS else [W020]`.' },
					{ q: 'Does `["*"]` trigger W020?', options: ['Yes: the wildcard fails the check', 'No: it is a non-empty list', 'Yes, but only with `DEBUG` on', 'Only behind a proxy'], answer: 1, why: 'A list with one item is not empty, so the check passes.' },
					{ q: 'What does `["*"]` actually accept?', options: ['Only `localhost` and `127.0.0.1`', 'Only the server\'s own hostname', 'Any `Host` header', 'Only names listed in DNS'], answer: 2, why: 'The wildcard matches everything. The docs then make you "responsible to provide your own validation of the Host header".' },
					{ q: 'What do you write instead?', options: ['`ALLOWED_HOSTS = ["shop.example.com"]`', '`ALLOWED_HOSTS = []`', '`ALLOWED_HOSTS = ["*.*"]`', '`ALLOWED_HOSTS = ["0.0.0.0"]`'], answer: 0, why: 'List the real names. An empty list only accepts `.localhost`, `127.0.0.1` and `[::1]`, so the live site would answer 400.' }
				]
			},
			{
				title: 'Make CI fail',
				questions: [
					{ q: 'With default options, does `check --deploy` fail the CI job on W018?', options: ['No: the default fail level is `ERROR`', 'Yes: any message fails the job', 'Yes, but only on the main branch', 'No: deploy checks never fail a job'], answer: 0, why: 'The security deploy checks are warnings, and the docs say the default `--fail-level` is `ERROR`.' },
					{ q: 'Which command fails the job on a warning?', options: ['`python manage.py check`', '`python manage.py check --deploy --strict`', '`python manage.py check --deploy --fail-level WARNING`', '`python manage.py check --fail-level WARNING`'], answer: 2, why: '`--deploy` runs the checks, and `--fail-level WARNING` makes them exit non-zero.' },
					{ q: 'Which settings module should the check run against?', options: ['The local development one', 'Any of them: the result is the same', 'The one used by the test suite', 'The production one'], answer: 3, why: 'The docs suggest running `--deploy` against the production settings module, since that is what ships.' },
					{ q: 'What can `check --deploy` never catch?', options: ['A `DEBUG` left on', 'A weak database password', 'An empty `ALLOWED_HOSTS`', 'A `django-insecure-` key'], answer: 1, why: 'It reads Django settings and nothing else. A weak database password passes, like `["*"]`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You run `manage.py check --deploy` on a project fresh from `startproject`. Which of W009 (secret key), W018 (DEBUG) and W020 (ALLOWED_HOSTS) appear?',
			options: [
				'Only W018, because the generated key is 50 random characters',
				'W018 and W020, because a generated key is always accepted',
				'All three, because the template is unsafe on all three settings',
				'None, because the template is made for development and skips the checks'
			],
			answer: 2,
			why: '`startproject` prefixes the key with `django-insecure-`, which `_check_secret_key` rejects. The template sets `DEBUG = True` and `ALLOWED_HOSTS = []`, which fail `check_debug` and `check_allowed_hosts`.'
		},
		{
			q: '`check --deploy` prints W018 in your CI job, but the job stays green. Why?',
			options: [
				'W018 is only printed for local settings modules',
				'The checks run after the deploy, so the exit status is ignored',
				'The default `--fail-level` is `ERROR`, and W018 is a warning',
				'CI runners set `DEBUG` to False before the command runs'
			],
			answer: 2,
			why: 'The docs: `--fail-level` "Specifies the message level that will cause the command to exit with a non-zero status. Default is ERROR." The security deploy checks are `Warning` objects, so you need `--fail-level WARNING` to fail the job.'
		},
		{
			q: 'A Redis server runs with `protected-mode yes`, no password, and the `bind` line deleted. A client on another host connects. What happens?',
			options: [
				'The client connects and can run any command, as before Redis 3.2',
				'The client connects but can only run read commands like GET',
				'Redis refuses the client, because it only accepts local connections',
				'Redis asks the client for a password and creates one on first use'
			],
			answer: 2,
			why: '`redis.conf` says that when protected mode is on and the default user has no password, "the server only accepts local connections" from 127.0.0.1, ::1 or Unix sockets. Deleting `bind` makes Redis listen on all interfaces, but protected mode still turns away remote clients.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Run Django\'s deploy checks on a fresh project and on the task\'s settings, then make them fail a build.',
		steps: [
			'Start a throwaway Python container and install Django: `docker run --rm -it python:3.12-slim bash`, then `pip install -q "django==5.2.*"`.',
			'Make a fresh project and run the checks: `cd /tmp && django-admin startproject shop && cd shop`, then `python manage.py check --deploy; echo $?`.',
			'Fail the build on warnings: `python manage.py check --deploy --fail-level WARNING; echo $?`.',
			'Append the task\'s settings to `shop/settings.py`: `printf \'%s\\n\' \'import os\' \'SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]\' \'DEBUG = os.environ.get("DJANGO_DEBUG", "False")\' \'ALLOWED_HOSTS = ["*"]\' >> shop/settings.py`. Then run `DJANGO_SECRET_KEY=$(python -c "import secrets; print(secrets.token_urlsafe(48))") python manage.py check --deploy 2>&1 | grep -oE "security\\.W0(09|18|20)"`.',
			'Read what Django really holds: `DJANGO_SECRET_KEY=x python manage.py shell -c "from django.conf import settings; print(repr(settings.DEBUG))"`. Type `exit` to leave; `--rm` deletes the container.'
		],
		done: [
			'On the fresh project the output lists `security.W009`, `security.W018` and `security.W020`, and `echo $?` prints `0`.',
			'With `--fail-level WARNING`, `echo $?` prints `1`.',
			'With the task\'s settings, only `security.W018` is left of the three, and step 5 prints `\'False\'`: a string.'
		],
		solution: [
			'The template ships `DEBUG = True`, `ALLOWED_HOSTS = []` and a `django-insecure-` key, so all three checks fire. They are warnings, and the default fail level is `ERROR`, so the command exits 0.',
			'`"False"` is a non-empty string, so `not settings.DEBUG` is false and W018 fires: debug mode is on. `DEBUG = os.environ.get("DJANGO_DEBUG") == "1"` fixes it.',
			'`["*"]` passes W020 because the check only tests that the list is not empty. The fix is the real host name, which no check asks for.'
		]
	},
	recall: {
		q: 'Which three settings from `startproject` does `check --deploy` flag, and which flag makes the warnings fail a CI job?',
		a: '`DEBUG = True` (W018), the empty `ALLOWED_HOSTS` (W020) and the `django-insecure-` key (W009). `--fail-level WARNING` makes the command exit non-zero.'
	},
	sources: [
		{ title: 'Salvatore Sanfilippo, A few things about Redis security (2015)', url: 'http://antirez.com/news/96' },
		{ title: 'Redis source, redis.conf (bind and protected-mode)', url: 'https://github.com/redis/redis/blob/e0bb9316848db7950c2b18cdc59c2058f62b8a3d/redis.conf' },
		{ title: 'Django docs, Deployment checklist', url: 'https://docs.djangoproject.com/en/stable/howto/deployment/checklist/' },
		{ title: 'Django docs, django-admin check', url: 'https://docs.djangoproject.com/en/stable/ref/django-admin/' },
		{ title: 'Django docs, settings (DEBUG, ALLOWED_HOSTS)', url: 'https://docs.djangoproject.com/en/stable/ref/settings/' }
	]
};
