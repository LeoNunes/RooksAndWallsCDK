import { Construct } from 'constructs';
import * as elasticbeanstalk from 'aws-cdk-lib/aws-elasticbeanstalk';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EbApplication } from './eb_application';
import { BackendConfig, DnsConfig } from '../../bin/config_def';
import { EbEnvironment } from './eb_environment';
import { DnsRecord } from './dns_record';

interface ElasticBeanstalkAppProps extends BackendConfig {
    appName: string;
    dns?: DnsConfig;
}

// For future reference: https://github.com/aws-samples/aws-elastic-beanstalk-hardened-security-cdk-sample
export class Application extends Construct {
    constructor(scope: Construct, id: string, props: ElasticBeanstalkAppProps) {
        super(scope, id);

        const ebApp = new EbApplication(this, `EbApplication_${props.appName}`, {
            appName: props.appName,
        });

        for (const environment of props.environments) {
            const ebEnv = new EbEnvironment(this, `EbEnvironment_${ebApp.applicationName}_${environment.name}`, {
                ebApplication: ebApp,
                ...environment
            });

            ebEnv.node.addDependency(ebApp);

            if (props.dns && environment.subdomain) {
                const dns = new DnsRecord(this, `DnsRecord_${ebApp.applicationName}_${environment.name}`, {
                    appName: props.appName,
                    environmentName: environment.name,
                    subdomain: environment.subdomain,
                    dns: props.dns,
                    targetType: environment.instances.autoscalingEnabled ? 'ClassicLoadBalancer' : 'Instance',
                    target: ebEnv.endpointUrl,
                    awsRegion: props.awsEnvironment.region,
                });

                dns.node.addDependency(ebEnv);
            }
        }
    }
}







