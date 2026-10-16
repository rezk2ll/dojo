/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'ride-matching',
	part: 'Real time',
	title: 'Matching riders and drivers',
	minutes: 10,
	hook: [
		'Friday, 2 a.m., the bars in the city centre close. 400 people open the ride app within ten minutes, and each one wants the closest car.',
		'Last month two riders on the same street were sent the same driver. One of them waited 12 minutes for a car that had already left with the other rider.',
		'The ops lead asks for two things: the nearest free driver gets the offer, and a driver never holds two offers at once.'
	],
	terms: [
		{ term: 'Geospatial index', def: 'A structure that answers "which points lie within 3 km of here?" without reading every point. Redis stores one as a sorted set, filled with `GEOADD`.' },
		{ term: 'Lock with expiry', def: 'A key that only one process can create, and that deletes itself after a set time. In Redis: `SET key value NX EX 15`.' },
		{ term: 'Stale position', def: 'The last position a driver sent before their app stopped reporting. The driver may be far away, or offline.' }
	],
	kata: {
		brief: [
			'One city has 30 000 drivers online at peak. Each driver’s app sends its position every 5 seconds, about 100 bytes. At peak, riders send 500 ride requests per minute.',
			'A rider must get the nearest free driver within 2 seconds of tapping Request. The driver then has 15 seconds to accept, or the offer goes to the next driver. A driver never holds two offers at the same time.',
			'A driver whose app stops sending for 15 seconds, because of a tunnel or a dead battery, must not get offers. Your load test showed one Redis instance handles 50 000 simple commands per second.',
			'Design how positions are stored, how a request finds a driver, and how two requests at the same second are kept from getting the same driver.'
		],
		minutes: 10,
		checklist: [
			'Your design gives the number of position updates per second, worked out from 30 000 drivers and 5 seconds.',
			'Your design says where positions are stored, and what is lost if that store restarts.',
			'Your design says how a request finds nearby free drivers without reading all 30 000 positions.',
			'Your design says what stops two requests in the same second from offering the same driver.',
			'Your design says what happens to an offer the driver ignores for 15 seconds.',
			'Your design says how a driver whose phone died 2 minutes ago stops getting offers.'
		],
		sample: [
			'30 000 drivers every 5 seconds is 6 000 position updates per second, about 600 KB per second coming in. Stateless location servers take the updates. For a free driver, each update runs `GEOADD drivers:free <lon> <lat> driver:42` and `ZADD drivers:seen <unix time> driver:42`. Two commands per update make 12 000 Redis commands per second, a quarter of what the load test showed.',
			'A ride request runs `GEOSEARCH drivers:free FROMLONLAT <lon> <lat> BYRADIUS 3 km ASC COUNT 5 WITHDIST`. The docs: `ASC` sorts "nearest first", and `COUNT` returns "at most count matches". Redis reads only the drivers in the grid around the circle, so the cost depends on the drivers near the rider. 500 requests a minute is about 8 per second.',
			'Two requests 100 ms apart can both get `driver:42` first. Before sending an offer, the matcher runs `SET offer:driver:42 <ride id> NX EX 15`. `NX` sets the key only "if it does not already exist", so only one matcher succeeds. The other gets a nil reply and tries the next of its 5 drivers.',
			'`EX 15` deletes the key after 15 seconds, which is the time the driver has to accept. A driver who ignores the offer can get a new one after that, with no cleanup job. When the driver accepts, the trip is written to PostgreSQL and `ZREM drivers:free driver:42` takes them out of the search.',
			'`GEOADD` has no expiry option, so a driver whose phone died stays in `drivers:free` at their last position. A sweeper runs every 5 seconds. It reads from `drivers:seen` the drivers whose score is more than 15 seconds old and removes them from both sets with `ZREM`.',
			'Positions live only in Redis memory. If Redis restarts, `drivers:free` is empty, and every free driver is back within 5 seconds, at their next update. The sample accepts 5 seconds with no matches, in return for not writing 6 000 rows per second to a database.',
			'The distance is a straight line, because Redis knows coordinates and no roads. A driver 800 m away across a river with no bridge can beat a driver 1.2 km away on the same street. A fix is to ask a routing service for the driving time to the 5 candidates, which adds one call per request.',
			'A position is up to 5 seconds old. At 50 km/h a car moves about 70 m in 5 seconds, so the nearest driver on the map may be 70 m from where Redis has them.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, what stops two requests in the same second from offering the same driver?',
		a: 'The matcher runs `SET offer:driver:<id> <ride id> NX EX 15` before sending an offer. Only one `SET` succeeds; the other matcher moves to its next driver, and the key expires after 15 seconds.'
	},
	sources: [
		{ title: 'Redis docs: GEOSEARCH', url: 'https://redis.io/docs/latest/commands/geosearch/' },
		{ title: 'Redis docs: GEOADD (the index is a sorted set, removed with ZREM)', url: 'https://redis.io/docs/latest/commands/geoadd/' },
		{ title: 'Redis docs: SET with NX and EX', url: 'https://redis.io/docs/latest/commands/set/' }
	]
};
