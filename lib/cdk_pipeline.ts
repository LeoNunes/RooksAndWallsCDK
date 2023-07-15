import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { BackendServiceStage } from './backend/backend_service_stack';
import { AppConfig } from '../bin/config_def';

interface CdkPipelineProps extends cdk.StackProps, AppConfig { }

// Ref: https://docs.aws.amazon.com/cdk/v2/guide/cdk_pipeline.html
export class CdkPipeline extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CdkPipelineProps) {
        super(scope, id, props);
    
        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const cdkRepo = props.cdk.pipeline.repo;
        
        const pipeline = new CodePipeline(this, 'Pipeline', {
            pipelineName: `${props.appName}-CdkPipeline`,
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.connection(`${cdkRepo.owner}/${cdkRepo.name}`, cdkRepo.branch, {
                    connectionArn: cdkRepo.connectionARN,
                }),
                commands: ['npm ci', 'npm run build', 'npx cdk synth']
            }),
            artifactBucket: artifactBucket,
            synthCodeBuildDefaults: {
                logging: {
                    cloudWatch: {
                        logGroup: new logs.LogGroup(this, 'SynthLogGroup', {
                            logGroupName: `${props.appName}/CDKPipeline/Synth/`,
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
                            logGroupName: `${props.appName}/CDKPipeline/SelfMutation/`,
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
                            logGroupName: `${props.appName}/CDKPipeline/AssetPublishing/`,
                            retention: logs.RetentionDays.ONE_WEEK,
                            removalPolicy: cdk.RemovalPolicy.DESTROY,
                        }),
                    },
                },
            },
        });

        const backendStack = new BackendServiceStage(this, 'BackendServiceStage', {
            stackProps: {
                appName: props.appName,
                dns: props.dns,
                stackName: `${props.appName}BackendStack`,
                description: `Backend Stack for ${props.appName} managed by ${this.stackName}`,
                ...props.backend
            },
        });

        pipeline.addStage(backendStack);
    }
}
