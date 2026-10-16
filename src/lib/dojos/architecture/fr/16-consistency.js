const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'consistency',
	part: 'Entre les services',
	title: 'La cohérence entre plusieurs stockages',
	minutes: 10,
	hook: [
		'Tu publies un post sur un serveur Mastodon. Son image est partie dans le stockage objet quand tu l’as jointe. Le post est écrit dans Postgres. Son id part dans Redis, pour qu’un job mette plus tard le post dans Elasticsearch pour la recherche. **Aucune transaction ne couvre toutes ces écritures.**',
		'La plupart du temps, les trois stockages concordent. Mais un processus peut mourir entre deux de ces écritures. Ton post est alors sur ton profil et absent de la recherche. Ou une image reste dans le stockage sans aucun post qui pointe vers elle.',
		'Écrire dans deux stockages sans rien autour des deux écritures, ça s’appelle une **double écriture** (dual write). Martin Kleppmann qualifiait les doubles écritures de « très mauvaise idée » en 2015. Mastodon écrit d’abord dans Postgres et répare les autres stockages à partir de lui, et tu verras aussi l’outbox et la réconciliation.'
	],
	terms: [
		{ term: 'Double écriture (dual write)', def: 'Ton code écrit dans deux stockages l’un après l’autre, sans rien qui garantisse que les deux réussissent ou que les deux échouent.' },
		{ term: 'Source de vérité', def: 'Le stockage dont tu gardes les données quand les copies divergent. Tu l’écris en premier et tu reconstruis les autres copies à partir de lui.' },
		{ term: 'Transactional outbox', def: 'Enregistre le message dans la même écriture en base que les données. Un relais séparé le lit et le publie vers le broker.' },
		{ term: 'Réconciliation', def: 'Un job qui compare les copies plus tard et répare ce qui diffère.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["Nouveau post"] -->|"1. image"| obj[("Stockage objet")]', 'post -->|"2. ligne"| pg[("Postgres : source de vérité")]'],
				highlight: ['post', 'pg', 'obj'],
				note: 'Postgres garde le post et le stockage objet garde ses fichiers, sans transaction commune. Si une écriture passe et pas l’autre, les deux stockages divergent.'
			},
			{
				add: ['post -->|"3. id du post seulement"| queue[("Set Redis : chewy:queue")]'],
				highlight: ['queue'],
				note: 'Pour la recherche, Mastodon n’écrit pas dans Elasticsearch pendant la requête. Il ajoute l’**id du post** à un set Redis. Le job relira le contenu dans Postgres plus tard.'
			},
			{
				add: ['job["IndexingScheduler, chaque minute"] -->|"lire les ids"| queue', 'job -->|"charger les lignes actuelles"| pg', 'job -->|"importer"| es[("Elasticsearch")]', 'class es ext'],
				highlight: ['job', 'es'],
				note: 'Un job tourne **chaque minute**. Il prend un lot d’ids, charge ces lignes depuis Postgres, les envoie à Elasticsearch, et seulement ensuite retire les ids du set. La recherche peut donc avoir jusqu’à cette minute de retard sur Postgres.'
			},
			{
				add: ['repair["tootctl : search deploy, media remove-orphans"] -->|"reconstruire depuis la vérité"| es', 'repair -->|"supprimer les fichiers sans ligne"| obj'],
				highlight: ['repair'],
				note: 'Deux commandes réconcilient les stockages avec Postgres. `tootctl search deploy` importe depuis la base et retire les documents que la base n’a plus. `tootctl media remove-orphans` supprime les fichiers stockés vers lesquels aucun enregistrement ne pointe.'
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
			'La ligne 6 lit les ids dans `chewy:queue:<index>`. Ils y arrivent via une [stratégie Chewy maison](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L12-L27) : pendant une requête, elle met de côté les ids des enregistrements modifiés, puis les ajoute au set Redis à la fin. Postgres et Redis restent **deux écritures**.',
			'La ligne 7 importe et la ligne 9 retire, dans cet ordre. Si le job meurt entre `import!` et `srem`, les ids restent dans le set et sont réimportés la minute suivante. Importer deux fois le même post donne le même document, donc la répétition ne casse rien.',
			'La ligne 7 n’envoie aucun contenu à elle. `import!` charge chaque id via le [scope de l’index sur `Status`](' + MASTODON + '/app/chewy/statuses_index.rb#L55), donc Elasticsearch reçoit **ce que Postgres contient au moment de l’import**, pas ce que la requête a vu.',
			'Les commandes de réparation lisent elles aussi Postgres. Le `clean_up!` de l’importeur porte le commentaire « Remove documents from the index that no longer exist in the database » (dans les sources). [`remove-orphans`](' + MASTODON + '/lib/mastodon/cli/media.rb#L94-L100) prévient qu’il doit parcourir « over every single file individually », donc « it will be slow ».'
		]
	},
	tradeoff: {
		gain: [
			'Avec Postgres comme source de vérité, chaque divergence a une correction connue : recopier depuis Postgres. Tu peux relancer cette correction autant de fois que tu veux.',
			'La file contient des ids et le job lit le contenu plus tard, donc un import en retard ou répété envoie la ligne actuelle, jamais un vieil instantané.',
			'Un job de réconciliation compare les copies et répare un écart, quelle qu’en soit la cause. Une outbox enregistre données et message en une seule écriture, donc un crash ne peut pas garder l’un et perdre l’autre.'
		],
		cost: [
			'Tant que le job ou une réparation n’a pas tourné, le profil et la recherche peuvent diverger. La recherche de Mastodon a jusqu’à une minute de retard quand le job tourne à l’heure.',
			'Quelqu’un doit lancer la réconciliation, et elle lit tout. `remove-orphans` liste chaque fichier, et certains fournisseurs de stockage facturent ces requêtes de listing.',
			'Une outbox ajoute un processus relais, un délai et des doublons : « The Message relay might publish a message more than once. » Il te faut aussi un stockage capable de garder le message dans la même écriture que les données.'
		]
	},
	task: {
		prompt: 'Une plateforme vidéo garde chaque upload dans deux régions de stockage. Le service d’upload écrit dans les deux en parallèle. Si la deuxième région échoue, l’upload réussit quand même et le service envoie un événement « copier plus tard », puis un worker copie le fichier depuis la région saine. Maintenant, le processus crashe après la première écriture et avant cet événement. Quand est-ce que quelqu’un s’en rend compte ? Choisis une correction : compensation (annuler l’écriture qui a réussi), outbox ou réconciliation.',
		hint: 'La lecture vidéo lit toujours depuis la première région et ne bascule sur la deuxième qu’en cas d’erreur. Quand la deuxième copie sert-elle vraiment ?',
		answer: [
			'Personne ne s’en rend compte tant que la première région marche, puisque les lectures ne touchent jamais la deuxième. La copie manquante se voit le jour où la première région tombe, c’est-à-dire le seul jour où on en a besoin.',
			'Compensation (supprimer le fichier de la première région) : mauvais choix, car l’upload a été accepté et la première copie est saine.',
			'Outbox : il faut un stockage qui écrive le fichier et un enregistrement « à copier » d’un seul coup. Un bucket de stockage ne le permet pas. Tu pourrais écrire l’enregistrement en base d’abord, mais la base et le bucket forment alors une nouvelle double écriture.',
			'Réconciliation : un job liste les deux régions et copie ce qui manque. Chaque passage liste les deux buckets en entier, ce qui prend du temps et peut coûter de l’argent.',
			'Copier deux fois ne pose aucun problème si le nom d’un fichier vient de son contenu, ou si la copie écrase avec les mêmes octets. Avec une réparation idempotente, tu peux la lancer aussi souvent que tu veux.'
		]
	},
	quiz: [
		{
			q: 'Un service écrit une ligne dans sa base, puis publie un événement vers un broker. Qu’est-ce qui peut mal tourner qu’aucun `try/catch` dans ce code ne peut corriger ?',
			options: ['Le broker rejette le format du message et renvoie une erreur au service', 'L’écriture en base est lente, donc la publication expire après le commit', 'Le processus meurt après l’écriture et avant la publication, donc l’événement ne part jamais', 'Le broker publie l’événement deux fois, et les consommateurs voient un doublon'],
			answer: 2,
			why: 'Un bloc `catch` ne tourne que si le processus est vivant. Un crash entre les deux écritures laisse la ligne enregistrée et l’événement jamais envoyé. Seule une outbox (une seule écriture) ou une réconciliation plus tard comble ce trou.'
		},
		{
			q: 'L’IndexingScheduler de Mastodon importe un lot d’ids, puis les retire du set Redis. Pourquoi dans cet ordre ?',
			options: ['S’il crashe entre les deux, les ids restent en file et sont réimportés, ce qui est sans danger', 'Redis refuse de retirer des ids du set tant qu’ils n’ont pas été importés', 'Retirer d’abord bloquerait l’import jusqu’à ce que Redis confirme la suppression', 'Elasticsearch a besoin que les ids restent dans Redis pendant qu’il indexe le lot'],
			answer: 0,
			why: 'Retirer d’abord perdrait les ids en cas de crash, et ces posts n’arriveraient jamais dans la recherche. Importer d’abord ne peut causer qu’une répétition, et une répétition renvoie les mêmes données.'
		},
		{
			q: 'Elasticsearch contient un post qui n’existe plus dans le Postgres de Mastodon. Que fait l’étape de nettoyage de `tootctl search deploy` ?',
			options: ['Elle recopie le post dans Postgres', 'Elle le laisse, puisque la recherche n’est que cohérente à terme', 'Elle demande à un admin quelle copie garder', 'Elle supprime le document de l’index'],
			answer: 3,
			why: '`clean_up!` traite Postgres comme la source de vérité : il supprime chaque document de l’index dont Postgres n’a plus la ligne, et rien ne recopie jamais d’Elasticsearch vers Postgres.'
		}
	],
	recall: {
		q: 'Chez Mastodon, quel stockage est la source de vérité, et comment Elasticsearch et le stockage objet sont-ils réparés à partir de lui ?',
		a: 'Postgres. `tootctl search deploy` réimporte les lignes et supprime les documents que Postgres n’a plus, et `tootctl media remove-orphans` supprime les fichiers vers lesquels aucun enregistrement ne pointe.'
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
