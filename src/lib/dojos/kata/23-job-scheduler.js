/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'job-scheduler',
	part: 'Real time',
	title: 'A job scheduler',
	minutes: 10,
	hook: [
		'An invoicing app sends 20 000 payment reminders every morning at 9:00. A cron line on one server starts the script that sends them.',
		'Last Tuesday that server rebooted at 8:59 for a kernel update, and nobody got a reminder that day. The week before, someone ran the script again after a timeout, and 3 000 customers got the same reminder twice.',
		'The team wants one scheduler for all its timed work: it runs each job at its time, once, and a dead server delays jobs without losing them.'
	],
	terms: [
		{ term: 'Lease', def: 'A claim on a job that ends at a set time, stored in the job row as `locked_until`. If the worker does not finish before then, another worker may take the job.' },
		{ term: 'SKIP LOCKED', def: 'A PostgreSQL option of `SELECT ... FOR UPDATE`: rows that another transaction has locked are left out of the result instead of making the query wait.' },
		{ term: 'At-least-once', def: 'Each job runs one or more times. A crash can make it run again, and it never runs zero times.' },
		{ term: 'Idempotency key', def: 'A value sent with a request so the receiver can recognise a repeat and do the work only once. Here, the job id.' }
	],
	kata: {
		brief: [
			'The app creates 200 000 jobs a day through an internal API: reminders, invoice runs, trial-end emails. Each job has a type, a JSON payload of about 1 KB, and the time it must run. A job takes 2 seconds on average and 30 seconds at most.',
			'Jobs are not spread evenly: 20 000 reminders are due at exactly 9:00. Every job must start within 1 minute of its time. One worker process runs 50 jobs at the same time.',
			'A worker can crash in the middle of a job, and a whole server can go down. A job claimed by a dead worker must run within 5 minutes. Sending the same email twice is the failure the team wants gone.',
			'The team already runs PostgreSQL with a replica. Design where jobs are stored, how workers pick them, and what happens when a worker dies holding a job.'
		],
		minutes: 10,
		checklist: [
			'Your design gives the number of worker processes needed to start 20 000 jobs within the minute after 9:00.',
			'Your design says where a job lives between its creation and its run, and that a server reboot does not erase it.',
			'Your design says what stops two workers from taking the same job at the same moment.',
			'Your design says how a job held by a crashed worker gets run, and after how long.',
			'Your design says what happens when a job sent its email and the worker died before marking it done.',
			'Your design says what the job table holds after a year, and when finished rows are deleted.'
		],
		sample: [
			'Jobs live in one PostgreSQL table `jobs`: `id`, `type`, `payload`, `run_at`, `state`, `locked_until`, `attempts`. A partial index on `run_at WHERE state = \'pending\'` holds only jobs that still have to run. The PostgreSQL docs: such an index "contains entries only for those table rows that satisfy the predicate". No timer lives in a worker’s memory, so a reboot loses nothing.',
			'200 000 jobs a day is about 2.3 per second on average. The 9:00 peak is the number to size for: 20 000 jobs of 2 seconds is 40 000 job-seconds. To finish starting them in 60 seconds, you need about 670 running at once, so 14 worker processes of 50.',
			'Each worker polls once a second with one statement: `UPDATE jobs SET state = \'running\', locked_until = now() + interval \'3 minutes\', attempts = attempts + 1 WHERE id IN (SELECT id FROM jobs WHERE state = \'pending\' AND run_at <= now() ORDER BY run_at LIMIT 50 FOR UPDATE SKIP LOCKED) RETURNING *`. The docs: with `SKIP LOCKED`, "any selected rows that cannot be immediately locked are skipped". Two workers polling at the same millisecond get two different sets of 50 jobs.',
			'The transaction ends as soon as the `UPDATE` commits, and the docs say "Row-level locks are released at transaction end". From then on, only `state` and `locked_until` say the job is taken. A worker that finishes sets `state = \'done\'`. 14 workers polling once a second make 14 small queries per second.',
			'A rescuer runs every minute: `UPDATE jobs SET state = \'pending\' WHERE state = \'running\' AND locked_until < now()`. A job held by a crashed worker is back in the queue at most 4 minutes after the claim, and the next poll takes it. The 3-minute lease is six times the 30-second longest job, so a slow job is not taken while it still runs.',
			'This gives at-least-once: a worker that sent the email and died before `done` makes the job run again. A handler that writes to PostgreSQL inserts into a table with a unique `job_id` column, in the same transaction that sets `done`. A second run fails on that unique key and changes nothing. A handler that calls an outside service passes the job id as that service’s idempotency key, when the service accepts one.',
			'The cost of this design: a job whose outside service takes no idempotency key can still run twice after a crash. The jobs of a crashed worker wait up to 4 minutes, so a 9:00 reminder can leave at 9:04. A job is about 1 KB, so 200 000 a day is 200 MB a day; a nightly job deletes `done` rows older than 30 days, which keeps the table near 6 GB.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what lets a job held by a crashed worker run again, and how long can that take?',
		a: 'The `locked_until` lease of 3 minutes. A rescuer that runs every minute puts jobs with an expired lease back to `pending`, so the job is picked up at most about 4 minutes after the claim.'
	},
	sources: [
		{ title: 'PostgreSQL docs: SELECT, the locking clause and SKIP LOCKED', url: 'https://www.postgresql.org/docs/current/sql-select.html' },
		{ title: 'PostgreSQL docs: Explicit locking, row-level locks', url: 'https://www.postgresql.org/docs/current/explicit-locking.html' },
		{ title: 'PostgreSQL docs: Partial indexes', url: 'https://www.postgresql.org/docs/current/indexes-partial.html' }
	]
};
