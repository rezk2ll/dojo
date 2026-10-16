const K8S = 'https://github.com/kubernetes/kubernetes/blob/9b965ac43f05d304180c7b8b9611264530788948';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'shell-scripts',
	part: 'Les fondamentaux',
	title: 'Des scripts shell qui s’arrêtent à la première erreur',
	minutes: 10,
	hook: [
		'Ton script de sauvegarde a tourné toutes les nuits pendant un an. Une nuit, le montage avait disparu, `cd $BACKUP_DIR` a échoué, et la ligne suivante, `rm -rf *`, s’est exécutée **dans le mauvais répertoire**.',
		'Par défaut, bash continue après une commande en échec. À 3 h du matin, personne ne surveille le job cron, et la ligne suivante s’exécute quand même.',
		'Quatre habitudes évitent ça : une ligne `set` en tête du script, des guillemets autour de chaque variable, des étapes que tu peux relancer, et un passage de shellcheck avant le merge.'
	],
	terms: [
		{ term: 'errexit (`set -e`)', def: 'Arrête le script quand une commande échoue. Il y a des exceptions : les commandes testées par `if`, `while` ou `until`, toute partie d’un `&&` ou `||` sauf la dernière, tout ce qui est inversé avec `!`, et, sans pipefail, chaque commande d’un pipeline sauf la dernière.' },
		{ term: 'nounset (`set -u`)', def: 'Traite une variable non définie comme une erreur. Un shell non interactif affiche un message et s’arrête.' },
		{ term: 'pipefail', def: 'Un pipeline renvoie le code de la commande la plus à droite qui a échoué, et pas seulement celui de la dernière commande. Désactivé par défaut.' },
		{ term: 'Idempotent', def: 'Le lancer deux fois donne le même résultat que le lancer une fois. Un pipeline peut relancer sans risque un script idempotent.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['run["Une commande de ton script"]', 'run --> chk["set -e : code de sortie 0 ?"]', 'chk -->|"oui"| nxt["Ligne suivante"]', 'chk -->|"non"| stop["Le script s’arrête, sortie non nulle"]'],
				highlight: ['run', 'chk', 'stop'],
				note: 'Avec `set -e`, la première commande qui échoue **arrête le script**, et l’appelant (cron, systemd, un job de CI) voit un code de sortie non nul. Sans ça, bash exécute la ligne suivante comme si de rien n’était.'
			},
			{
				add: ['uv["set -u : BACKUP_DIR non définie"] --> stop'],
				highlight: ['uv'],
				note: 'Une faute de frappe comme `$BACKUP_DRI` donne une chaîne vide, et bash développe alors `rm -rf "$BACKUP_DRI/"*` en `rm -rf /*`. Avec `set -u`, bash s’arrête sur la variable non définie.'
			},
			{
				add: ['pipe["pipefail : pg_dump db | gzip"] --> stop'],
				highlight: ['pipe'],
				note: 'Sans pipefail, `pg_dump db | gzip > db.gz` renvoie le code de **gzip**. pg_dump peut échouer, tu obtiens une archive minuscule mais valide, et le code de sortie vaut 0. Avec pipefail, le pipeline renvoie le code non nul de pg_dump.'
			},
			{
				add: ['nxt --> idem["Étape idempotente : relançable sans risque"]'],
				highlight: ['idem'],
				note: '`mkdir -p` au lieu de `mkdir`. `grep -qxF "$line" file || echo "$line" >> file` au lieu d’un ajout à l’aveugle. Chaque commande vérifie l’état avant de modifier quoi que ce soit, donc après un crash tu peux relancer le script.'
			},
			{
				add: ['lint["shellcheck, avant le merge"]', 'lint -.->|"relit"| run', 'class lint ext'],
				highlight: ['lint'],
				note: 'shellcheck lit le script sans l’exécuter et signale les variables sans guillemets (SC2086), les `cd` sans plan B (SC2164) et bien plus. Avec ses vérifications par défaut, il ne signale **pas** un pipefail oublié (seule l’option `check-extra-masked-returns`, SC2312, le fait) : tu ajoutes `set -o pipefail` toi-même.'
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
			'Les lignes 1 à 3 sont la forme longue de `set -euo pipefail`. Chaque nom long dit ce que fait la ligne, donc le lecteur n’a pas à retenir les lettres.',
			'Ligne 8 : `"${DOCKER:-docker}"` prend `$DOCKER` s’il est défini, sinon `docker`. Avec nounset, un `$DOCKER` tout seul arrêterait le script. La même forme apparaît dans [`"${KUBE_JUNIT_REPORT_DIR:-}"`](https://github.com/kubernetes/kubernetes/blob/9b965ac43f05d304180c7b8b9611264530788948/hack/verify-shellcheck.sh#L88-L93) pour tester une variable qui peut ne pas exister.',
			'Lignes 13 et 19 : avec errexit, un shellcheck en échec arrêterait le script tout de suite. Le `||` fait partie des exceptions, donc le script **garde le code** dans `res`, affiche son aide sur stderr, puis transmet ce même code avec `exit $res` à la ligne 34.',
			'Les lignes 13 et 19 mettent aussi `"${SHELLCHECK_OPTIONS[@]}"` entre guillemets : chaque élément du tableau donne un mot séparé, même s’il contient un espace. Sans guillemets, bash découperait chaque élément sur les espaces, les tabulations et les retours à la ligne.'
		]
	},
	tradeoff: {
		gain: [
			'Le script s’arrête à la première commande en échec, avec un code non nul sur lequel cron, systemd ou la CI peuvent agir.',
			'Une faute de frappe dans un nom de variable arrête le script, au lieu de donner une chaîne vide.',
			'Un pipeline, ou toi à 3 h du matin, peut relancer un script idempotent après un échec.'
		],
		cost: [
			'`set -e` n’arrête pas le script pour un échec dans un `if`, un `&&`, un `||` ou après un `!`, donc certains échecs passent quand même.',
			'Les commandes qui renvoient un code non nul exprès t’arrêtent maintenant. `grep` renvoie 1 quand rien ne correspond, donc tu écris `|| true` là où c’est normal.',
			'Au-delà de quelques dizaines de lignes, un script bash est difficile à lire et à tester. Mets la configuration dans un outil comme Ansible (jour 26), et la logique dans un langage généraliste.'
		]
	},
	task: {
		prompt: 'Corrige ce script pour qu’il puisse tourner depuis cron et être relancé deux fois sans risque : `cd $BACKUP_DIR`, `rm -rf *`, `pg_dump mydb | gzip > /backup/db.sql.gz`, `echo \'export PATH="$PATH:/opt/bin"\' >> ~/.bashrc`.',
		hint: 'Prends les lignes une par une. Pour chacune, demande-toi : et si la variable est vide, et si la commande échoue à moitié, et si elle tourne une deuxième fois ?',
		answer: [
			'Première ligne après le shebang : `set -euo pipefail`.',
			'`cd "${BACKUP_DIR:?}"` : entre guillemets, et il s’arrête avec un message si la variable est vide ou non définie. Avec `set -e`, un `cd` raté arrête le script avant le `rm`.',
			'`rm -rf ./*` : shellcheck (SC2035) prévient que bash lirait sinon un fichier nommé `-rf` comme une option.',
			'Avec pipefail, un `pg_dump` raté fait maintenant échouer le script au lieu de laisser une archive vide derrière un code de sortie à 0.',
			'L’ajout rajoute une ligne à chaque passage. Rends-le idempotent : `grep -qxF \'export PATH="$PATH:/opt/bin"\' ~/.bashrc || echo \'…\' >> ~/.bashrc`.',
			'Passe `shellcheck` dessus. Sur l’original, il signale SC2164 et SC2086 sur la ligne `cd`. Avec ses vérifications par défaut, il ne dit rien sur le pipeline : tu ajoutes pipefail toi-même.'
		]
	},
	quiz: [
		{
			q: 'Que change `set -o pipefail` ?',
			options: [
				'Bash arrête tout le pipeline dès qu’une de ses commandes échoue',
				'Il renvoie le code de la commande la plus à droite en échec, pas seulement de la dernière',
				'Bash affiche chaque commande du pipeline sur stderr avant de la lancer',
				'Chaque commande du pipeline tourne dans son propre sous-shell, l’une après l’autre'
			],
			answer: 1,
			why: 'Sans pipefail, `a | b` renvoie le code de `b`, donc un échec de `a` passe inaperçu. Avec pipefail, toute commande en échec se voit dans le résultat.'
		},
		{
			q: 'Avec `set -u`, `NAME` n’est pas définie. Que fait `"${NAME:-guest}"` ?',
			options: [
				'Le script s’arrête sur une erreur de variable non définie',
				'Ça donne `guest` et le script continue',
				'Ça affecte `guest` à `NAME` pour le reste du script',
				'Ça donne une chaîne vide'
			],
			answer: 1,
			why: '`:-` substitue une valeur par défaut sans échouer et sans affecter la variable. `:=` l’affecterait aussi, et `:?` s’arrêterait avec une erreur.'
		},
		{
			q: 'Laquelle de ces étapes est idempotente ?',
			options: [
				'`echo \'export X=1\' >> ~/.bashrc`',
				'`mkdir -p /srv/app`',
				'`useradd deploy`',
				'`mkdir /srv/app`'
			],
			answer: 1,
			why: '`mkdir -p` réussit que le répertoire existe ou non. L’ajout crée une ligne en double à chaque passage, et `useradd` comme `mkdir` tout court échouent la deuxième fois.'
		}
	],
	recall: {
		q: 'Quelle ligne mets-tu en tête d’un script bash lancé par cron ou la CI, et qu’est-ce que chaque partie arrête ?',
		a: '`set -euo pipefail`. `-e` arrête à la première commande en échec, `-u` arrête sur une variable non définie, et pipefail fait échouer le pipeline dès qu’une de ses commandes échoue.'
	},
	sources: [
		{ title: 'Manuel de Bash, The Set Builtin (-e, -u, pipefail)', url: 'https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html' },
		{ title: 'Manuel de Bash, Shell Parameter Expansion', url: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Parameter-Expansion.html' },
		{ title: 'Wiki ShellCheck, SC2086 : guillemets contre le globbing et le découpage en mots', url: 'https://www.shellcheck.net/wiki/SC2086' },
		{ title: 'Wiki ShellCheck, SC2115 : "${var:?}" pour que rm ne devienne jamais /*', url: 'https://www.shellcheck.net/wiki/SC2115' },
		{ title: 'Kubernetes, hack/verify-shellcheck.sh', url: `${K8S}/hack/verify-shellcheck.sh` }
	]
};
