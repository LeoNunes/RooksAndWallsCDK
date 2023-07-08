#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RooksAndWallsStack } from '../lib/rooks_and_walls_stack';
import { CdkPipeline } from '../lib/cdk_pipeline';
import { RepoConfig } from '../lib/common';

const gitHubConfig = {
    owner: 'LeoNunes',
    // Connection must be created manually on the AWS Console
    connectionARN: 'arn:aws:codestar-connections:sa-east-1:641179121252:connection/4c171f9b-5424-4003-b7e3-ea9f41c7a7ca',
}

const config = {
    appName: 'RooksAndWallsTest',
    cdkPipeline: {
        repo: {
            ...gitHubConfig,
            name: 'RooksAndWallsCDK',
            branch: 'main',
        } as RepoConfig,
    },
};

const app = new cdk.App();
new CdkPipeline(app, `${config.appName}CdkPipelineStack`, {
    appName: config.appName,
    repo: config.cdkPipeline.repo,

    /* If you don't specify 'env', this stack will be environment-agnostic.
    * Account/Region-dependent features and context lookups will not work,
    * but a single synthesized template can be deployed anywhere. */
    
    /* Uncomment the next line to specialize this stack for the AWS Account
    * and Region that are implied by the current CLI configuration. */
    // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
    
    /* Uncomment the next line if you know exactly what Account and Region you
    * want to deploy the stack to. */
    // env: { account: '123456789012', region: 'us-east-1' },
    
    /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

app.synth();
