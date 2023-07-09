import { Immutable, NonEmptyArray } from "../lib/helper/type_helper";

export type AppConfig = Immutable<{
    appName: string;
    cdk: CdkConfig;
    backend: BackendConfig;
}>

export type CdkConfig = Immutable<{
    pipeline: {
        repo: RepoConfig;
    };
}>

export type BackendConfig = Immutable<{
    pipeline: {
        repo: RepoConfig;
    };
    awsEnvironments?: { // Not currently supported
        name: string;
        account?: string;
        region?: string;
    }[];
    environments: NonEmptyArray<{
        name: string;
        description?: string;
        deployment?: {
            wave?: number;
        };
        autoscaling?: {
            minInstances?: number;
            maxInstances?: number;
            instanceTypes?: string;
        };
        loadBalancer?: {};  // Not currently supported
        awsEnvironment?: string; // Not currently supported
    }>;
}>

export type RepoConfig = Immutable<{
    owner: string;
    name: string;
    branch: string;
    connectionARN: string;
}>

const appName = 'RooksAndWallsTest';
const gitHubConfig = {
    owner: 'LeoNunes',
    // Connection must be created manually on the AWS Console
    connectionARN: 'arn:aws:codestar-connections:sa-east-1:641179121252:connection/4c171f9b-5424-4003-b7e3-ea9f41c7a7ca',
};

const config: AppConfig = {
    appName: appName,
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
            {
                name: 'Prod',
                description: `Prod environment for ${appName}`,
                deployment: {
                    wave: 0,
                },
            },
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
