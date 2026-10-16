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
