const ORDER = 'https://www.sec.gov/files/litigation/admin/2013/34-70694.pdf';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'knight-capital-2012',
	part: 'Changes and config',
	title: 'Knight Capital 2012: the old code left on one of eight servers',
	minutes: 10,
	hook: [
		'Wednesday 1 August 2012, Jersey City. You work in technology at Knight Capital, a broker that handles about 10% of all trading in listed US stocks. Today the New York Stock Exchange starts its Retail Liquidity Program (RLP).',
		'Since 27 July, Knight has deployed new RLP code to SMARS, its order router, a few servers at a time. SMARS has eight servers.',
		'At about 8:01 a.m. ET, an internal system starts sending automated emails to a group of Knight staff. They are "BNET rejects" that reference SMARS and show the error "Power Peg disabled".'
	],
	terms: [
		{ term: 'SMARS', def: 'Knight\'s automated, high speed order router. It takes orders from other Knight systems and sends orders to exchanges and other trading venues.' },
		{ term: 'Parent and child orders', def: 'SMARS receives a "parent" order from another Knight system. It sends one or more "child" orders to venues, as needed based on the available liquidity.' },
		{ term: 'Power Peg', def: 'An old SMARS function that Knight stopped using in 2003. Its code stayed on the servers and could still be called.' },
		{ term: 'PMON', def: 'Knight\'s main risk monitoring tool. It shows positions after trades execute, and a person has to watch it: it sends no automated alerts.' }
	],
	incident: {
		org: 'Knight Capital Americas LLC',
		title: 'In the Matter of Knight Capital Americas LLC',
		date: '2012-08-01',
		url: ORDER,
		steps: [
			{
				situation: [
					'The BNET reject emails keep arriving, in real time, all through the pre-market. They come from orders eligible for the RLP that were meant for pre-market trading.',
					'Knight did not design these emails as alerts, and staff usually do not read them. The market opens at 9:30.'
				],
				q: 'What do you do with the emails before 9:30?',
				options: [
					'Nothing: they are not alerts, and nobody acts on them',
					'Find out why SMARS mentions Power Peg on the day of the RLP launch',
					'Ask the email team to filter them out of the group inbox',
					'Forward them to the NYSE, since the RLP is their program'
				],
				answer: 1,
				why: 'The system sent 97 of these emails before the open. The SEC: they "were caused by the code deployment failure, and provided Knight with a potential opportunity to identify and fix the coding issue prior to the market open." They were not acted on before the open.'
			},
			{
				situation: [
					'9:30 a.m., the market opens. Senior staff see a large volume of positions building up in the 33 Account on PMON. That account has a $2 million gross position limit.',
					'The 33 Account holds positions from several sources, so nobody can quickly tell where these come from. SMARS is still sending orders.'
				],
				q: 'What do you do?',
				options: [
					'Keep watching PMON until the source of the positions is clear',
					'Raise the 33 Account limit so that trading can go on',
					'Disconnect SMARS from the market while you look for the cause',
					'Ask the exchanges to cancel the trades in the 33 Account'
				],
				answer: 2,
				why: 'Knight "remained connected to the markets and continued to send orders" while its technology staff looked for the cause. The SEC found Knight "needed clear guidance for its technology personnel as to when to disconnect a malfunctioning system from the market."'
			},
			{
				situation: [
					'The technology team works on SMARS in live trading, and the router keeps sending child orders. Since 27 July, the SMARS servers have received the new RLP code.',
					'The team plans to remove the new RLP code from SMARS.'
				],
				q: 'What do you check before you remove it?',
				options: [
					'Nothing: remove it from all eight servers right away',
					'Which servers run it, and what old code reads the RLP flag',
					'That the NYSE has paused the RLP for the day',
					'That PMON shows the 33 Account getting smaller'
				],
				answer: 1,
				why: 'Knight "uninstalled the new RLP code from the seven servers where it had been deployed correctly." Orders with the RLP flag then started the Power Peg code still present on those seven servers too. The eighth server had never received the new code.'
			},
			{
				situation: [
					'After about 45 minutes, Knight stops sending the orders. 212 parent orders turned into more than 4 million executions in 154 stocks.',
					'SMARS had a price control: it capped child orders at 9.5% beyond the National Best Bid or Offer. It did not apply to orders received before the open for the opening auction, which these 212 were.'
				],
				q: 'Which control would have stopped the orders, whatever the bug?',
				options: [
					'A tighter price cap in SMARS, at 5% instead of 9.5%',
					'More staff watching PMON during the market open',
					'A second technician checking each deployment',
					'A firm-wide capital limit that blocks new orders automatically'
				],
				answer: 3,
				why: 'The SEC found Knight had no "pre-set capital thresholds in the aggregate for the firm that were linked to automated controls that would prevent the entry of orders". A second technician could have caught this missed server, but not a different bug. PMON relied on people and could not block orders.'
			}
		],
		outcome: [
			'A technician did not copy the new RLP code to one of the eight SMARS servers, and nobody reviewed the deployment. The new code reused a flag that once switched on Power Peg. On the eighth server, orders with that flag ran the old Power Peg code instead of the RLP code.',
			'In 2005, Knight had moved the function that counts executed shares to an earlier point in the SMARS code, and it never retested Power Peg. So Power Peg sent child orders without regard to the shares already executed. Another Knight system saw that the parent orders were filled, but SMARS never got that information.',
			'In about 45 minutes, SMARS sent millions of child orders for 212 parent orders: over 4 million executions and more than 397 million shares. Knight ended with a net long position of about $3.5 billion and a net short position of about $3.15 billion, and lost more than $460 million.',
			'The SEC found that Knight had no written deployment procedures for SMARS, no second review, no control comparing orders leaving SMARS with those entering it, and no incident response procedures. Knight paid a $12 million penalty and agreed to hire an independent consultant to review its compliance with the market access rule.'
		]
	},
	quiz: [
		{
			q: 'Why did Power Peg keep sending child orders after the parent orders were filled?',
			options: [
				'The RLP code told it that every order was still open',
				'Its share counting function had been moved out in 2005',
				'The exchanges did not confirm the executions to Knight',
				'The 33 Account reset the share count every second'
			],
			answer: 1,
			why: 'Power Peg used a cumulative quantity function to stop routing once the parent order was filled. Knight moved that function to an earlier point in the SMARS code in 2005 and "did not retest the Power Peg code" afterwards.'
		},
		{
			q: 'Knight uninstalled the new RLP code from the seven good servers. Why did that make things worse?',
			options: [
				'The servers lost their connection to the exchanges',
				'The old RLP code on those servers sent duplicate orders',
				'Orders with the reused flag then ran Power Peg there too',
				'The uninstall wiped the position data in PMON'
			],
			answer: 2,
			why: 'The RLP code reused the flag that used to turn on Power Peg, and the Power Peg code was still present on those servers. With the RLP code gone, each incoming parent order with the flag started Power Peg.'
		},
		{
			q: 'SMARS capped child orders at 9.5% beyond the best bid or offer. Why did this cap not stop the 212 orders?',
			options: [
				'The cap applied only to orders above $1 million',
				'Power Peg orders bypassed SMARS entirely',
				'The cap had been turned off for the RLP launch',
				'It did not cover orders received before the open'
			],
			answer: 3,
			why: 'The SEC: the cap "did not apply to orders" that Knight "received before the market open and intended to send to participate in the opening auction". It also could not catch errors while prices moved by less than 9.5%.'
		}
	],
	recall: {
		q: 'What was different about the eighth SMARS server on 1 August 2012?',
		a: 'A technician had not copied the new RLP code to it. Orders with the reused flag ran the old Power Peg code there, which sent child orders without counting fills. Knight lost more than $460 million in about 45 minutes.'
	},
	sources: [
		{ title: 'SEC, Order Instituting Administrative and Cease-and-Desist Proceedings, In the Matter of Knight Capital Americas LLC (Release No. 34-70694)', url: ORDER },
		{ title: 'SEC, SEC Charges Knight Capital With Violations of Market Access Rule (press release 2013-222)', url: 'https://www.sec.gov/newsroom/press-releases/2013-222' }
	]
};
