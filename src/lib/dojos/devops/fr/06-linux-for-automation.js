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
