const CARGO = 'https://github.com/rust-lang/cargo';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'swallowed-error',
	part: 'La logique',
	title: 'Une erreur de parsing de config affichée comme commande inconnue',
	minutes: 10,
	hook: [
		'Un utilisateur définit un alias Cargo dans `.cargo/config` et oublie une virgule : `foo = ["a" "b"]`. `cargo foo` affiche **"error: no such subcommand: `foo`"** et propose `doc`. Rien ne parle du fichier de config ni de l’erreur de syntaxe.',
		'Cargo lit les réglages optionnels avec serde. Pour une valeur `Option`, il appelle d’abord `has_key`, ci-dessous. Si `has_key` renvoie `false`, serde traite la valeur comme absente et renvoie `None`. `get_cv` lit les fichiers de config et renvoie une `Err` quand l’un d’eux ne se parse pas.'
	],
	terms: [
		{ term: 'Result', def: 'Une valeur Rust qui vaut soit `Ok(valeur)`, soit `Err(erreur)`. `CargoResult<T>` est le nom que Cargo donne à un `Result` avec son type d’erreur.' },
		{ term: 'if let Ok(x)', def: 'Exécute le bloc seulement si la valeur est `Ok`. Sur `Err`, le bloc est sauté et l’erreur est perdue.' },
		{ term: 'L’opérateur ?', def: 'Sur `Err`, renvoie tout de suite l’erreur à l’appelant. Sur `Ok`, donne la valeur à l’intérieur.' },
		{ term: 'Alias', def: 'Un nom dans la table `[alias]` d’une config Cargo qui se déplie en une autre commande, ici `cargo foo` en `cargo a b`.' }
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
			'La ligne 12 appelle `get_cv`, qui renvoie `CargoResult<Option<ConfigValue>>`. Avec la virgule manquante, le chargement de la config échoue et `get_cv` renvoie `Err`. `if let Ok(o_cv)` saute le bloc, et la ligne 19 renvoie `false`. Un fichier qui ne se parse pas reçoit la même réponse qu’une clé absente.',
			'`aliased_command`, dans `main.rs`, demande `alias.foo`, et sur une erreur se rabat sur `config.get::<Option<Vec<String>>>`. Ce désérialiseur appelle `has_key`, obtient `false`, et lance `visitor.visit_none()` sous le commentaire "Treat missing values as `None`." Sans alias, Cargo cherche une commande nommée `foo` et n’en trouve pas.',
			'Avec le correctif, `has_key` renvoie `CargoResult<bool>`. À la ligne 12, `self.get_cv(key)?` renvoie l’erreur de parsing à l’appelant, et l’appel dans `de.rs` s’écrit maintenant `has_key(&self.key, self.env_prefix_ok)?`. Chaque `return true` s’écrit `Ok(true)`, et la ligne 19 `Ok(false)`.',
			'Le ticket #11013, "Config errors with alias may not be reported", montre la virgule manquante et la sortie. La [pull request #11087](' + CARGO + '/pull/11087) dit que le changement va plus loin que les alias : "any use `Config::get<Option<…>>()` is affected if there is a malformed config." (tout appel de ce type est concerné quand la config est mal formée).'
		]
	},
	quiz: [
		{
			q: '`.cargo/config` contient une erreur de syntaxe. Que renvoie `has_key` pour une clé qui est dans ce fichier ?',
			options: [
				'`true`, parce que la clé est écrite dans le fichier',
				'`false`, parce que l’`Err` saute le bloc `if let`',
				'Il panique avec l’erreur de parsing TOML',
				'Il renvoie l’erreur de parsing à l’appelant'
			],
			answer: 1,
			why: '`get_cv` renvoie `Err` parce que le fichier ne se parse pas. `if let Ok(...)` l’ignore, aucun `return true` ne s’exécute, et la méthode finit sur `false`.'
		},
		{
			q: 'Quelle ligne, en revue de code, doit te faire demander où part l’erreur ?',
			options: [
				'`let value = parse(text)?;`',
				'`if let Ok(value) = parse(text) { use(value) }`',
				'`match parse(text) { Ok(v) => v, Err(e) => return Err(e) }`',
				'`parse(text).map_err(|e| e.context("config"))?`'
			],
			answer: 1,
			why: 'Les trois autres renvoient l’erreur à l’appelant. `if let Ok` sans `else` la perd, et le code qui suit tourne comme si l’appel n’avait rien trouvé.'
		},
		{
			q: 'Comment testerais-tu le `has_key` corrigé ?',
			options: [
				'Écrire une config avec une erreur de syntaxe et vérifier que l’erreur remonte',
				'L’appeler avec une clé qui existe et vérifier qu’il renvoie `Ok(true)`',
				'L’appeler avec une config vide et vérifier qu’il renvoie `Ok(false)`',
				'Définir une variable d’environnement pour la clé et attendre `Ok(true)`'
			],
			answer: 0,
			why: 'Les trois autres cas marchaient déjà avant le correctif. Seul un fichier qui ne se parse pas distingue l’ancien code du nouveau.'
		}
	],
	recall: {
		q: 'Que renvoyait l’ancien `has_key` quand `.cargo/config` ne se parsait pas, et pourquoi ?',
		a: '`false`. La ligne 12 utilisait `if let Ok(o_cv)`, qui saute le bloc sur `Err`, donc la méthode arrivait au `false` de la ligne 19. Le correctif renvoie `CargoResult<bool>` et utilise `get_cv(key)?`.'
	},
	sources: [
		{ title: 'cargo, ticket #11013', url: `${CARGO}/issues/11013` },
		{ title: 'cargo, pull request #11087', url: `${CARGO}/pull/11087` }
	]
};
