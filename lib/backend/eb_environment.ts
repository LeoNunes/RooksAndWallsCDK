import { Construct } from "constructs";
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import { EnvironmentConfig } from "../../bin/config_def";
import { EbApplication } from "./eb_application";

interface EbEnvironmentProps extends EnvironmentConfig {
    ebApplication: EbApplication;
}

export class EbEnvironment extends Construct {
    readonly endpointUrl: string;
    constructor(scope: Construct, id: string, props: EbEnvironmentProps) {
        super (scope, id);

        // Ref: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-elasticbeanstalk-configurationtemplate.html
        const ebEnv = new elasticbeanstalk.CfnEnvironment(this, `EBEnv_${props.ebApplication.applicationName}_${props.name}`, {
            applicationName: props.ebApplication.applicationName,
            environmentName: `${props.ebApplication.applicationName}-${props.name}`,
            description: props.description,

            // https://docs.aws.amazon.com/elasticbeanstalk/latest/platforms/platforms-supported.html#platforms-supported.javase
            solutionStackName: '64bit Amazon Linux 2 v3.4.9 running Corretto 11',
            
            optionSettings: this.getEnvironmentOptions(props),
        });

        this.endpointUrl = ebEnv.attrEndpointUrl
    }

    private getEnvironmentOptions(props: EbEnvironmentProps) {
        // Environment options: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/command-options-general.html
        const optionSettings: Options = {
            'aws:autoscaling:launchconfiguration': {
                'IamInstanceProfile': props.ebApplication.instanceProfileName,
                'DisableIMDSv1': 'true',
            },
            'aws:ec2:instances': {
                'InstanceTypes': props.instances.instanceTypes,
            },
            // 'aws:ec2:vpc': {
            //     // 'VPCId': vpc.vpcId,
            //     // 'Subnets': vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
            //     // // https://repost.aws/questions/QUARH0e87FTfaBKPm0BFCmrA/do-elastic-beanstalk-web-server-environment-need-a-public-elastic-ip
            //     // 'AssociatePublicIpAddress': 'false',
            // },
            'aws:elasticbeanstalk:application': {
                'Application Healthcheck URL':
                    props.healthCheck.protocol + ':' +
                    props.healthCheck.port.toString() + '/' +
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
                'EnvironmentType': props.instances.autoscalingEnabled ? 'LoadBalanced' : 'SingleInstance',
                'ServiceRole': props.ebApplication.serviceRole.roleArn,
            },
            'aws:elasticbeanstalk:managedactions': {
                'ManagedActionsEnabled': 'true',
                'PreferredStartTime': 'Tue:09:00',
                'ServiceRoleForManagedUpdates': 'AWSServiceRoleForElasticBeanstalkManagedUpdates',
            },
            'aws:elasticbeanstalk:managedactions:platformupdate': {
                'UpdateLevel': 'minor',
            },
        };

        if (props.instances.autoscalingEnabled) {
            appendOptions(optionSettings, {
                'aws:autoscaling:asg': {
                    'MinSize': props.instances.minInstances.toString(),
                    'MaxSize': props.instances.maxInstances.toString(),
                },
                // Consider using Application LoadBalancer (aws:elasticbeanstalk:environment:LoadBalancerType).
                // 'aws:elb:listener' namespace is just for classic load balancer
                // https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/environments-cfg-alb.html
                // https://stackoverflow.com/questions/60532956/get-a-handle-for-the-application-load-balancer-for-an-elastic-beanstalk-environm
                'aws:elb:listener': {
                    'InstancePort': props.application.servicePort.toString(),
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
}

function appendOptions(opt: Options, toAppend: Options) {
    for (const key of Object.keys(toAppend)) {
        opt[key] = {
            ...opt[key],
            ...toAppend[key],
        };
    }
}

function optionsHelper(option: Options) : Array<elasticbeanstalk.CfnEnvironment.OptionSettingProperty> {
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
