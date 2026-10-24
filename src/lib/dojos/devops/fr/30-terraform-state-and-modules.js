const MOD = 'https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'terraform-state-and-modules',
	part: 'L’infrastructure as code',
	title: 'State, backends et modules Terraform',
	minutes: 10,
	hook: [
		'Tu as lancé `terraform apply` depuis ton portable. Un fichier est apparu à côté de ton code : `terraform.tfstate`. Ton collègue clone le repo et lance `plan`. Terraform veut **tout recréer**.',
		'Son clone n’a pas de fichier de state. Pour son Terraform, rien n’existe encore. Si vous faites un apply en même temps, les deux exécutions modifient les mêmes resources AWS sans rien savoir l’une de l’autre.',
		'Tu ranges le state là où toute l’équipe et la CI peuvent l’atteindre, avec un **verrou**. Le code du VPC que tu copiais d’un projet à l’autre part dans un module que chaque projet appelle.'
	],
	terms: [
		{ term: 'State', def: 'L’enregistrement qui relie chaque objet réel à son bloc. Un fichier JSON, `terraform.tfstate` par défaut. Ne l’édite jamais à la main.' },
		{ term: 'Backend', def: 'Là où le state est stocké. En local par défaut. Un backend distant, comme un bucket S3 ou HCP Terraform, permet à l’équipe de partager un seul state.' },
		{ term: 'Verrou de state', def: 'Si le backend gère le verrou (et qu’il est activé), Terraform le prend automatiquement à chaque opération qui pourrait écrire le state. Un deuxième `apply` attend ou échoue au lieu d’écraser le premier.' },
		{ term: 'Module', def: 'Un dossier de code Terraform que tu appelles avec un bloc `module`. Ton propre dossier est le root module, et ceux que tu appelles sont des **child modules**.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["Toi : terraform apply"] --> st["terraform.tfstate sur ton portable"]', 'mate["Collègue : terraform plan"] -.->|ne le voit pas| st'],
				highlight: ['st'],
				note: 'Un state local marche quand tu es seul. En équipe, le state vit sur **un seul portable** : ton collègue ne le voit pas, et perdre ce fichier veut dire que Terraform oublie ce qu’il a construit.'
			},
			{
				add: [
					's3b["Backend S3 : un seul state partagé, versioning du bucket activé"]',
					'lock["verrou : use_lockfile = true"]',
					'you --> s3b',
					'mate --> s3b',
					's3b --> lock'
				],
				highlight: ['s3b', 'lock'],
				note: 'Déplace le state vers un **backend distant**. Tout le monde et la CI lisent le même fichier. Avec le backend S3, le verrou est opt-in : mets `use_lockfile = true`. La table de verrou DynamoDB est dépréciée.'
			},
			{
				add: [
					'root["root module : main.tf"] --> vpcm["module vpc, version 3.18.1"]',
					'root --> ec2m["module ec2_instances, count = 2"]'
				],
				highlight: ['root', 'vpcm', 'ec2m'],
				note: 'Un **module** marche comme une fonction. Tu passes des entrées (CIDR, AZ) et tu récupères des sorties (ids de subnets). Fixe une version pour qu’une nouvelle release ne change pas ton réseau au prochain `init`.'
			},
			{
				add: [
					'con["Quelqu’un modifie un security group dans la console"]',
					'class con ext',
					'aws["Vrai AWS"]',
					'con -.-> aws',
					'aws -.->|"terraform plan -refresh-only"| s3b'
				],
				highlight: ['con', 'aws'],
				note: 'Quelqu’un a modifié AWS à la main, donc AWS ne correspond plus au state : c’est le **drift**. `terraform plan -refresh-only` montre ce qui a changé hors de Terraform sans rien toucher. Ensuite tu choisis : remettre ce que dit le code avec un `apply` normal, ou écrire le changement dans le code.'
			}
		]
	},
	example: {
		title: 'main.tf',
		repo: 'hashicorp-education/learn-terraform-modules-use',
		url: `${MOD}/main.tf#L14-L46`,
		lang: 'hcl',
		code: `module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "3.18.1"

  name = var.vpc_name
  cidr = var.vpc_cidr

  azs             = var.vpc_azs
  private_subnets = var.vpc_private_subnets
  public_subnets  = var.vpc_public_subnets

  enable_nat_gateway = var.vpc_enable_nat_gateway

  tags = var.vpc_tags
}

module "ec2_instances" {
  source  = "terraform-aws-modules/ec2-instance/aws"
  version = "4.3.0"
  count   = 2

  name = "my-ec2-cluster"

  ami                    = "ami-0c5204531f799e0c6"
  instance_type          = "t3.micro"
  vpc_security_group_ids = [module.vpc.default_security_group_id]
  subnet_id              = module.vpc.public_subnets[0]

  tags = {
    Terraform   = "true"
    Environment = "dev"
  }
}`,
		notes: [
			'Les lignes 1 à 15 remplacent les centaines de lignes de tables de routage, gateways et subnets qui sont dans [terraform-aws-modules/vpc](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest). Tu passes des entrées, et le module construit le réseau.',
			'Ligne 3, `version = "3.18.1"` fixe la version du module. La doc recommande de contraindre les versions. `version` ne marche que pour les modules d’un registry, pas pour les dossiers locaux.',
			'Ligne 20, `count = 2` appelle le même module deux fois : deux instances, un seul bloc. Ligne 26, `module.vpc.default_security_group_id` est une **sortie** de module utilisée comme entrée d’un autre module, et elle ordonne le travail.',
			'Le [`terraform.tf`](https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262/terraform.tf#L4-L12) d’à côté a un bloc `cloud` en commentaire : décommente-le, lance `terraform init`, et le state vit dans HCP Terraform au lieu de ton portable.'
		]
	},
	tradeoff: {
		gain: [
			'Avec un state distant et un verrou, toute l’équipe et la CI utilisent un seul fichier de state, et deux apply ne peuvent pas l’écrire en même temps.',
			'Les modules te donnent un VPC relu et testé en quelques lignes, identique dans chaque environnement.',
			'Un bucket de state versionné te permet de récupérer un ancien state après une erreur.'
		],
		cost: [
			'Le state peut contenir des secrets **en clair**, comme des mots de passe de base de données. Le bucket doit être chiffré et son accès restreint.',
			'Un module public suit les choix de ses auteurs. Une montée de version majeure peut renommer des resources et proposer de les détruire : lis le plan.',
			'Une exécution plantée peut laisser un verrou derrière elle. `terraform force-unlock` le libère, mais utilise-le seulement sur ton propre verrou, sinon deux exécutions peuvent écrire le state en même temps.'
		]
	},
	task: {
		prompt: 'Un collègue a ouvert MySQL (port 3306) à `0.0.0.0/0` à la main, sur un security group géré par ton Terraform. Ensuite ton équipe déplace le state vers S3. Écris le bloc backend, et les étapes pour trouver et corriger le drift.',
		hint: 'D’abord le backend : bucket, key, region, et le réglage qui active le verrou. Pour le drift : quelle commande montre les changements faits dehors sans toucher AWS ?',
		answer: [
			'Dans le bloc `terraform` : `backend "s3"` avec `bucket`, `key` (comme `prod/network.tfstate`), `region`, `use_lockfile = true` et `encrypt = true`. Active le versioning sur le bucket.',
			'Lance `terraform init`. Terraform voit le nouveau backend et demande si tu veux y migrer le state existant. Réponds oui.',
			'`terraform plan -refresh-only` montre ce qui a changé hors de Terraform, comme la nouvelle règle. Rien ne change sur AWS.',
			'Ouvrir MySQL à internet est une erreur, donc garde le code tel quel. Si les règles du groupe sont écrites dans son bloc Terraform, un `terraform plan` normal propose de le ramener à ce que dit le code, et `terraform apply` ferme le port.',
			'Ensuite parle de pourquoi c’est arrivé : celui qui avait besoin du changement doit ouvrir une pull request sur le code Terraform, pas cliquer dans la console.'
		],
		steps: [
			{
				title: 'Vois pourquoi le state local casse',
				questions: [
					{ q: 'Ton collègue clone le dépôt, lance `plan`, et Terraform veut tout recréer. Pourquoi ?', options: ['Ses identifiants AWS sont faux', 'Son clone n’a pas de fichier de state, donc pour son Terraform rien n’existe', 'Il a oublié de figer la version du module', 'Git a changé les fins de ligne de `main.tf`'], answer: 1, why: '`terraform.tfstate` est resté sur ton portable. Sans lui, Terraform ne sait pas ce qu’il a construit.' },
					{ q: 'Qu’enregistre le state ?', options: ['Quel objet réel appartient à quel bloc', 'L’historique de chaque `plan`', 'La facture AWS', 'Le code source du provider'], answer: 0, why: 'Le state, c’est la façon dont Terraform relie les blocs aux objets réels.' },
					{ q: 'Vous lancez tous les deux `apply` en même temps avec un state local. Que se passe-t-il ?', options: ['La deuxième exécution attend la première', 'AWS rejette la deuxième exécution', 'Terraform fusionne les deux states', 'Les deux changent les mêmes ressources et aucune ne connaît l’autre'], answer: 3, why: 'Pas de state partagé, pas de verrou, donc rien n’arrête deux écritures.' },
					{ q: 'Le state semble faux. Peux-tu le corriger dans un éditeur ?', options: ['Oui, c’est du JSON', 'Oui, si tu relances aussi `init`', 'Ne l’édite jamais à la main', 'Seulement la partie `resources`'], answer: 2, why: 'Le state est l’enregistrement de Terraform. Une modification à la main casse la correspondance dont il dépend.' }
				]
			},
			{
				title: 'Écris le bloc backend',
				questions: [
					{ q: 'Où va le backend ?', options: ['Dans un bloc `provider "aws"`', 'Dans un bloc `backend "s3"` à l’intérieur du bloc `terraform`', 'Dans un bloc `module "state"`', 'Dans `.terraform.lock.hcl`'], answer: 1, why: 'Le bloc `terraform` contient les réglages de Terraform lui-même, dont l’endroit où vit le state.' },
					{ q: 'Quel réglage active le verrou avec le backend S3 ?', options: ['`encrypt = true`', '`versioning = true`', 'Aucun : le state S3 est toujours verrouillé', '`use_lockfile = true`'], answer: 3, why: 'Le verrou est opt-in pour le backend S3, et `use_lockfile` vaut `false` par défaut.' },
					{ q: 'Pourquoi mettre aussi `encrypt = true` et un accès restreint au bucket ?', options: ['Le state peut contenir des secrets en clair', '`plan` va plus vite', 'Ça active le verrou', 'AWS l’exige pour tout bucket'], answer: 0, why: 'Des mots de passe de base et autres peuvent se trouver dans le state, donc le bucket a besoin de chiffrement et d’un accès restreint.' },
					{ q: 'Pourquoi activer le versioning sur le bucket ?', options: ['Il verrouille le state', 'Il fige les versions des modules', 'Tu peux récupérer un ancien state après une erreur', 'Il montre le drift'], answer: 2, why: 'Un bucket versionné garde les copies précédentes du fichier de state.' }
				]
			},
			{
				title: 'Déplace le state',
				questions: [
					{ q: 'Tu as ajouté le bloc backend. Quelle commande vient ensuite ?', options: ['`terraform apply`', '`terraform init`', '`terraform force-unlock`', '`terraform plan -refresh-only`'], answer: 1, why: '`init` met en place le backend, comme il met en place les providers et les modules.' },
					{ q: '`init` trouve ton state local. Que demande-t-il ?', options: ['S’il faut migrer le state existant vers le nouveau backend', 'S’il faut supprimer toutes les ressources', 'Dans quelle Region est le bucket', 'S’il faut déverrouiller le state'], answer: 0, why: 'Réponds oui, et le state part sur S3, où l’équipe et la CI peuvent le joindre.' },
					{ q: 'Crées-tu aussi une table DynamoDB pour le verrou ?', options: ['Oui, le backend S3 en a besoin pour verrouiller', 'Oui, une par fichier de state', 'Seulement pour la production', 'Non : la table de verrou DynamoDB est dépréciée'], answer: 3, why: '`use_lockfile = true` la remplace.' },
					{ q: 'Une exécution plantée a laissé un verrou. Que fais-tu ?', options: ['Tu supprimes le fichier de state', 'Tu désactives le verrou pour de bon', '`terraform force-unlock`, et seulement sur ton propre verrou', 'Tu attends : les verrous expirent après une heure'], answer: 2, why: 'Retirer le verrou actif de quelqu’un d’autre laisse deux exécutions écrire le state en même temps.' }
				]
			},
			{
				title: 'Trouve et corrige le drift',
				questions: [
					{ q: 'Quelle commande montre la règle MySQL ajoutée à la main sans toucher AWS ?', options: ['`terraform plan -refresh-only`', '`terraform apply -auto-approve`', '`terraform init -upgrade`', '`terraform state rm`'], answer: 0, why: 'Un plan refresh-only compare le state avec le vrai AWS et ne change rien.' },
					{ q: 'Tu écris la nouvelle règle dans le code, ou tu gardes le code tel quel ?', options: ['Tu l’écris dans le code, puisqu’elle est en place', 'Tu supprimes le security group du code', 'Tu gardes le code : MySQL ouvert à internet est une erreur', 'Tu laisses les deux comme ils sont'], answer: 2, why: 'Le drift te laisse le choix. Ici, le changement à la main est l’erreur, donc le code gagne.' },
					{ q: 'Qu’est-ce qui referme le port ?', options: ['`terraform plan -refresh-only`', 'Un `terraform plan` normal, puis `terraform apply`', '`terraform force-unlock`', 'Un nouveau `terraform init`'], answer: 1, why: 'Avec les règles du groupe dans son bloc Terraform, un plan normal propose de le ramener à ce que dit le code.' },
					{ q: 'Comment empêches-tu la prochaine modification à la main ?', options: ['Tu retires l’accès AWS à tout le monde', 'Tu lances `apply` toutes les heures', 'Tu actives le versioning du bucket', 'Les changements passent par une pull request sur le code Terraform, pas par la console'], answer: 3, why: 'Celui qui a besoin du changement le fait relire comme n’importe quel code.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Deux ingénieurs gardent chacun leur propre `terraform.tfstate` local pour la même infrastructure. Qu’est-ce qui ne va pas ?',
			options: [
				'Rien : Terraform demande à AWS ce qui existe à chaque exécution, donc le fichier de state ne compte pas',
				'Chaque state ignore ce que l’autre a fait : le plan propose doublons ou mauvaises destructions, sans verrou entre deux apply',
				'Terraform refuse de démarrer quand il trouve deux fichiers de state pour la même infrastructure',
				'AWS rejette les appels d’API du deuxième ingénieur, parce que le premier possède déjà ces resources'
			],
			answer: 1,
			why: 'Le state est la façon dont Terraform relie les blocs aux objets réels. Avec deux copies, chaque state ignore ce que l’autre ingénieur a créé. Un backend distant partagé avec verrou donne un seul state et un seul écrivain à la fois.'
		},
		{
			q: 'Que fait `terraform apply -refresh-only` ?',
			options: [
				'Remet AWS en accord avec le code, sans toucher au fichier de state',
				'Met à jour le state pour qu’il corresponde à l’infrastructure réelle, sans la modifier',
				'Supprime les resources qui ont dérivé, pour que le prochain apply les recrée',
				'Télécharge des versions plus récentes des providers, puis réécrit le lock file'
			],
			answer: 1,
			why: 'Une exécution refresh-only n’écrit que le state. Elle n’essaie pas de faire correspondre AWS à la configuration. C’est le rôle d’un `apply` normal.'
		},
		{
			q: 'Tu stockes le state avec le backend S3. Quel réglage active le verrou du state ?',
			options: [
				'Aucun : un state S3 est toujours verrouillé',
				'`use_lockfile = true`',
				'`encrypt = true`',
				'`versioning = true` dans le bloc backend'
			],
			answer: 1,
			why: 'Le verrou est opt-in pour le backend S3, et `use_lockfile` vaut `false` par défaut. L’ancienne option `dynamodb_table` est dépréciée. `encrypt` protège le state au repos mais ne le verrouille pas.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Appeler deux fois un module local, déplacer le state vers un nouveau chemin de backend, voir le verrou bloquer une deuxième exécution, puis trouver et corriger un drift.',
		steps: [
			'`mkdir -p ~/tf-state-lab/modules/note && cd ~/tf-state-lab`. Dans `modules/note/main.tf`, déclare `variable "name"` et `variable "text"`, une `resource "local_file" "this"` avec `filename = "${path.root}/out/${var.name}.txt"` et `content = var.text`, et un `output "path"`.',
			'Dans `main.tf`, appelle-le deux fois : un bloc `module "notes"` avec `source = "./modules/note"`, `count = 2`, `name = "note-${count.index}"` et `text = "Managed by Terraform.\\n"`, un par ligne. Lance `terraform init`, `terraform apply`, puis `terraform state list`.',
			'Déplace le state : dans `backend.tf`, écris un bloc `terraform` qui contient `backend "local"` avec `path = "shared/team.tfstate"`. Lance `terraform init -migrate-state` et réponds `yes`, puis `terraform plan`.',
			'Verrou : dans un terminal, lance `terraform apply -replace=\'module.notes[0].local_file.this\'` et laisse-le à la question `yes`. Dans un deuxième terminal, dans le même dossier, lance `terraform plan`. Puis réponds `no` dans le premier.',
			'Drift : `echo hacked > out/note-0.txt`. Lance `terraform plan -refresh-only`, puis `terraform plan`, puis `terraform apply`.'
		],
		done: [
			'`terraform state list` affiche `module.notes[0].local_file.this` et `module.notes[1].local_file.this`.',
			'`ls shared` montre `team.tfstate`, et `terraform plan` après le déplacement dit `No changes`.',
			'Le deuxième terminal affiche `Error acquiring the state lock`.',
			'Le plan refresh-only affiche `Objects have changed outside of Terraform`, et après `apply`, `cat out/note-0.txt` affiche de nouveau `Managed by Terraform.`.'
		],
		solution: [
			'`count = 2` donne deux instances du module, nommées `module.notes[0]` et `module.notes[1]`.',
			'Un simple `terraform apply` sans rien à changer se termine sans poser de question. `-replace` lui donne un changement, donc il s’arrête au `yes` en gardant le verrou.',
			'Le backend `local` verrouille lui aussi le fichier de state. Le backend S3 ne verrouille que si tu mets `use_lockfile = true`.',
			'`local_file` voit un fichier modifié comme supprimé, donc le plan normal affiche `will be created` : le code l’emporte sur la modification à la main.',
			'L’ancien `terraform.tfstate` reste en place après le déplacement. Supprime-le une fois que `plan` dit `No changes`, pour que personne ne s’en serve par erreur.'
		]
	},
	recall: {
		q: 'Ton équipe garde le state Terraform dans le backend S3. Quel réglage empêche deux apply d’écrire en même temps, et quelle commande montre les changements faits à la main dans la console ?',
		a: '`use_lockfile = true` active le verrou, désactivé par défaut, donc un deuxième apply attend ou échoue. `terraform plan -refresh-only` montre le drift sans rien changer.'
	},
	sources: [
		{ title: 'Doc Terraform, State', url: 'https://developer.hashicorp.com/terraform/language/state' },
		{ title: 'Doc Terraform, State locking', url: 'https://developer.hashicorp.com/terraform/language/state/locking' },
		{ title: 'Doc Terraform, backend S3', url: 'https://developer.hashicorp.com/terraform/language/backend/s3' },
		{ title: 'Doc Terraform, bloc module', url: 'https://developer.hashicorp.com/terraform/language/block/module' },
		{ title: 'Tutoriel Terraform, Manage resource drift', url: 'https://developer.hashicorp.com/terraform/tutorials/state/resource-drift' }
	]
};
