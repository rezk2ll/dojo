const REDIS = 'https://github.com/redis/redis';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'number-parsing',
	part: 'Les entrées',
	title: 'Une base nommée notanumber',
	minutes: 10,
	hook: [
		'Redis garde plusieurs bases numérotées : 0, 1, 2, etc. `MOVE key db` déplace une clé de la base courante vers la base `db`, et répond 1 quand la clé a bougé.',
		'Un utilisateur envoie `MOVE key qwefklqfklsdbsdjhqwef`. Aucune base ne porte ce nom, on attend donc une erreur. Redis répond que le déplacement a marché, et la clé se retrouve **dans la base 0**. Le signalement dit que l’utilisateur "doesn\'t know where to look for his key now" (ne sait plus où chercher sa clé).'
	],
	terms: [
		{ term: '`atoi`', def: 'Une fonction C qui transforme le début d’une chaîne en `int`. Elle s’arrête au premier caractère qui n’est pas un chiffre, et renvoie 0 s’il n’y a aucun nombre. Elle ne signale jamais d’erreur.' },
		{ term: '`selectDb`', def: 'Place le client sur la base `id`. Elle ne renvoie `REDIS_ERR` que si `id` est sous 0 ou pas sous le nombre de bases (16 par défaut).' },
		{ term: '`argv[2]`', def: 'Le troisième mot de la commande. Pour `MOVE key 5`, c’est la chaîne `"5"`.' }
	],
	bug: {
		title: 'Reject MOVE to non-integer DBs',
		repo: 'redis/redis',
		url: `${REDIS}/blob/25791550e085930c196b9234465f6538fe8ee383/src/db.c#L706-L752`,
		fix: `${REDIS}/commit/498ad7482b2eb4ebc6f4c7458fe6a35f244adaf6`,
		lang: 'c',
		code: `void moveCommand(redisClient *c) {
    robj *o;
    redisDb *src, *dst;
    int srcid;

    if (server.cluster_enabled) {
        addReplyError(c,"MOVE is not allowed in cluster mode");
        return;
    }

    /* Obtain source and target DB pointers */
    src = c->db;
    srcid = c->db->id;
    if (selectDb(c,atoi(c->argv[2]->ptr)) == REDIS_ERR) {
        addReply(c,shared.outofrangeerr);
        return;
    }
    dst = c->db;
    selectDb(c,srcid); /* Back to the source DB */

    /* If the user is moving using as target the same
     * DB as the source DB it is probably an error. */
    if (src == dst) {
        addReply(c,shared.sameobjecterr);
        return;
    }
…
    dbAdd(dst,c->argv[1],o);
    incrRefCount(o);

    /* OK! key moved, free the entry in the source DB */
    dbDelete(src,c->argv[1]);
    server.dirty++;
    addReply(c,shared.cone);
}`,
		lines: [14],
		diff: `     srcid = c->db->id;
-    if (selectDb(c,atoi(c->argv[2]->ptr)) == REDIS_ERR) {
+
+    if (getLongLongFromObject(c->argv[2],&dbid) == REDIS_ERR ||
+        dbid < INT_MIN || dbid > INT_MAX ||
+        selectDb(c,dbid) == REDIS_ERR)
+    {
         addReply(c,shared.outofrangeerr);`,
		notes: [
			'**`atoi` n’a pas de valeur d’erreur.** Le seul contrôle sur la cible est `selectDb`, qui rejette les nombres hors de 0 à 15. Une chaîne qui n’est pas un nombre n’arrive jamais à ce contrôle comme une erreur : `atoi("qwefklqfklsdbsdjhqwef")` renvoie 0, et 0 est une base valide.',
			'**Où ça casse.** Le client est sur la base 1 et envoie `MOVE mykey notanumber`. `atoi` donne 0, `selectDb(c, 0)` réussit, `dst` est la base 0, et la clé y part avec la réponse 1. Sur la base 0, la même commande reçoit "source and destination objects are the same", tout aussi déroutant. `atoi` accepte aussi des déchets après les chiffres : `"3abc"` devient 3.',
			'**Le correctif.** `getLongLongFromObject` analyse avec `strtoll` et renvoie `REDIS_ERR` sauf si toute la chaîne est un nombre (`eptr[0] != \'\\0\'` attrape les déchets à la fin). Le nouveau test `dbid < INT_MIN || dbid > INT_MAX` évite qu’une valeur énorme soit tronquée en un autre `int` en passant à `selectDb`. Tout échec répond maintenant "ERR index out of range".',
			'**Comment ça a été trouvé.** Issue #1428 : "Move command uses `atoi()` to convert the second argument to a number, which returns `0` in case of error." Le commit ajoute un test qui envoie `move mykey notanumber` et attend l’erreur.'
		]
	},
	quiz: [
		{
			q: 'Le client est sur la base 2 et envoie `MOVE mykey 7x`. Que fait le code bogué ?',
			options: [
				'Il répond "ERR index out of range"',
				'Il déplace la clé dans la base 7',
				'Il déplace la clé dans la base 0',
				'Il répond que la source et la destination sont identiques'
			],
			answer: 1,
			why: '`atoi("7x")` lit le 7 et s’arrête au x. La base 7 existe, donc le déplacement passe.'
		},
		{
			q: 'Pourquoi `selectDb` n’a-t-elle pas attrapé `MOVE mykey notanumber` ?',
			options: [
				'Elle ne vérifie que la base source, pas la cible',
				'Elle reçoit 0, qui est un numéro de base valide',
				'Elle s’exécute après le déplacement de la clé',
				'Elle traite exprès toute chaîne comme la base 0'
			],
			answer: 1,
			why: 'La chaîne n’arrive jamais à `selectDb`. `atoi` l’a déjà transformée en 0, et 0 est entre 0 et 15.'
		},
		{
			q: 'Tu remplaces `atoi` par `strtol(s, &end, 10)`. Que dois-tu vérifier en plus pour rejeter `"12abc"` ?',
			options: [
				'Que le résultat ne vaut pas 0',
				'Que `*end` est le caractère de fin de chaîne',
				'Que `errno` vaut toujours 0 après l’appel',
				'Que le premier caractère de `s` est un chiffre'
			],
			answer: 1,
			why: '`strtol` s’arrête sur le a et renvoie 12 sans erreur. Seul `end` te dit qu’il restait des caractères.'
		}
	],
	takeaway: 'Quand un nombre vient d’une saisie utilisateur, analyse-le avec une fonction qui signale l’échec, et vérifie qu’elle a consommé toute la chaîne. Un parseur qui renvoie 0 sur n’importe quoi transforme une faute de frappe en valeur valide.',
	sources: [
		{ title: 'redis, issue #1428', url: `${REDIS}/issues/1428` },
		{ title: 'redis, commit 498ad74', url: `${REDIS}/commit/498ad7482b2eb4ebc6f4c7458fe6a35f244adaf6` }
	]
};
