/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'networking',
	part: 'Outils d’exploitation',
	title: 'Vérifications réseau',
	minutes: 10,
	hook: [
		'L’appli sur `web-01` écrit `connection refused` dans ses logs quand elle appelle la base de données. Tu es root sur `web-01` et tu déroules les vérifications habituelles : les noms, les adresses, les ports en écoute, puis la joignabilité.',
		'`web-01` a une seule interface réseau, `eth0`, et un service à lui qui écoute sur le port TCP 8080. La base tourne sur `db-01`, port 5432. Pour le DNS, tu interroges `example.com` auprès du résolveur par défaut et auprès du résolveur public `1.1.1.1`. Le `nc` installé est le netcat d’OpenBSD.'
	],
	terms: [
		{ term: 'résolveur', def: 'Le serveur DNS qui répond à tes requêtes. `dig` prend celui de `/etc/resolv.conf`, sauf si tu en nommes un autre avec `@`.' },
		{ term: 'enregistrement A', def: 'Un enregistrement DNS qui associe un nom à une adresse IPv4. `dig` le demande quand tu ne donnes aucun type.' },
		{ term: 'socket en écoute', def: 'Un socket qui attend des connexions entrantes sur un port, comme celui qu’une base de données ouvre sur 5432.' }
	],
	reps: [
		{
			prompt: 'Cherche l’enregistrement A de `example.com` avec `dig`, avec la sortie complète.',
			accept: ['dig example.com', 'dig example.com A', 'dig A example.com', 'dig -t A example.com', 'dig example.com -t A'],
			why: 'Sans type, `dig` demande un enregistrement A. La réponse se trouve dans la `ANSWER SECTION`, une ligne par enregistrement avec son TTL.'
		},
		{
			prompt: 'Affiche seulement les adresses de `example.com`, une par ligne, sans en-têtes.',
			accept: ['dig +short example.com', 'dig example.com +short', 'dig +short example.com A', 'dig example.com A +short', 'dig +short A example.com'],
			why: '`+short` donne une réponse brève : seulement les données des enregistrements, ici une adresse IPv4 par ligne, sans sections ni commentaires.'
		},
		{
			prompt: 'Demande les enregistrements MX de `example.com`.',
			accept: [
				'dig example.com MX',
				'dig MX example.com',
				'dig -t MX example.com',
				'dig example.com -t MX',
				'dig example.com mx',
				'dig mx example.com',
				'dig -t mx example.com'
			],
			why: 'Le type se place après le nom, ou avec `-t`. La ligne de réponse pour `example.com` est `MX 0 .` : une priorité, puis un nom de serveur de mail.'
		},
		{
			prompt: 'Demande directement au résolveur `1.1.1.1` l’enregistrement A de `example.com`, pour comparer avec ton résolveur par défaut.',
			accept: ['dig @1.1.1.1 example.com', 'dig example.com @1.1.1.1', 'dig @1.1.1.1 example.com A', 'dig example.com A @1.1.1.1'],
			why: '`@1.1.1.1` envoie la requête à ce serveur au lieu de celui de `/etc/resolv.conf`. Tu compares ensuite sa `ANSWER SECTION` avec celle de `dig example.com`.'
		},
		{
			prompt: 'Trouve le nom qui correspond à l’adresse `1.1.1.1`, en n’affichant que le nom.',
			accept: ['dig -x 1.1.1.1 +short', 'dig +short -x 1.1.1.1'],
			why: '`-x` fait une recherche inverse : `dig` demande l’enregistrement PTR de `1.1.1.1.in-addr.arpa`. Ici il affiche `one.one.one.one.`.'
		},
		{
			prompt: 'Affiche les adresses de l’interface `eth0`.',
			accept: [
				'ip addr show eth0',
				'ip address show eth0',
				'ip a show eth0',
				'ip addr show dev eth0',
				'ip address show dev eth0',
				'ip a show dev eth0',
				'ip a s eth0',
				'ip addr s eth0'
			],
			why: '`ip addr show eth0` affiche chaque adresse IPv4 sur une ligne `inet` et chaque adresse IPv6 sur une ligne `inet6`, avec sa longueur de préfixe, comme `/20`. `ip a` est la forme courte de `ip address`.'
		},
		{
			prompt: 'Liste les sockets TCP en écoute, avec les ports en chiffres et le processus qui possède chacun.',
			accept: [
				'ss -tlnp', 'ss -tlpn', 'ss -tnlp', 'ss -tnpl', 'ss -tpln', 'ss -tpnl',
				'ss -ltnp', 'ss -ltpn', 'ss -lntp', 'ss -lnpt', 'ss -lptn', 'ss -lpnt',
				'ss -ntlp', 'ss -ntpl', 'ss -nltp', 'ss -nlpt', 'ss -nptl', 'ss -nplt',
				'ss -ptln', 'ss -ptnl', 'ss -pltn', 'ss -plnt', 'ss -pntl', 'ss -pnlt',
				'ss -t -l -n -p'
			],
			why: '`-t` garde le TCP, `-l` les sockets en écoute, `-n` affiche `8080` au lieu d’un nom de service, et `-p` ajoute le propriétaire, comme `users:(("nc",pid=7,fd=3))`.'
		},
		{
			prompt: 'Envoie exactement 4 pings à `db-01`, puis arrête.',
			accept: ['ping -c 4 db-01', 'ping -c4 db-01', 'ping db-01 -c 4'],
			why: '`-c 4` arrête ping après l’envoi de 4 requêtes echo. ping affiche ensuite un résumé avec la perte de paquets et les temps aller-retour `min/avg/max`.'
		},
		{
			prompt: 'Vérifie si le port TCP 5432 de `db-01` accepte les connexions, sans envoyer de données, et affiche le résultat.',
			accept: ['nc -zv db-01 5432', 'nc -vz db-01 5432', 'nc -z -v db-01 5432', 'nc -v -z db-01 5432'],
			why: '`-z` vérifie seulement qu’un service écoute et n’envoie rien ; `-v` affiche le résultat. Un port ouvert donne `succeeded!`, un port fermé `Connection refused` et le code de sortie 1.'
		},
		{
			prompt: 'Affiche la route vers `1.1.1.1` saut par saut, avec des adresses en chiffres seulement.',
			accept: ['traceroute -n 1.1.1.1', 'traceroute 1.1.1.1 -n'],
			why: '`-n` évite la recherche inverse de chaque saut. Chaque ligne est un saut avec 3 temps de sonde ; un `*` veut dire que cette sonde n’a pas eu de réponse avant le délai.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quelles quatre options de `ss` listent les sockets TCP en écoute, avec les ports en chiffres et leurs processus ?',
		a: '`ss -tlnp` : `-t` TCP, `-l` en écoute, `-n` numérique, `-p` processus.'
	},
	sources: [
		{ title: 'Page de manuel dig(1) (en anglais)', url: 'https://manpages.debian.org/bookworm/bind9-dnsutils/dig.1.en.html' },
		{ title: 'Page de manuel ip-address(8) (en anglais)', url: 'https://manpages.debian.org/bookworm/iproute2/ip-address.8.en.html' },
		{ title: 'Page de manuel ss(8) (en anglais)', url: 'https://manpages.debian.org/bookworm/iproute2/ss.8.en.html' },
		{ title: 'Page de manuel ping(8) (en anglais)', url: 'https://manpages.debian.org/bookworm/iputils-ping/ping.8.en.html' },
		{ title: 'Page de manuel nc(1), netcat OpenBSD (en anglais)', url: 'https://manpages.debian.org/bookworm/netcat-openbsd/nc.1.en.html' },
		{ title: 'Page de manuel traceroute(1) (en anglais)', url: 'https://manpages.debian.org/bookworm/traceroute/traceroute.1.en.html' }
	]
};
