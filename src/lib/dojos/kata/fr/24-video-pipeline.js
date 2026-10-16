/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'video-pipeline',
	part: 'Temps réel',
	title: 'Une chaîne d’envoi de vidéos',
	minutes: 10,
	hook: [
		'Une école de cuisine met ses cours en ligne. Les profs filment une leçon de 20 minutes et envoient le fichier depuis chez eux, le soir.',
		'La semaine dernière, l’envoi de 3 Go d’une prof a atteint 90 % au bout de 18 minutes. Le Wi-Fi a coupé un instant, l’envoi est reparti de 0 %, et elle a abandonné pour la soirée.',
		'Les élèves regardent sur leur téléphone dans le train et sur la télé à la maison, donc chaque leçon doit exister en trois tailles. Les profs demandent un envoi qui survit à une coupure, et une page qui dit où en est leur vidéo.'
	],
	terms: [
		{ term: 'Multipart upload', def: 'Un envoi S3 en parties numérotées. S3 assemble les parties en un seul objet quand le client appelle `CompleteMultipartUpload`.' },
		{ term: 'URL présignée', def: 'Une URL qui porte une signature autorisant une opération S3 pendant un temps limité. Un navigateur peut s’en servir sans avoir d’identifiants AWS.' },
		{ term: 'Transcodage', def: 'Décoder une vidéo puis l’encoder à nouveau dans une autre résolution ou un autre débit. Ici, ffmpeg tire trois versions plus légères de chaque original.' }
	],
	kata: {
		brief: [
			'Les profs envoient 3 000 vidéos par jour, dont la moitié entre 18 h et 22 h. Un fichier fait 1 Go en moyenne et 4 Go au plus. La plupart envoient depuis une connexion domestique à environ 20 Mbit/s.',
			'Chaque vidéo est transcodée en 1080p, 720p et 480p. Sur un worker, une vidéo de 20 minutes prend 8 minutes en 1080p, 5 en 720p et 3 en 480p. Les trois sorties pèsent ensemble environ la moitié de l’original.',
			'Un envoi coupé par le Wi-Fi ou par un portable refermé doit reprendre là où il s’est arrêté. La page du prof montre le pourcentage envoyé, puis l’avancement de chaque qualité, puis « prête ».',
			'Conçois l’envoi, le transcodage et la page d’avancement. Dis combien de workers de transcodage tu fais tourner, et combien de temps le prof attend avant que les élèves puissent regarder.'
		],
		minutes: 10,
		checklist: [
			'Ton design dit si le fichier de 4 Go passe par tes propres serveurs, et pourquoi.',
			'Ton design dit combien d’envoi le prof perd quand le Wi-Fi coupe à 90 %.',
			'Ton design dit ce qui arrive à un envoi que le prof ne termine jamais.',
			'Ton design donne le nombre de workers de transcodage, calculé à partir de 3 000 vidéos et des minutes par qualité.',
			'Ton design dit quelle qualité est prête en premier, et combien de temps après l’envoi les élèves peuvent regarder.',
			'Ton design dit d’où vient le pourcentage pendant le transcodage, et comment la page le récupère.'
		],
		sample: [
			'Le navigateur demande à l’API de démarrer un envoi. L’API crée une ligne `videos` et un multipart upload S3, puis renvoie l’id de l’envoi. Le navigateur découpe le fichier en parties de 64 Mio : un fichier de 4 Go fait environ 60 parties. Pour chaque partie, il demande une URL présignée à l’API et envoie la partie directement à S3, sans que les 4 Go passent par les serveurs de l’appli.',
			'La bibliothèque d’envoi Uppy fonctionne ainsi : son option `signRequest` attend "an endpoint returning a presigned URL per operation", et reçoit un `partNumber` "when uploading a part". Le navigateur envoie 3 parties à la fois. À 20 Mbit/s, un fichier de 1 Go part en 7 minutes environ, et un fichier de 4 Go en 27.',
			'Quand le Wi-Fi coupe, seules les 3 parties en cours sont perdues, au plus 200 Mo environ, soit à peu près 80 secondes d’envoi. Le navigateur garde l’id de l’envoi dans le stockage local, demande à l’API quelles parties S3 a déjà (l’opération list parts) et envoie le reste. La doc S3 : un envoi avec "the same part number as a previously uploaded part" écrase l’ancienne partie, donc renvoyer une partie ne casse rien.',
			'La doc S3 indique qu’un multipart upload non terminé n’a "no expiry", et que ses parties sont facturées tant qu’il n’est ni terminé ni arrêté. Une règle de cycle de vie du bucket avec `AbortIncompleteMultipartUpload` à 7 jours supprime les envois abandonnés.',
			'Quand la dernière partie est arrivée, l’API appelle `CompleteMultipartUpload` et insère trois tâches de transcodage. Une vidéo coûte 8 + 5 + 3 = 16 minutes de worker, donc 3 000 vidéos coûtent 48 000 minutes de worker par jour. Réparties sur 1 440 minutes, elles occupent 34 workers toute la journée ; la réponse en fait tourner 40, qui finissent le travail d’une journée en 20 heures.',
			'Le soir est le moment difficile : 1 500 vidéos en 4 heures. Les workers prennent les tâches 480p avant les autres. 1 500 vidéos fois 3 minutes, cela fait 4 500 minutes de worker en 240 minutes : 19 des 40 workers suffisent pour suivre le rythme en 480p. Les élèves peuvent regarder en 480p quelques minutes après la fin de l’envoi, et le 1080p des envois du soir arrive pendant la nuit.',
			'Chaque worker lance `ffmpeg -progress pipe:1`. ffmpeg écrit alors des lignes `key=value` toutes les demi-secondes par défaut (`-stats_period`), [dont une ligne `out_time_us`](https://github.com/FFmpeg/FFmpeg/blob/2d49d0e62438507f40409a4d5ca978563202dcf3/fftools/ffmpeg.c#L687-L696). Le worker divise `out_time_us` par la durée de la vidéo et écrit le pourcentage dans la ligne `videos` toutes les 5 secondes. La page du prof relit cette ligne toutes les 5 secondes ; pendant l’envoi, c’est le navigateur qui compte lui-même les octets envoyés.',
			'Ce que ce design sacrifie : un worker qui plante après 7 minutes d’encodage 1080p recommence à zéro. Les originaux prennent 3 To par jour, soit 90 To si tu les gardes 30 jours. Les sorties ajoutent 1,5 To par jour, environ 550 To par an, et rien n’en est jamais supprimé.'
		]
	},
	quiz: [],
	recall: {
		q: 'Dans la réponse, combien d’envoi le prof perd-il quand le Wi-Fi coupe, et pourquoi pas plus ?',
		a: 'Au plus les 3 parties de 64 Mio en cours, environ 200 Mo. Le fichier part vers S3 en multipart upload : le navigateur demande quelles parties S3 a déjà et n’envoie que le reste.'
	},
	sources: [
		{ title: 'Doc Amazon S3 : envoyer et copier des objets en multipart upload', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html' },
		{ title: 'Doc Uppy : le plugin AWS S3, une URL présignée par partie', url: 'https://uppy.io/docs/aws-s3/' },
		{ title: 'Doc ffmpeg : les options -progress et -stats_period', url: 'https://ffmpeg.org/ffmpeg.html' }
	]
};
