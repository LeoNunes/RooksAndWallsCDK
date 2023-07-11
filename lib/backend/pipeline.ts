import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codeBuild from 'aws-cdk-lib/aws-codebuild';
import { BackendConfig } from "../../bin/config";
import { groupBy } from "../helper/collections";

interface BackendPipelineProps extends BackendConfig {
    appName: string;
}

export class BackendPipeline extends Construct {
    constructor(scope: Construct, id: string, props: BackendPipelineProps) {
        super(scope, id);

        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const pipelineName = `${props.appName}-BackendPipeline`;
        const pipeline = new codepipeline.Pipeline(this, 'BackendPipeline', {
            pipelineName: pipelineName,
            artifactBucket: artifactBucket,
        });

        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new codepipelineActions.CodeStarConnectionsSourceAction({
            actionName: `${props.pipeline.repo.owner}_${props.pipeline.repo.name}`,
            connectionArn: props.pipeline.repo.connectionARN,
            owner: props.pipeline.repo.owner,
            repo: props.pipeline.repo.name,
            branch: props.pipeline.repo.branch,
            output: sourceOutput,
        });

        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        const buildArtifact = new codepipeline.Artifact('BuildArtifact');
        const buildProject = new codeBuild.PipelineProject(this, 'BuildProject', {
            projectName: `${props.appName}_PipelineBuild`,
            description: `Build step for ${pipelineName} pipeline`,
            buildSpec: codeBuild.BuildSpec.fromSourceFilename('buildspec.yml'),
        });
        const buildAction = new codepipelineActions.CodeBuildAction({
            actionName: 'Build',
            project: buildProject,
            input: sourceOutput,
            outputs: [buildArtifact],
        });

        pipeline.addStage({
            stageName: 'Build',
            actions: [buildAction],
        });

        const waves = groupBy(props.environments, (env => env.deployment?.wave ?? 0));
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const actions: codepipelineActions.ElasticBeanstalkDeployAction[] = [];

            for (const environment of waves[waveNumber]) {
                actions.push(new codepipelineActions.ElasticBeanstalkDeployAction({
                    actionName: `Deploy-${environment.name}`,
                    applicationName: props.appName,
                    environmentName: `${props.appName}-${environment.name}`,
                    input: buildArtifact,
                }));
            }
            
            pipeline.addStage({
                stageName: `Deploy-Wave${waveNumber}`,
                actions: actions,
            });
        }
    }
}
