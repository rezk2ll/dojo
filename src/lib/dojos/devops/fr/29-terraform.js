const TF = 'https://github.com/hashicorp-education/learn-terraform-get-started-aws/blob/3f8aeea8095ebad0cc0e5c32efb8c5ea4a9fc090';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'terraform',
	part: 'L’infrastructure as code',
	title: 'Terraform : plan et apply',
	minutes: 10,
	hook: [
		'Hier tu as créé un VPC, deux subnets et une instance à la souris dans la console AWS. La semaine prochaine il te faut la même chose pour la préprod. Tu te souviens de chaque clic ?',
		'Ansible pourrait appeler l’API AWS, tâche par tâche. Mais un playbook est une liste d’**étapes**. Supprime une tâche et ce qu’elle a créé reste là. Aucun fichier ne note ce que le playbook a créé.',
		'Avec Terraform, tu écris ce qui doit exister. Terraform le compare avec ce qui existe, te montre la différence sous forme de **plan**, et n’agit que quand tu tapes yes.'
	],
	terms: [
		{ term: 'Resource', def: 'Une chose que Terraform gère, comme `resource "aws_instance" "app_server"` : un type, un nom local, et ses arguments.' },
		{ term: 'Data source', def: 'Une lecture seule, comme `data "aws_ami" "ubuntu"` : trouver quelque chose qui existe, sans le gérer.' },
		{ term: 'Plan', def: '`terraform plan` : compare la configuration avec ce qui existe, et liste les changements. Il ne change rien.' },
		{ term: 'Graphe de dépendances', def: 'Qui doit exister avant qui. Terraform le construit à partir des références entre les blocs.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['code["main.tf : ce qui doit exister"] --> init["terraform init : télécharge le provider AWS"]'],
				highlight: ['code', 'init'],
				note: 'Tu écris du code **déclaratif** : l’état final, pas les étapes. `init` télécharge les providers dont le code a besoin, des plugins qui parlent chacun à une API, et note leur version exacte dans `.terraform.lock.hcl`. Lance-le une fois par répertoire de travail, et à nouveau quand les providers ou les modules changent.'
			},
			{
				add: [
					'real["Vrai compte AWS"]',
					'class real ext',
					'init --> plan["terraform plan"]',
					'real -.->|lit les objets actuels| plan'
				],
				highlight: ['plan', 'real'],
				note: '`plan` lit l’état actuel de ce que Terraform gère déjà, le compare avec ton code, et calcule la différence. Il ne change **rien** dans AWS.'
			},
			{
				add: [
					'subgraph g["Graphe de dépendances"]',
					'ami["data.aws_ami.ubuntu"]',
					'vpc["module.vpc"]',
					'ec2["aws_instance.app_server"]',
					'end',
					'ami --> ec2',
					'vpc --> ec2',
					'plan --- g'
				],
				highlight: ['ami', 'vpc', 'ec2'],
				note: 'L’instance utilise `module.vpc.private_subnets[0]`, donc le VPC doit venir d’abord. Terraform lit cette **référence** et ordonne le travail. Ce qui ne dépend pas l’un de l’autre tourne en parallèle, jusqu’à 10 à la fois.'
			},
			{
				add: ['plan -->|"+ créer, ~ modifier, - détruire"| diff["Plan d’exécution"]', 'diff --> apply["terraform apply"]', 'apply --> real'],
				highlight: ['diff', 'apply'],
				note: 'Le plan utilise des symboles : `+` créer, `~` modifier sur place, `-` détruire, `-/+` détruire puis recréer. Lis-le comme un `git diff` de ton infrastructure. Ensuite `apply` affiche le plan, attend ton `yes`, et fait les changements dans l’ordre des dépendances.'
			}
		]
	},
	example: {
		title: 'main.tf',
		repo: 'hashicorp-education/learn-terraform-get-started-aws',
		url: `${TF}/main.tf#L1-L40`,
		lang: 'hcl',
		code: `provider "aws" {
  region = "us-west-2"
}

data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }

  owners = ["099720109477"] # Canonical
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.19.0"

  name = "example-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-west-2a", "us-west-2b", "us-west-2c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24"]
…
}

resource "aws_instance" "app_server" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  vpc_security_group_ids = [module.vpc.default_security_group_id]
  subnet_id              = module.vpc.private_subnets[0]

  tags = {
    Name = var.instance_name
  }
}`,
		notes: [
			'Le tutoriel de démarrage de HashiCorp reprend les noms d’hier. La ligne 2 fixe la Region, les lignes 16 à 27 montent un VPC avec des subnets dans des AZ, et les lignes 29 à 39 une instance avec un security group.',
			'Les lignes 5 à 14, le bloc `data`, **cherchent** l’image Ubuntu la plus récente de Canonical. Les lignes 29 à 39, le bloc `resource`, créent une instance à partir d’elle. Terraform ne fait que lire une data source, alors qu’il crée, modifie et détruit une resource.',
			'Les lignes 30 et 34 contiennent des références : `data.aws_ami.ubuntu.id` et `module.vpc.private_subnets[0]`. Terraform en déduit l’ordre du travail, donc tu as rarement besoin de `depends_on`.',
			'La version du provider est contrainte dans [`terraform.tf`](https://github.com/hashicorp-education/learn-terraform-get-started-aws/blob/3f8aeea8095ebad0cc0e5c32efb8c5ea4a9fc090/terraform.tf#L11-L16) (`~> 5.92`), et le repo committe son `.terraform.lock.hcl`, comme la doc le recommande. Chaque portable et la CI utilisent alors la même version du provider.'
		]
	},
	tradeoff: {
		gain: [
			'Tu vois chaque changement avant qu’il arrive, et tu peux coller la sortie de `plan` dans une pull request.',
			'Si tu supprimes un bloc, le plan propose de détruire la resource : rien de ce que Terraform a créé ne reste oublié.',
			'Le même outil et le même langage pilotent des centaines d’API : AWS, DNS, GitHub, monitoring.'
		],
		cost: [
			'Terraform note ce qu’il a créé dans un fichier de **state**, et tu dois maintenant protéger ce fichier (le chapitre de demain).',
			'Un `-/+` sur une base de données veut dire que Terraform la détruit et en crée une nouvelle : lis le plan avant de taper yes.',
			'Terraform crée les serveurs, mais configure mal ce qui tourne dedans. Beaucoup d’équipes utilisent Terraform pour l’instance et Ansible pour ce qui tourne dessus.'
		]
	},
	task: {
		prompt: 'Ajoute à l’exemple un bucket S3 pour les sauvegardes, et tague l’instance avec le nom du bucket. Écris le nouveau bloc, la ligne modifiée, et prédis ce que `terraform plan` va afficher.',
		hint: 'Utilise une référence au bucket dans les tags de l’instance. Que fait cette référence à l’ordre ?',
		answer: [
			'`resource "aws_s3_bucket" "backups" { bucket = "myteam-backups-1234" }`. Dans le namespace global partagé (celui par défaut), le nom doit être unique parmi tous les comptes AWS.',
			'Dans l’instance : `tags = { Name = var.instance_name, Backups = aws_s3_bucket.backups.bucket }`.',
			'La référence rend l’instance dépendante du bucket, donc le bucket est créé d’abord.',
			'Plan : `+` pour `aws_s3_bucket.backups`, et `~` (modification sur place) pour `aws_instance.app_server`, parce que seul un tag change. Pas de `-/+`.'
		],
		steps: [
			{
				title: 'Écris le bloc du bucket',
				questions: [
					{ q: 'Quel bloc ajoute le bucket ?', options: ['`data "aws_s3_bucket" "backups"`', '`resource "aws_s3_bucket" "backups" { bucket = "myteam-backups-1234" }`', '`module "backups" { bucket = "myteam-backups-1234" }`', '`provider "aws_s3_bucket" { name = "backups" }`'], answer: 1, why: 'Un bloc `resource` est une chose que Terraform crée et gère.' },
					{ q: 'Pourquoi pas un bloc `data` ?', options: ['Une data source lit seulement quelque chose qui existe déjà', 'Les blocs data ne marchent que pour les AMI', 'Les blocs data tournent après chaque resource', 'Les blocs data ne peuvent pas avoir de nom'], answer: 0, why: 'Terraform ne fait que lire une data source. Il crée, modifie et détruit une resource.' },
					{ q: 'Dans `resource "aws_s3_bucket" "backups"`, qu’est-ce que `backups` ?', options: ['Le nom du bucket dans AWS', 'La Region', 'Le nom local que tu utilises dans les références', 'Un tag'], answer: 2, why: 'Une resource a un type, un nom local, et ses arguments. Le nom dans AWS est l’argument `bucket`.' },
					{ q: 'Que doit respecter `myteam-backups-1234` ?', options: ['Il doit correspondre au nom de l’instance', 'Il doit commencer par la Region', 'Il doit faire moins de 10 caractères', 'Il doit être unique parmi tous les comptes AWS'], answer: 3, why: 'Dans le namespace global partagé, celui par défaut, deux comptes ne peuvent pas avoir le même nom de bucket.' }
				]
			},
			{
				title: 'Référence-le depuis l’instance',
				questions: [
					{ q: 'Quelle ligne change dans l’instance ?', options: ['`tags = { Name = var.instance_name, Backups = aws_s3_bucket.backups.bucket }`', '`tags = { Name = var.instance_name, Backups = "myteam-backups-1234" }`', '`ami = aws_s3_bucket.backups.id`', '`subnet_id = aws_s3_bucket.backups.bucket`'], answer: 0, why: 'Une référence garde une seule source pour le nom, et signale le lien à Terraform.' },
					{ q: 'Que fait cette référence à l’ordre ?', options: ['Rien : les blocs tournent de haut en bas', 'L’instance est créée d’abord, puis le bucket', 'L’instance dépend maintenant du bucket, donc le bucket passe en premier', 'Les deux sont créés au même moment'], answer: 2, why: 'Terraform construit son graphe de dépendances à partir des références entre les blocs.' },
					{ q: 'Faut-il aussi `depends_on = [aws_s3_bucket.backups]` ?', options: ['Oui, toujours, pour chaque lien', 'Oui, sinon le plan échoue', 'Seulement pour les buckets S3', 'Non : il sert seulement aux dépendances cachées que Terraform ne voit pas'], answer: 3, why: 'La référence rend déjà la dépendance visible.' },
					{ q: 'Deux resources ne se référencent pas. Comment Terraform les crée-t-il ?', options: ['Une à la fois, dans l’ordre du fichier', 'En parallèle, jusqu’à 10 à la fois', 'Par ordre alphabétique', 'Seulement après un `depends_on`'], answer: 1, why: 'Ce qui ne dépend pas l’un de l’autre tourne en parallèle.' }
				]
			},
			{
				title: 'Prédis le plan',
				questions: [
					{ q: 'Quel symbole le plan affiche-t-il pour `aws_s3_bucket.backups` ?', options: ['`~`', '`-/+`', '`-`', '`+`'], answer: 3, why: 'Il n’existe pas encore, donc il sera créé.' },
					{ q: 'Quel symbole affiche-t-il pour `aws_instance.app_server` ?', options: ['`~`, modification sur place', '`+`, création', '`-/+`, destruction et recréation', 'Aucun : les tags ne sont pas suivis'], answer: 0, why: 'L’instance existe, et un seul argument change.' },
					{ q: 'Pourquoi pas de `-/+` sur l’instance ?', options: ['Terraform ne remplace jamais les instances', 'Seul un tag change, et un tag se modifie sur place', 'Le bucket la protège', 'Tu n’as pas relancé `init`'], answer: 1, why: '`-/+` apparaît quand un argument modifié ne peut pas changer sur place. Les tags, si.' },
					{ q: 'Que dit la dernière ligne du plan ?', options: ['`Plan: 2 to add, 0 to change, 0 to destroy.`', '`Plan: 1 to add, 0 to change, 1 to destroy.`', '`Plan: 1 to add, 1 to change, 0 to destroy.`', '`Plan: 0 to add, 2 to change, 0 to destroy.`'], answer: 2, why: 'Un `+` pour le bucket, un `~` pour l’instance, rien de détruit.' }
				]
			},
			{
				title: 'Applique sans risque',
				questions: [
					{ q: 'Que change `terraform plan` dans AWS ?', options: ['Rien', 'Seulement les tags', 'Seulement les nouvelles resources', 'Tout, puis il revient en arrière'], answer: 0, why: '`plan` compare et liste les changements. Il ne change rien.' },
					{ q: 'Que fait `terraform apply` en premier ?', options: ['Il crée le bucket tout de suite', 'Il relance `init`', 'Il efface le state', 'Il affiche le plan et demande `yes`'], answer: 3, why: 'Ensuite il fait les changements dans l’ordre des dépendances.' },
					{ q: 'Le plan affiche finalement `-/+` sur l’instance. Que fais-tu ?', options: ['Tu tapes yes : `-/+` est sans danger', 'Tu t’arrêtes et tu lis : l’instance et ce qu’elle contient vont être détruits', 'Tu ajoutes `depends_on` et tu appliques', 'Tu relances `plan` jusqu’à ce que le symbole change'], answer: 1, why: '`-/+` veut dire détruire et créer un remplaçant. Tout ce qui est stocké dessus part avec.' },
					{ q: 'Des mois plus tard, tu supprimes le bloc du bucket. Que propose le plan suivant ?', options: ['Rien : Terraform ne supprime jamais rien', 'Une erreur, parce que le bucket existe encore', 'De détruire le bucket', 'De garder le bucket avec un avertissement'], answer: 2, why: 'Une resource gérée absente du code ne devrait pas exister, donc le plan affiche `-`.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'Tu supprimes le bloc `aws_instance` de `main.tf` et tu lances `terraform plan`. Que propose le plan ?',
			options: [
				'Rien : Terraform ne fait que créer, il ne supprime jamais',
				'De détruire l’instance, parce qu’elle n’est plus dans la configuration',
				'Une erreur, parce que l’instance existe toujours dans AWS',
				'De garder l’instance et d’afficher un avertissement'
			],
			answer: 1,
			why: 'Terraform compare la configuration avec ce qu’il gère. Une resource gérée absente du code est quelque chose qui ne doit plus exister, donc le plan affiche `-` détruire. Avec Ansible, supprimer une tâche laisserait la chose en place.'
		},
		{
			q: 'Comment Terraform sait-il qu’il doit créer le VPC avant l’instance dans l’exemple ?',
			options: [
				'Les blocs s’exécutent de haut en bas du fichier, donc le module VPC passe en premier',
				'L’instance référence `module.vpc.private_subnets[0]`, ce qui crée une dépendance',
				'Les resources sont créées par ordre alphabétique de leur nom de bloc',
				'Il faut toujours ajouter `depends_on = [module.vpc]` au bloc de l’instance'
			],
			answer: 1,
			why: 'Terraform construit un graphe de dépendances à partir des références entre blocs. `depends_on` ne sert qu’aux dépendances cachées qu’il ne peut pas voir.'
		},
		{
			q: 'Le plan affiche `-/+` à côté de `aws_instance.app_server`. Que va faire `apply` ?',
			options: [
				'Modifier l’instance sur place, sans coupure',
				'Détruire l’instance et en créer une nouvelle pour la remplacer',
				'Créer une deuxième instance et garder l’ancienne',
				'Rien tant que tu ne lances pas `terraform refresh`'
			],
			answer: 1,
			why: '`-/+` veut dire que Terraform détruit la resource puis en crée une de remplacement, en général parce qu’un argument modifié ne peut pas être changé sur place. Tout ce qui est stocké sur cette instance part avec.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Lire chaque symbole du plan pour de vrai, sans compte cloud : un fichier local remplace le bucket et une resource `terraform_data` remplace l’instance.',
		steps: [
			'Installe Terraform depuis [developer.hashicorp.com/terraform/install](https://developer.hashicorp.com/terraform/install), puis `mkdir -p ~/tf-lab && cd ~/tf-lab`.',
			'Écris `main.tf` avec une `resource "local_file" "backups"` (`filename = "${path.module}/backups/README.txt"`, `content = "Backups live here.\\n"`) et une `resource "terraform_data" "app_server"` dont l’`input` vaut `{ Name = "app-server", Backups = local_file.backups.filename }`.',
			'Lance `terraform init`, `terraform plan`, puis `terraform apply` et tape `yes`. Relance `terraform plan`.',
			'Remplace `"app-server"` par `"web-server"` et lance `terraform plan`. Puis change le `content` du fichier et relance `terraform plan`.',
			'Supprime tout le bloc `terraform_data` et lance `terraform plan`.'
		],
		done: [
			'Le premier plan finit par `Plan: 2 to add, 0 to change, 0 to destroy.`, et `apply` affiche `local_file.backups: Creation complete` avant `terraform_data.app_server: Creating...`.',
			'Le plan juste après `apply` dit `No changes`.',
			'Le renommage montre `~ update in-place`. Le nouveau `content` montre `-/+` et `# forces replacement`. Le bloc supprimé montre `will be destroyed`.'
		],
		solution: [
			'`init` télécharge le provider `hashicorp/local` et écrit `.terraform.lock.hcl`. `terraform_data` est intégré et n’a besoin d’aucun provider.',
			'La référence `local_file.backups.filename` fait attendre `app_server` jusqu’à ce que le fichier existe, comme l’instance attend le bucket.',
			'`local_file` ne sait pas changer son contenu sur place, donc Terraform le détruit et le recrée. Sur une base de données, c’est la ligne où t’arrêter.',
			'Lance `terraform destroy` pour nettoyer. Il liste tout ce qui est dans le state avec `-`.'
		]
	},
	recall: {
		q: 'Que compare `terraform plan`, et quel symbole de sa sortie annonce qu’une resource sera détruite puis recréée ?',
		a: 'Il compare ta configuration avec l’état actuel de ce que Terraform gère, et ne change rien. `-/+` veut dire détruire puis recréer, et tout ce qui est stocké sur cette resource part avec.'
	},
	sources: [
		{ title: 'Doc Terraform, What is Terraform?', url: 'https://developer.hashicorp.com/terraform/intro' },
		{ title: 'Doc Terraform, Providers', url: 'https://developer.hashicorp.com/terraform/language/providers' },
		{ title: 'Doc Terraform, commande terraform plan', url: 'https://developer.hashicorp.com/terraform/cli/commands/plan' },
		{ title: 'Doc Terraform, Resource graph', url: 'https://developer.hashicorp.com/terraform/internals/graph' },
		{ title: 'Doc Terraform, méta-argument depends_on', url: 'https://developer.hashicorp.com/terraform/language/meta-arguments/depends_on' }
	]
};
