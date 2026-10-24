const MOD = 'https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'terraform-state-and-modules',
	part: 'Infrastructure as code',
	title: 'Terraform state, backends and modules',
	minutes: 10,
	hook: [
		'You ran `terraform apply` from your laptop. A file appeared next to your code: `terraform.tfstate`. Your teammate clones the repo and runs `plan`. Terraform wants to **create everything again**.',
		'His clone has no state file. To his Terraform, nothing exists yet. If you both apply at the same time, both runs change the same AWS resources and neither knows about the other.',
		'You put the state where the whole team and CI can reach it, with a **lock**. The VPC code you used to copy between projects goes into a module that each project calls.'
	],
	terms: [
		{ term: 'State', def: 'The record of which real object belongs to which block. A JSON file, `terraform.tfstate` by default. Never edit it by hand.' },
		{ term: 'Backend', def: 'Where the state is stored. Local by default. A remote backend, like an S3 bucket or HCP Terraform, lets the team share one state.' },
		{ term: 'State lock', def: 'If the backend supports locking (and it is turned on), Terraform takes it automatically on every operation that could write state. A second `apply` waits or fails instead of writing over the first.' },
		{ term: 'Module', def: 'A folder of Terraform code you call with a `module` block. Your own folder is the root module, and the ones you call are **child modules**.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['you["You: terraform apply"] --> st["terraform.tfstate on your laptop"]', 'mate["Teammate: terraform plan"] -.->|cannot see it| st'],
				highlight: ['st'],
				note: 'A local state works when you are alone. In a team, the state lives on **one laptop**: your teammate cannot see it, and losing that file means Terraform forgets what it built.'
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
				note: 'A **module** works like a function. You pass inputs (CIDR, AZs) and get outputs (subnet ids). Pin a version so a new release does not change your network on the next `init`.'
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
				note: 'Someone changed AWS by hand, so AWS no longer matches the state: this is **drift**. `terraform plan -refresh-only` shows what changed outside Terraform without touching anything. Then you choose: bring AWS back to what the code says with a normal `apply`, or write the change into the code.'
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
			'Lines 1 to 15 replace the hundreds of lines of route tables, gateways and subnets inside [terraform-aws-modules/vpc](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws/latest). You pass inputs, and the module builds the network.',
			'Line 3, `version = "3.18.1"`, pins the module. The docs recommend constraining versions. `version` only works for modules from a registry, not for local folders.',
			'Line 20, `count = 2`, calls the same module twice: two instances, one block. On line 26, `module.vpc.default_security_group_id` is a module **output** used as another module\'s input, and it orders the work.',
			'The [`terraform.tf`](https://github.com/hashicorp-education/learn-terraform-modules-use/blob/753518c20cdca94c67e1f0e2890e71f6a96af262/terraform.tf#L4-L12) next to it has a commented `cloud` block: uncomment it, run `terraform init`, and the state lives in HCP Terraform instead of on your laptop.'
		]
	},
	tradeoff: {
		gain: [
			'With a remote state and a lock, the whole team and CI use one state file, and two applies cannot write it at once.',
			'Modules give you a reviewed, tested VPC in a few lines, the same in every environment.',
			'A versioned state bucket lets you get back an older state after a mistake.'
		],
		cost: [
			'The state can hold secrets **in plain text**, like database passwords. The bucket needs encryption and tight access.',
			'A public module follows its authors\' design. A major version bump can rename resources and propose destroying them: read the plan.',
			'A crashed run can leave a lock behind. `terraform force-unlock` removes it, but only use it on your own lock, or two runs can write the state at once.'
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
		],
		steps: [
			{
				title: 'See why local state breaks',
				questions: [
					{ q: 'Your teammate clones the repo, runs `plan`, and Terraform wants to create everything. Why?', options: ['His AWS credentials are wrong', 'His clone has no state file, so to his Terraform nothing exists', 'He forgot to pin the module version', 'Git changed the line endings of `main.tf`'], answer: 1, why: '`terraform.tfstate` stayed on your laptop. Without it, Terraform does not know what it built.' },
					{ q: 'What does the state record?', options: ['Which real object belongs to which block', 'The history of every `plan`', 'The AWS bill', 'The provider source code'], answer: 0, why: 'State is how Terraform maps blocks to real objects.' },
					{ q: 'Your laptop\'s disk dies, and `terraform.tfstate` was only on it. What is lost?', options: ['The AWS resources, deleted with the state', 'Nothing: AWS keeps a copy of the state', 'Only the provider plugins', 'The record of what Terraform built: the resources stay in AWS, but nothing maps them to your blocks'], answer: 3, why: 'The state is the map from blocks to real objects. Lose it, and Terraform forgets what it built while the objects keep running.' },
					{ q: 'The state looks wrong. Can you fix it in an editor?', options: ['Yes, it is plain JSON', 'Yes, if you also run `init`', 'Never edit it by hand', 'Only the `resources` part'], answer: 2, why: 'The state is Terraform\'s record. Hand edits break the mapping it relies on.' }
				]
			},
			{
				title: 'Write the backend block',
				questions: [
					{ q: 'Where does the backend go?', options: ['In a `provider "aws"` block', 'In a `backend "s3"` block inside the `terraform` block', 'In a `module "state"` block', 'In `.terraform.lock.hcl`'], answer: 1, why: 'The `terraform` block holds settings about Terraform itself, including where the state lives.' },
					{ q: 'This state holds the network, in production. Which line names the state file inside the bucket?', options: ['`bucket = "prod/network.tfstate"`', '`region = "prod"`', '`encrypt = "prod/network.tfstate"`', '`key = "prod/network.tfstate"`'], answer: 3, why: '`bucket` picks the bucket and `key` the path of the state file in it, so several states can share one bucket.' },
					{ q: 'Why also set `encrypt = true` and tight access on the bucket?', options: ['The state can hold secrets in plain text', 'It makes `plan` faster', 'It turns on locking', 'AWS requires it for any bucket'], answer: 0, why: 'Database passwords and the like can sit in the state, so the bucket needs encryption and tight access.' },
					{ q: 'Why turn on versioning on the bucket?', options: ['It locks the state', 'It pins the module versions', 'You can get back an older state after a mistake', 'It shows drift'], answer: 2, why: 'A versioned bucket keeps the earlier copies of the state file.' }
				]
			},
			{
				title: 'Move the state',
				questions: [
					{ q: 'You added the backend block. Which command comes next?', options: ['`terraform apply`', '`terraform init`', '`terraform force-unlock`', '`terraform plan -refresh-only`'], answer: 1, why: '`init` sets up the backend, as it sets up providers and modules.' },
					{ q: '`init` finds your local state. What does it ask?', options: ['Whether to migrate the existing state into the new backend', 'Whether to delete every resource', 'Which Region the bucket is in', 'Whether to unlock the state'], answer: 0, why: 'Say yes, and the state moves to S3, where the team and CI can reach it.' },
					{ q: 'Do you also create a DynamoDB table for the lock?', options: ['Yes, the S3 backend needs one to lock', 'Yes, one per state file', 'Only for production', 'No: the DynamoDB lock table is deprecated'], answer: 3, why: '`use_lockfile = true` replaces it.' },
					{ q: 'A crashed run left a lock behind. What do you do?', options: ['Delete the state file', 'Turn off locking for good', '`terraform force-unlock`, and only on your own lock', 'Wait: locks expire after an hour'], answer: 2, why: 'Removing someone else\'s live lock lets two runs write the state at once.' }
				]
			},
			{
				title: 'Find and fix the drift',
				questions: [
					{ q: 'AWS now has a rule on port 3306 that the code and the state do not have. What is this called?', options: ['Drift', 'A state lock', 'A child module', 'A backend migration'], answer: 0, why: 'Someone changed AWS by hand, so AWS no longer matches the state. That gap is drift.' },
					{ q: 'Do you write the new rule into the code, or keep the code as it is?', options: ['Write it into the code, since it is live now', 'Delete the security group from the code', 'Keep the code: MySQL open to the internet is wrong', 'Leave both as they are'], answer: 2, why: 'Drift leaves you a choice. Here the hand change is the mistake, so the code wins.' },
					{ q: 'What closes the port again?', options: ['`terraform plan -refresh-only`', 'A normal `terraform plan`, then `terraform apply`', '`terraform force-unlock`', 'A new `terraform init`'], answer: 1, why: 'With the group\'s rules in its Terraform block, a normal plan proposes to bring it back to the code.' },
					{ q: 'How do you stop the next hand edit?', options: ['Remove everyone\'s AWS access', 'Run `apply` every hour', 'Turn on bucket versioning', 'Changes go through a pull request on the Terraform code, not the console'], answer: 3, why: 'Whoever needed the change gets it reviewed like any other code.' }
				]
			}
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
			why: 'State is how Terraform maps blocks to real objects. With two copies, each state misses what the other engineer created. A shared remote backend with locking gives one state and one writer at a time.'
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
	lab: {
		minutes: 25,
		goal: 'Call a local module twice, move the state to a new backend path, watch the lock block a second run, then find and fix drift.',
		steps: [
			'`mkdir -p ~/tf-state-lab/modules/note && cd ~/tf-state-lab`. In `modules/note/main.tf`, declare `variable "name"` and `variable "text"`, a `resource "local_file" "this"` with `filename = "${path.root}/out/${var.name}.txt"` and `content = var.text`, and an `output "path"`.',
			'In `main.tf`, call it twice: a `module "notes"` block with `source = "./modules/note"`, `count = 2`, `name = "note-${count.index}"` and `text = "Managed by Terraform.\\n"`, one per line. Run `terraform init`, `terraform apply`, then `terraform state list`.',
			'Move the state: in `backend.tf`, write a `terraform` block holding `backend "local"` with `path = "shared/team.tfstate"`. Run `terraform init -migrate-state` and answer `yes`, then `terraform plan`.',
			'Lock: in one terminal run `terraform apply -replace=\'module.notes[0].local_file.this\'` and leave it at the `yes` prompt. In a second terminal, in the same folder, run `terraform plan`. Then answer `no` in the first one.',
			'Drift: `echo hacked > out/note-0.txt`. Run `terraform plan -refresh-only`, then `terraform plan`, then `terraform apply`.'
		],
		done: [
			'`terraform state list` prints `module.notes[0].local_file.this` and `module.notes[1].local_file.this`.',
			'`ls shared` shows `team.tfstate`, and `terraform plan` after the move says `No changes`.',
			'The second terminal prints `Error acquiring the state lock`.',
			'The refresh-only plan prints `Objects have changed outside of Terraform`, and after `apply`, `cat out/note-0.txt` prints `Managed by Terraform.` again.'
		],
		solution: [
			'`count = 2` gives two instances of the module, addressed `module.notes[0]` and `module.notes[1]`.',
			'A plain `terraform apply` with nothing to change ends without a prompt. `-replace` gives it one change, so it stops at `yes` while it holds the lock.',
			'The `local` backend locks the state file too. The S3 backend only locks when you set `use_lockfile = true`.',
			'`local_file` sees a changed file as deleted, so the normal plan shows `will be created`: the code wins over the hand edit.',
			'The old `terraform.tfstate` is left behind after the move. Delete it once `plan` says `No changes`, so nobody uses it by mistake.'
		]
	},
	recall: {
		q: 'Your team keeps Terraform state in the S3 backend. Which setting stops two applies from writing at once, and which command shows changes made by hand in the console?',
		a: '`use_lockfile = true` turns on locking, which is off by default, so a second apply waits or fails. `terraform plan -refresh-only` shows the drift without changing anything.'
	},
	sources: [
		{ title: 'Terraform docs, State', url: 'https://developer.hashicorp.com/terraform/language/state' },
		{ title: 'Terraform docs, State locking', url: 'https://developer.hashicorp.com/terraform/language/state/locking' },
		{ title: 'Terraform docs, S3 backend', url: 'https://developer.hashicorp.com/terraform/language/backend/s3' },
		{ title: 'Terraform docs, module block', url: 'https://developer.hashicorp.com/terraform/language/block/module' },
		{ title: 'Terraform tutorial, Manage resource drift', url: 'https://developer.hashicorp.com/terraform/tutorials/state/resource-drift' }
	]
};
