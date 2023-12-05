import { Construct } from 'constructs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { DnsConfig } from '../config/config_def';

interface DnsRecordProps {
    appName: string;
    environmentName: string;
    subdomain: string;
    targetType:
        | 'Instance'
        | 'ApplicationLoadBalancer'
        | 'ClassicLoadBalancer'
        | 'NetworkLoadBalancer';
    target: string;
    dns: DnsConfig;
    awsRegion: string;
}

export class DnsRecord extends Construct {
    constructor(scope: Construct, id: string, props: DnsRecordProps) {
        super(scope, id);

        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            zoneName: props.dns.hostedZoneName,
            hostedZoneId: props.dns.hostedZoneId,
        });

        let recordTarget: route53.RecordTarget;
        if (props.targetType === 'Instance') {
            recordTarget = route53.RecordTarget.fromIpAddresses(props.target);
        } else {
            // ElasticBeanstalkEnvironmentEndpointTarget (aws-cdk-lib/aws-route53-targets) doesn't support Tokens.
            // A hardcoded value for the ebEnv.attrEndpointUrl would be needed. Below is the workaround
            // https://github.com/aws/aws-cdk/pull/16305
            // https://github.com/aws/aws-cdk/issues/3206

            const lbHostedZones =
                props.targetType === 'NetworkLoadBalancer' ? NLB_HostedZones : ALB_CLB_HostedZones;
            recordTarget = route53.RecordTarget.fromAlias({
                bind: (): route53.AliasRecordTargetConfig => ({
                    dnsName: props.target,
                    hostedZoneId: lbHostedZones[props.awsRegion],
                }),
            });
        }

        new route53.ARecord(this, `DNS_ARecord_${props.appName}_${props.environmentName}`, {
            recordName:
                props.subdomain +
                (props.dns?.commonSubdomain ? `.${props.dns.commonSubdomain}` : ''),
            zone: hostedZone,
            target: recordTarget,
        });
    }
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
