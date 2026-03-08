import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { DnsConfig, EnvironmentConfig, WebConfig } from '../config/config_def';
import { NonEmptyArray } from '../helper/type_helper';
import { WebEnvironmentStack } from './environment';
import { groupBy } from '../helper/collections';

interface WebPipelineProps {
    appName: string;
    web: WebConfig;
    environments: NonEmptyArray<EnvironmentConfig>;
    dns: DnsConfig;
    awsAccount: string;
    awsRegion: string;
}

/**
 * Pipeline responsible for deploying web app changes to all environments.
 * Builds the static assets once, then deploys per environment wave, writing
 * an envConfig.json with environment-specific values at deploy time.
 */
export default class WebPipeline extends Construct {
    constructor(scope: Construct, id: string, props: WebPipelineProps) {
        super(scope, id);

        const { appName, web, environments, dns, awsAccount, awsRegion } = props;
        const { pipeline: pipelineProps } = web;

        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
            pipelineName: `${appName}-Web`,
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
            projectName: `${appName}-WEB-PipelineBuild`,
            description: `Build step for ${appName} Web Pipeline`,
            environment: {
                buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
            },
            buildSpec: codebuild.BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: { commands: ['npm ci'] },
                    build: { commands: ['npm run build'] },
                },
                artifacts: {
                    'base-directory': 'dist',
                    files: ['**/*'],
                },
            }),
            logging: {
                cloudWatch: {
                    logGroup: new logs.LogGroup(this, 'BuildProjectLogGroup', {
                        logGroupName: `${appName}/WEB/Pipeline/Build/`,
                        retention: logs.RetentionDays.ONE_WEEK,
                        removalPolicy: cdk.RemovalPolicy.DESTROY,
                    }),
                },
            },
        });

        pipeline.addStage({
            stageName: 'Build',
            actions: [
                new codepipelineActions.CodeBuildAction({
                    actionName: 'Build',
                    project: buildProject,
                    input: sourceOutput,
                    outputs: [buildArtifact],
                }),
            ],
        });

        const waves = groupBy(environments, env => env.deployment.wave);
        const waveNumbers = Object.keys(waves).map(Number).sort();

        for (const waveNumber of waveNumbers) {
            const actions: codepipelineActions.Action[] = [];

            for (const environment of waves[waveNumber]) {
                const bucketName = WebEnvironmentStack.bucketName(appName, environment);
                const backendSubdomain = environment.backend.subdomain + (dns.commonSubdomain ? `.${dns.commonSubdomain}` : '');
                const apiBaseUrl = `https://${backendSubdomain}.${dns.hostedZoneName}`;
                const wsBaseUrl = `wss://${backendSubdomain}.${dns.hostedZoneName}`;
                const distributionIdParam = `/${appName}/WEB/${environment.name}/DistributionId`;
                const cognitoUserPoolIdParam = `/${appName}/BE/${environment.name}/CognitoUserPoolId`;
                const cognitoUserPoolClientIdParam = `/${appName}/BE/${environment.name}/CognitoUserPoolClientId`;
                const cognitoDomainPrefix = environment.backend.auth.cognitoDomain;

                const deployProject = new codebuild.PipelineProject(
                    this,
                    `${environment.name}-DeployProject`,
                    {
                        projectName: `${appName}-WEB-${environment.name}-Deploy`,
                        description: `Deploy step for ${appName} Web Pipeline - ${environment.name}`,
                        buildSpec: codebuild.BuildSpec.fromObject({
                            version: '0.2',
                            phases: {
                                build: {
                                    commands: [
                                        `DISTRIBUTION_ID=$(aws ssm get-parameter --name "${distributionIdParam}" --region us-east-1 --query Parameter.Value --output text)`,
                                        `COGNITO_USER_POOL_ID=$(aws ssm get-parameter --name "${cognitoUserPoolIdParam}" --query Parameter.Value --output text)`,
                                        `COGNITO_USER_POOL_CLIENT_ID=$(aws ssm get-parameter --name "${cognitoUserPoolClientIdParam}" --query Parameter.Value --output text)`,
                                        `jq -n --arg apiBaseUrl "${apiBaseUrl}" --arg wsBaseUrl "${wsBaseUrl}" --arg cognitoUserPoolId "$COGNITO_USER_POOL_ID" --arg cognitoUserPoolClientId "$COGNITO_USER_POOL_CLIENT_ID" --arg cognitoDomain "${cognitoDomainPrefix}.auth.${awsRegion}.amazoncognito.com" '{"apiBaseUrl":$apiBaseUrl,"wsBaseUrl":$wsBaseUrl,"cognitoUserPoolId":$cognitoUserPoolId,"cognitoUserPoolClientId":$cognitoUserPoolClientId,"cognitoDomain":$cognitoDomain}' > envConfig.json`,
                                        `aws s3 cp envConfig.json s3://${bucketName}/envConfig.json`,
                                        `aws s3 sync . s3://${bucketName} --delete --exclude envConfig.json`,
                                        `aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"`,
                                    ],
                                },
                            },
                        }),
                        logging: {
                            cloudWatch: {
                                logGroup: new logs.LogGroup(
                                    this,
                                    `${environment.name}-DeployProjectLogGroup`,
                                    {
                                        logGroupName: `${appName}/WEB/Pipeline/${environment.name}/Deploy/`,
                                        retention: logs.RetentionDays.ONE_WEEK,
                                        removalPolicy: cdk.RemovalPolicy.DESTROY,
                                    },
                                ),
                            },
                        },
                    },
                );

                deployProject.addToRolePolicy(
                    new iam.PolicyStatement({
                        actions: ['s3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
                        resources: [
                            `arn:aws:s3:::${bucketName}`,
                            `arn:aws:s3:::${bucketName}/*`,
                        ],
                    }),
                );
                deployProject.addToRolePolicy(
                    new iam.PolicyStatement({
                        actions: ['cloudfront:CreateInvalidation'],
                        resources: ['*'],
                    }),
                );
                deployProject.addToRolePolicy(
                    new iam.PolicyStatement({
                        actions: ['ssm:GetParameter'],
                        resources: [
                            `arn:aws:ssm:us-east-1:${awsAccount}:parameter${distributionIdParam}`,
                            `arn:aws:ssm:${awsRegion}:${awsAccount}:parameter${cognitoUserPoolIdParam}`,
                            `arn:aws:ssm:${awsRegion}:${awsAccount}:parameter${cognitoUserPoolClientIdParam}`,
                        ],
                    }),
                );

                actions.push(
                    new codepipelineActions.CodeBuildAction({
                        actionName: `Deploy-${environment.name}`,
                        project: deployProject,
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
