import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { BackendServiceStage } from './backend/backend_service_stack';
import { AppConfig } from '../bin/config';

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
        });

        const backendStack = new BackendServiceStage(this, 'BackendServiceStage', {
            stackProps: {
                appName: props.appName,
                stackName: `${props.appName}BackendStack`,
                ...props.backend
            },
        });

        pipeline.addStage(backendStack);
    }
}
