const RAILS = 'https://github.com/rails/rails/blob/ccaef690ee7a1f1d02642edd5f710daf031e7e04';
const SP = RAILS + '/actionpack/lib/action_controller/metal/strong_parameters.rb';
const GH_POST = 'https://github.blog/news-insights/the-library/public-key-security-vulnerability-and-mitigation/';
const ZOD = 'https://github.com/colinhacks/zod/blob/680d19f7d1e042e55934209caeb79bc843b94f44/packages/docs/content/api.mdx';
const OWASP = 'https://github.com/OWASP/CheatSheetSeries/blob/1a78ae3e443cef156e947f87e892efbcc62876ee/cheatsheets';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'input-validation',
	part: 'Les entrées et les sorties',
	title: 'Valider les entrées à la frontière',
	minutes: 10,
	hook: [
		'Le 4 mars 2012 à 8 h 49, heure du Pacifique, un utilisateur de GitHub ajoute sa propre clé publique à l’organisation `rails`, via le formulaire de mise à jour des clés de GitHub. Il pousse ensuite un nouveau fichier dans le projet Rails pour montrer la faille. GitHub déploie un correctif à 9 h 53 et trouve trois comptes compromis.',
		'Tom Preston-Werner publie [le billet](' + GH_POST + ') le soir même : "The root cause of the vulnerability was a failure to properly check incoming form parameters, a problem known as the mass-assignment vulnerability" (les paramètres du formulaire n’étaient pas vérifiés).',
		'Le 21 mars 2012, DHH annonce les strong parameters sur le blog de Rails, pour "move mass-assignment protection out of the model and into the controller where it belongs". Le 30 mars, Rails 3.2.3 met `config.active_record.whitelist_attributes` à true dans les nouvelles applis. Rails 4.0 sort le 25 juin 2013 avec les strong parameters activés par défaut.',
		'La correction s’applique à n’importe quelle stack. Le handler liste les champs qu’il accepte, lit le corps une seule fois contre cette liste, et ne transmet au modèle que le résultat.'
	],
	terms: [
		{ term: 'Mass assignment', def: 'Passer tout le hash de la requête à un modèle en un seul appel, comme `Person.create(params[:person])`. Chaque clé de la requête remplit l’attribut du même nom.' },
		{ term: 'Liste d’autorisation', def: 'La liste des champs et des valeurs que le code accepte. Tout le reste est écarté ou refusé. Le guide sécurité de Rails parle de "permitted list".' },
		{ term: 'Liste de blocage', def: 'Une liste de champs ou de valeurs connus comme dangereux, par exemple `admin`. Tout ce qui n’y figure pas passe. Le guide de Rails parle de "restricted list".' },
		{ term: 'Schéma', def: 'La déclaration des champs, des types et des longueurs maximales qu’une requête peut porter, par exemple un `z.strictObject({ ... })` de zod. Lire le corps avec lui renvoie une valeur typée ou une erreur.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['form["Le formulaire affiche name et email"] --> req["POST /people"]', 'req --> create["Person.create(params[:person])"]', 'create --> row["ligne people : name, email, admin"]'],
				highlight: ['form', 'create'],
				note: 'Le guide Action Controller de Rails prend cet exemple. Le formulaire a deux champs, et la table `people` a aussi une colonne booléenne `admin`. Le handler passe tout `params[:person]` au modèle.'
			},
			{
				add: ['extra["La requête ajoute person[admin]=1"] --> req', 'row --> admin["admin = true"]'],
				highlight: ['extra', 'admin'],
				note: 'Le client choisit chaque champ du corps, y compris ceux que le formulaire n’affiche pas. Le guide : "A malicious user could modify the HTML form to send this value and make themselves an admin without permission." Sans liste, `create` remplit aussi `admin`.'
			},
			{
				add: ['req --> deny["Liste de blocage : retire admin, garde le reste"]', 'deny --> role["La migration suivante ajoute role : absent de la liste, il passe"]'],
				highlight: ['deny', 'role'],
				note: 'Une liste de blocage doit citer chaque colonne sensible, y compris celles ajoutées l’an prochain. Le guide sécurité de Rails : "Permitted lists are also a good approach against the human factor of forgetting something in the restricted list."'
			},
			{
				add: ['req --> expect["params.expect(person: [:name, :email])"]', 'expect --> clean["Nouveau Parameters : name et email seulement, permitted: true"]', 'clean --> ok["Person.create(clean)"]'],
				highlight: ['expect', 'clean', 'ok'],
				note: 'La version avec liste d’autorisation nomme les deux champs du formulaire. `expect` construit un nouvel objet avec ces seules clés : `admin` et `role` n’arrivent jamais au modèle. Si `person` manque, Rails répond `400 Bad Request`.'
			},
			{
				add: ['create --> err["ActiveModel::ForbiddenAttributesError"]'],
				highlight: ['err'],
				note: 'Depuis Rails 4.0, la ligne de l’étape 1 lève une erreur au lieu d’enregistrer. Active Model appelle `permitted?` sur le hash et lève `ForbiddenAttributesError` quand la réponse est false.'
			}
		]
	},
	example: {
		title: 'strong_parameters.rb : permit_filters, la méthode derrière permit et expect',
		repo: 'rails/rails',
		url: `${SP}#L1189-L1206`,
		lang: 'ruby',
		code: `      def permit_filters(filters, on_unpermitted: nil, explicit_arrays: true)
        params = self.class.new

        filters.flatten.each do |filter|
          case filter
          when Symbol, String
            # Declaration [:name, "age"]
            permitted_scalar_filter(params, filter)
          when Hash
            # Declaration [{ person: ... }]
            hash_filter(params, filter, on_unpermitted:, explicit_arrays:)
          end
        end

        unpermitted_parameters!(params, on_unpermitted:)

        params.permit!
      end`,
		notes: [
			'La ligne 2 crée un `Parameters` neuf et vide. Les lignes 4 à 13 n’y copient que les clés nommées par un filtre : une clé comme `admin`, qu’aucun filtre ne nomme, ne peut pas apparaître dans le résultat.',
			'La ligne 8 traite une clé simple comme `:email`. Elle ne copie la valeur que si son type figure dans [`PERMITTED_SCALAR_TYPES`](' + SP + '#L1391-L1405), par exemple String, Numeric, Date ou un fichier envoyé. Un hash envoyé sous `email` est écarté.',
			'La ligne 15 traite les clés laissées de côté. `permit` lui passe le réglage de classe `action_on_unpermitted_parameters`, et avec `:raise` elle lève "found unpermitted parameters: :a, :b". `expect` appelle `permit_filters(filters)` avec le défaut `nil` : il les écarte sans rien journaliser.',
			'La ligne 17 marque le nouvel objet comme autorisé. [Active Model](' + RAILS + '/activemodel/lib/active_model/forbidden_attributes_protection.rb#L27-L34) ne lève `ForbiddenAttributesError` que pour un objet dont `permitted?` renvoie false. Un `Hash` Ruby ordinaire, comme le résultat de `JSON.parse`, passe sans contrôle.'
		]
	},
	tradeoff: {
		gain: [
			'Une nouvelle colonne comme `role` reste hors de portée de tous les formulaires tant que personne ne l’ajoute à la liste `expect` du contrôleur.',
			'`z.strictObject` signale un problème `unrecognized_keys` pour un champ inconnu, et `permit` avec `:raise` lève `UnpermittedParameters`. Un client qui envoie un mauvais nom de champ échoue dans les tests.',
			'Après la lecture, le handler tient une seule valeur typée. Le `result.data` de zod ne contient que les clés déclarées, chacune sous sa limite `.max()`, et la suite du code ne revérifie plus les chaînes.'
		],
		cost: [
			'Chaque nouveau champ de formulaire demande une deuxième modification, dans la liste du contrôleur ou dans le schéma. En production, Rails écarte sans log un champ absent de la liste : le source donne le défaut "`:log` in test and development environments, `false` otherwise".',
			'Le refus strict casse les vieux clients qui envoient encore un champ que tu as retiré. `z.object` retire les clés inconnues au lieu de refuser la requête : tu choisis le mode endpoint par endpoint.',
			'Le schéma vérifie la forme des données, et le handler doit encore vérifier les droits. L’OWASP Input Validation Cheat Sheet : "a valid account identifier does not mean the caller may access that account."'
		]
	},
	task: {
		prompt: 'Un endpoint SvelteKit `PATCH /api/profile` fait `const body = await request.json()`, charge l’utilisateur courant, lance `Object.assign(user, body)` et enregistre. La table `users` a `name`, `email`, `bio`, `role` et `email_verified`. Le formulaire affiche `name`, `email` et `bio`. Écris la version avec liste d’autorisation en zod : name de 1 à 100 caractères, bio de 2000 au plus, un email valide, champs inconnus refusés avec un 400.',
		hint: 'Écris un seul `z.strictObject` avec les trois champs du formulaire, puis appelle `safeParse` sur le corps en haut du handler. Ne passe au modèle que `result.data`.',
		answer: [
			'Le schéma : `const ProfileUpdate = z.strictObject({ name: z.string().min(1).max(100), email: z.email().max(254), bio: z.string().max(2000).optional() })`. La limite de 254 sur l’email est un choix de cette réponse.',
			'Dans le handler : `const result = ProfileUpdate.safeParse(await request.json())`, puis `if (!result.success) return json({ issues: result.error.issues }, { status: 400 })`, puis `Object.assign(user, result.data)` et l’enregistrement.',
			'L’ancienne ligne copiait toutes les clés : un corps avec `"role": "admin"` ou `"email_verified": true` modifiait ces colonnes. Avec le schéma strict, ce même corps reçoit un 400 avec un problème `unrecognized_keys`, et rien n’est enregistré.',
			'La taille du corps est limitée avant que `request.json()` tourne : `adapter-node` lit `BODY_SIZE_LIMIT`, qui "Defaults to 512kb". En Rails, la même liste s’écrit `params.expect(user: [:name, :email, :bio])`.'
		],
		steps: [
			{
				title: 'Repère le trou',
				questions: [
					{ q: 'Que copie `Object.assign(user, body)` ?', options: ['Seulement les clés du formulaire', 'Seulement les clés que `user` a déjà', 'Chaque clé propre de `body`', 'Seulement les valeurs texte'], answer: 2, why: '`Object.assign` copie chaque clé propre de la source, que la cible l’ait ou non.' },
					{ q: 'Un client envoie `{ "role": "admin" }`. Que se passe-t-il ?', options: ['La colonne `role` passe à `admin`', 'SvelteKit l’écarte, car le formulaire ne l’a pas', 'L’enregistrement échoue sur une erreur de type', 'Rien : `role` est en lecture seule'], answer: 0, why: 'Le client contrôle chaque champ du corps, y compris ceux que le formulaire n’a jamais affichés.' },
					{ q: 'Comment s’appelle ce genre de trou ?', options: ['Path traversal', 'Mass assignment', 'Désérialisation dangereuse', 'Cross-site request forgery'], answer: 1, why: 'Passer tout le hash de la requête à un modèle en un appel, c’est du mass assignment. L’incident GitHub de 2012 venait de là.' },
					{ q: 'Pourquoi ne pas juste retirer `role` et `email_verified` de `body` ?', options: ['C’est plus lent qu’un schéma', 'JavaScript ne sait pas retirer une clé d’un JSON lu', 'Zod l’interdit', 'Une liste de blocage rate la prochaine colonne ajoutée par une migration'], answer: 3, why: 'Une liste de blocage doit nommer chaque colonne sensible, y compris celles de l’an prochain. Une liste d’autorisation les écarte toutes par défaut.' }
				]
			},
			{
				title: 'Liste les champs',
				questions: [
					{ q: 'Quels champs vont dans la liste d’autorisation ?', options: ['`name`, `email`, `bio`', '`name`, `email`, `bio`, `role`', 'Toutes les colonnes de `users`', '`role` et `email_verified`'], answer: 0, why: 'La liste, ce sont les champs que montre le formulaire. Tout le reste reste dehors.' },
					{ q: 'Quelle limite pour `name` ?', options: ['2000 caractères au plus', 'De 1 à 100 caractères', '254 caractères au plus', 'Aucune, la base vérifie'], answer: 1, why: 'L’énoncé demande un name de 1 à 100 caractères : `z.string().min(1).max(100)`.' },
					{ q: 'Quel schéma zod 4 vérifie le format de l’email ?', options: ['`z.string().includes("@")`', '`z.string().max(254)`', '`z.email()`', '`z.url()`'], answer: 2, why: '`z.email()` valide le format. La réponse ajoute `.max(254)`, qui est son propre choix.' },
					{ q: 'Quelle règle pour `bio` ?', options: ['Obligatoire, de 1 à 2000 caractères', 'Obligatoire, sans limite', 'Retiré, car c’est du texte libre', 'Optionnel, 2000 caractères au plus'], answer: 3, why: '`z.string().max(2000).optional()` laisse le formulaire l’omettre et borne sa taille.' }
				]
			},
			{
				title: 'Choisis le mode d’objet',
				questions: [
					{ q: 'Les champs inconnus doivent être refusés avec un 400. Quel constructeur zod ?', options: ['`z.object`', '`z.strictObject`', '`z.looseObject`', '`z.record`'], answer: 1, why: '`z.strictObject` signale un problème `unrecognized_keys` pour tout champ qu’il ne déclare pas.' },
					{ q: 'Que ferait un simple `z.object` de `"role": "admin"` ?', options: ['Le retirer du résultat', 'Lever une erreur `unrecognized_keys`', 'Le garder dans le résultat', 'Lever une erreur car `role` n’a pas de type'], answer: 0, why: 'La doc de zod : "By default, unrecognized keys are *stripped* from the parsed result".' },
					{ q: 'Et `z.looseObject` ?', options: ['Il le retire', 'Il lève une erreur', 'Il le convertit en chaîne', 'Il le garde dans le résultat'], answer: 3, why: '`z.looseObject` laisse passer les clés inconnues, donc `role` atteindrait le modèle.' },
					{ q: 'Pourquoi un autre endpoint choisirait-il `z.object` plutôt que strict ?', options: ['Il est plus rapide', 'Il vérifie les types plus strictement', 'De vieux clients envoient encore un champ retiré, et le mode strict les casserait', 'Il vérifie aussi les droits de l’utilisateur'], answer: 2, why: 'Le refus strict casse les vieux clients. Tu choisis le mode endpoint par endpoint.' }
				]
			},
			{
				title: 'Branche-le dans le handler',
				questions: [
					{ q: 'Quel appel lit le corps sans lever d’exception ?', options: ['`ProfileUpdate.safeParse(await request.json())`', '`ProfileUpdate.parse(request)`', '`JSON.parse(ProfileUpdate)`', '`ProfileUpdate.check(body)`'], answer: 0, why: '`safeParse` renvoie `{ success, data }` ou `{ success: false, error }`, et le handler peut répondre 400.' },
					{ q: 'Que passes-tu à `Object.assign` ?', options: ['`body`', '`result.data`', '`result`', '`{ ...body, ...result.data }`'], answer: 1, why: '`result.data` ne contient que les clés déclarées, chacune dans sa limite.' },
					{ q: 'Un corps avec `"email_verified": true` arrive. Que reçoit le client ?', options: ['200, et le drapeau est enregistré', '200, et le drapeau est ignoré', '500, car le schéma lève une erreur', '400 avec un problème `unrecognized_keys`, rien d’enregistré'], answer: 3, why: 'Le schéma strict refuse la clé inconnue, et le handler répond avant d’enregistrer.' },
					{ q: 'Que ne vérifie toujours pas le schéma ?', options: ['La longueur de `bio`', 'Le format de `email`', 'Si l’appelant a le droit de modifier ce compte', 'Les champs inconnus'], answer: 2, why: 'OWASP : "a valid account identifier does not mean the caller may access that account." Le handler vérifie les droits à part.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un contrôleur Rails 4.0 ou plus récent lance `User.create(params[:user])` sans `permit` ni `expect`. Que se passe-t-il ?',
			options: [
				'Il lève `ActiveModel::ForbiddenAttributesError`',
				'Il crée l’utilisateur et remplit chaque attribut de la requête',
				'Il crée l’utilisateur avec les seuls attributs du formulaire',
				'Il écarte les clés inconnues et les journalise en DEBUG'
			],
			answer: 0,
			why: '`params[:user]` est un objet `ActionController::Parameters` dont `permitted?` renvoie false. Active Model le vérifie avant d’affecter et lève `ForbiddenAttributesError`. Rails ne sait pas quels champs le formulaire affichait.'
		},
		{
			q: 'Un handler Node fait `const { admin, ...rest } = body; Object.assign(user, rest)`. Un mois plus tard, une migration ajoute une colonne `role`. Que fait un corps avec `"role": "owner"` ?',
			options: [
				'Il est refusé, car `rest` ne garde que les clés du formulaire',
				'Il lève une erreur, car `role` n’existait pas à l’écriture du code',
				'Il met `role` à `"owner"`, car le code ne retire que `admin`',
				'Il est ignoré, car `Object.assign` saute les clés absentes de l’objet'
			],
			answer: 2,
			why: 'La déstructuration est une liste de blocage : elle retire la seule clé qu’elle nomme et garde le reste. `Object.assign` copie chaque clé propre de `rest` sur `user`, que `user` l’ait ou non. Seule une liste d’autorisation des champs du formulaire tient `role` à l’écart.'
		},
		{
			q: 'Avec zod 4, que renvoie `z.object({ name: z.string() }).parse({ name: "Ada", role: "admin" })` ?',
			options: [
				'Il lève une `ZodError` avec un problème `unrecognized_keys`',
				'`{ name: "Ada", role: "admin" }`, avec les deux clés',
				'Il lève une erreur car `role` n’a pas de type déclaré',
				'`{ name: "Ada" }`, sans `role`'
			],
			answer: 3,
			why: 'La doc de zod : "By default, unrecognized keys are *stripped* from the parsed result" (les clés inconnues sont retirées). `z.strictObject` lève une erreur sur une clé inconnue, et `z.looseObject` la garde.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Voir `Object.assign` remplir une colonne que le formulaire n’a jamais affichée, puis la bloquer avec un schéma zod strict.',
		steps: [
			'Prépare : `mkdir -p ~/zod-lab && cd ~/zod-lab && npm init -y && npm install zod@4`.',
			'Fais un mass assignment : `node -e \'const user = { name: "Ada", role: "user", email_verified: false }; Object.assign(user, JSON.parse(process.argv[1])); console.log(user)\' \'{"name":"Eve","role":"admin","email_verified":true}\'`.',
			'Écris `profile.mjs` : importe `z` depuis `zod`, déclare `ProfileUpdate` avec `z.strictObject` (name de 1 à 100, email, bio optionnel de 2000 au plus), lance `safeParse` sur `JSON.parse(process.argv[2])`, et affiche `result.data` ou les codes des problèmes.',
			'Essaie trois corps : `node profile.mjs \'{"name":"Eve","email":"eve@example.com"}\'`, puis le même avec `"role":"admin"` en plus, puis `\'{"name":"","email":"nope"}\'`.',
			'Remplace `z.strictObject` par `z.object` et relance le corps avec `role`.'
		],
		done: [
			'L’étape 2 affiche `role: \'admin\'` et `email_verified: true`.',
			'Le premier corps affiche `{ name: \'Eve\', email: \'eve@example.com\' }`.',
			'Le corps avec `role` affiche `[ \'unrecognized_keys\' ]`, et le troisième `[ \'too_small\', \'invalid_format\' ]`.',
			'Avec `z.object`, le corps avec `role` passe et `role` disparaît du résultat.'
		],
		solution: [
			'`import { z } from \'zod\';`',
			'`const ProfileUpdate = z.strictObject({ name: z.string().min(1).max(100), email: z.email().max(254), bio: z.string().max(2000).optional() });`',
			'`const result = ProfileUpdate.safeParse(JSON.parse(process.argv[2]));`',
			'`console.log(result.success ? result.data : result.error.issues.map((i) => i.code));`'
		]
	},
	recall: {
		q: 'En Rails, quel appel transforme `params` en objet qu’un modèle accepte, et que lève Active Model sans lui ?',
		a: '`params.expect(user: [:name, :email])` (ou `permit`) construit un nouveau `Parameters` avec les seules clés listées et le marque comme autorisé. Sans lui, `User.create(params[:user])` lève `ActiveModel::ForbiddenAttributesError`.'
	},
	sources: [
		{ title: 'GitHub Blog, Public Key Security Vulnerability and Mitigation (4 mars 2012)', url: GH_POST },
		{ title: 'Blog Rails, Strong parameters: Dealing with mass assignment in the controller instead of the model (21 mars 2012)', url: 'https://rubyonrails.org/2012/3/21/strong-parameters' },
		{ title: 'Blog Rails, Rails 3.2.3 has been released (30 mars 2012)', url: 'https://rubyonrails.org/2012/3/30/ann-rails-3-2-3-has-been-released' },
		{ title: 'Blog Rails, Rails 4.0: Final version released (25 juin 2013)', url: 'https://rubyonrails.org/2013/6/25/Rails-4-0-final' },
		{ title: 'Guides Rails, Action Controller Overview : Securing Submitted Parameters', url: RAILS + '/guides/source/action_controller_overview.md#L796-L823' },
		{ title: 'Guides Rails, Securing Rails Applications : Permitted Lists Versus Restricted Lists', url: RAILS + '/guides/source/security.md#L888-L900' },
		{ title: 'rails/rails, actionpack strong_parameters.rb', url: SP },
		{ title: 'Doc zod, z.object, z.strictObject et z.looseObject', url: ZOD + '#L1224-L1255' },
		{ title: 'Doc SvelteKit, adapter-node BODY_SIZE_LIMIT', url: 'https://github.com/sveltejs/kit/blob/dd2d9754840d013b882aa45c2019e68b84e6b1af/documentation/docs/25-build-and-deploy/40-adapter-node.md#L140-L142' },
		{ title: 'OWASP Input Validation Cheat Sheet', url: OWASP + '/Input_Validation_Cheat_Sheet.md' },
		{ title: 'OWASP Mass Assignment Cheat Sheet', url: OWASP + '/Mass_Assignment_Cheat_Sheet.md' }
	]
};
