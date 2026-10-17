/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sed',
	part: 'Text and data',
	title: 'sed',
	minutes: 10,
	hook: [
		'The staging server is gone and every host in `deploy.conf` must now point at production. Opening the file in an editor on a box over SSH works once. On 40 boxes, `sed` does the same edit from one command line: it reads the file line by line, runs a short script on each line and prints the result.',
		'The reps use GNU sed on this 7-line `deploy.conf`. Line 1: `# deploy settings`. Line 2: `host=staging.example.com`. Line 3: `port=8080`. Line 4: `path=/var/www/app`. Line 5: `# health check`. Line 6: `url=http://staging.example.com/staging/health`. Line 7: `debug=true`. Unless the prompt says otherwise, print the result and leave the file as it is.'
	],
	terms: [
		{ term: 'Address', def: 'The part before a sed command that picks the lines it runs on: a line number like `2`, a regex like `/^#/`, or a range like `2,4`.' },
		{ term: 'Pattern space', def: 'The buffer that holds the current line while sed runs the script on it. sed prints it at the end of each line unless you pass `-n`.' },
		{ term: 'Delimiter', def: 'The character that separates the parts of `s/REGEXP/REPLACEMENT/`. It is `/` by default and can be any other single character.' }
	],
	reps: [
		{
			prompt: 'Replace the first `staging` on each line with `prod`.',
			accept: [
				"sed 's/staging/prod/' deploy.conf",
				'sed "s/staging/prod/" deploy.conf',
				'sed s/staging/prod/ deploy.conf',
				"sed -e 's/staging/prod/' deploy.conf",
				'sed -e "s/staging/prod/" deploy.conf'
			],
			why: '`s/staging/prod/` replaces the first match on each line. Line 6 comes out as `url=http://prod.example.com/staging/health`: the second `staging` on that line stays.'
		},
		{
			prompt: 'Replace every `staging` on every line with `prod`.',
			accept: [
				"sed 's/staging/prod/g' deploy.conf",
				'sed "s/staging/prod/g" deploy.conf',
				'sed s/staging/prod/g deploy.conf',
				"sed -e 's/staging/prod/g' deploy.conf",
				'sed -e "s/staging/prod/g" deploy.conf'
			],
			why: 'The `g` flag after the last `/` applies the replacement to all matches on the line. Line 6 comes out as `url=http://prod.example.com/prod/health`.'
		},
		{
			prompt: 'Make the same global replacement inside `deploy.conf` itself, and keep the original as `deploy.conf.bak`.',
			accept: [
				"sed -i.bak 's/staging/prod/g' deploy.conf",
				'sed -i.bak "s/staging/prod/g" deploy.conf',
				"sed --in-place=.bak 's/staging/prod/g' deploy.conf",
				'sed --in-place=.bak "s/staging/prod/g" deploy.conf',
				"sed -i.bak -e 's/staging/prod/g' deploy.conf",
				"sed -e 's/staging/prod/g' -i.bak deploy.conf"
			],
			why: '`-i` writes the result back to the file, and the suffix glued to it, `.bak`, names the backup. With a space, `sed -i .bak` fails: GNU sed reads `.bak` as the script and stops with "unknown command".'
		},
		{
			prompt: 'Print the file without its comment lines (the lines that start with `#`).',
			accept: [
				"sed '/^#/d' deploy.conf",
				'sed "/^#/d" deploy.conf',
				'sed /^#/d deploy.conf',
				"sed -e '/^#/d' deploy.conf",
				'sed -e "/^#/d" deploy.conf'
			],
			why: '`/^#/` is an address: it picks the lines that match the regex. `d` deletes those lines, so lines 1 and 5 are not printed.'
		},
		{
			prompt: 'Print the file without its last line.',
			accept: ["sed '$d' deploy.conf", "sed -e '$d' deploy.conf", 'sed \\$d deploy.conf'],
			why: 'The address `$` matches the last line, so `$d` drops `debug=true`. Keep it in single quotes: in `"$d"` the shell replaces `$d` with the value of a variable `d`, usually empty, and sed then deletes nothing.'
		},
		{
			prompt: 'Print only lines 2 to 4.',
			accept: [
				"sed -n '2,4p' deploy.conf",
				'sed -n "2,4p" deploy.conf',
				'sed -n 2,4p deploy.conf',
				"sed -n -e '2,4p' deploy.conf",
				"sed --quiet '2,4p' deploy.conf",
				"sed --silent '2,4p' deploy.conf",
				"sed '2,4!d' deploy.conf"
			],
			why: '`-n` turns off the automatic print of each line. `2,4p` then prints lines 2 to 4 only: `host`, `port` and `path`. Without `-n`, those 3 lines would come out twice.'
		},
		{
			prompt: 'Print from the line `# health check` to the end of the file.',
			accept: [
				"sed -n '/^# health check/,$p' deploy.conf",
				"sed -n '/# health check/,$p' deploy.conf",
				"sed -n '/health check/,$p' deploy.conf",
				"sed -n '/^# health check$/,$p' deploy.conf",
				"sed -n -e '/^# health check/,$p' deploy.conf"
			],
			why: 'A range can start at a regex: `/^# health check/` is line 5, and `$` is the last line. With `-n` and `p`, sed prints lines 5 to 7.'
		},
		{
			prompt: 'Replace `/var/www/app` with `/srv/app`. Pick a delimiter other than `/` so you do not have to escape the slashes.',
			accept: [
				"sed 's|/var/www/app|/srv/app|' deploy.conf",
				'sed "s|/var/www/app|/srv/app|" deploy.conf',
				"sed 's#/var/www/app#/srv/app#' deploy.conf",
				'sed "s#/var/www/app#/srv/app#" deploy.conf',
				"sed 's,/var/www/app,/srv/app,' deploy.conf",
				"sed 's@/var/www/app@/srv/app@' deploy.conf",
				"sed 's:/var/www/app:/srv/app:' deploy.conf"
			],
			why: 'The GNU sed manual: "The / characters may be uniformly replaced by any other single character within any given s command." With `|`, the slashes in both paths are plain text. With `/`, you would write `s/\\/var\\/www\\/app/\\/srv\\/app/`.'
		},
		{
			prompt: 'Turn each `key=value` line into `key: value`, for example `port: 8080`. Capture the key with a group and use extended regex.',
			accept: [
				"sed -E 's/^([a-z]+)=/\\1: /' deploy.conf",
				"sed -r 's/^([a-z]+)=/\\1: /' deploy.conf",
				"sed --regexp-extended 's/^([a-z]+)=/\\1: /' deploy.conf",
				"sed -E 's/^([^=]+)=/\\1: /' deploy.conf",
				"sed -E 's/^(\\w+)=/\\1: /' deploy.conf",
				"sed -E 's/([a-z]+)=/\\1: /' deploy.conf",
				'sed -E "s/^([a-z]+)=/\\1: /" deploy.conf'
			],
			why: '`-E` turns on extended regex, so `(...)` is a group without backslashes. `\\1` in the replacement puts back the text of group 1, here `port`, followed by `: `. The comment lines have no `=` and stay as they are.'
		},
		{
			prompt: 'Replace every `staging` with `prod`, and print only the lines that changed.',
			accept: [
				"sed -n 's/staging/prod/gp' deploy.conf",
				'sed -n "s/staging/prod/gp" deploy.conf',
				"sed -n 's/staging/prod/pg' deploy.conf",
				"sed --quiet 's/staging/prod/gp' deploy.conf",
				"sed -n -e 's/staging/prod/gp' deploy.conf"
			],
			why: '`-n` stops the automatic print. The `p` flag of `s` prints the line only when a replacement was made, so sed prints the new lines 2 and 6 and nothing else.'
		}
	],
	quiz: [],
	recall: {
		q: 'How do you make sed edit `deploy.conf` in place and keep the original as `deploy.conf.bak`?',
		a: 'Pass `-i.bak`, with the suffix glued to `-i`: `sed -i.bak \'s/staging/prod/g\' deploy.conf`. With a space (`-i .bak`), GNU sed takes `.bak` as the script and fails.'
	},
	sources: [
		{ title: 'GNU sed manual: Command-Line Options', url: 'https://www.gnu.org/software/sed/manual/html_node/Command_002dLine-Options.html' },
		{ title: 'GNU sed manual: The s Command', url: 'https://www.gnu.org/software/sed/manual/html_node/The-_0022s_0022-Command.html' },
		{ title: 'GNU sed manual: Range Addresses', url: 'https://www.gnu.org/software/sed/manual/html_node/Range-Addresses.html' }
	]
};
