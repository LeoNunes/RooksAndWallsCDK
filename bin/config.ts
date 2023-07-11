import { Immutable, NonEmptyArray } from "../lib/helper/type_helper";

export type AppConfig = Immutable<{
    appName: string;
    dns?: DnsConfig;
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
    environments: NonEmptyArray<{
        name: string;
        description?: string;
        subdomain?: string;
        deployment?: {
            wave?: number;
        };
        autoscaling?: {
            minInstances?: number;
            maxInstances?: number;
            instanceTypes?: string;
        };
    }>;
    loadBalancer?: {
        instanceListeningPort?: number,
    };
}>

export type DnsConfig = Immutable<{
    hostedZoneId: string;
    hostedZoneName: string;
    commonSubdomain?: string;
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
    dns: {
        hostedZoneId: 'Z06232281J47SNE8ZWHNB',
        hostedZoneName: 'leonunes.me',
        commonSubdomain: 'rw',
    },
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
                subdomain: 'prod.api',
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
        loadBalancer: {
            instanceListeningPort: 8080,
        },
    },
};

export default config;
