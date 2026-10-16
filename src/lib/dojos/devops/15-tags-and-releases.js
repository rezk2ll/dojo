const SW = 'https://github.com/actions/starter-workflows/blob/e3c451d60f119b71caebf13c98ac45da6e15b4b7';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'tags-and-releases',
	part: 'Git',
	title: 'Tags, versions and releases',
	minutes: 10,
	hook: [
		'Production breaks after the Friday deploy. Your boss asks: "what was running on Thursday?" If the answer is "the commit from around 4 p.m., I think", you have no releases.',
		'A **tag** is a ref that names one commit: `v1.4.2`. Unlike a branch, it does not move when you commit. Thursday\'s version gets a name you can check out, compare and roll back to.',
		'A **release** adds the rest: a version number that tells users what changed (semantic versioning), a changelog written for humans, and the artifacts (a binary, a package, an image) built from that exact commit.'
	],
	terms: [
		{ term: 'Annotated tag', def: 'A tag object with the tagger\'s name and email, a date and a message. Made with `git tag -a`. Meant for releases. A lightweight tag is only a name pointing at a commit, meant for private or temporary labels.' },
		{ term: 'Semantic versioning', def: '`MAJOR.MINOR.PATCH`: MAJOR for incompatible changes, MINOR for new backward compatible features, PATCH for backward compatible bug fixes.' },
		{ term: 'Changelog', def: 'A file listing the notable changes of each version, newest first, for the people who use your software.' },
		{ term: 'Release artifact', def: 'The built output users install: a package, a binary, a container image. Built once from the tagged commit.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['tag["tag v1.4.0: tagger, date, message"] --> c["commit 9fceb02"]'],
				highlight: ['tag', 'c'],
				note: '`git tag -a v1.4.0 -m "Release 1.4.0"` creates an **annotated tag** on the current commit. New commits move the branch, the tag stays on `9fceb02`.'
			},
			{
				add: ['tag -->|"git push origin v1.4.0"| remote[("Remote: GitHub")]'],
				highlight: ['remote'],
				note: 'Push the tag by name, because **`git push` does not send tags by default**. Or use `git push --follow-tags` to send the annotated tags that point at commits reachable from what you push.'
			},
			{
				add: ['remote -->|"release published"| ci["CI release job"]', 'ci --> art["artifacts: package, binary, image"]'],
				highlight: ['ci', 'art'],
				note: 'You publish a GitHub Release from the tag. That event starts a CI job, which checks out the tagged commit and builds the artifacts **once**.'
			},
			{
				add: ['art --> rel["Release v1.4.0: notes and files"]', 'log["CHANGELOG.md"] -.-> rel'],
				highlight: ['rel', 'log'],
				note: 'The release page holds the notes and the files. The notes come from the **changelog**, which groups the notable changes for users. A `git log` dump would list every commit instead.'
			},
			{
				add: ['rel --> users["Users: 2.0.0 means read before upgrading"]', 'class users ext'],
				highlight: ['users'],
				note: 'With semantic versioning, the number tells users what an upgrade does. 1.4.0 to 1.4.1: safe fix. To 1.5.0: new features, nothing breaks. To 2.0.0: something incompatible, read the changelog first.'
			}
		]
	},
	example: {
		title: 'ci/python-publish.yml',
		repo: 'actions/starter-workflows',
		url: `${SW}/ci/python-publish.yml#L9-L70`,
		lang: 'yaml',
		code: `name: Upload Python Package

on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  release-build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.x"

      - name: Build release distributions
        run: |
          # NOTE: put your own distribution build steps here.
          python -m pip install build
          python -m build

      - name: Upload distributions
        uses: actions/upload-artifact@v4
        with:
          name: release-dists
          path: dist/

  pypi-publish:
    runs-on: ubuntu-latest
    needs:
      - release-build
    permissions:
      # IMPORTANT: this permission is mandatory for trusted publishing
      id-token: write
…
    environment:
      name: pypi
…
    steps:
      - name: Retrieve release distributions
        uses: actions/download-artifact@v4
        with:
          name: release-dists
          path: dist/

      - name: Publish release distributions to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
        with:
          packages-dir: dist/`,
		notes: [
			'Lines 3 to 5 run the workflow when someone publishes a GitHub Release. For this event, GitHub sets `GITHUB_REF` to `refs/tags/<tag_name>` and `GITHUB_SHA` to the last commit in the tagged release. So `actions/checkout` on line 15 gets **exactly the tagged commit**.',
			'Lines 27 to 31 upload `dist/` as an artifact. In `pypi-publish` (`needs: release-build`), lines 45 to 49 download those same files, so PyPI gets the files `release-build` built, with no second build.',
			'Line 39: `id-token: write` is for [trusted publishing](https://docs.pypi.org/trusted-publishers/). PyPI trusts a short-lived identity token from the workflow, so you do not store a PyPI API token as a secret.',
			'Lines 41 and 42 run the job in the `pypi` environment. The file\'s comments strongly recommend a dedicated environment with protection rules for publishing.'
		]
	},
	tradeoff: {
		gain: [
			'Anyone can name the exact code in production and get it back: `git checkout v1.4.2`.',
			'Semantic versioning tells users from the number alone whether an upgrade can break them: only a MAJOR bump may.',
			'The artifacts are built once from the tag, so you ship the files you tested, and a rollback means deploying the previous version.'
		],
		cost: [
			'Semver needs a clear public API: without one, nobody agrees whether a change is MINOR or MAJOR.',
			'Someone has to write the changelog by hand. A `git log` dump is fast, but it lists commits instead of changes for users.',
			'You never move a published tag: after a re-tag, two people can hold different "v1.4.2" builds. A bad release therefore costs a new version number.'
		]
	},
	task: {
		prompt: 'You maintain an internal CLI at version 1.4.2. Since that tag, `main` has: a fix in log rotation, a new `--dry-run` flag, and the removal of the deprecated `--force` option. Pick the next version, write the changelog entry, and give the git commands to tag and publish it.',
		hint: 'For a CLI, the flags are the public API. Removing one breaks the scripts that use it.',
		answer: [
			'Removing `--force` is an incompatible change: bump MAJOR. Next version: **2.0.0**.',
			'In `CHANGELOG.md`, move the Unreleased items under `## [2.0.0] - 2026-10-16`, grouped as `### Added` (`--dry-run`), `### Removed` (`--force`), `### Fixed` (log rotation).',
			'`git tag -a v2.0.0 -m "Release 2.0.0"`, then `git push origin v2.0.0`, because a plain `git push` does not send tags.',
			'Publish a GitHub Release from `v2.0.0` and let CI build and attach the artifacts. If 2.0.0 turns out broken, release 2.0.1. Never move the tag.'
		]
	},
	quiz: [
		{
			q: 'Which kind of Git tag should mark a release, and why?',
			options: [
				'A lightweight tag, because it is smaller, faster, and `git describe` uses it',
				'A branch called `release`, because it can move forward with each new fix',
				'An annotated tag: it records who, when and why, and `git describe` uses it by default',
				'No tag, because the commit hash already identifies the release exactly'
			],
			answer: 2,
			why: 'The git-tag docs say annotated tags are meant for release and lightweight tags for private or temporary labels. Some commands like `git describe` ignore lightweight tags by default.'
		},
		{
			q: 'You ran `git tag -a v1.5.0 -m "Release 1.5.0"`, then `git push`. The tag is not on GitHub. Why?',
			options: [
				'`git push` does not send tags by default, so run `git push origin v1.5.0`',
				'Annotated tags cannot be pushed, only lightweight ones can',
				'GitHub only accepts tags made in its web interface or its API',
				'The tag must be signed with `-s` before it can be pushed'
			],
			answer: 0,
			why: 'Tags are pushed explicitly, by name, with `--tags`, or with `--follow-tags` for annotated tags reachable from the pushed commits.'
		},
		{
			q: 'Version 1.4.2 gets a new optional flag and nothing else changes. What is the next version under semantic versioning?',
			options: ['1.4.3', '1.5.0', '2.0.0', '1.4.2-1'],
			answer: 1,
			why: 'New backward compatible functionality bumps MINOR and resets PATCH. PATCH is for bug fixes only, MAJOR for breaking changes.'
		}
	],
	recall: {
		q: 'Your CLI at 1.4.2 drops the `--force` flag. What is the next version, and which commands tag and publish it?',
		a: '2.0.0, because removing a flag breaks the scripts that use it. `git tag -a v2.0.0 -m "Release 2.0.0"`, then `git push origin v2.0.0`, since a plain `git push` sends no tags.'
	},
	sources: [
		{ title: 'Git docs, git-tag', url: 'https://git-scm.com/docs/git-tag' },
		{ title: 'Pro Git, Tagging', url: 'https://git-scm.com/book/en/v2/Git-Basics-Tagging' },
		{ title: 'Semantic Versioning 2.0.0', url: 'https://semver.org/' },
		{ title: 'Keep a Changelog 1.1.0', url: 'https://keepachangelog.com/en/1.1.0/' },
		{ title: 'GitHub Docs, About releases', url: 'https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases' }
	]
};
