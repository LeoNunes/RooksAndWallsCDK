import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codeBuild from 'aws-cdk-lib/aws-codebuild';
import * as logs from 'aws-cdk-lib/aws-logs';
import { AppConfig } from '../../config/config_def';
import { groupBy } from '../../helper/collections';

interface BackendPipelineProps extends AppConfig {}

export class BackendPipeline extends Construct {
    constructor(scope: Construct, id: string, props: BackendPipelineProps) {
        super(scope, id);

        const {
            appName,
            backend: { pipeline: pipelineProps, environments: environmentsProps },
        } = props;

        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const pipelineName = `${appName}-BackendPipeline`;
        const pipeline = new codepipeline.Pipeline(this, 'BackendPipeline', {
            pipelineName: pipelineName,
            artifactBucket: artifactBucket,
        });

        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new codepipelineActions.CodeStarConnectionsSourceAction({
            actionName: `${pipelineProps.repo.owner}_${pipelineProps.repo.name}`,
            connectionArn: pipelineProps.repo.connectionARN,
            owner: pipelineProps.repo.owner,
            repo: pipelineProps.repo.name,
            branch: pipelineProps.repo.branch,
            output: sourceOutput,
        });

        pipeline.addStage({
            stageName: 'Source',
            actions: [sourceAction],
        });

        const buildArtifact = new codepipeline.Artifact('BuildArtifact');
        const buildProject = new codeBuild.PipelineProject(this, 'BuildProject', {
            projectName: `${appName}_BackendPipelineBuild`,
            description: `Build step for ${pipelineName} pipeline`,
            buildSpec: codeBuild.BuildSpec.fromSourceFilename('buildspec.yml'),
            logging: {
                cloudWatch: {
                    logGroup: new logs.LogGroup(this, 'BuildProjectLogGroup', {
                        logGroupName: `${appName}/BackendPipeline/Build/`,
                        retention: logs.RetentionDays.ONE_WEEK,
                        removalPolicy: cdk.RemovalPolicy.DESTROY,
                    }),
                },
            },
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

        const waves = groupBy(environmentsProps, env => env.deployment.wave);
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const actions: codepipelineActions.ElasticBeanstalkDeployAction[] = [];

            for (const environment of waves[waveNumber]) {
                actions.push(
                    new codepipelineActions.ElasticBeanstalkDeployAction({
                        actionName: `Deploy-${environment.name}`,
                        applicationName: appName,
                        environmentName: `${appName}-${environment.name}`,
                        input: buildArtifact,
                    }),
                );
            }

            pipeline.addStage({
                stageName: `Deploy-Wave${waveNumber}`,
                actions: actions,
            });
        }
    }
}
