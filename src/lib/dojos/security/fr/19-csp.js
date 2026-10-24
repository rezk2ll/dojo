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
		],
		steps: [
			{
				title: 'Lis la politique',
				questions: [
					{ q: 'Quelle directive décide si le gestionnaire `onerror` s’exécute ?', options: ['`default-src`', '`script-src`', '`object-src`', '`img-src`'], answer: 1, why: 'Les gestionnaires d’événement en ligne sont du JavaScript : c’est `script-src` qui les régit.' },
					{ q: 'Qu’autorise `\'unsafe-inline\'` dans `script-src` ?', options: ['Seulement les scripts de la même origine', 'Seulement les scripts de `https://cdn.example.com`', 'Les blocs `<script>` en ligne et les gestionnaires d’événement en ligne', 'Seulement `eval`'], answer: 2, why: 'C’est le mot-clé qui laisse tourner le JavaScript en ligne, celui que la politique de Mastodon laisse de côté.' },
					{ q: 'Que bloque `object-src \'none\'` ?', options: ['Les plugins comme `<object>` et `<embed>`', 'Les scripts en ligne', 'Les images', 'Tous les types de ressources'], answer: 0, why: 'Il ne couvre que le contenu des plugins. Il ne fait rien contre un attribut `onerror`.' },
					{ q: 'Quelle directive manque et n’a pas de repli sur `default-src` ?', options: ['`script-src`', '`style-src`', '`img-src`', '`base-uri`'], answer: 3, why: 'MDN dit que `base-uri` n’a pas de repli : "Not setting this allows any URL."' }
				]
			},
			{
				title: 'Décide si elle arrête la bio',
				questions: [
					{ q: 'La bio contient `<img src=x onerror=alert(1)>`. La politique l’arrête-t-elle ?', options: ['Oui : `default-src \'self\'` la bloque', 'Non : `\'unsafe-inline\'` laisse tourner le gestionnaire en ligne', 'Oui : `object-src \'none\'` la bloque', 'Seulement en mode report-only'], answer: 1, why: 'Le gestionnaire est du JavaScript en ligne, et `\'unsafe-inline\'` autorise justement ça.' },
					{ q: '`https://cdn.example.com` dans la liste compte-t-il pour cette attaque ?', options: ['Oui : le gestionnaire est chargé depuis lui', 'Oui : il annule `\'unsafe-inline\'`', 'Non : l’attaque ne charge rien depuis aucun hôte', 'Seulement si le CDN est en panne'], answer: 2, why: 'Le script est en ligne dans la page. Les listes d’hôtes ne règlent que la provenance des fichiers de script.' },
					{ q: 'Pourquoi le bug du nettoyeur de Mastodon a-t-il fait moins de dégâts ?', options: ['Son `script-src` n’avait pas `\'unsafe-inline\'` : les scripts en ligne injectés ne tournaient pas', 'Il n’avait pas de `default-src`', 'Il était en mode report-only', 'Son nonce était dans `script-src`'], answer: 0, why: 'L’avis : l’impact était limité par une CSP stricte "blocking inline scripts" (qui bloque les scripts en ligne).' },
					{ q: 'Qu’est la CSP dans cette histoire, à côté du nettoyeur ?', options: ['Un remplaçant du nettoyeur', 'Un moyen de trouver les XSS', 'Un filtre côté serveur', 'Une seconde couche qui limite les dégâts quand la première cède'], answer: 3, why: 'Le HTML est bien arrivé dans la page. La CSP a seulement empêché le navigateur de l’exécuter.' }
				]
			},
			{
				title: 'Écris un `script-src` plus strict',
				questions: [
					{ q: 'Quel `script-src` remplace la liste d’hôtes ?', options: ['`script-src \'self\' \'unsafe-inline\'`', '`script-src *`', '`script-src \'nonce-{RANDOM}\' \'strict-dynamic\'`', '`script-src \'none\'` avec `\'unsafe-inline\'`'], answer: 2, why: 'Seuls les scripts qui portent le nonce tournent, et `strict-dynamic` leur permet de charger ce dont ils ont besoin.' },
					{ q: 'À quelle fréquence le nonce doit-il changer ?', options: ['À chaque réponse', 'Une fois par jour', 'À chaque déploiement', 'Une fois par utilisateur'], answer: 0, why: 'Un nonce n’est secret que s’il est neuf à chaque réponse. Rails en génère un nouveau à chaque requête.' },
					{ q: 'Où la même valeur de nonce doit-elle aussi apparaître ?', options: ['Dans l’URL', 'Dans un cookie', 'Dans `default-src`', 'Dans `nonce="..."` sur chaque balise `<script>` de l’appli'], answer: 3, why: 'Le navigateur n’exécute un script que si son attribut `nonce` correspond à l’en-tête.' },
					{ q: 'Pourquoi le `onerror` injecté échoue-t-il encore avec cette politique ?', options: ['Le bug est corrigé', 'Il ne porte pas de nonce, et il n’y a plus de `\'unsafe-inline\'`', '`strict-dynamic` bloque les images', '`base-uri \'none\'` le bloque'], answer: 1, why: 'Un gestionnaire en attribut ne peut pas porter de nonce. Sans `\'unsafe-inline\'`, le navigateur le bloque.' }
				]
			},
			{
				title: 'Déploie-la',
				questions: [
					{ q: 'Quelles réponses doivent porter l’en-tête ?', options: ['Seulement la page d’accueil', 'Seulement les pages HTML', 'Toutes les réponses à toutes les requêtes', 'Seulement les réponses avec des scripts'], answer: 2, why: 'MDN : la politique « should be set on all responses to all requests, not just the main document ».' },
					{ q: 'Comment la déployer sans casser l’appli ?', options: ['D’abord en `Content-Security-Policy-Report-Only` avec un point `report-to`', 'L’activer un vendredi soir', 'L’activer pour les admins seulement', 'Ajouter `\'unsafe-inline\'` la première semaine'], answer: 0, why: 'Le mode report-only ne bloque rien et te dit ce que la politique aurait bloqué.' },
					{ q: 'Que corriges-tu en lisant les rapports ?', options: ['Les réglages du navigateur', 'La liste d’hôtes du CDN', 'Les attributs des cookies', 'Les scripts en ligne de l’appli qui y apparaissent'], answer: 3, why: 'Chacun a besoin du nonce, ou d’un passage dans un fichier, avant d’imposer la politique.' },
					{ q: 'Quand passes-tu en `Content-Security-Policy` ?', options: ['Avant le premier rapport', 'Quand les scripts de l’appli n’apparaissent plus dans les rapports', 'Jamais : report-only suffit', 'Après la prochaine XSS'], answer: 1, why: 'Le mode report-only n’impose rien : il ne protège qu’une fois le vrai en-tête envoyé.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Sers la page de l’exercice depuis un nginx local, regarde la politique faible laisser tourner le gestionnaire injecté, puis passe à une politique à nonce et regarde le navigateur le bloquer pendant que ton propre script tourne encore.',
		steps: [
			'Crée la page, avec un script à toi et la bio injectée : `mkdir -p ~/csp-lab/html ~/csp-lab/conf && cd ~/csp-lab && printf \'%s\\n\' \'<!doctype html>\' \'<script nonce="__NONCE__">document.title = "own script ran"</script>\' \'<p>Bio: <img src=x onerror=alert(1)></p>\' > html/index.html`.',
			'Dans un éditeur, crée `conf/default.conf` avec ces lignes : `server {`, `listen 80;`, `root /usr/share/nginx/html;`, `sub_filter_once off;`, `sub_filter __NONCE__ $request_id;`, `add_header Content-Security-Policy "default-src \'self\'; script-src \'self\' \'unsafe-inline\' https://cdn.example.com; object-src \'none\'" always;`, `}`.',
			'Lance nginx : `docker run -d --name csp-lab -p 8080:80 -v "$PWD/html:/usr/share/nginx/html:ro" -v "$PWD/conf:/etc/nginx/conf.d:ro" nginx:1.27-alpine`. Vérifie l’en-tête avec `curl -sI localhost:8080`, puis ouvre `http://localhost:8080` dans un navigateur.',
			'Remplace la politique de la ligne `add_header` par `script-src \'nonce-$request_id\' \'strict-dynamic\'; object-src \'none\'; base-uri \'none\'`. Recharge nginx : `docker exec csp-lab nginx -s reload`.',
			'Lance `curl -sI localhost:8080` deux fois, puis `curl -si localhost:8080 | grep -o "nonce[-=]\\"\\{0,1\\}[0-9a-f]*"`. Recharge ensuite la page dans le navigateur, console de développement ouverte.'
		],
		done: [
			'Avec la première politique, le navigateur affiche une boîte d’alerte : le gestionnaire injecté a tourné.',
			'Avec la politique à nonce, deux appels `curl -sI` montrent deux valeurs `nonce-…` différentes.',
			'Le `grep` montre la même valeur dans l’en-tête et dans la balise `<script nonce="…">`.',
			'Le navigateur n’affiche plus d’alerte, le titre de l’onglet dit `own script ran`, et la console indique que le gestionnaire en ligne a été bloqué par `script-src`.'
		],
		solution: [
			'La première politique autorise `\'unsafe-inline\'` : l’attribut `onerror` tourne comme n’importe quel script en ligne.',
			'`sub_filter` écrit le `$request_id` de nginx, propre à chaque requête, dans la page, et `add_header` met la même valeur dans l’en-tête : le nonce est neuf à chaque réponse.',
			'Ton script porte le `nonce` correspondant et tourne. L’attribut `onerror` ne peut pas en porter et il est bloqué. Nettoie avec `docker rm -f csp-lab` et `rm -rf ~/csp-lab`.'
		]
	},
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
