const REPORT = 'https://circleci.com/blog/jan-4-2023-incident-report/';
const INSPECTOR = 'https://github.com/CircleCI-Public/CircleCI-Env-Inspector/blob/3d1b52a446e59cac978893324bd157e22f0aa2df';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'incident-response',
	part: 'Running safely',
	title: 'When you are breached',
	minutes: 10,
	hook: [
		'On 29 December 2022, a customer told CircleCI about suspicious GitHub OAuth activity. The investigation found malware on a CircleCI engineer’s laptop, compromised on 16 December. The antivirus did not detect it. The malware stole "a valid, 2FA-backed SSO session", and the attacker used it to reach production.',
		'The engineer could generate production access tokens. The attacker did reconnaissance on 19 December and took data on 22 December: "customer environment variables, tokens, and keys". The data was encrypted at rest, but the attacker "extracted encryption keys from a running process".',
		'CircleCI published its report on 12 January 2023, with a timestamp for each response action.'
	],
	terms: [
		{ term: 'Containment', def: 'The actions that stop the attacker from going further: cut the stolen account, cut other access paths, replace hosts that may still run the attacker’s code.' },
		{ term: 'Rotation', def: 'Replacing a secret with a new one and revoking the old one, so that a stolen copy stops working.' },
		{ term: 'Indicator of compromise', def: 'A concrete trace of the attacker that others can search for: an IP address, a file path, a file hash, a domain, an audit log action.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['mal["16 Dec: malware on an engineer’s laptop"] --> cookie["Stolen SSO session cookie, 2FA already passed"]', 'cookie --> exfil["22 Dec: env variables, tokens and keys copied, plus encryption keys from a running process"]'],
				highlight: ['mal', 'cookie', 'exfil'],
				note: 'The attack path. A session cookie is created after the second factor, so whoever holds the cookie skips 2FA. The engineer’s access let the attacker create production tokens and read customer secrets.'
			},
			{
				add: ['alert["29 Dec: a customer reports suspicious GitHub OAuth activity"] --> rot1["31 Dec 04:00: rotation of all GitHub OAuth tokens starts"]'],
				highlight: ['alert', 'rot1'],
				note: 'Detection came from outside, 7 days after the exfiltration. On 30 December CircleCI confirmed that the customer’s token had been compromised. On 31 December it started rotating every customer’s GitHub OAuth token before knowing the full scope.'
			},
			{
				add: ['rot1 --> contain["4 Jan: 16:35 employee cut, 18:30 nearly all production access cut, 22:30 all exposed hosts replaced"]'],
				highlight: ['contain'],
				note: 'Containment came once the entry path was known on 4 January. In 6 hours, CircleCI cut the compromised account, then production access for nearly every employee, then replaced every potentially exposed production host. The report gives the reason for cutting everyone: "to limit the potential surface area".'
			},
			{
				add: ['contain --> tell["5 Jan 02:30: emails, blog post, social media, forum, support article"]'],
				highlight: ['tell'],
				note: 'The disclosure went out 4 hours after the hosts were replaced, on every channel at once. It asked every customer to rotate all secrets stored in CircleCI: "OAuth tokens, Project API Tokens, SSH keys, and more".'
			},
			{
				add: ['tell --> revoke["5 to 7 Jan: Project API tokens, Personal API tokens, Bitbucket and GitHub OAuth tokens revoked or rotated"]'],
				highlight: ['revoke'],
				note: 'CircleCI revoked the secrets it controlled: all Project API Tokens at 03:26 on 5 January, Personal API Tokens created before 5 January at 05:00 on 6 January. The GitHub OAuth rotation started on 31 December finished at 07:30 on 7 January.'
			},
			{
				add: ['revoke --> ioc["12 Jan report: 8 IPs, VPN providers, file paths, a SHA256, a domain, repo.download_zip"]'],
				highlight: ['ioc'],
				note: 'The report handed customers indicators of compromise to search their own logs: attacker IPs, data centers and VPN providers, malware file names and a hash, a domain to block, and the GitHub audit log action `repo.download_zip`.'
			}
		]
	},
	example: {
		title: 'src/utils/CircleCI.ts: the tool CircleCI published to list every secret to rotate',
		repo: 'CircleCI-Public/CircleCI-Env-Inspector',
		url: `${INSPECTOR}/src/utils/CircleCI.ts#L208-L293`,
		lang: 'typescript',
		code: `  async getContexts(orgID: string, slug: string) {
    const errors: ContextVariableError[] = [];
    printMessage("...", "Fetching contexts");
    const contextsReport: CircleCIContext[] = [];
    const contexts = await this._getPaginated<CircleCIAPIContext>(
      \`\${CircleCI.endpoint.v2}/context?owner-id=\${orgID}\`
    ).catch((e) => {
…
    });
    printMessage(\`\${contexts.length}\`, "Contexts found:");

    for (let i = 0; i < contexts.length; i++) {
…
      const variables: CircleCIAPIContextVariable[] =
        await this._getPaginated<CircleCIAPIContextVariable>(
          \`\${CircleCI.endpoint.v2}/context/\${contexts[i].id}/environment-variable\`
        ).catch((e) => {
          const error = getAxiosError(e);
          printAxiosError(error, 2);
          printWarning("Skipping context variables", 2);
          errors.push({
            contextName: contexts[i].name,
            url: this.getContextUrl(slug, contexts[i].id),
            error: createMinimalAxiosError(error),
          });
          return [];
        });
      contextsReport.push({
        ...contexts[i],
        url: this.getContextUrl(slug, contexts[i].id),
        variables: variables,
      });
    }
    return {
      errors,
      contextsReport,
    };
  }
…
type CircleCIAPIContextVariable = {
  variable: string;
  context_id: string;
  created_at: string;
  updated_at: string;
};`,
		notes: [
			'The first call lists every context of the organization, and the loop lists each context’s variables. The output has the variable names and dates. The [README](' + INSPECTOR + '/README.md) says "CircleCI _does not_ return the values of secrets through their APIs".',
			'The `updated_at` field in the last type is how a customer checks the rotation. The report says CircleCI added it to the Contexts API "so that customers can verify the successful rotation of these variables". Any variable with `updated_at` before 5 January 2023 still holds a value the attacker may have.',
			'A failed context does not stop the run: `errors.push` records its name and URL, and the loop goes on. The README says a 403 can mean you had access to that project "at one point in the past", so each error is a context you must check by hand.',
			'The repository was created on 5 January 2023, the day the disclosure emails went out. The report lists it as "A script for secret finding in order to create an actionable list for secrets rotation."'
		]
	},
	tradeoff: {
		gain: [
			'Cutting production access for nearly all employees at 18:30 closed other paths, though CircleCI had no evidence that other accounts were compromised.',
			'Replacing every exposed production host removed "the potential of a lingering corrupted host" before the disclosure went out.',
			'The published IPs, file hash and `repo.download_zip` action let each customer search its own logs for the same attacker.'
		],
		cost: [
			'The GitHub OAuth rotation ran from 31 December 04:00 to 7 January 07:30. CircleCI worked with GitHub to raise its API rate limits, and the rotation still took a week.',
			'CircleCI could not see use of the stolen secrets in other systems: "there is no way for us to know". Every customer had to rotate and investigate on its own.',
			'The disclosure came 6 days after the first customer report. The report describes the choice as balancing "speed in sharing information with maintaining the integrity of our investigation".'
		]
	},
	task: {
		prompt: 'It is 5 January 2023, 03:00 UTC. You read CircleCI’s disclosure. Your CircleCI context `deploy` holds `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, `NPM_TOKEN`, and a GitHub deploy key. Write your next steps in order, the time window you will search, and the traces you will search for.',
		hint: 'The report says to assume the secrets were accessed. Which date is the earliest one in the report, and which date ends your exposure?',
		answer: [
			'Rotate first, in this order for each secret: create the new one, put it in the `deploy` context, revoke the old one. AWS key, npm token, then delete the GitHub deploy key and add a new one. Do not wait for proof of use: the report says "assume they have been accessed".',
			'Check the rotation: list the context with the Env Inspector and confirm every variable has `updated_at` after 5 January 2023.',
			'Search from 16 December 2022, the date the laptop was compromised, to the time your rotation ended. The report gives the same window.',
			'Search AWS, npm and GitHub logs for the 8 IP addresses and the VPN providers in the report, and the GitHub audit log for `repo.download_zip`. Write down each hit with its time before you change anything else, so the evidence survives.'
		],
		steps: [
			{
				title: 'Decide what comes first',
				questions: [
					{ q: 'Do you wait for proof that your secrets were used before you act?', options: ['No: the report says "assume they have been accessed"', 'Yes: rotating without proof breaks deploys for nothing', 'Yes: CircleCI will tell you if they were used', 'No, but only for the AWS key'], answer: 0, why: 'Proof may never come. The safe move is to treat every stored secret as stolen.' },
					{ q: 'Why can CircleCI not tell you whether your secrets were used?', options: ['It deleted its logs during containment', 'Use happens in other systems: "there is no way for us to know"', 'The attacker kept the secrets encrypted', 'GitHub keeps those logs private'], answer: 1, why: 'The secrets work in AWS, npm and GitHub. Only those systems, and you, see them being used.' },
					{ q: 'The secrets were encrypted at rest. Does that lower the urgency?', options: ['Yes: the attacker only has ciphertext', 'Yes, if the key was long enough', 'No: the attacker extracted the keys from a running process', 'No, but only for the npm token'], answer: 2, why: 'A running service holds the key in memory. The encrypted copy and its key left together.' },
					{ q: 'What did the report ask customers to rotate?', options: ['Only GitHub OAuth tokens', 'Only cloud provider keys', 'Only secrets added after 16 December', 'All secrets stored in CircleCI: "OAuth tokens, Project API Tokens, SSH keys, and more"'], answer: 3, why: 'The disclosure asked every customer to rotate every secret it held, not a chosen few.' }
				]
			},
			{
				title: 'Rotate each secret',
				questions: [
					{ q: 'In which order do you rotate one secret?', options: ['Revoke the old one, create a new one, update the context', 'Create a new one, put it in `deploy`, revoke the old one', 'Update the context, revoke the old one, create a new one', 'Create a new one now, revoke the old one next week'], answer: 1, why: 'The stolen copy stops working when you revoke it, and the next deploy already has the new value.' },
					{ q: 'What do you do with the GitHub deploy key?', options: ['Delete it and add a new one', 'Change its passphrase', 'Leave it: deploy keys only read', 'Move it to another context'], answer: 0, why: 'A deploy key is a secret like the others. Rotating it means removing the old key and adding a new one.' },
					{ q: 'Which of the secrets in `deploy` do you rotate?', options: ['Only the npm token, since it publishes your packages', 'Only the GitHub deploy key', 'The AWS key, the npm token and the GitHub deploy key', 'Only the AWS key, since it costs money'], answer: 2, why: 'All three sat in the `deploy` context, so the attacker may hold all three. Each one gets rotated, one after the other.' },
					{ q: 'How do you check that the rotation is done?', options: ['Run one build and see it pass', 'Ask CircleCI support', 'Wait a week and look again', 'List the context with the Env Inspector and check every `updated_at` is after 5 January 2023'], answer: 3, why: 'A variable with an older `updated_at` still holds a value the attacker may have.' }
				]
			},
			{
				title: 'Set the time window',
				questions: [
					{ q: 'Where does your search window start?', options: ['22 December 2022, the exfiltration', '29 December 2022, the first customer report', '16 December 2022, the laptop compromise', '4 January 2023, the containment'], answer: 2, why: 'It is the earliest date in the report, and the report gives the same start.' },
					{ q: 'Where does it end?', options: ['When your own rotation ended', 'On 22 December 2022', 'On 12 January 2023, the report date', 'On 4 January 2023'], answer: 0, why: 'The report says "through the date when you rotated your secrets".' },
					{ q: 'Why does the window end at your rotation and not at CircleCI’s containment?', options: ['Logs stop at that point', 'Until you rotate, the attacker can still use your secrets', 'CircleCI’s containment was on the same day', 'Rotation deletes the older logs'], answer: 1, why: 'Containment closed the way into CircleCI. Your stolen secrets kept working until you replaced them.' },
					{ q: 'Why start on 16 December, days before the data was taken on 22 December?', options: ['CircleCI only started logging that day', 'It is the default window in AWS', 'The report adds a week to every search', 'From that day on, the attacker could act as the engineer'], answer: 3, why: 'The malware took the session on the day the laptop was compromised. Reconnaissance followed on 19 December.' }
				]
			},
			{
				title: 'Search for the traces',
				questions: [
					{ q: 'Which of these is an indicator of compromise from the report?', options: ['The engineer’s name', 'The GitHub audit log action `repo.download_zip`', 'The CircleCI status page', 'Your usual build times'], answer: 1, why: 'An indicator is a trace others can search for. The report lists that action next to the IPs, the file hash and the domain.' },
					{ q: 'Where do you search for the attacker’s IP addresses?', options: ['In your AWS, npm and GitHub logs', 'In CircleCI’s logs only', 'On the engineer’s laptop', 'In your DNS cache'], answer: 0, why: 'Those are the systems your secrets open. Use of a stolen secret shows up there.' },
					{ q: 'You find a hit. What do you do before you change anything else?', options: ['Delete the log line to stop the leak', 'Block the IP and move on', 'Write down each hit with its time, so the evidence survives', 'Rotate the same secret a second time'], answer: 2, why: 'Changes can overwrite or age out the traces. A written list with times is what you build on.' },
					{ q: 'How many attacker IP addresses did the report list?', options: ['1', '3', '20', '8'], answer: 3, why: 'The report gave 8 IP addresses, plus data centers and VPN providers.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'The CircleCI engineer’s account was protected by 2FA. How did the attacker get past it?',
			options: [
				'By guessing the six-digit code within its 30-second validity window',
				'By stealing a session cookie, created after the second factor was passed',
				'By resetting the 2FA device through a phishing call to the helpdesk',
				'By using a GitHub OAuth token that never asked for a second factor'
			],
			answer: 1,
			why: 'The malware stole "a valid, 2FA-backed SSO session". The SSO system issues the cookie once the second factor succeeds. Whoever sends the cookie later is treated as already logged in, so no code is asked.'
		},
		{
			q: 'As a customer, which period did the report ask you to search for suspicious activity?',
			options: [
				'22 December 2022, the day of the exfiltration, and only that day',
				'From 29 December 2022, the first customer report, to 4 January 2023',
				'From 16 December 2022 to the day you finished rotating your secrets',
				'From 19 December 2022 to 22 December 2022, reconnaissance to exfiltration'
			],
			answer: 2,
			why: 'The report recommends the period "between the date of corruption on December 16, 2022 through the date when you rotated your secrets". Your secrets stay usable by the attacker until you rotate them, so the window ends at your rotation.'
		},
		{
			q: 'The customer secrets were encrypted at rest. Why were they still exposed?',
			options: [
				'The encryption used a short key that the attacker broke offline',
				'Backups of the database were stored without any encryption',
				'The attacker took the encryption keys from a running process',
				'The secrets were also printed in plain text in the build logs'
			],
			answer: 2,
			why: 'A running service needs the key in memory to decrypt the secrets it uses. With production access, the attacker "extracted encryption keys from a running process", so the encrypted copy and its key left together.'
		}
	],
	recall: {
		q: 'In the CircleCI incident, which date starts the window customers were told to search, and why that date?',
		a: '16 December 2022, the day malware compromised the engineer’s laptop. The window ends when you finished rotating your secrets after the 4 January 2023 alert.'
	},
	sources: [
		{ title: 'CircleCI, Jan 4, 2023 security incident report', url: REPORT },
		{ title: 'CircleCI-Public/CircleCI-Env-Inspector, README', url: `${INSPECTOR}/README.md` },
		{ title: 'CircleCI-Public/CircleCI-Env-Inspector, src/utils/CircleCI.ts', url: `${INSPECTOR}/src/utils/CircleCI.ts` }
	]
};
