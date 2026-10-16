const REPO = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const SIDEKIQ = 'https://github.com/sidekiq/sidekiq/blob/1bb4aa06e5aa178a114a5e855f9f3d5c24f6c61b';
const PSS = `${REPO}/app/services/post_status_service.rb`;

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'sync-vs-async',
	part: 'Between services',
	title: 'Sync calls vs async jobs',
	minutes: 10,
	hook: [
		'You post on Mastodon. Your followers live on 2,000 other servers, and each one must receive your post. If your server called all 2,000 **inside your request**, you would stare at a spinner for minutes, and one slow server would hold everyone up.',
		'So Mastodon splits the work. Your request saves the post and **queues a job**. Workers deliver to each server later, one job per inbox.',
		'The design question is: **what must the caller know before you answer?** The rest can run later, in a job. A job keeps the request short, and its errors no longer reach the caller.'
	],
	terms: [
		{ term: 'Synchronous call', def: 'The caller waits for the answer. It gets the result, or the error, right now.' },
		{ term: 'Asynchronous job', def: 'The caller gets an answer before the work is done. The work runs later, from a queue such as Sidekiq\'s in Redis, and its errors arrive by another path or not at all.' },
		{ term: 'Fan-out', def: 'Turning one job into many: here, one delivery job per remote inbox instead of one for the whole post.' },
		{ term: 'Dead set', def: 'Where Sidekiq keeps a job after its last failed retry, so a person can look at it. A job can opt out and be dropped instead.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you(["You press Publish"]) -->|"POST /api/v1/statuses, waits"| pss["PostStatusService"]', 'pss -->|"save!"| db[("PostgreSQL")]'],
				highlight: ['you', 'pss', 'db'],
				note: 'Your request checks the media, the mentions and the spam rules, then saves the post. You can fix these errors now, so they come back in the response, along with the saved post.'
			},
			{
				add: ['pss -->|"perform_async(status.id)"| q["Sidekiq queues in Redis"]', 'class q ext'],
				highlight: ['q'],
				note: 'The service then queues jobs that carry only the post id: one for local timelines, one for remote servers, one to fetch link previews. Then your request ends and you get the answer.'
			},
			{
				add: ['q --> dist["ActivityPub::DistributionWorker"]', 'dist -->|"push_bulk: one job per inbox"| q'],
				highlight: ['dist'],
				note: 'The distribution worker does the fan-out. It finds every inbox that should get the post, and queues one `DeliveryWorker` job **per inbox**, back into the same Redis.'
			},
			{
				add: ['q --> deliv["ActivityPub::DeliveryWorker"]', 'deliv -->|"signed POST"| inbox["Remote server inbox"]', 'class inbox ext'],
				highlight: ['deliv', 'inbox'],
				note: 'Each delivery job sends one signed HTTP POST to one server. A success clears that server\'s failure record.'
			},
			{
				add: ['deliv -.->|"error: retry, up to 16 times"| q', 'deliv -.->|"failures on 7 different days"| un["UnavailableDomain"]'],
				highlight: ['un'],
				note: 'A failed delivery is retried **for that one server only**. After the last retry the job is dropped, because it sets `dead: false`. A server that keeps failing on 7 different days is marked unavailable and skipped, and no one tells the author.'
			}
		]
	},
	example: {
		title: 'app/services/post_status_service.rb, postprocess_status!',
		repo: 'mastodon/mastodon',
		url: `${PSS}#L172-L181`,
		lang: 'ruby',
		code: `  def postprocess_status!
    process_hashtags_service.call(@status)
    Trends.tags.register(@status)
    LinkCrawlWorker.perform_async(@status.id)
    DistributionWorker.perform_async(@status.id)
    process_email_subscriptions!
    ActivityPub::DistributionWorker.perform_async(@status.id)
    PollExpirationNotifyWorker.perform_at(@status.poll.expires_at, @status.poll.id) if @status.poll
    ActivityPub::QuoteRequestWorker.perform_async(@status.quote.id) if @status.quote&.quoted_status.present? && !@status.quote&.quoted_status&.local?
  end`,
		notes: [
			'Read the order in [`call`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/services/post_status_service.rb#L51-L78): save first, then `postprocess_status!`. Line 2 processes the hashtags inside the request. Lines 4, 5 and 7 queue the jobs for link previews, timelines and delivery.',
			'The fan-out is three lines: [`RawDistributionWorker#distribute!`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/raw_distribution_worker.rb#L25-L31) calls `DeliveryWorker.push_bulk(inboxes, limit: 1_000)`, with one set of arguments per `inbox_url`.',
			'[`DeliveryWorker`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/workers/activitypub/delivery_worker.rb#L11-L21) sets `retry: 16, dead: false`. In Sidekiq\'s `job_retry.rb` (in the sources), `dead == false` means discarded: the job never reaches the dead set.',
			'The "give up on this server" rule is [`DeliveryFailureTracker`](https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933/app/lib/delivery_failure_tracker.rb#L6-L24): it stores one entry per failing day and creates an `UnavailableDomain` at 7.'
		]
	},
	tradeoff: {
		gain: [
			'The author\'s request waits only for their own server. With 2,000 followers\' servers, it takes about as long as with 20.',
			'A server that is down retries its own delivery job, while the other servers already have the post.',
			'Workers pull from weighted queues (`push` has weight 6 in `sidekiq.yml`), and a burst of jobs waits in Redis instead of slowing the API.'
		],
		cost: [
			'No one tells the author that a server never got the post. With `dead: false`, the job is deleted after about two and a half days of retries.',
			'Followers on other servers see the post later than local ones. A server that was down sees it hours or days late.',
			'The post is saved in PostgreSQL, then the job is pushed to Redis, with no transaction around both. If the process dies between the two writes, the post exists and nothing in this code path delivers it.'
		]
	},
	task: {
		prompt: 'On your video platform, the upload request transcodes the video to four resolutions before it answers. It takes two minutes and often times out. Split it: what stays synchronous, what moves to a job, how does the user learn the result, and where do failures land?',
		hint: 'Ask: which errors can the user fix right now, and what must exist before you can say "accepted"?',
		answer: [
			'Synchronous: what the user can fix now. File type and size, the user\'s quota, the title. Then store the original file and save a video row with status `processing`.',
			'Answer **202 Accepted** with the video id. The upload is now safe even if every worker is down.',
			'Jobs: one transcode job per resolution (fan-out), so a failed 4K job does not redo the 480p one.',
			'The result reaches the user by another path: the video page polls the status, or a notification says "your video is ready".',
			'Failures: retry with a limit, then keep the job in a dead set **and** set the video to `failed`, so the user sees it. The worst outcome is a dropped job and a row stuck at `processing` forever.'
		]
	},
	quiz: [
		{
			q: 'Which is true of an asynchronous job, compared with a synchronous call?',
			options: ['The caller gets an answer before the work is done, and errors must reach someone by another path', 'The caller always gets the final result in the response, just a little later than usual', 'It is always faster from start to end, because the work runs in the background', 'It cannot fail, because the queue keeps the job until a worker finishes it'],
			answer: 0,
			why: 'An async job runs after the server has sent its answer to the caller. The caller is free sooner, but errors no longer come back in the response, so you must decide where they land.'
		},
		{
			q: 'Why does Mastodon queue one delivery job per inbox instead of one job that loops over every inbox?',
			options: ['Redis cannot store a single job that carries a long list of inboxes', 'So the posts arrive at every server in the order they were written', 'So a failing server is retried alone, without replaying or blocking delivery to the others', 'Because HTTP signatures only work when each signed request runs in its own job'],
			answer: 2,
			why: 'Sidekiq retries a failed job as a whole. With one inbox per job, one dead server only retries its own delivery, and many workers can deliver in parallel.'
		},
		{
			q: '`ActivityPub::DeliveryWorker` sets `retry: 16, dead: false`. What happens after the last retry fails?',
			options: ['The job moves to the dead set for an admin to retry', 'The job is discarded, and the author is not told', 'The post is deleted from the author\'s server', 'Sidekiq retries forever with a longer delay'],
			answer: 1,
			why: 'With `dead: false`, Sidekiq marks the job discarded instead of sending it to the dead set. For one post to one server, Mastodon accepts that loss.'
		}
	],
	recall: {
		q: 'When you publish on Mastodon, what runs inside your request, and what happens to a delivery that keeps failing?',
		a: 'The request checks and saves the post, processes hashtags and queues jobs. A delivery job is retried 16 times, then dropped because of `dead: false`, and no one tells the author.'
	},
	sources: [
		{ title: 'Mastodon, app/services/post_status_service.rb', url: `${PSS}#L51-L78` },
		{ title: 'Mastodon, app/workers/activitypub/raw_distribution_worker.rb', url: `${REPO}/app/workers/activitypub/raw_distribution_worker.rb#L25-L31` },
		{ title: 'Mastodon, app/workers/activitypub/delivery_worker.rb', url: `${REPO}/app/workers/activitypub/delivery_worker.rb#L11-L45` },
		{ title: 'Sidekiq 8.1.7, lib/sidekiq/job_retry.rb, retries exhausted', url: `${SIDEKIQ}/lib/sidekiq/job_retry.rb#L250-L273` },
		{ title: 'Sidekiq wiki, Error Handling', url: 'https://github.com/sidekiq/sidekiq/wiki/Error-Handling' }
	]
};
