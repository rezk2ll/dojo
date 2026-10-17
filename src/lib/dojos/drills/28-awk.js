/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'awk',
	part: 'Text and data',
	title: 'awk',
	minutes: 10,
	hook: [
		'Support says some API calls take seconds and some orders look wrong. You have the access log and an export of the orders table, and no time to load them into a database. `awk` reads a file line by line, splits each line into fields `$1`, `$2`, `$3` and so on, and runs a small program on each line.',
		'The reps use two files. `access.log` has 4 lines with the fields IP, method, path, status and time in ms, separated by spaces: `10.0.0.12 GET /api/users 200 18`, `10.0.0.7 POST /api/orders 201 95`, `10.0.0.12 GET /api/orders 500 230`, `10.0.0.9 GET /health 200 2`. `orders.csv` has the header `id,customer,country,amount` and 5 rows: `1,ana,FR,30`, `2,bob,DE,45`, `3,chen,FR,25`, `4,dina,US,60`, `5,eve,DE,15`. The answers work in any POSIX awk.'
	],
	terms: [
		{ term: 'Field', def: 'One piece of a line after awk splits it. `$1` is the first field, and `$0` holds the full line.' },
		{ term: 'Field separator', def: 'What awk splits a line on. By default it is runs of spaces and tabs; `-F,` sets it to a comma.' },
		{ term: 'Pattern', def: 'A condition before `{...}`, like `$4 == 500`. awk runs the action only on the lines where it is true.' }
	],
	reps: [
		{
			prompt: 'Print the path (the 3rd field) of each line of `access.log`.',
			accept: ["awk '{print $3}' access.log", "awk '{ print $3 }' access.log", 'awk "{print \\$3}" access.log', "awk '{print $3;}' access.log"],
			why: 'awk splits each line on spaces, so `$3` is the path. `{print $3}` runs on every line because no pattern stands before it.'
		},
		{
			prompt: 'Print the IP and the status of each line, separated by one space.',
			accept: [
				"awk '{print $1, $4}' access.log",
				"awk '{ print $1, $4 }' access.log",
				"awk '{print $1,$4}' access.log",
				"awk '{print $1 \" \" $4}' access.log",
				"awk '{print $1\" \"$4}' access.log"
			],
			why: 'The comma in `print $1, $4` puts the output field separator between the two values, a space by default. Without the comma, `print $1 $4` glues them: `10.0.0.12200`.'
		},
		{
			prompt: 'Print the last field of each line of `access.log` without writing its number.',
			accept: ["awk '{print $NF}' access.log", "awk '{ print $NF }' access.log"],
			why: '`NF` holds the number of fields on the current line, here 5. `$NF` is therefore the last field, the time in ms, whatever the field count.'
		},
		{
			prompt: 'Print each line of `access.log` with its line number in front, like `1 10.0.0.12 GET /api/users 200 18`.',
			accept: ["awk '{print NR, $0}' access.log", "awk '{ print NR, $0 }' access.log", "awk '{print NR,$0}' access.log", "awk '{print NR \" \" $0}' access.log"],
			why: '`NR` is the number of the current line, counted from 1. `$0` holds the full line.'
		},
		{
			prompt: 'Print the whole lines of `access.log` whose status is 500.',
			accept: [
				"awk '$4 == 500' access.log",
				"awk '$4==500' access.log",
				"awk '$4 == 500 {print}' access.log",
				"awk '$4 == 500 { print }' access.log",
				"awk '$4 == 500 {print $0}' access.log",
				"awk '$4==500{print}' access.log",
				"awk '$4 == \"500\"' access.log"
			],
			why: '`$4 == 500` is a pattern, so awk keeps only the matching lines. A pattern with no action prints the line: POSIX says a missing action is the same as `{ print }`.'
		},
		{
			prompt: 'Print the customer names (the 2nd column) of `orders.csv`, header line included.',
			accept: [
				"awk -F, '{print $2}' orders.csv",
				"awk -F',' '{print $2}' orders.csv",
				"awk -F ',' '{print $2}' orders.csv",
				"awk -F , '{print $2}' orders.csv",
				'awk -F"," \'{print $2}\' orders.csv',
				"awk -F, '{ print $2 }' orders.csv",
				"awk -v FS=, '{print $2}' orders.csv",
				"awk 'BEGIN {FS=\",\"} {print $2}' orders.csv"
			],
			why: '`-F,` sets the field separator to a comma, so `$2` is the customer. Without it, awk splits on spaces, finds none, and `$2` is empty on every line.'
		},
		{
			prompt: 'Same, but skip the header line.',
			accept: [
				"awk -F, 'NR > 1 {print $2}' orders.csv",
				"awk -F, 'NR>1 {print $2}' orders.csv",
				"awk -F, 'NR>1{print $2}' orders.csv",
				"awk -F, 'NR > 1 { print $2 }' orders.csv",
				"awk -F, 'NR >= 2 {print $2}' orders.csv",
				"awk -F, 'NR>=2 {print $2}' orders.csv",
				"awk -F, 'NR != 1 {print $2}' orders.csv",
				"awk -F',' 'NR > 1 {print $2}' orders.csv"
			],
			why: 'The pattern `NR > 1` is false on line 1, the header, so awk prints `ana` to `eve` and skips `customer`.'
		},
		{
			prompt: 'Print the total of the time column (field 5) of `access.log`. Keep the running total in a variable named `sum`.',
			accept: [
				"awk '{sum += $5} END {print sum}' access.log",
				"awk '{ sum += $5 } END { print sum }' access.log",
				"awk '{sum+=$5} END {print sum}' access.log",
				"awk '{sum+=$5} END{print sum}' access.log",
				"awk '{sum+=$5}END{print sum}' access.log",
				"awk '{sum = sum + $5} END {print sum}' access.log"
			],
			why: '`{sum += $5}` runs on each line, and `END` runs once after the last line. awk starts an unset variable at 0, so `sum` needs no setup and the result is `345`.'
		},
		{
			prompt: 'Print the total amount of the `FR` orders in `orders.csv`, with a variable named `sum`.',
			accept: [
				"awk -F, '$3 == \"FR\" {sum += $4} END {print sum}' orders.csv",
				"awk -F, '$3==\"FR\" {sum+=$4} END {print sum}' orders.csv",
				"awk -F, '$3 == \"FR\" { sum += $4 } END { print sum }' orders.csv",
				"awk -F, '$3==\"FR\"{sum+=$4}END{print sum}' orders.csv",
				"awk -F, '$3 ~ /FR/ {sum += $4} END {print sum}' orders.csv",
				"awk -F, '$3 ~ /^FR$/ {sum += $4} END {print sum}' orders.csv"
			],
			why: '`$3 == "FR"` keeps the rows of `ana` and `chen`, and `sum += $4` adds 30 and 25 for a total of `55`. The quotes matter: without them, awk reads `FR` as an empty variable and no row matches.'
		},
		{
			prompt: 'Count the orders per country in `orders.csv`: one `country count` line per country, in any order. Use an array named `count` and a loop variable `c`.',
			accept: [
				"awk -F, 'NR > 1 {count[$3]++} END {for (c in count) print c, count[c]}' orders.csv",
				"awk -F, 'NR>1 {count[$3]++} END {for (c in count) print c, count[c]}' orders.csv",
				"awk -F, 'NR>1{count[$3]++}END{for(c in count)print c,count[c]}' orders.csv",
				"awk -F, 'NR > 1 { count[$3]++ } END { for (c in count) print c, count[c] }' orders.csv",
				"awk -F, 'NR>1 {count[$3]++} END {for (c in count) print c,count[c]}' orders.csv",
				"awk -F, 'NR>1 {count[$3]++} END {for(c in count) print c, count[c]}' orders.csv",
				"awk -F, 'NR > 1 {count[$3]++} END {for (c in count) {print c, count[c]}}' orders.csv"
			],
			why: '`count[$3]++` adds 1 to the entry for this row\'s country. In `END`, `for (c in count)` visits each country once and prints `FR 2`, `DE 2` and `US 1`, in some order. POSIX leaves the order of `for (c in count)` unspecified, so pipe to `sort` if you need one.'
		}
	],
	quiz: [],
	recall: {
		q: 'In awk, what are `NR` and `NF` on the line `10.0.0.7 POST /api/orders 201 95`, the 2nd line of `access.log`?',
		a: '`NR` is 2, the line number counted from 1. `NF` is 5, the number of fields, so `$NF` is the last field, `95`.'
	},
	sources: [
		{ title: 'POSIX: awk', url: 'https://pubs.opengroup.org/onlinepubs/9799919799/utilities/awk.html' }
	]
};
