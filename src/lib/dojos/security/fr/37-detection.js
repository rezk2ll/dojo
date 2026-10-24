const RULES = 'https://github.com/falcosecurity/rules/blob/81dfa535284a3fb3c04470eaefa435ac8f5b6558/rules/falco_rules.yaml';
const FIX = 'https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=24f6008564183aa120d07c03d9289519c2fe02af';
const ISSUE = 'https://github.com/falcosecurity/falco/issues/3480';
const ADOPT = 'https://falco.org/docs/concepts/rules/adoption-rules/';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'detection',
	part: 'En production',
	title: 'Détecter une attaque',
	minutes: 10,
	hook: [
		'Le 20 janvier 2022, un commit du noyau Linux intitulé « cgroup-v1: Require capabilities to set release_agent » ferme une évasion de conteneur. Avec les cgroups v1, le noyau lance le programme inscrit dans le fichier `release_agent` d’un cgroup avec toutes les capabilities, sur l’hôte. La faille reçoit le numéro CVE-2022-0492 et un score de 7.8.',
		'Le 2 juin 2026, la CISA ajoute CVE-2022-0492 à son catalogue des vulnérabilités exploitées (Known Exploited Vulnerabilities), avec une échéance au 5 juin. Des attaquants s’en servaient plus de quatre ans après le correctif.',
		'Le correctif ferme le trou. Une règle de détection te prévient quand quelqu’un essaie, ou essaie une technique qu’aucun correctif ne couvre encore.'
	],
	terms: [
		{ term: 'Syscall', def: 'Une demande d’un processus au noyau : `openat` ouvre un fichier, `execve` lance un programme. Falco lit ces événements dans le noyau et compare chacun à ses règles.' },
		{ term: 'Règle de détection', def: 'Une condition sur un événement, avec une ligne de sortie et une priorité. Chez Falco : `condition: open_write and container and fd.name endswith release_agent ...`.' },
		{ term: 'Faux positif', def: 'Une alerte sur une activité inoffensive, comme systemd qui lit `/etc/shadow` pendant une connexion SSH.' },
		{ term: 'Fatigue d’alerte', def: 'Les personnes d’astreinte arrêtent de lire un type d’alerte quand presque toutes ont été des faux positifs, et elles ratent la vraie.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['shell["L’attaquant a un shell dans un conteneur avec CAP_SYS_ADMIN"] --> write["openat(release_agent, O_WRONLY) : écrit un chemin à lancer sur l’hôte"]'],
				highlight: ['shell', 'write'],
				note: 'L’attaquant exécute déjà du code dans un conteneur grâce à un bug de l’appli. Le conteneur garde `CAP_SYS_ADMIN` et l’hôte utilise les cgroups v1. L’attaquant ouvre en écriture le fichier `release_agent` d’un cgroup et y met le chemin d’un programme.'
			},
			{
				add: ['write --> host["Le noyau lance ce programme sur l’hôte, avec toutes les capabilities"]'],
				highlight: ['host'],
				note: 'Quand la dernière tâche quitte un cgroup dont `notify_on_release` vaut 1, le noyau lance la commande inscrite dans `release_agent`. Le commit du correctif précise qu’il la lance avec toutes les capabilities (« a full set »). Le programme tourne sur l’hôte, hors des namespaces du conteneur.'
			},
			{
				add: ['write -.->|"événement syscall"| falco["Règle Falco : open_write, container, endswith release_agent, CAP_SYS_ADMIN"]', 'falco --> alert["Alerte CRITICAL : fichier, cap_effective, processus, ligne de commande"]'],
				highlight: ['falco', 'alert'],
				note: 'Falco lit le même événement `openat` dans le noyau. La règle « Detect release_agent File Container Escapes » attrape une écriture, dans un conteneur, sur un fichier qui finit par `release_agent`, par un processus qui a `CAP_SYS_ADMIN`. L’alerte donne le fichier, les capabilities et la ligne de commande.'
			},
			{
				add: ['patch["Correctif noyau : CAP_SYS_ADMIN dans le user namespace initial, sinon EPERM"] -.->|"écriture refusée"| write', 'drop["Le conteneur abandonne CAP_SYS_ADMIN"] -.-> shell'],
				highlight: ['patch', 'drop'],
				note: 'Falco signale l’écriture, mais le programme tourne quand même sur l’hôte. Deux autres couches bloquent l’évasion : le noyau corrigé renvoie `-EPERM` si l’auteur n’a pas `CAP_SYS_ADMIN` dans le user namespace initial, et un conteneur sans `CAP_SYS_ADMIN` (jour 33) ne déclenche jamais la règle.'
			},
			{
				add: ['fp["systemd-executor lit /etc/shadow après une connexion SSH"] --> noisy["WARNING : fichier sensible ouvert par un programme non fiable"]'],
				highlight: ['fp', 'noisy'],
				note: 'D’autres règles se déclenchent sur du travail normal. Dans falco#3480, « Read sensitive file untrusted » sonnait souvent après les connexions SSH : l’assistant de systemd lisait `/etc/shadow` avec un `proc.name` égal à `9`. Chaque faux positif de ce genre apprend à la personne d’astreinte à ignorer cette alerte.'
			}
		]
	},
	example: {
		title: 'rules/falco_rules.yaml : une règle par défaut et les exceptions qui la font taire',
		repo: 'falcosecurity/rules',
		url: `${RULES}#L397-L446`,
		lang: 'yaml',
		code: `- rule: Read sensitive file untrusted
…
  condition: >
    open_read
    and sensitive_files
    and proc_name_exists
    and not proc.name in (user_mgmt_binaries, userexec_binaries, package_mgmt_binaries,
     cron_binaries, read_sensitive_file_binaries, shell_binaries, hids_binaries,
     vpn_binaries, mail_config_binaries, nomachine_binaries, sshkit_script_binaries,
     in.proftpd, mandb, salt-call, salt-minion, postgres_mgmt_binaries,
     google_oslogin_
     )
    and not cmp_cp_by_passwd
    and not ansible_running_python
    and not run_by_qualys
    and not run_by_chef
    and not run_by_google_accounts_daemon
    and not user_read_sensitive_file_conditions
    and not mandb_postinst
    and not perl_running_plesk
    and not perl_running_updmap
    and not veritas_driver_script
    and not perl_running_centrifydc
    and not runuser_reading_pam
    and not linux_bench_reading_etc_shadow
    and not user_known_read_sensitive_files_activities
    and not user_read_sensitive_file_containers
    and not systemd_sensitive_file_readers
…
  priority: WARNING
  tags: [maturity_stable, host, container, filesystem, mitre_credential_access, T1555]

# systemd spawns short-lived helper processes that legitimately read sensitive
# account/PAM files (e.g. /etc/shadow, /etc/pam.d/*) during normal operation.
# These helpers report a bare-number or comm-truncated proc.name, so they cannot
# be matched by name; proc.exepath (kernel-resolved, unspoofable) is used instead,
# and each entry is anchored to its expected systemd parent to keep it tight.
#   - systemd-executor: unit (re)exec deserialize handoff (see falcosecurity/falco#3480)
#   - systemd-userwork: userdb (User/Group Record Lookup) query worker
# The rule "Read sensitive file untrusted" uses this macro to avoid FPs.
- macro: systemd_sensitive_file_readers
  condition: >
    ((proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor) or
     (proc.pname=systemd-userdbd and proc.exepath=/usr/lib/systemd/systemd-userwork))`,
		notes: [
			'Les trois premières lignes de la condition font la détection : un fichier ouvert en lecture, ce fichier est dans `sensitive_files` (`/etc/shadow`, `/etc/sudoers`, `/etc/pam.conf` et les fichiers de `/etc/pam.d`), et le processus a un nom.',
			'Les 16 macros `and not` qui suivent écartent des programmes qui lisent ces fichiers dans leur travail normal : Ansible, Chef, Qualys, man-db, des scripts Plesk. Elles s’ajoutent à la longue liste de noms de programmes de confiance.',
			'La dernière macro corrige [falco#3480](' + ISSUE + '). L’assistant remontait `proc.name` à `9`, donc une comparaison sur le nom ne pouvait pas marcher. La macro compare `proc.exepath`, que le commentaire décrit comme « kernel-resolved, unspoofable » (résolu par le noyau, impossible à falsifier), et le processus parent.',
			'`user_known_read_sensitive_files_activities` vaut `never_true` par défaut. C’est un emplacement vide pour tes propres exceptions : tu règles la règle dans ton fichier à toi et tu gardes les mises à jour upstream.'
		]
	},
	tradeoff: {
		gain: [
			'Falco lit les syscalls dans le noyau : une règle couvre tous les conteneurs du nœud, sans rien ajouter aux images.',
			'La règle release_agent a 5 conditions et se déclenche sur un seul `openat`. L’alerte contient le fichier, les capabilities et la ligne de commande.',
			'Une exception sur `proc.exepath` et le processus parent fait taire un programme connu et attrape toujours un `cat /etc/shadow` lancé par un attaquant.'
		],
		cost: [
			'Falco envoie l’alerte une fois l’`openat` passé : le correctif et les capabilities retirées doivent encore bloquer l’évasion.',
			'Chaque exception est un trou : une exception qui ne compare que `proc.name` laisse passer tout binaire qui porte ce nom.',
			'La doc Falco : « Falco rules require constant tuning and maintenance ». Chaque nouveau logiciel sur les hôtes amène de nouveaux faux positifs.'
		]
	},
	task: {
		prompt: 'Chaque nuit, après la connexion SSH du job de sauvegarde, Falco envoie ce WARNING quelques dizaines de fois :\n\n```\nrule=Read sensitive file untrusted file=/etc/shadow process=9\nproc_exepath=/usr/lib/systemd/systemd-executor parent=systemd\ncommand=9 --deserialize 88 --log-level info\n```\n\nÉcris un réglage dans ton fichier de règles local qui arrête ces alertes et alerte toujours sur un `cat /etc/shadow` lancé par un attaquant. Cite deux réglages que tu as écartés, et pourquoi.',
		hint: 'La règle finit déjà par `and not user_known_read_sensitive_files_activities`. Quels champs de l’alerte l’attaquant ne contrôle-t-il pas ?',
		answer: [
			'Remplace la macro vide dans `/etc/falco/falco_rules.local.yaml`, chargé après le fichier par défaut :\n```yaml\n- macro: user_known_read_sensitive_files_activities\n  condition: (proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor)\n  override:\n    condition: replace\n```',
			'Un `cat /etc/shadow` d’attaquant a `proc.exepath=/usr/bin/cat` et un shell comme parent : il déclenche toujours la règle. Upstream a corrigé falco#3480 avec les deux mêmes champs dans `systemd_sensitive_file_readers`.',
			'Écarté : ajouter `9` à une liste de noms de confiance. Tout programme que l’attaquant nomme `9` lirait alors `/etc/shadow` sans alerte.',
			'Écarté : couper la règle, ou retirer `/etc/shadow`. Les deux font aussi taire l’attaquant. Baisser la priorité range la lecture de l’attaquant dans le même bac que le bruit de la nuit.'
		],
		steps: [
			{
				title: 'Lis l’alerte',
				questions: [
					{ q: 'Quelle règle envoie ce WARNING ?', options: ['Read sensitive file untrusted', 'Terminal shell in container', 'Detect release_agent File Container Escapes', 'Write below etc'], answer: 0, why: 'La ligne d’alerte commence par `rule=Read sensitive file untrusted`, et le fichier est `/etc/shadow`.' },
					{ q: 'Quel programme a vraiment ouvert `/etc/shadow` ?', options: ['Un programme nommé `9`', '`/usr/lib/systemd/systemd-executor`, lancé par systemd', 'Le shell de connexion du job de sauvegarde', '`cat`'], answer: 1, why: '`process=9` n’est que le nom qu’il annonce. `proc_exepath` et `parent` montrent l’assistant de systemd.' },
					{ q: 'Quand l’alerte se déclenche-t-elle ?', options: ['Toutes les heures pile', 'Quand un attaquant se connecte', 'Après la connexion SSH du job de sauvegarde de la nuit', 'Seulement quand Falco redémarre'], answer: 2, why: 'L’énoncé la lie à la connexion SSH du job de sauvegarde, le même schéma que falco#3480.' },
					{ q: 'Pourquoi est-ce un faux positif ?', options: ['Le fichier est `/etc/sudoers`, pas `/etc/shadow`', 'Falco est mal configuré sur cet hôte', 'La règle n’a pas de priorité', 'C’est l’assistant de systemd qui fait son travail normal après une connexion SSH'], answer: 3, why: 'Une alerte sur une activité inoffensive est un faux positif. systemd qui lit `/etc/shadow` pendant une connexion SSH est l’exemple même du chapitre.' }
				]
			},
			{
				title: 'Choisis des champs que l’attaquant ne peut pas falsifier',
				questions: [
					{ q: 'Pourquoi `process=9` est-il un mauvais champ pour l’exception ?', options: ['N’importe quel programme peut s’appeler `9`', 'Il change chaque nuit', 'Falco ne peut pas le lire', 'Il est trop court pour aller dans une liste'], answer: 0, why: 'N’importe quel programme peut fixer son nom de processus, donc une correspondance sur ce nom peut être copiée.' },
					{ q: 'Que dit le commentaire de la macro upstream sur `proc.exepath` ?', options: ['Il est vide dans les conteneurs', 'Il est « kernel-resolved, unspoofable »', 'Il est fixé par le programme lui-même', 'Il demande un plugin Falco'], answer: 1, why: 'Le noyau résout le chemin de l’exécutable, donc le programme ne peut pas en choisir un faux.' },
					{ q: 'Quel deuxième champ l’exception associe-t-elle à `proc.exepath` ?', options: ['`fd.name`', '`proc.cmdline`', '`proc.pname`, le parent `systemd`', '`user.name`'], answer: 2, why: 'Upstream a corrigé falco#3480 avec les deux mêmes champs : le chemin de l’exécutable et le processus parent.' },
					{ q: 'Un attaquant lance `cat /etc/shadow` depuis un shell. Que voit Falco ?', options: ['`proc.exepath=/usr/lib/systemd/systemd-executor`', 'Rien : `cat` est un programme de confiance', '`process=9` et le parent `systemd`', '`proc.exepath=/usr/bin/cat` et un shell comme parent'], answer: 3, why: 'Aucun des deux champs ne correspond à l’exception, donc la règle sonne toujours pour l’attaquant.' }
				]
			},
			{
				title: 'Écris le réglage',
				questions: [
					{ q: 'Dans quel fichier va le réglage ?', options: ['`/etc/falco/falco_rules.yaml`, modifié sur place', '`/etc/falco/falco_rules.local.yaml`, chargé après le fichier par défaut', 'Un nouveau fichier chargé avant celui par défaut', '`/etc/falco/falco.yaml`'], answer: 1, why: 'Ton propre fichier est chargé après les règles par défaut, donc tu gardes ton changement et tu reçois toujours les mises à jour upstream.' },
					{ q: 'Quelle macro remplaces-tu ?', options: ['`sensitive_files`', '`open_read`', '`user_known_read_sensitive_files_activities`', '`never_true`'], answer: 2, why: 'La règle finit déjà par `and not user_known_read_sensitive_files_activities`. Elle vaut `never_true` par défaut, un emplacement vide pour tes exceptions.' },
					{ q: 'Que fait `override: condition: replace` ?', options: ['Il remplace la condition de la macro par la tienne', 'Il ajoute ta condition après l’ancienne', 'Il supprime la règle', 'Il baisse la priorité de la règle'], answer: 0, why: 'La macro par défaut vaut `never_true`. La remplacer met ton exception à sa place.' },
					{ q: 'Quelle condition va dans la macro ?', options: ['`proc.name=9`', '`fd.name=/etc/shadow`', '`proc.pname=systemd`', '`(proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor)`'], answer: 3, why: 'Les deux champs ensemble désignent l’assistant et rien d’autre. Le parent seul ferait confiance à tous les enfants de systemd.' }
				]
			},
			{
				title: 'Écarte les mauvais réglages',
				questions: [
					{ q: 'Pourquoi écarter l’ajout de `9` aux noms de confiance ?', options: ['Tout programme que l’attaquant nomme `9` lirait `/etc/shadow` sans alerte', 'Les listes Falco ne peuvent pas contenir de nombres', 'Ça ralentit toutes les règles', 'Ça ne marche qu’après un redémarrage'], answer: 0, why: 'Une exception qui ne regarde que le nom laisse passer tout binaire qui porte ce nom.' },
					{ q: 'Pourquoi écarter le retrait de `/etc/shadow` des fichiers sensibles ?', options: ['La règle ne se chargerait plus', 'Ça fait aussi taire la lecture de l’attaquant', '`/etc/shadow` n’est pas sensible de toute façon', 'Falco aurait besoin d’un nouveau driver noyau'], answer: 1, why: 'Si le fichier n’est plus dans la liste, personne ne déclenche rien en le lisant, l’attaquant compris.' },
					{ q: 'Pourquoi écarter la baisse de priorité en DEBUG ?', options: ['Les alertes DEBUG sont supprimées tout de suite', 'Falco ne le permet pas', 'La lecture de l’attaquant atterrit dans le même bac que le bruit', 'Ça coûte plus de CPU'], answer: 2, why: 'La priorité s’applique à chaque déclenchement de la règle, le vrai compris.' },
					{ q: 'Les alertes de la nuit ne font de mal à personne. Pourquoi les régler ?', options: ['Elles remplissent le disque', 'Elles font planter Falco', 'Elles ralentissent les connexions SSH', 'La fatigue d’alerte : on arrête de lire cette alerte et on rate la vraie'], answer: 3, why: 'Quelques dizaines de fausses alertes par nuit apprennent à la personne d’astreinte à ignorer cette règle.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Quel événement déclenche la règle « Detect release_agent File Container Escapes » ?',
			options: [
				'N’importe quel processus de l’hôte qui lit un fichier nommé `release_agent`',
				'Un processus de conteneur avec `CAP_SYS_ADMIN` qui écrit dans un fichier `release_agent`',
				'Un conteneur qui monte un système de fichiers cgroup v1 au démarrage',
				'Tout `execve` d’un programme inscrit dans un fichier `release_agent`'
			],
			answer: 1,
			why: 'La condition est `open_write and container and fd.name endswith release_agent`, avec l’uid 0 ou `CAP_DAC_OVERRIDE`, et `CAP_SYS_ADMIN` dans les capabilities effectives. Elle surveille l’écriture qui prépare l’évasion, avant que le noyau lance le programme.'
		},
		{
			q: '« Read sensitive file untrusted » sonne après les connexions SSH avec `process=9` et `proc_exepath=/usr/lib/systemd/systemd-executor`. Quel réglage upstream a-t-il choisi ?',
			options: [
				'Ajouter `9` à la liste des noms de programmes de confiance de la règle',
				'Comparer `proc.exepath` avec le processus parent `systemd`',
				'Baisser la priorité de la règle de WARNING à DEBUG sur tous les hôtes',
				'Retirer `/etc/shadow` de la liste `sensitive_file_names`'
			],
			answer: 1,
			why: 'C’est le noyau qui résout `proc.exepath`, et le commentaire de la macro le dit « unspoofable ». N’importe quel programme peut prendre un nom comme `9`, et retirer le fichier ou baisser la priorité cacherait aussi un vrai attaquant.'
		},
		{
			q: 'Les admins font des `kubectl exec` toute la journée, et « Terminal shell in container » envoie une NOTICE à chaque fois. Que propose la description de la règle ?',
			options: [
				'Couper la règle, car elle ne distingue pas un admin d’un attaquant',
				'La passer en CRITICAL pour que l’astreinte regarde chaque shell',
				'S’en servir comme trace d’audit, lue à côté des alertes des autres règles',
				'Ajouter le nom de chaque admin dans `shell_binaries`'
			],
			answer: 2,
			why: 'La description dit qu’elle est « Common when using kubectl exec » et « may be best used as generic auditing rule while examining other triggered rules in this container/tty ». Elle propose aussi de la croiser avec les logs d’audit Kubernetes des exec pour retrouver l’utilisateur.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Charger le réglage de l’exercice dans Falco, le lancer sur ton portable, et vérifier qu’un `cat /etc/shadow` dans un conteneur déclenche toujours l’alerte.',
		steps: [
			'Écris le réglage dans un fichier de règles local : `mkdir -p ~/falco-lab && cd ~/falco-lab && printf \'%s\\n\' \'- macro: user_known_read_sensitive_files_activities\' \'  condition: (proc.pname=systemd and proc.exepath=/usr/lib/systemd/systemd-executor)\' \'  override:\' \'    condition: replace\' > local.yaml`.',
			'Vérifie que Falco l’accepte : `docker run --rm -v "$PWD/local.yaml":/etc/falco/falco_rules.local.yaml:ro falcosecurity/falco:0.42.0 falco -V /etc/falco/falco_rules.yaml -V /etc/falco/falco_rules.local.yaml`.',
			'Dans un premier terminal, lance Falco en direct. Il a besoin de `--privileged` pour lire les événements du noyau, donc fais-le seulement sur ta propre machine : `docker run --rm -it --privileged -v /var/run/docker.sock:/var/run/docker.sock -v /proc:/host/proc:ro -v /etc:/host/etc:ro -v "$PWD/local.yaml":/etc/falco/falco_rules.local.yaml:ro falcosecurity/falco:0.42.0`.',
			'Dans un second terminal, joue l’attaquant : `docker run --rm busybox:1.37 cat /etc/shadow`.',
			'Lis l’alerte dans le premier terminal, puis arrête Falco avec Ctrl+C.'
		],
		done: [
			'L’étape 2 affiche `/etc/falco/falco_rules.local.yaml: Ok`.',
			'Falco affiche `Warning Sensitive file opened for reading by non-trusted program` avec `file=/etc/shadow` et, plus loin sur la même ligne, `process=cat`.'
		],
		solution: [
			'La ligne d’alerte porte `proc_exepath`, le chemin de l’exécutable résolu par le noyau. C’est le champ que l’exception regarde, et `cat` n’a pas le chemin de l’assistant.',
			'Tu verras peut-être le même WARNING pour des programmes qui tournent déjà sur ton portable, comme le health check d’une base de données dans un autre conteneur. Chacun appelle sa propre exception sur le chemin de l’exécutable et le parent, jamais sur le nom seul.',
			'Ce lab tourne sous Linux. Sur macOS, Docker Desktop lance les conteneurs dans une VM, et le lab n’y a pas été essayé.'
		]
	},
	recall: {
		q: 'Quelle règle Falco par défaut attrape une tentative d’évasion CVE-2022-0492, et quel événement syscall surveille-t-elle ?',
		a: '« Detect release_agent File Container Escapes », priorité CRITICAL : un `openat` en écriture sur un fichier qui finit par `release_agent`, par un processus de conteneur qui a `CAP_SYS_ADMIN`.'
	},
	sources: [
		{ title: 'falcosecurity/rules, rules/falco_rules.yaml', url: RULES },
		{ title: 'Doc Falco, Adoption of Falco Rules in Production', url: ADOPT },
		{ title: 'Doc Falco, Rule Exceptions', url: 'https://falco.org/docs/concepts/rules/exceptions/' },
		{ title: 'falcosecurity/falco#3480, faux positifs sur la lecture de fichiers sensibles après une connexion SSH', url: ISSUE },
		{ title: 'Doc du noyau Linux, cgroups v1 (notify_on_release et release_agent)', url: 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56/Documentation/admin-guide/cgroup-v1/cgroups.rst#L288-L302' },
		{ title: 'NVD, CVE-2022-0492', url: 'https://nvd.nist.gov/vuln/detail/CVE-2022-0492' },
		{ title: 'Commit du noyau Linux 24f6008, cgroup-v1: Require capabilities to set release_agent', url: FIX },
		{ title: 'CISA, Known Exploited Vulnerabilities Catalog', url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog?field_cve=CVE-2022-0492' }
	]
};
