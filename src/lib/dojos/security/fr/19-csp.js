const MASTODON = 'https://github.com/mastodon/mastodon/blob/7f90e0fd72457065096d13cdcbfd0713c88de933';
const ADVISORY = 'https://github.com/mastodon/mastodon/security/advisories/GHSA-2693-xr3m-jhqr';
const MDN = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'csp',
	part: 'Les entrées et les sorties',
	title: 'La Content Security Policy (CSP)',
	minutes: 10,
	hook: [
		'Le 19 septembre 2023, Mastodon publie GHSA-2693-xr3m-jhqr (CVE-2023-42452, CVSS 8.3). Un attaquant pouvait se servir de la traduction des messages « to bypass the server-side HTML sanitization, allowing unescaped HTML to execute in the browser ». Le correctif sort dans les versions 4.0.10, 4.1.8 et 4.2.0-rc2.',
		'Le nettoyeur HTML avait échoué, et le HTML de l’attaquant arrivait dans la page. L’avis jugeait pourtant les dégâts réduits : « The impact is limited thanks to Mastodon’s strict Content Security Policy, blocking inline scripts ».'
	],
	terms: [
		{ term: 'Content Security Policy', def: 'Un en-tête de réponse, `Content-Security-Policy`, qui liste d’où la page peut charger scripts, styles, images et autres ressources. Le navigateur refuse ce que la politique n’autorise pas.' },
		{ term: 'Nonce', def: 'Une valeur aléatoire que le serveur place à la fois dans l’en-tête (`script-src \'nonce-R4nd0m\'`) et sur chacune de ses propres balises `<script nonce="R4nd0m">`. Elle doit changer à chaque réponse.' },
		{ term: 'strict-dynamic', def: 'Un mot-clé de `script-src` : un script autorisé par un nonce ou un hash peut charger d’autres scripts, et ceux-là sont autorisés aussi.' },
		{ term: 'Mode report-only', def: 'La même politique envoyée en `Content-Security-Policy-Report-Only`. Le navigateur ne bloque rien et signale seulement ce qu’il aurait bloqué.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['bug["Un bug du nettoyeur laisse dans la page une balise img avec un gestionnaire onerror"] --> none["Sans CSP : le navigateur lance le gestionnaire"]'],
				highlight: ['bug', 'none'],
				note: 'On part de la XSS du jour 18 : l’échappement ou le nettoyage a échoué, et le balisage de l’attaquant est dans le HTML. Sans politique, le navigateur n’a aucune raison de refuser le gestionnaire en ligne.'
			},
			{
				add: ['bug --> csp["En-tête : script-src self + hôte des assets, sans unsafe-inline"]', 'csp --> blocked["Le navigateur refuse le gestionnaire en ligne et note une violation"]'],
				highlight: ['csp', 'blocked'],
				note: 'MDN : si une politique contient `default-src` ou `script-src`, le JavaScript en ligne ne s’exécute pas « unless extra measures are taken to enable it ». La règle vaut pour les blocs `<script>`, les attributs `onerror=` et les URL `javascript:`. La XSS est toujours dans la page, mais son script ne tourne pas.'
			},
			{
				add: ['csp --> own["Les scripts du site se chargent depuis des fichiers sur des hôtes autorisés"]'],
				highlight: ['own'],
				note: 'Le code du site doit alors vivre dans des fichiers `.js` servis par une origine autorisée, comme `\'self\'` ou l’hôte des assets. Le mot-clé `\'unsafe-inline\'` rouvrirait la porte aux scripts en ligne, et MDN prévient qu’il « defeats much of the purpose of having a CSP ».'
			},
			{
				add: ['nonce["CSP stricte : script-src nonce-R4nd0m, nouvelle valeur à chaque réponse"] --> tag["Seules les balises script avec nonce=R4nd0m s’exécutent"]', 'tag -->|"strict-dynamic"| child["Les scripts ajoutés par un script à nonce s’exécutent aussi"]'],
				highlight: ['nonce', 'tag', 'child'],
				note: 'MDN recommande les politiques à base de nonce ou de hash, appelées CSP strictes, plutôt que des listes d’hôtes. L’attaquant ne peut pas deviner le nonce de cette réponse, donc la balise injectée ne l’a pas. `\'strict-dynamic\'` transmet la confiance aux scripts qu’un script autorisé crée.'
			},
			{
				add: ['ro["Content-Security-Policy-Report-Only"] -->|"même politique, non appliquée"| reports["Rapports de violation vers le point report-to"]'],
				highlight: ['ro', 'reports'],
				note: 'Pour essayer une politique sans casser le site, envoie-la en `Content-Security-Policy-Report-Only`. MDN : « The policy is not enforced, but any violations are sent to the reporting endpoint specified in the policy. » Quand les scripts du site n’apparaissent plus dans les rapports, envoie la même politique en `Content-Security-Policy`.'
			}
		]
	},
	example: {
		title: 'config/initializers/content_security_policy.rb : la politique de Mastodon',
		repo: 'mastodon/mastodon',
		url: `${MASTODON}/config/initializers/content_security_policy.rb#L15-L58`,
		lang: 'ruby',
		code: `Rails.application.config.content_security_policy do |p|
  p.base_uri        :none
  p.default_src     :none
  p.frame_ancestors :none
  p.font_src        :self, assets_host
  p.img_src         :self, :data, :blob, *media_hosts
  p.media_src       :self, :data, *media_hosts
  p.manifest_src    :self, assets_host

  if policy.sso_host.present?
    p.form_action :self, policy.sso_host
  else
    p.form_action :self
  end

  p.child_src  :self, :blob, assets_host
  p.worker_src :self, :blob, assets_host

  p.connect_src :self, :data, :blob, *media_hosts, Rails.configuration.x.streaming_api_base_url
  p.script_src  :self, assets_host, "'wasm-unsafe-eval'"
  p.frame_src   :self, :https
  p.style_src   :self, assets_host
…
# Report CSP violations to a specified URI
# For further information see the following documentation:
# https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy-Report-Only
# Rails.application.config.content_security_policy_report_only = true

Rails.application.config.content_security_policy_nonce_generator = ->(_request) { SecureRandom.base64(16) }

Rails.application.config.content_security_policy_nonce_directives = %w(style-src)`,
		notes: [
			'La ligne 3, `default_src :none`, bloque tous les types de ressources qui n’ont pas de directive à eux. Chaque type dont l’appli a besoin est ensuite ouvert sur sa propre ligne.',
			'La ligne 20 est celle sur laquelle l’avis s’appuie. `script_src` autorise `\'self\'`, l’hôte des assets et `\'wasm-unsafe-eval\'`, sans `\'unsafe-inline\'`. Un bloc `<script>` ou un attribut `onerror=` injecté par le bug de traduction ne s’exécute pas.',
			'La ligne 2, `base_uri :none`, limite les URL permises dans un élément `<base>`. La ligne 3 ne la couvre pas : la page MDN de `base-uri` indique qu’elle n’a pas de repli sur `default-src`, et « Not setting this allows any URL. »',
			'La ligne 29 fabrique un nonce avec `SecureRandom.base64(16)`, et la ligne 31 ne l’utilise que pour `style-src`. Le guide Rails : il « will generate a new random nonce for each request ». Le 17 octobre 2026, `curl -sI https://mastodon.social/about` montrait un `\'nonce-…\'` dans `style-src` et aucun dans `script-src`.',
			'La ligne 27 garde le mode report-only comme un interrupteur en commentaire. Avec `content_security_policy_report_only = true`, la même politique part en `Content-Security-Policy-Report-Only`.'
		]
	},
	tradeoff: {
		gain: [
			'Une XSS qui passe l’échappement ou le nettoyage doit encore passer le navigateur. L’avis de Mastodon attribue à la politique l’impact limité de la CVE-2023-42452.',
			'La politique tient en un en-tête, réglé dans un seul initializer Rails, et elle couvre toutes les pages de l’appli.'
		],
		cost: [
			'Chaque `<script>` en ligne et chaque `onclick=` de l’appli doit passer dans un fichier ou porter un nonce avant d’appliquer la politique.',
			'Un nonce change à chaque réponse, donc le HTML ne peut pas être un fichier statique en cache. Le guide Rails note que `SecureRandom.base64(16)` « is incompatible with conditional GET caching ».',
			'Une liste d’hôtes fait confiance à tous les scripts de ces hôtes. MDN cite un cas où intégrer Google Analytics demandait d’ajouter 187 domaines Google à la liste.',
			'`\'strict-dynamic\'` fait confiance à tout ce qu’un script autorisé charge. MDN : si ces scripts créent des éléments `<script>` « based on potential sources of XSS, then the CSP will not protect them ».'
		]
	},
	task: {
		prompt: 'Une appli envoie `Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://cdn.example.com; object-src \'none\'`. Un bug permet à un utilisateur d’enregistrer `<img src=x onerror=alert(1)>` dans sa bio. La politique l’arrête-t-elle ? Écris ensuite un `script-src` plus strict et dis comment tu le déploierais.',
		hint: 'Cherche le mot-clé qui autorise le JavaScript en ligne. Puis demande-toi ce que le serveur doit ajouter à chacune de ses propres balises script.',
		answer: [
			'Non. `\'unsafe-inline\'` autorise les gestionnaires d’événement en ligne, donc le `onerror` s’exécute. Les autres directives ne jouent aucun rôle dans cette attaque.',
			'Plus strict : `script-src \'nonce-{RANDOM}\' \'strict-dynamic\'; object-src \'none\'; base-uri \'none\'`, avec un `{RANDOM}` neuf à chaque réponse et la même valeur dans `nonce="..."` sur chaque balise `<script>` de l’appli. Sans `strict-dynamic`, c’est la CSP stricte à nonce montrée sur MDN.',
			'Envoie l’en-tête sur toutes les réponses, pas seulement sur les pages HTML. MDN : la politique « should be set on all responses to all requests, not just the main document ».',
			'Déploie-la d’abord en `Content-Security-Policy-Report-Only` avec un point `report-to`, corrige les scripts en ligne de l’appli qui apparaissent dans les rapports, puis envoie-la en `Content-Security-Policy`.'
		]
	},
	quiz: [
		{
			q: 'Une page envoie `script-src \'nonce-k3J9\' \'unsafe-inline\'`. Un attaquant injecte `<script>steal()</script>` sans nonce. Que fait un navigateur actuel ?',
			options: [
				'Il exécute le script, puisque `\'unsafe-inline\'` autorise le code en ligne',
				'Il le bloque : avec un nonce, `\'unsafe-inline\'` est ignoré',
				'Il l’exécute seulement s’il était dans le HTML au chargement',
				'Il bloque toute la page et affiche une erreur CSP à la place'
			],
			answer: 1,
			why: 'MDN : « If a directive contains nonce or hash expressions, then the unsafe-inline keyword is ignored by browsers. » Seules les balises `<script>` avec `nonce="k3J9"` s’exécutent, et la balise injectée n’en a pas.'
		},
		{
			q: 'Une équipe écrit `script-src \'nonce-12345\'` dans sa config nginx et ajoute `nonce="12345"` à chaque balise script de ses gabarits. Qu’est-ce qui ne va pas ?',
			options: [
				'Rien, tant que la valeur est assez longue pour ne pas être devinée',
				'Les nonces ne marchent que sur `<style>`, pas sur `<script>`',
				'nginx ne peut pas envoyer d’en-tête CSP, seul le serveur d’appli peut',
				'Le nonce ne change jamais : un attaquant le lit et le réutilise'
			],
			answer: 3,
			why: 'MDN : « the nonce must be different for every HTTP response, and must not be predictable. » Une valeur fixe se lit dans le source de n’importe quelle page, et une balise injectée peut la porter. Les nonces marchent sur `<script>` comme sur `<style>`.'
		},
		{
			q: 'Que se passe-t-il quand une réponse porte un en-tête `Content-Security-Policy-Report-Only` ?',
			options: [
				'Le navigateur ne bloque rien et signale ce que la politique bloquerait',
				'Le navigateur bloque les scripts mais laisse passer styles et images',
				'Le navigateur applique la politique et envoie un rapport par blocage',
				'Le navigateur l’ignore sauf si la page a aussi une CSP en `<meta>`'
			],
			answer: 0,
			why: 'MDN : « The policy is not enforced, but any violations are sent to the reporting endpoint specified in the policy. » Si un en-tête qui applique la politique est aussi présent, les deux sont respectés. Une politique report-only ne peut pas passer par un élément `<meta>`.'
		}
	],
	recall: {
		q: 'Dans la CVE-2023-42452 de Mastodon, quel réglage de `script_src` a empêché le HTML injecté de lancer des scripts ?',
		a: '`p.script_src :self, assets_host, "\'wasm-unsafe-eval\'"` : pas de `\'unsafe-inline\'`, donc le navigateur refuse les blocs `<script>` en ligne et les gestionnaires d’événement.'
	},
	sources: [
		{ title: 'Avis Mastodon GHSA-2693-xr3m-jhqr (CVE-2023-42452), XSS stockée via la traduction', url: ADVISORY },
		{ title: 'MDN, guide Content Security Policy (CSP)', url: MDN },
		{ title: 'MDN, en-tête Content-Security-Policy-Report-Only', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy-Report-Only' },
		{ title: 'Guide Rails, Securing Rails Applications : en-tête Content Security Policy', url: 'https://guides.rubyonrails.org/security.html#content-security-policy-header' },
		{ title: 'Code Mastodon, config/initializers/content_security_policy.rb', url: `${MASTODON}/config/initializers/content_security_policy.rb` }
	]
};
