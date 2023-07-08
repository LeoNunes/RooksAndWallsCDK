import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CdkPipeline } from './cdk_pipeline';
import { RepoConfig } from './common';

interface RooksAndWallsCdkStackProps extends cdk.StackProps {
    appName: string;
    environments: {
        name: string;
        description?: string;
    }[];
    serverPipeline?: {
        repo: RepoConfig;
    };
    webAppPipeline?: {
        repo: RepoConfig;
    };
};

export class RooksAndWallsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: RooksAndWallsCdkStackProps) {
        super(scope, id, props);
    }
}
