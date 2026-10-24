const CADDY = 'https://github.com/caddyserver/dist/blob/f94a1d2626835ff4157e85296fb8e4fa5500e0fb';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'linux-for-automation',
	part: 'Les fondamentaux',
	title: 'Codes de sortie, flux et systemd : comment les outils se parlent',
	minutes: 10,
	hook: [
		'Tu lances `systemctl restart caddy`. Rien ne s’affiche. Tu regardes l’écran, tu ne vois aucune erreur et tu passes à la suite.',
		'Un pipeline exécute tes commandes sans personne devant l’écran. Il décide à partir de trois choses seulement : **le code de sortie**, ce qui est parti sur stdout et ce qui est parti sur stderr.',
		'systemd se sert des trois mêmes choses pour les services. Il démarre le processus, surveille son code de sortie et envoie sa sortie dans le journal.'
	],
	terms: [
		{ term: 'Code de sortie', def: 'Le nombre qu’un processus renvoie quand il se termine. `0` veut dire succès. Tout ce qui va de 1 à 255 veut dire échec, et c’est le programme qui choisit le nombre.' },
		{ term: 'stdout et stderr', def: 'Deux flux de sortie : stdout (descripteur de fichier 1) pour les résultats, stderr (descripteur 2) pour les erreurs et les messages. stdin (descripteur 0) est l’entrée.' },
		{ term: 'Unit', def: 'Un fichier qui dit à systemd comment lancer quelque chose. Une unit `.service` indique quelle commande démarrer, sous quel utilisateur, et quoi faire quand elle se termine.' },
		{ term: 'Journal', def: 'Le stockage des logs de systemd, géré par journald. Tu le lis avec `journalctl`, filtré par unit, par boot, par période ou par priorité.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['cmd["Processus : caddy run"]', 'cmd -->|"fd 1"| out["stdout"]', 'cmd -->|"fd 2"| err["stderr"]'],
				highlight: ['cmd', 'out', 'err'],
				note: 'Chaque processus démarre avec trois flux : stdin, stdout et stderr. Si un programme écrit ses résultats sur stdout et ses erreurs sur stderr, tu peux **passer les résultats dans un pipe et voir quand même les erreurs**.'
			},
			{
				add: ['cmd -->|"à la sortie"| code["Code de sortie : 0 ou de 1 à 255"]'],
				highlight: ['code'],
				note: 'Quand il se termine, le processus renvoie un nombre : 0 pour un succès, de 1 à 255 pour un échec. Bash ajoute quelques codes à lui : 127 pour une commande introuvable, 126 pour une commande trouvée mais pas exécutable, 128+N pour un processus tué par le signal N.'
			},
			{
				add: ['subgraph sd["systemd"]', 'unit["caddy.service"]', 'end', 'unit -->|"démarre, surveille"| cmd'],
				highlight: ['unit'],
				note: 'systemd démarre le processus depuis le fichier d’unit : tu n’as besoin ni de `nohup` ni de fichier PID. Il suit le processus et lit son code de sortie. Le réglage `Restart=` décide de la suite, et **sa valeur par défaut est `no`**.'
			},
			{
				add: ['jr[("journald")]', 'out --> jr', 'err --> jr'],
				highlight: ['jr'],
				note: 'Par défaut, le stdout d’un service va dans le journal, et stderr va là où va stdout. Tu n’as aucun fichier de log à faire tourner. `journalctl -u caddy -f` le suit en direct, `-b` le limite au boot en cours.'
			},
			{
				add: ['auto["Ton script ou ton job de CI"]', 'auto -.->|"systemctl is-active caddy"| unit'],
				highlight: ['auto'],
				note: 'Ton script interroge systemd, et la réponse revient sous forme de code de sortie : `systemctl is-active` renvoie 0 si l’unit est active, autre chose sinon.'
			}
		]
	},
	example: {
		title: 'init/caddy.service',
		repo: 'caddyserver/dist',
		url: `${CADDY}/init/caddy.service#L16-L35`,
		lang: 'ini',
		code: `[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target`,
		notes: [
			'Ligne 8, `Type=notify` : systemd attend que Caddy envoie `READY=1` avant de considérer le démarrage terminé. Quand `systemctl start caddy` rend la main, Caddy a fini de démarrer.',
			'Lignes 9 et 17 : `User=caddy` avec `CAP_NET_BIND_SERVICE` dans `AmbientCapabilities`. Caddy ne tourne pas en root, et il peut quand même écouter sur les ports sous 1024, comme 80 et 443.',
			'Les lignes 7 à 17 n’ont **aucune ligne `Restart=`**, donc la valeur par défaut `no` s’applique : si Caddy plante, il reste arrêté. La [doc de Caddy](https://caddyserver.com/docs/running) montre comment ajouter `Restart=on-failure` dans un override.',
			'Ligne 11 : `--environ` affiche tout l’environnement au démarrage, et cette sortie arrive dans le journal. Un secret que tu mets dans l’environnement finit dans tes logs. Le jour 10 montre où mettre les secrets à la place.',
			'Ligne 12 : `ExecReload` est la commande que lance `systemctl reload caddy`. Un reload applique la nouvelle config sans arrêter le serveur. Un stop suivi d’un start coupe les connexions.'
		]
	},
	tradeoff: {
		gain: [
			'Chaque outil rend compte par un code de sortie et deux flux, donc n’importe quel script peut piloter n’importe quel autre programme.',
			'systemd gère l’utilisateur, la politique de redémarrage et les logs : tes scripts n’ont besoin ni de `nohup`, ni de fichiers PID, ni de rotation des logs.',
			'Tu filtres le journal par unit, par boot, par période et par priorité, sans grep dans cinq fichiers.'
		],
		cost: [
			'Un code de sortie t’apprend qu’une étape a échoué, et tu lis stderr pour savoir pourquoi.',
			'Certains outils sortent avec 0 sur ce que toi tu appelles un échec. `curl` renvoie 0 sur un HTTP 500 si tu ne passes pas `--fail`.',
			'Les fichiers d’unit ont des centaines d’options, et certaines valeurs par défaut surprennent : `Restart=no` laisse un service planté à l’arrêt.'
		]
	},
	task: {
		prompt: 'Caddy a planté à 3 h du matin et il est resté arrêté jusqu’à ton réveil. À partir de l’unit ci-dessus, fais-le redémarrer tout seul au bout de 5 secondes, sans modifier le fichier du paquet. Donne ensuite les commandes pour savoir pourquoi il s’est arrêté.',
		hint: 'systemd sait empiler un petit fichier par-dessus une unit. La doc de Caddy a une section « Restart on crash ».',
		answer: [
			'`sudo systemctl edit caddy` ouvre un fichier **drop-in** (`override.conf` par défaut). systemd recharge sa config tout seul quand tu enregistres.',
			'Mets dedans : `[Service]`, `Restart=on-failure`, `RestartSec=5s`. La doc de Caddy ajoute aussi `RestartPreventExitStatus=1`, pour que le code de sortie 1 ne déclenche pas de redémarrage.',
			'L’unit du paquet reste intacte, donc une mise à jour du paquet n’efface pas ta modif.',
			'Pourquoi il s’est arrêté : `systemctl status caddy` montre le dernier code de sortie et les dernières lignes de log. `journalctl -u caddy -b` montre toutes les lignes de log depuis le boot.'
		],
		steps: [
			{
				title: 'Comprends pourquoi il est resté arrêté',
				questions: [
					{ q: 'Tu trouves Caddy arrêté à 8 h. Avant toute correction, quelle commande le relance tout de suite ?', options: ['`sudo systemctl reload caddy`', '`sudo systemctl start caddy`', '`sudo systemctl enable caddy`', '`sudo systemctl daemon-reload`'], answer: 1, why: 'Un service planté reste arrêté jusqu’à ce que quelqu’un le relance. `reload` lance `ExecReload`, qui applique seulement une nouvelle config à un Caddy déjà en marche.' },
					{ q: 'Comment systemd sait-il que Caddy a échoué ?', options: ['Par le code de sortie du processus', 'Par un fichier PID', 'Par une tâche cron', 'Par la taille du journal'], answer: 0, why: 'systemd démarre le processus, le suit et lit son code de sortie quand il se termine.' },
					{ q: 'Quelle valeur de `Restart=` ne redémarre que si le service échoue ?', options: ['`always`', '`no`', '`on-failure`', '`notify`'], answer: 2, why: '`on-failure` redémarre après un échec. `always` redémarrerait aussi après une sortie propre.' },
					{ q: 'Pourquoi ne pas modifier directement le `caddy.service` du paquet ?', options: ['systemd ignore les modifs des fichiers d’unit', 'Les fichiers d’unit sont en lecture seule partout', 'Caddy vérifie une somme de contrôle de son unit', 'Une mise à jour du paquet peut effacer ta modif'], answer: 3, why: 'Ce fichier appartient au paquet. Ta modif va dans un fichier à part, empilé par-dessus.' }
				]
			},
			{
				title: 'Ajoute un drop-in',
				questions: [
					{ q: 'Quelle commande ouvre un drop-in pour Caddy ?', options: ['`sudo vim /usr/lib/systemd/system/caddy.service`', '`sudo systemctl edit caddy`', '`sudo systemctl reload caddy`', '`journalctl -u caddy -e`'], answer: 1, why: '`systemctl edit` ouvre un fichier drop-in (`override.conf` par défaut) et recharge la config quand tu enregistres.' },
					{ q: 'Quel en-tête de section va dans le drop-in ?', options: ['`[Unit]`', '`[Install]`', '`[Restart]`', '`[Service]`'], answer: 3, why: '`Restart=` et `RestartSec=` sont des réglages de service, donc ils vont sous `[Service]`.' },
					{ q: 'Quelles deux lignes font redémarrer Caddy au bout de 5 secondes ?', options: ['`Restart=on-failure` et `RestartSec=5s`', '`Type=notify` et `TimeoutStopSec=5s`', '`Restart=always` et `TimeoutStopSec=5s`', '`ExecReload=` et `RestartSec=5s`'], answer: 0, why: '`Restart=on-failure` active les redémarrages, et `RestartSec=5s` règle l’attente.' },
					{ q: 'Faut-il lancer `systemctl daemon-reload` après `systemctl edit` ?', options: ['Oui, toujours', 'Seulement si tu redémarres aussi la machine', 'Non, systemd recharge sa config tout seul quand tu enregistres', 'Non, parce que les drop-ins ne sont lus qu’au boot'], answer: 2, why: '`systemctl edit` recharge lui-même la configuration des units une fois le fichier enregistré.' }
				]
			},
			{
				title: 'Choisis quelles sorties redémarrent',
				questions: [
					{ q: 'Quelle ligne en plus la doc de Caddy ajoute-t-elle à l’override de redémarrage ?', options: ['`Restart=always`', '`RestartPreventExitStatus=1`', '`StandardError=null`', '`User=root`'], answer: 1, why: 'La doc de Caddy ajoute `RestartPreventExitStatus=1`, pour que le code de sortie 1 ne déclenche pas de redémarrage.' },
					{ q: 'Un contrôle de santé lance `curl http://localhost/` et Caddy répond HTTP 500. Sans `--fail`, quel code de sortie renvoie `curl` ?', options: ['0', '500', '1', '127'], answer: 0, why: 'Certains outils sortent avec 0 sur ce que toi tu appelles un échec. `curl` renvoie 0 sur un HTTP 500 si tu ne passes pas `--fail`, donc un contrôle qui se fie au code de sortie voit un Caddy en bonne santé.' },
					{ q: 'Un processus tué par le signal 15 (SIGTERM) affiche quel code en bash ?', options: ['15', '127', '0', '143'], answer: 3, why: 'Bash rend une mort par le signal N comme 128 + N, donc 128 + 15 = 143.' },
					{ q: 'Un script demande `systemctl is-active caddy`. Comment lit-il la réponse ?', options: ['Seulement par le texte affiché', 'Par le journal', 'Par le code de sortie : 0 si active, autre chose sinon', 'Par un fichier dans `/run`'], answer: 2, why: 'Les outils parlent aux scripts par codes de sortie, et `is-active` ne renvoie 0 que si l’unit est active.' }
				]
			},
			{
				title: 'Trouve pourquoi il s’est arrêté',
				questions: [
					{ q: 'Quelle commande montre le dernier code de sortie et les dernières lignes de log ?', options: ['`systemctl status caddy`', '`systemctl cat caddy`', '`systemctl is-enabled caddy`', '`caddy version`'], answer: 0, why: '`systemctl status` montre l’état, le dernier code de sortie et les lignes les plus récentes du journal.' },
					{ q: 'Quelle commande montre toutes les lignes de log de Caddy depuis le boot ?', options: ['`cat /var/log/caddy.log`', '`journalctl -u caddy -f`', '`journalctl -b`', '`journalctl -u caddy -b`'], answer: 3, why: '`-u caddy` filtre par unit et `-b` limite au boot en cours.' },
					{ q: 'Où va le stderr d’un service par défaut ?', options: ['Dans `/dev/null`', 'Dans un fichier à côté du binaire', 'Là où va stdout : le journal', 'Sur la console de la machine'], answer: 2, why: 'Par défaut, stdout va dans le journal, et stderr va là où va stdout.' },
					{ q: 'Caddy démarre avec `--environ`. À quoi dois-tu faire attention dans ces logs ?', options: ['À rien, ça n’affiche que la version', 'Un secret dans l’environnement finit dans le journal', 'Ça cache stderr', 'Ça coupe le journal'], answer: 1, why: '`--environ` affiche tout l’environnement au démarrage, et cette sortie arrive dans le journal.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Une étape de ton script sort avec le code 127. Qu’est-ce que ça veut dire en bash ?',
			options: [
				'Le processus a été tué par le signal 127',
				'La commande est introuvable',
				'La commande a réussi avec des avertissements',
				'Un fichier n’a pas pu être lu'
			],
			answer: 1,
			why: 'Bash renvoie 127 quand il ne trouve pas la commande, et 126 quand il la trouve mais ne peut pas l’exécuter. Un signal apparaît comme 128 plus le numéro du signal.'
		},
		{
			q: 'Tu lances `ls /nope 2>&1 > out.txt` dans un terminal. Où part le message d’erreur ?',
			options: ['Dans out.txt', 'Dans le terminal', 'À la fois dans out.txt et dans le terminal', 'Nulle part, il est jeté'],
			answer: 1,
			why: 'Les redirections s’appliquent de gauche à droite. `2>&1` copie stdout tel qu’il est à ce moment-là (le terminal), et c’est seulement après que stdout part vers le fichier. Écris `> out.txt 2>&1` pour tout envoyer dans le fichier.'
		},
		{
			q: 'L’unit Caddy ci-dessus n’a pas de ligne `Restart=`. Le processus Caddy plante. Que fait systemd ?',
			options: [
				'Il le redémarre au bout de 100 ms',
				'Il le laisse arrêté',
				'Il le redémarre 5 fois, puis abandonne',
				'Il redémarre la machine'
			],
			answer: 1,
			why: '`Restart=` vaut `no` par défaut : le service n’est pas redémarré. Tu dois l’activer toi-même avec `on-failure` ou `always`.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Lire les codes de sortie et les flux comme un pipeline, puis regarder systemd redémarrer un service qui plante, sans root.',
		steps: [
			'Lis des codes de sortie en bash : `ls /nope; echo $?`, puis `nosuchcmd; echo $?`, puis `sh -c \'kill -TERM $$\'; echo $?`.',
			'Sépare les flux : `mkdir -p ~/streams-lab && cd ~/streams-lab && ls /nope /tmp > out.txt 2> err.txt; echo $?`, puis `cat out.txt` et `cat err.txt`. Essaie le piège de l’ordre : `ls /nope 2>&1 > out2.txt`.',
			'Vois un outil sortir avec 0 sur ce que toi tu appelles un échec : `python3 -m http.server 8000 >/dev/null 2>&1 &`, puis `curl -s -o /dev/null localhost:8000/missing; echo $?` et `curl -s --fail -o /dev/null localhost:8000/missing; echo $?`. Arrête le serveur avec `kill %1`.',
			'Linux avec systemd seulement : lance un service qui plante, avec la valeur par défaut `Restart=no` : `systemd-run --user --unit=crashy sh -c \'echo started; echo boom >&2; exit 3\'`. Puis `systemctl --user is-active crashy; echo $?` et `systemctl --user reset-failed crashy`.',
			'Même service avec une politique de redémarrage : `systemd-run --user --unit=crashy -p Restart=on-failure -p RestartSec=5s sh -c \'echo started; echo boom >&2; sleep 2; exit 3\'`. Attends 15 secondes, puis lance `systemctl --user show crashy -p NRestarts` et `journalctl --user -u crashy --no-pager | tail`.',
			'Nettoie : `systemctl --user stop crashy`. Si `systemctl --user status crashy` le montre encore en échec, lance `systemctl --user reset-failed crashy`.'
		],
		done: [
			'L’étape 1 affiche un code non nul pour `ls`, `127` pour la commande absente et `143` pour le signal.',
			'`err.txt` contient l’erreur sur `/nope` et `out.txt` le contenu de `/tmp`. Avec `2>&1 > out2.txt`, l’erreur s’affiche quand même dans le terminal.',
			'`curl` seul affiche `0` sur le 404, et `curl --fail` affiche `22`.',
			'Sans politique de redémarrage, `systemctl --user is-active crashy` affiche `failed`. Avec `Restart=on-failure`, `NRestarts` est au-dessus de 0 et le journal montre `started`, `boom` et `Scheduled restart job`.'
		],
		solution: [
			'`ls` sort avec 2 sous GNU et 1 sous macOS : c’est le programme qui choisit le nombre. Bash renvoie lui-même 127 pour « introuvable » et 128 + 15 = 143 pour SIGTERM.',
			'Les redirections s’appliquent de gauche à droite, donc écris `> out.txt 2>&1` pour envoyer les deux flux dans le fichier.',
			'`boom` est parti sur stderr et il est quand même arrivé dans le journal, parce que stderr va là où va stdout.',
			'Sur un vrai serveur, les deux mêmes réglages vont dans un drop-in : `sudo systemctl edit caddy`, puis `[Service]`, `Restart=on-failure`, `RestartSec=5s`.'
		]
	},
	recall: {
		q: 'Quelles sont les trois choses qu’un pipeline lit pour savoir si une commande a marché, et quel code de sortie veut dire succès ?',
		a: 'Le code de sortie, stdout et stderr. Le code 0 veut dire succès, et de 1 à 255 veut dire échec.'
	},
	sources: [
		{ title: 'Manuel de Bash, Exit Status', url: 'https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html' },
		{ title: 'Manuel de Bash, Redirections', url: 'https://www.gnu.org/software/bash/manual/html_node/Redirections.html' },
		{ title: 'systemd.service, Restart= et Type=', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html' },
		{ title: 'Manuel de journalctl', url: 'https://www.freedesktop.org/software/systemd/man/latest/journalctl.html' },
		{ title: 'Doc de Caddy, faire tourner Caddy (systemd et redémarrage après crash)', url: 'https://caddyserver.com/docs/running' }
	]
};
