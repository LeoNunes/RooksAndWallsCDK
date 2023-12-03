import { Construct } from 'constructs';
import { EbApplication } from './eb_application';
import { BackendConfig, DnsConfig } from '../config/config_def';
import { EbEnvironment } from './eb_environment';
import { DnsRecord } from './dns_record';
import { CertificatesBucket } from './certificates_bucket';

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

        let certificatesBucket: CertificatesBucket | undefined = undefined;
        if (props.environments.find(e => e.application.httpsEnabled && !e.instances.autoscalingEnabled)) {
            certificatesBucket = new CertificatesBucket(this, `${props.appName}_CertificatesBucket`, {
                appName: props.appName,
                environments: props.environments.filter(e => e.application.httpsEnabled).map(e => e.name),
                ebApplication: ebApp,
            });
        }

        for (const environment of props.environments) {
            const ebEnv = new EbEnvironment(this, `EbEnvironment_${ebApp.applicationName}_${environment.name}`, {
                ebApplication: ebApp,
                certificatesBucket: certificatesBucket,
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
