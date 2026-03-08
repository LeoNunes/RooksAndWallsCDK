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
    web: WebConfig;
    environments: NonEmptyArray<EnvironmentConfig>;
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
    pipeline: {
        repo: RepoConfig;
    };
};

export type WebConfig = {
    pipeline: {
        repo: RepoConfig;
    };
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
    deployment: {
        wave: number;
    };
    web: WebEnvironmentConfig;
    backend: BackendEnvironmentConfig;
};

export type WebEnvironmentConfig = {
    subdomain: string;
};

export type BackendEnvironmentConfig = {
    subdomain: string;
    auth: {
        cognitoDomain: string;
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
