/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'thumbnails',
	part: 'Small services',
	title: 'Image thumbnails',
	minutes: 10,
	hook: [
		'A family photo app resizes each photo inside the upload request. On a Sunday evening a father uploads 40 photos from a birthday party over a weak phone connection.',
		'Each upload waits while the server makes three sizes. Requests start to hit the 30-second timeout, the app shows "Upload failed", and he uploads the same photos again.',
		'The team wants the upload to end as soon as the bytes are stored, and the resizing to happen somewhere else.'
	],
	terms: [
		{ term: 'Presigned URL', def: 'A URL your API signs so that a phone can upload one object straight to the bucket, without having storage credentials of its own.' },
		{ term: 'Event notification', def: 'A message the storage service sends when an object is created in a bucket. Here it goes to a queue.' },
		{ term: 'Visibility timeout', def: 'In Amazon SQS, the time a received message stays hidden from other workers. If the worker does not delete it in that time, the message shows up again.' }
	],
	kata: {
		brief: [
			'Users upload **50 000 photos a day**, 4 MB each on average. Most uploads happen in the evening, and the peak is 10 times the daily average.',
			'Each photo needs three sizes: 150 px (10 KB), 600 px (60 KB) and 1 200 px (250 KB). Making all three takes 1.5 seconds of one CPU core.',
			'An upload must finish as soon as the photo is stored. The thumbnails should appear within a minute most of the time. A photo whose resizing fails must not be lost, and must get its thumbnails later.'
		],
		minutes: 10,
		checklist: [
			'Your sketch shows where the photo bytes go during an upload, and that no server resizes anything before the upload answers.',
			'Your design says what tells the resizing workers that a new photo exists.',
			'Your design gives the peak uploads per second and the number of CPU cores the workers need.',
			'Your design says what happens to a photo when a worker crashes in the middle of resizing it.',
			'Your design says what happens when the same photo is announced twice.',
			'Your design says what the app shows before the thumbnails exist.',
			'Your design gives the storage per year for originals and for thumbnails.'
		],
		sample: [
			'Numbers first. 50 000 photos a day is 0.58 per second on average, so about **6 per second at peak**. At 1.5 core seconds each, the peak needs 9 cores. Three workers with 4 cores each give 12 cores, with room for a backlog.',
			'Storage: originals are 4 MB × 50 000 = 200 GB a day, about 73 TB a year. The three sizes add 320 KB per photo: 16 GB a day, about 5.8 TB a year. Thumbnails are 8% of the bytes.',
			'Upload: the phone asks the API for a presigned PUT URL for `originals/<photoId>.jpg` and sends the bytes straight to Amazon S3. The S3 docs say a presigned URL allows an upload "without requiring another party to have AWS security credentials or permissions". The API servers never carry the 4 MB, so an upload costs them one small request.',
			'S3 sends an `ObjectCreated` event notification to an Amazon SQS queue. Workers poll the queue, read the original, write `thumbs/<photoId>/150.jpg`, `600.jpg` and `1200.jpg`, then delete the message. The S3 docs: "Typically, event notifications are delivered in seconds but can sometimes take a minute or longer." That fits the one minute in the brief most of the time.',
			'A worker that crashes never deletes the message. The queue’s visibility timeout is set to 60 seconds, well above the 1.5 seconds of work. After 60 seconds the message shows up again and another worker resizes the photo.',
			'The S3 docs also say notifications are "designed to be delivered at least once", and that retries can send duplicates. A duplicate does no harm here: a worker writes the same three keys again with the same bytes.',
			'The main choice is resizing after the upload. Its cost: for a few seconds, or a minute on a bad day, a photo exists with no thumbnails. The app shows a grey placeholder at that spot and loads the 150 px image when it exists.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what makes a photo get its thumbnails when a worker crashes halfway?',
		a: 'The worker never deleted the SQS message, so it shows up again after the 60-second visibility timeout and another worker resizes the photo.'
	},
	sources: [
		{ title: 'Amazon S3 User Guide, Amazon S3 Event Notifications', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventNotifications.html' },
		{ title: 'Amazon SQS Developer Guide, Visibility timeout', url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html' },
		{ title: 'Amazon S3 User Guide, Uploading objects with presigned URLs', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html' }
	]
};
