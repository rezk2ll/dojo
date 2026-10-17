/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'jq-transform',
	part: 'Text and data',
	title: 'jq transforms',
	minutes: 10,
	hook: [
		'Your deploy tool exports its history as JSON, and the team wants a short report: which deploys were slowest, how many ran per environment, which versions of `api` went out. jq answers each of these questions with one filter on the file.',
		'The reps use two files. `deploys.json` is an array of 4 deploys: `{"service":"api","env":"prod","version":"1.4.2","minutes":6}`, `{"service":"web","env":"staging","version":"2.0.0","minutes":3}`, `{"service":"api","env":"staging","version":"1.5.0","minutes":4}`, `{"service":"worker","env":"prod","version":"0.9.1","minutes":11}`. `labels.json` is one object: `{"app":"api","team":"payments","tier":"backend"}`.'
	],
	terms: [
		{ term: 'Object construction', def: '`{...}` in a filter. It builds a new object, like `{name: .service}`, from fields of the input.' },
		{ term: 'Entry', def: 'One key and its value, written by `to_entries` as `{"key": ..., "value": ...}`.' },
		{ term: 'Update-assignment', def: '`|=` in a filter. It runs the old value of a field through a filter and stores the result in the same place.' }
	],
	reps: [
		{
			prompt: 'For each deploy, print an object with only `service` and `version`, one compact object per line.',
			accept: [
				"jq -c '.[] | {service, version}' deploys.json",
				"jq -c '.[]|{service,version}' deploys.json",
				"jq -c '.[] | {service: .service, version: .version}' deploys.json",
				"jq --compact-output '.[] | {service, version}' deploys.json",
				"jq -c '.[] | { service, version }' deploys.json"
			],
			why: '`{service, version}` is the jq shortcut for `{service: .service, version: .version}`. `-c` prints each object on one line: `{"service":"api","version":"1.4.2"}`.'
		},
		{
			prompt: 'Same, but call the first key `name`: print `{"name":"api","env":"prod"}` and so on, one compact object per line.',
			accept: [
				"jq -c '.[] | {name: .service, env}' deploys.json",
				"jq -c '.[] | {name: .service, env: .env}' deploys.json",
				"jq -c '.[]|{name:.service,env}' deploys.json",
				"jq -c '.[] | { name: .service, env }' deploys.json",
				"jq --compact-output '.[] | {name: .service, env}' deploys.json"
			],
			why: 'In `{name: .service}`, the part before the colon is the new key and the part after is a filter run on the input. `env` alone keeps the key `env` with the value of `.env`.'
		},
		{
			prompt: 'Print the service names sorted by deploy time, fastest first, one per line without quotes.',
			accept: [
				"jq -r 'sort_by(.minutes) | .[].service' deploys.json",
				"jq -r 'sort_by(.minutes)|.[].service' deploys.json",
				"jq -r 'sort_by(.minutes)[].service' deploys.json",
				"jq -r 'sort_by(.minutes) | .[] | .service' deploys.json",
				"jq -r 'sort_by(.minutes) | map(.service) | .[]' deploys.json"
			],
			why: '`sort_by(.minutes)` sorts the array by the `minutes` field, from 3 to 11. `.[].service` then prints `web`, `api`, `api` and `worker`.'
		},
		{
			prompt: 'Print the service names sorted by deploy time, slowest first, one per line without quotes.',
			accept: [
				"jq -r 'sort_by(.minutes) | reverse | .[].service' deploys.json",
				"jq -r 'sort_by(.minutes)|reverse|.[].service' deploys.json",
				"jq -r 'sort_by(-.minutes) | .[].service' deploys.json",
				"jq -r 'sort_by(.minutes) | reverse | .[] | .service' deploys.json",
				"jq -r 'sort_by(.minutes) | reverse[].service' deploys.json"
			],
			why: '`sort_by` always sorts from smallest to largest. `reverse` flips the sorted array, so `worker` (11 minutes) comes first.'
		},
		{
			prompt: 'Group the deploys by environment and print the groups as one compact line.',
			accept: ["jq -c 'group_by(.env)' deploys.json", "jq --compact-output 'group_by(.env)' deploys.json", 'jq -c "group_by(.env)" deploys.json'],
			why: '`group_by(.env)` returns an array of arrays: one array of deploys per value of `env`. The manual says the groups come out "sorted by the value of the .foo field", so `prod` comes before `staging`.'
		},
		{
			prompt: 'Print the number of deploys per environment as `[{"env":"prod","count":2},{"env":"staging","count":2}]`, on one line.',
			accept: [
				"jq -c 'group_by(.env) | map({env: .[0].env, count: length})' deploys.json",
				"jq -c 'group_by(.env)|map({env:.[0].env,count:length})' deploys.json",
				"jq -c 'group_by(.env) | map({ env: .[0].env, count: length })' deploys.json",
				"jq -c '[group_by(.env)[] | {env: .[0].env, count: length}]' deploys.json",
				"jq -c 'group_by(.env) | map({env: first.env, count: length})' deploys.json"
			],
			why: 'Inside `map`, the input is one group. `.[0].env` reads the environment from its first deploy, and `length` counts the deploys in the group.'
		},
		{
			prompt: 'Print each label of `labels.json` as `key=value`, one per line, like `team=payments`.',
			accept: [
				"jq -r 'to_entries[] | \"\\(.key)=\\(.value)\"' labels.json",
				"jq -r 'to_entries | .[] | \"\\(.key)=\\(.value)\"' labels.json",
				"jq -r 'to_entries[] | .key + \"=\" + .value' labels.json",
				"jq -r 'to_entries | .[] | .key + \"=\" + .value' labels.json",
				"jq -r 'to_entries[]|\"\\(.key)=\\(.value)\"' labels.json",
				"jq -r 'to_entries | map(\"\\(.key)=\\(.value)\") | .[]' labels.json"
			],
			why: '`to_entries` turns the object into an array of `{"key": "app", "value": "api"}` entries. `"\\(.key)=\\(.value)"` is string interpolation: jq puts the value of each filter where its `\\(...)` stands.'
		},
		{
			prompt: 'Print the versions of the service whose name the shell passes in a jq variable `$svc`, set to `api`, one per line without quotes.',
			accept: [
				"jq -r --arg svc api '.[] | select(.service == $svc) | .version' deploys.json",
				"jq -r --arg svc \"api\" '.[] | select(.service == $svc) | .version' deploys.json",
				"jq -r --arg svc 'api' '.[] | select(.service == $svc) | .version' deploys.json",
				"jq --arg svc api -r '.[] | select(.service == $svc) | .version' deploys.json",
				"jq -r --arg svc api '.[] | select(.service == $svc).version' deploys.json",
				"jq -r --arg svc api '.[]|select(.service==$svc)|.version' deploys.json"
			],
			why: '`--arg svc api` defines `$svc` with the string `"api"`, so the filter itself stays in single quotes. jq prints `1.4.2` and `1.5.0`. The value is always a string: `--arg n 6` never equals the number in `.minutes`, which needs `--argjson`.'
		},
		{
			prompt: 'Add 1 to the `minutes` of every deploy with `|=` and print the updated array.',
			accept: [
				"jq '.[].minutes |= . + 1' deploys.json",
				"jq '.[].minutes |= .+1' deploys.json",
				"jq 'map(.minutes |= . + 1)' deploys.json",
				"jq 'map(.minutes |= .+1)' deploys.json",
				"jq -c '.[].minutes |= . + 1' deploys.json",
				"jq -c 'map(.minutes |= . + 1)' deploys.json"
			],
			why: 'On the right of `|=`, `.` is the old value of each `minutes` field, and `. + 1` is the new one. jq prints the whole array with `7`, `4`, `5` and `12`; the other fields stay as they were.'
		}
	],
	quiz: [],
	recall: {
		q: 'Why does `jq --arg n 6 \'.[] | select(.minutes == $n)\' deploys.json` print nothing?',
		a: '`--arg` always binds a string, so `$n` is `"6"` and never equals the number `6`. `--argjson n 6` binds the number and finds the `api` prod deploy.'
	},
	sources: [{ title: 'jq 1.7 manual', url: 'https://jqlang.org/manual/v1.7/' }]
};
