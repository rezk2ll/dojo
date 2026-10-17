const NGINX = 'https://github.com/nginx/nginx/blob/1725db9059e8d4057ce8d5090673d16e20713b45';
const CORE = `${NGINX}/src/http/ngx_http_core_module.c`;
const REALIP = `${NGINX}/src/http/modules/ngx_http_realip_module.c`;

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'reverse-proxy',
	part: 'Entre services',
	title: 'Reverse proxies et en-têtes de transfert',
	minutes: 10,
	hook: [
		'Un avis de sécurité sur Litestar 2.17.0 montre une limite de 2 requêtes par minute. Le troisième `curl http://localhost:8000/api/data` reçoit `429 Too Many Requests`. L’auteur ajoute ensuite `-H "X-Forwarded-For: 192.168.1.100"`, puis `.101`, puis `.102`, et chaque requête reçoit `200 OK`.',
		'Le middleware prenait la valeur de l’en-tête comme identité du client. L’avis : "Since clients can set arbitrary X-Forwarded-For values, each different spoofed IP creates a separate rate limit bucket." (chaque fausse IP ouvre son propre compteur). La version 2.18.0 corrige le problème.',
		'Derrière un reverse proxy, le pair TCP de l’appli est le proxy : toutes les requêtes semblent venir de son adresse. Le proxy écrit donc l’adresse du vrai client dans un en-tête. **Le client peut envoyer ce même en-tête lui-même**, et seules les entrées ajoutées par tes propres proxies méritent d’être lues.'
	],
	terms: [
		{ term: 'Reverse proxy', def: 'Un serveur placé devant ton appli : il accepte les connexions des clients et ouvre ses propres connexions vers l’appli. Dans nginx, `proxy_pass http://127.0.0.1:8000;` fait d’une location un reverse proxy.' },
		{ term: 'X-Forwarded-For', def: 'Un en-tête de requête qui contient une liste d’adresses séparées par des virgules. Chaque proxy y ajoute l’adresse du pair qui lui a envoyé la requête : la dernière entrée vient donc du proxy le plus proche.' },
		{ term: 'Proxy de confiance', def: 'Une adresse que tu déclares comme l’un de tes proxies, par exemple `set_real_ip_from 10.0.1.0/24;` dans nginx. L’en-tête n’est lu que sur une requête arrivée d’un proxy de confiance.' },
		{ term: 'Forwarded', def: 'L’en-tête standard de la RFC 7239, qui porte les mêmes informations dans un seul champ : `Forwarded: for=192.0.2.43;proto=https;by=203.0.113.60`.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['c["Client 198.51.100.23"] -->|"X-Forwarded-For : 192.168.1.100"| edge["nginx de bord 10.0.1.10"]'],
				highlight: ['c', 'edge'],
				note: 'Le client a écrit l’en-tête `X-Forwarded-For` lui-même. Le nginx de bord voit l’adresse du pair TCP dans `$remote_addr` : 198.51.100.23. L’en-tête n’est que du texte, et nginx ne le vérifie pas.'
			},
			{
				add: ['edge -->|"X-Forwarded-For : 192.168.1.100, 198.51.100.23"| inner["nginx interne 10.0.2.20"]'],
				highlight: ['edge', 'inner'],
				note: 'Le bord a `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Cette variable vaut l’en-tête reçu "with the $remote_addr variable appended to it, separated by a comma". La fausse entrée reste en tête, et la vraie adresse s’ajoute à la fin.'
			},
			{
				add: ['inner --> realip["realip : set_real_ip_from 10.0.1.0/24"]'],
				highlight: ['realip'],
				note: 'Le nginx interne reçoit la connexion de 10.0.1.10, qui est dans `10.0.1.0/24` : il lit donc l’en-tête. Il prend la dernière entrée, 198.51.100.23, et la met dans `$remote_addr`. L’entrée 192.168.1.100 ne sert jamais.'
			},
			{
				add: ['inner -->|"X-Real-IP : 198.51.100.23"| app["Appli 10.0.3.30"]', 'app -.->|"entrée la plus à gauche"| bad["192.168.1.100 : un nouveau compteur par fausse valeur"]'],
				highlight: ['app', 'bad'],
				note: 'Le nginx interne transmet l’adresse corrigée avec `proxy_set_header X-Real-IP $remote_addr;`, et une appli qui la lit limite 198.51.100.23. Si l’appli lit plutôt la première entrée de `X-Forwarded-For`, elle obtient 192.168.1.100. Le bug de Litestar venait de là : le client change de valeur à chaque requête et obtient un compteur neuf à chaque fois.'
			}
		]
	},
	example: {
		title: 'src/http/ngx_http_core_module.c : lire X-Forwarded-For en partant de la droite',
		repo: 'nginx/nginx',
		url: `${CORE}#L2896-L2938`,
		lang: 'c',
		code: `static ngx_int_t
ngx_http_get_forwarded_addr_internal(ngx_http_request_t *r, ngx_addr_t *addr,
    u_char *xff, size_t xfflen, ngx_array_t *proxies, int recursive)
{
    u_char      *p;
    ngx_addr_t   paddr;
    ngx_uint_t   found;

    found = 0;

    do {

        if (ngx_cidr_match(addr->sockaddr, proxies) != NGX_OK) {
            return found ? NGX_DONE : NGX_DECLINED;
        }

        for (p = xff + xfflen - 1; p > xff; p--, xfflen--) {
            if (*p != ' ' && *p != ',') {
                break;
            }
        }

        for ( /* void */ ; p > xff; p--) {
            if (*p == ' ' || *p == ',') {
                p++;
                break;
            }
        }

        if (ngx_parse_addr_port(r->pool, &paddr, p, xfflen - (p - xff))
            != NGX_OK)
        {
            return found ? NGX_DONE : NGX_DECLINED;
        }

        *addr = paddr;
        found = 1;
        xfflen = p - 1 - xff;

    } while (recursive && p > xff);

    return NGX_OK;
}`,
		notes: [
			'Le [module realip](' + REALIP + '#L229-L235) appelle cette fonction avec `addr` égal à l’adresse du pair de la connexion et `proxies` égal à la liste `set_real_ip_from`.',
			'La ligne 13 compare l’adresse courante à la liste de confiance. Si le pair TCP n’y est pas, la fonction renvoie `NGX_DECLINED` dès le premier tour, et nginx ignore l’en-tête.',
			'Les lignes 17 à 28 partent de la fin de l’en-tête, sautent les espaces et virgules finales, puis reculent jusqu’à la virgule précédente. Elles isolent ainsi la dernière entrée de la liste, que la ligne 30 analyse comme une adresse.',
			'La ligne 36 remplace `addr` par cette entrée. Avec `real_ip_recursive on`, la ligne 40 boucle : la nouvelle adresse repasse le test de la ligne 13. La lecture s’arrête à la première entrée qui n’est pas un proxy de confiance.'
		]
	},
	tradeoff: {
		gain: [
			'L’appli journalise et limite l’adresse du client, 198.51.100.23, au lieu de voir 10.0.1.10, le proxy, sur chaque requête.',
			'Lire depuis la droite avec une liste de confiance écarte tout ce que le client a écrit : le faux 192.168.1.100 n’arrive jamais dans `$remote_addr`.'
		],
		cost: [
			'La liste `set_real_ip_from` doit suivre tes proxies. Si le load balancer change pour une adresse hors liste, la ligne 13 renvoie `NGX_DECLINED` et toutes les requêtes affichent de nouveau l’adresse du balancer.',
			'La RFC 7239 prévient que l’en-tête "can reveal internal structures of the network setup" et qu’il "should never be copied into response messages" (jamais recopié dans une réponse).',
			'Chaque saut doit ajouter son entrée à `X-Forwarded-For`. Un proxy qui écrase ou supprime l’en-tête perd les entrées d’avant, et un proxy qui le laisse passer tel quel laisse la valeur du client en dernière position.'
		]
	},
	task: {
		prompt: 'Un nginx interne a `set_real_ip_from 10.0.1.0/24;`, `set_real_ip_from 10.0.2.0/24;` et `real_ip_header X-Forwarded-For;`. Une requête arrive de 10.0.2.20 avec `X-Forwarded-For: 192.168.1.100, 198.51.100.23, 10.0.1.10`. Que vaut `$remote_addr` avec `real_ip_recursive off`, puis avec `real_ip_recursive on` ?',
		hint: 'Pars du pair TCP, puis lis la liste depuis la droite. Arrête-toi quand l’adresse que tu tiens n’est dans aucune plage de confiance.',
		answer: [
			'Avec `real_ip_recursive off` : le pair 10.0.2.20 est de confiance, nginx prend la dernière entrée, 10.0.1.10, et s’arrête. `$remote_addr` vaut 10.0.1.10, le proxy de bord : faux pour les journaux.',
			'Avec `real_ip_recursive on` : 10.0.1.10 est dans `10.0.1.0/24`, la boucle continue avec l’entrée suivante en partant de la droite, 198.51.100.23. Cette adresse n’est pas de confiance, la lecture s’arrête : `$remote_addr` vaut 198.51.100.23.',
			'192.168.1.100 ne sert dans aucun des deux cas. Le client l’a écrite, et la lecture s’arrête sur la première entrée hors confiance avant de l’atteindre.'
		]
	},
	quiz: [
		{
			q: 'Une appli tourne derrière nginx avec `proxy_pass http://127.0.0.1:8000;` et aucun en-tête en plus. Toutes les requêtes de son journal viennent de 127.0.0.1. Pourquoi ?',
			options: [
				'nginx ouvre sa propre connexion TCP vers l’appli, donc le pair de l’appli est nginx',
				'nginx réécrit l’adresse source de chaque paquet du client avec sa propre adresse',
				'L’appli lit `X-Forwarded-For`, que nginx remplit avec 127.0.0.1 par défaut',
				'Le client résout le nom de l’appli en 127.0.0.1 et s’y connecte en direct'
			],
			answer: 0,
			why: 'Un reverse proxy termine la connexion du client et en ouvre une nouvelle vers le backend. Le backend ne voit que cette seconde connexion, dont la source est le proxy. L’adresse du client n’arrive à l’appli que si le proxy l’ajoute dans un en-tête.'
		},
		{
			q: 'Un client en 198.51.100.23 envoie `X-Forwarded-For: 1.2.3.4` à un nginx configuré avec `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Que reçoit le backend ?',
			options: [
				'`X-Forwarded-For: 198.51.100.23`, car nginx remplace la valeur du client',
				'`X-Forwarded-For: 1.2.3.4`, car nginx transmet l’en-tête sans le changer',
				'`X-Forwarded-For: 1.2.3.4, 198.51.100.23`, la valeur du client puis le pair',
				'`X-Forwarded-For: 198.51.100.23, 1.2.3.4`, le pair puis la valeur du client'
			],
			answer: 2,
			why: '`$proxy_add_x_forwarded_for` vaut le `X-Forwarded-For` reçu, suivi d’une virgule et de `$remote_addr`. Le texte du client reste devant, et l’adresse que nginx a vue sur la socket s’ajoute à la fin.'
		},
		{
			q: 'Avec un seul nginx devant ton appli, quelle entrée de `X-Forwarded-For` un limiteur de débit doit-il utiliser ?',
			options: [
				'La première, car c’est l’adresse du client d’origine',
				'La dernière, car ton nginx l’a ajoutée depuis l’adresse de la socket',
				'N’importe quelle entrée d’une plage privée, car elle vient de ton réseau',
				'L’entrée la plus fréquente, car les fausses valeurs changent à chaque requête'
			],
			answer: 1,
			why: 'Chaque proxy ajoute l’adresse du pair qu’il a vu : la dernière entrée vient de ton nginx, et le client ne peut pas la changer. Tout ce qui précède a été envoyé par le client et peut contenir n’importe quel texte, comme l’avis Litestar l’a montré avec 192.168.1.100, .101 et .102.'
		}
	],
	recall: {
		q: 'Comment le module realip de nginx choisit-il l’adresse du client dans `X-Forwarded-For`, et qu’est-ce qui écarte une fausse entrée ?',
		a: 'Il part du pair TCP et lit la liste depuis la droite. Il prend une entrée tant que l’adresse qu’il tient est dans `set_real_ip_from`, et s’arrête à la première hors confiance : une fausse première entrée comme 192.168.1.100 n’est jamais atteinte.'
	},
	sources: [
		{ title: 'Doc nginx, module ngx_http_realip_module', url: 'https://nginx.org/en/docs/http/ngx_http_realip_module.html' },
		{ title: 'Doc nginx, module ngx_http_proxy_module', url: 'https://nginx.org/en/docs/http/ngx_http_proxy_module.html' },
		{ title: 'RFC 7239, Forwarded HTTP Extension', url: 'https://www.rfc-editor.org/rfc/rfc7239' },
		{ title: 'GHSA-hm36-ffrh-c77c, Litestar X-Forwarded-For Header Spoofing Vulnerability Enables Rate Limit Evasion', url: 'https://github.com/advisories/GHSA-hm36-ffrh-c77c' }
	]
};
