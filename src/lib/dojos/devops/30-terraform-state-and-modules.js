const MOD = 'https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'terraform-state-and-modules',
	part: 'Infrastructure as code',
	title: 'Terraform state and modules: share the memory, reuse the code',
	minutes: 10,
	hook: [
		'You ran `terraform apply` from your laptop. A file appeared next to your code: `terraform.tfstate`. Your teammate clones the repo and runs `plan`. Terraform wants to **create everything again**.',
		'His clone has no state file. To his Terraform, nothing exists yet. If you both apply at the same time, two writers fight over one infrastructure.',
		'Today: put the state where the whole team and CI can reach it, with a **lock**. Then stop copy-pasting VPC code, and call a **module** instead.'
	],
	terms: [
		{ term: 'State', def: 'Terraform\'s memory: which real object belongs to which block. A JSON file, `terraform.tfstate` by default. Never edit it by hand.' },
		{ term: 'Backend', def: 'Where the state is stored. Local by default. A remote backend, like an S3 bucket or HCP Terraform, lets the team share one state.' },
		{ term: 'State lock', def: 'If the backend supports locking (and it is turned on), Terraform takes it automatically on every operation that could write state. A second `apply` waits or fails instead of writing over the first.' },
		{ term: 'Module', def: 'A folder of Terraform code you call with a `module` block. Your own folder is the **root module**, the ones you call are **child modules**.' },
		{ term: 'Drift', def: 'The real infrastructure no longer matches the state, usually because someone changed it by hand in the console.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["You: terraform apply"] --> st["terraform.tfstate on your laptop"]', 'mate["Teammate: terraform plan"] -.->|cannot see it| st'],
				highlight: ['st'],
				note: 'A local state is fine alone. In a team it is a trap: the state lives on **one laptop**, and losing that file means Terraform forgets what it built.'
			},
			{
				add: [
					's3b["S3 backend: one shared state, bucket versioning on"]',
					'lock["lock: use_lockfile = true"]',
					'you --> s3b',
					'mate --> s3b',
					's3b --> lock'
				],
				highlight: ['s3b', 'lock'],
				note: 'Move the state to a **remote backend**. Everyone and CI read the same file. With the S3 backend, locking is opt-in: set `use_lockfile = true`. The DynamoDB lock table is deprecated.'
			},
			{
				add: [
					'root["root module: main.tf"] --> vpcm["module vpc, version 3.18.1"]',
					'root --> ec2m["module ec2_instances, count = 2"]'
				],
				highlight: ['root', 'vpcm', 'ec2m'],
				note: 'A **module** is a function for infrastructure. You pass inputs (CIDR, AZs) and get outputs (subnet ids). Pin a version so a new release does not change your network on the next `init`.'
			},
			{
				add: [
					'con["Someone edits a security group in the console"]',
					'class con ext',
					'aws["Real AWS"]',
					'con -.-> aws',
					'aws -.->|"terraform plan -refresh-only"| s3b'
				],
				highlight: ['con', 'aws'],
				note: '**Drift**: AWS no longer matches the state. `terraform plan -refresh-only` shows what changed outside Terraform without touching anything. Then you choose: bring AWS back to what the code says with a normal `apply`, or write the change into the code.'
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
			'Fifteen lines replace the hundreds of lines of route tables, gateways and subnets inside [terraform-aws-modules/vpc](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest). You pass inputs, the module builds the network.',
			'`version = "3.18.1"` pins the module. The docs recommend constraining versions. Note that `version` only works for modules from a registry, not for local folders.',
			'`count = 2` calls the same module twice: two instances, one block. `module.vpc.default_security_group_id` is a module **output** used as another module\'s input, and it orders the work.',
			'The [`terraform.tf`](https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262/terraform.tf#L4-L12) next to it has a commented `cloud` block: uncomment it, run `terraform init`, and the state lives in HCP Terraform instead of on your laptop.'
		]
	},
	tradeoff: {
		gain: [
			'Remote state with a lock: the whole team and CI work on one truth, and two applies cannot write at once.',
			'Modules give you a reviewed, tested VPC in a few lines, the same in every environment.',
			'A versioned state bucket lets you get back an older state after a mistake.'
		],
		cost: [
			'The state can hold secrets **in plain text**, like database passwords. The bucket needs encryption and tight access.',
			'A module is someone else\'s design. A major version bump can rename resources and propose destroying them: read the plan.',
			'A crashed run can leave a lock behind. `terraform force-unlock` fixes it, but only use it on your own lock, or you get two writers.'
		]
	},
	task: {
		prompt: 'A colleague opened MySQL (port 3306) to `0.0.0.0/0` by hand, on a security group your Terraform manages. Then your team moves the state to S3. Write the backend block, and the steps to find and fix the drift.',
		hint: 'Backend first: bucket, key, region, and the setting that turns on locking. For the drift: which command shows outside changes without touching AWS?',
		answer: [
			'In the `terraform` block: `backend "s3"` with `bucket`, `key` (like `prod/network.tfstate`), `region`, `use_lockfile = true` and `encrypt = true`. Turn on versioning on the bucket.',
			'Run `terraform init`. Terraform sees the new backend and asks if you want to migrate the existing state into it. Say yes.',
			'`terraform plan -refresh-only` shows what changed outside Terraform, like the new rule. Nothing changes on AWS.',
			'Opening MySQL to the internet is wrong, so keep the code as it is. If the group\'s rules are written in its Terraform block, a normal `terraform plan` proposes to bring it back to the code, and `terraform apply` closes the port.',
			'Then talk about why it happened: whoever needed the change should open a pull request on the Terraform code, not click in the console.'
		]
	},
	quiz: [
		{
			q: 'Two engineers each keep their own local `terraform.tfstate` for the same infrastructure. What goes wrong?',
			options: [
				'Nothing: Terraform asks AWS what exists on every run, so the state file does not matter',
				'Each state misses the other\'s changes: plans propose duplicates or wrong destroys, and no lock stops two applies',
				'Terraform refuses to start when it finds two state files for the same infrastructure',
				'AWS rejects the second engineer\'s API calls, because the first one already owns those resources'
			],
			answer: 1,
			why: 'State is how Terraform maps blocks to real objects. Two copies mean two different memories. A shared remote backend with locking gives one memory and one writer at a time.'
		},
		{
			q: 'What does `terraform apply -refresh-only` do?',
			options: [
				'Changes AWS back to match the code, without touching the state file',
				'Updates the state to match the real infrastructure, without changing it',
				'Deletes the resources that drifted, so the next apply recreates them',
				'Downloads newer provider versions, then rewrites the lock file'
			],
			answer: 1,
			why: 'A refresh-only run only writes the state. It does not try to make AWS match the configuration. A normal `apply` does that.'
		},
		{
			q: 'You store state with the S3 backend. Which setting turns on state locking?',
			options: [
				'None: S3 state is always locked',
				'`use_lockfile = true`',
				'`encrypt = true`',
				'`versioning = true` in the backend block'
			],
			answer: 1,
			why: 'Locking is opt-in for the S3 backend, and `use_lockfile` defaults to `false`. The older `dynamodb_table` option is deprecated. `encrypt` protects the state at rest but does not lock it.'
		}
	],
	takeaway: 'State is Terraform\'s memory: keep one copy, remote, locked, encrypted and versioned. Modules are reusable, pinned building blocks. Drift is the console sneaking past your code, and `plan -refresh-only` finds it.',
	sources: [
		{ title: 'Terraform docs, State', url: 'https://developer.hashicorp.com/terraform/language/state' },
		{ title: 'Terraform docs, State locking', url: 'https://developer.hashicorp.com/terraform/language/state/locking' },
		{ title: 'Terraform docs, S3 backend', url: 'https://developer.hashicorp.com/terraform/language/backend/s3' },
		{ title: 'Terraform docs, module block', url: 'https://developer.hashicorp.com/terraform/language/block/module' },
		{ title: 'Terraform tutorial, Manage resource drift', url: 'https://developer.hashicorp.com/terraform/tutorials/state/resource-drift' }
	]
};
