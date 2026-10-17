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
