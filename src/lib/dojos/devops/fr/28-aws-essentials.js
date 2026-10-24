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
		],
		steps: [
			{
				title: 'Choisis les AZ',
				questions: [
					{ q: 'Tu travailles dans la Region `eu-west-1`. Quelle paire nomme deux AZ utilisables pour cette appli ?', options: ['`eu-west-1` et `us-east-1`', '`eu-west-1a` et `eu-west-1b`', '`eu-west-1a` et `us-east-1a`', '`eu-west-1` seule'], answer: 1, why: 'Les AZ sont des emplacements isolés dans une Region, nommés d’après elle avec une lettre. `us-east-1` est une autre Region.' },
					{ q: 'L’AZ `eu-west-1a` tombe. Avec un serveur web par AZ, qu’est-ce qui sert encore les utilisateurs ?', options: ['Rien : le VPC est tombé', 'Seulement la base', 'Le load balancer et le serveur web de `eu-west-1b`', 'Le serveur web de `eu-west-1a`, depuis sa sauvegarde'], answer: 2, why: 'Les subnets de 1b ont leur propre nœud de load balancer et leur serveur web. Les AZ tombent indépendamment, donc 1b continue de tourner.' },
					{ q: 'Le VPC est `10.0.0.0/16`. Quelle plage convient à un de ses subnets ?', options: ['`10.0.2.0/24`', '`10.1.0.0/24`', '`192.168.1.0/24`', '`0.0.0.0/0`'], answer: 0, why: 'Un subnet est une tranche de la plage du VPC, comme `10.0.1.0/24` et `10.0.101.0/24` dans le schéma. Les autres sont en dehors de `10.0.0.0/16`.' },
					{ q: 'Alors, comment organises-tu les subnets ?', options: ['Un grand subnet sur les deux AZ', 'Un subnet public en 1a, un subnet privé en 1b', 'Un subnet par serveur', 'Un subnet public et un subnet privé dans chaque AZ'], answer: 3, why: 'Chaque AZ a besoin d’une place pour le load balancer et d’une place pour les serveurs derrière lui.' }
				]
			},
			{
				title: 'Sépare public et privé',
				questions: [
					{ q: 'Quelle partie fait face à internet ?', options: ['Seulement le load balancer', 'Le load balancer et les serveurs web', 'Les serveurs web et la base', 'Tous'], answer: 0, why: 'Les serveurs web et la base n’ont aucune raison d’être joignables de l’extérieur.' },
					{ q: 'Où vont les serveurs web ?', options: ['Dans les subnets publics, à côté du load balancer', 'Dans un VPC à part', 'Dans les subnets privés', 'Dans S3'], answer: 2, why: 'Ils n’ont besoin que du trafic du load balancer, donc ils restent privés.' },
					{ q: 'Qu’est-ce qui rend un subnet public ?', options: ['Sa plage CIDR', 'Le nom que tu lui donnes', 'Des clés publiques sur ses instances', 'Une route vers l’internet gateway dans sa table de routage'], answer: 3, why: 'Public ou privé, c’est seulement une question de route.' },
					{ q: 'Un serveur web dans un subnet privé doit télécharger des mises à jour. De quoi a-t-il besoin ?', options: ['D’un security group qui autorise tout le trafic entrant', 'D’un équipement NAT', 'D’une deuxième internet gateway', 'D’un utilisateur IAM'], answer: 1, why: 'Un subnet privé n’a pas de route vers l’internet gateway, donc il sort par le NAT.' }
				]
			},
			{
				title: 'Écris les règles',
				questions: [
					{ q: 'Que laisse entrer le security group du load balancer ?', options: ['HTTP et HTTPS depuis `0.0.0.0/0`', 'SSH depuis `0.0.0.0/0`', 'Tout ce qui vient des serveurs web', 'Rien : un load balancer n’a pas besoin de règles'], answer: 0, why: 'C’est le seul point d’entrée public, donc il accepte le trafic web de partout.' },
					{ q: 'Que laisse entrer le security group web ?', options: ['HTTP et HTTPS depuis `0.0.0.0/0`', 'HTTP et HTTPS depuis `10.0.0.0/16`', 'HTTP et HTTPS uniquement depuis le security group du load balancer', 'Le port de la base depuis la base'], answer: 2, why: 'Une règle peut désigner un autre security group comme source. Seul le load balancer passe.' },
					{ q: 'Que laisse entrer le security group de la base ?', options: ['Le port de la base depuis le load balancer', 'Le port de la base uniquement depuis le security group web', 'Tous les ports depuis le VPC', 'Le port de la base depuis ton IP perso'], answer: 1, why: 'Seuls les serveurs web parlent à la base.' },
					{ q: 'Tu copies une règle SSH du template d’exemple, avec sa valeur par défaut `192.168.1.0/0`. Qui peut joindre le port 22 ?', options: ['Seulement ton réseau perso, `192.168.1.x`', 'Personne : `/0` est une plage vide', 'Seulement les adresses du VPC', 'Toutes les adresses IPv4'], answer: 3, why: '`/0` veut dire zéro bit fixé, donc la plage couvre tout internet. N’autorise SSH que depuis une plage précise que tu choisis toi-même.' }
				]
			},
			{
				title: 'Donne l’accès aux serveurs',
				questions: [
					{ q: 'Tu lances le serveur de base depuis le template d’exemple, qui n’a pas d’`IamInstanceProfile`. Que peuvent faire ses applis dans l’API AWS ?', options: ['Rien : elles n’ont aucune permission AWS', 'Tout ce que le compte peut faire', 'Seulement lire S3', 'Ce que permet le rôle des serveurs web'], answer: 0, why: 'Sans instance profile, aucun rôle n’arrive jusqu’à l’instance, donc elle n’a aucune permission AWS. La base n’en a pas besoin ici.' },
					{ q: 'Tu crées un nouveau bucket pour les fichiers envoyés à l’appli. Qui peut le lire avant que tu ajoutes une policy ?', options: ['N’importe qui sur internet', 'Chaque instance du VPC', 'Personne de l’extérieur : un nouveau bucket démarre fermé', 'Seulement le load balancer'], answer: 2, why: 'Les nouveaux buckets et security groups démarrent fermés. Une règle ou une policy suffit à les ouvrir, c’est donc là qu’il faut faire attention.' },
					{ q: 'Un développeur doit lire le même bucket depuis son portable. Que doit-il utiliser ?', options: ['Des access keys copiées depuis un serveur web', 'Un rôle qu’il endosse, comme les serveurs', 'Les clés de l’utilisateur root', 'La paire de clés SSH des serveurs web'], answer: 1, why: 'Les humains et les applis devraient utiliser des rôles. Un serveur web n’a de toute façon aucune clé à copier, et les clés root ouvrent tout le compte.' },
					{ q: 'Le security group web laisse entrer le HTTPS du load balancer. Les réponses ont-elles besoin d’une règle sortante ?', options: ['Oui, une par port', 'Oui, vers l’IP du load balancer', 'Seulement pour le HTTPS', 'Non : les security groups sont stateful'], answer: 3, why: 'Les réponses au trafic entrant autorisé sortent sans règle en plus.' }
				]
			}
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
	lab: {
		minutes: 25,
		goal: 'Construire le réseau, le pare-feu, le rôle et le bucket du chapitre avec de vrais appels AWS CLI, contre LocalStack sur ta machine, sans rien payer.',
		steps: [
			'Lance LocalStack et attends-le : `docker run -d --rm --name aws-lab -e AWS_DEFAULT_REGION=eu-west-1 localstack/localstack:4.0`, puis `until docker logs aws-lab 2>&1 | grep -q Ready; do sleep 1; done`. Donne à ton shell une commande courte : `awslocal() { docker exec aws-lab awslocal "$@"; }`.',
			'Liste les AZ avec `awslocal ec2 describe-availability-zones --query "AvailabilityZones[].ZoneName" --output text`. Crée le VPC : `VPC=$(awslocal ec2 create-vpc --cidr-block 10.0.0.0/16 --query Vpc.VpcId --output text)`. Ajoute un subnet par AZ : `awslocal ec2 create-subnet --vpc-id $VPC --cidr-block 10.0.101.0/24 --availability-zone eu-west-1a`, puis la même chose avec `10.0.1.0/24` dans `eu-west-1b`.',
			'Crée un security group : `SG=$(awslocal ec2 create-security-group --group-name web --description "lab web" --vpc-id $VPC --query GroupId --output text)`. Lis ses règles avec `awslocal ec2 describe-security-groups --group-ids $SG --query "SecurityGroups[0].[IpPermissions,IpPermissionsEgress]"`, puis autorise SSH depuis une seule adresse : `awslocal ec2 authorize-security-group-ingress --group-id $SG --protocol tcp --port 22 --cidr 203.0.113.7/32`, et relis les règles.',
			'Crée un rôle qu’EC2 peut endosser, et son instance profile : `awslocal iam create-role --role-name backup-role --assume-role-policy-document \'{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}\'`, `awslocal iam create-instance-profile --instance-profile-name backup-profile`, `awslocal iam add-role-to-instance-profile --instance-profile-name backup-profile --role-name backup-role`. Puis le bucket : `awslocal s3 mb s3://lab-backups && awslocal s3api put-object --bucket lab-backups --key backups/db.sql.gz`.',
			'Démarre une instance dans le subnet de `eu-west-1a` avec tout ça : `SUB=$(awslocal ec2 describe-subnets --filters Name=cidr-block,Values=10.0.101.0/24 --query "Subnets[0].SubnetId" --output text)`, `AMI=$(awslocal ec2 describe-images --owners amazon --query "Images[0].ImageId" --output text)`, puis `awslocal ec2 run-instances --image-id $AMI --instance-type t3.micro --subnet-id $SUB --security-group-ids $SG --iam-instance-profile Name=backup-profile`. Nettoie avec `docker stop aws-lab` : `--rm` supprime le conteneur et tout ce qu’il contient.'
		],
		done: [
			'`awslocal ec2 describe-subnets --filters Name=vpc-id,Values=$VPC --query "Subnets[].[CidrBlock,AvailabilityZone]" --output text` montre `10.0.101.0/24 eu-west-1a` et `10.0.1.0/24 eu-west-1b`.',
			'Le nouveau security group montre `[]` en entrée et une règle sortante vers `0.0.0.0/0`. Après l’appel authorize, l’entrée ne contient que tcp 22 depuis `203.0.113.7/32`.',
			'`awslocal s3 ls s3://lab-backups --recursive` liste `backups/db.sql.gz`.',
			'`awslocal ec2 describe-instances --query "Reservations[].Instances[].[State.Name,Placement.AvailabilityZone,IamInstanceProfile.Arn]" --output text` montre `running`, `eu-west-1a` et l’ARN de `backup-profile`.'
		],
		solution: [
			'`create-subnet` prend une seule `--availability-zone`, jamais deux, donc deux AZ demandent deux subnets. Rien ici ne route vers une internet gateway, donc les deux subnets sont en fait privés.',
			'Un nouveau security group ne laisse rien entrer et tout sortir. Il n’y a pas d’appel pour interdire : `authorize-security-group-ingress` est la seule façon de l’ouvrir, une source autorisée à la fois.',
			'La trust policy dit qui peut endosser le rôle, ici `ec2.amazonaws.com`. L’instance profile porte le rôle jusqu’à l’instance, et aucune access key n’a été créée à aucune étape. Un vrai rôle reçoit aussi une policy qui autorise `s3:PutObject` sur le bucket.',
			'LocalStack répond à l’API mais n’applique ni les security groups ni IAM. Sur un vrai compte, les mêmes commandes marchent avec `aws` à la place de `awslocal`, et l’instance coûte de l’argent tant que tu ne la termines pas.'
		]
	},
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
