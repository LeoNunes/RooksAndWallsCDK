import { Construct } from 'constructs';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { BackendConfig, DnsConfig } from '../../bin/config_def';

interface ElasticBeanstalkAppProps extends BackendConfig {
  appName: string;
  dns?: DnsConfig;
}

// For future reference: https://github.com/aws-samples/aws-elastic-beanstalk-hardened-security-cdk-sample
export class ElasticBeanstalkApp extends Construct {
    constructor(scope: Construct, id: string, props: ElasticBeanstalkAppProps) {
        super(scope, id);

        let hostedZone: route53.IHostedZone | undefined = undefined;
        if (props.dns) {
            hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
                zoneName: props.dns.hostedZoneName,
                hostedZoneId: props.dns.hostedZoneId,
            });
        }

        const ebInstanceRole = new iam.Role(this, `${props.appName}-elasticbeanstalk-ec2-role`, {
            roleName: `${props.appName}-instance-role`,
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });
        ebInstanceRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier')
        );

        const instanceProfileName = `${props.appName}-instance-profile`;
        const instanceProfile = new iam.CfnInstanceProfile(this, instanceProfileName, {
            instanceProfileName: instanceProfileName,
            roles: [
                ebInstanceRole.roleName
            ],
        });

        const ebServiceRole = new iam.Role(this, `${props.appName}-elasticbeanstalk-service-role`, {
            roleName: `${props.appName}-service-role`,
            assumedBy: new iam.ServicePrincipal('elasticbeanstalk.amazonaws.com'),
        });
        ebServiceRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy')
        );
        ebServiceRole.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSElasticBeanstalkEnhancedHealth')
        );

        const ebApp = new elasticbeanstalk.CfnApplication(this, `EBApp_${props.appName}`, {
            applicationName: props.appName,
            description: `Application for ${props.appName}. Managed by CDK.`,
            resourceLifecycleConfig: {
                serviceRole: ebServiceRole.roleArn,
                versionLifecycleConfig: {
                    maxCountRule: {
                        deleteSourceFromS3: true,
                        maxCount: 3,
                        enabled: true,
                    },
                },
            },
        });

        ebApp.addDependency(instanceProfile);

        for (const environment of props.environments) {
            // TODO: Certificates: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/configuring-https-ssl.html
            
            // Ref: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-elasticbeanstalk-configurationtemplate.html
            const ebEnv = new elasticbeanstalk.CfnEnvironment(this, `EBEnv_${props.appName}_${environment.name}`, {
                applicationName: props.appName,
                environmentName: `${props.appName}-${environment.name}`,
                description: environment.description,

                // https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.javase
                solutionStackName: '64bit Amazon Linux 2 v3.4.9 running Corretto 11',

                // Environment options: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/command-options-general.html
                optionSettings: optionsHelper({
                    'aws:autoscaling:launchconfiguration': {
                        'IamInstanceProfile': instanceProfileName,
                        'DisableIMDSv1': 'true',
                    },
                    'aws:autoscaling:asg': {
                        'MinSize': environment.autoscaling.minInstances.toString(),
                        'MaxSize': environment.autoscaling.maxInstances.toString(),
                    },
                    'aws:ec2:instances': {
                        'InstanceTypes': environment.autoscaling.instanceTypes,
                    },
                    // 'aws:ec2:vpc': {
                    //     // https://repost.aws/questions/QUARH0e87FTfaBKPm0BFCmrA/do-elastic-beanstalk-web-server-environment-need-a-public-elastic-ip
                    //     'AssociatePublicIpAddress': 'false',
                    // },
                    'aws:elasticbeanstalk:application': {
                        'Application Healthcheck URL':
                            props.healthCheck.protocol + ':' +
                            props.application.nginxPort.toString() + '/' +
                            removeLeading('/', props.healthCheck.path),
                    },
                    'aws:elasticbeanstalk:application:environment': {
                        // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/java-se-nginx.html
                        'PORT': props.application.servicePort.toString(),
                    },
                    'aws:elasticbeanstalk:cloudwatch:logs': {
                        'StreamLogs': 'true',
                        'DeleteOnTerminate': 'true',
                    },
                    'aws:elasticbeanstalk:environment': {
                        'EnvironmentType': environment.autoscaling.enabled ? 'LoadBalanced' : 'SingleInstance',
                        'ServiceRole': ebServiceRole.roleArn,
                    },
                    'aws:elasticbeanstalk:managedactions': {
                        'ManagedActionsEnabled': 'true',
                        'PreferredStartTime': 'Tue:09:00',
                        'ServiceRoleForManagedUpdates': 'AWSServiceRoleForElasticBeanstalkManagedUpdates',
                    },
                    'aws:elasticbeanstalk:managedactions:platformupdate': {
                        'UpdateLevel': 'minor',
                    },
                    'aws:elb:listener': {
                        'InstancePort': props.application.servicePort.toString(),
                    },
                    // Consider using Application LoadBalancer (aws:elasticbeanstalk:environment:LoadBalancerType).
                    // 'aws:elb:listener' namespace is just for classic load balancer
                    // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/environments-cfg-alb.html
                    // https://stackoverflow.com/questions/60532956/get-a-handle-for-the-application-load-balancer-for-an-elastic-beanstalk-environm
                }),
            });

            ebEnv.addDependency(ebApp);

            if (hostedZone && environment.subdomain) {
                let recordTarget: route53.RecordTarget;
                if (environment.autoscaling.enabled) {
                    // ElasticBeanstalkEnvironmentEndpointTarget (aws-cdk-lib/aws-route53-targets) doesn't support Tokens.
                    // A hardcoded value for the ebEnv.attrEndpointUrl would be needed. Below is the workaround
                    // https://github.com/aws/aws-cdk/pull/16305
                    // https://github.com/aws/aws-cdk/issues/3206

                    recordTarget = route53.RecordTarget.fromAlias({
                        bind: (): route53.AliasRecordTargetConfig => ({
                            dnsName: ebEnv.attrEndpointUrl,
                            hostedZoneId: ALB_CLB_HostedZones[props.awsEnvironment.region],
                        }),
                    });
                }
                else {
                    recordTarget = route53.RecordTarget.fromIpAddresses(ebEnv.attrEndpointUrl);
                }
                    
                const dnsRecord = new route53.ARecord(this, `DNS_ARecord_${props.appName}_${environment.name}`, {
                    recordName: environment.subdomain + (props.dns?.commonSubdomain ? `.${props.dns.commonSubdomain}` : ''),
                    zone: hostedZone,
                    target: recordTarget,
                });

                dnsRecord.node.addDependency(ebEnv);
            }
        }
    }
}

type Option = {
    [namespace: string]: {
        [optionName: string]: string | undefined;
    };
}

function optionsHelper(option: Option) : Array<elasticbeanstalk.CfnEnvironment.OptionSettingProperty> {
    return Object.keys(option).flatMap(namespace => 
        Object.keys(option[namespace])
            .filter(optionName => option[namespace][optionName] !== undefined)
            .map(optionName => ({
                namespace: namespace,
                optionName: optionName,
                value: option[namespace][optionName],
            }))
    );
}

function removeLeading(toRemove: string, string: string): string {
    if (string.startsWith(toRemove)) {
        return string.substring(toRemove.length);
    }
    return string;
}

// https://docs.aws.amazon.com/general/latest/gr/elb.html
const ALB_CLB_HostedZones: Record<string, string> = {
    'us-east-2': 'Z3AADJGX6KTTL2',
    'us-east-1': 'Z35SXDOTRQ7X7K',
    'us-west-1': 'Z368ELLRRE2KJ0',
    'us-west-2': 'Z1H1FL5HABSF5',
    'af-south-1': 'Z268VQBMOI5EKX',
    'ap-east-1': 'Z3DQVH9N71FHZ0',
    'ap-south-2': 'Z0173938T07WNTVAEPZN',
    'ap-southeast-3': 'Z08888821HLRG5A9ZRTER',
    'ap-southeast-4': 'Z09517862IB2WZLPXG76F',
    'ap-south-1': 'ZP97RAFLXTNZK',
    'ap-northeast-3': 'Z5LXEXXYW11ES',
    'ap-northeast-2': 'ZWKZPGTI48KDX',
    'ap-southeast-1': 'Z1LMS91P8CMLE5',
    'ap-southeast-2': 'Z1GM3OXH4ZPM65',
    'ap-northeast-1': 'Z14GRHDCWA56QT',
    'ca-central-1': 'ZQSVJUPU6J1EY',
    'cn-north-1': 'Z1GDH35T77C1KE',
    'cn-northwest-1': 'ZM7IZAIOVVDZF',
    'eu-central-1': 'Z215JYRZR1TBD5',
    'eu-west-1': 'Z32O12XQLNTSW2',
    'eu-west-2': 'ZHURV8PSTC4K8',
    'eu-south-1': 'Z3ULH7SSC9OV64',
    'eu-west-3': 'Z3Q77PNBQS71R4',
    'eu-south-2': 'Z0956581394HF5D5LXGAP',
    'eu-north-1': 'Z23TAZ6LKFMNIO',
    'eu-central-2': 'Z06391101F2ZOEP8P5EB3',
    'me-south-1': 'ZS929ML54UICD',
    'me-central-1': 'Z08230872XQRWHG2XF6I',
    'sa-east-1': 'Z2P70J7HTTTPLU',
    'us-gov-east-1': 'Z166TLBEWOO7G0',
    'us-gov-west-1': 'Z33AYJ8TM3BH4J',
};

const NLB_HostedZones: Record<string, string> = {
    'us-east-2': 'ZLMOA37VPKANP',
    'us-east-1': 'Z26RNL4JYFTOTI',
    'us-west-1': 'Z24FKFUX50B4VW',
    'us-west-2': 'Z18D5FSROUN65G',
    'af-south-1': 'Z203XCE67M25HM',
    'ap-east-1': 'Z12Y7K3UBGUAD1',
    'ap-south-2': 'Z0711778386UTO08407HT',
    'ap-southeast-3': 'Z01971771FYVNCOVWJU1G',
    'ap-southeast-4': 'Z01156963G8MIIL7X90IV',
    'ap-south-1': 'ZVDDRBQ08TROA',
    'ap-northeast-3': 'Z1GWIQ4HH19I5X',
    'ap-northeast-2': 'ZIBE1TIR4HY56',
    'ap-southeast-1': 'ZKVM4W9LS7TM',
    'ap-southeast-2': 'ZCT6FZBF4DROD',
    'ap-northeast-1': 'Z31USIVHYNEOWT',
    'ca-central-1': 'Z2EPGBW3API2WT',
    'cn-north-1': 'Z3QFB96KMJ7ED6',
    'cn-northwest-1': 'ZQEIKTCZ8352D',
    'eu-central-1': 'Z3F0SRJ5LGBH90',
    'eu-west-1': 'Z2IFOLAFXWLO4F',
    'eu-west-2': 'ZD4D7Y8KGAS4G',
    'eu-south-1': 'Z23146JA1KNAFP',
    'eu-west-3': 'Z1CMS0P5QUZ6D5',
    'eu-south-2': 'Z1011216NVTVYADP1SSV',
    'eu-north-1': 'Z1UDT6IFJ4EJM',
    'eu-central-2': 'Z02239872DOALSIDCX66S',
    'me-south-1': 'Z3QSRYVP46NYYV',
    'me-central-1': 'Z00282643NTTLPANJJG2P',
    'sa-east-1': 'ZTK26PT1VY4CU',
    'us-gov-east-1': 'Z1ZSMQQ6Q24QQ8',
    'us-gov-west-1': 'ZMG1MZ2THAWF1',
};
