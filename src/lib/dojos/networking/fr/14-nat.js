const LINUX = 'https://github.com/torvalds/linux/blob/70dd4ee72eb2d5793c62e71c14e3aba78e5a4e56';
const CORE = `${LINUX}/net/netfilter/nf_conntrack_core.c`;
const K8S = 'https://github.com/kubernetes/kubernetes/blob/949f064e6d9e32f0a597795c265fcd50c6aad66e';
const SYSCTLS = `${K8S}/pkg/proxy/conntrack/sysctls.go`;
const ISSUE = 'https://github.com/kubernetes/kubernetes/issues/71261';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'nat',
	part: 'Noms et adresses',
	title: 'NAT et conntrack',
	minutes: 10,
	hook: [
		'Novembre 2018, issue Kubernetes #71261. Sur un nœud en Kubernetes 1.12.2, `dmesg -T` affiche la même ligne en boucle, trois fois dans la seule seconde de 22:30:27 : `nf_conntrack: table full, dropping packet`.',
		'Le rapport : "This issue may break pod http health check, pod will restart frequently." Le Pod `ingress-nginx-controller` ne répond plus, et toutes les requêtes qui passent par lui échouent.',
		'Le log de kube-proxy contient la limite qu’il avait posée : `Setting nf_conntrack_max to 786432`. Un mainteneur fait le calcul : 24 cœurs fois les 32 768 entrées par cœur par défaut. **Passer `nf_conntrack_max` à 1048576 a réglé le problème.**'
	],
	terms: [
		{ term: 'NAT', def: 'Network address translation : la réécriture de l’adresse source (SNAT) ou de l’adresse destination (DNAT) des paquets qui traversent une machine.' },
		{ term: 'conntrack', def: 'La table de suivi des connexions de Linux. Elle garde une entrée par flux, avec les adresses et ports d’origine et ceux attendus dans les réponses, pour que le NAT s’applique à chaque paquet du flux.' },
		{ term: 'nf_conntrack_max', def: 'Le sysctl qui plafonne le nombre d’entrées de la table conntrack. `nf_conntrack_count` donne le nombre d’entrées utilisées.' },
		{ term: 'MASQUERADE', def: 'Une cible SNAT d’iptables qui remplace la source par l’adresse de l’interface de sortie du paquet : la règle n’a besoin d’aucune IP fixe.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['pod["Pod 10.244.1.5:40000"] -->|"vers 1.1.1.1:53"| node["Nœud : netfilter"]', 'node --> ct[("conntrack : nouvelle entrée")]'],
				highlight: ['node', 'ct'],
				note: 'Le Pod envoie une requête DNS à `1.1.1.1:53`. Quand le premier paquet d’un flux arrive dans netfilter sur le nœud, conntrack lui crée une entrée. Sa clé réunit le protocole, puis les adresses et ports source et destination.'
			},
			{
				add: ['node -->|"SNAT : depuis 203.0.113.7:40000"| net["Internet"]'],
				highlight: ['net'],
				note: 'Une règle MASQUERADE remplace la source par l’adresse du nœud, ici `203.0.113.7` : `10.244.1.5` est une adresse privée qu’internet ne sait pas joindre. L’entrée note aussi la réponse attendue : de `1.1.1.1:53` vers `203.0.113.7:40000`.'
			},
			{
				add: ['net -->|"réponse vers 203.0.113.7:40000"| node', 'node -->|"NAT inverse : vers 10.244.1.5:40000"| pod'],
				highlight: ['ct', 'pod'],
				note: 'La réponse correspond à l’entrée, et netfilter remet le Pod en destination. Aucune règle n’est réévaluée : la page de manuel d’iptables précise qu’après un SNAT ou un DNAT, "all future packets in this connection will also be mangled".'
			},
			{
				add: ['client["Pod : vers la ClusterIP 10.96.0.10:53"] -->|"DNAT : vers 10.244.2.8:53"| dnspod["Pod CoreDNS"]'],
				highlight: ['client', 'dnspod'],
				note: 'Pour les Services, kube-proxy fait la réécriture inverse. La doc Kubernetes : ses règles "redirect traffic (using destination NAT) to the backends". Chaque flux vers une ClusterIP prend lui aussi une entrée conntrack.'
			},
			{
				add: ['ct -->|"count > nf_conntrack_max"| full["Nouveaux flux jetés : table pleine"]'],
				highlight: ['full'],
				note: 'Une entrée reste après le dernier paquet jusqu’à l’expiration d’un minuteur : 30 secondes pour UDP et 120 secondes pour TCP en TIME_WAIT, par défaut. Quand le compte atteint `nf_conntrack_max`, le noyau jette le premier paquet des nouveaux flux et écrit "table full".'
			}
		]
	},
	example: {
		title: 'net/netfilter/nf_conntrack_core.c : ce que fait le noyau d’un nouveau flux quand la table est pleine',
		repo: 'torvalds/linux',
		url: `${CORE}#L1649-L1675`,
		lang: 'c',
		code: `static struct nf_conn *
__nf_conntrack_alloc(struct net *net,
		     const struct nf_conntrack_zone *zone,
		     const struct nf_conntrack_tuple *orig,
		     const struct nf_conntrack_tuple *repl,
		     gfp_t gfp, u32 hash)
{
	struct nf_conntrack_net *cnet = nf_ct_pernet(net);
	unsigned int ct_count;
	struct nf_conn *ct;

	/* We don't want any race condition at early drop stage */
	ct_count = atomic_inc_return(&cnet->count);

	if (unlikely(ct_count > nf_conntrack_max)) {
		if (!early_drop(net, hash)) {
			if (!conntrack_gc_work.early_drop)
				conntrack_gc_work.early_drop = true;
			atomic_dec(&cnet->count);
			if (net == &init_net)
				net_warn_ratelimited("nf_conntrack: table full, dropping packet\\n");
			else
				net_warn_ratelimited("nf_conntrack: table full in netns %u, dropping packet\\n",
						     net->ns.inum);
			return ERR_PTR(-ENOMEM);
		}
	}`,
		notes: [
			'Les lignes 4 et 5 reçoivent deux tuples : `orig`, les adresses telles que le premier paquet les portait, et `repl`, celles que portera une réponse après NAT. Une seule entrée couvre les deux sens du flux.',
			'La ligne 13 compte la nouvelle entrée, et la ligne 15 compare ce compte à `nf_conntrack_max`. Cette fonction ne tourne que pour le premier paquet d’un flux : les paquets des flux déjà en table n’arrivent jamais à ce test.',
			'La ligne 16 appelle `early_drop`, qui parcourt 8 seaux de hachage voisins de la nouvelle entrée et libère une entrée non marquée assured. Le noyau marque un flux TCP assured dès qu’il atteint ESTABLISHED. Un flux UDP doit avoir une réponse et du trafic encore actif après 2 secondes : une requête DNS isolée ne l’est jamais.',
			'Si rien ne peut être libéré, les lignes 19 à 25 annulent le compte, écrivent le message de l’issue #71261 et renvoient une erreur. Le paquet est jeté, et le client ne reçoit ni réponse ni erreur.',
			'kube-proxy pose la limite au démarrage. [`getConntrackMax`](' + SYSCTLS + '#L131-L153) renvoie `MaxPerCore` fois le nombre de CPU, au moins `Min` (131072 par défaut) et au plus 1048576. Il monte ensuite la taille de la table de hachage au quart de cette valeur si elle est plus petite.'
		]
	},
	tradeoff: {
		gain: [
			'Beaucoup de Pods aux adresses privées `10.244.x.x` sortent sur internet par l’unique adresse publique du nœud, et les réponses retrouvent leur chemin grâce à l’entrée conntrack.',
			'iptables n’évalue les règles NAT que pour le premier paquet d’un flux. netfilter réécrit chaque paquet suivant à partir de l’entrée conntrack.'
		],
		cost: [
			'Chaque flux garde son entrée après son dernier paquet : 30 secondes pour une requête DNS en UDP, 120 secondes en TIME_WAIT pour une connexion TCP fermée. Un nœud qui ouvre beaucoup de connexions courtes remplit la table de flux terminés.',
			'Une table pleine jette les nouveaux flux et laisse tourner les autres. Un health check qui ouvre une connexion à chaque passage échoue, et kubelet redémarre le Pod, comme dans l’issue #71261.',
			'Le noyau dimensionne la table d’après la RAM : par défaut, le nombre de seaux vaut la mémoire totale divisée par 16384, au plus 262144, et `nf_conntrack_max` vaut ce nombre de seaux. Sur la machine de 29 Go utilisée pour ce chapitre, les deux valent 262144.'
		]
	},
	task: {
		prompt: 'Un nœud de 24 cœurs fait tourner kube-proxy avec les réglages conntrack par défaut. Ses Pods ouvrent 5 000 connexions TCP courtes par seconde vers d’autres services, chacune fermée au bout de quelques millisecondes, et envoient 3 000 requêtes DNS par seconde en UDP, chacune dans son propre flux. (1) Quel `nf_conntrack_max` kube-proxy pose-t-il ? (2) Combien d’entrées la table contient-elle en régime établi ? (3) Le trafic monte à 7 000 connexions TCP par seconde. Que se passe-t-il ? (4) Tu mets `conntrack.maxPerCore: 60000` comme dans l’issue. Quelle limite obtiens-tu avec le kube-proxy actuel ?',
		hint: 'En régime établi, entrées = nouveaux flux par seconde fois le nombre de secondes où chaque entrée reste. Compte 120 s pour un TCP fermé (TIME_WAIT) et 30 s pour UDP.',
		answer: [
			'(1) 24 fois 32 768 = 786 432, au-dessus du minimum de 131 072. kube-proxy monte aussi la table de hachage à 786 432 / 4 = 196 608 seaux si elle est plus petite.',
			'(2) TCP : 5 000 x 120 = 600 000. UDP : 3 000 x 30 = 90 000. Total 690 000 entrées, 88 % de la limite.',
			'(3) TCP : 7 000 x 120 = 840 000, plus 90 000 pour UDP, soit 930 000, au-dessus de 786 432. Le noyau jette le premier paquet des nouveaux flux et écrit `nf_conntrack: table full, dropping packet`. Les connexions déjà ouvertes continuent de marcher.',
			'(4) 24 x 60 000 = 1 440 000, mais le code de ce commit plafonne la valeur calculée à 1 048 576. Cela couvre les 930 000. En 2018 le code n’avait pas de plafond : la personne qui a ouvert l’issue a obtenu 1 440 000.'
		],
		steps: [
			{
				title: 'Trouve la limite',
				questions: [
					{ q: 'Le même kube-proxy tourne aussi sur un nœud de 2 cœurs. Quel `nf_conntrack_max` y pose-t-il ?', options: ['131 072, le plancher `Min`', '65 536', '32 768', '262 144'], answer: 0, why: '2 x 32 768 = 65 536 est sous le plancher `Min` : `getConntrackMax` renvoie 131 072.' },
					{ q: 'Le nœud de 24 cœurs obtient 786 432. Avec TCP seul, chaque connexion fermée gardée 120 s, combien de nouvelles connexions par seconde le remplissent ?', options: ['Environ 786', 'Environ 26 200', 'Environ 6 550', 'Environ 65 500'], answer: 2, why: 'Entrées = nouveaux flux par seconde fois 120 s : 786 432 / 120 donne environ 6 550 par seconde. Les 7 000 de la partie (3) le dépassent avant même UDP.' },
					{ q: 'Le plancher `Min` change-t-il ce résultat ?', options: ['Oui, il le monte à 1 048 576', 'Non, 786 432 est au-dessus du plancher de 131 072', 'Oui, il le plafonne à 131 072', 'Non, `Min` ne vaut que pour UDP'], answer: 1, why: '`Min` (131 072 par défaut) est un plancher. La valeur calculée est déjà au-dessus.' },
					{ q: 'Que fait kube-proxy de la table de hachage ?', options: ['Il lui donne la taille de la limite d’entrées', 'Il la laisse à la valeur par défaut du noyau', 'Il la double à 1 572 864', 'Il la monte au quart de la limite si elle est plus petite'], answer: 3, why: 'kube-proxy monte la table de hachage à `max / 4`, ici 196 608 seaux, si elle est plus petite.' }
				]
			},
			{
				title: 'Compte les entrées en régime établi',
				questions: [
					{ q: 'Combien de temps reste par défaut l’entrée d’une connexion TCP fermée ?', options: ['Quelques millisecondes', '30 secondes', '120 secondes, en TIME_WAIT', 'Jusqu’à ce que la table soit pleine'], answer: 2, why: 'Les entrées survivent au dernier paquet. Un flux TCP fermé reste 120 secondes en TIME_WAIT.' },
					{ q: 'Combien d’entrées TCP 5 000 nouvelles connexions par seconde gardent-elles dans la table ?', options: ['600 000', '5 000', '150 000', '60 000'], answer: 0, why: 'Entrées = nouveaux flux par seconde fois les secondes où chacune reste : 5 000 x 120 = 600 000.' },
					{ q: 'Combien d’entrées UDP 3 000 requêtes DNS par seconde gardent-elles ?', options: ['3 000', '90 000', '360 000', '6 000'], answer: 1, why: 'Chaque requête est son propre flux, gardé 30 secondes : 3 000 x 30 = 90 000.' },
					{ q: 'Quelle part de la limite est utilisée ?', options: ['Environ 50 %', 'Environ 77 %', 'Environ 100 %', 'Environ 88 %'], answer: 3, why: '600 000 + 90 000 = 690 000 sur 786 432, environ 88 %.' }
				]
			},
			{
				title: 'Fais monter le trafic',
				questions: [
					{ q: 'À 7 000 connexions TCP par seconde, combien d’entrées au total ?', options: ['790 000', '930 000', '840 000', '1 048 576'], answer: 1, why: '7 000 x 120 = 840 000 pour TCP, plus 90 000 pour UDP : 930 000.' },
					{ q: 'Quelles entrées de ce nœud `early_drop` peut-il libérer pour faire de la place ?', options: ['Les connexions TCP fermées en TIME_WAIT', 'N’importe laquelle, la plus ancienne d’abord', 'Les flux DNS d’une seule requête, jamais assured', 'Aucune : `early_drop` ne libère que des entrées TCP'], answer: 2, why: '`early_drop` ne libère que des entrées non marquées assured. Les connexions TCP sont passées par ESTABLISHED, donc assured. Une requête DNS isolée ne l’est jamais.' },
					{ q: 'Le health check HTTP d’un Pod ouvre une nouvelle connexion à chaque fois. À quoi t’attends-tu ?', options: ['Il passe toujours, les health checks évitent conntrack', 'Il échoue, et le kubelet redémarre le Pod', 'Il ralentit mais n’échoue jamais', 'Il bascule en UDP'], answer: 1, why: 'Chaque check est un nouveau flux : son premier paquet peut être jeté. C’est ce que décrit l’issue #71261 : des Pods qui redémarrent souvent.' },
					{ q: 'Pourquoi une table pleine casse-t-elle aussi les résolutions DNS des Pods ?', options: ['Chaque requête est son propre flux : son premier paquet a besoin d’une nouvelle entrée', 'Les paquets UDP contournent conntrack', 'DNS passe en TCP quand la table est pleine', 'Le noyau jette tout l’UDP avant le TCP'], answer: 0, why: 'Ici, chaque requête DNS est un nouveau flux UDP. Son premier paquet passe par la vérification de table pleine et peut être jeté comme une nouvelle connexion TCP.' }
				]
			},
			{
				title: 'Monte la limite',
				questions: [
					{ q: 'Avec `maxPerCore: 60000`, quelle est la valeur calculée avant tout plafond ?', options: ['1 048 576', '786 432', '1 440 000', '60 000'], answer: 2, why: '24 x 60 000 = 1 440 000.' },
					{ q: 'Quelle limite pose le kube-proxy actuel ?', options: ['1 440 000', '1 048 576', '131 072', '786 432'], answer: 1, why: '`getConntrackMax` plafonne la valeur calculée à 1 048 576.' },
					{ q: 'Est-ce assez pour 930 000 entrées ?', options: ['Oui, avec de la marge', 'Non, il manque 100 000', 'Seulement si UDP s’arrête', 'Seulement après un redémarrage du nœud'], answer: 0, why: '1 048 576 est au-dessus de 930 000.' },
					{ q: 'Pourquoi la personne de l’issue a-t-elle obtenu 1 440 000 en 2018 ?', options: ['Elle l’a posé à la main avec sysctl', 'Le noyau l’a doublé au démarrage', 'Son nœud avait plus de cœurs', 'Le code n’avait pas encore de plafond'], answer: 3, why: 'Le plafond à 1 048 576 est venu plus tard. En 2018, kube-proxy prenait la valeur calculée telle quelle.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Un Pod en `10.244.1.5` interroge `1.1.1.1`. Le nœud le masque derrière `203.0.113.7`. Comment la réponse arrive-t-elle au Pod ?',
			options: [
				'La réponse porte l’adresse du Pod dans un en-tête ajouté par le SNAT',
				'Le nœud rapproche la réponse de l’entrée conntrack et la réécrit',
				'Le nœud diffuse la réponse à tous les Pods, et le bon la garde',
				'La règle MASQUERADE est réévaluée à l’envers sur la réponse'
			],
			answer: 1,
			why: 'Conntrack a gardé le tuple de réponse attendu lors de la traduction du premier paquet. La réponse vers `203.0.113.7:40000` y correspond, et netfilter remet `10.244.1.5:40000` en destination sans repasser par les règles.'
		},
		{
			q: 'La table conntrack est pleine. Quel trafic échoue ?',
			options: [
				'Tout le trafic du nœud, car chaque paquet demande une entrée libre',
				'Les nouveaux flux, alors que ceux déjà en table continuent de passer',
				'Seulement UDP, car les entrées TCP sont toujours marquées assured',
				'Seulement le trafic vers les ClusterIP, car le SNAT n’utilise pas conntrack'
			],
			answer: 1,
			why: 'Le noyau n’alloue une entrée que pour le premier paquet d’un flux. Quand le compte dépasse `nf_conntrack_max` et qu’`early_drop` ne libère rien, ce paquet est jeté. Les paquets des flux connus retrouvent leur entrée existante.'
		},
		{
			q: 'kube-proxy écrit `Setting nf_conntrack_max to 786432` sur un nœud aux réglages par défaut. D’où vient ce nombre ?',
			options: [
				'La mémoire totale divisée par 16384, la règle du noyau',
				'24 CPU fois les 32 768 entrées par cœur par défaut',
				'Sa valeur fixe de 786 432, la même sur tous les nœuds',
				'Le défaut du noyau, 262 144, multiplié par 3 par sécurité'
			],
			answer: 1,
			why: '`getConntrackMax` multiplie `MaxPerCore`, 32 x 1024 par défaut, par le nombre de CPU, avec `Min` (131 072) comme plancher. 786 432 / 32 768 = 24, l’hypothèse du mainteneur dans l’issue #71261.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Monter une fausse ClusterIP avec une seule règle DNAT, puis voir les entrées conntrack s’empiler après la fermeture des connexions.',
		steps: [
			'Ouvre un shell dans son propre namespace réseau, pour ne rien toucher aux règles de ton hôte : `docker run -it --rm --cap-add NET_ADMIN nicolaka/netshoot:v0.13`.',
			'Dedans, lance un backend : `python3 -m http.server 8080 >/dev/null 2>&1 &`.',
			'Ajoute la règle du « Service » : `iptables -t nat -A OUTPUT -p tcp -d 10.96.0.10 --dport 80 -j DNAT --to-destination $(hostname -i):8080`.',
			'Appelle une fois la fausse ClusterIP et lis la table : `curl -s -o /dev/null -w "%{http_code}\\n" http://10.96.0.10/`, puis `conntrack -L`.',
			'Ouvre 50 connexions courtes et compte les entrées : `for i in $(seq 50); do curl -s -o /dev/null http://10.96.0.10/; done; conntrack -C`. Lance `conntrack -L | head -3` plusieurs fois pendant les deux minutes suivantes, et lis la limite avec `cat /proc/sys/net/netfilter/nf_conntrack_max`.'
		],
		done: [
			'`curl` affiche `200`, alors que rien n’écoute sur `10.96.0.10`.',
			'`conntrack -L` montre une ligne avec deux tuples : `dst=10.96.0.10 dport=80`, puis un tuple de réponse avec `sport=8080`.',
			'Après la boucle, `conntrack -C` affiche environ 51 alors que toutes les connexions sont fermées, et les entrées montrent `TIME_WAIT` avec un minuteur qui décompte depuis 120.'
		],
		solution: [
			'Le premier paquet a touché la règle DNAT et conntrack a gardé les deux tuples. La réponse du port 8080 a correspondu au tuple de réponse et a été réécrite vers `10.96.0.10:80`, sans repasser par les règles.',
			'Chaque flux TCP fermé garde son entrée 120 secondes. 50 connexions en quelques secondes gardent environ 50 entrées pendant deux minutes : le même calcul de régime établi que dans l’exercice, à plus petite échelle.',
			'Écrire dans `nf_conntrack_max` depuis le conteneur échoue avec "Read-only file system" : Docker monte `/proc/sys` en lecture seule. Tape `exit` pour supprimer le conteneur et ses règles.'
		]
	},
	recall: {
		q: 'Que fait le noyau du premier paquet d’un nouveau flux quand `nf_conntrack_count` a atteint `nf_conntrack_max` ?',
		a: 'Il tente `early_drop` : libérer une entrée non assured parmi 8 seaux de hachage voisins. Quand aucune entrée ne peut partir, il jette le paquet et écrit `nf_conntrack: table full, dropping packet`.'
	},
	sources: [
		{ title: 'Issue Kubernetes #71261, nf_conntrack: table full, dropping packet', url: ISSUE },
		{ title: 'Doc du noyau Linux, Netfilter Conntrack Sysfs variables', url: 'https://docs.kernel.org/networking/nf_conntrack-sysctl.html' },
		{ title: 'iptables-extensions(8), cibles SNAT, DNAT et MASQUERADE', url: 'https://man7.org/linux/man-pages/man8/iptables-extensions.8.html' },
		{ title: 'Doc Kubernetes, Virtual IPs and Service Proxies', url: 'https://kubernetes.io/docs/reference/networking/virtual-ips/' },
		{ title: 'Source Kubernetes, pkg/proxy/conntrack/sysctls.go', url: SYSCTLS }
	]
};
