/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'journalctl',
	part: 'Outils d’exploitation',
	title: 'journalctl',
	minutes: 10,
	hook: [
		'Sur la VM `web-1`, `orders.service` a planté trois fois cette nuit. À 06:12 ce matin, un collègue a redémarré la VM, et le service tourne depuis. Tu cherches les messages des plantages : ils sont dans le journal du boot précédent.',
		'Tu es root, et root peut lire le journal système. Chaque répétition lit les logs de l’unit `orders` ; `-u orders` et `-u orders.service` choisissent la même unit. Par défaut, journalctl affiche sa sortie page par page dans `less`.'
	],
	terms: [
		{ term: 'Journal', def: 'Le stockage des logs de systemd, écrit par journald. Chaque entrée a un message et des champs ; `_SYSTEMD_UNIT` contient le nom de l’unit.' },
		{ term: 'Priorité', def: 'Le niveau syslog d’une entrée, de 0 (`emerg`) à 7 (`debug`). `err` vaut 3 et `warning` vaut 4.' },
		{ term: 'Boot', def: 'La période entre un démarrage de la machine et le suivant. `-b -1` désigne le boot d’avant, `-b` seul le boot en cours.' }
	],
	reps: [
		{
			prompt: 'Affiche toutes les entrées du journal de `orders`.',
			accept: [
				'journalctl -u orders',
				'journalctl -u orders.service',
				'journalctl --unit=orders',
				'journalctl --unit orders',
				'journalctl --unit=orders.service'
			],
			why: '`-u orders` garde les messages de cette unit, plus ceux que systemd a écrits à son sujet, comme `Started orders.service`. Sans autre option, tu obtiens toutes les entrées encore stockées, des plus anciennes aux plus récentes.'
		},
		{
			prompt: 'Affiche seulement les 50 dernières entrées de `orders`.',
			accept: [
				'journalctl -u orders -n 50',
				'journalctl -u orders -n50',
				'journalctl -u orders --lines=50',
				'journalctl -u orders --lines 50',
				'journalctl -n 50 -u orders',
				'journalctl -u orders.service -n 50'
			],
			why: '`-n 50` affiche les 50 entrées les plus récentes. Sans nombre, `-n` en affiche 10.'
		},
		{
			prompt: 'Suis les logs de `orders` en direct pendant que tu lui envoies une requête de test.',
			accept: [
				'journalctl -u orders -f',
				'journalctl -f -u orders',
				'journalctl -fu orders',
				'journalctl -u orders --follow',
				'journalctl --follow -u orders',
				'journalctl -u orders.service -f'
			],
			why: '`-f` affiche les 10 dernières entrées, puis chaque nouvelle entrée dès que journald l’écrit, jusqu’à ce que tu tapes Ctrl-C.'
		},
		{
			prompt: 'Affiche les entrées de `orders` de la dernière heure.',
			accept: [
				"journalctl -u orders --since '1 hour ago'",
				'journalctl -u orders --since "1 hour ago"',
				'journalctl -u orders --since="1 hour ago"',
				"journalctl -u orders -S '1 hour ago'",
				'journalctl -u orders --since -1h',
				'journalctl -u orders --since=-1h',
				'journalctl -u orders -S -1h'
			],
			why: '`--since \'1 hour ago\'` commence une heure avant maintenant ; `-1h` veut dire la même chose. L’option accepte aussi une date comme `"2026-10-17 06:12"`.'
		},
		{
			prompt: 'Affiche seulement les entrées de `orders` de priorité `err` ou plus grave.',
			accept: [
				'journalctl -u orders -p err',
				'journalctl -u orders -p 3',
				'journalctl -u orders --priority=err',
				'journalctl -u orders --priority=3',
				'journalctl -p err -u orders',
				'journalctl -p 3 -u orders'
			],
			why: '`-p err` garde le niveau 3 et tous les numéros plus petits : `crit` (2), `alert` (1) et `emerg` (0). `warning` (4) et `info` (6) disparaissent.'
		},
		{
			prompt: 'Affiche les entrées de `orders` du boot précédent, celui des plantages.',
			accept: [
				'journalctl -u orders -b -1',
				'journalctl -u orders -b-1',
				'journalctl -u orders --boot=-1',
				'journalctl -u orders --boot -1',
				'journalctl -b -1 -u orders'
			],
			why: '`-b -1` compte à rebours depuis le dernier boot : `-0` est le boot en cours et `-1` celui d’avant. `journalctl --list-boots` liste chaque boot avec son numéro et l’heure de sa première et de sa dernière entrée.'
		},
		{
			prompt: 'Affiche les entrées d’erreur de `orders` du boot en cours seulement.',
			accept: [
				'journalctl -u orders -b -p err',
				'journalctl -u orders -p err -b',
				'journalctl -b -u orders -p err',
				'journalctl -b -p err -u orders',
				'journalctl -p err -u orders -b',
				'journalctl -p err -b -u orders',
				'journalctl -u orders -b -p 3'
			],
			why: 'Sans argument, `-b` désigne le boot en cours. journalctl n’affiche une entrée que si elle passe les trois filtres.'
		},
		{
			prompt: 'Affiche l’entrée la plus récente de `orders` sous forme d’un objet JSON, avec tous ses champs.',
			accept: [
				'journalctl -u orders -n 1 -o json',
				'journalctl -u orders -n 1 --output=json',
				'journalctl -u orders -o json -n 1',
				'journalctl -u orders -n1 -o json',
				'journalctl -u orders -n 1 --output json',
				'journalctl -u orders -n 1 -ojson',
				'journalctl -n 1 -o json -u orders'
			],
			why: '`-o json` affiche chaque entrée comme un objet JSON sur une ligne, le texte étant dans le champ `MESSAGE`. `-o json-pretty` répartit le même objet sur plusieurs lignes.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quels niveaux `journalctl -p err` affiche-t-il ?',
		a: '`err` (3) et tous les niveaux plus graves : `crit` (2), `alert` (1) et `emerg` (0). `-p 3` fait la même chose.'
	},
	sources: [{ title: 'Page de manuel de journalctl', url: 'https://www.freedesktop.org/software/systemd/man/latest/journalctl.html' }]
}
