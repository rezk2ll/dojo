const CFN = 'https://github.com/aws-cloudformation/aws-cloudformation-templates/blob/a0f43bc6d20813052892546f445037cf84c75b54';

/** @type {import('../../content.js').Chapter} */
export default {
	slug: 'aws-essentials',
	part: 'Infrastructure as code',
	title: 'AWS essentials: your data center as API calls',
	minutes: 10,
	hook: [
		'In your data center, a new server meant a purchase order, a rack slot, a switch port, a VLAN, an iptables rule and a login on the box. Weeks of work, spread over three teams.',
		'In AWS, each of those is **an API call**. The data center is an Availability Zone. The VLAN is a subnet. The iptables rule is a security group. The login for an app is an IAM role.',
		'Tomorrow Terraform will make those calls for you. Today you learn the **six nouns** it will talk about, mapped to the things you already know.'
	],
	terms: [
		{ term: 'Region and Availability Zone (AZ)', def: 'A Region is a separate geographic area, like `eu-west-1`. Each Region has several isolated locations called AZs, named like `eu-west-1a`.' },
		{ term: 'IAM user vs IAM role', def: 'A user has long-term credentials (a password, access keys). A role has none: whoever assumes it gets **temporary** credentials. People and apps should use roles.' },
		{ term: 'VPC and subnet', def: 'A VPC is your private network, like `10.0.0.0/16`. A subnet is a slice of it that lives in **exactly one AZ**. Public if its route table sends traffic to an internet gateway, private if not.' },
		{ term: 'Security group', def: 'A stateful firewall attached to an instance. **Allow rules only.** A new one has no inbound rules, so nothing gets in until you add one.' },
		{ term: 'EC2 instance', def: 'A virtual server. You pick an image (AMI), a size (instance type), a subnet, security groups and an SSH key pair.' },
		{ term: 'S3 bucket', def: 'Object storage. A bucket holds objects, each found by its key, like `backups/db.sql.gz`. Private by default.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['reg["Region eu-west-1"] --> aza["AZ eu-west-1a"]', 'reg --> azb["AZ eu-west-1b"]'],
				highlight: ['reg', 'aza', 'azb'],
				note: 'A Region is where your stuff lives. Inside it, AZs are isolated from each other. Put everything in one AZ and one AZ failure takes it all down. **Spread over two.**'
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
				note: 'The instance is your server. The **security group** replaces your iptables rules. It is stateful: if SSH in is allowed, the replies go out without an extra rule.'
			},
			{
				add: [
					'role["IAM role, via an instance profile"] -.->|temporary credentials| ec2',
					's3[("S3 bucket: backups")]',
					'ec2 -->|PUT backups/db.sql.gz| s3'
				],
				highlight: ['role', 's3'],
				note: 'Your backup script needs to write to S3. No access keys in `/etc`: you attach a **role** to the instance, and the app gets temporary credentials that AWS rotates for you.'
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
			'This is AWS\'s own sample template (CloudFormation, AWS\'s built-in IaC). You can read it with what you know today: one instance, one security group, one rule.',
			'Look hard at `Default: 192.168.1.0/0`. The `/0` means **zero fixed bits**: as a CIDR it covers every IPv4 address, not one home network. AWS\'s own advice is to allow SSH only from specific ranges. Always set this yourself.',
			'`SecurityGroupIngress` lists what is **allowed** in. There is no "deny" to write: anything not listed is blocked.',
			'`KeyName` is the SSH key pair you log in with. `ImageId` comes from a [public SSM parameter](https://github.com/aws-cloudformation/aws-cloudformation-templates/blob/a0f43bc6d20813052892546f445037cf84c75b54/EC2/EC2InstanceWithSecurityGroupSample.yaml#L71-L73) for the latest Amazon Linux 2 image, so the template needs no hard-coded image id. There is no `IamInstanceProfile`, so apps on this box get no AWS permissions.'
		]
	},
	tradeoff: {
		gain: [
			'A server, a network or a firewall rule in seconds, by API, instead of weeks of tickets.',
			'Two AZs give you two isolated locations in one Region, without building a second data center.',
			'Roles remove long-lived keys from servers. Nothing to leak from `/etc`, nothing to rotate by hand.'
		],
		cost: [
			'Most resources cost money for as long as they exist. A forgotten instance or NAT gateway shows up on the bill.',
			'More moving parts than one LAN: route tables, gateways, security groups and IAM policies must all agree before one packet flows.',
			'A wrong CIDR or a public bucket policy exposes you to the whole internet. Defaults are private, but one rule can undo that.'
		]
	},
	task: {
		prompt: 'Sketch a minimal AWS network for a web app with a load balancer, two web servers and a database. Say which subnets, in which AZs, and the security group rules.',
		hint: 'Only the load balancer should face the internet. A security group rule can name another security group as its source.',
		answer: [
			'One VPC. Two AZs. In each AZ: a **public** subnet (for the load balancer) and a **private** subnet (for web servers and the database).',
			'Load balancer security group: allow HTTP and HTTPS from `0.0.0.0/0`.',
			'Web security group: allow HTTP and HTTPS **only from the load balancer\'s security group**, not from an IP range.',
			'Database security group: allow the database port only from the web security group.',
			'One web server per AZ, so one AZ can fail. Web servers get an IAM role for anything they read in AWS, no access keys.'
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
				'Yes, a new security group allows all inbound traffic',
				'No, a new security group has no inbound rules, so no inbound traffic is allowed',
				'Only if they come from the same Region',
				'Yes, until you add an explicit deny rule'
			],
			answer: 1,
			why: 'A new security group starts with no inbound rules and one outbound rule that allows everything. You can only add allow rules, never deny rules.'
		},
		{
			q: 'Why put your two web servers in subnets in two different Availability Zones?',
			options: [
				'Instances in two AZs cost less',
				'A subnet lives in one AZ, so two AZs let the app survive the loss of one zone',
				'Security groups only work across AZs',
				'S3 can only be reached from a second AZ'
			],
			answer: 1,
			why: 'Each subnet sits entirely in one AZ. AZs are isolated locations, so spreading across two protects you from the failure of one.'
		}
	],
	takeaway: 'Region and AZ are where, VPC and subnets are the network, security groups are the firewall, EC2 is the server, S3 is the storage, and IAM roles are how apps log in. Spread over two AZs, and never put keys on a server.',
	sources: [
		{ title: 'Amazon EC2 docs, Regions and Zones', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html' },
		{ title: 'IAM docs, IAM roles', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html' },
		{ title: 'Amazon VPC docs, Subnets for your VPC', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html' },
		{ title: 'Amazon VPC docs, Security group rules', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html' },
		{ title: 'Amazon S3 docs, What is Amazon S3?', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' }
	]
};
