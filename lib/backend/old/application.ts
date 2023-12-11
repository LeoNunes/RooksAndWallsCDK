import { Construct } from 'constructs';
import { EbApplication } from './eb_application';
import { AppConfig } from '../../config/config_def';
import { EbEnvironment } from './eb_environment';
import { DnsRecord } from './dns_record';
import { CertificatesBucket } from './certificates_bucket';

interface ElasticBeanstalkAppProps extends AppConfig {}

// For future reference: https://github.com/aws-samples/aws-elastic-beanstalk-hardened-security-cdk-sample
export class Application extends Construct {
    constructor(scope: Construct, id: string, props: ElasticBeanstalkAppProps) {
        super(scope, id);

        const { appName, awsEnvironment, backend: backendProps, dns: dnsProps } = props;

        const ebApp = new EbApplication(this, `EbApplication_${appName}`, {
            appName: appName,
        });

        let certificatesBucket: CertificatesBucket | undefined = undefined;
        if (
            backendProps.environments.find(
                e => e.application.httpsEnabled && !e.instances.autoscalingEnabled,
            )
        ) {
            certificatesBucket = new CertificatesBucket(this, `${appName}_CertificatesBucket`, {
                appName: appName,
                environments: backendProps.environments
                    .filter(e => e.application.httpsEnabled)
                    .map(e => e.name),
                ebApplication: ebApp,
            });
        }

        for (const environment of backendProps.environments) {
            const ebEnv = new EbEnvironment(
                this,
                `EbEnvironment_${ebApp.applicationName}_${environment.name}`,
                {
                    ebApplication: ebApp,
                    certificatesBucket: certificatesBucket,
                    ...environment,
                },
            );

            ebEnv.node.addDependency(ebApp);

            if (dnsProps && environment.subdomain) {
                const dns = new DnsRecord(
                    this,
                    `DnsRecord_${ebApp.applicationName}_${environment.name}`,
                    {
                        appName: appName,
                        environmentName: environment.name,
                        subdomain: environment.subdomain,
                        dns: dnsProps,
                        targetType: environment.instances.autoscalingEnabled
                            ? 'ClassicLoadBalancer'
                            : 'Instance',
                        target: ebEnv.endpointUrl,
                        awsRegion: awsEnvironment.region,
                    },
                );

                dns.node.addDependency(ebEnv);
            }
        }
    }
}
