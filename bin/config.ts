import { Environment } from "aws-cdk-lib";

export interface AppConfig {
    appName: string;
    cdk: CdkConfig;
    backend: BackendConfig;
}

export interface CdkConfig {
    pipeline: {
        repo: RepoConfig;
    };
}

export interface BackendConfig {
    pipeline: {
        repo: RepoConfig;
    };
    environments: { name: string; description?: string }[];
    // stages?: { account: string; region: string }[]; 
}

export interface RepoConfig {
    owner: string;
    name: string;
    branch: string;
    connectionARN: string;
};

const gitHubConfig = {
    owner: 'LeoNunes',
    // Connection must be created manually on the AWS Console
    connectionARN: 'arn:aws:codestar-connections:sa-east-1:641179121252:connection/4c171f9b-5424-4003-b7e3-ea9f41c7a7ca',
};

const config: AppConfig = {
    appName: 'RooksAndWallsTest',
    cdk: {
        pipeline: {
            repo: {
                ...gitHubConfig,
                name: 'RooksAndWallsCDK',
                branch: 'main',
            },
        },
    },
    backend: {
        environments: [
            { name: 'Prod' },
        ],
        pipeline: {
            repo: {
                ...gitHubConfig,
                name: 'RooksAndWallsServer',
                branch: 'main',
            },
        },
    },
};

export default config;