const TF = 'https://github.com/hashicorp-education/learn-terraform-get-started-aws/blob/3f8aeea8095ebad0cc0e5c32efb8c5ea4a9fc090';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'terraform',
	part: 'Infrastructure as code',
	title: 'Terraform: plan and apply',
	minutes: 10,
	hook: [
		'Yesterday you clicked a VPC, two subnets and an instance into the AWS console. Next week you need the same thing for staging. Do you remember every click?',
		'Ansible could call the AWS API, task by task. But a playbook is a list of **steps**. Delete a task and the thing it created stays. No file records what the playbook created.',
		'With Terraform, you write what should exist. Terraform compares that with what does exist, shows you the difference as a **plan**, and acts only when you type yes.'
	],
	terms: [
		{ term: 'Resource', def: 'One thing Terraform manages, like `resource "aws_instance" "app_server"`: a type, a local name, and its arguments.' },
		{ term: 'Data source', def: 'A read-only lookup, like `data "aws_ami" "ubuntu"`: find something that exists, without managing it.' },
		{ term: 'Plan', def: '`terraform plan`: compare the configuration with what exists, and list the changes. It changes nothing.' },
		{ term: 'Dependency graph', def: 'Who must exist before whom. Terraform builds it from the references between blocks.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['code["main.tf: what should exist"] --> init["terraform init: download the AWS provider"]'],
				highlight: ['code', 'init'],
				note: 'You write **declarative** code: the end state, not the steps. `init` downloads the providers the code needs, plugins that each talk to one API, and records their exact versions in `.terraform.lock.hcl`. Run it once per working directory, and again when providers or modules change.'
			},
			{
				add: [
					'real["Real AWS account"]',
					'class real ext',
					'init --> plan["terraform plan"]',
					'real -.->|read current objects| plan'
				],
				highlight: ['plan', 'real'],
				note: '`plan` reads the current state of what Terraform already manages, compares it with your code, and works out the difference. It changes **nothing** in AWS.'
			},
			{
				add: [
					'subgraph g["Dependency graph"]',
					'ami["data.aws_ami.ubuntu"]',
					'vpc["module.vpc"]',
					'ec2["aws_instance.app_server"]',
					'end',
					'ami --> ec2',
					'vpc --> ec2',
					'plan --- g'
				],
				highlight: ['ami', 'vpc', 'ec2'],
				note: 'The instance uses `module.vpc.private_subnets[0]`, so the VPC must come first. Terraform reads that **reference** and orders the work. Things that do not depend on each other run in parallel, up to 10 at a time.'
			},
			{
				add: ['plan -->|"+ create, ~ update, - destroy"| diff["Execution plan"]', 'diff --> apply["terraform apply"]', 'apply --> real'],
				highlight: ['diff', 'apply'],
				note: 'The plan uses symbols: `+` create, `~` update in place, `-` destroy, `-/+` destroy and recreate. Read it like a `git diff` of your infrastructure. Then `apply` shows the plan, asks for `yes`, and makes the changes in dependency order.'
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
			'HashiCorp\'s getting-started tutorial uses yesterday\'s nouns. Line 2 sets the Region, lines 16 to 27 build a VPC with subnets in AZs, and lines 29 to 39 an instance with a security group.',
			'Lines 5 to 14, the `data` block, **look up** the newest Ubuntu image from Canonical. Lines 29 to 39, the `resource` block, create an instance from it. Terraform only reads a data source, but it creates, updates and destroys a resource.',
			'Lines 30 and 34 hold references: `data.aws_ami.ubuntu.id` and `module.vpc.private_subnets[0]`. Terraform orders the work from them, so you rarely need `depends_on`.',
			'The provider version is constrained in [`terraform.tf`](https://github.com/hashicorp-education/learn-terraform-get-started-aws/blob/3f8aeea8095ebad0cc0e5c32efb8c5ea4a9fc090/terraform.tf#L11-L16) (`~> 5.92`), and the repo commits its `.terraform.lock.hcl`, as the docs recommend. Every laptop and the CI then run the same provider version.'
		]
	},
	tradeoff: {
		gain: [
			'You see every change before it happens, and you can paste the `plan` output into a pull request.',
			'If you remove a block, the plan proposes destroying the resource, so nothing Terraform created is left behind.',
			'The same tool and language drive hundreds of APIs: AWS, DNS, GitHub, monitoring.'
		],
		cost: [
			'Terraform records what it created in a **state** file, and you now have to protect that file (tomorrow\'s chapter).',
			'A `-/+` on a database means Terraform destroys it and creates a new one, so read the plan before you type yes.',
			'Terraform creates the servers but is weak at configuring what runs inside them. Many teams use Terraform for the instance and Ansible for what runs on it.'
		]
	},
	task: {
		prompt: 'Add an S3 bucket for backups to the example, and tag the instance with the bucket name. Write the new block, the changed line, and predict what `terraform plan` will show.',
		hint: 'Use a reference to the bucket in the instance tags. What does that reference do to the order?',
		answer: [
			'`resource "aws_s3_bucket" "backups" { bucket = "myteam-backups-1234" }`. In the shared global namespace (the default), the name must be unique across all AWS accounts.',
			'In the instance: `tags = { Name = var.instance_name, Backups = aws_s3_bucket.backups.bucket }`.',
			'The reference makes the instance depend on the bucket, so the bucket is created first.',
			'Plan: `+` for `aws_s3_bucket.backups`, and `~` (update in place) for `aws_instance.app_server`, because only a tag changes. No `-/+`.'
		],
		steps: [
			{
				title: 'Write the bucket block',
				questions: [
					{ q: 'Which block adds the bucket?', options: ['`data "aws_s3_bucket" "backups"`', '`resource "aws_s3_bucket" "backups" { bucket = "myteam-backups-1234" }`', '`module "backups" { bucket = "myteam-backups-1234" }`', '`provider "aws_s3_bucket" { name = "backups" }`'], answer: 1, why: 'A `resource` block is something Terraform creates and manages.' },
					{ q: 'Why not a `data` block?', options: ['A data source only reads something that already exists', 'Data blocks only work for AMIs', 'Data blocks run after every resource', 'Data blocks cannot have names'], answer: 0, why: 'Terraform only reads a data source. It creates, updates and destroys a resource.' },
					{ q: 'In `resource "aws_s3_bucket" "backups"`, what is `backups`?', options: ['The bucket name in AWS', 'The Region', 'The local name you use in references', 'A tag'], answer: 2, why: 'A resource has a type, a local name, and its arguments. The AWS name is the `bucket` argument.' },
					{ q: 'What must be true of `myteam-backups-1234`?', options: ['It must match the instance name', 'It must start with the Region', 'It must be under 10 characters', 'It must be unique across all AWS accounts'], answer: 3, why: 'In the shared global namespace, the default, two accounts cannot hold the same bucket name.' }
				]
			},
			{
				title: 'Reference it from the instance',
				questions: [
					{ q: 'Which line changes in the instance?', options: ['`tags = { Name = var.instance_name, Backups = aws_s3_bucket.backups.bucket }`', '`tags = { Name = var.instance_name, Backups = "myteam-backups-1234" }`', '`ami = aws_s3_bucket.backups.id`', '`subnet_id = aws_s3_bucket.backups.bucket`'], answer: 0, why: 'A reference keeps one source for the name, and tells Terraform about the link.' },
					{ q: 'A colleague writes the tag as the plain string `"myteam-backups-1234"` instead of the reference. What changes?', options: ['Nothing at all', 'The plan fails, because tags must be references', 'Terraform sees no link, so it may create both in parallel, and the name now lives in two places', 'The bucket is created twice'], answer: 2, why: 'Terraform builds the order from references. Without one, the two resources are independent, and a rename must be done in two places.' },
					{ q: 'Do you also need `depends_on = [aws_s3_bucket.backups]`?', options: ['Yes, always, for every link', 'Yes, or the plan fails', 'Only for S3 buckets', 'No: it is only for hidden dependencies Terraform cannot see'], answer: 3, why: 'The reference already makes the dependency visible.' },
					{ q: 'Two resources do not reference each other. How does Terraform create them?', options: ['One at a time, in file order', 'In parallel, up to 10 at a time', 'In alphabetical order', 'Only after you add `depends_on`'], answer: 1, why: 'Things that do not depend on each other run in parallel.' }
				]
			},
			{
				title: 'Predict the plan',
				questions: [
					{ q: 'Which symbol does the plan show for `aws_s3_bucket.backups`?', options: ['`~`', '`-/+`', '`-`', '`+`'], answer: 3, why: 'It does not exist yet, so it will be created.' },
					{ q: 'Which symbol does it show for `aws_instance.app_server`?', options: ['`~`, update in place', '`+`, create', '`-/+`, destroy and recreate', 'None: tags are not tracked'], answer: 0, why: 'The instance exists, and only one argument changes.' },
					{ q: 'Why no `-/+` on the instance?', options: ['Terraform never replaces instances', 'Only a tag changes, and a tag can be updated in place', 'The bucket protects it', 'You did not run `init` again'], answer: 1, why: '`-/+` appears when a changed argument cannot be updated in place. Tags can.' },
					{ q: 'What does the last line of the plan say?', options: ['`Plan: 2 to add, 0 to change, 0 to destroy.`', '`Plan: 1 to add, 0 to change, 1 to destroy.`', '`Plan: 1 to add, 1 to change, 0 to destroy.`', '`Plan: 0 to add, 2 to change, 0 to destroy.`'], answer: 2, why: 'One `+` for the bucket, one `~` for the instance, nothing destroyed.' }
				]
			},
			{
				title: 'Apply it safely',
				questions: [
					{ q: 'Before anyone types `yes`, how can a teammate review this change?', options: ['Paste the `plan` output into the pull request', 'Read the AWS console after the apply', 'Run `apply` on a second laptop', 'Read `.terraform.lock.hcl`'], answer: 0, why: 'The plan lists every change before it happens, so it fits in a pull request next to the code.' },
					{ q: 'What does `terraform apply` do first?', options: ['It creates the bucket at once', 'It runs `init` again', 'It deletes the state', 'It shows the plan and asks for `yes`'], answer: 3, why: 'Then it makes the changes in dependency order.' },
					{ q: 'A teammate applies the same code from his laptop. What makes sure he runs the same AWS provider version as you?', options: ['The `region` line in the provider block', 'The `.terraform.lock.hcl` file committed in the repo', 'The `bucket` name', 'Running `plan` twice'], answer: 1, why: '`init` records the exact provider versions in `.terraform.lock.hcl`. Committed, it gives every laptop and the CI the same version.' },
					{ q: 'Next week you add a second bucket. Do you run `terraform init` again?', options: ['Yes, before every plan', 'Yes, once per new resource', 'No: the AWS provider is already downloaded, and init is needed again only when providers or modules change', 'No: `apply` never needs `init`'], answer: 2, why: '`init` runs once per working directory, then again when the providers or modules change. A new bucket uses the same AWS provider.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'You delete the `aws_instance` block from `main.tf` and run `terraform plan`. What does the plan propose?',
			options: [
				'Nothing: Terraform only creates things, it never removes them',
				'To destroy the instance, because it is no longer in the configuration',
				'An error, because the instance still exists in AWS',
				'To keep the instance and add a warning'
			],
			answer: 1,
			why: 'Terraform compares the configuration with what it manages. A managed resource missing from the code is something that should not exist, so the plan shows `-` destroy. In Ansible, removing a task would leave the thing in place.'
		},
		{
			q: 'How does Terraform know it must create the VPC before the instance in the example?',
			options: [
				'Blocks run from top to bottom of the file, so the VPC module goes first',
				'The instance references `module.vpc.private_subnets[0]`, which creates a dependency',
				'Resources are created in alphabetical order of their block names',
				'You must always add `depends_on = [module.vpc]` to the instance block'
			],
			answer: 1,
			why: 'Terraform builds a dependency graph from references between blocks. `depends_on` is only for hidden dependencies it cannot see.'
		},
		{
			q: 'The plan shows `-/+` next to `aws_instance.app_server`. What will `apply` do?',
			options: [
				'Update the instance in place, without downtime',
				'Destroy the instance and create a new one to replace it',
				'Create a second instance and keep the old one',
				'Nothing until you run `terraform refresh`'
			],
			answer: 1,
			why: '`-/+` means Terraform destroys the resource and then creates a replacement, usually because a changed argument cannot be updated in place. Anything stored on that instance goes with it.'
		}
	],
	lab: {
		minutes: 20,
		goal: 'Read every plan symbol for real, with no cloud account: a local file stands in for the bucket and a `terraform_data` resource for the instance.',
		steps: [
			'Install Terraform from [developer.hashicorp.com/terraform/install](https://developer.hashicorp.com/terraform/install), then `mkdir -p ~/tf-lab && cd ~/tf-lab`.',
			'Write `main.tf` with a `resource "local_file" "backups"` (`filename = "${path.module}/backups/README.txt"`, `content = "Backups live here.\\n"`) and a `resource "terraform_data" "app_server"` whose `input` is `{ Name = "app-server", Backups = local_file.backups.filename }`.',
			'Run `terraform init`, `terraform plan`, then `terraform apply` and type `yes`. Run `terraform plan` once more.',
			'Change `"app-server"` to `"web-server"` and run `terraform plan`. Then change the file `content` and run `terraform plan` again.',
			'Delete the whole `terraform_data` block and run `terraform plan`.'
		],
		done: [
			'The first plan ends with `Plan: 2 to add, 0 to change, 0 to destroy.`, and `apply` prints `local_file.backups: Creation complete` before `terraform_data.app_server: Creating...`.',
			'The plan right after `apply` says `No changes`.',
			'The rename shows `~ update in-place`. The new `content` shows `-/+` and `# forces replacement`. The deleted block shows `will be destroyed`.'
		],
		solution: [
			'`init` downloads the `hashicorp/local` provider and writes `.terraform.lock.hcl`. `terraform_data` is built in and needs no provider.',
			'The reference `local_file.backups.filename` makes `app_server` wait for the file, as the instance waits for the bucket.',
			'`local_file` cannot change its content in place, so Terraform destroys and recreates it. On a database, that line is the one to stop at.',
			'Run `terraform destroy` to clean up. It lists everything in the state with `-`.'
		]
	},
	recall: {
		q: 'What does `terraform plan` compare, and which symbol in its output means a resource will be destroyed and recreated?',
		a: 'It compares your configuration with the current state of what Terraform manages, and changes nothing. `-/+` means destroy and recreate, and anything stored on that resource goes with it.'
	},
	sources: [
		{ title: 'Terraform docs, What is Terraform?', url: 'https://developer.hashicorp.com/terraform/intro' },
		{ title: 'Terraform docs, Providers', url: 'https://developer.hashicorp.com/terraform/language/providers' },
		{ title: 'Terraform docs, terraform plan command', url: 'https://developer.hashicorp.com/terraform/cli/commands/plan' },
		{ title: 'Terraform docs, Resource graph', url: 'https://developer.hashicorp.com/terraform/internals/graph' },
		{ title: 'Terraform docs, depends_on meta-argument', url: 'https://developer.hashicorp.com/terraform/language/meta-arguments/depends_on' }
	]
};
