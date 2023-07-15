import { NonEmptyArray } from '../lib/helper/type_helper';
import { ConfigType, DefaultConfigType, FinalConfigType, NoDefault, generateFinalConfig } from '../lib/helper/config_helper';

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
    loadBalancer?: {
        instanceListeningPort?: number;
        healthCheckProtocol?: 'HTTP' | 'HTTPS';
        healthCheckPath?: string;
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
        environments_defaults: {
            autoscaling: {},
            autoscaling_defaults: {
                enabled: false,
                minInstances: 1,
                maxInstances: 1,
                instanceTypes: 't3.micro',
            },
            deployment: {},
            deployment_defaults: {
                wave: 0
            },
        },
        loadBalancer: {},
        loadBalancer_defaults: {
            healthCheckPath: '/',
            healthCheckProtocol: 'HTTP',
            instanceListeningPort: 80,
        }
    }
};

export function finalConfig(config: ConfigType<ConfigDef>) {
    return generateFinalConfig<ConfigDef>(config, defaultConfig);
}

export type CdkConfig = FinalConfigType<CdkConfigDef>;
export type BackendConfig = FinalConfigType<BackendConfigDef>;
export type DnsConfig = FinalConfigType<DnsConfigDef>;
export type RepoConfig = FinalConfigType<RepoConfigDef>;
export type AppConfig = FinalConfigType<ConfigDef>;
