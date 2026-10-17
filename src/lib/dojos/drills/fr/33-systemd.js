/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'systemd',
	part: 'Outils d’exploitation',
	title: 'systemctl',
	minutes: 10,
	hook: [
		'Tu es connecté en root sur la VM `web-1`, aucune commande n’a donc besoin de `sudo`. Le backend de la boutique tourne en `orders.service`, défini dans `/etc/systemd/system/orders.service`. nginx tourne devant lui en `nginx.service`. Il y a une heure, une collègue a changé le port dans la ligne `ExecStart=` de `orders.service`, et le site répond maintenant 502.',
		'Tu vérifies l’état des deux services, tu fais charger le fichier modifié et tu redémarres le backend. Un nom d’unit sans suffixe veut dire `.service` : `systemctl status orders` et `systemctl status orders.service` font la même chose.'
	],
	terms: [
		{ term: 'Unit', def: 'Un objet géré par systemd : un service, un timer, un socket, un point de montage. Son nom finit par son type, comme `orders.service`.' },
		{ term: 'Fichier d’unit', def: 'Le fichier texte qui définit une unit, comme `/etc/systemd/system/orders.service`, avec des sections comme `[Service]` et `[Install]`.' },
		{ term: 'Active', def: 'L’état d’une unit à l’exécution : `active` quand le service tourne, `inactive` quand il est arrêté, `failed` quand il s’est terminé en erreur.' },
		{ term: 'Enabled', def: 'Une unit est enabled quand systemd a créé les liens symboliques décrits dans sa section `[Install]`, pour qu’elle démarre au boot.' }
	],
	reps: [
		{
			prompt: 'Affiche si `orders` tourne, son PID principal et ses dernières lignes de log.',
			accept: [
				'systemctl status orders',
				'systemctl status orders.service',
				'sudo systemctl status orders',
				'sudo systemctl status orders.service'
			],
			why: '`status orders` affiche les lignes `Loaded:` et `Active:`, le PID principal, puis les dernières lignes du journal de l’unit. La commande sort avec 3 quand l’unit n’est pas active.'
		},
		{
			prompt: 'Affiche seulement `active` ou `inactive` pour `orders`, comme le vérifierait un script de déploiement.',
			accept: [
				'systemctl is-active orders',
				'systemctl is-active orders.service',
				'sudo systemctl is-active orders',
				'sudo systemctl is-active orders.service'
			],
			why: '`is-active orders` affiche l’état et ne sort avec 0 que si l’unit est active. Avec `--quiet`, rien ne s’affiche et le script lit seulement le code de sortie.'
		},
		{
			prompt: 'Affiche le fichier d’unit de `orders` tel qu’il est sur le disque, fichiers drop-in compris.',
			accept: ['systemctl cat orders', 'systemctl cat orders.service', 'sudo systemctl cat orders', 'sudo systemctl cat orders.service'],
			why: '`cat orders` affiche chaque fichier de l’unit, précédé d’une ligne de commentaire avec son chemin, comme `# /etc/systemd/system/orders.service`. Tu vois les fichiers du disque : si tu les as modifiés depuis, systemd a peut-être chargé une autre version.'
		},
		{
			prompt: 'Fais charger à systemd le fichier modifié `/etc/systemd/system/orders.service`.',
			accept: ['systemctl daemon-reload', 'sudo systemctl daemon-reload'],
			why: '`daemon-reload` recharge tous les fichiers d’unit et reconstruit l’arbre des dépendances. Tant que tu ne l’as pas lancé, un redémarrage utilise encore l’ancienne ligne `ExecStart=`, et `systemctl status` prévient que le fichier a changé sur le disque.'
		},
		{
			prompt: 'Arrête puis relance `orders` en une commande, pour qu’il exécute la nouvelle ligne `ExecStart=`.',
			accept: [
				'systemctl restart orders',
				'systemctl restart orders.service',
				'sudo systemctl restart orders',
				'sudo systemctl restart orders.service'
			],
			why: '`restart orders` arrête l’unit puis la démarre. Si elle ne tournait pas, la commande la démarre.'
		},
		{
			prompt: '`nginx.service` s’est arrêté pendant le dernier déploiement. Démarre-le.',
			accept: ['systemctl start nginx', 'systemctl start nginx.service', 'sudo systemctl start nginx', 'sudo systemctl start nginx.service'],
			why: '`start nginx` active `nginx.service` tout de suite. La commande ne change rien au démarrage de nginx au boot.'
		},
		{
			prompt: '`orders` ne revient pas après un redémarrage de la VM. Fais-le démarrer au boot et démarre-le maintenant, en une commande.',
			accept: [
				'systemctl enable --now orders',
				'systemctl enable --now orders.service',
				'systemctl enable orders --now',
				'systemctl enable orders.service --now',
				'sudo systemctl enable --now orders',
				'sudo systemctl enable --now orders.service'
			],
			why: '`enable orders` crée les liens symboliques indiqués par la ligne `WantedBy=` de la section `[Install]`, sans démarrer le service. `--now` le démarre aussi une fois les liens créés.'
		},
		{
			prompt: 'Vérifie que le réglage du boot est pris : affiche `enabled` ou `disabled` pour `orders`.',
			accept: [
				'systemctl is-enabled orders',
				'systemctl is-enabled orders.service',
				'sudo systemctl is-enabled orders',
				'sudo systemctl is-enabled orders.service'
			],
			why: '`is-enabled orders` affiche l’état d’activation du fichier d’unit et sort avec 0 s’il est enabled. `is-active` répond à une autre question : est-ce que le service tourne maintenant.'
		},
		{
			prompt: 'Liste toutes les units de `web-1` qui sont dans l’état failed.',
			accept: [
				'systemctl --failed',
				'systemctl list-units --failed',
				'systemctl --state=failed',
				'systemctl list-units --state=failed',
				'sudo systemctl --failed',
				'sudo systemctl list-units --failed'
			],
			why: '`--failed` ne garde que les units dans l’état failed, comme `--state=failed`. Sans commande, systemctl lance `list-units`, donc les deux écritures affichent le même tableau.'
		}
	],
	quiz: [],
	recall: {
		q: 'Tu as modifié `/etc/systemd/system/orders.service`. Quelle commande doit passer avant que `systemctl restart orders` utilise le nouveau fichier ?',
		a: '`systemctl daemon-reload`. Elle recharge tous les fichiers d’unit ; sans elle, le redémarrage reprend l’ancienne définition.'
	},
	sources: [{ title: 'Page de manuel de systemctl', url: 'https://www.freedesktop.org/software/systemd/man/latest/systemctl.html' }]
}
