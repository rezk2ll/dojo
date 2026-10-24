const SK = 'https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44';
const DOCS = 'https://code.claude.com/docs/en/skills';
const POST = 'https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'skills',
	part: 'Claude Code',
	title: 'Les skills',
	minutes: 10,
	hook: [
		'Ton `CLAUDE.md` contient 180 lignes sur la façon de sortir une version : format du changelog, montée de version, tag, publication. Tu publies le premier lundi du mois, et pourtant ces 180 lignes se chargent à chaque session, y compris les 30 où tu corriges juste une coquille.',
		'La doc des skills : "Unlike CLAUDE.md content, a skill\'s body loads only when it\'s used". **Un skill est un dossier avec un fichier `SKILL.md`, et tant qu’il ne sert pas, seuls son nom et sa description occupent le contexte.**'
	],
	terms: [
		{ term: 'Skill', def: 'Un dossier comme `.claude/skills/release/` qui contient un fichier `SKILL.md` : un en-tête YAML, puis des instructions en Markdown. Tu lances celui-ci en tapant `/release`.' },
		{ term: 'Description', def: 'Le champ `description` de l’en-tête. Claude le lit au démarrage et s’en sert pour décider quand charger le skill.' },
		{ term: 'Chargement progressif', def: 'Le chargement d’un skill en trois niveaux : nom et description au démarrage, corps de `SKILL.md` quand le skill sert, autres fichiers du dossier seulement quand Claude les ouvre (progressive disclosure en anglais).' },
		{ term: 'disable-model-invocation', def: 'Le champ d’en-tête qui décide si Claude peut lancer le skill lui-même. Avec `true`, toi seul le lances en tapant `/nom`, et sa description reste hors du contexte.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['start["Début de session"] --> list["Liste des skills : nom et description de chacun"]'],
				highlight: ['start', 'list'],
				note: 'Au démarrage, Claude Code place une liste des skills dans le contexte : tous les noms, et les descriptions tant que le budget le permet. La doc : "The budget scales at 1% of the model\'s context window." Chaque entrée, `description` plus `when_to_use`, est coupée à 1 536 caractères.'
			},
			{
				add: ['user["Toi : remplis le formulaire de lease.pdf"] --> match["Claude reconnaît la description de pdf"]', 'list --> match', 'match --> body["Claude lit pdf/SKILL.md"]'],
				highlight: ['user', 'match', 'body'],
				note: 'Ta demande cite un fichier `.pdf`, et la description du skill pdf dit de s’en servir dans ce cas. Claude charge le skill, et le `SKILL.md` rendu entre dans la conversation sous forme d’un seul message. Il y reste pour les tours suivants, et Claude Code ne relit pas le fichier.'
			},
			{
				add: ['body -->|"SKILL.md : lis FORMS.md"| forms["forms.md, lu seulement pour un formulaire"]', 'body -.->|"inutile ici"| ref["reference.md reste sur le disque"]'],
				highlight: ['forms', 'ref'],
				note: 'Le corps renvoie à d’autres fichiers du dossier. Le billet d’ingénierie d’Anthropic sur les skills explique que l’auteur a sorti le remplissage de formulaires dans `forms.md`, "trusting that Claude will read forms.md only when filling out a form". `reference.md` ne coûte aucun token dans cette session.'
			},
			{
				add: ['forms --> script["scripts/ : exécutés, seule la sortie compte"]'],
				highlight: ['script'],
				note: 'Les scripts du dossier sont faits pour être exécutés, et seule leur sortie entre dans le contexte. Dans l’arborescence de la doc, `scripts/helper.py` est marqué "executed, not loaded". Le skill `webapp-testing` demande à Claude de lancer ses scripts avec `--help` d’abord, sans lire leur code.'
			},
			{
				add: ['body -->|"/compact"| keep["5 000 premiers tokens de chaque skill récent rattachés"]'],
				highlight: ['keep'],
				note: 'Quand la conversation est compactée, Claude Code rattache après le résumé le dernier appel de chaque skill. Il garde les 5 000 premiers tokens de chacun, avec 25 000 tokens pour tous les skills ensemble, en partant du plus récent. Un skill utilisé tôt dans une longue session peut disparaître.'
			}
		]
	},
	example: {
		title: 'skills/pdf/SKILL.md dans anthropics/skills : l’en-tête et le premier écran',
		repo: 'anthropics/skills',
		url: `${SK}/skills/pdf/SKILL.md#L1-L26`,
		lang: 'markdown',
		code: `---
name: pdf
description: Use this skill whenever the user wants to do anything with PDF files. This includes reading or extracting text/tables from PDFs, combining or merging multiple PDFs into one, splitting PDFs apart, rotating pages, adding watermarks, creating new PDFs, filling PDF forms, encrypting/decrypting PDFs, extracting images, and OCR on scanned PDFs to make them searchable. If the user mentions a .pdf file or asks to produce one, use this skill.
license: Proprietary. LICENSE.txt has complete terms
---

# PDF Processing Guide

## Overview

This guide covers essential PDF processing operations using Python libraries and command-line tools. For advanced features, JavaScript libraries, and detailed examples, see REFERENCE.md. If you need to fill out a PDF form, read FORMS.md and follow its instructions.

## Quick Start

\`\`\`python
from pypdf import PdfReader, PdfWriter

# Read a PDF
reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

# Extract text
text = ""
for page in reader.pages:
    text += page.extract_text()
\`\`\``,
		notes: [
			'Les lignes 2 et 3 sont la seule partie présente dans le contexte avant que le skill serve. La description liste des tâches ("merging", "filling PDF forms", "OCR") et finit par un déclencheur : "If the user mentions a .pdf file or asks to produce one, use this skill."',
			'La ligne 11 est le troisième niveau. Elle envoie Claude vers `REFERENCE.md` pour les fonctions avancées, et vers `FORMS.md` seulement "If you need to fill out a PDF form". Ces fichiers sont à côté de `SKILL.md` et ne se chargent que quand Claude les ouvre.',
			'Le `SKILL.md` complet fait 314 lignes. La doc demande de rester "under 500 lines" et de sortir la référence détaillée dans d’autres fichiers, comme le fait ce skill.',
			'Le [skill webapp-testing](' + SK + '/skills/webapp-testing/SKILL.md#L14) dit que ses scripts "exist to be called directly as black-box scripts rather than ingested into your context window" : Claude les appelle sans les lire.'
		]
	},
	tradeoff: {
		gain: [
			'Une procédure de sortie de 180 lignes ne coûte qu’une ligne de description dans les 30 sessions sans publication.',
			'Les fichiers à côté de `SKILL.md` ne coûtent rien tant que Claude ne les ouvre pas : un skill peut embarquer une longue référence d’API.',
			'Avec `disable-model-invocation: true` sur `/deploy`, un déploiement ne part que si tu tapes `/deploy`, jamais parce que Claude a jugé le code prêt.'
		],
		cost: [
			'Claude ne charge un skill que si ta demande correspond à sa description. Une description sans les mots que les gens emploient laisse le skill inutilisé.',
			'Avec beaucoup de skills, la liste dépasse son budget de 1 % et Claude Code retire des descriptions, en commençant par les skills que tu lances le moins.',
			'Les `allowed-tools` d’un skill commité dans un dépôt s’appliquent même dans un `-p` lancé dans un dossier que tu n’as jamais approuvé : lis-les avant de lancer Claude Code dedans.'
		]
	},
	task: {
		prompt: 'Sors la procédure de 180 lignes de `CLAUDE.md` et mets-la dans un skill. Elle monte la version avec `npm version`, écrit `CHANGELOG.md` dans un format fixe décrit sur 120 de ces lignes, pose un tag et lance `npm publish`. Écris l’arborescence du dossier et l’en-tête de `SKILL.md`.',
		hint: 'Claude doit-il pouvoir lancer `npm publish` tout seul parce que le code a l’air prêt ? De quelles 120 lignes Claude n’a-t-il besoin que pendant l’écriture du changelog ?',
		answer: [
			'Arborescence : `.claude/skills/release/SKILL.md` avec les étapes en 40 lignes environ, et `.claude/skills/release/changelog-format.md` avec les 120 lignes de format. `SKILL.md` dit « Avant d’écrire CHANGELOG.md, lis changelog-format.md ».',
			'En-tête : `name: release`, `description: Cut a release: bump the version, update CHANGELOG.md, tag and publish to npm. Use when the user asks to release or publish.`, `disable-model-invocation: true`.',
			'`disable-model-invocation: true` réserve `npm publish` au moment où tu tapes `/release`. La description sort aussi de la liste, donc le skill ne coûte aucun contexte tant que tu ne le lances pas.',
			'En option : `allowed-tools: Bash(npm version *) Bash(git tag *)` laisse ces commandes tourner sans demande, pendant le tour de `/release` seulement. `npm publish` reste en dehors et demande toujours. Supprime les 180 lignes de `CLAUDE.md`.'
		],
		steps: [
			{
				title: 'Organise le dossier',
				questions: [
					{ q: 'Où vit le skill de release ?', options: ['Dans `.claude/release.md`', 'Sous un titre `## Release` dans `CLAUDE.md`', 'Dans `.claude/skills/release/SKILL.md`', 'Dans `.claude/rules/release.md`'], answer: 2, why: 'Un skill est un dossier sous `.claude/skills/` qui contient un fichier `SKILL.md`.' },
					{ q: 'Où vont les 120 lignes de format du changelog ?', options: ['Dans `changelog-format.md`, à côté de `SKILL.md`', 'Dans le corps de `SKILL.md`', 'Elles restent dans `CLAUDE.md`', 'Dans le champ `description`'], answer: 0, why: 'Claude n’en a besoin que pendant l’écriture du changelog, donc elles vont dans un fichier à part.' },
					{ q: 'Sous quelle longueur la doc demande-t-elle de garder `SKILL.md` ?', options: ['40 lignes', '500 lignes', '180 lignes', '1 536 lignes'], answer: 1, why: 'La doc demande "under 500 lines" et de sortir la documentation longue dans des fichiers à part. Les étapes de release tiennent en 40 lignes environ.' },
					{ q: 'Comment Claude sait-il qu’il doit l’ouvrir ?', options: ['Par une ligne d’import `@changelog-format.md`', 'Par un champ `paths:` dans l’en-tête', 'Claude Code ouvre tous les fichiers du dossier', '`SKILL.md` dit « Avant d’écrire CHANGELOG.md, lis changelog-format.md »'], answer: 3, why: 'Le corps renvoie vers le fichier, comme le skill pdf le fait avec « read FORMS.md ».' }
				]
			},
			{
				title: 'Écris l’en-tête',
				questions: [
					{ q: 'Quel `name` te donne la commande `/release` ?', options: ['`SKILL`', '`release`', '`release-procedure.md`', '`CLAUDE.release`'], answer: 1, why: 'Le skill de `.claude/skills/release/` s’appelle `release`, et tu le lances en tapant `/release`.' },
					{ q: 'Que met-on dans la `description` ?', options: ['Les 40 lignes d’étapes', 'Le numéro de version actuel', 'Ce que fait le skill et quand s’en servir', 'Les termes de la licence'], answer: 2, why: 'La description est ce que Claude lit pour décider quand un skill s’applique.' },
					{ q: 'Dans la liste, où sont coupés la `description` et le `when_to_use` de chaque entrée ?', options: ['À 500 lignes', 'À 5 000 tokens', 'À 1 % de la fenêtre de contexte', 'À 1 536 caractères'], answer: 3, why: 'Chaque entrée est coupée à 1 536 caractères. Le 1 %, c’est le budget de toute la liste.' },
					{ q: 'Quel champ réserve `npm publish` à toi seul ?', options: ['`disable-model-invocation: true`', '`allowed-tools: Bash(npm publish *)`', '`license`', '`when_to_use`'], answer: 0, why: 'Avec ce champ, toi seul peux lancer le skill.' }
				]
			},
			{
				title: 'Garde la publication en main',
				questions: [
					{ q: 'Pourquoi ne pas omettre ce champ et écrire « seulement quand l’utilisateur le demande » dans la description ?', options: ['Une description ne peut pas parler de l’utilisateur', 'La description serait coupée à 40 caractères', 'Claude lit la description, donc il peut quand même lancer le skill s’il juge le code prêt', 'Alors `/release` ne marcherait plus'], answer: 2, why: 'Une description ne fait qu’orienter le choix de Claude. C’est le champ qui lui retire ce choix.' },
					{ q: 'Que devient sa description dans la liste des skills ?', options: ['Elle se charge en entier', 'Elle reste hors du contexte', 'Elle est coupée à 1 536 caractères', 'Elle part dans `CLAUDE.md`'], answer: 1, why: 'Avec ce champ, la description reste hors du contexte.' },
					{ q: 'Tu as lancé `/release` tôt dans une longue session, puis la conversation est compactée. Que reste-t-il du skill ?', options: ['Rien : un skill ne survit jamais au compactage', 'Tout `SKILL.md` et `changelog-format.md`', 'Seulement sa description', 'Jusqu’à ses 5 000 premiers tokens, rattachés après le résumé'], answer: 3, why: 'Claude Code rattache l’invocation la plus récente de chaque skill, jusqu’à 5 000 tokens chacun et 25 000 en tout, du plus récent au plus ancien. Un skill utilisé tôt peut quand même tomber.' },
					{ q: 'Avec ce champ, combien de contexte le skill prend-il avant que tu tapes `/release` ?', options: ['Aucun', 'Une ligne de description', 'Les 40 lignes d’étapes', 'Les 180 lignes'], answer: 0, why: 'La description est hors de la liste, donc rien ne se charge avant que tu le lances.' }
				]
			},
			{
				title: 'Donne les outils, puis fais le ménage',
				questions: [
					{ q: 'Que fait `allowed-tools: Bash(npm version *) Bash(git tag *)` ?', options: ['Il autorise ces commandes pour le reste de la session', 'Il les laisse tourner sans demande pendant le tour de `/release`', 'Il les enregistre dans `.claude/settings.local.json`', 'Il interdit tous les autres outils'], answer: 1, why: 'L’autorisation vaut pendant le tour qui invoque le skill.' },
					{ q: '`npm publish` demande-t-il encore pendant `/release` ?', options: ['Non, le skill approuve toutes les étapes', 'Non, `npm version` le couvre', 'Oui, il n’est pas dans `allowed-tools`', 'Seulement à la première release'], answer: 2, why: 'Le laisser dehors garde une demande sur l’étape qu’on ne peut pas défaire.' },
					{ q: 'Le skill est commité. Un collègue lance `claude -p` dans un clone neuf auquel il n’a jamais fait confiance. `allowed-tools` s’y applique-t-il ?', options: ['Oui, donc il doit le relire avant d’y lancer Claude Code', 'Non, un dossier non approuvé ignore les skills', 'Non, un lancement `-p` n’a pas de skills', 'Seulement après qu’il a accepté la fenêtre de confiance'], answer: 0, why: 'La doc prévient que `allowed-tools` dans un skill commité s’applique même dans un lancement `-p` dans un dossier jamais approuvé.' },
					{ q: 'Quelle est la dernière étape du déménagement ?', options: ['Garder les 180 lignes en secours', 'Importer le skill depuis `CLAUDE.md`', 'Déplacer les lignes dans `CLAUDE.local.md`', 'Supprimer les 180 lignes de `CLAUDE.md`'], answer: 3, why: 'Laissées en place, elles se chargeraient encore à chaque session, et c’est ce que le déménagement devait éviter.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu as un skill de projet avec un en-tête par défaut. Avant que tu tapes quoi que ce soit, qu’est-ce qui est dans le contexte ?',
			options: [
				'Tout le corps de `SKILL.md`, pour que Claude puisse le suivre tout de suite',
				'Son nom et sa description, dans la liste des skills',
				'Rien, tant que tu ne tapes pas son nom avec une barre oblique',
				'Le corps et chaque fichier du dossier, compressés'
			],
			answer: 1,
			why: 'Par défaut, la description est toujours dans le contexte et le skill complet se charge à l’appel. Les fichiers à côté de `SKILL.md` ne se chargent que quand Claude les ouvre, ce qui rend les skills inutilisés presque gratuits.'
		},
		{
			q: 'Un skill `deploy` a `disable-model-invocation: true`. Tu réponds « c’est bon, livre » sans commande slash. Que fait Claude ?',
			options: [
				'Il lance le skill deploy, car la demande lui correspond',
				'Il lit `SKILL.md` et te demande de valider chaque étape',
				'Il ne peut pas lancer le skill seul et te propose `/deploy`',
				'Il recopie les étapes du déploiement en commandes Bash et les lance'
			],
			answer: 2,
			why: 'Avec `disable-model-invocation: true`, la description n’est pas dans le contexte et Claude ne peut pas appeler le skill. S’il essaie quand même, Claude Code bloque l’appel et lui dit de ne pas refaire les étapes autrement.'
		},
		{
			q: 'Un skill a `allowed-tools: Bash(git commit *)`. Tu le lances, Claude fait un commit, puis tu envoies un autre message. Le `git commit` suivant demande-t-il ton accord ?',
			options: [
				'Non, l’autorisation dure jusqu’à la fin de la session',
				'Non, l’autorisation est enregistrée dans `.claude/settings.local.json`',
				'Oui, sauf si le skill est relancé ou qu’une règle allow le couvre',
				'Oui, car `allowed-tools` ne fait que restreindre les outils'
			],
			answer: 2,
			why: 'L’autorisation `allowed-tools` vaut pendant le tour qui lance le skill et s’efface quand tu envoies ton message suivant, même si le texte du skill reste dans le contexte. Pour toute la session, il faut une règle allow dans les réglages.'
		}
	],
	recall: {
		q: 'Quelle partie d’un skill est dans le contexte au démarrage, et quand le reste se charge-t-il ?',
		a: 'Seulement le nom et la description, dans une liste limitée à 1 % de la fenêtre de contexte. Le corps de `SKILL.md` se charge quand le skill est appelé, et les fichiers comme `forms.md` seulement quand Claude les ouvre.'
	},
	sources: [
		{ title: 'Doc Claude Code, Extend Claude with skills, lue le 2026-10-17', url: DOCS },
		{ title: 'Anthropic engineering, Equipping agents for the real world with Agent Skills', url: POST },
		{ title: 'anthropics/skills, skills/pdf/SKILL.md', url: `${SK}/skills/pdf/SKILL.md` },
		{ title: 'anthropics/skills, skills/webapp-testing/SKILL.md', url: `${SK}/skills/webapp-testing/SKILL.md` }
	]
};
