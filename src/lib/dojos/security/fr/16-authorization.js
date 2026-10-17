const DC = 'https://github.com/discourse/discourse/blob/821e9e2f9f94483a3be8d1e077cde0fd94970479';
const POST_GUARDIAN = `${DC}/lib/guardian/post_guardian.rb`;
const GUARDIAN = `${DC}/lib/guardian.rb`;
const ENSURE = `${DC}/lib/guardian/ensure_magic.rb`;
const POSTS = `${DC}/app/controllers/posts_controller.rb`;
const ADVISORY = 'https://github.com/discourse/discourse/security/advisories/GHSA-crxf-p6jm-vpgw';
const FIX = 'https://github.com/discourse/discourse/commit/2b38af5b2241fb9c7578967cb30607d3382d7e1e';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'authorization',
	part: 'L’identité',
	title: 'L’autorisation : qui a le droit de faire quoi',
	minutes: 10,
	hook: [
		'Le 26 février 2026, Discourse publie l’avis GHSA-crxf-p6jm-vpgw, de sévérité haute (CVSS 7.5). Son annuaire des membres répondait à `GET /directory_items.json?period=all&user_field_ids=<id>` pour n’importe qui, visiteurs anonymes compris.',
		'Le paramètre `user_field_ids` acceptait n’importe quel identifiant de champ. Un champ qu’un admin avait déclaré privé, comme un numéro de téléphone ou une adresse, revenait pour chaque membre de l’annuaire. L’avis parle de « bulk exfiltration of private user data » (une extraction en masse de données privées).',
		'La connexion n’avait aucun défaut. Le serveur savait qui posait la question. Il ne vérifiait jamais si cette personne pouvait lire le champ 7.'
	],
	terms: [
		{ term: 'Authentification', def: 'Vérifier qui appelle : un mot de passe, un cookie de session, un jeton. Le résultat est un identifiant d’utilisateur, ou « anonyme ».' },
		{ term: 'Autorisation', def: 'Vérifier si cet appelant peut faire cette action sur cette ressource. Elle passe après l’authentification, à chaque requête.' },
		{ term: 'RBAC', def: 'Role-based access control : les permissions sont rattachées à des rôles comme `admin` ou `moderator`, et un utilisateur reçoit les permissions de ses rôles.' },
		{ term: 'IDOR', def: 'Insecure direct object reference : la requête porte un identifiant (`/invoices/1042`, `user_field_ids=7`) et le serveur renvoie l’objet sans vérifier que l’appelant y a droit.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['req["GET /directory_items.json?user_field_ids=7, sans connexion"] --> ctl["DirectoryItemsController#index"]'],
				highlight: ['req'],
				note: 'La requête n’a besoin d’aucune session. Le visiteur met dans l’URL l’identifiant d’un champ privé, ici 7. Le contrôleur lit les identifiants comme des entiers avec `map(&:to_i)` : le visiteur peut essayer chaque nombre l’un après l’autre.'
			},
			{
				add: ['ctl -->|"avant le correctif : chaque id est utilisé"| leak["Le champ 7 de chaque membre dans la réponse"]'],
				highlight: ['leak'],
				note: 'Avant le correctif, le contrôleur coupait le paramètre sur `|` et passait chaque identifiant au sérialiseur. Aucune ligne ne demandait si l’appelant pouvait voir le champ 7. Le JSON affichait ce champ pour tout l’annuaire.'
			},
			{
				add: ['ctl -->|"après le correctif"| filter["ids & ids autorisés : tous les champs pour le staff, les champs publics pour les autres"]', 'filter --> ok["Seulement des champs publics dans la réponse"]'],
				highlight: ['filter', 'ok'],
				note: 'Le commit de correction construit `allowed_field_ids` : tous les champs pour le staff, `UserField.public_fields` pour les autres. Il croise ensuite les identifiants demandés avec cette liste grâce au `&` de Ruby. Pour un visiteur anonyme, le champ 7 disparaît.'
			},
			{
				add: ['edit["PUT /posts/42 par l’utilisateur 9"] --> guard["guardian.ensure_can_edit!(post)"]', 'guard -->|"can_edit_post? vaut false"| deny["Discourse::InvalidAccess : HTTP 403"]'],
				highlight: ['guard', 'deny'],
				note: 'Même règle pour les écritures. `PostsController#update` charge le message 42 et appelle `guardian.ensure_can_edit!(post)` avant toute modification. Si `can_edit_post?` renvoie false, l’appel lève `Discourse::InvalidAccess`, et le contrôleur applicatif répond 403.'
			}
		]
	},
	example: {
		title: 'lib/guardian/post_guardian.rb : can_edit_post?, un objet à la fois',
		repo: 'discourse/discourse',
		url: `${POST_GUARDIAN}#L156-L206`,
		lang: 'ruby',
		code: `  def can_edit_post?(post)
    return false if Discourse.static_doc_topic_ids.include?(post.topic_id) && !is_admin?

    return true if is_admin?

    # Must be staff to edit a locked post
    return false if post.locked? && !is_staff?

    # Staff in edit groups skip visibility (e.g. deleted topics); non-staff must pass it
    if is_in_edit_post_groups?
      return can_create_post?(post.topic) if is_staff?
      return can_create_post?(post.topic) if can_see_post_topic?(post)
      return false
    end
    return false if !can_see_post_topic?(post)
    return can_create_post?(post.topic) if is_category_group_moderator?(post.topic&.category)

    return false if post.topic&.archived? || post.user_deleted || post.deleted_at
…
    return false if !trusted_with_post_edits?

    if is_my_own?(post)
      return false if !is_staff? && !visible_post_types.include?(post.post_type)
      return false if @user.silenced?

      return can_edit_hidden_post?(post) if post.hidden?

      if post.is_first_post? && post.topic.category_allows_unlimited_owner_edits_on_first_post?
        return true
      end

      return !post.edit_time_limit_expired?(@user)
    end

    if post.is_category_description?
      return true if can_edit_category_description?(post.topic.category)
    end

    false
  end`,
		notes: [
			'Les lignes 4 et 7 testent des rôles : `is_admin?` renvoie true tout de suite, et un message verrouillé demande `is_staff?`. Dans Discourse, le staff regroupe les admins et les modérateurs. Ces deux lignes font du RBAC.',
			'La ligne 15 est le contrôle objet par objet : `can_see_post_topic?(post)` demande si cet utilisateur peut lire le sujet de ce message. Qui ne peut pas lire une catégorie privée ne peut pas y modifier un message, même avec son identifiant.',
			'La ligne 22 compare l’auteur du message avec l’appelant. [`is_my_own?`](' + GUARDIAN + '#L690-L696) renvoie `obj.user_id == @user.id`, et false pour un anonyme. Ce test bloque une IDOR sur `/posts/42`.',
			'La dernière ligne renvoie `false`. Un message qui ne correspond à aucune règle au-dessus reste non modifiable. L’OWASP Authorization Cheat Sheet appelle ça « deny-by-default » (refuser par défaut).',
			'Le contrôleur passe par [`ensure_can_edit!`](' + ENSURE + '#L5-L18) : `EnsureMagic` traduit `ensure_X!` en `X?` et lève `Discourse::InvalidAccess` si la réponse est false. `PostsController#update` fait cet appel ligne 214, avant de lire `params[:post][:raw]`.'
		]
	},
	tradeoff: {
		gain: [
			'Les règles des messages sont rangées dans un seul module, `PostGuardian`. Une relectrice lit `can_edit_post?` une fois, sans chercher des tests dans chaque action de contrôleur.',
			'Une règle peut mêler rôles et objets : `is_admin?`, `is_my_own?(post)` et `can_see_post_topic?(post)` sont dans la même méthode.',
			'Un contrôleur n’a besoin que d’une ligne, `guardian.ensure_can_edit!(post)`, et un refus donne toujours le même 403.'
		],
		cost: [
			'Une classe centrale ne protège pas une action qui ne l’appelle pas. L’annuaire construisait sa propre liste de champs et sautait la règle de visibilité de `Guardian#allowed_user_field_ids`.',
			'Dans `Guardian#can_do?`, un utilisateur connecté passe quand la classe de l’objet n’a pas de méthode `can_edit_<class>?`. Un nouveau modèle est modifiable par tout utilisateur connecté tant que personne n’a écrit sa règle.',
			'Chaque contrôle d’objet peut coûter une requête SQL, comme `can_see_topic?` pour chaque message. Discourse garde le résultat par sujet dans `@can_see_post_topic`.'
		]
	},
	task: {
		prompt: 'Trouve le trou et écris la correction. Une API Node sert des factures : `app.get(\'/invoices/:id\', requireLogin, async (req, res) => { const rows = await db.query(\'SELECT * FROM invoices WHERE id = $1\', [req.params.id]); if (!rows.length) return res.sendStatus(404); res.json(rows[0]); })`. `requireLogin` rejette les requêtes sans session valide et remplit `req.user`. Alice possède la facture 1041, Bob la 1042.',
		hint: 'Connecte-toi comme Alice et demande `/invoices/1042`. Quelle ligne sait qui est Alice, et quelle ligne s’en sert ?',
		answer: [
			'Le trou : `requireLogin` ne vérifie que l’authentification. La requête SQL n’utilise jamais `req.user`, donc Alice lit la facture 1042 de Bob en changeant un chiffre : une IDOR.',
			'La correction : limiter la recherche à l’appelant. `SELECT * FROM invoices WHERE id = $1 AND owner_id = $2` avec `[req.params.id, req.user.id]`. L’OWASP IDOR Cheat Sheet dit « use datasets that users have access to » et montre `@current_user.projects.find(params[:id])` en Rails.',
			'Garde le 404 pour « cette facture n’existe pas » comme pour « elle n’est pas à toi ». La fiche OWASP conseille de « map both cases to the same public response » : Alice ne peut pas savoir que la 1042 existe.',
			'Teste comme la fiche le décrit : crée les utilisateurs A et B, chacun avec une facture, connecte-toi comme A et demande l’identifiant de B en lecture, en modification et en suppression. Des UUID rendent la devinette plus dure, mais le contrôle reste nécessaire quand un lien fuit.'
		]
	},
	quiz: [
		{
			q: 'Un utilisateur connecté remplace `/invoices/1041` par `/invoices/1042` et voit la facture de quelqu’un d’autre. Qu’est-ce qui manque ?',
			options: [
				'L’authentification : le cookie de session n’est pas vérifié sur cette route',
				'Un contrôle qui vérifie que la facture 1042 appartient à l’appelant',
				'Un test de rôle : seul le rôle `billing` devrait lister les factures',
				'Une limite de débit : il ne devrait pas pouvoir essayer autant d’identifiants'
			],
			answer: 1,
			why: 'L’utilisateur est connecté, donc l’authentification a marché. Le serveur a renvoyé l’objet désigné par l’identifiant sans comparer son propriétaire avec l’appelant. Un test de rôle laisserait encore chaque utilisateur `billing` lire toutes les factures, et une limite de débit ne fait que ralentir.'
		},
		{
			q: 'Comment le correctif de Discourse pour GHSA-crxf-p6jm-vpgw choisit-il les `user_field_ids` à garder ?',
			options: [
				'Il rejette toute la requête en 403 dès qu’un identifiant est privé',
				'Il garde seulement les identifiants de la page de membres demandée',
				'Il les croise avec tous les champs pour le staff, les publics sinon',
				'Il exige une connexion avant tout appel à l’annuaire'
			],
			answer: 2,
			why: 'Le commit construit `allowed_field_ids` à partir de `UserField.pluck(:id)` pour le staff et de `UserField.public_fields.pluck(:id)` pour les autres, puis applique `& allowed_field_ids`. Les anonymes peuvent toujours consulter l’annuaire, avec les champs publics seulement.'
		},
		{
			q: 'Une équipe remplace les identifiants numériques des factures par des UUID aléatoires et retire le contrôle du propriétaire, « puisque personne ne peut les deviner ». Que dit l’OWASP IDOR Cheat Sheet ?',
			options: [
				'Rien de plus à faire, des identifiants aléatoires ne se devinent pas',
				'Rien de plus à faire si les UUID sont aussi chiffrés',
				'Rien de plus à faire si les identifiants ne sont jamais dans une URL',
				'Garder le contrôle : une URL obtenue doit rester bloquée'
			],
			answer: 3,
			why: 'La fiche : « If attackers obtain URLs for unauthorized objects, the application should still block their access attempts. » Elle classe les identifiants aléatoires comme une défense en profondeur seulement. Elle dit aussi « Avoid encrypting identifiers ».'
		}
	],
	recall: {
		q: 'Dans `can_edit_post?` de Discourse, quel appel empêche l’utilisateur 9 de modifier un message écrit par l’utilisateur 12 ?',
		a: '`is_my_own?(post)`, qui compare `post.user_id` avec l’identifiant de l’appelant. S’il vaut false et qu’aucune autre règle ne s’applique, la méthode finit sur `false` et `ensure_can_edit!` lève un 403.'
	},
	sources: [
		{ title: 'Avis Discourse GHSA-crxf-p6jm-vpgw (CVE-2026-26265), IDOR dans l’annuaire', url: ADVISORY },
		{ title: 'Commit de correction Discourse 2b38af5, filtrage des champs privés de l’annuaire', url: FIX },
		{ title: 'Code Discourse, PostsController#update et ensure_can_edit!', url: `${POSTS}#L198-L214` },
		{ title: 'OWASP Top 10 2021, A01 Broken Access Control', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/' },
		{ title: 'OWASP Authorization Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html' },
		{ title: 'OWASP Insecure Direct Object Reference Prevention Cheat Sheet', url: 'https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html' }
	]
};
