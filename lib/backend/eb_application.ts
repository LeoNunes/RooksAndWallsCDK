import { Construct } from "constructs";
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';
import { BackendConfig } from "../../bin/config";

interface ElasticBeanstalkAppProps extends BackendConfig {
    appName: string;
}

export class ElasticBeanstalkApp extends Construct {
    constructor(scope: Construct, id: string, props: ElasticBeanstalkAppProps) {
        super(scope, id);

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
                        'InstanceType': environment.autoscaling?.instanceTypes ?? 't3.micro',
                        'DisableIMDSv1': 'true',
                    },
                    'aws:autoscaling:asg': {
                        'MinSize': environment.autoscaling?.minInstances?.toString() ?? '1',
                        'MaxSize': environment.autoscaling?.maxInstances?.toString() ?? '1',
                    },
                    'aws:ec2:vpc': {
                        'AssociatePublicIpAddress': 'false',
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
                        'InstancePort': props.loadBalancer?.instanceListeningPort?.toString(),
                    },
                    // Consider using Application LoadBalancer. 'aws:elb:listener' namespace is just for classic load balancer
                    // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/environments-cfg-alb.html
                    // https://stackoverflow.com/questions/60532956/get-a-handle-for-the-application-load-balancer-for-an-elastic-beanstalk-environm
                }),
            });

            ebEnv.addDependency(ebApp);

            // DNS: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-beanstalk-environment.html#routing-to-beanstalk-environment-create-alias-procedure
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
