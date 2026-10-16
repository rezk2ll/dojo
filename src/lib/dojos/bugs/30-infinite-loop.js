const SIDEKIQ = 'https://github.com/sidekiq/sidekiq';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'infinite-loop',
	part: 'Resources',
	title: 'A job deleted from the wrong queue',
	minutes: 10,
	hook: [
		'In Sidekiq\'s fake test mode, jobs are not sent to Redis. They wait in memory until a test runs them with `drain` or `drain_all`. A user\'s test called `Sidekiq::Worker.drain_all` and **never returned**. Each job had run once. The loop kept going with nothing left to run.',
		'The job had been pushed to a queue that was not the default queue of its worker class. The fake mode keeps every job in two hashes: one by queue name, one by worker class.'
	],
	terms: [
		{ term: 'Fake mode', def: '`Sidekiq::Testing.fake!`: pushed jobs go into in-memory arrays instead of Redis, so a test can inspect and run them.' },
		{ term: '`drain`', def: 'Runs every queued job of one worker class until none is left. `drain_all` does it for all classes.' },
		{ term: 'Exit condition', def: 'The test a loop checks before each turn, here `jobs.any?`. The loop ends only when the body makes it false.' }
	],
	bug: {
		title: 'Prevent an infinite loop when the job queue is not the worker default',
		repo: 'sidekiq/sidekiq',
		url: `${SIDEKIQ}/blob/03e7fcc128836ca1017d70c00f75c804db351061/lib/sidekiq/testing.rb#L160-L313`,
		fix: `${SIDEKIQ}/commit/cadebcf4977189b8ca534e0ccb2b304d2ac70be2`,
		lang: 'ruby',
		code: `  def push(queue, klass, job)
    jobs_by_queue[queue] << job
    jobs_by_worker[klass] << job
  end
…
  def delete_for(jid, queue, klass)
    jobs_by_queue[queue.to_s].delete_if { |job| job["jid"] == jid }
    jobs_by_worker[klass].delete_if { |job| job["jid"] == jid }
  end
…
  def queue
    self.sidekiq_options["queue"]
  end
  # Jobs queued for this worker
  def jobs
    Queues.jobs_by_worker[self.to_s]
  end
…
  def drain
    while jobs.any?
      next_job = jobs.first
      Queues.delete_for(next_job["jid"], queue, self.to_s)
      process_job(next_job)
    end
  end
…
class << self
  def jobs # :nodoc:
    Queues.jobs_by_queue.values.flatten
  end
…
  def drain_all
    while jobs.any?
      worker_classes = jobs.map { |job| job["class"] }.uniq

      worker_classes.each do |worker_class|
        worker_class.constantize.drain
      end
    end
  end`,
		lines: [22],
		diff: `         while jobs.any?
           next_job = jobs.first
-          Queues.delete_for(next_job["jid"], queue, self.to_s)
+          Queues.delete_for(next_job["jid"], next_job["queue"], self.to_s)
           process_job(next_job)`,
		notes: [
			'**Added under one name, removed under another.** The client pushes with `Queues.push(job[\'queue\'], ...)`, the queue written in the job. `drain` deletes with `queue`, the default from the worker\'s `sidekiq_options`. When the two differ, `delete_if` runs on the wrong array and removes nothing there.',
			'**Where it loops.** A worker has the default queue `"default"` and one job sits in `"critical"`. `drain` deletes it from `jobs_by_worker` (the class name is right) and runs it, so its own `while` ends. `jobs_by_queue["critical"]` still holds the job. `drain_all` reads that hash, sees one job, calls `drain` again, which finds no job for the worker and returns. That repeats forever.',
			'**The fix.** `next_job["queue"]` is the queue the job was pushed to, so the delete hits the same array as the push. Both hashes lose the job, and the exit condition of `drain_all` becomes false.',
			'**How it was found.** Issue [#3144](' + SIDEKIQ + '/issues/3144) explains it in one line: "the job is only removed from the `jobs_by_worker` hash in the Queue, and not the `jobs_by_queue` Hash, leading to `drain_all` repeatedly trying to get a worker to work on the job". The reporter got the test working by passing the job\'s own queue, and that change was merged in pull request #3152.'
		]
	},
	quiz: [
		{
			q: 'A job in queue `"critical"` belongs to a worker whose default is `"default"`. After one `drain`, where is the job still stored?',
			options: [
				'In `jobs_by_queue["critical"]` only',
				'In `jobs_by_worker["HardWorker"]` only',
				'In both hashes',
				'In neither hash'
			],
			answer: 0,
			why: '`delete_for` uses the right class name, so `jobs_by_worker` loses the job. It uses `"default"` as the queue, so the copy in `jobs_by_queue["critical"]` stays.'
		},
		{
			q: 'Why does `drain_all` never stop?',
			options: [
				'It checks `jobs_by_queue`, but `drain` reads `jobs_by_worker`',
				'The job raises, and the retry puts it back in the queue',
				'Each run of the job pushes a new copy of itself',
				'`constantize` fails, so `drain` is never called'
			],
			answer: 0,
			why: 'The loop and its body look at two different hashes. The body empties one, the condition reads the other, which still has the job.'
		},
		{
			q: 'Which test would have caught this before release?',
			options: [
				'Push a job to a queue other than the worker\'s default',
				'Push many jobs to the default queue at once',
				'Push a job with no arguments',
				'Push a job from inside another job'
			],
			answer: 0,
			why: 'With the default queue, `queue` and `job["queue"]` are equal and the bug is invisible. Only a job in another queue makes them differ.'
		}
	],
	takeaway: 'When a loop runs until a collection is empty, check that its body removes items from that same collection, with the same key they were added under.',
	sources: [
		{ title: 'sidekiq issue #3144', url: `${SIDEKIQ}/issues/3144` },
		{ title: 'sidekiq pull request #3152', url: `${SIDEKIQ}/pull/3152` }
	]
};
