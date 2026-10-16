const CURL = 'https://github.com/curl/curl';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'quadratic',
	part: 'Resources',
	title: 'Copying a list from the head every time',
	minutes: 10,
	hook: [
		'curl keeps lists of strings, such as custom headers or cookies, in a `curl_slist`: a singly linked list where each node points to the next. `Curl_slist_duplicate()` makes a full copy of one.',
		'The pull request that changed it measured the copy in a debug build on macOS. 8,000 entries took **28.646 ms**. 32,000 entries took **499.035 ms**. Four times the entries cost about seventeen times the time.'
	],
	terms: [
		{ term: 'Singly linked list', def: 'A chain of nodes where each one knows only the next. Finding the last node means walking from the first.' },
		{ term: 'O(n²)', def: 'Work that grows with the square of the input size: twice the entries, four times the work.' },
		{ term: 'Tail pointer', def: 'A pointer kept to the last node, or to its `next` field, so an append does not have to walk the list.' }
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
			'**Each append walks the copy.** `curl_slist_append(outlist, ...)` goes through `Curl_slist_append_nodup`, which calls `slist_get_last`, and that loop follows `next` from the first node to the last. The loop in `Curl_slist_duplicate` does this once per input node, on a copy that keeps growing.',
			'**The numbers.** Copying n entries looks at 0, then 1, then 2, up to n - 1 nodes, which is n × (n - 1) / 2 steps. For 8,000 entries that is about 32 million steps. For 32,000 it is about 512 million, 16 times more. The pull request measured 28.646 ms and 499.035 ms, a ratio close to that.',
			'**The fix.** `tail` points at the place where the next node must go: first `outlist` itself, then the `next` field of the last node added. Each new node is made with `curl_slist_append(NULL, ...)`, which returns at once because the list is empty, and is linked with `*tail = tmp`. Each entry now costs the same, and 32,000 entries took 0.945 ms.',
			'**Same pattern, second place.** The same commit fixes `cookie_list()` in `lib/cookie.c`, which built its result with `Curl_slist_append_nodup(list, line)` in a loop. The pull request: "Building n entries therefore does quadratic list traversal."'
		]
	},
	quiz: [
		{
			q: 'The buggy code copies a list of 4 entries. How many nodes does `slist_get_last` look at in total?',
			options: ['4', '6', '10', '16'],
			answer: 1,
			why: 'The first append finds an empty copy and returns before the walk. The next three look at 1, 2 and 3 nodes, 6 in total. In general it is n × (n - 1) / 2.'
		},
		{
			q: 'A copy of 10,000 entries takes 50 ms with this code. About how long should 20,000 take?',
			options: ['50 ms', '100 ms', '200 ms', '400 ms'],
			answer: 2,
			why: 'The work grows with the square of n. Twice the entries means four times the steps, so about 200 ms.'
		},
		{
			q: 'Which change makes appending to a singly linked list in a loop linear?',
			options: [
				'Walk the list from the head with a faster loop',
				'Keep a pointer to the last `next` field and write there',
				'Count the nodes first, then append in one pass',
				'Sort the input list before copying it'
			],
			answer: 1,
			why: 'With a pointer to where the next node goes, an append is one write. Any version that starts from the head on each append stays quadratic.'
		}
	],
	takeaway: 'When a loop calls an append function, check what that function does to find the end. On a linked list, keep a tail pointer in the loop instead of calling a helper that walks from the head.',
	sources: [
		{ title: 'curl pull request #23361', url: `${CURL}/pull/23361` },
		{ title: 'curl commit 2cb089c', url: `${CURL}/commit/2cb089c698f7eca1184964c3344378fa87014241` }
	]
};
