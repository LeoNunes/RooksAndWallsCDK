import { NonEmptyArray } from '../lib/helper/type_helper';
import {
    ConfigType,
    DefaultConfigType,
    FinalConfigType,
    NoDefault,
    NullableDefault,
    generateFinalConfig
} from '../lib/helper/config_helper';

type ConfigDef = {
    appName: string;
    dns?: NoDefault<DnsConfigDef>;
    cdk: CdkConfigDef;
    backend: BackendConfigDef;
}

type CdkConfigDef = {
    pipeline: {
        repo: RepoConfigDef;
    };
}

type BackendConfigDef = {
    pipeline: {
        repo: RepoConfigDef;
    };
    awsEnvironment?: {
        account?: NullableDefault<string>;
        region?: string;
    };
    environments: NonEmptyArray<{
        name: string;
        description?: NoDefault<string>;
        subdomain?: NoDefault<string>;
        deployment?: {
            wave?: number;
        };
        autoscaling?: {
            enabled?: boolean;
            minInstances?: number;
            maxInstances?: number;
            instanceTypes?: string;
        };
    }>;
    application?: {
        listeningPort?: number;
    };
    healthCheck?: {
        protocol?: 'HTTP' | 'HTTPS';
        path?: string;
    };
}

type DnsConfigDef = {
    hostedZoneId: string;
    hostedZoneName: string;
    commonSubdomain?: NoDefault<string>;
}

type RepoConfigDef = {
    owner: string;
    name: string;
    branch: string;
    connectionARN: string;
}

const defaultConfig: DefaultConfigType<ConfigDef> = {
    backend_defaults: {
        awsEnvironment: {},
        awsEnvironment_defaults: {
            account: process.env.CDK_DEFAULT_ACCOUNT,
            region: 'us-west-2',
        },
        environments_defaults: {
            autoscaling: {},
            autoscaling_defaults: {
                enabled: false,
                minInstances: 1,
                maxInstances: 1,
                instanceTypes: 't3.nano,t3.micro',
            },
            deployment: {},
            deployment_defaults: {
                wave: 0
            },
        },
        application: {},
        application_defaults: {
            listeningPort: 80,
        },
        healthCheck: {},
        healthCheck_defaults: {
            protocol: 'HTTP',
            path: '/',
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
export type AppConfig = FinalConfigType<ConfigDef>;
