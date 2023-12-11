import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EbApplication } from './eb_application';
import { CertificatesBucket } from './certificates_bucket';
import { EnvironmentConfig } from '../../config/config_def';

interface EbEnvironmentProps extends EnvironmentConfig {
    ebApplication: EbApplication;
    certificatesBucket?: CertificatesBucket;
}

export class EbEnvironment extends Construct {
    readonly endpointUrl: string;

    constructor(scope: Construct, id: string, props: EbEnvironmentProps) {
        super(scope, id);

        let vpc: ec2.IVpc | undefined = undefined;
        let securityGroup: ec2.SecurityGroup | undefined = undefined;
        if (!props.instances.autoscalingEnabled) {
            vpc = ec2.Vpc.fromLookup(
                this,
                `${props.ebApplication.applicationName}_${props.name}_VPC`,
                {
                    isDefault: true,
                },
            );

            if (props.application.httpsEnabled) {
                // A security group is created by default allowing TCP on port 80 and allowing all outbound. This creates a different security group.
                securityGroup = new ec2.SecurityGroup(
                    this,
                    `${props.ebApplication.applicationName}_${props.name}_SecurityGroup`,
                    {
                        vpc: vpc,
                        securityGroupName: `${props.ebApplication.applicationName}_${props.name}`,
                    },
                );
                securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443));
                cdk.Tags.of(securityGroup).add(
                    'Name',
                    `${props.ebApplication.applicationName}-${props.name}`,
                );
            }
        }

        // Ref: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-elasticbeanstalk-configurationtemplate.html
        const ebEnv = new elasticbeanstalk.CfnEnvironment(
            this,
            `EBEnv_${props.ebApplication.applicationName}_${props.name}`,
            {
                applicationName: props.ebApplication.applicationName,
                environmentName: `${props.ebApplication.applicationName}-${props.name}`,
                description: props.description,
                // https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.javase
                solutionStackName: '64bit Amazon Linux 2 v3.4.9 running Corretto 11',
                optionSettings: this.getEnvironmentOptions(props, vpc, securityGroup),
            },
        );

        this.endpointUrl = ebEnv.attrEndpointUrl;
    }

    private getEnvironmentOptions(
        props: EbEnvironmentProps,
        vpc?: ec2.IVpc,
        securityGroup?: ec2.SecurityGroup,
    ) {
        // Environment options: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/command-options-general.html
        const optionSettings: Options = {
            'aws:autoscaling:launchconfiguration': {
                IamInstanceProfile: props.ebApplication.instanceProfileName,
                DisableIMDSv1: 'true',
            },
            'aws:ec2:instances': {
                InstanceTypes: props.instances.instanceType,
            },
            // 'aws:ec2:vpc': {
            //     // https://repost.aws/questions/QUARH0e87FTfaBKPm0BFCmrA/do-elastic-beanstalk-web-server-environment-need-a-public-elastic-ip
            //     'AssociatePublicIpAddress': 'false',
            // },
            'aws:elasticbeanstalk:application': {
                'Application Healthcheck URL':
                    props.healthCheck.protocol +
                    ':' +
                    props.healthCheck.port.toString() +
                    '/' +
                    removeLeading('/', props.healthCheck.path),
            },
            'aws:elasticbeanstalk:application:environment': {
                // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/java-se-nginx.html
                PORT: props.application.servicePort.toString(),
                INSTANCE_ROLE: props.ebApplication.instanceRole.roleName,
            },
            'aws:elasticbeanstalk:cloudwatch:logs': {
                StreamLogs: 'true',
                DeleteOnTerminate: 'true',
            },
            'aws:elasticbeanstalk:environment': {
                EnvironmentType: props.instances.autoscalingEnabled
                    ? 'LoadBalanced'
                    : 'SingleInstance',
                ServiceRole: props.ebApplication.serviceRole.roleArn,
            },
            'aws:elasticbeanstalk:managedactions': {
                ManagedActionsEnabled: 'true',
                PreferredStartTime: 'Tue:09:00',
                ServiceRoleForManagedUpdates: 'AWSServiceRoleForElasticBeanstalkManagedUpdates',
            },
            'aws:elasticbeanstalk:managedactions:platformupdate': {
                UpdateLevel: 'minor',
            },
        };

        if (props.instances.autoscalingEnabled) {
            appendOptions(optionSettings, {
                'aws:autoscaling:asg': {
                    MinSize: props.instances.minInstances.toString(),
                    MaxSize: props.instances.maxInstances.toString(),
                },
                // Consider using Application LoadBalancer (aws:elasticbeanstalk:environment:LoadBalancerType).
                // 'aws:elb:listener' namespace is just for classic load balancer
                // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/environments-cfg-alb.html
                // https://stackoverflow.com/questions/60532956/get-a-handle-for-the-application-load-balancer-for-an-elastic-beanstalk-environm
                'aws:elb:listener': {
                    InstancePort: props.application.servicePort.toString(),
                },
            });
        }

        if (props.certificatesBucket !== undefined) {
            appendOptions(optionSettings, {
                'aws:elasticbeanstalk:application:environment': {
                    CERT_S3: props.certificatesBucket.bucket.bucketName,
                    CERT_PATH:
                        props.certificatesBucket.bucket.bucketRegionalDomainName +
                        '/' +
                        props.certificatesBucket.pathForEnvironment(props.name),
                },
            });
        }

        if (vpc !== undefined) {
            appendOptions(optionSettings, {
                'aws:ec2:vpc': {
                    VPCId: vpc.vpcId,
                    Subnets: vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
                },
            });
        }

        if (securityGroup !== undefined) {
            appendOptions(optionSettings, {
                'aws:autoscaling:launchconfiguration': {
                    SecurityGroups: securityGroup.securityGroupId,
                },
            });
        }

        return optionsHelper(optionSettings);
    }
}

type Options = {
    [namespace: string]: {
        [optionName: string]: string | undefined;
    };
};

function appendOptions(opt: Options, toAppend: Options) {
    for (const key of Object.keys(toAppend)) {
        opt[key] = {
            ...opt[key],
            ...toAppend[key],
        };
    }
}

function optionsHelper(
    option: Options,
): Array<elasticbeanstalk.CfnEnvironment.OptionSettingProperty> {
    return Object.keys(option).flatMap(namespace =>
        Object.keys(option[namespace])
            .filter(optionName => option[namespace][optionName] !== undefined)
            .map(optionName => ({
                namespace: namespace,
                optionName: optionName,
                value: option[namespace][optionName],
            })),
    );
}

function removeLeading(toRemove: string, string: string): string {
    if (string.startsWith(toRemove)) {
        return string.substring(toRemove.length);
    }
    return string;
}
