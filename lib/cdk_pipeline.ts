import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { RepoConfig } from './common';
import { RemovalPolicy } from 'aws-cdk-lib';

interface CdkPipelineProps extends cdk.StackProps {
    appName: string;
    repo: RepoConfig;
}

export class CdkPipeline extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CdkPipelineProps) {
        super(scope, id, props);

        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });
        
        const pipeline = new CodePipeline(this, 'Pipeline', {
            pipelineName: `${props.appName}-CdkPipeline`,
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.connection(`${props.repo.owner}/${props.repo.name}`, props.repo.branch, {
                    connectionArn: props.repo.connectionARN,
                }),
                commands: ['npm ci', 'npm run build', 'npx cdk synth']
            }),
            artifactBucket: artifactBucket,
        });
    }
}
