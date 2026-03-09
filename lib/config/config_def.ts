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
    development?: DevelopmentConfig;
};

export type DevelopmentConfig = {
    /** Local web URL added to Cognito's allowed callback/logout URLs (e.g. 'http://localhost:5173'). */
    localWebUrl?: string;
    /** If true, creates an IAM role in the account that developers can assume for DynamoDB access. */
    allowLocalDdbAccess?: boolean;
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
