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
		],
		steps: [
			{
				title: 'Fais-le s’arrêter sur les erreurs',
				questions: [
					{ q: 'Que mets-tu sur la première ligne après le shebang ?', options: ['`set -x`', '`set -euo pipefail`', '`trap exit ERR`', '`set +e`'], answer: 1, why: '`-e` arrête à la première commande en échec, `-u` à une variable non définie, et pipefail fait échouer le pipeline dès qu’une de ses commandes échoue.' },
					{ q: 'Sans `set -e`, `cd $BACKUP_DIR` échoue. Que se passe-t-il ensuite ?', options: ['Bash arrête le script', 'Cron relance la ligne', 'Bash lance `rm -rf *` dans le répertoire où il se trouve', 'Le shell demande une confirmation'], answer: 2, why: 'Par défaut, bash continue après une commande en échec, et personne ne surveille un job cron à 3 h du matin.' },
					{ q: 'Sur laquelle de ces commandes `set -e` ne s’arrête-t-il PAS ?', options: ['Un `cd` en échec sur sa propre ligne', 'Un `pg_dump` en échec sur sa propre ligne', 'Une commande inconnue sur sa propre ligne', 'Une commande en échec dans le test d’un `if`'], answer: 3, why: 'Les commandes testées par `if`, `while`, `until`, les parties non finales de `&&` et `||`, et tout ce qui suit un `!` sont des exceptions.' },
					{ q: 'Avec la ligne `set` en place, pourquoi l’appelant apprend-il qu’il y a eu un échec ?', options: ['Le script sort avec un code non nul', 'Le script écrit dans `/var/log/cron`', 'Bash envoie un mail', 'Le script efface sa propre sortie'], answer: 0, why: 'cron, systemd ou un job de CI lisent le code de sortie, et un script arrêté sort avec un code non nul.' }
				]
			},
			{
				title: 'Protège les lignes dangereuses',
				questions: [
					{ q: 'Quelle forme de la ligne `cd` est sûre ?', options: ['`cd $BACKUP_DIR`', '`cd "$BACKUP_DIR" || true`', '`cd "${BACKUP_DIR:?}"`', '`cd ${BACKUP_DIR:-/}`'], answer: 2, why: 'Elle est entre guillemets, et `:?` s’arrête avec un message si la variable est vide ou non définie.' },
					{ q: 'Une faute de frappe, `$BACKUP_DRI`, sans `set -u`. Que devient `rm -rf "$BACKUP_DRI/"*` ?', options: ['`rm -rf /*`', '`rm -rf ./*`', 'Une erreur avant que `rm` tourne', '`rm -rf ""`'], answer: 0, why: 'La variable non définie donne une chaîne vide, donc le chemin commence à `/`.' },
					{ q: 'Pourquoi écrire `rm -rf ./*` au lieu de `rm -rf *` ?', options: ['C’est plus rapide', 'Ça efface aussi les fichiers cachés', 'Ça saute les répertoires', 'Bash lirait sinon un fichier nommé `-rf` comme une option'], answer: 3, why: 'shellcheck SC2035 : le préfixe `./` fait de chaque nom développé un chemin, jamais une option.' },
					{ q: 'Que fait `"${DOCKER:-docker}"` avec `set -u` quand `DOCKER` n’est pas définie ?', options: ['Ça arrête le script', 'Ça donne `docker` et le script continue', 'Ça affecte `DOCKER` pour le reste du script', 'Ça donne une chaîne vide'], answer: 1, why: '`:-` substitue une valeur par défaut sans échouer et sans affecter la variable.' }
				]
			},
			{
				title: 'Attrape les échecs cachés',
				questions: [
					{ q: 'Sans pipefail, `pg_dump mydb | gzip > /backup/db.sql.gz` renvoie le code de qui ?', options: ['`pg_dump`', 'La première commande en échec', '`gzip`, la dernière commande', 'Toujours 0'], answer: 2, why: 'Un pipeline renvoie le code de sa dernière commande, sauf avec pipefail.' },
					{ q: '`pg_dump` échoue sans pipefail. Qu’est-ce que tu obtiens ?', options: ['Une archive minuscule mais valide et un code de sortie à 0', 'Aucun fichier et un code de sortie à 1', 'Une sauvegarde complète', 'Un script qui s’arrête'], answer: 0, why: 'gzip compresse sans broncher une entrée vide, donc l’échec passe inaperçu.' },
					{ q: 'Avec pipefail, que renvoie le pipeline quand `pg_dump` échoue ?', options: ['Le code de `gzip`', 'Toujours 1', 'Zéro, avec un avertissement sur stderr', 'Le code de la commande la plus à droite en échec'], answer: 3, why: 'pipefail renvoie le code de la commande la plus à droite en échec, donc l’erreur de `pg_dump` se voit.' },
					{ q: 'Un `grep` de ton script renvoie 1 quand rien ne correspond, et c’est normal. Qu’écris-tu ?', options: ['Retirer `set -e`', 'Ajouter `|| true` après ce `grep`', 'Mettre le script dans un `bash -c`', 'Désactiver pipefail'], answer: 1, why: 'Les commandes qui renvoient un code non nul exprès ont besoin de `|| true` là où c’est attendu.' }
				]
			},
			{
				title: 'Rends-le relançable, puis passe le lint',
				questions: [
					{ q: 'Que se passe-t-il quand l’ajout dans `.bashrc` tourne deux fois ?', options: ['Il échoue la deuxième fois', 'Il ajoute une ligne en double à chaque passage', 'Il écrase le fichier', 'Rien'], answer: 1, why: '`>>` ajoute à l’aveugle, donc chaque passage rajoute la même ligne.' },
					{ q: 'Quelle version est idempotente ?', options: ['`echo \'…\' > ~/.bashrc`', '`echo \'…\' >> ~/.bashrc || true`', '`grep -qxF \'…\' ~/.bashrc || echo \'…\' >> ~/.bashrc`', '`cat ~/.bashrc >> ~/.bashrc`'], answer: 2, why: 'Elle cherche d’abord la ligne exacte et n’ajoute que si elle manque.' },
					{ q: 'Que signale shellcheck sur la ligne `cd $BACKUP_DIR` de l’original ?', options: ['SC2164 et SC2086', 'Seulement SC2312', 'Rien', 'Seulement SC2035'], answer: 0, why: 'SC2164, c’est un `cd` sans plan B, SC2086 la variable sans guillemets.' },
					{ q: 'Avec ses vérifications par défaut, shellcheck prévient-il du pipefail manquant ?', options: ['Oui, avec SC2086', 'Oui, il refuse de tourner', 'Seulement sur les scripts `#!/bin/sh`', 'Non : seule l’option SC2312 le fait, donc tu ajoutes pipefail toi-même'], answer: 3, why: 'Les vérifications par défaut ne disent rien sur le pipeline.' }
				]
			}
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
	lab: {
		minutes: 20,
		goal: 'Regarder un script dangereux agir dans le mauvais répertoire, puis le corriger jusqu’à ce qu’il s’arrête à la première erreur, se relance proprement et passe shellcheck.',
		steps: [
			'Écris la version dangereuse, avec `echo` à la place de `rm` pour ne rien effacer : `mkdir -p ~/sh-lab/backup && cd ~/sh-lab && touch backup/old-1 backup/old-2 && printf \'#!/usr/bin/env bash\\ncd $BACKUP_DIR\\necho "would delete:" *\\n\' > bad.sh`. Lance `bash bad.sh; echo $?` avec `BACKUP_DIR` non définie.',
			'Vois ce que chaque option de `set` attrape : `bash -c \'false | gzip > out.gz; echo $?\'`, puis `bash -c \'set -o pipefail; false | gzip > out.gz; echo $?\'`, puis `bash -c \'set -u; echo "$BACKUP_DRI"; echo after\'`.',
			'Écris `good.sh` : `printf \'#!/usr/bin/env bash\\nset -euo pipefail\\ncd "${BACKUP_DIR:?}"\\necho "would delete:" ./*\\n\' > good.sh`. Lance-le de trois façons : `bash good.sh`, `BACKUP_DIR=/nope bash good.sh`, `BACKUP_DIR=$HOME/sh-lab/backup bash good.sh`, chacune suivie de `echo $?`.',
			'Rends l’ajout idempotent. À l’aveugle : `for i in 1 2; do echo \'export PATH="$PATH:/opt/bin"\' >> rc; done; grep -c opt/bin rc`. Avec vérification : `touch rc2; for i in 1 2; do grep -qxF \'export PATH="$PATH:/opt/bin"\' rc2 || echo \'export PATH="$PATH:/opt/bin"\' >> rc2; done; grep -c opt/bin rc2`.',
			'Passe les deux scripts au lint avec l’image shellcheck : `docker run --rm -v "$PWD:/mnt" koalaman/shellcheck:stable bad.sh`, puis la même chose avec `good.sh`.'
		],
		done: [
			'`bad.sh` sort avec 0 et liste ton dossier personnel : `cd` avec une variable vide est allé dans `$HOME`.',
			'Le pipe affiche `0` sans pipefail et `1` avec. La ligne `set -u` affiche `unbound variable` et n’affiche jamais `after`.',
			'`good.sh` s’arrête avec `parameter null or not set` quand la variable manque, s’arrête sur `/nope`, et ne liste que `./old-1 ./old-2` avec le bon dossier.',
			'`grep -c` affiche `2` pour `rc` et `1` pour `rc2`. shellcheck signale SC2164 et SC2086 dans `bad.sh` et n’affiche rien pour `good.sh`.'
		],
		solution: [
			'Un `cd` sans argument va dans `$HOME`, donc le script dangereux aurait lancé `rm -rf *` dans ton dossier personnel. `${BACKUP_DIR:?}` et `set -e` en font un arrêt immédiat.',
			'`set -u` fait sortir bash avec un code non nul sur la faute de frappe (127 dans un `bash -c` ici), avant qu’une commande utilise la valeur vide.',
			'`./*` empêche un fichier nommé `-rf` d’être lu comme une option, ce que SC2035 signale avec `rm`.'
		]
	},
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
