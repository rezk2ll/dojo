const FAIR = 'https://github.com/torvalds/linux/blob/adc218676eef25575469234709c2d87185ca223a/kernel/sched/fair.c';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'cpu-throttling',
	part: 'Les conteneurs vus du noyau',
	title: 'Limites CPU et throttling',
	minutes: 10,
	hook: [
		'En 2018, peu après Linux 4.18, les équipes d’Indeed voient monter les temps de réponse en queue de distribution de leurs applications web, alors que les graphes d’usage CPU restent normaux. Les réponses lentes tombent pile sur les périodes de fort throttling CPU. Après le correctif du noyau, la pire latence d’une de leurs applications passe de plus de deux secondes à 30 ms.',
		'Le correctif, le commit noyau `de53fd7aedb1` (dans Linux 5.4), décrit le problème : "highly-threaded, non-cpu-bound applications running under cpu.cfs_quota_us constraints can hit a high percentage of periods throttled while simultaneously not consuming the allocated amount of quota." Il cite l’issue Kubernetes 67577, "CFS quotas can lead to unnecessary throttling".',
		'Même sur un noyau corrigé, la limite se compte par période de 100 ms. Sur la machine où ce chapitre a été écrit (noyau 6.17, 16 CPU), quatre boucles actives dans un conteneur lancé avec `--cpus 1` ont tourné 3 secondes. **`cpu.stat` affichait 30 périodes throttlées sur 31.**'
	],
	terms: [
		{ term: 'Quota et période', def: 'Les deux nombres de `cpu.max`. Dans chaque période (en microsecondes), le groupe peut consommer jusqu’à quota microsecondes de CPU, additionnées sur tous ses threads et tous les CPU. Une limite Kubernetes de `1` CPU donne `100000 100000`.' },
		{ term: 'Throttling', def: 'Ce que fait l’ordonnanceur quand le quota du groupe pour la période est épuisé : ses threads quittent le CPU et "will not be able to run again until the next period when the quota is replenished", ils attendent la recharge suivante.' },
		{ term: '`cpu.stat`', def: 'Le fichier du cgroup qui porte les compteurs. `nr_periods` compte les périodes où le groupe avait du travail, `nr_throttled` celles où il a été throttlé, et `throttled_usec` le temps total passé à attendre.' },
		{ term: 'Slice', def: 'La part de quota qu’un CPU prend dans la réserve du groupe à chaque fois, 5 ms par défaut (`/proc/sys/kernel/sched_cfs_bandwidth_slice_us`). Chaque CPU qui exécute des threads du groupe consomme sa propre slice.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['timer["Timer de période, toutes les 100 ms"] -->|"recharge 100 ms"| pool["Réserve du groupe : quota 100 ms"]'],
				highlight: ['timer', 'pool'],
				note: 'Le pod a une limite CPU de 1, donc `cpu.max` contient `100000 100000`. À chaque début de période, le noyau remet le quota dans la réserve du groupe. Arrive une requête qui demande 300 ms de CPU, réparties sur 4 threads de 75 ms chacun.'
			},
			{
				add: ['pool -->|"slices"| cpus["4 CPU exécutent les 4 threads en parallèle"]'],
				highlight: ['cpus'],
				note: 'Chaque CPU prend des slices dans la réserve pendant que son thread tourne. Quatre threads en parallèle consomment 4 ms de quota par milliseconde réelle : la réserve de 100 ms est vide au bout de 25 ms (sans compter l’arrondi des slices).'
			},
			{
				add: ['cpus -->|"réserve vide"| thr["Throttlé pendant 75 ms, nr_throttled + 1"]', 'thr -->|"période suivante"| timer'],
				highlight: ['thr'],
				note: 'Réserve vide : les quatre threads attendent la recharge. Trois périodes de suite se passent pareil, 25 ms de calcul puis 75 ms d’attente. La requête se termine au bout de 225 ms, alors que sur 4 CPU libres et sans limite elle prendrait 75 ms.'
			},
			{
				add: ['thr --> graph["Moyenne sur 1 s : 0,3 CPU, 30 % de la limite"]'],
				highlight: ['graph'],
				note: 'Avec une requête de ce type par seconde, le groupe consomme 300 ms de CPU par seconde. Un tableau de bord qui fait la moyenne sur une minute affiche 30 % de la limite, et pourtant la requête a été trois fois plus lente. Seul `cpu.stat` le montre : `nr_throttled` a pris 3.'
			}
		]
	},
	example: {
		title: 'kernel/sched/fair.c : prendre du quota dans la réserve, ou être throttlé',
		repo: 'torvalds/linux',
		url: `${FAIR}#L5772-L5828`,
		lang: 'c',
		code: `static int __assign_cfs_rq_runtime(struct cfs_bandwidth *cfs_b,
				   struct cfs_rq *cfs_rq, u64 target_runtime)
{
	u64 min_amount, amount = 0;

	lockdep_assert_held(&cfs_b->lock);

	/* note: this is a positive sum as runtime_remaining <= 0 */
	min_amount = target_runtime - cfs_rq->runtime_remaining;

	if (cfs_b->quota == RUNTIME_INF)
		amount = min_amount;
	else {
		start_cfs_bandwidth(cfs_b);

		if (cfs_b->runtime > 0) {
			amount = min(cfs_b->runtime, min_amount);
			cfs_b->runtime -= amount;
			cfs_b->idle = 0;
		}
	}

	cfs_rq->runtime_remaining += amount;

	return cfs_rq->runtime_remaining > 0;
}

/* returns 0 on failure to allocate runtime */
static int assign_cfs_rq_runtime(struct cfs_rq *cfs_rq)
{
	struct cfs_bandwidth *cfs_b = tg_cfs_bandwidth(cfs_rq->tg);
	int ret;

	raw_spin_lock(&cfs_b->lock);
	ret = __assign_cfs_rq_runtime(cfs_b, cfs_rq, sched_cfs_bandwidth_slice());
	raw_spin_unlock(&cfs_b->lock);

	return ret;
}

static void __account_cfs_rq_runtime(struct cfs_rq *cfs_rq, u64 delta_exec)
{
	/* dock delta_exec before expiring quota (as it could span periods) */
	cfs_rq->runtime_remaining -= delta_exec;

	if (likely(cfs_rq->runtime_remaining > 0))
		return;

	if (cfs_rq->throttled)
		return;
	/*
	 * if we're unable to extend our runtime we resched so that the active
	 * hierarchy can be throttled
	 */
	if (!assign_cfs_rq_runtime(cfs_rq) && likely(cfs_rq->curr))
		resched_curr(rq_of(cfs_rq));
}`,
		notes: [
			'`cfs_b` est la réserve du groupe, partagée par tous les CPU. `cfs_rq` est la file d’exécution du groupe sur un CPU, avec son propre solde `runtime_remaining`. La ligne 44 retire de ce solde local le temps CPU qui vient d’être consommé.',
			'Quand le solde local tombe à zéro, la ligne 55 en redemande à la réserve. La ligne 35 demande une slice, `sched_cfs_bandwidth_slice()`, 5 ms par défaut. Les lignes 16 à 18 donnent ce qui reste dans la réserve, parfois moins qu’une slice.',
			'Un groupe sans limite (`max` dans `cpu.max`) reçoit ce qu’il demande, ligne 12. Un groupe limité dont la réserve est vide ne reçoit rien : `assign_cfs_rq_runtime` renvoie 0, et la ligne 56 force un changement de tâche pour que la file puisse être throttlée.',
			'La réserve est rechargée une fois par période par [`__refill_cfs_bandwidth_runtime`](' + FAIR + '#L5748-L5764), qui ajoute `cfs_b->quota`. Dans le même timer, la [ligne 6307](' + FAIR + '#L6306-L6307) incrémente `nr_throttled`.',
			'`throttled_usec` s’additionne par file de CPU ([ligne 6034](' + FAIR + '#L6033-L6036)). Quatre files throttlées en même temps comptent quatre fois le temps réel.'
		]
	},
	tradeoff: {
		gain: [
			'Une limite CPU est un plafond que le noyau applique à chaque période : un pod limité à 1 ne peut pas prendre plus de 100 ms de CPU par 100 ms, quoi que fassent ses voisins sur le nœud.',
			'Le coût d’une requête se borne simplement : avec le quota connu, on peut calculer le pire cas pour une quantité de calcul donnée, comme les 225 ms du schéma.',
			'`cpu.stat` donne le nombre exact de périodes throttlées : l’effet de la limite se mesure à partir du seul cgroup.'
		],
		cost: [
			'Un service multithreadé consomme son quota plus vite que le temps réel : les courtes rafales sont throttlées alors que l’usage moyen reste loin sous la limite.',
			'Les tableaux de bord qui moyennent l’usage CPU sur 30 ou 60 secondes cachent un throttling qui se joue à l’intérieur de périodes de 100 ms. Il faut diviser `nr_throttled` par `nr_periods` pour le voir.',
			'Relever la limite, allonger la période (le `cpuCFSQuotaPeriod` du kubelet, derrière une feature gate) ou régler `cpu.max.burst` : chaque option cède une partie du plafond contre une latence plus basse.'
		]
	},
	task: {
		prompt: 'Sur la machine où ce chapitre a été écrit, `docker run --rm --cpus 1 busybox` a lancé 4 boucles actives pendant 3 secondes, puis affiché `/sys/fs/cgroup/cpu.stat` : `usage_usec 3081196`, `nr_periods 31`, `nr_throttled 30`, `throttled_usec 8975156`. Calcule le pourcentage de périodes throttlées et le CPU moyen consommé, puis explique pourquoi `throttled_usec` vaut environ 9 s alors que le test a duré 3 s.',
		hint: 'Le billet d’Indeed définit le pourcentage throttlé comme `nr_throttled` divisé par `nr_periods`. Pour les 9 s, relis la dernière note de l’exemple.',
		answer: [
			'Pourcentage throttlé : 30 / 31, environ 97 %. Presque chaque période s’est terminée quota épuisé.',
			'CPU moyen : 3,08 s de CPU en 3,1 s environ (31 périodes de 100 ms), soit à peu près 1 CPU, exactement la limite. Les 4 boucles voulaient 4 CPU sur une machine qui en a 16.',
			'À chaque période, les 4 files ont épuisé les 100 ms de quota en 25 ms environ, puis chacune a attendu 75 ms environ. 30 périodes × 4 files × 75 ms = 9 s, ce qui colle à `throttled_usec 8975156` : le noyau additionne le temps throttlé de chaque file.',
			'Pour un service, la même lecture avec un graphe d’usage à 30 % de la limite te dit que les requêtes attendent à l’intérieur des périodes. Pour faire baisser la latence, il faut changer la limite ou le nombre de threads actifs.'
		]
	},
	quiz: [
		{
			q: 'Un pod a une limite CPU de `500m`. Son graphe d’usage, moyenné par minute, affiche 0,15 CPU, et pourtant `nr_throttled / nr_periods` vaut 40 %. Que se passe-t-il ?',
			options: [
				'Les métriques se contredisent, donc l’un des deux compteurs est cassé',
				'Des rafales de threads épuisent les 50 ms de quota en début de période, puis attendent',
				'Le nœud est surchargé, et le throttling compte l’attente d’un CPU libre',
				'Le pod dépasse sa limite mémoire, et le noyau ralentit son CPU'
			],
			answer: 1,
			why: '`500m` donne un `cpu.max` de `50000 100000`. Le quota se vérifie par période de 100 ms et s’additionne sur les threads. La moyenne par minute cache les périodes où les threads ont brûlé leurs 50 ms d’un coup avant d’attendre.'
		},
		{
			q: 'Une requête monothread demande 200 ms de CPU. Le conteneur est limité à `0.4` CPU avec une période de 100 ms. Combien de temps prend-elle ?',
			options: [
				'200 ms, car le CPU est libre et la limite ne s’applique pas',
				'500 ms, car 200 ms à 40 % font 500 ms',
				'Environ 440 ms : quatre périodes de 40 ms de calcul et 60 ms d’attente, puis 40 ms',
				'800 ms, car chaque tranche de 40 ms coûte une période entière de 200 ms'
			],
			answer: 2,
			why: 'C’est l’exemple du billet d’Indeed : 40 ms de calcul par période de 100 ms, "even if the CPU has no other work to do". Quatre périodes throttlées couvrent 160 ms de calcul en 400 ms, et les 40 dernières millisecondes terminent la requête à 440 ms.'
		},
		{
			q: 'Un conteneur a tourné 3 secondes et son `cpu.stat` affiche `throttled_usec 8975156`. Comment peut-il avoir été throttlé plus longtemps qu’il n’a tourné ?',
			options: [
				'Le compteur est en nanosecondes, ça fait donc 8,9 ms',
				'Il inclut le temps d’avant le démarrage du conteneur',
				'Il additionne le temps throttlé de chaque file de CPU du groupe',
				'Le compteur n’est jamais remis à zéro et garde les anciens conteneurs'
			],
			answer: 2,
			why: 'Dans `unthrottle_cfs_rq`, chaque file d’exécution par CPU ajoute son propre temps throttlé au total du groupe. Quatre files throttlées 75 ms dans la même période ajoutent 300 ms.'
		}
	],
	recall: {
		q: 'Pourquoi un conteneur à 30 % de sa limite CPU peut-il quand même avoir des requêtes lentes, et quel fichier le montre ?',
		a: 'Le quota de `cpu.max` se compte par période (100 ms) et s’additionne sur tous les threads. Plusieurs threads peuvent l’épuiser en une fraction de la période puis attendre la recharge, pendant que la moyenne sur une minute reste basse. `cpu.stat` le montre : `nr_throttled` comparé à `nr_periods`.'
	},
	sources: [
		{ title: 'Doc du noyau Linux, CFS Bandwidth Control', url: 'https://docs.kernel.org/scheduler/sched-bwc.html' },
		{ title: 'Doc du noyau Linux, Control Group v2 (cpu.max, cpu.stat)', url: 'https://docs.kernel.org/admin-guide/cgroup-v2.html' },
		{ title: 'Indeed Engineering, Unthrottled: Fixing CPU Limits in the Cloud', url: 'https://engineering.indeedblog.com/blog/2019/12/unthrottled-fixing-cpu-limits-in-the-cloud/' },
		{ title: 'Commit Linux de53fd7aedb1, suppression de l’expiration des slices locales', url: 'https://github.com/torvalds/linux/commit/de53fd7aedb100f03e5d2231cfce0e4993282425' },
		{ title: 'Issue Kubernetes 67577, CFS quotas can lead to unnecessary throttling', url: 'https://github.com/kubernetes/kubernetes/issues/67577' },
		{ title: 'Source de Kubernetes, MilliCPUToQuota', url: 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e/pkg/kubelet/cm/helpers_linux.go#L117-L141' }
	]
};
