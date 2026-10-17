const PYYAML = 'https://github.com/yaml/pyyaml/blob/f5e4504a92f169f65350a1047dccb23bc97028be/lib/yaml';
const PR561 = 'https://github.com/yaml/pyyaml/pull/561';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'deserialization',
	part: 'Input and output',
	title: 'Unsafe deserialization',
	minutes: 10,
	hook: [
		'On 27 June 2018 NVD published CVE-2017-18342 against PyYAML. The entry reads: "In PyYAML before 5.1, the yaml.load() API could execute arbitrary code if used with untrusted data." NVD scores it 9.8 out of 10.',
		'The PyYAML wiki says the function "has been unsafe since the first release in May 2006". In version 3.13 the line is `def load(stream, Loader=Loader):`. That default `Loader` can import any module and call any function named by a tag in the document.',
		'Version 5.1 (13 March 2019) switched the default to a new `FullLoader` and printed a warning. Two more CVEs hit `FullLoader` itself in 2020 (CVE-2020-1747 and CVE-2020-14343). Version 6.0 (13 October 2021) changed the line to `def load(stream, Loader):` in [PR #561](' + PR561 + '), so a call that names no loader raises `TypeError`.',
		'Python’s `pickle` has the same property and no safe mode. The code to check in your own app is any call that rebuilds objects from bytes a user can send.'
	],
	terms: [
		{ term: 'Deserialization', def: 'Turning stored or received bytes (YAML, JSON, a pickle) back into objects in memory. OWASP: "taking data structured in some format, and rebuilding it into an object."' },
		{ term: 'Tag', def: 'A YAML marker such as `!!python/object/apply:` that tells the loader which constructor builds the next value. The loader decides which tags it has a constructor for.' },
		{ term: 'SafeLoader', def: 'The PyYAML loader used by `yaml.safe_load`. It has constructors for 12 standard tags (strings, numbers, lists, maps and a few more) and refuses every other tag.' },
		{ term: 'Pickle', def: 'Python’s own binary serialization format. Loading a pickle can import and call any function named in the data.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['up["POST /jobs with a YAML body"] --> load["yaml.load(body, Loader=yaml.Loader)"]'],
				highlight: ['up', 'load'],
				note: 'A job runner accepts a YAML job description from users and parses it with the full loader. The same thing happens with a bare `yaml.load(body)` on PyYAML older than 5.1, where the full loader is the default.'
			},
			{
				add: ['load --> tag["Tag found: !!python/object/apply:os.system"]', 'tag --> call["UnsafeConstructor imports os and calls system()"]', 'call --> shell["A command runs as the app user"]'],
				highlight: ['tag', 'call', 'shell'],
				note: 'The document carries a tag that names a function, here the placeholder `!!python/object/apply:os.system ["echo hi"]`. The loader imports `os` and calls `os.system` with the list as arguments. NVD describes the result: the API "could execute arbitrary code".'
			},
			{
				add: ['up --> safe["yaml.safe_load(body)"]', 'safe --> undef["SafeConstructor: no constructor for this tag"]', 'undef --> err["ConstructorError, nothing imported or called"]'],
				highlight: ['safe', 'undef', 'err'],
				note: 'The fix is one call: `yaml.safe_load(body)`. Its constructor knows 12 standard tags. Any other tag reaches the catch-all, which raises "could not determine a constructor for the tag" before any module is imported.'
			},
			{
				add: ['cookie["Cookie: prefs = base64 pickle"] --> pl["pickle.loads(data)"]', 'pl --> any["Imports and calls any global in the data"]', 'cookie --> js["json.loads(data)"]', 'js --> plain["dict, list, str, int, float, bool, None"]'],
				highlight: ['pl', 'any', 'js', 'plain'],
				note: 'Pickle has no safe loader. The Python docs: "Never unpickle data that could have come from an untrusted source". They point to json: "deserializing untrusted JSON does not in itself create an arbitrary code execution vulnerability."'
			}
		]
	},
	example: {
		title: 'lib/yaml/constructor.py: UnsafeConstructor, the only constructor that knows the python/object tags',
		repo: 'yaml/pyyaml',
		url: `${PYYAML}/constructor.py#L716-L746`,
		lang: 'python',
		code: `class UnsafeConstructor(FullConstructor):

    def find_python_module(self, name, mark):
        return super(UnsafeConstructor, self).find_python_module(name, mark, unsafe=True)

    def find_python_name(self, name, mark):
        return super(UnsafeConstructor, self).find_python_name(name, mark, unsafe=True)

    def make_python_instance(self, suffix, node, args=None, kwds=None, newobj=False):
        return super(UnsafeConstructor, self).make_python_instance(
            suffix, node, args, kwds, newobj, unsafe=True)

    def set_python_instance_state(self, instance, state):
        return super(UnsafeConstructor, self).set_python_instance_state(
            instance, state, unsafe=True)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/module:',
    UnsafeConstructor.construct_python_module)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/object:',
    UnsafeConstructor.construct_python_object)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/object/new:',
    UnsafeConstructor.construct_python_object_new)

UnsafeConstructor.add_multi_constructor(
    'tag:yaml.org,2002:python/object/apply:',
    UnsafeConstructor.construct_python_object_apply)`,
		notes: [
			'Lines 3 to 7 pass `unsafe=True` to the name lookups. With that flag the parent class calls `__import__` on the module named in the tag. Without it, the lookup fails with "module %r is not imported".',
			'Lines 9 to 11 pass `unsafe=True` when building the value. The parent then skips its "expected a class" check, so the tag can name a plain function such as `os.system` and the loader calls it.',
			'Lines 17 to 31 register the four tags that build arbitrary objects, and only on this class. The 5.4 changelog calls this the "Fix for CVE-2020-14343, moves arbitrary python tags to UnsafeLoader".',
			'`SafeConstructor` registers 12 standard tags, then [`add_constructor(None, construct_undefined)`](' + PYYAML + '/constructor.py#L429-L483) for every other tag. That method raises `ConstructorError`, so `safe_load` stops on the first `!!python/` tag.'
		]
	},
	tradeoff: {
		gain: [
			'`yaml.safe_load` returns only plain values: strings, numbers, booleans, null, timestamps, lists, maps and sets. A config file like `port: 8080` loads the same as before.',
			'On PyYAML 6.0 and later, a bare `yaml.load(data)` fails with `TypeError` at the first call, so a reviewer sees which loader each call uses.'
		],
		cost: [
			'Your own classes no longer load from YAML. The PyYAML docs say to derive the class from `yaml.YAMLObject` and set `yaml_loader` to `yaml.SafeLoader`, which marks it as safe.',
			'`FullLoader` looked like a middle ground in 5.1, and NVD then filed CVE-2020-1747 and CVE-2020-14343 against it. Both CVEs worked "by abusing the python/object/new constructor", a tag that `FullLoader` still accepted then.',
			'The Python docs: JSON "can only represent a subset of the Python built-in types, and no custom classes". After `json.loads` you build your own objects from the dict.'
		]
	},
	task: {
		prompt: 'A Flask app has three lines that read data: (1) `spec = yaml.load(request.data, Loader=yaml.Loader)` in `POST /jobs`, (2) `prefs = pickle.loads(base64.b64decode(request.cookies["prefs"]))`, (3) `settings = yaml.safe_load(open("/etc/app/settings.yml"))` at startup. Which lines rebuild objects from data a user controls, and what replaces each one?',
		hint: 'For each line, ask who can write the bytes it reads. Then check which loader each call uses.',
		answer: [
			'Line 1 is unsafe. Any client can send the request body, and `yaml.Loader` is the old name for `UnsafeLoader`, which knows the `!!python/object/apply:` tag. Replace it with `spec = yaml.safe_load(request.data)`.',
			'Line 2 is unsafe. The browser stores the cookie, so the user can replace it with any bytes, and `pickle.loads` imports whatever globals those bytes name. Store JSON instead: `prefs = json.loads(request.cookies["prefs"])`.',
			'If the cookie must not be edited at all, sign it. The pickle docs suggest "signing data with hmac" and checking the signature before loading.',
			'Line 3 can stay. Users cannot write `/etc/app/settings.yml`, and `safe_load` would refuse a `!!python/` tag in it anyway.'
		]
	},
	quiz: [
		{
			q: 'A service parses YAML files that users upload. Which call parses them without building arbitrary Python objects?',
			options: [
				'`yaml.safe_load(data)`',
				'`yaml.load(data, Loader=yaml.FullLoader)`',
				'`yaml.load(data, Loader=yaml.Loader)`',
				'`yaml.unsafe_load(data)` after checking the `.yml` extension'
			],
			answer: 0,
			why: '`safe_load` uses `SafeConstructor`, which raises `ConstructorError` on any tag outside its 12 standard ones. `yaml.Loader` uses the same constructor as `UnsafeLoader`, and `FullLoader` had two code execution CVEs in 2020. The file extension says nothing about the tags inside.'
		},
		{
			q: 'On PyYAML 6.0, what happens when code calls `yaml.load(data)` with no `Loader` argument?',
			options: [
				'It parses with `FullLoader` and prints a `YAMLLoadWarning`',
				'It raises `TypeError` because `Loader` is a required argument',
				'It parses with `SafeLoader`, which became the default in 6.0',
				'It parses with `UnsafeLoader`, as version 3.13 did'
			],
			answer: 1,
			why: 'PR #561 changed the signature from `def load(stream, Loader=None):` to `def load(stream, Loader):` and removed the warning. Python then raises "missing 1 required positional argument: \'Loader\'". The `FullLoader` default with a warning was the 5.1 to 5.4 behaviour.'
		},
		{
			q: 'A web app keeps user preferences in a cookie as base64 encoded pickle. What change do the Python docs point to?',
			options: [
				'Wrap `pickle.loads` in `try` and `except` so a bad cookie only logs an error',
				'Base64 encode the pickle twice so that a user cannot read or edit it',
				'Reject cookies longer than 4096 bytes before calling `pickle.loads`',
				'Store the preferences as JSON in the cookie and parse them with `json.loads`'
			],
			answer: 3,
			why: 'The code runs inside `pickle.loads` while it loads, so a `try` block catches nothing in time, and a short pickle can still name `os.system`. Base64 is an encoding with no key. The docs say JSON "does not in itself create an arbitrary code execution vulnerability."'
		}
	],
	recall: {
		q: 'Which PyYAML call do you use on YAML from a user, and since which version does `yaml.load` refuse to run without a `Loader`?',
		a: '`yaml.safe_load(data)`, which uses `SafeLoader` and refuses any tag outside its 12 standard ones. Since PyYAML 6.0 (13 October 2021), `yaml.load(data)` with no `Loader` raises `TypeError`.'
	},
	sources: [
		{ title: 'NVD, CVE-2017-18342', url: 'https://nvd.nist.gov/vuln/detail/CVE-2017-18342' },
		{ title: 'NVD, CVE-2020-14343 (incomplete fix for CVE-2020-1747)', url: 'https://nvd.nist.gov/vuln/detail/CVE-2020-14343' },
		{ title: 'PyYAML wiki, PyYAML yaml.load(input) Deprecation', url: 'https://github.com/yaml/pyyaml/wiki/PyYAML-yaml.load(input)-Deprecation' },
		{ title: 'yaml/pyyaml PR #561, yaml.load(s, Loader=...) requires Loader= argument always', url: PR561 },
		{ title: 'PyYAML Documentation', url: 'https://pyyaml.org/wiki/PyYAMLDocumentation' },
		{ title: 'Python docs, pickle (security warning and Restricting Globals)', url: 'https://docs.python.org/3/library/pickle.html' },
		{ title: 'OWASP Deserialization Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Deserialization_Cheat_Sheet.html' }
	]
};
