const PM = 'https://blog.npmjs.org/post/141577284765/kik-left-pad-and-npm';
const UNPUBLISH = 'https://blog.npmjs.org/post/141905368000/changes-to-npms-unpublish-policy';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'left-pad-2016',
	part: 'Security',
	title: 'npm left-pad 2016: the unpublished package that broke builds',
	minutes: 10,
	hook: [
		'Tuesday 22 March 2016, shortly after 2:30 p.m. Pacific Time. You are on call for the npm registry. The registry starts to log hundreds of failed installs per minute.',
		'The failures come from many projects at once, and from the projects that depend on them. Each one fails while it requests the same package: left-pad.',
		'left-pad is a 17-line `index.js` with one function that adds characters to the left of a string until it reaches a given length.'
	],
	terms: [
		{ term: 'Unpublish', def: 'Removing a package version from the npm registry. In March 2016 an author could unpublish any version at any time.' },
		{ term: 'Exact version', def: 'A dependency written as `"0.0.3"` with no `^` or `~`. npm installs that version and no other.' },
		{ term: 'Name squatting', def: 'Publishing under a package name that someone else used before, so that existing installs get your code.' },
		{ term: 'Placeholder package', def: 'A package that npm publishes under a removed name so that nobody else can take that name.' }
	],
	incident: {
		org: 'npm, Inc.',
		title: 'kik, left-pad, and npm',
		date: '2016-03-22',
		url: PM,
		steps: [
			{
				situation: [
					'In the past weeks, the author of left-pad, Azer Koçulu, and the company Kik argued over the package name `kik`. npm applied its dispute policy and gave the name to Kik.',
					'Without warning to dependent projects, Azer then unpublished his `kik` package and 272 other packages. left-pad was one of them. The name left-pad is now free.',
					'Cameron Westland, a community member, wants to publish a functionally identical left-pad. left-pad is open source.'
				],
				q: 'What does the registry let him publish?',
				options: [
					'Nothing until npm has asked Azer',
					'The same code as version 0.0.3, the version that disappeared',
					'The same code under a new version number, 1.0.0',
					'A new package named left-pad-2 for projects to switch to'
				],
				answer: 2,
				why: 'npm allows "anyone to use an abandoned package name as long as they don’t use the same version numbers". Cameron published left-pad 1.0.0 within ten minutes. A new name like left-pad-2 would fix nothing until every dependent project edits its `package.json`.'
			},
			{
				situation: [
					'left-pad 1.0.0 is on the registry, and many errors continue. The failing requests come through babel and atom.',
					'Both pull left-pad through the package line-numbers, whose `package.json` says `"left-pad": "0.0.3"`.'
				],
				q: 'What do you do about the remaining errors?',
				options: [
					'Re-publish the original 0.0.3 from a backup',
					'Ask Cameron to publish his code again as 0.0.3',
					'Tell users to clear their npm cache and retry',
					'Wait for babel and atom to change their dependency'
				],
				answer: 0,
				why: 'An exact version never matches 1.0.0. npm "took the unprecedented step of re-publishing the original 0.0.3". This "required relying on a backup, since re-publishing isn’t otherwise possible", and the registry refuses a new publish under a used version number.'
			},
			{
				situation: [
					'npm has never re-published a version that its author removed. The outage hits many thousands of projects, and each of them will get back code that its author deleted.'
				],
				q: 'What do you do before you run the re-publish?',
				options: [
					'Run it quietly and explain in the postmortem',
					'Announce the plan in public, then run it',
					'Email only the babel and atom maintainers',
					'Ask Azer for permission and wait for his reply'
				],
				answer: 1,
				why: 'npm "announced this plan at 4:05 PM and completed the operation by 4:55 PM". npm wrote that left-pad "was open-source code, and explicitly allows republishing by any other author". npm later wrote: "Poor communication made matters worse."'
			},
			{
				situation: [
					'The other 272 names are free too. In about the same ten minutes, community members take them. Some re-publish forks of the original modules, others publish "dummy" packages so that nobody can publish malicious code under those names.'
				],
				q: 'What do you do with these 272 names?',
				options: [
					'Hand them back to Azer once the dispute is over',
					'Leave each name with whoever took it first',
					'Delete all 272 names so the packages stay gone',
					'Move them to npm\'s control with the adopters\' permission'
				],
				answer: 3,
				why: 'npm: "With their explicit permission, we are working with them to transfer these to npm’s direct control." Whoever holds a name can publish new versions, and a dependent project with a matching range installs them.'
			},
			{
				situation: [
					'The disruption lasted 2.5 hours. npm keeps its dispute policy: moving a name to a new owner keeps the old versions on the registry. The `kik` transfer alone would have broken nothing.'
				],
				q: 'Which change stops one author from breaking this many installs again?',
				options: [
					'Remove `npm unpublish` from the command line for good',
					'Stop moving package names between owners in disputes',
					'Block unpublish of versions older than 24 hours',
					'Make every project commit a lockfile before it installs'
				],
				answer: 2,
				why: 'From 29 March 2016, a version older than 24 hours can only be removed through npm support, which checks first "if removing that version of your package would break any other installs". npm wrote that unpublish has "important and legitmate reasons", so it kept the command.'
			}
		],
		outcome: [
			'Azer Koçulu unpublished 273 packages after npm gave the name `kik` to the company Kik. One of them, left-pad, was a dependency of line-numbers, which babel and atom pulled in. From shortly after 2:30 p.m. Pacific Time, installs that requested it failed at hundreds per minute.',
			'A community member published left-pad 1.0.0 within ten minutes. babel and atom kept failing, because line-numbers asked for exactly 0.0.3. npm re-published 0.0.3 from a backup by 4:55 p.m. The disruption lasted 2.5 hours.',
			'npm wrote: "Unrestricted un-publishing caused a lot of pain." It also wrote: "It took us too long to get you this update."',
			'On 29 March 2016, npm changed unpublish. Authors can remove a version for 24 hours after publishing it. After that, support checks for dependents first. A package with every version removed is replaced by a security placeholder package.'
		]
	},
	quiz: [
		{
			q: 'Why did left-pad 1.0.0 fail to fix installs of babel?',
			options: [
				'Version 1.0.0 had a bug in the padding function',
				'line-numbers asked for exactly 0.0.3, and 1.0.0 does not match',
				'The npm CDN kept serving the deleted package for an hour',
				'babel checked the author name of every dependency'
			],
			answer: 1,
			why: 'A dependency written as `"0.0.3"` matches only 0.0.3. A range such as `^0.0.3` would not have matched 1.0.0 either: semver defines it as `>=0.0.3 <0.0.4-0`.'
		},
		{
			q: 'Under the policy from 29 March 2016, you published a version 30 hours ago. What happens if you run `npm unpublish` on it?',
			options: [
				'The unpublish fails and tells you to contact npm support',
				'The version is removed at once',
				'The version is hidden from search but still installs',
				'The whole package moves to a placeholder'
			],
			answer: 0,
			why: 'Past 24 hours, "the unpublish will fail, with a message to contact" npm support. Support then checks whether removing the version breaks other installs, and refuses if it does.'
		},
		{
			q: 'Why did community members publish "dummy" packages under the 272 freed names?',
			options: [
				'To keep download statistics for those names',
				'To make installs of those names fail faster',
				'To stop anyone publishing malicious code under them',
				'So that npm could charge for the names later'
			],
			answer: 2,
			why: 'Any account could take a freed name and publish new versions under it. npm later replaced fully unpublished packages with a placeholder "so that the formerly used name will not be susceptible to malicious squatting".'
		}
	],
	recall: {
		q: 'How did npm stop the babel and atom failures in the left-pad incident?',
		a: 'It re-published the original left-pad 0.0.3 from a backup, because line-numbers asked for exactly that version. The work was done by 4:55 p.m., after 2.5 hours of disruption.'
	},
	sources: [
		{ title: 'npm Blog, kik, left-pad, and npm', url: PM },
		{ title: 'npm Blog, changes to npm’s unpublish policy', url: UNPUBLISH },
		{ title: 'unpkg, left-pad 0.0.3 index.js', url: 'https://unpkg.com/left-pad@0.0.3/index.js' },
		{ title: 'npm registry, line-numbers 0.2.0 metadata', url: 'https://registry.npmjs.org/line-numbers/0.2.0' },
		{ title: 'node-semver README, Caret Ranges', url: 'https://github.com/npm/node-semver/blob/6e05b7637396ac66522cff8731f07cfe0ef49a29/README.md#L342-L360' }
	]
};
