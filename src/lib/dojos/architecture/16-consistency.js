const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'consistency',
	part: 'Between services',
	title: 'Consistency across several stores',
	minutes: 10,
	hook: [
		'You post on a Mastodon server. Its picture was uploaded to object storage when you attached it. The post is written to Postgres. Its id goes to Redis, so that a job can later put it in Elasticsearch for search. **No transaction covers them all.**',
		'Most days it all lines up. But a process can die between two of those writes. Then your post is on your profile and missing from search. Or a picture sits in storage with no post pointing to it.',
		'This is the **dual-write problem**. Martin Kleppmann called dual writes "a really bad idea" back in 2015. Today: how Mastodon lives with it, and the classic ways out, each with its price.'
	],
	terms: [
		{ term: 'Dual write', def: 'Your code writes to two stores one after the other, with nothing making both succeed or both fail.' },
		{ term: 'Derived copy', def: 'Data stored again, shaped for another kind of read. A search index is a derived copy of the database.' },
		{ term: 'Store of truth', def: 'When copies disagree, the one that wins. Write it first, and rebuild the other copies from it.' },
		{ term: 'Transactional outbox', def: 'Save the message in the same database write as the data. A separate relay reads it and publishes it to the broker.' },
		{ term: 'Reconciliation', def: 'A job that compares the copies later and repairs what differs.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["New post"] -->|"1. picture"| obj[("Object storage")]', 'post -->|"2. row"| pg[("Postgres: store of truth")]'],
				highlight: ['post', 'pg', 'obj'],
				note: '**Two stores, no shared transaction.** Postgres holds the post. Object storage holds its files. If one write lands and the other does not, they disagree.'
			},
			{
				add: ['post -->|"3. post id only"| queue[("Redis set: chewy:queue")]'],
				highlight: ['queue'],
				note: 'For search, Mastodon does not write to Elasticsearch during the request. It adds the **post id** to a Redis set. Only the id: the content will be read again from the truth later.'
			},
			{
				add: ['job["IndexingScheduler, every minute"] -->|"read ids"| queue', 'job -->|"load current rows"| pg', 'job -->|"import"| es[("Elasticsearch")]', 'class es ext'],
				highlight: ['job', 'es'],
				note: 'A job runs **every minute**. It takes a batch of ids, loads those rows from Postgres, sends them to Elasticsearch, and only then removes the ids from the set. Search is **eventually consistent**.'
			},
			{
				add: ['repair["tootctl: search deploy, media remove-orphans"] -->|"rebuild from truth"| es', 'repair -->|"delete files no row points to"| obj'],
				highlight: ['repair'],
				note: '**Reconciliation.** `tootctl search deploy` imports from the database and removes documents the database no longer has. `tootctl media remove-orphans` scans storage for files that no record owns. Both follow the truth.'
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
			'The ids get there through a [custom Chewy strategy](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L12-L27): during a request it stashes the ids of changed records, and at the end it adds them to `chewy:queue:<index>` in Redis. Postgres and Redis are still **two writes**.',
			'**Import first, remove second.** If the job dies between `import!` and `srem`, the ids stay in the set and are imported again next minute. That is safe, because importing the same post twice gives the same document.',
			'The job sends no content of its own. `import!` loads each id through the index\'s [scope on `Status`](' + MASTODON + '/app/chewy/statuses_index.rb#L55), so Elasticsearch always gets **what Postgres says now**, not what the request saw.',
			'The repair follows the truth too. The importer\'s `clean_up!` is commented ["Remove documents from the index that no longer exist in the database"](' + MASTODON + '/app/lib/importer/base_importer.rb#L47-L56). And [`remove-orphans`](' + MASTODON + '/lib/mastodon/cli/media.rb#L94-L100) warns that it must iterate "over every single file individually", so "it will be slow".'
		]
	},
	tradeoff: {
		gain: [
			'**Store of truth first:** one copy always wins, so every disagreement has a known fix, and the fix can run again and again.',
			'**Ids in a queue, content read later:** a late or repeated import still sends today\'s data, never an old snapshot.',
			'**Reconciliation:** repairs anything, whatever caused the gap. **Outbox:** data and message are saved together, so a crash cannot keep one and drop the other.'
		],
		cost: [
			'**Store of truth first:** until the job or a repair runs, the profile and search can disagree. Mastodon\'s search lags by up to a minute on a good day.',
			'**Reconciliation:** someone has to run it, and it reads everything. `remove-orphans` lists every file, and some storage providers charge for those list requests.',
			'**Outbox:** one more process to run, a delay, and duplicates: "The Message relay might publish a message more than once." It also needs a store that can hold the message in the same write as the data.'
		]
	},
	task: {
		prompt: 'A video platform keeps every upload in two storage regions. The upload service writes to both in parallel. If the second region fails, the upload still succeeds and the service sends a "copy later" event, and a worker copies the file from the healthy region. Now the process crashes after the first write and before that event. When does anyone notice? Pick a fix: compensation (undo the write that succeeded), outbox or reconciliation.',
		hint: 'Playback always reads from the first region and only falls back to the second on error. When is the second copy actually used?',
		answer: [
			'Nobody notices while the first region works, since reads never touch the second. The gap shows the day the first region is down: the worst possible moment.',
			'**Compensation** (delete the file from the first region) is wrong: the upload was accepted and the first copy is fine.',
			'**Outbox:** needs a store that writes the file and a "to copy" record in one go. A storage bucket does not give you that for free. You could write the record to the database first, but then that is your new dual write.',
			'**Reconciliation:** a job lists both regions and copies what is missing. Cost: a full listing of both buckets per run, which takes time and may cost money.',
			'Copying twice is harmless if a file\'s name is derived from its content, or if the copy overwrites with the same bytes. Make the repair idempotent and you can run it as often as you like.'
		]
	},
	quiz: [
		{
			q: 'A service writes a row to its database, then publishes an event to a broker. What can go wrong that no `try/catch` in that code can fix?',
			options: ['The broker rejects the message format and returns an error to the service', 'The database write is slow, so the publish times out after the commit', 'The process dies after the write and before the publish, so no event is ever sent', 'The broker publishes the event twice, so consumers see a duplicate'],
			answer: 2,
			why: 'Error handling only runs if the process is alive. A crash between two writes leaves them split. Only an outbox (one write) or a later reconciliation closes that gap.'
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
			why: 'The database is the store of truth. A document it does not know is an orphan, so the copy loses it. The truth is never rebuilt from the copy.'
		}
	],
	takeaway: 'Several writes to several stores will eventually split. Pick a store of truth, write it first, and own the job that rebuilds everything else from it.',
	sources: [
		{ title: 'Martin Kleppmann, Using logs to build a solid data infrastructure (or: why dual writes are a bad idea), 2015', url: 'https://martin.kleppmann.com/2015/05/27/logs-for-data-infrastructure.html' },
		{ title: 'Chris Richardson, Pattern: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
		{ title: 'Mastodon docs, Configuring full-text search', url: 'https://docs.joinmastodon.org/admin/elasticsearch/' },
		{ title: 'Mastodon docs, Using the admin CLI (tootctl)', url: 'https://docs.joinmastodon.org/admin/tootctl/' },
		{ title: 'Mastodon, indexing_scheduler.rb', url: `${MASTODON}/app/workers/scheduler/indexing_scheduler.rb#L13-L25` }
	]
};
