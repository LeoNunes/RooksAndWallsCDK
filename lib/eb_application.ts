import { Construct } from "constructs";
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';

interface ElasticBeanstalkAppProps {
    appName: string;
    environments: {
        name: string;
        description?: string;
        minInstances?: number;
        maxInstances?: number;
        instanceTypes?: string;
    }[];
}

export class ElasticBeanstalkApp extends Construct {
    constructor(scope: Construct, id: string, props: ElasticBeanstalkAppProps) {
        super(scope, id)

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
            const ebEnv = new elasticbeanstalk.CfnEnvironment(this, `EBEnv_${props.appName}_${environment.name}`, {
                applicationName: props.appName,
                environmentName: `${props.appName}-${environment.name}`,
                description: environment.description,

                // https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.javase
                solutionStackName: '64bit Amazon Linux 2 v3.4.9 running Corretto 11',

                // Environment options: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/command-options.html
                // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-elasticbeanstalk-configurationtemplate.html
                // https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_elasticbeanstalk.CfnEnvironment.html
                optionSettings: [
                    {
                        namespace: 'aws:autoscaling:launchconfiguration',
                        optionName: 'IamInstanceProfile',
                        value: profileName,
                    },
                    {
                        namespace: 'aws:autoscaling:launchconfiguration',
                        optionName: 'InstanceType',
                        value: environment.instanceTypes ?? 't3.micro',
                    },
                    {
                        namespace: 'aws:autoscaling:asg',
                        optionName: 'MinSize',
                        value: environment.minInstances?.toString() ?? '1',
                    },
                    {
                        namespace: 'aws:autoscaling:asg',
                        optionName: 'MaxSize',
                        value: environment.maxInstances?.toString() ?? '1',
                    },
                    // Consider using Application LoadBalancer:
                    // https://stackoverflow.com/questions/60532956/get-a-handle-for-the-application-load-balancer-for-an-elastic-beanstalk-environm
                ],
            });

            ebEnv.addDependency(ebApp);
        }
    }
}
