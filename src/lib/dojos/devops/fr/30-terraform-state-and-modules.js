const MOD = 'https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'terraform-state-and-modules',
	part: 'L’infrastructure as code',
	title: 'State et modules Terraform : partager la mémoire, réutiliser le code',
	minutes: 10,
	hook: [
		'Tu as lancé `terraform apply` depuis ton portable. Un fichier est apparu à côté de ton code : `terraform.tfstate`. Ton collègue clone le repo et lance `plan`. Terraform veut **tout recréer**.',
		'Son clone n’a pas de fichier de state. Pour son Terraform, rien n’existe encore. Si vous faites un apply en même temps, deux écrivains se battent pour une seule infrastructure.',
		'Aujourd’hui : mettre le state là où toute l’équipe et la CI peuvent l’atteindre, avec un **verrou**. Puis arrêter de copier-coller le code du VPC, et appeler un **module** à la place.'
	],
	terms: [
		{ term: 'State', def: 'La mémoire de Terraform : quel objet réel correspond à quel bloc. Un fichier JSON, `terraform.tfstate` par défaut. Ne l’édite jamais à la main.' },
		{ term: 'Backend', def: 'Là où le state est stocké. En local par défaut. Un backend distant, comme un bucket S3 ou HCP Terraform, permet à l’équipe de partager un seul state.' },
		{ term: 'Verrou de state', def: 'Si le backend gère le verrou (et qu’il est activé), Terraform le prend automatiquement à chaque opération qui pourrait écrire le state. Un deuxième `apply` attend ou échoue au lieu d’écraser le premier.' },
		{ term: 'Module', def: 'Un dossier de code Terraform que tu appelles avec un bloc `module`. Ton propre dossier est le **root module**, ceux que tu appelles sont des **child modules**.' },
		{ term: 'Drift', def: 'L’infrastructure réelle ne correspond plus au state, en général parce que quelqu’un l’a modifiée à la main dans la console.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["Toi : terraform apply"] --> st["terraform.tfstate sur ton portable"]', 'mate["Collègue : terraform plan"] -.->|ne le voit pas| st'],
				highlight: ['st'],
				note: 'Un state local, ça va quand tu es seul. En équipe c’est un piège : le state vit sur **un seul portable**, et perdre ce fichier veut dire que Terraform oublie ce qu’il a construit.'
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
				note: 'Un **module**, c’est une fonction pour l’infrastructure. Tu passes des entrées (CIDR, AZ) et tu récupères des sorties (ids de subnets). Fixe une version pour qu’une nouvelle release ne change pas ton réseau au prochain `init`.'
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
				note: '**Drift** : AWS ne correspond plus au state. `terraform plan -refresh-only` montre ce qui a changé hors de Terraform sans rien toucher. Ensuite tu choisis : remettre ce que dit le code avec un `apply` normal, ou écrire le changement dans le code.'
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
			'Quinze lignes remplacent les centaines de lignes de tables de routage, gateways et subnets qui sont dans [terraform-aws-modules/vpc](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest). Tu passes des entrées, le module construit le réseau.',
			'`version = "3.18.1"` fixe la version du module. La doc recommande de contraindre les versions. Attention : `version` ne marche que pour les modules d’un registry, pas pour les dossiers locaux.',
			'`count = 2` appelle le même module deux fois : deux instances, un seul bloc. `module.vpc.default_security_group_id` est une **sortie** de module utilisée comme entrée d’un autre module, et elle ordonne le travail.',
			'Le [`terraform.tf`](https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262/terraform.tf#L4-L12) d’à côté a un bloc `cloud` en commentaire : décommente-le, lance `terraform init`, et le state vit dans HCP Terraform au lieu de ton portable.'
		]
	},
	tradeoff: {
		gain: [
			'State distant avec verrou : toute l’équipe et la CI travaillent sur une seule vérité, et deux apply ne peuvent pas écrire en même temps.',
			'Les modules te donnent un VPC relu et testé en quelques lignes, identique dans chaque environnement.',
			'Un bucket de state versionné te permet de récupérer un ancien state après une erreur.'
		],
		cost: [
			'Le state peut contenir des secrets **en clair**, comme des mots de passe de base de données. Le bucket doit être chiffré et son accès restreint.',
			'Un module, c’est la conception de quelqu’un d’autre. Une montée de version majeure peut renommer des resources et proposer de les détruire : lis le plan.',
			'Une exécution plantée peut laisser un verrou derrière elle. `terraform force-unlock` le libère, mais utilise-le seulement sur ton propre verrou, sinon tu as deux écrivains.'
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
			why: 'Le state est la façon dont Terraform relie les blocs aux objets réels. Deux copies, ce sont deux mémoires différentes. Un backend distant partagé avec verrou donne une seule mémoire et un seul écrivain à la fois.'
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
	takeaway: 'Le state est la mémoire de Terraform : garde-en une seule copie, distante, verrouillée, chiffrée et versionnée. Les modules sont des briques réutilisables à version fixée. Le drift, c’est la console qui passe derrière ton code, et `plan -refresh-only` le trouve.',
	sources: [
		{ title: 'Doc Terraform, State', url: 'https://developer.hashicorp.com/terraform/language/state' },
		{ title: 'Doc Terraform, State locking', url: 'https://developer.hashicorp.com/terraform/language/state/locking' },
		{ title: 'Doc Terraform, backend S3', url: 'https://developer.hashicorp.com/terraform/language/backend/s3' },
		{ title: 'Doc Terraform, bloc module', url: 'https://developer.hashicorp.com/terraform/language/block/module' },
		{ title: 'Tutoriel Terraform, Manage resource drift', url: 'https://developer.hashicorp.com/terraform/tutorials/state/resource-drift' }
	]
};
