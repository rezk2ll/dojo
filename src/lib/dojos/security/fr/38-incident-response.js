const REPORT = 'https://circleci.com/blog/jan-4-2023-incident-report/';
const INSPECTOR = 'https://github.com/CircleCI-Public/CircleCI-Env-Inspector/blob/3d1b52a446e59cac978893324bd157e22f0aa2df';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'incident-response',
	part: 'En production',
	title: 'Quand l’intrusion a eu lieu',
	minutes: 10,
	hook: [
		'Le 29 décembre 2022, un client signale à CircleCI une activité OAuth GitHub suspecte. L’enquête trouve un malware sur le portable d’un ingénieur de CircleCI, compromis depuis le 16 décembre. L’antivirus ne l’a pas vu. Le malware a volé « a valid, 2FA-backed SSO session », une session SSO valide déjà passée par la 2FA, et l’attaquant s’en est servi pour atteindre la production.',
		'L’ingénieur pouvait générer des tokens d’accès à la production. L’attaquant fait une reconnaissance le 19 décembre et emporte les données le 22 : « customer environment variables, tokens, and keys ». Les données étaient chiffrées au repos, mais l’attaquant a « extracted encryption keys from a running process » : il a pris les clés dans un processus en cours d’exécution.',
		'CircleCI publie son rapport le 12 janvier 2023, avec l’heure de chaque action de réponse.'
	],
	terms: [
		{ term: 'Confinement', def: 'Les actions qui empêchent l’attaquant d’aller plus loin : couper le compte volé, couper les autres accès, remplacer les machines qui font peut-être encore tourner son code.' },
		{ term: 'Rotation', def: 'Remplacer un secret par un nouveau et révoquer l’ancien, pour qu’une copie volée ne marche plus.' },
		{ term: 'Indicateur de compromission', def: 'Une trace concrète de l’attaquant que d’autres peuvent chercher : une adresse IP, un chemin de fichier, un hash de fichier, un domaine, une action dans un log d’audit.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['mal["16 déc. : malware sur le portable d’un ingénieur"] --> cookie["Cookie de session SSO volé, 2FA déjà passée"]', 'cookie --> exfil["22 déc. : variables d’environnement, tokens et clés copiés, plus les clés de chiffrement d’un processus"]'],
				highlight: ['mal', 'cookie', 'exfil'],
				note: 'Le chemin de l’attaque. Un cookie de session est créé après le second facteur : celui qui détient le cookie saute la 2FA. Les droits de l’ingénieur ont permis à l’attaquant de créer des tokens de production et de lire les secrets des clients.'
			},
			{
				add: ['alert["29 déc. : un client signale une activité OAuth GitHub suspecte"] --> rot1["31 déc. 04:00 : début de la rotation de tous les tokens OAuth GitHub"]'],
				highlight: ['alert', 'rot1'],
				note: 'La détection est venue de l’extérieur, 7 jours après l’exfiltration. Le 30 décembre, CircleCI confirme que le token du client a été compromis. Le 31, l’entreprise lance la rotation du token OAuth GitHub de chaque client, sans connaître encore l’étendue de l’attaque.'
			},
			{
				add: ['rot1 --> contain["4 janv. : 16:35 employé coupé, 18:30 presque tous les accès prod coupés, 22:30 toutes les machines exposées remplacées"]'],
				highlight: ['contain'],
				note: 'Le confinement arrive le 4 janvier, une fois le point d’entrée connu. En 6 heures, CircleCI coupe le compte compromis, puis l’accès à la production de presque tous les employés, puis remplace chaque machine de production peut-être exposée. Le rapport explique la coupure générale : « to limit the potential surface area ».'
			},
			{
				add: ['contain --> tell["5 janv. 02:30 : e-mails, billet de blog, réseaux sociaux, forum, article de support"]'],
				highlight: ['tell'],
				note: 'L’annonce part 4 heures après le remplacement des machines, sur tous les canaux à la fois. Elle demande à chaque client de faire tourner tous les secrets stockés chez CircleCI : « OAuth tokens, Project API Tokens, SSH keys, and more ».'
			},
			{
				add: ['tell --> revoke["5 au 7 janv. : tokens Project API, Personal API, Bitbucket et OAuth GitHub révoqués ou renouvelés"]'],
				highlight: ['revoke'],
				note: 'CircleCI révoque les secrets qu’il contrôle : tous les Project API Tokens à 03:26 le 5 janvier, les Personal API Tokens créés avant le 5 janvier à 05:00 le 6. La rotation OAuth GitHub lancée le 31 décembre se termine à 07:30 le 7 janvier.'
			},
			{
				add: ['revoke --> ioc["Rapport du 12 janv. : 8 IP, fournisseurs VPN, chemins de fichiers, un SHA256, un domaine, repo.download_zip"]'],
				highlight: ['ioc'],
				note: 'Le rapport donne aux clients des indicateurs de compromission à chercher dans leurs propres logs : les IP de l’attaquant, ses data centers et fournisseurs VPN, les noms de fichiers du malware et un hash, un domaine à bloquer, et l’action `repo.download_zip` du log d’audit GitHub.'
			}
		]
	},
	example: {
		title: 'src/utils/CircleCI.ts : l’outil publié par CircleCI pour lister chaque secret à faire tourner',
		repo: 'CircleCI-Public/CircleCI-Env-Inspector',
		url: `${INSPECTOR}/src/utils/CircleCI.ts#L208-L293`,
		lang: 'typescript',
		code: `  async getContexts(orgID: string, slug: string) {
    const errors: ContextVariableError[] = [];
    printMessage("...", "Fetching contexts");
    const contextsReport: CircleCIContext[] = [];
    const contexts = await this._getPaginated<CircleCIAPIContext>(
      \`\${CircleCI.endpoint.v2}/context?owner-id=\${orgID}\`
    ).catch((e) => {
…
    });
    printMessage(\`\${contexts.length}\`, "Contexts found:");

    for (let i = 0; i < contexts.length; i++) {
…
      const variables: CircleCIAPIContextVariable[] =
        await this._getPaginated<CircleCIAPIContextVariable>(
          \`\${CircleCI.endpoint.v2}/context/\${contexts[i].id}/environment-variable\`
        ).catch((e) => {
          const error = getAxiosError(e);
          printAxiosError(error, 2);
          printWarning("Skipping context variables", 2);
          errors.push({
            contextName: contexts[i].name,
            url: this.getContextUrl(slug, contexts[i].id),
            error: createMinimalAxiosError(error),
          });
          return [];
        });
      contextsReport.push({
        ...contexts[i],
        url: this.getContextUrl(slug, contexts[i].id),
        variables: variables,
      });
    }
    return {
      errors,
      contextsReport,
    };
  }
…
type CircleCIAPIContextVariable = {
  variable: string;
  context_id: string;
  created_at: string;
  updated_at: string;
};`,
		notes: [
			'Le premier appel liste tous les contexts de l’organisation, et la boucle liste les variables de chacun. La sortie contient les noms des variables et des dates. Le [README](' + INSPECTOR + '/README.md) précise : « CircleCI _does not_ return the values of secrets through their APIs ». Les valeurs ne sortent jamais.',
			'Le champ `updated_at` du dernier type sert au client à vérifier sa rotation. Le rapport dit que CircleCI l’a ajouté à l’API Contexts « so that customers can verify the successful rotation of these variables ». Une variable dont `updated_at` date d’avant le 5 janvier 2023 contient encore une valeur que l’attaquant a peut-être.',
			'Un context en échec n’arrête pas l’outil : `errors.push` note son nom et son URL, et la boucle continue. Selon le README, un 403 peut vouloir dire que tu as eu accès au projet « at one point in the past » : chaque erreur est un context à vérifier à la main.',
			'Le dépôt a été créé le 5 janvier 2023, le jour des e-mails d’annonce. Le rapport le cite : « A script for secret finding in order to create an actionable list for secrets rotation. »'
		]
	},
	tradeoff: {
		gain: [
			'Couper l’accès à la production de presque tous les employés à 18:30 a fermé les autres chemins, alors que CircleCI n’avait aucune preuve que d’autres comptes étaient touchés.',
			'Remplacer chaque machine de production exposée a écarté « the potential of a lingering corrupted host » avant l’annonce.',
			'Les IP, le hash de fichier et l’action `repo.download_zip` publiés ont permis à chaque client de chercher le même attaquant dans ses propres logs.'
		],
		cost: [
			'La rotation OAuth GitHub a duré du 31 décembre 04:00 au 7 janvier 07:30. CircleCI a travaillé avec GitHub pour relever ses limites d’API, et la rotation a quand même pris une semaine.',
			'CircleCI ne voyait pas l’usage des secrets volés dans les autres systèmes : « there is no way for us to know ». Chaque client a dû faire sa rotation et son enquête lui-même.',
			'L’annonce est arrivée 6 jours après le premier signalement d’un client. Le rapport parle d’un équilibre entre « speed in sharing information » et « maintaining the integrity of our investigation ».'
		]
	},
	task: {
		prompt: 'Nous sommes le 5 janvier 2023, 03:00 UTC. Tu lis l’annonce de CircleCI. Ton context CircleCI `deploy` contient `AWS_ACCESS_KEY_ID` et `AWS_SECRET_ACCESS_KEY`, `NPM_TOKEN` et une deploy key GitHub. Écris tes prochaines actions dans l’ordre, la période que tu vas fouiller et les traces que tu vas chercher.',
		hint: 'Le rapport dit de supposer que les secrets ont été lus. Quelle est la date la plus ancienne du rapport, et quelle date termine ton exposition ?',
		answer: [
			'D’abord la rotation, dans cet ordre pour chaque secret : créer le nouveau, le mettre dans le context `deploy`, révoquer l’ancien. La clé AWS, le token npm, puis supprimer la deploy key GitHub et en ajouter une nouvelle. N’attends pas la preuve d’un usage : le rapport dit « assume they have been accessed ».',
			'Vérifie la rotation : liste le context avec l’Env Inspector et contrôle que chaque variable a un `updated_at` postérieur au 5 janvier 2023.',
			'Fouille du 16 décembre 2022, date de la compromission du portable, jusqu’à la fin de ta rotation. Le rapport donne la même période.',
			'Cherche dans les logs AWS, npm et GitHub les 8 adresses IP et les fournisseurs VPN du rapport, et dans le log d’audit GitHub l’action `repo.download_zip`. Note chaque résultat avec son heure avant de toucher à autre chose, pour garder les preuves.'
		]
	},
	quiz: [
		{
			q: 'Le compte de l’ingénieur de CircleCI était protégé par la 2FA. Comment l’attaquant l’a-t-il contournée ?',
			options: [
				'En devinant le code à six chiffres pendant ses 30 secondes de validité',
				'En volant un cookie de session, créé après le passage du second facteur',
				'En faisant réinitialiser la 2FA par un appel de phishing au support',
				'En utilisant un token OAuth GitHub qui ne demandait aucun second facteur'
			],
			answer: 1,
			why: 'Le malware a volé « a valid, 2FA-backed SSO session ». Le SSO émet le cookie une fois le second facteur validé. Celui qui renvoie ce cookie plus tard passe pour déjà connecté, et aucun code ne lui est demandé.'
		},
		{
			q: 'Côté client, quelle période le rapport demandait-il de fouiller ?',
			options: [
				'Le 22 décembre 2022, jour de l’exfiltration, et ce jour seulement',
				'Du 29 décembre 2022, premier signalement client, au 4 janvier 2023',
				'Du 16 décembre 2022 jusqu’au jour où tu as fini ta rotation',
				'Du 19 au 22 décembre 2022, de la reconnaissance à l’exfiltration'
			],
			answer: 2,
			why: 'Le rapport recommande la période « between the date of corruption on December 16, 2022 through the date when you rotated your secrets ». Tes secrets restent utilisables par l’attaquant tant que tu ne les as pas changés : la période finit avec ta rotation.'
		},
		{
			q: 'Les secrets des clients étaient chiffrés au repos. Pourquoi étaient-ils quand même exposés ?',
			options: [
				'Le chiffrement utilisait une clé courte que l’attaquant a cassée hors ligne',
				'Les sauvegardes de la base étaient stockées sans aucun chiffrement',
				'L’attaquant a pris les clés de chiffrement dans un processus en cours',
				'Les secrets apparaissaient aussi en clair dans les logs de build'
			],
			answer: 2,
			why: 'Un service en marche garde la clé en mémoire pour déchiffrer les secrets qu’il utilise. Avec un accès à la production, l’attaquant a « extracted encryption keys from a running process » : la copie chiffrée et sa clé sont parties ensemble.'
		}
	],
	recall: {
		q: 'Dans l’incident CircleCI, quelle date ouvre la période que les clients devaient fouiller, et pourquoi celle-là ?',
		a: 'Le 16 décembre 2022, jour où le malware a compromis le portable de l’ingénieur. La période se termine quand tu as fini de faire tourner tes secrets après l’alerte du 4 janvier 2023.'
	},
	sources: [
		{ title: 'CircleCI, Jan 4, 2023 security incident report', url: REPORT },
		{ title: 'CircleCI-Public/CircleCI-Env-Inspector, README', url: `${INSPECTOR}/README.md` },
		{ title: 'CircleCI-Public/CircleCI-Env-Inspector, src/utils/CircleCI.ts', url: `${INSPECTOR}/src/utils/CircleCI.ts` }
	]
};
