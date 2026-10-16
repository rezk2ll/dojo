const CARGO = 'https://github.com/rust-lang/cargo';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'swallowed-error',
	part: 'Logic',
	title: 'A config parse error reported as an unknown command',
	minutes: 10,
	hook: [
		'A user defines a Cargo alias in `.cargo/config` and forgets a comma: `foo = ["a" "b"]`. Running `cargo foo` prints **"error: no such subcommand: `foo`"** and suggests `doc`. Nothing mentions the config file or the syntax error.',
		'Cargo reads optional settings through serde. For an `Option` value it first calls `has_key`, below. If `has_key` returns `false`, serde treats the value as missing and returns `None`. `get_cv` reads the config files and returns an `Err` when one of them does not parse.'
	],
	terms: [
		{ term: 'Result', def: 'A Rust value that is either `Ok(value)` or `Err(error)`. `CargoResult<T>` is Cargo’s name for a `Result` with its error type.' },
		{ term: 'if let Ok(x)', def: 'Runs the block only when the value is `Ok`. On `Err` it skips the block, and the error is dropped.' },
		{ term: 'The ? operator', def: 'On `Err`, returns the error to the caller right away. On `Ok`, gives the value inside.' },
		{ term: 'Alias', def: 'A name in the `[alias]` table of a Cargo config that expands to another command, here `cargo foo` to `cargo a b`.' }
	],
	bug: {
		title: 'Dont swallow errors when checking existence of a config key',
		repo: 'rust-lang/cargo',
		url: `${CARGO}/blob/2c6647df8039841eebdb113017aeb334f0766926/src/cargo/util/config/mod.rs#L685-L704`,
		fix: `${CARGO}/commit/ef7a4ef06280939853e6c9aae158b450ae41b4b7`,
		lang: 'rust',
		code: `fn has_key(&self, key: &ConfigKey, env_prefix_ok: bool) -> bool {
    if self.env.contains_key(key.as_env_key()) {
        return true;
    }
    // See ConfigMapAccess for a description of this.
    if env_prefix_ok {
        let env_prefix = format!("{}_", key.as_env_key());
        if self.env.keys().any(|k| k.starts_with(&env_prefix)) {
            return true;
        }
    }
    if let Ok(o_cv) = self.get_cv(key) {
        if o_cv.is_some() {
            return true;
        }
    }
    self.check_environment_key_case_mismatch(key);

    false
}`,
		lines: [12],
		diff: `-        if let Ok(o_cv) = self.get_cv(key) {
-            if o_cv.is_some() {
-                return true;
-            }
+        if self.get_cv(key)?.is_some() {
+            return Ok(true);
         }`,
		notes: [
			'Line 12 calls `get_cv`, which returns `CargoResult<Option<ConfigValue>>`. With the missing comma, loading the config fails and `get_cv` returns `Err`. `if let Ok(o_cv)` skips the block, and line 19 returns `false`. A file that does not parse gets the same answer as a key that is not there.',
			'`aliased_command` in `main.rs` asks for `alias.foo`, and on an error falls back to `config.get::<Option<Vec<String>>>`. That deserializer calls `has_key`, gets `false`, and runs `visitor.visit_none()` under the comment "Treat missing values as `None`." With no alias, Cargo looks for a command named `foo` and finds none.',
			'In the fix, `has_key` returns `CargoResult<bool>`. On line 12, `self.get_cv(key)?` sends the parse error back to the caller, and the call site in `de.rs` now reads `has_key(&self.key, self.env_prefix_ok)?`. Each `return true` is now `Ok(true)`, and line 19 is `Ok(false)`.',
			'Issue #11013, "Config errors with alias may not be reported", shows the missing comma and the output. [Pull request #11087](' + CARGO + '/pull/11087) says the change reaches further than aliases: "any use `Config::get<Option<…>>()` is affected if there is a malformed config."'
		]
	},
	quiz: [
		{
			q: '`.cargo/config` has a syntax error. What does `has_key` return for a key that is in that file?',
			options: [
				'`true`, because the key is written in the file',
				'`false`, because the `Err` skips the `if let` block',
				'It panics with the TOML parse error',
				'It returns the parse error to the caller'
			],
			answer: 1,
			why: '`get_cv` returns `Err` because the file does not parse. `if let Ok(...)` ignores it, no `return true` runs, and the method ends with `false`.'
		},
		{
			q: 'Which line in a code review should make you ask where the error goes?',
			options: [
				'`let value = parse(text)?;`',
				'`if let Ok(value) = parse(text) { use(value) }`',
				'`match parse(text) { Ok(v) => v, Err(e) => return Err(e) }`',
				'`parse(text).map_err(|e| e.context("config"))?`'
			],
			answer: 1,
			why: 'The other three send the error to the caller. `if let Ok` without an `else` drops it, and the code after it runs as if the call had found nothing.'
		},
		{
			q: 'How would you test the fixed `has_key`?',
			options: [
				'Write a config with a syntax error and check that the error is returned',
				'Call it with a key that exists and check that it returns `Ok(true)`',
				'Call it with an empty config and check that it returns `Ok(false)`',
				'Set an environment variable for the key and check for `Ok(true)`'
			],
			answer: 0,
			why: 'The three other cases already worked before the fix. Only a file that fails to parse tells the old code and the new code apart.'
		}
	],
	recall: {
		q: 'What did the old `has_key` return when `.cargo/config` did not parse, and why?',
		a: '`false`. Line 12 used `if let Ok(o_cv)`, which skips the block on `Err`, so the method reached `false` on line 19. The fix returns `CargoResult<bool>` and uses `get_cv(key)?`.'
	},
	sources: [
		{ title: 'cargo issue #11013', url: `${CARGO}/issues/11013` },
		{ title: 'cargo pull request #11087', url: `${CARGO}/pull/11087` }
	]
};
