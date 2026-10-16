/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'backpressure',
	part: 'Fiabilité',
	title: 'Une file qui se remplit',
	minutes: 10,
	hook: [
		'Chaque nuit à 2 h, 40 vendeurs d’une place de marché envoient leurs changements de prix et de stock par une API. Chaque changement part dans une file sous forme de tâche. Des workers prennent les tâches et les écrivent dans l’index de recherche.',
		'Pendant 30 minutes, les vendeurs envoient 5 000 tâches par seconde. Les workers en terminent 3 000. La file grossit de 2 000 tâches à chaque seconde, et un acheteur voit encore à 2 h 30 le prix de la veille.',
		'Il faut décider du sort de la 5 000e tâche dans une seconde qui n’a de place que pour 3 000. Si personne ne décide, la file grossit jusqu’à ce que le broker manque de mémoire ou de disque.'
	],
	terms: [
		{ term: 'Arriéré', def: 'Les tâches qui attendent dans la file et qu’aucun worker n’a encore prises (en anglais : backlog).' },
		{ term: 'Contre-pression', def: 'Un signal qui remonte du côté des consommateurs vers le producteur pour lui dire « envoie moins », afin que l’arriéré arrête de grossir (en anglais : backpressure).' },
		{ term: 'Publisher confirm', def: 'Un message de RabbitMQ au producteur qui dit s’il a accepté un message (`basic.ack`) ou s’il l’a refusé (`basic.nack`).' }
	],
	kata: {
		brief: [
			'Un vendeur appelle `POST /updates` avec un changement de prix ou de stock. L’API le publie dans une file RabbitMQ, en tâche d’environ 1 Ko. Dix workers écrivent chacun 300 tâches par seconde dans l’index de recherche.',
			'L’index accepte au plus 3 000 écritures par seconde, donc ajouter des workers ne sert à rien. Pendant l’import de nuit, de 2 h à 2 h 30, les vendeurs envoient 5 000 tâches par seconde. Le reste de la journée, ils en envoient 800.',
			'L’objectif : un changement arrive dans l’index au plus 15 minutes après que l’API l’a accepté. Un changement accepté par l’API ne doit jamais se perdre. Le broker a 8 Go de disque libre pour cette file.',
			'Conçois ce qui se passe pendant l’import : où les tâches attendent, quand l’API dit non, et comment les vendeurs l’apprennent.'
		],
		minutes: 10,
		checklist: [
			'Ton schéma dit combien de tâches attendent dans la file à 2 h 30 si rien n’est refusé, et combien de Go ça fait.',
			'Ton schéma dit combien de temps, au plus, une tâche attend avant qu’un worker la prenne, et compare ce temps aux 15 minutes.',
			'Ton schéma met une limite sur la file, en tâches ou en octets, et donne le nombre.',
			'Ton schéma dit ce qui arrive à la tâche qui se présente quand la file est pleine, et si le producteur le sait.',
			'Ton schéma dit comment l’API apprend que le broker a refusé une tâche, et ce que reçoit le vendeur.',
			'Ton schéma dit quand un vendeur refusé réessaie, pour que ses nouveaux essais ne tombent pas dans la même minute surchargée.',
			'Ton schéma dit combien de temps la file met à se vider après 2 h 30.'
		],
		sample: [
			'Sans limite, la file prend 2 000 tâches par seconde pendant 1 800 secondes : 3,6 millions de tâches, environ 3,6 Go. Le disque suffit. La dernière tâche attend 3,6 millions / 3 000 = 1 200 secondes, soit 20 minutes, et rate l’objectif de 15 minutes.',
			'La limite vient donc de l’objectif : 15 minutes de travail, c’est 3 000 × 900 = 2,7 millions de tâches. Tu poses sur la file une policy avec `max-length` à 2 700 000, environ 2,7 Go, sous les 8 Go libres. RabbitMQ ne compte que les tâches prêtes : celles que les workers tiennent sans les avoir acquittées restent hors de la limite.',
			'La policy met `overflow` à `reject-publish`. Le comportement par défaut supprime les tâches en tête de file : les plus vieux changements de prix acceptés disparaîtraient sans que personne le sache. Avec `reject-publish` et les publisher confirms actifs, RabbitMQ répond `basic.nack` à la nouvelle tâche, et l’API sait qu’elle n’est pas stockée.',
			'L’API attend la confirmation avant de répondre au vendeur. Sur `basic.ack`, elle renvoie `202 Accepted`. Sur `basic.nack`, elle renvoie `503 Service Unavailable` avec `Retry-After: 1800`, pour que l’essai suivant arrive après l’import. L’intégration du vendeur reçoit le 503 et attend 30 minutes avant de renvoyer ce changement.',
			'La file se remplit au bout de 2,7 millions / 2 000 = 1 350 secondes, vers 2 h 22. Pendant les 450 dernières secondes, l’API refuse 2 000 tâches par seconde, soit 900 000 tâches. Un vendeur dont l’intégration ne réessaie pas perd ces changements jusqu’à son prochain import.',
			'Après 2 h 30, il arrive 800 tâches par seconde et il en part 3 000 : la file baisse de 2 200 par seconde. Les 2,7 millions de tâches partent en 1 230 secondes environ, la file est vide vers 2 h 51. Les nouveaux essais arrivent de 2 h 52 à 3 h, à 2 000 par seconde en plus des 800 habituelles. Les workers en traitent 3 000 par seconde, donc ces 2 800 ne recréent pas d’arriéré.',
			'Ce que coûte ce schéma : de 2 h 22 à 2 h 30, les vendeurs reçoivent des erreurs et doivent réessayer. Leurs changements arrivent dans l’index environ 30 minutes plus tard que s’ils avaient été acceptés. Les 2,7 millions de tâches acceptées respectent toutes les 15 minutes.'
		]
	},
	quiz: [],
	recall: {
		q: 'Comment dimensionner la limite de la file quand les producteurs envoient 5 000 tâches par seconde, que les workers en finissent 3 000 et que l’objectif est de 15 minutes ?',
		a: 'Prends 15 minutes de capacité des workers : 3 000 × 900 = 2,7 millions de tâches. Au delà, `reject-publish` fait envoyer `basic.nack` par RabbitMQ et l’API renvoie 503 avec `Retry-After`.'
	},
	sources: [
		{ title: 'Documentation RabbitMQ : Queue Length Limit', url: 'https://github.com/rabbitmq/rabbitmq-website/blob/302cc25ab3383e80a6a32795a22d00de79b53c3c/docs/maxlength/index.md' },
		{ title: 'Amazon Builders’ Library : Avoiding insurmountable queue backlogs', url: 'https://aws.amazon.com/builders-library/avoiding-insurmountable-queue-backlogs/' },
		{ title: 'RFC 9110 : 503 Service Unavailable', url: 'https://www.rfc-editor.org/rfc/rfc9110#name-503-service-unavailable' }
	]
};
