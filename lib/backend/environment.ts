import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { DnsConfig, EnvironmentConfig } from '../config/config_def';
import cloudWatchConfigFactory from '../../assets/ec2_config/cloudwatch-config-factory';

interface EnvironmentStackProps {
    stackProps: cdk.StackProps;
    appName: string;
    environment: EnvironmentConfig;
    dns?: DnsConfig;
}

export class EnvironmentStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EnvironmentStackProps) {
        super(scope, id, props.stackProps);

        this.createInstance(props);
    }

    private createInstance(props: EnvironmentStackProps) {
        const { appName, environment } = props;

        const vpc = this.createVPC();
        const securityGroup = this.createSecurityGroup(props, vpc);
        const role = this.createInstanceRole(props);
        const secret = this.createEnvironmentSecret(props, role);
        const init = this.createCfnInit(props);
        this.createLogGroups(props);

        // https://docs.aws.amazon.com/cdk/api/v1/docs/aws-ec2-readme.html#configuring-instance-metadata-service-imds
        const instance = new ec2.Instance(this, 'Instance', {
            vpc: vpc,
            role: role,
            securityGroup: securityGroup,
            instanceType: new ec2.InstanceType(environment.instances.instanceType),
            machineImage: ec2.MachineImage.latestAmazonLinux2(),
            init: init,
            initOptions: {
                configSets: ['default'],
            },
        });

        this.createElasticIpAndDns(props, instance);

        this.tag(secret, appName, environment.name);
        this.tag(role, appName, environment.name);
        this.tag(securityGroup, appName, environment.name);
        this.tag(instance, appName, environment.name);
    }

    private createEnvironmentSecret(props: EnvironmentStackProps, role: iam.IRole) {
        const { appName, environment } = props;

        const secret = new secretsmanager.Secret(this, 'EnvironmentSecrets', {
            secretName: `games/${environment.name.toLowerCase()}/secrets`,
            description: `Secrets for ${appName} backend ${environment.name} environment`,
            secretObjectValue: {
                CHANGE: cdk.SecretValue.unsafePlainText('ME'),
            },
        });
        secret.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
        secret.grantRead(role);

        return secret;
    }

    private createElasticIpAndDns(props: EnvironmentStackProps, instance: ec2.Instance) {
        const { appName, environment, dns } = props;

        const eip = new ec2.CfnEIP(this, 'InstanceElasticIp', {
            domain: 'vpc',
        });
        new ec2.CfnEIPAssociation(this, 'InstanceElasticIpAssociation', {
            allocationId: eip.attrAllocationId,
            instanceId: instance.instanceId,
        });

        if (dns === undefined || environment.subdomain === undefined) {
            return;
        }

        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            zoneName: dns.hostedZoneName,
            hostedZoneId: dns.hostedZoneId,
        });

        const recordName =
            environment.subdomain + (dns.commonSubdomain ? `.${dns.commonSubdomain}` : '');
        new route53.ARecord(this, `DNS_ARecord_${appName}_${environment.name}`, {
            recordName: recordName,
            zone: hostedZone,
            target: route53.RecordTarget.fromIpAddresses(eip.ref),
        });
    }

    private createVPC() {
        return ec2.Vpc.fromLookup(this, 'VPC', {
            isDefault: true,
        });
    }

    private createSecurityGroup(props: EnvironmentStackProps, vpc: ec2.IVpc) {
        const { appName, environment } = props;

        const securityGroup = new ec2.SecurityGroup(this, 'InstanceSecurityGroup', {
            vpc: vpc,
            securityGroupName: `${appName}-BE-${environment.name}-InstanceSG`,
            description: `Security Group for the instances in ${appName} ${environment.name} environment`,
            allowAllOutbound: true,
        });

        if (environment.application.httpsEnabled) {
            // Keep only web-facing ports public when TLS is terminated on-instance.
            securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access');
            securityGroup.addIngressRule(
                ec2.Peer.anyIpv4(),
                ec2.Port.tcp(443),
                'Allow HTTPS access',
            );
        } else {
            securityGroup.addIngressRule(
                ec2.Peer.anyIpv4(),
                ec2.Port.tcp(environment.application.servicePort),
                'Allow application port access',
            );
        }
        return securityGroup;
    }

    private createInstanceRole(props: EnvironmentStackProps) {
        const { appName, environment } = props;

        const role = new iam.Role(this, 'InstancesRole', {
            roleName: `${appName}-BE-${environment.name}-instance-role`,
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });
        role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        );
        role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
        );
        role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'service-role/AmazonEC2RoleforAWSCodeDeploy',
            ),
        );
        return role;
    }

    private createCfnInit(props: EnvironmentStackProps) {
        const { appName, environment } = props;

        const cloudWatchRestartHandle = new ec2.InitServiceRestartHandle();
        const codeDeployRestartHandle = new ec2.InitServiceRestartHandle();
        const initData = ec2.CloudFormationInit.fromConfigSets({
            configSets: { default: ['envVariables', 'preInstall', 'cloudWatch', 'codeDeploy'] },
            configs: {
                envVariables: new ec2.InitConfig([
                    ec2.InitFile.fromString(
                        '/etc/games/infra.env',
                        this.getServiceEnvironmentVariables(props),
                    ),
                ]),
                preInstall: new ec2.InitConfig([
                    ec2.InitCommand.shellCommand('sudo yum update -y'),
                    ec2.InitPackage.yum('ruby'),
                    ec2.InitPackage.yum('wget'),
                ]),
                cloudWatch: new ec2.InitConfig([
                    // There is a bug with ec2.InitFile.fromObject. Using fromString for now.
                    // https://github.com/aws/aws-cdk/issues/28561
                    ec2.InitFile.fromString(
                        '/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json',
                        JSON.stringify(cloudWatchConfigFactory(appName, environment.name)),
                        { serviceRestartHandles: [cloudWatchRestartHandle] },
                    ),
                    ec2.InitPackage.yum('amazon-cloudwatch-agent', {
                        serviceRestartHandles: [cloudWatchRestartHandle],
                    }),
                    ec2.InitService.enable('amazon-cloudwatch-agent', {
                        serviceManager: ec2.ServiceManager.SYSTEMD,
                        serviceRestartHandle: cloudWatchRestartHandle,
                    }),
                ]),
                codeDeploy: new ec2.InitConfig([
                    ec2.InitFile.fromUrl(
                        '/tmp/amazon-codedeploy-install',
                        this.codeDeployInstallUrl(props),
                    ),
                    ec2.InitCommand.shellCommand('chmod +x /tmp/amazon-codedeploy-install'),
                    ec2.InitCommand.shellCommand('/tmp/amazon-codedeploy-install auto', {
                        serviceRestartHandles: [codeDeployRestartHandle],
                    }),
                    ec2.InitService.enable('codedeploy-agent', {
                        serviceManager: ec2.ServiceManager.SYSTEMD,
                        serviceRestartHandle: codeDeployRestartHandle,
                    }),
                ]),
            },
        });
        return initData;
    }

    private getServiceEnvironmentVariables(props: EnvironmentStackProps) {
        const variables: Record<Uppercase<string>, string> = {
            PORT: props.environment.application.servicePort.toString(),
            GAMES_ENVIRONMENT: props.environment.name.toLowerCase(),
            GAMES_SECRET_NAME: `games/${props.environment.name.toLowerCase()}/secrets`,
        };
        const serverName = this.serverName(props);
        if (serverName !== undefined) {
            variables.GAMES_SERVER_NAME = serverName;
        }
        if (props.environment.subdomain !== undefined) {
            variables.GAMES_SUBDOMAIN = props.environment.subdomain;
        }
        if (props.dns?.commonSubdomain !== undefined) {
            variables.GAMES_COMMON_SUBDOMAIN = props.dns.commonSubdomain;
        }
        if (props.dns?.hostedZoneName !== undefined) {
            variables.GAMES_HOSTED_ZONE_NAME = props.dns.hostedZoneName;
        }

        return Object.keys(variables)
            .map(k => `${k}=${variables[k as Uppercase<string>]}`)
            .join('\n');
    }

    private serverName(props: EnvironmentStackProps) {
        const { environment, dns } = props;
        if (environment.subdomain === undefined || dns?.hostedZoneName === undefined) {
            return undefined;
        }

        return [
            environment.subdomain,
            dns.commonSubdomain,
            dns.hostedZoneName,
        ]
            .filter((value): value is string => value !== undefined && value.length > 0)
            .join('.');
    }

    private codeDeployInstallUrl(props: EnvironmentStackProps) {
        // TODO: Consider using Mappings to support unknown region at synth time.
        // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/mappings-section-structure.html
        const {
            stackProps: { env },
        } = props;

        if (env?.region === undefined || !Object.keys(codeDeployInstallUrl).includes(env.region)) {
            return codeDeployInstallUrl['us-west-2'];
        }

        return codeDeployInstallUrl[env?.region as keyof typeof codeDeployInstallUrl];
    }

    createLogGroups(props: EnvironmentStackProps) {
        const { appName, environment } = props;

        const logGroups = [
            `cloudwatch-agent-log`,
            `codedeploy-agent-log`,
            `codedeploy-agent-deployment-log`,
            `codedeploy-agent-updater-log`,
        ];

        for (const logGroup of logGroups) {
            new logs.LogGroup(this, `${logGroup}-LogGroup`, {
                logGroupName: `${appName}/BE/${environment.name}/${logGroup}`,
                retention: logs.RetentionDays.ONE_WEEK,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
            });
        }
    }

    private tag(construct: Construct, appName: string, environmentName: string) {
        cdk.Tags.of(construct).add('application', appName);
        cdk.Tags.of(construct).add('environment', environmentName);
    }
}

interface EnvironmentStageProps extends cdk.StageProps, EnvironmentStackProps {}

export class EnvironmentStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: EnvironmentStageProps) {
        super(scope, id, props);

        new EnvironmentStack(this, 'EnvironmentStack', props);
    }
}

const codeDeployInstallUrl = {
    'us-east-1': `https://aws-codedeploy-us-east-1.s3.us-east-1.amazonaws.com/latest/install`,
    'us-east-2': `https://aws-codedeploy-us-east-2.s3.us-east-2.amazonaws.com/latest/install`,
    'us-west-1': `https://aws-codedeploy-us-west-1.s3.us-west-1.amazonaws.com/latest/install`,
    'us-west-2': `https://aws-codedeploy-us-west-2.s3.us-west-2.amazonaws.com/latest/install`,
    'af-south-1': `https://aws-codedeploy-af-south-1.s3.af-south-1.amazonaws.com/latest/install`,
    'ap-east-1': `https://aws-codedeploy-ap-east-1.s3.ap-east-1.amazonaws.com/latest/install`,
    'ap-south-2': `https://aws-codedeploy-ap-south-2.s3.ap-south-2.amazonaws.com/latest/install`,
    'ap-southeast-3': `https://aws-codedeploy-ap-southeast-3.s3.ap-southeast-3.amazonaws.com/latest/install`,
    'ap-southeast-4': `https://aws-codedeploy-ap-southeast-4.s3.ap-southeast-4.amazonaws.com/latest/install`,
    'ap-south-1': `https://aws-codedeploy-ap-south-1.s3.ap-south-1.amazonaws.com/latest/install`,
    'ap-northeast-3': `https://aws-codedeploy-ap-northeast-3.s3.ap-northeast-3.amazonaws.com/latest/install`,
    'ap-northeast-2': `https://aws-codedeploy-ap-northeast-2.s3.ap-northeast-2.amazonaws.com/latest/install`,
    'ap-southeast-1': `https://aws-codedeploy-ap-southeast-1.s3.ap-southeast-1.amazonaws.com/latest/install`,
    'ap-southeast-2': `https://aws-codedeploy-ap-southeast-2.s3.ap-southeast-2.amazonaws.com/latest/install`,
    'ap-northeast-1': `https://aws-codedeploy-ap-northeast-1.s3.ap-northeast-1.amazonaws.com/latest/install`,
    'ca-central-1': `https://aws-codedeploy-ca-central-1.s3.ca-central-1.amazonaws.com/latest/install`,
    'eu-central-1': `https://aws-codedeploy-eu-central-1.s3.eu-central-1.amazonaws.com/latest/install`,
    'eu-west-1': `https://aws-codedeploy-eu-west-1.s3.eu-west-1.amazonaws.com/latest/install`,
    'eu-west-2': `https://aws-codedeploy-eu-west-2.s3.eu-west-2.amazonaws.com/latest/install`,
    'eu-south-1': `https://aws-codedeploy-eu-south-1.s3.eu-south-1.amazonaws.com/latest/install`,
    'eu-west-3': `https://aws-codedeploy-eu-west-3.s3.eu-west-3.amazonaws.com/latest/install`,
    'eu-south-2': `https://aws-codedeploy-eu-south-2.s3.eu-south-2.amazonaws.com/latest/install`,
    'eu-north-1': `https://aws-codedeploy-eu-north-1.s3.eu-north-1.amazonaws.com/latest/install`,
    'eu-central-2': `https://aws-codedeploy-eu-central-2.s3.eu-central-2.amazonaws.com/latest/install`,
    'il-central-1': `https://aws-codedeploy-il-central-1.s3.il-central-1.amazonaws.com/latest/install`,
    'me-south-1': `https://aws-codedeploy-me-south-1.s3.me-south-1.amazonaws.com/latest/install`,
    'me-central-1': `https://aws-codedeploy-me-central-1.s3.me-central-1.amazonaws.com/latest/install`,
    'sa-east-1': `https://aws-codedeploy-sa-east-1.s3.sa-east-1.amazonaws.com/latest/install`,
    'us-gov-east-1': `https://aws-codedeploy-us-gov-east-1.s3.us-gov-east-1.amazonaws.com/latest/install`,
    'us-gov-west-1': `https://aws-codedeploy-us-gov-west-1.s3.us-gov-west-1.amazonaws.com/latest/install`,
} as const;
