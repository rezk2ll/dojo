const CFN = 'https://github.com/aws-cloudformation/aws-cloudformation-templates/blob/a0f43bc6d20813052892546f445037cf84c75b54';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'aws-essentials',
	part: 'Infrastructure as code',
	title: 'AWS essentials: regions, networks, firewalls and roles',
	minutes: 10,
	hook: [
		'In your data center, a new server meant a purchase order, a rack slot, a switch port, a VLAN, an iptables rule and a login on the box. Weeks of work, spread over three teams.',
		'In AWS, each of those is **an API call**. The data center is an Availability Zone. The VLAN is a subnet. The iptables rule is a security group. The login for an app is an IAM role.',
		'Tomorrow Terraform will make those calls for you. It uses six nouns: Region and AZ, VPC and subnet, security group, EC2 instance, S3 bucket and IAM role.'
	],
	terms: [
		{ term: 'Region and Availability Zone (AZ)', def: 'A Region is a separate geographic area, like `eu-west-1`. Each Region has several isolated locations called AZs, named like `eu-west-1a`.' },
		{ term: 'IAM user vs IAM role', def: 'A user has long-term credentials (a password, access keys). A role has none: whoever assumes it gets **temporary** credentials. People and apps should use roles.' },
		{ term: 'VPC and subnet', def: 'A VPC is your private network, like `10.0.0.0/16`. A subnet is a slice of it that lives in **exactly one AZ**. Public if its route table sends traffic to an internet gateway, private if not.' },
		{ term: 'Security group', def: 'A stateful firewall attached to an instance. It has **allow rules only**. A new one has no inbound rules, so nothing gets in until you add one.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['reg["Region eu-west-1"] --> aza["AZ eu-west-1a"]', 'reg --> azb["AZ eu-west-1b"]'],
				highlight: ['reg', 'aza', 'azb'],
				note: 'Inside a Region, AZs are isolated from each other. If everything sits in one AZ, one AZ failure takes it all down. So you spread your servers over **two AZs**.'
			},
			{
				add: [
					'reg --> vpc["VPC 10.0.0.0/16"]',
					'vpc --> pub["public subnet 10.0.101.0/24, in 1a"]',
					'vpc --> priv["private subnet 10.0.1.0/24, in 1b"]',
					'igw["internet gateway"] --> pub'
				],
				highlight: ['vpc', 'pub', 'priv', 'igw'],
				note: 'One VPC can hold subnets in several AZs of its Region, but **each subnet sits in one AZ**. What makes a subnet public is only its route: a direct route to the internet gateway. A private subnet needs a NAT device to reach the internet.'
			},
			{
				add: ['sg["security group: allow tcp 22 from your IP"] --> ec2["EC2 instance"]', 'pub --> ec2'],
				highlight: ['sg', 'ec2'],
				note: 'The EC2 instance is a virtual server, started from an image (AMI) with an instance type and an SSH key pair. The **security group** replaces your iptables rules. It is stateful: if SSH in is allowed, the replies go out without an extra rule.'
			},
			{
				add: [
					'role["IAM role, via an instance profile"] -.->|temporary credentials| ec2',
					's3[("S3 bucket: backups")]',
					'ec2 -->|PUT backups/db.sql.gz| s3'
				],
				highlight: ['role', 's3'],
				note: 'Your backup script writes to an S3 bucket, which stores objects by key, like `backups/db.sql.gz`. No access keys in `/etc`: you attach a **role** to the instance, and the app gets temporary credentials that AWS rotates for you.'
			}
		]
	},
	example: {
		title: 'EC2/EC2InstanceWithSecurityGroupSample.yaml',
		repo: 'aws-cloudformation/aws-cloudformation-templates',
		url: `${CFN}/EC2/EC2InstanceWithSecurityGroupSample.yaml#L62-L103`,
		lang: 'yaml',
		code: `  SSHLocation:
    Description: The IP address range that can be used to SSH to the EC2 instances
    Type: String
    Default: 192.168.1.0/0
…
Resources:
  EC2Instance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: !Ref InstanceType
      SubnetId: !Select
        - 0
        - !Ref Subnets
      SecurityGroupIds:
        - !GetAtt InstanceSecurityGroup.GroupId
      KeyName: !Ref KeyName
      ImageId: !Ref LatestAmiId

  InstanceSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Metadata:
      guard:
        SuppressedRules:
          - INCOMING_SSH_DISABLED
    Properties:
      GroupDescription: Enable SSH access via port 22
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 22
          ToPort: 22
          CidrIp: !Ref SSHLocation`,
		notes: [
			'AWS publishes this sample template in CloudFormation, AWS\'s built-in IaC. Lines 7 to 17 define one instance, and lines 19 to 31 one security group with one rule.',
			'Line 4 sets `Default: 192.168.1.0/0`. The `/0` means **zero fixed bits**: as a CIDR it covers every IPv4 address, not one home network. AWS advises allowing SSH only from specific ranges, so set this value yourself.',
			'Lines 27 to 31, `SecurityGroupIngress`, list what is **allowed** in. There is no "deny" to write: anything not listed is blocked.',
			'Line 16, `KeyName`, is the SSH key pair you log in with. Line 17, `ImageId`, comes from a [public SSM parameter](https://github.com/aws-cloudformation/aws-cloudformation-templates/blob/a0f43bc6d20813052892546f445037cf84c75b54/EC2/EC2InstanceWithSecurityGroupSample.yaml#L71-L73) for the latest Amazon Linux 2 image, so the template needs no hard-coded image id. There is no `IamInstanceProfile`, so apps on this box get no AWS permissions.'
		]
	},
	tradeoff: {
		gain: [
			'A server, a network or a firewall rule in seconds, by API, instead of weeks of tickets.',
			'Two AZs give you two isolated locations in one Region, without building a second data center.',
			'With a role, the server holds no long-lived keys: there is no key in `/etc` to leak and none to rotate by hand.'
		],
		cost: [
			'Most resources cost money for as long as they exist. A forgotten instance or NAT gateway shows up on the bill.',
			'More moving parts than one LAN: route tables, gateways, security groups and IAM policies must all agree before one packet flows.',
			'A wrong CIDR or a public bucket policy exposes you to the whole internet. New buckets and security groups start closed, and one rule opens them.'
		]
	},
	task: {
		prompt: 'Sketch a minimal AWS network for a web app with a load balancer, two web servers and a database. Say which subnets, in which AZs, and the security group rules.',
		hint: 'Only the load balancer should face the internet. A security group rule can name another security group as its source.',
		answer: [
			'One VPC over two AZs. In each AZ, a public subnet holds the load balancer and a **private** subnet holds the web servers and the database.',
			'Load balancer security group: allow HTTP and HTTPS from `0.0.0.0/0`.',
			'Web security group: allow HTTP and HTTPS **only from the load balancer\'s security group**, not from an IP range.',
			'Database security group: allow the database port only from the web security group.',
			'One web server per AZ, so one AZ can fail. Web servers get an IAM role for anything they read in AWS, no access keys.'
		],
		steps: [
			{
				title: 'Pick the AZs',
				questions: [
					{ q: 'You work in Region `eu-west-1`. Which pair names two AZs you can use for this app?', options: ['`eu-west-1` and `us-east-1`', '`eu-west-1a` and `eu-west-1b`', '`eu-west-1a` and `us-east-1a`', '`eu-west-1` alone'], answer: 1, why: 'AZs are isolated locations inside one Region, named after it with a letter. `us-east-1` is another Region.' },
					{ q: 'AZ `eu-west-1a` goes down. With one web server per AZ, what keeps serving users?', options: ['Nothing: the VPC is down', 'The database only', 'The load balancer and the web server in `eu-west-1b`', 'The web server in `eu-west-1a`, from its backup'], answer: 2, why: 'The 1b subnets hold their own load balancer node and web server. AZs fail independently, so 1b keeps running.' },
					{ q: 'The VPC is `10.0.0.0/16`. Which range fits one of its subnets?', options: ['`10.0.2.0/24`', '`10.1.0.0/24`', '`192.168.1.0/24`', '`0.0.0.0/0`'], answer: 0, why: 'A subnet is a slice of the VPC\'s range, like `10.0.1.0/24` and `10.0.101.0/24` in the diagram. The others lie outside `10.0.0.0/16`.' },
					{ q: 'So how do you lay out the subnets?', options: ['One big subnet across both AZs', 'One public subnet in 1a, one private subnet in 1b', 'One subnet per server', 'A public and a private subnet in each AZ'], answer: 3, why: 'Each AZ needs a place for the load balancer and a place for the servers behind it.' }
				]
			},
			{
				title: 'Split public and private',
				questions: [
					{ q: 'Which part faces the internet?', options: ['Only the load balancer', 'The load balancer and the web servers', 'The web servers and the database', 'All of them'], answer: 0, why: 'The web servers and the database have no reason to be reachable from outside.' },
					{ q: 'Where do the web servers go?', options: ['In the public subnets, next to the load balancer', 'In a separate VPC', 'In the private subnets', 'In S3'], answer: 2, why: 'They only need traffic from the load balancer, so they stay private.' },
					{ q: 'What makes a subnet public?', options: ['Its CIDR range', 'The name you give it', 'The instances in it having public keys', 'A route to the internet gateway in its route table'], answer: 3, why: 'Public or private is only a question of the route.' },
					{ q: 'A web server in a private subnet must download updates. What does it need?', options: ['A security group that allows all inbound traffic', 'A NAT device', 'A second internet gateway', 'An IAM user'], answer: 1, why: 'A private subnet has no route to the internet gateway, so it reaches out through NAT.' }
				]
			},
			{
				title: 'Write the rules',
				questions: [
					{ q: 'What does the load balancer\'s security group allow in?', options: ['HTTP and HTTPS from `0.0.0.0/0`', 'SSH from `0.0.0.0/0`', 'Everything from the web servers', 'Nothing: load balancers need no rules'], answer: 0, why: 'It is the one public entry point, so it takes web traffic from anywhere.' },
					{ q: 'What does the web security group allow in?', options: ['HTTP and HTTPS from `0.0.0.0/0`', 'HTTP and HTTPS from `10.0.0.0/16`', 'HTTP and HTTPS only from the load balancer\'s security group', 'The database port from the database'], answer: 2, why: 'A rule can name another security group as its source. Only the load balancer gets through.' },
					{ q: 'What does the database security group allow in?', options: ['The database port from the load balancer', 'The database port only from the web security group', 'Every port from the VPC', 'The database port from your home IP'], answer: 1, why: 'Only the web servers talk to the database.' },
					{ q: 'You copy an SSH rule from the sample template, with its default `192.168.1.0/0`. Who can reach port 22?', options: ['Only your home network, `192.168.1.x`', 'Nobody: `/0` is an empty range', 'Only addresses inside the VPC', 'Every IPv4 address'], answer: 3, why: '`/0` means zero fixed bits, so the range covers the whole internet. Allow SSH only from a specific range you set yourself.' }
				]
			},
			{
				title: 'Give the servers access',
				questions: [
					{ q: 'You start the database server from the sample template, which has no `IamInstanceProfile`. What can apps on it do in the AWS API?', options: ['Nothing: they get no AWS permissions', 'Everything the account can do', 'Read S3 only', 'Whatever the web servers\' role allows'], answer: 0, why: 'Without an instance profile, no role reaches the instance, so it has no AWS permissions. The database needs none here.' },
					{ q: 'You create a new bucket for the app\'s uploads. Who can read it before you add any policy?', options: ['Anyone on the internet', 'Every instance in the VPC', 'Nobody outside: a new bucket starts closed', 'Only the load balancer'], answer: 2, why: 'New buckets and security groups start closed. One rule or policy opens them, so that is where you must be careful.' },
					{ q: 'A developer must read the same bucket from his laptop. What should he use?', options: ['Access keys copied from a web server', 'A role he assumes, as the servers do', 'The root user\'s keys', 'The web servers\' SSH key pair'], answer: 1, why: 'People and apps should use roles. A web server holds no keys to copy anyway, and root keys open the whole account.' },
					{ q: 'The web security group allows HTTPS in from the load balancer. Do the replies need an outbound rule?', options: ['Yes, one per port', 'Yes, to the load balancer\'s IP', 'Only for HTTPS', 'No: security groups are stateful'], answer: 3, why: 'Replies to allowed inbound traffic go out without an extra rule.' }
				]
			}
		]
	},
	quiz: [
		{
			q: 'An app on an EC2 instance must read files from an S3 bucket. What is the right way to give it credentials?',
			options: [
				'Create an IAM user and put its access keys in `/etc/app.env`',
				'Attach an IAM role to the instance, so the app gets temporary credentials',
				'Make the bucket public so no credentials are needed',
				'Copy the account root user\'s keys to the instance'
			],
			answer: 1,
			why: 'A role has no long-term credentials. The instance gets temporary ones through its instance profile, and you never ship keys to the server.'
		},
		{
			q: 'You create a new security group, attach it to an instance and add no rules. Can someone on the internet reach port 80?',
			options: [
				'Yes, a new security group allows all inbound traffic until your first rule',
				'No, a new security group has no inbound rules, so no inbound traffic is allowed',
				'Only if they come from the same Region as the instance\'s VPC',
				'Yes, until you add an explicit deny rule for port 80'
			],
			answer: 1,
			why: 'A new security group starts with no inbound rules and one outbound rule that allows everything. You can only add allow rules, never deny rules.'
		},
		{
			q: 'Why put your two web servers in subnets in two different Availability Zones?',
			options: [
				'Instances spread over two AZs cost less than two in the same zone',
				'A subnet lives in one AZ, so two AZs let the app survive the loss of one zone',
				'Security groups only work across AZs, so one AZ leaves the servers open',
				'S3 can only be reached from a subnet that sits in a second AZ'
			],
			answer: 1,
			why: 'Each subnet sits entirely in one AZ. AZs are isolated locations, so spreading across two protects you from the failure of one.'
		}
	],
	lab: {
		minutes: 25,
		goal: 'Build the chapter\'s network, firewall, role and bucket with real AWS CLI calls, against LocalStack on your machine, at no cost.',
		steps: [
			'Start LocalStack and wait for it: `docker run -d --rm --name aws-lab -e AWS_DEFAULT_REGION=eu-west-1 localstack/localstack:4.0`, then `until docker logs aws-lab 2>&1 | grep -q Ready; do sleep 1; done`. Give your shell a short command: `awslocal() { docker exec aws-lab awslocal "$@"; }`.',
			'List the AZs with `awslocal ec2 describe-availability-zones --query "AvailabilityZones[].ZoneName" --output text`. Make the VPC: `VPC=$(awslocal ec2 create-vpc --cidr-block 10.0.0.0/16 --query Vpc.VpcId --output text)`. Add one subnet per AZ: `awslocal ec2 create-subnet --vpc-id $VPC --cidr-block 10.0.101.0/24 --availability-zone eu-west-1a`, then the same with `10.0.1.0/24` in `eu-west-1b`.',
			'Make a security group: `SG=$(awslocal ec2 create-security-group --group-name web --description "lab web" --vpc-id $VPC --query GroupId --output text)`. Read its rules with `awslocal ec2 describe-security-groups --group-ids $SG --query "SecurityGroups[0].[IpPermissions,IpPermissionsEgress]"`, then allow SSH from one address: `awslocal ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 --cidr 203.0.113.7/32`, and read the rules again.',
			'Make a role EC2 can assume, and its instance profile: `awslocal iam create-role --role-name backup-role --assume-role-policy-document \'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}\'`, `awslocal iam create-instance-profile --instance-profile-name backup-profile`, `awslocal iam add-role-to-instance-profile --instance-profile-name backup-profile --role-name backup-role`. Then the bucket: `awslocal s3 mb s3://lab-backups && awslocal s3api put-object --bucket lab-backups --key backups/db.sql.gz`.',
			'Start an instance in the `eu-west-1a` subnet with all of it: `SUB=$(awslocal ec2 describe-subnets --filters Name=cidr-block,Values=10.0.101.0/24 --query "Subnets[0].SubnetId" --output text)`, `AMI=$(awslocal ec2 describe-images --owners amazon --query "Images[0].ImageId" --output text)`, then `awslocal ec2 run-instances --image-id $AMI --instance-type t3.micro --subnet-id $SUB --security-group-ids $SG --iam-instance-profile Name=backup-profile`. Clean up with `docker stop aws-lab`: `--rm` removes the container and everything in it.'
		],
		done: [
			'`awslocal ec2 describe-subnets --filters Name=vpc-id,Values=$VPC --query "Subnets[].[CidrBlock,AvailabilityZone]" --output text` shows `10.0.101.0/24 eu-west-1a` and `10.0.1.0/24 eu-west-1b`.',
			'The new security group shows `[]` for inbound and one outbound rule to `0.0.0.0/0`. After the authorize call, inbound holds only tcp 22 from `203.0.113.7/32`.',
			'`awslocal s3 ls s3://lab-backups --recursive` lists `backups/db.sql.gz`.',
			'`awslocal ec2 describe-instances --query "Reservations[].Instances[].[State.Name,Placement.AvailabilityZone,IamInstanceProfile.Arn]" --output text` shows `running`, `eu-west-1a` and the `backup-profile` ARN.'
		],
		solution: [
			'`create-subnet` takes one `--availability-zone`, never two, so two AZs need two subnets. Nothing here routes to an internet gateway, so both subnets are in fact private.',
			'A new security group lets nothing in and everything out. There is no deny call: `authorize-security-group-ingress` is the only way to open it, one allowed source at a time.',
			'The trust policy says who may assume the role, here `ec2.amazonaws.com`. The instance profile carries the role to the instance, and no access key was created at any step. A real role also gets a policy that allows `s3:PutObject` on the bucket.',
			'LocalStack answers the API but does not enforce security groups or IAM. On a real account the same commands work with `aws` in place of `awslocal`, and the instance costs money until you terminate it.'
		]
	},
	recall: {
		q: 'Your two web servers must survive the loss of one AZ and must write to S3. Where do you put them, and how do they get AWS credentials?',
		a: 'In subnets in two different AZs, since each subnet sits in exactly one AZ. Each instance gets an IAM role through its instance profile, so it receives temporary credentials and no access keys sit on the server.'
	},
	sources: [
		{ title: 'Amazon EC2 docs, Regions and Zones', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html' },
		{ title: 'IAM docs, IAM roles', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html' },
		{ title: 'Amazon VPC docs, Subnets for your VPC', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html' },
		{ title: 'Amazon VPC docs, Security group rules', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html' },
		{ title: 'Amazon S3 docs, What is Amazon S3?', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' }
	]
};
