import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { DnsConfig, WebEnvironmentConfig } from '../config/config_def';

interface WebEnvironmentStackProps {
    stackProps: cdk.StackProps;
    appName: string;
    environment: WebEnvironmentConfig;
    dns: DnsConfig;
}

/** Constructs for the web infrastructure for a given environment. Must be deployed to us-east-1 (ACM requirement for CloudFront). */
export class WebEnvironmentStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: WebEnvironmentStackProps) {
        super(scope, id, props.stackProps);

        const { appName, environment, dns } = props;

        const bucket = this.createBucket(appName, environment);
        const certificate = this.createCertificate(appName, environment, dns);
        const distribution = this.createDistribution(appName, environment, dns, bucket, certificate);

        this.createDnsRecord(environment, dns, distribution);
        this.storeDistributionId(appName, environment, distribution);
    }

    private createBucket(appName: string, environment: WebEnvironmentConfig): s3.Bucket {
        return new s3.Bucket(this, 'AssetsBucket', {
            bucketName: this.bucketName(appName, environment),
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
    }

    private createCertificate(
        appName: string,
        environment: WebEnvironmentConfig,
        dns: DnsConfig,
    ): acm.Certificate {
        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
            zoneName: dns.hostedZoneName,
            hostedZoneId: dns.hostedZoneId,
        });

        return new acm.Certificate(this, 'Certificate', {
            certificateName: `${appName}-WEB-${environment.name}`,
            domainName: `${environment.subdomain}.${dns.hostedZoneName}`,
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });
    }

    private createDistribution(
        appName: string,
        environment: WebEnvironmentConfig,
        dns: DnsConfig,
        bucket: s3.Bucket,
        certificate: acm.Certificate,
    ): cloudfront.Distribution {
        return new cloudfront.Distribution(this, 'Distribution', {
            comment: `${appName} WEB ${environment.name}`,
            defaultBehavior: {
                origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            },
            defaultRootObject: 'index.html',
            // S3 returns 403 (not 404) for missing objects in private buckets with OAC.
            // Both are mapped to index.html so React Navigation handles client-side routing.
            errorResponses: [
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.seconds(0),
                },
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.seconds(0),
                },
            ],
            domainNames: [`${environment.subdomain}.${dns.hostedZoneName}`],
            certificate: certificate,
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        });
    }

    private createDnsRecord(
        environment: WebEnvironmentConfig,
        dns: DnsConfig,
        distribution: cloudfront.Distribution,
    ) {
        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZoneForDns', {
            zoneName: dns.hostedZoneName,
            hostedZoneId: dns.hostedZoneId,
        });

        new route53.ARecord(this, 'DnsARecord', {
            recordName: environment.subdomain,
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(
                new route53Targets.CloudFrontTarget(distribution),
            ),
        });
    }

    private storeDistributionId(
        appName: string,
        environment: WebEnvironmentConfig,
        distribution: cloudfront.Distribution,
    ) {
        new ssm.StringParameter(this, 'DistributionIdParameter', {
            parameterName: `/${appName}/WEB/${environment.name}/DistributionId`,
            stringValue: distribution.distributionId,
            description: `CloudFront Distribution ID for ${appName} WEB ${environment.name}`,
        });
    }

    static bucketName(appName: string, environment: WebEnvironmentConfig): string {
        return `${appName}-web-${environment.name}`.toLowerCase();
    }

    private bucketName(appName: string, environment: WebEnvironmentConfig): string {
        return WebEnvironmentStack.bucketName(appName, environment);
    }
}

interface WebEnvironmentStageProps extends cdk.StageProps, WebEnvironmentStackProps {}

/** Stage in infrastructure pipeline responsible for building the web infrastructure for a given environment. */
export class WebEnvironmentStage extends cdk.Stage {
    constructor(scope: Construct, id: string, props: WebEnvironmentStageProps) {
        super(scope, id, props);

        new WebEnvironmentStack(this, 'WebEnvironmentStack', props);
    }
}
