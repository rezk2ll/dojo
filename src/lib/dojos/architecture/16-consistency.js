const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'consistency',
	part: 'Between services',
	title: 'Consistency across several stores',
	minutes: 10,
	hook: [
		'You post on a Mastodon server. Its picture went to object storage when you attached it. The post is written to Postgres. Its id goes to Redis, so that a job can later put the post in Elasticsearch for search. **No transaction covers all of these writes.**',
		'Most days the three stores agree. But a process can die between two of those writes. Then your post is on your profile and missing from search. Or a picture sits in storage with no post pointing to it.',
		'Writing to two stores with nothing around both writes is called a **dual write**. Martin Kleppmann called dual writes "a really bad idea" in 2015. Mastodon writes Postgres first and repairs the other stores from it, and the outbox and reconciliation are the other usual fixes.'
	],
	terms: [
		{ term: 'Dual write', def: 'Your code writes to two stores one after the other, with nothing making both succeed or both fail.' },
		{ term: 'Store of truth', def: 'The store whose data you keep when copies disagree. You write it first and rebuild the other copies from it.' },
		{ term: 'Transactional outbox', def: 'Save the message in the same database write as the data. A separate relay reads it and publishes it to the broker.' },
		{ term: 'Reconciliation', def: 'A job that compares the copies later and repairs what differs.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["New post"] -->|"1. picture"| obj[("Object storage")]', 'post -->|"2. row"| pg[("Postgres: store of truth")]'],
				highlight: ['post', 'pg', 'obj'],
				note: 'Postgres holds the post and object storage holds its files, with no transaction shared between them. If one write lands and the other does not, the two stores disagree.'
			},
			{
				add: ['post -->|"3. post id only"| queue[("Redis set: chewy:queue")]'],
				highlight: ['queue'],
				note: 'For search, Mastodon does not write to Elasticsearch during the request. It adds the **post id** to a Redis set. The job reads the content from Postgres later.'
			},
			{
				add: ['job["IndexingScheduler, every minute"] -->|"read ids"| queue', 'job -->|"load current rows"| pg', 'job -->|"import"| es[("Elasticsearch")]', 'class es ext'],
				highlight: ['job', 'es'],
				note: 'A job runs **every minute**. It takes a batch of ids, loads those rows from Postgres, sends them to Elasticsearch, and only then removes the ids from the set. Search can lag Postgres by up to that minute.'
			},
			{
				add: ['repair["tootctl: search deploy, media remove-orphans"] -->|"rebuild from truth"| es', 'repair -->|"delete files no row points to"| obj'],
				highlight: ['repair'],
				note: 'Two commands reconcile the stores with Postgres. `tootctl search deploy` imports from the database and removes documents the database no longer has. `tootctl media remove-orphans` deletes stored files that no record points to.'
			}
		]
	},
	example: {
		title: 'app/workers/scheduler/indexing_scheduler.rb',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/app/workers/scheduler/indexing_scheduler.rb#L13-L25`,
		lang: 'ruby',
		code: `  def perform
    return unless Chewy.enabled?

    indexes.each do |type|
      with_redis do |redis|
        redis.sscan_each("chewy:queue:#{type.name}", count: SCAN_BATCH_SIZE).each_slice(IMPORT_BATCH_SIZE) do |ids|
          type.import!(ids)

          redis.srem("chewy:queue:#{type.name}", ids)
        end
      end
    end
  end`,
		notes: [
			'Line 6 reads the ids from `chewy:queue:<index>`. They get there through a [custom Chewy strategy](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L12-L27): during a request it stashes the ids of changed records, and at the end it adds them to the Redis set. Postgres and Redis are still **two writes**.',
			'Line 7 imports and line 9 removes, in that order. If the job dies between `import!` and `srem`, the ids stay in the set and are imported again the next minute. Importing the same post twice gives the same document, so the repeat does no harm.',
			'Line 7 sends no content of its own. `import!` loads each id through the index\'s [scope on `Status`](' + MASTODON + '/app/chewy/statuses_index.rb#L55), so Elasticsearch gets **what Postgres holds at import time**, not what the request saw.',
			'The repair commands also read from Postgres. The importer\'s `clean_up!` carries the comment "Remove documents from the index that no longer exist in the database" (in the sources). [`remove-orphans`](' + MASTODON + '/lib/mastodon/cli/media.rb#L94-L100) warns that it must iterate "over every single file individually", so "it will be slow".'
		]
	},
	tradeoff: {
		gain: [
			'With Postgres as the store of truth, every disagreement has a known fix: copy from Postgres. The fix can run again and again.',
			'The queue holds ids and the job reads the content later, so a late or repeated import still sends the current row, never an old snapshot.',
			'A reconciliation job compares the copies and repairs a gap, whatever caused it. An outbox saves data and message in one write, so a crash cannot keep one and drop the other.'
		],
		cost: [
			'Until the job or a repair runs, the profile and search can disagree. Mastodon\'s search lags by up to a minute when the job runs on time.',
			'Someone has to run reconciliation, and it reads everything. `remove-orphans` lists every file, and some storage providers charge for those list requests.',
			'An outbox adds a relay process, a delay and duplicates: "The Message relay might publish a message more than once." It also needs a store that can hold the message in the same write as the data.'
		]
	},
	task: {
		prompt: 'A video platform keeps every upload in two storage regions. The upload service writes to both in parallel. If the second region fails, the upload still succeeds and the service sends a "copy later" event, and a worker copies the file from the healthy region. Now the process crashes after the first write and before that event. When does anyone notice? Pick a fix: compensation (undo the write that succeeded), outbox or reconciliation.',
		hint: 'Playback always reads from the first region and only falls back to the second on error. When is the second copy actually used?',
		answer: [
			'Nobody notices while the first region works, since reads never touch the second. The missing copy shows up the day the first region is down, which is the one day it is needed.',
			'Compensation (delete the file from the first region) is wrong: the upload was accepted and the first copy is fine.',
			'Outbox: it needs a store that writes the file and a "to copy" record in one go. A storage bucket does not offer that. You could write the record to the database first, but the database and the bucket are then a new dual write.',
			'Reconciliation: a job lists both regions and copies what is missing. Each run lists both buckets in full, which takes time and may cost money.',
			'Copying twice is harmless if a file\'s name is derived from its content, or if the copy overwrites with the same bytes. With an idempotent repair, you can run it as often as you like.'
		],
		steps: [
			{
				title: 'Trace the crash',
				questions: [
					{ q: 'The process dies after the first write and before the event. What is left?', options: ['No file in either region', 'The file in the first region only, and no "copy later" event', 'Both copies, and a pending event', 'The file in the second region only'], answer: 1, why: 'One write landed, the other did not, and the event that would repair it was never sent.' },
					{ q: 'What kind of write is this upload?', options: ['A single atomic write to both regions', 'An outbox write', 'A reconciliation step', 'A dual write: two stores, with nothing making both succeed or both fail'], answer: 3, why: 'Two stores written separately, in parallel here, with nothing around both writes.' },
					{ q: 'Can a `try/catch` around the two writes fix this?', options: ['Yes, catch the error and send the event', 'No, a `catch` only runs while the process is alive', 'Yes, if the `catch` retries the write', 'No, because buckets do not raise errors'], answer: 1, why: 'A crash skips the `catch`. The gap stays open.' },
					{ q: 'Why does the copy worker never fix it?', options: ['It copies only when it gets a "copy later" event, and none was sent', 'The second region refuses copies', 'The first copy is broken', 'It runs only once a day'], answer: 0, why: 'The repair depends on the event, and the event was the write that never happened.' }
				]
			},
			{
				title: 'Find when it shows',
				questions: [
					{ q: 'Where does playback read from?', options: ['Always from the second region', 'From both regions, and compares them', 'From the first region, and the second only on error', 'From whichever region is closer'], answer: 2, why: 'The second copy is read only when the first one fails.' },
					{ q: 'When does anyone notice the missing copy?', options: ['At the next playback', 'The day the first region is down', 'When the worker retries', 'At the next upload'], answer: 1, why: 'While the first region works, reads never touch the second.' },
					{ q: 'Why is that the worst moment to find out?', options: ['It is the one day the second copy is needed', 'Uploads are slower that day', 'The worker is busy that day', 'Users watch fewer videos that day'], answer: 0, why: 'The copy exists to cover a region outage, and the outage is when it turns out to be missing.' },
					{ q: 'What would make the gap visible before that day?', options: ['More playback traffic', 'Longer timeouts on the upload', 'A larger first region', 'A job that compares both regions'], answer: 3, why: 'Nothing on the normal path reads the second copy. Only a check that looks at both regions finds the gap.' }
				]
			},
			{
				title: 'Weigh compensation and outbox',
				questions: [
					{ q: 'Compensation would delete the file from the first region. Why is that wrong here?', options: ['Deleting is too slow', 'The upload was accepted and the first copy is fine', 'Compensation needs an outbox first', 'It would delete the second copy too'], answer: 1, why: 'Undoing a good write throws away the one copy you have.' },
					{ q: 'What does an outbox need?', options: ['A store that saves the data and the message in one write', 'A second broker', 'A reconciliation job behind it', 'A cache in front of the store'], answer: 0, why: 'The outbox works because data and message land in the same write, so a crash keeps both or neither.' },
					{ q: 'Can a storage bucket write the file and a "to copy" record in one go?', options: ['Yes, every bucket supports transactions', 'Yes, if both regions share one bucket', 'No, a bucket does not offer that', 'Only for files under a size limit'], answer: 2, why: 'The outbox needs one write for both. A bucket gives you none.' },
					{ q: 'You write the "to copy" record to the database first, then the file. What have you built?', options: ['A true outbox', 'An atomic upload', 'A reconciliation job', 'A new dual write, between the database and the bucket'], answer: 3, why: 'The database and the bucket share no transaction, so the same crash can split them.' }
				]
			},
			{
				title: 'Reconcile, safely',
				questions: [
					{ q: 'What does the reconciliation job do?', options: ['Lists both regions and copies what is missing', 'Deletes every file found in only one region', 'Asks users to upload again', 'Compares only the file counts'], answer: 0, why: 'It repairs the gap whatever caused it, including the crash no event saw.' },
					{ q: 'What does it cost?', options: ['Nothing: it reads a single row', 'It blocks uploads while it runs', 'Each run lists both buckets in full, which takes time and may cost money', 'It needs an outbox relay'], answer: 2, why: 'Reconciliation reads everything. Some storage providers charge for those list requests.' },
					{ q: 'When is copying a file twice harmless?', options: ['Never: a second copy always corrupts it', 'When the name comes from the content, or the copy overwrites with the same bytes', 'Only when the file is small', 'Only when the job runs at night'], answer: 1, why: 'Then the repair is idempotent, and you can run it as often as you like.' },
					{ q: 'Which Mastodon tool is the same kind of repair?', options: ['The Redis set `chewy:queue`', 'The Chewy strategy that stashes ids', 'The order of `import!`, then `srem`', '`tootctl media remove-orphans`, which checks every stored file against the records'], answer: 3, why: 'It reconciles object storage with Postgres by going over every file, and it warns that it will be slow.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'A service writes a row to its database, then publishes an event to a broker. What can go wrong that no `try/catch` in that code can fix?',
			options: ['The broker rejects the message format and returns an error to the service', 'The database write is slow, so the publish times out after the commit', 'The process dies after the write and before the publish, so no event is ever sent', 'The broker publishes the event twice, so consumers see a duplicate'],
			answer: 2,
			why: 'A `catch` block only runs while the process is alive. A crash between the two writes leaves the row saved and the event unsent. Only an outbox (one write) or a later reconciliation closes that gap.'
		},
		{
			q: 'Mastodon\'s IndexingScheduler imports a batch of ids, then removes them from the Redis set. Why in that order?',
			options: ['If it crashes in between, the ids stay queued and are imported again, which is harmless', 'Redis refuses to remove ids from the set until they have been imported', 'Removing first would block the import until Redis confirms the delete', 'Elasticsearch needs the ids to stay in Redis while it indexes the batch'],
			answer: 0,
			why: 'Removing first would lose the ids on a crash, and those posts would never reach search. Importing first can only cause a repeat, and a repeat sends the same data again.'
		},
		{
			q: 'Elasticsearch holds a post that no longer exists in Mastodon\'s Postgres. What does the clean step of `tootctl search deploy` do?',
			options: ['Copies the post back into Postgres', 'Leaves it, since search is only eventually consistent', 'Asks an admin which copy to keep', 'Deletes the document from the index'],
			answer: 3,
			why: '`clean_up!` treats Postgres as the store of truth: it deletes every index document whose row Postgres no longer has, and nothing ever copies from Elasticsearch back into Postgres.'
		}
	],
	recall: {
		q: 'In Mastodon, which store is the store of truth, and how do Elasticsearch and object storage get repaired from it?',
		a: 'Postgres. `tootctl search deploy` re-imports rows and deletes documents Postgres no longer has, and `tootctl media remove-orphans` deletes files no record points to.'
	},
	sources: [
		{ title: 'Martin Kleppmann, Using logs to build a solid data infrastructure (or: why dual writes are a bad idea), 2015', url: 'https://martin.kleppmann.com/2015/05/27/logs-for-data-infrastructure.html' },
		{ title: 'Chris Richardson, Pattern: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
		{ title: 'Mastodon docs, Configuring full-text search', url: 'https://docs.joinmastodon.org/admin/elasticsearch/' },
		{ title: 'Mastodon docs, Using the admin CLI (tootctl)', url: 'https://docs.joinmastodon.org/admin/tootctl/' },
		{ title: 'Mastodon, indexing_scheduler.rb', url: `${MASTODON}/app/workers/scheduler/indexing_scheduler.rb#L13-L25` },
		{ title: 'Mastodon, base_importer.rb, clean_up!', url: `${MASTODON}/app/lib/importer/base_importer.rb#L47-L56` }
	]
};
