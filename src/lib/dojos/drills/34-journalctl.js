/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'journalctl',
	part: 'Ops tools',
	title: 'journalctl',
	minutes: 10,
	hook: [
		'On the VM `web-1`, `orders.service` crashed three times last night. At 06:12 this morning a colleague rebooted the VM, and the service has been running since. You want the crash messages, which are in the journal of the boot before the current one.',
		'You are root, and root can read the system journal. Every rep reads the logs of the unit `orders`; `-u orders` and `-u orders.service` select the same unit. journalctl pages its output through `less` by default.'
	],
	terms: [
		{ term: 'Journal', def: 'The log store of systemd, written by journald. Each entry has a message plus fields; `_SYSTEMD_UNIT` holds the unit name.' },
		{ term: 'Priority', def: 'The syslog level of an entry, from 0 (`emerg`) to 7 (`debug`). `err` is 3 and `warning` is 4.' },
		{ term: 'Boot', def: 'The time between one start of the machine and the next. `-b -1` means the boot before the current one, `-b` alone the current one.' }
	],
	reps: [
		{
			prompt: 'Show every journal entry of `orders`.',
			accept: [
				'journalctl -u orders',
				'journalctl -u orders.service',
				'journalctl --unit=orders',
				'journalctl --unit orders',
				'journalctl --unit=orders.service'
			],
			why: '`-u orders` keeps the messages of that unit, plus the messages systemd wrote about it, such as `Started orders.service`. With no other option you get every entry still stored, oldest first.'
		},
		{
			prompt: 'Show only the last 50 entries of `orders`.',
			accept: [
				'journalctl -u orders -n 50',
				'journalctl -u orders -n50',
				'journalctl -u orders --lines=50',
				'journalctl -u orders --lines 50',
				'journalctl -n 50 -u orders',
				'journalctl -u orders.service -n 50'
			],
			why: '`-n 50` shows the 50 most recent entries. `-n` with no number shows 10.'
		},
		{
			prompt: 'Watch the logs of `orders` live while you send it a test request.',
			accept: [
				'journalctl -u orders -f',
				'journalctl -f -u orders',
				'journalctl -fu orders',
				'journalctl -u orders --follow',
				'journalctl --follow -u orders',
				'journalctl -u orders.service -f'
			],
			why: '`-f` prints the last 10 entries, then each new one as journald writes it, until you press Ctrl-C.'
		},
		{
			prompt: 'Show the entries of `orders` from the last hour.',
			accept: [
				"journalctl -u orders --since '1 hour ago'",
				'journalctl -u orders --since "1 hour ago"',
				'journalctl -u orders --since="1 hour ago"',
				"journalctl -u orders -S '1 hour ago'",
				'journalctl -u orders --since -1h',
				'journalctl -u orders --since=-1h',
				'journalctl -u orders -S -1h'
			],
			why: '`--since \'1 hour ago\'` starts at the time one hour before now; `-1h` means the same. It also takes a date such as `"2026-10-17 06:12"`.'
		},
		{
			prompt: 'Show only the entries of `orders` at priority `err` or more severe.',
			accept: [
				'journalctl -u orders -p err',
				'journalctl -u orders -p 3',
				'journalctl -u orders --priority=err',
				'journalctl -u orders --priority=3',
				'journalctl -p err -u orders',
				'journalctl -p 3 -u orders'
			],
			why: '`-p err` keeps level 3 and every lower number: `crit` (2), `alert` (1) and `emerg` (0). `warning` (4) and `info` (6) are dropped.'
		},
		{
			prompt: 'Show the entries of `orders` from the boot before the current one, when the crashes happened.',
			accept: [
				'journalctl -u orders -b -1',
				'journalctl -u orders -b-1',
				'journalctl -u orders --boot=-1',
				'journalctl -u orders --boot -1',
				'journalctl -b -1 -u orders'
			],
			why: '`-b -1` counts back from the last boot: `-0` is the current boot and `-1` the one before. `journalctl --list-boots` prints each boot with its offset and its first and last entry times.'
		},
		{
			prompt: 'Show the error entries of `orders` since the current boot only.',
			accept: [
				'journalctl -u orders -b -p err',
				'journalctl -u orders -p err -b',
				'journalctl -b -u orders -p err',
				'journalctl -b -p err -u orders',
				'journalctl -p err -u orders -b',
				'journalctl -p err -b -u orders',
				'journalctl -u orders -b -p 3'
			],
			why: '`-b` with no argument means the current boot. journalctl shows an entry only if it matches all three filters.'
		},
		{
			prompt: 'Print the most recent entry of `orders` as one JSON object, with all its fields.',
			accept: [
				'journalctl -u orders -n 1 -o json',
				'journalctl -u orders -n 1 --output=json',
				'journalctl -u orders -o json -n 1',
				'journalctl -u orders -n1 -o json',
				'journalctl -u orders -n 1 --output json',
				'journalctl -u orders -n 1 -ojson',
				'journalctl -n 1 -o json -u orders'
			],
			why: '`-o json` prints each entry as one JSON object per line, the text being in the `MESSAGE` field. `-o json-pretty` spreads the same object over several lines.'
		}
	],
	quiz: [],
	recall: {
		q: 'Which levels does `journalctl -p err` show?',
		a: '`err` (3) and every more severe level: `crit` (2), `alert` (1) and `emerg` (0). `-p 3` does the same.'
	},
	sources: [{ title: 'journalctl man page', url: 'https://www.freedesktop.org/software/systemd/man/latest/journalctl.html' }]
}
