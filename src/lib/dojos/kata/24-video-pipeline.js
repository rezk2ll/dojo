/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'video-pipeline',
	part: 'Real time',
	title: 'Video upload pipeline',
	minutes: 10,
	hook: [
		'A cooking school puts its lessons online. Teachers film a 20-minute lesson and upload the file from home in the evening.',
		'Last week a teacher’s 3 GB upload reached 90% after 18 minutes. The Wi-Fi dropped for a moment, the upload started again from 0%, and the teacher gave up for the night.',
		'Students watch on phones on the train and on TVs at home, so each lesson is needed in three sizes. The teachers ask for an upload that survives a drop, and a page that says how far along their video is.'
	],
	terms: [
		{ term: 'Multipart upload', def: 'An S3 upload sent as numbered parts. S3 joins the parts into one object when the client calls `CompleteMultipartUpload`.' },
		{ term: 'Presigned URL', def: 'A URL that carries a signature allowing one S3 operation for a limited time. A browser can use it with no AWS credentials of its own.' },
		{ term: 'Transcoding', def: 'Decoding a video and encoding it again at another resolution or bitrate. Here, ffmpeg makes three smaller versions of each original.' }
	],
	kata: {
		brief: [
			'Teachers upload 3 000 videos a day, half of them between 18:00 and 22:00. A file is 1 GB on average and 4 GB at most. Most teachers upload over home connections at about 20 Mbit/s.',
			'Each video is transcoded to 1080p, 720p and 480p. On one worker, a 20-minute video takes 8 minutes for 1080p, 5 for 720p and 3 for 480p. The three outputs together are about half the size of the original.',
			'An upload cut by a Wi-Fi drop or a closed laptop must continue from where it stopped. The teacher’s page shows the upload percent, then the progress of each quality, then "ready".',
			'Design the upload, the transcoding and the progress page. Say how many transcoding workers you run, and how long a teacher waits before students can watch.'
		],
		minutes: 10,
		checklist: [
			'Your design says whether the 4 GB file passes through your own servers, and why.',
			'Your design says how much upload a teacher loses when the Wi-Fi drops at 90%.',
			'Your design says what happens to an upload the teacher never finishes.',
			'Your design gives the number of transcoding workers, worked out from 3 000 videos and the minutes per quality.',
			'Your design says which quality is ready first, and how long after upload students can watch.',
			'Your design says where the progress percent comes from during transcoding, and how the page gets it.'
		],
		sample: [
			'The browser asks the API to start an upload. The API creates a `videos` row and an S3 multipart upload, and returns the upload id. The browser cuts the file into 64 MiB parts, so a 4 GB file is about 60 parts. For each part it asks the API for a presigned URL and sends the part straight to S3: the 4 GB never cross the app servers.',
			'The Uppy upload library works this way: its `signRequest` option is "an endpoint returning a presigned URL per operation", and it receives a `partNumber` "when uploading a part". The browser sends 3 parts at a time. At 20 Mbit/s a 1 GB file takes about 7 minutes and a 4 GB file about 27.',
			'When the Wi-Fi drops, only the 3 parts in flight are lost, at most about 200 MB, so about 80 seconds of upload. The browser keeps the upload id in local storage, asks the API which parts S3 already has (the list parts operation), and sends the rest. The S3 docs: an upload with "the same part number as a previously uploaded part" overwrites it, so a retried part is safe.',
			'The S3 docs say an unfinished multipart upload has "no expiry", and its parts are billed until it is completed or stopped. A bucket lifecycle rule with `AbortIncompleteMultipartUpload` after 7 days deletes uploads the teacher abandoned.',
			'When the last part is in, the API calls `CompleteMultipartUpload` and inserts three transcoding jobs. One video costs 8 + 5 + 3 = 16 worker-minutes, so 3 000 videos cost 48 000 worker-minutes a day. Spread over 1 440 minutes, that keeps 34 workers busy all day; the sample runs 40, which finish a day’s work in 20 hours.',
			'The evening is the hard part: 1 500 videos in 4 hours. Workers take 480p jobs before the others. 1 500 videos times 3 minutes is 4 500 worker-minutes in 240 minutes, so 19 of the 40 workers keep up with 480p. Students can watch in 480p a few minutes after the upload ends, and 1080p for evening uploads arrives during the night.',
			'Each worker runs `ffmpeg -progress pipe:1`. ffmpeg then writes `key=value` lines every half second by default (`-stats_period`), [one of them `out_time_us`](https://github.com/FFmpeg/FFmpeg/blob/2d49d0e62438507f40409a4d5ca978563202dcf3/fftools/ffmpeg.c#L687-L696). The worker divides `out_time_us` by the video length and writes the percent to the `videos` row every 5 seconds. The teacher’s page reads that row every 5 seconds; during the upload, the browser counts the bytes it sent itself.',
			'What this design gives up: a worker that crashes 7 minutes into a 1080p encode starts it again from zero. Originals take 3 TB a day; kept 30 days, that is 90 TB. The outputs add 1.5 TB a day, about 550 TB a year, and none of it is ever deleted.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, how much upload does a teacher lose when the Wi-Fi drops, and why not more?',
		a: 'At most the 3 parts of 64 MiB in flight, about 200 MB. The file goes to S3 as a multipart upload, so the browser asks which parts S3 already has and sends only the rest.'
	},
	sources: [
		{ title: 'Amazon S3 docs: Uploading and copying objects using multipart upload', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html' },
		{ title: 'Uppy docs: AWS S3 plugin, presigned URLs per part', url: 'https://uppy.io/docs/aws-s3/' },
		{ title: 'ffmpeg docs: the -progress and -stats_period options', url: 'https://ffmpeg.org/ffmpeg.html' }
	]
};
