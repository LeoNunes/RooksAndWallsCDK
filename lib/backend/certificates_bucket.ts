import { Construct } from "constructs";
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as logs from "aws-cdk-lib/aws-logs";
import { EbApplication } from "./eb_application";

interface CertificatesBucketProps {
    appName: string;
    environments: string[];
    ebApplication: EbApplication;
}

/**
 * Creates a bucket where the instance can get the certificates to use for HTTPS.
 * It uploads a placeholder that must be replaced manually in the bucket.
 */
export class CertificatesBucket extends Construct {
    readonly bucket: s3.Bucket;
    private appName: string;

    constructor(scope: Construct, id: string, props: CertificatesBucketProps) {
        super(scope, id);

        this.appName = props.appName;

        this.bucket = new s3.Bucket(this, 'CertificatesBucket', {
            bucketName: `${props.appName.toLowerCase()}-certificates`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        this.bucket.grantRead(props.ebApplication.instanceRole);

        for (const env of props.environments) {
            new s3deploy.BucketDeployment(this, `${env}-Deployment`, {
                destinationBucket: this.bucket,
                sources: [s3deploy.Source.asset('./assets/certificate_placeholder')],
                destinationKeyPrefix: this.pathForEnvironment(env),
                logRetention: logs.RetentionDays.ONE_WEEK,
            });
        }
    }

    pathForEnvironment(environment: string) {
        return `${this.appName}/${environment}/certificates/`;
    }
}
