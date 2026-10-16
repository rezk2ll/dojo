const K8S = 'https://github.com/kubernetes/kubernetes/blob/9b965ac43f05d304180c7b8b9611264530788948';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'shell-scripts',
	part: 'Fundamentals',
	title: 'Shell scripts that stop at the first error',
	minutes: 10,
	hook: [
		'Your backup script ran every night for a year. One night the mount was gone, `cd $BACKUP_DIR` failed, and the next line, `rm -rf *`, ran **in the wrong directory**.',
		'By default bash keeps going after a failed command. A cron job at 3 a.m. has nobody watching, so the next line runs anyway.',
		'Four habits prevent this: one `set` line at the top of the script, quotes around every variable, steps you can run twice, and a shellcheck pass before merge.'
	],
	terms: [
		{ term: 'errexit (`set -e`)', def: 'Stop the script when a command fails. It has exceptions: commands tested by `if`, `while` or `until`, any part of `&&` or `||` but the last, anything negated with `!`, and, without pipefail, every command of a pipeline but the last.' },
		{ term: 'nounset (`set -u`)', def: 'Treat an unset variable as an error. A non-interactive shell prints a message and exits.' },
		{ term: 'pipefail', def: 'A pipeline returns the status of the rightmost command that failed, not just the status of the last command. Off by default.' },
		{ term: 'Idempotent', def: 'Running it twice gives the same result as running it once. A pipeline can safely retry an idempotent script.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["A command in your script"]', 'run --> chk["set -e: exit code 0?"]', 'chk -->|"yes"| nxt["Next line"]', 'chk -->|"no"| stop["Script stops, exits non-zero"]'],
				highlight: ['run', 'chk', 'stop'],
				note: 'With `set -e`, the first failing command **stops the script**, and the caller (cron, systemd, a CI job) sees a non-zero exit code. Without it, bash runs the next line as if nothing happened.'
			},
			{
				add: ['uv["set -u: BACKUP_DIR not set"] --> stop'],
				highlight: ['uv'],
				note: 'A typo like `$BACKUP_DRI` expands to nothing, so `rm -rf "$BACKUP_DRI/"*` expands to `rm -rf /*`. With `set -u` bash stops at the unset variable instead.'
			},
			{
				add: ['pipe["pipefail: pg_dump db | gzip"] --> stop'],
				highlight: ['pipe'],
				note: 'Without pipefail, `pg_dump db | gzip > db.gz` returns the status of **gzip**. pg_dump can fail, you get a tiny valid archive, and the exit code is 0. With pipefail, the pipeline returns the non-zero code of pg_dump.'
			},
			{
				add: ['nxt --> idem["Idempotent step: safe to run twice"]'],
				highlight: ['idem'],
				note: '`mkdir -p` instead of `mkdir`. `grep -qxF "$line" file || echo "$line" >> file` instead of a blind append. Each command checks the state before it changes anything, so after a crash you can run the script again.'
			},
			{
				add: ['lint["shellcheck, before merge"]', 'lint -.->|"reviews"| run', 'class lint ext'],
				highlight: ['lint'],
				note: 'shellcheck reads the script without running it and flags unquoted variables (SC2086), `cd` without a fallback (SC2164) and much more. With its default checks it does **not** flag a missing pipefail (only the optional `check-extra-masked-returns`, SC2312, does), so you add `set -o pipefail` yourself.'
			}
		]
	},
	example: {
		title: 'hack/verify-shellcheck.sh',
		repo: 'kubernetes/kubernetes',
		url: `${K8S}/hack/verify-shellcheck.sh#L20-L139`,
		lang: 'bash',
		code: `set -o errexit
set -o nounset
set -o pipefail

KUBE_ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")"/.. && pwd -P)"

# allow overriding docker cli, which should work fine for this script
DOCKER="\${DOCKER:-docker}"
…
res=0
if \${HAVE_SHELLCHECK}; then
  echo "Using host shellcheck \${SHELLCHECK_VERSION} binary."
  shellcheck "\${SHELLCHECK_OPTIONS[@]}" "\${scripts_to_check[@]}" >&2 || res=$?
else
  echo "Using shellcheck \${SHELLCHECK_VERSION} docker image."
  "\${DOCKER}" run \\
    --rm -v "\${KUBE_ROOT}:\${KUBE_ROOT}" -w "\${KUBE_ROOT}" --security-opt label=disable \\
    "\${SHELLCHECK_IMAGE}" \\
    "\${SHELLCHECK_OPTIONS[@]}" "\${scripts_to_check[@]}" >&2 || res=$?
fi

# print a message based on the result
if [ $res -eq 0 ]; then
  echo 'Congratulations! All shell files are passing lint :-)'
else
  {
    echo
    echo 'Please review the above warnings. You can test via "./hack/verify-shellcheck.sh"'
    …
  } >&2
fi

# preserve the result
exit $res`,
		notes: [
			'Lines 1 to 3 are the long form of `set -euo pipefail`. Each long name says what the line does, so a reader does not need to remember the letters.',
			'Line 8: `"${DOCKER:-docker}"` uses `$DOCKER` if set, else `docker`. Under nounset, a bare `$DOCKER` would stop the script. The same form appears as [`"${KUBE_JUNIT_REPORT_DIR:-}"`](https://github.com/kubernetes/kubernetes/blob/9b965ac43f05d304180c7b8b9611264530788948/hack/verify-shellcheck.sh#L88-L93) to test a variable that may be unset.',
			'Lines 13 and 19: under errexit a failing shellcheck would stop the script at once. The `||` is one of the exceptions, so the script **saves the code** in `res`, prints its help on stderr, then passes the same code on with `exit $res` on line 34.',
			'Lines 13 and 19 also quote `"${SHELLCHECK_OPTIONS[@]}"`, which expands each array element to a separate word, even if one contains a space. Without the quotes, bash would split each element on spaces, tabs and newlines.'
		]
	},
	tradeoff: {
		gain: [
			'The script stops at the first failed command, with a non-zero code that cron, systemd or CI can act on.',
			'Typos in variable names stop the script instead of expanding to empty strings.',
			'A pipeline, or you at 3 a.m., can rerun an idempotent script after a failure.'
		],
		cost: [
			'`set -e` does not stop the script for a failure inside `if`, `&&`, `||` or after `!`, so some failures still pass.',
			'Commands that return non-zero on purpose now stop you. `grep` returns 1 when nothing matches, so you write `|| true` where that is fine.',
			'Past a few dozen lines, a bash script gets hard to read and test. Configuration belongs in a tool like Ansible (day 26), logic in a general-purpose language.'
		]
	},
	task: {
		prompt: 'Fix this script so it is safe to run from cron and safe to run twice: `cd $BACKUP_DIR`, `rm -rf *`, `pg_dump mydb | gzip > /backup/db.sql.gz`, `echo \'export PATH="$PATH:/opt/bin"\' >> ~/.bashrc`.',
		hint: 'Go line by line. For each one ask: what if the variable is empty, what if the command fails halfway, what if it runs a second time?',
		answer: [
			'First line after the shebang: `set -euo pipefail`.',
			'`cd "${BACKUP_DIR:?}"`: quoted, and it stops with a message if the variable is unset or empty. Under `set -e`, a failed `cd` stops the script before `rm`.',
			'`rm -rf ./*`: shellcheck (SC2035) warns that a file named `-rf` would otherwise be read as an option.',
			'With pipefail, a failed `pg_dump` now fails the script instead of leaving an empty archive behind an exit code of 0.',
			'The append adds a line on every run. Make it idempotent: `grep -qxF \'export PATH="$PATH:/opt/bin"\' ~/.bashrc || echo \'…\' >> ~/.bashrc`.',
			'Run `shellcheck` on it. On the original it reports SC2164 and SC2086 on the `cd` line. With its default checks it says nothing about the pipeline, so you add pipefail yourself.'
		]
	},
	quiz: [
		{
			q: 'What does `set -o pipefail` change?',
			options: [
				'Bash stops the whole pipeline as soon as one of its commands fails',
				'It returns the status of the rightmost failing command, not only the last one',
				'Bash prints each command of the pipeline to stderr before running it',
				'Each command of the pipeline runs in its own subshell, one after another'
			],
			answer: 1,
			why: 'Without pipefail, `a | b` returns the status of `b`, so a failure in `a` is hidden. pipefail makes any failing command show in the result.'
		},
		{
			q: 'Under `set -u`, `NAME` is unset. What does `"${NAME:-guest}"` do?',
			options: [
				'The script exits with an unset variable error',
				'It expands to `guest` and the script goes on',
				'It sets `NAME` to `guest` for the rest of the script',
				'It expands to an empty string'
			],
			answer: 1,
			why: '`:-` substitutes a default without failing and without assigning. `:=` would also assign it, and `:?` would stop with an error.'
		},
		{
			q: 'Which of these steps is idempotent?',
			options: [
				'`echo \'export X=1\' >> ~/.bashrc`',
				'`mkdir -p /srv/app`',
				'`useradd deploy`',
				'`mkdir /srv/app`'
			],
			answer: 1,
			why: '`mkdir -p` succeeds whether the directory exists or not. The append adds a duplicate line each run, and `useradd` and plain `mkdir` fail the second time.'
		}
	],
	recall: {
		q: 'Which line goes at the top of a bash script that cron or CI runs, and what does each part stop?',
		a: '`set -euo pipefail`. `-e` stops at the first failed command, `-u` stops at an unset variable, and pipefail makes a failure anywhere in a pipeline fail the pipeline.'
	},
	sources: [
		{ title: 'Bash manual, The Set Builtin (-e, -u, pipefail)', url: 'https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html' },
		{ title: 'Bash manual, Shell Parameter Expansion', url: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Parameter-Expansion.html' },
		{ title: 'ShellCheck wiki, SC2086: double quote to prevent globbing and word splitting', url: 'https://www.shellcheck.net/wiki/SC2086' },
		{ title: 'ShellCheck wiki, SC2115: use "${var:?}" so rm never expands to /*', url: 'https://www.shellcheck.net/wiki/SC2115' },
		{ title: 'Kubernetes, hack/verify-shellcheck.sh', url: `${K8S}/hack/verify-shellcheck.sh` }
	]
};
