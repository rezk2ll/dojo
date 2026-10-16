const TF = 'https://github.com/hashicorp-education/learn-terraform-get-started-aws/blob/3f8aeea8095ebad0cc0e5c32efb8c5ea4a9fc090';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'terraform',
	part: 'Infrastructure as code',
	title: 'Terraform: describe it, plan it, apply it',
	minutes: 10,
	hook: [
		'Yesterday you clicked a VPC, two subnets and an instance into the AWS console. Next week you need the same thing for staging. Do you remember every click?',
		'Ansible could call the AWS API, task by task. But a playbook is a list of **steps**. Delete a task and the thing it created stays. Nothing tracks what exists.',
		'**Terraform** works the other way. You write what should exist. It compares that with what does exist, shows you the difference as a **plan**, and only acts when you say yes.'
	],
	terms: [
		{ term: 'Provider', def: 'A plugin that talks to one API: AWS, GitHub, Cloudflare. `terraform init` downloads it and records its exact version in `.terraform.lock.hcl`.' },
		{ term: 'Resource', def: 'One thing Terraform manages, like `resource "aws_instance" "app_server"`: a type, a local name, and its arguments.' },
		{ term: 'Data source', def: 'A read-only lookup, like `data "aws_ami" "ubuntu"`: find something that exists, without managing it.' },
		{ term: 'Plan', def: '`terraform plan`: compare the configuration with what exists, and list the changes. It changes nothing.' },
		{ term: 'Apply', def: '`terraform apply`: show the plan, ask for approval, then make the changes in dependency order.' },
		{ term: 'Dependency graph', def: 'Who must exist before whom. Terraform builds it from the references between blocks.' }
	],
	diagram: {
		direction: 'LR',
		steps: [
			{
				add: ['code["main.tf: what should exist"] --> init["terraform init: download the AWS provider"]'],
				highlight: ['code', 'init'],
				note: 'You write **declarative** code: the end state, not the steps. `init` fetches the providers the code needs. Run it once per working directory, and again when providers or modules change.'
			},
			{
				add: [
					'real["Real AWS account"]',
					'class real ext',
					'init --> plan["terraform plan"]',
					'real -.->|read current objects| plan'
				],
				highlight: ['plan', 'real'],
				note: '`plan` reads the current state of what Terraform already manages, compares it with your code, and works out the difference. **Nothing changes yet.**'
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
				note: 'The plan uses symbols: `+` create, `~` update in place, `-` destroy, `-/+` destroy and recreate. Read it like a `git diff` of your infrastructure. Then `apply` asks "yes?" and does it.'
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
			'This is HashiCorp\'s own getting-started tutorial. Every noun from yesterday is here: a Region, a VPC, subnets in AZs, a security group, an instance.',
			'The `data` block **looks up** the newest Ubuntu image from Canonical. The `resource` block **creates** an instance from it. Data is read, resources are managed.',
			'`data.aws_ami.ubuntu.id` and `module.vpc.private_subnets[0]` are references. They are how Terraform knows the order. You rarely need `depends_on`.',
			'The provider version is constrained in [`terraform.tf`](https://github.com/hashicorp-education/learn-terraform-get-started-aws/blob/3f8aeea8095ebad0cc0e5c32efb8c5ea4a9fc090/terraform.tf#L11-L16) (`~> 5.92`), and the repo commits its `.terraform.lock.hcl`, as the docs recommend. Same code, same provider, on every laptop and in CI.'
		]
	},
	tradeoff: {
		gain: [
			'You see every change before it happens. `plan` output is a perfect thing to paste into a pull request.',
			'Remove a block and the plan proposes destroying it. The code is the full list of what Terraform manages, nothing left behind.',
			'One tool, one language for hundreds of APIs: AWS, DNS, GitHub, monitoring.'
		],
		cost: [
			'Terraform must remember what it created. That memory, the **state**, is a file you now have to protect (tomorrow\'s chapter).',
			'Some changes cannot be done in place. A `-/+` on a database means destroy and recreate: read the plan before you type yes.',
			'Terraform builds infrastructure, it does not configure inside the servers well. Many teams use Terraform for the instance and Ansible for what runs on it.'
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
	takeaway: 'Terraform is declarative: you write what should exist, `plan` shows the difference, `apply` makes it real in the order the references imply. Read every plan like a diff.',
	sources: [
		{ title: 'Terraform docs, What is Terraform?', url: 'https://developer.hashicorp.com/terraform/intro' },
		{ title: 'Terraform docs, Providers', url: 'https://developer.hashicorp.com/terraform/language/providers' },
		{ title: 'Terraform docs, terraform plan command', url: 'https://developer.hashicorp.com/terraform/cli/commands/plan' },
		{ title: 'Terraform docs, Resource graph', url: 'https://developer.hashicorp.com/terraform/internals/graph' },
		{ title: 'Terraform docs, depends_on meta-argument', url: 'https://developer.hashicorp.com/terraform/language/meta-arguments/depends_on' }
	]
};
