const RUBY = 'https://github.com/ruby/ruby';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'daylight-saving',
	part: 'Compter',
	title: 'Heure d’été et rotation mensuelle des logs',
	minutes: 10,
	hook: [
		'Le `Logger` de Ruby peut faire tourner son fichier une fois par mois : `Logger.new("app.log", "monthly")`. À la fin de chaque mois, il renomme `app.log` et en commence un nouveau.',
		'En 2016, une pull request signale un problème sur les machines dans un fuseau où l’on recule les horloges en octobre. **Pendant tout octobre, chaque ligne écrite refaisait tourner le fichier de log.**',
		'Le logger fait tourner le fichier quand `now >= @next_rotate_time`. La méthode ci-dessous calcule cette prochaine date de rotation. `Time.mktime` construit une heure sur l’horloge locale de la machine.'
	],
	terms: [
		{ term: 'Heure d’été (DST)', def: 'Les horloges avancent d’une heure au printemps et reculent d’une heure à l’automne. Le jour où elles reculent dure 25 heures sur l’horloge locale.' },
		{ term: 'Time.mktime', def: 'Construit un `Time` Ruby à partir de l’année, du mois, du jour (et plus) dans le fuseau local.' },
		{ term: 'Rotation des logs', def: 'Renommer le fichier de log en cours et en commencer un nouveau, ici une fois par jour, par semaine ou par mois.' }
	],
	bug: {
		title: 'logger: fix monthly log rotate with DST',
		repo: 'ruby/ruby',
		url: `${RUBY}/blob/d94ea30a576136d93b122b6eb69971b18be927d5/lib/logger.rb#L623-L643`,
		fix: `${RUBY}/commit/8fc170a34eff0190533b669b3e9f6b6aba42e48c`,
		lang: 'ruby',
		code: `SiD = 24 * 60 * 60

def next_rotate_time(now, shift_age)
  case shift_age
  when 'daily'
    t = Time.mktime(now.year, now.month, now.mday) + SiD
  when 'weekly'
    t = Time.mktime(now.year, now.month, now.mday) + SiD * (7 - now.wday)
  when 'monthly'
    t = Time.mktime(now.year, now.month, 1) + SiD * 31
    return Time.mktime(t.year, t.month, 1) if t.mday > 1
  else
    return now
  end
  if t.hour.nonzero? or t.min.nonzero? or t.sec.nonzero?
    hour = t.hour
    t = Time.mktime(t.year, t.month, t.mday)
    t += SiD if hour > 12
  end
  t
end`,
		lines: [10, 11],
		diff: `       when 'monthly'
-        t = Time.mktime(now.year, now.month, 1) + SiD * 31
-        return Time.mktime(t.year, t.month, 1) if t.mday > 1
+        t = Time.mktime(now.year, now.month, 1) + SiD * 32
+        return Time.mktime(t.year, t.month, 1)
       else`,
		notes: [
			'La ligne 10 ajoute 31 fois 86 400 secondes (`SiD`, ligne 1) à minuit le 1er. En Europe, on recule les horloges le dernier dimanche d’octobre : octobre dure alors 31 jours et une heure. Le 1er octobre à 00:00 plus 31 × 86 400 secondes donne **le 31 octobre à 23:00** sur l’horloge locale, une heure avant le 1er novembre.',
			'À la ligne 11, `t.mday` vaut 31, donc `t.mday > 1` est vrai et la méthode renvoie `Time.mktime(t.year, t.month, 1)` : le 1er octobre, début du mois en cours. Cette date est déjà passée, donc `now >= @next_rotate_time` est vrai à l’écriture suivante, et à celle d’après. La pull request : "which lead every single line of log during october to rotate the log file." (chaque ligne de log écrite en octobre faisait tourner le fichier).',
			'Avec les changements d’heure européens, un mois de 30 jours comme avril donne le 2 mai, et la ligne 11 renvoie le 1er mai. Un mois de 31 jours sans changement d’heure donne le 1er à 00:00 et continue plus bas. En mars, les horloges avancent : on obtient le 1er avril à 01:00, que les lignes 15 à 19 ramènent au 1er avril à minuit.',
			'La ligne 10 ajoute maintenant 32 jours, ce qui tombe toujours dans le mois suivant : aucun mois ne dépasse 31 jours et une heure, et le 1er février plus 32 jours donne le 5 mars. La ligne 11 renvoie donc toujours le 1er du mois suivant, et son `if` a disparu.',
			'Un utilisateur a envoyé le correctif dans la [pull request #1458](' + RUBY + '/pull/1458). Sa description dit : "With DST the month of october can actually last more than 31 days. It can last 31 days plus 1 hour."'
		]
	},
	quiz: [
		{
			q: 'Les horloges reculent d’une heure le 30 octobre 2016. Que vaut `Time.mktime(2016, 10, 1) + SiD * 31` sur l’horloge locale ?',
			options: ['Le 1er novembre à 00:00', 'Le 31 octobre à 23:00', 'Le 1er novembre à 01:00', 'Le 31 octobre à 00:00'],
			answer: 1,
			why: 'Octobre compte 31 jours plus l’heure gagnée au changement d’heure. 31 × 86 400 secondes, c’est une heure avant la fin d’octobre : le 31 octobre à 23:00.'
		},
		{
			q: 'En mars, les horloges avancent d’une heure. Pourquoi le bug ne se voyait-il pas en mars ?',
			options: [
				'Le résultat est le 1er avril à 01:00, et le test sur l’heure le ramène à minuit',
				'Mars a moins de secondes qu’octobre, donc 31 jours mènent jusqu’en mai',
				'Ruby ignore les changements d’heure du printemps quand il ajoute des secondes',
				'La branche mensuelle est sautée quand le mois commence un dimanche'
			],
			answer: 0,
			why: 'Mars perd une heure, donc 31 × 86 400 secondes tombent à 01:00 le 1er avril. `t.mday` vaut 1, le `if` ne renvoie rien, et le code plus bas remet l’heure à 00:00 le 1er avril.'
		},
		{
			q: 'Tu testes une fonction qui ajoute des jours à une heure locale. Quel montage trouve ce genre de bug ?',
			options: [
				'La lancer avec TZ=UTC pour avoir le même résultat sur toutes les machines',
				'L’appeler une fois avec l’heure actuelle et vérifier à la main',
				'La lancer dans un fuseau avec heure d’été, pour le 1er de chaque mois',
				'La lancer avec une fausse horloge réglée sur midi un jour de semaine'
			],
			answer: 2,
			why: 'UTC ne change jamais d’heure, donc il cache le bug. Un fuseau avec heure d’été et une date de départ dans chaque mois inclut le 1er octobre, l’entrée qui échoue.'
		}
	],
	recall: {
		q: 'Dans un fuseau européen, où tombe le 1er octobre à 00:00 plus 31 × 86 400 secondes, et qu’en faisait le logger ?',
		a: 'Le 31 octobre à 23:00, car octobre a une heure de plus. Le logger prenait le 1er octobre comme prochaine rotation, une date déjà passée, donc chaque écriture refaisait tourner le fichier.'
	},
	sources: [
		{ title: 'ruby, pull request #1458', url: `${RUBY}/pull/1458` },
		{ title: 'Le commit du correctif', url: `${RUBY}/commit/8fc170a34eff0190533b669b3e9f6b6aba42e48c` }
	]
};
