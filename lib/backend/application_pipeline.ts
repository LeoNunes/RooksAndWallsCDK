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

interface ApplicationPipelineProps {
    appName: string;
    backend: BackendConfig;
}

/**
 * This Pipeline that is responsible for deploying code changes in the backend repositories to the environments.
 */
export default class ApplicationPipeline extends Construct {
    constructor(scope: Construct, id: string, props: ApplicationPipelineProps) {
        super(scope, id);

        const { appName, backend } = props;
        const { applicationPipeline: pipelineProps, environments } = backend;

        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: `${appName}-Backend`,
            artifactBucket: artifactBucket,
        });

        const sourceOutput = new codepipeline.Artifact('SourceArtifact');
        const sourceAction = new codepipelineActions.CodeStarConnectionsSourceAction({
            actionName: `${pipelineProps.repo.owner}-${pipelineProps.repo.name}`,
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
        const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
            projectName: `${appName}-BE-PipelineBuild`,
            description: `Build step for ${appName} Backend Pipeline`,
            buildSpec: codebuild.BuildSpec.fromSourceFilename('aws/buildspec.yml'),
            logging: {
                cloudWatch: {
                    logGroup: new logs.LogGroup(this, 'BuildProjectLogGroup', {
                        logGroupName: `${appName}/BE/Pipeline/Build/`,
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
                const deploymentTargetTags = new codedeploy.InstanceTagSet(
                    { application: [appName] },
                    { environment: [environment.name] },
                );
                const application = new codedeploy.ServerApplication(
                    this,
                    `${environment.name}-ServerApplication`,
                    { applicationName: `${appName}-BE-${environment.name}` },
                );

                const deploymentGroup = new codedeploy.ServerDeploymentGroup(
                    this,
                    `${environment.name}-ServerDeploymentGroup`,
                    {
                        application: application,
                        deploymentGroupName: `${appName}-BE-${environment.name}`,
                        ec2InstanceTags: deploymentTargetTags,
                    },
                );

                actions.push(
                    new codepipelineActions.CodeDeployServerDeployAction({
                        actionName: `Deploy-${environment.name}`,
                        deploymentGroup: deploymentGroup,
                        input: buildArtifact,
                    }),
                );

                cdk.Tags.of(deploymentGroup).add('application', appName);
                cdk.Tags.of(deploymentGroup).add('environment', environment.name);
            }

            pipeline.addStage({
                stageName: `Deploy-Wave-${waveNumber}`,
                actions: actions,
            });
        }
    }
}
