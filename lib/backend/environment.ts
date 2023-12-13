import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EnvironmentConfig } from '../config/config_def';

interface EnvironmentStackProps {
    stackProps: cdk.StackProps;
    appName: string;
    environment: EnvironmentConfig;
}

export class EnvironmentStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EnvironmentStackProps) {
        super(scope, id, props.stackProps);

        this.createInstance(props);
    }

    private createInstance(props: EnvironmentStackProps) {
        const { appName, environment } = props;

        const vpc = ec2.Vpc.fromLookup(this, `${appName}-${environment.name}-VPC`, {
            isDefault: true,
        });

        const securityGroup = new ec2.SecurityGroup(
            this,
            `${appName}-${environment.name}-InstanceSecurityGroup`,
            {
                vpc: vpc,
                securityGroupName: `${appName}_${environment.name}_Instances`,
                description: `Security Group for the instances in ${appName} ${environment.name} environment`,
                allowAllOutbound: true,
            },
        );

        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH access');
        securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP access');
        if (environment.application.httpsEnabled) {
            securityGroup.addIngressRule(
                ec2.Peer.anyIpv4(),
                ec2.Port.tcp(443),
                'Allow HTTPS access',
            );
        }

        const role = new iam.Role(this, `${appName}-instance-role`, {
            roleName: `${appName}-${environment.name}-instance-role`,
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });
        role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        );
        role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                'service-role/AmazonEC2RoleforAWSCodeDeploy',
            ),
        );

        const instance = new ec2.Instance(this, `${appName}-${environment.name}-Instance`, {
            vpc: vpc,
            role: role,
            securityGroup: securityGroup,
            instanceType: new ec2.InstanceType(environment.instances.instanceType),
            machineImage: ec2.MachineImage.latestAmazonLinux2(),
        });

        cdk.Tags.of(role).add('application', appName);
        cdk.Tags.of(role).add('environment', environment.name);
        cdk.Tags.of(securityGroup).add('application', appName);
        cdk.Tags.of(securityGroup).add('environment', environment.name);
        cdk.Tags.of(instance).add('application', appName);
        cdk.Tags.of(instance).add('environment', environment.name);
    }
}

interface EnvironmentStageProps extends cdk.StageProps, EnvironmentStackProps {}

export class EnvironmentStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: EnvironmentStageProps) {
        super(scope, id, props);

        new EnvironmentStack(
            this,
            `${props.appName}-${props.environment.name}-EnvironmentStack`,
            props,
        );
    }
}
