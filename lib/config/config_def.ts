import { NonEmptyArray } from '../helper/type_helper';

export type AppConfig = {
    appName: string;
    awsEnvironment: {
        account: string;
        region: string;
    };
    cdk: CdkConfig;
    dns: DnsConfig;
    backend: BackendConfig;
};

export type CdkConfig = {
    infrastructurePipeline: {
        repo: RepoConfig;
    };
};

export type DnsConfig = {
    hostedZoneId: string;
    hostedZoneName: string;
    commonSubdomain?: string;
};

export type BackendConfig = {
    applicationPipeline: {
        repo: RepoConfig;
    };
    environments: NonEmptyArray<EnvironmentConfig>;
};

export type RepoConfig = {
    owner: string;
    name: string;
    branch: string;
    connectionARN: string;
};

export type EnvironmentConfig = {
    name: string;
    description?: string;
    subdomain: string;
    deployment: {
        wave: number;
    };
    instances: {
        instanceType: string;
    };
    application: {
        servicePort: number;
    };
    healthCheck: {
        protocol: 'HTTP' | 'HTTPS';
        port: number;
        path: string;
    };
};

