const K8S = 'https://github.com/kubernetes/k8s.io/blob/a68665345a355394efddec7243ed41448ec166cd';
const ZONE = `${K8S}/dns/zone-configs/kubernetes.io._0_base.yaml`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'dns-records',
	part: 'Noms et adresses',
	title: 'Les enregistrements DNS',
	minutes: 10,
	hook: [
		'Prends une petite zone pour `example.org` avec ses enregistrements SOA et NS, et ajoute une ligne pour faire pointer le domaine nu vers un hébergeur : `@ IN CNAME myapp.netlify.app.`. Dans cette session, `named-checkzone` de BIND 9.20.29 refuse la zone entière : "CNAME and other data", puis "not loaded due to errors".',
		'Le nom `@` est l’apex de la zone, et il porte déjà le SOA et les NS. RFC 1034 : "If a CNAME RR is present at a node, no other data should be present".',
		'Le projet Kubernetes sert aussi `kubernetes.io` depuis Netlify. Son fichier de zone met deux enregistrements A à l’apex, avec le commentaire "Netlify high performance CDN", et fait de `www` un CNAME vers `kubernetes.io.`.'
	],
	terms: [
		{ term: 'Enregistrement de ressource', def: 'Une ligne de données DNS : un nom propriétaire, un TTL, une classe (`IN`), un type et les données. `www.kubernetes.io. 3600 IN CNAME kubernetes.io.` en est un.' },
		{ term: 'Apex de zone', def: 'Le nom le plus haut d’une zone, noté `@` dans un fichier de zone. Il porte toujours le SOA de la zone et ses enregistrements NS.' },
		{ term: 'CNAME', def: 'Un enregistrement qui fait de son nom un alias d’un autre nom, le nom canonique. Un nom qui a un CNAME ne peut porter aucun autre enregistrement, hors enregistrements DNSSEC.' },
		{ term: 'MX', def: 'Mail exchange : un nombre de préférence et le nom d’un hôte qui accepte le courrier pour ce nom. Les expéditeurs essaient d’abord la plus petite valeur.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['res["Résolveur"] -->|"www.kubernetes.io A?"| ns["Serveurs de kubernetes.io (Google Cloud DNS)"]', 'ns -.->|"CNAME kubernetes.io. + 2 A"| res'],
				highlight: ['ns'],
				note: 'Dans cette session, `dig www.kubernetes.io A` a renvoyé `www.kubernetes.io. 3600 IN CNAME kubernetes.io.`, suivi de deux enregistrements A pour `kubernetes.io`. Les deux noms sont dans la même zone, donc le serveur ajoute lui-même les A. La RFC 1034 montre le même cas : "Both of these RRs would be returned in the response to the type A query".'
			},
			{
				add: ['res -->|"kubernetes.io AAAA?"| ns', 'ns -.->|"pas d’enregistrement AAAA"| res'],
				highlight: ['ns'],
				note: 'Un enregistrement AAAA porte une adresse IPv6 de 128 bits (RFC 3596), là où un A porte 32 bits d’IPv4. Dans cette session, `dig kubernetes.io AAAA` a renvoyé une réponse vide : la zone ne donne à l’apex que des adresses IPv4. `dyna.wikimedia.org`, vu au chapitre 09, a les deux, avec l’AAAA `2a02:ec80:600:ed1a::1`.'
			},
			{
				add: ['res -->|"kubernetes.io MX?"| ns', 'ns -.->|"MX 1 aspmx.l.google.com. ... MX 10 alt4..."| res'],
				highlight: ['res'],
				note: 'Un serveur de mail qui écrit à `@kubernetes.io` demande les MX et en reçoit cinq. RFC 1035 : "Lower values are preferred". Il essaie donc d’abord `aspmx.l.google.com` (préférence 1), puis les deux hôtes à 5, puis les deux à 10.'
			},
			{
				add: ['res -->|"kubernetes.io TXT?"| ns', 'ns -.->|"v=spf1 include:_spf.google.com ...; site verification tokens"| res'],
				highlight: ['res'],
				note: 'Les enregistrements TXT portent des chaînes. RFC 1035 : "The semantics of the text depends on the domain where it is found." À l’apex de `kubernetes.io`, une chaîne commence par `v=spf1` et liste qui peut envoyer son courrier. D’autres prouvent à Google et à 1Password que le projet détient le domaine.'
			},
			{
				add: ['res -->|"kubernetes.io SOA? NS?"| ns', 'ns -.->|"SOA ns-cloud-a1.googledomains.com. + 4 NS"| res', 'ns --> rule["L’apex porte SOA et NS : un CNAME y est refusé"]'],
				highlight: ['rule'],
				note: 'L’apex répond avec un SOA et quatre NS, de `ns-cloud-a1` à `a4.googledomains.com`. La RFC 2181 donne à un nom soit un CNAME, soit d’autres enregistrements, jamais les deux. L’apex ne peut donc pas être un CNAME, et la zone y stocke les A de l’hébergeur.'
			}
		]
	},
	example: {
		title: 'dns/zone-configs/kubernetes.io._0_base.yaml : la zone kubernetes.io',
		repo: 'kubernetes/k8s.io',
		url: `${ZONE}#L1-L69`,
		lang: 'yaml',
		code: `# The top-level kubernetes.io zone
#
# In general, every name here has an equivalent in k8s.io.  For many of these
# we redirect from foo.kubernetes.io to foo.k8s.io, which is where the
# documentation for each name is attached.
'':
  - type: A
    values:
    - 15.197.167.90 # Netlify high performance CDN (@bentheelder)
    - 3.33.186.135  # Netlify high performance CDN (@bentheelder)
  - type: MX
    values:
    - exchange: aspmx.l.google.com.
      preference: 1
    - exchange: alt1.aspmx.l.google.com.
      preference: 5
    - exchange: alt2.aspmx.l.google.com.
      preference: 5
    - exchange: alt3.aspmx.l.google.com.
      preference: 10
    - exchange: alt4.aspmx.l.google.com.
      preference: 10
…
  - type: TXT
    values:
…
    - v=spf1 include:_spf.google.com mail.kubernetes.io ~all
…
www:
  type: CNAME
  value: kubernetes.io.

# Main docs site is a redirect (@chenopis)
docs:
  type: CNAME
  value: docs.k8s.io.
# All docs subdomains get sent to netlify (@chenopis)
'*.docs':
  type: CNAME
  value: kubernetes.netlify.app.`,
		notes: [
			'Le fichier est une config octoDNS, et le README DNS du dépôt dit que la clé `\'\'` vaut "for the top-level domain" : l’apex. Les lignes 7 à 10 donnent à l’apex deux A avec des adresses Netlify, là où un sous-domaine aurait pu prendre un CNAME vers Netlify.',
			'Les lignes 11 à 22 sont les cinq MX. La ligne 14 donne à `aspmx.l.google.com.` la préférence 1, la plus basse : les expéditeurs l’essaient en premier.',
			'La ligne 27 est une chaîne du jeu de TXT de l’apex : une politique SPF qui commence par `v=spf1`. Les autres valeurs du même nom, coupées ici, sont des jetons de vérification.',
			'Les lignes 29 à 31 font de `www` un alias de l’apex. Quand les adresses Netlify des lignes 9 et 10 changent, seules ces lignes sont à modifier. Les lignes 34 à 36 font de `docs` un alias d’un nom d’une autre zone, `docs.k8s.io.`, et le résolveur doit relancer la recherche là-bas.'
		]
	},
	tradeoff: {
		gain: [
			'Un CNAME garde une seule copie des données : `www`, `docs` et des dizaines de noms de vitrine de ce fichier suivent leur cible sans modification.',
			'Un résolveur peut mettre un CNAME en cache et le réutiliser pour tous les types, car l’alias ne porte rien d’autre. La RFC 1034 donne cette raison à la règle.'
		],
		cost: [
			'Un alias vers une autre zone coûte une seconde recherche, comme `en.wikipedia.org` vers `dyna.wikimedia.org` au chapitre 09.',
			'L’apex ne peut pas être un alias : `kubernetes.io` recopie deux A de Netlify dans sa zone et doit les changer si Netlify les change.',
			'Les cibles de MX et de NS ne doivent pas être des alias. RFC 2181 : elles "must not be an alias", et BIND le signale par "(illegal)".'
		]
	},
	task: {
		prompt: 'Trouve ce qui ne va pas dans cette zone pour `example.org`, puis compare ta réponse à `named-checkzone`. Ligne 1 : `$TTL 3600`. Ligne 2 : `@ IN SOA ns1.example.org. hostmaster.example.org. 1 7200 3600 1209600 300`. Ligne 3 : `@ IN NS ns1.example.org.`. Ligne 4 : `@ IN A 192.0.2.10`. Ligne 5 : `@ IN MX 10 mail.example.org.`. Ligne 6 : `ns1 IN A 192.0.2.53`. Ligne 7 : `mail IN CNAME mx.mailhost.example.`. Ligne 8 : `www IN CNAME example.org.`. Ligne 9 : `blog IN CNAME example.ghost.io.`. Ligne 10 : `blog IN TXT "v=spf1 -all"`.',
		hint: 'Pour chaque nom qui a un CNAME, regarde si le même nom porte autre chose. Puis regarde où pointe le MX.',
		answer: [
			'Les lignes 9 et 10 donnent à `blog` un CNAME et un TXT. BIND 9.20.29 dans cette session : `dns_master_load: /z/task.zone:10: blog.example.org: CNAME and other data`, puis `zone example.org/IN: not loaded due to errors.` Toute la zone reste hors service, apex et `www` compris.',
			'Sans la ligne 10, la zone se charge, avec un avertissement : `example.org/MX \'mail.example.org\' is a CNAME (illegal)`. La ligne 5 fait pointer le MX vers `mail`, dont la ligne 7 fait un alias. La RFC 2181 dit qu’une valeur de MX "must not be an alias". Fais pointer le MX directement vers `mx.mailhost.example.`.',
			'La ligne 8 est correcte : `www` ne porte qu’un CNAME, et sa cible `example.org` a son propre A à la ligne 4. La ligne 4 est la bonne façon de donner une adresse à l’apex.'
		],
		steps: [
			{
				title: 'Liste les alias',
				questions: [
					{ q: 'Quels noms de cette zone portent un CNAME ?', options: ['`mail`, `www` et `blog`', '`@`, `www` et `blog`', '`ns1`, `mail` et `www`', 'Seulement `blog`'], answer: 0, why: 'Les lignes 7, 8 et 9 sont les CNAME. L’apex `@` porte un SOA, un NS, un A et un MX.' },
					{ q: 'Quelle est la règle pour un nom qui porte un CNAME ?', options: ['Il peut porter un enregistrement de chaque autre type', 'Il ne peut porter aucune autre donnée, hors enregistrements DNSSEC', 'Il peut porter d’autres données si les TTL sont égaux', 'Il ne peut porter que des TXT'], answer: 1, why: 'RFC 1034 : "If a CNAME RR is present at a node, no other data should be present".' },
					{ q: 'Quels enregistrements l’apex porte-t-il toujours ?', options: ['Un A et un MX', 'Un CNAME et un NS', 'Le SOA et les NS', 'Un A et un TXT'], answer: 2, why: 'Tout apex de zone porte son SOA et ses NS. C’est pour ça que `@` ne peut jamais être un CNAME.' },
					{ q: 'La ligne 4, `@ IN A 192.0.2.10`, pose-t-elle problème ?', options: ['Oui : l’apex doit utiliser un CNAME', 'Oui : l’apex ne peut porter que SOA et NS', 'Oui : `www` pointe déjà dessus', 'Non : un A à l’apex est la bonne façon de lui donner une adresse'], answer: 3, why: 'L’apex peut porter des A à côté de son SOA et de ses NS, comme `kubernetes.io` avec ses deux adresses Netlify.' }
				]
			},
			{
				title: 'Vérifie blog',
				questions: [
					{ q: 'Que porte `blog` ?', options: ['Un CNAME à la ligne 9 et un TXT à la ligne 10', 'Seulement un CNAME', 'Seulement un TXT', 'Deux CNAME'], answer: 0, why: 'Les deux lignes ont le nom propriétaire `blog`.' },
					{ q: 'Que signale `named-checkzone` pour lui ?', options: ['Un avertissement, et la zone se charge', '`blog.example.org: CNAME and other data`', '`blog` is a CNAME (illegal)', 'Rien, car les TXT sont exemptés'], answer: 1, why: 'BIND lit la ligne 10 et refuse un second enregistrement pour un nom qui a déjà un CNAME.' },
					{ q: 'Que devient le reste de la zone ?', options: ['Seul `blog` ne se résout plus', 'BIND saute la ligne 10 et charge le reste', 'Toute la zone n’est pas chargée, apex et `www` compris', 'Seul le TXT est retiré'], answer: 2, why: 'BIND affiche `not loaded due to errors`. Une seule ligne fausse met toute la zone hors service.' },
					{ q: 'Comment le corriges-tu ?', options: ['Déplacer le CNAME à l’apex', 'Ajouter un second CNAME pour `blog`', 'Changer le TTL du TXT', 'Retirer la ligne 10, ou mettre le TXT sur un nom sans CNAME'], answer: 3, why: 'Un nom qui a un CNAME ne peut porter aucune autre donnée. Sans la ligne 10, la zone se charge.' }
				]
			},
			{
				title: 'Vérifie le MX',
				questions: [
					{ q: 'Où pointe le MX de la ligne 5 ?', options: ['Vers `mail.example.org`, dont la ligne 7 fait un alias', 'Directement vers `mx.mailhost.example.`', 'Vers l’apex', 'Vers `ns1.example.org`'], answer: 0, why: 'La ligne 5 nomme `mail.example.org.`, et la ligne 7 est `mail IN CNAME mx.mailhost.example.`.' },
					{ q: 'Que dit la RFC 2181 d’une valeur de MX ?', options: ['Elle peut être un alias dans la même zone', 'Elle "must not be an alias"', 'Elle doit être dans la même zone', 'Elle doit avoir la préférence 1'], answer: 1, why: 'La RFC 2181 interdit les alias comme cibles de MX et de NS.' },
					{ q: 'Sans la ligne 10, qu’affiche `named-checkzone` ?', options: ['`CNAME and other data`, et la zone échoue', 'Rien du tout', '`MX \'mail.example.org\' is a CNAME (illegal)`, puis la zone se charge', '`not loaded due to errors`'], answer: 2, why: 'BIND le signale par "(illegal)" mais charge quand même la zone : l’erreur passe facilement inaperçue.' },
					{ q: 'Quel est le correctif ?', options: ['Supprimer la ligne 7 et garder le MX tel quel', 'Faire de `mail` un A de l’apex', 'Passer la préférence du MX à 1', 'Faire pointer le MX directement vers `mx.mailhost.example.`'], answer: 3, why: 'Le MX nomme alors le vrai hôte de mail, sans alias entre les deux.' }
				]
			},
			{
				title: 'Vérifie www',
				questions: [
					{ q: '`www IN CNAME example.org.` est-il valide ?', options: ['Oui : `www` ne porte que ce CNAME', 'Non : un CNAME ne peut pas viser l’apex', 'Non : `www` doit avoir un A', 'Non : la cible doit être dans une autre zone'], answer: 0, why: 'La règle porte sur ce que l’alias contient. `www` ne porte rien d’autre.' },
					{ q: 'Que reçoit un résolveur pour `www.example.org A` ?', options: ['Une réponse vide', 'Le CNAME, plus le A de `example.org` de la ligne 4', 'Le A seul, l’alias étant caché', 'Un referral vers une autre zone'], answer: 1, why: 'La cible est dans la même zone, donc le serveur ajoute son A, comme pour `www.kubernetes.io`.' },
					{ q: 'L’adresse de la ligne 4 change. Que modifies-tu ?', options: ['Les lignes 4 et 8', 'La ligne 8 seule', 'La ligne 4 seule', 'Tous les CNAME de la zone'], answer: 2, why: 'Un CNAME garde une seule copie des données : `www` suit sa cible sans modification.' },
					{ q: 'Tu veux aussi un TXT sur `www`. Peut-il aller là ?', options: ['Oui : les TXT échappent à la règle du CNAME', 'Oui, s’il a le même TTL que le CNAME', 'Oui, tant qu’il ne contient qu’une chaîne', 'Non : `www` porte un CNAME, c’est la même erreur que `blog`'], answer: 3, why: 'Un nom qui a un CNAME ne peut porter aucune autre donnée, hors enregistrements DNSSEC. Le TXT va sur un nom sans alias.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Pourquoi la zone `kubernetes.io` met-elle des A à l’apex plutôt qu’un CNAME vers son site Netlify ?',
			options: [
				'Un CNAME à l’apex ajouterait une recherche, et l’apex doit répondre en une seule',
				'Google Cloud DNS ne gère le type CNAME dans aucune zone',
				'L’apex porte le SOA et les NS, et un CNAME n’admet aucune autre donnée',
				'Netlify demande des A pour que son CDN voie l’IP du client'
			],
			answer: 2,
			why: 'Les RFC 1034 et 2181 donnent à un nom soit un CNAME, soit d’autres enregistrements. Tout apex de zone a un SOA et des NS : un CNAME y viole la règle, et BIND refuse la zone avec "CNAME and other data".'
		},
		{
			q: 'Un domaine a `MX 10 mx-b.example.net.`, `MX 1 mx-a.example.net.` et `MX 5 mx-c.example.net.`. Quel hôte un expéditeur essaie-t-il en premier ?',
			options: [
				'`mx-a`, car la préférence 1 est la plus basse',
				'`mx-b`, car la préférence 10 est la plus haute',
				'`mx-b`, car c’est le premier enregistrement du fichier',
				'N’importe lequel des trois, tiré au hasard pour répartir la charge'
			],
			answer: 0,
			why: 'La RFC 1035 définit PREFERENCE comme un nombre de 16 bits où "Lower values are preferred". L’ordre des lignes dans le fichier de zone ne compte pas.'
		},
		{
			q: 'Un résolveur demande `www.kubernetes.io A` aux serveurs de `kubernetes.io`. Que contient la section réponse ?',
			options: [
				'Le CNAME seul, et le résolveur envoie une seconde requête pour `kubernetes.io`',
				'Le CNAME vers `kubernetes.io.` et les A de `kubernetes.io`',
				'Les A seuls, car le serveur cache l’alias',
				'Une réponse vide, car `www` n’a pas de A à lui'
			],
			answer: 1,
			why: 'Quand un nom porte un CNAME, le serveur l’inclut et relance la requête sur la cible. `kubernetes.io` est dans la même zone, donc le serveur ajoute ses A à la même réponse, comme `dig` l’a montré dans cette session.'
		}
	],
	lab: {
		minutes: 15,
		goal: 'Charger la zone de l’exercice dans `named-checkzone` de BIND, lire ses erreurs, et corriger la zone ligne par ligne.',
		steps: [
			'Écris la zone de l’exercice dans un nouveau dossier : `mkdir dnslab && cd dnslab && printf \'%s\\n\' \'$TTL 3600\' \'@ IN SOA ns1.example.org. hostmaster.example.org. 1 7200 3600 1209600 300\' \'@ IN NS ns1.example.org.\' \'@ IN A 192.0.2.10\' \'@ IN MX 10 mail.example.org.\' \'ns1 IN A 192.0.2.53\' \'mail IN CNAME mx.mailhost.example.\' \'www IN CNAME example.org.\' \'blog IN CNAME example.ghost.io.\' \'blog IN TXT "v=spf1 -all"\' > task.zone`.',
			'Vérifie-la avec BIND : `docker run --rm -v "$PWD:/z:ro" --entrypoint named-checkzone internetsystemsconsortium/bind9:9.20 example.org /z/task.zone; echo "exit=$?"`.',
			'Retire la ligne TXT et vérifie de nouveau : `grep -v \'blog IN TXT\' task.zone > step2.zone`, puis relance l’étape 2 avec `/z/step2.zone`.',
			'Fais pointer le MX vers le vrai hôte : `sed \'s/MX 10 mail.example.org./MX 10 mx.mailhost.example./\' step2.zone > step3.zone`, puis vérifie `/z/step3.zone`.',
			'Essaie l’erreur de l’accroche, un CNAME à l’apex : `sed \'s/^@ IN A 192.0.2.10$/@ IN CNAME myapp.netlify.app./\' step3.zone > apex.zone`, puis vérifie `/z/apex.zone`.'
		],
		done: [
			'`task.zone` échoue avec `blog.example.org: CNAME and other data`, `not loaded due to errors` et `exit=1`.',
			'`step2.zone` se charge avec `MX \'mail.example.org\' is a CNAME (illegal)`, puis `OK`.',
			'`step3.zone` affiche `OK`, avec seulement un avertissement : l’hôte MX hors zone n’a pas d’adresse ici.',
			'`apex.zone` échoue avec `example.org: CNAME and other data`.'
		],
		solution: [
			'Un nom qui a un CNAME ne peut porter aucune autre donnée : `blog` avec un TXT empêche toute la zone de se charger, pas seulement `blog`.',
			'Un MX qui pointe vers un alias se charge quand même, avec "(illegal)" en avertissement. La RFC 2181 dit que la valeur "must not be an alias" : fais-la pointer vers le vrai hôte.',
			'L’apex porte toujours le SOA et les NS, donc un CNAME y viole la même règle que `blog`. Donne plutôt des A à l’apex, comme `kubernetes.io`.'
		]
	},
	recall: {
		q: 'Quels enregistrements tout apex de zone porte-t-il, et qu’est-ce que ça implique pour un CNAME sur le domaine nu ?',
		a: 'Le SOA et les NS. Un nom qui a un CNAME ne peut porter aucune autre donnée, donc `@ IN CNAME ...` est refusé : BIND signale "CNAME and other data", et `kubernetes.io` utilise des A à la place.'
	},
	sources: [
		{ title: 'RFC 1034, section 3.6.2, Aliases and canonical names', url: 'https://www.rfc-editor.org/rfc/rfc1034' },
		{ title: 'RFC 1035, Domain Names: Implementation and Specification', url: 'https://www.rfc-editor.org/rfc/rfc1035' },
		{ title: 'RFC 2181, Clarifications to the DNS Specification (CNAME, MX et NS)', url: 'https://www.rfc-editor.org/rfc/rfc2181' },
		{ title: 'RFC 3596, DNS Extensions to Support IPv6 (AAAA)', url: 'https://www.rfc-editor.org/rfc/rfc3596' },
		{ title: 'kubernetes/k8s.io, config de la zone kubernetes.io', url: ZONE },
		{ title: 'kubernetes/k8s.io, README DNS', url: `${K8S}/dns/README.md` }
	]
};
