const CURL = 'https://github.com/curl/curl';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'quadratic',
	part: 'Les ressources',
	title: 'Copier une liste en repartant de la tête',
	minutes: 10,
	hook: [
		'curl range ses listes de chaînes, comme les en-têtes personnalisés ou les cookies, dans une `curl_slist` : une liste simplement chaînée où chaque nœud pointe vers le suivant. `Curl_slist_duplicate()` en fait une copie complète.',
		'La pull request qui l’a modifiée a mesuré la copie dans un build debug sous macOS. 8 000 entrées prenaient **28,646 ms**. 32 000 entrées prenaient **499,035 ms**. Quatre fois plus d’entrées coûtaient environ dix-sept fois plus de temps.'
	],
	terms: [
		{ term: 'Liste simplement chaînée', def: 'Une chaîne de nœuds où chacun ne connaît que le suivant. Trouver le dernier nœud oblige à partir du premier.' },
		{ term: 'O(n²)', def: 'Un travail qui croît comme le carré de la taille de l’entrée : deux fois plus d’entrées, quatre fois plus de travail.' },
		{ term: 'Pointeur de queue', def: 'Un pointeur gardé sur le dernier nœud, ou sur son champ `next`, pour qu’un ajout n’ait pas à parcourir la liste.' }
	],
	bug: {
		title: 'slist: duplicate lists in linear time',
		repo: 'curl/curl',
		url: `${CURL}/blob/db1e627ea6c990d956359864f40ae72d0625bc7e/lib/slist.c#L29-L121`,
		fix: `${CURL}/commit/2cb089c698f7eca1184964c3344378fa87014241`,
		lang: 'c',
		code: `static struct curl_slist *slist_get_last(struct curl_slist *list)
{
…
  item = list;
  while(item->next) {
    item = item->next;
  }
  return item;
}
…
struct curl_slist *Curl_slist_append_nodup(struct curl_slist *list,
                                           const char *data)
…
  /* if this is the first item, then new_item *is* the list */
  if(!list)
    return new_item;

  last = slist_get_last(list);
  last->next = new_item;
  return list;
…
struct curl_slist *curl_slist_append(struct curl_slist *list, const char *data)
…
  list = Curl_slist_append_nodup(list, dupdata);
…
struct curl_slist *Curl_slist_duplicate(struct curl_slist *inlist)
{
  struct curl_slist *outlist = NULL;
  struct curl_slist *tmp;

  while(inlist) {
    tmp = curl_slist_append(outlist, inlist->data);

…
    outlist = tmp;
    inlist = inlist->next;
  }
  return outlist;
}`,
		lines: [32],
		diff: `   struct curl_slist *outlist = NULL;
-  struct curl_slist *tmp;
+  struct curl_slist **tail = &outlist;

   while(inlist) {
-    tmp = curl_slist_append(outlist, inlist->data);
+    struct curl_slist *tmp = curl_slist_append(NULL, inlist->data);

…
-    outlist = tmp;
+    *tail = tmp;
+    tail = &tmp->next;
     inlist = inlist->next;`,
		notes: [
			'**Chaque ajout parcourt la copie.** `curl_slist_append(outlist, ...)` passe par `Curl_slist_append_nodup`, qui appelle `slist_get_last`, et cette boucle suit `next` du premier nœud au dernier. La boucle de `Curl_slist_duplicate` le fait une fois par nœud d’entrée, sur une copie qui ne cesse de grandir.',
			'**Les chiffres.** Copier n entrées regarde 0, puis 1, puis 2, jusqu’à n - 1 nœuds, soit n × (n - 1) / 2 étapes. Pour 8 000 entrées, ça fait environ 32 millions d’étapes. Pour 32 000, environ 512 millions, 16 fois plus. La pull request a mesuré 28,646 ms et 499,035 ms, un rapport proche.',
			'**Le correctif.** `tail` pointe là où le prochain nœud doit aller : d’abord `outlist` lui-même, puis le champ `next` du dernier nœud ajouté. Chaque nouveau nœud est créé avec `curl_slist_append(NULL, ...)`, qui rend la main tout de suite puisque la liste est vide, puis il est accroché avec `*tail = tmp`. Chaque entrée coûte maintenant pareil, et 32 000 entrées ont pris 0,945 ms.',
			'**Le même motif, à un autre endroit.** Le même commit corrige `cookie_list()` dans `lib/cookie.c`, qui construisait son résultat avec `Curl_slist_append_nodup(list, line)` dans une boucle. La pull request : "Building n entries therefore does quadratic list traversal." Construire n entrées parcourt la liste de façon quadratique.'
		]
	},
	quiz: [
		{
			q: 'Le code bogué copie une liste de 4 entrées. Combien de nœuds `slist_get_last` regarde-t-elle au total ?',
			options: ['4', '6', '10', '16'],
			answer: 1,
			why: 'Le premier ajout trouve une copie vide et rend la main avant le parcours. Les trois suivants regardent 1, 2 et 3 nœuds, 6 au total. En général, c’est n × (n - 1) / 2.'
		},
		{
			q: 'Avec ce code, copier 10 000 entrées prend 50 ms. Combien faut-il compter pour 20 000 ?',
			options: ['50 ms', '100 ms', '200 ms', '400 ms'],
			answer: 2,
			why: 'Le travail croît comme le carré de n. Deux fois plus d’entrées, c’est quatre fois plus d’étapes, donc environ 200 ms.'
		},
		{
			q: 'Quel changement rend linéaire l’ajout en boucle dans une liste simplement chaînée ?',
			options: [
				'Parcourir la liste depuis la tête avec une boucle plus rapide',
				'Garder un pointeur sur le dernier champ `next` et écrire là',
				'Compter les nœuds d’abord, puis tout ajouter en une passe',
				'Trier la liste d’entrée avant de la copier'
			],
			answer: 1,
			why: 'Avec un pointeur sur l’endroit où va le prochain nœud, un ajout tient en une écriture. Toute version qui repart de la tête à chaque ajout reste quadratique.'
		}
	],
	takeaway: 'Quand une boucle appelle une fonction d’ajout, regarde comment cette fonction trouve la fin. Sur une liste chaînée, garde un pointeur de queue dans la boucle plutôt que d’appeler un helper qui part de la tête.',
	sources: [
		{ title: 'curl, pull request #23361', url: `${CURL}/pull/23361` },
		{ title: 'curl, commit 2cb089c', url: `${CURL}/commit/2cb089c698f7eca1184964c3344378fa87014241` }
	]
};
