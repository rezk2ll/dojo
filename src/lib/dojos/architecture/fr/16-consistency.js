const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'consistency',
	part: 'Entre les services',
	title: 'La cohérence entre plusieurs stockages',
	minutes: 10,
	hook: [
		'Tu publies un post sur un serveur Mastodon. Son image a été envoyée dans le stockage objet au moment où tu l’as jointe. Le post est écrit dans Postgres. Son id part dans Redis, pour qu’un job le mette plus tard dans Elasticsearch pour la recherche. **Aucune transaction ne couvre le tout.**',
		'La plupart du temps, tout concorde. Mais un processus peut mourir entre deux de ces écritures. Ton post est alors sur ton profil et absent de la recherche. Ou une image traîne dans le stockage sans aucun post qui pointe vers elle.',
		'C’est le **problème de la double écriture** (dual write). Martin Kleppmann qualifiait déjà les doubles écritures de « très mauvaise idée » en 2015. Aujourd’hui : comment Mastodon vit avec, et les sorties classiques, chacune avec son prix.'
	],
	terms: [
		{ term: 'Double écriture (dual write)', def: 'Ton code écrit dans deux stockages l’un après l’autre, sans rien qui garantisse que les deux réussissent ou que les deux échouent.' },
		{ term: 'Copie dérivée', def: 'Des données stockées une deuxième fois, sous une forme adaptée à un autre type de lecture. Un index de recherche est une copie dérivée de la base.' },
		{ term: 'Source de vérité', def: 'Quand les copies divergent, celle qui gagne. Écris-la en premier, et reconstruis les autres copies à partir d’elle.' },
		{ term: 'Transactional outbox', def: 'Enregistre le message dans la même écriture en base que les données. Un relais séparé le lit et le publie vers le broker.' },
		{ term: 'Réconciliation', def: 'Un job qui compare les copies plus tard et répare ce qui diffère.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['post["Nouveau post"] -->|"1. image"| obj[("Stockage objet")]', 'post -->|"2. ligne"| pg[("Postgres : source de vérité")]'],
				highlight: ['post', 'pg', 'obj'],
				note: '**Deux stockages, aucune transaction commune.** Postgres garde le post. Le stockage objet garde ses fichiers. Si une écriture passe et pas l’autre, ils divergent.'
			},
			{
				add: ['post -->|"3. id du post seulement"| queue[("Set Redis : chewy:queue")]'],
				highlight: ['queue'],
				note: 'Pour la recherche, Mastodon n’écrit pas dans Elasticsearch pendant la requête. Il ajoute l’**id du post** à un set Redis. Juste l’id : le contenu sera relu plus tard depuis la source de vérité.'
			},
			{
				add: ['job["IndexingScheduler, chaque minute"] -->|"lire les ids"| queue', 'job -->|"charger les lignes actuelles"| pg', 'job -->|"importer"| es[("Elasticsearch")]', 'class es ext'],
				highlight: ['job', 'es'],
				note: 'Un job tourne **chaque minute**. Il prend un lot d’ids, charge ces lignes depuis Postgres, les envoie à Elasticsearch, et seulement ensuite retire les ids du set. La recherche est **cohérente à terme**.'
			},
			{
				add: ['repair["tootctl : search deploy, media remove-orphans"] -->|"reconstruire depuis la vérité"| es', 'repair -->|"supprimer les fichiers sans ligne"| obj'],
				highlight: ['repair'],
				note: '**Réconciliation.** `tootctl search deploy` importe depuis la base et retire les documents que la base n’a plus. `tootctl media remove-orphans` parcourt le stockage à la recherche de fichiers qu’aucun enregistrement ne possède. Les deux suivent la source de vérité.'
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
			'Les ids arrivent là via une [stratégie Chewy maison](' + MASTODON + '/lib/chewy/strategy/mastodon.rb#L12-L27) : pendant une requête, elle met de côté les ids des enregistrements modifiés, et à la fin elle les ajoute à `chewy:queue:<index>` dans Redis. Postgres et Redis restent **deux écritures**.',
			'**Importer d’abord, retirer ensuite.** Si le job meurt entre `import!` et `srem`, les ids restent dans le set et sont réimportés la minute suivante. Sans danger, car importer deux fois le même post donne le même document.',
			'Le job n’envoie aucun contenu de son cru. `import!` charge chaque id via le [scope de l’index sur `Status`](' + MASTODON + '/app/chewy/statuses_index.rb#L55), donc Elasticsearch reçoit toujours **ce que dit Postgres maintenant**, pas ce que la requête a vu.',
			'La réparation suit aussi la source de vérité. Le `clean_up!` de l’importeur porte le commentaire [« Remove documents from the index that no longer exist in the database »](' + MASTODON + '/app/lib/importer/base_importer.rb#L47-L56). Et [`remove-orphans`](' + MASTODON + '/lib/mastodon/cli/media.rb#L94-L100) prévient qu’il doit parcourir « over every single file individually », donc « it will be slow ».'
		]
	},
	tradeoff: {
		gain: [
			'**Source de vérité d’abord :** une copie gagne toujours, donc chaque divergence a une correction connue, et cette correction peut tourner encore et encore.',
			'**Des ids dans une file, le contenu lu plus tard :** un import en retard ou répété envoie quand même les données du jour, jamais un vieil instantané.',
			'**Réconciliation :** répare tout, quelle que soit la cause de l’écart. **Outbox :** données et message sont enregistrés ensemble, donc un crash ne peut pas garder l’un et perdre l’autre.'
		],
		cost: [
			'**Source de vérité d’abord :** tant que le job ou une réparation n’a pas tourné, le profil et la recherche peuvent diverger. La recherche de Mastodon a jusqu’à une minute de retard, un bon jour.',
			'**Réconciliation :** quelqu’un doit la lancer, et elle lit tout. `remove-orphans` liste chaque fichier, et certains fournisseurs de stockage facturent ces requêtes de listing.',
			'**Outbox :** un processus de plus à faire tourner, un délai, et des doublons : « The Message relay might publish a message more than once. » Il faut aussi un stockage capable de garder le message dans la même écriture que les données.'
		]
	},
	task: {
		prompt: 'Une plateforme vidéo garde chaque upload dans deux régions de stockage. Le service d’upload écrit dans les deux en parallèle. Si la deuxième région échoue, l’upload réussit quand même et le service envoie un événement « copier plus tard », puis un worker copie le fichier depuis la région saine. Maintenant, le processus crashe après la première écriture et avant cet événement. Quand est-ce que quelqu’un s’en rend compte ? Choisis une correction : compensation (annuler l’écriture qui a réussi), outbox ou réconciliation.',
		hint: 'La lecture vidéo lit toujours depuis la première région et ne bascule sur la deuxième qu’en cas d’erreur. Quand la deuxième copie sert-elle vraiment ?',
		answer: [
			'Personne ne s’en rend compte tant que la première région marche, puisque les lectures ne touchent jamais la deuxième. Le trou apparaît le jour où la première région tombe : le pire moment possible.',
			'La **compensation** (supprimer le fichier de la première région) est une mauvaise idée : l’upload a été accepté et la première copie est saine.',
			'**Outbox :** il faut un stockage qui écrive le fichier et un enregistrement « à copier » d’un seul coup. Un bucket de stockage ne te donne pas ça gratuitement. Tu pourrais écrire l’enregistrement en base d’abord, mais c’est alors ta nouvelle double écriture.',
			'**Réconciliation :** un job liste les deux régions et copie ce qui manque. Coût : un listing complet des deux buckets à chaque passage, ce qui prend du temps et peut coûter de l’argent.',
			'Copier deux fois est sans danger si le nom d’un fichier est dérivé de son contenu, ou si la copie écrase avec les mêmes octets. Rends la réparation idempotente et tu peux la lancer aussi souvent que tu veux.'
		]
	},
	quiz: [
		{
			q: 'Un service écrit une ligne dans sa base, puis publie un événement vers un broker. Qu’est-ce qui peut mal tourner qu’aucun `try/catch` dans ce code ne peut corriger ?',
			options: ['Le broker rejette le format du message', 'L’écriture en base est lente', 'Le processus meurt après l’écriture en base et avant la publication : les données existent, l’événement n’existera jamais', 'Le broker publie l’événement deux fois'],
			answer: 2,
			why: 'La gestion d’erreurs ne tourne que si le processus est vivant. Un crash entre deux écritures les laisse dépareillées. Seule une outbox (une seule écriture) ou une réconciliation plus tard comble ce trou.'
		},
		{
			q: 'L’IndexingScheduler de Mastodon importe un lot d’ids, puis les retire du set Redis. Pourquoi dans cet ordre ?',
			options: ['S’il crashe entre les deux, les ids sont toujours en file et sont réimportés, ce qui est sans danger', 'Redis refuse de retirer des ids pas encore importés', 'Retirer d’abord rendrait l’import plus rapide', 'Elasticsearch a besoin que les ids restent dans Redis pendant qu’il les indexe'],
			answer: 0,
			why: 'Retirer d’abord perdrait les ids en cas de crash, et ces posts n’atteindraient jamais la recherche. Importer d’abord ne peut causer qu’une répétition, et une répétition renvoie les mêmes données.'
		},
		{
			q: 'Elasticsearch contient un post qui n’existe plus dans le Postgres de Mastodon. Que fait l’étape de nettoyage de `tootctl search deploy` ?',
			options: ['Elle recopie le post dans Postgres', 'Elle le laisse, puisque la recherche n’est que cohérente à terme', 'Elle demande à un admin quelle copie garder', 'Elle supprime le document de l’index'],
			answer: 3,
			why: 'La base est la source de vérité. Un document qu’elle ne connaît pas est orphelin, donc c’est la copie qui le perd. On ne reconstruit jamais la vérité depuis la copie.'
		}
	],
	takeaway: 'Plusieurs écritures dans plusieurs stockages finiront par diverger. Choisis une source de vérité, écris-la en premier, et prends en charge le job qui reconstruit tout le reste à partir d’elle.',
	sources: [
		{ title: 'Martin Kleppmann, Using logs to build a solid data infrastructure (or: why dual writes are a bad idea), 2015', url: 'https://martin.kleppmann.com/2015/05/27/logs-for-data-infrastructure.html' },
		{ title: 'Chris Richardson, Pattern: Transactional outbox', url: 'https://microservices.io/patterns/data/transactional-outbox.html' },
		{ title: 'Mastodon docs, Configuring full-text search', url: 'https://docs.joinmastodon.org/admin/elasticsearch/' },
		{ title: 'Mastodon docs, Using the admin CLI (tootctl)', url: 'https://docs.joinmastodon.org/admin/tootctl/' },
		{ title: 'Mastodon, indexing_scheduler.rb', url: `${MASTODON}/app/workers/scheduler/indexing_scheduler.rb#L13-L25` }
	]
};
