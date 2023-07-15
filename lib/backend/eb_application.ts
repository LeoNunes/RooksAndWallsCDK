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
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        });
          
        const webTierPolicy = iam.ManagedPolicy.fromAwsManagedPolicyName('AWSElasticBeanstalkWebTier');
        ebInstanceRole.addManagedPolicy(webTierPolicy);
          
        const profileName = `${props.appName}-instance-profile`;
        const instanceProfile = new iam.CfnInstanceProfile(this, profileName, {
            instanceProfileName: profileName,
            roles: [
                ebInstanceRole.roleName
            ],
        });

        const ebApp = new elasticbeanstalk.CfnApplication(this, `EBApp_${props.appName}`, {
            applicationName: props.appName,
            description: `Environment for the ${props.appName}. Managed by CDK.`,
            // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/applications-lifecycle.html
            // resourceLifecycleConfig: {
            //     serviceRole: "", // Which permissions does the service role needs?
            //     versionLifecycleConfig: {
            //         maxCountRule: {
            //             deleteSourceFromS3: true,
            //             maxCount: 3,
            //             enabled: true,
            //         },
            //     },
            // }
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
                        'IamInstanceProfile': profileName,
                        'InstanceType': environment.autoscaling.instanceTypes,
                        'DisableIMDSv1': 'true',
                    },
                    'aws:autoscaling:asg': {
                        'MinSize': environment.autoscaling.minInstances.toString(),
                        'MaxSize': environment.autoscaling.maxInstances.toString(),
                    },
                    // 'aws:ec2:vpc': {
                    //     // https://repost.aws/questions/QUARH0e87FTfaBKPm0BFCmrA/do-elastic-beanstalk-web-server-environment-need-a-public-elastic-ip
                    //     'AssociatePublicIpAddress': 'false',
                    // },
                    'aws:elasticbeanstalk:application': {
                        'Application Healthcheck URL':
                            props.loadBalancer.healthCheckProtocol + ':' +
                            props.loadBalancer.instanceListeningPort.toString() + '/' +
                            removeLeading('/', props.loadBalancer.healthCheckPath)
                    },
                    'aws:elasticbeanstalk:cloudwatch:logs': {
                        'StreamLogs': 'true',
                        'DeleteOnTerminate': 'true',
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
                        'InstancePort': props.loadBalancer.instanceListeningPort.toString(),
                    },
                    // Consider using Application LoadBalancer. 'aws:elb:listener' namespace is just for classic load balancer
                    // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/environments-cfg-alb.html
                    // https://stackoverflow.com/questions/60532956/get-a-handle-for-the-application-load-balancer-for-an-elastic-beanstalk-environm
                }),
            });

            ebEnv.addDependency(ebApp);

            if (hostedZone && environment.subdomain) {
                // ElasticBeanstalkEnvironmentEndpointTarget (aws-cdk-lib/aws-route53-targets) doesn't support Tokens.
                // A hardcoded value for the ebEnv.attrEndpointUrl would be needed. Below is the workaround
                // As the stack is currently agnostic of region, it is hardcoded to sa-east-1.
                // https://github.com/aws/aws-cdk/pull/16305
                // https://github.com/aws/aws-cdk/issues/3206

                // Create a hosted zone for the app subdomain?

                const recordTarget: route53.IAliasRecordTarget = {
                    bind: (): route53.AliasRecordTargetConfig => ({
                        dnsName: ebEnv.attrEndpointUrl,
                        hostedZoneId: 'Z2P70J7HTTTPLU', // Hardcoded for sa-east-1 https://docs.aws.amazon.com/general/latest/gr/elb.html
                    }),
                };

                const dnsRecord = new route53.ARecord(this, `DNS_ARecord_${props.appName}_${environment.name}`, {
                    recordName: environment.subdomain + (props.dns?.commonSubdomain ? `.${props.dns.commonSubdomain}` : ''),
                    zone: hostedZone,
                    target: route53.RecordTarget.fromAlias(recordTarget),
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
