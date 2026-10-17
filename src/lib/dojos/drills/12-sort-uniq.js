/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sort-uniq',
	part: 'The shell',
	title: 'Sorting and counting',
	minutes: 10,
	hook: [
		'The API got slow at 14:00 and you suspect one client is hammering it. You have pulled the client IPs out of the access log into a file. Now you want to know which IP sent the most requests, and which endpoints were the slowest.',
		'The reps use 4 files. `ips.txt` holds 10 lines, one IP each, in arrival order: `10.0.0.7`, `10.0.0.3`, `10.0.0.7`, `10.0.0.12`, `10.0.0.3`, `10.0.0.7`, `10.0.0.9`, `10.0.0.7`, `10.0.0.12`, `10.0.0.3`. `sizes.txt` holds 5 numbers, one per line: `512`, `64`, `2048`, `9`, `128`. `requests.txt` has 5 lines of `path status ms` separated by spaces, such as `/api/users 500 1200` and `/health 200 3`. `orders.csv` has 4 lines of `id,customer,total` with no header, such as `102,omar,7.99`.'
	],
	terms: [
		{ term: 'field', def: 'One column of a line. By default `sort` splits fields where blanks start; `-t` sets another separator.' },
		{ term: 'sort key', def: 'The part of each line that `sort` compares, chosen with `-k`. Without `-k`, `sort` compares whole lines.' },
		{ term: 'adjacent lines', def: 'Lines that sit next to each other. `uniq` only merges equal lines when they are adjacent.' }
	],
	reps: [
		{
			prompt: 'Sort the lines of `sizes.txt` with the default text comparison.',
			accept: ['sort sizes.txt', 'sort < sizes.txt', 'sort <sizes.txt', 'cat sizes.txt | sort'],
			why: '`sort` compares whole lines as text. The output is `128`, `2048`, `512`, `64`, `9`, because `1` comes before `2`, `5`, `6` and `9`.'
		},
		{
			prompt: 'Sort `sizes.txt` by numeric value, smallest first.',
			accept: ['sort -n sizes.txt', 'sort --numeric-sort sizes.txt', 'sort -n < sizes.txt', 'sort --sort=numeric sizes.txt'],
			why: '`-n` compares the numbers the lines start with. The output is `9`, `64`, `128`, `512`, `2048`.'
		},
		{
			prompt: 'Sort `sizes.txt` by numeric value, largest first.',
			accept: [
				'sort -rn sizes.txt',
				'sort -nr sizes.txt',
				'sort -n -r sizes.txt',
				'sort -r -n sizes.txt',
				'sort --numeric-sort --reverse sizes.txt',
				'sort --reverse --numeric-sort sizes.txt',
				'sort -n --reverse sizes.txt',
				'sort -r --numeric-sort sizes.txt'
			],
			why: '`-r` reverses the result of each comparison and `-n` makes it numeric. `2048` comes out first.'
		},
		{
			prompt: 'Sort `requests.txt` by its 3rd column, the time in ms, slowest first.',
			accept: [
				'sort -k3 -rn requests.txt',
				'sort -k3 -nr requests.txt',
				'sort -rn -k3 requests.txt',
				'sort -nr -k3 requests.txt',
				'sort -k3,3 -rn requests.txt',
				'sort -k3,3 -nr requests.txt',
				'sort -rn -k3,3 requests.txt',
				'sort -nr -k3,3 requests.txt',
				'sort -k 3 -rn requests.txt',
				'sort -k3rn requests.txt',
				'sort -k3,3rn requests.txt',
				'sort -k3nr requests.txt',
				'sort -k3,3nr requests.txt'
			],
			why: '`-k3` starts the sort key at field 3, so `sort` compares `1200`, `880` and so on instead of the paths. `-rn` sorts that key as a number, largest first. `-k3,3` also ends the key at field 3, which gives the same result here because the time is the last column.'
		},
		{
			prompt: 'Sort `orders.csv` by its 3rd comma-separated field, the total, smallest first.',
			accept: [
				'sort -t, -k3 -n orders.csv',
				'sort -t, -k3,3 -n orders.csv',
				'sort -t, -n -k3 orders.csv',
				'sort -n -t, -k3 orders.csv',
				'sort -t , -k3 -n orders.csv',
				"sort -t ',' -k3 -n orders.csv",
				"sort -t',' -k3 -n orders.csv",
				'sort -t, -k3n orders.csv',
				'sort -t, -k3,3n orders.csv',
				'sort -t, -nk3 orders.csv'
			],
			why: '`-t,` makes the comma the field separator, so field 3 is the total. `-k3 -n` sorts on it as a number: `7.99` for omar comes first, `120.00` for ines last.'
		},
		{
			prompt: 'Print each IP of `ips.txt` once.',
			accept: ['sort -u ips.txt', 'sort --unique ips.txt', 'sort ips.txt | uniq', 'cat ips.txt | sort | uniq', 'sort ips.txt|uniq'],
			why: '`sort -u` sorts and keeps the first of each group of equal lines. The output has 4 lines, one per IP.'
		},
		{
			prompt: 'Count how many requests each IP of `ips.txt` sent. Print the count before each IP.',
			accept: ['sort ips.txt | uniq -c', 'sort ips.txt | uniq --count', 'cat ips.txt | sort | uniq -c', 'sort < ips.txt | uniq -c', 'sort ips.txt|uniq -c'],
			why: '`sort` puts equal IPs next to each other, then `uniq -c` prints each group once with its size in front, like `4 10.0.0.7`. Without `sort`, `uniq -c ips.txt` prints 10 lines that each say `1`.'
		},
		{
			prompt: 'Print the 3 IPs of `ips.txt` that sent the most requests, with their counts, busiest first.',
			accept: [
				'sort ips.txt | uniq -c | sort -rn | head -3',
				'sort ips.txt | uniq -c | sort -rn | head -n 3',
				'sort ips.txt | uniq -c | sort -rn | head -n3',
				'sort ips.txt | uniq -c | sort -nr | head -3',
				'sort ips.txt | uniq -c | sort -nr | head -n 3',
				'sort ips.txt | uniq -c | sort -nr | head -n3',
				'sort ips.txt | uniq -c | sort -n -r | head -3',
				'sort ips.txt | uniq -c | sort -n -r | head -n 3'
			],
			why: '`uniq -c` puts the count at the start of each line, so the second `sort -rn` orders the IPs by count, largest first. `head -3` keeps `4 10.0.0.7`, `3 10.0.0.3` and `2 10.0.0.12`.'
		},
		{
			prompt: 'Print only the IPs of `ips.txt` that appear more than once, each on one line.',
			accept: ['sort ips.txt | uniq -d', 'sort ips.txt | uniq --repeated', 'cat ips.txt | sort | uniq -d', 'sort < ips.txt | uniq -d'],
			why: '`uniq -d` prints one line for each group of duplicates and skips lines that appear once. `10.0.0.9` is left out.'
		},
		{
			prompt: 'Sort `sizes.txt` by numeric value and write the result back into `sizes.txt`.',
			accept: [
				'sort -n -o sizes.txt sizes.txt',
				'sort -n sizes.txt -o sizes.txt',
				'sort -o sizes.txt -n sizes.txt',
				'sort -no sizes.txt sizes.txt',
				'sort -n --output=sizes.txt sizes.txt',
				'sort --numeric-sort --output=sizes.txt sizes.txt',
				'sort -n sizes.txt --output=sizes.txt'
			],
			why: '`-o sizes.txt` names the output file, and GNU `sort` reads all its input before it opens that file. `sort -n sizes.txt > sizes.txt` leaves an empty file, because the shell truncates `sizes.txt` before `sort` starts.'
		}
	],
	quiz: [],
	recall: {
		q: 'What does `uniq -c ips.txt` print when you skip `sort`, and why?',
		a: '10 lines that each start with `1`. `uniq` only merges equal adjacent lines, and no two equal IPs are next to each other in `ips.txt`.'
	},
	sources: [
		{ title: 'sort(1)', url: 'https://man7.org/linux/man-pages/man1/sort.1.html' },
		{ title: 'GNU coreutils: sort invocation', url: 'https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html' },
		{ title: 'uniq(1)', url: 'https://man7.org/linux/man-pages/man1/uniq.1.html' },
		{ title: 'head(1)', url: 'https://man7.org/linux/man-pages/man1/head.1.html' }
	]
};
