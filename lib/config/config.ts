import { AppConfig } from "./config_def";

const appName = 'Games';
const gitHubConfig = {
    owner: 'LeoNunes',
    // Connection must be created manually on the AWS Console
    connectionARN:
        'arn:aws:codestar-connections:sa-east-1:641179121252:connection/4c171f9b-5424-4003-b7e3-ea9f41c7a7ca',
};

const appConfig: AppConfig = {
    appName: appName,
    awsEnvironment: {
        account: '641179121252',
        region: 'us-west-2',
    },
    dns: {
        hostedZoneId: 'Z06232281J47SNE8ZWHNB',
        hostedZoneName: 'leonunes.me',
        commonSubdomain: 'api.games',
    },
    cdk: {
        infrastructurePipeline: {
            repo: {
                ...gitHubConfig,
                name: 'RooksAndWallsCDK',
                branch: 'main',
            },
        },
    },
    web: {
        webPipeline: {
            repo: {
                ...gitHubConfig,
                name: 'RooksAndWallsWeb',
                branch: 'main',
            },
        },
        environments: [
            {
                name: 'Beta',
                subdomain: 'beta.games',
                backendSubdomain: 'beta.api.games',
                deployment: {
                    wave: 0,
                },
            },
        ],
    },
    backend: {
        applicationPipeline: {
            repo: {
                ...gitHubConfig,
                name: 'RooksAndWallsServer',
                branch: 'main',
            },
        },
        environments: [
            {
                name: 'Beta',
                description: `Beta environment for ${appName}`,
                subdomain: 'beta',
                deployment: {
                    wave: 0,
                },
                application: {
                    servicePort: 8080,
                },
                instances: {
                    instanceType: 't3.micro',
                },
                healthCheck: {
                    path: '/ping',
                    protocol: 'HTTPS',
                    port: 80,
                },
            },
        ],
    },
};

export default appConfig;