const COOK = 'https://github.com/anthropics/claude-cookbooks/blob/b2b0aa1ff7d8980b005b225d3802969c87bedad5';
const LEAD = `${COOK}/patterns/agents/prompts/research_lead_agent.md`;
const POST = 'https://www.anthropic.com/engineering/multi-agent-research-system';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'subagents',
	part: 'Outils et agents',
	title: 'Répartir le travail entre plusieurs agents',
	minutes: 10,
	hook: [
		'Tu demandes à un agent la liste des membres du conseil d’administration de chaque entreprise du secteur Information Technology du S&P 500. Il cherche une entreprise, lit les résultats, puis passe à la suivante, une recherche après l’autre.',
		'Le billet d’Anthropic sur sa fonction Research prend exactement cette requête. D’après le billet, l’agent seul "failed to find the answer with slow, sequential searches", alors qu’un agent principal qui a réparti la liste entre des sous-agents "found the correct answers".',
		'Le même billet indique qu’un système multi-agents consomme environ 15 fois les tokens d’un chat.'
	],
	terms: [
		{ term: 'Orchestrateur', def: 'L’agent principal : il planifie la tâche, lance des sous-agents avec une description de tâche écrite pour chacun, et rédige la réponse finale à partir de leurs retours.' },
		{ term: 'Sous-agent', def: 'Un agent travailleur lancé par l’orchestrateur pour une sous-tâche. Il fait tourner sa propre boucle d’outils et renvoie un résultat court.' },
		{ term: 'Isolation du contexte', def: 'Chaque sous-agent a sa propre fenêtre de contexte. Ses recherches et ses pages lues y restent ; seul son résultat final entre dans le contexte de l’orchestrateur.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['q["Requête : conseils d’administration des entreprises IT du S&P 500"] --> lead["Agent principal : réfléchit, écrit un plan"]', 'lead --> mem[("Mémoire : le plan")]'],
				highlight: ['lead', 'mem'],
				note: 'L’agent principal planifie d’abord et enregistre son plan dans une mémoire externe. Le billet donne la raison : "if the context window exceeds 200,000 tokens it will be truncated and it is important to retain the plan." Le plan nomme les sous-tâches et le nombre de sous-agents à lancer.'
			},
			{
				add: ['lead -->|"tâche 1 sur 3"| s1["Sous-agent 1"]', 'lead -->|"tâche 2 sur 3"| s2["Sous-agent 2"]', 'lead -->|"tâche 3 sur 3"| s3["Sous-agent 3"]'],
				highlight: ['s1', 's2', 's3'],
				note: 'L’agent principal lance les sous-agents en parallèle, 3 à 5 à la fois dans le système Research. Chacun reçoit "an objective, an output format, guidance on the tools and sources to use, and clear task boundaries". Ici, chacun pourrait prendre un tiers de la liste des entreprises.'
			},
			{
				add: ['s1 --> w1["Contexte propre : ses recherches et les pages lues"]', 'w1 -->|"une liste de noms"| lead'],
				highlight: ['w1'],
				note: 'Chaque sous-agent cherche, lit des pages et réfléchit entre deux résultats d’outil, le tout dans sa propre fenêtre de contexte. Il renvoie la liste des noms, sans les pages lues. Le billet parle de compression : les sous-agents explorent "before condensing the most important tokens for the lead research agent".'
			},
			{
				add: ['lead -->|"des trous"| s4["Sous-agent 4 : les entreprises manquantes"]', 'lead -->|"assez"| cite["CitationAgent : ajoute les sources"]', 'cite --> out["Réponse avec citations"]'],
				highlight: ['s4', 'cite'],
				note: 'L’agent principal lit les résultats. S’il manque des entreprises, il lance d’autres sous-agents. Quand il en a assez, un CitationAgent séparé rattache chaque affirmation du rapport à un endroit précis des sources.'
			}
		]
	},
	example: {
		title: 'claude-cookbooks : le prompt de l’agent principal du système Research',
		repo: 'anthropics/claude-cookbooks',
		url: `${LEAD}#L71-L115`,
		lang: 'markdown',
		code: `<subagent_count_guidelines>
When determining how many subagents to create, follow these guidelines: 
1. **Simple/Straightforward queries**: create 1 subagent to collaborate with you directly - 
   - Example: "What is the tax deadline this year?" or “Research bananas” → 1 subagent
   - Even for simple queries, always create at least 1 subagent to ensure proper source gathering
2. **Standard complexity queries**: 2-3 subagents
   - For queries requiring multiple perspectives or research approaches
   - Example: "Compare the top 3 cloud providers" → 3 subagents (one per provider)
3. **Medium complexity queries**: 3-5 subagents
   - For multi-faceted questions requiring different methodological approaches
   - Example: "Analyze the impact of AI on healthcare" → 4 subagents (regulatory, clinical, economic, technological aspects)
4. **High complexity queries**: 5-10 subagents (maximum 20)
   - For very broad, multi-part queries with many distinct components 
   - Identify the most effective algorithms to efficiently answer these high-complexity queries with around 20 subagents. 
   - Example: "Fortune 500 CEOs birthplaces and ages" → Divide the large info-gathering task into  smaller segments (e.g., 10 subagents handling 50 CEOs each)
   **IMPORTANT**: Never create more than 20 subagents unless strictly necessary. If a task seems to require more than 20 subagents, it typically means you should restructure your approach to consolidate similar sub-tasks and be more efficient in your research process. Prefer fewer, more capable subagents over many overly narrow ones. More subagents = more overhead. Only add subagents when they provide distinct value.
</subagent_count_guidelines>
…
3. **Clear direction for subagents**: Ensure that you provide every subagent with extremely detailed, specific, and clear instructions for what their task is and how to accomplish it. Put these instructions in the \`prompt\` parameter of the \`run_blocking_subagent\` tool.
* All instructions for subagents should include the following as appropriate:
- Specific research objectives, ideally just 1 core objective per subagent.
- Expected output format - e.g. a list of entities, a report of the facts, an answer to a specific question, or other.
- Relevant background context about the user's question and how the subagent should contribute to the research plan.
- Key questions to answer as part of the research.
- Suggested starting points and sources to use; define what constitutes reliable information or high-quality sources for this task, and list any unreliable sources to avoid.
- Specific tools that the subagent should use - i.e. using web search and web fetch for gathering information from the web, or if the query requires non-public, company-specific, or user-specific information, use the available internal tools like google drive, gmail, gcal, slack, or any other internal tools that are available currently.
- If needed, precise scope boundaries to prevent research drift.
* Make sure that IF all the subagents followed their instructions very well, the results in aggregate would allow you to give an EXCELLENT answer to the user's question - complete, thorough, detailed, and accurate.`,
		notes: [
			'Les lignes 1 à 17 fixent le nombre de sous-agents selon le type de requête, de 1 pour un fait simple jusqu’à un plafond de 20. Le [billet](' + POST + ') explique pourquoi le prompt l’écrit noir sur blanc : les premiers agents faisaient des erreurs "like spawning 50 subagents for simple queries".',
			'La ligne 16 demande de "consolidate similar sub-tasks" quand un plan exige plus de 20 sous-agents. Chaque sous-agent est une boucle d’outils complète qui dépense ses propres tokens.',
			'Les lignes 21 à 27 listent le contenu de chaque description de tâche : un objectif, un format de sortie, le contexte, les sources, les outils et les limites du périmètre. Le billet montre l’échec qu’elles évitent : avec « research the semiconductor shortage », 2 sous-agents ont refait la même recherche sur les chaînes d’approvisionnement de 2025.',
			'La ligne 19 nomme l’outil appelé par l’agent principal, `run_blocking_subagent`. Bloquant veut dire que l’agent principal attend la fin du sous-agent. Le billet en donne le prix : "the lead agent can\'t steer subagents, subagents can\'t coordinate", et un seul sous-agent lent peut bloquer tout le run.'
		]
	},
	tradeoff: {
		gain: [
			'Sur l’éval de recherche interne d’Anthropic, un agent principal Claude Opus 4 avec des sous-agents Claude Sonnet 4 a fait 90,2 % de mieux que Claude Opus 4 seul.',
			'Lancer 3 à 5 sous-agents en parallèle, chacun avec 3 outils ou plus en parallèle, a "cut research time by up to 90% for complex queries".',
			'Le contexte de l’agent principal ne contient que des plans et des résultats courts. Les pages lues par chaque sous-agent restent dans sa propre fenêtre de contexte.'
		],
		cost: [
			'Dans les données d’Anthropic, un agent consomme environ 4 fois les tokens d’un chat, et un système multi-agents environ 15 fois.',
			'Chaque sous-tâche doit pouvoir tourner sans les résultats des autres. Le billet : "most coding tasks involve fewer truly parallelizable tasks than research", et les tâches où tous les agents ont besoin du même contexte sont "not a good fit".',
			'Avec une description de tâche floue, les sous-agents refont les recherches des autres, et tu paies deux fois les mêmes pages.',
			'Avec des sous-agents bloquants, l’agent principal attend le plus lent et ne peut pas réorienter un sous-agent qui cherche au mauvais endroit.'
		]
	},
	task: {
		prompt: 'Deux demandes arrivent à ton agent. A : « Pour chacune de ces 12 bases de données open source, donne la licence, la dernière version et si elle a un type de colonne JSON. » B : « Pourquoi notre service de paiement part en timeout chaque vendredi à 18 h ? » Pour chacune, choisis entre un seul agent et un orchestrateur avec des sous-agents. Pour celle que tu découpes, écris la description de tâche d’un sous-agent.',
		hint: 'Demande-toi si les sous-tâches peuvent tourner sans voir les résultats des autres, puis sers-toi des règles de comptage et de la liste du contenu d’une description de tâche.',
		answer: [
			'A se découpe bien : chaque base se cherche sans rien savoir des autres. La ligne « Standard complexity » du prompt donne 2 à 3 sous-agents, donc 3 sous-agents avec 4 bases chacun.',
			'Une description de tâche : « Objectif : pour PostgreSQL, SQLite, DuckDB et ClickHouse, trouve la licence, le numéro et la date de la dernière version, et s’il existe un type de colonne JSON. Sortie : une ligne par base avec ces 4 champs et une URL source chacun. Sources : le site du projet et ses notes de version seulement. Périmètre : ces 4 bases uniquement. »',
			'B reste à un seul agent, car chaque étape dépend de la précédente : les logs mènent à une requête, la requête à un verrou, le verrou à un job du vendredi. Le billet range parmi les mauvais cas les tâches "that require all agents to share the same context or involve many dependencies between agents".',
			'Le calcul pour A : environ 15 fois les tokens d’un chat, pour un tableau que tu remplirais sinon à la main depuis 12 sites. Pour B, trois sous-agents reconstruiraient chacun de zéro la même image du service.'
		],
		steps: [
			{
				title: 'Teste l’indépendance de A',
				questions: [
					{ q: 'Quelle question décide si une demande se découpe bien entre des sous-agents ?', options: ['La demande fait-elle plus d’un paragraphe ?', 'Cite-t-elle plus de 10 éléments ?', 'Les sous-tâches peuvent-elles tourner sans voir les résultats des autres ?', 'La réponse aura-t-elle besoin de citations ?'], answer: 2, why: 'Chaque sous-agent travaille dans son propre contexte : une sous-tâche qui a besoin du résultat d’une autre ne peut pas tourner en parallèle.' },
					{ q: 'Dans A, chercher une base demande-t-il les résultats d’une autre ?', options: ['Non, chacune se cherche seule', 'Oui, les licences dépendent les unes des autres', 'Oui, il faut d’abord comparer les versions', 'Seulement pour les bases avec un type JSON'], answer: 0, why: 'La licence ou la date de version de DuckDB ne dit rien sur SQLite. Les 12 recherches sont indépendantes.' },
					{ q: 'Tu ajoutes « puis classe les 12 selon la date de leur dernière version ». Quelle partie un sous-agent ne peut-il plus faire seul ?', options: ['Trouver la licence d’une base', 'Le classement : il lui faut les 12 dates de version', 'Vérifier si une base a un type JSON', 'Trouver la dernière version d’une base'], answer: 1, why: 'Un sous-agent qui a 4 bases ne peut pas les placer parmi les 8 autres. Le classement demande tous les résultats, donc l’agent principal le fait au retour des sous-agents.' },
					{ q: 'Les 3 sous-agents de A sont prêts. Partent-ils ensemble ou l’un après l’autre ?', options: ['L’un après l’autre, chacun lisant le tableau du précédent', 'Ensemble, en parallèle', 'L’un après l’autre, pour économiser des tokens', 'Un seul tourne, les autres attendent au cas où il échoue'], answer: 1, why: 'Aucune sous-tâche n’a besoin du résultat d’une autre, donc l’agent principal peut les lancer en parallèle. C’est de là que vient le gain de temps.' }
				]
			},
			{
				title: 'Teste les dépendances de B',
				questions: [
					{ q: 'Dans B, comment s’enchaînent les étapes de l’enquête ?', options: ['Chaque étape peut tourner seule', 'Seule la première étape compte', 'Elles peuvent tourner dans n’importe quel ordre', 'Chaque étape dépend de la précédente'], answer: 3, why: 'Les logs mènent à une requête, la requête à un verrou, le verrou à un job du vendredi. Chaque indice vient du précédent.' },
					{ q: 'Quel genre de tâche le billet range-t-il parmi les mauvais cas pour un système multi-agents ?', options: ['Les tâches où tous les agents ont besoin du même contexte', 'Les tâches de plus de 5 éléments', 'Les tâches qui demandent une recherche web', 'Les tâches qui demandent un format de sortie'], answer: 0, why: 'Le billet cite les tâches "that require all agents to share the same context or involve many dependencies between agents".' },
					{ q: 'Que se passe-t-il si tu découpes B entre trois sous-agents ?', options: ['Chacun trouve un tiers de la cause', 'Chacun reconstruit de zéro la même image du service', 'L’agent principal obtient la réponse 90 % plus vite', 'Ils partagent leurs trouvailles au fil de l’eau'], answer: 1, why: 'Chaque sous-agent part d’un contexte vide : les trois refont le même travail de fond, et tu le paies trois fois.' },
					{ q: 'Avec des sous-agents bloquants, l’agent principal peut-il réorienter celui qui cherche au mauvais endroit ?', options: ['Oui, il lui envoie un message en cours de route', 'Seulement le plus lent', 'Non, il attend qu’il ait fini', 'Oui, grâce à `run_blocking_subagent`'], answer: 2, why: 'Le billet : "the lead agent can’t steer subagents". Bloquant veut dire qu’il attend.' }
				]
			},
			{
				title: 'Dimensionne le découpage de A',
				questions: [
					{ q: 'Quelle ligne des règles de comptage la réponse utilise-t-elle pour A ?', options: ['Simple : 1 sous-agent', 'Standard complexity : 2 à 3', 'Medium complexity : 3 à 5', 'High complexity : 5 à 10'], answer: 1, why: 'La réponse classe A en « Standard complexity », ce qui donne 2 à 3 sous-agents.' },
					{ q: 'Avec 3 sous-agents pour 12 bases, combien en prend chacun ?', options: ['3', '12', '6', '4'], answer: 3, why: '12 bases réparties sur 3 sous-agents, cela fait 4 chacun.' },
					{ q: 'Que dit le prompt de l’agent principal quand un plan semble demander plus de 20 sous-agents ?', options: ['Les lancer par lots de 20', 'Regrouper les sous-tâches similaires', 'Prendre un plus gros modèle pour l’agent principal', 'Demander à l’utilisateur de découper sa requête'], answer: 1, why: 'Plus de sous-agents, c’est plus de surcoût. Le prompt préfère "fewer, more capable subagents".' },
					{ q: 'Un sous-agent renvoie ses lignes sans ClickHouse. Que fait l’agent principal ?', options: ['Il lance un autre sous-agent pour la base manquante', 'Il relance les 3 sous-agents de zéro', 'Il laisse ClickHouse hors de la réponse', 'Il écrit la ligne ClickHouse de mémoire'], answer: 0, why: 'L’agent principal lit les résultats, et quand il manque quelque chose il lance d’autres sous-agents pour combler les trous.' }
				]
			},
			{
				title: 'Écris une description de tâche',
				questions: [
					{ q: 'Combien d’objectifs principaux donner à un sous-agent ?', options: ['Un par base qu’il couvre', 'Autant qu’en contient le prompt', 'Idéalement 1 seul', 'Aucun : il lit la requête de l’utilisateur'], answer: 2, why: 'Le prompt de l’agent principal demande "ideally just 1 core objective per subagent".' },
					{ q: 'Quelle ligne de l’exemple de description fixe le format de sortie ?', options: ['« Sources : le site du projet et ses notes de version seulement »', '« Sortie : une ligne par base avec ces 4 champs et une URL source chacun »', '« Périmètre : ces 4 bases uniquement »', '« Objectif : pour PostgreSQL, SQLite, DuckDB et ClickHouse, trouve la licence… »'], answer: 1, why: 'La ligne de sortie dit au sous-agent la forme exacte à renvoyer, pour que l’agent principal fusionne les trois résultats.' },
					{ q: 'Pourquoi ajouter « Périmètre : ces 4 bases uniquement » ?', options: ['Pour qu’il ne dérive pas vers les 8 autres et ne refasse pas le travail', 'Pour qu’il utilise moins d’outils', 'Pour qu’il puisse sauter la date de version', 'Parce qu’un sous-agent ne lit que 4 pages'], answer: 0, why: 'Les limites de périmètre évitent la dérive, pour que deux sous-agents ne paient pas les mêmes pages.' },
					{ q: 'Quel élément de la liste du prompt de l’agent principal remplit « Sources : le site du projet et ses notes de version seulement » ?', options: ['L’objectif principal', 'Le format de sortie attendu', 'Les points de départ et ce qui compte comme source fiable', 'Les outils que le sous-agent doit utiliser'], answer: 2, why: 'Le prompt demande des sources suggérées et une définition de l’information fiable. Les notes de version du projet lui-même sont la source fiable pour un numéro de version.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Dans l’analyse d’Anthropic sur l’éval BrowseComp, quel facteur explique à lui seul 80 % de la variance des résultats ?',
			options: [
				'Le nombre de tokens consommés par le système',
				'Le nombre de sous-agents lancés par l’agent principal',
				'La longueur du prompt de l’agent principal',
				'Le modèle qui faisait tourner les sous-agents'
			],
			answer: 0,
			why: 'Le billet : "token usage by itself explains 80% of the variance", avec le nombre d’appels d’outils et le choix du modèle comme deux autres facteurs. Les sous-agents aident surtout parce que leurs fenêtres de contexte séparées laissent le système dépenser plus de tokens sur une même question.'
		},
		{
			q: 'L’agent principal envoie « research the semiconductor shortage » à trois sous-agents. Qu’a observé Anthropic avec ce genre de consigne ?',
			options: [
				'Les sous-agents ont refusé et demandé une tâche plus étroite',
				'L’agent principal a saturé son contexte en lisant trois rapports',
				'Les sous-agents ont mal compris, et deux ont fait les mêmes recherches sur 2025',
				'Chaque sous-agent a choisi une région du monde sans qu’on le lui demande'
			],
			answer: 2,
			why: 'Une consigne courte ne donne ni objectif, ni format de sortie, ni limite, donc chaque sous-agent choisit sa propre lecture de la tâche. Dans le billet, l’un a étudié la crise des puces automobiles de 2021 pendant que deux autres refaisaient le même travail sur les chaînes d’approvisionnement de 2025.'
		},
		{
			q: 'Quelle tâche convient le moins à un orchestrateur avec des sous-agents en parallèle ?',
			options: [
				'Lister la date de sortie de 30 bibliothèques séparées',
				'Comparer les pages de tarifs de 5 fournisseurs cloud',
				'Un refactoring où chaque changement dépend du précédent',
				'Relever les CVE publiées cette année pour 10 paquets'
			],
			answer: 2,
			why: 'Des sous-agents en parallèle travaillent chacun dans leur contexte et ne voient pas les changements des autres. Une chaîne de modifications dépendantes demande un seul contexte partagé, le cas que le billet juge "not a good fit for multi-agent systems today".'
		}
	],
	recall: {
		q: 'Combien de fois les tokens d’un chat le système Research multi-agents d’Anthropic consomme-t-il environ, et que renvoie un sous-agent à l’agent principal ?',
		a: 'Environ 15 fois. Chaque sous-agent cherche dans sa propre fenêtre de contexte et ne renvoie que son résultat condensé, par exemple une liste de noms ; les pages qu’il a lues restent dans son contexte.'
	},
	sources: [
		{ title: 'Anthropic Engineering, How we built our multi-agent research system, lu le 2026-10-17', url: POST },
		{ title: 'claude-cookbooks, patterns/agents/prompts/research_lead_agent.md', url: LEAD }
	]
};
