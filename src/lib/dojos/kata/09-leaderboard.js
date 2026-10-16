/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'leaderboard',
	part: 'Data',
	title: 'A game leaderboard',
	minutes: 10,
	hook: [
		'Lina finishes a round of a puzzle game on her phone. The end screen shows the top 100 players of the season, and under it: "You are #1 204 387". She plays again to climb.',
		'The first version ran `SELECT count(*) FROM scores WHERE best > $1` for that line. With 5 million rows, each end screen counted up to 5 million rows, and the screen took 4 seconds at peak.',
		'You design the leaderboard so both answers come back in under 100 ms.'
	],
	terms: [
		{ term: 'Sorted set', def: 'A Redis type that keeps unique members ordered by a numeric score, with each lookup in O(log N).' },
		{ term: 'Rank', def: 'A player’s position on the board, counted from 1 for the best score.' },
		{ term: 'Tie-break', def: 'The rule that orders two players with the same points, here the one who reached them first.' }
	],
	kata: {
		brief: [
			'A mobile game has 5 million players in the current season. A season lasts 30 days. Scores go from 0 to 10 million points, and the board ranks each player by their best score of the season.',
			'Players finish 20 million games a day, with a peak at 3 times the average. Each finished game sends one score. The end screen opens 10 million times a day and shows the top 100 plus the player’s own rank.',
			'Both answers must come back in under 100 ms. When two players have the same best score, the one who reached it first ranks higher.'
		],
		minutes: 10,
		checklist: [
			'Your design says which structure returns a rank without counting millions of rows.',
			'Your design gives the command or query for the top 100, and its cost for 5 million players.',
			'Your design gives the command or query for the rank of a player in position 3 000 000.',
			'Your design says how two players with the same points are ordered.',
			'Your design says what happens when a new score is lower than the player’s best.',
			'Your design estimates the memory for 5 million players.',
			'Your design says how the board comes back if the machine that holds it is lost.'
		],
		sample: [
			'20 million games a day is about 230 scores per second on average and about 700 at peak. 10 million end screens a day is about 350 per second at peak, each needing two reads.',
			'The board is one Redis sorted set, `lb:season-12`, with the player id as member and the best score as score. A finished game runs `ZADD lb:season-12 GT <score> player:<id>`. The Redis docs: GT "Only update an existing member if the new score is greater than the current score". A lower score therefore changes nothing.',
			'The top 100 is `ZRANGE lb:season-12 0 99 REV WITHSCORES`, which the docs list as O(log(N)+M) with M the 100 members returned. The player’s rank is `ZREVRANK lb:season-12 player:<id>` plus 1, in O(log(N)). log2 of 5 million is about 22, so both reads cost the same for the player at #3 and at #3 000 000.',
			'Redis orders members with the same score by their bytes, which says nothing about who came first. So the score packs the tie-break in: points × 100 000 000 + (99 999 999 − seconds since the season started). At equal points, an earlier time gives a higher score. The largest value is about 10^15, below the 2^53 limit up to which, per the docs, a Redis score "precisely represents integers".',
			'A test with Redis 7.4 measured `MEMORY USAGE` at about 111 bytes per member for 1 million members with 14-byte ids. 5 million players then take about 560 MB, which fits on one Redis instance with one replica.',
			'Redis holds a copy: every score is also written to a PostgreSQL `scores` table, which stays the source of truth. If both Redis machines are lost, a job reads the 5 million best scores and sends them back with `ZADD` in batches. The board shows stale ranks until that job ends.',
			'The cost of this design: the whole board must fit in the memory of one machine, and each new board (per week, per country, among friends) is one more sorted set to write on every game. A player’s rank also changes with every score sent by the others, so two end screens a second apart can show different ranks.'
		]
	},
	quiz: [],
	recall: {
		q: 'In the sample, which Redis commands give the top 100 and a player’s rank, and how does their cost grow with 5 million players?',
		a: '`ZRANGE lb:season-12 0 99 REV WITHSCORES` and `ZREVRANK lb:season-12 player:<id>`. Both are O(log N), about 22 for 5 million members, so rank 3 000 000 costs the same as rank 3.'
	},
	sources: [
		{ title: 'Redis docs: ZADD', url: 'https://redis.io/docs/latest/commands/zadd/' },
		{ title: 'Redis docs: ZRANGE', url: 'https://redis.io/docs/latest/commands/zrange/' },
		{ title: 'Redis docs: ZREVRANK', url: 'https://redis.io/docs/latest/commands/zrevrank/' }
	]
};
