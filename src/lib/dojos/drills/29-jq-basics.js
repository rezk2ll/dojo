/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'jq-basics',
	part: 'Text and data',
	title: 'jq basics',
	minutes: 10,
	hook: [
		'The status endpoint of your cluster returns one long line of JSON. You want to know which service is down, and scrolling through the raw text does not tell you. `jq` reads JSON, runs a filter on it and prints the result as JSON again, or as plain text with `-r`.',
		'The reps use `services.json`: `{"region":"eu-west-1","services":[{"name":"api","status":"up","replicas":3},{"name":"worker","status":"down","replicas":0},{"name":"web","status":"up","replicas":2}]}`. Pass the file name to jq as the last argument.'
	],
	terms: [
		{ term: 'Filter', def: 'The jq program you pass in quotes, like `.services[0]`. It takes JSON in and gives JSON out.' },
		{ term: 'Iterator', def: '`.[]`, which outputs each element of an array as a separate result. `.services[]` gives 3 objects, one after the other.' },
		{ term: 'Pipe', def: '`|` inside a filter. It feeds each result of the left side into the right side, like `.services[] | .name`.' }
	],
	reps: [
		{
			prompt: 'Print the region.',
			accept: ["jq '.region' services.json", 'jq .region services.json', 'jq ".region" services.json'],
			why: '`.region` reads the `region` field of the top object. jq prints it as a JSON string, with its quotes: `"eu-west-1"`.'
		},
		{
			prompt: 'Print the region without the quotes, for use in a shell script.',
			accept: [
				"jq -r '.region' services.json",
				'jq -r .region services.json',
				'jq -r ".region" services.json',
				"jq --raw-output '.region' services.json",
				'jq --raw-output .region services.json',
				"jq '.region' -r services.json"
			],
			why: '`-r` writes a string result as plain text instead of a quoted JSON string. `REGION=$(jq -r .region services.json)` then holds `eu-west-1` and not `"eu-west-1"`.'
		},
		{
			prompt: 'Print the name of every service, one per line, without quotes.',
			accept: [
				"jq -r '.services[].name' services.json",
				"jq -r '.services[] | .name' services.json",
				"jq -r '.services[]|.name' services.json",
				"jq -r '.services | .[] | .name' services.json",
				"jq --raw-output '.services[].name' services.json"
			],
			why: '`.services[]` outputs the 3 service objects one by one, and `.name` runs on each of them. The output is `api`, `worker` and `web` on 3 lines.'
		},
		{
			prompt: 'Print the number of services.',
			accept: ["jq '.services | length' services.json", "jq '.services|length' services.json", 'jq ".services | length" services.json'],
			why: '`length` of an array is its number of elements, here `3`. Writing `.services[] | length` instead gives the length of each object, its number of fields: `3` three times.'
		},
		{
			prompt: 'Print the keys of the top object.',
			accept: ["jq 'keys' services.json", 'jq keys services.json', "jq '. | keys' services.json", 'jq "keys" services.json'],
			why: '`keys` returns the keys of an object as an array: `["region","services"]`. The jq manual: the keys are sorted "by unicode codepoint order", not in the order of the file.'
		},
		{
			prompt: 'Print the keys of the first service.',
			accept: ["jq '.services[0] | keys' services.json", "jq '.services[0]|keys' services.json", 'jq ".services[0] | keys" services.json'],
			why: '`.services[0]` picks the `api` object. `keys` returns `["name","replicas","status"]`, sorted, so `replicas` comes before `status` although the file has it last.'
		},
		{
			prompt: 'Print the name of the service whose status is `down`, without quotes.',
			accept: [
				"jq -r '.services[] | select(.status == \"down\") | .name' services.json",
				"jq -r '.services[] | select(.status==\"down\") | .name' services.json",
				"jq -r '.services[]|select(.status==\"down\")|.name' services.json",
				"jq -r '.services[] | select(.status == \"down\").name' services.json",
				"jq --raw-output '.services[] | select(.status == \"down\") | .name' services.json"
			],
			why: '`select(.status == "down")` passes an object through when the test is true and drops it otherwise. Only the `worker` object gets to `.name`, so jq prints `worker`.'
		},
		{
			prompt: 'Print an array of the replica counts, `[3,0,2]`. Use `map`.',
			accept: ["jq '.services | map(.replicas)' services.json", "jq '.services|map(.replicas)' services.json", 'jq ".services | map(.replicas)" services.json'],
			why: '`map(.replicas)` runs `.replicas` on each element and collects the results in a new array. The manual defines it as `[.[] | f]`, so `[.services[].replicas]` gives the same array.'
		},
		{
			prompt: 'Print an array of the names of the services that are `up`: `["api","web"]`.',
			accept: [
				"jq '.services | map(select(.status == \"up\") | .name)' services.json",
				"jq '.services | map(select(.status == \"up\").name)' services.json",
				"jq '.services|map(select(.status==\"up\")|.name)' services.json",
				"jq '[.services[] | select(.status == \"up\") | .name]' services.json",
				"jq '[.services[]|select(.status==\"up\")|.name]' services.json",
				"jq '.services | map(select(.status == \"up\")) | map(.name)' services.json"
			],
			why: 'Inside `map`, `select` drops the `worker` object and `.name` turns each kept object into its name. `map` collects `"api"` and `"web"` into one array.'
		},
		{
			prompt: 'Print how many services are `up`.',
			accept: [
				"jq '.services | map(select(.status == \"up\")) | length' services.json",
				"jq '.services|map(select(.status==\"up\"))|length' services.json",
				"jq '[.services[] | select(.status == \"up\")] | length' services.json",
				"jq '[.services[]|select(.status==\"up\")]|length' services.json"
			],
			why: '`map(select(...))` keeps the 2 `up` objects in an array, and `length` counts them: `2`. Without the array, `.services[] | select(...) | length` would print the field count of each object instead.'
		}
	],
	quiz: [],
	recall: {
		q: 'What does `-r` change in `jq -r .region services.json`?',
		a: 'It prints the string as plain text, `eu-west-1`, instead of a JSON string with quotes, `"eu-west-1"`.'
	},
	sources: [{ title: 'jq 1.7 manual', url: 'https://jqlang.org/manual/v1.7/' }]
};
