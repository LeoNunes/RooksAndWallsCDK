import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { AppConfig } from './config/config_def';
import Backend from './backend';

interface CdkStackProps extends cdk.StackProps, AppConfig {}

// Ref: https://docs.aws.amazon.com/cdk/v2/guide/cdk_pipeline.html
export class CdkStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CdkStackProps) {
        super(scope, id, props);

        const infraPipeline = this.createInfraPipeline(props);

        new Backend(this, 'Backend', {
            infraPipeline: infraPipeline,
            ...props,
        });
    }

    private createInfraPipeline(props: CdkStackProps) {
        const { appName } = props;
        const { repo } = props.cdk.infrastructurePipeline;

        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        return new CodePipeline(this, 'CdkPipeline', {
            pipelineName: `${appName}-CDK`,
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.connection(`${repo.owner}/${repo.name}`, repo.branch, {
                    connectionArn: repo.connectionARN,
                }),
                commands: ['npm ci', 'npm run build', 'npx cdk synth'],
            }),
            artifactBucket: artifactBucket,
            publishAssetsInParallel: false,
            synthCodeBuildDefaults: {
                logging: {
                    cloudWatch: {
                        logGroup: new logs.LogGroup(this, 'SynthLogGroup', {
                            logGroupName: `${appName}/CDK/Pipeline/Synth/`,
                            retention: logs.RetentionDays.ONE_WEEK,
                            removalPolicy: cdk.RemovalPolicy.DESTROY,
                        }),
                    },
                },
            },
            selfMutationCodeBuildDefaults: {
                logging: {
                    cloudWatch: {
                        logGroup: new logs.LogGroup(this, 'SelfMutationLogGroup', {
                            logGroupName: `${appName}/CDK/Pipeline/SelfMutation/`,
                            retention: logs.RetentionDays.ONE_WEEK,
                            removalPolicy: cdk.RemovalPolicy.DESTROY,
                        }),
                    },
                },
            },
            assetPublishingCodeBuildDefaults: {
                logging: {
                    cloudWatch: {
                        logGroup: new logs.LogGroup(this, 'AssetPublishingLogGroup', {
                            logGroupName: `${appName}/CDK/Pipeline/AssetPublishing/`,
                            retention: logs.RetentionDays.ONE_WEEK,
                            removalPolicy: cdk.RemovalPolicy.DESTROY,
                        }),
                    },
                },
            },
        });
    }
}
