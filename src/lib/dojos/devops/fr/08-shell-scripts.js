const K8S = 'https://github.com/kubernetes/kubernetes/blob/9b965ac43f05d304180c7b8b9611264530788948';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'shell-scripts',
	part: 'Les fondamentaux',
	title: 'Des scripts shell qui échouent bruyamment',
	minutes: 10,
	hook: [
		'Ton script de sauvegarde a tourné toutes les nuits pendant un an. Une nuit, le montage avait disparu, `cd $BACKUP_DIR` a échoué, et la ligne suivante, `rm -rf *`, s’est exécutée **dans le mauvais répertoire**.',
		'Par défaut, bash continue après une erreur. Dans un script que tu surveilles, c’est agaçant. Dans un script qu’un pipeline lance à 3 h du matin sans personne pour regarder, **c’est dangereux**.',
		'Aujourd’hui : la ligne en tête de tout script sérieux, les guillemets, les scripts qu’on peut relancer deux fois, et shellcheck, le linter qui attrape presque tout le reste.'
	],
	terms: [
		{ term: 'errexit (`set -e`)', def: 'Arrête le script quand une commande échoue. Il y a des exceptions : les commandes testées par `if`, `while` ou `until`, toute partie d’un `&&` ou `||` sauf la dernière, tout ce qui est inversé avec `!`, et, sans pipefail, chaque commande d’un pipeline sauf la dernière.' },
		{ term: 'nounset (`set -u`)', def: 'Traite une variable non définie comme une erreur. Un shell non interactif affiche un message et s’arrête.' },
		{ term: 'pipefail', def: 'Un pipeline renvoie le code de la commande la plus à droite qui a échoué, et pas seulement celui de la dernière commande. Désactivé par défaut.' },
		{ term: 'Découpage en mots', def: 'Bash découpe un `$var` sans guillemets sur les espaces, les tabulations et les retours à la ligne (l’`IFS` par défaut) et développe les `*` qu’il contient. Mets-le entre guillemets, `"$var"`, et il reste un seul mot.' },
		{ term: 'Idempotent', def: 'Le lancer deux fois donne le même résultat que le lancer une fois. Un script qu’un pipeline peut relancer sans risque.' },
		{ term: 'shellcheck', def: 'Un linter pour scripts shell. Chaque avertissement a un code, comme SC2086, avec une page de wiki qui l’explique.' }
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
				note: 'Une faute de frappe comme `$BACKUP_DRI` donne une chaîne vide, et `rm -rf "$BACKUP_DRI/"*` devient `rm -rf /*`. Avec `set -u`, bash s’arrête plutôt sur la variable non définie.'
			},
			{
				add: ['pipe["pipefail : pg_dump db | gzip"] --> stop'],
				highlight: ['pipe'],
				note: 'Sans pipefail, `pg_dump db | gzip > db.gz` renvoie le code de **gzip**. pg_dump peut échouer, tu obtiens une archive minuscule mais valide, et le code de sortie vaut 0. Avec pipefail, l’échec remonte.'
			},
			{
				add: ['nxt --> idem["Étape idempotente : relançable sans risque"]'],
				highlight: ['idem'],
				note: '`mkdir -p` au lieu de `mkdir`. `grep -qxF "$line" file || echo "$line" >> file` au lieu d’un ajout à l’aveugle. Vérifie l’état, puis agis. Après un crash, tu relances, c’est tout.'
			},
			{
				add: ['lint["shellcheck, avant le merge"]', 'lint -.->|"relit"| run', 'class lint ext'],
				highlight: ['lint'],
				note: 'shellcheck lit le script sans l’exécuter et signale les variables sans guillemets (SC2086), les `cd` sans plan B (SC2164) et bien plus. Avec ses vérifications par défaut, il ne signale **pas** un pipefail oublié (seule l’option `check-extra-masked-returns`, SC2312, le fait) : la première ligne reste ton boulot.'
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
			'Les trois lignes `set -o` sont la forme longue de `set -euo pipefail`. Les noms longs disent ce que fait chaque ligne sans avoir à se souvenir des lettres.',
			'`"${DOCKER:-docker}"` : prend `$DOCKER` s’il est défini, sinon `docker`. Avec nounset, un `$DOCKER` tout seul arrêterait le script. Le même truc apparaît dans [`"${KUBE_JUNIT_REPORT_DIR:-}"`](https://github.com/kubernetes/kubernetes/blob/9b965ac43f05d304180c7b8b9611264530788948/hack/verify-shellcheck.sh#L88-L93) pour tester une variable qui peut ne pas exister.',
			'`shellcheck … || res=$?` : avec errexit, un shellcheck en échec arrêterait le script tout de suite. Le `||` fait partie des exceptions, donc le script **garde le code**, affiche son aide sur stderr, puis transmet ce même code avec `exit $res`.',
			'`"${SHELLCHECK_OPTIONS[@]}"` entre guillemets développe chaque élément du tableau en un mot séparé, même s’il contient un espace. C’est comme ça qu’on construit une ligne de commande proprement en bash.'
		]
	},
	tradeoff: {
		gain: [
			'Le script échoue à la première erreur, bruyamment, avec un code non nul sur lequel l’appelant peut agir.',
			'Les fautes de frappe dans les noms de variables arrêtent le script au lieu de devenir des chaînes vides.',
			'Les scripts idempotents peuvent être relancés par un pipeline ou par toi, à 3 h du matin, sans réfléchir.'
		],
		cost: [
			'`set -e` a des exceptions (dans un `if`, `&&`, `||`, `!`) : c’est un filet de sécurité, pas une garantie.',
			'Les commandes qui renvoient un code non nul exprès t’arrêtent maintenant. `grep` renvoie 1 quand rien ne correspond, donc tu écris `|| true` là où c’est normal.',
			'Au-delà de quelques dizaines de lignes, bash se bat contre toi. La configuration a sa place dans un outil comme Ansible (jour 26), la logique dans un vrai langage.'
		]
	},
	task: {
		prompt: 'Corrige ce script pour qu’il puisse tourner depuis cron et être relancé deux fois sans risque : `cd $BACKUP_DIR`, `rm -rf *`, `pg_dump mydb | gzip > /backup/db.sql.gz`, `echo \'export PATH="$PATH:/opt/bin"\' >> ~/.bashrc`.',
		hint: 'Prends les lignes une par une. Pour chacune, demande-toi : et si la variable est vide, et si la commande échoue à moitié, et si elle tourne une deuxième fois ?',
		answer: [
			'Première ligne après le shebang : `set -euo pipefail`.',
			'`cd "${BACKUP_DIR:?}"` : entre guillemets, et il s’arrête avec un message si la variable est vide ou non définie. Avec `set -e`, un `cd` raté arrête le script avant le `rm`.',
			'`rm -rf ./*` : shellcheck (SC2035) prévient qu’un fichier nommé `-rf` deviendrait sinon une option.',
			'Avec pipefail, un `pg_dump` raté fait maintenant échouer le script au lieu de laisser une archive vide derrière un code de sortie à 0.',
			'L’ajout rajoute une ligne à chaque passage. Rends-le idempotent : `grep -qxF \'export PATH="$PATH:/opt/bin"\' ~/.bashrc || echo \'…\' >> ~/.bashrc`.',
			'Passe `shellcheck` dessus. Sur l’original, il signale SC2164 et SC2086 sur la ligne `cd`. Avec ses vérifications par défaut, il ne dit rien sur le pipeline : pipefail, c’est à toi d’y penser.'
		]
	},
	quiz: [
		{
			q: 'Que change `set -o pipefail` ?',
			options: [
				'Bash arrête le pipeline dès qu’une commande échoue',
				'Le pipeline renvoie le code de la commande la plus à droite qui a échoué, et pas seulement celui de la dernière commande',
				'Bash affiche chaque commande du pipeline avant de la lancer',
				'Chaque commande du pipeline tourne dans son propre sous-shell'
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
	takeaway: 'Commence chaque script par `set -euo pipefail`, mets chaque variable entre guillemets, rends chaque étape relançable, et fais relire le tout par shellcheck avant tout le monde.',
	sources: [
		{ title: 'Manuel de Bash, The Set Builtin (-e, -u, pipefail)', url: 'https://www.gnu.org/software/bash/manual/html_node/The-Set-Builtin.html' },
		{ title: 'Manuel de Bash, Shell Parameter Expansion', url: 'https://www.gnu.org/software/bash/manual/html_node/Shell-Parameter-Expansion.html' },
		{ title: 'Wiki ShellCheck, SC2086 : guillemets contre le globbing et le découpage en mots', url: 'https://www.shellcheck.net/wiki/SC2086' },
		{ title: 'Wiki ShellCheck, SC2115 : "${var:?}" pour que rm ne devienne jamais /*', url: 'https://www.shellcheck.net/wiki/SC2115' },
		{ title: 'Kubernetes, hack/verify-shellcheck.sh', url: `${K8S}/hack/verify-shellcheck.sh` }
	]
};
