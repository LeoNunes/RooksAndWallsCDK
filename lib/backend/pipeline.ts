import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codedeploy from 'aws-cdk-lib/aws-codedeploy';
import * as logs from 'aws-cdk-lib/aws-logs';
import { BackendConfig } from '../config/config_def';
import { groupBy } from '../helper/collections';

interface PipelineProps {
    appName: string;
    backend: BackendConfig;
}

export default class Pipeline extends Construct {
    constructor(scope: Construct, id: string, props: PipelineProps) {
        super(scope, id);

        const { appName, backend } = props;
        const { pipeline: pipelineProps, environments } = backend;

        const artifactBucket = new s3.Bucket(this, `${appName}-BackendPipeline-ArtifactBucket`, {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const pipeline = new codepipeline.Pipeline(this, `${appName}-BackendPipeline`, {
            pipelineName: `${appName}-BackendPipeline`,
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
        const buildProject = new codebuild.PipelineProject(this, `${appName}-BuildProject`, {
            projectName: `${appName}_BackendPipelineBuild`,
            description: `Build step for ${appName} Backend Pipeline`,
            buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
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

        const waves = groupBy(environments, env => env.deployment.wave);
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const actions: codepipelineActions.Action[] = [];

            for (const environment of waves[waveNumber]) {
                const application = new codedeploy.ServerApplication(
                    this,
                    `${appName}-${environment.name}-ServerApplication`,
                );

                const deploymentGroup = new codedeploy.ServerDeploymentGroup(
                    this,
                    `${appName}-${environment.name}-ServerDeploymentGroup`,
                    {
                        application: application,
                        deploymentGroupName: `${appName}-${environment.name}-ServerDeploymentGroup`,
                        ec2InstanceTags: new codedeploy.InstanceTagSet({
                            application: [appName],
                            environment: [environment.name],
                        }),
                    },
                );

                actions.push(
                    new codepipelineActions.CodeDeployServerDeployAction({
                        actionName: `Deploy-${environment.name}`,
                        deploymentGroup: deploymentGroup,
                        input: buildArtifact,
                    }),
                );
            }

            pipeline.addStage({
                stageName: `Deploy-Wave-${waveNumber}`,
                actions: actions,
            });
        }
    }
}
