const GO = 'https://github.com/golang/go/blob/c3a068eec992b5ae783abce1a9d03f617b671ea2';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'time',
	part: 'Le système en marche',
	title: 'Les horloges et NTP',
	minutes: 10,
	hook: [
		'Le 1er janvier 2017 à minuit UTC, une seconde intercalaire est ajoutée. Sur les serveurs DNS de Cloudflare, l’heure recule d’une seconde, et RRDNS, leur serveur DNS écrit en Go, se met à paniquer.',
		'RRDNS chronométrait chaque résolveur amont avec `rtt := time.Now().Sub(start)`. Ces résolveurs répondent en quelques millisecondes, donc un recul d’une seconde rendait le résultat négatif. Après lissage, la valeur arrivait dans `rand.Int63n()`, qui panique sur un argument négatif. Au pic, 0,2 % des requêtes DNS ont échoué, et le correctif était déployé partout à 06:45 UTC.',
		'Go n’avait pas encore d’horloge monotone (issue 12914). **Linux a deux horloges pour ça** : `CLOCK_REALTIME`, que NTP et root peuvent régler, et `CLOCK_MONOTONIC`, qui ne recule jamais. Depuis Go 1.9, chaque `time.Now()` lit les deux.'
	],
	terms: [
		{ term: 'Horloge murale', def: '`CLOCK_REALTIME` : la date et l’heure, en secondes depuis le 1970-01-01 00:00 UTC, sans les secondes intercalaires. Root, `date -s` et les démons NTP peuvent la régler, en avant comme en arrière.' },
		{ term: 'Horloge monotone', def: '`CLOCK_MONOTONIC` : sous Linux, le temps écoulé depuis le démarrage, moins le temps passé en veille. Personne ne peut la régler, et deux lectures successives ne reculent jamais.' },
		{ term: 'Slew', def: 'Corriger l’horloge murale en la faisant tourner un peu plus vite ou un peu plus lentement jusqu’à effacer l’écart. chronyd fait ça par défaut, à 83333 ppm au plus (un douzième).' },
		{ term: 'Step', def: 'Poser d’un coup une nouvelle valeur sur l’horloge murale, qui saute en avant ou en arrière. chronyd ne le fait que si `makestep` l’autorise, et le noyau recule d’une seconde pour une seconde intercalaire ajoutée.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['app["Go : time.Now()"] -->|"CLOCK_REALTIME"| rt["Horloge murale : 2017-01-01 00:00:00.004 UTC"]', 'app -->|"CLOCK_MONOTONIC"| mono["Horloge monotone : 86400.004 s depuis le démarrage"]'],
				highlight: ['app'],
				note: 'Sur linux/amd64, `time.now` de Go appelle deux fois `clock_gettime` : `CLOCK_REALTIME` (ligne 52 de `runtime/time_linux_amd64.s`) puis `CLOCK_MONOTONIC` (ligne 59). La valeur `Time` garde les deux lectures. Les dates des cases sont des exemples, 4 ms après minuit.'
			},
			{
				add: ['chrony["chronyd : horloge en avance de 0,5 s sur le serveur NTP"] -->|"slew : tourne plus lentement, jusqu’à 83333 ppm"| rt', 'chrony -.->|"même changement de vitesse"| mono'],
				highlight: ['chrony'],
				note: 'D’habitude, chronyd corrige un écart "by slowing down or speeding up the clock as required", en ralentissant ou en accélérant l’horloge. L’horloge murale continue d’avancer, juste à une vitesse un peu différente. D’après clock_gettime(2), `CLOCK_MONOTONIC` est "affected by frequency adjustments" lui aussi, mais il ne saute jamais.'
			},
			{
				add: ['step["makestep 1 3 : écart de plus de 1 s dans les 3 premières mises à jour"] -->|"step : saut"| rt'],
				highlight: ['step', 'rt'],
				note: 'Une horloge très décalée au démarrage mettrait des heures à se corriger par slew. `makestep 1 3` laisse chronyd faire un step quand l’écart dépasse 1 seconde, mais seulement pendant ses trois premières mises à jour. La doc de chrony conseille de le faire "only on boot, before starting programs that rely on time advancing monotonically forwards". Un step ne touche que `CLOCK_REALTIME`.'
			},
			{
				add: ['leap["Seconde intercalaire à 00:00:00 UTC"] -->|"le noyau recule de 1 s"| rt', 'rt --> neg["RRDNS : time.Now().Sub(start) est négatif"]'],
				highlight: ['leap', 'neg'],
				note: 'Avec `leapsecmode system`, le réglage par défaut de chrony, "the kernel steps the system clock backwards by one second when the clock gets to 00:00:00 UTC". Un début lu à 23:59:59.998 et une fin lue 4 ms plus tard, après le recul, à 23:59:59.002 donnent un écart de -996 ms.'
			},
			{
				add: ['mono --> pos["Go 1.9+ : Sub prend les deux lectures monotones, rtt vaut 4 ms"]'],
				highlight: ['pos'],
				note: 'Depuis Go 1.9, `t.Sub(u)` utilise les lectures monotones quand les deux valeurs en ont une, et le résultat reste positif malgré le saut. Les horodatages des logs viennent toujours de l’horloge murale : une ligne écrite juste après le recul affiche une heure plus ancienne que la ligne d’avant. POSIX précise aussi que régler `CLOCK_REALTIME` ne change rien aux attentes relatives comme `nanosleep()`.'
			}
		]
	},
	example: {
		title: 'src/time/time.go : Time.Sub préfère la lecture monotone',
		repo: 'golang/go',
		url: `${GO}/src/time/time.go#L1194-L1223`,
		lang: 'go',
		code: `// Sub returns the duration t-u. If the result exceeds the maximum (or minimum)
// value that can be stored in a [Duration], the maximum (or minimum) duration
// will be returned.
// To compute t-d for a duration d, use t.Add(-d).
func (t Time) Sub(u Time) Duration {
	if t.wall&u.wall&hasMonotonic != 0 {
		return subMono(t.ext, u.ext)
	}
	d := Duration(t.sec()-u.sec())*Second + Duration(t.nsec()-u.nsec())
	// Check for overflow or underflow.
	switch {
	case u.Add(d).Equal(t):
		return d // d is correct
	case t.Before(u):
		return minDuration // t - u is negative out of range
	default:
		return maxDuration // t - u is positive out of range
	}
}

func subMono(t, u int64) Duration {
	d := Duration(t - u)
	if d < 0 && t > u {
		return maxDuration // t - u is positive out of range
	}
	if d > 0 && t < u {
		return minDuration // t - u is negative out of range
	}
	return d
}`,
		notes: [
			'La ligne 6 teste le bit `hasMonotonic` dans les deux valeurs. Le [commentaire de la struct `Time`](' + GO + '/src/time/time.go#L140-L153) dit que, quand ce bit est posé, `ext` contient "a signed 64-bit monotonic clock reading, nanoseconds since process start". La ligne 7 soustrait ces deux nombres sans regarder l’horloge murale.',
			'La ligne 9 sert quand une des valeurs n’a pas de lecture monotone : elle soustrait les secondes et nanosecondes de l’horloge murale, le genre de soustraction qui est passée sous zéro chez RRDNS. Les valeurs créées par `time.Unix`, `time.Parse` ou `UnmarshalJSON` n’ont pas de lecture monotone, et `t.UTC()`, `t.In()` et `t.Round(0)` l’enlèvent.',
			'Les lignes 21 à 29 soustraient les compteurs bruts en nanosecondes et ramènent un dépassement à `maxDuration` ou `minDuration`. Un step de l’horloge murale ne peut pas changer `ext`, qui vient de `CLOCK_MONOTONIC`.',
			'Les [notes de version de Go 1.9](https://go.dev/doc/go1.9#monotonic-time) décrivent le changement : le paquet "now transparently tracks monotonic time in each Time value, making computing durations between two Time values a safe operation in the presence of wall clock adjustments".'
		]
	},
	tradeoff: {
		gain: [
			'Les durées et les délais mesurés sur `CLOCK_MONOTONIC` restent positifs et justes quand NTP, root ou une seconde intercalaire font sauter l’horloge murale.',
			'Le slew garde l’horloge murale en marche avant : les horodatages des logs et des fichiers restent dans l’ordre pendant que chronyd corrige un petit écart.'
		],
		cost: [
			'Une lecture monotone n’a aucun sens hors du processus ni après un redémarrage. Go la retire des formes JSON, gob et texte, donc une durée calculée sur une date stockée passe par l’horloge murale.',
			'Le slew est lent : au maximum par défaut d’un douzième, effacer un écart d’une heure prend 12 heures, d’où `makestep` pour une horloge très fausse au démarrage.',
			'`CLOCK_MONOTONIC` ne compte pas le temps de veille. Un portable qui a dormi une heure mesure cette heure comme zéro, et `CLOCK_BOOTTIME` existe pour ce cas.'
		]
	},
	task: {
		prompt: 'Un service en Go 1.22 exécute quatre extraits. Dis lesquels peuvent donner une durée fausse ou négative si l’horloge murale recule d’une seconde au milieu. (a) `start := time.Now()` ... `time.Since(start)`. (b) `start := time.Now().UTC()` ... `time.Since(start)`. (c) `exp := time.Unix(row.ExpiresAt, 0)` ... `time.Until(exp)`. (d) `start := time.Now().Round(0)` ... `time.Now().Sub(start)`. Lance ensuite `timedatectl timesync-status` (systemd-timesyncd) ou `chronyc tracking` (chrony) et lis l’écart.',
		hint: 'Pour chaque extrait, demande-toi si les deux valeurs `Time` portent encore une lecture monotone. Lis la section « Monotonic Clocks » de la doc du paquet `time`.',
		answer: [
			'(a) ne risque rien : les deux valeurs viennent de `time.Now()` avec une lecture monotone, et `Since` soustrait les compteurs monotones.',
			'(b) et (d) sont exposés : `UTC()` et `Round(0)` enlèvent la lecture monotone, `Sub` retombe sur l’horloge murale et un recul peut donner un résultat négatif, le bug de RRDNS.',
			'(c) utilise l’horloge murale exprès : `time.Unix` n’a pas de lecture monotone. Une expiration stockée en base doit désigner le même instant sur toutes les machines, donc l’horloge murale est le bon choix. Un step décale le résultat de la taille du saut.',
			'Sortie de `timedatectl timesync-status` sur la machine où ce chapitre a été écrit : `Offset: +1.620ms`, `Frequency: -1.233ppm`, serveur `ntp.ubuntu.com`, stratum 2. L’horloge a 1,6 ms d’écart avec son serveur, assez peu pour un slew. Dans `chronyc tracking`, l’écart est sur la ligne `System time`, et `Frequency` est "the rate by which the system’s clock would be wrong if chronyd was not correcting it".'
		]
	},
	quiz: [
		{
			q: 'chronyd tourne depuis trois jours avec `makestep 1 3`. Il mesure maintenant l’horloge 0,5 s en avance sur ses serveurs NTP. Que fait-il ?',
			options: [
				'Il recule l’horloge de 0,5 s d’un coup, puisque l’écart est connu',
				'Il fait tourner l’horloge un peu plus lentement jusqu’à effacer les 0,5 s',
				'Il s’arrête, parce que l’écart dépasse son maximum',
				'Il attend le prochain démarrage, où `makestep` peut s’appliquer'
			],
			answer: 1,
			why: '`makestep 1 3` n’autorise un step que pour un écart de plus de 1 s, et seulement dans les trois premières mises à jour. Sinon chronyd fait un slew, en changeant la vitesse de l’horloge jusqu’à `maxslewrate`. L’horloge murale ne saute jamais.'
		},
		{
			q: 'Un worker appelle `nanosleep()` pour 5 secondes. Pendant l’attente, root lance `date -s` et recule l’horloge d’une heure. Quand le worker se réveille-t-il ?',
			options: [
				'Après 1 heure et 5 secondes, quand l’horloge murale atteint l’ancienne cible',
				'Tout de suite, car un changement d’horloge réveille tous les threads endormis',
				'Après 5 secondes, car une attente relative ignore les réglages d’horloge',
				'Jamais, car la cible de l’attente est maintenant dans le passé'
			],
			answer: 2,
			why: 'POSIX, cité dans clock_gettime(2) : régler `CLOCK_REALTIME` "shall have no effect on threads that are blocked waiting for a relative time service", `nanosleep()` compris. Le worker se réveille quand les 5 secondes demandées sont écoulées.'
		},
		{
			q: 'Du code Go fait `start := time.Now().UTC()` puis `time.Since(start)`. Une seconde intercalaire fait reculer l’horloge entre les deux. Que peut renvoyer `time.Since` ?',
			options: [
				'Une durée négative, car `UTC()` a enlevé la lecture monotone',
				'La bonne durée positive, car `time.Now()` est toujours monotone',
				'Une panique, car Go refuse de soustraire à travers une seconde intercalaire',
				'Zéro, car Go ramène tout résultat négatif à zéro'
			],
			answer: 0,
			why: '`t.UTC()` enlève la lecture monotone, donc `Sub` prend le chemin de l’horloge murale, ligne 9 de l’exemple. Un recul d’une seconde entre les deux lectures rend l’écart négatif. Sans `UTC()`, les deux valeurs ont une lecture monotone et le résultat reste positif.'
		}
	],
	recall: {
		q: 'Quelle horloge Linux faut-il utiliser pour mesurer un délai, et qu’est-il arrivé à RRDNS chez Cloudflare le 1er janvier 2017 ?',
		a: '`CLOCK_MONOTONIC`, qui ne recule jamais. RRDNS a soustrait deux lectures de l’horloge murale à travers la seconde intercalaire, a obtenu une durée négative, et `rand.Int63n()` a paniqué ; 0,2 % des requêtes DNS ont échoué au pic.'
	},
	sources: [
		{ title: 'Blog de Cloudflare, How and why the leap second affected Cloudflare DNS (2017)', url: 'https://blog.cloudflare.com/how-and-why-the-leap-second-affected-cloudflare-dns/' },
		{ title: 'clock_gettime(2), man7.org', url: 'https://man7.org/linux/man-pages/man2/clock_gettime.2.html' },
		{ title: 'Doc de chrony 4.6, chrony.conf(5)', url: 'https://chrony-project.org/doc/4.6/chrony.conf.html' },
		{ title: 'Doc de chrony 4.6, chronyc(1)', url: 'https://chrony-project.org/doc/4.6/chronyc.html' },
		{ title: 'Paquet time de Go, Monotonic Clocks', url: 'https://pkg.go.dev/time#hdr-Monotonic_Clocks' },
		{ title: 'Issue Go 12914, time: use monotonic clock to measure elapsed time', url: 'https://github.com/golang/go/issues/12914' },
		{ title: 'Source de Go, runtime/time_linux_amd64.s', url: `${GO}/src/runtime/time_linux_amd64.s#L52-L62` }
	]
};
