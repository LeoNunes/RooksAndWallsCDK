import { NonEmptyArray } from '../helper/type_helper';
import {
    ConfigType,
    DefaultConfigType,
    FinalConfigType,
    NoDefault,
    generateFinalConfig,
} from '../helper/config_helper';

type ConfigDef = {
    appName: string;
    awsEnvironment: {
        account: string;
        region: string;
    };
    cdk: CdkConfigDef;
    dns: DnsConfigDef;
    backend: BackendConfigDef;
};

type CdkConfigDef = {
    infrastructurePipeline: {
        repo: RepoConfigDef;
    };
};

type DnsConfigDef = {
    hostedZoneId: string;
    hostedZoneName: string;
    commonSubdomain?: NoDefault<string>;
};

type BackendConfigDef = {
    applicationPipeline: {
        repo: RepoConfigDef;
    };
    environments: NonEmptyArray<EnvironmentConfigDef>;
};

type RepoConfigDef = {
    owner: string;
    name: string;
    branch: string;
    connectionARN: string;
};

type EnvironmentConfigDef = {
    name: string;
    description?: NoDefault<string>;
    subdomain: string;
    deployment?: {
        wave?: number;
    };
    instances?: {
        instanceType?: string;
    };
    application?: {
        servicePort?: number;
    };
    healthCheck?: {
        protocol?: 'HTTP' | 'HTTPS';
        port?: number;
        path?: string;
    };
};

const defaultConfig: DefaultConfigType<ConfigDef> = {
    backend_defaults: {
        environments_defaults: {
            instances: {},
            instances_defaults: {
                instanceType: 't3.nano',
            },
            deployment: {},
            deployment_defaults: {
                wave: 0,
            },
            application: {},
            application_defaults: {
                servicePort: 5000,
            },
            healthCheck: {},
            healthCheck_defaults: {
                protocol: 'HTTP',
                port: 80,
                path: '/',
            },
        },
    },
};

export function finalConfig(config: ConfigType<ConfigDef>) {
    return generateFinalConfig<ConfigDef>(config, defaultConfig);
}

export type CdkConfig = FinalConfigType<CdkConfigDef>;
export type BackendConfig = FinalConfigType<BackendConfigDef>;
export type DnsConfig = FinalConfigType<DnsConfigDef>;
export type RepoConfig = FinalConfigType<RepoConfigDef>;
export type EnvironmentConfig = FinalConfigType<EnvironmentConfigDef>;
export type AppConfig = FinalConfigType<ConfigDef>;
