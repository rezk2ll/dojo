/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'processes',
	part: 'Le shell',
	title: 'Processus',
	minutes: 10,
	hook: [
		'Tu lances l’API sur un serveur de test et elle s’arrête aussitôt : le port 8080 est déjà pris. Le serveur d’hier tourne encore dans un terminal que personne n’a fermé. Tu dois le trouver, l’arrêter proprement, puis lancer une longue sauvegarde qui continue après la fermeture de ta session SSH.',
		'Les exercices partent de cet état. Le PID 4242 est `python3 -m http.server 8080`, l’ancien serveur, qui écoute toujours sur le port 8080. Le PID 5150 est `python3 worker.py`, qui doit continuer à tourner. `./backup.sh` dure une heure, écrit sa progression sur la sortie standard et ses avertissements sur la sortie d’erreur. Tu tapes toutes les commandes dans bash.'
	],
	terms: [
		{ term: 'PID', def: 'L’identifiant de processus : le numéro que le noyau donne à chaque processus en cours, comme 4242.' },
		{ term: 'signal', def: 'Un message numéroté que le noyau remet à un processus. `kill` en envoie un ; SIGTERM vaut 15 et SIGKILL vaut 9.' },
		{ term: 'job', def: 'Une commande que bash a lancée depuis ce terminal, numérotée à partir de 1. `jobs` les liste et `%1` désigne le job 1.' }
	],
	reps: [
		{
			prompt: 'Liste tous les processus de la machine, avec leur utilisateur, leur CPU et leur mémoire.',
			accept: ['ps aux', 'ps axu'],
			why: '`a` et `x` lèvent les limites "only yourself" (seulement tes processus) et "must have a tty" (avec un terminal) : `ps` montre alors tous les processus. `u` ajoute les colonnes orientées utilisateur, dont `USER`, `%CPU` et `%MEM`.'
		},
		{
			prompt: 'Affiche le PID et la ligne de commande complète de chaque processus nommé `python3`.',
			accept: ['pgrep -a python3', 'pgrep --list-full python3'],
			why: '`pgrep python3` cherche dans les noms de processus et affiche les PID. `-a` ajoute la ligne de commande : tu distingues `4242 python3 -m http.server 8080` de `5150 python3 worker.py`.'
		},
		{
			prompt: 'Affiche seulement les PID des processus dont la ligne de commande contient `http.server`.',
			accept: ['pgrep -f http.server', 'pgrep --full http.server', "pgrep -f 'http.server'", 'pgrep -f "http.server"'],
			why: 'Les deux processus s’appellent `python3`. `-f` compare le motif à la ligne de commande complète : 4242 correspond, 5150 non.'
		},
		{
			prompt: 'Montre quel processus a ouvert le port 8080.',
			accept: ['lsof -i :8080', 'lsof -i:8080', 'lsof -i TCP:8080', 'lsof -iTCP:8080', 'lsof -i tcp:8080', 'sudo lsof -i :8080', 'sudo lsof -i:8080', 'sudo lsof -i TCP:8080'],
			why: '`-i` liste les fichiers réseau ouverts dont l’adresse correspond, et `:8080` est la partie port de l’adresse. Les colonnes `COMMAND` et `PID` affichent `python3` et `4242`.'
		},
		{
			prompt: 'Demande au PID 4242 de s’arrêter avec le signal par défaut, que le processus peut intercepter pour faire son ménage.',
			accept: ['kill 4242', 'kill -15 4242', 'kill -TERM 4242', 'kill -SIGTERM 4242', 'kill -s TERM 4242', 'kill -s SIGTERM 4242', 'kill -s 15 4242'],
			why: 'Sans signal précisé, `kill` envoie SIGTERM, le numéro 15. Un processus peut installer un gestionnaire pour ce signal et faire son ménage avant de quitter.'
		},
		{
			prompt: '30 secondes plus tard, le PID 4242 tourne toujours. Envoie le signal que le processus ne peut pas intercepter.',
			accept: ['kill -9 4242', 'kill -KILL 4242', 'kill -SIGKILL 4242', 'kill -s KILL 4242', 'kill -s SIGKILL 4242', 'kill -s 9 4242'],
			why: '`-9` envoie SIGKILL. Le processus ne peut pas l’intercepter : il s’arrête sans faire aucun ménage.'
		},
		{
			prompt: 'Tu as lancé `./backup.sh` au premier plan, puis tapé Ctrl+Z. Liste les jobs de ce shell avec leurs PID.',
			accept: ['jobs -l'],
			why: '`jobs` liste les jobs du shell avec leur numéro entre crochets et leur état, ici `[1]+ Stopped`. `-l` ajoute le PID de chaque job.'
		},
		{
			prompt: '`./backup.sh` est le job 1, à l’arrêt. Fais-le reprendre en arrière-plan.',
			accept: ['bg %1', 'bg', 'bg %%', 'bg %+', 'bg 1', '%1 &'],
			why: '`bg %1` relance le job 1 comme si tu l’avais démarré avec `&`, et tu retrouves l’invite. Sans argument, `bg` agit sur le job courant, marqué `+` dans `jobs`.'
		},
		{
			prompt: 'Ramène le job 1 au premier plan.',
			accept: ['fg %1', 'fg', 'fg %%', 'fg %+', 'fg 1', '%1'],
			why: '`fg %1` remet le job 1 au premier plan : il lit ton clavier et reçoit Ctrl+C. Taper `%1` seul fait la même chose.'
		},
		{
			prompt: 'Lance `./backup.sh` en arrière-plan pour qu’il continue après la fermeture de ta session SSH. Envoie ses deux flux de sortie dans `backup.log`.',
			accept: [
				'nohup ./backup.sh > backup.log 2>&1 &',
				'nohup ./backup.sh >backup.log 2>&1 &',
				'nohup ./backup.sh &> backup.log &',
				'nohup ./backup.sh &>backup.log &',
				'nohup ./backup.sh > backup.log &'
			],
			why: 'À la fermeture de la session SSH, bash reçoit SIGHUP et le renvoie à tous ses jobs ; `nohup` fait ignorer ce signal à `./backup.sh`. `> backup.log 2>&1` envoie les deux flux dans le fichier et le `&` final lance le job en arrière-plan. Sans redirection, `nohup` ajoute la sortie à `nohup.out`.'
		}
	],
	quiz: [],
	recall: {
		q: 'Quel signal envoie `kill 4242`, et quelle différence avec `kill -9 4242` ?',
		a: 'SIGTERM, le numéro 15, que le processus peut intercepter pour faire son ménage avant de quitter. `-9` envoie SIGKILL, qu’aucun processus ne peut intercepter : il s’arrête sans ménage.'
	},
	sources: [
		{ title: 'ps(1)', url: 'https://man7.org/linux/man-pages/man1/ps.1.html' },
		{ title: 'pgrep(1)', url: 'https://man7.org/linux/man-pages/man1/pgrep.1.html' },
		{ title: 'kill(1)', url: 'https://man7.org/linux/man-pages/man1/kill.1.html' },
		{ title: 'signal(7)', url: 'https://man7.org/linux/man-pages/man7/signal.7.html' },
		{ title: 'bash(1) : JOB CONTROL', url: 'https://man7.org/linux/man-pages/man1/bash.1.html' },
		{ title: 'nohup(1)', url: 'https://man7.org/linux/man-pages/man1/nohup.1.html' },
		{ title: 'lsof(8)', url: 'https://man7.org/linux/man-pages/man8/lsof.8.html' }
	]
};
