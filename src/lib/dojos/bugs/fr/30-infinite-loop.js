const SIDEKIQ = 'https://github.com/sidekiq/sidekiq';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'infinite-loop',
	part: 'Les ressources',
	title: 'drain_all de Sidekiq boucle sur un job hors de sa file par défaut',
	minutes: 10,
	hook: [
		'Dans le mode de test factice de Sidekiq, les jobs ne partent pas dans Redis. Ils attendent en mémoire qu’un test les lance avec `drain` ou `drain_all`. Le test d’un utilisateur appelle `Sidekiq::Worker.drain_all` et **ne rend jamais la main**. Chaque job a tourné une fois. La boucle continue sans plus rien à lancer.',
		'Le job avait été poussé dans une file qui n’était pas la file par défaut de sa classe de worker. Le mode factice range chaque job dans deux hashs : un par nom de file, un par classe de worker.'
	],
	terms: [
		{ term: 'Mode factice', def: '`Sidekiq::Testing.fake!` : les jobs poussés vont dans des tableaux en mémoire au lieu de Redis, pour qu’un test puisse les inspecter et les lancer.' },
		{ term: '`drain`', def: 'Lance tous les jobs en attente d’une classe de worker jusqu’à ce qu’il n’en reste aucun. `drain_all` fait de même pour toutes les classes.' },
		{ term: 'Condition de sortie', def: 'Le test qu’une boucle vérifie avant chaque tour, ici `jobs.any?`. La boucle ne s’arrête que si le corps le rend faux.' }
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
			'Le client pousse avec `Queues.push(job[\'queue\'], ...)`, la file écrite dans le job. La ligne 22 supprime avec `queue`, la valeur par défaut des `sidekiq_options` du worker (ligne 12). Quand les deux diffèrent, la ligne 7 lance `delete_if` sur le mauvais tableau et n’y retire rien.',
			'Un worker a pour file par défaut `"default"` et un job attend dans `"critical"`. `drain` le supprime de `jobs_by_worker` (le nom de classe est juste) et le lance, donc son `while` de la ligne 20 s’arrête. `jobs_by_queue["critical"]` contient toujours le job. À chaque tour, la ligne 33 de `drain_all` lit ce hash et rappelle `drain`, qui ne trouve aucun job pour le worker et rend la main.',
			'Le correctif passe `next_job["queue"]` à la ligne 22, la file où le job a été poussé : la suppression touche le même tableau que l’ajout. Les deux hashs perdent le job, et `jobs.any?` dans `drain_all` renvoie faux.',
			'L’issue [#3144](' + SIDEKIQ + '/issues/3144) donne la cause : "the job is only removed from the `jobs_by_worker` hash in the Queue, and not the `jobs_by_queue` Hash, leading to `drain_all` repeatedly trying to get a worker to work on the job". L’auteur a fait passer son test en utilisant la file du job, et ce changement a été fusionné dans la pull request #3152.'
		]
	},
	quiz: [
		{
			q: 'Un job dans la file `"critical"` appartient à un worker dont la file par défaut est `"default"`. Après un `drain`, où le job est-il encore rangé ?',
			options: [
				'Dans `jobs_by_queue["critical"]` seulement',
				'Dans `jobs_by_worker["HardWorker"]` seulement',
				'Dans les deux hashs',
				'Dans aucun des deux'
			],
			answer: 0,
			why: '`delete_for` utilise le bon nom de classe, donc `jobs_by_worker` perd le job. Il utilise `"default"` comme file, donc la copie dans `jobs_by_queue["critical"]` reste.'
		},
		{
			q: 'Pourquoi `drain_all` ne s’arrête-t-il jamais ?',
			options: [
				'Il teste `jobs_by_queue`, mais `drain` lit `jobs_by_worker`',
				'Le job lève une erreur, et le retry le remet dans la file',
				'Chaque exécution du job pousse une nouvelle copie de lui',
				'`constantize` échoue, donc `drain` n’est jamais appelé'
			],
			answer: 0,
			why: 'La boucle et son corps regardent deux hashs différents. Le corps en vide un, la condition lit l’autre, qui contient toujours le job.'
		},
		{
			q: 'Quel test aurait attrapé le bug avant la sortie ?',
			options: [
				'Pousser un job dans une file autre que celle du worker',
				'Pousser beaucoup de jobs d’un coup dans la file par défaut',
				'Pousser un job sans arguments',
				'Pousser un job depuis un autre job'
			],
			answer: 0,
			why: 'Avec la file par défaut, `queue` et `job["queue"]` sont égaux et le bug ne se voit pas. Seul un job dans une autre file les fait diverger.'
		}
	],
	recall: {
		q: 'Pourquoi `drain_all` rappelait-il `drain` alors que chaque job avait déjà tourné une fois ?',
		a: '`drain` supprimait avec la file par défaut du worker au lieu de `next_job["queue"]`, donc le job restait dans `jobs_by_queue`. `drain_all` boucle tant que ce hash contient des jobs.'
	},
	sources: [
		{ title: 'sidekiq, issue #3144', url: `${SIDEKIQ}/issues/3144` },
		{ title: 'sidekiq, pull request #3152', url: `${SIDEKIQ}/pull/3152` }
	]
};
