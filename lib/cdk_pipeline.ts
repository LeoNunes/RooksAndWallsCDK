import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { AppConfig } from './config/config_def';
import Backend from './backend';

interface CdkPipelineProps extends cdk.StackProps, AppConfig {}

// Ref: https://docs.aws.amazon.com/cdk/v2/guide/cdk_pipeline.html
export class CdkPipeline extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CdkPipelineProps) {
        super(scope, id, props);

        const pipeline = this.createBasePipeline(props);

        new Backend(this, `${props.appName}-Backend`, {
            cdkPipeline: pipeline,
            ...props,
        });
    }

    private createBasePipeline(props: CdkPipelineProps) {
        const { appName } = props;
        const { repo } = props.cdk.pipeline;

        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        return new CodePipeline(this, 'Pipeline', {
            pipelineName: `${appName}-CdkPipeline`,
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
                            logGroupName: `${appName}/CDKPipeline/Synth/`,
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
                            logGroupName: `${appName}/CDKPipeline/SelfMutation/`,
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
                            logGroupName: `${appName}/CDKPipeline/AssetPublishing/`,
                            retention: logs.RetentionDays.ONE_WEEK,
                            removalPolicy: cdk.RemovalPolicy.DESTROY,
                        }),
                    },
                },
            },
        });
    }
}
