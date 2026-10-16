const CFN = 'https://github.com/aws-cloudformation/aws-cloudformation-templates/blob/a0f43bc6d20813052892546f445037cf84c75b54';

/** @type {import('../../../content.js').Chapter} */
export default {
	slug: 'aws-essentials',
	part: 'L’infrastructure as code',
	title: 'L’essentiel d’AWS : régions, réseaux, pare-feu et rôles',
	minutes: 10,
	hook: [
		'Dans ton datacenter, un nouveau serveur voulait dire un bon de commande, une place dans une baie, un port de switch, un VLAN, une règle iptables et un compte sur la machine. Des semaines de travail, réparties sur trois équipes.',
		'Dans AWS, chacune de ces étapes est **un appel d’API**. Le datacenter est une Availability Zone. Le VLAN est un subnet. La règle iptables est un security group. Le compte d’une appli est un rôle IAM.',
		'Demain Terraform fera ces appels pour toi. Il manipule six noms : Region et AZ, VPC et subnet, security group, instance EC2, bucket S3 et rôle IAM.'
	],
	terms: [
		{ term: 'Region et Availability Zone (AZ)', def: 'Une Region est une zone géographique séparée, comme `eu-west-1`. Chaque Region a plusieurs emplacements isolés appelés AZ, nommés comme `eu-west-1a`.' },
		{ term: 'Utilisateur IAM ou rôle IAM', def: 'Un utilisateur a des identifiants permanents (un mot de passe, des access keys). Un rôle n’en a aucun : celui qui l’endosse reçoit des identifiants **temporaires**. Les humains et les applis devraient utiliser des rôles.' },
		{ term: 'VPC et subnet', def: 'Un VPC est ton réseau privé, comme `10.0.0.0/16`. Un subnet en est une tranche qui vit dans **exactement une AZ**. Public si sa table de routage envoie le trafic vers une internet gateway, privé sinon.' },
		{ term: 'Security group', def: 'Un pare-feu stateful attaché à une instance. Il n’a **que des règles d’autorisation**. Un nouveau n’a aucune règle entrante, donc rien n’entre tant que tu n’en ajoutes pas.' }
	],
	diagram: {
		direction: 'TD',
		steps: [
			{
				add: ['reg["Region eu-west-1"] --> aza["AZ eu-west-1a"]', 'reg --> azb["AZ eu-west-1b"]'],
				highlight: ['reg', 'aza', 'azb'],
				note: 'Dans une Region, les AZ sont isolées les unes des autres. Si tout tourne dans une seule AZ, une panne de cette AZ arrête tout. Tu répartis donc tes serveurs sur **deux AZ**.'
			},
			{
				add: [
					'reg --> vpc["VPC 10.0.0.0/16"]',
					'vpc --> pub["subnet public 10.0.101.0/24, en 1a"]',
					'vpc --> priv["subnet privé 10.0.1.0/24, en 1b"]',
					'igw["internet gateway"] --> pub'
				],
				highlight: ['vpc', 'pub', 'priv', 'igw'],
				note: 'Un VPC peut contenir des subnets dans plusieurs AZ de sa Region, mais **chaque subnet est dans une seule AZ**. Ce qui rend un subnet public, c’est seulement sa route : une route directe vers l’internet gateway. Un subnet privé a besoin d’un équipement NAT pour sortir sur internet.'
			},
			{
				add: ['sg["security group : autoriser tcp 22 depuis ton IP"] --> ec2["Instance EC2"]', 'pub --> ec2'],
				highlight: ['sg', 'ec2'],
				note: 'L’instance EC2 est un serveur virtuel, lancé depuis une image (AMI) avec un type d’instance et une paire de clés SSH. Le **security group** remplace tes règles iptables. Il est stateful : si le SSH entrant est autorisé, les réponses sortent sans règle en plus.'
			},
			{
				add: [
					'role["Rôle IAM, via un instance profile"] -.->|identifiants temporaires| ec2',
					's3[("Bucket S3 : backups")]',
					'ec2 -->|PUT backups/db.sql.gz| s3'
				],
				highlight: ['role', 's3'],
				note: 'Ton script de sauvegarde écrit dans un bucket S3, qui range les objets par clé, comme `backups/db.sql.gz`. Pas d’access keys dans `/etc` : tu attaches un **rôle** à l’instance, et l’appli reçoit des identifiants temporaires qu’AWS renouvelle pour toi.'
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
			'AWS publie ce template d’exemple en CloudFormation, l’outil d’IaC intégré à AWS. Les lignes 7 à 17 définissent une instance, et les lignes 19 à 31 un security group avec une règle.',
			'La ligne 4 pose `Default: 192.168.1.0/0`. Le `/0` veut dire **zéro bit fixé** : en CIDR, ça couvre toutes les adresses IPv4, pas un réseau domestique. AWS conseille de n’autoriser le SSH que depuis des plages précises, donc fixe cette valeur toi-même.',
			'Les lignes 27 à 31, `SecurityGroupIngress`, listent ce qui est **autorisé** à entrer. Il n’y a pas de « deny » à écrire : tout ce qui n’est pas listé est bloqué.',
			'Ligne 16, `KeyName` est la paire de clés SSH pour te connecter. Ligne 17, `ImageId` vient d’un [paramètre SSM public](https://github.com/aws-cloudformation/aws-cloudformation-templates/blob/a0f43bc6d20813052892546f445037cf84c75b54/EC2/EC2InstanceWithSecurityGroupSample.yaml#L71-L73) pour la dernière image Amazon Linux 2, donc le template n’a pas d’id d’image en dur. Il n’y a pas d’`IamInstanceProfile` : les applis sur cette machine n’ont aucune permission AWS.'
		]
	},
	tradeoff: {
		gain: [
			'Un serveur, un réseau ou une règle de pare-feu en quelques secondes, par API, au lieu de semaines de tickets.',
			'Deux AZ te donnent deux emplacements isolés dans une Region, sans construire un deuxième datacenter.',
			'Avec un rôle, le serveur ne garde aucune clé permanente : aucune clé dans `/etc` ne peut fuiter, et tu n’en renouvelles aucune à la main.'
		],
		cost: [
			'La plupart des ressources coûtent de l’argent tant qu’elles existent. Une instance ou une NAT gateway oubliée finit sur la facture.',
			'Plus de pièces qu’un simple LAN : tables de routage, gateways, security groups et politiques IAM doivent tous être d’accord avant qu’un seul paquet passe.',
			'Un CIDR faux ou une bucket policy publique t’expose à tout internet. Les nouveaux buckets et security groups démarrent fermés, et une seule règle les ouvre.'
		]
	},
	task: {
		prompt: 'Esquisse un réseau AWS minimal pour une appli web avec un load balancer, deux serveurs web et une base de données. Dis quels subnets, dans quelles AZ, et les règles des security groups.',
		hint: 'Seul le load balancer doit faire face à internet. Une règle de security group peut désigner un autre security group comme source.',
		answer: [
			'Un VPC sur deux AZ. Dans chaque AZ, un subnet public accueille le load balancer, et un subnet **privé** accueille les serveurs web et la base.',
			'Security group du load balancer : autoriser HTTP et HTTPS depuis `0.0.0.0/0`.',
			'Security group web : autoriser HTTP et HTTPS **uniquement depuis le security group du load balancer**, pas depuis une plage d’IP.',
			'Security group de la base : autoriser le port de la base uniquement depuis le security group web.',
			'Un serveur web par AZ, pour qu’une AZ puisse tomber. Les serveurs web ont un rôle IAM pour tout ce qu’ils lisent dans AWS, pas d’access keys.'
		]
	},
	quiz: [
		{
			q: 'Une appli sur une instance EC2 doit lire des fichiers dans un bucket S3. Quelle est la bonne façon de lui donner des identifiants ?',
			options: [
				'Créer un utilisateur IAM et mettre ses access keys dans `/etc/app.env`',
				'Attacher un rôle IAM à l’instance, qui reçoit des identifiants temporaires',
				'Rendre le bucket public pour ne pas avoir besoin d’identifiants',
				'Copier les clés de l’utilisateur root du compte sur l’instance'
			],
			answer: 1,
			why: 'Un rôle n’a pas d’identifiants permanents. L’instance en reçoit des temporaires via son instance profile, et tu n’envoies jamais de clés sur le serveur.'
		},
		{
			q: 'Tu crées un nouveau security group, tu l’attaches à une instance et tu n’ajoutes aucune règle. Quelqu’un sur internet peut-il joindre le port 80 ?',
			options: [
				'Oui, un nouveau security group autorise tout le trafic entrant jusqu’à ta première règle',
				'Non, un nouveau security group n’a aucune règle entrante, donc aucun trafic entrant n’est autorisé',
				'Seulement s’il vient de la même Region que le VPC de l’instance',
				'Oui, tant que tu n’ajoutes pas une règle deny explicite pour le port 80'
			],
			answer: 1,
			why: 'Un nouveau security group démarre sans règle entrante et avec une règle sortante qui autorise tout. Tu ne peux ajouter que des règles d’autorisation, jamais de deny.'
		},
		{
			q: 'Pourquoi mettre tes deux serveurs web dans des subnets de deux Availability Zones différentes ?',
			options: [
				'Des instances réparties sur deux AZ coûtent moins cher que deux dans la même zone',
				'Un subnet vit dans une seule AZ, donc deux AZ permettent à l’appli de survivre à la perte d’une zone',
				'Les security groups ne marchent qu’entre AZ, donc une seule AZ laisse les serveurs ouverts',
				'S3 n’est joignable que depuis un subnet placé dans une deuxième AZ'
			],
			answer: 1,
			why: 'Chaque subnet est entièrement dans une AZ. Les AZ sont des emplacements isolés, donc répartir sur deux te protège de la panne de l’une.'
		}
	],
	recall: {
		q: 'Tes deux serveurs web doivent survivre à la perte d’une AZ et écrire dans S3. Où les places-tu, et comment reçoivent-ils leurs identifiants AWS ?',
		a: 'Dans des subnets de deux AZ différentes, car chaque subnet est dans une seule AZ. Chaque instance a un rôle IAM via son instance profile : elle reçoit des identifiants temporaires, et aucune access key ne reste sur le serveur.'
	},
	sources: [
		{ title: 'Doc Amazon EC2, Regions and Zones', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-regions-availability-zones.html' },
		{ title: 'Doc IAM, IAM roles', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html' },
		{ title: 'Doc Amazon VPC, Subnets for your VPC', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/configure-subnets.html' },
		{ title: 'Doc Amazon VPC, Security group rules', url: 'https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html' },
		{ title: 'Doc Amazon S3, What is Amazon S3?', url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' }
	]
};
